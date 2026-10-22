import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { LLM } from "@opencode/ai"
import { LLMClient, RequestExecutor } from "@opencode/ai/route"
import { AISDK } from "@opencode/core/aisdk"
import { EnterpriseEgress } from "@opencode/core/effect/enterprise-egress"
import { WebSocketConstructor } from "@opencode/core/effect/websocket-constructor"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { Socket } from "effect/socket"
import { testEffect } from "./lib/effect"

// A client that records every request it is asked to send, so a test can tell whether a guard
// stopped the request before it reached the network.
const recording = () => {
  const urls: string[] = []
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      urls.push(request.url)
      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("ok")))
    }),
  )
  return { urls, layer }
}

const send = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return yield* client.execute(HttpClientRequest.get(url))
  })

describe("EnterpriseEgress.modelTraffic", () => {
  const it = testEffect(Layer.empty)

  it.effect("refuses public provider hosts before the request is sent", () =>
    Effect.gen(function* () {
      const inner = recording()
      const exit = yield* send("https://api.openai.com/v1/chat/completions").pipe(
        Effect.provide(EnterpriseEgress.modelTraffic.pipe(Layer.provide(inner.layer))),
        Effect.exit,
      )

      expect(exit._tag).toBe("Failure")
      expect(inner.urls).toEqual([])
    }),
  )

  it.effect("lets internal gateway requests through", () =>
    Effect.gen(function* () {
      const inner = recording()
      yield* send("https://llm-gateway.internal.local/v1/chat/completions").pipe(
        Effect.provide(EnterpriseEgress.modelTraffic.pipe(Layer.provide(inner.layer))),
      )

      expect(inner.urls).toEqual(["https://llm-gateway.internal.local/v1/chat/completions"])
    }),
  )
})

describe("EnterpriseEgress.processClient", () => {
  const it = testEffect(EnterpriseEgress.processClient)

  // processClient sends over real fetch, so only the refused path can be tested without a server;
  // the guard rejects before fetch runs, which the error message proves.
  it.effect("refuses OpenCode cloud hosts", () =>
    Effect.gen(function* () {
      const error = yield* send("https://models.opencode.ai/api.json").pipe(Effect.flip)

      expect(String(error)).toContain("OpenCode cloud endpoint blocked: models.opencode.ai")
    }),
  )

  it.live("leaves other hosts reachable", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => Bun.serve({ port: 0, fetch: () => new Response("ok") })),
      (server) =>
        Effect.gen(function* () {
          const response = yield* send(`http://127.0.0.1:${server.port}/`)
          expect(response.status).toBe(200)
        }),
      (server) => Effect.promise(() => server.stop(true)),
    ),
  )
})

describe("WebSocketConstructor", () => {
  const it = testEffect(WebSocketConstructor.layer)

  it.effect("refuses to open sockets to hosts outside the allowlist", () =>
    Effect.gen(function* () {
      const construct = yield* Socket.WebSocketConstructor
      expect(() => construct("wss://api.openai.com/v1/realtime")).toThrow("External provider blocked: api.openai.com")
    }),
  )
})

describe("AI SDK route", () => {
  const it = testEffect(AISDK.locationLayer)

  // Production AI SDK traffic always uses the global fetch, because config cannot carry a custom
  // one. The .invalid host never resolves, so a regressed guard surfaces as a DNS error, not as
  // the policy message, and no request can leave the machine either way.
  it.effect("refuses hosts outside the allowlist on the real network path", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* aisdk.hook.sdk((event) => {
        event.sdk = createOpenAICompatible({
          ...event.options,
          name: String(event.options.name),
          baseURL: String(event.options.baseURL),
        })
      })
      const resolved = yield* aisdk.model({
        ...Model.Info.make({
          ...Model.Info.default(Provider.ID.make("test-provider"), Model.ID.make("catalog-model")),
          modelID: Model.ID.make("api-model"),
          package: Provider.aisdk("@ai-sdk/openai-compatible"),
          limit: { context: 100, output: 20 },
        }),
        settings: { apiKey: "test", baseURL: "https://api.example.invalid/v1" },
      })
      const error = yield* LLMClient.generate(LLM.request({ model: resolved, prompt: "Hello" })).pipe(
        Effect.provide(
          LLMClient.layer.pipe(
            Layer.provide(
              Layer.succeed(
                RequestExecutor.Service,
                RequestExecutor.Service.of({ execute: () => Effect.die("Unexpected HTTP request") }),
              ),
            ),
          ),
        ),
        Effect.flip,
      )

      expect(String(error)).toContain("External provider blocked: api.example.invalid")
    }),
  )
})

import { Config } from "@opencode/core/config"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { discover, make } from "@opencode/core/plugin/provider/kurumici"
import type { LocalDiscoveryClient } from "@opencode/core/plugin/provider/local"
import { Provider } from "@opencode/core/provider"
import { Document, Info } from "@opencode/schema/config"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(Layer.merge(PluginTestLayer, Config.testLayer()))
const decode = Schema.decodeUnknownSync(Info)
const providerID = Provider.ID.make("kurumici")

const addPlugin = Effect.fn(function* () {
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin)
  yield* make(undefined, "1 hour").effect(host)
})

// The gateway answers like an OpenAI-compatible server and records each request it receives.
const gateway = () =>
  Effect.sync(() => {
    const requests: { authorization: string | null; path: string; host: string | null }[] = []
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        requests.push({
          authorization: request.headers.get("authorization"),
          path: new URL(request.url).pathname,
          host: request.headers.get("host"),
        })
        return Response.json({
          object: "list",
          data: [
            { id: "openai/glm-4.7-flash", object: "model" },
            { id: "", object: "model" },
          ],
        })
      },
    })
    return { requests, server }
  })

describe("KurumiciPlugin", () => {
  it.live("discovers gateway models from config and sends the configured key", () =>
    Effect.acquireUseRelease(
      gateway(),
      ({ requests, server }) =>
        Effect.gen(function* () {
          const providers = yield* Provider.Service
          const models = yield* Model.Service
          const config = yield* Config.Test
          const baseURL = `http://127.0.0.1:${server.port}/v1`
          expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.kurumici")

          yield* config.setEntries([configuration({ baseURL, apiKey: "secret" })])
          yield* addPlugin()
          const model = yield* eventually(
            models.get(providerID, Model.ID.make("openai/glm-4.7-flash")),
            (item) => item !== undefined,
          )

          expect(requests).toContainEqual({
            authorization: "Bearer secret",
            path: "/v1/models",
            host: `127.0.0.1:${server.port}`,
          })
          expect(yield* providers.get(providerID)).toMatchObject({
            name: "Kurum Ici LLM",
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL, provider: "kurumici", apiKey: "secret" },
            activation: "enabled",
          })
          expect(model).toMatchObject({
            modelID: "openai/glm-4.7-flash",
            capabilities: { tools: true },
          })
          expect(yield* models.get(providerID, Model.ID.make(""))).toBeUndefined()
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )

  // Discovery uses core's HttpClient, which the packages/ai egress guard never sees, so the plugin
  // checks the allowlist itself. A recording client shows whether any request was attempted,
  // without racing the plugin's background polling.
  it.effect("refuses to query a gateway outside the egress allowlist", () =>
    Effect.gen(function* () {
      const client = recordingClient("https://api.openai.com")
      const exit = yield* discover(client.value).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      expect(client.paths).toEqual([])
    }),
  )

  it.effect("lists the models an allowed gateway reports", () =>
    Effect.gen(function* () {
      const client = recordingClient("https://llm-gateway.internal.local")
      const models = yield* discover(client.value)

      expect(client.paths).toEqual(["/v1/models"])
      expect(models.map((model) => model.id)).toEqual(["a-model", "openai/glm-4.7-flash"])
    }),
  )
})

function configuration(settings: { baseURL?: string; apiKey?: string }) {
  return new Document({
    type: "document",
    info: decode({ providers: { kurumici: { settings } } }),
  })
}

function eventually<A>(
  effect: Effect.Effect<A>,
  predicate: (value: A) => boolean,
  deadline = Date.now() + 10_000,
): Effect.Effect<A, Error> {
  return Effect.gen(function* () {
    const value = yield* effect
    if (predicate(value)) return value
    if (Date.now() > deadline) return yield* Effect.fail(new Error("Timed out waiting for value"))
    yield* Effect.promise(() => Bun.sleep(5))
    return yield* eventually(effect, predicate, deadline)
  })
}

function recordingClient(root: string) {
  const paths: string[] = []
  const value: LocalDiscoveryClient = {
    root,
    apiKey: "secret",
    get: () => Effect.die("unused"),
    postJson: () => Effect.die("unused"),
    getJson: (path, schema) => {
      paths.push(path)
      return Schema.decodeUnknownEffect(schema)({
        data: [{ id: "openai/glm-4.7-flash" }, { id: "" }, { id: "a-model" }],
      })
    },
  }
  return { paths, value }
}

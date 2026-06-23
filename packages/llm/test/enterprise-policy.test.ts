import { describe, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { Endpoint } from "../src/route"
import { Auth } from "../src/route/auth"
import { jsonRequestParts } from "../src/route/transport/http"
import * as OpenAIChat from "../src/protocols/openai-chat"
import { LLM, Model } from "../src"
import { it } from "./lib/effect"

const request = (baseURL: string) =>
  LLM.request({
    id: "req_enterprise_policy",
    model: Model.make({
      id: "fake-model",
      provider: "kurumici",
      route: OpenAIChat.route.with({ endpoint: Endpoint.path("/chat/completions", { baseURL }) }),
    }),
    prompt: "hello",
  })

describe("EnterprisePolicy", () => {
  it.effect("blocks external LLM transport hosts before request execution", () =>
    Effect.gen(function* () {
      const exit = yield* jsonRequestParts({
        request: request("https://api.openai.com/v1"),
        endpoint: Endpoint.path("/chat/completions", { baseURL: "https://api.openai.com/v1" }),
        auth: Auth.none,
        body: { model: "fake-model", messages: [] },
        encodeBody: JSON.stringify,
      }).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.effect("allows internal LLM transport hosts", () =>
    Effect.gen(function* () {
      const parts = yield* jsonRequestParts({
        request: request("https://llm-gateway.internal.local/v1"),
        endpoint: Endpoint.path("/chat/completions", { baseURL: "https://llm-gateway.internal.local/v1" }),
        auth: Auth.none,
        body: { model: "fake-model", messages: [] },
        encodeBody: JSON.stringify,
      })

      expect(parts.url).toBe("https://llm-gateway.internal.local/v1/chat/completions")
    }),
  )
})

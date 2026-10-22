import { Effect, Schema } from "effect"
import { EnterprisePolicy } from "../../enterprise-policy.js"
import { createLocalProviderPlugin, type LocalDiscoveryClient } from "./local.js"

const Response = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) })

// The enterprise gateway is an OpenAI-compatible endpoint whose URL, key and models change too
// often to ship in a build. Everything comes from config (`opencode setup` writes it), and the model
// list is read from the gateway itself, so it only offers models the configured key may use.
export const make = createLocalProviderPlugin({
  id: "opencode.provider.kurumici",
  providerID: EnterprisePolicy.PROVIDER_ID,
  name: "Kurum Ici LLM",
  discover: (client) => discover(client),
  // /v1/models does not report capabilities; a coding agent is useless without tool calls and the
  // gateway's models support them, so they are assumed on.
  model: (item) => ({ id: item.id, tools: true }),
})

export const KurumiciPlugin = make()

export const discover = Effect.fn("KurumiciPlugin.discover")(function* (client: LocalDiscoveryClient) {
  // Discovery goes through core's HttpClient rather than the packages/ai transport, so the
  // transport egress guard never sees it; check the allowlist here before the first request.
  yield* Effect.try({
    try: () => EnterprisePolicy.assertBaseURLAllowed(client.root),
    catch: (error) => error,
  })
  const response = yield* client.getJson("/v1/models", Response)
  return response.data.filter((model) => model.id.length > 0).toSorted((a, b) => a.id.localeCompare(b.id))
})

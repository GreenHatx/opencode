export * as EnterpriseEgress from "./enterprise-egress.js"

import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError, type HttpClientRequest } from "effect/http"
import { EnterprisePolicy } from "@opencode/util/enterprise-policy"

// Two seams with different strictness. Model traffic may only reach the internal allowlist. Every
// other outbound request (webfetch, MCP, skills, the model catalog) stays open except to OpenCode's
// cloud, which would otherwise receive console traffic, shares and telemetry. Both are applied in
// production wiring, never inside upstream logic, so upstream's own tests keep exercising it.

/** Wraps the HttpClient the model request executor sends through. */
export const modelTraffic = guard((url) => EnterprisePolicy.assertRequestURLAllowed(url))

/** Replaces the process-wide fetch client in the server's production graph. */
export const processClient = guard((url) => EnterprisePolicy.assertOpenCodeCloudURLBlocked(url)).pipe(
  Layer.provide(FetchHttpClient.layer),
)

function guard(check: (url: string) => void) {
  return Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      return HttpClient.mapRequestEffect(client, (request) =>
        Effect.try({
          try: () => {
            check(request.url)
            return request
          },
          catch: (cause) => blocked(request, cause),
        }),
      )
    }),
  )
}

function blocked(request: HttpClientRequest.HttpClientRequest, cause: unknown) {
  return new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request,
      cause,
      description: cause instanceof Error ? cause.message : "Blocked by enterprise policy.",
    }),
  })
}

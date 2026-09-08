export class ExternalProviderBlockedError extends Error {
  constructor(readonly hostname: string) {
    super(`External provider blocked: ${hostname}`)
    this.name = "ExternalProviderBlockedError"
  }
}

// These lists intentionally duplicate the ones in @opencode-ai/core's enterprise-policy. They cannot
// be shared by importing core here: core already depends on llm, so the reverse edge would be a
// dependency cycle — and llm is the low-level transport package, deliberately kept dependency-light.
// Instead, packages/core/test/enterprise-policy-parity.test.ts fails if the two ever diverge. Any
// change here must be mirrored in packages/core/src/enterprise-policy.ts.
export const ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "llm-gateway.internal.local",
  "aihub-api.turktelekom.com.tr",
  "*.internal.local",
  "*.turktelekom.com.tr",
] as const

export const BLOCKED_OPENCODE_CLOUD_HOSTS = ["opencode.ai", "*.opencode.ai"] as const

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/^\[|\]$/g, "")

const wildcardMatches = (pattern: string, hostname: string) => {
  if (!pattern.startsWith("*.")) return pattern === hostname
  const suffix = pattern.slice(1)
  return hostname.endsWith(suffix) && hostname.length > suffix.length
}

export const isBaseURLAllowed = (baseURL: string | URL) => {
  const hostname = normalizeHostname(new URL(baseURL).hostname)
  if (isOpenCodeCloudHostname(hostname)) return false
  return ALLOWED_HOSTS.some((host) => wildcardMatches(host, hostname))
}

export const isOpenCodeCloudHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname)
  return BLOCKED_OPENCODE_CLOUD_HOSTS.some((host) => wildcardMatches(host, normalized))
}

export const assertRequestURLAllowed = (input: string | URL) => {
  const hostname = normalizeHostname(new URL(input).hostname)
  if (!isBaseURLAllowed(input)) throw new ExternalProviderBlockedError(hostname)
}

export * as EnterprisePolicy from "./enterprise-policy"

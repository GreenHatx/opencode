export class ExternalProviderBlockedError extends Error {
  constructor(readonly hostname: string) {
    super(`External provider blocked: ${hostname}`)
    this.name = "ExternalProviderBlockedError"
  }
}

const ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "llm-gateway.internal.local",
  "aihub-api.turktelekom.com.tr",
  "*.internal.local",
  "*.turktelekom.com.tr",
] as const

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/^\[|\]$/g, "")

const wildcardMatches = (pattern: string, hostname: string) => {
  if (!pattern.startsWith("*.")) return pattern === hostname
  const suffix = pattern.slice(1)
  return hostname.endsWith(suffix) && hostname.length > suffix.length
}

export const isBaseURLAllowed = (baseURL: string | URL) => {
  const hostname = normalizeHostname(new URL(baseURL).hostname)
  return ALLOWED_HOSTS.some((host) => wildcardMatches(host, hostname))
}

export const assertRequestURLAllowed = (input: string | URL) => {
  const hostname = normalizeHostname(new URL(input).hostname)
  if (!isBaseURLAllowed(input)) throw new ExternalProviderBlockedError(hostname)
}

export * as EnterprisePolicy from "./enterprise-policy"

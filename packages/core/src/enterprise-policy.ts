export * as EnterprisePolicy from "./enterprise-policy"

export const ALLOWED_PROVIDERS = ["kurumici", "ollama"] as const

export const ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "llm-gateway.internal.local",
  "aihub-api.turktelekom.com.tr",
  "*.internal.local",
  "*.turktelekom.com.tr",
] as const

export const FEATURE_DISABLED_MESSAGE = "Feature disabled by administrator."
export const DEFAULT_PROVIDER_ID = "kurumici"
export const DEFAULT_MODEL_ID = "MiniMaxAI/MiniMax-M2.5"
export const DEFAULT_MODEL_REF = `${DEFAULT_PROVIDER_ID}/${DEFAULT_MODEL_ID}`
export const DEFAULT_BASE_URL = "https://llm-gateway.internal.local/v1"
export const DEFAULT_API_KEY = "internal-token"

export class ProviderBlockedError extends Error {
  constructor(providerID: string) {
    super(`Provider not allowed: ${providerID}`)
    this.name = "ProviderBlockedError"
  }
}

export class ExternalProviderBlockedError extends Error {
  constructor(hostname: string) {
    super(`External provider blocked: ${hostname}`)
    this.name = "ExternalProviderBlockedError"
  }
}

export function isProviderAllowed(providerID: string) {
  return ALLOWED_PROVIDERS.includes(providerID as (typeof ALLOWED_PROVIDERS)[number])
}

export function assertProviderAllowed(providerID: string) {
  if (isProviderAllowed(providerID)) return
  throw new ProviderBlockedError(providerID)
}

export function isModelRefAllowed(modelRef: string | undefined) {
  if (!modelRef) return false
  return isProviderAllowed(modelRef.split("/")[0])
}

export function isBaseURLAllowed(baseURL: string | undefined) {
  if (!baseURL) return true
  try {
    const url = new URL(baseURL)
    return hostAllowed(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function assertBaseURLAllowed(baseURL: string | undefined) {
  if (!baseURL) return
  try {
    const url = new URL(baseURL)
    const hostname = url.hostname.toLowerCase()
    if (hostAllowed(hostname)) return
    throw new ExternalProviderBlockedError(hostname)
  } catch (error) {
    if (error instanceof ExternalProviderBlockedError) throw error
    throw new ExternalProviderBlockedError(baseURL)
  }
}

export function assertRequestURLAllowed(input: string | URL | { url: string }) {
  if (typeof input === "string") {
    assertBaseURLAllowed(input)
    return
  }
  if (input instanceof URL) {
    assertBaseURLAllowed(input.toString())
    return
  }
  if (typeof input.url === "string") {
    assertBaseURLAllowed(input.url)
    return
  }
}

export function blocksRemoteModelDiscovery() {
  return true
}

export function blocksUserProviderAuth() {
  return true
}

export function blocksRemoteConfig() {
  return true
}

export function defaultConfig() {
  return {
    $schema: "https://opencode.ai/config.json",
    model: DEFAULT_MODEL_REF,
    small_model: DEFAULT_MODEL_REF,
    provider: {
      [DEFAULT_PROVIDER_ID]: {
        name: "Kurum Ici LLM",
        npm: "@ai-sdk/openai-compatible",
        options: {
          baseURL: DEFAULT_BASE_URL,
          apiKey: DEFAULT_API_KEY,
        },
        models: {
          [DEFAULT_MODEL_ID]: {
            name: DEFAULT_MODEL_ID,
            limit: {
              context: 32768,
              output: 8192,
            },
          },
        },
      },
    },
  }
}

type ConfigLike = {
  $schema?: string
  model?: string
  small_model?: string
  provider?: Record<string, unknown>
}

export function applyConfigDefaults<T extends ConfigLike>(input: T): T {
  const defaults = defaultConfig()
  return {
    ...input,
    $schema: input.$schema ?? defaults.$schema,
    model: isModelRefAllowed(input.model) ? input.model : defaults.model,
    small_model: isModelRefAllowed(input.small_model) ? input.small_model : defaults.small_model,
    provider: {
      ...defaults.provider,
      ...(input.provider ?? {}),
    },
  }
}

function hostAllowed(hostname: string) {
  return ALLOWED_HOSTS.some((allowed) => {
    if (!allowed.startsWith("*.")) return hostname === allowed
    const suffix = allowed.slice(1)
    return hostname.endsWith(suffix)
  })
}

export * as EnterprisePolicy from "./enterprise-policy"

export type EnvLike = Record<string, string | undefined>

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

export const BLOCKED_OPENCODE_CLOUD_HOSTS = ["opencode.ai", "*.opencode.ai"] as const

export const FEATURE_DISABLED_MESSAGE = "Feature disabled by administrator."
export const DEFAULT_PROVIDER_ID = "kurumici"
export const DEFAULT_MODEL_ID = "MiniMaxAI/MiniMax-M2.5"
export const DEFAULT_MODEL_REF = `${DEFAULT_PROVIDER_ID}/${DEFAULT_MODEL_ID}`
export const DEFAULT_BASE_URL = "https://llm-gateway.internal.local/v1"
export const DEFAULT_API_KEY = "internal-token"

// Config schema is served from an internal host so a box-out install never references the public
// opencode.ai domain. Overridable with OPENCODE_CONFIG_SCHEMA_URL, but the override is validated
// against the host allowlist so it cannot be used to route the fork back at a public domain.
export const DEFAULT_CONFIG_SCHEMA_URL = "https://schemas.internal.local/opencode/config.json"

// Sanctioned source for the self-update / install script. Kept separate from ALLOWED_HOSTS: that
// list governs model egress, this one governs where installable code may be fetched from.
export const DEFAULT_INSTALL_URL = "https://raw.githubusercontent.com/GreenHatx/opencode/enterprise-policy/install"
export const ALLOWED_INSTALL_HOSTS = ["raw.githubusercontent.com", ...ALLOWED_HOSTS] as const

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

export class OpenCodeCloudBlockedError extends Error {
  constructor(hostname: string) {
    super(`OpenCode cloud endpoint blocked: ${hostname}`)
    this.name = "OpenCodeCloudBlockedError"
  }
}

export class InstallSourceBlockedError extends Error {
  constructor(hostname: string) {
    super(`Install source not allowed: ${hostname}`)
    this.name = "InstallSourceBlockedError"
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

export function isOpenCodeCloudHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return BLOCKED_OPENCODE_CLOUD_HOSTS.some((blocked) => hostMatches(blocked, normalized))
}

export function assertOpenCodeCloudURLBlocked(input: string | URL | { url: string }) {
  const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url)
  const hostname = url.hostname.toLowerCase()
  if (isOpenCodeCloudHostname(hostname)) throw new OpenCodeCloudBlockedError(hostname)
}

export function assertBaseURLAllowed(baseURL: string | undefined) {
  if (!baseURL) return
  try {
    const url = new URL(baseURL)
    const hostname = url.hostname.toLowerCase()
    if (isOpenCodeCloudHostname(hostname)) throw new OpenCodeCloudBlockedError(hostname)
    if (hostAllowed(hostname)) return
    throw new ExternalProviderBlockedError(hostname)
  } catch (error) {
    if (error instanceof ExternalProviderBlockedError) throw error
    if (error instanceof OpenCodeCloudBlockedError) throw error
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

function installHostname(url: string | undefined) {
  if (!url) return undefined
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

export function isInstallURLAllowed(url: string | undefined) {
  const hostname = installHostname(url)
  if (!hostname) return false
  if (isOpenCodeCloudHostname(hostname)) return false
  return ALLOWED_INSTALL_HOSTS.some((allowed) => hostMatches(allowed, hostname))
}

export function assertInstallURLAllowed(url: string | undefined) {
  if (isInstallURLAllowed(url)) return
  const hostname = installHostname(url) ?? url ?? ""
  if (isOpenCodeCloudHostname(hostname)) throw new OpenCodeCloudBlockedError(hostname)
  throw new InstallSourceBlockedError(hostname)
}

export function installURL(env: EnvLike = {}) {
  const override = env["OPENCODE_INSTALL_URL"]
  return isInstallURLAllowed(override) ? override! : DEFAULT_INSTALL_URL
}

export function configSchemaURL(env: EnvLike = {}) {
  const override = env["OPENCODE_CONFIG_SCHEMA_URL"]
  if (override && isBaseURLAllowed(override)) return override
  return DEFAULT_CONFIG_SCHEMA_URL
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

export function defaultConfig(env: EnvLike = {}) {
  return {
    $schema: configSchemaURL(env),
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

// Serialized form of the enterprise default config. Installers (desktop seed, Windows MSI) write
// this verbatim so a fresh box-out install starts on the internal provider instead of an empty
// config that only carries a schema reference.
export function defaultConfigJSON(env: EnvLike = {}) {
  return `${JSON.stringify(defaultConfig(env), null, 2)}\n`
}

type ConfigLike = {
  $schema?: string
  model?: string
  small_model?: string
  provider?: Record<string, unknown>
}

export function applyConfigDefaults<T extends ConfigLike>(input: T, env: EnvLike = {}): T {
  const defaults = defaultConfig(env)
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
  return ALLOWED_HOSTS.some((allowed) => hostMatches(allowed, hostname))
}

function hostMatches(pattern: string, hostname: string) {
  if (!pattern.startsWith("*.")) return hostname === pattern
  const suffix = pattern.slice(1)
  return hostname.endsWith(suffix) && hostname.length > suffix.length
}

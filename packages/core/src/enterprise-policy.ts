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
// The gateway URL, API key and models are deliberately not defined here: they change too often to
// ship in a build, so they live in user config and are collected by `opencode setup`. Only the
// provider ID is fixed, because it is the name the provider allowlist approves.
export const PROVIDER_ID = "kurumici"
export const PROVIDER_NAME = "Kurum Ici LLM"

export const SELF_UPDATE_DISABLED_MESSAGE =
  "This OpenCode build is managed by your organization and does not update itself. Install new versions from your organization's distribution."

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
  return { $schema: configSchemaURL(env) }
}

// Serialized form of the config installers seed (desktop, Windows MSI). It carries no provider or
// model on purpose: those come from `opencode setup`, so a seed can never go stale against the gateway.
export function defaultConfigJSON(env: EnvLike = {}) {
  return `${JSON.stringify(defaultConfig(env), null, 2)}\n`
}

// Only fills in the schema reference. It used to replace a model on a non-approved provider with a
// hardcoded default, which silently discarded what the user configured; the provider layer already
// rejects such a model with an explicit error.
export function applyConfigDefaults<T extends { $schema?: string }>(input: T, env: EnvLike = {}): T {
  return { ...input, $schema: input.$schema ?? configSchemaURL(env) }
}

// Enterprise builds must never replace themselves with a public release: every upgrade path
// (npm, bun, brew, choco, scoop, and the install script's default release repo) installs one.
export function blocksSelfUpdate() {
  return true
}

function hostAllowed(hostname: string) {
  return ALLOWED_HOSTS.some((allowed) => hostMatches(allowed, hostname))
}

function hostMatches(pattern: string, hostname: string) {
  if (!pattern.startsWith("*.")) return hostname === pattern
  const suffix = pattern.slice(1)
  return hostname.endsWith(suffix) && hostname.length > suffix.length
}

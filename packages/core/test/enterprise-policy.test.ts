import { describe, expect, test } from "bun:test"
import { EnterprisePolicy, isOpenCodeCloudHostname } from "@opencode/core/enterprise-policy"

describe("EnterprisePolicy", () => {
  test("allows only approved provider IDs", () => {
    expect(EnterprisePolicy.isProviderAllowed("kurumici")).toBe(true)
    expect(EnterprisePolicy.isProviderAllowed("ollama")).toBe(true)
    expect(EnterprisePolicy.isProviderAllowed("openai")).toBe(false)
    expect(EnterprisePolicy.isProviderAllowed("anthropic")).toBe(false)
  })

  test("throws clear provider error for blocked providers", () => {
    expect(() => EnterprisePolicy.assertProviderAllowed("openrouter")).toThrow("Provider not allowed: openrouter")
  })

  test("allows local and internal base URLs", () => {
    expect(EnterprisePolicy.isBaseURLAllowed("http://localhost:11434/v1")).toBe(true)
    expect(EnterprisePolicy.isBaseURLAllowed("http://127.0.0.1:11434/v1")).toBe(true)
    expect(EnterprisePolicy.isBaseURLAllowed("https://llm-gateway.internal.local/v1")).toBe(true)
    expect(EnterprisePolicy.isBaseURLAllowed("https://team-ai.internal.local/v1")).toBe(true)
  })

  test("blocks public provider hosts", () => {
    expect(EnterprisePolicy.isBaseURLAllowed("https://api.openai.com/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://api.anthropic.com/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://openrouter.ai/api/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://opencode.ai/v1")).toBe(false)
    expect(isOpenCodeCloudHostname("api.opencode.ai")).toBe(true)
    expect(() => EnterprisePolicy.assertBaseURLAllowed("https://api.opencode.ai/v1")).toThrow(
      "OpenCode cloud endpoint blocked: api.opencode.ai",
    )
  })

  // v2 moved model discovery to https://models.opencode.ai, which the cloud blocklist already
  // covers; this pins that the catalog host cannot be reached even if the fetch guard regressed.
  test("blocks the v2 model catalog host", () => {
    expect(isOpenCodeCloudHostname("models.opencode.ai")).toBe(true)
    expect(EnterprisePolicy.isBaseURLAllowed("https://models.opencode.ai/api.json")).toBe(false)
    expect(EnterprisePolicy.blocksRemoteModelDiscovery()).toBe(true)
  })

  test("allows only the sanctioned install source", () => {
    expect(EnterprisePolicy.isInstallURLAllowed(EnterprisePolicy.DEFAULT_INSTALL_URL)).toBe(true)
    expect(EnterprisePolicy.isInstallURLAllowed("https://opencode.ai/install")).toBe(false)
    expect(EnterprisePolicy.isInstallURLAllowed("https://example.com/install")).toBe(false)
    expect(() => EnterprisePolicy.assertInstallURLAllowed("https://example.com/install")).toThrow(
      "Install source not allowed: example.com",
    )
  })

  test("falls back to defaults when env overrides are blocked", () => {
    expect(EnterprisePolicy.installURL({ OPENCODE_INSTALL_URL: "https://opencode.ai/install" })).toBe(
      EnterprisePolicy.DEFAULT_INSTALL_URL,
    )
    expect(EnterprisePolicy.configSchemaURL({ OPENCODE_CONFIG_SCHEMA_URL: "https://opencode.ai/config.json" })).toBe(
      EnterprisePolicy.DEFAULT_CONFIG_SCHEMA_URL,
    )
    expect(
      EnterprisePolicy.configSchemaURL({ OPENCODE_CONFIG_SCHEMA_URL: "https://schemas.internal.local/v2.json" }),
    ).toBe("https://schemas.internal.local/v2.json")
  })
})

// v2 enforces provider access through ConfigPolicy statements rather than the ad-hoc call-site
// checks v1 used, so these pin the generated statements and the precedence they rely on.
describe("EnterprisePolicy provider statements", () => {
  test("denies every provider then allows exactly the approved ones", () => {
    const statements = EnterprisePolicy.policyStatements()
    expect(statements[0]).toEqual({ action: "provider.use", resource: "*", effect: "deny" })
    expect(statements.slice(1)).toEqual(
      EnterprisePolicy.ALLOWED_PROVIDERS.map((resource) => ({
        action: "provider.use",
        resource,
        effect: "allow",
      })),
    )
  })

  test("statements are ordered so the last match decides", () => {
    // decision() resolves with findLast, so the deny-all must come before the allows.
    const statements = EnterprisePolicy.policyStatements()
    const lastFor = (resource: string) =>
      statements.findLast((policy) => policy.resource === "*" || policy.resource === resource)?.effect

    expect(lastFor("kurumici")).toBe("allow")
    expect(lastFor("ollama")).toBe("allow")
    expect(lastFor("openai")).toBe("deny")
  })
})

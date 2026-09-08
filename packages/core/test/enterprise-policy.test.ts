import { describe, expect, test } from "bun:test"
import { EnterprisePolicy, isOpenCodeCloudHostname } from "@opencode-ai/core/enterprise-policy"

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
    expect(EnterprisePolicy.isBaseURLAllowed("https://aihub-api.turktelekom.com.tr/v1")).toBe(true)
    expect(EnterprisePolicy.isBaseURLAllowed("https://team-ai.internal.local/v1")).toBe(true)
  })

  test("blocks public provider hosts", () => {
    expect(EnterprisePolicy.isBaseURLAllowed("https://api.openai.com/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://api.anthropic.com/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://openrouter.ai/api/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://opencode.ai/v1")).toBe(false)
    expect(EnterprisePolicy.isBaseURLAllowed("https://api.opencode.ai/v1")).toBe(false)
    expect(isOpenCodeCloudHostname("opencode.ai")).toBe(true)
    expect(isOpenCodeCloudHostname("api.opencode.ai")).toBe(true)
    expect(() => EnterprisePolicy.assertBaseURLAllowed("https://generativelanguage.googleapis.com/v1beta")).toThrow(
      "External provider blocked: generativelanguage.googleapis.com",
    )
    expect(() => EnterprisePolicy.assertBaseURLAllowed("https://api.opencode.ai/v1")).toThrow(
      "OpenCode cloud endpoint blocked: api.opencode.ai",
    )
  })

  test("allows only the sanctioned install source", () => {
    expect(EnterprisePolicy.isInstallURLAllowed(EnterprisePolicy.DEFAULT_INSTALL_URL)).toBe(true)
    expect(EnterprisePolicy.isInstallURLAllowed("https://llm-gateway.internal.local/install")).toBe(true)
    expect(EnterprisePolicy.isInstallURLAllowed("https://opencode.ai/install")).toBe(false)
    expect(EnterprisePolicy.isInstallURLAllowed("https://example.com/install")).toBe(false)
    expect(EnterprisePolicy.isInstallURLAllowed(undefined)).toBe(false)
    expect(() => EnterprisePolicy.assertInstallURLAllowed("https://opencode.ai/install")).toThrow(
      "OpenCode cloud endpoint blocked: opencode.ai",
    )
    expect(() => EnterprisePolicy.assertInstallURLAllowed("https://example.com/install")).toThrow(
      "Install source not allowed: example.com",
    )
  })

  test("falls back to the default install URL when the override is blocked", () => {
    expect(EnterprisePolicy.installURL({})).toBe(EnterprisePolicy.DEFAULT_INSTALL_URL)
    expect(EnterprisePolicy.installURL({ OPENCODE_INSTALL_URL: "https://opencode.ai/install" })).toBe(
      EnterprisePolicy.DEFAULT_INSTALL_URL,
    )
    expect(EnterprisePolicy.installURL({ OPENCODE_INSTALL_URL: "https://build.internal.local/install" })).toBe(
      "https://build.internal.local/install",
    )
  })

  test("keeps the config schema on an internal host", () => {
    expect(EnterprisePolicy.configSchemaURL({})).toBe(EnterprisePolicy.DEFAULT_CONFIG_SCHEMA_URL)
    expect(EnterprisePolicy.configSchemaURL({ OPENCODE_CONFIG_SCHEMA_URL: "https://opencode.ai/config.json" })).toBe(
      EnterprisePolicy.DEFAULT_CONFIG_SCHEMA_URL,
    )
    expect(
      EnterprisePolicy.configSchemaURL({ OPENCODE_CONFIG_SCHEMA_URL: "https://schemas.internal.local/v2.json" }),
    ).toBe("https://schemas.internal.local/v2.json")
  })

  test("serializes a usable enterprise default config for installers", () => {
    const seed = JSON.parse(EnterprisePolicy.defaultConfigJSON())
    expect(seed.$schema).toBe(EnterprisePolicy.DEFAULT_CONFIG_SCHEMA_URL)
    expect(seed.model).toBe(EnterprisePolicy.DEFAULT_MODEL_REF)
    expect(seed.small_model).toBe(EnterprisePolicy.DEFAULT_MODEL_REF)
    expect(seed.provider[EnterprisePolicy.DEFAULT_PROVIDER_ID].options.baseURL).toBe(EnterprisePolicy.DEFAULT_BASE_URL)
    expect(EnterprisePolicy.defaultConfigJSON().endsWith("\n")).toBe(true)
  })
})

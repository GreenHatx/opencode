import { describe, expect, test } from "bun:test"
import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"

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
    expect(() => EnterprisePolicy.assertBaseURLAllowed("https://generativelanguage.googleapis.com/v1beta")).toThrow(
      "External provider blocked: generativelanguage.googleapis.com",
    )
  })
})

import { describe, expect, test } from "bun:test"
import { EnterprisePolicy } from "@opencode/core/enterprise-policy"
import * as AiPolicy from "@opencode/ai/enterprise-policy"

// packages/ai keeps its own copy of the enterprise host lists: core already depends on ai, so ai
// cannot import core back without creating a dependency cycle, and ai is the low-level transport
// package we deliberately keep dependency-light. That duplication is only safe while the two stay
// identical, so this test is the guard — it fails the moment either side is edited alone.
describe("EnterprisePolicy parity between core and ai", () => {
  test("allowed host lists are identical", () => {
    expect([...AiPolicy.ALLOWED_HOSTS]).toEqual([...EnterprisePolicy.ALLOWED_HOSTS])
  })

  test("blocked opencode cloud host lists are identical", () => {
    expect([...AiPolicy.BLOCKED_OPENCODE_CLOUD_HOSTS]).toEqual([...EnterprisePolicy.BLOCKED_OPENCODE_CLOUD_HOSTS])
  })

  // Matching lists are not enough: the two modules implement their own matching logic, so verify
  // they actually agree on concrete URLs, including the wildcard and catalog-host cases.
  test("both modules agree on which base URLs are allowed", () => {
    const urls = [
      "http://localhost:11434/v1",
      "http://127.0.0.1:11434/v1",
      "https://llm-gateway.internal.local/v1",
      "https://team-ai.internal.local/v1",
      "https://internal.local/v1",
      "https://api.openai.com/v1",
      "https://api.anthropic.com/v1",
      "https://openrouter.ai/api/v1",
      "https://opencode.ai/v1",
      "https://models.opencode.ai/api.json",
      "https://notopencode.ai/v1",
      "https://generativelanguage.googleapis.com/v1beta",
    ]

    for (const url of urls) {
      expect({ url, allowed: AiPolicy.isBaseURLAllowed(url) }).toEqual({
        url,
        allowed: EnterprisePolicy.isBaseURLAllowed(url),
      })
    }
  })

  test("both modules agree on which hostnames are opencode cloud", () => {
    for (const hostname of [
      "opencode.ai",
      "api.opencode.ai",
      "models.opencode.ai",
      "OPENCODE.AI",
      "notopencode.ai",
      "internal.local",
    ]) {
      expect({ hostname, cloud: AiPolicy.isOpenCodeCloudHostname(hostname) }).toEqual({
        hostname,
        cloud: EnterprisePolicy.isOpenCodeCloudHostname(hostname),
      })
    }
  })
})

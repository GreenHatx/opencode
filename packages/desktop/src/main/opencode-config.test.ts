import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"

import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"

import { ensureWindowsUserConfigSeed, windowsUserConfigPath } from "./opencode-config"

function tempHome() {
  return mkdtempSync(join(tmpdir(), "opencode-config-"))
}

test("seeds the Windows user opencode config", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {}

  try {
    const filepath = ensureWindowsUserConfigSeed({ env, home, platform: "win32" })

    expect(filepath).toBe(join(home, ".config", "opencode.json"))
    expect(env.OPENCODE_CONFIG).toBe(filepath)
    const seeded = JSON.parse(readFileSync(filepath!, "utf8"))
    expect(seeded).toEqual(EnterprisePolicy.defaultConfig())
    expect(seeded.$schema).toBe("https://schemas.internal.local/opencode/config.json")
    expect(seeded.model).toBe(EnterprisePolicy.DEFAULT_MODEL_REF)
    expect(Object.keys(seeded.provider)).toEqual([EnterprisePolicy.DEFAULT_PROVIDER_ID])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("does not overwrite an existing Windows user opencode config", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {}
  const filepath = windowsUserConfigPath(home)

  try {
    mkdirSync(join(home, ".config"), { recursive: true })
    writeFileSync(filepath, JSON.stringify({ model: "openai/gpt-5.5" }), { flag: "wx" })

    ensureWindowsUserConfigSeed({ env, home, platform: "win32" })

    expect(readFileSync(filepath, "utf8")).toBe(JSON.stringify({ model: "openai/gpt-5.5" }))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("leaves non-Windows platforms unchanged", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {}

  try {
    const filepath = ensureWindowsUserConfigSeed({ env, home, platform: "darwin" })

    expect(filepath).toBeUndefined()
    expect(env.OPENCODE_CONFIG).toBeUndefined()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("ignores a config schema override that points outside the allowlist", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {
    OPENCODE_CONFIG_SCHEMA_URL: "https://opencode.ai/config.json",
  }

  try {
    const filepath = ensureWindowsUserConfigSeed({ env, home, platform: "win32" })
    const seeded = JSON.parse(readFileSync(filepath!, "utf8"))

    expect(seeded.$schema).toBe(EnterprisePolicy.DEFAULT_CONFIG_SCHEMA_URL)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("honours an internal config schema override", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {
    OPENCODE_CONFIG_SCHEMA_URL: "https://schemas.internal.local/opencode/config-v2.json",
  }

  try {
    const filepath = ensureWindowsUserConfigSeed({ env, home, platform: "win32" })
    const seeded = JSON.parse(readFileSync(filepath!, "utf8"))

    expect(seeded.$schema).toBe("https://schemas.internal.local/opencode/config-v2.json")
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

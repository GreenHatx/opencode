import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "bun:test"

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
    expect(JSON.parse(readFileSync(filepath!, "utf8"))).toEqual({
      $schema: "https://schemas.internal.local/opencode/config.json",
    })
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

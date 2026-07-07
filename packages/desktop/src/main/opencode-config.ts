import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_CONFIG = {
  $schema: "https://opencode.ai/config.json",
}

type Env = Record<string, string | undefined>

export function windowsUserConfigPath(home = homedir()) {
  return join(home, ".config", "opencode.json")
}

export function ensureWindowsUserConfigSeed(input?: {
  env?: Env
  home?: string
  platform?: string
}): string | undefined {
  const platform = input?.platform ?? process.platform
  if (platform !== "win32") return undefined

  const env = input?.env ?? process.env
  const home = input?.home ?? homedir()
  const filepath = windowsUserConfigPath(home)

  mkdirSync(join(home, ".config"), { recursive: true })
  if (!existsSync(filepath)) {
    writeFileSync(filepath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { flag: "wx" })
  }

  env.OPENCODE_CONFIG ??= filepath
  return filepath
}

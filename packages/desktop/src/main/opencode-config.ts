import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"

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
    // Seed the full enterprise default (internal provider, model and schema host) rather than a
    // bare $schema, so a box-out install is usable without the user configuring a provider — and
    // so it can never reference the public opencode.ai domain.
    writeFileSync(filepath, EnterprisePolicy.defaultConfigJSON(env), { flag: "wx" })
  }

  env.OPENCODE_CONFIG ??= filepath
  return filepath
}

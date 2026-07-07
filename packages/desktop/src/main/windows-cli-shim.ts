import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"

type Env = Record<string, string | undefined>

type Registry = {
  queryUserPath: () => string | undefined
  setUserPath: (value: string) => void
}

type Input = {
  env?: Env
  exePath?: string
  home?: string
  platform?: string
  registry?: Registry
}

export function windowsUserCliBinPath(input?: { env?: Env; home?: string }) {
  const env = input?.env ?? process.env
  const home = input?.home ?? homedir()
  return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Programs", "opencode", "bin")
}

export function ensureWindowsCliShim(input?: Input): string | undefined {
  const platform = input?.platform ?? process.platform
  if (platform !== "win32") return undefined

  const env = input?.env ?? process.env
  const home = input?.home ?? homedir()
  const exePath = input?.exePath ?? process.execPath
  const binDir = windowsUserCliBinPath({ env, home })
  const cmdPath = join(binDir, "opencode.cmd")

  mkdirSync(binDir, { recursive: true })
  writeFileSync(cmdPath, renderCmdShim(exePath), "utf8")
  ensureUserPathEntry(binDir, { env, registry: input?.registry })

  return cmdPath
}

function renderCmdShim(exePath: string) {
  const escaped = exePath.replaceAll("%", "%%").replaceAll('"', '""')
  return `@echo off\r\n"${escaped}" %*\r\n`
}

function ensureUserPathEntry(binDir: string, input: { env: Env; registry?: Registry }) {
  const registry = input.registry ?? windowsRegistry
  const current = registry.queryUserPath() ?? input.env.Path ?? input.env.PATH ?? ""
  const entries = current
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (entries.some((entry) => normalizePath(entry) === normalizePath(binDir))) {
    mergeProcessPath(binDir, input.env)
    return
  }

  const updated = [...entries, binDir].join(delimiter)
  registry.setUserPath(updated)
  input.env.Path = updated
  mergeProcessPath(binDir, input.env)
}

function mergeProcessPath(binDir: string, env: Env) {
  const key = env.Path !== undefined ? "Path" : "PATH"
  const current = env[key] ?? ""
  const entries = current
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (entries.some((entry) => normalizePath(entry) === normalizePath(binDir))) return
  env[key] = [...entries, binDir].join(delimiter)
}

function normalizePath(value: string) {
  return value
    .replaceAll("/", "\\")
    .replace(/[\\; ]+$/g, "")
    .toLowerCase()
}

const windowsRegistry: Registry = {
  queryUserPath() {
    try {
      const output = execFileSync("reg.exe", ["query", "HKCU\\Environment", "/v", "Path"], {
        encoding: "utf8",
        windowsHide: true,
      })
      return parseRegistryPath(output)
    } catch {
      return undefined
    }
  },
  setUserPath(value: string) {
    execFileSync("reg.exe", ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", value, "/f"], {
      stdio: "ignore",
      windowsHide: true,
    })
  },
}

function parseRegistryPath(output: string) {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*Path\s+REG_\w+\s+(.+?)\s*$/i)
    if (match) return match[1]
  }
  return undefined
}

export const testExports = {
  parseRegistryPath,
  renderCmdShim,
}

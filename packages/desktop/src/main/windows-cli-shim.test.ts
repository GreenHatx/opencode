import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { expect, test } from "bun:test"

import { ensureWindowsCliShim, testExports, windowsUserCliBinPath } from "./windows-cli-shim"

function tempHome() {
  return mkdtempSync(join(tmpdir(), "opencode-cli-shim-"))
}

function registry(initial?: string) {
  const calls: string[] = []
  let value = initial

  return {
    calls,
    registry: {
      queryUserPath: () => value,
      setUserPath: (next: string) => {
        calls.push(next)
        value = next
      },
    },
  }
}

test("installs a Windows opencode.cmd shim and adds its bin directory to the user PATH", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = { LOCALAPPDATA: join(home, "LocalAppData"), Path: "C:\\Windows" }
  const mock = registry("C:\\Windows")

  try {
    const cmdPath = ensureWindowsCliShim({
      env,
      home,
      platform: "win32",
      exePath: "C:\\Users\\Cem\\AppData\\Local\\Programs\\@opencode-aidesktop\\OpenCode Dev.exe",
      registry: mock.registry,
    })

    const binDir = windowsUserCliBinPath({ env, home })
    expect(cmdPath).toBe(join(binDir, "opencode.cmd"))
    expect(readFileSync(cmdPath!, "utf8")).toContain(
      '"C:\\Users\\Cem\\AppData\\Local\\Programs\\@opencode-aidesktop\\OpenCode Dev.exe" %*',
    )
    expect(mock.calls).toEqual([["C:\\Windows", binDir].join(delimiter)])
    expect(env.Path).toBe(["C:\\Windows", binDir].join(delimiter))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("does not duplicate an existing Windows PATH entry", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = { LOCALAPPDATA: join(home, "LocalAppData") }
  const binDir = windowsUserCliBinPath({ env, home })
  const mock = registry(["C:\\Windows", binDir.toUpperCase()].join(delimiter))

  try {
    ensureWindowsCliShim({
      env,
      home,
      platform: "win32",
      exePath: "C:\\OpenCode Dev.exe",
      registry: mock.registry,
    })

    expect(mock.calls).toEqual([])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("leaves non-Windows platforms unchanged", () => {
  const home = tempHome()
  const env: Record<string, string | undefined> = {}
  const mock = registry()

  try {
    const cmdPath = ensureWindowsCliShim({
      env,
      home,
      platform: "darwin",
      exePath: "/Applications/OpenCode.app/Contents/MacOS/OpenCode",
      registry: mock.registry,
    })

    expect(cmdPath).toBeUndefined()
    expect(mock.calls).toEqual([])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("parses the user Path value from reg.exe output", () => {
  const output = `
HKEY_CURRENT_USER\\Environment
    Path    REG_EXPAND_SZ    C:\\Windows;C:\\Tools
`

  expect(testExports.parseRegistryPath(output)).toBe("C:\\Windows;C:\\Tools")
})

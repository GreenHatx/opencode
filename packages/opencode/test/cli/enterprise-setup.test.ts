import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { ConfigParse } from "../../src/config/parse"
import { EnterpriseSetup } from "../../src/cli/enterprise-setup"

const roots: string[] = []
const tempFile = async (name: string) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-enterprise-setup-"))
  roots.push(root)
  return path.join(root, "nested", name)
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("EnterpriseSetup.endpoints", () => {
  test("derives the chat base URL and model list from what the user typed", () => {
    const expected = { baseURL: "https://gw.internal.local/v1", models: "https://gw.internal.local/v1/models" }
    expect(EnterpriseSetup.endpoints("https://gw.internal.local/v1")).toEqual(expected)
    expect(EnterpriseSetup.endpoints(" https://gw.internal.local ")).toEqual(expected)
    expect(EnterpriseSetup.endpoints("https://gw.internal.local/api/v1/")).toEqual({
      baseURL: "https://gw.internal.local/api/v1",
      models: "https://gw.internal.local/api/v1/models",
    })
  })
})

describe("EnterpriseSetup.validateURL", () => {
  test("accepts internal gateways and explains every refusal", () => {
    expect(EnterpriseSetup.validateURL("https://llm-gateway.internal.local/v1")).toBeUndefined()
    expect(EnterpriseSetup.validateURL("")).toBe("Required")
    expect(EnterpriseSetup.validateURL("gateway")).toContain("full URL")
    expect(EnterpriseSetup.validateURL("ftp://gw.internal.local")).toContain("http://")
    expect(EnterpriseSetup.validateURL("https://api.openai.com/v1")).toContain("not allowed by your organization")
  })
})

describe("EnterpriseSetup config", () => {
  test("writes a config the loader's schema accepts and reports it configured", async () => {
    const file = await tempFile("opencode.json")
    expect(await EnterpriseSetup.configured(file)).toBe(false)

    await EnterpriseSetup.write(
      {
        baseURL: "https://gw.internal.local/v1",
        apiKey: "secret",
        model: "openai/glm-4.7-flash",
        models: ["openai/glm-4.7-flash", "zeta"],
      },
      file,
    )
    const text = await fs.readFile(file, "utf8")

    expect(await EnterpriseSetup.configured(file)).toBe(true)
    expect(JSON.parse(text)).toEqual({
      $schema: "https://schemas.internal.local/opencode/config.json",
      provider: {
        kurumici: {
          name: "Kurum Ici LLM",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "https://gw.internal.local/v1", apiKey: "secret" },
          models: { "openai/glm-4.7-flash": { name: "openai/glm-4.7-flash" }, zeta: { name: "zeta" } },
        },
      },
      model: "kurumici/openai/glm-4.7-flash",
      small_model: "kurumici/openai/glm-4.7-flash",
    })
    // Config loading decodes the file with this schema, so setup output must pass it unchanged.
    const decoded = ConfigParse.schema(ConfigV1.Info, ConfigParse.jsonc(text, file), file)
    expect(decoded.model).toBe("kurumici/openai/glm-4.7-flash")
  })

  test("edits an existing config in place and replaces a stale model list", async () => {
    const file = await tempFile("opencode.jsonc")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      `{
  // keep me
  "theme": "nord",
  "model": "kurumici/old",
  "provider": { "kurumici": { "options": { "baseURL": "https://old.internal.local/v1", "apiKey": "old" }, "models": { "old": {} } } }
}
`,
    )

    await EnterpriseSetup.write(
      { baseURL: "https://gw.internal.local/v1", apiKey: "", model: "typed", models: [] },
      file,
    )
    const text = await fs.readFile(file, "utf8")
    const written = ConfigParse.jsonc(text, file) as Record<string, any>

    expect(text).toContain("// keep me")
    expect(written.theme).toBe("nord")
    expect(written.model).toBe("kurumici/typed")
    expect(written.provider.kurumici.options).toEqual({ baseURL: "https://gw.internal.local/v1" })
    expect(written.provider.kurumici.models).toEqual({ typed: { name: "typed" } })
  })
})

describe("EnterpriseSetup.listModels", () => {
  test("lists the models the gateway offers to the given key", async () => {
    const seen: (string | null)[] = []
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        seen.push(request.headers.get("authorization"))
        return Response.json({
          data: [{ id: "zeta" }, { id: "" }, { object: "model" }, { id: "openai/glm-4.7-flash" }],
        })
      },
    })
    try {
      expect(await EnterpriseSetup.listModels(`http://127.0.0.1:${server.port}/v1/models`, "secret")).toEqual([
        "openai/glm-4.7-flash",
        "zeta",
      ])
      expect(seen).toEqual(["Bearer secret"])
    } finally {
      await server.stop(true)
    }
  })

  test("reports a gateway that refuses the key", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("no", { status: 401, statusText: "Unauthorized" }) })
    try {
      await expect(EnterpriseSetup.listModels(`http://127.0.0.1:${server.port}/v1/models`, "bad")).rejects.toThrow(
        "The gateway answered 401",
      )
    } finally {
      await server.stop(true)
    }
  })
})

import { NodeFileSystem } from "@effect/platform-node"
import { EnterprisePolicy } from "@opencode/util/enterprise-policy"
import { Info } from "@opencode/schema/config"
import { Global } from "@opencode/util/global"
import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { parse } from "jsonc-parser"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { EnterpriseSetup } from "../src/services/enterprise-setup"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(Layer.empty)

// Every Global directory points into a temp root so the tests never touch the real home.
const withConfig = <A, E>(effect: (root: string) => Effect.Effect<A, E, Global.Service | FileSystem.FileSystem>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "opencode-enterprise-setup-"))),
    (root) =>
      effect(root).pipe(
        Effect.provide(
          Global.layerWith(
            Object.fromEntries(
              ["data", "config", "state", "log", "bin", "repos", "tmp"].map((key) => [key, path.join(root, key)]),
            ),
          ),
        ),
        Effect.provide(NodeFileSystem.layer),
      ),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })),
  )

describe("EnterpriseSetup.endpoints", () => {
  test("derives the chat base URL and model list from what the user typed", () => {
    expect(EnterpriseSetup.endpoints("https://gw.internal.local/v1")).toEqual({
      baseURL: "https://gw.internal.local/v1",
      models: "https://gw.internal.local/v1/models",
    })
    expect(EnterpriseSetup.endpoints(" https://gw.internal.local ")).toEqual({
      baseURL: "https://gw.internal.local/v1",
      models: "https://gw.internal.local/v1/models",
    })
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
  it.live("writes a config the server schema accepts and reports it configured", () =>
    withConfig((root) =>
      Effect.gen(function* () {
        expect(yield* EnterpriseSetup.configured()).toBe(false)

        const file = yield* EnterpriseSetup.write({
          baseURL: "https://gw.internal.local/v1",
          apiKey: "secret",
          model: "openai/glm-4.7-flash",
        })
        const written = parse(yield* Effect.promise(() => fs.readFile(file, "utf8")))

        expect(file).toBe(path.join(root, "config", "opencode.jsonc"))
        expect(yield* EnterpriseSetup.configured()).toBe(true)
        expect(written).toEqual({
          providers: { kurumici: { settings: { baseURL: "https://gw.internal.local/v1", apiKey: "secret" } } },
          model: { providerID: "kurumici", model: "openai/glm-4.7-flash" },
          policies: EnterprisePolicy.policyStatements(),
        })
        // The server decodes this same file, so the setup output must pass its schema unchanged.
        const decoded = Schema.decodeUnknownSync(Info)(written)
        expect(decoded.model).toMatchObject({ providerID: "kurumici", model: "openai/glm-4.7-flash" })
      }),
    ),
  )

  it.live("edits an existing config in place and keeps the user's own policies", () =>
    withConfig((root) =>
      Effect.gen(function* () {
        const existing = path.join(root, "config", "opencode.json")
        const policies = [{ action: "tool.use", resource: "bash", effect: "deny" }]
        yield* Effect.promise(() =>
          fs.writeFile(existing, `{\n  // keep me\n  "shell": "bash",\n  "policies": ${JSON.stringify(policies)}\n}\n`),
        )

        const file = yield* EnterpriseSetup.write({ baseURL: "https://gw.internal.local/v1", apiKey: "", model: "m" })
        const content = yield* Effect.promise(() => fs.readFile(file, "utf8"))

        expect(file).toBe(existing)
        expect(content).toContain("// keep me")
        expect(parse(content)).toEqual({
          shell: "bash",
          policies,
          providers: { kurumici: { settings: { baseURL: "https://gw.internal.local/v1" } } },
          model: { providerID: "kurumici", model: "m" },
        })
      }),
    ),
  )
})

describe("EnterpriseSetup.listModels", () => {
  it.live("lists the models the gateway offers to the given key", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const seen: (string | null)[] = []
        const server = Bun.serve({
          port: 0,
          fetch: (request) => {
            seen.push(request.headers.get("authorization"))
            return Response.json({ data: [{ id: "zeta" }, { id: "" }, { id: "openai/glm-4.7-flash" }] })
          },
        })
        return { seen, server }
      }),
      ({ seen, server }) =>
        Effect.gen(function* () {
          const ids = yield* EnterpriseSetup.listModels(`http://127.0.0.1:${server.port}/v1/models`, "secret")
          expect(ids).toEqual(["openai/glm-4.7-flash", "zeta"])
          expect(seen).toEqual(["Bearer secret"])
        }),
      ({ server }) => Effect.promise(() => server.stop(true)),
    ),
  )
})

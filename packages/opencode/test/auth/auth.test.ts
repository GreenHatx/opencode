import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Auth } from "../../src/auth"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer

const it = testEffect(Layer.mergeAll(Auth.defaultLayer, node))

describe("Auth", () => {
  it.instance("set is disabled by administrator", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const exit = yield* Effect.exit(auth.set("https://example.com/", {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      }))
      expect(exit._tag).toBe("Failure")
      const after = yield* auth.all()
      expect(after["https://example.com"]).toBeUndefined()
    }),
  )
})

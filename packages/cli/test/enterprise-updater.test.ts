import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { EnterpriseUpdater } from "../src/services/enterprise-updater"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(EnterpriseUpdater.layer)

describe("EnterpriseUpdater", () => {
  it.effect("never checks for or installs updates in the background", () =>
    Effect.gen(function* () {
      const updater = yield* Updater.Service
      expect(yield* updater.run()).toBeUndefined()
      expect(yield* updater.check()).toEqual({ type: "unavailable", message: EnterpriseUpdater.message })
    }),
  )

  it.effect("refuses every explicit upgrade path", () =>
    Effect.gen(function* () {
      const updater = yield* Updater.Service
      for (const attempt of [updater.latest("curl"), updater.upgrade("npm", "9.9.9"), updater.apply("9.9.9")]) {
        const error = yield* Effect.flip(attempt)
        expect(error.message).toBe(EnterpriseUpdater.message)
      }
      expect(yield* updater.method()).toBeUndefined()
    }),
  )
})

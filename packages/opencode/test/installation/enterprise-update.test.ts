import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Installation } from "../../src/installation"

// Every upgrade path installs a public build, so the layers production uses must refuse all of
// them before a package manager or the install script is ever started.
describe("enterprise self-update", () => {
  test.each(["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"] as const)(
    "the production layer refuses to upgrade through %s",
    async (method) => {
      const error = await Effect.runPromise(
        Effect.flip(Installation.use.upgrade(method, "9.9.9")).pipe(Effect.provide(Installation.defaultLayer)),
      )
      expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
      expect(error.stderr).toBe(EnterprisePolicy.SELF_UPDATE_DISABLED_MESSAGE)
    },
  )
})

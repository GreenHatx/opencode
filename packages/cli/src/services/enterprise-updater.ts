import { Effect, Layer } from "effect"
import { Updater } from "./updater"

export const message =
  "This OpenCode build is managed by your organization and does not update itself. Install new versions from your organization's distribution."

// Enterprise builds must never replace themselves with an upstream release: every update path
// (the opencode.ai installer, npm, bun, winget, brew) installs a public build that carries none
// of the enterprise policy. The CLI entrypoint provides this in place of Updater.layer, which
// stays untouched so upstream's updater tests keep exercising it.
export const layer = Layer.succeed(
  Updater.Service,
  Updater.Service.of({
    run: () => Effect.succeed(undefined),
    check: () => Effect.succeed({ type: "unavailable", message }),
    apply: () => Effect.fail(new Error(message)),
    method: () => Effect.succeed(undefined),
    latest: () => Effect.fail(new Error(message)),
    upgrade: () => Effect.fail(new Error(message)),
    removal: () => undefined,
  }),
)

export * as EnterpriseUpdater from "./enterprise-updater"

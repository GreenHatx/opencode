# Enterprise fork

This fork ships OpenCode with an enterprise network policy: model traffic may only reach internal
hosts, OpenCode's cloud is unreachable, and the build never replaces itself with a public release.

## Where the policy lives

The policy is applied where traffic leaves the process, never inside upstream logic. Upstream's
tests build their own clients for that logic, so they keep running unchanged against the fork.

| Concern | Location |
| --- | --- |
| Hosts, providers, install source (the only place they are defined) | `packages/util/src/enterprise-policy.ts` |
| Model requests may only reach the internal allowlist | `EnterpriseEgress.modelTraffic` in `packages/core/src/effect/app-node-platform.ts` |
| Every other server request may go anywhere except OpenCode's cloud | `EnterpriseEgress.processClient`, wired in `packages/server/src/routes.ts` |
| WebSocket and AI SDK model transports | `packages/core/src/effect/websocket-constructor.ts`, `packages/core/src/aisdk.ts` |
| Gateway provider, configured per user, models listed from the gateway | `packages/core/src/plugin/provider/kurumici.ts` |
| `opencode setup`, also run on the first interactive launch | `packages/cli/src/services/enterprise-setup.ts` |
| Self-update disabled | `packages/cli/src/services/enterprise-updater.ts`, wired in `packages/cli/src/index.ts` |

The model catalog needs no patch: `models.opencode.ai` is refused by the process client, the
catalog refresh tolerates that, and the bundled snapshot serves the catalog.

## Changing the allowlist

Edit `ALLOWED_HOSTS` in `packages/util/src/enterprise-policy.ts`. A gateway outside it is rejected
by `opencode setup` as the user types it, and by the model seam at request time.

## Syncing with upstream

1. Branch from the new upstream `dev` and re-apply the files above; most are new files, and the
   upstream files touched carry only small, commented insertions.
2. Run the suites for `util`, `core`, `server` and `cli`, and `bun typecheck` in each.
3. Confirm the guard tests still discriminate: remove a guard and its test must fail. Two earlier
   versions of these tests passed with the guard removed.

## Windows installer

`.github/workflows/build-opencode-private-msi.yml` cross-compiles `opencode.exe` with upstream's
`packages/cli/script/build.ts --target=opencode-windows-x64-baseline` and wraps it in a per-user MSI.
The MSI keeps the v1 UpgradeCode, so it upgrades a v1 install in place. Its smoke test installs the
MSI and checks that `opencode upgrade` refuses to run, which only the enterprise build does.
`packages/cli/script/windows/uninstall-private.ps1` removes the install and, unless told to keep
them, the config and data directories.

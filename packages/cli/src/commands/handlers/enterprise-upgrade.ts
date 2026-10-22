import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { EnterpriseUpdater } from "../../services/enterprise-updater"

// Replaces the upgrade handler so `opencode upgrade` explains why it will not run, instead of the
// misleading "could not detect the installation method" the disabled updater would otherwise give.
export default Runtime.handler(Commands.commands.upgrade, () => Effect.fail(new Error(EnterpriseUpdater.message)))

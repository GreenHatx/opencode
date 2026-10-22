import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { EnterpriseSetup } from "../../services/enterprise-setup"
import { handlePromptErrors, requireInteractive } from "../../ui/prompt"

export default Runtime.handler(Commands.commands.setup, () =>
  Effect.gen(function* () {
    yield* requireInteractive("opencode setup asks for the gateway details and needs an interactive terminal")
    yield* EnterpriseSetup.run()
  }).pipe(handlePromptErrors),
)

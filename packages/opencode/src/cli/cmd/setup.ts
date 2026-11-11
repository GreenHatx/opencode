import { cmd } from "./cmd"
import { UI } from "../ui"
import { EnterpriseSetup } from "../enterprise-setup"

export const SetupCommand = cmd({
  command: "setup",
  describe: "connect your organization's AI gateway",
  handler: async () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      UI.error("opencode setup asks for the gateway details and needs an interactive terminal")
      process.exitCode = 1
      return
    }
    if (!(await EnterpriseSetup.run())) process.exitCode = 130
  },
})

import * as prompts from "@clack/prompts"
import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { applyEdits, modify, parse } from "jsonc-parser"
import { existsSync } from "fs"
import fs from "fs/promises"
import path from "path"

// The enterprise gateway's URL, key and models change too often to ship in a build, so each user
// connects it once. This module stays free of the Config service on purpose: the TUI command runs
// it before starting the worker, and must not pull the config graph into the UI thread.

/** The file setup writes: the one OPENCODE_CONFIG names (the Windows MSI sets it), else the global config. */
export function configFile() {
  if (Flag.OPENCODE_CONFIG) return Flag.OPENCODE_CONFIG
  // Same candidates, in the same order, as Config's own global file lookup.
  const candidates = ["opencode.jsonc", "opencode.json", "config.json"].map((file) =>
    path.join(Global.Path.config, file),
  )
  return candidates.find((file) => existsSync(file)) ?? candidates[0]
}

/** True once the config names a gateway for the enterprise provider. */
export async function configured(file = configFile()) {
  const text = await fs.readFile(file, "utf8").catch(() => "")
  return typeof parse(text)?.provider?.[EnterprisePolicy.PROVIDER_ID]?.options?.baseURL === "string"
}

export async function run() {
  prompts.intro("Connect your organization's AI gateway")
  const url = await prompts.text({
    message: "Gateway URL",
    placeholder: "https://llm-gateway.example.com/v1",
    validate: validateURL,
  })
  if (prompts.isCancel(url)) return cancelled()
  const apiKey = await prompts.password({ message: "API key (leave empty if the gateway needs none)" })
  if (prompts.isCancel(apiKey)) return cancelled()

  const gateway = endpoints(url)
  const spinner = prompts.spinner()
  spinner.start("Fetching the models your key can use...")
  const models = await listModels(gateway.models, apiKey ?? "").then(
    (ids) => {
      spinner.stop(`Found ${ids.length} model${ids.length === 1 ? "" : "s"}`)
      return ids
    },
    (error) => {
      spinner.stop("Could not list models", 1)
      prompts.log.warn(failureHint(error))
      return [] as string[]
    },
  )
  const model = models.length
    ? await prompts.select({ message: "Model", options: models.map((id) => ({ value: id, label: id })) })
    : await prompts.text({ message: "Model name", validate: (value) => (value?.trim() ? undefined : "Required") })
  if (prompts.isCancel(model)) return cancelled()

  const file = await write({ baseURL: gateway.baseURL, apiKey: apiKey ?? "", model: model.trim(), models })
  prompts.outro(`Saved to ${file}. Run \`opencode setup\` again to change it.`)
  return true
}

function cancelled() {
  prompts.cancel("Gateway not configured. Run `opencode setup` whenever you are ready.")
  return false
}

export async function listModels(url: string, apiKey: string) {
  const response = await fetch(url, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`The gateway answered ${response.status} ${response.statusText}`)
  const body: unknown = await response.json()
  const data = typeof body === "object" && body !== null && "data" in body && Array.isArray(body.data) ? body.data : []
  return data
    .flatMap((item: unknown) =>
      typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && item.id ? [item.id] : [],
    )
    .toSorted((a, b) => a.localeCompare(b))
}

export async function write(
  input: { baseURL: string; apiKey: string; model: string; models: readonly string[] },
  file = configFile(),
) {
  const current = await fs.readFile(file, "utf8").catch(() => "")
  const provider = ["provider", EnterprisePolicy.PROVIDER_ID]
  // Every model the key can use is written, so switching models later needs no second setup. A
  // typed model that the gateway did not list is kept as well. Limits are left out rather than
  // invented: without them OpenCode sends its own output cap and skips auto-compaction.
  const ids = [...new Set([...input.models, input.model])]
  const edits: [string[], unknown][] = [
    [["$schema"], parse(current)?.$schema ?? EnterprisePolicy.configSchemaURL(process.env)],
    [[...provider, "name"], EnterprisePolicy.PROVIDER_NAME],
    [[...provider, "npm"], "@ai-sdk/openai-compatible"],
    [[...provider, "options", "baseURL"], input.baseURL],
    [[...provider, "options", "apiKey"], input.apiKey || undefined],
    [[...provider, "models"], Object.fromEntries(ids.map((id) => [id, { name: id }]))],
    // "provider/model" is split on the first slash, so gateway IDs that contain slashes stay intact.
    [["model"], `${EnterprisePolicy.PROVIDER_ID}/${input.model}`],
    [["small_model"], `${EnterprisePolicy.PROVIDER_ID}/${input.model}`],
  ]
  const next = edits.reduce(
    (content, [key, value]) =>
      applyEdits(content, modify(content, key, value, { formattingOptions: { tabSize: 2, insertSpaces: true } })),
    current.trim() ? current : "{}\n",
  )
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, next.endsWith("\n") ? next : `${next}\n`)
  return file
}

/** Normalizes what the user typed into the chat base URL and the model-list URL. */
export function endpoints(input: string) {
  const url = new URL(input.trim())
  const base = `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}`
  return { baseURL: `${base}/v1`, models: `${base}/v1/models` }
}

export function validateURL(value: string | undefined) {
  const input = value?.trim()
  if (!input) return "Required"
  if (!URL.canParse(input)) return "Enter a full URL, for example https://llm-gateway.example.com/v1"
  if (!["http:", "https:"].includes(new URL(input).protocol)) return "The URL must start with http:// or https://"
  if (!EnterprisePolicy.isBaseURLAllowed(input))
    return "This host is not allowed by your organization's policy. Ask your administrator for the gateway address."
  return undefined
}

function failureHint(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  if (/certificate/i.test(detail))
    return `${detail}\nThe gateway uses a certificate this machine does not trust. Point NODE_EXTRA_CA_CERTS at your organization's CA bundle, or enter the model name by hand.`
  return `${detail}\nYou can enter the model name by hand.`
}

export * as EnterpriseSetup from "./enterprise-setup"

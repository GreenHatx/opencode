import { intro, log, outro, password, select, spinner, text } from "@clack/prompts"
import { EnterprisePolicy } from "@opencode/util/enterprise-policy"
import { Global } from "@opencode/util/global"
import { Effect, FileSystem, Option, Schema } from "effect"
import { applyEdits, modify, parse } from "jsonc-parser"
import path from "node:path"
import { prompt } from "../ui/prompt"
import { errorMessage } from "../util/error"

// The enterprise gateway's URL, key and model change too often to ship in a build, so each user
// connects it once. The answers land in the global config, where the kurumici provider plugin
// picks them up and lists the gateway's models itself.

// Same names, in the same priority order, as core's ConfigDiscovery; the CLI may not import Core.
const configNames = ["opencode.json", "opencode.jsonc"]
const ModelList = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) })
// Only the fields setup reads; everything else in the user's config is left to the server to validate.
const GlobalConfig = Schema.Struct({
  providers: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  policies: Schema.optional(Schema.Unknown),
})
const Gateway = Schema.Struct({ settings: Schema.Struct({ baseURL: Schema.String }) })
const decodeConfig = (content: string) => Schema.decodeUnknownOption(GlobalConfig)(parse(content))

/** True once the global config names a gateway for the kurumici provider. */
export const configured = Effect.fn("cli.enterprise-setup.configured")(function* () {
  const fs = yield* FileSystem.FileSystem
  const files = yield* globalFiles()
  const texts = yield* Effect.forEach(files, (file) => fs.readFileString(file).pipe(Effect.orElseSucceed(() => "")))
  return texts.some((content) =>
    Option.exists(decodeConfig(content), (config) =>
      Option.isSome(Schema.decodeUnknownOption(Gateway)(config.providers?.[EnterprisePolicy.PROVIDER_ID])),
    ),
  )
})

export const run = Effect.fn("cli.enterprise-setup.run")(function* () {
  intro("Connect your organization's AI gateway")
  const gateway = endpoints(
    yield* prompt<string>(() =>
      text({ message: "Gateway URL", placeholder: "https://llm-gateway.example.com/v1", validate: validateURL }),
    ),
  )
  const apiKey = yield* prompt<string>(() => password({ message: "API key (leave empty if the gateway needs none)" }))
  const model = yield* chooseModel(gateway.models, apiKey)
  const file = yield* write({ baseURL: gateway.baseURL, apiKey, model })
  outro(`Saved to ${file}. Run \`opencode setup\` again to change it.`)
})

const chooseModel = Effect.fn("cli.enterprise-setup.model")(function* (url: string, apiKey: string) {
  const progress = spinner()
  progress.start("Fetching the models your key can use...")
  const listed = yield* listModels(url, apiKey).pipe(
    Effect.tap((ids) => Effect.sync(() => progress.stop(`Found ${ids.length} model${ids.length === 1 ? "" : "s"}`))),
    Effect.catch((error) =>
      Effect.sync(() => {
        progress.stop("Could not list models", 1)
        log.warn(failureHint(error))
        return []
      }),
    ),
  )
  if (listed.length === 0)
    return yield* prompt<string>(() =>
      text({ message: "Model name", validate: (value) => (value?.trim() ? undefined : "Required") }),
    )
  return yield* prompt<string>(() =>
    select({ message: "Model", options: listed.map((id) => ({ value: id, label: id })) }),
  )
})

export const listModels = Effect.fn("cli.enterprise-setup.list-models")(function* (url: string, apiKey: string) {
  const body = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      })
      if (!response.ok) throw new Error(`The gateway answered ${response.status} ${response.statusText}`)
      return response.json()
    },
    catch: (cause) => cause,
  })
  const list = yield* Schema.decodeUnknownEffect(ModelList)(body)
  return list.data
    .map((model) => model.id)
    .filter((id) => id.length > 0)
    .toSorted((a, b) => a.localeCompare(b))
})

export const write = Effect.fn("cli.enterprise-setup.write")(function* (input: {
  baseURL: string
  apiKey: string
  model: string
}) {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const files = yield* globalFiles()
  // Mirror Config.update: edit the highest-priority existing global file, or create opencode.jsonc.
  const file = files.at(-1) ?? path.join(global.config, "opencode.jsonc")
  const current = files.length ? yield* fs.readFileString(file) : "{}\n"
  const hasPolicies = Option.exists(decodeConfig(current), (config) => config.policies !== undefined)
  const edits: [path: string[], value: unknown][] = [
    [["providers", EnterprisePolicy.PROVIDER_ID, "settings", "baseURL"], input.baseURL],
    [["providers", EnterprisePolicy.PROVIDER_ID, "settings", "apiKey"], input.apiKey || undefined],
    // The explicit form avoids re-parsing "provider/model": gateway model IDs contain slashes.
    [["model"], { providerID: EnterprisePolicy.PROVIDER_ID, model: input.model.trim() }],
    // Hide providers the network policy would refuse anyway, unless the user already curated policies.
    ...(hasPolicies ? [] : [[["policies"], EnterprisePolicy.policyStatements()] as [string[], unknown]]),
  ]
  const next = edits.reduce(
    (content, [key, value]) =>
      applyEdits(content, modify(content, key, value, { formattingOptions: { tabSize: 2, insertSpaces: true } })),
    current,
  )
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })
  yield* fs.writeFileString(file, next.endsWith("\n") ? next : `${next}\n`)
  return file
})

const globalFiles = Effect.fn("cli.enterprise-setup.files")(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  return yield* Effect.filter(
    configNames.map((name) => path.join(global.config, name)),
    (file) => fs.exists(file).pipe(Effect.orElseSucceed(() => false)),
  )
})

/** Normalizes what the user typed into the chat base URL and the model-list URL. */
export function endpoints(input: string) {
  const url = new URL(input.trim())
  const prefix = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")
  const base = `${url.origin}${prefix}`
  return { baseURL: `${base}/v1`, models: `${base}/v1/models` }
}

export function validateURL(value: string | undefined) {
  if (!value?.trim()) return "Required"
  if (!URL.canParse(value.trim())) return "Enter a full URL, for example https://llm-gateway.example.com/v1"
  if (!["http:", "https:"].includes(new URL(value.trim()).protocol))
    return "The URL must start with http:// or https://"
  if (!EnterprisePolicy.isBaseURLAllowed(value.trim()))
    return "This host is not allowed by your organization's policy. Ask your administrator for the gateway address."
  return undefined
}

function failureHint(error: unknown) {
  const detail = errorMessage(error)
  if (/certificate/i.test(detail))
    return `${detail}\nThe gateway uses a certificate this machine does not trust. Point NODE_EXTRA_CA_CERTS at your organization's CA bundle, or enter the model name by hand.`
  return `${detail}\nYou can enter the model name by hand.`
}

export * as EnterpriseSetup from "./enterprise-setup"

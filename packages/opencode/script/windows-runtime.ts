#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

const appDir = path.join(import.meta.dirname, "../../app")
const appDist = path.join(appDir, "dist")
await Bun.$`OPENCODE_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`

const webFiles = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: appDist })))
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => !file.endsWith(".map"))
  .sort()
const embeddedWebUI = [
  ...webFiles.map((file, index) => {
    const spec = path.relative(dir, path.join(appDist, file)).replaceAll("\\", "/")
    return `import file_${index} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  }),
  "export default {",
  ...webFiles.map((file, index) => `  ${JSON.stringify(file)}: file_${index},`),
  "}",
].join("\n")

const outdir = "./dist/opencode-private-windows-x64-runtime/app"
await Bun.$`rm -rf ${outdir}`

const localParserWorker = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
const rootParserWorker = path.resolve(dir, "../../node_modules/@opentui/core/parser.worker.js")
const parserWorker = fs.realpathSync(fs.existsSync(localParserWorker) ? localParserWorker : rootParserWorker)

const result = await Bun.build({
  conditions: ["bun", "node"],
  tsconfig: "./tsconfig.json",
  plugins: [createSolidTransformPlugin()],
  external: ["node-gyp"],
  format: "esm",
  minify: true,
  sourcemap: "none",
  splitting: false,
  target: "bun",
  outdir,
  naming: {
    entry: "[name].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  files: {
    "opencode-web-ui.gen.ts": embeddedWebUI,
  },
  entrypoints: ["./src/index.ts", parserWorker, "./src/cli/tui/worker.ts", "opencode-web-ui.gen.ts"],
  define: {
    FFF_LIBC: JSON.stringify("gnu"),
    OPENCODE_VERSION: `'${Script.version}'`,
    OPENCODE_MODELS_DEV: generated.modelsData,
    OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify("./parser.worker.js"),
    OPENCODE_WORKER_PATH: JSON.stringify("./worker.js"),
    OPENCODE_CHANNEL: `'${Script.channel}'`,
    OPENCODE_LIBC: "",
  },
})

if (!result.success) {
  process.exit(1)
}

console.log(`Built Windows runtime app: ${outdir}`)

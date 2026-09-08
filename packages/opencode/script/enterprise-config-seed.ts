#!/usr/bin/env bun

// Emits the enterprise default config that installers ship. The Windows MSI packages the output so
// a fresh install starts on the internal provider, and so the seed can never drift from
// EnterprisePolicy the way a hand-maintained copy in the installer script would.

import { EnterprisePolicy } from "@opencode-ai/core/enterprise-policy"
import fs from "fs"
import path from "path"

const out = process.argv[2]
const seed = EnterprisePolicy.defaultConfigJSON()

if (!out) {
  process.stdout.write(seed)
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, seed)
  console.log(`Wrote enterprise config seed: ${out}`)
}

# Install This OpenCode Fork

This guide shows how to install the current fork from source, run it in development mode, and optionally install a locally built `opencode` binary on your machine.

Use this path when you want the fork's latest `dev` branch, not the latest public package from npm, Homebrew, or the official install URL.

## What you need

- Git
- Bun 1.3 or newer. This repo currently declares `bun@1.3.14` in `package.json`.
- macOS, Linux, or Windows on a supported target:
  - macOS: `darwin-arm64`, `darwin-x64`
  - Linux: `linux-arm64`, `linux-x64`, plus musl variants for Alpine-style systems
  - Windows: `windows-arm64`, `windows-x64`

The source build uses Bun workspaces. The npm package flow is not the right way to install an unpublished fork unless you also publish all platform-specific binary packages that `packages/opencode/script/postinstall.mjs` expects.

## Clone the fork

```bash
git clone https://github.com/GreenHatx/opencode.git
cd opencode
git checkout dev
git pull --ff-only origin dev
```

If you already have a checkout, update it instead:

```bash
cd /path/to/opencode
git checkout dev
git pull --ff-only origin dev
```

## Install dependencies

Run this from the repository root:

```bash
bun install
```

This installs the workspace dependencies and runs the root `postinstall` script. The postinstall step calls `bun run --cwd packages/core fix-node-pty`.

## Run from source

For normal local development, use the root `dev` script:

```bash
bun dev --help
```

Run OpenCode in a target project directory:

```bash
bun dev /path/to/project
```

Run it against the OpenCode repo itself:

```bash
bun dev .
```

The `bun dev` command is the source checkout equivalent of the installed `opencode` command. These pairs should behave the same:

```bash
bun dev --help
opencode --help

bun dev serve
opencode serve

bun dev web
opencode web

bun dev /path/to/project
opencode /path/to/project
```

## Build a local binary

Build a standalone binary for your current platform:

```bash
./packages/opencode/script/build.ts --single
```

The build script:

- builds the web UI unless you pass `--skip-embed-web-ui`
- compiles the `packages/opencode/src/index.ts` entry point
- writes the binary under `packages/opencode/dist/opencode-<platform>/bin/opencode`
- runs a smoke test with `opencode --version` for the current platform binary

Find the produced binary:

```bash
find packages/opencode/dist -path '*/bin/opencode' -type f
```

Example output on Apple Silicon macOS:

```text
packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

Verify the binary directly:

```bash
./packages/opencode/dist/opencode-darwin-arm64/bin/opencode --version
```

Replace `opencode-darwin-arm64` with the directory produced on your platform.

## Install the local binary

Use the repo install script with `--binary`:

```bash
./install --binary "$PWD/packages/opencode/dist/opencode-darwin-arm64/bin/opencode"
```

Current behavior of `install`:

- installs to `$HOME/.opencode/bin/opencode`
- creates `$HOME/.opencode/bin` if needed
- marks the binary executable
- adds `$HOME/.opencode/bin` to your shell config unless you pass `--no-modify-path`

If you do not want the script to edit shell config files:

```bash
./install --binary "$PWD/packages/opencode/dist/opencode-darwin-arm64/bin/opencode" --no-modify-path
```

Then add this to your shell config manually if it is not already present:

```bash
export PATH="$HOME/.opencode/bin:$PATH"
```

Open a new shell or reload your config, then verify:

```bash
opencode --version
opencode --help
```

## Custom install directory

The current `install` script installs local binaries to `$HOME/.opencode/bin`. If you want a different path, copy the built binary manually:

```bash
mkdir -p "$HOME/.local/bin"
cp packages/opencode/dist/opencode-darwin-arm64/bin/opencode "$HOME/.local/bin/opencode"
chmod 755 "$HOME/.local/bin/opencode"
```

Then make sure that directory is on `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
opencode --version
```

## Maintainer workflow for this checkout

In the local maintainer checkout used for this fork, `origin` may point at upstream and `GreenHatx` may point at the fork:

```bash
git remote -v
```

To bring the local branch to upstream `dev`, then push the fork:

```bash
git fetch origin dev
git merge --ff-only origin/dev
git push GreenHatx dev
```

For ordinary users who cloned `https://github.com/GreenHatx/opencode.git`, `origin` already points at the fork. They should use:

```bash
git pull --ff-only origin dev
```

## Update an existing fork install

```bash
cd /path/to/opencode
git checkout dev
git pull --ff-only origin dev
bun install
./packages/opencode/script/build.ts --single
./install --binary "$PWD/packages/opencode/dist/opencode-darwin-arm64/bin/opencode"
opencode --version
```

Replace `opencode-darwin-arm64` with the platform directory produced by your build.

## Troubleshooting

### `bun install` fails

Check your Bun version:

```bash
bun --version
```

Use Bun 1.3 or newer. The repo currently pins `bun@1.3.14` as its package manager.

### The build cannot find native dependencies

Run dependency installation again from the repo root:

```bash
bun install
```

Then rebuild:

```bash
./packages/opencode/script/build.ts --single
```

The build script installs platform packages for `@opentui/core`, `@parcel/watcher`, and `@ff-labs/fff-bun` unless `--skip-install` is passed.

### `opencode` still runs an older version

Check which binary is first on `PATH`:

```bash
which opencode
opencode --version
```

If the path is not `$HOME/.opencode/bin/opencode`, either update your `PATH` or call the installed binary directly:

```bash
$HOME/.opencode/bin/opencode --version
```

### The install script changes shell config files

Pass `--no-modify-path`:

```bash
./install --binary "$PWD/packages/opencode/dist/opencode-darwin-arm64/bin/opencode" --no-modify-path
```

Then add the path manually only if you want it.

### You need a quick source-only run

You do not need to build a binary. Run the fork directly:

```bash
bun dev /path/to/project
```

That is the fastest way to test the latest fork code.

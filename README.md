# OpenCode Private

OpenCode Private is an internal-only fork of OpenCode for organizations that must keep AI coding traffic inside approved enterprise infrastructure.

This fork is designed to route model traffic only through trusted internal gateways, block public LLM providers, disable user-added external credentials, and reduce data leakage risk for enterprise development environments.

> OpenCode Private is a fork of OpenCode. It is not affiliated with or endorsed by the upstream OpenCode team.

## Why This Fork Exists

Standard AI coding tools often support many public providers by default: OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, Cohere, xAI, and similar services.

That flexibility is useful for personal development, but risky in corporate environments where prompts, code, logs, file paths, and generated output may contain sensitive information.

OpenCode Private changes the default assumption:

- Public LLM provider access is blocked.
- Only approved internal providers are allowed.
- Model discovery does not call public catalogs.
- User API-key and OAuth onboarding is disabled.
- Runtime URL checks happen before provider requests leave the process.
- A default internal model is configured on first launch.

## Current Default Policy

Allowed providers:

- `kurumici`
- `ollama`

Allowed hosts:

- `localhost`
- `127.0.0.1`
- `::1`
- `llm-gateway.internal.local`
- `*.internal.local`
- `*.turktelekom.com.tr`

Default model:

```text
kurumici/MiniMaxAI/MiniMax-M2.5
```

Default gateway:

```text
https://llm-gateway.internal.local/v1
```

## Security Controls

### Provider Allowlist

OpenCode Private filters the provider registry so only approved providers remain visible and usable.

Blocked examples:

- `openai`
- `anthropic`
- `gemini`
- `openrouter`
- `groq`
- `togetherai`
- `deepseek`
- `mistral`
- `cohere`
- `xai`

### Base URL Validation

Provider base URLs are checked against the enterprise host allowlist.

If a user configures a public provider endpoint such as:

```text
https://api.openai.com/v1
```

the runtime rejects it with an external-provider error before use.

### Runtime Egress Guard

The lower-level LLM transport validates the final rendered request URL immediately before HTTP/WebSocket transport execution.

This matters because provider config is not the only place a URL can appear. The last-mile transport check is the final application-level guard.

### Remote Discovery Disabled

OpenCode Private does not fetch the public `models.dev` model catalog.

`ModelsDev.refresh()` is a no-op under the enterprise policy, and an empty local model cache stays empty instead of being repaired through a public network fetch.

### External Auth Disabled

User-managed provider credentials are disabled:

- API-key entry
- OAuth login
- provider connect flows
- remote well-known config auth
- custom provider UI entry points

The user-facing failure message is:

```text
Feature disabled by administrator.
```

## Architecture

High-level flow:

```text
User
  |
  v
OpenCode Private
  |
  v
Enterprise policy checks
  |
  v
Internal LLM gateway
  |
  +--> MiniMaxAI/MiniMax-M2.5
  +--> Other approved local/internal models
```

Main enforcement points:

- `packages/core/src/enterprise-policy.ts`
- `packages/core/src/models-dev.ts`
- `packages/opencode/src/config/config.ts`
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/auth/index.ts`
- `packages/opencode/src/provider/auth.ts`
- `packages/opencode/src/cli/cmd/providers.ts`
- `packages/llm/src/enterprise-policy.ts`
- `packages/llm/src/route/transport/http.ts`
- Provider selection/settings UI under `packages/app/src/components/`

## Default Configuration

On first launch, OpenCode Private seeds a default internal provider config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "kurumici/MiniMaxAI/MiniMax-M2.5",
  "small_model": "kurumici/MiniMaxAI/MiniMax-M2.5",
  "provider": {
    "kurumici": {
      "name": "Kurum Ici LLM",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://llm-gateway.internal.local/v1",
        "apiKey": "internal-token"
      },
      "models": {
        "MiniMaxAI/MiniMax-M2.5": {
          "name": "MiniMaxAI/MiniMax-M2.5",
          "limit": {
            "context": 32768,
            "output": 8192
          }
        }
      }
    }
  }
}
```

If `model` or `small_model` points to a blocked provider, OpenCode Private resets it to the enterprise default model.

## Local Development

Install dependencies:

```bash
bun install
```

Run typecheck:

```bash
bun typecheck
```

Run the CLI from source:

```bash
bun run --cwd packages/opencode --conditions=browser src/index.ts
```

Run the web app from source:

```bash
bun run --cwd packages/app dev
```

## Verification

Targeted test commands used for the enterprise policy work:

```bash
cd packages/core
bun test test/enterprise-policy.test.ts test/models.test.ts
bun typecheck
```

```bash
cd packages/opencode
bun test test/auth/auth.test.ts test/plugin/auth-override.test.ts -t "Auth|enterprise policy"
bun test test/provider/provider.test.ts -t "enterprise policy"
bun test test/config/config.test.ts -t "enterprise provider defaults|resets blocked"
bun typecheck
```

```bash
cd packages/llm
bun test test/enterprise-policy.test.ts
bun typecheck
```

```bash
cd packages/app
bun typecheck
```

The branch also passed the repository pre-push hook:

```text
bun turbo typecheck
23 packages successful
```

## Deployment Checklist

Application-level controls are necessary, but not enough by themselves.

For production use, deploy OpenCode Private with network-level egress controls:

- Allow outbound traffic only to internal model gateways and approved corporate domains.
- Deny known public LLM provider domains at proxy/firewall level.
- Route all model traffic through the enterprise LLM gateway.
- Enforce authentication and rate limits at the gateway.
- Log model, token usage, latency, user, and request metadata.
- Add DLP scanning for prompts and responses at the gateway.
- Monitor rejected provider attempts as security events.

Recommended denylist examples:

- `api.openai.com`
- `api.anthropic.com`
- `openrouter.ai`
- `generativelanguage.googleapis.com`
- `api.mistral.ai`
- `api.cohere.ai`
- `api.groq.com`

## Known Limits

OpenCode Private provides application-level enforcement inside this fork.

It does not replace:

- host firewall rules
- outbound proxy policy
- gateway authentication
- gateway DLP
- endpoint monitoring
- secrets management

Users with shell access can still run unrelated tools outside OpenCode Private unless the host and network are also locked down.

## Branch

Current development branch:

```text
enterprise-policy
```

Fork:

```text
https://github.com/GreenHatx/opencode
```

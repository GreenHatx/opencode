# OpenCode Enterprise Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce internal-only provider and host policy in the OpenCode fork.

**Architecture:** Add one central policy module in `packages/core`, then call it from model discovery and provider runtime construction. Keep UI/CLI disablement as a second pass after runtime egress control.

**Tech Stack:** TypeScript, Bun test, Effect services, OpenCode monorepo.

---

### Task 1: Enterprise Policy Core

**Files:**
- Create: `packages/core/src/enterprise-policy.ts`
- Test: `packages/core/test/enterprise-policy.test.ts`

- [ ] Write failing unit tests for allowed providers, blocked providers, allowed internal hosts, and blocked public hosts.
- [ ] Implement provider and URL allowlist helpers.
- [ ] Run `bun test test/enterprise-policy.test.ts` from `packages/core`.

### Task 2: Block Remote Model Discovery

**Files:**
- Modify: `packages/core/src/models-dev.ts`
- Test: `packages/core/test/models.test.ts`

- [ ] Add a test proving `ModelsDev.get()` does not call `https://models.dev` under enterprise policy.
- [ ] Return an empty catalog when no local model file exists.
- [ ] Run the targeted `models.test.ts` cases from `packages/core`.

### Task 3: Enforce Provider Runtime Policy

**Files:**
- Modify: `packages/opencode/src/provider/provider.ts`
- Test: `packages/opencode/test/provider/provider.test.ts`

- [ ] Add tests proving external config providers and external base URLs are rejected.
- [ ] Filter provider catalog/config/auth/plugin providers through `EnterprisePolicy`.
- [ ] Validate resolved base URLs and fetch request URLs before SDK creation/network egress.
- [ ] Run targeted provider tests from `packages/opencode`.

### Task 4: Verification

**Files:**
- Modify only touched source/tests if verification fails.

- [ ] Run `bun typecheck` from `packages/core`.
- [ ] Run `bun typecheck` from `packages/opencode`.
- [ ] Run targeted tests for core and provider policy.

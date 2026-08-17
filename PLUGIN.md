# The `llm-user-agent-override` plugin

A plug-in / plug-out **composition unit** that injects a route-level custom
`User-Agent` into DeepSeek Harness requests — the plugin counterpart to the
`userAgent: opencode` field documented in [README.md](README.md).

> It sits alongside the main README method, not instead of it. The native
> field is the one-line fix; this plugin delivers the same wire result as an
> independent, removable unit owned next to its callers.

**English** · [中文](PLUGIN.zh-CN.md)

## TL;DR

```yaml
# in the harness cordis composition (patch overlay or cordis.yml)
- insert:
    - id: llm-user-agent-override
      name: '@deepseek-ai/dsh-llm-user-agent-override'
      config:
        routes:
          opencode-zen: opencode   # provider route → wire User-Agent
```

Route `opencode-zen` requests now carry `User-Agent: opencode` on the wire,
which is what routes your request into OpenCode Zen's first-party pool. Every
other route is untouched (`yield* next()`).

## Background: why a plugin at all

From [README.md](README.md#background): OpenCode Zen routes traffic by
`User-Agent`. `User-Agent: opencode` reaches the first-party pool that serves
the free models reliably; any other UA lands in the shared third-party pool
whose quota is exhausted — that is the `FreeUsageLimitError` you see.

DeepSeek Harness sends its own attribution UA on every provider request and
treats `user-agent` inside provider `headers` as a reserved name (filtered out
by design). Two delivery mechanisms can fix the wire UA for a route:

| | native field | this plugin |
|---|---|---|
| change | one line in the `llm-pi-ai` settings section | one composition row + the package |
| wire result | `userAgent: opencode` per route | `headers: { 'user-agent': <route value> }` per route |
| lives in | the dsh settings document | the composition (or a `--patch` overlay) |
| needs the profile field feature | yes (a build that ships `userAgent`) | no — works by intercepting `llm/stream` |
| code footprint in dsh | the upstream feature commit | zero kernel changes; runs from the package only |

Choose the field when you own the settings section and just want the one line.
Choose the plugin when the mapping should travel with the code that owns the
calls, when you cannot touch the settings document, or when you want a working
reference for bypassing an adapter from a `llm/stream` waterfall listener.

## How it works

- The plugin registers a **waterfall listener** on the `llm/stream` event
  (`ctx.on('llm/stream', …)`). It never modifies `agent-loop`, `LlmRuntime`,
  or the pi-ai adapter — kernel untouched, which is what makes it safe to
  remove.
- For a matched route (`config.routes[provider]`) it resolves the same provider
  configuration the adapter would read, builds the same pi-ai provider and
  model descriptors, and streams through pi-ai directly with
  `headers: { 'user-agent': <value> }` — bypassing the adapter for that request
  only.
- For any other route it calls `yield* next()` and the request flows through
  unchanged, byte for byte.
- The adapter helpers (`resolveProfiles`, `toPiContext`, `toStreamChunks`) are
  reused from `@deepseek-ai/dsh-llm-pi-ai/src/*` and inlined into the plugin's
  own build output (`deps.alwaysBundle`), so the published artifact is
  self-contained and llm-pi-ai's package-root contract stays intact.

## Requirements

| Item | Requirement |
|---|---|
| dsh workspace | a clone of [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) with `pnpm install` done (the plugin lives under `packages/llm/`) |
| Node.js | `^22.19` or `>=24` (what dsh declares) |
| pnpm | whatever your dsh workspace uses |
| peer packages | provided by the workspace: `@deepseek-ai/dsh-llm-pi-ai`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-launch-environment`, `@earendil-works/pi-ai`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` |
| build | `pnpm run build:lib:host` (and `build:lib:client` + `build:web` if you run the web profile) |
| Zen API key | from your OpenCode account, stored in `$DSH_HOME/.credentials.yaml` (never committed) |
| network | reachable `opencode.ai` and the npm registry |

## Install & mount

### 1. Copy the package into the workspace

```sh
cp -r packages/llm/llm-user-agent-override <your-dsh-clone>/packages/llm/
```

### 2. Wire the workspace type resolution (two lines)

In `tsconfig.base.json` `paths`, next to the existing `dsh-llm-pi-ai` entry:

```jsonc
"@deepseek-ai/dsh-llm-user-agent-override/src/*": ["./packages/llm/llm-user-agent-override/src/*"]
```

In `tsconfig.host.json` `references`, next to `./packages/llm/llm-pi-ai`:

```jsonc
{ "path": "./packages/llm/llm-user-agent-override" }
```

### 3. Make the package resolvable at runtime

The launcher's Loader resolves composition names from
`apps/cli/node_modules/@deepseek-ai/`. A pnpm-workspace-style symlink is enough:

```sh
ln -s ../../../../packages/llm/llm-user-agent-override \
  apps/cli/node_modules/@deepseek-ai/dsh-llm-user-agent-override
```

(`pnpm install` may clean a manual symlink; for a permanent install add the
package to a bundle's `dependencies` and reinstall.)

### 4. Mount it (patch overlay or cordis.yml)

```yaml
- insert:
    - id: llm-user-agent-override
      name: '@deepseek-ai/dsh-llm-user-agent-override'
      config:
        routes:
          opencode-zen: opencode
```

```sh
pnpm dsh --profile web --patch ./llm-uao-patch.yml --port 3081
```

`--patch` is a launcher flag and must come before the first token the web app
owns (`--port`); `--patch` after `--port` fails with `unknown option '--patch'`.

Provider connection facts come from the `llm-pi-ai` settings section (the same
source the adapter reads), or from the plugin's own `profiles` field as a
fallback — settings wins when both exist.

## Uninstall

Any of these, then restart — no hooks stay behind:

1. remove the composition row (or the `--patch` file);
2. set `disabled: true` on the row;
3. remove the `apps/cli/node_modules` symlink.

An unconfigured route is indistinguishable from no plugin: the wire UA returns
to the harness attribution (`deepseek-harness/{version} (+…)`).

## Config semantics & behavior

- `routes: Record<provider, ua>` — provider route to wire UA. An **empty** UA
  string is refused at load (`BAD_CONFIG`); a blank `User-Agent` on the wire is
  never deliberate.
- `profiles?: Record<provider, PiAiProviderProfile>` — connection facts
  fallback for tests or standalone deployments; `llm-pi-ai` settings take
  precedence.
- Matched route fails loud with `LlmError` when its provider configuration
  cannot be resolved (`NO_PROFILE`, naming the route), the model is unknown
  (`UNKNOWN_MODEL`), or the credential is missing (`MISSING_CREDENTIAL`).
- Known limits: image input is served through the synchronous text-only
  context conversion (adapter's regular `UNSUPPORTED_CONTENT`), and `stop`
  sequences are not passed through (pi-ai does not support them).

## Verify

Unit tests (wire assertion against a mock server):

```sh
pnpm vitest run packages/llm/llm-user-agent-override
```

Headless end-to-end against a local UA-echo gateway:

```sh
DSH_HOME=/tmp/dsh-demo UA_TEST_KEY=test DEEPSEEK_API_KEY=x \
  pnpm dsh --profile headless --patch ./llm-uao-patch.yml \
  --patch ./llm-default-model.yml "请只回复：OK"
# reply echoes the wire UA: opencode for the matched route,
# deepseek-harness/0.1.0-rc.5 (+https://github.com/deepseek-ai/deepseek-harness) otherwise
```

Or in the web UI (port 3081): pick an `OpenCode Zen` model (default
`big-pickle`), send a message, and watch the reply echo — or the gateway log —
for the `opencode` UA.

## Free models

Same set as [README.md](README.md#free-models): `big-pickle` plus the
`*-free` ids. Refresh the authoritative list with the command in
[README.md](README.md#6-refresh-the-free-model-list) — Zen adds and removes
models over time.

## Appendix: commands

```sh
pnpm run build:lib:host && pnpm run build:lib:client && pnpm run build:web
pnpm vitest run packages/llm/llm-user-agent-override

# mount + run (launcher flags first)
DSH_HOME=/tmp/dsh-demo pnpm dsh --profile web --patch ./llm-uao-patch.yml --port 3081

# inspect the composed tree
pnpm dsh --profile web --patch ./llm-uao-patch.yml --dump-config \
  | grep llm-user-agent-override

# uninstall
rm apps/cli/node_modules/@deepseek-ai/dsh-llm-user-agent-override
```
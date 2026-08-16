# Use OpenCode Zen's Free Models in dsh (DeepSeek Harness)

A step-by-step method for using [OpenCode Zen](https://opencode.ai/zen) free models inside the DeepSeek Harness (`dsh`).

> This repository is a **method write-up only**: documentation and configuration snippets, no DeepSeek Harness source code is distributed here.

**English** · [中文](README.zh-CN.md)

## TL;DR

```yaml
llm-pi-ai:
  providers:
    opencode-zen:
      apiKeyEnv: OPENCODE_ZEN_API_KEY
      displayName: OpenCode Zen
      api: openai-completions
      baseURL: https://opencode.ai/zen/v1
      userAgent: opencode   # the one line that matters
      models:
        - id: big-pickle
        - id: deepseek-v4-flash-free
        - id: hy3-free
        - id: laguna-s-2.1-free
        - id: mimo-v2.5-free
        - id: nemotron-3-ultra-free
        - id: nemotron-3.5-lightning-free
agent-default-model:
  provider: opencode-zen
  model: big-pickle
```

Put `userAgent: opencode` on the `llm-pi-ai` provider route and the Zen free models work inside dsh.

## Background

### The symptom

Requests to Zen free models from dsh fail with:

```
FreeUsageLimitError: Rate limit exceeded. Please try again later.
```

Often only *some* free models fail while others work — the failing set changes over time.

### The root cause

OpenCode Zen routes traffic by `User-Agent`:

- `User-Agent: opencode` → **first-party pool**, serves free models reliably.
- anything else → **shared third-party pool**, whose free quota gets exhausted — that is the `FreeUsageLimitError`.

DeepSeek Harness sends its own attribution `User-Agent` (`deepseek-harness/{version} (+https://github.com/deepseek-ai/deepseek-harness)`) on every provider request, and it treats a `user-agent` entry in provider `headers` as a reserved name that gets filtered out before the attribution is applied. So the first-party pool is unreachable from dsh, and `headers: { 'user-agent': opencode }` does nothing — by design.

### The fix

The `llm-pi-ai` provider profile supports a **route-level `userAgent` field**: the full wire `User-Agent` for that route. It replaces the shared attribution UA on the requests that route sends — and only those:

- merge order: profile headers (attribution-reserved names filtered) → attribution → route `userAgent`
- a route *without* `userAgent` keeps the mandatory attribution unchanged
- an empty value is rejected at profile validation, same as `baseURL` and `displayName`
- model discovery (`discoverModels`) is unaffected — it is a configuration-surface listing, not a model-serving request

The feature exists in the harness source as the commit *`feat(llm-pi-ai): allow a provider route to replace the attribution User-Agent`*. This guide describes only the interface and the configuration; if your build predates it, add the optional `userAgent` field to the provider profile schema and merge it into the request headers after the attribution headers (interface-level change, roughly a dozen lines), or use a build that already includes it.

## Requirements

| Item | Requirement |
|---|---|
| dsh | A build whose `llm-pi-ai` provider profile supports the `userAgent` field |
| Node.js / pnpm | Whatever your dsh build declares (`node ^22.19` / `>=24`, pnpm workspaces) |
| Zen API key | From your OpenCode account |
| Network | Reachable `opencode.ai` and the npm registry |
| Shell | bash-compatible shell (the model-list refresh command uses `sed`/`curl`) |

## Steps

### 1. Get a Zen API key

From your OpenCode account. Keep it secret — never commit it.

### 2. Configure the provider route

Create or edit the dsh user config. The default location is `~/.dsh/settings.yaml` (macOS/Linux) or `%USERPROFILE%\.dsh\settings.yaml` (Windows); override it with the `DSH_HOME` environment variable if needed.

```yaml
llm-pi-ai:
  providers:
    opencode-zen:
      apiKeyEnv: OPENCODE_ZEN_API_KEY
      displayName: OpenCode Zen
      api: openai-completions
      baseURL: https://opencode.ai/zen/v1
      userAgent: opencode
      models:
        - id: big-pickle
        - id: deepseek-v4-flash-free
        - id: hy3-free
        - id: laguna-s-2.1-free
        - id: mimo-v2.5-free
        - id: nemotron-3-ultra-free
        - id: nemotron-3.5-lightning-free
```

**`userAgent: opencode` is the key line.** Remove it and requests fall back to the shared third-party pool and the `FreeUsageLimitError` comes back. If you kept an old `headers: { 'user-agent': ... }` entry from before, remove it — it does nothing and only confuses.

### 3. Set the default model

```yaml
agent-default-model:
  provider: opencode-zen
  model: big-pickle
```

### 4. Store the API key

`~/.dsh/.credentials.yaml` (permissions tightened, never commit or share it):

```yaml
OPENCODE_ZEN_API_KEY: sk-your-real-key
```

`apiKeyEnv` is resolved from the environment variable first, then from this file.

### 5. Verify

```sh
pnpm dsh --profile headless "Reply with exactly: PONG"
```

Expect `PONG` printed on stdout and exit code `0`. If you see `FreeUsageLimitError`, check the troubleshooting table below.

### 6. Refresh the free-model list

Zen adds and removes models over time. Pull the current list with your key and filter it:

```sh
KEY=$(sed -n 's/^OPENCODE_ZEN_API_KEY: //p' ~/.dsh/.credentials.yaml)
curl -sS -H "Authorization: Bearer $KEY" https://opencode.ai/zen/v1/models \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const m of JSON.parse(s).data)if(m.id.endsWith("-free")||m.id==="big-pickle")console.log(m.id)})'
```

Sync the resulting ids into the `models:` list in `settings.yaml`, keeping the `- id: <id>` format.

## Free models

The free set is `big-pickle` plus the `*-free` ids. As of 2026-08-17:

| id | notes |
|---|---|
| `big-pickle` | the default model used above |
| `deepseek-v4-flash-free` | |
| `hy3-free` | |
| `laguna-s-2.1-free` | |
| `mimo-v2.5-free` | slow-reasoning model; give it a larger `max_tokens` |
| `nemotron-3-ultra-free` | |
| `nemotron-3.5-lightning-free` | slow-reasoning model; give it a larger `max_tokens` |

Run step 6 to see the authoritative current list.

## Tips

- `mimo-v2.5-free` and `nemotron-3.5-lightning-free` are reasoning-heavy and slow to start: with a small `max_tokens` their output gets cut off early (`finish=max-tokens`). Give them `max_tokens > 256` for complete answers.
- The web UI model selector renders the models configured in `settings.yaml`, so newly added ids appear there after a restart.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `FreeUsageLimitError` | UA is not `opencode` | Confirm `userAgent: opencode` is present, remove any old `headers: { 'user-agent': ... }`, and restart the process so settings are reloaded |
| A single model errors while others work | shared-pool pressure / transient limit | Retry later; if the failure is `finish=max-tokens`, raise `max_tokens` |
| `MissingClientBundleError` on `dsh web` | web frontend bundle not built | `pnpm run build:lib:client && pnpm run build:web`, then restart |

## Web UI (optional)

```sh
pnpm run build:lib:client && pnpm run build:web
pnpm dsh web
```

Open <http://127.0.0.1:3080> and pick any free model from the model selector.

## License and disclaimer

This is a community method write-up. It is not affiliated with or endorsed by the DeepSeek Harness or OpenCode Zen projects. It distributes no harness source code — only configuration snippets and interface-level descriptions. Model availability, quota policy, and pricing are subject to the providers' own terms.

# `@deepseek-ai/dsh-llm-user-agent-override`

English | [中文](README.zh.md)

Route-level custom `User-Agent` injection for the pi-ai LLM adapter seam.

A gateway that routes by client identity (for example a managed inference endpoint separating traffic by calling product) needs each harness request to carry the calling product's own `User-Agent` on the wire. The `llm-pi-ai` adapter's profile `userAgent` field already replaces the shared attribution UA per route; this plugin is the same capability as its own composition unit, so a deployment can own the mapping next to its calls without editing the `llm-pi-ai` settings section — and it doubles as the reference for how to bypass an adapter from a `llm/stream` waterfall listener.

## Behavior

- Matched route (`routes[provider]`): the request bypasses the `pi-ai` adapter entirely. The plugin resolves the same provider configuration the adapter would read, builds the same pi-ai provider and model descriptors, and streams through pi-ai directly with `headers: { 'user-agent': <value> }`.
- Unmatched route: `yield* next()` — the request falls through to the pi-ai adapter, preserving every existing behavior.
- A matched route whose provider configuration cannot be resolved fails loud with `LlmError` (`NO_PROFILE`), naming the route.
- An empty `routes` value is refused at load: a blank `User-Agent` on the wire is never a deliberate choice.

Provider profiles come from the `llm-pi-ai` settings section (the source the adapter itself reads), with this plugin's optional `profiles` field as a fallback — for deployments that want the connection facts next to the override, or for tests.

## Configuration

```yaml
# cordis.yml
- id: llm-user-agent-override
  name: '@deepseek-ai/dsh-llm-user-agent-override'
  config:
    routes:
      open-code: opencode
```

```yaml
# ~/.dsh/settings.yaml — provider connection facts (may also live in the
# plugin's `profiles` field)
llm-pi-ai:
  providers:
    open-code:
      apiKeyEnv: OPEN_CODE_API_KEY
      baseURL: https://opencode.ai/zen/v1
      models:
        - id: big-pickle
```

## Model Experience

### Overridden request

#### What the model sees

The model receives the identical `system` prompt, history, tools, and sampling fields the adapter would send for the route; the plugin reuses `llm-pi-ai`'s own profile resolver, context conversion, and event translation. The only difference is the wire `User-Agent` header. No prompt prose is added. A request that could not reach the model through the adapter (missing profile, unknown model, missing credential) fails with the adapter's own diagnostics naming the route.

#### Token effect

Nothing changes: the request body is byte-identical to the adapter's for the same route, so provider tokenization and conversion cost are unaffected.

#### KV Cache effect

Provider-side cache identity follows the request body, which is unchanged; only the `User-Agent` header differs, and providers key their prompt cache on content, not on client headers. No additional invalidation is introduced.

### Unmatched request

#### What the model sees

The plugin does not participate; the request flows through the next middleware unchanged.

#### Token effect

No effect — the plugin neither inspects nor touches an unmatched request, so tokenization and conversion cost are unchanged.

#### KV Cache effect

No effect — the plugin neither inspects nor touches an unmatched request, so provider-side cache identity is unchanged.

## Known Limitations and Deferred Work

- The override reuses `llm-pi-ai`'s profile resolution, pi-ai context conversion, and event translation through the package's declared `./src/*` export surface (those helpers are deliberately absent from its package root) and bundles them into its own lib at build time, so the published artifact needs no `llm-pi-ai` source. Text and tool-call requests are fully supported.
- Image input is served through the synchronous text-only context conversion; image requests on an overridden route fail with the adapter's regular `UNSUPPORTED_CONTENT` diagnostics because the durable attachment store is not consulted. Text and tool-call requests are fully supported.
- `stop` sequences are not passed through (pi-ai does not support them), which matches the adapter's own contract.
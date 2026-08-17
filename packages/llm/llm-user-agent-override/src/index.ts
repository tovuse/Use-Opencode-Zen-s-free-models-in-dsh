/**
 * Route-level custom User-Agent injection for the pi-ai LLM adapter seam.
 *
 * A gateway that routes by client identity needs each harness request to carry
 * the calling product's own `User-Agent` on the wire. The pi-ai adapter's
 * profile `userAgent` field already replaces the shared attribution UA for a
 * route, but a deployment may instead want the mapping owned by this plugin —
 * per provider route, without touching the `llm-pi-ai` settings section — so
 * this package re-implements the stream path for the matched routes: it reads
 * the same provider configuration, resolves the same pi-ai provider, and
 * streams with the plugin's `user-agent` header, bypassing the adapter
 * entirely.
 *
 * @module dsh-llm-user-agent-override
 */

import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai/src/config'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { toPiContext } from '@deepseek-ai/dsh-llm-pi-ai/src/context'
import { toStreamChunks } from '@deepseek-ai/dsh-llm-pi-ai/src/stream'

/** The `llm-pi-ai` settings namespace this plugin reads provider routes from. */
const NS = settingsNamespace('llm-pi-ai')

/**
 * One override route: a provider key to a wire `User-Agent` string.
 * @param provider - registered provider route this override matches.
 * @returns the `User-Agent` value to put on the wire for that route.
 */
export interface Config {
  /**
   * Provider-route to `User-Agent` mapping.
   *
   * Provider connection details (`baseURL`, `api`, `apiKeyEnv`, and model
   * descriptors) come from the `llm-pi-ai` settings section, exactly as the
   * adapter reads them. A bare provider declared only here is not serviceable
   * — the request then falls through to the adapter, which reports the
   * missing route the same way it would without this plugin.
   *
   * An empty string is refused at load: it would put a blank `User-Agent` on
   * the wire, which is never a deliberate choice, and silently disabling the
   * override otherwise hides the mistake until a gateway routes by header.
   */
  routes: Record<string, string>
  /**
   * Provider profiles for routes not present in the `llm-pi-ai` settings
   * section. This exists so a deployment (or a test) can pin the connection
   * information next to the override instead of maintaining a parallel
   * settings section; when a profile exists both here and in settings, the
   * settings section wins, keeping one authority for provider facts.
   */
  profiles?: Record<string, PiAiProviderProfile>
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  routes: z.dict(z.string()),
  // Profile objects are validated strictly by llm-pi-ai's resolveProfiles at
  // request time (the same resolver the adapter runs), so the plugin schema
  // keeps them opaque; an unserviceable profile fails loud at the request,
  // naming the route and model, exactly as a bad settings section would.
  profiles: z.dict(z.any()).default({}),
})

export const name = 'llm-user-agent-override'
export const inject = ['llm']

/**
 * Register the `llm/stream` waterfall listener that swaps the wire
 * `User-Agent` for configured routes. Unmatched routes and routes whose
 * provider configuration cannot be resolved fall through to the next
 * middleware (normally the pi-ai adapter), preserving all existing behavior.
 * @param ctx - Cordis context carrying the `llm` service.
 * @param config - the override route and profile configuration.
 */
export function apply(ctx: Context, config: Config): void {
  for (const [provider, userAgent] of Object.entries(config.routes)) {
    if (userAgent.length === 0) {
      throw new LlmError(
        `llm-user-agent-override: route "${provider}" declares an empty user-agent, which would put a blank`
        + ' User-Agent on the wire; remove the route or give it a non-empty value',
        'BAD_CONFIG',
      )
    }
  }

  ctx.on('llm/stream', async function* (options, next): AsyncIterable<StreamChunk> {
    const userAgent = config.routes[options.provider]
    if (userAgent === undefined) {
      yield* next()
      return
    }
    const profile = resolveProfile(ctx, config, options.provider)
    if (profile === undefined) {
      throw new LlmError(
        `llm-user-agent-override: route "${options.provider}" has an override but no resolvable pi-ai`
        + ' provider configuration; add a profile to the llm-pi-ai settings section or to this plugin\'s'
        + ' profiles field',
        'NO_PROFILE',
      )
    }
    yield* overrideStream(ctx, options, profile, userAgent)
  })
}

/**
 * Resolve one route's profile, preferring the `llm-pi-ai` settings section
 * (the same source the adapter reads) and falling back to this plugin's own
 * `profiles` field.
 * @param ctx - Cordis context carrying the optional `settings` service.
 * @param config - the override configuration.
 * @param provider - the provider route to resolve.
 * @returns the raw provider profile, or `undefined` when neither source knows it.
 */
function resolveProfile(
  ctx: Context,
  config: Config,
  provider: string,
): PiAiProviderProfile | undefined {
  const settings = ctx.get('settings')
  const section = settings?.get(NS) as { providers?: Record<string, PiAiProviderProfile> } | undefined
  return section?.providers?.[provider] ?? config.profiles?.[provider]
}

/**
 * Stream one request with the override route's custom `User-Agent`, bypassing
 * the pi-ai adapter: provider, model, and context resolve exactly as the
 * adapter resolves them, and the terminal event translation is the adapter's
 * own, so only the wire header differs.
 * @param ctx - Cordis context carrying the optional `credentials` service.
 * @param options - the harness request.
 * @param profile - the raw provider profile for the route.
 * @param userAgent - the wire `User-Agent` to send.
 * @returns the stream chunks for the overridden request.
 */
async function* overrideStream(
  ctx: Context,
  options: GenerateOptions,
  profile: PiAiProviderProfile,
  userAgent: string,
): AsyncIterable<StreamChunk> {
  const resolved = resolveProfiles({ [options.provider]: profile }).get(options.provider)
  if (resolved === undefined) {
    throw new LlmError(`llm-user-agent-override: provider "${options.provider}" did not resolve`, 'NO_PROFILE')
  }
  const model = resolved.piProvider.getModels().find(model => model.id === options.model)
  if (model === undefined) {
    throw new LlmError(
      `llm-user-agent-override: provider "${options.provider}" has no configured model "${options.model}"`,
      'UNKNOWN_MODEL',
    )
  }
  const apiKey = await resolveApiKey(ctx, options.provider, resolved.apiKeyEnv)
  const context = toPiContext(options)
  const events = resolved.piProvider.streamSimple(model, context, {
    ...apiKey === undefined ? {} : { apiKey },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    ...options.signal === undefined ? {} : { signal: options.signal },
    headers: { 'user-agent': userAgent },
  })
  yield* toStreamChunks(events, model.contextWindow)
}

/**
 * Resolve a route's credential, mirroring the pi-ai adapter: the credentials
 * service when the seam is mounted, the launch environment otherwise. A
 * profile naming no credential defers to pi-ai's provider-native discovery.
 * @param ctx - Cordis context carrying the optional `credentials` service.
 * @param provider - the provider route, for the failure diagnostic.
 * @param ref - the profile's credential reference, or `undefined`.
 * @returns the resolved key, or `undefined` for keyless routes.
 */
async function resolveApiKey(
  ctx: Context,
  provider: string,
  ref: CredentialRef | undefined,
): Promise<string | undefined> {
  if (ref === undefined) return undefined
  const credentials = ctx.get('credentials')
  const hit = credentials !== undefined
    ? (await credentials.resolve(ref))?.value
    : launchEnvironmentOf(ctx).get(ref)?.value
  if (hit !== undefined && hit.length > 0) return hit
  throw new LlmError(
    `llm-user-agent-override: no credential for provider route "${provider}"; its profile resolves ${ref},`
    + ' which is not set — store it through the credentials service or export it',
    'MISSING_CREDENTIAL',
  )
}

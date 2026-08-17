/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-llm-user-agent-override`.
 * @module @deepseek-ai/dsh-llm-user-agent-override/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-user-agent-override'

/** Cordis companion plugin name. */
export const name = 'llm-user-agent-override-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the override surface is a `llm/stream` waterfall
 * listener that either short-circuits with the plugin's own stream or
 * delegates through `next()` — both paths are re-derived per request from the
 * same configuration and adapter registrations the seam already owns, so
 * there is no owned event or mutable data sequence left to assert.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

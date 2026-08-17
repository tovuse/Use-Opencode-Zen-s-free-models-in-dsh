import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import * as OverridePlugin from '../src/index.ts'
import { assemble } from './assemble.ts'

const servers: MockLlmServer[] = []

async function startServer(): Promise<MockLlmServer> {
  const server = await startMockLlmServer({ sequence: ['success'], repeatLast: true, apiKey: 'test-key' })
  servers.push(server)
  return server
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map(server => server.close()))
})

/** A model request with a single text turn, ready for the pi-ai conversion. */
function textRequest(): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: 'text', text: 'hello' }],
    source: { kind: 'plugin', plugin: 'test' },
  })
}

/**
 * Harness: LlmRuntime + the pi-ai adapter (routes served from the mock server)
 * + the user-agent override plugin.
 * @param server - the mock LLM server the adapter route points at.
 * @param overrides - the override plugin's config.
 */
async function harness(server: MockLlmServer, overrides: OverridePlugin.Config): Promise<Context> {
  vi.stubEnv('PI_TEST_KEY', 'test-key')
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, {
    providers: {
      deepseek: {
        apiKeyEnv: 'PI_TEST_KEY',
        baseURL: server.baseURL,
        api: 'openai-completions',
        models: [{ id: 'deepseek-v4-flash', contextWindow: 131072, maxTokens: 4096 }],
      },
    },
  })
  await ctx.plugin(OverridePlugin, overrides)
  return ctx
}

describe('llm-user-agent-override', () => {
  it('sends the configured custom User-Agent for a matched route', async () => {
    const server = await startServer()
    const ctx = await harness(server, {
      routes: { deepseek: 'opencode' },
      profiles: {
        deepseek: {
          apiKeyEnv: 'PI_TEST_KEY',
          baseURL: server.baseURL,
          api: 'openai-completions',
          models: [{ id: 'deepseek-v4-flash', contextWindow: 131072, maxTokens: 4096 }],
        },
      },
    })
    const result = await assemble(ctx, {
      model: 'deepseek-v4-flash',
      messages: [textRequest()],
    })
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.message.content[0]).toEqual({ type: 'text', text: 'mock response recovered' })
    expect(server.requests[0]?.headers['user-agent']).toContain('opencode')
  })

  it('keeps the shared attribution User-Agent for an unconfigured route', async () => {
    const server = await startServer()
    const ctx = await harness(server, {
      routes: { other: 'opencode' },
    })
    await assemble(ctx, {
      model: 'deepseek-v4-flash',
      messages: [textRequest()],
    })
    const ua = server.requests[0]?.headers['user-agent'] ?? ''
    expect(ua).not.toContain('opencode')
  })

  it('refuses an empty user-agent at load', async () => {
    const server = await startServer()
    await expect(async () => {
      await harness(server, { routes: { deepseek: '' } })
    }).rejects.toThrow(LlmError)
  })

  it('fails loud when a matched route has no resolvable provider profile', async () => {
    const server = await startServer()
    const ctx = await harness(server, { routes: { deepseek: 'opencode' } })
    await expect(async () => {
      await assemble(ctx, {
        model: 'deepseek-v4-flash',
        messages: [textRequest()],
      })
    }).rejects.toThrow(LlmError)
  })
})

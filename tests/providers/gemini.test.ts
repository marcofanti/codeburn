import { describe, it, expect, vi } from 'vitest'
import { gemini } from '../../src/providers/gemini.js'
import { readFile } from 'fs/promises'

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises')
  return {
    ...actual as any,
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  }
})

describe('Gemini Provider', () => {
  it('should parse gemini session correctly', async () => {
    const mockSession = {
      sessionId: 'test-session',
      messages: [
        { 
          type: 'user', 
          content: [
            { text: 'hello' }
          ]
        },
        {
          id: 'msg-1',
          timestamp: '2026-04-15T12:00:00Z',
          type: 'gemini',
          model: 'gemini-3-flash-preview',
          tokens: { 
            input: 100, 
            output: 50, 
            cached: 20, 
            thoughts: 10,
            tool: 0,
            total: 160
          },
          toolCalls: [
            { name: 'read_file' }
          ]
        }
      ]
    }

    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession))

    const parser = gemini.createSessionParser({ path: 'fake.json', project: 'test', provider: 'gemini' }, new Set())
    const calls = []
    for await (const call of parser.parse()) {
      calls.push(call)
    }

    expect(calls).toHaveLength(1)
    const call = calls[0]
    expect(call.provider).toBe('gemini')
    expect(call.model).toBe('gemini-3-flash-preview')
    expect(call.inputTokens).toBe(80) // 100 - 20
    expect(call.outputTokens).toBe(50)
    expect(call.reasoningTokens).toBe(10)
    expect(call.cachedInputTokens).toBe(20)
    expect(call.tools).toEqual(['read_file'])
    expect(call.userMessage).toBe('hello')
    expect(call.sessionId).toBe('test-session')
  })

  it('should handle multiple messages and deduplication', async () => {
    const mockSession = {
      sessionId: 'test-session-2',
      messages: [
        { type: 'user', content: 'first' },
        {
          id: 'msg-1',
          timestamp: '2026-04-15T12:00:00Z',
          type: 'gemini',
          tokens: { input: 10, output: 5, cached: 0, thoughts: 0 },
        },
        { type: 'user', content: 'second' },
        {
          id: 'msg-2',
          timestamp: '2026-04-15T12:01:00Z',
          type: 'gemini',
          tokens: { input: 20, output: 10, cached: 0, thoughts: 0 },
        }
      ]
    }

    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession))

    const seenKeys = new Set<string>()
    const parser = gemini.createSessionParser({ path: 'fake2.json', project: 'test', provider: 'gemini' }, seenKeys)
    const calls = []
    for await (const call of parser.parse()) {
      calls.push(call)
    }

    expect(calls).toHaveLength(2)
    expect(calls[0].userMessage).toBe('first')
    expect(calls[1].userMessage).toBe('second')
    expect(seenKeys.size).toBe(2)

    // Second parse with same seenKeys should yield nothing
    const parser2 = gemini.createSessionParser({ path: 'fake2.json', project: 'test', provider: 'gemini' }, seenKeys)
    const calls2 = []
    for await (const call of parser2.parse()) {
      calls2.push(call)
    }
    expect(calls2).toHaveLength(0)
  })
})

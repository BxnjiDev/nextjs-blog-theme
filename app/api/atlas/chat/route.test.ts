import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from '@/lib/auth/currentUser';

function fakeMessageStream(finalMessage: { content: unknown[]; stop_reason: string }, textDeltas: string[] = []) {
  return {
    on(event: string, cb: (delta: string) => void) {
      if (event === 'text') for (const d of textDeltas) cb(d);
      return this;
    },
    finalMessage: async () => finalMessage,
  };
}

// One module-level queue so the mocked SDK can return a different
// "round" of the tool-calling loop on each successive call, simulating a
// real tool_use -> tool_result -> end_turn round trip without a network call.
let streamQueue: ReturnType<typeof fakeMessageStream>[] = [];

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(function FakeAnthropic() {
      return {
        messages: {
          stream: vi.fn(() => streamQueue.shift() ?? fakeMessageStream({ content: [], stop_reason: 'end_turn' })),
        },
      };
    }),
  };
});

import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/atlas/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/atlas/chat', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
  });

  it('rejects unauthenticated requests with 401 before touching Anthropic or the database', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeRequest({ message: 'hello' }));
    expect(res.status).toBe(401);
  });

  it('rejects a request with no message', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user_1', email: 'a@b.com' });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON bodies', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user_1', email: 'a@b.com' });
    const req = new NextRequest('http://localhost/api/atlas/chat', { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  describe('tool-calling round trip (real DB, mocked Anthropic SDK)', () => {
    const TEST_EMAIL = 'atlas-test-chat-route@example.com';
    let userId: string;

    async function readAllEvents(res: Response): Promise<Array<Record<string, unknown>>> {
      const text = await res.text();
      return text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.slice(6)));
    }

    afterAll(async () => {
      const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
      if (user) {
        const convos = await prisma.conversation.findMany({ where: { userId: user.id }, select: { id: true } });
        await prisma.chatMessage.deleteMany({ where: { conversationId: { in: convos.map((c) => c.id) } } });
        await prisma.conversation.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it('executes a requested tool, feeds the result back, and persists the final assistant turn with its tool-call log', async () => {
      const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: {},
        create: { email: TEST_EMAIL, passwordHash: 'unused-in-this-test' },
      });
      userId = user.id;
      vi.mocked(getCurrentUser).mockResolvedValue({ id: userId, email: TEST_EMAIL });

      streamQueue = [
        fakeMessageStream({
          content: [{ type: 'tool_use', id: 'tu_1', name: 'get_portfolio', input: {} }],
          stop_reason: 'tool_use',
        }),
        fakeMessageStream(
          { content: [{ type: 'text', text: 'Here is your portfolio.' }], stop_reason: 'end_turn' },
          ['Here ', 'is your portfolio.']
        ),
      ];

      const res = await POST(makeRequest({ message: 'Review my portfolio' }));
      expect(res.status).toBe(200);
      const events = await readAllEvents(res);

      expect(events.find((e) => e.type === 'conversation')).toBeTruthy();
      expect(events.find((e) => e.type === 'tool_call' && e.name === 'get_portfolio')).toBeTruthy();
      expect(events.find((e) => e.type === 'tool_result' && e.name === 'get_portfolio')).toBeTruthy();
      expect(events.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toBe('Here is your portfolio.');
      expect(events.find((e) => e.type === 'done')).toBeTruthy();

      const conversationId = events.find((e) => e.type === 'conversation')!.conversationId as string;
      const stored = await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
      expect(stored).toHaveLength(2);
      expect(stored[0]).toMatchObject({ role: 'USER', content: 'Review my portfolio' });
      expect(stored[1]).toMatchObject({ role: 'ASSISTANT', content: 'Here is your portfolio.' });
      expect(stored[1].toolCalls).toMatchObject([{ toolName: 'get_portfolio' }]);
    });
  });
});

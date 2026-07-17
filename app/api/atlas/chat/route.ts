import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { resolveAnthropicModel } from '@/lib/integrations/anthropicModel';
import { ATLAS_TOOLS } from '@/lib/atlas/tools';
import { executeTool } from '@/lib/atlas/toolExecutors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = Number(process.env.ATLAS_CHAT_MAX_TOOL_ROUNDS ?? 6);
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are Atlas — a personal investment operating system, not a general-purpose chatbot.

Atlas Core (the backend intelligence engine you have tool access to) already does the actual analysis: recommendation generation, thesis tracking, risk/health scoring, and performance grading are all deterministic or already-computed by the time you're asked about them. Your job is to call the right tool(s) and explain what they return — never invent a price, score, thesis, or recommendation from your own knowledge. If a tool returns an error or says something isn't available, say so plainly rather than filling the gap.

Ground rules:
- Always call a tool before stating a specific number, holding, recommendation, or thesis detail. General investing concepts don't need a tool call; anything about THIS portfolio does.
- Atlas is recommendation-only. Never imply that accepting a recommendation, or anything said in this chat, executes a trade — the user places every trade manually in their brokerage app. If asked to "buy" or "sell," explain you can only analyze and recommend, not execute.
- When you reference a specific recommendation by id, mention its symbol so the UI can link to it.
- Be direct and concise — this is a professional tool, not a conversation to pad out. Use markdown (tables, lists, bold) when it genuinely clarifies; don't decorate for its own sake.
- If a question is ambiguous about which symbol/account/time period, ask one clarifying question rather than guessing.`;

function sseEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: { conversationId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const messageText = String(body.message ?? '').trim();
  if (!messageText) return new Response('message is required', { status: 400 });

  const existing = body.conversationId
    ? await prisma.conversation.findFirst({ where: { id: body.conversationId, userId: user.id } })
    : null;
  const conversation =
    existing ??
    (await prisma.conversation.create({
      data: { userId: user.id, title: messageText.slice(0, 60) },
    }));
  const conversationId = conversation.id;

  await prisma.chatMessage.create({ data: { conversationId, role: 'USER', content: messageText } });

  const priorMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  // ChatMessage rows are only ever USER or ASSISTANT — a tool round-trip
  // within one turn is handled live below and its outcome folded into the
  // assistant message's `toolCalls` field, never replayed to Claude as a
  // separate history turn.
  const workingMessages: Anthropic.MessageParam[] = priorMessages.map((m) => ({
    role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
    content: m.content,
  }));

  const client = new Anthropic();
  const model = resolveAnthropicModel();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(obj)));
        } catch {
          // Client disconnected mid-stream — nothing more to do.
        }
      };
      send({ type: 'conversation', conversationId });

      let assistantText = '';
      const toolCallLog: { toolName: string; input: unknown; output: unknown }[] = [];

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const messageStream = client.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            tools: ATLAS_TOOLS,
            messages: workingMessages,
          });

          messageStream.on('text', (delta) => {
            assistantText += delta;
            send({ type: 'text', delta });
          });

          const finalMessage = await messageStream.finalMessage();
          const toolUseBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          if (finalMessage.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
            break;
          }

          workingMessages.push({ role: 'assistant', content: finalMessage.content });

          const toolResultContent: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            send({ type: 'tool_call', name: block.name, input: block.input });
            const result = await executeTool(block.name, block.input);
            toolCallLog.push(result);
            send({ type: 'tool_result', name: block.name, output: result.output });
            const isError = typeof result.output === 'object' && result.output !== null && 'error' in result.output;
            toolResultContent.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result.output),
              is_error: isError,
            });
          }
          workingMessages.push({ role: 'user', content: toolResultContent });
        }

        await prisma.chatMessage.create({
          data: {
            conversationId,
            role: 'ASSISTANT',
            content: assistantText || '(Atlas produced no text response for this turn.)',
            toolCalls: toolCallLog.length > 0 ? (toolCallLog as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message });
        // Persisted (not just streamed) so the failure survives a reload or
        // the client-side navigation that follows a new conversation's
        // first turn — otherwise the user message would sit with no
        // explanation once the transient SSE error is gone.
        await prisma.chatMessage.create({
          data: { conversationId, role: 'ASSISTANT', content: `Atlas couldn't respond: ${message}` },
        });
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

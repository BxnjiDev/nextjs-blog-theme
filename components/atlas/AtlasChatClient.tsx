'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SendHorizontal } from 'lucide-react';
import ChatMessageBubble, { type ChatMessageData } from './ChatMessageBubble';
import SuggestedPrompts from './SuggestedPrompts';
import TypingIndicator from './TypingIndicator';

interface StreamEvent {
  type: 'conversation' | 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  conversationId?: string;
  delta?: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  message?: string;
}

function tempId(): string {
  return `tmp_${Math.random().toString(36).slice(2)}`;
}

export default function AtlasChatClient({
  conversationId,
  initialMessages,
}: {
  conversationId?: string;
  initialMessages: ChatMessageData[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText, toolLabel]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setInput('');
    setMessages((m) => [...m, { id: tempId(), role: 'USER', content: trimmed, createdAt: new Date() }]);
    setIsStreaming(true);
    setStreamingText('');
    setToolLabel(null);

    let finalText = '';
    const collectedToolCalls: { toolName: string; input: unknown; output: unknown }[] = [];
    let newConversationId: string | undefined;

    try {
      const res = await fetch('/api/atlas/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: trimmed }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Atlas didn't respond (status ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue;
          const event: StreamEvent = JSON.parse(chunk.slice(6));

          if (event.type === 'conversation' && event.conversationId) {
            newConversationId = event.conversationId;
          } else if (event.type === 'text' && event.delta) {
            finalText += event.delta;
            setStreamingText(finalText);
            setToolLabel(null);
          } else if (event.type === 'tool_call' && event.name) {
            setToolLabel(`Using ${event.name.replace(/_/g, ' ')}…`);
          } else if (event.type === 'tool_result' && event.name) {
            collectedToolCalls.push({ toolName: event.name, input: event.input, output: event.output });
          } else if (event.type === 'error' && event.message) {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Atlas is unavailable right now.');
    } finally {
      setIsStreaming(false);
      setToolLabel(null);
      setStreamingText('');
      if (finalText || collectedToolCalls.length > 0) {
        setMessages((m) => [
          ...m,
          { id: tempId(), role: 'ASSISTANT', content: finalText || '(No response.)', toolCalls: collectedToolCalls, createdAt: new Date() },
        ]);
      }
      if (!conversationId && newConversationId) {
        router.replace(`/atlas?c=${newConversationId}`, { scroll: false });
      }
    }
  }

  const showEmptyState = messages.length === 0 && !isStreaming;

  return (
    <div className="flex h-full flex-1 flex-col">
      <div ref={scrollRef} className="atlas-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {showEmptyState ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div>
              <h2 className="text-lg font-semibold text-atlas-text">Ask Atlas</h2>
              <p className="mt-1 text-sm text-atlas-text-tertiary">Grounded in your real portfolio, recommendations, and thesis history.</p>
            </div>
            <div className="w-full max-w-lg">
              <SuggestedPrompts onSelect={sendMessage} />
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <ChatMessageBubble key={m.id} message={m} />
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-atlas-border bg-atlas-surface px-4 py-2.5 text-sm text-atlas-text">
                  {streamingText ? (
                    <div className="atlas-markdown whitespace-pre-wrap">{streamingText}</div>
                  ) : (
                    <TypingIndicator label={toolLabel ?? undefined} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-atlas-border p-4"
      >
        <div className="flex items-center gap-2 rounded-xl border border-atlas-border bg-atlas-surface px-3 py-2 focus-within:border-atlas-accent/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Atlas about your portfolio, a recommendation, or a symbol…"
            disabled={isStreaming}
            className="flex-1 bg-transparent text-sm text-atlas-text placeholder:text-atlas-text-tertiary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-atlas-accent text-white transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            <SendHorizontal size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

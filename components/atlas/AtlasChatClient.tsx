'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareText, SendHorizontal, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ChatMessageBubble, { type ChatMessageData } from './ChatMessageBubble';
import SuggestedPrompts from './SuggestedPrompts';
import TypingIndicator from './TypingIndicator';
import StatusBanner from '@/components/StatusBanner';

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
  onOpenConversations,
}: {
  conversationId?: string;
  initialMessages: ChatMessageData[];
  onOpenConversations?: () => void;
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
    <div className="relative flex h-full flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-atlas-border-subtle px-4 py-3.5 sm:px-6">
        {onOpenConversations && (
          <button
            type="button"
            onClick={onOpenConversations}
            aria-label="Open conversations"
            className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-atlas-text-secondary transition-colors hover:bg-atlas-surface-hover hover:text-atlas-text md:hidden"
          >
            <MessageSquareText size={16} strokeWidth={1.75} />
          </button>
        )}
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-atlas-accent-bright opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-atlas-accent-bright" />
        </span>
        <span className="text-sm font-medium text-atlas-text">Atlas</span>
        <span className="text-xs text-atlas-text-tertiary">{isStreaming ? 'thinking…' : 'online'}</span>
      </div>

      <div ref={scrollRef} className="atlas-scrollbar relative flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {showEmptyState ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <motion.div
              animate={{ boxShadow: ['0 0 0 0 rgba(59,130,246,0.3)', '0 0 0 14px rgba(59,130,246,0)'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-atlas-accent text-white"
            >
              <Sparkles size={20} strokeWidth={1.75} />
            </motion.div>
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
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <ChatMessageBubble message={m} />
                </motion.div>
              ))}
            </AnimatePresence>
            {isStreaming && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-atlas-border bg-atlas-surface px-4 py-2.5 text-sm text-atlas-text">
                  {streamingText ? (
                    <div className="atlas-markdown whitespace-pre-wrap">{streamingText}</div>
                  ) : (
                    <TypingIndicator label={toolLabel ?? undefined} />
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
        {error && <StatusBanner variant="error">{error}</StatusBanner>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="relative border-t border-atlas-border-subtle p-4"
      >
        <div className="flex items-center gap-2 rounded-xl border border-atlas-border bg-atlas-surface px-3 py-2 transition-shadow focus-within:border-atlas-accent/40 focus-within:shadow-glow-accent">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Atlas about your portfolio, a recommendation, or a symbol…"
            disabled={isStreaming}
            className="flex-1 bg-transparent text-sm text-atlas-text placeholder:text-atlas-text-tertiary focus:outline-none disabled:opacity-50"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={isStreaming || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-atlas-accent text-white transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            <SendHorizontal size={14} />
          </motion.button>
        </div>
      </form>
    </div>
  );
}

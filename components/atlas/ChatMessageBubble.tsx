import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RecommendationCard from '@/components/RecommendationCard';
import { extractRecommendationCards } from '@/lib/atlas/extractRecommendationCards';

export interface ChatMessageData {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  toolCalls?: unknown;
  createdAt: Date | string;
}

function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ChatMessageBubble({ message }: { message: ChatMessageData }) {
  const isUser = message.role === 'USER';
  const cards = !isUser ? extractRecommendationCards(message.toolCalls) : [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser ? 'bg-atlas-accent text-white' : 'border border-atlas-border bg-atlas-surface text-atlas-text'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="atlas-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {cards.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {cards.map((card) => (
              <RecommendationCard key={card.id} data={card} compact />
            ))}
          </div>
        )}

        <p className={`px-1 text-[11px] text-atlas-text-tertiary ${isUser ? 'text-right' : 'text-left'}`}>{formatTime(message.createdAt)}</p>
      </div>
    </div>
  );
}

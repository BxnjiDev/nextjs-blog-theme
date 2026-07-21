'use client';

import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

export interface ConversationListItem {
  id: string;
  title: string | null;
  updatedAt: Date | string;
}

export default function ConversationList({ conversations, activeId }: { conversations: ConversationListItem[]; activeId?: string }) {
  return (
    <div className="relative flex h-full w-56 shrink-0 flex-col border-r border-atlas-border-subtle">
      <div className="p-3">
        <Link
          href="/atlas"
          className="flex w-full items-center gap-2 rounded-lg border border-atlas-border px-3 py-2 text-sm text-atlas-text-secondary transition-colors hover:border-atlas-accent/40 hover:text-atlas-text"
        >
          <PlusCircle size={15} strokeWidth={1.75} />
          New chat
        </Link>
      </div>
      <div className="atlas-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && <p className="px-2 py-2 text-xs text-atlas-text-tertiary">No conversations yet.</p>}
        {conversations.map((c) => (
          <Link
            key={c.id}
            href={`/atlas?c=${c.id}`}
            className={`block truncate rounded-lg px-2.5 py-2 text-sm transition-colors ${
              c.id === activeId ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text'
            }`}
            title={c.title ?? 'Untitled'}
          >
            {c.title || 'Untitled'}
          </Link>
        ))}
      </div>
    </div>
  );
}

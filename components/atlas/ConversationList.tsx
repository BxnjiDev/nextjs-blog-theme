'use client';

import Link from 'next/link';
import { PlusCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ConversationListItem {
  id: string;
  title: string | null;
  updatedAt: Date | string;
}

function ListContents({ conversations, activeId, onNavigate }: { conversations: ConversationListItem[]; activeId?: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="p-3">
        <Link
          href="/atlas"
          onClick={onNavigate}
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
            onClick={onNavigate}
            className={`block truncate rounded-lg px-2.5 py-2 text-sm transition-colors ${
              c.id === activeId ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text'
            }`}
            title={c.title ?? 'Untitled'}
          >
            {c.title || 'Untitled'}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function ConversationList({
  conversations,
  activeId,
  mobileOpen = false,
  onClose,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <>
      {/* Persistent on desktop, where there's room for both panels side by
          side (see the fixed w-56 below vs. a phone-width viewport). */}
      <div className="relative hidden h-full w-56 shrink-0 flex-col border-r border-atlas-border-subtle md:flex">
        <ListContents conversations={conversations} activeId={activeId} />
      </div>

      {/* Mobile drawer: the chat panel needs the full width below md, so
          the conversation list becomes an overlay instead, matching the
          app shell's Sidebar drawer pattern. */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="absolute inset-0 z-40 bg-black/60 md:hidden"
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Conversations"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42 }}
              className="absolute inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r border-atlas-border bg-atlas-surface md:hidden"
            >
              <div className="flex items-center justify-between px-3 pt-3">
                <span className="px-1 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Conversations</span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close conversations"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-atlas-text-secondary transition-colors hover:bg-atlas-surface-hover hover:text-atlas-text"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
              <ListContents conversations={conversations} activeId={activeId} onNavigate={onClose} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

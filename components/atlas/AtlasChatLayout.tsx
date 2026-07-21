'use client';

import { useState } from 'react';
import ConversationList, { type ConversationListItem } from './ConversationList';
import AtlasChatClient from './AtlasChatClient';
import type { ChatMessageData } from './ChatMessageBubble';

/** Owns the one piece of state ConversationList and AtlasChatClient need to
 * share: whether the mobile conversation drawer is open. Below md, the two
 * panels can't sit side by side (see the fixed w-56 list vs. a 390px
 * viewport) — this coordinates a slide-in drawer the same way the app
 * shell's Sidebar does. */
export default function AtlasChatLayout({
  conversations,
  activeId,
  conversationId,
  initialMessages,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  conversationId?: string;
  initialMessages: ChatMessageData[];
}) {
  const [mobileListOpen, setMobileListOpen] = useState(false);

  return (
    <div className="atlas-glass relative flex h-[82vh] min-h-[560px] overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-atlas-radial opacity-60" />
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        mobileOpen={mobileListOpen}
        onClose={() => setMobileListOpen(false)}
      />
      <AtlasChatClient
        key={activeId ?? 'new'}
        conversationId={conversationId}
        initialMessages={initialMessages}
        onOpenConversations={() => setMobileListOpen(true)}
      />
    </div>
  );
}

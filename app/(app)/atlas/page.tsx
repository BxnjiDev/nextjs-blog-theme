import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/currentUser';
import ConversationList from '@/components/atlas/ConversationList';
import AtlasChatClient from '@/components/atlas/AtlasChatClient';

export const dynamic = 'force-dynamic';

export default async function AtlasPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [conversations, activeConversation] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, updatedAt: true },
    }),
    searchParams.c
      ? prisma.conversation.findFirst({
          where: { id: searchParams.c, userId: user.id },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        })
      : null,
  ]);

  return (
    <div className="flex h-[80vh] min-h-[560px] overflow-hidden rounded-xl border border-atlas-border bg-atlas-surface/40">
      <ConversationList conversations={conversations} activeId={activeConversation?.id} />
      <AtlasChatClient
        key={activeConversation?.id ?? 'new'}
        conversationId={activeConversation?.id}
        initialMessages={
          activeConversation?.messages.map((m) => ({
            id: m.id,
            role: m.role as 'USER' | 'ASSISTANT',
            content: m.content,
            toolCalls: m.toolCalls,
            createdAt: m.createdAt,
          })) ?? []
        }
      />
    </div>
  );
}

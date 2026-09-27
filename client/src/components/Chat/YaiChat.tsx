import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys, tConversationSchema } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useNavigateToConvo from '~/hooks/Conversations/useNavigateToConvo';
import { useChatContext, useChatFormContext } from '~/Providers';
import { postYaiEvent, yaiNavigationCommand } from '~/utils/yai';
import ConversationStarters from './Input/ConversationStarters';
import { useTitleGeneration } from '~/data-provider/SSE/queries';
import { hasRealTitle } from '~/utils';

function YaiBridge({ conversationId }: { conversationId?: string }) {
  const { newConversation } = useChatContext();
  const { reset } = useChatFormContext();
  const { navigateToConvo } = useNavigateToConvo();
  const queryClient = useQueryClient();
  useTitleGeneration();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const parsed = yaiNavigationCommand.safeParse(event.data);
      if (!parsed.success) return;
      reset({ text: '' });
      const id = parsed.data.conversationId;
      if (id === null) {
        newConversation();
        return;
      }
      const conversation = queryClient.getQueryData<TConversation>([QueryKeys.conversation, id]);
      navigateToConvo(
        conversation ??
          tConversationSchema.parse({
            conversationId: id,
            endpoint: null,
            createdAt: '',
            updatedAt: '',
          }),
        {
          currentConvoId: conversationId,
        },
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [newConversation, navigateToConvo, queryClient, conversationId, reset]);

  useEffect(() => {
    postYaiEvent({ type: 'yai-librechat-runtime-ready' });
  }, []);

  useEffect(() => {
    postYaiEvent({
      type: 'yai-librechat-active',
      conversationId:
        conversationId && conversationId !== Constants.NEW_CONVO ? conversationId : null,
    });
  }, [conversationId]);
  return null;
}

export default function YaiChat({
  conversationId,
  title,
  landing,
  content,
  composer,
}: {
  conversationId?: string;
  title: string;
  landing: boolean;
  content: ReactNode;
  composer: ReactNode;
}) {
  const { data: cachedConversation } = useQuery<TConversation>(
    [QueryKeys.conversation, conversationId],
    { enabled: false },
  );
  const topic = hasRealTitle(cachedConversation?.title) ? cachedConversation.title : title;
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-primary text-text-primary">
      <YaiBridge conversationId={conversationId} />
      {!landing && (
        <header className="flex h-12 shrink-0 items-center justify-center px-6 md:h-16">
          <h1 className="truncate text-sm font-medium" title={topic ?? title}>
            {topic}
          </h1>
        </header>
      )}
      {landing ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 md:justify-center md:px-8">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto md:flex-none">
            {content}
          </div>
          <div className="mx-auto w-full max-w-[720px] shrink-0 pb-[max(16px,env(safe-area-inset-bottom))] md:pb-16">
            {composer}
            <div className="hidden md:block">
              <ConversationStarters />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto flex min-h-0 w-full max-w-[768px] flex-1 flex-col overflow-hidden">
            {content}
          </div>
          <div className="mx-auto w-full max-w-[768px] shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] md:px-6 md:pb-6">
            {composer}
          </div>
        </>
      )}
    </div>
  );
}

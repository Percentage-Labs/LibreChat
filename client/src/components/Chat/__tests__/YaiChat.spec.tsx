import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { postYaiEvent } from '~/utils/yai';
import YaiChat from '../YaiChat';

const mockNewConversation = jest.fn();
const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockTitleGeneration = jest.fn();
jest.mock('~/data-provider/SSE/queries', () => ({
  useTitleGeneration: () => mockTitleGeneration(),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ newConversation: mockNewConversation }),
  useChatFormContext: () => ({ reset: mockReset }),
}));
jest.mock('~/hooks/Conversations/useNavigateToConvo', () => ({
  __esModule: true,
  default: () => ({ navigateToConvo: mockNavigate }),
}));
jest.mock('~/utils/yai', () => ({
  ...jest.requireActual('~/utils/yai'),
  postYaiEvent: jest.fn(),
}));
jest.mock('../Input/ConversationStarters', () => ({ __esModule: true, default: () => null }));

function mount(conversationId = 'chat-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  const result = render(
    <QueryClientProvider client={client}>
      <YaiChat
        conversationId={conversationId}
        title="Planning a garden"
        landing={false}
        content={<p>Messages</p>}
        composer={<button>Send</button>}
      />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

function command(
  conversationId: string | null,
  origin = window.location.origin,
  source: MessageEventSource | null = window.parent,
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin,
        data: { type: 'yai-librechat-navigate', conversationId },
      }),
    );
  });
}

test('announces readiness and active conversation and shows the topic heading', () => {
  mount();
  expect(postYaiEvent).toHaveBeenCalledWith({ type: 'yai-librechat-runtime-ready' });
  expect(postYaiEvent).toHaveBeenCalledWith({
    type: 'yai-librechat-active',
    conversationId: 'chat-1',
  });
  expect(screen.getByRole('heading', { name: 'Planning a garden' })).toBeInTheDocument();
  expect(mockTitleGeneration).toHaveBeenCalled();
});

test('ignores unrelated senders and malformed navigation commands', () => {
  mount();
  command('chat-2', 'https://unrelated.example');
  command('chat-2', window.location.origin, null);
  command('../other');
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
});

test('shows a late title fetched by the existing title queue', async () => {
  const { client } = mount();
  await act(async () => {
    client.setQueryData([QueryKeys.conversation, 'chat-1'], {
      conversationId: 'chat-1',
      title: 'Balcony herbs',
    });
  });
  expect(await screen.findByRole('heading', { name: 'Balcony herbs' })).toBeInTheDocument();
});

test('clears the draft and uses the existing hooks for every New chat and history command', () => {
  mount('new');
  command(null);
  command(null);
  command('chat-2');
  expect(mockNewConversation).toHaveBeenCalledTimes(2);
  expect(mockReset).toHaveBeenCalledTimes(3);
  expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'chat-2' }), {
    currentConvoId: 'new',
  });
});

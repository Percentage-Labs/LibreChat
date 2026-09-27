import { z } from 'zod';

export const yaiNavigationCommand = z.object({
  type: z.literal('yai-librechat-navigate'),
  conversationId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\w-]+$/)
    .nullable(),
});

export type YaiRuntimeEvent =
  | { type: 'yai-librechat-runtime-ready' }
  | { type: 'yai-librechat-active'; conversationId: string | null }
  | {
      type: 'yai-librechat-conversation';
      conversationId: string;
      title: string;
      persisted: boolean;
    };

export function postYaiEvent(event: YaiRuntimeEvent) {
  if (import.meta.env.VITE_YAI_EMBEDDED === 'true' && window.parent !== window) {
    window.parent.postMessage(event, window.location.origin);
  }
}

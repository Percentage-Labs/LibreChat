import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import type { Control } from 'react-hook-form';
import { cn, isSubmittableMessage } from '~/utils';
import { useLocalize } from '~/hooks';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
  variant?: 'default' | 'yaiLanding';
  /** Number of attached files; attachments allow sending without text */
  fileCount?: number;
};

const SubmitButton = React.memo(
  forwardRef(
    (
      props: { disabled: boolean; variant?: SendButtonProps['variant'] },
      ref: React.ForwardedRef<HTMLButtonElement>,
    ) => {
      const localize = useLocalize();
      return (
        <TooltipAnchor
          description={localize('com_nav_send_message')}
          render={
            <button
              ref={ref}
              aria-label={localize('com_nav_send_message')}
              id="send-button"
              disabled={props.disabled}
              className={cn(
                props.variant === 'yaiLanding'
                  ? 'size-8 rounded-full bg-link p-1 text-text-inverted transition-colors hover:bg-link-hover disabled:cursor-not-allowed disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:opacity-100'
                  : 'size-theme-control rounded-theme-control-round bg-text-primary p-theme-compact text-text-primary outline-offset-4 transition-all duration-theme-normal disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
              )}
              data-testid="send-button"
              type="submit"
            >
              <span className="" data-state="closed">
                <SendIcon size={24} />
              </span>
            </button>
          }
        />
      );
    },
  ),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    const canSubmit = isSubmittableMessage(data?.text, props.fileCount);
    return (
      <SubmitButton ref={ref} disabled={props.disabled || !canSubmit} variant={props.variant} />
    );
  }),
);

export default SendButton;

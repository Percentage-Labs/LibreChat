import { useEffect, useState } from 'react';
import { apiBaseUrl } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function YaiHandoff() {
  const localize = useLocalize();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const ticket = fragment.get('ticket');
    const accountId = fragment.get('accountId');
    window.history.replaceState(null, '', window.location.pathname);

    const fail = (message: string) => {
      if (cancelled) return;
      window.parent.postMessage({ type: 'yai-librechat-error', message }, window.location.origin);
      setError(message);
    };

    if (!ticket || !accountId) {
      fail(localize('com_ui_yai_handoff_invalid'));
      return () => {
        cancelled = true;
      };
    }

    void fetch(`${apiBaseUrl()}/api/auth/yai/handoff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, accountId }),
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(localize('com_ui_yai_handoff_failed'));
        if (cancelled) return;
        window.parent.postMessage({ type: 'yai-librechat-ready' }, window.location.origin);
        const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
        const base = baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
        window.location.replace(`${base}/c/new`);
      })
      .catch((reason: unknown) => {
        fail(reason instanceof Error ? reason.message : localize('com_ui_yai_handoff_failed'));
      });

    return () => {
      cancelled = true;
    };
  }, [localize]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-primary px-6 text-center text-text-primary">
      <div className="max-w-md">
        {error ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">{localize('com_ui_yai_handoff_error')}</h1>
            <p className="text-sm text-text-secondary">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-border-medium border-t-text-primary" />
            <h1 className="mb-2 text-lg font-semibold">
              {localize('com_ui_yai_handoff_signing_in')}
            </h1>
            <p className="text-sm text-text-secondary">
              {localize('com_ui_yai_handoff_connecting')}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

import * as React from 'react';
import { ShareIcon, Copy, XLogo, WhatsApp } from '@/components/icons';

const btnClass =
  'flex min-h-[40px] cursor-pointer items-center gap-[0.35rem] rounded-md border border-clr-border bg-clr-surface px-4 py-2 text-sm font-semibold text-foreground no-underline transition-colors hover:border-green hover:text-green';

export default function SharePanel({ shareState, onCopy }) {
  const inputRef = React.useRef(null);
  if (!shareState) return null;

  const loading = shareState.status === 'loading';
  const linkValue = loading ? 'Generating link…' : shareState.linkValue || '';

  return (
    <div className="mt-5 rounded-lg border border-hairline bg-cream p-5 shadow-card">
      <div className="mb-2 flex items-center gap-[0.4rem] text-[0.9rem] font-bold">
        <ShareIcon />
        Share this plan
      </div>
      <p className="mb-3 text-[0.82rem] text-muted-fg">
        Share your meal plan — friends can view it and generate their own from your link.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={linkValue}
          placeholder="Generating link…"
          className="min-w-[200px] flex-1 rounded-md border border-clr-border bg-clr-canvas px-[0.7rem] py-[0.45rem] text-[0.78rem] text-foreground"
        />
        <button type="button" onClick={() => onCopy(inputRef.current)} disabled={loading} className={btnClass + ' disabled:cursor-not-allowed disabled:opacity-60'}>
          <Copy />
          Copy
        </button>
        <a
          href={shareState.twitterHref || '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!shareState.twitterHref}
          className={btnClass}
        >
          <XLogo />
          X
        </a>
        <a
          href={shareState.whatsappHref || '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!shareState.whatsappHref}
          className={btnClass}
        >
          <WhatsApp />
          WhatsApp
        </a>
      </div>
    </div>
  );
}

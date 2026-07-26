import * as React from 'react';
import Modal from './Modal';
import { stripeUrls } from '@/lib/stripe';

const FEATURES_LIMIT = [
  'Unlimited AI meal plans',
  'Full recipes with steps & ingredients',
  'Advanced macros & nutrition tracking',
  'Priority AI coaching'
];
const FEATURES_PDF = [
  'Download meal plan as PDF',
  'Grocery list as PDF',
  'Unlimited meal plans',
  'Unlimited AI coaching'
];

const ctaClass =
  'block rounded-lg bg-green px-4 py-3.5 text-center text-[0.95rem] font-bold text-white no-underline transition-colors duration-150 hover:bg-green-deep';

function FeatureList({ items }) {
  return (
    <div className="mb-4 rounded-md bg-clr-canvas p-3 text-left text-sm text-foreground">
      {items.map((f) => <div key={f}>{f}</div>)}
    </div>
  );
}

/* Two-stage abandonment paywall (free-limit hit) + single-stage PDF-export
 * gate + the abandon-email capture that follows "I'll stay on free" — ported
 * from legacy showUpgradePrompt()/showAbandonmentOffer()/
 * showAbandonEmailCapture()/submitAbandonEmail(). */
export default function UpgradeModal({ upgradeFlow, lsUserEmail }) {
  const { prompt, closePrompt, showAbandonmentOffer, closeUpgradeAndShowBanner,
    onLimitCtaClick, onAbandonmentCtaClick, onPdfCtaClick,
    abandonEmail, submitAbandonEmail, skipAbandonEmail } = upgradeFlow;

  const [email, setEmail] = React.useState(lsUserEmail || '');
  const [abandonInput, setAbandonInput] = React.useState('');
  const [abandonInvalid, setAbandonInvalid] = React.useState(false);

  const handleAbandonSubmit = async () => {
    const { ok } = await submitAbandonEmail(abandonInput);
    setAbandonInvalid(!ok);
  };

  return (
    <>
      {/* The free-limit two-stage prompt has no close affordance in the legacy
          page — the user must click through to the abandonment offer. The
          PDF-export gate does have a close button + backdrop-click, ported
          from its distinct legacy markup. */}
      <Modal
        open={!!prompt}
        onClose={prompt?.kind === 'pdf' ? closePrompt : undefined}
        closeOnBackdrop={prompt?.kind === 'pdf'}
        showClose={prompt?.kind === 'pdf'}
        maxWidth="420px"
        labelledBy="upgrade-modal-title"
      >
        {prompt?.kind === 'limit' && prompt.stage === 1 && (
          <div className="text-center">
            <h2 id="upgrade-modal-title" className="mb-2 text-xl font-extrabold text-foreground">You've hit your free limit</h2>
            <p className="mb-4 text-sm leading-relaxed text-foreground">
              Upgrade to Pro for <strong>unlimited meal plans</strong>, full recipes, and AI coaching — all for just <strong>$8/month</strong>. Your grocery list is waiting.
            </p>
            <FeatureList items={FEATURES_LIMIT} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="mb-3 w-full rounded-md border border-clr-border px-3 py-2.5 text-sm"
            />
            <a href={stripeUrls.monthly} onClick={() => onLimitCtaClick(email)} target="_blank" rel="noopener" className={ctaClass + ' mb-2'}>
              Upgrade to Pro — $8/month →
            </a>
            <div className="mt-1 flex justify-center gap-4">
              <a href="/upgrade.html" className="text-sm text-muted-fg underline">See all Pro features</a>
              <button onClick={showAbandonmentOffer} className="cursor-pointer border-none bg-transparent text-sm text-muted-fg underline">No thanks</button>
            </div>
          </div>
        )}

        {prompt?.kind === 'limit' && prompt.stage === 2 && (
          <div className="text-center">
            <div className="mb-2 inline-block rounded-full bg-error px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-white">
              Limited Offer
            </div>
            <h2 className="mb-2 text-xl font-black text-foreground">Wait — 50% off, just for you</h2>
            <p className="mb-4 text-sm leading-relaxed text-foreground">
              Get your <strong>first month of Pro for $4</strong>, then $8/month. Cancel any time.
            </p>
            <a href={stripeUrls.discount} onClick={() => onAbandonmentCtaClick(email)} target="_blank" rel="noopener" className={ctaClass + ' mb-2 !bg-error hover:!bg-error/90'}>
              Get Pro for $4 this month →
            </a>
            <button onClick={closeUpgradeAndShowBanner} className="mt-1 cursor-pointer border-none bg-transparent text-sm text-muted-fg underline">
              I'll stay on free
            </button>
          </div>
        )}

        {prompt?.kind === 'pdf' && (
          <div className="text-center">
            <h2 className="mb-2 text-xl font-extrabold text-foreground">PDF Export is a Pro feature</h2>
            <p className="mb-4 text-sm leading-relaxed text-muted-fg">
              Upgrade to Pro to download your meal plan and grocery list as a clean PDF you can print or share.
            </p>
            <FeatureList items={FEATURES_PDF} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="mb-3 w-full rounded-md border border-clr-border px-3 py-2.5 text-sm"
            />
            <a href={stripeUrls.monthly} onClick={() => onPdfCtaClick(email)} target="_blank" rel="noopener" className={ctaClass + ' mb-2'}>
              Upgrade to Pro — $8/month →
            </a>
            <a href="/upgrade.html" className="text-sm text-muted-fg underline">Learn more about Pro</a>
          </div>
        )}
      </Modal>

      <Modal open={!!abandonEmail} onClose={skipAbandonEmail} maxWidth="380px" labelledBy="abandon-email-title">
        {!abandonEmail?.submitted ? (
          <div className="text-center">
            <h3 id="abandon-email-title" className="mb-2 text-lg font-extrabold text-foreground">One last thing</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-fg">
              Enter your email and we'll remind you when your free plans reset next month — and let you know about exclusive subscriber offers.
            </p>
            <input
              type="email"
              value={abandonInput}
              onChange={(e) => setAbandonInput(e.target.value)}
              placeholder="your@email.com"
              className={'mb-3 w-full rounded-md border px-3 py-2.5 text-sm ' + (abandonInvalid ? 'border-error' : 'border-clr-border')}
            />
            <button onClick={handleAbandonSubmit} className={ctaClass + ' mb-2 w-full cursor-pointer'}>
              Remind me when plans reset →
            </button>
            <button onClick={skipAbandonEmail} className="cursor-pointer border-none bg-transparent text-sm text-muted-fg underline">
              No thanks
            </button>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-lg font-extrabold text-foreground">You're on the list!</h3>
            <p className="mt-2 text-sm text-muted-fg">We'll be in touch with exclusive offers. Your free plans reset in 30 days.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

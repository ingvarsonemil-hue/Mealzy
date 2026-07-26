import * as React from 'react';
import { track } from '@/lib/api';
import { X } from '@/components/icons';
import { btnOutline, btnSm } from '../buttonStyles';

export function RetentionBanner({ banner, onDismiss }) {
  if (!banner) return null;
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-md bg-green px-5 py-4 text-sm text-white">
      <span>{banner.text}</span>
      <button onClick={onDismiss} className="whitespace-nowrap rounded-md bg-white/20 px-3 py-1.5 text-sm text-white">
        Dismiss
      </button>
    </div>
  );
}

export function SundayNudgeBanner({ show, onGenerate, onDismiss }) {
  if (!show) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[hsl(270,60%,80%)] bg-[hsl(270,60%,96%)] px-5 py-4 text-[hsl(270,60%,25%)] dark:border-[hsl(270,50%,35%)] dark:bg-[hsl(270,35%,18%)] dark:text-[hsl(270,60%,88%)]">
      <div>
        <strong>New week starting!</strong>{' '}
        <span className="text-sm">Your meal plan is waiting — generate now and your grocery list will be ready before Monday.</span>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <button onClick={() => { onGenerate(); onDismiss(); }} className="rounded-md bg-[hsl(270,60%,55%)] px-3.5 py-1.5 text-sm font-bold text-white">
          Generate Now →
        </button>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-[hsl(270,60%,35%)]">
          <X width="16" height="16" />
        </button>
      </div>
    </div>
  );
}

export function ZeroPlansBanner({ show, onDismiss }) {
  if (!show) return null;
  return (
    <div className="sticky top-0 z-[200] mb-6 flex items-center justify-center gap-3 rounded-md bg-error px-4 py-2.5 text-center text-sm font-semibold text-white">
      <span>You have 0 free plans left this month.</span>
      <a
        href="/upgrade.html"
        onClick={() => track('upgrade_click', { source: 'zero_plans_banner' })}
        className="whitespace-nowrap rounded-full bg-white/25 px-3 py-1 font-bold text-white no-underline"
      >
        See Pro — 7 days free →
      </a>
      <button onClick={onDismiss} aria-label="Dismiss" className="ml-1 text-white/70">
        <X width="16" height="16" />
      </button>
    </div>
  );
}

export function ReferralBanner({ show, link, onDismiss, showToast }) {
  const [copied, setCopied] = React.useState(false);

  if (!show) return null;

  const copyLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      showToast('Referral link copied!', 'success');
      track('share_click', { type: 'referral_copy' });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => showToast('Could not copy — please copy manually', 'error'));
  };

  const shareWhatsApp = () => {
    const msg = encodeURIComponent(`I've been using Mealzy to plan my meals with AI — it's brilliant! Try it free: ${link}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
    track('share_click', { type: 'whatsapp' });
  };

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
    track('share_click', { type: 'facebook' });
  };

  const copyMessage = () => {
    const msg = `I've been using Mealzy to plan my meals with AI — it's brilliant! Try it free: ${link}`;
    navigator.clipboard.writeText(msg)
      .then(() => { showToast('Message copied!', 'success'); track('share_click', { type: 'copy_message' }); })
      .catch(() => showToast('Could not copy', 'error'));
  };

  return (
    <div className="mb-6 rounded-lg border border-hairline bg-cream p-5 shadow-card">
      <div className="mb-1.5 font-bold text-foreground">Get 1 extra free plan for every friend you invite</div>
      <p className="mb-3 text-sm text-muted-fg">
        Share your link. When a friend signs up, you both unlock an extra free plan this month.
      </p>
      <div className="mb-3 flex items-center gap-2">
        <input readOnly value={link} className="flex-1 rounded-md border border-clr-border bg-clr-canvas px-3 py-2 text-xs text-foreground" />
        <button onClick={copyLink} className={btnOutline + ' ' + btnSm}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={shareWhatsApp} className="rounded-md bg-[#25D366] px-3.5 py-1.5 text-sm font-semibold text-white">WhatsApp</button>
        <button onClick={shareFacebook} className="rounded-md bg-[#1877F2] px-3.5 py-1.5 text-sm font-semibold text-white">Facebook</button>
        <button onClick={copyMessage} className={btnOutline + ' ' + btnSm}>Copy message</button>
      </div>
    </div>
  );
}

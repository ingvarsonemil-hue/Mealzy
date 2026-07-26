import * as React from 'react';
import { track } from '@/lib/api';
import { recordAppEmailLead } from '@/lib/auth';

const ABANDON_SHOWN_KEY = 'mealzy_abandon_email_shown';

/* Two-stage abandonment paywall + PDF-export gate, ported from legacy
 * showUpgradePrompt()/showAbandonmentOffer()/closeUpgradeAndShowBanner()/
 * showAbandonEmailCapture()/submitAbandonEmail()/showZeroPlansBanner(). */
export default function useUpgradeFlow({ lsUserEmail }) {
  const [prompt, setPrompt] = React.useState(null); // { kind: 'limit'|'pdf', stage: 1|2, message }
  const [abandonEmail, setAbandonEmail] = React.useState(null); // { submitted }
  const [zeroPlansBanner, setZeroPlansBanner] = React.useState(false);

  const openLimitPrompt = (message) => {
    track('upgrade_prompt_shown', { source: 'limit' });
    setPrompt({ kind: 'limit', stage: 1, message });
  };

  const openPdfPrompt = () => {
    track('pdf_export_blocked', { source: 'print_btn' });
    setPrompt({ kind: 'pdf' });
  };

  const showAbandonmentOffer = () => {
    track('abandonment_offer_shown', {});
    setPrompt((p) => (p ? { ...p, stage: 2 } : p));
  };

  const showZeroPlansBanner = () => setZeroPlansBanner(true);

  const showAbandonEmailCapture = () => {
    localStorage.setItem(ABANDON_SHOWN_KEY, '1');
    if (lsUserEmail) {
      recordAppEmailLead(lsUserEmail, { source: 'abandonment', discount: true }).catch(() => {});
      showZeroPlansBanner();
      return;
    }
    setAbandonEmail({ submitted: false });
  };

  const closeUpgradeAndShowBanner = () => {
    setPrompt(null);
    if (!localStorage.getItem(ABANDON_SHOWN_KEY)) {
      showAbandonEmailCapture();
    } else {
      showZeroPlansBanner();
    }
  };

  const closePrompt = () => setPrompt(null);

  const captureUpgradeEmail = (email, source = 'upgrade_prompt') => {
    const trimmed = (email || '').trim();
    if (trimmed) recordAppEmailLead(trimmed, { source }).catch(() => {});
  };

  const onLimitCtaClick = (email) => {
    captureUpgradeEmail(email, 'upgrade_prompt');
    track('upgrade_click', { source: 'stripe_button' });
  };

  const onAbandonmentCtaClick = (email) => {
    captureUpgradeEmail(email, 'upgrade_prompt');
    track('abandonment_offer_click', {});
  };

  const onPdfCtaClick = (email) => {
    const trimmed = (email || '').trim();
    if (trimmed) recordAppEmailLead(trimmed, { source: 'pdf_upgrade' }).catch(() => {});
    track('upgrade_click', { source: 'pdf_btn' });
    closePrompt();
  };

  const submitAbandonEmail = async (email) => {
    const trimmed = (email || '').trim();
    if (!trimmed || !trimmed.includes('@')) return { ok: false };
    try {
      await recordAppEmailLead(trimmed, { source: 'abandonment', discount: true });
    } catch (e) { /* non-blocking */ }
    track('abandon_email_captured', { source: 'abandon_flow' });
    setAbandonEmail({ submitted: true });
    setTimeout(() => {
      setAbandonEmail(null);
      showZeroPlansBanner();
    }, 2500);
    return { ok: true };
  };

  const skipAbandonEmail = () => {
    setAbandonEmail(null);
    showZeroPlansBanner();
  };

  return {
    prompt,
    openLimitPrompt,
    openPdfPrompt,
    showAbandonmentOffer,
    closeUpgradeAndShowBanner,
    closePrompt,
    onLimitCtaClick,
    onAbandonmentCtaClick,
    onPdfCtaClick,
    abandonEmail,
    submitAbandonEmail,
    skipAbandonEmail,
    zeroPlansBanner,
    dismissZeroPlansBanner: () => setZeroPlansBanner(false)
  };
}

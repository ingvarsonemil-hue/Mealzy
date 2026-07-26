import * as React from 'react';
import { checkNps, submitNps } from '@/lib/dashboard';

const SNOOZE_KEY = 'mealzy_nps_snoozed';

/* Ported from legacy checkNpsPrompt()/showNpsModal()/submitNps(). */
export default function useNps() {
  const [open, setOpen] = React.useState(false);
  const [score, setScore] = React.useState(null);
  const [comment, setComment] = React.useState('');

  const check = React.useCallback(async () => {
    const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;
    const show = await checkNps();
    if (show) setTimeout(() => setOpen(true), 5000);
  }, []);

  const close = (snooze) => {
    setOpen(false);
    if (snooze) {
      const threeDays = Date.now() + 3 * 24 * 60 * 60 * 1000;
      localStorage.setItem(SNOOZE_KEY, String(threeDays));
    }
  };

  const submit = async () => {
    if (score === null) return;
    await submitNps({ score, comment: comment.trim() });
    close(false);
  };

  return { open, score, setScore, comment, setComment, check, close, submit };
}

import * as React from 'react';
import Modal from './Modal';
import { X } from '@/components/icons';
import { btnPrimary, btnGhost, iconBtn } from '../buttonStyles';
import { cn } from '@/lib/utils';

const SCORES = Array.from({ length: 11 }, (_, i) => i); // 0-10

export default function NpsModal({ nps }) {
  const { open, score, setScore, comment, setComment, close, submit } = nps;

  return (
    <Modal open={open} onClose={() => close(true)} maxWidth="480px" labelledBy="nps-modal-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="nps-modal-title" className="text-lg font-bold text-foreground">Quick question</h2>
        <button onClick={() => close(true)} aria-label="Close" className={iconBtn}><X width="16" height="16" /></button>
      </div>
      <p className="mb-5 text-sm text-muted-fg">
        How likely are you to recommend Mealzy to a friend or family member?
      </p>
      <div className="mb-2 flex flex-wrap justify-center gap-1.5">
        {SCORES.map((n) => (
          <button
            key={n}
            onClick={() => setScore(n)}
            className={cn(
              'h-[2.4rem] w-[2.4rem] rounded-md border-[1.5px] text-sm font-semibold transition-colors duration-150',
              score === n ? 'border-green bg-green text-white' : 'border-clr-border bg-clr-canvas text-foreground hover:border-green hover:text-green'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mb-5 flex justify-between text-xs text-muted-fg">
        <span>Not likely</span><span>Very likely</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What's the main reason? (optional)"
        rows="2"
        className="mb-5 w-full resize-none rounded-md border border-clr-border bg-clr-surface px-3 py-2.5 text-sm text-foreground focus:border-green focus:outline-none"
      />
      <div className="flex items-center justify-end gap-3">
        <button onClick={() => close(true)} className={btnGhost}>Maybe later</button>
        <button onClick={submit} disabled={score === null} className={btnPrimary}>Submit</button>
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { beaconState, postState } from '@/lib/client';

const HEADER_OFFSET = 72;
const SAVE_DELAY_MS = 1500;
const WORDS_PER_MINUTE = 230;
const FINISHED_AT = 0.97;

/**
 * Tracks how far through the reader-view article you are, saves it as you go (and when you
 * leave), and on return scrolls you back to the paragraph you were on.
 */
export function ProgressTracker({
  articleId,
  initialBlock,
  initialProgress,
  wordCount,
  finished: initiallyFinished,
}: {
  articleId: number;
  initialBlock: number | null;
  initialProgress: number;
  wordCount: number;
  finished: boolean;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [finished, setFinished] = useState(initiallyFinished);
  const [toast, setToast] = useState<string | null>(null);
  const state = useRef({ progress: initialProgress, block: initialBlock ?? 0, saved: initialProgress, savedBlock: initialBlock ?? 0, dirty: false });

  useEffect(() => {
    const body = document.getElementById('reader-body');
    if (!body) return;
    const blocks = [...body.querySelectorAll<HTMLElement>('[data-block]')];
    void postState(articleId, { opened: true });

    // Resume where the reader left off.
    if (!initiallyFinished && initialBlock && initialBlock > 0) {
      const target = blocks.find((b) => Number(b.dataset.block) === initialBlock);
      if (target) {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET });
        setToast(`Picked up where you left off (${Math.round(initialProgress * 100)}%)`);
      }
    }

    const save = (useBeacon = false) => {
      const s = state.current;
      if (!s.dirty) return;
      if (s.progress <= s.saved && s.block === s.savedBlock) return;
      const patch = { progress: s.progress, block: s.block, progressSource: 'reader' as const };
      if (useBeacon) beaconState(articleId, patch);
      else void postState(articleId, patch);
      s.saved = Math.max(s.saved, s.progress);
      s.savedBlock = s.block;
    };

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      frame = 0;
      const rect = body.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / rect.height));
      const top = blocks.find((b) => b.getBoundingClientRect().bottom > HEADER_OFFSET);
      const s = state.current;
      s.progress = p;
      s.block = top ? Number(top.dataset.block) : s.block;
      s.dirty = true;
      setProgress(p);
      if (p >= FINISHED_AT) setFinished(true);
      clearTimeout(timer);
      timer = setTimeout(() => save(), SAVE_DELAY_MS);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save(true);
    };
    const onPageHide = () => save(true);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      save(true);
    };
  }, [articleId, initialBlock, initialProgress, initiallyFinished]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const minutesLeft = Math.max(1, Math.round((wordCount * (1 - progress)) / WORDS_PER_MINUTE));
  return (
    <>
      <div className="reader-progress" role="progressbar" aria-label="Reading progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="reader-sticky" aria-live="polite">
        <span className="btn" style={{ cursor: 'default', background: 'var(--surface)' }}>
          {finished ? '✓ Finished' : `${Math.round(progress * 100)}% · ${minutesLeft} min left`}
        </span>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            type="button"
            onClick={async () => {
              setToast(null);
              state.current = { progress: 0, block: 0, saved: 0, savedBlock: 0, dirty: false };
              await postState(articleId, { read: false });
              window.scrollTo({ top: 0 });
            }}
          >
            Start over
          </button>
        </div>
      )}
    </>
  );
}

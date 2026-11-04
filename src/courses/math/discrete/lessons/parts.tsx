import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '../../../../components/ui';
import type { Palette } from '../../../../lib/theme';

/** The three part colours of this course, resolved for canvas drawing (re-read when the theme changes). */
export function useMathColors(P: Palette): [string, string, string] {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;
    return [get('--c-math-1', P.bad), get('--c-math-2', P.neg), get('--c-math-3', P.hl)];
  }, [P]);
}

export interface ProofStep {
  /** What we write down at this step. */
  claim: ReactNode;
  /** Why it follows. */
  why?: ReactNode;
  /** Marks the step where the contradiction appears or the proof closes. */
  tone?: 'goal' | 'bad' | 'good';
}

export function useProof(n: number, start = 0) {
  const [i, setI] = useState(start);
  const last = n - 1;
  return {
    i: Math.min(i, last),
    total: n,
    go: (k: number) => setI(Math.max(0, Math.min(last, k))),
  };
}

/** A proof written out line by line; lines after the current one are hidden until the reader steps on. */
export function ProofSteps({ steps, p, label }: { steps: ProofStep[]; p: ReturnType<typeof useProof>; label: string }) {
  return (
    <div className="dm-proof">
      <ol className="dm-proof-list" aria-label={label} aria-live="polite">
        {steps.map((s, k) => (
          <li key={k} data-state={k < p.i ? 'past' : k === p.i ? 'now' : 'later'} data-tone={s.tone}>
            <span className="dm-proof-no" aria-hidden="true">
              {k + 1}
            </span>
            <div className="dm-proof-body">
              <div className="dm-proof-claim">{s.claim}</div>
              {s.why && <div className="dm-proof-why">{s.why}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="btn-row" role="group" aria-label="증명 단계 이동">
        <Button small onClick={() => p.go(0)} disabled={p.i === 0}>
          처음
        </Button>
        <Button small onClick={() => p.go(p.i - 1)} disabled={p.i === 0}>
          ◀ 이전 줄
        </Button>
        <Button small primary onClick={() => p.go(p.i + 1)} disabled={p.i >= p.total - 1}>
          다음 줄 ▶
        </Button>
        <Button small onClick={() => p.go(p.total - 1)} disabled={p.i >= p.total - 1}>
          전부 보기
        </Button>
        <span className="dm-proof-count mono">
          {p.i + 1} / {p.total}
        </span>
      </div>
    </div>
  );
}

/** A small "참 / 거짓" badge. */
export function TV({ v, short }: { v: boolean; short?: boolean }) {
  return (
    <span className="dm-tv" data-v={v ? 't' : 'f'}>
      {short ? (v ? 'T' : 'F') : v ? '참' : '거짓'}
    </span>
  );
}

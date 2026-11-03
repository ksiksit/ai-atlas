import { useEffect, useRef, useState } from 'react';
import { Button, Slider } from '../../components/ui';
import { useAnimationFrame } from '../../lib/canvas';

/**
 * Playback over a precomputed list of algorithm steps (frames).
 * `i` is the current frame; while playing it advances `speed` frames per second.
 */
export interface Stepper {
  i: number;
  total: number;
  playing: boolean;
  speed: number;
  setSpeed: (v: number) => void;
  go: (i: number) => void;
  step: (d: number) => void;
  toggle: () => void;
  reset: () => void;
}

/**
 * `resetKey` identifies the run: when it (or `total`) changes, playback starts over.
 * With `atEnd`, a new run is shown finished (its last frame) until the reader presses play.
 * With `autoPlay`, a new run (after the first) starts playing from its first frame by itself.
 */
export function useStepper(total: number, initialSpeed = 6, resetKey: unknown = null, atEnd = false, autoPlay = false): Stepper {
  const [i, setI] = useState(atEnd ? Math.max(0, total - 1) : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const acc = useRef(0);
  const prevRun = useRef<[number, unknown] | null>(null);
  const last = Math.max(0, total - 1);

  // a new run (different input or algorithm) starts from the first frame
  useEffect(() => {
    // compare with the previous run rather than "first effect" so StrictMode's double effect doesn't autoplay on mount
    const p = prevRun.current;
    const play = autoPlay && p !== null && (p[0] !== total || p[1] !== resetKey) && last > 0;
    prevRun.current = [total, resetKey];
    setI(atEnd && !play ? last : 0);
    setPlaying(play);
    acc.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, resetKey]);

  useAnimationFrame((dt) => {
    acc.current += dt * speed;
    const n = Math.floor(acc.current);
    if (!n) return;
    acc.current -= n;
    setI((x) => {
      const next = Math.max(0, Math.min(last, x + n));
      if (next >= last) setPlaying(false);
      return next;
    });
  }, playing);

  return {
    i: Math.min(i, last),
    total,
    playing,
    speed,
    setSpeed,
    go: (k) => {
      setPlaying(false);
      setI(Math.max(0, Math.min(last, k)));
    },
    step: (d) => {
      setPlaying(false);
      setI((x) => Math.max(0, Math.min(last, x + d)));
    },
    toggle: () => {
      if (!playing && i >= last) setI(0);
      acc.current = 0;
      setPlaying((p) => !p);
    },
    reset: () => {
      setPlaying(false);
      setI(0);
    },
  };
}

/** Transport buttons and a speed slider for a Stepper. */
export function StepControls({ s, maxSpeed = 40, id }: { s: Stepper; maxSpeed?: number; id: string }) {
  return (
    <>
      <div className="btn-row" role="group" aria-label="단계 이동">
        <Button small onClick={() => s.go(0)} title="처음으로" label="처음으로">
          ⏮
        </Button>
        <Button small onClick={() => s.step(-1)} title="한 단계 뒤로" label="한 단계 뒤로" disabled={s.i === 0}>
          ◀
        </Button>
        <Button small primary onClick={s.toggle} title={s.playing ? '일시정지' : '재생'} label={s.playing ? '일시정지' : '재생'}>
          {s.playing ? '❚❚ 멈춤' : '▶ 재생'}
        </Button>
        <Button small onClick={() => s.step(1)} title="한 단계 앞으로" label="한 단계 앞으로" disabled={s.i >= s.total - 1}>
          ▶
        </Button>
        <Button small onClick={() => s.go(s.total - 1)} title="끝으로" label="끝으로">
          ⏭
        </Button>
      </div>
      <Slider id={id} label="속도 (단계/초)" value={s.speed} min={1} max={maxSpeed} step={1} onChange={s.setSpeed} />
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
        단계 <span className="mono">{s.i + 1}</span> / <span className="mono">{s.total}</span>
      </div>
    </>
  );
}

/** Deterministic shuffled array 1..n (Fisher–Yates with a seeded PRNG). */
export function shuffled(n: number, r: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Human-friendly duration for a number of seconds, from nanoseconds up to "longer than the universe". */
export function humanTime(sec: number): string {
  if (!isFinite(sec) || sec > 4.4e17) return '우주의 나이보다 김';
  // 1.2, 12, 120: one decimal below 10, whole numbers above
  const num = (v: number) => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
  if (sec < 1e-6) return `${Math.max(1, Math.round(sec * 1e9))}ns`;
  if (sec < 1e-3) return `${num(sec * 1e6)}µs`;
  if (sec < 1) return `${num(sec * 1e3)}ms`;
  if (sec < 60) return `${num(sec)}초`;
  if (sec < 3600) return `${Math.round(sec / 60)}분`;
  if (sec < 86400) return `${Math.round(sec / 3600)}시간`;
  if (sec < 86400 * 365) return `${Math.round(sec / 86400)}일`;
  const years = sec / (86400 * 365);
  if (years < 1e4) return `${Math.round(years).toLocaleString('ko-KR')}년`;
  return `약 ${years.toExponential(1).replace('e+', '×10^')}년`;
}

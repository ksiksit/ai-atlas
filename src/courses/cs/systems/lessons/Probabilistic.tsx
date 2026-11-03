import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { HLL_NS, bloomBits, bloomFpr, bloomPositions, fprSample, hllEstimate, hllRun, measureFpr, rmsRelError, type HllRun } from './saving';
import '../../algorithms/lessons/algorithms.css';
import './saving.css';

/* ─────────────── Figure 1: a Bloom filter you can poke ─────────────── */

const FRUITS = ['banana', 'cherry', 'grape', 'lemon', 'mango'];
const hashColors = (P: Palette) => [P.pos, P.neg, P.good, P.stats2];
const HASH_VARS = ['var(--pos)', 'var(--neg)', 'var(--good)', 'var(--c-stats-2)'];

interface Focus {
  word: string;
  mode: 'add' | 'query';
}

function BloomFigure() {
  const P = usePalette();
  const [m, setM] = useState(32);
  const [k, setK] = useState(3);
  const [words, setWords] = useState<string[]>(FRUITS.slice(0, 3));
  const [focus, setFocus] = useState<Focus | null>({ word: 'grape', mode: 'add' });
  const [typed, setTyped] = useState('peach');
  const bits = useMemo(() => bloomBits(words, k, m), [words, k, m]);
  const pos = focus ? bloomPositions(focus.word, k, m) : [];
  const ones = bits.reduce((a, b) => a + b, 0);
  const allSet = pos.length > 0 && pos.every((p) => bits[p]);
  const member = focus ? words.includes(focus.word) : false;
  const word = typed.trim();

  const add = (w: string) => {
    if (!w) return;
    setWords((ws) => (ws.includes(w) ? ws : [...ws, w]));
    setFocus({ word: w, mode: 'add' });
  };
  const query = (w: string) => w && setFocus({ word: w, mode: 'query' });
  const showFalsePositive = () => {
    setM(32);
    setK(3);
    setWords(FRUITS);
    setTyped('fig');
    setFocus({ word: 'fig', mode: 'query' });
  };

  const cols = 16;
  const rows = m / cols;
  const [cw, setCw] = useState(600); // canvas width decides the cell size and therefore the height
  const cellOf = (w: number) => Math.min(36, (w - 20) / cols);
  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w }) => {
      const cell = cellOf(w);
      const gx = (w - cell * cols) / 2;
      const top = 70;
      const rowGap = 12;
      const cx = (p: number) => gx + (p % cols) * cell;
      const cy = (p: number) => top + Math.floor(p / cols) * (cell + rowGap);
      const hc = hashColors(P);

      // the word and its k hash lines
      if (focus) {
        ctx.font = `700 14px ${P.fontMono}`;
        const tw = Math.min(w - 20, ctx.measureText(focus.word).width + 20);
        const bx = (w - tw) / 2;
        pos.forEach((p, i) => {
          ctx.strokeStyle = hc[i];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(w / 2 + (i - (k - 1) / 2) * 8, 34);
          ctx.lineTo(cx(p) + cell / 2, cy(p));
          ctx.stroke();
        });
        ctx.fillStyle = focus.mode === 'add' ? P.surface : P.surface2;
        ctx.fillRect(bx, 8, tw, 26);
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(focus.mode === 'query' ? [4, 3] : []);
        ctx.strokeRect(bx + 0.5, 8.5, tw - 1, 25);
        ctx.setLineDash([]);
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(focus.word, w / 2, 21.5, tw - 12);
      }
      // the bit array
      for (let p = 0; p < m; p++) {
        const x = cx(p);
        const y = cy(p);
        ctx.fillStyle = bits[p] ? P.ink2 : P.surface;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        ctx.fillStyle = bits[p] ? P.surface : P.ink3;
        ctx.font = `${cell < 22 ? 10 : 12}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bits[p] ? '1' : '0', x + cell / 2, y + cell / 2 + 1);
      }
      // highlight the k positions (a 0 under a query is the proof of absence)
      pos.forEach((p, i) => {
        const miss = focus?.mode === 'query' && !bits[p];
        ctx.strokeStyle = miss ? P.bad : hc[i];
        ctx.lineWidth = 3;
        ctx.strokeRect(cx(p) + 1.5, cy(p) + 1.5, cell - 3, cell - 3);
      });
      // index labels at the start of every row
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c += 4) ctx.fillText(String(r * cols + c), gx + c * cell + 1, top + r * (cell + rowGap) + cell + 1);
      }
    },
    [P, bits, focus, k, m],
    { height: Math.round(70 + rows * (cellOf(cw) + 12) + 4) },
  );
  useEffect(() => {
    if (size.w !== cw) setCw(size.w);
  }, [size.w, cw]);

  let verdict: 'yes' | 'no' | 'fp' | undefined;
  let text = '단어를 넣거나 조회해 보세요.';
  if (focus) {
    const list = pos.join(', ');
    if (focus.mode === 'add') {
      verdict = undefined;
      text = `넣음: ${focus.word} → 비트 ${list} 자리를 1로 켭니다.`;
    } else if (!allSet) {
      verdict = 'no';
      const zero = pos.filter((p) => !bits[p]);
      text = `조회: ${focus.word} → 비트 ${zero.join(', ')} 자리가 0. 넣은 적이 있다면 이 비트가 켜져 있어야 하므로 "확실히 없음"입니다.`;
    } else if (member) {
      verdict = 'yes';
      text = `조회: ${focus.word} → 비트 ${list} 모두 1. "아마 있음"이고, 실제로 넣은 단어입니다.`;
    } else {
      verdict = 'fp';
      text = `조회: ${focus.word} → 비트 ${list} 모두 1. "아마 있음"이라고 답하지만 넣은 적이 없습니다. 다른 단어들이 켜 둔 비트가 우연히 겹친 거짓 양성입니다.`;
    }
  }

  return (
    <Figure
      no={1}
      title="블룸 필터: 비트 배열 하나와 해시 함수 k개"
      hint="단어를 넣고 조회해 보세요"
      caption={<>단어 하나를 해시 함수 k개에 넣어 나온 k개의 비트 위치를 색깔 선으로 이었습니다. 넣을 때는 그 비트들을 1로 켜고, 조회할 때는 그 비트들이 모두 1인지만 봅니다. 하나라도 0이면(빨간 테두리) 넣은 적이 없다고 확신할 수 있습니다. 비트 수나 해시 개수를 바꾸면 모든 단어의 위치가 달라지므로, 넣은 단어들로 비트 배열을 처음부터 다시 만듭니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`비트 ${m}개 중 ${ones}개가 1인 블룸 필터${focus ? `. ${focus.word}의 비트 위치: ${pos.join(', ')}` : ''}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="word-list" aria-hidden="true">
            <span className="ds-label">넣은 단어 (누르면 그 단어의 위치를 봅니다)</span>
            {words.length ? (
              words.map((w0) => (
                <button key={w0} type="button" tabIndex={-1} className="word-chip" data-cur={focus?.word === w0 || undefined} onClick={() => setFocus({ word: w0, mode: 'add' })}>
                  {w0}
                </button>
              ))
            ) : (
              <span className="ds-empty">비어 있음</span>
            )}
          </div>
          <div className="bloom-verdict" data-v={verdict} aria-live="polite">
            {text}
          </div>
        </div>
        <div className="controls">
          <Seg label="비트 수 m" value={m} onChange={setM} options={[32, 64].map((v) => ({ value: v, label: String(v) }))} />
          <Seg label="해시 함수 개수 k" value={k} onChange={setK} options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="bf-word">
              <span>단어 (20자까지)</span>
            </label>
            <div className="key-form">
              <input id="bf-word" className="text-input mono" type="text" value={typed} maxLength={20} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              <Button small primary onClick={() => add(word)} disabled={!word}>
                넣기
              </Button>
              <Button small onClick={() => query(word)} disabled={!word}>
                조회
              </Button>
            </div>
          </div>
          <div className="btn-row">
            <Button small onClick={() => FRUITS.forEach(add)}>
              과일 5개 넣기
            </Button>
            <Button small onClick={showFalsePositive}>
              거짓 양성 보기
            </Button>
            <Button
              small
              onClick={() => {
                setWords([]);
                setFocus(null);
              }}
            >
              비우기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="넣은 단어 n" value={`${words.length}개`} />
            <Readout label="1인 비트" value={`${ones} / ${m}`} />
            <Readout label="오탐률 공식" value={`${(bloomFpr(k, words.length, m) * 100).toFixed(1)}%`} color="var(--bad)" />
            <Readout label="(1의 비율)ᵏ" value={`${(Math.pow(ones / m, k) * 100).toFixed(1)}%`} />
          </div>
        </div>
      </div>
      <Legend items={HASH_VARS.slice(0, k).map((c, i) => ({ color: c, label: `해시 ${i + 1}`, shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 2: false-positive rate against k ─────────────── */

const FPR_N = 2000;
const FPR_Q = 50000;
const K_MAX = 12;
const Y_MIN = -5; // log10 of the smallest rate drawn

function FprFigure() {
  const P = usePalette();
  const [b, setB] = useState(10);
  const [k, setK] = useState(3);
  const sample = useMemo(() => fprSample(FPR_N, FPR_Q), []);
  const m = Math.round(b * FPR_N);
  const measured = useMemo(() => Array.from({ length: K_MAX }, (_, i) => measureFpr(sample, i + 1, m)), [sample, m]);
  const kOpt = b * Math.LN2;
  const kBest = Math.max(1, Math.round(kOpt));
  const th = bloomFpr(k, FPR_N, m);
  const pct = (v: number) => (v >= 0.01 ? `${(v * 100).toFixed(1)}%` : v >= 0.0001 ? `${(v * 100).toFixed(2)}%` : `${(v * 100).toFixed(3)}%`);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0.5, xMax: K_MAX + 0.5, yMin: Y_MIN, yMax: 0, pad: { l: 50, r: 12, t: 14, b: 30 } });
      plot.grid({ xStep: 1, yStep: 1, labels: false, axes: false });
      plot.frame();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const yl = ['100%', '10%', '1%', '0.1%', '0.01%', '0.001%'];
      for (let e = 0; e >= Y_MIN; e--) ctx.fillText(yl[-e], plot.X(0.5) - 5, plot.Y(e));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 1; x <= K_MAX; x++) ctx.fillText(String(x), plot.X(x), plot.Y(Y_MIN) + 5);
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink2;
      ctx.fillText('해시 개수 k', plot.X(K_MAX + 0.5) - 4, plot.Y(Y_MIN) - 4);

      // optimum k = (m/n) ln 2
      if (kOpt <= K_MAX + 0.5) {
        plot.line(kOpt, Y_MIN, kOpt, 0, alpha(P.good, 0.9), 1.5, [5, 4]);
        plot.text(`최적 k ≈ ${kOpt.toFixed(1)}`, kOpt, -0.3, P.good, { align: kOpt > K_MAX - 2 ? 'right' : 'left', dx: kOpt > K_MAX - 2 ? -6 : 6, bg: P.surface, font: `600 12px ${P.fontBody}` });
      }
      plot.fn((x) => Math.log10(bloomFpr(x, FPR_N, m)), P.neg, 2.2, { from: 1, to: K_MAX });
      plot.line(k, Y_MIN, k, 0, alpha(P.ink, 0.35), 1.2, [3, 4]);
      measured.forEach((v, i) => {
        if (v > 0) plot.dot(i + 1, Math.log10(v), i + 1 === k ? 6 : 4, P.pos, P.surface, 1.5);
      });
    },
    [P, m, measured, k, kOpt],
    { aspect: 1.7, maxHeight: 330, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="해시 함수는 몇 개가 좋을까"
      hint="원소당 비트 수와 k를 바꿔 보세요"
      caption={<>원소 {FPR_N.toLocaleString('ko-KR')}개를 넣은 블룸 필터에, 넣지 않은 원소 {FPR_Q.toLocaleString('ko-KR')}개를 조회해 거짓 양성 비율을 쟀습니다(주황 점). 파란 곡선은 공식 <M>{'(1 - e^{-kn/m})^k'}</M>입니다. 세로축은 로그 눈금이라 한 칸이 열 배입니다. 측정값이 0이면 점을 그리지 않습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`원소당 ${b}비트일 때 해시 개수에 따른 오탐률. k = ${k}에서 공식 ${pct(th)}, 측정 ${pct(measured[k - 1])}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="fpr-b" label="원소당 비트 수 m/n" value={b} min={2} max={20} step={1} onChange={setB} />
          <Slider id="fpr-k" label="해시 개수 k" value={k} min={1} max={K_MAX} step={1} onChange={setK} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="공식" value={pct(th)} color="var(--neg)" />
            <Readout label="측정" value={pct(measured[k - 1])} color="var(--pos)" />
            <Readout label="이 비트 수의 최적 k" value={`${kBest} → ${pct(bloomFpr(kBest, FPR_N, m))}`} color="var(--good)" />
            <Readout label="원소 1억 개면" value={`${Math.round((b * 1e8) / 8 / 1e6)}MB`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '공식', shape: 'ln' },
          { color: 'var(--pos)', label: '측정', shape: 'dot' },
          { color: 'var(--good)', label: '최적 k = (m/n)·ln 2', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: HyperLogLog ─────────────── */

const HLL_MS = [16, 64, 256, 1024, 4096];
const HLL_SEEDS = 12;
// runs per register count, filled a seed at a time so no single step blocks the page for long
const hllCache = new Map<number, HllRun[]>();

function useHllRuns(m: number): HllRun[] {
  const [, bump] = useState(0);
  useEffect(() => {
    let runs = hllCache.get(m);
    if (!runs) hllCache.set(m, (runs = []));
    let t = 0;
    const step = () => {
      const r = hllCache.get(m)!;
      if (r.length >= HLL_SEEDS) return;
      r.push(hllRun(m, r.length, r.length === 0));
      bump((x) => x + 1);
      t = window.setTimeout(step, 0);
    };
    step();
    return () => window.clearTimeout(t);
  }, [m]);
  return hllCache.get(m) ?? [];
}

const fmtN = (n: number) => n.toLocaleString('ko-KR');

function HllFigure() {
  const P = usePalette();
  const [m, setM] = useState(256);
  const [c, setC] = useState(40); // checkpoint index: n = HLL_NS[c]
  const runs = useHllRuns(m);
  const n = HLL_NS[c];
  const sigma = 1.04 / Math.sqrt(m);
  const first = runs[0];
  const regs = first?.snaps?.[c];
  const est = first ? first.est[c] : NaN;
  const info = regs ? hllEstimate(regs) : null;
  const regMax = first?.snaps ? Math.max(...first.snaps[HLL_NS.length - 1]) : 1;

  const regCanvas = useCanvas2D(
    (ctx, { w, h }) => {
      if (!regs) return;
      const show = Math.min(m, Math.floor((w - 16) / 3));
      const bw = (w - 16) / show;
      const base = h - 16;
      const top = 22;
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(show < m ? `레지스터 ${fmtN(m)}개 중 앞의 ${show}개 (값 = 앞쪽 0의 개수 + 1의 최댓값)` : `레지스터 ${m}개 (값 = 앞쪽 0의 개수 + 1의 최댓값)`, 8, 10);
      for (let j = 0; j < show; j++) {
        const v = regs[j];
        const bh = ((base - top) * v) / regMax;
        ctx.fillStyle = v === 0 ? P.line : P.neg;
        ctx.fillRect(8 + j * bw + (bw > 4 ? 1 : 0), base - Math.max(1, bh), Math.max(1, bw - (bw > 4 ? 2 : 0.5)), Math.max(1, bh));
        if (bw >= 16) {
          ctx.fillStyle = P.ink2;
          ctx.font = `10px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(v), 8 + (j + 0.5) * bw, base - bh - 2);
        }
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(8, base + 0.5);
      ctx.lineTo(w - 8, base + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`0이 아닌 레지스터 ${m - (info?.zeros ?? 0)}개 · 가장 큰 값 ${Math.max(...regs)}`, 8, base + 3);
    },
    [P, regs, m, regMax, info],
    { height: 130 },
  );

  const range = Math.max(0.04, 3 * sigma);
  const errCanvas = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 1, xMax: 6, yMin: -range * 100, yMax: range * 100, pad: { l: 44, r: 12, t: 12, b: 30 } });
      // where the small-range correction is in charge (roughly n ≤ 2.5 m)
      const lc = Math.log10(2.5 * m);
      ctx.fillStyle = alpha(P.ink, 0.05);
      ctx.fillRect(plot.X(1), plot.Y(range * 100), plot.X(Math.min(6, lc)) - plot.X(1), plot.ph);
      plot.grid({ xStep: 1, yStep: niceY(range * 100), labels: false });
      plot.frame();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xl = ['10', '100', '1천', '1만', '10만', '100만'];
      for (let e = 1; e <= 6; e++) {
        ctx.textAlign = e === 1 ? 'left' : e === 6 ? 'right' : 'center';
        ctx.fillText(xl[e - 1], plot.X(e), plot.Y(-range * 100) + 5);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const ys = niceY(range * 100);
      for (let y = -Math.floor((range * 100) / ys) * ys; y <= range * 100 + 1e-9; y += ys) ctx.fillText(`${y > 0 ? '+' : ''}${Math.round(y)}%`, plot.X(1) - 5, plot.Y(y));
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.ink3;
      if (lc > 1.3) ctx.fillText('선형 카운팅', plot.X(1) + 4, plot.Y(range * 100) + 4);
      // ±1.04/√m
      plot.line(1, sigma * 100, 6, sigma * 100, P.good, 1.5, [6, 4]);
      plot.line(1, -sigma * 100, 6, -sigma * 100, P.good, 1.5, [6, 4]);
      plot.line(1, 0, 6, 0, P.lineStrong, 1);
      const xs = HLL_NS.map((v) => Math.log10(v));
      const curve = (r: HllRun, col: string, lw: number) => {
        plot.clip();
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        r.est.forEach((e, i) => {
          const y = ((e - HLL_NS[i]) / HLL_NS[i]) * 100;
          if (i === 0) ctx.moveTo(plot.X(xs[i]), plot.Y(y));
          else ctx.lineTo(plot.X(xs[i]), plot.Y(y));
        });
        ctx.stroke();
        plot.unclip();
      };
      runs.slice(1).forEach((r) => curve(r, alpha(P.ink, 0.22), 1.2));
      if (runs[0]) curve(runs[0], P.pos, 2.4);
      plot.line(xs[c], -range * 100, xs[c], range * 100, alpha(P.ink, 0.4), 1.2, [4, 4]);
      runs.forEach((r, i) => {
        const y = Math.max(-range, Math.min(range, (r.est[c] - n) / n)) * 100;
        plot.dot(xs[c], y, i === 0 ? 5 : 3, i === 0 ? P.pos : alpha(P.ink, 0.5), i === 0 ? P.surface : undefined, 1.5);
      });
    },
    [P, runs, runs.length, c, m, range, sigma, n],
    { aspect: 1.9, maxHeight: 300, minHeight: 220 },
  );

  const rms = runs.length >= 2 ? rmsRelError(runs, c) : NaN;
  return (
    <Figure
      no={3}
      title="HyperLogLog로 고유한 값 세기"
      hint="고유한 원소 수와 레지스터 수를 바꿔 보세요"
      caption={<>서로 다른 원소 n개를 해시해 레지스터 m개에 흘려 넣었습니다. 위는 첫 번째 실행의 레지스터 값, 아래는 n에 따른 추정 오차입니다. 주황 선이 첫 번째 실행이고, 회색 선은 해시의 시드만 바꾼 나머지 {HLL_SEEDS - 1}번의 실행입니다. 초록 점선이 이론상 표준 오차 <M>{'\\pm 1.04/\\sqrt{m}'}</M>이고, 회색 바탕은 0인 레지스터가 많아 선형 카운팅으로 세는 구간입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={regCanvas.wrapRef} className="canvas-box" role="img" aria-label={`레지스터 ${m}개의 값`}>
            <canvas ref={regCanvas.canvasRef} />
          </div>
          <div ref={errCanvas.wrapRef} className="canvas-box" role="img" aria-label={`고유한 원소 수에 따른 상대 오차. 실행 ${runs.length}번`}>
            <canvas ref={errCanvas.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="hll-n" label="고유한 원소 수 n" value={c} min={0} max={HLL_NS.length - 1} step={1} onChange={setC} format={(i) => fmtN(HLL_NS[i])} />
          <Seg label="레지스터 수 m" value={m} onChange={setM} options={HLL_MS.map((v) => ({ value: v, label: v >= 1024 ? `${v / 1024}K` : String(v) }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실제 n" value={fmtN(n)} />
            <Readout label="추정 (주황)" value={isNaN(est) ? '…' : fmtN(Math.round(est))} color="var(--pos)" />
            <Readout label="오차 (주황)" value={isNaN(est) ? '…' : `${est >= n ? '+' : '−'}${Math.abs(((est - n) / n) * 100).toFixed(1)}%`} />
            <Readout label="추정 방식" value={info ? (info.linear ? '선형 카운팅' : 'HLL 공식') : '…'} />
            <Readout label="이론 표준 오차" value={`${(sigma * 100).toFixed(1)}%`} color="var(--good)" />
            <Readout label={`실행 ${runs.length}번의 RMS 오차`} value={isNaN(rms) ? '…' : `${(rms * 100).toFixed(1)}%`} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>메모리: 레지스터당 5비트 × {fmtN(m)}개 = {fmtN((m * 5) / 8)}바이트. n을 아무리 늘려도 그대로입니다.</div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '첫 번째 실행', shape: 'ln' },
          { color: 'color-mix(in srgb, var(--ink) 30%, transparent)', label: '다른 시드', shape: 'ln' },
          { color: 'var(--good)', label: '± 1.04/√m', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

function niceY(range: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50]) if (range / s <= 4) return s;
  return 100;
}

/* ─────────────── Lesson ─────────────── */

export default function Probabilistic() {
  return (
    <>
      <h2>"이 URL을 본 적 있나?"</h2>
      <p>
        웹 크롤러는 링크를 따라가다가 이미 방문한 페이지를 또 내려받지 않으려고, 새 URL을 만날 때마다 "본 적 있나?"를 묻습니다. 보안 서비스는 들어오는 URL이 위험 목록에 있는지, 회원 가입 화면은 아이디가 이미 쓰이는지 묻습니다. 정확한 답은 <a href="#cs-algorithms/search-hash">해시 테이블</a>로 쉽게 얻습니다. 문제는 크기입니다. URL이 평균 50바이트라면 1억 개를 문자열 그대로 담는 데만 5GB가 들고, 해시 테이블의 빈 칸과 포인터까지 더하면 그보다 훨씬 커집니다.
      </p>
      <p>
        그런데 많은 경우 답이 조금 틀려도 괜찮습니다. 크롤러가 100번에 1번꼴로 처음 보는 URL을 "본 적 있다"며 건너뛰어도 큰일이 나지 않는다면, 메모리를 수십 분의 일로 줄일 수 있습니다. 이렇게 정확성을 조금 내주고 메모리와 시간을 크게 아끼는 자료구조를 <T en="probabilistic data structure">확률적 자료구조</T>라고 합니다. 이 장에서는 "있나?"에 답하는 블룸 필터와 "몇 개나?"에 답하는 HyperLogLog를 봅니다.
      </p>

      <h2>블룸 필터</h2>
      <p>
        <T en="Bloom filter">블룸 필터</T>는 1970년 블룸(Burton Bloom)이 제안한 구조로, 비트 m개짜리 배열 하나와 해시 함수 k개로 이루어집니다. 처음에는 모든 비트가 0입니다.
      </p>
      <ul>
        <li>
          <strong>넣기</strong>: 원소를 해시 함수 k개에 넣어 위치 k개를 얻고, 그 비트들을 모두 1로 켭니다.
        </li>
        <li>
          <strong>조회</strong>: 같은 위치 k개를 계산해, 모두 1이면 "아마 있음", 하나라도 0이면 "확실히 없음"이라고 답합니다.
        </li>
      </ul>
      <p>
        원소 자체는 어디에도 저장하지 않습니다. 비트만 켜 둘 뿐이므로 원소가 긴 문자열이어도 차지하는 공간은 같습니다.
      </p>
      <BloomFigure />
      <p>
        "거짓 양성 보기"를 누르면 과일 다섯 개를 넣은 필터에 넣은 적 없는 <code>fig</code>를 조회합니다. fig의 세 위치는 다른 과일들이 이미 켜 둔 비트와 우연히 겹쳐서, 필터는 "아마 있음"이라고 답합니다. 이것이 <T en="false positive">거짓 양성</T>(오탐)입니다. 반대로 <T en="false negative">거짓 음성</T>은 절대 생기지 않습니다. 넣은 원소의 비트는 켜진 채로 남고, 비트를 끄는 연산이 없기 때문입니다. 그래서 블룸 필터의 "없음"은 믿을 수 있고, "있음"은 "확인해 볼 가치가 있음"이라는 뜻입니다.
      </p>
      <Callout kind="note">
        같은 이유로 블룸 필터에서는 원소를 지울 수 없습니다. 비트 하나를 끄면 그 비트를 함께 쓰던 다른 원소까지 "없음"이 되어 거짓 음성이 생깁니다. 삭제가 필요하면 비트 대신 작은 카운터를 두는 <T en="counting Bloom filter">카운팅 블룸 필터</T> 같은 변형을 씁니다.
      </Callout>

      <h2>오탐률과 해시 개수</h2>
      <p>
        원소 n개를 넣은 뒤 특정 비트가 아직 0일 확률을 구해 봅시다. 해시 한 번이 그 비트를 비켜 갈 확률이 <M>{'1 - 1/m'}</M>이고 해시는 모두 kn번 했으므로, 0으로 남을 확률은 <M>{'(1 - 1/m)^{kn} \\approx e^{-kn/m}'}</M>입니다. 넣지 않은 원소의 k개 위치가 모두 1일 확률, 곧 오탐률은 다음과 같습니다.
      </p>
      <MB note="m: 비트 수, n: 넣은 원소 수, k: 해시 함수 개수">{'p \\approx \\left(1 - e^{-kn/m}\\right)^k'}</MB>
      <p>
        k에는 맞바꿈이 있습니다. k가 크면 조회할 때 확인하는 비트가 많아져 우연히 모두 1일 확률이 줄지만, 넣을 때 켜는 비트도 많아져 배열이 빨리 1로 찹니다. 계산해 보면 <M>{'k = (m/n) \\ln 2'}</M>일 때 오탐률이 가장 낮고, 이때 비트의 약 절반이 1입니다.
      </p>
      <FprFigure />
      <p>
        원소당 10비트에서 k = 1이면 오탐률이 9.5%지만, 최적에 가까운 k = 7이면 0.82%로 떨어집니다. k를 12까지 늘리면 오히려 1.4%로 다시 올라갑니다. 최적 k를 쓴다고 두고 원하는 오탐률 p에 필요한 비트 수를 거꾸로 풀면 이렇습니다.
      </p>
      <MB>{'\\frac{m}{n} = \\frac{-\\ln p}{(\\ln 2)^2} \\approx 1.44 \\log_2 \\frac{1}{p}'}</MB>
      <p>
        오탐률 1%에는 원소당 약 9.6비트와 해시 7개, 0.1%에는 약 14.4비트와 해시 10개가 필요합니다. 원소당 4.8비트를 더할 때마다 오탐률이 열 배씩 줄어드는 셈입니다. 원소가 몇 바이트이든 상관없다는 점이 중요합니다. 앞의 URL 1억 개를 오탐률 1%로 담으면 약 120MB로, 문자열만 담아도 드는 5GB의 약 40분의 1입니다.
      </p>
      <p>
        해시 함수를 k개나 따로 만들 필요는 없습니다. 해시 두 개 <M>{'h_1, h_2'}</M>로 <M>{'g_i = h_1 + i \\cdot h_2 \\pmod m'}</M>을 만들어 써도 오탐률이 거의 그대로라는 것이 알려져 있고(이중 해싱), 아래 코드와 그림들도 이 방법을 씁니다. 그림 2의 측정값이 공식과 잘 맞는 것을 보면 실제로 충분합니다.
      </p>
      <Code label="블룸 필터">{`
function fnv1a(s) {                       // 32비트 FNV-1a 해시
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function fmix32(h) {                      // MurmurHash3의 마무리 섞기
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

class BloomFilter {
  constructor(m, k) {
    this.m = m;                           // 비트 수
    this.k = k;                           // 해시 개수
    this.bits = new Uint8Array(Math.ceil(m / 8)); // 바이트 하나에 비트 8개
  }
  #positions(item) {
    const a = fnv1a(item);
    const h1 = fmix32(a), h2 = fmix32(a ^ 0x9e3779b9) | 1;
    const out = [];
    for (let i = 0; i < this.k; i++) out.push(((h1 + Math.imul(i, h2)) >>> 0) % this.m);
    return out;
  }
  add(item) {
    for (const p of this.#positions(item)) this.bits[p >> 3] |= 1 << (p & 7);
  }
  mightContain(item) {                    // false면 확실히 없음
    return this.#positions(item).every((p) => this.bits[p >> 3] & (1 << (p & 7)));
  }
}

// 원소 n개를 오탐률 p로 담을 크기 고르기
function bloomFor(n, p) {
  const m = Math.ceil(-n * Math.log(p) / Math.LN2 ** 2);
  const k = Math.max(1, Math.round(m / n * Math.LN2));
  return new BloomFilter(m, k);
}
// bloomFor(100000, 0.01) → 비트 958,506개(약 120KB), 해시 7개`}</Code>

      <h2>블룸 필터가 쓰이는 곳</h2>
      <p>
        블룸 필터는 "없음"을 싸게 확인해서 <strong>비싼 확인을 건너뛰는</strong> 데 쓰입니다. 대표적인 예가 LevelDB, RocksDB, Cassandra 같은 <T en="log-structured merge tree">LSM 트리</T> 기반 저장소입니다. 이들은 데이터를 정렬된 파일(SSTable) 여러 개에 나눠 디스크에 쓰므로, 키 하나를 찾으려면 여러 파일을 뒤져야 할 수 있습니다. 그래서 파일마다 그 파일에 든 키들의 블룸 필터를 두어 메모리에서 먼저 확인하고(LevelDB에서는 설정으로 켭니다), 필터가 "확실히 없음"이라고 하는 파일은 디스크에서 읽지 않습니다. 오탐이 나면 디스크 읽기 한 번을 헛되이 할 뿐이고 답이 틀리지는 않습니다. 없는 키를 찾는 요청이 많을수록 효과가 큽니다.
      </p>
      <p>
        이 구조가 일반적인 패턴입니다. 블룸 필터를 정확한 저장소 앞에 두면, 정답은 저장소가 보장하고 블룸 필터는 헛걸음만 줄입니다. 오탐률은 정답의 정확도가 아니라 헛걸음의 비율을 정합니다.
      </p>

      <h2>HyperLogLog: 몇 개인지 세기</h2>
      <p>
        이번에는 다른 질문입니다. "오늘 우리 사이트를 방문한 <strong>서로 다른</strong> 사용자는 몇 명인가?" 방문 기록이 수십억 건이어도 정확히 세려면 지금까지 본 사용자를 모두 기억해야 하므로, 메모리가 고유한 사용자 수에 비례합니다. 페이지마다, 날짜마다, 나라마다 따로 세야 한다면 더 늘어납니다.
      </p>
      <p>
        <T>HyperLogLog</T>(HLL)는 고유한 값의 개수를 몇 KB로 어림합니다. 핵심 아이디어는 동전 던지기입니다. 좋은 해시 함수의 출력 비트는 공정한 동전을 던진 결과처럼 보입니다. 해시값이 0으로 시작할 확률은 1/2, 00으로 시작할 확률은 1/4, 앞에 0이 r개 이상 이어질 확률은 <M>{'1/2^r'}</M>입니다. 그러니 서로 다른 값들의 해시 중 앞쪽 0이 가장 길게 이어진 것이 r개라면, 대략 <M>{'2^r'}</M>개쯤의 서로 다른 값을 본 것입니다. 같은 값은 해시도 같아서 몇 번이 다시 나와도 최댓값이 바뀌지 않으므로, 중복은 저절로 무시됩니다. 기억할 것은 최댓값 하나뿐입니다.
      </p>
      <p>
        하지만 최댓값 하나는 너무 들쭉날쭉합니다. 2의 거듭제곱으로만 답할 수 있고, 운 좋은 해시 하나가 추정을 몇 배로 부풀립니다. 그래서 해시의 앞 p비트로 원소를 레지스터 <M>{'m = 2^p'}</M>개 중 하나에 나눠 보내고, 레지스터마다 "나머지 비트의 앞쪽 0의 개수 + 1"의 최댓값 <M>{'M_j'}</M>를 기록합니다. 레지스터 하나는 원소를 약 n/m개씩 보므로, 추정값들을 평균 내서 m을 곱합니다. 튀는 값의 영향을 줄이려고 <T en="harmonic mean">조화 평균</T>을 씁니다.
      </p>
      <MB note="α_m: m에 따른 보정 상수(m ≥ 128이면 약 0.7213/(1 + 1.079/m))">{'E = \\alpha_m \\, m^2 \\Big/ \\sum_{j=1}^{m} 2^{-M_j}'}</MB>
      <p>
        n이 m에 비해 작을 때는 비어 있는 레지스터가 많아 이 공식이 크게 빗나갑니다. 그래서 추정값이 <M>{'2.5m'}</M> 이하이고 0인 레지스터가 V개 남아 있으면, 빈 칸의 비율로 세는 <T en="linear counting">선형 카운팅</T> <M>{'m \\ln(m/V)'}</M>을 대신 씁니다. 이것이 2007년 플라졸레(Philippe Flajolet) 등이 낸 표준 HyperLogLog입니다.
      </p>
      <HllFigure />
      <p>
        n을 키워 보세요. 레지스터 값은 n이 열 배가 될 때마다 평균 3 남짓(<M>{'\\log_2 10 \\approx 3.3'}</M>)씩 커지지만, 추정의 상대 오차가 퍼진 폭은 n과 거의 상관없이 일정합니다. 그 폭을 정하는 것은 레지스터 수 m이고, 표준 오차가 약 <M>{'1.04/\\sqrt{m}'}</M>입니다. 직접 재 보니 m = 256에서 시드를 바꿔 200번 실행했을 때 n ≥ 10m 구간의 RMS 오차가 평균 6.5%로 이론값 6.5%와 같았고, m = 4,096에서는 1.6% 안팎이었습니다. 다만 선형 카운팅에서 공식으로 넘어가는 n ≈ 2.5m 근처에서는 오차가 잠깐 커집니다. 실무에서 쓰는 HyperLogLog++ 같은 개선판은 이 구간을 보정합니다.
      </p>
      <p>
        오차를 절반으로 줄이려면 레지스터가 네 배 필요합니다. 그래도 레지스터 하나는 작은 정수 하나라서 아주 쌉니다. Redis의 <code>PFADD</code>/<code>PFCOUNT</code>는 레지스터 16,384개를 6비트씩 써서 키 하나에 12KB를 쓰고, 표준 오차는 0.81%입니다(<M>{'1.04/\\sqrt{16384} = 1.04/128'}</M>). 12KB로 수십억까지의 고유한 값을 1% 안쪽 오차로 셉니다.
      </p>
      <Callout kind="intuition">
        HyperLogLog의 또 다른 장점은 합치기가 쉽다는 것입니다. 두 HLL을 레지스터마다 최댓값을 취해 합치면, 두 집합의 합집합을 센 것과 똑같은 결과가 나옵니다. 서버마다, 시간대마다 따로 센 HLL을 나중에 모아 "이번 주 전체의 고유 방문자"를 구할 수 있습니다. Redis의 <code>PFMERGE</code>가 이 연산입니다. 정확한 개수는 이렇게 합칠 수 없습니다. 두 날의 방문자 수를 더하면 이틀 다 온 사람을 두 번 세게 됩니다.
      </Callout>
      <Code label="HyperLogLog (32비트 해시)">{`
class HyperLogLog {
  constructor(p = 14) {
    this.p = p;
    this.m = 1 << p;                      // 레지스터 수 (p = 14면 16,384개)
    this.reg = new Uint8Array(this.m);
  }
  add(item) {
    const h = fmix32(fnv1a(item));        // 32비트 해시
    const j = h >>> (32 - this.p);        // 앞 p비트: 레지스터 번호
    const w = (h << this.p) >>> 0;        // 나머지 비트
    const rank = w === 0 ? 32 - this.p + 1 : Math.clz32(w) + 1; // 앞쪽 0의 개수 + 1
    if (rank > this.reg[j]) this.reg[j] = rank;
  }
  count() {
    const m = this.m;
    let sum = 0, zeros = 0;
    for (const r of this.reg) {
      sum += 2 ** -r;
      if (r === 0) zeros++;
    }
    const alpha = 0.7213 / (1 + 1.079 / m);    // m ≥ 128일 때
    const est = alpha * m * m / sum;
    if (est <= 2.5 * m && zeros > 0) return m * Math.log(m / zeros); // 선형 카운팅
    return est;
  }
  merge(other) {                          // 합집합: 레지스터마다 최댓값
    for (let j = 0; j < this.m; j++) this.reg[j] = Math.max(this.reg[j], other.reg[j]);
  }
}`}</Code>
      <p>
        이 코드로 서로 다른 문자열 100만 개(중복을 섞어 넣어도 됩니다)를 세어 보니 1,002,791로 오차가 0.28%였습니다. 32비트 해시는 수억 개를 넘어서면 해시끼리 겹치기 시작해 정확도가 떨어지므로, Redis를 비롯한 실제 구현은 64비트 해시를 씁니다.
      </p>

      <Callout kind="key">
        블룸 필터는 비트 m개와 해시 k개로 "확실히 없음" 또는 "아마 있음"이라고 답합니다. 거짓 음성은 없고, 거짓 양성은 <M>{'(1-e^{-kn/m})^k'}</M>이며, 최적 <M>{'k = (m/n)\\ln 2'}</M>에서 원소당 약 9.6비트면 1%입니다. HyperLogLog는 해시의 앞쪽 0의 개수로 고유한 값의 개수를 어림하고, 레지스터 m개를 조화 평균해 표준 오차를 <M>{'1.04/\\sqrt{m}'}</M>로 줄입니다. 둘 다 메모리가 원소의 크기와 상관없고, 정답을 보장하는 저장소 앞에 두거나 정확할 필요가 없는 통계에 씁니다.
      </Callout>
      <Quiz
        q="레지스터 1,024개짜리 HyperLogLog의 표준 오차는 약 3.25%다. 이를 약 1.6%로 줄이려면 레지스터가 몇 개 필요한가?"
        options={['2,048개', '4,096개', '10,240개', '원소 수에 따라 다르다']}
        answer={1}
        explain={<>표준 오차는 <M>{'1.04/\\sqrt{m}'}</M>이므로 절반으로 줄이려면 <M>{'\\sqrt{m}'}</M>이 두 배, 곧 m이 네 배가 되어야 합니다. 1,024 × 4 = 4,096개이고, <M>{'1.04/\\sqrt{4096} = 1.04/64 \\approx 1.6\\%'}</M>입니다. 그림 3에서 확인할 수 있듯 오차의 폭은 세는 원소 수와 거의 상관이 없습니다.</>}
      />
    </>
  );
}

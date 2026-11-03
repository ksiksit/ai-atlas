import { useMemo, useState, type CSSProperties } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { rng } from '../../../../lib/math';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import {
  CHARS,
  CHAR_H,
  END,
  GT_D,
  MEMORY_RESULTS,
  MEM_BATCH,
  MEM_FORGET_BIAS,
  MEM_H,
  MEM_ITERS,
  MEM_KS,
  bigram,
  charRnn,
  forward,
  lstmGradCurve,
  memorySample,
  memoryText,
  paramCount,
  rnnGradCurves,
  sci,
  wordPairs,
  WORDS,
} from './sequence';
import './sequence.css';

const chLabel = (c: string) => (c === END ? '끝' : c);

/* ─────────────── Figure 1: unrolling a character RNN ─────────────── */

function topK(p: ArrayLike<number>, k: number, min = 0.005): { i: number; p: number }[] {
  return Array.from(p, (v, i) => ({ i, p: v }))
    .filter((e) => e.p >= min)
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

function DistBars({ title, p, truth, color }: { title: string; p: ArrayLike<number>; truth: number; color: string }) {
  return (
    <div className="seq-dist">
      <h4>{title}</h4>
      {topK(p, 5).map((e) => (
        <div key={e.i} className="seq-bar" data-truth={e.i === truth || undefined}>
          <span className="ch">{chLabel(CHARS[e.i])}</span>
          <span className="track">
            <span className="fill" style={{ width: `${e.p * 100}%`, background: color }} />
          </span>
          <span className="pct">{pct(e.p)}</span>
        </div>
      ))}
    </div>
  );
}

function UnrollFigure() {
  const P = usePalette();
  const [word, setWord] = useState('hello');
  const net = useMemo(() => charRnn(), []);
  const bi = useMemo(() => bigram(), []);
  const { xs, ys } = useMemo(() => wordPairs(word), [word]);
  const tr = useMemo(() => forward(net, xs), [net, xs]);
  const s = useStepper(xs.length, 2, word);
  const t = Math.max(0, s.i); // useStepper can briefly report −1 when the first animation frame has a negative dt
  const p = tr.p[t]!;
  const top = topK(p, 3);
  const nParams = paramCount(net);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const T = xs.length;
      const x0 = 50;
      const colW = (w - x0 - 6) / T;
      const cx = (k: number) => x0 + colW * (k + 0.5);
      const cs = Math.max(8, Math.min(15, colW * 0.17, (h - 120) / 4));
      const outY = 24;
      const inY = h - 22;
      const hidY = (outY + 34 + inY - 16) / 2;
      const bw = 3 * cs;
      const bh = 4 * cs;
      const box = (x: number, y: number, txt: string, fill: string, stroke: string, ink: string, bold = true) => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(x - 15, y - 13, 30, 26, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = `${bold ? 700 : 500} ${txt.length > 1 ? 12 : 15}px ${txt.length > 1 ? P.fontBody : P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x, y + 1);
      };
      const tag = (x: number, y: number, txt: string, color: string) => {
        ctx.font = `600 11px ${P.fontMono}`;
        const tw = ctx.measureText(txt).width + 6;
        ctx.fillStyle = P.surface;
        ctx.fillRect(x - tw / 2, y - 8, tw, 16);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x, y);
      };
      const cells = (x: number, vals: Float64Array | null, fade: number) => {
        for (let j = 0; j < CHAR_H; j++) {
          const r = j % 4;
          const c = Math.floor(j / 4);
          const px = x - bw / 2 + c * cs;
          const py = hidY - bh / 2 + r * cs;
          const v = vals ? vals[j] : 0;
          ctx.fillStyle = P.surface;
          ctx.fillRect(px, py, cs, cs);
          if (vals) {
            ctx.fillStyle = alpha(v >= 0 ? P.pos : P.neg, Math.min(1, Math.abs(v)) * 0.95 * fade);
            ctx.fillRect(px, py, cs, cs);
          }
          ctx.strokeStyle = alpha(P.lineStrong, fade);
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
        }
      };

      // the current column
      ctx.fillStyle = alpha(P.hl, 0.16);
      ctx.fillRect(cx(t) - colW / 2 + 2, 2, colW - 4, h - 4);

      // h0 = 0
      cells(x0 / 2, new Float64Array(CHAR_H), 1);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('h₀=0', x0 / 2, hidY + bh / 2 + 6);

      for (let k = 0; k < T; k++) {
        const done = k <= t;
        const fade = done ? 1 : 0.3;
        const x = cx(k);
        // W: from the previous hidden state
        const fromX = (k === 0 ? x0 / 2 : cx(k - 1)) + bw / 2 + 2;
        drawArrow(ctx, fromX, hidY, x - bw / 2 - 3, hidY, alpha(P.accent, done ? 0.9 : 0.3), 1.6, 6);
        tag((fromX + x - bw / 2) / 2, hidY - 12, 'W', alpha(P.accent, done ? 1 : 0.4));
        // U: input → hidden; V: hidden → output
        drawArrow(ctx, x, inY - 14, x, hidY + bh / 2 + 3, alpha(P.ink3, fade), 1.4, 5);
        drawArrow(ctx, x, hidY - bh / 2 - 3, x, outY + 24, alpha(P.ink3, fade), 1.4, 5);
        if (colW > 46) {
          tag(x + 11, (inY - 14 + hidY + bh / 2) / 2, 'U', alpha(P.ink2, fade));
          tag(x + 11, (hidY - bh / 2 + outY + 24) / 2, 'V', alpha(P.ink2, fade));
        }
        cells(x, done ? tr.h[k] : null, fade);
        box(x, inY, word[k], k === t ? P.hl : P.surface2, alpha(P.ink, fade), k === t ? '#1a1a1a' : alpha(P.ink, fade));
        if (done) {
          const best = topK(tr.p[k]!, 1)[0];
          const sure = best.p > 0.9;
          box(x, outY, chLabel(CHARS[best.i]), sure ? alpha(P.good, 0.18) : P.surface, sure ? P.good : P.lineStrong, P.ink);
          ctx.fillStyle = P.ink2;
          ctx.font = `11px ${P.fontMono}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          if (colW > 72) ctx.fillText(pct(best.p), x + 18, outY + 1);
        } else {
          box(x, outY, '?', P.surface, alpha(P.line, 1), P.ink3, false);
        }
      }
    },
    [P, xs, tr, t, word],
    { aspect: 1.9, maxHeight: 300, minHeight: 250 },
  );

  return (
    <Figure
      no={1}
      title="시간 펼치기: 같은 가중치로 한 글자씩 읽기"
      hint="단어를 고르고 한 단계씩 넘겨 보세요"
      caption={
        <>
          아래 칸이 입력 글자, 가운데 12칸이 은닉 상태 <M>{'h_t'}</M>(주황은 양수, 파랑은 음수, 진할수록 크기가 큼), 위 칸이 다음 글자 예측 1위입니다. 모든 열의 W, U, V는 같은 행렬입니다. 모델은 hello, help, held, jelly, yellow, yelp 여섯 단어로 미리 학습해 둔 결과입니다. 학습 데이터에서 여섯 단어가 똑같이 자주 나오므로, 예를 들어 hel 다음은 l, p, d가 각각 1/3이 정답 분포입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="seq-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`문자 RNN이 ${word}를 읽는 모습, ${t + 1}번째 글자까지`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="seq-note" aria-live="polite">
            읽은 부분 <strong className="mono">{word.slice(0, t + 1)}</strong> → 다음 글자 예측 {top.map((e) => `${chLabel(CHARS[e.i])} ${pct(e.p)}`).join(' · ')} (실제 다음: {chLabel(CHARS[ys[t]])})
          </div>
          <div className="seq-dists">
            <DistBars title="RNN: 지금까지 읽은 전부" p={p} truth={ys[t]} color="var(--accent)" />
            <DistBars title={`바로 앞 글자 ${word[t]}만 보는 모델`} p={bi[xs[t]]} truth={ys[t]} color="var(--ink-3)" />
          </div>
        </div>
        <div className="controls">
          <div className="seq-tight">
            <Seg label="단어" value={word} onChange={setWord} options={WORDS.map((w) => ({ value: w, label: w }))} />
          </div>
          <StepControls s={s} id="rnn-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="은닉 상태 크기" value={CHAR_H} />
            <Readout label="가중치 수" value={`${nParams}개`} />
          </div>
          <p className="seq-sub">가중치 수는 단어 길이와 상관없습니다. 몇 글자를 읽든 같은 W, U, V를 되풀이해 씁니다.</p>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '은닉 값 > 0', shape: 'sq' },
          { color: 'var(--neg)', label: '은닉 값 < 0', shape: 'sq' },
          { color: 'var(--good)', label: '90% 넘게 확신한 예측', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: gradients through time ─────────────── */

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => '10' + (k < 0 ? '⁻' : '') + String(Math.abs(k)).split('').map((d) => SUP[+d]).join('');
const Y_MIN = -16;
const Y_MAX = 8;
const D_MARK = 50;

function GradFigure() {
  const P = usePalette();
  const [rho, setRho] = useState(1);
  const [inp, setInp] = useState(0.2);
  const [bf, setBf] = useState(3);
  const rc = useMemo(() => rnnGradCurves(rho, inp), [rho, inp]);
  const lc = useMemo(() => lstmGradCurve(bf, inp), [bf, inp]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: GT_D, yMin: Y_MIN, yMax: Y_MAX, pad: { l: 46, r: 12, t: 12, b: 30 } });
      plot.grid({ xStep: 10, yStep: 4, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= GT_D; x += 10) ctx.fillText(String(x), plot.X(x), plot.Y(Y_MIN) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = Y_MIN; y <= Y_MAX; y += 4) ctx.fillText(pow10(y), plot.X(0) - 6, plot.Y(y));
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('거리 T − t', plot.X(GT_D) - 4, plot.Y(Y_MIN) - 4);
      plot.line(0, 0, GT_D, 0, P.lineStrong, 1.2);
      plot.line(D_MARK, Y_MIN, D_MARK, Y_MAX, alpha(P.ink, 0.3), 1.2, [4, 4]);
      const series: [number[], string, number[] | undefined][] = [
        [rc.linear, P.neg, [6, 4]],
        [rc.tanh, P.pos, undefined],
        [lc.cell, P.good, undefined],
      ];
      plot.clip();
      for (const [vals, col, dash] of series) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash ?? []);
        ctx.beginPath();
        vals.forEach((v, d) => {
          const y = Math.max(Y_MIN - 2, Math.min(Y_MAX + 2, Math.log10(Math.max(v, 1e-300))));
          if (d === 0) ctx.moveTo(plot.X(d), plot.Y(y));
          else ctx.lineTo(plot.X(d), plot.Y(y));
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      plot.unclip();
      for (const [vals, col] of series) {
        const y = Math.log10(Math.max(vals[D_MARK], 1e-300));
        if (y >= Y_MIN && y <= Y_MAX) plot.dot(D_MARK, y, 4.5, col, P.surface, 2);
      }
      plot.text('크기 1', 1, 0, P.ink3, { dy: -10, font: `11px ${P.fontBody}`, bg: P.surface });
    },
    [P, rc, lc],
    { aspect: 1.7, maxHeight: 340, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="시간을 거슬러 가는 기울기"
      hint="ρ와 망각 게이트 편향을 바꿔 보세요"
      caption={
        <>
          가로축은 손실이 생긴 시점 T에서 거슬러 올라간 거리, 세로축은 <M>{'\\|\\partial h_T / \\partial h_t\\|'}</M>(가장 큰 특잇값)를 로그 눈금으로 그린 것입니다. 은닉 크기 16, 순환 가중치는 직교 행렬에 ρ를 곱한 것이라 모든 고윳값의 크기가 정확히 ρ입니다. tanh RNN과 LSTM은 무작위 입력 4개 수열의 평균(로그 평균)입니다. LSTM 선은 셀 상태 직통 경로의 <M>{'\\|\\partial c_T / \\partial c_t\\|'}</M>, 즉 망각 게이트 값의 곱입니다. 점선 세로줄은 거리 50입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`거리 50에서 기울기 크기: 선형 RNN ${sci(rc.linear[D_MARK])}, tanh RNN ${sci(rc.tanh[D_MARK])}, LSTM 셀 경로 ${sci(lc.cell[D_MARK])}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="gt-rho" label={<>순환 가중치 크기 ρ</>} value={rho} min={0.5} max={1.5} step={0.05} onChange={setRho} format={(v) => v.toFixed(2)} color="var(--neg)" />
          <Slider id="gt-inp" label="입력 크기" value={inp} min={0.1} max={1.5} step={0.1} onChange={setInp} format={(v) => v.toFixed(1)} />
          <Slider id="gt-bf" label={<>망각 게이트 편향 <M>{'b_f'}</M></>} value={bf} min={-1} max={6} step={0.5} onChange={setBf} format={(v) => v.toFixed(1)} color="var(--good)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="선형 RNN, 거리 50" value={sci(rc.linear[D_MARK])} color="var(--neg)" />
            <Readout label="tanh RNN, 거리 50" value={sci(rc.tanh[D_MARK])} color="var(--pos)" />
            <Readout label="LSTM 셀, 거리 50" value={sci(lc.cell[D_MARK])} color="var(--good)" />
            <Readout label="평균 f" value={lc.meanF.toFixed(3)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '선형 RNN (= ρ^거리)', shape: 'ln' },
          { color: 'var(--pos)', label: 'tanh RNN', shape: 'ln' },
          { color: 'var(--good)', label: 'LSTM 셀 경로', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: the LSTM cell, and remembering the first symbol ─────────────── */

type PartKey = 'c' | 'f' | 'i' | 'g' | 'o' | 'h';
const PARTS: Record<PartKey, { name: string; color: string; eq: string; body: string }> = {
  c: {
    name: '셀 상태 c',
    color: 'var(--accent)',
    eq: 'c_t = f_t \\odot c_{t-1} + i_t \\odot g_t',
    body: '맨 위를 가로지르는 기억 통로입니다. 한 단계에서 하는 일은 원소별 곱셈 한 번(망각)과 덧셈 한 번(쓰기)뿐이고, 행렬 곱도 tanh도 거치지 않습니다. 그래서 이 길을 따라 거슬러 가는 기울기는 망각 게이트 값의 곱으로만 줄어듭니다.',
  },
  f: {
    name: '망각 게이트 f',
    color: 'var(--neg)',
    eq: 'f_t = \\sigma(W_f [h_{t-1}, x_t] + b_f)',
    body: '0에서 1 사이의 값을 칸마다 하나씩 내어 지난 셀 상태에 곱합니다. 1이면 그대로 두고 0이면 지웁니다. 첫 기호를 기억하는 문제라면, 첫 기호를 적은 칸에서는 방해 기호를 읽는 동안 f가 1에 가깝게 유지되어야 합니다.',
  },
  i: {
    name: '입력 게이트 i',
    color: 'var(--good)',
    eq: 'i_t = \\sigma(W_i [h_{t-1}, x_t] + b_i)',
    body: '새 후보 값 g를 셀에 얼마나 써 넣을지 정합니다. 중요한 기호가 들어올 때는 열고, 방해 기호가 들어올 때는 닫으면 기억이 덮어써지지 않습니다.',
  },
  g: {
    name: '후보 값 g',
    color: 'var(--pos)',
    eq: 'g_t = \\tanh(W_g [h_{t-1}, x_t] + b_g)',
    body: '이번 입력에서 셀에 적을 내용입니다. 보통 RNN의 은닉 상태 계산과 똑같은 꼴이지만, 그대로 덮어쓰지 않고 입력 게이트를 거쳐 기존 기억에 더해집니다.',
  },
  o: {
    name: '출력 게이트 o',
    color: 'var(--c-stats-2)',
    eq: 'o_t = \\sigma(W_o [h_{t-1}, x_t] + b_o)',
    body: '셀에 담긴 기억 중 지금 밖으로 내보낼 부분을 고릅니다. 기억은 셀 안에 간직한 채, 출력이 필요한 마지막 단계(물음표)에서만 열 수 있습니다.',
  },
  h: {
    name: '은닉 상태 h',
    color: 'var(--ink-2)',
    eq: 'h_t = o_t \\odot \\tanh(c_t)',
    body: '다음 단계의 게이트 계산과 이번 단계의 출력에 쓰이는 값입니다. 보통 RNN에서는 이것 하나가 기억의 전부였지만, LSTM에서는 오래 둘 기억은 c에, 당장 쓸 값은 h에 나눠 둡니다.',
  },
};

function LstmDiagram({ sel, onSel }: { sel: PartKey; onSel: (k: PartKey) => void }) {
  const mix = (v: string, p: number) => `color-mix(in srgb, ${v} ${p}%, var(--surface))`;
  const act = (k: PartKey) => ({
    className: 'part',
    role: 'button',
    tabIndex: 0,
    'aria-pressed': sel === k,
    'aria-label': PARTS[k].name,
    onClick: () => onSel(k),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSel(k);
      }
    },
  });
  const gate = (k: PartKey, x: number, label: string, fn: string) => (
    <g {...act(k)}>
      <rect x={x - 27} y={150} width={54} height={44} rx={6} style={{ fill: mix(PARTS[k].color, sel === k ? 40 : 16), stroke: sel === k ? 'var(--ink)' : PARTS[k].color, strokeWidth: sel === k ? 2.5 : 1.5 }} />
      <text x={x} y={166} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {label}
      </text>
      <text x={x} y={184} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        {fn}
      </text>
    </g>
  );
  const op = (x: number, y: number, sym: string) => (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={12} style={{ fill: 'var(--surface)', stroke: 'var(--ink-2)', strokeWidth: 1.5 }} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', fontSize: 16, fontWeight: 700 }}>
        {sym}
      </text>
    </g>
  );
  const wire = { stroke: 'var(--ink-3)', strokeWidth: 1.6, fill: 'none' } as CSSProperties;
  const cOn = sel === 'c';
  const hOn = sel === 'h';
  return (
    <div className="seq-lstm">
      <svg viewBox="0 0 460 262" role="group" aria-label="LSTM 셀 구조도. 부품을 누르면 설명이 바뀝니다">
        <defs>
          <marker id="lstm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" style={{ fill: 'var(--ink-3)' }} />
          </marker>
        </defs>
        {/* input bus: h_{t−1} and x_t feed every gate */}
        <path d="M18 230 H344" style={wire} />
        <path d="M70 258 V230" style={wire} />
        {[110, 190, 262, 344].map((x) => (
          <path key={x} d={`M${x} 230 V196`} style={wire} markerEnd="url(#lstm-arr)" />
        ))}
        {/* forget → ×, input·candidate → × → +, output → × */}
        <path d="M110 150 V50" style={wire} markerEnd="url(#lstm-arr)" />
        <path d="M190 150 V112 H212" style={wire} />
        <path d="M262 150 V112 H248" style={wire} />
        <path d="M230 100 V50" style={wire} markerEnd="url(#lstm-arr)" />
        <path d="M344 150 V128 H374" style={wire} markerEnd="url(#lstm-arr)" />
        <path d="M388 38 V68" style={wire} markerEnd="url(#lstm-arr)" />
        <path d="M388 92 V114" style={wire} markerEnd="url(#lstm-arr)" />
        {/* the cell-state belt */}
        <g {...act('c')}>
          <path d="M14 38 H446" style={{ stroke: 'transparent', strokeWidth: 22, fill: 'none' }} />
          <path d="M14 38 H442" style={{ stroke: cOn ? 'var(--accent)' : 'var(--ink)', strokeWidth: cOn ? 4.5 : 3, fill: 'none' }} markerEnd="url(#lstm-arr)" />
          <text x={16} y={20} style={{ fill: cOn ? 'var(--accent)' : 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            c(t−1)
          </text>
          <text x={444} y={20} textAnchor="end" style={{ fill: cOn ? 'var(--accent)' : 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            c(t)
          </text>
        </g>
        {op(110, 38, '×')}
        {op(230, 38, '+')}
        {op(230, 112, '×')}
        {/* output side: tanh(c) × o → h */}
        <g {...act('h')}>
          <ellipse cx={388} cy={80} rx={26} ry={12} style={{ fill: mix('var(--ink-3)', hOn ? 30 : 10), stroke: hOn ? 'var(--ink)' : 'var(--ink-3)', strokeWidth: hOn ? 2.5 : 1.5 }} />
          <text x={388} y={81} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            tanh
          </text>
          <path d="M388 140 V206 H446" style={{ stroke: 'transparent', strokeWidth: 18, fill: 'none' }} />
          <path d="M388 140 V206 H442" style={{ stroke: hOn ? 'var(--ink)' : 'var(--ink-3)', strokeWidth: hOn ? 3 : 1.8, fill: 'none' }} markerEnd="url(#lstm-arr)" />
          <text x={444} y={196} textAnchor="end" style={{ fill: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            h(t)
          </text>
        </g>
        {op(388, 128, '×')}
        {gate('f', 110, 'f', 'σ')}
        {gate('i', 190, 'i', 'σ')}
        {gate('g', 262, 'g', 'tanh')}
        {gate('o', 344, 'o', 'σ')}
        <text x={18} y={248} style={{ fill: 'var(--ink-2)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          h(t−1)
        </text>
        <text x={80} y={256} style={{ fill: 'var(--ink-2)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          x(t)
        </text>
      </svg>
    </div>
  );
}

function exampleTokens(k: number): { text: string; signal: string } {
  const { xs } = memorySample(k, rng(1000 + k));
  const toks = memoryText(xs).split(' ');
  const noise = toks.slice(1, -1);
  const shown = noise.length > 12 ? [...noise.slice(0, 6), `…(${noise.length - 9}개 더)…`, ...noise.slice(-3)] : noise;
  return { text: shown.join(' '), signal: toks[0] };
}

function MemoryFigure() {
  const P = usePalette();
  const [sel, setSel] = useState<PartKey>('c');
  const [kIdx, setKIdx] = useState(4);
  const k = MEM_KS[kIdx];
  const ex = useMemo(() => exampleTokens(k), [k]);
  const stat = (kind: 'rnn' | 'lstm', i: number) => {
    const v = MEMORY_RESULTS[kind][i] ?? [];
    const m = v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    return { m, lo: Math.min(...v), hi: Math.max(...v) };
  };
  const rs = stat('rnn', kIdx);
  const ls = stat('lstm', kIdx);
  const part = PARTS[sel];
  const nR = paramCount({ kind: 'rnn', nIn: 9, H: MEM_H, nOut: 4 });
  const nL = paramCount({ kind: 'lstm', nIn: 9, H: MEM_H, nOut: 4 });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = MEM_KS.length;
      const plot = new Plot(ctx, w, h, P, { xMin: -0.4, xMax: n - 0.6, yMin: 0, yMax: 100, pad: { l: 40, r: 12, t: 12, b: 30 } });
      plot.grid({ xStep: 1, yStep: 25, labels: false, axes: false });
      ctx.fillStyle = alpha(P.hl, 0.25);
      ctx.fillRect(plot.X(kIdx - 0.4), plot.pad.t, plot.X(kIdx + 0.4) - plot.X(kIdx - 0.4), plot.ph);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      MEM_KS.forEach((kk, i) => ctx.fillText(String(kk), plot.X(i), plot.Y(0) + 6));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= 100; y += 25) ctx.fillText(`${y}%`, plot.X(-0.4) - 5, plot.Y(y));
      plot.line(-0.4, 25, n - 0.6, 25, alpha(P.ink, 0.45), 1.2, [5, 4]);
      plot.text('찍기 25%', n - 0.7, 25, P.ink3, { dy: -11, align: 'right', font: `11px ${P.fontBody}`, bg: P.surface });
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('방해 기호 수 k', plot.X(-0.4) + 4, plot.Y(0) - 4);
      for (const [kind, col] of [
        ['rnn', P.pos],
        ['lstm', P.good],
      ] as const) {
        const res = MEMORY_RESULTS[kind];
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        res.forEach((v, i) => {
          const m = v.reduce((a, b) => a + b, 0) / v.length;
          if (i === 0) ctx.moveTo(plot.X(i), plot.Y(m));
          else ctx.lineTo(plot.X(i), plot.Y(m));
        });
        ctx.stroke();
        res.forEach((v, i) => {
          v.forEach((a) => plot.dot(i + (kind === 'rnn' ? -0.08 : 0.08), a, 2.6, alpha(col, 0.55)));
          plot.dot(i, v.reduce((a, b) => a + b, 0) / v.length, 4.5, col, P.surface, 2);
        });
      }
    },
    [P, kIdx],
    { aspect: 1.8, maxHeight: 300, minHeight: 220 },
  );

  const fmtA = (s: { m: number; lo: number; hi: number }) => (isFinite(s.m) ? `${Math.round(s.m)}%` : '—');
  const range = (s: { m: number; lo: number; hi: number }) => (isFinite(s.m) ? `${Math.round(s.lo)}–${Math.round(s.hi)}%` : '');

  return (
    <Figure
      no={3}
      title="LSTM 셀과 먼 과거 기억하기"
      hint="셀의 부품을 누르고, k를 바꿔 보세요"
      caption={
        <>
          문제: 네 기호 A, B, C, D 중 하나를 보여 주고, 무작위 방해 기호 w, x, y, z를 k개 보여 준 뒤 물음표에서 처음 기호를 맞히게 합니다. 은닉 크기 {MEM_H}인 tanh RNN(가중치 {nR}개)과 LSTM(가중치 {nL}개)을 k마다 같은 조건(Adam, 배치 {MEM_BATCH}, {MEM_ITERS.toLocaleString('ko-KR')}번 갱신, 기울기 노름 5로 자르기, LSTM의 망각 게이트 편향은 {MEM_FORGET_BIAS}로 초기화)으로 학습시켜, 새 수열 400개에서 정확도를 잰 미리 학습해 둔 결과입니다. 작은 점은 무작위 시드 3개 각각, 큰 점은 평균입니다.
        </>
      }
    >
      <div className="fig-split">
        <LstmDiagram sel={sel} onSel={setSel} />
        <div className="seq-explain" style={{ ['--part-color' as string]: part.color } as CSSProperties} aria-live="polite">
          <strong>{part.name}</strong>
          <div style={{ margin: '4px 0 6px' }}>
            <M>{part.eq}</M>
          </div>
          {part.body}
        </div>
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`k = ${k}에서 정확도: RNN ${fmtA(rs)}, LSTM ${fmtA(ls)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="seq-tight">
            <Seg label="방해 기호 수 k" value={kIdx} onChange={setKIdx} options={MEM_KS.map((kk, i) => ({ value: i, label: String(kk) }))} />
          </div>
          <div className="seq-example" aria-label={`예시 입력: ${ex.signal}, 방해 기호, 물음표`}>
            <span className="sig">{ex.signal}</span> {ex.text} <span className="q">?</span> → 정답 {ex.signal}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="RNN 정확도" value={fmtA(rs)} color="var(--pos)" />
            <Readout label="LSTM 정확도" value={fmtA(ls)} color="var(--good)" />
            <Readout label="RNN 시드별" value={range(rs)} />
            <Readout label="LSTM 시드별" value={range(ls)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: 'tanh RNN', shape: 'ln' },
          { color: 'var(--good)', label: 'LSTM', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Rnn() {
  return (
    <>
      <h2>순서가 뜻을 만든다</h2>
      <p>
        "개가 사람을 물었다"와 "사람이 개를 물었다"는 같은 단어로 되어 있지만 뜻이 정반대입니다. 문장, 음성, 주가, 센서 기록처럼 <strong>순서가 의미를 갖는 데이터</strong>를 다루려면 모델이 순서를 알아야 합니다. 게다가 길이도 제각각입니다. <a href="#ai-basics/neural-network">기초 과목의 다층 퍼셉트론</a>은 크기가 정해진 입력 벡터 하나를 받으니, 문장을 통째로 넣기 어렵습니다.
      </p>
      <p>
        사람이 글을 읽는 방식을 흉내 내 봅시다. 한 글자(또는 한 단어)씩 차례로 읽으면서, 지금까지 읽은 내용을 머릿속 메모에 요약해 두고, 새 글자를 읽을 때마다 메모를 고쳐 씁니다. 이 메모가 <T en="hidden state">은닉 상태</T>이고, 이렇게 동작하는 신경망이 <T en="recurrent neural network, RNN">순환 신경망</T>입니다.
      </p>

      <h2>같은 가중치를 시간마다 되풀이하기</h2>
      <p>
        시점 t에 입력 <M>{'x_t'}</M>가 들어오면, 바로 전 은닉 상태 <M>{'h_{t-1}'}</M>과 섞어 새 은닉 상태 <M>{'h_t'}</M>를 만들고, 거기서 출력 <M>{'y_t'}</M>를 읽어 냅니다.
      </p>
      <MB note="W는 은닉→은닉, U는 입력→은닉, V는 은닉→출력 행렬입니다. 처음 은닉 상태 h₀은 보통 0 벡터입니다.">{'h_t = \\tanh(W h_{t-1} + U x_t + b), \\qquad y_t = \\operatorname{softmax}(V h_t + c)'}</MB>
      <p>
        핵심은 <strong>W, U, V가 모든 시점에서 같다</strong>는 것입니다. <a href="#ai-basics/cnn">합성곱 신경망</a>이 같은 필터를 이미지의 모든 위치에 공유하듯, RNN은 같은 가중치를 모든 시간에 공유합니다. 그래서 길이가 5인 수열이든 500인 수열이든 가중치 개수는 같습니다. 이 순환을 시간 축으로 쭉 펼쳐 그리면 시점마다 층이 하나씩 있는 깊은 신경망이 되는데, 이것을 <T en="unrolling">시간 펼치기</T>라고 합니다. 층마다 가중치가 같다는 점만 보통의 깊은 신경망과 다릅니다.
      </p>
      <p>
        그림 1은 다음 글자를 예측하는 아주 작은 RNN입니다. 은닉 상태는 12칸이고, 단어 여섯 개로 학습해 두었습니다. hello를 고르고 한 단계씩 넘기며 은닉 상태의 색이 어떻게 바뀌는지 보세요.
      </p>
      <UnrollFigure />
      <p>
        세 번째 글자 l을 읽은 순간을 보세요. hello, help, held에서는 다음 글자 후보가 l, p, d로 셋이라 각각 33%를 주고, jelly에서는 l에 100%를, yellow와 yelp에서는 l과 p에 50%씩을 줍니다. 입력 글자는 똑같이 l인데 예측이 다른 것은, 은닉 상태가 세 글자 전에 읽은 첫 글자를 기억하고 있기 때문입니다. 바로 앞 글자 하나만 보는 모델(<a href="#ai-basics/language-model">기초 과목의 바이그램 모델</a>)은 l 다음에 l 33%, o 22%, p 22%, d 11%, y 11%라는 한 가지 분포밖에 줄 수 없습니다. hello와 yellow의 o도 마찬가지입니다. RNN은 o를 읽고 hello에서는 끝을, yellow에서는 w를 거의 100% 확신하는데, 이것은 네 글자 전의 h와 y를 구별해야 할 수 있는 일입니다.
      </p>
      <Code label="RNN 한 단계">{`
// h: 지난 은닉 상태 (길이 H), x: 이번 입력 (길이 D)
// W: H×H, U: H×D, V: K×H — 모든 시점에서 같은 행렬
function rnnStep(h, x, { W, U, b, V, c }) {
  const hNew = add(add(matVec(W, h), matVec(U, x)), b).map(Math.tanh);
  const y = softmax(add(matVec(V, hNew), c));   // 이번 시점의 출력
  return { h: hNew, y };
}

function rnnRun(xs, params) {
  let h = zeros(params.W.length);               // h₀ = 0
  const ys = [];
  for (const x of xs) {                         // 한 시점씩 차례로: 병렬화가 안 된다
    const out = rnnStep(h, x, params);
    h = out.h;
    ys.push(out.y);
  }
  return ys;
}`}</Code>

      <h2>시간을 거슬러 가는 기울기</h2>
      <p>
        RNN도 <a href="#ai-basics/backprop">역전파</a>로 학습합니다. 펼친 그래프를 거꾸로 따라가며 기울기를 계산하므로 <T en="backpropagation through time, BPTT">시간 역전파</T>라고 부릅니다. 시점 T의 손실이 t 시점의 은닉 상태에 얼마나 민감한지는 연쇄 법칙에 따라 단계마다의 야코비 행렬을 곱한 것입니다.
      </p>
      <MB note="diag(1 − h²)는 tanh의 미분입니다. 같은 W가 T − t번 곱해집니다.">{'\\frac{\\partial h_T}{\\partial h_t} = \\prod_{k=t+1}^{T} \\frac{\\partial h_k}{\\partial h_{k-1}} = \\prod_{k=t+1}^{T} \\operatorname{diag}(1 - h_k^2)\\, W'}</MB>
      <p>
        tanh를 빼고 생각하면 이 곱은 <M>{'W^{T-t}'}</M>입니다. 행렬을 거듭제곱하면 크기는 고윳값의 크기 ρ를 거리만큼 거듭제곱한 것처럼 변합니다. ρ가 1보다 작으면 기하급수적으로 0에 가까워지고(<T en="vanishing gradient">기울기 소실</T>), 1보다 크면 기하급수적으로 커집니다(<T en="exploding gradient">기울기 폭발</T>). tanh의 기울기 <M>{'1 - h^2'}</M>은 1 이하라서 곱할수록 더 줄어듭니다.
      </p>
      <p>
        깊은 신경망에서도 같은 문제가 있었지만(<a href="#ai-deep-learning/init-norm">초기화와 정규화</a>), RNN에서는 두 가지가 더 나쁩니다. 층마다 다른 행렬이 아니라 <strong>같은 W를 계속 곱하므로</strong> 효과가 한 방향으로 쌓이고, 펼친 깊이가 수열 길이라서 수백, 수천 단계가 되기도 합니다.
      </p>
      <GradFigure />
      <p>
        ρ = 1에서 시작해 보세요. 선형 RNN은 거리와 상관없이 크기가 정확히 1이지만, tanh RNN은 tanh의 기울기 때문에 거리 50에서 4.5×10⁻³까지 줄어듭니다. ρ를 0.9로만 내려도 선형 RNN은 0.9⁵⁰ ≈ 5.2×10⁻³, tanh RNN은 9.6×10⁻⁵입니다. 반대로 ρ = 1.5에서 선형 RNN은 1.5⁵⁰ ≈ 6.4×10⁸로 폭발합니다. 입력을 키우면 tanh가 포화되어(기울기가 0에 가까운 구간으로 밀려나) 폭발은 누그러지지만 소실은 훨씬 심해집니다. 같은 ρ = 1.5에서 입력 크기를 0.2에서 1.0으로 키우면 tanh RNN의 거리 50 기울기는 14에서 1.7×10⁻⁴로 떨어집니다.
      </p>
      <Callout kind="warn" label="폭발에는 자르기">
        기울기 폭발은 비교적 쉽게 막습니다. 갱신하기 전에 전체 기울기 벡터의 노름을 재서, 정해 둔 값보다 크면 그 값이 되도록 줄이는 <T en="gradient clipping">기울기 자르기</T>입니다. 방향은 그대로 두고 크기만 줄이므로, 손실 지형의 절벽에서 한 번에 멀리 튀어 나가는 일을 막습니다. RNN 학습에서는 거의 기본으로 씁니다. 그림 3의 학습도 노름 5로 잘랐습니다.
      </Callout>
      <Code label="기울기 자르기 (전체 노름 기준)">{`
function clipByGlobalNorm(grads, maxNorm) {
  let sq = 0;
  for (const g of grads) for (const v of g) sq += v * v;
  const norm = Math.sqrt(sq);
  if (norm <= maxNorm) return grads;
  const s = maxNorm / norm;                     // 방향은 그대로, 길이만 maxNorm으로
  return grads.map((g) => g.map((v) => v * s));
}`}</Code>
      <p>
        소실은 자르기로 해결되지 않습니다. 먼 과거에서 오는 기울기가 가까운 과거에서 오는 기울기에 비해 수십 자릿수 작으면, 가중치 갱신은 사실상 가까운 과거만 보고 이루어집니다. 모델은 "50단계 전의 입력이 지금의 정답을 좌우한다"는 사실을 배울 길이 없습니다. 1990년대 초에 이미 이 어려움이 분석되었고, 그 해법으로 나온 것이 LSTM입니다.
      </p>

      <h2>LSTM: 기억을 위한 별도의 통로</h2>
      <p>
        <T en="long short-term memory, LSTM">LSTM</T>(Hochreiter와 Schmidhuber, 1997)은 은닉 상태와 별도로 <T en="cell state">셀 상태</T> <M>{'c_t'}</M>라는 기억 통로를 둡니다. 셀 상태는 행렬을 곱해 덮어쓰지 않고, 칸마다 일부를 지우고 일부를 더하는 식으로만 바뀝니다. 지우고 쓰고 읽는 양은 0에서 1 사이 값을 내는 <T en="gate">게이트</T> 세 개가 정합니다.
      </p>
      <MB note="σ는 시그모이드, ⊙는 원소별 곱, [h, x]는 두 벡터를 이어 붙인 것입니다.">{'\\begin{aligned} f_t &= \\sigma(W_f[h_{t-1}, x_t] + b_f) & i_t &= \\sigma(W_i[h_{t-1}, x_t] + b_i) \\\\ o_t &= \\sigma(W_o[h_{t-1}, x_t] + b_o) & g_t &= \\tanh(W_g[h_{t-1}, x_t] + b_g) \\\\ c_t &= f_t \\odot c_{t-1} + i_t \\odot g_t & h_t &= o_t \\odot \\tanh(c_t) \\end{aligned}'}</MB>
      <p>
        기울기 관점에서 중요한 것은 셀 상태의 갱신식입니다. 다른 경로를 무시하고 셀 상태만 따라가면 <M>{'\\partial c_t / \\partial c_{t-1} = \\operatorname{diag}(f_t)'}</M>입니다. 행렬 W도, tanh의 기울기도 끼어들지 않고 망각 게이트 값만 곱해집니다. 망각 게이트가 1에 가까운 칸에서는 기울기가 수십, 수백 단계를 거의 그대로 거슬러 갑니다. 원래 1997년 LSTM에는 망각 게이트가 없어 셀 상태가 그대로 이어졌고(f = 1에 해당), 몇 년 뒤에 망각 게이트가 더해져 지금의 표준형이 되었습니다.
      </p>
      <p>
        그림 2로 돌아가 망각 게이트 편향 <M>{'b_f'}</M>를 바꿔 보세요. 편향이 0이면 게이트 값이 평균 0.5 정도라서 셀 경로의 기울기는 거리 50에서 10⁻¹⁵ 수준으로, 오히려 tanh RNN보다도 빨리 사라집니다. 게이트가 있다고 저절로 기억하는 것이 아니라, 게이트가 1에 가깝게 열려 있어야 합니다. 편향을 3으로 올리면 평균 f가 0.95 근처가 되고 거리 50에서도 0.23이 남습니다. 그래서 실제로도 망각 게이트 편향을 1 이상의 양수로 초기화해 "처음에는 기억을 지우지 않는" 쪽에서 학습을 시작하는 일이 흔합니다. 그림 3의 실험에서는 3으로 두었습니다.
      </p>
      <Code label="LSTM 한 단계">{`
// Wx: 4H×D, Wh: 4H×H, b: 4H — 네 게이트의 행을 [i, f, g, o] 순서로 쌓았다
function lstmStep(h, c, x, { Wx, Wh, b }) {
  const H = h.length;
  const z = add(add(matVec(Wx, x), matVec(Wh, h)), b);
  const hNew = new Array(H), cNew = new Array(H);
  for (let j = 0; j < H; j++) {
    const i = sigmoid(z[j]);                   // 입력 게이트: 얼마나 쓸까
    const f = sigmoid(z[H + j]);               // 망각 게이트: 얼마나 남길까
    const g = Math.tanh(z[2 * H + j]);         // 후보 값: 무엇을 쓸까
    const o = sigmoid(z[3 * H + j]);           // 출력 게이트: 얼마나 내보낼까
    cNew[j] = f * c[j] + i * g;                // 곱하고 더할 뿐, 행렬 곱이 없다
    hNew[j] = o * Math.tanh(cNew[j]);
  }
  return { h: hNew, c: cNew };
}`}</Code>
      <p>
        그림 3에서 셀의 부품을 하나씩 눌러 역할을 읽어 보고, 아래의 실험을 보세요. 첫 기호를 k개의 방해 기호 뒤에 맞히는 문제를 tanh RNN과 LSTM에 같은 조건으로 학습시킨 결과입니다.
      </p>
      <MemoryFigure />
      <p>
        방해 기호가 8개까지는 둘 다 100%를 맞힙니다. k = 16에서 tanh RNN은 시드에 따라 100%, 50%, 26%로 갈리고, k = 32부터는 세 시드 모두 찍기 수준(25% 안팎)으로 떨어집니다. 같은 학습 예산에서 LSTM은 k = 32까지 세 시드 모두 100%입니다. 물론 LSTM도 공짜로 기억하지는 않습니다. k = 64에서는 같은 예산으로 47%, 25%, 50%에 그쳤는데, 갱신 횟수를 두 배(3,000번)로 늘리자 시드 1은 75%, 시드 2는 100%까지 올라갔습니다. 거리가 길수록 학습 초반에 잡히는 신호가 약해 배우는 데 더 오래 걸리는 것입니다. 같은 조건에서 RNN은 k = 32와 64에서 갱신을 3,000번으로 늘려도 22~28%로 찍기 수준 그대로였습니다.
      </p>
      <Callout kind="note">
        LSTM을 단순하게 줄인 <T en="gated recurrent unit, GRU">GRU</T>(2014)도 널리 쓰였습니다. 셀 상태와 은닉 상태를 하나로 합치고 게이트를 둘(갱신, 리셋)로 줄였지만, "덧셈으로 이어지는 기억 경로를 게이트로 조절한다"는 핵심은 같습니다.
      </Callout>

      <h2>그런데도 트랜스포머로 넘어간 이유</h2>
      <p>LSTM은 2010년대 중반까지 기계 번역, 음성 인식, 언어 모델의 주력이었습니다. 하지만 지금 대부분의 언어 모델은 <a href="#ai-basics/attention">어텐션</a>에 기반한 트랜스포머입니다. 이유는 크게 세 가지입니다.</p>
      <ul>
        <li>
          <strong>학습을 병렬로 할 수 있다.</strong> RNN은 <M>{'h_t'}</M>를 계산하려면 <M>{'h_{t-1}'}</M>이 있어야 하므로, 길이 n인 문장을 n단계에 걸쳐 차례로 처리해야 합니다. 트랜스포머는 학습할 때 모든 위치를 한 번의 큰 행렬 곱으로 동시에 계산합니다(인과 마스크로 미래만 가립니다). GPU는 큰 행렬 곱을 한꺼번에 할 때 가장 빠르므로, 같은 시간에 훨씬 많은 데이터로 학습할 수 있습니다.
        </li>
        <li>
          <strong>어느 위치든 직접 본다.</strong> RNN에서 첫 단어의 정보가 100번째 단어에 닿으려면 99번의 갱신을 거쳐야 하고, 그동안 기울기는 그림 2처럼 줄어듭니다. 어텐션에서는 100번째 단어가 첫 단어를 한 단계 만에 직접 봅니다. 거리가 멀어도 경로 길이가 1입니다.
        </li>
        <li>
          <strong>기억이 크기 고정의 벡터 하나가 아니다.</strong> RNN은 지금까지 읽은 모든 것을 크기 H인 벡터 하나에 눌러 담아야 합니다. 트랜스포머는 앞의 모든 토큰의 표현을 그대로 두고 필요할 때 꺼내 봅니다.
        </li>
      </ul>
      <p>
        마지막 항목은 대가가 있습니다. 앞의 모든 토큰을 들고 있어야 하므로 문맥이 길어지면 메모리와 계산이 늘어납니다. RNN은 토큰 하나를 처리하는 비용과 메모리가 문맥 길이와 상관없이 일정합니다. 그래서 순환 구조의 이 장점을 살리면서 학습은 병렬로 할 수 있는 모델들도 활발히 연구되고 있습니다. 트랜스포머가 생성할 때 그 비용을 어떻게 다루는지는 <a href="#ai-deep-learning/transformer">다음 장</a>에서 KV 캐시로 직접 계산해 봅니다.
      </p>

      <Callout kind="key">
        RNN은 같은 가중치를 시간마다 되풀이해 쓰며 지난 정보를 은닉 상태에 담습니다. 시간 역전파에서는 같은 야코비 행렬이 거리만큼 곱해지므로 기울기가 기하급수적으로 사라지거나 폭발합니다. 폭발은 기울기 자르기로 막고, 소실은 LSTM처럼 덧셈으로 이어지는 셀 상태와 게이트로 완화합니다. 트랜스포머는 순차 계산을 없애고 어느 위치든 직접 보게 해서 이 문제를 구조적으로 피했습니다.
      </Callout>
      <Quiz
        q="LSTM에서 먼 과거까지 기울기가 잘 전달되는 가장 직접적인 이유는?"
        options={[
          '시그모이드의 기울기가 tanh보다 커서',
          '셀 상태가 행렬 곱 없이 망각 게이트 값만 원소별로 곱해지며 이어지므로, 게이트가 1에 가까우면 기울기가 거의 그대로 전달되어서',
          '가중치가 보통 RNN보다 약 4배 많아서',
          '기울기 자르기가 셀 안에 들어 있어서',
        ]}
        answer={1}
        explain={
          <>
            셀 상태의 갱신 <M>{'c_t = f_t \\odot c_{t-1} + i_t \\odot g_t'}</M>를 <M>{'c_{t-1}'}</M>로 미분하면 <M>{'\\operatorname{diag}(f_t)'}</M>뿐입니다. 보통 RNN처럼 같은 W와 tanh의 기울기가 거리만큼 곱해지지 않으므로, f가 1에 가까운 칸에서는 기울기가 멀리까지 살아남습니다. 시그모이드의 기울기는 최대 0.25로 오히려 작고, 가중치 수나 기울기 자르기는 소실을 막아 주지 않습니다.
          </>
        }
      />
    </>
  );
}

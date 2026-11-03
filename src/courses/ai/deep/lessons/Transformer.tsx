import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { gauss, rng } from '../../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { additiveScore, bytesStr, causalWeights, countParams, decodeMacs, dot, flopsPerToken, korNum, kvCacheBytes, peSimilarity, rope, ropeScore, sinusoidalPE, type TfConfig } from './sequence';
import './sequence.css';

/** Diverging colour for a value in [−1, 1]: orange for positive, blue for negative. */
function divColor(P: Palette, v: number, a = 0.95) {
  return alpha(v >= 0 ? P.pos : P.neg, Math.min(1, Math.abs(v)) * a);
}

/* ─────────────── Figure 1: positional encodings ─────────────── */

const PE_ROWS = 64;
const ROPE_D = 8;
const ROPE_MAX = 40;

function SinusoidPanel() {
  const P = usePalette();
  const [d, setD] = useState(64);
  const [p, setP] = useState(10);
  const table = useMemo(() => Array.from({ length: PE_ROWS }, (_, i) => sinusoidalPE(i, d)), [d]);

  const heat = useCanvas2D(
    (ctx, { w, h }) => {
      const l = 30;
      const t = 18;
      const cw = (w - l - 6) / d;
      const ch = (h - t - 6) / PE_ROWS;
      for (let i = 0; i < PE_ROWS; i++)
        for (let j = 0; j < d; j++) {
          ctx.fillStyle = P.surface;
          ctx.fillRect(l + j * cw, t + i * ch, Math.ceil(cw), Math.ceil(ch));
          ctx.fillStyle = divColor(P, table[i][j]);
          ctx.fillRect(l + j * cw, t + i * ch, Math.ceil(cw), Math.ceil(ch));
        }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(l - 1, t + p * ch - 1, d * cw + 2, ch + 2);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < PE_ROWS; i += 16) ctx.fillText(String(i), l - 4, t + (i + 0.5) * ch);
      ctx.fillStyle = P.ink;
      ctx.fillText(String(p), l - 4, t + (p + 0.5) * ch);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillText('차원 0 → ' + (d - 1) + '   (세로: 위치)', l, t - 3);
    },
    [P, table, p, d],
    { aspect: 1.25, maxHeight: 320, minHeight: 220 },
  );

  const sim = useCanvas2D(
    (ctx, { w, h }) => {
      const R = 32;
      let lo = 1;
      for (let D = 0; D <= R; D++) lo = Math.min(lo, peSimilarity(D, d) / (d / 2));
      lo = Math.floor((lo - 0.05) * 4) / 4;
      const plot = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: lo, yMax: 1.05, pad: { l: 36, r: 10, t: 12, b: 26 } });
      plot.grid({ xStep: 8, yStep: 0.25 });
      plot.fn((x) => peSimilarity(x, d) / (d / 2), alpha(P.ink3, 0.9), 1.6, { samples: 400 });
      for (let D = -R; D <= R; D++) {
        if (p + D < 0) continue;
        const v = dot(sinusoidalPE(p, d), sinusoidalPE(p + D, d)) / (d / 2);
        plot.dot(D, v, 2.8, P.accent);
      }
      plot.text('Δ', R, lo, P.ink2, { dx: -4, dy: -10, align: 'right', font: `12px ${P.fontBody}` });
    },
    [P, p, d],
    { aspect: 1.9, maxHeight: 220, minHeight: 170 },
  );

  return (
    <div className="fig-split">
      <div className="seq-col">
        <div ref={heat.wrapRef} className="canvas-box" role="img" aria-label={`사인파 위치 인코딩 표: 위치 0~63, 차원 ${d}개. 위치 ${p} 행 강조`}>
          <canvas ref={heat.canvasRef} />
        </div>
        <p className="seq-sub">위치 {p}의 벡터와 위치 {p}+Δ 벡터의 내적 (Δ = 0에서 1이 되게 나눔)</p>
        <div ref={sim.wrapRef} className="canvas-box" role="img" aria-label={`위치 ${p}에서 본 거리별 내적. 점이 위치와 상관없는 곡선 위에 놓임`}>
          <canvas ref={sim.canvasRef} />
        </div>
      </div>
      <div className="controls">
        <Slider id="pe-p" label="기준 위치 p" value={p} min={0} max={PE_ROWS - 1} step={1} onChange={setP} />
        <Slider id="pe-d" label="차원 수 d" value={d} min={16} max={128} step={16} onChange={setD} />
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="PE(p)·PE(p+1)" value={dot(sinusoidalPE(p, d), sinusoidalPE(p + 1, d)).toFixed(3)} />
          <Readout label="PE(p)·PE(p+8)" value={dot(sinusoidalPE(p, d), sinusoidalPE(p + 8, d)).toFixed(3)} />
        </div>
        <p className="seq-sub">p를 바꿔도 두 값과 아래 곡선은 그대로입니다. 내적은 거리 Δ에만 달려 있습니다.</p>
      </div>
    </div>
  );
}

function RopePanel() {
  const P = usePalette();
  const [m, setM] = useState(5);
  const [n, setN] = useState(2);
  const [pair, setPair] = useState(1);
  const { q, k } = useMemo(() => {
    const r = rng(5);
    return { q: Float64Array.from({ length: ROPE_D }, () => gauss(r)), k: Float64Array.from({ length: ROPE_D }, () => gauss(r)) };
  }, []);
  const rs = ropeScore(q, k, m, n);
  const as = additiveScore(q, k, m, n);
  const theta = Math.pow(10000, (-2 * pair) / ROPE_D);

  const plane = useCanvas2D(
    (ctx, { w, h }) => {
      const R = Math.max(Math.hypot(q[2 * pair], q[2 * pair + 1]), Math.hypot(k[2 * pair], k[2 * pair + 1])) * 1.25;
      const plot = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plot.grid({ labels: false, xStep: R, yStep: R });
      const qr = rope(q, m);
      const kr = rope(k, n);
      plot.arrow(0, 0, q[2 * pair], q[2 * pair + 1], alpha(P.accent, 0.3), 2, 8);
      plot.arrow(0, 0, k[2 * pair], k[2 * pair + 1], alpha(P.pos, 0.3), 2, 8);
      plot.arrow(0, 0, qr[2 * pair], qr[2 * pair + 1], P.accent, 3, 11);
      plot.arrow(0, 0, kr[2 * pair], kr[2 * pair + 1], P.pos, 3, 11);
      plot.text(`q·R(${m}θ)`, qr[2 * pair], qr[2 * pair + 1], P.accent, { dx: 6, dy: -8, font: `600 12px ${P.fontMono}`, bg: P.surface });
      plot.text(`k·R(${n}θ)`, kr[2 * pair], kr[2 * pair + 1], P.pos, { dx: 6, dy: 10, font: `600 12px ${P.fontMono}`, bg: P.surface });
    },
    [P, m, n, pair, q, k],
    { aspect: 1.2, maxHeight: 260, minHeight: 200 },
  );

  const shift = useCanvas2D(
    (ctx, { w, h }) => {
      const S = 30;
      const rv = Array.from({ length: S + 1 }, (_, s) => ropeScore(q, k, m + s, n + s));
      const av = Array.from({ length: S + 1 }, (_, s) => additiveScore(q, k, m + s, n + s));
      const all = [...rv, ...av];
      const lo = Math.min(...all) - 0.5;
      const hi = Math.max(...all) + 0.5;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: S, yMin: lo, yMax: hi, pad: { l: 36, r: 10, t: 12, b: 26 } });
      plot.grid({ xStep: 10 });
      for (const [vals, col] of [
        [av, P.ink3],
        [rv, P.accent],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        vals.forEach((v, s) => (s ? ctx.lineTo(plot.X(s), plot.Y(v)) : ctx.moveTo(plot.X(s), plot.Y(v))));
        ctx.stroke();
      }
      plot.dot(0, rv[0], 4.5, P.accent, P.surface, 2);
      plot.dot(0, av[0], 4.5, P.ink3, P.surface, 2);
      plot.text('가로: 둘 다 s칸 옮김', S, hi, P.ink2, { dx: -4, dy: 10, align: 'right', font: `12px ${P.fontBody}`, bg: P.surface });
    },
    [P, m, n, q, k],
    { aspect: 1.9, maxHeight: 220, minHeight: 170 },
  );

  return (
    <div className="fig-split">
      <div className="seq-col">
        <p className="seq-sub">
          차원 쌍 {pair}(θ = {theta < 0.01 ? theta.toExponential(0) : theta.toPrecision(2)})에서 본 q와 k. 흐린 화살표가 회전 전입니다.
        </p>
        <div ref={plane.wrapRef} className="canvas-box" role="img" aria-label={`RoPE: 위치 ${m}의 q와 위치 ${n}의 k를 각각 회전`}>
          <canvas ref={plane.canvasRef} />
        </div>
        <p className="seq-sub">위치 (m+s, n+s)에서의 점수: RoPE(색)와 위치 벡터를 더하는 방식(회색)</p>
        <div ref={shift.wrapRef} className="canvas-box" role="img" aria-label="두 위치를 함께 옮길 때의 점수. RoPE는 평평하고 덧셈 방식은 출렁임">
          <canvas ref={shift.canvasRef} />
        </div>
      </div>
      <div className="controls">
        <Slider id="rope-m" label="q의 위치 m" value={m} min={0} max={ROPE_MAX} step={1} onChange={setM} color="var(--accent)" />
        <Slider id="rope-n" label="k의 위치 n" value={n} min={0} max={ROPE_MAX} step={1} onChange={setN} color="var(--pos)" />
        <div className="btn-row">
          <Button small onClick={() => (setM((v) => Math.min(ROPE_MAX, v + 1)), setN((v) => Math.min(ROPE_MAX, v + 1)))} disabled={m >= ROPE_MAX || n >= ROPE_MAX}>
            둘 다 +1
          </Button>
          <Button small onClick={() => (setM((v) => Math.max(0, v - 1)), setN((v) => Math.max(0, v - 1)))} disabled={m <= 0 || n <= 0}>
            둘 다 −1
          </Button>
        </div>
        <Seg label="그림 속 차원 쌍" value={pair} onChange={setPair} options={[0, 1, 2, 3].map((i) => ({ value: i, label: String(i) }))} />
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="m − n" value={m - n} />
          <Readout label="RoPE 점수" value={rs.toFixed(4)} color="var(--accent)" />
          <Readout label="덧셈 방식 점수" value={as.toFixed(4)} />
        </div>
      </div>
    </div>
  );
}

function PositionFigure() {
  const [view, setView] = useState<'sin' | 'rope'>('sin');
  return (
    <Figure
      no={1}
      title="위치 인코딩: 사인파 표와 RoPE"
      hint="보기를 바꾸고 위치를 움직여 보세요"
      caption={
        view === 'sin' ? (
          <>
            위쪽은 위치 0~63(세로) × 차원(가로)의 사인파 위치 인코딩입니다. 주황은 양수, 파랑은 음수입니다. 왼쪽 차원은 위치마다 빠르게, 오른쪽 차원은 아주 느리게 진동합니다. 아래쪽 점은 실제로 두 벡터를 내적한 값이고, 회색 선은 위치와 상관없는 식 <M>{'\\sum_i \\cos(\\Delta\\,\\omega_i)'}</M>입니다. 어느 p에서 재든 점이 같은 선 위에 놓입니다.
          </>
        ) : (
          <>
            8차원 q, k(무작위로 고정)에 RoPE를 적용했습니다. 차원 쌍마다 회전 속도 θ가 다르고, 위쪽은 그중 한 쌍을 평면에 그린 것입니다. 두 화살표가 함께 돌면 사이각이 그대로라서 내적도 그대로입니다. 아래쪽에서 RoPE 점수(색)는 두 위치를 함께 옮겨도 평평하지만, 위치 벡터를 더하는 방식(회색)은 같은 거리인데도 점수가 출렁입니다.
          </>
        )
      }
    >
      <Seg
        value={view}
        onChange={setView}
        options={[
          { value: 'sin', label: '사인파 위치 인코딩' },
          { value: 'rope', label: 'RoPE' },
        ]}
      />
      {view === 'sin' ? <SinusoidPanel /> : <RopePanel />}
      <Legend
        items={
          view === 'sin'
            ? [
                { color: 'var(--pos)', label: '값 > 0', shape: 'sq' },
                { color: 'var(--neg)', label: '값 < 0', shape: 'sq' },
                { color: 'var(--accent)', label: '실제 내적', shape: 'dot' },
              ]
            : [
                { color: 'var(--accent)', label: 'q (RoPE)', shape: 'ln' },
                { color: 'var(--pos)', label: 'k (RoPE)', shape: 'ln' },
                { color: 'var(--ink-3)', label: '위치 벡터 덧셈', shape: 'ln' },
              ]
        }
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: causal mask and the KV cache ─────────────── */

const TOKENS = ['나는', '오늘', '공원', '에서', '친구', '를', '만났', '다'];
const KV_D = 6;
const D_MODEL = 768;

interface KvPreset {
  id: string;
  label: string;
  L: number;
  H: number;
  dh: number;
  tok: number; // log2
}
const KV_PRESETS: KvPreset[] = [
  { id: 'gpt2', label: 'GPT-2 small', L: 12, H: 12, dh: 64, tok: 10 },
  { id: 'big', label: '32층', L: 32, H: 32, dh: 128, tok: 12 },
  { id: 'gqa', label: '32층 + GQA', L: 32, H: 8, dh: 128, tok: 15 },
];

function KvCacheFigure() {
  const P = usePalette();
  const [cache, setCache] = useState(true);
  const { q, k, v } = useMemo(() => {
    const r = rng(21);
    const row = () => Float64Array.from({ length: KV_D }, () => gauss(r) * 0.8);
    return { q: TOKENS.map(row), k: TOKENS.map(row), v: TOKENS.map(row) };
  }, []);
  const W = useMemo(() => causalWeights(q, k), [q, k]);
  const s = useStepper(TOKENS.length, 1.2, null);
  const t = Math.max(0, s.i); // useStepper can briefly report −1 when the first animation frame has a negative dt
  const [genLog, setGenLog] = useState(10);
  const nGen = 2 ** genLog;
  const [L, setL] = useState(12);
  const [H, setH] = useState(12);
  const [dh, setDh] = useState(64);
  const [tok, setTok] = useState(10);
  const [bytes, setBytes] = useState(2);
  const preset = KV_PRESETS.find((p) => p.L === L && p.H === H && p.dh === dh && p.tok === tok)?.id ?? 'custom';
  const kv = kvCacheBytes(L, H, dh, 2 ** tok, bytes);
  const kvTok = kvCacheBytes(L, H, dh, 1, bytes);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const N = TOKENS.length;
      const labW = 40;
      const top = 34;
      const kvCell = Math.max(7, Math.min(14, (w * 0.36) / (2 * KV_D + 3)));
      const kvW = KV_D * kvCell;
      const cell = Math.max(14, Math.min(34, (w - labW - 2 * kvW - 40) / N, (h - top - 8) / N));
      const mx = labW;
      const kx = mx + N * cell + 22;
      const vx = kx + kvW + 12;
      const Y = (i: number) => top + i * cell;
      const recomputed = (i: number) => i === t || (!cache && i < t);

      ctx.font = `600 12px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('어텐션 가중치', mx, 14);
      ctx.fillText('K', kx, top - 18);
      ctx.fillText('V', vx, top - 18);
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      for (let j = 0; j < N; j++) ctx.fillText(String(j + 1), mx + (j + 0.5) * cell, top - 4);

      for (let i = 0; i < N; i++) {
        const live = i <= t;
        // row label: the query token
        ctx.font = `${i === t ? 700 : 500} 12px ${P.fontBody}`;
        ctx.fillStyle = live ? P.ink : alpha(P.ink3, 0.6);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(TOKENS[i], mx - 5, Y(i) + cell / 2);
        for (let j = 0; j < N; j++) {
          const x = mx + j * cell;
          ctx.fillStyle = P.surface;
          ctx.fillRect(x, Y(i), cell, cell);
          if (j > i) {
            // masked: the future
            ctx.fillStyle = live ? P.surface2 : alpha(P.surface2, 0.5);
            ctx.fillRect(x, Y(i), cell, cell);
            if (live) {
              ctx.strokeStyle = alpha(P.ink3, 0.35);
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x + 3, Y(i) + cell - 3);
              ctx.lineTo(x + cell - 3, Y(i) + 3);
              ctx.stroke();
            }
          } else if (live) {
            const a = W[i][j];
            ctx.fillStyle = alpha(P.accent, (0.1 + 0.9 * a) * (recomputed(i) ? 1 : 0.45));
            ctx.fillRect(x, Y(i), cell, cell);
          }
          ctx.strokeStyle = P.line;
          ctx.strokeRect(x + 0.5, Y(i) + 0.5, cell - 1, cell - 1);
        }
        if (live && recomputed(i)) {
          ctx.strokeStyle = i === t ? P.ink : P.pos;
          ctx.lineWidth = 2;
          ctx.strokeRect(mx + 1, Y(i) + 1, (i + 1) * cell - 2, cell - 2);
        }
        // K and V rows
        for (const [bx, M] of [
          [kx, k],
          [vx, v],
        ] as const) {
          const ry = Y(i) + (cell - kvCell) / 2;
          for (let c = 0; c < KV_D; c++) {
            ctx.fillStyle = P.surface;
            ctx.fillRect(bx + c * kvCell, ry, kvCell, kvCell);
            if (live) {
              ctx.fillStyle = divColor(P, M[i][c], recomputed(i) ? 0.95 : 0.5);
              ctx.fillRect(bx + c * kvCell, ry, kvCell, kvCell);
            }
            ctx.strokeStyle = alpha(P.lineStrong, live ? 1 : 0.4);
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + c * kvCell + 0.5, ry + 0.5, kvCell - 1, kvCell - 1);
          }
          if (live) {
            ctx.strokeStyle = recomputed(i) ? (i === t ? P.ink : P.pos) : P.good;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx - 1, ry - 1, kvW + 2, kvCell + 2);
          }
        }
      }
    },
    [P, t, cache, W, k, v],
    { aspect: 1.55, maxHeight: 340, minHeight: 230 },
  );

  const fresh = cache ? 1 : t + 1;
  return (
    <Figure
      no={2}
      title="인과 마스크와 KV 캐시"
      hint="재생하고, 캐시를 끄고 켜 보세요"
      caption={
        <>
          한 토큰씩 생성하는 동안의 어텐션 하나입니다. 행은 질문(q)을 던지는 토큰, 열은 그 토큰이 보는 키(k)이고, 빗금 칸은 인과 마스크로 가린 미래입니다. 검은 테두리가 이번에 새로 들어온 토큰, 주황 테두리가 다시 계산하는 행, 초록 테두리가 캐시에서 그대로 꺼내 쓰는 행입니다. K, V 칸의 색은 벡터 값(주황 양수, 파랑 음수)입니다. 연산 수는 d = 768, d_ff = 4d인 층 하나의 곱셈-덧셈 횟수입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="seq-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${t + 1}번째 토큰 ${TOKENS[t]} 생성 중, ${cache ? 'KV 캐시 사용' : '캐시 없이 전부 다시 계산'}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="seq-note" aria-live="polite">
            {t + 1}번째 토큰 「{TOKENS[t]}」: q·k·v를 새로 만드는 토큰 {fresh}개{cache ? `, 캐시에서 꺼내 쓰는 K·V ${t}행` : ' (앞의 토큰까지 처음부터 다시)'} · 어텐션 점수 {cache ? t + 1 : ((t + 1) * (t + 2)) / 2}개 계산
          </div>
        </div>
        <div className="controls">
          <Seg
            value={cache ? 'on' : 'off'}
            onChange={(x) => setCache(x === 'on')}
            options={[
              { value: 'on', label: 'KV 캐시 사용' },
              { value: 'off', label: '캐시 없음' },
            ]}
          />
          <StepControls s={s} id="kv-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="누적 연산, 캐시 없이" value={korNum(decodeMacs(t + 1, D_MODEL, false))} color={cache ? undefined : 'var(--pos)'} />
            <Readout label="누적 연산, 캐시 사용" value={korNum(decodeMacs(t + 1, D_MODEL, true))} color={cache ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>

      <div className="seq-panel">
        <h4>길게 생성하면</h4>
        <div className="seq-grid2">
          <Slider id="kv-n" label="생성할 토큰 수 n" value={genLog} min={3} max={14} step={1} onChange={setGenLog} format={(x) => (2 ** x).toLocaleString('ko-KR')} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="캐시 없이" value={korNum(decodeMacs(nGen, D_MODEL, false))} />
            <Readout label="캐시 사용" value={korNum(decodeMacs(nGen, D_MODEL, true))} />
            <Readout label="차이" value={`${Math.round(decodeMacs(nGen, D_MODEL, false) / decodeMacs(nGen, D_MODEL, true)).toLocaleString('ko-KR')}배`} />
          </div>
        </div>
      </div>

      <div className="seq-panel">
        <h4>KV 캐시가 차지하는 메모리</h4>
        <Seg
          value={preset}
          onChange={(id) => {
            const p = KV_PRESETS.find((x) => x.id === id);
            if (p) {
              setL(p.L);
              setH(p.H);
              setDh(p.dh);
              setTok(p.tok);
            }
          }}
          options={KV_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        />
        <div className="seq-grid2">
          <Slider id="kv-l" label="층 수" value={L} min={1} max={96} step={1} onChange={setL} />
          <Slider id="kv-h" label="K·V 헤드 수" value={H} min={1} max={96} step={1} onChange={setH} />
          <Slider id="kv-dh" label="헤드 차원" value={dh} min={32} max={256} step={32} onChange={setDh} />
          <Slider id="kv-tok" label="문맥 토큰 수" value={tok} min={7} max={17} step={1} onChange={setTok} format={(x) => (2 ** x).toLocaleString('ko-KR')} />
        </div>
        <Seg
          label="숫자 하나의 크기"
          value={bytes}
          onChange={setBytes}
          options={[
            { value: 4, label: '4바이트' },
            { value: 2, label: '2바이트' },
            { value: 1, label: '1바이트' },
          ]}
        />
        <div className="seq-formula">
          2 × {L}층 × {H}헤드 × {dh}차원 × {(2 ** tok).toLocaleString('ko-KR')}토큰 × {bytes}바이트 = {kv.toLocaleString('ko-KR')}바이트
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="토큰 하나당" value={bytesStr(kvTok)} />
          <Readout label="문맥 전체 (수열 하나)" value={bytesStr(kv)} color="var(--accent)" />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '새 토큰', shape: 'sq' },
          { color: 'var(--pos)', label: '다시 계산', shape: 'sq' },
          { color: 'var(--good)', label: '캐시에서 재사용', shape: 'sq' },
          { color: 'var(--surface-2)', label: '마스크(미래)', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: parameters and FLOPs ─────────────── */

interface CfgPreset {
  id: string;
  label: string;
  cfg: TfConfig;
  known?: string;
}
const CFG_PRESETS: CfgPreset[] = [
  { id: 'toy', label: '장난감', cfg: { d: 128, layers: 4, heads: 4, dff: 512, vocab: 1000, ctx: 256, learnedPos: true, tied: true } },
  { id: 'gpt2', label: 'GPT-2 small', cfg: { d: 768, layers: 12, heads: 12, dff: 3072, vocab: 50257, ctx: 1024, learnedPos: true, tied: true }, known: '흔히 124M(약 1억 2,400만) 모델이라 부릅니다' },
  { id: 'gpt2xl', label: 'GPT-2 XL', cfg: { d: 1600, layers: 48, heads: 25, dff: 6400, vocab: 50257, ctx: 1024, learnedPos: true, tied: true }, known: '흔히 1.5B(약 15억) 모델이라 부릅니다' },
  { id: 'gpt3', label: 'GPT-3', cfg: { d: 12288, layers: 96, heads: 96, dff: 49152, vocab: 50257, ctx: 2048, learnedPos: true, tied: true }, known: '논문에 적힌 크기는 1,750억 개입니다' },
];
const sameCfg = (a: TfConfig, b: TfConfig) => (Object.keys(a) as (keyof TfConfig)[]).every((k) => a[k] === b[k]);

function ParamFigure() {
  const [cfg, setCfg] = useState<TfConfig>(CFG_PRESETS[1].cfg);
  const preset = CFG_PRESETS.find((p) => sameCfg(p.cfg, cfg));
  const set = (patch: Partial<TfConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const pb = countParams(cfg);
  const fl = flopsPerToken(cfg);
  const headDim = cfg.d / cfg.heads;
  const parts = [
    { name: '토큰 임베딩', v: pb.tokenEmb, color: 'var(--ink-3)' },
    { name: '위치 임베딩', v: pb.posEmb, color: 'var(--c-stats-2)' },
    { name: '어텐션', v: pb.attn, color: 'var(--accent)' },
    { name: 'MLP', v: pb.mlp, color: 'var(--pos)' },
    { name: '정규화', v: pb.norm, color: 'var(--good)' },
    ...(cfg.tied ? [] : [{ name: '출력 층', v: pb.head, color: 'var(--neg)' }]),
  ];
  const maxV = Math.max(...parts.map((p) => p.v));

  return (
    <Figure
      no={3}
      title="파라미터와 계산량 세기"
      hint="프리셋을 고르거나 크기를 직접 바꿔 보세요"
      caption={
        <>
          GPT-2와 같은 구조(모든 선형 층에 편향, 블록마다 층 정규화 2개와 마지막 층 정규화, 학습되는 위치 임베딩, 출력 층은 토큰 임베딩과 공유)를 가정해 셉니다. 막대 길이는 가장 큰 항목을 기준으로 맞췄습니다. FLOPs는 곱셈-덧셈 하나를 2로 세고, 문맥이 가득 찼을 때 토큰 하나를 처리하는 순전파 기준입니다.
        </>
      }
    >
      <div className="seq-tight">
        <Seg value={preset?.id ?? 'custom'} onChange={(id) => { const p = CFG_PRESETS.find((x) => x.id === id); if (p) setCfg(p.cfg); }} options={CFG_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
      </div>
      <div className="fig-split">
        <div className="seq-col">
          <div className="seq-bars" role="img" aria-label={`파라미터 구성: ${parts.map((p) => `${p.name} ${korNum(p.v)}`).join(', ')}`}>
            {parts.map((p) => (
              <div key={p.name} className="seq-prow">
                <span className="name">{p.name}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(p.v / maxV) * 100}%`, background: p.color }} />
                </span>
                <span className="num">
                  {korNum(p.v)} · {((p.v / pb.total) * 100).toFixed(p.v / pb.total < 0.01 ? 2 : 1)}%
                </span>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <Readout label="총 파라미터" value={pb.total.toLocaleString('ko-KR')} color="var(--accent)" />
            <Readout label="임베딩 제외" value={korNum(pb.nonEmb)} />
            <Readout label="순전파 FLOPs/토큰" value={korNum(fl.total)} />
            <Readout label="2 × 파라미터" value={korNum(2 * pb.total)} />
            <Readout label="어텐션 점수 몫" value={`${((fl.attention / fl.total) * 100).toFixed(1)}%`} />
            <Readout label="학습 FLOPs/토큰 (≈3배)" value={korNum(3 * fl.total)} />
          </div>
          <div className="seq-check" data-off={!preset?.known || undefined}>
            {preset?.known ? (
              <>
                {preset.label}: 계산값 <strong className="mono">{pb.total.toLocaleString('ko-KR')}</strong>개 ≈ {korNum(pb.total)}. {preset.known}.
              </>
            ) : (
              <>GPT-2 small, GPT-2 XL, GPT-3 프리셋을 고르면 계산값을 공개된 크기와 맞춰 봅니다.</>
            )}
          </div>
        </div>
        <div className="controls">
          <Slider id="pc-d" label="d_model" value={cfg.d} min={64} max={12288} step={64} onChange={(d) => set({ d, dff: Math.round((cfg.dff / cfg.d) * d) })} />
          <Slider id="pc-l" label="층 수" value={cfg.layers} min={1} max={96} step={1} onChange={(layers) => set({ layers })} />
          <Slider id="pc-h" label="헤드 수" value={cfg.heads} min={1} max={128} step={1} onChange={(heads) => set({ heads })} format={(h) => `${h} (헤드 차원 ${Number.isInteger(cfg.d / h) ? cfg.d / h : (cfg.d / h).toFixed(1)})`} />
          <Slider id="pc-ff" label="d_ff / d_model" value={cfg.dff / cfg.d} min={1} max={8} step={0.5} onChange={(r) => set({ dff: Math.round(r * cfg.d) })} format={(r) => `${r}배`} />
          <Slider id="pc-v" label="어휘 크기" value={cfg.vocab} min={1000} max={256000} step={1} onChange={(vocab) => set({ vocab })} format={(v) => v.toLocaleString('ko-KR')} />
          <Slider id="pc-c" label="문맥 길이" value={Math.log2(cfg.ctx)} min={7} max={17} step={1} onChange={(x) => set({ ctx: 2 ** x })} format={(x) => (2 ** x).toLocaleString('ko-KR')} />
          <Check label="학습되는 위치 임베딩" checked={cfg.learnedPos} onChange={(learnedPos) => set({ learnedPos })} />
          <Check label="출력 층을 임베딩과 공유" checked={cfg.tied} onChange={(tied) => set({ tied })} />
          {!Number.isInteger(headDim) && <p className="seq-sub" style={{ color: 'var(--bad)' }}>d_model이 헤드 수로 나누어떨어지지 않습니다. 파라미터 수는 헤드 수와 상관없지만 실제 모델은 나누어떨어지게 정합니다.</p>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Transformer() {
  return (
    <>
      <h2>기초 과목의 블록에서 출발하기</h2>
      <p>
        <a href="#ai-basics/attention">기초 과목의 어텐션 장</a>에서 Q, K, V로 다른 토큰의 정보를 모으는 계산과, 어텐션과 피드포워드 층을 잔차 연결로 묶은 트랜스포머 블록을 보았습니다. <a href="#ai-basics/language-model">언어 모델 장</a>에서는 그 모델이 다음 토큰의 확률을 내고, 한 토큰씩 붙여 가며 문장을 만든다는 것을 보았습니다. 이 장에서는 그 블록을 실제 모델처럼 다룰 때 생기는 세 가지 질문을 계산으로 풉니다. 순서를 어떻게 알려 주나, 한 토큰씩 생성할 때 무엇을 아끼나, 파라미터와 계산은 어디에 쓰이나.
      </p>
      <p>
        여기서 계산하는 모델은 장난감 크기부터 수천억 개 파라미터까지 다양하지만, 들어 있는 부품은 모두 같습니다. 크기만 다를 뿐 같은 식을 따릅니다.
      </p>

      <h2>어텐션은 순서를 모른다</h2>
      <p>
        어텐션 점수는 두 토큰 벡터의 내적일 뿐이라서, 입력 토큰의 순서를 뒤섞으면 출력도 똑같이 뒤섞일 뿐 값은 바뀌지 않습니다. "개가 사람을 물었다"와 "사람이 개를 물었다"를 구별하려면 몇 번째 자리인지를 따로 알려 주어야 합니다. 2017년 트랜스포머 논문은 위치마다 정해진 벡터를 토큰 임베딩에 더했습니다.
      </p>
      <MB note="p는 위치, i는 차원 쌍의 번호(0부터 d/2 − 1까지), d는 벡터 차원입니다.">{'PE(p, 2i) = \\sin(p\\,\\omega_i), \\quad PE(p, 2i+1) = \\cos(p\\,\\omega_i), \\qquad \\omega_i = 10000^{-2i/d}'}</MB>
      <p>
        차원 쌍 하나는 위치가 하나 늘 때마다 각도 <M>{'\\omega_i'}</M>만큼 도는 시계바늘이라고 볼 수 있습니다. 앞쪽 쌍은 초침처럼 빨리, 뒤쪽 쌍은 시침보다도 느리게 돕니다. 여러 속도의 바늘을 함께 보면 위치를 헷갈리지 않고 읽을 수 있습니다. 게다가 <M>{'\\sin a \\sin b + \\cos a \\cos b = \\cos(a - b)'}</M>이므로 두 위치 벡터의 내적은 거리에만 달려 있습니다.
      </p>
      <MB>{'PE(p) \\cdot PE(p+\\Delta) = \\sum_{i=0}^{d/2-1} \\cos(\\Delta\\,\\omega_i)'}</MB>
      <PositionFigure />
      <p>
        사인파 보기에서 기준 위치 p를 움직여 보세요. 표에서 강조한 행은 바뀌지만, 아래 그래프의 점은 늘 같은 회색 곡선 위에 놓입니다. d = 64일 때 이웃한 위치끼리의 내적은 어느 p에서나 30.92이고(자기 자신과의 내적이 최댓값 d/2 = 32), 거리가 멀어질수록 대체로 줄어듭니다. GPT-2처럼 이 표를 고정된 식 대신 학습되는 파라미터로 두는 모델도 있습니다. 그러면 학습한 문맥 길이(GPT-2는 1,024)보다 먼 위치에는 쓸 벡터가 아예 없습니다.
      </p>

      <h2>RoPE: 더하지 말고 돌리기</h2>
      <p>
        위치 벡터를 더하면 점수 <M>{'(q + p_m)\\cdot(k + p_n)'}</M>에 <M>{'q\\cdot p_n'}</M>, <M>{'p_m\\cdot k'}</M>처럼 절대 위치에 따라 달라지는 항이 섞입니다. 같은 두 단어가 문장 앞에 있든 뒤에 있든 관계는 같아야 하는데, 점수가 위치 자체에 흔들리는 것입니다. <T en="rotary position embedding, RoPE">RoPE</T>(Su 외, 2021)는 위치 벡터를 더하는 대신 q와 k의 차원 쌍마다 위치에 비례하는 각도로 <strong>회전</strong>시킵니다.
      </p>
      <MB note="R(α)는 2차원 회전 행렬입니다. 회전 행렬은 RᵀR = I이고 R(a)ᵀR(b) = R(b − a)입니다.">{'\\big(R(m\\theta_i)\\,q\\big)\\cdot\\big(R(n\\theta_i)\\,k\\big) = q^{\\top} R\\big((n - m)\\theta_i\\big)\\, k, \\qquad \\theta_i = 10000^{-2i/d}'}</MB>
      <p>
        회전은 길이를 바꾸지 않으므로 토큰의 내용은 그대로이고, 두 벡터를 함께 같은 각도만큼 더 돌려도 사이각은 그대로입니다. 그래서 점수는 상대 거리 m − n에만 달려 있습니다. 그림 1의 RoPE 보기에서 "둘 다 +1"을 눌러 보세요. RoPE 점수는 소수 넷째 자리까지 변하지 않지만(이 글을 쓰며 m, n을 0~39, 이동 폭을 1, 7, 100으로 바꿔 가며 재 보니 차이가 10⁻¹⁴ 미만이었습니다), 위치 벡터를 더하는 방식은 같은 거리 3에서도 점수가 −0.4에서 2.5 사이를 오갑니다. RoPE는 어텐션 점수를 계산하기 직전에 q와 k에만 적용하고 v에는 적용하지 않습니다. 최근 공개된 대형 언어 모델 다수가 이 방식을 씁니다.
      </p>
      <Code label="사인파 위치 인코딩과 RoPE">{`
// 위치 pos의 사인파 위치 인코딩 (d차원) — 토큰 임베딩에 더한다
function sinusoidalPE(pos, d) {
  const pe = new Array(d);
  for (let i = 0; i < d / 2; i++) {
    const w = Math.pow(10000, -2 * i / d);      // 쌍마다 다른 회전 속도
    pe[2 * i] = Math.sin(pos * w);
    pe[2 * i + 1] = Math.cos(pos * w);
  }
  return pe;
}

// RoPE: q나 k의 차원 쌍 (x[2i], x[2i+1])을 pos·θ_i만큼 돌린다
function rope(x, pos) {
  const d = x.length, out = new Array(d);
  for (let i = 0; i < d / 2; i++) {
    const a = pos * Math.pow(10000, -2 * i / d);
    const c = Math.cos(a), s = Math.sin(a);
    out[2 * i]     = x[2 * i] * c - x[2 * i + 1] * s;
    out[2 * i + 1] = x[2 * i] * s + x[2 * i + 1] * c;
  }
  return out;
}
// 점수: dot(rope(q, m), rope(k, n)) — m과 n을 같이 옮겨도 값이 같다`}</Code>

      <h2>한 토큰씩 생성할 때: 인과 마스크와 KV 캐시</h2>
      <p>
        학습할 때는 문장 전체를 한 번에 넣고, 각 위치가 자기와 그 앞만 보도록 <T en="causal mask">인과 마스크</T>로 점수 행렬의 위쪽 삼각형을 가립니다(소프트맥스 전에 −∞를 더합니다). 모든 위치의 다음 토큰 예측을 한 번의 행렬 곱으로 학습할 수 있는 것이 이 덕분입니다.
      </p>
      <p>
        생성할 때는 사정이 다릅니다. 토큰을 하나 만들면 그것을 입력 끝에 붙이고 다시 모델을 돌립니다. 이때 인과 마스크 덕분에 생기는 중요한 성질이 있습니다. <strong>앞쪽 토큰들은 뒤에 붙은 토큰을 보지 않으므로, 그 토큰들의 k와 v는 새 토큰이 붙어도 변하지 않습니다.</strong> 모든 층에서 그렇습니다. 그러니 한 번 계산한 K, V를 저장해 두고, 새 토큰 하나의 q, k, v만 계산해 새 q로 저장된 모든 K를 훑으면 됩니다. 이것이 <T en="KV cache">KV 캐시</T>입니다.
      </p>
      <KvCacheFigure />
      <p>
        캐시가 없으면 t번째 토큰을 만들 때 앞의 t개 토큰을 처음부터 다시 계산하므로, n개를 생성하는 동안 투영과 MLP에 드는 연산이 <M>{'n^2'}</M>에 비례해 늘어납니다. 캐시를 쓰면 토큰마다 새 토큰 하나 몫(<M>{'12d^2'}</M>)과 저장된 키를 훑는 몫(<M>{'2td'}</M>)만 남습니다. d = 768인 층 하나로 1,024개 토큰을 생성하면 캐시 없이 약 3.99조 번, 캐시를 쓰면 약 80.5억 번의 곱셈-덧셈이 들어 약 495배 차이가 납니다. 캐시를 써도 어텐션 몫은 토큰마다 문맥 길이에 비례하므로 n개 전체로는 여전히 <M>{'n^2'}</M>에 비례합니다.
      </p>
      <p>대가는 메모리입니다. 층마다, K·V 헤드마다, 지나간 토큰마다 헤드 차원 크기의 벡터 두 개(k와 v)를 들고 있어야 합니다.</p>
      <MB>{'\\text{KV 캐시 바이트} = 2 \\times \\text{층 수} \\times \\text{K·V 헤드 수} \\times \\text{헤드 차원} \\times \\text{토큰 수} \\times \\text{숫자당 바이트}'}</MB>
      <p>
        GPT-2 small(12층, 12헤드, 헤드 차원 64)은 숫자를 2바이트로 저장하면 토큰 하나에 36KiB, 1,024토큰에 36MiB입니다. 32층·32헤드·헤드 차원 128인 구성이면 토큰 하나에 512KiB이고, 4,096토큰이면 2GiB, 32,768토큰이면 16GiB가 됩니다. 모델 가중치와 별개로, 동시에 처리하는 수열 수만큼 다시 곱해집니다. 그래서 여러 질문 헤드가 K·V 헤드를 나눠 쓰는 <T en="multi-query / grouped-query attention">MQA, GQA</T> 같은 방법이 나왔습니다. K·V 헤드를 32개에서 8개로 줄이면 같은 32,768토큰이 4GiB로 줄어듭니다.
      </p>
      <Code label="KV 캐시를 쓰는 생성 루프 (의사 코드)">{`
function generate(model, promptTokens, maxNew) {
  const cache = model.layers.map(() => ({ K: [], V: [] }));
  let tokens = [...promptTokens];
  let input = tokens;                            // 처음엔 프롬프트 전체
  for (let step = 0; step < maxNew; step++) {
    let x = input.map((tok, j) => model.embed(tok, tokens.length - input.length + j));
    for (const [l, layer] of model.layers.entries()) {
      const { q, k, v } = layer.project(layer.norm1(x)); // 새 토큰들 몫만 계산
      cache[l].K.push(...k);                     // 지난 K, V는 그대로 두고 덧붙인다
      cache[l].V.push(...v);
      x = add(x, layer.attend(q, cache[l].K, cache[l].V)); // 인과 마스크 포함
      x = add(x, layer.mlp(layer.norm2(x)));
    }
    const next = sample(model.logits(x[x.length - 1]));
    tokens.push(next);
    input = [next];                              // 다음 단계 입력은 새 토큰 하나뿐
  }
  return tokens;
}`}</Code>

      <h2>블록 안쪽: 잔차 흐름과 정규화의 위치</h2>
      <p>
        트랜스포머 블록을 보는 유용한 관점은 <T en="residual stream">잔차 흐름</T>입니다. 토큰마다 d차원 벡터 하나가 맨 아래 임베딩에서 맨 위 출력까지 흘러가고, 각 어텐션과 MLP는 그 벡터를 읽어 계산한 결과를 <strong>더해 넣을</strong> 뿐입니다. 덧셈으로 이어진 이 지름길 덕분에 기울기가 수십 층을 지나도 잘 흐릅니다(<a href="#ai-deep-learning/init-norm">초기화와 정규화</a>의 잔차 연결).
      </p>
      <p>층 정규화를 어디에 두느냐에 따라 두 가지 배치가 있습니다.</p>
      <MB note="왼쪽: 2017년 원래 논문의 Post-LN. 오른쪽: GPT-2 이후 널리 쓰는 Pre-LN.">{'x \\leftarrow \\operatorname{LN}\\big(x + \\operatorname{Attn}(x)\\big) \\qquad\\text{vs.}\\qquad x \\leftarrow x + \\operatorname{Attn}\\big(\\operatorname{LN}(x)\\big)'}</MB>
      <p>
        원래 논문의 <T en="post-norm">Post-LN</T>은 더한 뒤에 정규화하므로, 잔차 흐름 자체가 층마다 정규화를 거칩니다. <T en="pre-norm">Pre-LN</T>은 각 부품의 입력에만 정규화를 걸고 잔차 흐름은 덧셈으로만 이어 두므로, 입력에서 출력까지 아무것도 곱해지지 않는 깨끗한 길이 생깁니다. 층을 깊게 쌓아도 학습이 안정적이어서 GPT-2부터 대부분의 대형 모델이 Pre-LN을 쓰고, 대신 마지막 블록 뒤에 층 정규화를 하나 더 둡니다. 그림 3의 파라미터 계산에 "마지막 층 정규화"가 들어가는 이유입니다.
      </p>

      <h2>파라미터는 어디에 있나</h2>
      <p>
        블록 하나의 가중치를 세어 봅시다. 어텐션은 <M>{'W_Q, W_K, W_V, W_O'}</M> 네 개가 모두 d×d이므로 <M>{'4d^2'}</M>입니다. 헤드를 여러 개로 나눠도 d를 쪼개 쓰는 것이라 개수는 같습니다. MLP는 d → d_ff → d의 두 층이라 <M>{'2\\,d\\,d_{ff}'}</M>이고, 보통 <M>{'d_{ff} = 4d'}</M>이므로 <M>{'8d^2'}</M>입니다. 블록 하나에 약 <M>{'12d^2'}</M>, 여기에 어휘 크기 × d의 임베딩 표가 더해집니다.
      </p>
      <ParamFigure />
      <p>
        GPT-2 small(d = 768, 12층, 어휘 50,257, 문맥 1,024)을 세면 124,439,808개로, 흔히 부르는 124M과 일치합니다. 이 중 토큰 임베딩이 약 3,860만 개(31%)로 꽤 큰 몫이고, MLP가 5,667만, 어텐션이 2,835만 개입니다. 같은 식으로 GPT-3(d = 12,288, 96층)를 세면 약 1,746억 개가 나와 논문의 1,750억과 맞고, 이때 임베딩의 몫은 0.4%도 안 됩니다. 모델이 커질수록 파라미터는 거의 다 <M>{'12\\,L\\,d^2'}</M>에 있습니다.
      </p>
      <p>
        계산량은 더 간단합니다. 토큰 하나가 지나갈 때 각 가중치는 곱셈-덧셈에 한 번씩 쓰이므로, 순전파 FLOPs는 대략 <strong>2 × 파라미터 수</strong>입니다. 학습은 역전파가 순전파의 약 2배라서 토큰당 약 6 × 파라미터 수가 듭니다. 여기에 어텐션 점수 계산(<M>{'QK^\\top'}</M>와 가중합)이 층마다 <M>{'4\\cdot n_{ctx}\\cdot d'}</M> FLOPs씩 더해집니다. GPT-2 small에서 문맥이 1,024로 가득 찼을 때 이 항은 순전파의 약 13%이고, 문맥을 길게 늘리면 이 몫이 커집니다.
      </p>

      <h2>긴 문맥의 비용</h2>
      <p>
        길이 n인 문장 전체에 셀프 어텐션을 계산하면 점수 행렬이 n × n이므로, 계산량은 <M>{'n^2 d'}</M>에 비례합니다. 문맥을 2배로 늘리면 이 부분의 계산은 4배가 됩니다. 단순하게 구현하면 n × n 행렬을 GPU 메모리에 통째로 써 두었다가 다시 읽어야 해서 메모리도 <M>{'n^2'}</M>에 비례합니다.
      </p>
      <p>
        <T en="FlashAttention">FlashAttention</T>(Dao 외, 2022)은 Q, K, V를 작은 블록으로 나눠 GPU의 빠른 칩 내부 메모리에서 소프트맥스와 가중합을 한꺼번에 처리하고, n × n 점수 행렬을 느린 메모리에 쓰지 않습니다. 결과는 근사가 아니라 정확히 같은 어텐션이고, 메모리 사용과 메모리 읽기·쓰기가 크게 줄어 실제로 훨씬 빨라집니다. 하지만 곱셈-덧셈 횟수 자체는 여전히 <M>{'n^2'}</M>에 비례합니다. 느린 메모리를 오가는 비용을 줄인 것이지, 이차 계산을 없앤 것은 아닙니다.
      </p>

      <Callout kind="key">
        어텐션은 순서를 모르므로 위치를 알려 주어야 합니다. 사인파 위치 인코딩은 위치 벡터를 더하고, RoPE는 q와 k를 위치만큼 돌려 점수가 상대 거리에만 달려 있게 합니다. 생성할 때는 인과 마스크 덕분에 지난 토큰의 K, V가 변하지 않으므로 KV 캐시로 재계산을 없애고, 그 대신 2 × 층 × 헤드 × 헤드 차원 × 토큰 × 바이트만큼 메모리를 씁니다. 파라미터는 블록마다 약 <M>{'12d^2'}</M>이고, 순전파 계산은 토큰당 약 2 × 파라미터 수에 문맥 길이에 비례하는 어텐션 항이 더해집니다.
      </Callout>
      <Quiz
        q="KV 캐시의 메모리 크기를 결정하는 요인이 아닌 것은?"
        options={['층 수', 'K·V 헤드 수와 헤드 차원', '문맥에 들어 있는 토큰 수', '어휘 크기']}
        answer={3}
        explain={
          <>
            KV 캐시는 층마다, K·V 헤드마다, 지나간 토큰마다 헤드 차원 크기의 k, v 벡터를 저장하므로 2 × 층 × 헤드 × 헤드 차원 × 토큰 × 바이트입니다. 어휘 크기는 임베딩 표와 출력 층의 크기를 정할 뿐, 캐시에 들어가는 벡터의 개수나 길이와는 상관없습니다.
          </>
        }
      />
    </>
  );
}

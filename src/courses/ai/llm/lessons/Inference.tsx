import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { rng } from '../../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { GROUP, OUTLIER_ROWS, QW, SPEC_P, SPEC_VOCAB, acceptRate, decodeStep, draftDist, expectedTokens, gb, korCount, makeWeights, num, quantStats, quantizeMatrix, specRound, specSpeedup, type OutlierKind, type Scheme, type SpecToken } from './serve';
import './serve.css';

function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, opts: { align?: CanvasTextAlign; color?: string; bold?: boolean } = {}) {
  ctx.font = `${opts.bold ? 700 : 500} 11px ${P.fontMono}`;
  const tw = ctx.measureText(text).width;
  const align = opts.align ?? 'center';
  const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  ctx.fillStyle = P.surface;
  ctx.fillRect(left - 3, y - 7, tw + 6, 14);
  ctx.fillStyle = opts.color ?? P.ink2;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

/* ─────────────── Figure 1: quantisation ─────────────── */

const SCHEME_LABEL: Record<Scheme, string> = { tensor: '텐서 하나', channel: '행마다', group: `${GROUP}개씩` };
const MODEL_PARAMS = 7e9;

function QuantFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<OutlierKind>('rows');
  const [bits, setBits] = useState(4);
  const [scheme, setScheme] = useState<Scheme>('tensor');
  const [viewMode, setViewMode] = useState<'w' | 'q' | 'err'>('err');
  const [row, setRow] = useState(OUTLIER_ROWS[0] + 1);
  const W = useMemo(() => makeWeights(kind), [kind]);
  const { Wq, scales } = useMemo(() => quantizeMatrix(W, bits, scheme), [W, bits, scheme]);
  const st = useMemo(() => quantStats(W, Wq, bits, scheme), [W, Wq, bits, scheme]);
  const geo = useRef({ x0: 0, y0: 0, cell: 1 });

  const heat = useCanvas2D(
    (ctx, { w, h }) => {
      const cell = Math.floor(Math.min((w - 34) / QW, (h - 22) / QW) * 4) / 4;
      const x0 = Math.round((w - cell * QW) / 2 + 12);
      const y0 = 16;
      geo.current = { x0, y0, cell };
      for (let i = 0; i < QW; i++)
        for (let j = 0; j < QW; j++) {
          const k = i * QW + j;
          let color: string;
          if (viewMode === 'err') color = alpha(P.bad, Math.min(1, Math.abs(W[k] - Wq[k]) / 0.5));
          else {
            const v = viewMode === 'w' ? W[k] : Wq[k];
            color = Wq[k] === 0 && viewMode === 'q' ? P.surface : alpha(v >= 0 ? P.pos : P.neg, Math.min(1, Math.abs(v) / 3) * 0.95);
          }
          ctx.fillStyle = color;
          ctx.fillRect(x0 + j * cell, y0 + i * cell, Math.ceil(cell), Math.ceil(cell));
        }
      if (scheme === 'group') {
        ctx.strokeStyle = P.lineStrong;
        ctx.lineWidth = 1;
        for (let g = 1; g < QW / GROUP; g++) {
          ctx.beginPath();
          ctx.moveTo(x0 + g * GROUP * cell + 0.5, y0);
          ctx.lineTo(x0 + g * GROUP * cell + 0.5, y0 + QW * cell);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = P.line;
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, QW * cell + 1, QW * cell + 1);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 1, y0 + row * cell - 1, QW * cell + 2, cell + 2);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(row), x0 - 4, y0 + (row + 0.5) * cell);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText('입력 →  (행: 출력 채널)', x0, y0 - 2);
    },
    [P, W, Wq, viewMode, row, scheme],
    { aspect: 1.25, maxHeight: 380, minHeight: 250 },
  );

  // one row on a number line: original values, the grid of levels, and where each value lands
  const strip = useCanvas2D(
    (ctx, { w, h }) => {
      const vals = Array.from({ length: QW }, (_, j) => W[row * QW + j]);
      const m = Math.max(...vals.map(Math.abs)) * 1.08;
      const pl = new Plot(ctx, w, h, P, { xMin: -m, xMax: m, yMin: 0, yMax: 1, pad: { l: 12, r: 12, t: 8, b: 20 } });
      const qmax = 2 ** (bits - 1) - 1;
      const scaleOf = (j: number) => scales[scheme === 'tensor' ? 0 : scheme === 'channel' ? row : row * (QW / GROUP) + Math.floor(j / GROUP)];
      // levels of the scale used for the first weight of the row (all of them for tensor / row scales)
      const shown = new Set<number>();
      for (let j = 0; j < QW; j += scheme === 'group' ? GROUP : QW) shown.add(scaleOf(j));
      ctx.lineWidth = 1;
      let li = 0;
      for (const s of shown) {
        ctx.strokeStyle = li === 0 ? P.lineStrong : alpha(P.ink3, 0.35);
        for (let q = -qmax; q <= qmax; q++) {
          const v = q * s;
          if (Math.abs(v) > m) continue;
          ctx.beginPath();
          ctx.moveTo(pl.X(v) + 0.5, pl.Y(0.92));
          ctx.lineTo(pl.X(v) + 0.5, pl.Y(0.08));
          ctx.stroke();
        }
        li++;
      }
      for (let j = 0; j < QW; j++) {
        const v = vals[j];
        const vq = Wq[row * QW + j];
        ctx.strokeStyle = alpha(P.bad, 0.5);
        ctx.beginPath();
        ctx.moveTo(pl.X(v), pl.Y(0.78));
        ctx.lineTo(pl.X(vq), pl.Y(0.24));
        ctx.stroke();
      }
      for (let j = 0; j < QW; j++) {
        pl.dot(vals[j], 0.78, 2.6, P.ink);
        pl.dot(Wq[row * QW + j], 0.24, 3.4, P.accent);
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of [-m / 1.08, 0, m / 1.08]) ctx.fillText(v.toFixed(1), pl.X(v), pl.pad.t + pl.ph + 5);
      tag(ctx, P, '원래 값', pl.X(-m) + 26, pl.Y(0.78) - 10, { align: 'left' });
      tag(ctx, P, '양자화 후', pl.X(-m) + 26, pl.Y(0.24) + 10, { align: 'left' });
    },
    [P, W, Wq, row, bits, scheme, scales],
    { height: 120 },
  );

  const onHeatClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = localPoint(e, e.currentTarget);
    const { y0, cell } = geo.current;
    const i = Math.floor((p.y - y0) / cell);
    if (i >= 0 && i < QW) setRow(i);
  };

  const levels = 2 ** bits - 1;
  const mem = (MODEL_PARAMS * st.bitsPerWeight) / 8;
  const rowOutlier = kind === 'rows' && OUTLIER_ROWS.includes(row);

  return (
    <Figure
      no={1}
      title="양자화: 비트를 줄이면 무엇을 잃나"
      hint="이상치 위치, 비트 수, 스케일 단위를 바꾸고 행을 눌러 보세요"
      caption={
        <>
          64×64 가중치 행렬(값은 대부분 표준정규분포)을 대칭 absmax 방식으로 양자화했습니다. 오차 보기에서는 |원래 값 − 양자화 값|이 0.5 이상이면 가장 진한 색입니다. 행을 누르면 그 행의 값 64개를 수직선에 펼쳐, 원래 값(위 줄)이 가장 가까운 눈금(세로선)으로 옮겨 가 양자화된 값(아래 줄)이 되는 모습을 보여 줍니다. 출력 오차는 무작위 입력 64개에 대한 ‖Wx − Ŵx‖ / ‖Wx‖입니다. 비트 수에는 스케일 하나당 16비트가 포함됩니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="sv-col">
          <div ref={heat.wrapRef} className="canvas-box" role="img" aria-label={`${bits}비트 ${SCHEME_LABEL[scheme]} 양자화: 가중치 오차 ${(st.relWeightErr * 100).toFixed(1)}%`}>
            <canvas ref={heat.canvasRef} onClick={onHeatClick} style={{ cursor: 'pointer' }} />
          </div>
          <p className="sv-sub">
            {row}번 행{rowOutlier ? ' (이상치 행)' : ''}: 눈금 간격 = 스케일 {scheme === 'group' ? `(${GROUP}개 묶음마다 다름, 진한 선은 첫 묶음)` : ''}
          </p>
          <div ref={strip.wrapRef} className="canvas-box" role="img" aria-label={`${row}번 행의 값과 양자화 눈금`}>
            <canvas ref={strip.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg
            label="이상치"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'none', label: '없음' },
              { value: 'rows', label: '행 3개' },
              { value: 'cols', label: '열 2개' },
            ]}
          />
          <Seg label="비트 수" value={bits} onChange={setBits} options={[8, 4, 3, 2].map((b) => ({ value: b, label: `${b}` }))} />
          <Seg label="스케일 단위" value={scheme} onChange={setScheme} options={(['tensor', 'channel', 'group'] as Scheme[]).map((s) => ({ value: s, label: SCHEME_LABEL[s] }))} />
          <Seg
            label="보기"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'w', label: '원래 W' },
              { value: 'q', label: '양자화 Ŵ' },
              { value: 'err', label: '오차' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="가중치 오차" value={`${(st.relWeightErr * 100).toFixed(1)}%`} color="var(--bad)" />
            <Readout label="출력 오차" value={`${(st.relOutErr * 100).toFixed(1)}%`} color="var(--bad)" />
            <Readout label="0이 된 가중치" value={`${Math.round(st.zeroFrac * 100)}%`} />
            <Readout label="눈금 수" value={`${levels}개`} />
            <Readout label="가중치당 비트" value={st.bitsPerWeight.toFixed(2)} />
            <Readout label="70억 개라면" value={gb(mem)} color="var(--accent)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '양수 가중치', shape: 'sq' },
          { color: 'var(--neg)', label: '음수 가중치', shape: 'sq' },
          { color: 'var(--bad)', label: '양자화 오차', shape: 'sq' },
          { color: 'var(--accent)', label: '양자화된 값', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: memory bandwidth sets the speed ─────────────── */

const PARAMS = [1e9, 3e9, 7e9, 13e9, 30e9, 70e9, 180e9, 400e9];
const BWS = [100, 200, 500, 1000, 2000, 3000, 5000, 8000];
const TFLOPS = [10, 25, 50, 100, 200, 400, 1000, 2000];
const CTXS = [0, 512, 1024, 2048, 4096, 8192, 16384, 32768];

function RooflineFigure() {
  const P = usePalette();
  const [pi, setPi] = useState(2);
  const [bits, setBits] = useState(16);
  const [bwi, setBwi] = useState(3);
  const [fi, setFi] = useState(3);
  const [lb, setLb] = useState(0);
  const [ci, setCi] = useState(3);
  const [kvKiB, setKvKiB] = useState(128);
  const cfg = (batch: number) => ({ params: PARAMS[pi], bitsPerWeight: bits, bandwidth: BWS[bwi] * 1e9, flops: TFLOPS[fi] * 1e12, batch, context: CTXS[ci], kvPerToken: kvKiB * 1024 });
  const batch = 2 ** lb;
  const c = decodeStep(cfg(batch));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 10, yMin: 0, yMax: 6, pad: { l: 52, r: 14, t: 14, b: 30 } });
      pl.grid({ xStep: 1, yStep: 1, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= 10; x += 2) ctx.fillText(String(2 ** x), pl.X(x), pl.pad.t + pl.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const ylab = ['1', '10', '100', '1천', '1만', '10만', '100만'];
      for (let y = 0; y <= 6; y++) ctx.fillText(ylab[y], pl.pad.l - 6, pl.Y(y));
      const xs = Array.from({ length: 101 }, (_, i) => i / 10);
      const L = (v: number) => Math.log10(Math.max(1e-3, v));
      const line = (f: (b: number) => number, color: string, width: number, dash?: number[]) => {
        ctx.save();
        pl.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(pl.X(x), pl.Y(L(f(2 ** x)))) : ctx.moveTo(pl.X(x), pl.Y(L(f(2 ** x))))));
        ctx.stroke();
        ctx.restore();
      };
      // the achieved curve first, so the dashed ceilings stay visible where it runs along one of them
      line((b) => decodeStep(cfg(b)).throughput, alpha(P.accent, 0.55), 5);
      line((b) => decodeStep(cfg(b)).perSeq, P.ink3, 1.6, [2, 3]);
      line((b) => b / decodeStep(cfg(b)).tMem, P.neg, 1.8, [6, 4]);
      line((b) => b / decodeStep(cfg(b)).tCompute, P.pos, 1.8, [6, 4]);
      const y = L(c.throughput);
      pl.dot(lb, y, 5.5, P.surface, P.accent, 2.5);
      tag(ctx, P, `${num(c.throughput)} 토큰/초`, pl.X(lb), pl.Y(y) - 15, { color: P.ink, bold: true, align: lb > 7 ? 'right' : lb < 2 ? 'left' : 'center' });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('배치 크기 (동시에 생성하는 수열 수)', pl.pad.l + pl.pw, pl.pad.t + pl.ph - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('초당 토큰 (로그 눈금)', pl.pad.l + 6, pl.pad.t + 4);
    },
    [P, pi, bits, bwi, fi, ci, kvKiB, lb],
    { aspect: 1.7, maxHeight: 320, minHeight: 230 },
  );

  return (
    <Figure
      no={2}
      title="메모리가 속도를 정한다"
      hint="모델 크기, 비트 수, 배치 크기를 바꿔 보세요"
      caption={
        <>
          토큰 하나를 생성하는 한 단계에서 모든 가중치를 메모리에서 한 번 읽고(수열마다 2 × 파라미터 수 FLOP), 수열마다 자기 KV 캐시를 읽는다고 보고 계산한 값입니다. 메모리 읽기와 연산이 완벽히 겹친다고 가정해 둘 중 오래 걸리는 쪽이 한 단계의 시간입니다. 어텐션 연산, 활성값, 통신과 커널 실행 같은 부대 비용은 넣지 않았으므로 실제 속도는 이보다 느립니다. 대역폭과 연산 성능은 특정 제품이 아니라 직접 고르는 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="sv-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`배치 ${batch}: 전체 ${num(c.throughput)} 토큰/초, 수열당 ${num(c.perSeq)} 토큰/초, ${c.bound === 'memory' ? '메모리' : '연산'} 병목`}>
            <canvas ref={canvasRef} />
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '전체 처리량', shape: 'ln' },
              { color: 'var(--ink-3)', label: '수열 하나의 속도', shape: 'ln' },
              { color: 'var(--neg)', label: '메모리만 따지면', shape: 'ln' },
              { color: 'var(--pos)', label: '연산만 따지면', shape: 'ln' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }} aria-live="polite">
            <Readout label="가중치" value={gb(c.weightBytes)} />
            <Readout label="KV 캐시 (배치 전체)" value={gb(c.kvBytes)} />
            <Readout label="수열 하나의 속도" value={`${num(c.perSeq)} 토큰/초`} />
            <Readout label="전체 처리량" value={`${num(c.throughput)} 토큰/초`} color="var(--accent)" />
            <Readout label="산술 강도 / 균형점" value={`${num(c.intensity)} / ${num(c.ridge)}`} />
            <Readout label="병목" value={c.bound === 'memory' ? '메모리 대역폭' : '연산'} color={c.bound === 'memory' ? 'var(--neg)' : 'var(--pos)'} />
          </div>
        </div>
        <div className="controls">
          <Slider id="rf-p" label="파라미터 수" value={pi} min={0} max={PARAMS.length - 1} step={1} onChange={setPi} format={(i) => korCount(PARAMS[i])} />
          <Seg label="가중치당 비트" value={bits} onChange={setBits} options={[16, 8, 4].map((b) => ({ value: b, label: `${b}비트` }))} />
          <Slider id="rf-bw" label="메모리 대역폭" value={bwi} min={0} max={BWS.length - 1} step={1} onChange={setBwi} format={(i) => `${BWS[i].toLocaleString('ko-KR')} GB/s`} />
          <Slider id="rf-f" label="연산 성능" value={fi} min={0} max={TFLOPS.length - 1} step={1} onChange={setFi} format={(i) => `${TFLOPS[i].toLocaleString('ko-KR')} TFLOPS`} />
          <Slider id="rf-b" label="배치 크기" value={lb} min={0} max={10} step={1} onChange={setLb} format={(v) => String(2 ** v)} />
          <Slider id="rf-c" label="수열당 문맥 토큰" value={ci} min={0} max={CTXS.length - 1} step={1} onChange={setCi} format={(i) => CTXS[i].toLocaleString('ko-KR')} />
          <Seg label="토큰당 KV 캐시" value={kvKiB} onChange={setKvKiB} options={[32, 128, 512].map((v) => ({ value: v, label: `${v}KiB` }))} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: speculative decoding ─────────────── */

const SIM_CAP = 30000;

function SpecFigure() {
  const P = usePalette();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [k, setK] = useState(4);
  const [quality, setQuality] = useState(0.5);
  const [cost, setCost] = useState(0.05);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const q = useMemo(() => draftDist(quality), [quality]);
  const alphaTh = acceptRate(SPEC_P, q);
  const sim = useRef({ r: rng(17), counts: new Array(SPEC_VOCAB.length).fill(0) as number[], tokens: 0, rounds: 0, accepted: 0, proposed: 0, recent: [] as SpecToken[][] });
  const [, setTick] = useState(0);

  const reset = () => {
    sim.current = { r: rng(17), counts: new Array(SPEC_VOCAB.length).fill(0), tokens: 0, rounds: 0, accepted: 0, proposed: 0, recent: [] };
    setTick((t) => t + 1);
  };
  useEffect(reset, [k, quality]);

  const runRounds = (n: number) => {
    const s = sim.current;
    for (let t = 0; t < n && s.rounds < SIM_CAP; t++) {
      const out = specRound(SPEC_P, q, k, s.r);
      s.rounds++;
      for (const o of out) {
        if (o.kind !== 'rej') {
          s.counts[o.tok]++;
          s.tokens++;
        }
        if (o.kind === 'acc' || o.kind === 'rej') s.proposed++;
        if (o.kind === 'acc') s.accepted++;
      }
      s.recent = [out, ...s.recent].slice(0, 6);
    }
    setTick((x) => x + 1);
  };
  const s = sim.current;
  const done = s.rounds >= SIM_CAP;
  useAnimationFrame(() => runRounds(s.rounds < 60 ? 1 : 300), playing && inView && !done);

  const emp = s.counts.map((c) => (s.tokens ? c / s.tokens : 0));
  const tvEmp = emp.reduce((a, v, i) => a + Math.abs(v - SPEC_P[i]), 0) / 2;
  const tvQ = q.reduce((a, v, i) => a + Math.abs(v - SPEC_P[i]), 0) / 2;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(0.35, ...q) * 1.08;
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: SPEC_VOCAB.length, yMin: 0, yMax, pad: { l: 40, r: 10, t: 12, b: 24 } });
      pl.grid({ xStep: 100, yStep: 0.1, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = 0; v <= yMax; v += 0.1) ctx.fillText(v.toFixed(1), pl.pad.l - 5, pl.Y(v));
      const bw = (pl.X(1) - pl.X(0)) * 0.3;
      SPEC_VOCAB.forEach((name, i) => {
        const cx = pl.X(i + 0.5);
        ctx.fillStyle = alpha(P.neg, 0.55);
        ctx.fillRect(cx - bw * 1.05, pl.Y(q[i]), bw, pl.Y(0) - pl.Y(q[i]));
        ctx.fillStyle = P.pos;
        ctx.fillRect(cx + 0.05 * bw, pl.Y(emp[i]), bw, pl.Y(0) - pl.Y(emp[i]));
        // target p as a bracket over both bars
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - bw * 1.3, pl.Y(SPEC_P[i]));
        ctx.lineTo(cx + bw * 1.3, pl.Y(SPEC_P[i]));
        ctx.stroke();
        ctx.fillStyle = P.ink2;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(name, cx, pl.pad.t + pl.ph + 5);
      });
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pl.pad.l, pl.Y(0) + 0.5);
      ctx.lineTo(pl.pad.l + pl.pw, pl.Y(0) + 0.5);
      ctx.stroke();
    },
    [P, q, s.tokens],
    { aspect: 2.1, maxHeight: 260, minHeight: 190 },
  );

  const perPass = s.rounds ? s.tokens / s.rounds : 0;

  return (
    <Figure
      no={3}
      title="추측 디코딩: 초안을 쓰고 한 번에 검사"
      hint="초안 모델의 품질과 k를 바꿔 보세요"
      caption={
        <>
          토큰 8개짜리 장난감 어휘입니다. 검은 가로선이 큰 모델(타깃)의 분포 p, 파란 막대가 작은 초안 모델의 분포 q, 주황 막대가 추측 디코딩이 실제로 내놓은 토큰의 비율입니다. 아래 줄들은 최근 라운드로, 초록은 받아들인 초안, 줄 그은 빨강은 거절된 초안, 주황은 거절 자리에 타깃이 다시 뽑은 토큰, 노랑은 초안을 모두 받아들였을 때 덤으로 얻는 토큰입니다. 실제 모델은 문맥마다 p와 q가 바뀌지만, 여기서는 매 자리의 분포가 같다고 단순화했습니다.
        </>
      }
    >
      <div ref={figRef} className="fig-split">
        <div className="sv-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`토큰 ${s.tokens}개 생성: 출력 분포와 p의 차이 ${tvEmp.toFixed(3)}, 초안 q와 p의 차이 ${tvQ.toFixed(3)}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="sv-rounds" aria-hidden="true">
            {s.recent.map((round, n) => (
              <div key={s.rounds - n} className="sv-round">
                <span className="n">#{s.rounds - n}</span>
                {round.map((t, j) => (
                  <span key={j} className="sv-tok" data-k={t.kind}>
                    {SPEC_VOCAB[t.tok]}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          <Slider id="sp-k" label="초안 길이 k" value={k} min={1} max={8} step={1} onChange={setK} />
          <Slider id="sp-q" label="초안 모델 품질" value={quality} min={0} max={0.95} step={0.05} onChange={setQuality} format={(v) => v.toFixed(2)} />
          <Slider id="sp-c" label="초안 토큰 비용 c (타깃 대비)" value={cost} min={0.01} max={0.5} step={0.01} onChange={setCost} format={(v) => v.toFixed(2)} />
          <div className="btn-row">
            <Button small primary onClick={() => setPlaying((p) => !p)} disabled={done} label={playing && !done ? '일시정지' : '재생'}>
              {playing && !done ? '❚❚ 멈춤' : '▶ 계속 생성'}
            </Button>
            <Button small onClick={() => runRounds(1)} disabled={done}>
              한 라운드
            </Button>
            <Button small onClick={reset}>
              처음부터
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }} aria-live="polite">
            <Readout label="수락률 α (식)" value={alphaTh.toFixed(3)} />
            <Readout label="수락률 (실측)" value={s.proposed ? (s.accepted / s.proposed).toFixed(3) : '—'} />
            <Readout label="타깃 1회당 토큰 (식)" value={expectedTokens(alphaTh, k).toFixed(2)} color="var(--accent)" />
            <Readout label="타깃 1회당 토큰 (실측)" value={s.rounds ? perPass.toFixed(2) : '—'} color="var(--accent)" />
            <Readout label="출력과 p의 거리" value={s.tokens ? tvEmp.toFixed(3) : '—'} color="var(--pos)" />
            <Readout label="초안 q와 p의 거리" value={tvQ.toFixed(3)} color="var(--neg)" />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="예상 속도 향상" value={`${specSpeedup(alphaTh, k, cost).toFixed(2)}배`} color="var(--good)" />
            <Readout label="라운드 · 토큰" value={`${s.rounds.toLocaleString('ko-KR')} · ${s.tokens.toLocaleString('ko-KR')}`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '타깃 분포 p', shape: 'ln' },
          { color: 'color-mix(in srgb, var(--neg) 55%, transparent)', label: '초안 분포 q', shape: 'sq' },
          { color: 'var(--pos)', label: '추측 디코딩의 출력', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Inference() {
  return (
    <>
      <h2>생성 한 단계에 무슨 일이 일어나나</h2>
      <p>
        언어 모델의 응답은 두 단계로 만들어집니다. 먼저 프롬프트 전체를 한 번에 통과시켜 각 위치의 K, V를 계산해 캐시에 담는 <T en="prefill">프리필</T>, 그다음 토큰을 하나씩 생성하는 <T en="decode">디코딩</T>입니다(<a href="#ai-deep-learning/transformer">트랜스포머</a>의 KV 캐시). 프리필은 수백, 수천 개 토큰을 큰 행렬 곱 하나로 처리하므로 계산 장치를 바쁘게 씁니다. 문제는 디코딩입니다.
      </p>
      <p>
        디코딩 한 단계에서 새 토큰은 하나뿐인데, 그 토큰 하나를 위해 모든 층의 모든 가중치를 메모리에서 계산 장치로 한 번씩 읽어 와야 합니다. 가중치 하나를 읽어 곱셈과 덧셈 한 번(2 FLOP)만 하고 버리는 셈입니다. 오늘날의 GPU 같은 가속기는 메모리에서 바이트를 읽어 오는 속도보다 계산 속도가 훨씬 빨라서, 이 단계는 거의 언제나 <strong>메모리를 읽는 시간</strong>에 묶입니다. 그래서 추론을 빠르게 하는 방법 대부분은 세 가지 중 하나입니다.
      </p>
      <ol>
        <li>읽을 바이트를 줄인다: 가중치를 적은 비트로 저장하는 <strong>양자화</strong></li>
        <li>한 번 읽은 가중치를 여러 수열이 나눠 쓴다: <strong>배치</strong></li>
        <li>한 번 읽을 때 토큰을 여러 개 만든다: <strong>추측 디코딩</strong></li>
      </ol>
      <p>이 장은 셋을 차례로 계산합니다. 숫자는 장난감 크기이거나 공식에서 나온 값이지만, 실제 대형 모델도 같은 원리로 움직입니다.</p>

      <h2>양자화: 숫자를 적은 비트로</h2>
      <p>
        학습된 가중치는 보통 16비트 부동소수점(fp16이나 bf16)으로 저장합니다. 70억 개면 14GB입니다. 이것을 8비트 정수로 바꾸면 7GB, 4비트면 3.5GB가 됩니다. 가장 단순한 방법은 <T en="absmax quantization">absmax 대칭 양자화</T>입니다. 묶음 안에서 절댓값이 가장 큰 값이 정수 범위의 끝에 오도록 스케일을 정하고, 모든 값을 그 스케일로 나눠 반올림합니다.
      </p>
      <MB note="b비트면 정수는 −(2^(b−1) − 1)부터 2^(b−1) − 1까지, 눈금이 2^b − 1개입니다. 4비트면 −7…7의 15개입니다.">{'s = \\frac{\\max_i |w_i|}{2^{b-1}-1}, \\qquad q_i = \\operatorname{round}\\!\\left(\\frac{w_i}{s}\\right), \\qquad \\hat w_i = s\\, q_i'}</MB>
      <p>
        저장하는 것은 정수 <M>{'q_i'}</M>들과 스케일 <M>{'s'}</M> 하나입니다. 계산할 때는 <M>{'\\hat w_i = s\\,q_i'}</M>로 되살려 씁니다. 값을 되살려도 원래 값은 아니고, 가장 가까운 눈금으로 옮겨진 값입니다. 눈금 간격이 바로 <M>{'s'}</M>이므로 오차는 한 값당 최대 <M>{'s/2'}</M>입니다.
      </p>
      <QuantFigure />
      <p>
        처음 화면은 4비트, 스케일 하나로 행렬 전체를 양자화한 것입니다. 이상치 행 3개는 값이 다른 행보다 8배 큽니다. 스케일은 가장 큰 값에 맞춰지므로 눈금 간격이 넓어지고, 평범한 행의 값은 대부분 0으로 뭉개집니다. 가중치의 86%가 0이 되고 가중치 오차는 42.8%입니다. 이상치가 없을 때(17.6%)의 두 배가 넘습니다. 평범한 행을 눌러 수직선을 보세요. 값 64개가 눈금 한두 개로 몰립니다.
      </p>
      <p>
        스케일 단위를 "행마다"로 바꾸면 이상치 행은 자기 스케일을, 평범한 행은 촘촘한 자기 스케일을 가지므로 오차가 11.1%로 떨어집니다. 그런데 이상치를 "열 2개"로 바꾸면 사정이 다릅니다. 이상치가 모든 행에 하나씩 끼어 있어서 행마다 스케일을 둬도 23.2%에 머물고, 한 행을 다시 {GROUP}개씩 묶어 스케일을 따로 둬야 12.0%로 내려갑니다. 이상치가 든 묶음 하나만 손해를 보기 때문입니다. 실제로 Dettmers 등(2022, LLM.int8())은 큰 언어 모델의 활성값에서 소수의 특정 차원에만 유난히 큰 값이 몰리는 현상을 보고했고, 그 차원만 16비트로 따로 계산하는 방법을 제안했습니다.
      </p>
      <p>
        묶음을 작게 할수록 정확하지만 스케일도 저장해야 합니다. 이 그림처럼 {GROUP}개마다 16비트 스케일을 두면 가중치당 1비트가 더 들어 4비트가 사실상 5비트가 됩니다. 실제 시스템은 보통 64개나 128개씩 묶어 이 부담을 0.25비트, 0.125비트로 줄입니다. 8비트는 어느 설정에서나 오차가 몇 % 안쪽이고, 3비트와 2비트로 내려가면 단순한 반올림만으로는 버티기 어렵습니다. 그래서 4비트 이하에서는 소량의 보정용 데이터로 반올림 오차가 출력에 덜 퍼지도록 나머지 가중치를 조정하는 GPTQ(Frantar 등, 2022) 같은 방법을 쓰고, <a href="#ai-llm/lora">QLoRA</a>(Dettmers 등, 2023)는 4비트로 얼린 모델 위에서 LoRA를 학습합니다.
      </p>
      <Code label="absmax 양자화와 역양자화">{`
function quantize(w, bits) {
  const qmax = 2 ** (bits - 1) - 1;          // 4비트면 7
  const scale = Math.max(...w.map(Math.abs)) / qmax;
  const q = Int8Array.from(w, (x) =>
    Math.max(-qmax, Math.min(qmax, Math.round(x / scale))));
  return { q, scale };                        // 정수들 + 스케일 하나
}

const dequantize = ({ q, scale }) => Float32Array.from(q, (v) => v * scale);

// 묶음 단위: 한 행을 group개씩 잘라 묶음마다 quantize를 따로 부른다
function quantizeRow(row, bits, group = 128) {
  const parts = [];
  for (let i = 0; i < row.length; i += group) parts.push(quantize(row.slice(i, i + group), bits));
  return parts;
}`}</Code>
      <Callout kind="note">
        여기서 다룬 것은 가중치만 낮은 비트로 저장하고 계산은 16비트로 되살려 하는 <T en="weight-only quantization">가중치 양자화</T>입니다. 디코딩은 메모리 읽기가 병목이라 읽는 바이트만 줄여도 빨라집니다. 활성값까지 8비트로 바꿔 정수 연산으로 계산하는 방법도 있는데, 연산이 병목인 큰 배치나 프리필에서 효과가 큽니다.
      </Callout>

      <h2>메모리 대역폭이 속도를 정한다</h2>
      <p>배치 크기가 1이면, 토큰 하나를 만드는 데 걸리는 시간의 하한은 가중치 전체를 한 번 읽는 시간입니다.</p>
      <MB note="배치 1, 메모리 병목일 때. KV 캐시를 읽는 몫은 뺐습니다.">{'\\text{초당 토큰} \\approx \\frac{\\text{메모리 대역폭 (바이트/초)}}{\\text{파라미터 수} \\times \\text{비트 수} / 8}'}</MB>
      <p>
        70억 파라미터를 16비트로 담으면 14GB이고, 대역폭이 1,000GB/s면 초당 약 71토큰이 상한입니다. 계산 성능을 두 배로 늘려도 이 숫자는 변하지 않습니다. 같은 모델을 4비트로 양자화하면 3.5GB라서 상한이 약 286토큰으로 네 배가 됩니다. 양자화가 메모리를 아끼는 데서 그치지 않고 속도까지 올리는 이유입니다.
      </p>
      <p>
        여러 사용자의 수열을 한 배치로 묶으면, 가중치를 한 번 읽어 와서 B개 수열에 모두 씁니다. 읽는 바이트는 거의 그대로인데 일은 B배가 되므로 처리량이 B배로 오릅니다. 이 효과는 연산이 따라가지 못할 때까지 계속됩니다. 읽은 바이트당 하는 연산을 <T en="arithmetic intensity">산술 강도</T>라고 하는데, 가중치만 따지면 16비트에서 배치 B의 산술 강도는 <M>{'2NB / 2N = B'}</M> FLOP/바이트입니다. 이것이 장치의 <M>{'\\text{연산 성능} / \\text{대역폭}'}</M>(그림 2의 균형점)을 넘으면 그때부터는 연산이 병목입니다. 이렇게 두 한계 중 낮은 쪽을 따라가는 그림을 <T en="roofline model">루프라인 모델</T>이라고 합니다.
      </p>
      <RooflineFigure />
      <p>
        처음 설정(70억, 16비트, 1,000GB/s, 100 TFLOPS)에서 문맥을 0으로 두면 균형점이 100이라 배치 100까지는 처리량이 배치에 비례해 늘고, 그 뒤로는 초당 약 7,143토큰에서 멈춥니다. 그런데 문맥을 2,048토큰으로 두면 이야기가 달라집니다. 수열마다 자기 KV 캐시(토큰당 128KiB면 수열 하나에 268MB)를 따로 읽어야 하기 때문입니다. 배치 64에서는 KV 캐시가 모두 17GB로 가중치(14GB)보다 커지고, 수열 하나의 속도는 초당 32토큰으로 반 넘게 느려지며 처리량은 약 2,053토큰에 그칩니다. 배치를 키울수록 KV 캐시를 읽는 몫이 커져서 연산 병목에 닿기 전에 처리량이 꺾입니다.
      </p>
      <p>
        그래서 실제 서빙에서는 KV 캐시 관리가 큰 일입니다. K·V 헤드를 줄이는 GQA로 캐시 자체를 작게 만들고, 운영체제의 페이지처럼 캐시를 작은 블록으로 나눠 메모리 낭비를 줄이는 PagedAttention(Kwon 등, 2023)을 쓰고, 끝난 수열을 바로 빼고 새 수열을 끼워 넣어 배치를 늘 채워 두는 <T en="continuous batching">연속 배치</T>를 씁니다. 처리량(전체 토큰/초)과 지연(수열 하나의 토큰/초)은 맞바꾸는 관계라서, 서비스가 무엇을 약속하느냐에 따라 배치 크기를 정합니다.
      </p>

      <h2>추측 디코딩: 작은 모델이 먼저 써 보기</h2>
      <p>
        그림 2에서 배치 1의 디코딩은 연산 장치가 대부분 놀고 있었습니다. 같은 가중치를 한 번 읽어서 토큰 1개 대신 5개를 검사해도 시간은 거의 같다는 뜻입니다. <T en="speculative decoding">추측 디코딩</T>(Leviathan 등, 2023; Chen 등, 2023)은 이 남는 연산을 씁니다.
      </p>
      <ol>
        <li>훨씬 작고 빠른 <strong>초안 모델</strong>이 다음 토큰 k개를 하나씩 뽑습니다. 각 자리의 분포를 q라고 합니다.</li>
        <li>
          큰 <strong>타깃 모델</strong>이 초안 k개를 붙인 입력을 <strong>한 번에</strong> 통과시켜, 각 자리에서 자기 분포 p를 얻습니다. 학습 때처럼 인과 마스크 덕분에 k+1개 자리를 한 번에 계산할 수 있습니다.
        </li>
        <li>
          앞에서부터 초안 토큰 x를 확률 <M>{'\\min\\big(1,\\, p(x)/q(x)\\big)'}</M>로 받아들입니다. 처음 거절된 자리에서는 <M>{'\\max(0,\\, p - q)'}</M>를 정규화한 분포에서 토큰을 새로 뽑고 그 라운드를 끝냅니다. k개를 모두 받아들였다면 타깃이 이미 계산해 둔 다음 자리의 p에서 하나를 더 뽑습니다.
        </li>
      </ol>
      <p>
        놀라운 점은 이 규칙이 타깃 모델 혼자 생성한 것과 <strong>정확히 같은 분포</strong>를 낸다는 것입니다. 어떤 토큰 x가 나올 확률은 "초안이 x를 뽑고 받아들여짐"과 "거절된 뒤 x를 새로 뽑음"의 합입니다.
      </p>
      <MB note="α = Σ min(p, q)는 초안이 받아들여질 확률입니다. 거절 확률 1 − α에 정규화된 max(0, p − q)를 곱하면 정규화 상수가 상쇄됩니다.">{'\\underbrace{q(x)\\min\\!\\Big(1, \\tfrac{p(x)}{q(x)}\\Big)}_{=\\,\\min(p(x),\\,q(x))} + (1-\\alpha)\\,\\frac{\\max(0,\\, p(x)-q(x))}{1-\\alpha} = p(x)'}</MB>
      <p>그러니 초안 모델이 엉터리여도 답의 품질은 변하지 않고, 속도만 덜 빨라질 뿐입니다. 그림 3에서 직접 확인해 보세요.</p>
      <SpecFigure />
      <p>
        초안 품질을 0으로 내려 q를 p와 크게 다르게 만들어도, 주황 막대(실제 출력)는 검은 선(p)에 붙어 있습니다. 파란 막대(q)를 그대로 썼다면 p와의 거리가 0.540이었을 텐데, 3만 라운드를 돌리면 출력과 p의 거리는 0.01 아래로 내려갑니다. 남은 차이는 표본이 유한해서 생기는 흔들림입니다.
      </p>
      <p>얼마나 빨라지는지는 수락률 α가 정합니다. 각 초안 토큰이 독립적으로 확률 α로 받아들여진다고 보면, 타깃을 한 번 돌릴 때 얻는 토큰 수의 기댓값은 이렇습니다.</p>
      <MB note="받아들여진 초안 i개와, 거절 자리의 대체 토큰 또는 덤 토큰 1개. k → ∞이면 1/(1 − α)로 수렴합니다.">{'\\mathbb{E}[\\text{타깃 1회당 토큰}] = 1 + \\alpha + \\alpha^2 + \\cdots + \\alpha^k = \\frac{1-\\alpha^{k+1}}{1-\\alpha}'}</MB>
      <p>
        처음 설정(품질 0.5, k = 4)에서 α는 0.730이고, 식은 타깃 1회당 2.94토큰을 예측하며 시뮬레이션도 같은 값으로 수렴합니다. 초안 토큰 하나의 비용이 타깃 한 번의 c배라면 한 라운드에 <M>{'kc + 1'}</M>만큼 시간이 들므로, 속도 향상은 위 기댓값을 <M>{'kc + 1'}</M>로 나눈 값입니다. c = 0.05면 2.45배입니다. k를 늘리면 덤으로 얻는 토큰은 늘지만 뒤쪽 초안일수록 받아들여질 확률이 <M>{'\\alpha^i'}</M>로 줄어 헛수고가 많아지므로, α와 c에 맞는 k가 따로 있습니다. 품질 0.5, c = 0.05에서 k를 1부터 8까지 바꿔 보면 속도 향상은 k = 6에서 가장 크고(2.53배), 그보다 길면 오히려 줄어듭니다.
      </p>
      <Code label="추측 샘플링: 받아들이기 / 거절하고 다시 뽑기">{`
// p: 타깃 분포, q: 초안 분포 (같은 자리, 같은 어휘)
function verify(x, p, q) {
  if (Math.random() < Math.min(1, p[x] / q[x])) return { token: x, accepted: true };
  const r = p.map((pi, i) => Math.max(0, pi - q[i]));   // p가 q보다 큰 몫만
  const z = r.reduce((a, b) => a + b, 0);
  return { token: sample(r.map((v) => v / z)), accepted: false };
}

function sample(dist) {
  let u = Math.random(), i = 0;
  while (i < dist.length - 1 && (u -= dist[i]) >= 0) i++;
  return i;
}

// 한 라운드: 초안 k개 중 처음 거절된 곳에서 멈춘다
// out = []; for (const [x, p, q] of drafts) { const v = verify(x, p, q); out.push(v.token); if (!v.accepted) break; }
// 모두 받아들였으면 타깃의 다음 자리 분포에서 하나 더 뽑아 붙인다`}</Code>
      <Callout kind="intuition">
        세 기법은 같은 사실에서 나옵니다. 디코딩 한 단계의 비용은 대부분 가중치를 읽는 데 듭니다. 양자화는 읽을 양을 줄이고, 배치는 한 번 읽은 것을 여러 수열이 나눠 쓰고, 추측 디코딩은 한 번 읽을 때 여러 토큰을 검사합니다.
      </Callout>

      <Callout kind="key">
        디코딩은 메모리 대역폭에 묶입니다. 배치 1의 생성 속도는 대략 대역폭 ÷ 모델 바이트입니다. 양자화는 모델 바이트를 줄여 속도와 메모리를 함께 얻지만, 스케일 하나에 묶인 값 중 큰 이상치가 나머지의 정밀도를 망치므로 행이나 작은 묶음마다 스케일을 둡니다. 배치는 연산이 병목이 될 때까지 처리량을 올리지만 KV 캐시를 읽는 몫이 함께 늘어납니다. 추측 디코딩은 수락 규칙 덕분에 출력 분포를 바꾸지 않으면서 타깃 1회당 <M>{'(1-\\alpha^{k+1})/(1-\\alpha)'}</M>개의 토큰을 얻습니다.
      </Callout>
      <Quiz
        q="배치 크기 1로 응답을 생성하는 챗봇이 너무 느리다. 다른 조건이 같다면 토큰 생성 속도를 가장 직접적으로 올리는 것은?"
        options={['연산 성능(FLOPS)이 두 배이고 메모리 대역폭은 같은 장치로 바꾼다', '가중치를 16비트에서 8비트로 양자화한다', '프롬프트를 절반으로 줄인다', '샘플링 temperature를 낮춘다']}
        answer={1}
        explain={
          <>
            배치 1의 디코딩은 매 토큰마다 가중치 전체를 읽는 시간에 묶여 있으므로, 읽을 바이트를 절반으로 줄이는 8비트 양자화가 속도를 거의 두 배로 올립니다. 연산 성능은 이미 남아돌아서 두 배로 해도 거의 변하지 않습니다. 프롬프트를 줄이면 프리필과 KV 캐시가 조금 줄 뿐 토큰당 가중치 읽기는 그대로이고, temperature는 어떤 토큰을 고를지만 바꿀 뿐 계산량과 무관합니다.
          </>
        }
      />
    </>
  );
}

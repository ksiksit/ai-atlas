import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { BW_TBS, KERNELS, PEAK_TFLOPS, RIDGE, WARP, attainable, divergence, simdInstrs, tileCount, type CondKind } from './simd';
import './parallel.css';
import './dataparallel.css';

function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}

/* ─────────────── Figure 1: one instruction, many lanes ─────────────── */

const N_VEC = 32;
const A = Array.from({ length: N_VEC }, (_, i) => i);
const B = Array.from({ length: N_VEC }, (_, i) => (i * 7) % 10);
const WIDTH_NAME: Record<number, string> = { 1: '스칼라', 4: 'SSE (4개)', 8: 'AVX (8개)', 16: 'AVX-512 (16개)' };

function SimdFigure() {
  const [width, setWidth] = useState(8);
  const instrs = simdInstrs(N_VEC, width);
  const s = useStepper(instrs + 1, 2, width);
  const done = Math.min(N_VEC, s.i * width);
  const lo = (s.i - 1) * width;
  const hi = s.i * width;
  const state = (i: number) => (s.i > 0 && i >= lo && i < hi ? 'now' : i < done ? 'done' : undefined);

  const rows = (h: number) => {
    const idx = Array.from({ length: 16 }, (_, j) => h * 16 + j);
    return (['a', 'b', 'c'] as const).map((r) => (
      <div key={r + h} style={{ display: 'contents' }}>
        <span className="row-l">{r}</span>
        {idx.map((i) => {
          const st = state(i);
          const v = r === 'a' ? A[i] : r === 'b' ? B[i] : i < done ? A[i] + B[i] : '';
          return (
            <span key={i} className="dp-cell" data-done={(r === 'c' ? st === 'done' : st !== undefined) || undefined} data-now={st === 'now' || undefined}>
              {v}
            </span>
          );
        })}
      </div>
    ));
  };

  return (
    <Figure
      no={1}
      title="c = a + b를 레인 여러 개로"
      hint="레인 수를 바꾸고 재생해 보세요"
      caption={<>원소 32개짜리 배열 두 개를 더합니다. 진한 칸이 지금 명령어 하나가 한꺼번에 더하는 원소들이고, 연한 칸은 이미 끝난 원소입니다. 레인 수가 명령어 하나에 들어가는 원소 수입니다. x86 CPU의 SSE는 32비트 수 4개, AVX는 8개, AVX-512는 16개를 한 번에 다룹니다.</>}
    >
      <div className="controls row">
        <Seg label="명령어 하나의 레인 수" value={width} onChange={setWidth} options={[1, 4, 8, 16].map((w) => ({ value: w, label: WIDTH_NAME[w] }))} />
      </div>
      <div className="fig-split">
        <div className="pd-col">
          <div className="dp-vec" role="img" aria-label={`원소 ${N_VEC}개 배열 덧셈. 레인 ${width}개, 명령어 ${instrs}개 중 ${Math.max(0, s.i)}개 실행, 원소 ${done}개 끝남`}>
            {rows(0)}
            <span className="gap" />
            {rows(1)}
          </div>
          <div className="pd-note" aria-live="polite">
            {s.i === 0
              ? `명령어 ${instrs}개로 끝납니다. 재생을 눌러 보세요.`
              : `명령어 ${s.i}: 원소 ${lo}번부터 ${Math.min(hi, N_VEC) - 1}번까지 ${width}개를 한 번에 더합니다.${s.i === instrs ? ' 끝났습니다.' : ''}`}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="dp-simd-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="더하기 명령어" value={`${instrs}개`} />
            <Readout label="스칼라보다" value={`${32 / instrs}배 적음`} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: warps and divergence ─────────────── */

const N_WARPS = 4;
const COST_IF = 8;
const COST_ELSE = 4;

function DivergenceFigure() {
  const [kind, setKind] = useState<CondKind>('mod');
  const [k, setK] = useState(4);
  const [m, setM] = useState(1);
  const mm = Math.min(m, k);
  const r = useMemo(() => divergence(kind, k, mm, COST_IF, COST_ELSE, N_WARPS), [kind, k, mm]);
  const best = useMemo(() => divergence('warp', 1, 0, COST_IF, COST_ELSE, N_WARPS), []);
  const cond = kind === 'mod' ? `i % ${k} < ${mm}` : '(i / 32) % 2 == 0';
  const nDiv = r.warps.filter((w) => w.diverged).length;

  return (
    <Figure
      no={2}
      title="워프 안에서 갈라지는 분기"
      hint="조건을 바꿔 워프가 갈라지는지 보세요"
      caption={<>스레드 128개가 32개씩 워프 4개로 묶여 있습니다. 칸 하나가 스레드 하나이고, 주황색은 if 쪽({COST_IF}사이클), 파란색은 else 쪽({COST_ELSE}사이클)을 가는 스레드입니다. 워프는 명령어 하나를 32개 스레드에 동시에 내리므로, 한 워프 안에 두 쪽이 섞이면 if 쪽을 먼저 실행하는 동안 else 스레드는 꺼져서 쉬고, 그다음 반대로 합니다. 막대는 워프마다 걸린 사이클입니다.</>}
    >
      <div className="controls row">
        <Seg
          label="조건"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'mod', label: '스레드 번호로' },
            { value: 'warp', label: '워프 번호로' },
          ]}
        />
        {kind === 'mod' && (
          <>
            <Slider id="dp-k" label="k" value={k} min={1} max={8} step={1} onChange={setK} />
            <Slider id="dp-m" label="m" value={mm} min={0} max={k} step={1} onChange={setM} />
          </>
        )}
      </div>
      <div className="dp-code" aria-label="커널 코드">{`if (${cond}) {   // ${COST_IF}사이클 분량\n  ...\n} else {           // ${COST_ELSE}사이클 분량\n  ...\n}`}</div>
      <div className="fig-split" style={{ marginTop: 12 }}>
        <div className="dp-warps" role="img" aria-label={`조건 ${cond}. 워프 4개 중 ${nDiv}개가 갈라짐. 전체 ${r.cycles}사이클, 레인 사용률 ${Math.round(r.utilization * 100)}%`}>
          {r.warps.map((w, wi) => {
            const nIf = w.lanes.filter(Boolean).length;
            return (
              <div key={wi} className="dp-warp">
                <span className="wl">워프 {wi}</span>
                <div className="dp-lanes">
                  {w.lanes.map((t, j) => (
                    <span key={j} className="dp-lane" style={{ ['--c' as string]: t ? 'var(--neg)' : 'var(--pos)' }} />
                  ))}
                </div>
                <div className="dp-bar-row">
                  <div className="dp-bar" style={{ width: `${(w.cycles / (COST_IF + COST_ELSE)) * 100}%` }}>
                    {nIf > 0 && <span style={{ width: `${(COST_IF / w.cycles) * 100}%`, ['--c' as string]: 'var(--neg)' }} />}
                    {nIf < WARP && <span style={{ width: `${(COST_ELSE / w.cycles) * 100}%`, ['--c' as string]: 'var(--pos)' }} />}
                  </div>
                  <span className="cy" data-bad={w.diverged || undefined}>
                    {w.cycles}사이클
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="갈라진 워프" value={`${nDiv} / ${N_WARPS}`} color={nDiv ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="전체 사이클" value={r.cycles} />
            <Readout label="레인 사용률" value={`${Math.round(r.utilization * 100)}%`} color={r.utilization < 0.7 ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="갈라지지 않으면" value={`${best.cycles}사이클`} />
          </div>
          <div className="pd-note" aria-live="polite">
            {nDiv === 0
              ? '워프마다 모든 스레드가 같은 쪽으로 가므로 꺼지는 레인이 없습니다.'
              : `워프 ${nDiv}개가 두 쪽을 모두 실행합니다. 워프 하나에 ${COST_IF + COST_ELSE}사이클이 걸리고, 그동안 레인의 일부는 꺼져 있습니다.`}
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: `if 쪽 (${COST_IF}사이클)`, shape: 'sq' },
          { color: 'var(--pos)', label: `else 쪽 (${COST_ELSE}사이클)`, shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: the roofline ─────────────── */

const AI_MIN = 0.05;
const AI_MAX = 200;

function RooflineFigure() {
  const P = usePalette();
  const [lg, setLg] = useState(Math.log10(1 / 12));
  const ai = 10 ** lg;
  const perf = attainable(ai);
  const bound = ai < RIDGE ? 'memory' : 'compute';
  const near = KERNELS.reduce((a, k) => (Math.abs(Math.log10(k.ai) - lg) < Math.abs(Math.log10(a.ai) - lg) ? k : a));
  const onPreset = Math.abs(Math.log10(near.ai) - lg) < 1e-6;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 52, r: 16, t: 16, b: 40 };
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const yMin = 0.02;
      const yMax = 50;
      const X = (v: number) => pad.l + ((Math.log10(v) - Math.log10(AI_MIN)) / (Math.log10(AI_MAX) - Math.log10(AI_MIN))) * pw;
      const Y = (v: number) => pad.t + ph - ((Math.log10(v) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (const v of [0.1, 1, 10, 100]) {
        ctx.beginPath();
        ctx.moveTo(X(v) + 0.5, pad.t);
        ctx.lineTo(X(v) + 0.5, pad.t + ph);
        ctx.stroke();
        txt(ctx, String(v), X(v), pad.t + ph + 12, P.ink3, `10px ${P.fontMono}`, 'center');
      }
      for (const v of [0.1, 1, 10]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(pad.l + pw, Y(v) + 0.5);
        ctx.stroke();
        txt(ctx, String(v), pad.l - 6, Y(v), P.ink3, `10px ${P.fontMono}`, 'right');
      }
      txt(ctx, '산술 강도 (FLOP / 바이트)', pad.l + pw / 2, h - 8, P.ink3, `11px ${P.fontBody}`, 'center');
      ctx.save();
      ctx.translate(12, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      txt(ctx, 'TFLOP/s', 0, 0, P.ink3, `11px ${P.fontBody}`, 'center');
      ctx.restore();

      // memory-bound region tint
      ctx.fillStyle = alpha(P.pos, 0.06);
      ctx.fillRect(pad.l, pad.t, X(RIDGE) - pad.l, ph);

      // the roof
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(X(AI_MIN), Y(Math.max(yMin, attainable(AI_MIN))));
      ctx.lineTo(X(RIDGE), Y(PEAK_TFLOPS));
      ctx.lineTo(X(AI_MAX), Y(PEAK_TFLOPS));
      ctx.stroke();
      txt(ctx, `메모리 대역폭 ${BW_TBS} TB/s`, X(0.25) + 6, Y(0.25) - 14, P.pos, `600 11px ${P.fontBody}`);
      txt(ctx, `연산 최대 ${PEAK_TFLOPS} TFLOP/s`, X(AI_MAX) - 4, Y(PEAK_TFLOPS) - 10, P.ink2, `600 11px ${P.fontBody}`, 'right');
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(RIDGE) + 0.5, Y(PEAK_TFLOPS));
      ctx.lineTo(X(RIDGE) + 0.5, pad.t + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      txt(ctx, `${RIDGE}`, X(RIDGE) + 4, pad.t + ph - 10, P.ink3, `10px ${P.fontMono}`);

      // kernels
      for (const k of KERNELS) {
        const x = X(k.ai);
        const y = Y(attainable(k.ai));
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = P.ink3;
        ctx.fill();
      }
      // the reader's point
      const x = X(ai);
      const y = Y(perf);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = bound === 'memory' ? P.pos : P.neg;
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [P, ai, perf, bound],
    { height: 300 },
  );

  return (
    <Figure
      no={3}
      title="루프라인: 연산이 먼저 막히나, 메모리가 먼저 막히나"
      hint="산술 강도를 움직이거나 커널을 골라 보세요"
      caption={<>가로축은 메모리에서 1바이트를 가져올 때마다 하는 계산 횟수(산술 강도), 세로축은 낼 수 있는 성능입니다. 두 축 모두 로그 눈금입니다. 가상의 GPU는 1초에 {PEAK_TFLOPS}조 번 계산하고 메모리에서 1초에 {BW_TBS}TB를 읽습니다. 지붕선 아래만 도달할 수 있고, 연한 바탕(산술 강도 {RIDGE} 미만)에서는 계산 장치가 데이터를 기다립니다. 회색 점은 아래 커널들의 자리입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`루프라인 그림. 산술 강도 ${ai.toFixed(3)}에서 최대 ${perf.toFixed(2)} TFLOP/s, ${bound === 'memory' ? '메모리 대역폭에 막힘' : '연산 능력에 막힘'}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="dp-ai" label="산술 강도 (FLOP/바이트)" value={lg} min={Math.log10(AI_MIN)} max={Math.log10(AI_MAX)} step={0.01} onChange={setLg} format={(v) => (10 ** v < 1 ? (10 ** v).toFixed(3) : (10 ** v).toFixed(1))} />
          <div className="pd-chips" role="group" aria-label="커널 고르기">
            {KERNELS.map((k) => (
              <button key={k.id} type="button" className="btn small" aria-pressed={onPreset && near.id === k.id} onClick={() => setLg(Math.log10(k.ai))}>
                {k.name}
              </button>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="낼 수 있는 성능" value={`${perf < 1 ? perf.toFixed(3) : perf.toFixed(1)} TFLOP/s`} />
            <Readout label="최대 성능의" value={`${((perf / PEAK_TFLOPS) * 100).toFixed(perf / PEAK_TFLOPS < 0.1 ? 2 : 0)}%`} color={bound === 'memory' ? 'var(--bad)' : 'var(--good)'} />
          </div>
          <div className="pd-note" aria-live="polite">
            {onPreset ? `${near.name}: ${near.note} ` : ''}
            {bound === 'memory' ? '메모리가 데이터를 대 주는 속도가 성능을 정합니다.' : '계산 장치가 쉬지 않고 일합니다. 더 빨라지려면 계산 자체를 줄여야 합니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: tiled matrix multiply ─────────────── */

const N_MAT = 32;

function TileFigure() {
  const P = usePalette();
  const [t, setT] = useState(8);
  const [sel, setSel] = useState(0);
  const per = N_MAT / t;
  const tile = Math.min(sel, per * per - 1);
  const ti = Math.floor(tile / per);
  const tj = tile % per;
  const c = tileCount(N_MAT, t);
  const naive = tileCount(N_MAT, 1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 18;
      const cell = Math.max(2, Math.floor(Math.min((w - 2 * gap - 16) / 3, h - 40) / N_MAT));
      const side = cell * N_MAT;
      const x0 = Math.round((w - (3 * side + 2 * gap)) / 2);
      const y0 = 26;
      const mats = [
        { name: 'A', x: x0 },
        { name: 'B', x: x0 + side + gap },
        { name: 'C = A·B', x: x0 + 2 * (side + gap) },
      ];
      for (const m of mats) {
        ctx.fillStyle = P.surface2;
        ctx.fillRect(m.x, y0, side, side);
        txt(ctx, m.name, m.x + side / 2, y0 - 12, P.ink2, `600 12px ${P.fontBody}`, 'center');
      }
      // A: the row strip, B: the column strip this C tile needs
      ctx.fillStyle = alpha(P.neg, 0.28);
      ctx.fillRect(mats[0].x, y0 + ti * t * cell, side, t * cell);
      ctx.fillStyle = alpha(P.pos, 0.28);
      ctx.fillRect(mats[1].x + tj * t * cell, y0, t * cell, side);
      // tiles of the strips, one pair per step
      if (t > 1) {
        ctx.strokeStyle = P.ink3;
        ctx.lineWidth = 1;
        for (let k = 0; k < per; k++) {
          ctx.strokeRect(mats[0].x + k * t * cell + 0.5, y0 + ti * t * cell + 0.5, t * cell - 1, t * cell - 1);
          ctx.strokeRect(mats[1].x + tj * t * cell + 0.5, y0 + k * t * cell + 0.5, t * cell - 1, t * cell - 1);
        }
      }
      // C grid of tiles
      ctx.strokeStyle = P.line;
      for (let k = 0; k <= per; k++) {
        const p = k * t * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(mats[2].x + p, y0);
        ctx.lineTo(mats[2].x + p, y0 + side);
        ctx.moveTo(mats[2].x, y0 + p);
        ctx.lineTo(mats[2].x + side, y0 + p);
        ctx.stroke();
      }
      ctx.fillStyle = P.hl;
      ctx.fillRect(mats[2].x + tj * t * cell, y0 + ti * t * cell, t * cell, t * cell);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(mats[2].x + tj * t * cell, y0 + ti * t * cell, t * cell, t * cell);
      txt(ctx, `${N_MAT}×${N_MAT}`, x0, y0 + side + 14, P.ink3, `10px ${P.fontMono}`);
    },
    [P, t, ti, tj, per],
    { height: 230, minHeight: 180 },
  );

  return (
    <Figure
      no={4}
      title="행렬 곱을 타일로 나누기"
      hint="타일 크기를 바꾸고, 다른 타일을 골라 보세요"
      caption={<>C의 노란 타일 하나를 스레드 묶음(블록) 하나가 계산합니다. 그러려면 A에서 빨간 띠 전체, B에서 파란 띠 전체가 필요합니다. 타일 없이는 C의 원소마다 A의 행과 B의 열을 전역 메모리에서 따로 읽습니다. 타일을 쓰면 블록이 A 타일과 B 타일을 한 쌍씩 칩 안의 빠른 공유 메모리로 함께 가져와, 타일 안의 모든 스레드가 나눠 씁니다. 원소는 4바이트 실수입니다.</>}
    >
      <div className="controls row">
        <Seg label="타일 크기 T" value={t} onChange={setT} options={[1, 2, 4, 8, 16].map((v) => ({ value: v, label: v === 1 ? '없음' : `${v}×${v}` }))} />
        <Slider id="dp-tile" label="계산할 C 타일" value={tile} min={0} max={per * per - 1} step={1} onChange={setSel} format={(v) => `${v + 1} / ${per * per}`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`행렬 A, B, C. 크기 ${N_MAT}×${N_MAT}, 타일 ${t}×${t}. C의 타일 (${ti}, ${tj})를 계산하려면 A의 ${ti}번째 행 띠와 B의 ${tj}번째 열 띠가 필요합니다`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ marginTop: 12 }}>
        <Readout label="전역 메모리 읽기" value={c.loads.toLocaleString('ko-KR')} />
        <Readout label="타일 없을 때보다" value={t === 1 ? '같음' : `${naive.loads / c.loads}배 적음`} color={t > 1 ? 'var(--good)' : undefined} />
        <Readout label="산술 강도" value={`${c.ai} FLOP/B`} />
        <Readout label="블록의 공유 메모리" value={t === 1 ? '안 씀' : `${c.sharedBytes.toLocaleString('ko-KR')}바이트`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function DataParallel() {
  return (
    <>
      <h2>같은 일을 많은 데이터에</h2>
      <p>
        <a href={lessonHref('cs-parallel-distributed', 'amdahl')}>1장</a>과 <a href={lessonHref('cs-parallel-distributed', 'work-span')}>2장</a>의 병렬성은 서로 다른 일을 코어에 나눠 주는 것이었습니다. 그런데 많은 프로그램은 하는 일이 단순합니다. 사진의 픽셀 수백만 개를 똑같이 밝게 하고, 배열 두 개를 원소끼리 더하고, 행렬 곱의 수많은 곱셈과 덧셈을 합니다. 원소마다 하는 일이 같고 서로 기다릴 필요가 없습니다. 이런 일을 <T en="data parallelism">데이터 병렬</T>이라고 합니다.
      </p>
      <p>
        데이터 병렬에는 코어를 여러 개 두는 것보다 싼 방법이 있습니다. 명령어 하나가 원소 여러 개를 한꺼번에 처리하게 하는 것입니다. 명령어를 읽고 해독하는 회로는 하나만 두고, 덧셈기만 여러 개 나란히 놓습니다. 이것을 <T en="single instruction, multiple data">SIMD</T>라고 하고, 나란히 놓인 덧셈기 하나하나를 <T en="lane">레인</T>이라고 부릅니다.
      </p>
      <SimdFigure />
      <p>
        스칼라 명령어로는 32번 더해야 하지만, 레인 8개짜리 AVX로는 4번, 16개짜리 AVX-512로는 2번이면 됩니다. 요즘 컴파일러는 단순한 반복문을 보면 스스로 SIMD 명령어로 바꿉니다. 이것을 <T en="auto-vectorization">자동 벡터화</T>라고 합니다. 반복마다 앞의 결과를 쓰거나, 중간에 함수를 부르거나, 배열 두 개가 메모리에서 겹칠지 모르는 반복문은 벡터화되지 않습니다. 원소끼리 서로 기다리지 않는다는 보장이 있어야 한꺼번에 계산할 수 있기 때문입니다.
      </p>

      <h2>GPU: 레인을 수천 개로</h2>
      <p>
        <T en="graphics processing unit">GPU</T>는 이 생각을 끝까지 밀어붙인 칩입니다. CPU 코어는 분기 예측, 큰 캐시, 명령어 순서 바꾸기 같은 복잡한 장치로 스레드 하나를 최대한 빠르게 돌립니다. GPU는 그런 장치를 줄이고 그 자리에 단순한 계산 장치를 수천 개 넣습니다. 스레드 하나하나는 느리지만, 수만 개가 함께 돌아 전체 처리량이 큽니다. 원래 화면의 픽셀 수백만 개를 칠하려고 만든 칩인데, 같은 구조가 <a href={lessonHref('ai-basics', 'neural-network')}>신경망</a>의 행렬 계산에 꼭 맞아서 오늘날 인공지능 학습의 대부분이 GPU에서 이루어집니다.
      </p>
      <p>
        GPU 프로그램은 스레드 하나가 원소 하나를 맡는 모양으로 씁니다. 아래는 NVIDIA GPU의 CUDA로 쓴 벡터 덧셈입니다. 반복문이 없습니다. 이 함수(<T en="kernel">커널</T>)를 스레드 수백만 개가 동시에 실행하고, 스레드마다 자기 번호 <code>i</code>를 받아 그 원소만 계산합니다.
      </p>
      <Code label="CUDA 커널: 스레드 하나가 원소 하나">{`
__global__ void add(const float *a, const float *b, float *c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;  // 이 스레드의 번호
  if (i < n) c[i] = a[i] + b[i];
}

// CPU 쪽: 256개씩 묶은 블록을 n / 256개 띄운다
add<<<(n + 255) / 256, 256>>>(a, b, c, n);`}</Code>
      <p>
        스레드가 각자 따로 도는 것처럼 보이지만, 하드웨어는 스레드 32개를 <T en="warp">워프</T> 하나로 묶어 명령어 하나를 32개에 동시에 내립니다. 워프는 레인 32개짜리 SIMD입니다. 그래서 같은 워프의 스레드들이 if 문에서 서로 다른 쪽으로 가면 문제가 생깁니다. 워프는 한 번에 한 명령어만 내릴 수 있으므로, if 쪽을 실행하는 동안 else 스레드를 꺼 두고, 다음에 else 쪽을 실행하면서 if 스레드를 꺼 둡니다. 이것을 <T en="branch divergence">분기 발산</T>이라고 합니다.
      </p>
      <DivergenceFigure />
      <p>
        처음 설정인 <code>i % 4 &lt; 1</code>은 스레드 네 개 중 하나만 if 쪽으로 보냅니다. 워프 4개가 모두 갈라져서 워프마다 8 + 4 = 12사이클, 모두 48사이클이 걸리고 레인 사용률은 42%입니다. 조건을 <strong>워프 번호로</strong> 바꾸면 같은 128개 스레드 중 절반이 if, 절반이 else로 가는데도 24사이클이면 끝납니다. 워프 하나 안에서는 모두 같은 쪽으로 가기 때문입니다. GPU 프로그래머는 비슷한 일을 하는 데이터를 같은 워프에 모이도록 미리 정렬하거나, 분기 대신 계산으로 답을 고르는 식으로 발산을 피합니다. <code>m</code>을 0이나 <code>k</code>로 두면 조건이 모두 거짓이거나 모두 참이 되어 역시 발산이 사라집니다.
      </p>

      <h2>계산보다 데이터 나르기가 느리다</h2>
      <p>
        GPU의 계산 장치가 아무리 많아도, 계산할 데이터가 제때 도착하지 않으면 쉬게 됩니다. <a href={lessonHref('cs-architecture', 'memory-hierarchy')}>메모리 계층</a>에서 본 것처럼 메모리는 계산보다 훨씬 느리고, 이 차이는 GPU에서 더 큽니다. 그래서 커널의 성능을 볼 때는 바이트 하나를 메모리에서 가져올 때마다 계산을 몇 번 하는지를 셉니다. 이 비율이 <T en="arithmetic intensity">산술 강도</T>입니다. 산술 강도와 칩의 두 한계(연산 속도, 메모리 대역폭)를 한 그림에 그린 것이 <T en="roofline model">루프라인 모델</T>입니다.
      </p>
      <RooflineFigure />
      <p>
        벡터 더하기는 덧셈 한 번을 위해 12바이트를 옮기므로 산술 강도가 1/12입니다. 이 GPU에서 낼 수 있는 성능은 1초에 0.083조 번, 최대 성능의 0.42%입니다. 코드를 아무리 다듬어도 계산 장치의 99%가 데이터를 기다립니다. 벡터 더하기를 빨리 하는 방법은 메모리를 덜 옮기는 것뿐입니다. 반대로 산술 강도가 지붕이 꺾이는 점(20)을 넘으면 연산 능력이 한계가 되고, 그때부터는 계산을 빨리 하는 것이 중요해집니다.
      </p>
      <Callout kind="intuition">
        식당 주방에 요리사가 100명 있어도 재료를 나르는 사람이 한 명이면 요리사들은 대부분 서 있습니다. 재료 한 상자로 만드는 요리가 많을수록, 즉 산술 강도가 높을수록 요리사를 바쁘게 할 수 있습니다.
      </Callout>

      <h2>타일: 한 번 가져온 데이터를 여러 번 쓰기</h2>
      <p>
        행렬 곱 <code>C = A·B</code>는 산술 강도를 높일 여지가 많은 계산입니다. N×N 행렬끼리 곱하면 곱셈·덧셈이 <code>N³</code>쌍이지만, 서로 다른 입력 값은 <code>2N²</code>개뿐입니다. 입력 값 하나가 N번씩 다시 쓰입니다. 문제는 그 재사용을 어떻게 메모리 읽기 절약으로 바꾸느냐입니다. 가장 단순한 커널은 C의 원소마다 A의 행 하나와 B의 열 하나를 전역 메모리에서 새로 읽습니다. 같은 값을 다른 스레드가 이미 읽었어도 또 읽으므로 산술 강도가 1/4에 머뭅니다.
      </p>
      <p>
        <T en="tiling">타일링</T>은 C를 T×T 타일로 나누고, 타일 하나를 스레드 블록 하나가 맡게 합니다. 블록은 A와 B의 타일을 한 쌍씩 칩 안의 <T en="shared memory">공유 메모리</T>로 가져와 블록 안의 모든 스레드가 나눠 쓴 뒤 다음 쌍으로 넘어갑니다. 전역 메모리에서 가져온 값 하나가 T번 쓰이므로 읽기가 T분의 1로 줄어듭니다.
      </p>
      <TileFigure />
      <p>
        32×32 행렬에서 타일이 없으면 전역 메모리를 65,536번 읽습니다. 8×8 타일이면 8,192번으로 8분의 1이 되고, 블록 하나가 쓰는 공유 메모리는 A 타일과 B 타일을 합쳐 512바이트입니다. 타일을 키우면 읽기는 더 줄지만 공유 메모리를 더 많이 쓰고, 블록 수가 줄어 동시에 일할 블록이 모자랄 수 있습니다. 16×16 타일의 산술 강도 4는 그림 3에서 아직 메모리에 막히는 자리입니다. 실제 행렬 곱 라이브러리는 공유 메모리 타일 안에서 다시 레지스터로 작은 타일을 만들어 128×128 정도까지 묶고, 그래야 지붕에 닿습니다. 이것은 <a href={lessonHref('cs-architecture', 'memory-hierarchy')}>캐시</a>를 잘 쓰려고 CPU에서 하는 블로킹과 같은 생각입니다.
      </p>
      <Callout kind="note">
        인공지능 모델이 클수록 GPU 메모리와 대역폭이 귀해져서, 최근에는 계산을 조금 더 하더라도 메모리를 덜 옮기는 쪽을 택하는 기법이 많습니다. 어텐션 계산을 타일로 나눠 중간 행렬을 메모리에 쓰지 않는 FlashAttention이 대표적이고, 같은 생각이 <a href={lessonHref('ai-llm', 'inference')}>추론 최적화</a>에도 이어집니다.
      </Callout>

      <Callout kind="key">
        데이터 병렬은 같은 연산을 많은 원소에 서로 기다리지 않고 적용하는 일입니다. CPU의 SIMD 명령어는 레인 여러 개로 원소 여러 개를 한 번에 계산하고, GPU는 스레드 32개를 워프로 묶어 같은 명령어를 동시에 내립니다. 워프 안의 스레드가 분기에서 갈라지면 두 쪽을 차례로 실행해 레인이 놉니다. 성능의 한계는 연산 속도와 메모리 대역폭 중 산술 강도가 정하는 쪽이고, 타일링으로 한 번 가져온 데이터를 여러 번 쓰면 산술 강도가 올라갑니다.
      </Callout>
      <Quiz
        q="GPU에서 원소 1억 개짜리 배열에 y[i] = 2 * x[i] + y[i]를 계산하는 커널이 최대 연산 성능의 1%도 내지 못한다. 가장 알맞은 설명은?"
        options={['워프 안에서 분기가 갈라져 레인이 놀기 때문이다', '계산 한 번당 옮기는 바이트가 많아 메모리 대역폭에 막혔기 때문이다', '스레드 수가 너무 많아 GPU가 다 실행하지 못하기 때문이다', '곱셈이 덧셈보다 훨씬 느리기 때문이다']}
        answer={1}
        explain={<>원소마다 곱셈과 덧셈 2번을 위해 x와 y를 읽고 y를 써서 12바이트를 옮깁니다. 산술 강도가 1/6로, 그림 3의 지붕선에서 대역폭에 막히는 왼쪽 끝입니다. 이 커널에는 if 문이 없으니 분기 발산은 없고, 스레드가 많은 것은 GPU가 바라는 상황입니다. 빨라지려면 이 계산을 앞뒤의 다른 계산과 합쳐 같은 데이터를 한 번 읽을 때 더 많이 계산해야 합니다.</>}
      />
    </>
  );
}


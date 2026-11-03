import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { GrowthCurve, fmtKo, growthLabel, pushTrace, shrinkSim, type Growth, type OpPattern, type ShrinkRule } from './storage';
import './storage.css';

/** A short label on a surface-coloured backing so it stays legible over lines and bars. */
function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = `600 11px ${P.fontMono}`;
  const tw = ctx.measureText(text).width;
  const bx = align === 'right' ? x - tw - 4 : align === 'center' ? x - tw / 2 - 2 : x - 2;
  ctx.fillStyle = alpha(P.surface, 0.9);
  ctx.fillRect(bx, y - 8, tw + 6, 16);
  ctx.fillStyle = color;
  ctx.textAlign = align === 'right' ? 'right' : align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, align === 'right' ? x - 1 : x + 1, y + 0.5);
}

/* ─────────────── Figure 1: push, one at a time ─────────────── */

const PUSH_N = 48;
const PUSH_YMAX = 48;
const PUSH_POLICIES: { value: string; label: string; g: Growth }[] = [
  { value: 'x2', label: '×2', g: { kind: 'mul', f: 2 } },
  { value: 'x1.5', label: '×1.5', g: { kind: 'mul', f: 1.5 } },
  { value: 'p4', label: '+4', g: { kind: 'add', k: 4 } },
];
const COINS = 3;

function PushFigure() {
  const P = usePalette();
  const [pol, setPol] = useState('x2');
  const trace = useMemo(() => pushTrace(PUSH_N, PUSH_POLICIES.find((p) => p.value === pol)!.g), [pol]);
  const s = useStepper(PUSH_N + 1, 4, pol);
  const n = s.i; // pushes done so far
  const cur = n > 0 ? trace[n - 1] : null;
  const size = cur ? cur.size : 0;
  const cap = cur ? cur.cap : 1;
  let total = 0;
  let bank = 0;
  let broke = 0;
  for (let j = 0; j < n; j++) {
    total += trace[j].cost;
    bank += COINS - trace[j].cost;
    if (bank < 0 && !broke) broke = j + 1;
  }

  const note = !cur
    ? '빈 배열입니다. 용량 1짜리 블록 하나로 시작합니다. 재생하거나 한 단계씩 넘겨 보세요.'
    : cur.copies
      ? `push ${n}: 블록이 꽉 참 → 새 블록 (용량 ${n > 1 ? trace[n - 2].cap : 1} → ${cur.cap}), 원소 ${cur.copies}개 복사 + 새 원소 1개 쓰기 = 비용 ${cur.cost}`
      : `push ${n}: 빈 칸이 있음 → 새 원소 1개만 쓰기 = 비용 1`;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 10, t: 12, b: 24 };
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: PUSH_N, yMin: 0, yMax: PUSH_YMAX, pad });
      plot.grid({ xStep: 8, yStep: 8, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= PUSH_YMAX; y += 16) ctx.fillText(String(y), pad.l - 6, plot.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 8; x <= PUSH_N; x += 8) ctx.fillText(String(x), plot.X(x - 0.5), h - pad.b + 6);
      const bw = plot.sx;
      for (let j = 0; j < PUSH_N; j++) {
        const st = trace[j];
        const x = plot.X(j) + Math.max(0.5, bw * 0.12);
        const ww = Math.max(1, bw * 0.76);
        if (j >= n) {
          ctx.fillStyle = alpha(P.ink3, 0.12);
          ctx.fillRect(x, plot.Y(st.cost), ww, plot.Y(0) - plot.Y(st.cost));
          continue;
        }
        ctx.fillStyle = j === n - 1 ? P.ink : P.ink3;
        ctx.fillRect(x, plot.Y(1), ww, plot.Y(0) - plot.Y(1));
        if (st.copies) {
          ctx.fillStyle = j === n - 1 ? P.pos : alpha(P.pos, 0.75);
          ctx.fillRect(x, plot.Y(st.cost), ww, plot.Y(1) - plot.Y(st.cost));
        }
      }
      // running average: total cost so far / pushes so far
      if (n > 0) {
        ctx.strokeStyle = P.neg;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        let acc = 0;
        for (let j = 0; j < n; j++) {
          acc += trace[j].cost;
          const X = plot.X(j + 0.5);
          const Y = plot.Y(acc / (j + 1));
          if (j === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        const ax = plot.X(n - 0.5);
        const ay = plot.Y(total / n);
        tag(ctx, P, `평균 ${(total / n).toFixed(2)}`, ax + (n > PUSH_N - 14 ? -8 : 8), ay - 12, P.neg, n > PUSH_N - 14 ? 'right' : 'left');
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, plot.Y(0) + 0.5);
      ctx.lineTo(w - pad.r, plot.Y(0) + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('push 한 번의 비용', pad.l + 6, pad.t);
    },
    [P, trace, n, total],
    { aspect: 2.4, maxHeight: 250, minHeight: 190 },
  );

  return (
    <Figure
      no={1}
      title="push를 하나씩: 가끔 비싸지만 평균은 낮다"
      hint="재생하거나 한 단계씩 넘겨 보세요"
      caption={<>네모 칸이 늘어선 줄은 메모리 블록입니다. 칸 수가 용량이고, 채워진 칸 수가 크기입니다. 블록이 꽉 찬 채로 push하면 더 큰 블록을 새로 잡고 기존 원소를 모두 복사합니다. 막대는 push마다 든 비용(새 원소 쓰기 1 + 복사한 원소 수)이고, 파란 선은 지금까지의 총 비용을 push 횟수로 나눈 평균입니다. 흐린 막대는 앞으로 할 push입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="mem-row" aria-hidden="true">
            {Array.from({ length: cap }, (_, k) => (
              <span key={k} className="mem-cell" data-s={k >= size ? 'empty' : k === size - 1 ? 'new' : cur?.copies ? 'copied' : 'full'} />
            ))}
          </div>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`push ${n}번 후 크기 ${size}, 용량 ${cap}. 총 비용 ${total}, 평균 ${n ? (total / n).toFixed(2) : 0}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="sto-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Seg label="늘리는 방식" value={pol} onChange={setPol} options={PUSH_POLICIES.map((p) => ({ value: p.value, label: p.label }))} />
          <StepControls s={s} id="am-speed" maxSpeed={16} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="크기 / 용량" value={`${size} / ${cap}`} />
            <Readout label="빈 칸" value={`${cap - size}칸`} />
            <Readout label="총 비용" value={String(total)} color="var(--pos)" />
            <Readout label="총 비용 ÷ n" value={n ? (total / n).toFixed(2) : '—'} color="var(--neg)" />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={`push마다 ${COINS}씩 냈다면 남은 적립금`} value={broke ? `${bank} (push ${broke}에서 바닥남)` : String(bank)} color={broke ? 'var(--bad)' : 'var(--good)'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink-3)', label: '새 원소 쓰기 (1)', shape: 'sq' },
          { color: 'var(--pos)', label: '복사한 원소', shape: 'sq' },
          { color: 'var(--neg)', label: '평균 비용', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: growth policies over a million pushes ─────────────── */

const N_MAX = 1e6;
const GEOM: Growth[] = [
  { kind: 'mul', f: 2 },
  { kind: 'mul', f: 1.5 },
  { kind: 'mul', f: 1.25 },
];
const ADD_KS = [8, 64, 1024];

function PolicyFigure() {
  const P = usePalette();
  const [lg, setLg] = useState(5);
  const [k, setK] = useState(64);
  const [metric, setMetric] = useState<'cost' | 'waste'>('cost');
  const n = Math.round(10 ** lg);
  const geo = useMemo(() => GEOM.map((g) => new GrowthCurve(g, N_MAX)), []);
  const add = useMemo(() => new GrowthCurve({ kind: 'add', k }, N_MAX), [k]);
  const curves = [...geo, add];
  const policies: Growth[] = [...GEOM, { kind: 'add', k }];
  const colors = [P.pos, P.neg, P.good, P.bad];
  const colorVars = ['var(--pos)', 'var(--neg)', 'var(--good)', 'var(--bad)'];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cost = metric === 'cost';
      const pad = { l: cost ? 46 : 40, r: 12, t: 12, b: 26 };
      const plot = new Plot(ctx, w, h, P, { xMin: 1, xMax: 6, yMin: 0, yMax: cost ? 5 : 1, pad });
      plot.grid({ xStep: 1, yStep: cost ? 1 : 0.25, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
      for (let x = 1; x <= 6; x++) ctx.fillText('10' + SUP[x], plot.X(x), plot.Y(0) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      if (cost) for (let y = 0; y <= 5; y++) ctx.fillText(y === 0 ? '1' : y === 1 ? '10' : '10' + SUP[y], pad.l - 6, plot.Y(y));
      else for (let y = 0; y <= 1; y += 0.25) ctx.fillText(`${Math.round(y * 100)}%`, pad.l - 6, plot.Y(y));
      plot.clip();
      curves.forEach((c, ci) => {
        ctx.strokeStyle = colors[ci];
        ctx.lineWidth = ci === 3 ? 2.2 : 1.6;
        ctx.beginPath();
        let started = false;
        const cols = Math.round(plot.pw);
        for (let px = 0; px <= cols; px++) {
          const m = Math.max(1, Math.round(10 ** (1 + (5 * px) / cols)));
          const v = cost ? Math.log10(1 + c.copies(m) / m) : c.waste(m);
          const X = plot.pad.l + px;
          const Y = plot.Y(v);
          if (!started) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
          started = true;
        }
        ctx.stroke();
      });
      plot.unclip();
      // the n the table below reports
      const X = plot.X(lg);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X, pad.t);
      ctx.lineTo(X, plot.Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const title = cost ? 'push 한 번의 평균 비용' : '비어 있는 칸의 비율';
      ctx.font = `12px ${P.fontBody}`;
      const tw = ctx.measureText(title).width;
      ctx.fillStyle = alpha(P.surface, 0.9);
      ctx.fillRect(pad.l + 4, pad.t + 2, tw + 6, 17);
      ctx.fillStyle = P.ink2;
      ctx.fillText(title, pad.l + 7, pad.t + 4);
    },
    [P, metric, geo, add, lg],
    { aspect: 2, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={2}
      title="늘리는 비율과 메모리의 맞바꿈"
      hint="n과 고정 크기를 바꾸고, 보기를 바꿔 보세요"
      caption={<>빈 배열에 push를 n번 했을 때를 정확히 계산했습니다(가로축은 push 횟수 n, 로그 눈금). "평균 비용"은 (n + 총 복사 수) ÷ n을 로그 눈금으로, "빈 칸"은 블록에서 아직 쓰지 않은 칸의 비율입니다. 곱하는 방식은 블록을 새로 잡을 때마다 올림해서 적어도 그 비율만큼 늘립니다. 표의 "빈 칸 최대"는 n/2부터 n까지 push하는 동안 빈 칸 비율이 가장 컸던 순간입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`push ${n}번 했을 때 정책별 ${metric === 'cost' ? '평균 비용' : '빈 칸 비율'}`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={policies.map((g, i) => ({ color: colorVars[i], label: growthLabel(g), shape: 'ln' as const }))} />
      <div className="fig-cols">
        <div className="controls">
          <Slider id="am-n" label="push 횟수 n" value={lg} min={1} max={6} step={0.01} onChange={setLg} format={() => n.toLocaleString('ko-KR')} />
          <Seg label="고정 크기로 늘릴 때" value={k} onChange={setK} options={ADD_KS.map((x) => ({ value: x, label: `+${x}` }))} />
          <Seg
            label="보기"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'cost', label: '평균 비용' },
              { value: 'waste', label: '빈 칸' },
            ]}
          />
        </div>
        <div className="tbl-wrap">
          <table className="tbl am-tbl">
            <thead>
              <tr>
                <th>방식</th>
                <th>총 복사</th>
                <th>복사 ÷ n</th>
                <th>빈 칸 최대</th>
              </tr>
            </thead>
            <tbody>
              {curves.map((c, i) => {
                const cp = c.copies(n);
                return (
                  <tr key={i}>
                    <td>
                      <span className="am-sw" style={{ background: colorVars[i] }} />
                      {growthLabel(policies[i])}
                    </td>
                    <td className="num">{fmtKo(cp)}</td>
                    <td className="num">{(cp / n).toFixed(cp / n < 100 ? 2 : 0)}</td>
                    <td className="num">{Math.round(c.peakWaste(n, Math.ceil(n / 2)) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the shrinking trap ─────────────── */

const OPS = 120;
const RULES: { value: ShrinkRule; label: string }[] = [
  { value: 'none', label: '안 줄임' },
  { value: 'half', label: '절반 이하면' },
  { value: 'quarter', label: '¼ 이하면' },
];
const PATTERNS: { value: OpPattern; label: string }[] = [
  { value: 'alt', label: '교대' },
  { value: 'random', label: '무작위' },
  { value: 'wave', label: '물결' },
];

function ShrinkFigure() {
  const P = usePalette();
  const [rule, setRule] = useState<ShrinkRule>('half');
  const [pattern, setPattern] = useState<OpPattern>('alt');
  const [seed, setSeed] = useState(3);
  const steps = useMemo(() => shrinkSim(rule, pattern, OPS, rng(seed)), [rule, pattern, seed]);
  const total = steps.reduce((a, x) => a + x.cost, 0);
  const resizes = steps.filter((x) => x.copies > 0).length;
  const last = steps[steps.length - 1];
  const capMax = 128;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 10, t: 8, b: 8 };
      const split = Math.round(h * 0.52);
      const top = new Plot(ctx, w, split, P, { xMin: 0, xMax: OPS, yMin: 0, yMax: capMax, pad: { ...pad, t: 22 } });
      top.grid({ xStep: 20, yStep: 32, labels: false, axes: false });
      const bot = new Plot(ctx, w, h, P, { xMin: 0, xMax: OPS, yMin: 0, yMax: 70, pad: { ...pad, t: split + 22, b: 20 } });
      bot.grid({ xStep: 20, yStep: 35, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const y of [0, 64, 128]) ctx.fillText(String(y), pad.l - 6, top.Y(y));
      for (const y of [0, 35, 70]) ctx.fillText(String(y), pad.l - 6, bot.Y(y));
      // capacity (step) and size
      const line = (get: (i: number) => number, color: string, width: number, stepped: boolean) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(top.X(0), top.Y(get(-1)));
        for (let i = 0; i < OPS; i++) {
          if (stepped) ctx.lineTo(top.X(i), top.Y(get(i - 1)));
          ctx.lineTo(top.X(i + (stepped ? 0 : 1)), top.Y(get(i)));
        }
        if (stepped) ctx.lineTo(top.X(OPS), top.Y(get(OPS - 1)));
        ctx.stroke();
      };
      ctx.fillStyle = alpha(P.ink3, 0.14);
      ctx.beginPath();
      ctx.moveTo(top.X(0), top.Y(0));
      ctx.lineTo(top.X(0), top.Y(64));
      for (let i = 0; i < OPS; i++) {
        ctx.lineTo(top.X(i), top.Y(i ? steps[i - 1].cap : 64));
        ctx.lineTo(top.X(i), top.Y(steps[i].cap));
      }
      ctx.lineTo(top.X(OPS), top.Y(last.cap));
      ctx.lineTo(top.X(OPS), top.Y(0));
      ctx.closePath();
      ctx.fill();
      line((i) => (i < 0 ? 64 : steps[i].cap), P.ink, 1.6, true);
      line((i) => (i < 0 ? 64 : steps[i].size), P.neg, 2, false);
      // cost per op
      const bw = bot.sx;
      steps.forEach((st, i) => {
        const x = bot.X(i) + bw * 0.1;
        const ww = Math.max(1, bw * 0.8);
        ctx.fillStyle = P.ink3;
        ctx.fillRect(x, bot.Y(1), ww, bot.Y(0) - bot.Y(1));
        if (st.copies) {
          ctx.fillStyle = P.pos;
          ctx.fillRect(x, bot.Y(st.cost), ww, bot.Y(1) - bot.Y(st.cost));
        }
      });
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('용량(회색 면)과 크기(파란 선)', pad.l + 4, 4);
      ctx.fillText(`연산마다 든 비용 (연산 ${OPS}번)`, pad.l + 4, split + 4);
    },
    [P, steps],
    { aspect: 1.9, maxHeight: 340, minHeight: 280 },
  );

  return (
    <Figure
      no={3}
      title="줄이기의 함정"
      hint="줄이는 규칙과 연산 순서를 바꿔 보세요"
      caption={<>원소 64개로 꽉 찬 배열(용량 64)에서 시작해 push와 pop을 {OPS}번 합니다. 꽉 차면 두 배로 늘리고, pop한 뒤 규칙에 맞으면 용량을 절반으로 줄입니다. 늘리든 줄이든 남은 원소를 새 블록에 모두 복사합니다. "교대"는 push와 pop을 번갈아, "무작위"는 동전을 던져, "물결"은 16개가 될 때까지 pop하고 다시 64개까지 push하기를 되풀이합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`연산 ${OPS}번의 총 비용 ${total}, 크기 바꾸기 ${resizes}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="줄이는 규칙" value={rule} onChange={setRule} options={RULES} />
          <Seg label="연산 순서" value={pattern} onChange={setPattern} options={PATTERNS} />
          {pattern === 'random' && (
            <div className="btn-row">
              <Button small onClick={() => setSeed((x) => x + 1)}>
                동전 다시 던지기
              </Button>
            </div>
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="총 비용" value={String(total)} color="var(--pos)" />
            <Readout label="연산당 평균" value={(total / OPS).toFixed(2)} color={total / OPS > 5 ? 'var(--bad)' : 'var(--neg)'} />
            <Readout label="크기 바꾼 횟수" value={`${resizes}번`} />
            <Readout label="끝: 크기 / 용량" value={`${last.size} / ${last.cap}`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Amortized() {
  return (
    <>
      <h2>배열 끝에 하나 더</h2>
      <p>
        배열은 메모리에 <strong>칸이 이어 붙은 블록</strong> 하나입니다. 그래서 <code>a[i]</code>는 "블록 시작 주소 + i × 칸 크기"를 계산해 바로 찾아갈 수 있습니다. 대신 블록의 크기는 처음 잡을 때 정해집니다. 블록 바로 뒤의 메모리는 이미 다른 데이터가 쓰고 있을 수 있으므로, 블록을 제자리에서 늘린다는 보장은 없습니다.
      </p>
      <p>
        그런데 우리가 매일 쓰는 배열은 끝없이 <code>push</code>할 수 있습니다. JavaScript의 배열, Python의 <code>list</code>, Java의 <code>ArrayList</code>, C++의 <code>std::vector</code>, Go의 슬라이스가 모두 그렇습니다. 이들은 전부 같은 요령을 씁니다. 블록을 실제로 필요한 것보다 크게 잡아 두고, 지금까지 넣은 원소 수인 <T en="size">크기</T>와 블록의 칸 수인 <T en="capacity">용량</T>을 따로 기억합니다. 크기가 용량보다 작으면 다음 빈 칸에 쓰기만 하면 되고, 꽉 찼다면 더 큰 블록을 새로 잡아 원소를 모두 옮긴 뒤 예전 블록을 버립니다. 이런 배열을 <T en="dynamic array">동적 배열</T>이라고 합니다.
      </p>
      <PushFigure />
      <p>
        늘리는 방식을 ×2로 두고 재생해 보세요. 대부분의 push는 비용이 1이지만, 크기가 1, 2, 4, 8, 16, 32일 때 push하면 원소를 모두 옮기느라 비용이 껑충 뜁니다. push 33은 원소 32개를 복사하므로 비용이 33입니다. 그런데 파란 평균선은 3 아래에서 머뭅니다. 48번 push한 총 비용은 111로, push 한 번에 평균 2.31입니다. 같은 일을 "+4"로 하면 324(평균 6.75)가 들고, n이 커질수록 평균이 계속 올라갑니다.
      </p>

      <h2>합계 방법: 전부 더해서 나누기</h2>
      <p>
        "push 한 번이 최악에 O(n)"이라는 말은 맞지만 쓸모가 없습니다. n번 push하는 프로그램이 <M>{'O(n^2)'}</M>이라고 결론 내리게 되는데, 그림 1이 보여 주듯 사실이 아닙니다. 비싼 push가 <strong>드물게</strong> 일어나기 때문입니다. 그래서 연산 하나하나의 최악이 아니라 연산 n번 전체의 비용을 세고 n으로 나눕니다. 이것이 <T en="amortized analysis">분할 상환 분석</T>의 가장 단순한 형태인 <T en="aggregate method">합계 방법</T>입니다.
      </p>
      <p>
        용량 1에서 시작해 두 배씩 늘리면, 복사는 크기가 1, 2, 4, …, <M>{'2^j'}</M>(n보다 작은 가장 큰 2의 거듭제곱)일 때 일어납니다. 이 수들을 모두 더하면 등비수열이라 마지막 항의 두 배보다 작습니다.
      </p>
      <MB note="새 원소를 쓰는 비용 n을 더하면 총 비용은 3n보다 작습니다.">{'\\text{총 복사} = 1 + 2 + 4 + \\cdots + 2^j = 2^{j+1} - 1 < 2n'}</MB>
      <p>
        총 비용이 3n보다 작으므로 push 한 번의 <strong>분할 상환 비용</strong>은 3 이하, 곧 O(1)입니다. 블록이 클수록 복사는 비싸지만 그만큼 드물게 일어나서, 둘이 정확히 상쇄됩니다.
      </p>

      <h2>은행원 방법: 미리 적립해 두기</h2>
      <p>
        같은 결론을 다르게 볼 수도 있습니다. push할 때마다 동전 3개를 낸다고 해 봅시다. 하나는 지금 원소를 쓰는 데 바로 쓰고, 나머지 2개는 적립해 둡니다. 용량이 c에서 2c로 늘어나는 순간을 생각해 보세요. 직전에 용량이 c/2에서 c로 늘어난 뒤로 push가 c/2번 있었고, 그동안 쌓인 동전은 <M>{'2 \\times c/2 = c'}</M>개입니다. 옮겨야 할 원소도 정확히 c개입니다. 원소마다 "자기 자신을 옮길 동전 하나"와 "이미 한 번 옮겨진 옛 원소를 옮길 동전 하나"를 들고 들어오는 셈입니다.
      </p>
      <p>
        적립금이 한 번도 음수가 되지 않으면, 실제 총 비용은 낸 동전의 합인 3n을 넘을 수 없습니다. 그림 1의 마지막 칸이 이 적립금입니다. ×2에서는 48번 내내 0 아래로 내려가지 않지만, ×1.5에서는 push 9에서, +4에서는 push 18에서 바닥납니다. ×1.5는 총 복사가 3n보다 작으니 동전을 4개씩 내면 버티고, +k는 동전을 몇 개씩 내든 언젠가 바닥납니다. 이렇게 연산마다 고정된 값을 매기고 남는 것을 저축해 비싼 연산에 쓰는 방식을 <T en="accounting / banker's method">은행원 방법</T>(적립 방법)이라고 합니다.
      </p>
      <Callout kind="note" label="평균과 다르다">
        분할 상환 비용은 확률적인 "평균적인 경우"가 아닙니다. 해시 테이블 조회가 평균 O(1)이라는 말은 해시 값이 고르게 퍼진다는 가정 위에 서 있고, 운이 나쁘면 깨집니다. 분할 상환 O(1)에는 운도 가정도 없습니다. <strong>어떤 순서로 연산을 하든</strong> n번의 총 비용이 3n을 넘지 않는다는 보장입니다. 다만 하나하나의 연산이 빠르다는 보장은 아니어서, push 한 번이 원소 수백만 개를 복사하느라 순간적으로 멈출 수는 있습니다.
      </Callout>

      <h2>얼마씩 늘릴까</h2>
      <p>
        두 배가 유일한 답은 아닙니다. 용량을 매번 f배(f &gt; 1)로 늘리면 복사하는 양이 공비 1/f인 등비수열이 되어, 총 복사 수가 <M>{'n \\cdot \\frac{f}{f-1}'}</M>보다 작습니다. ×2는 2n, ×1.5는 3n, ×1.25는 5n 아래입니다. 비율이 1에 가까울수록 상수는 커지지만 여전히 O(n)입니다. 반면 고정 크기 k씩 늘리면 k칸마다 한 번씩 그때까지의 원소를 모두 옮기므로 총 복사 수가 약 <M>{'n^2 / 2k'}</M>, 곧 <M>{'O(n^2)'}</M>입니다.
      </p>
      <PolicyFigure />
      <p>
        "평균 비용" 보기에서 세 가지 곱하기 방식은 n이 아무리 커져도 낮은 띠 안에 머뭅니다. 고정 크기 방식은 처음에는 가장 싸다가 n이 k를 훌쩍 넘는 순간부터 직선으로 올라갑니다. n = 1,000,000에서 +8은 원소를 625억 번 옮기고, +1024조차 4.9억 번(push 한 번에 488번)을 옮깁니다. 같은 n에서 ×2는 약 105만 번입니다. 고정 크기를 아무리 크게 잡아도 n이 더 커지면 결국 따라잡힙니다.
      </p>
      <p>
        "빈 칸" 보기는 반대쪽의 값입니다. 블록을 늘린 직후에는 새로 생긴 칸이 거의 다 비어 있으므로, ×2는 블록의 절반 가까이, ×1.5는 3분의 1, ×1.25는 5분의 1이 놀고 있을 수 있습니다. <strong>비율이 작을수록 메모리는 덜 버리지만 복사는 더 자주 합니다.</strong> 고정 크기 방식은 n이 크면 빈 칸이 거의 없지만, 그 대가가 <M>{'O(n^2)'}</M>입니다.
      </p>
      <p>
        실제 구현은 이 사이에서 저마다 다르게 고릅니다. Java의 <code>ArrayList</code>는 용량을 1.5배(<code>old + (old {'>>'} 1)</code>)로 늘립니다. C++ 표준은 비율을 정하지 않고 <code>push_back</code>이 분할 상환 O(1)이기만을 요구하는데, GCC의 libstdc++는 두 배로, MSVC는 1.5배로 늘립니다. CPython의 <code>list</code>는 대략 8분의 1 정도를 여유로 더 잡고, Go는 작은 슬라이스는 두 배로, 큰 슬라이스는 그보다 작은 비율로 늘립니다. JavaScript 엔진도 자기만의 공식이 있습니다. 이런 세부 공식은 버전에 따라 바뀌어 왔으니 숫자 자체보다 "곱해서 늘린다"는 점을 기억하면 됩니다.
      </p>
      <Callout kind="intuition">
        원소가 몇 개 들어올지 미리 안다면 처음부터 그만큼 잡는 것이 가장 쌉니다. Java의 <code>new ArrayList&lt;&gt;(n)</code>, C++의 <code>reserve(n)</code>, Go의 <code>make([]T, 0, n)</code>이 그 일을 합니다. 복사가 한 번도 일어나지 않고, 커다란 복사로 인한 순간 멈춤도 없습니다.
      </Callout>
      <p>직접 만들어 보면 이렇습니다. JavaScript 배열은 이미 동적 배열이지만, 여기서는 <code>new Array(cap)</code>를 늘어나지 않는 고정 블록이라고 치고 씁니다.</p>
      <Code label="동적 배열: 꽉 차면 두 배, 4분의 1 이하로 줄면 절반">{`
class DynamicArray {
  #data = new Array(1); // 고정 크기 블록이라고 친다
  #size = 0;

  get length() { return this.#size; }
  get capacity() { return this.#data.length; }

  get(i) {
    if (i < 0 || i >= this.#size) throw new RangeError('index');
    return this.#data[i];
  }

  push(x) {
    if (this.#size === this.capacity) this.#resize(this.capacity * 2);
    this.#data[this.#size++] = x;
  }

  pop() {
    if (this.#size === 0) return undefined;
    const x = this.#data[--this.#size];
    this.#data[this.#size] = undefined; // 참조를 끊어야 GC가 회수한다
    if (this.capacity > 1 && this.#size <= this.capacity / 4) {
      this.#resize(this.capacity / 2);
    }
    return x;
  }

  #resize(cap) {
    const next = new Array(cap);          // 새 블록
    for (let i = 0; i < this.#size; i++) next[i] = this.#data[i]; // O(size) 복사
    this.#data = next;                    // 예전 블록은 버린다
  }
}`}</Code>

      <h2>줄일 때의 함정</h2>
      <p>
        <code>pop</code>으로 원소가 크게 줄었는데 블록이 그대로라면 메모리가 아깝습니다. 늘릴 때 두 배로 늘렸으니 "절반 이하로 줄면 절반으로 줄이자"가 자연스러워 보입니다. 그런데 이 규칙은 위험합니다.
      </p>
      <ShrinkFigure />
      <p>
        처음 설정(절반 이하면 줄임, 교대)을 보세요. 원소 64개로 꽉 찬 배열에 push하면 용량이 128로 늘며 64개를 복사합니다. 바로 pop하면 크기가 64로 용량의 절반이 되어 다시 64로 줄이며 64개를 복사합니다. 다시 push하면 또 꽉 찬 상태이니… 연산마다 복사가 일어나 연산 120번에 비용이 7,800, 연산당 65입니다. 경계에서 늘리기와 줄이기가 서로를 부르는 <T en="thrashing">스래싱</T>입니다. 분할 상환 보장은 "어떤 순서로 하든"이어야 하는데, 이 순서 하나가 그것을 깨뜨립니다.
      </p>
      <p>
        해결책은 늘리는 지점과 줄이는 지점 사이에 간격을 두는 것입니다. 규칙을 "4분의 1 이하면 절반으로"로 바꾸면 같은 순서의 총 비용이 184, 연산당 1.53으로 떨어집니다. 크기를 바꾼 직후의 배열은 언제나 절반쯤 차 있고, 다음에 다시 크기를 바꾸려면 용량의 4분의 1 이상만큼 push나 pop이 쌓여야 합니다. 그 사이의 연산들이 다음 복사 비용을 미리 적립해 두는 셈이라 push와 pop이 섞여도 분할 상환 O(1)이 유지됩니다. 대가는 메모리로, 배열이 4분의 3까지 비어 있을 수 있습니다. "안 줄임"을 고르면 복사는 가장 적지만 "물결"에서 원소가 16개로 줄어도 용량 64를 계속 붙들고 있습니다.
      </p>

      <h2>다른 곳에서 만난 분할 상환</h2>
      <p>이 과정에서 이미 같은 생각을 몇 번 만났습니다.</p>
      <ul>
        <li>
          <a href="#cs-algorithms/stack-queue-heap">스택, 큐, 힙</a>의 큐는 꺼낸 자리를 비워 둔 채 앞 위치만 옮기다가, 버려진 칸이 절반을 넘으면 한 번에 정리했습니다. 정리는 O(n)이지만 그만큼 꺼내기가 쌓여야 일어나므로 꺼내기 한 번은 분할 상환 O(1)입니다.
        </li>
        <li>
          <a href="#cs-algorithms/search-hash">해시 테이블</a>은 적재율이 기준을 넘으면 칸 수를 두 배로 늘리고 모든 키를 다시 넣었습니다. 동적 배열의 복사와 똑같은 계산으로 삽입이 분할 상환 O(1)입니다. 한 번에 모두 옮기는 멈춤이 싫다면 나눠서 옮길 수도 있습니다. Redis의 해시 테이블은 새 테이블을 만든 뒤 요청을 처리할 때마다 버킷을 조금씩 옮기는 점진적 재해싱을 합니다.
        </li>
        <li>
          <a href="#cs-algorithm-design/union-find-mst">유니온 파인드</a>의 경로 압축은 한 번의 find가 길 수 있지만, 그 길을 평평하게 펴 두어 다음 find들을 싸게 만듭니다. m번의 연산 전체가 <M>{'O(m\\,\\alpha(n))'}</M>이라는 것도 분할 상환으로 센 결과입니다.
        </li>
      </ul>

      <Callout kind="key">
        동적 배열은 크기와 용량을 따로 두고, 꽉 차면 더 큰 블록으로 모두 복사합니다. 용량을 <strong>곱해서</strong> 늘리면 n번 push의 총 비용이 O(n)이라 push 한 번은 분할 상환 O(1)이고, 더해서 늘리면 <M>{'O(n^2)'}</M>입니다. 비율이 작을수록 메모리를 덜 버리는 대신 더 자주 복사합니다. 분할 상환은 어떤 연산 순서에도 성립하는 보장이며, 줄일 때는 늘리는 지점과 간격을 두어야(예: 4분의 1에서 절반으로) 스래싱을 피합니다.
      </Callout>
      <Quiz
        q="용량을 1.5배씩 늘리는 동적 배열에 원소 n개를 push한다. 다음 중 옳은 것은?"
        options={['가끔 원소를 모두 복사하므로 총 비용은 O(n log n)이다', '총 복사 수는 3n보다 작아서 push 한 번은 분할 상환 O(1)이다', '복사가 일어나는 push는 O(1)이 아니므로 분할 상환 비용도 O(n)이다', '두 배씩 늘릴 때보다 복사가 적고 메모리도 적게 쓴다']}
        answer={1}
        explain={<>복사는 용량이 c₀, 1.5c₀, 2.25c₀, …일 때 일어나고, 그 합은 마지막 항의 <M>{'1/(1 - 1/1.5) = 3'}</M>배보다 작은 등비수열이라 3n 아래입니다. 총 비용이 O(n)이니 n으로 나눈 분할 상환 비용은 O(1)입니다. 개별 push가 O(n)일 수 있다는 것과 모순되지 않습니다. 두 배와 비교하면 빈 칸은 적지만(최대 약 3분의 1) 복사는 더 많습니다(2n 대신 3n 아래).</>}
      />
    </>
  );
}

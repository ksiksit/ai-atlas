import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, MB, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { amdahl, bench, bestCores, ceiling, gustafson, plan, reportedCores, workersAvailable, type Measure, type Seg as TimeSeg } from './speedup';
import './parallel.css';
import './amdahl.css';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const x2 = (v: number) => `${v.toFixed(2)}배`;

const segColor = (P: Palette, k: TimeSeg['kind']) => (k === 'serial' ? P.pos : k === 'parallel' ? P.neg : k === 'overhead' ? P.hl : P.surface2);

/* ─────────────── Figure 1: time lines of p cores ─────────────── */

const CORES = [1, 2, 4, 8, 16] as const;

function TimelineFigure() {
  const P = usePalette();
  const [f, setF] = useState(0.9);
  const [p, setP] = useState<number>(4);
  const [oh, setOh] = useState(0);
  const [uneven, setUneven] = useState(false);
  const pl = useMemo(() => plan(f, p, oh, uneven), [f, p, oh, uneven]);
  const curve = useMemo(() => CORES.map((q) => plan(f, q, oh, uneven).speedup), [f, oh, uneven]);
  const best = useMemo(() => bestCores(f, oh, uneven, 64), [f, oh, uneven]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 58, r: 14, t: 26, b: 26 };
      const pw = w - pad.l - pad.r;
      // the one-core run sits on top as a reference
      const rows = p + 1;
      const gap = 10;
      const lh = Math.max(6, Math.min(26, (h - pad.t - pad.b - gap) / rows - 3));
      const X = (t: number) => pad.l + t * pw;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      // time grid in tenths of the one-core run
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (let k = 0; k <= 10; k++) {
        const x = Math.round(X(k / 10)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, pad.t - 4);
        ctx.lineTo(x, h - pad.b + 2);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      for (let k = 0; k <= 10; k += 2) ctx.fillText(`${k * 10}%`, X(k / 10), h - pad.b + 14);
      ctx.textAlign = 'left';
      ctx.fillText('1코어로 걸리는 시간 대비', pad.l, 10);

      const bar = (y: number, s: TimeSeg) => {
        const x0 = X(s.t0);
        const x1 = X(s.t1);
        if (x1 - x0 < 0.5) return;
        if (s.kind === 'idle') {
          ctx.fillStyle = alpha(P.ink3, 0.08);
          ctx.fillRect(x0, y + lh * 0.35, x1 - x0, lh * 0.3);
          return;
        }
        ctx.fillStyle = segColor(P, s.kind);
        ctx.fillRect(x0, y, x1 - x0, lh);
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, lh - 1);
      };
      // reference: one core
      const y0 = pad.t;
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'right';
      ctx.fillText('1코어', pad.l - 8, y0 + lh / 2);
      bar(y0, { kind: 'serial', t0: 0, t1: 1 - f });
      bar(y0, { kind: 'parallel', t0: 1 - f, t1: 1 });
      // p cores
      const top = pad.t + lh + 3 + gap;
      pl.lanes.forEach((lane, c) => {
        const y = top + c * (lh + 3);
        ctx.fillStyle = P.ink3;
        ctx.textAlign = 'right';
        if (lh >= 9 || c % 4 === 0) ctx.fillText(`코어 ${c}`, pad.l - 8, y + lh / 2);
        lane.forEach((s) => bar(y, s));
      });
      // finish line of the p-core run
      const xe = X(pl.total);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(xe, top - 6);
      ctx.lineTo(xe, top + p * (lh + 3));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = xe > w - 120 ? 'right' : 'left';
      ctx.fillText(`${p}코어: ${pct(pl.total)}에 끝남`, xe + (xe > w - 120 ? -6 : 6), top - 6);
    },
    [P, pl, f, p],
    { height: Math.min(420, 96 + (p + 1) * 30), minHeight: 150 },
  );

  return (
    <Figure
      no={1}
      title="같은 일을 코어 p개에 나누면"
      hint="코어 수와 병렬로 할 수 있는 비율을 바꿔 보세요"
      caption={
        <>
          맨 위 줄은 코어 하나로 일 전체를 할 때입니다. 주황색이 나눌 수 없는 <strong>직렬 부분</strong>(입력 읽기, 결과 합치기처럼 한 흐름만 할 수 있는 일), 파란색이 코어끼리 나눌 수 있는 <strong>병렬 부분</strong>입니다. 아래 줄들은 같은 일을 코어 p개로 할 때로, 코어 0이 직렬 부분을 끝낸 뒤 병렬 부분을 p조각으로 나눠 동시에 합니다. 노란색은 일을 나눠 주고 걷어 오는 데 드는 오버헤드, 옅은 줄은 코어가 노는 시간입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`코어 ${p}개의 시간표. 병렬 비율 ${pct(f)}. 코어 하나일 때보다 ${pct(pl.total)}의 시간에 끝나 ${x2(pl.speedup)} 빨라집니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="코어 수 p" value={p} onChange={setP} options={CORES.map((q) => ({ value: q, label: String(q) }))} />
          <Slider id="am-f" label="병렬 부분의 비율 f" value={f} min={0.5} max={1} step={0.01} onChange={setF} format={pct} color="var(--neg)" />
          <Slider id="am-oh" label="코어 하나 늘 때마다 드는 오버헤드" value={oh} min={0} max={0.02} step={0.001} onChange={setOh} format={pct} color="var(--hl)" />
          <Check label="조각 크기가 고르지 않음" checked={uneven} onChange={setUneven} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`${p}코어 속도 향상`} value={x2(pl.speedup)} color="var(--neg)" />
            <Readout label="효율 (향상 ÷ p)" value={pct(pl.speedup / p)} />
            <Readout label="가장 빠른 코어 수 (64까지)" value={`${best.p}개`} />
            <Readout label="그때 속도 향상" value={x2(best.speedup)} />
          </div>
          <div className="pd-small">
            p = 1, 2, 4, 8, 16일 때 속도 향상: <span className="mono">{curve.map((s) => s.toFixed(2)).join(' · ')}</span>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '직렬 부분', shape: 'sq' },
          { color: 'var(--neg)', label: '병렬 부분', shape: 'sq' },
          { color: 'var(--hl)', label: '오버헤드', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: Amdahl's curve ─────────────── */

const FAMILY = [0.5, 0.75, 0.9, 0.99];

function CurveFigure() {
  const P = usePalette();
  const [f, setF] = useState(0.95);
  const top = Math.min(ceiling(f), 1024);
  const yMax = Math.max(4, top * 1.12);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 10, yMin: 0, yMax, pad: { l: 44, r: 16, t: 16, b: 34 } });
      pl.grid({ xStep: 1, labels: false, axes: false });
      // log2 ticks on x, linear on y
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= 10; k++) ctx.fillText(String(2 ** k), pl.X(k), pl.pad.t + pl.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const step = yMax > 600 ? 200 : yMax > 250 ? 50 : yMax > 60 ? 20 : yMax > 24 ? 5 : yMax > 10 ? 2 : 1;
      for (let y = 0; y <= yMax; y += step) ctx.fillText(String(y), pl.pad.l - 6, pl.Y(y));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillText('코어 수 p (로그 눈금)', pl.pad.l + pl.pw, pl.pad.t + pl.ph - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('속도 향상', pl.pad.l + 6, pl.pad.t + 4);

      // perfect scaling S = p
      pl.fn((k) => 2 ** k, P.ink3, 1.5, { dash: [4, 4] });
      for (const g of FAMILY) if (Math.abs(g - f) > 0.004) pl.fn((k) => amdahl(g, 2 ** k), alpha(P.ink3, 0.55), 1.5);
      // the ceiling
      const c = ceiling(f);
      if (c <= yMax) {
        pl.line(0, c, 10, c, P.pos, 1.5, [6, 4]);
        pl.text(`천장 1/(1−f) = ${c >= 100 ? Math.round(c) : c.toFixed(1)}`, 0.15, c, P.pos, { dy: -10, font: `600 12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      }
      pl.fn((k) => amdahl(f, 2 ** k), P.neg, 3);
      for (const k of [3, 6, 10]) {
        const s = amdahl(f, 2 ** k);
        pl.dot(k, s, 4.5, P.neg, P.surface, 2);
        pl.text(s.toFixed(1), k, s, P.neg, { dx: -6, dy: 12, align: 'right', font: `600 11px ${P.fontMono}` });
      }
      // labels for the faint family, at the right edge
      ctx.font = `11px ${P.fontMono}`;
      for (const g of FAMILY) {
        if (Math.abs(g - f) <= 0.004) continue;
        const s = amdahl(g, 1024);
        if (s > yMax) continue;
        pl.text(`f=${g}`, 10, s, P.ink3, { dx: -4, dy: -8, align: 'right', font: `11px ${P.fontMono}` });
      }
    },
    [P, f, yMax],
    { aspect: 1.75, maxHeight: 400 },
  );

  return (
    <Figure
      no={2}
      title="암달의 법칙: 코어를 1,024개까지 늘리면"
      hint="f를 0.9, 0.95, 0.99로 바꿔 천장을 보세요"
      caption={
        <>
          가로축은 코어 수를 두 배씩 늘린 로그 눈금입니다. 점선 대각선은 코어 수만큼 빨라지는 이상적인 경우, 굵은 파란 곡선이 고른 f에서 암달의 법칙이 주는 속도 향상, 옅은 곡선들은 다른 f입니다. 주황 점선은 코어를 무한히 늘려도 넘을 수 없는 천장입니다. 점 셋은 코어 8개, 64개, 1,024개일 때입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`병렬 비율 ${pct(f)}일 때 속도 향상 곡선. 코어 8개에서 ${amdahl(f, 8).toFixed(2)}배, 64개에서 ${amdahl(f, 64).toFixed(2)}배, 1,024개에서 ${amdahl(f, 1024).toFixed(2)}배이고, 천장은 ${ceiling(f).toFixed(1)}배입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="am-f2" label="병렬 부분의 비율 f" value={f} min={0.5} max={0.999} step={0.001} onChange={setF} format={pct} color="var(--neg)" />
          <div className="btn-row">
            {[0.9, 0.95, 0.99, 0.999].map((g) => (
              <Button key={g} small onClick={() => setF(g)}>
                f = {g}
              </Button>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="8코어" value={x2(amdahl(f, 8))} />
            <Readout label="64코어" value={x2(amdahl(f, 64))} />
            <Readout label="1,024코어" value={x2(amdahl(f, 1024))} color="var(--neg)" />
            <Readout label="천장 1/(1−f)" value={x2(ceiling(f))} color="var(--pos)" />
            <Readout label="64코어 효율" value={pct(amdahl(f, 64) / 64)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: measure it in this browser ─────────────── */

type BenchState = { status: 'idle' } | { status: 'running'; rows: Measure[] } | { status: 'done'; rows: Measure[] } | { status: 'error'; rows: Measure[]; msg: string };

function MeasureFigure() {
  const P = usePalette();
  const ok = useMemo(workersAvailable, []);
  const cores = useMemo(reportedCores, []);
  const maxP = Math.min(16, Math.max(4, cores + 2));
  const [f, setF] = useState(0.9);
  const [st, setSt] = useState<BenchState>({ status: 'idle' });
  const cancel = useRef(false);
  useEffect(
    () => () => {
      cancel.current = true;
    },
    [],
  );
  const rows = st.status === 'idle' ? [] : st.rows;
  const ranF = useRef(f);

  const start = () => {
    cancel.current = false;
    ranF.current = f;
    setSt({ status: 'running', rows: [] });
    bench({ f, maxP, targetMs: 300, repeats: 3, onProgress: (r) => !cancel.current && setSt({ status: 'running', rows: r }), cancelled: () => cancel.current })
      .then((r) => !cancel.current && setSt({ status: 'done', rows: r }))
      .catch((e: unknown) => !cancel.current && setSt((s) => ({ status: 'error', rows: s.status === 'idle' ? [] : s.rows, msg: e instanceof Error ? e.message : String(e) })));
  };
  const fShown = st.status === 'idle' ? f : ranF.current;
  const atCores = rows.find((r) => r.p === Math.min(cores, maxP));
  const bestRow = rows.reduce<Measure | null>((b, r) => (!b || r.speedup > b.speedup ? r : b), null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(4, Math.ceil(Math.max(amdahl(fShown, maxP) + 0.3, ...rows.map((r) => r.speedup + 0.5))));
      const pl = new Plot(ctx, w, h, P, { xMin: 0.5, xMax: maxP + 0.5, yMin: 0, yMax, pad: { l: 38, r: 14, t: 16, b: 32 } });
      pl.grid({ xStep: maxP > 8 ? 2 : 1, yStep: yMax > 8 ? 2 : 1, axes: false, xLabel: '작업자 수', yLabel: '속도 향상' });
      // what the browser says it has
      if (cores <= maxP) {
        pl.line(cores, 0, cores, yMax, alpha(P.ink3, 0.7), 1.5, [3, 4]);
        pl.text(`보고된 코어 ${cores}개`, cores, yMax * 0.94, P.ink3, { dx: 5, font: `11px ${P.fontBody}` });
      }
      pl.fn((p) => p, P.ink3, 1.5, { dash: [4, 4], from: 1 });
      pl.fn((p) => amdahl(fShown, p), alpha(P.neg, 0.75), 2.5, { from: 1 });
      // measured points joined by a thin line
      if (rows.length) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        rows.forEach((r, i) => (i ? ctx.lineTo(pl.X(r.p), pl.Y(r.speedup)) : ctx.moveTo(pl.X(r.p), pl.Y(r.speedup))));
        ctx.stroke();
        rows.forEach((r) => pl.dot(r.p, r.speedup, 4.5, P.pos, P.surface, 2));
      }
      if (st.status === 'idle') pl.text('▶ 측정 시작을 누르면 이 기기에서 잰 점이 찍힙니다', (maxP + 1) / 2, yMax * 0.5, P.ink3, { align: 'center', font: `12px ${P.fontBody}`, bg: alpha(P.surface, 0.9) });
    },
    [P, rows, fShown, maxP, cores, st.status],
    { aspect: 1.75, maxHeight: 380 },
  );

  const note = !ok
    ? '이 브라우저에서는 작업자(Web Worker)를 만들 수 없어 측정할 수 없습니다. 아래 표 대신 그림 1과 2의 계산으로 읽어 주세요.'
    : st.status === 'idle'
      ? `이 브라우저는 논리 코어가 ${cores}개라고 알려 줍니다. 작업자를 1개부터 ${maxP}개까지 늘려 가며 같은 일을 시킵니다. 몇 초 걸립니다.`
      : st.status === 'running'
        ? `측정 중입니다. 작업자 ${rows.length + 1}개로 같은 일을 세 번 돌려 가장 빠른 시간을 씁니다.`
        : st.status === 'error'
          ? `측정이 중간에 멈췄습니다 (${st.msg}). 다른 탭을 닫고 다시 시도해 보세요.`
          : bestRow
            ? `작업자 ${bestRow.p}개일 때 가장 빨라 ${bestRow.speedup.toFixed(2)}배였습니다. 같은 f에서 암달의 법칙이 예측한 값은 ${amdahl(fShown, bestRow.p).toFixed(2)}배입니다.${bestRow.p > cores && atCores && bestRow.speedup > atCores.speedup * 1.1 ? ' 보고된 코어 수보다 많은 작업자가 눈에 띄게 더 빨랐습니다. 브라우저가 알려 준 코어 수가 실제보다 작게 반올림된 것일 수 있습니다.' : ''}`
            : '';

  return (
    <Figure
      no={3}
      title="이 기기에서 직접 재기"
      hint="버튼을 눌러야 시작합니다"
      caption={
        <>
          일은 정수 비트 연산을 수천만 번 되풀이하는 계산입니다. 작업자를 미리 만들어 데워 둔 다음, 작업자 0이 직렬 부분을 혼자 하고, 이어서 병렬 부분을 작업자 p개가 똑같이 나눠 합니다. 작업자 1개일 때 약 0.3초가 걸리도록 이 기기의 속도에 맞춰 일의 양을 정합니다. 결과는 기기의 코어 수, 전원 설정, 다른 탭이 하는 일에 따라 달라지고, 같은 기기에서도 측정할 때마다 조금씩 다릅니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={rows.length ? `측정한 속도 향상: ${rows.map((r) => `작업자 ${r.p}개 ${r.speedup.toFixed(2)}배`).join(', ')}. 파란 곡선은 병렬 비율 ${pct(fShown)}일 때 암달의 법칙.` : `아직 측정하지 않았습니다. 파란 곡선은 병렬 비율 ${pct(fShown)}일 때 암달의 법칙.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="am-status" data-bad={!ok || st.status === 'error' || undefined} aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Seg label="병렬 부분의 비율 f" value={f} onChange={setF} options={[0.5, 0.9, 1].map((g) => ({ value: g, label: pct(g) }))} />
          <Button primary onClick={start} disabled={!ok || st.status === 'running'}>
            {st.status === 'running' ? '측정 중…' : st.status === 'idle' ? '▶ 측정 시작' : '▶ 다시 측정'}
          </Button>
          {rows.length > 0 && (
            <div className="am-table-wrap">
              <table className="am-table">
                <thead>
                  <tr>
                    <th>작업자</th>
                    <th>시간</th>
                    <th>향상</th>
                    <th>예측</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.p}>
                      <td>{r.p}</td>
                      <td>{Math.round(r.ms)}ms</td>
                      <td>{r.speedup.toFixed(2)}</td>
                      <td>{amdahl(fShown, r.p).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '이 기기에서 잰 값', shape: 'dot' },
          { color: 'var(--neg)', label: '암달의 법칙', shape: 'ln' },
          { color: 'var(--ink-3)', label: '코어 수만큼 (이상)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: strong vs weak scaling ─────────────── */

function GustafsonFigure() {
  const P = usePalette();
  const [s, setS] = useState(0.05);
  const [p, setP] = useState(64);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 1, xMax: 128, yMin: 0, yMax: 128, pad: { l: 40, r: 16, t: 16, b: 32 } });
      pl.grid({ xStep: 16, yStep: 16, axes: false, xLabel: '코어 수 p', yLabel: '속도 향상' });
      pl.fn((x) => x, P.ink3, 1.5, { dash: [4, 4] });
      pl.fn((x) => gustafson(s, x), P.good, 3);
      pl.fn((x) => amdahl(1 - s, x), P.neg, 3);
      pl.line(p, 0, p, 128, alpha(P.ink, 0.4), 1, [3, 3]);
      const g = gustafson(s, p);
      const a = amdahl(1 - s, p);
      pl.dot(p, g, 5, P.good, P.surface, 2);
      pl.dot(p, a, 5, P.neg, P.surface, 2);
      const left = p > 96;
      pl.text(`약한 확장 ${g.toFixed(1)}배`, p, g, P.good, { dx: left ? -8 : 8, dy: -10, align: left ? 'right' : 'left', font: `600 12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      pl.text(`강한 확장 ${a.toFixed(1)}배`, p, a, P.neg, { dx: left ? -8 : 8, dy: 12, align: left ? 'right' : 'left', font: `600 12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, s, p],
    { aspect: 1.6, maxHeight: 380 },
  );

  return (
    <Figure
      no={4}
      title="문제를 고정할 때와 키울 때"
      hint="직렬 비율과 코어 수를 바꿔 보세요"
      caption={
        <>
          파란 곡선은 문제 크기를 그대로 두고 코어만 늘리는 <strong>강한 확장</strong>(암달의 법칙), 초록 곡선은 코어가 늘어나는 만큼 문제도 키워서 코어마다 하는 일을 같게 두는 <strong>약한 확장</strong>(구스타프슨의 법칙)입니다. 두 곡선 모두 같은 직렬 비율 s를 쓰지만, 강한 확장에서 s는 코어 하나로 돌릴 때의 비율이고 약한 확장에서는 코어 p개로 돌릴 때 잰 비율입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`직렬 비율 ${pct(s)}, 코어 ${p}개. 강한 확장은 ${amdahl(1 - s, p).toFixed(1)}배, 약한 확장은 ${gustafson(s, p).toFixed(1)}배.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="am-s" label="직렬 부분의 비율 s" value={s} min={0} max={0.5} step={0.01} onChange={setS} format={pct} color="var(--pos)" />
          <Slider id="am-p" label="코어 수 p" value={p} min={1} max={128} step={1} onChange={setP} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="강한 확장" value={x2(amdahl(1 - s, p))} color="var(--neg)" />
            <Readout label="약한 확장" value={x2(gustafson(s, p))} color="var(--good)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '강한 확장: 1 / (s + (1−s)/p)', shape: 'ln' },
          { color: 'var(--good)', label: '약한 확장: s + (1−s)·p', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Amdahl() {
  return (
    <>
      <h2>동시에 일어나는 것과 동시에 하는 것</h2>
      <p>
        <a href={lessonHref('cs-operating-systems', 'scheduling')}>운영체제의 CPU 스케줄링</a>에서 CPU 하나가 프로세스 여러 개를 몇 밀리초씩 번갈아 실행하는 것을 보았습니다. 사람 눈에는 음악 재생과 문서 편집이 동시에 일어나는 것처럼 보이지만, 어느 한순간에 실행되는 것은 하나뿐입니다. 이렇게 여러 일이 겹친 시간 동안 진행되는 성질을 <T en="concurrency">동시성</T>이라고 합니다. 코어가 여러 개라서 여러 일이 정말 같은 순간에 실행되는 것은 <T en="parallelism">병렬성</T>입니다.
      </p>
      <p>
        동시성은 프로그램을 짜는 방식의 문제이고, 병렬성은 하드웨어로 빨리 끝내는 문제입니다. 웹 서버는 코어가 하나여도 요청 수천 개를 동시에 다뤄야 하고(동시성), 영상 인코더는 코어가 여럿이면 프레임을 나눠 빨리 끝냅니다(병렬성). 이 과목의 앞쪽 세 장은 병렬성, 곧 일을 나눠서 <strong>얼마나 빨라지는가</strong>를 다룹니다. 여러 흐름이 같은 데이터를 건드릴 때의 위험은 <a href={lessonHref('cs-operating-systems', 'locks')}>경쟁 조건과 락</a>에서 본 그대로입니다.
      </p>
      <p>
        2005년 무렵까지는 기다리기만 하면 프로그램이 빨라졌습니다. CPU의 클럭이 해마다 올랐기 때문입니다. 그 뒤로는 발열 때문에 클럭이 3~5GHz에서 멈췄고, 대신 칩 하나에 코어를 늘리기 시작했습니다. 이제 노트북에 코어 8~16개, 서버에 수백 개가 들어갑니다. 코어가 많아진 만큼 빨라지려면 프로그램이 일을 나눠 주어야 합니다.
      </p>

      <h2>나눌 수 없는 부분</h2>
      <p>
        코어 하나로 10초 걸리는 프로그램을 코어 4개로 돌리면 몇 초가 걸릴까요? 2.5초라면 좋겠지만, 프로그램에는 거의 언제나 나눌 수 없는 부분이 있습니다. 파일을 읽어 들이고, 조각마다 낸 결과를 하나로 합치고, 화면에 출력하는 일은 한 흐름이 차례대로 해야 합니다. 그림 1에서 코어 수를 바꿔 보세요.
      </p>
      <TimelineFigure />
      <p>
        병렬 부분이 90%일 때 코어 4개는 3.08배, 8개는 4.71배, 16개는 6.40배 빨라집니다. 코어를 두 배로 늘릴 때마다 얻는 것이 줄어듭니다. 파란 막대는 코어 수에 반비례해 짧아지지만 주황 막대는 그대로이기 때문입니다. 코어 16개일 때 전체 시간의 64%는 주황 막대, 곧 코어 15개가 놀면서 코어 0을 기다리는 시간입니다.
      </p>
      <p>
        코어 p개로 얻는 <T en="speedup">속도 향상</T>은 코어 하나일 때 걸린 시간을 코어 p개일 때 걸린 시간으로 나눈 값입니다. 속도 향상을 p로 나눈 값은 <T en="efficiency">효율</T>이라고 하고, 코어가 일하는 시간의 비율을 뜻합니다.
      </p>

      <h2>암달의 법칙</h2>
      <p>
        1967년 IBM의 진 암달(Gene Amdahl)은 이 관계를 식 하나로 적었습니다. 코어 하나로 걸리는 시간을 1로 놓고, 그중 나눌 수 있는 부분의 비율을 <M>f</M>라고 하면, 코어 p개로 걸리는 시간은 나눌 수 없는 <M>{'1-f'}</M>에 나눠진 <M>{'f/p'}</M>를 더한 것입니다.
      </p>
      <MB note="p가 아무리 커져도 f/p는 0으로 갈 뿐이라, 속도 향상은 1/(1−f)를 넘지 못합니다.">{String.raw`S(p) = \frac{1}{(1-f) + \dfrac{f}{p}} \quad\xrightarrow{\;p\to\infty\;}\quad \frac{1}{1-f}`}</MB>
      <CurveFigure />
      <p>
        f = 0.95, 곧 95%를 나눌 수 있는 프로그램은 코어 8개에서 5.93배, 64개에서 15.42배, 1,024개에서 19.64배 빨라지고, 천장은 20배입니다. 코어 64개의 효율은 24%로, 코어 넷 중 셋은 놀고 있는 셈입니다. 슬라이더를 0.99까지 올리면 천장이 100배로 뛰고 1,024코어에서 91.18배가 됩니다. <strong>직렬 부분을 5%에서 1%로 줄이는 것이, 코어를 64개에서 1,024개로 늘리는 것보다 훨씬 큰 효과</strong>를 냅니다.
      </p>
      <Callout kind="intuition">
        식당 주방을 생각해 보세요. 요리사를 늘리면 재료 손질과 굽기는 빨라지지만, 주문을 받는 계산대가 하나뿐이면 손님은 줄을 섭니다. 요리사를 백 명으로 늘려도 계산대가 처리하는 속도보다 빨리 음식이 나갈 수 없습니다. 이럴 때는 요리사를 더 뽑기보다 계산대를 하나 더 여는 편이 낫습니다.
      </Callout>

      <h2>직접 재 보기</h2>
      <p>
        식은 이상적인 경우입니다. 실제 기계에서도 이렇게 될까요? 브라우저에서는 <T en="Web Worker">작업자</T>를 만들어 페이지와 따로 도는 스레드에 계산을 맡길 수 있고, 운영체제는 작업자들을 서로 다른 코어에 올립니다. 그림 3은 같은 계산을 작업자 1개부터 늘려 가며 실제로 돌리고 시간을 잽니다.
      </p>
      <MeasureFigure />
      <p>
        코어가 넉넉한 기기라면 측정한 점이 파란 곡선 가까이에 찍히다가, 보고된 코어 수 근처에서 꺾여 평평해집니다. 코어보다 작업자가 많으면 운영체제가 작업자들을 같은 코어에서 번갈아 실행하므로(동시성은 있지만 병렬성은 없으므로) 더 빨라지지 않습니다. 노트북은 성능 코어와 효율 코어가 섞여 있어서, 작업자가 효율 코어에 올라가는 순간부터 곡선 아래로 처지기도 합니다. 배터리 절약 모드에서는 운영체제가 코어를 덜 깨워서 차이가 더 커집니다.
      </p>

      <h2>오버헤드와 불균형</h2>
      <p>
        측정이 식보다 나쁘게 나오는 이유는 크게 둘입니다. 첫째는 <T en="overhead">오버헤드</T>입니다. 일을 나눠 주려면 작업자에게 메시지를 보내야 하고, 결과를 모으려면 또 받아야 합니다. 스레드를 만들고 깨우는 데도 시간이 듭니다. 이 비용은 코어가 늘수록 커집니다. 그림 1에서 오버헤드를 1%로 올려 보세요. 코어 8개는 3.54배인데 16개는 3.27배로 오히려 느려지고, 64개 중에서 가장 빠른 것은 9개일 때의 3.57배입니다. 코어를 더 넣는 것이 손해가 되는 지점이 생깁니다.
      </p>
      <p>
        둘째는 <T en="load imbalance">부하 불균형</T>입니다. "조각 크기가 고르지 않음"을 켜면 조각마다 걸리는 시간이 달라지고, 병렬 부분은 가장 늦게 끝나는 조각이 끝나야 끝납니다. 일찍 끝낸 코어는 놉니다. 코어 8개의 속도 향상이 4.71배에서 3.42배로 떨어집니다. 이미지의 하늘 부분과 나무 부분처럼 같은 크기의 조각도 계산량이 다를 수 있어서, 실제 병렬 프로그램은 조각을 코어 수보다 훨씬 잘게 나눈 뒤 먼저 끝낸 코어가 다음 조각을 가져가게 합니다. 남의 큐에서 일을 훔쳐 오는 <T en="work stealing">작업 훔치기</T>는 Java의 ForkJoinPool, Go 런타임, Rust의 Rayon이 모두 쓰는 방법입니다.
      </p>

      <h2>문제를 키우면: 구스타프슨의 법칙</h2>
      <p>
        암달의 법칙은 비관적으로 들립니다. 그런데 슈퍼컴퓨터는 코어 수백만 개로 실제로 수십만 배 빠르게 일합니다. 1988년 존 구스타프슨(John Gustafson)은 그 이유를 이렇게 설명했습니다. 코어를 많이 가진 사람은 같은 문제를 빨리 풀기보다 <strong>더 큰 문제</strong>를 풉니다. 일기 예보는 코어가 늘면 격자를 더 촘촘하게 나누고, 언어 모델은 더 많은 데이터로 학습합니다. 이때 직렬 부분(입력 설정, 결과 저장)은 거의 그대로이고, 늘어난 일은 모두 병렬 부분에 붙습니다.
      </p>
      <MB note="s는 코어 p개로 돌릴 때 잰 직렬 부분의 비율입니다. 같은 일을 코어 하나로 하면 s + (1−s)p만큼 걸립니다.">{String.raw`S_{\text{약한}}(p) = s + (1-s)\,p`}</MB>
      <GustafsonFigure />
      <p>
        직렬 부분이 5%일 때 코어 64개로 같은 문제를 빨리 풀면 15.4배이지만, 문제를 64배로 키워서 코어마다 같은 양을 맡기면 60.8배의 일을 같은 시간에 해냅니다. 두 법칙은 서로 틀린 것이 아니라 다른 질문에 답합니다. 문제 크기가 정해져 있으면(이 사진 한 장을 빨리 보정하기) 암달의 법칙을, 문제가 코어와 함께 커지면(더 큰 시뮬레이션) 구스타프슨의 법칙을 씁니다. 앞의 것을 <T en="strong scaling">강한 확장</T>, 뒤의 것을 <T en="weak scaling">약한 확장</T>이라고 부릅니다.
      </p>
      <Callout kind="note">
        병렬 부분 안에서도 모든 일이 동시에 될 수는 없습니다. 합을 구하려면 덧셈 결과를 다시 더해야 하고, 정렬하려면 비교 결과를 기다려야 합니다. 일 사이의 이런 의존 관계가 얼마나 나눠지는지를 재는 방법이 <a href={lessonHref('cs-parallel-distributed', 'work-span')}>다음 장</a>의 일과 경로입니다.
      </Callout>

      <Callout kind="key">
        동시성은 여러 일이 겹친 시간 동안 진행되는 것, 병렬성은 여러 코어가 같은 순간에 실행하는 것입니다. 나눌 수 있는 비율이 f인 프로그램은 코어 p개로 1/((1−f) + f/p)배 빨라지고, 코어를 아무리 늘려도 1/(1−f)를 넘지 못합니다(암달의 법칙). 실제로는 일을 나누고 모으는 오버헤드와 조각 사이의 불균형 때문에 이보다 덜 빨라지며, 코어를 더 넣는 것이 손해가 되는 지점도 있습니다. 문제를 코어 수와 함께 키우면 속도 향상은 s + (1−s)p로 거의 코어 수에 비례합니다(구스타프슨의 법칙).
      </Callout>
      <Quiz
        q="코어 하나로 100초 걸리는 일 중 80초 분량을 나눌 수 있고, 지금은 코어 4개로 돌린다. 코어를 16개로 늘리는 것과, 코어는 4개 그대로 두고 나눌 수 없는 20초를 10초로 줄이는 것 중 어느 쪽이 더 빨리 끝날까?"
        options={['코어 16개: 20 + 80/16 = 25초', '직렬 단축: 10 + 80/4 = 30초', '둘 다 같다', '코어 16개: 100 ÷ 16 = 6.25초']}
        answer={0}
        explain={<>지금은 20 + 80/4 = 40초입니다. 코어를 16개로 늘리면 20 + 80/16 = 25초, 직렬 부분을 줄이면 10 + 80/4 = 30초이므로 이번에는 코어를 늘리는 편이 빠릅니다. 하지만 직렬 20초가 남아 있는 한 코어를 아무리 늘려도 20초 밑으로는 내려가지 못합니다(천장 5배). 직렬 부분을 10초로 줄이면 그 바닥이 10초로 내려가 천장이 10배가 됩니다. 100 ÷ 16은 나눌 수 없는 부분이 하나도 없을 때의 값입니다.</>}
      />
    </>
  );
}

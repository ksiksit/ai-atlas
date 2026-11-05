import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow, Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { greedy, scanCost, scanRounds, sortCost, span, sumDag, sumInputs, work, type ScanKind, type SortKind, type SumShape } from './dag';
import './parallel.css';
import './workspan.css';

const fmtS = (v: number) => String(Math.round(v * 100) / 100);
const fmtN = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : String(Math.round(v * 10) / 10));

/* ─────────────── Figure 1: a DAG and a greedy scheduler ─────────────── */

function SumFigure() {
  const P = usePalette();
  const [shape, setShape] = useState<SumShape>('tree');
  const [n, setN] = useState(16);
  const [p, setP] = useState(4);
  const xs = useMemo(() => sumInputs(n), [n]);
  const g = useMemo(() => sumDag(xs, shape), [xs, shape]);
  const frames = useMemo(() => greedy(g, p), [g, p]);
  const s = useStepper(frames.length, 3, `${shape}-${n}-${p}`);
  const f = frames[s.i];
  const T1 = work(g);
  const Tinf = span(g);
  const Tp = frames.length - 1;
  const rows = Math.max(...g.map((x) => x.row));
  const height = Math.max(220, Math.min(460, 46 + (rows + 1) * (shape === 'chain' ? 15 : 46)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 16, r: 16, t: 18, b: 18 };
      const cw = (w - pad.l - pad.r) / n;
      const rh = rows ? (h - pad.t - pad.b) / rows : 0;
      const r = Math.max(5, Math.min(13, cw / 2 - 2, rh / 2 - 1));
      const X = (c: number) => pad.l + (c + 0.5) * cw;
      const Y = (row: number) => pad.t + row * rh;
      const ran = new Set(f.ran);
      const waited = new Set(f.waited);
      // edges first
      ctx.lineWidth = 1.2;
      for (const nd of g) {
        for (const k of nd.deps) {
          const a = g[k];
          const live = ran.has(nd.id);
          ctx.strokeStyle = live ? P.pos : f.done.has(nd.id) ? alpha(P.neg, 0.5) : P.line;
          ctx.lineWidth = live ? 2 : 1.2;
          ctx.beginPath();
          ctx.moveTo(X(a.col), Y(a.row));
          ctx.lineTo(X(nd.col), Y(nd.row));
          ctx.stroke();
        }
      }
      const showVal = r >= 9;
      for (const nd of g) {
        const x = X(nd.col);
        const y = Y(nd.row);
        const isIn = nd.kind === 'in';
        const done = isIn || f.done.has(nd.id);
        ctx.beginPath();
        if (isIn) ctx.rect(x - r, y - r, 2 * r, 2 * r);
        else ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = isIn ? P.surface2 : ran.has(nd.id) ? P.pos : done ? P.neg : P.surface;
        ctx.fill();
        ctx.lineWidth = waited.has(nd.id) ? 2.5 : 1.2;
        ctx.strokeStyle = waited.has(nd.id) ? P.hl : isIn ? P.lineStrong : done ? P.surface : P.lineStrong;
        ctx.stroke();
        if (showVal && done) {
          ctx.fillStyle = isIn ? P.ink : P.surface;
          ctx.font = `600 ${Math.round(r * 0.95)}px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(nd.value), x, y + 0.5);
        } else if (!isIn && !done && r >= 7) {
          ctx.fillStyle = P.ink3;
          ctx.font = `${Math.round(r)}px ${P.fontBody}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+', x, y + 0.5);
        }
      }
    },
    [P, g, f, n, rows],
    { height },
  );

  const note =
    s.i === 0
      ? `덧셈 ${T1}개가 남았습니다. 재생하거나 ▶로 한 단계씩 넘겨 보세요. 한 단계에 프로세서 ${p}개가 덧셈을 하나씩 할 수 있습니다.`
      : `${s.i}단계: 덧셈 ${f.ran.length}개를 했습니다.${f.waited.length ? ` 준비된 덧셈 ${f.waited.length}개는 프로세서가 모자라 다음 단계로 밀렸습니다.` : f.ran.length < p ? ` 프로세서 ${p - f.ran.length}개는 할 일이 없어 놀았습니다.` : ''}${s.i === Tp ? ` 합은 ${g[g.length - 1].value}, 모두 ${Tp}단계 걸렸습니다.` : ''}`;

  return (
    <Figure
      no={1}
      title={`수 ${n}개 더하기의 계산 그래프`}
      hint="모양과 프로세서 수를 바꿔 재생해 보세요"
      caption={
        <>
          네모가 입력, 동그라미가 덧셈 하나입니다. 선은 "이 덧셈은 저 값이 있어야 할 수 있다"는 의존 관계입니다. 한 단계마다 입력이 모두 준비된 덧셈 중 최대 p개를 실행합니다. 주황색이 방금 실행한 덧셈, 파란색이 끝난 덧셈, 노란 테두리가 준비됐지만 프로세서를 얻지 못해 기다리는 덧셈입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${shape === 'chain' ? '한 줄로 차례대로' : '둘씩 짝지어 토너먼트로'} 더하는 계산 그래프. 덧셈 ${T1}개, 가장 긴 사슬 ${Tinf}개. 프로세서 ${p}개로 ${Tp}단계 걸립니다. 지금 ${s.i}단계.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pd-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Seg label="더하는 방식" value={shape} onChange={setShape} options={[{ value: 'chain', label: '한 줄로' }, { value: 'tree', label: '토너먼트' }]} />
          <Seg label="수의 개수 n" value={n} onChange={setN} options={[8, 16, 32].map((v) => ({ value: v, label: String(v) }))} />
          <Slider id="ws-p" label="프로세서 수 p" value={p} min={1} max={8} step={1} onChange={setP} />
          <StepControls s={s} id="ws-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="일 T₁" value={T1} />
            <Readout label="경로 T∞" value={Tinf} />
            <Readout label="병렬도 T₁/T∞" value={(T1 / Tinf).toFixed(2)} />
            <Readout label={`걸린 단계 T${p === 1 ? '₁' : 'p'}`} value={Tp} color="var(--pos)" />
            <Readout label="하한 max(T₁/p, T∞)" value={fmtS(Math.max(T1 / p, Tinf))} />
            <Readout label="상한 T₁/p + T∞" value={fmtS(T1 / p + Tinf)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--surface-2)', label: '입력', shape: 'sq' },
          { color: 'var(--pos)', label: '이번 단계에 실행', shape: 'dot' },
          { color: 'var(--neg)', label: '끝남', shape: 'dot' },
          { color: 'var(--hl)', label: '준비됐지만 대기', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: prefix sums ─────────────── */

const SCAN_NAME: Record<ScanKind, string> = { seq: '차례대로', hillis: '힐리스–스틸', blelloch: '블렐록' };

function ScanFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<ScanKind>('hillis');
  const [n, setN] = useState(8);
  const [p, setP] = useState(4);
  const xs = useMemo(() => sumInputs(n, 9), [n]);
  const rounds = useMemo(() => scanRounds(xs, kind), [xs, kind]);
  const s = useStepper(rounds.length + 1, 2, `${kind}-${n}`);
  const costs = useMemo(() => (['seq', 'hillis', 'blelloch'] as ScanKind[]).map((k) => ({ k, c: scanCost(scanRounds(xs, k)) })), [xs]);
  const cur = s.i > 0 ? rounds[s.i - 1] : null;
  const rowsN = rounds.length + 1;
  const height = Math.max(200, Math.min(460, 28 + rowsN * (n > 8 ? 24 : 30)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 70, r: 10, t: 20, b: 6 };
      const cw = (w - pad.l - pad.r) / n;
      const rh = (h - pad.t - pad.b) / rowsN;
      const ch = Math.min(rh * 0.62, 26);
      const X = (i: number) => pad.l + i * cw;
      const Y = (row: number) => pad.t + row * rh;
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) ctx.fillText(String(i), X(i) + cw / 2, 9);
      const vals = [xs, ...rounds.map((r) => r.after)];
      for (let row = 0; row < rowsN; row++) {
        const shown = row <= s.i;
        const y = Y(row) + (rh - ch) / 2;
        const rd = row > 0 ? rounds[row - 1] : null;
        const changed = new Set<number>();
        rd?.ops.forEach((o) => {
          changed.add(o.to);
          if (o.kind === 'swap-add') changed.add(o.from);
        });
        ctx.fillStyle = row === s.i ? P.ink : P.ink3;
        ctx.font = `${row === s.i ? '600 ' : ''}11px ${P.fontBody}`;
        ctx.textAlign = 'right';
        ctx.fillText(row === 0 ? '입력' : `${row}회차`, pad.l - 8, y + ch / 2);
        for (let i = 0; i < n; i++) {
          const x = X(i) + 1.5;
          const isNew = row === s.i && changed.has(i);
          ctx.fillStyle = !shown ? alpha(P.surface2, 0.5) : isNew ? P.pos : row === s.i ? alpha(P.neg, 0.16) : P.surface2;
          ctx.fillRect(x, y, cw - 3, ch);
          if (shown) {
            ctx.fillStyle = isNew ? P.surface : P.ink;
            ctx.font = `${isNew ? '700 ' : ''}${Math.min(13, Math.max(9, cw * 0.32))}px ${P.fontMono}`;
            ctx.textAlign = 'center';
            ctx.fillText(String(vals[row][i]), x + (cw - 3) / 2, y + ch / 2 + 0.5);
          }
        }
      }
      // arrows of the current round, from the row above
      if (cur) {
        const yTop = Y(s.i - 1) + (rh + ch) / 2;
        const yBot = Y(s.i) + (rh - ch) / 2;
        for (const o of cur.ops) {
          if (o.kind === 'zero') continue;
          drawArrow(ctx, X(o.from) + cw / 2, yTop, X(o.to) + cw / 2, yBot - 1, P.pos, 1.6, 6);
          if (o.kind === 'swap-add') drawArrow(ctx, X(o.to) + cw / 2, yTop, X(o.from) + cw / 2, yBot - 1, alpha(P.neg, 0.9), 1.6, 6);
        }
      }
    },
    [P, xs, rounds, s.i, n, rowsN, cur],
    { height },
  );

  const c = costs.find((x) => x.k === kind)!.c;
  const note = !cur
    ? `입력 ${n}칸. ${kind === 'blelloch' ? '블렐록 방식은 결과가 한 칸씩 밀린 "자기 앞까지의 합"(배타적 접두사 합)입니다.' : '목표는 칸마다 "처음부터 자기까지의 합"(포함 접두사 합)입니다.'} ▶로 한 회차씩 넘겨 보세요.`
    : `${s.i}회차, ${cur.label}: ${cur.adds ? `덧셈 ${cur.adds}개를 동시에 합니다.` : '덧셈 없이 값 하나를 0으로 바꿉니다.'}${s.i === rounds.length ? ' 끝났습니다.' : ''}`;

  return (
    <Figure
      no={2}
      title="접두사 합 세 가지"
      hint="방식을 바꿔 가며 한 회차씩 넘겨 보세요"
      caption={
        <>
          한 줄이 한 회차이고, 한 회차 안의 덧셈은 모두 동시에 할 수 있습니다. 화살표는 이번 회차에 어느 칸의 값을 어느 칸에 더하는지 보여 줍니다. 블렐록 방식의 내려가기 단계에서는 두 칸이 값을 맞바꾸면서 오른쪽 칸에 더합니다(파란 화살표가 맞바꾸기). 표의 단계 수는 프로세서 p개가 회차마다 ⌈덧셈 수 ÷ p⌉ 단계씩 걸린다고 센 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${SCAN_NAME[kind]} 방식의 접두사 합, 칸 ${n}개. 덧셈 ${c.work}개, 회차 ${c.span}개. 지금 ${s.i}회차.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pd-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Seg label="방식" value={kind} onChange={setKind} options={(['seq', 'hillis', 'blelloch'] as ScanKind[]).map((k) => ({ value: k, label: SCAN_NAME[k] }))} />
          <Seg label="칸 수 n" value={n} onChange={setN} options={[8, 16].map((v) => ({ value: v, label: String(v) }))} />
          <StepControls s={s} id="ws-scan-speed" maxSpeed={6} />
          <Slider id="ws-scan-p" label="프로세서 수 p" value={p} min={1} max={16} step={1} onChange={setP} />
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>방식</th>
                  <th>일</th>
                  <th>경로</th>
                  <th>p={p} 단계</th>
                </tr>
              </thead>
              <tbody>
                {costs.map(({ k, c: cc }) => (
                  <tr key={k} data-c={k === kind || undefined} style={{ ['--c' as string]: 'var(--pos)' }}>
                    <td>{SCAN_NAME[k]}</td>
                    <td>{cc.work}</td>
                    <td>{cc.span}</td>
                    <td>{cc.steps(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: merge sort, three ways ─────────────── */

const SORTS: { k: SortKind; name: string; css: string }[] = [
  { k: 'seq', name: '순차 병합 정렬', css: 'var(--ink-3)' },
  { k: 'par-split', name: '반씩 병렬, 병합은 순차', css: 'var(--pos)' },
  { k: 'par-merge', name: '병합까지 병렬', css: 'var(--neg)' },
];

function SortFigure() {
  const P = usePalette();
  const [L, setL] = useState(20);
  const [lp, setLp] = useState(6);
  const p = 2 ** lp;
  const costs = useMemo(() => SORTS.map((x) => ({ ...x, c: sortCost(L, x.k) })), [L]);
  const colorOf = (k: SortKind) => (k === 'seq' ? P.ink3 : k === 'par-split' ? P.pos : P.neg);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 14, yMin: -1, yMax: 14, pad: { l: 44, r: 14, t: 16, b: 34 } });
      pl.grid({ xStep: 2, yStep: 2, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= 14; k += 2) ctx.fillText(fmtN(2 ** k), pl.X(k), pl.pad.t + pl.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let k = 0; k <= 14; k += 2) ctx.fillText(fmtN(2 ** k), pl.pad.l - 6, pl.Y(k));
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('프로세서 수 p', pl.pad.l + pl.pw, pl.Y(0.5));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('속도 향상 (로그 눈금)', pl.pad.l + 6, pl.pad.t + 4);
      pl.fn((x) => x, alpha(P.ink3, 0.6), 1.2, { dash: [4, 4] });
      pl.line(lp, 0, lp, 14, alpha(P.ink, 0.35), 1, [3, 3]);
      for (const { k, c } of costs) {
        const col = colorOf(k);
        // best any schedule can do, and what a greedy schedule is guaranteed
        pl.fn((x) => Math.log2(c.work / Math.max(c.work / 2 ** x, c.span)), col, 3);
        pl.fn((x) => Math.log2(c.work / (c.work / 2 ** x + c.span)), alpha(col, 0.7), 1.5, { dash: [5, 4] });
        const best = c.work / Math.max(c.work / p, c.span);
        pl.dot(lp, Math.log2(best), 4.5, col, P.surface, 2);
      }
    },
    [P, costs, lp],
    { aspect: 1.6, maxHeight: 380 },
  );

  return (
    <Figure
      no={3}
      title={`원소 ${fmtN(2 ** L)}개 병합 정렬의 속도 향상`}
      hint="원소 수와 프로세서 수를 바꿔 보세요"
      caption={
        <>
          단위 비용 모형으로 계산했습니다. 일은 세 방식 모두 n log₂ n입니다(재귀 단계마다 원소 n개를 병합). 굵은 선은 어떤 스케줄로도 넘을 수 없는 속도 향상 min(p, T₁/T∞), 점선은 탐욕 스케줄이 보장하는 T₁ ÷ (T₁/p + T∞)입니다. 두 축 모두 로그 눈금이고, 점은 고른 p에서의 굵은 선 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`원소 2의 ${L}제곱 개, 프로세서 ${p}개. ${costs.map(({ name, c }) => `${name} 최대 ${(c.work / Math.max(c.work / p, c.span)).toFixed(1)}배`).join(', ')}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ws-n" label="원소 수 n" value={L} min={10} max={26} step={1} onChange={setL} format={(v) => `2^${v} ≈ ${fmtN(2 ** v)}`} />
          <Slider id="ws-sp" label="프로세서 수 p" value={lp} min={0} max={14} step={1} onChange={setLp} format={(v) => fmtN(2 ** v)} />
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>방식 · 경로 T∞</th>
                  <th>병렬도</th>
                  <th>p={fmtN(p)}</th>
                </tr>
              </thead>
              <tbody>
                {costs.map(({ k, name, css, c }) => (
                  <tr key={k} data-c="" style={{ ['--c' as string]: css }}>
                    <td style={{ whiteSpace: 'normal' }}>
                      {name}
                      <div className="pd-small mono" style={{ fontWeight: 400 }}>
                        T∞ = {fmtN(c.span)}
                      </div>
                    </td>
                    <td>{fmtN(c.work / c.span)}</td>
                    <td>{(c.work / Math.max(c.work / p, c.span)).toFixed(1)}배</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pd-small">일 T₁ = n log₂ n = {fmtN(costs[0].c.work)} (세 방식 모두 같음)</div>
        </div>
      </div>
      <Legend
        items={[
          ...SORTS.map((x) => ({ color: x.css, label: x.name, shape: 'ln' as const })),
          { color: 'var(--ink-3)', label: '점선: 탐욕 스케줄이 보장하는 값', shape: 'ln' as const },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function WorkSpan() {
  return (
    <>
      <h2>일이 서로를 기다릴 때</h2>
      <p>
        <a href={lessonHref('cs-parallel-distributed', 'amdahl')}>앞 장</a>에서는 프로그램을 "나눌 수 없는 부분"과 "나눌 수 있는 부분" 둘로만 나눴습니다. 실제 계산은 그보다 촘촘합니다. 수 16개를 더한다고 해 봅시다. 처음부터 하나씩 더해 나가면 덧셈마다 바로 앞 덧셈의 결과가 있어야 하므로 아무것도 나눌 수 없습니다. 그런데 짝을 지어 8쌍을 동시에 더하고, 그 결과를 다시 4쌍으로 더하는 식이면 대부분을 나눌 수 있습니다. 같은 문제라도 <strong>계산을 어떻게 엮느냐</strong>에 따라 병렬로 할 수 있는 양이 달라집니다.
      </p>
      <p>
        이것을 정확히 따지려면 계산을 그래프로 그립니다. 연산 하나를 점으로, "이 연산은 저 연산의 결과가 있어야 할 수 있다"를 화살표로 나타냅니다. 화살표를 따라 돌아오는 길이 없으므로 이 그래프는 방향이 있고 순환이 없는 그래프, 곧 <T en="directed acyclic graph, DAG">DAG</T>입니다. <a href={lessonHref('cs-algorithm-design', 'topological-sort')}>위상 정렬</a>에서 본 작업 순서 그래프와 같은 모양입니다.
      </p>

      <h2>일과 경로</h2>
      <p>
        연산 하나에 단위 시간이 걸린다고 하면, 계산 그래프는 두 수로 요약됩니다. 연산의 총 개수가 <T en="work">일</T> <M>{'T_1'}</M>입니다. 프로세서 하나로 하면 걸리는 시간입니다. 가장 긴 의존 사슬의 길이가 <T en="span">경로</T> <M>{'T_\\infty'}</M>입니다. 프로세서가 무한히 많아도 이 사슬은 차례대로 해야 하므로 이보다 빨리 끝낼 수 없습니다. 경로는 <T en="depth">깊이</T> 또는 임계 경로라고도 부릅니다. 일을 경로로 나눈 <M>{'T_1/T_\\infty'}</M>을 <T en="parallelism">병렬도</T>라고 합니다. 평균적으로 한 단계에 연산 몇 개를 동시에 할 수 있는지를 뜻하고, 프로세서를 몇 개까지 넣는 것이 의미 있는지 알려 줍니다.
      </p>
      <SumFigure />
      <p>
        수 16개를 <strong>한 줄로</strong> 더하면 일이 15, 경로도 15라서 병렬도는 1입니다. 프로세서를 8개로 늘려도 15단계가 걸립니다. <strong>토너먼트</strong>로 바꾸면 일은 똑같이 15인데 경로가 4로 줄어 병렬도가 3.75가 됩니다. 프로세서 4개로 재생해 보세요. 첫 단계에 덧셈 8개가 준비되지만 4개만 하고 4개는 기다리므로, 8개짜리 첫 줄에 2단계가 걸려 모두 6단계에 끝납니다. 프로세서가 8개면 경로와 같은 4단계입니다. n을 32로 늘리면 경로는 5밖에 늘지 않아서 병렬도가 6.2가 됩니다. 수가 많을수록 토너먼트의 이점이 커집니다.
      </p>

      <h2>브렌트의 정리: 프로세서 p개로는 얼마나</h2>
      <p>
        프로세서가 p개일 때 걸리는 시간 <M>{'T_p'}</M>에는 두 가지 하한이 있습니다. 한 단계에 연산을 p개까지만 할 수 있으니 <M>{'T_1/p'}</M>보다 빠를 수 없고, 경로보다 빠를 수도 없습니다. 놀라운 것은 반대쪽입니다. 1974년 리처드 브렌트(Richard Brent)는 매 단계 준비된 연산을 할 수 있는 만큼 하는 <T en="greedy scheduler">탐욕 스케줄</T>이면 언제나 두 하한의 합 안에 끝난다는 것을 보였습니다.
      </p>
      <MB note="왼쪽은 어떤 스케줄로도 넘을 수 없는 한계, 오른쪽은 아무 탐욕 스케줄이나 보장하는 시간입니다.">{String.raw`\max\!\left(\frac{T_1}{p},\; T_\infty\right) \;\le\; T_p \;\le\; \frac{T_1}{p} + T_\infty`}</MB>
      <p>
        증명의 생각은 간단합니다. 탐욕 스케줄의 각 단계는 둘 중 하나입니다. 준비된 연산이 p개 이상이라 프로세서가 모두 일하는 단계는 일 전체를 p로 나눈 것보다 많을 수 없습니다. 준비된 연산이 p개보다 적은 단계에서는 준비된 것을 모두 하므로, 남은 가장 긴 사슬이 하나씩 짧아집니다. 이런 단계는 경로보다 많을 수 없습니다. 그림 1의 토너먼트에서 n = 16, p = 4이면 하한이 max(3.75, 4) = 4, 상한이 3.75 + 4 = 7.75이고, 실제로 6단계가 걸렸습니다.
      </p>
      <p>
        이 정리 덕분에 병렬 알고리즘을 설계할 때는 프로세서 수를 잊고 일과 경로만 생각하면 됩니다. 일이 순차 알고리즘보다 크게 늘지 않게 하면서 경로를 짧게 만드는 것이 목표입니다. 프로세서 수가 병렬도보다 충분히 작으면 <M>{'T_1/p'}</M>가 주도해서 거의 p배 빨라집니다.
      </p>
      <Code label="포크–조인으로 쓴 토너먼트 합 (의사 코드)">{`
function sum(a, lo, hi) {
  if (hi - lo <= 4096) {            // 작으면 그냥 차례대로 더한다
    let s = 0;
    for (let i = lo; i < hi; i++) s += a[i];
    return s;
  }
  const mid = (lo + hi) >> 1;
  const left = spawn sum(a, lo, mid); // 다른 코어가 가져가서 해도 된다
  const right = sum(a, mid, hi);      // 나는 오른쪽 절반을 한다
  sync;                               // 왼쪽 절반이 끝나기를 기다린다
  return left + right;
}`}</Code>
      <p>
        실제 시스템에서는 이렇게 씁니다. <code>spawn</code>은 "이 호출은 다른 코어가 해도 된다"는 표시이고, <code>sync</code>는 그 결과를 기다리는 자리입니다. Cilk, Java의 ForkJoinPool, Rust의 Rayon(<code>join</code>)이 이 모형을 그대로 쓰고, 런타임이 앞 장의 작업 훔치기로 탐욕 스케줄에 가깝게 일을 나눠 줍니다. 크기가 작아지면 차례대로 하는 것은, 연산 하나를 다른 코어에 넘기는 오버헤드가 덧셈보다 훨씬 크기 때문입니다.
      </p>

      <h2>접두사 합: 일과 경로를 맞바꾸기</h2>
      <p>
        <T en="prefix sum, scan">접두사 합</T>은 배열의 칸마다 처음부터 그 칸까지의 합을 구하는 것입니다. [2, 8, 2, 8]의 접두사 합은 [2, 10, 12, 20]입니다. 차례대로 하면 칸마다 바로 앞 칸이 있어야 하므로 경로가 n − 1입니다. 병렬로 하기 어려워 보이지만, 정렬, 문자열 처리, 그래프 알고리즘, GPU의 데이터 압축까지 수많은 병렬 알고리즘이 접두사 합을 기본 부품으로 씁니다. 그림 2에서 세 가지 방법을 비교해 보세요.
      </p>
      <ScanFigure />
      <p>
        칸 8개에서 <strong>힐리스–스틸</strong> 방식은 1, 2, 4칸 떨어진 값을 차례로 더해 3회차 만에 끝내지만 덧셈을 17번 합니다. 차례대로 하면 7번이면 되는 일입니다. 칸 16개에서는 4회차에 덧셈 49번으로, 일이 <M>{'n\\log_2 n'}</M>에 가깝게 늘어납니다. <strong>블렐록</strong> 방식은 토너먼트처럼 올라가며 부분합을 만들고 다시 내려오며 나눠 주어, 칸 16개에서 덧셈 30번(차례대로의 두 배)에 8회차가 걸립니다. 경로는 힐리스–스틸의 두 배이지만 일은 n에 비례합니다.
      </p>
      <p>
        어느 쪽이 빠른지는 프로세서 수에 달려 있습니다. 칸 16개를 프로세서 4개로 하면 힐리스–스틸은 13단계, 블렐록은 10단계로 블렐록이 빠릅니다. 프로세서를 8개로 늘리면 7단계 대 8단계로 뒤집히고, 16개면 4단계 대 8단계입니다. 프로세서가 칸 수만큼 많은 GPU 안의 작은 블록에서는 힐리스–스틸을, 데이터가 프로세서보다 훨씬 많은 경우에는 블렐록처럼 일을 늘리지 않는 쪽을 씁니다. 일이 순차 알고리즘과 같은 차수인 병렬 알고리즘을 <T en="work-efficient">일 효율적</T>이라고 합니다.
      </p>
      <Callout kind="intuition">
        회의실에 16명이 줄지어 앉아 각자 받은 돈을 세는데, 모두가 "내 앞사람까지 합해서 얼마인가"를 알아야 한다고 해 봅시다. 힐리스–스틸은 모두가 동시에 1칸, 2칸, 4칸, 8칸 앞 사람에게 물어 더하는 방식이라 빠르지만 질문이 많습니다. 블렐록은 둘씩, 넷씩 모아 조장이 합을 내고, 다시 조장이 조원에게 "너희 앞까지는 얼마"를 알려 주는 방식입니다. 오가는 길이 두 번이지만 질문 수는 적습니다.
      </Callout>

      <h2>병합 정렬을 병렬로</h2>
      <p>
        <a href={lessonHref('cs-algorithm-design', 'divide-conquer')}>분할 정복</a>에서 본 병합 정렬은 병렬화하기 좋아 보입니다. 두 절반은 서로 상관이 없으니 동시에 정렬하면 됩니다. 그런데 이것만으로는 부족합니다. 마지막 병합은 원소 n개를 하나씩 차례로 비교해야 하므로 혼자서 n단계가 걸립니다. 그 앞 단계의 병합들도 각각 n/2, n/4, …단계이므로, 경로가 n + n/2 + n/4 + … ≈ 2n입니다. 일이 n log₂ n이니 병렬도는 log₂ n의 절반쯤밖에 되지 않습니다.
      </p>
      <SortFigure />
      <p>
        원소 약 100만 개(2²⁰)에서 반씩만 병렬로 하면 병렬도가 10이라, 프로세서 64개를 줘도 10배를 넘지 못합니다. 그림의 주황 선이 일찍 평평해지는 이유가 마지막 병합이라는 직렬 부분 때문입니다. 병합도 병렬로 하면 경로가 1,540으로 줄어 병렬도가 1만 3천을 넘고, 프로세서 64개로 64배, 1,024개로도 1,024배까지 올라갑니다. 병합을 병렬로 하는 방법은 이렇습니다. 왼쪽 배열의 가운데 원소를 고르고, 이진 탐색으로 그 원소가 오른쪽 배열의 어디에 들어갈지 찾으면, 두 배열이 각각 둘로 쪼개지고 앞쪽끼리와 뒤쪽끼리를 따로 병합해도 됩니다. 이 쪼개기를 재귀로 되풀이하면 병합 하나의 경로가 log₂ n의 제곱 정도가 됩니다.
      </p>
      <Callout kind="warn">
        이 그림은 비교 한 번에 단위 시간이 걸린다는 모형입니다. 실제 기계에서는 메모리 대역폭이 먼저 바닥나는 경우가 많습니다. 원소를 읽고 쓰는 속도가 비교 속도보다 느리면 코어를 늘려도 메모리를 기다리는 시간만 늘어납니다. 메모리 쪽의 한계는 <a href={lessonHref('cs-parallel-distributed', 'data-parallel')}>다음 장</a>에서 GPU와 함께 봅니다.
      </Callout>

      <Callout kind="key">
        병렬 계산은 연산을 점으로, 의존 관계를 화살표로 그린 DAG로 나타냅니다. 연산의 총수가 일 T₁, 가장 긴 의존 사슬이 경로 T∞이고, T₁/T∞이 병렬도입니다. 프로세서 p개로는 max(T₁/p, T∞)보다 빠를 수 없고, 탐욕 스케줄은 T₁/p + T∞ 안에 끝냅니다(브렌트의 정리). 좋은 병렬 알고리즘은 일을 순차 알고리즘만큼으로 지키면서 경로를 줄입니다. 토너먼트 합, 블렐록 접두사 합, 병합까지 병렬로 하는 병합 정렬이 그런 예입니다.
      </Callout>
      <Quiz
        q="어떤 병렬 알고리즘의 일이 10⁹, 경로가 10⁶이다. 프로세서가 1만 개 있을 때 기대할 수 있는 속도 향상의 상한에 가장 가까운 것은?"
        options={['10,000배', '1,000배', '100배', '10⁹배']}
        answer={1}
        explain={<>병렬도가 10⁹ ÷ 10⁶ = 1,000입니다. 프로세서가 1만 개여도 시간은 경로 10⁶보다 짧아질 수 없으므로, 속도 향상은 T₁/T∞ = 1,000배를 넘지 못합니다. 프로세서 9,000개는 대부분 놉니다. 더 빨라지려면 프로세서를 늘리는 대신 경로를 줄이는 알고리즘이 필요합니다.</>}
      />
    </>
  );
}

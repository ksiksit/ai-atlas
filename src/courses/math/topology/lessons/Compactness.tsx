import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { GALLERY, bisectSteps, contradictionStep, greedySubcover, neededN, pointsOutside, randomCover, type Interval, type SetId } from './compact';
import './topology.css';
import './compact.css';

type Space = 'open' | 'closed';

/** Stack intervals into lanes so that overlapping ones sit on different rows. */
function lanes(list: Interval[]): number[] {
  const ends: number[] = [];
  const order = list.map((_, i) => i).sort((i, j) => list[i].a - list[j].a);
  const lane = new Array(list.length).fill(0);
  for (const i of order) {
    let k = ends.findIndex((e) => e < list[i].a - 0.004);
    if (k < 0) {
      k = ends.length;
      ends.push(0);
    }
    ends[k] = list[i].b;
    lane[i] = k;
  }
  return lane;
}

/** Vertical grid lines and labels along the bottom only (the rows of these figures carry no y values). */
function xAxis(p: Plot, step: number, fmt: (v: number) => string = (v) => String(+v.toFixed(4))) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = p.p.grid;
  c.lineWidth = 1;
  c.fillStyle = p.p.ink3;
  c.font = `10px ${p.p.fontMono}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let x = Math.ceil(p.xMin / step - 1e-9) * step; x <= p.xMax + 1e-9; x += step) {
    const sx = Math.round(p.X(x)) + 0.5;
    c.beginPath();
    c.moveTo(sx, p.pad.t);
    c.lineTo(sx, p.pad.t + p.ph);
    c.stroke();
    c.fillText(fmt(Math.abs(x) < 1e-12 ? 0 : x), sx, p.pad.t + p.ph + 6);
  }
  c.restore();
}

/** The number line [0, 1] with its endpoints drawn open or closed. */
function drawSpace(p: Plot, y: number, space: Space, color: string, gap?: { to: number; color: string }) {
  p.line(0, y, 1, y, color, 4);
  if (gap) p.line(0, y, gap.to, y, gap.color, 6);
  for (const x of [0, 1]) {
    if (space === 'closed') p.dot(x, y, 5, color, color, 0);
    else p.dot(x, y, 5, p.p.surface, color, 2);
  }
}

/* ─────────────── Figure 1: a nested cover ─────────────── */

function NestedFigure() {
  const P = usePalette();
  const [space, setSpace] = useState<Space>('open');
  const [N, setN] = useState(8);
  const [delta, setDelta] = useState(0.15);
  const need = neededN(delta);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const rows = N - 1 + (space === 'closed' ? 1 : 0);
      const p = new Plot(ctx, w, h, P, { xMin: -0.25, xMax: 1.25, yMin: -1.2, yMax: rows + 0.6, pad: { l: 40, r: 10, t: 8, b: 24 } });
      xAxis(p, 0.25);
      // the sets Uₙ = (1/n, 2), shown up to the right edge of the view
      for (let n = 2; n <= N; n++) {
        const y = n - 2;
        const used = space === 'closed' && n === need;
        const col = used ? P.good : space === 'closed' && n !== need ? alpha(P.accent, 0.35) : P.accent;
        p.line(1 / n, y, 1.25, y, col, used ? 5 : 3);
        p.dot(1 / n, y, 3.5, P.surface, col, 1.5);
        if (N <= 14 || n === N || n === 2) p.text(`U${n}`, -0.25, y, P.ink3, { dx: 2, align: 'left', font: `11px ${P.fontMono}` });
      }
      if (space === 'closed') {
        const y = N - 1;
        p.line(-delta, y, delta, y, P.good, 5);
        p.dot(-delta, y, 3.5, P.surface, P.good, 1.5);
        p.dot(delta, y, 3.5, P.surface, P.good, 1.5);
        p.text('(−δ, δ)', -0.25, y, P.ink3, { dx: 2, align: 'left', font: `11px ${P.fontMono}` });
      }
      // the uncovered part (0, 1/N] for the open interval, drawn under the endpoint marks
      drawSpace(p, -0.8, space, P.ink, space === 'open' ? { to: 1 / N, color: P.bad } : undefined);
      if (space === 'open') {
        p.text(`(0, 1/${N}]`, 1 / N, -0.8, P.bad, { dx: 6, dy: -10, align: 'left', font: `600 11px ${P.fontMono}`, bg: P.surface });
      }
    },
    [P, space, N, delta, need],
    { aspect: 1.6, maxHeight: 360 },
  );

  return (
    <Figure
      no={1}
      title="겹겹이 커지는 덮개"
      hint="집합의 개수 N과 공간을 바꿔 보세요"
      caption={
        <>
          파란 막대가 열린 집합 <M>{'U_n = (1/n, 2)'}</M>입니다(오른쪽 끝은 그림 밖까지 이어짐). 맨 아래 굵은 선이 덮어야 할 공간이고, 속이 빈 동그라미는 그 끝점이 빠졌다는 표시입니다. (0, 1)에서는 몇 개를 쓰든 빨간 부분 (0, 1/N]이 남습니다. [0, 1]에서는 0을 덮을 집합 (−δ, δ)를 하나 더해야 덮개가 되고, 그러면 초록으로 칠한 두 집합으로 충분합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={space} onChange={setSpace} options={[{ value: 'open' as Space, label: '(0, 1)' }, { value: 'closed' as Space, label: '[0, 1]' }]} />
        <Slider id="cp-n" label="마지막 집합의 번호 N" value={N} min={2} max={40} step={1} onChange={setN} />
        {space === 'closed' && <Slider id="cp-delta" label="δ" value={delta} min={0.03} max={0.4} step={0.01} onChange={setDelta} format={(v) => v.toFixed(2)} />}
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={space === 'open' ? `열린 구간 (0, 1)과 집합 U₂부터 U${N}까지. 0과 1/${N} 사이가 덮이지 않고 남습니다.` : `닫힌 구간 [0, 1]과 집합 (−${delta}, ${delta}), U₂부터 U${N}. (−δ, δ)와 U${need} 두 개로 덮입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="cp-readouts">
        {space === 'open' ? (
          <Readout label="덮이지 않은 부분" value={`(0, ${(1 / N).toFixed(4)}]`} color="var(--bad)" />
        ) : (
          <Readout label="유한 부분 덮개" value={N >= need ? `(−δ, δ)와 U${need}` : `U${need}까지 필요`} color={N >= need ? 'var(--good)' : undefined} />
        )}
        <Readout label="쓴 집합" value={space === 'open' ? `${N - 1}개` : `${N}개`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: picking a finite subcover ─────────────── */

function GreedyFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(2);
  const [extra, setExtra] = useState<Interval[]>([]);
  const [half, setHalf] = useState(0.05);
  const [center, setCenter] = useState(0.5);
  const cover = useMemo(() => [...randomCover(seed), ...extra], [seed, extra]);
  const lane = useMemo(() => lanes(cover), [cover]);
  const top = Math.max(...lane) + 1;
  const { chosen, gapAt } = useMemo(() => greedySubcover(cover), [cover]);
  const chosenSet = new Set(chosen);

  const view = (w: number, h: number) => new Plot(null as unknown as CanvasRenderingContext2D, w, h, P, { xMin: -0.12, xMax: 1.12, yMin: -1.5, yMax: top + 0.3, pad: { l: 10, r: 10, t: 8, b: 24 } });

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.12, xMax: 1.12, yMin: -1.5, yMax: top + 0.3, pad: { l: 10, r: 10, t: 8, b: 24 } });
      xAxis(p, 0.25);
      cover.forEach((I, i) => {
        const on = chosenSet.has(i);
        p.line(I.a, lane[i], I.b, lane[i], on ? P.good : alpha(P.accent, 0.45), on ? 5 : 3);
      });
      drawSpace(p, -0.9, 'closed', P.ink);
      // what the chosen sets cover, drawn on the line itself
      for (const i of chosen) p.line(Math.max(0, cover[i].a), -0.9, Math.min(1, cover[i].b), -0.9, P.good, 6);
      if (gapAt !== null) {
        p.dot(gapAt, -0.9, 7, P.bad, P.surface, 2);
        p.text(`${gapAt.toFixed(3)}이 덮이지 않음`, gapAt, -0.9, P.bad, { dy: 14, font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
    },
    [P, cover, lane, top, chosen, gapAt],
    { aspect: 1.9, maxHeight: 340 },
  );

  useDrag(wrapRef, {
    hit: () => null,
    onDrag: () => undefined,
    onEmpty: (x) => {
      const p = view(size.w, size.h);
      const c = p.invX(x);
      if (c < -0.1 || c > 1.1) return;
      setExtra((e) => [...e, { a: c - half, b: c + half }]);
    },
  });

  const status = gapAt === null ? `${cover.length}개 가운데 ${chosen.length}개로 [0, 1]을 다 덮었습니다.` : `${gapAt.toFixed(3)}에서 막혔습니다. 이 구간들은 [0, 1]의 덮개가 아닙니다. 빈 곳을 눌러 구간을 더해 보세요.`;
  return (
    <Figure
      no={2}
      title="유한 개만 골라내기"
      hint="빈 곳을 누르면 그 자리에 구간이 생깁니다"
      caption={
        <>
          파란 막대는 씨앗을 정한 난수로 만든 짧은 열린 구간 40개입니다. 0을 담은 구간 가운데 가장 오른쪽까지 가는 것을 고르고, 그 오른쪽 끝을 담은 구간 가운데 다시 가장 멀리 가는 것을 고르기를 1을 넘을 때까지 되풀이합니다. 고른 구간은 초록입니다. 구간들이 [0, 1]을 덮고 있으면 이 방법은 언제나 유한 번 만에 끝납니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="cp-half" label="새 구간의 반지름" value={half} min={0.01} max={0.15} step={0.005} onChange={setHalf} format={(v) => v.toFixed(3)} />
        <Slider id="cp-center" label="새 구간의 중심" value={center} min={-0.05} max={1.05} step={0.005} onChange={setCenter} format={(v) => v.toFixed(3)} />
        <Button small onClick={() => setExtra((e) => [...e, { a: center - half, b: center + half }])}>
          구간 더하기
        </Button>
        <Button small onClick={() => { setSeed((s) => s + 1); setExtra([]); }}>
          다른 덮개
        </Button>
        <Button small onClick={() => setExtra([])} disabled={extra.length === 0}>
          더한 구간 지우기
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`열린 구간 ${cover.length}개. ${status}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="cp-readouts">
        <Readout label="구간 수" value={cover.length} />
        <Readout label="고른 구간" value={chosen.length} color={gapAt === null ? 'var(--good)' : undefined} />
      </div>
      <div className="tp-note" data-bad={gapAt !== null || undefined} data-good={gapAt === null || undefined} aria-live="polite">
        {status}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the bisection argument ─────────────── */

const BISECT = bisectSteps(10);

function BisectFigure() {
  const P = usePalette();
  const [space, setSpace] = useState<Space>('open');
  const delta = 0.15;
  const stop = contradictionStep(delta);
  const total = space === 'open' ? BISECT.length : stop + 1;
  const s = useStepper(total, 1.5, space);
  const st = BISECT[Math.min(s.i, BISECT.length - 1)];
  const contradiction = space === 'closed' && s.i === stop;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // the view zooms with the kept interval so each step stays visible
      const span = Math.max(st.b * 1.4, 0.02);
      const p = new Plot(ctx, w, h, P, { xMin: -0.12 * span, xMax: span, yMin: -1, yMax: 1.4, pad: { l: 10, r: 10, t: 8, b: 26 } });
      xAxis(p, st.b / 2, (v) => (v === 0 ? '0' : v < 0.01 ? v.toExponential(1) : String(+v.toFixed(4))));
      p.line(0, 0, Math.min(1, p.xMax), 0, P.ink, 3);
      for (const x of [0, 1]) {
        if (x > p.xMax) continue;
        if (space === 'closed') p.dot(x, 0, 5, P.ink, P.ink, 0);
        else p.dot(x, 0, 5, P.surface, P.ink, 2);
      }
      // the kept left half and the discarded right half
      const mid = st.b / 2;
      p.line(0, 0.5, mid, 0.5, contradiction ? P.good : P.bad, 7);
      if (s.i < total - 1 || space === 'open') p.line(mid, 0.5, st.b, 0.5, alpha(P.accent, 0.8), 7);
      p.text('[a, b]', st.b / 2, 0.5, P.ink2, { dy: -16, font: `600 11px ${P.fontMono}`, bg: P.surface });
      if (space === 'closed') {
        p.line(-delta, 1.05, delta, 1.05, P.good, 4);
        p.text('(−δ, δ)', Math.min(delta, p.xMax * 0.9), 1.05, P.good, { dx: -4, dy: -10, align: 'right', font: `600 11px ${P.fontMono}`, bg: P.surface });
      }
    },
    [P, st, space, contradiction, s.i, total],
    { aspect: 2.4, maxHeight: 240 },
  );

  const note =
    space === 'open'
      ? s.i === 0
        ? '(0, 1)을 덮개 Uₙ = (1/n, 2)로 덮었습니다. 유한 부분 덮개가 없다고 가정하고 반씩 나눕니다.'
        : `${st.k}번째: 오른쪽 반 [${(st.b / 2).toPrecision(3)}, ${st.b.toPrecision(3)}]은 U${st.otherN} 하나로 덮이므로, 유한 개로 덮이지 않는 쪽은 언제나 왼쪽 반입니다. 남은 구간은 0으로 줄어드는데 0은 (0, 1)에 없어서 모순이 생기지 않습니다.`
      : contradiction
        ? `${st.k}번째: 남은 구간 [0, ${st.b}]이 (−δ, δ) 하나에 들어갑니다. "유한 개로 덮이지 않는다"는 가정과 모순입니다.`
        : `${st.k}번째: [0, 1]에는 0을 덮는 (−δ, δ) = (−0.15, 0.15)가 덮개에 있어야 합니다. 남은 구간 [0, ${st.b}]은 아직 그 안에 다 들어가지 않습니다.`;
  return (
    <Figure
      no={3}
      title="반씩 나누는 증명이 막히는 곳"
      hint="한 단계씩 넘겨 보세요"
      caption={
        <>
          하이네-보렐 정리의 증명을 덮개 <M>{'U_n = (1/n, 2)'}</M>에 그대로 적용한 그림입니다. 빨간 쪽이 유한 개로 덮이지 않아 남긴 반, 파란 쪽이 유한 개로 덮여 버린 반입니다. 보이는 범위는 남은 구간에 맞춰 확대됩니다. [0, 1]에서는 덮개가 (−δ, δ)를 포함해야 하고, δ = 0.15일 때 {stop}번째 단계에서 모순이 납니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={space} onChange={setSpace} options={[{ value: 'open' as Space, label: '(0, 1)' }, { value: 'closed' as Space, label: '[0, 1]' }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${st.k}번째 단계, 남은 구간 [0, ${st.b}]. ${note}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <StepControls s={s} id="cp-bisect-speed" maxSpeed={6} />
        </div>
      </div>
      <div className="tp-note" data-bad={(space === 'open' && s.i > 0) || undefined} data-good={contradiction || undefined} aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the gallery ─────────────── */

function GalleryFigure() {
  const P = usePalette();
  const [id, setId] = useState<SetId>('open-disk');
  const [r, setR] = useState(0.1);
  const S = GALLERY.find((g) => g.id === id)!;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const col = S.compact ? P.good : P.accent;
      if (id === 'open-disk') {
        const p = new Plot(ctx, w, h, P, { xMin: -1.4, xMax: 1.4, yMin: -1.2, yMax: 1.2, pad: { l: 8, r: 8, t: 8, b: 8 }, equal: true });
        ctx.fillStyle = alpha(col, 0.18);
        ctx.strokeStyle = col;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.X(0), p.Y(0), p.X(1) - p.X(0), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        for (let n = 2; n <= 12; n++) p.dot(1 - 1 / n, 0, 3.5, P.bad, P.surface, 1);
        p.text('경계는 빠짐', 0, 1, P.ink3, { dy: -12, font: `600 11px ${P.fontBody}`, bg: P.surface });
        return;
      }
      const ranges: Record<string, [number, number]> = { 'closed-interval': [-0.2, 1.2], reals: [-5, 5], 'half-line': [-1, 9], naturals: [-0.5, 9.5], reciprocals: [-0.1, 1.1], 'reciprocals-zero': [-0.1, 1.1] };
      const [x0, x1] = ranges[id];
      const p = new Plot(ctx, w, h, P, { xMin: x0, xMax: x1, yMin: -1, yMax: 1, pad: { l: 10, r: 10, t: 8, b: 26 } });
      xAxis(p, x1 - x0 > 5 ? 1 : 0.25);
      const y = 0;
      if (id === 'closed-interval') {
        p.line(0, y, 1, y, col, 5);
        p.dot(0, y, 5, col, col, 0);
        p.dot(1, y, 5, col, col, 0);
      } else if (id === 'reals') {
        p.line(x0, y, x1, y, col, 5);
        p.arrow(x1 - 0.5, y, x1, y, col, 3, 9);
        p.arrow(x0 + 0.5, y, x0, y, col, 3, 9);
      } else if (id === 'half-line') {
        p.line(0, y, x1, y, col, 5);
        p.dot(0, y, 5, col, col, 0);
        p.arrow(x1 - 0.5, y, x1, y, col, 3, 9);
      } else if (id === 'naturals') {
        for (let n = 1; n <= 9; n++) p.dot(n, y, 5, col, col, 0);
      } else {
        for (let n = 1; n <= 400; n++) p.dot(1 / n, y, n < 30 ? 4 : 2, col, col, 0);
        if (id === 'reciprocals-zero') {
          p.dot(0, y, 6, P.good, P.surface, 2.5);
          // an open set around 0 swallows all but finitely many points
          ctx.fillStyle = alpha(P.good, 0.15);
          ctx.fillRect(p.X(-r), p.Y(0.35), p.X(r) - p.X(-r), p.Y(-0.35) - p.Y(0.35));
          p.text(`(−r, r) 밖의 점 ${pointsOutside(r)}개`, r, 0.35, P.good, { dx: 4, dy: -8, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
        } else {
          p.dot(0, y, 6, P.surface, P.bad, 2);
          p.text('0은 빠짐', 0, -0.35, P.bad, { dy: 10, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
        }
      }
    },
    [P, id, S, r],
    { aspect: 2.6, maxHeight: 220 },
  );

  const mark = (v: boolean) => <span className={v ? 'cp-yes' : 'cp-no'}>{v ? '예' : '아니요'}</span>;
  return (
    <Figure
      no={4}
      title="콤팩트하지 않은 집합들"
      hint="집합을 골라 무엇이 모자란지 보세요"
      caption={
        <>
          ℝ과 ℝ²의 부분집합에서는 하이네-보렐 정리에 따라 "닫혀 있고 유계"가 곧 콤팩트입니다. 콤팩트하지 않은 집합마다 유한 부분 덮개가 없는 열린 덮개, 수렴하는 부분수열이 없는 수열, 최댓값이 없는 연속 함수를 하나씩 적었습니다. 셋은 같은 결함을 세 방향에서 본 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={GALLERY.map((g) => ({ value: g.id, label: g.name }))} />
        {id === 'reciprocals-zero' && <Slider id="cp-r" label="0을 덮는 열린 집합의 반지름 r" value={r} min={0.01} max={0.5} step={0.01} onChange={setR} format={(v) => v.toFixed(2)} />}
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${S.name}. 닫힘 ${S.closed ? '예' : '아니요'}, 유계 ${S.bounded ? '예' : '아니요'}, 콤팩트 ${S.compact ? '예' : '아니요'}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="tbl-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th>집합</th>
              <th>닫힘</th>
              <th>유계</th>
              <th>콤팩트</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>{S.tex}</M>
              </td>
              <td>{mark(S.closed)}</td>
              <td>{mark(S.bounded)}</td>
              <td>{mark(S.compact)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {S.compact ? (
        <div className="tp-note" data-good aria-live="polite">
          {id === 'reciprocals-zero' ? `어떤 열린 덮개든 0을 담은 집합이 하나 있고, 그 집합은 어떤 (−r, r)을 품습니다. r = ${r.toFixed(2)}이면 그 밖의 점은 1/n (n ≤ ${pointsOutside(r)}) ${pointsOutside(r)}개뿐이라 집합 ${pointsOutside(r)}개를 더하면 다 덮입니다.` : '닫혀 있고 유계이므로 콤팩트입니다. 어떤 열린 덮개에서도 유한 개를 골라낼 수 있고, 모든 수열에 수렴하는 부분수열이 있고, 모든 연속 함수가 최댓값과 최솟값을 가집니다.'}
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="cp-table">
            <tbody>
              <tr>
                <th>유한 부분 덮개가 없는 덮개</th>
                <td>
                  <M>{S.cover}</M>
                </td>
              </tr>
              <tr>
                <th>수렴하는 부분수열이 없는 수열</th>
                <td>
                  <M>{S.sequence}</M>
                </td>
              </tr>
              <tr>
                <th>최댓값이 없는 연속 함수</th>
                <td>
                  <M>{S.noMax}</M>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Compactness() {
  return (
    <>
      <h2>유한하지 않은데 유한처럼 행동하는 집합</h2>
      <p>
        유한 집합은 좋은 성질이 많습니다. 함수값 가운데 가장 큰 것이 반드시 있고, 점마다 성립하는 부등식은 가장 나쁜 점 하나만 보면 모든 점에서 한꺼번에 성립합니다. <T en="compactness">콤팩트성</T>은 무한 집합 가운데 이런 "유한처럼 행동하는" 성질을 갖는 것을 열린 집합만으로 골라내는 개념입니다.
      </p>
      <div className="cp-thm">
        <b>정의.</b> X의 <T en="open cover">열린 덮개</T>는 합집합이 X를 포함하는 열린 집합들의 모임입니다. 그 가운데 일부만으로도 X를 덮으면 그것을 <T en="subcover">부분 덮개</T>라고 합니다. X의 모든 열린 덮개가 유한 부분 덮개를 가지면 X를 <T en="compact">콤팩트</T>하다고 합니다.
      </div>
      <p>
        "모든" 덮개라는 말이 중요합니다. 어떤 공간이든 X 자신 하나로 이루어진 덮개는 유한하니까, 유한 부분 덮개가 있는 덮개를 하나 찾는 것으로는 아무것도 말할 수 없습니다. 콤팩트하지 않음을 보이려면 유한 개로는 모자라는 덮개를 하나 만들어야 합니다. 그림 1이 그런 덮개입니다.
      </p>
      <NestedFigure />
      <p>
        (0, 1)의 모든 점 x는 <M>{'1/n < x'}</M>인 <M>{'U_n'}</M>에 들어가므로 <M>{'\\{U_n\\}'}</M>은 덮개입니다. 하지만 집합들이 점점 커지는 꼴이라, 유한 개를 고르면 그중 가장 큰 <M>{'U_N'}</M> 하나와 같고, 그것은 (0, 1/N]을 놓칩니다. 그래서 (0, 1)은 콤팩트하지 않습니다. 같은 집합들로 [0, 1]을 덮으려면 0을 덮을 집합이 하나 더 있어야 하고, 그것이 (−δ, δ)라면 <M>{'1/n < \\delta'}</M>인 <M>{'U_n'}</M> 하나만 더하면 끝납니다. δ = 0.15이면 <M>{'U_7'}</M>, δ = 0.01이면 <M>{'U_{101}'}</M>입니다. 끝점 0이 공간에 들어 있다는 사실이 무한히 많은 집합이 필요했던 곳을 한 집합으로 막아 줍니다.
      </p>

      <h2>닫힌 구간은 콤팩트하다</h2>
      <p>
        [0, 1]의 덮개라면 어떤 것이든 유한 개로 줄일 수 있을까요? 그림 2에서 짧은 구간 40개로 된 덮개를 받아 왼쪽부터 차례로 골라 봅니다.
      </p>
      <GreedyFigure />
      <p>
        처음 덮개에서는 40개 가운데 12개를 고르면 [0, 1]이 다 덮입니다. <strong>다른 덮개</strong>를 누르면 구간들이 [0, 1]에 구멍을 남기는 경우도 나오는데, 그때는 애초에 덮개가 아닙니다. 빈 곳을 눌러 구간을 더해 덮개로 만들면 다시 유한 개가 골라집니다. 이 고르기는 유한 개의 구간에서는 늘 끝나지만, 무한히 많은 구간에서는 고른 구간들의 오른쪽 끝이 1에 닿기 전에 어떤 점으로 몰려들 수도 있습니다. 그런 일이 없다는 것을 보장하는 것이 다음 정리입니다.
      </p>
      <div className="cp-thm">
        <b>하이네-보렐 정리.</b> <M>{'\\mathbb{R}^n'}</M>의 부분집합이 콤팩트일 필요충분조건은 닫혀 있고 유계인 것입니다. 특히 닫힌 구간 [a, b]는 콤팩트합니다.
      </div>
      <div className="cp-proof">
        <p>
          <span className="cp-head">증명 ([a, b]가 콤팩트).</span> [a, b]의 열린 덮개 𝒰가 유한 부분 덮개를 갖지 않는다고 가정합니다. [a, b]를 반으로 나누면 두 반 중 적어도 하나는 𝒰의 유한 개로 덮이지 않습니다(둘 다 덮이면 합쳐서 전체가 덮이므로). 그 반을 <M>{'[a_1, b_1]'}</M>이라 하고 같은 일을 되풀이하면 각각 유한 개로 덮이지 않는 구간들이 <M>{'[a, b] \\supseteq [a_1, b_1] \\supseteq [a_2, b_2] \\supseteq \\cdots'}</M>로 얻어지고, 길이는 <M>{'(b - a)/2^k'}</M>입니다.
        </p>
        <p>
          <M>{'a_k'}</M>는 증가하고 b로 위가 막혀 있으니 완비성에서 극한 p가 있고, a ≤ p ≤ b입니다. p를 담는 𝒰의 집합 U가 있고, U는 열려 있으니 어떤 r &gt; 0에 대해 <M>{'(p - r, p + r) \\subseteq U'}</M>입니다. 길이가 r보다 짧아진 단계 k에서는 <M>{'[a_k, b_k] \\subseteq (p - r, p + r) \\subseteq U'}</M>이므로 그 구간은 U 하나로 덮입니다. 이는 유한 개로 덮이지 않는다는 데 모순입니다. <span className="cp-qed">∎</span>
        </p>
      </div>
      <p>
        이 증명이 정확히 어디서 닫힌 구간을 필요로 하는지 보려면, 같은 논증을 (0, 1)에 그대로 해 보면 됩니다.
      </p>
      <BisectFigure />
      <p>
        (0, 1)에서는 언제나 왼쪽 반이 남고, 남은 구간들은 0으로 줄어듭니다. 그런데 0은 공간에 없으니 "p를 담는 집합 U"를 고를 수 없어 모순이 생기지 않습니다. 증명은 극한점이 공간 안에 있다는 것, 곧 공간이 닫혀 있다는 것을 써야 했습니다. [0, 1]에서는 0을 담는 (−0.15, 0.15)가 있어 세 번 나눈 뒤 남은 [0, 0.125]가 그 안에 들어가 버립니다. 유계 조건은 처음에 공간을 길이가 유한한 구간 안에 넣고 나누기 시작하는 데 쓰였습니다. ℝⁿ에서는 상자를 2ⁿ개로 나누며 같은 논증을 합니다.
      </p>
      <Callout kind="note">
        거리 공간에서는 콤팩트성을 수열로도 말할 수 있습니다. X가 콤팩트일 필요충분조건은 X의 모든 수열이 X 안의 점으로 수렴하는 부분수열을 갖는 것(<T en="sequential compactness">점렬 콤팩트</T>)입니다. ℝⁿ에서 이것은 <a href={lessonHref('math-analysis', 'sequences')}>볼차노-바이어슈트라스 정리</a>와 같은 내용이고, 증명도 위와 같이 반씩 나누는 방식입니다. 일반 위상 공간에서는 두 성질이 다를 수 있습니다.
      </Callout>

      <h2>연속 함수는 콤팩트성을 지킨다</h2>
      <div className="cp-thm">
        <b>정리.</b> X가 콤팩트하고 <M>{'f: X \\to Y'}</M>가 연속이면 f(X)도 콤팩트합니다.
      </div>
      <div className="cp-proof">
        <p>
          <span className="cp-head">증명.</span> f(X)의 열린 덮개 𝒱를 받습니다. 연속성에서 각 V ∈ 𝒱의 역상 <M>{'f^{-1}(V)'}</M>는 열려 있고, f(X)의 모든 점이 어떤 V에 들어 있으니 이 역상들은 X의 열린 덮개입니다. X가 콤팩트하므로 그중 유한 개 <M>{'f^{-1}(V_1), \\dots, f^{-1}(V_m)'}</M>이 X를 덮습니다. 그러면 X의 모든 점 x에 대해 f(x)가 어떤 <M>{'V_i'}</M>에 들어 있으므로 <M>{'V_1, \\dots, V_m'}</M>이 f(X)를 덮습니다. <span className="cp-qed">∎</span>
        </p>
      </div>
      <p>
        이 짧은 정리에서 해석학의 중요한 사실 두 가지가 나옵니다. 첫째, f: X → ℝ이면 f(X)는 ℝ의 콤팩트 집합이라 닫혀 있고 유계이므로, 상한과 하한이 f(X) 안에 있습니다. 곧 <strong>콤팩트 집합 위의 연속 함수는 최댓값과 최솟값을 가집니다.</strong> 둘째, 같은 덮개 논증으로 콤팩트 거리 공간 위의 연속 함수는 <a href={lessonHref('math-analysis', 'continuity')}>균등 연속</a>이라는 것(하이네-칸토어 정리)을 보일 수 있습니다. 점마다 주어진 δ로 만든 열린 공들의 덮개에서 유한 개를 고르고, 그 가운데 가장 작은 δ를 모든 점에 함께 쓰면 됩니다.
      </p>
      <GalleryFigure />
      <p>
        표의 세 줄은 같은 결함의 세 얼굴입니다. 열린 원판에서는 수열 <M>{'1 - 1/n'}</M>이 빠진 경계로 달아나고, 덮개 <M>{'\\{|z| < 1 - 1/n\\}'}</M>은 그 경계 근처를 끝없이 따라가며, 함수 |z|는 1에 한없이 가까워지지만 1이 되지 못합니다. 자연수 ℕ은 닫혀 있지만 유계가 아니라 점들이 무한히 멀리 달아납니다. {'{1/n}'}과 {'{0} ∪ {1/n}'}은 점 하나 차이인데, 0이 들어가면 0을 덮는 열린 집합이 거의 모든 점을 한꺼번에 삼키므로 콤팩트해집니다. r = 0.10이면 그 밖의 점이 10개, r = 0.01이면 100개뿐입니다.
      </p>
      <Callout kind="intuition">
        실무에서 콤팩트성은 "최적의 답이 존재한다"는 보증으로 쓰입니다. <a href={lessonHref('math-numerical-analysis', 'optimization')}>최적화</a> 알고리즘이 찾는 최솟값은 함수가 연속이고 찾는 범위가 닫혀 있고 유계일 때 반드시 있습니다. 범위가 열려 있거나 끝없이 뻗어 있으면, 1/x를 (0, 1]에서 최소화하려는 것처럼 값이 계속 내려가기만 하고 도달하는 점이 없을 수 있습니다.
      </Callout>

      <Callout kind="key">
        모든 열린 덮개에서 유한 개를 골라낼 수 있는 공간이 콤팩트 공간입니다. ℝⁿ에서는 하이네-보렐 정리에 따라 닫혀 있고 유계인 집합이 정확히 콤팩트 집합이고, 증명은 반씩 나누며 극한점이 공간 안에 있다는 것을 씁니다. 거리 공간에서는 모든 수열이 수렴하는 부분수열을 갖는 것과 같습니다. 연속 함수는 콤팩트 집합을 콤팩트 집합으로 보내므로, 콤팩트 집합 위의 실숫값 연속 함수는 최댓값과 최솟값을 가지고 균등 연속입니다.
      </Callout>
      <Quiz
        q="다음 가운데 콤팩트한 집합은?"
        options={['(0, 1]', '{ (x, y) : x² + y² ≤ 1 }', '[0, ∞)', '{ 1/n : n ≥ 1 }']}
        answer={1}
        explain={<>닫힌 원판은 경계를 포함하므로 닫혀 있고, 반지름 1인 원 안에 있으니 유계이므로 하이네-보렐 정리에 따라 콤팩트합니다. (0, 1]은 0이 빠져 닫혀 있지 않고(수열 1/n이 빠진 0으로 달아남), [0, ∞)는 유계가 아니며, {'{1/n}'}은 극한점 0을 포함하지 않아 닫혀 있지 않습니다.</>}
      />
    </>
  );
}

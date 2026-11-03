import { useEffect, useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../shared';
import { packDays, powChain, powMults, shipSearch, treeLevels, treeShape, type Work } from './recursion';
import '../../algorithms/lessons/algorithms.css';
import './recursion.css';

/* ─────────────── Figure 1: reading T(n) = a·T(n/2) + f(n) from its recursion tree ─────────────── */

const TREE_N = 64;
const WORK_LABEL: Record<Work, string> = { '1': '1', n: 'n', n2: 'n²' };
const SHAPE_LABEL = { root: '뿌리 쪽', even: '층마다 같음', leaf: '잎 쪽' } as const;

function bigO(a: number, f: Work): string {
  const shape = treeShape(a, f);
  if (shape === 'root') return f === 'n' ? 'O(n)' : 'O(n^2)';
  if (shape === 'even') return { '1': 'O(\\log n)', n: 'O(n \\log n)', n2: 'O(n^2 \\log n)' }[f];
  return { 1: 'O(\\log n)', 2: 'O(n)', 3: 'O(n^{1.58})', 4: 'O(n^2)' }[a] ?? '';
}

const EXAMPLES: Record<string, string> = {
  '1|1': '이진 탐색',
  '1|n': '퀵셀렉트 (매번 절반이 남을 때)',
  '2|1': '반씩 나눠 최댓값 찾기',
  '2|n': '병합 정렬',
  '3|n': '카라추바 곱셈',
  '4|n': '큰 수 곱셈 (네 조각)',
};

function RecTreeFigure() {
  const P = usePalette();
  const [a, setA] = useState(2);
  const [f, setF] = useState<Work>('n');
  const levels = useMemo(() => treeLevels(a, f, TREE_N), [a, f]);
  const total = levels.reduce((s, l) => s + l.work, 0);
  const maxWork = Math.max(...levels.map((l) => l.work));
  const shape = treeShape(a, f);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const head = 20;
      const rh = (h - head - 4) / levels.length;
      const lx = 22; // depth labels
      const treeW = (w - lx) * 0.5;
      const bx = lx + treeW + 14;
      const valW = 44;
      const barW = w - bx - valW - 4;
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink3;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('부분 문제', lx, 2);
      ctx.fillText('층의 일', bx, 2);
      levels.forEach((l, k) => {
        const y0 = head + k * rh;
        const bh = Math.min(16, rh * 0.42);
        const by = y0 + 3;
        // depth
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(l.depth), 4, by + bh / 2);
        // the subproblems of this level
        const natural = (l.size / TREE_N) * treeW;
        const fits = l.count * natural <= treeW + 0.5;
        const bw = fits ? natural : treeW / l.count;
        ctx.fillStyle = alpha(P.neg, 0.22);
        ctx.strokeStyle = P.neg;
        ctx.lineWidth = 1;
        if (bw >= 3) {
          const x0 = lx + (treeW - l.count * bw) / 2;
          for (let i = 0; i < l.count; i++) {
            const gap = bw > 6 ? 1.5 : 0.5;
            ctx.fillRect(x0 + i * bw + gap / 2, by, bw - gap, bh);
            if (bw > 6) ctx.strokeRect(x0 + i * bw + gap / 2 + 0.5, by + 0.5, bw - gap - 1, bh - 1);
          }
        } else {
          ctx.fillStyle = alpha(P.neg, 0.45);
          ctx.fillRect(lx, by, treeW, bh);
        }
        ctx.fillStyle = P.ink2;
        ctx.font = `11px ${P.fontMono}`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${l.count.toLocaleString('ko-KR')}개 × 크기 ${l.size}`, lx, by + bh + 3);
        // work bar
        const len = Math.max(1.5, (l.work / maxWork) * barW);
        ctx.fillStyle = l.work === maxWork ? P.pos : alpha(P.pos, 0.55);
        ctx.fillRect(bx, by, len, bh);
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(l.work.toLocaleString('ko-KR'), bx + len + 5, by + bh / 2);
      });
    },
    [P, levels, maxWork],
    { aspect: 1.9, maxHeight: 330, minHeight: 300 },
  );

  return (
    <Figure
      no={1}
      title="재귀 트리로 복잡도 읽기"
      hint="a와 f(n)을 바꿔 보세요"
      caption={<>크기 n = 64인 문제를 크기가 절반인 부분 문제 a개로 나누고, 나누고 합치는 데 f(n)만큼 일한다고 합시다. 파란 칸은 각 깊이의 부분 문제들입니다. 주황 막대는 그 층에서 하는 일(부분 문제 수 × 하나당 f(크기))이고 가장 무거운 층이 진하게 칠해집니다. 크기 1인 잎에서는 f(1) = 1만큼 일합니다. 모든 층의 일을 더한 것이 전체 실행 시간입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`a = ${a}, f(n) = ${WORK_LABEL[f]}의 재귀 트리. 층별 일 ${levels.map((l) => l.work).join(', ')}, 합계 ${total}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="부분 문제 수 a" value={a} onChange={setA} options={[1, 2, 3, 4].map((k) => ({ value: k, label: String(k) }))} />
          <Seg
            label="나누고 합치는 일 f(n)"
            value={f}
            onChange={setF}
            options={(['1', 'n', 'n2'] as Work[]).map((k) => ({ value: k, label: WORK_LABEL[k] }))}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="전체 일" value={total.toLocaleString('ko-KR')} color="var(--pos)" />
            <Readout label="잎의 개수" value={levels[levels.length - 1].count.toLocaleString('ko-KR')} color="var(--neg)" />
            <Readout label="일이 몰린 곳" value={SHAPE_LABEL[shape]} />
            <Readout label="복잡도" value={<M>{bigO(a, f)}</M>} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }} aria-live="polite">
            <M>{`T(n) = ${a === 1 ? '' : a}\\,T(n/2) + ${f === 'n2' ? 'n^2' : f}`}</M>
            {EXAMPLES[`${a}|${f}`] && <> · 예: {EXAMPLES[`${a}|${f}`]}</>}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: x^n by repeated squaring ─────────────── */

const POW_MAX = 1000;

function PowFigure() {
  const P = usePalette();
  const [n, setN] = useState(100);
  const chain = useMemo(() => powChain(n), [n]);
  const bits = n.toString(2);
  const mults = chain.length - 1;
  const series = useMemo(() => Array.from({ length: POW_MAX }, (_, i) => powMults(i + 1)), []);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const L = (v: number) => Math.log10(Math.max(1, v));
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: POW_MAX, yMin: 0, yMax: 3.1, pad: { l: 40, r: 12, t: 12, b: 26 } });
      plot.grid({ xStep: 200, yStep: 1, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [1, 10, 100, 1000].forEach((v) => ctx.fillText(String(v), plot.X(0) - 6, plot.Y(L(v))));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= POW_MAX; x += 200) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 6);
      // reference: 2·log2 n
      plot.fn((x) => (x > 1 ? L(2 * Math.log2(x)) : NaN), alpha(P.ink3, 0.8), 1.2, { dash: [2, 4], from: 2 });
      // naive loop: n − 1 multiplications
      plot.fn((x) => (x > 2 ? L(x - 1) : NaN), P.neg, 2.2, { from: 2 });
      // fast power: exact counts
      ctx.fillStyle = P.pos;
      series.forEach((m, i) => {
        if (m > 0) ctx.fillRect(plot.X(i + 1) - 0.8, plot.Y(L(m)) - 0.8, 1.6, 1.6);
      });
      plot.line(n, 0, n, 3.1, alpha(P.ink, 0.35), 1, [4, 4]);
      if (n > 1) {
        plot.dot(n, L(n - 1), 4.5, P.neg, P.surface, 1.5);
        plot.dot(n, L(mults), 4.5, P.pos, P.surface, 1.5);
      }
      plot.text('n − 1', 900, L(899), P.neg, { dy: 12, align: 'right', font: `600 12px ${P.fontMono}` });
      plot.text('2 log₂ n', 900, L(2 * Math.log2(900)), P.ink3, { dy: -12, align: 'right', font: `11px ${P.fontMono}` });
    },
    [P, n, mults, series],
    { aspect: 2.3, maxHeight: 250, minHeight: 190 },
  );

  return (
    <Figure
      no={2}
      title="제곱을 거듭해 거듭제곱하기"
      hint="n을 움직여 보세요"
      caption={<>표의 숫자는 각 연산을 마친 뒤 x의 지수입니다. 이진수 n을 앞자리부터 읽으며, 한 자리 내려갈 때마다 지금까지의 값을 제곱하고(지수 2배), 그 자리가 1이면 x를 한 번 더 곱합니다(지수 +1). 그래프는 n = 1부터 1000까지 필요한 곱셈 횟수입니다. 세로축은 로그 눈금이고, 주황 점이 빠른 거듭제곱, 파란 선이 x를 n − 1번 곱하는 반복문입니다.</>}
    >
      <div className="controls row">
        <Slider id="pow-n" label="지수 n" value={n} min={1} max={POW_MAX} step={1} onChange={setN} color="var(--pos)" />
      </div>
      <div className="pw-wrap">
        <div className="pw-grid" style={{ gridTemplateColumns: `auto repeat(${bits.length}, minmax(0, 1fr))` }} role="table" aria-label={`n = ${n}의 이진수 ${bits}와 지수의 변화 ${chain.map((c) => c.exp).join(', ')}`}>
          <span className="pw-head">이진수</span>
          {[...bits].map((b, i) => (
            <span key={i} className="pw-bit" data-one={b === '1' || undefined}>
              {b}
            </span>
          ))}
          <span className="pw-head">제곱</span>
          {[...bits].map((_, i) => {
            const st = chain.find((c) => c.bit === i && c.op !== 'mul');
            return (
              <span key={i} className="pw-cell" data-op={st?.op}>
                {st ? st.exp : ''}
              </span>
            );
          })}
          <span className="pw-head">× x</span>
          {[...bits].map((_, i) => {
            const st = chain.find((c) => c.bit === i && c.op === 'mul');
            return (
              <span key={i} className="pw-cell" data-op={st ? 'mul' : undefined}>
                {st ? st.exp : ''}
              </span>
            );
          })}
        </div>
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = 1부터 ${POW_MAX}까지 곱셈 횟수 비교. 지금 n = ${n}에서 빠른 거듭제곱 ${mults}번, 반복문 ${n - 1}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="빠른 거듭제곱" value={`${mults}번`} color="var(--pos)" />
          <Readout label="반복문 (n − 1)" value={`${(n - 1).toLocaleString('ko-KR')}번`} color="var(--neg)" />
          <Readout label="제곱 · 곱하기" value={`${bits.length - 1} · ${mults - bits.length + 1}`} />
          <Readout label="자릿수 · 1의 개수" value={`${bits.length} · ${[...bits].filter((b) => b === '1').length}`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: binary search on the answer ─────────────── */

const SHIP_W = [4, 7, 2, 9, 3, 5, 8, 1, 6, 4, 7, 3];
const SHIP_MAX = Math.max(...SHIP_W);
const SHIP_SUM = SHIP_W.reduce((s, x) => s + x, 0);
const CAP_MIN = 5;
const DAY_KEYS: (keyof Palette)[] = ['neg', 'pos', 'good', 'stats2', 'stats1', 'dl'];
const DAY_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--c-stats-1)', 'var(--c-dl)'];

function ShipFigure() {
  const P = usePalette();
  const [D, setD] = useState(4);
  const [capIn, setCapIn] = useState(20);
  const [searching, setSearching] = useState(false);
  const search = useMemo(() => shipSearch(SHIP_W, D), [D]);
  const s = useStepper(search.steps.length, 1, D);
  const st = search.steps[s.i];

  // touching the stepper switches the view to the capacity the search is testing
  useEffect(() => {
    if (s.i > 0 || s.playing) setSearching(true);
  }, [s.i, s.playing]);
  useEffect(() => setSearching(false), [D]);

  const cap = searching && st.mid !== null ? st.mid : capIn;
  const pack = packDays(SHIP_W, cap);
  const ok = pack.days <= D;
  const dayOf = (i: number) => pack.groups.findIndex(([x, y]) => i >= x && i <= y);
  const probed = search.steps.slice(1, searching ? s.i + 1 : 1).filter((x) => !x.done);

  const trucks = useCanvas2D(
    (ctx, { w, h }) => {
      if (!isFinite(pack.days)) {
        ctx.fillStyle = P.bad;
        ctx.font = `600 14px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`가장 무거운 택배 ${SHIP_MAX} > 적재량 ${cap} → 실을 수 없음`, w / 2, h / 2, w - 16);
        return;
      }
      const slots = Math.max(D, pack.days);
      const top = 22;
      const bottom = 22;
      const unit = (h - top - bottom) / cap;
      const colW = w / slots;
      const tw = Math.min(64, colW * 0.74);
      for (let d = 0; d < slots; d++) {
        const x = d * colW + (colW - tw) / 2;
        const over = d >= D;
        ctx.strokeStyle = over ? P.bad : P.lineStrong;
        ctx.lineWidth = over ? 2 : 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.5, top + 0.5, tw - 1, cap * unit - 1);
        ctx.setLineDash([]);
        ctx.fillStyle = over ? P.bad : P.ink3;
        ctx.font = `${over ? 600 : 400} 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${d + 1}일`, x + tw / 2, h - bottom + 5);
        const g = pack.groups[d];
        if (!g) continue;
        let y = top + cap * unit;
        let load = 0;
        const col = P[DAY_KEYS[d % DAY_KEYS.length]] as string;
        for (let i = g[0]; i <= g[1]; i++) {
          const bh = SHIP_W[i] * unit;
          y -= bh;
          load += SHIP_W[i];
          ctx.fillStyle = alpha(col, 0.35);
          ctx.fillRect(x + 2, y + 1, tw - 4, bh - 1.5);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 2.5, y + 1.5, tw - 5, bh - 2.5);
          if (bh >= 13) {
            ctx.fillStyle = P.ink;
            ctx.font = `600 11px ${P.fontMono}`;
            ctx.textBaseline = 'middle';
            ctx.fillText(String(SHIP_W[i]), x + tw / 2, y + bh / 2 + 0.5);
          }
        }
        ctx.fillStyle = P.ink2;
        ctx.font = `11px ${P.fontMono}`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${load}/${cap}`, x + tw / 2, top - 4);
      }
    },
    [P, pack, cap, D],
    { aspect: 1.9, maxHeight: 260, minHeight: 200 },
  );

  const chart = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: CAP_MIN, xMax: SHIP_SUM + 1, yMin: 0, yMax: 10, pad: { l: 30, r: 10, t: 12, b: 28 } });
      plot.grid({ xStep: 10, yStep: 2 });
      // impossible below the heaviest package
      ctx.fillStyle = alpha(P.bad, 0.1);
      ctx.fillRect(plot.X(CAP_MIN), plot.Y(10), plot.X(SHIP_MAX) - plot.X(CAP_MIN), plot.Y(0) - plot.Y(10));
      // the range the search still has to look at
      const lo = searching ? st.lo : SHIP_MAX;
      const hi = searching ? st.hi : SHIP_SUM;
      ctx.fillStyle = alpha(P.accent, 0.1);
      ctx.fillRect(plot.X(lo - 0.5), plot.Y(10), plot.X(hi + 0.5) - plot.X(lo - 0.5), plot.Y(0) - plot.Y(10));
      plot.line(CAP_MIN, D, SHIP_SUM + 1, D, P.ink2, 1.2, [5, 4]);
      plot.text(`D = ${D}일`, SHIP_SUM + 1, D, P.ink2, { dy: -9, align: 'right', font: `11px ${P.fontMono}` });
      // days needed for every capacity: a staircase that only goes down
      ctx.strokeStyle = alpha(P.ink, 0.55);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let c = SHIP_MAX; c <= SHIP_SUM; c++) {
        const d = packDays(SHIP_W, c).days;
        ctx.moveTo(plot.X(c - 0.5), plot.Y(d));
        ctx.lineTo(plot.X(c + 0.5), plot.Y(d));
      }
      ctx.stroke();
      for (const p of probed) plot.dot(p.mid!, p.days!, 4.5, p.ok ? P.good : P.bad, P.surface, 1.5);
      if (isFinite(pack.days)) plot.dot(cap, Math.min(10, pack.days), 5.5, 'transparent', P.ink, 2);
      plot.line(cap, 0, cap, 10, alpha(P.ink, 0.4), 1, [3, 3]);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('필요한 날 (가로축: 적재량)', plot.X(CAP_MIN) + 4, plot.Y(10) + 2);
    },
    [P, searching, st, probed, cap, pack, D],
    { aspect: 1.9, maxHeight: 260, minHeight: 200 },
  );

  const note = searching
    ? st.note
    : !isFinite(pack.days)
      ? `적재량 ${cap} < 가장 무거운 택배 ${SHIP_MAX} → 불가능`
      : `적재량 ${cap}: ${pack.days}일 필요 → ${D}일 안에 ${ok ? '가능' : '불가능'}`;

  return (
    <Figure
      no={3}
      title="답을 이분 탐색하기: 트럭의 최소 적재량"
      hint="적재량을 움직여 본 뒤 이분 탐색을 재생해 보세요"
      caption={<>택배 12개를 정해진 순서대로 하루에 트럭 한 대로 보냅니다. 트럭에는 순서대로 담을 수 있는 만큼 담고, 다음 택배가 넘치면 다음 날로 넘깁니다. 트럭 그림은 지금 적재량으로 짐을 나눈 모습이고 칸 안의 숫자가 무게입니다. 계단 그래프는 적재량마다 필요한 날 수이고, 옅은 파란 띠는 이분 탐색이 이번 단계에 답을 찾고 있는 범위, 초록·빨강 점은 이분 탐색이 확인한 적재량입니다.</>}
    >
      <div className="ship-chips" aria-hidden="true">
        {SHIP_W.map((x, i) => {
          const d = dayOf(i);
          return (
            <span key={i} className="ds-cell" data-bad={x > cap || undefined} style={d >= 0 ? { background: `color-mix(in srgb, ${DAY_CSS[d % DAY_CSS.length]} 30%, var(--surface))` } : undefined}>
              {x}
            </span>
          );
        })}
      </div>
      <div className="fig-cols">
        <div ref={trucks.wrapRef} className="canvas-box" role="img" aria-label={`적재량 ${cap}로 나눈 짐: ${isFinite(pack.days) ? `${pack.days}일` : '불가능'}`}>
          <canvas ref={trucks.canvasRef} />
        </div>
        <div ref={chart.wrapRef} className="canvas-box" role="img" aria-label={`적재량별 필요한 날 수. 적재량이 커질수록 날 수는 줄어들기만 합니다`}>
          <canvas ref={chart.canvasRef} />
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }} aria-live="polite">
        {note}
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Seg label="기한 D" value={D} onChange={setD} options={[2, 3, 4, 5, 6].map((k) => ({ value: k, label: `${k}일` }))} />
          <Slider
            id="ship-cap"
            label="트럭 적재량"
            value={cap}
            min={CAP_MIN}
            max={SHIP_SUM}
            step={1}
            onChange={(v) => {
              setCapIn(v);
              setSearching(false);
            }}
            color="var(--pos)"
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="필요한 날" value={isFinite(pack.days) ? `${pack.days}일` : '불가능'} />
            <Readout label={`${D}일 안에`} value={ok ? '가능' : '불가능'} color={ok ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
        <div className="controls">
          <span className="ctl-label">
            <span>이분 탐색</span>
          </span>
          <StepControls s={s} id="ship-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="탐색 범위 [lo, hi]" value={searching ? `[${st.lo}, ${st.hi}]` : `[${SHIP_MAX}, ${SHIP_SUM}]`} color="var(--accent)" />
            <Readout label="확인한 적재량" value={`${probed.length} / ${search.probes}번`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '가능 (hi를 내림)', shape: 'dot' },
          { color: 'var(--bad)', label: '불가능 (lo를 올림)', shape: 'dot' },
          { color: 'color-mix(in srgb, var(--accent) 25%, transparent)', label: '탐색 범위', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function DivideConquer() {
  return (
    <>
      <h2>나누기, 풀기, 합치기</h2>
      <p>
        <T en="divide and conquer">분할 정복</T>은 재귀를 쓰는 가장 대표적인 설계 방법입니다. 세 단계로 이루어집니다.
      </p>
      <ol>
        <li>
          <strong>나누기</strong>: 문제를 같은 모양의 더 작은 부분 문제 몇 개로 나눕니다.
        </li>
        <li>
          <strong>풀기</strong>: 부분 문제를 재귀로 풉니다. 충분히 작으면 바로 풉니다(기저 사례).
        </li>
        <li>
          <strong>합치기</strong>: 부분 문제의 답을 모아 원래 문제의 답을 만듭니다.
        </li>
      </ol>
      <p>
        가장 유명한 예는 <a href="#cs-algorithms/sorting">정렬</a> 장에서 본 <T en="merge sort">병합 정렬</T>입니다. 배열을 반으로 나누고, 두 반쪽을 각각 정렬하고, 정렬된 두 줄을 앞에서부터 비교하며 합칩니다. 세 단계가 코드에 그대로 드러납니다.
      </p>
      <Code label="병합 정렬의 세 단계">{`
function mergeSort(a) {
  if (a.length <= 1) return a;              // 기저 사례: 이미 정렬됨

  const mid = a.length >> 1;                // 나누기
  const left = mergeSort(a.slice(0, mid));  // 풀기
  const right = mergeSort(a.slice(mid));

  const out = [];                           // 합치기: O(n)
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    out.push(left[i] <= right[j] ? left[i++] : right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}`}</Code>
      <p>
        <a href="#cs-algorithms/search-hash">이진 탐색</a>도 분할 정복입니다. 가운데 값과 한 번 비교해 절반을 버리고, 남은 절반 <strong>하나만</strong> 풉니다. 합칠 것도 없습니다. 앞 장의 <code>fib</code>와 달리 분할 정복의 부분 문제는 서로 겹치지 않는다는 점도 기억해 두세요. 왼쪽 반과 오른쪽 반은 서로 다른 원소를 다루므로 같은 계산을 두 번 하지 않습니다. 부분 문제가 겹치면 <a href="#cs-algorithm-design/dynamic-programming">동적 계획법</a>이 필요합니다.
      </p>

      <h2>재귀 트리로 복잡도 읽기</h2>
      <p>
        분할 정복 알고리즘의 실행 시간은 보통 이런 꼴의 식(<T en="recurrence">점화식</T>)으로 적습니다. 크기 n인 문제를 크기 n/b인 부분 문제 a개로 나누고, 나누고 합치는 데 f(n)만큼 일한다는 뜻입니다.
      </p>
      <MB note="병합 정렬은 a = 2, b = 2, f(n) = n, 이진 탐색은 a = 1, b = 2, f(n) = 1입니다.">{'T(n) = a\\,T\\!\\left(\\tfrac{n}{b}\\right) + f(n)'}</MB>
      <p>
        이 식을 푸는 가장 쉬운 방법은 호출을 트리로 그려 <strong>층마다 일을 더하는 것</strong>입니다. 깊이가 하나 내려갈 때마다 부분 문제는 a배 많아지고, 각각의 크기는 절반이 됩니다. 그래서 층마다 하는 일이 늘어날 수도, 줄어들 수도, 그대로일 수도 있습니다.
      </p>
      <RecTreeFigure />
      <p>a와 f(n)을 바꾸며 막대의 모양을 보세요. 세 가지 경우로 나뉩니다.</p>
      <ul>
        <li>
          <strong>층마다 같을 때</strong>: 일이 깊이 수만큼 곱해집니다. 병합 정렬(a = 2, f(n) = n)은 일곱 층이 모두 64씩 일해 합계 448 = 64 × 7, 곧 <M>{'n(\\log_2 n + 1)'}</M>입니다. 이진 탐색(a = 1, f(n) = 1)은 층마다 1씩, 합계 7입니다. 그래서 각각 <M>{'O(n \\log n)'}</M>, <M>{'O(\\log n)'}</M>입니다.
        </li>
        <li>
          <strong>뿌리 쪽이 무거울 때</strong>: 아래로 갈수록 일이 일정한 비율로 줄어드는 등비수열이라, 전체는 맨 위층의 상수 배를 넘지 않습니다. a = 2, f(n) = n²이면 층마다 일이 절반이 되어, 맨 위층이 4,096이고 합계는 그 2배가 안 되는 8,128입니다. 복잡도는 맨 위층 f(n)이 정합니다.
        </li>
        <li>
          <strong>잎 쪽이 무거울 때</strong>: 반대로 맨 아래층, 곧 잎의 개수가 정합니다. a = 4, f(n) = n이면 잎이 4,096개, 합계가 8,128이라 <M>{'O(n^2)'}</M>입니다. 큰 수 곱셈을 이렇게 네 조각으로 나누면 학교에서 배운 곱셈보다 나을 게 없습니다. 카라추바는 곱셈 하나를 덧셈 몇 번으로 바꿔 a를 3으로 줄였고, 잎이 <M>{'3^6 = 729'}</M>개로 줄어 <M>{'O(n^{\\log_2 3}) \\approx O(n^{1.58})'}</M>이 됩니다.
        </li>
      </ul>
      <p>
        정리하면, f(n) = n<sup>d</sup>일 때 a와 b<sup>d</sup>를 비교하면 됩니다. 한 층 내려갈 때 일은 <M>{'a / b^d'}</M>배가 되기 때문입니다. 이것이 <T en="master theorem">마스터 정리</T>의 핵심 아이디어입니다.
      </p>
      <MB note="a < b^d: 뿌리가 지배 · a = b^d: 층마다 같음 · a > b^d: 잎이 지배">{'T(n) = \\begin{cases} O(n^d) & a < b^d \\\\ O(n^d \\log n) & a = b^d \\\\ O(n^{\\log_b a}) & a > b^d \\end{cases}'}</MB>

      <h2>빠른 거듭제곱</h2>
      <p>
        <M>{'x^n'}</M>을 구하는 가장 단순한 방법은 x를 n − 1번 곱하는 것입니다. 분할 정복으로 생각하면 훨씬 빠릅니다. n이 짝수면 <M>{'x^n = (x^{n/2})^2'}</M>이므로 <M>{'x^{n/2}'}</M>을 한 번만 구해 제곱하면 되고, 홀수면 거기에 x를 한 번 더 곱하면 됩니다. 크기 n인 문제가 크기 n/2인 문제 <strong>하나</strong>로 줄어들므로(a = 1), 이진 탐색처럼 <M>{'O(\\log n)'}</M>입니다.
      </p>
      <Code label="빠른 거듭제곱 (n ≥ 0인 정수)">{`
function power(x, n) {
  if (n === 0) return 1;
  if (n === 1) return x;
  const half = power(x, Math.floor(n / 2));  // 부분 문제는 하나
  return n % 2 === 0 ? half * half : half * half * x;
}
power(2, 10);  // 1024`}</Code>
      <PowFigure />
      <p>
        재귀가 n을 계속 반으로 나누는 과정은 n을 이진수로 쓰는 과정과 같습니다. 그래서 제곱은 이진수 자릿수보다 하나 적게, 추가 곱셈은 1의 개수보다 하나 적게 합니다. n = 1000(이진수 1111101000)이면 제곱 9번과 곱셈 5번, 합쳐 14번이면 되고 반복문은 999번 곱합니다. 곱셈 횟수는 많아야 <M>{'2\\log_2 n'}</M>이라, n이 1000 이하일 때는 가장 많은 n = 767에서도 17번입니다.
      </p>
      <p>
        이 방법이 진가를 발휘하는 곳은 <T en="modular exponentiation">모듈러 거듭제곱</T>, 곧 <M>{'x^n \\bmod m'}</M>입니다. <M>{'2^{1000}'}</M>만 해도 302자리 수지만, 곱할 때마다 m으로 나눈 나머지만 남기면 수가 m보다 커지지 않습니다. RSA 같은 공개키 암호는 지수가 수백 자리인 거듭제곱을 이렇게 계산하고, 문자열 해싱처럼 큰 수의 나머지를 다루는 곳에서도 자주 씁니다. 반복문으로 쓰면 이진수를 낮은 자리부터 읽는 형태가 됩니다.
      </p>
      <Code label="모듈러 거듭제곱 (반복문, BigInt)">{`
function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;  // 이 자리가 1이면 곱한다
    base = (base * base) % mod;                    // 다음 자리: x, x², x⁴, x⁸ …
    exp >>= 1n;
  }
  return result;
}
modPow(3n, 200n, 1_000_000_007n);`}</Code>

      <h2>답을 이분 탐색하기</h2>
      <p>분할 정복의 아이디어는 정렬된 배열 밖에서도 쓸 수 있습니다. 이런 문제를 생각해 봅시다.</p>
      <Callout kind="intuition" label="문제">
        택배 n개를 정해진 순서대로 실어 보내야 합니다. 하루에 트럭 한 대가 한 번 가고, 순서를 바꿀 수 없습니다. D일 안에 모두 보내려면 트럭의 적재량은 최소 얼마여야 할까요?
      </Callout>
      <p>
        "최소 적재량"을 바로 구하는 공식은 떠오르지 않습니다. 하지만 질문을 뒤집으면 쉬워집니다. <strong>적재량이 c로 정해져 있다면 며칠이 걸릴까?</strong> 이것은 앞에서부터 담을 수 있는 만큼 담고 넘치면 다음 날로 넘기면 되므로 O(n)에 답할 수 있습니다.
      </p>
      <ShipFigure />
      <p>
        적재량을 키우면 걸리는 날 수는 줄거나 그대로이고, 절대 늘지 않습니다. 그림 3의 계단 그래프가 적재량이 커질수록 내려가기만 하는 것이 그 뜻입니다. 그래서 "c로 D일 안에 되는가?"의 답은 어떤 경계값 아래에서는 전부 "아니오", 위에서는 전부 "예"입니다. 이렇게 답이 한 번만 바뀌는 성질, 곧 <T en="monotonicity">단조성</T>이 있으면 정렬된 배열에서 값을 찾듯 경계를 이분 탐색할 수 있습니다. 이것을 <T en="parametric search">매개 변수 탐색</T> 또는 "답을 이분 탐색한다"고 합니다.
      </p>
      <p>
        탐색 범위도 문제에서 바로 나옵니다. 적재량은 가장 무거운 택배보다 작을 수 없고(그림 3의 예에서는 9), 전체 무게(59)면 하루에 다 실을 수 있습니다. 후보가 51개인데, 이분 탐색은 그중 6개만 확인하고 답을 찾습니다. 기한이 4일이면 답은 17입니다.
      </p>
      <Code label="D일 안에 보내는 최소 적재량">{`
function canShip(weights, cap, days) {
  let used = 1, load = 0;
  for (const w of weights) {
    if (load + w > cap) { used++; load = 0; }  // 넘치면 다음 날로
    load += w;
  }
  return used <= days;
}

function shipWithinDays(weights, days) {
  let lo = Math.max(...weights);                // 이보다 작으면 못 싣는다
  let hi = weights.reduce((s, w) => s + w, 0);  // 하루에 전부
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (canShip(weights, mid, days)) hi = mid;  // 되면 답은 mid 이하
    else lo = mid + 1;                          // 안 되면 mid보다 크다
  }
  return lo;
}
shipWithinDays([4, 7, 2, 9, 3, 5, 8, 1, 6, 4, 7, 3], 4);  // 17`}</Code>
      <p>
        전체 시간은 <M>{'O(n \\log S)'}</M>입니다(S는 전체 무게). 적재량을 9부터 하나씩 올려 보는 방법은 최악의 경우 <M>{'O(n S)'}</M>입니다. "최댓값을 최소로", "최솟값을 최대로" 만들라는 문제는 대개 이 방법이 통합니다. 막대를 잘라 필요한 길이를 얻는 최대 절단 높이, 공유기 사이의 최소 거리를 최대로 하는 배치 같은 문제가 모두 같은 틀입니다.
      </p>
      <Callout kind="warn">
        단조성이 없으면 이분 탐색은 틀린 답을 냅니다. 예를 들어 "적재량이 정확히 c일 때 짐이 남김없이 꽉 차는가?"는 c가 커진다고 계속 참이 되지 않으므로 이분 탐색할 수 없습니다. 이분 탐색을 쓰기 전에 "c에서 되면 c + 1에서도 되는가?"를 먼저 확인하세요.
      </Callout>

      <Callout kind="key">
        분할 정복은 나누기, 풀기, 합치기의 세 단계입니다. 실행 시간은 재귀 트리의 층별 일을 더해 읽고, 층마다 일이 같으면 깊이(log n)만큼 곱해지며, 위나 아래가 무거우면 그쪽 끝이 전체를 정합니다. 빠른 거듭제곱은 문제를 절반 하나로 줄여 O(log n)이 되고, 답이 단조로운 최적화 문제는 답 자체를 이분 탐색할 수 있습니다.
      </Callout>
      <Quiz
        q="크기 n인 배열의 최댓값을 '반씩 나눠 양쪽의 최댓값을 구하고 둘 중 큰 것을 고르는' 분할 정복으로 구한다. T(n) = 2T(n/2) + O(1)이다. 시간 복잡도는?"
        options={['O(log n)', 'O(n)', 'O(n log n)', 'O(n²)']}
        answer={1}
        explain={<>층마다 부분 문제 수는 2배, 하나당 일은 그대로 1이라 아래층으로 갈수록 일이 2배씩 늘어납니다(잎 쪽이 무거움). 그래서 잎의 개수 n이 전체를 정하고, 1 + 2 + 4 + … + n ≈ 2n이므로 O(n)입니다. 그림 1에서 a = 2, f(n) = 1로 놓으면 합계가 127 = 2 × 64 − 1입니다. 반복문으로 한 번 훑는 것과 같은 복잡도입니다.</>}
      />
    </>
  );
}

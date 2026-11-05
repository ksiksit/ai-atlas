import { useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button, Callout, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { drawArrow, fmt } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { EXAMPLE_CART, EXAMPLE_PICK, NPROC, before, chain, countPairs, driftSeries, exampleEvents, lamportFalseOrders, lostItems, lww, maxAbs, runCart, stamp, type CartAction, type CartMode, type Clocked, type Ev } from './clocks';
import './parallel.css';
import './clocks.css';

const PROC_VAR = ['--c-cs-1', '--c-cs-2', '--c-cs-3'];
const PROC_CSS = PROC_VAR.map((v) => `var(${v})`);
/** Resolved process colours for the canvas; re-read whenever the palette (theme) changes. */
function procColors(_P: Palette): string[] {
  const cs = getComputedStyle(document.documentElement);
  return PROC_VAR.map((v) => cs.getPropertyValue(v).trim() || '#888');
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}

const ms = (v: number) => (Math.abs(v) >= 1000 ? `${fmt(v / 1000, 2)}초` : `${fmt(v, Math.abs(v) < 10 ? 1 : 0)}ms`);

/* ─────────────── Figure 1: two quartz clocks drifting apart ─────────────── */

const HOURS = 24;

function DriftFigure() {
  const P = usePalette();
  const [ppmA, setPpmA] = useState(50);
  const [ppmB, setPpmB] = useState(-30);
  const [sync, setSync] = useState(0);
  const a = useMemo(() => driftSeries(ppmA, sync, HOURS, 1), [ppmA, sync]);
  const b = useMemo(() => driftSeries(ppmB, sync, HOURS, 2), [ppmB, sync]);
  const d = a.map((v, i) => v - b[i]);
  const worst = maxAbs(d);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const [cA, cB] = procColors(P);
      const pad = { l: 56, r: 14, t: 16, b: 30 };
      const lim = Math.max(10, maxAbs(a), maxAbs(b)) * 1.12;
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const X = (m: number) => pad.l + (m / (HOURS * 60)) * pw;
      const Y = (v: number) => pad.t + ph / 2 - (v / lim) * (ph / 2);
      // grid: hours and offsets
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (let hr = 0; hr <= HOURS; hr += 6) {
        ctx.beginPath();
        ctx.moveTo(X(hr * 60) + 0.5, pad.t);
        ctx.lineTo(X(hr * 60) + 0.5, pad.t + ph);
        ctx.stroke();
        text(ctx, `${hr}시간`, X(hr * 60), h - 12, P.ink3, `10px ${P.fontMono}`, 'center');
      }
      for (const f of [-1, -0.5, 0.5, 1]) {
        const v = (lim / 1.12) * f;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(w - pad.r, Y(v) + 0.5);
        ctx.stroke();
        text(ctx, (v > 0 ? '+' : '') + ms(v), pad.l - 6, Y(v), P.ink3, `10px ${P.fontMono}`, 'right');
      }
      ctx.strokeStyle = P.ink2;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(0) + 0.5);
      ctx.lineTo(w - pad.r, Y(0) + 0.5);
      ctx.stroke();
      text(ctx, '정확한 시간', pad.l + 4, Y(0) - 8, P.ink2, `600 10px ${P.fontBody}`);
      // the gap between the two clocks
      ctx.fillStyle = alpha(P.hl, 0.35);
      ctx.beginPath();
      a.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(b[i]));
      ctx.closePath();
      ctx.fill();
      for (const [s, c] of [
        [a, cA],
        [b, cB],
      ] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
        ctx.stroke();
      }
      text(ctx, 'A', X(HOURS * 60) - 4, Y(a[a.length - 1]) - 9, cA, `700 11px ${P.fontMono}`, 'right');
      text(ctx, 'B', X(HOURS * 60) - 4, Y(b[b.length - 1]) + 10, cB, `700 11px ${P.fontMono}`, 'right');
    },
    [P, a, b],
    { height: 260 },
  );

  return (
    <Figure
      no={1}
      title="같은 시각에 맞춘 두 서버의 시계"
      hint="오차(ppm)와 동기화 주기를 바꿔 보세요"
      caption={
        <>
          가로축은 진짜 시간, 세로축은 각 서버의 시계가 진짜 시간보다 앞선(+) 정도입니다. ppm은 백만분의 1이라는 뜻으로, 50ppm은 하루에 4.32초입니다. 노란 띠가 두 시계 사이의 차이입니다. 동기화를 켜면 시계를 NTP 서버의 시각으로 맞추는데, 네트워크 지연 때문에 맞춘 직후에도 최대 4ms 정도의 오차가 남는다고 두었습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`서버 A의 시계는 ${ppmA}ppm, B는 ${ppmB}ppm으로 틀립니다. ${sync ? `${sync === 60 ? '1시간' : '1분'}마다 동기화합니다.` : '동기화하지 않습니다.'} 하루 동안 두 시계는 최대 ${ms(worst)} 벌어집니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ck-ppm-a" label="서버 A의 오차" value={ppmA} min={-100} max={100} step={5} onChange={setPpmA} format={(v) => `${v > 0 ? '+' : ''}${v}ppm`} color={PROC_CSS[0]} />
          <Slider id="ck-ppm-b" label="서버 B의 오차" value={ppmB} min={-100} max={100} step={5} onChange={setPpmB} format={(v) => `${v > 0 ? '+' : ''}${v}ppm`} color={PROC_CSS[1]} />
          <Seg
            label="NTP 동기화"
            value={sync}
            onChange={setSync}
            options={[
              { value: 0, label: '안 함' },
              { value: 60, label: '1시간마다' },
              { value: 1, label: '1분마다' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="하루 뒤 A의 오차" value={ms(a[a.length - 1])} color={PROC_CSS[0]} />
            <Readout label="하루 뒤 B의 오차" value={ms(b[b.length - 1])} color={PROC_CSS[1]} />
            <Readout label="가장 크게 벌어진 차이" value={ms(worst)} />
            <Readout label="상대 속도 차이" value={`${Math.abs(ppmA - ppmB)}ppm`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: last write wins, decided by skewed clocks ─────────────── */

function LwwFigure() {
  const P = usePalette();
  const [skew, setSkew] = useState(120);
  const [gap, setGap] = useState(50);
  const r = lww(skew, gap);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const [cA, cB] = procColors(P);
      const pad = { l: 104, r: 22 };
      const lo = 760;
      const hi = 1440;
      const X = (t: number) => pad.l + ((t - lo) / (hi - lo)) * (w - pad.l - pad.r);
      const rows = [h * 0.3, h * 0.72];
      const names = ['실제로 일어난 순서', '타임스탬프 순서'];
      rows.forEach((y, k) => {
        text(ctx, names[k], 8, y, P.ink2, `600 11px ${P.fontBody}`);
        ctx.strokeStyle = P.lineStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, y + 0.5);
        ctx.lineTo(w - pad.r, y + 0.5);
        ctx.stroke();
        for (let t = 800; t <= 1400; t += 100) {
          ctx.beginPath();
          ctx.moveTo(X(t) + 0.5, y - 3);
          ctx.lineTo(X(t) + 0.5, y + 3);
          ctx.stroke();
          if (k === 1) text(ctx, `${t}`, X(t), y + 30, P.ink3, `10px ${P.fontMono}`, 'center');
        }
      });
      text(ctx, 'ms', w - pad.r, rows[1] + 30, P.ink3, `10px ${P.fontMono}`, 'left');
      const cols = [cA, cB];
      const lbl = ['x = 1 (A)', 'x = 2 (B)'];
      for (const i of [0, 1] as const) {
        const x0 = X(r.real[i]);
        const x1 = X(r.stamp[i]);
        ctx.strokeStyle = alpha(cols[i], 0.6);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, rows[0] + 8);
        ctx.lineTo(x1, rows[1] - 8);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const [x, y] of [
          [x0, rows[0]],
          [x1, rows[1]],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fillStyle = cols[i];
          ctx.fill();
          if (y === rows[1] && i === r.winner) {
            ctx.strokeStyle = P.ink;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 11, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        const above = i === 0 ? -1 : 1;
        text(ctx, lbl[i], x0, rows[0] + above * 18, cols[i], `700 11px ${P.fontMono}`, 'center');
        text(ctx, `${r.stamp[i]}`, x1, rows[1] + above * 16, cols[i], `600 10px ${P.fontMono}`, 'center');
      }
      text(ctx, '← 남는 값', X(r.stamp[r.winner]) + 16, rows[1], P.ink, `600 10px ${P.fontBody}`);
    },
    [P, r.real[1], r.stamp[0], r.winner],
    { height: 200 },
  );

  return (
    <Figure
      no={2}
      title="나중에 쓴 값이 이긴다는 규칙"
      hint="A의 시계가 앞선 정도와 두 쓰기의 간격을 바꿔 보세요"
      caption={
        <>
          사용자 1이 서버 A를 통해 x = 1을 쓰고, 그다음 사용자 2가 서버 B를 통해 x = 2를 씁니다. 두 서버는 각자 자기 시계로 타임스탬프를 붙이고, 나중에 두 복제본을 합칠 때 타임스탬프가 큰 쪽을 남깁니다. B의 시계는 정확하다고 두었습니다. 검은 고리가 남는 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`실제로는 x = 1이 ${r.real[0]}ms, x = 2가 ${r.real[1]}ms에 쓰였습니다. 타임스탬프는 각각 ${r.stamp[0]}, ${r.stamp[1]}이라 x = ${r.winner + 1}이 남습니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pd-note" data-bad={r.lost || undefined} aria-live="polite">
            {r.lost
              ? `x = 1이 남았습니다. 실제로는 x = 2가 ${gap}ms 뒤에 쓰였지만, A의 시계가 ${skew}ms 앞서 있어서 x = 1의 타임스탬프가 더 큽니다. 사용자 2의 쓰기는 아무 오류 없이 사라졌습니다.`
              : `x = 2가 남았습니다. 두 쓰기의 간격(${gap}ms)이 A의 시계가 앞선 정도(${skew}ms)보다 커서 타임스탬프 순서와 실제 순서가 같습니다.`}
          </div>
        </div>
        <div className="controls">
          <Slider id="ck-skew" label="A의 시계가 앞선 정도" value={skew} min={-200} max={200} step={10} onChange={setSkew} format={(v) => `${v > 0 ? '+' : ''}${v}ms`} color={PROC_CSS[0]} />
          <Slider id="ck-gap" label="두 쓰기의 실제 간격" value={gap} min={0} max={300} step={10} onChange={setGap} format={(v) => `${v}ms`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="남는 값" value={`x = ${r.winner + 1}`} color={r.lost ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="사라진 쓰기" value={r.lost ? 'x = 2' : '없음'} color={r.lost ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: build a space-time diagram ─────────────── */

type Mode = 'event' | 'msg' | 'pick';
type Show = 'lamport' | 'vector' | 'both';
const PROC_NAME = ['P1', 'P2', 'P3'];
const vecStr = (v: number[]) => `[${v.join(',')}]`;

function SpaceTimeFigure() {
  const P = usePalette();
  const [evs, setEvs] = useState<Ev[]>(exampleEvents);
  const [groups, setGroups] = useState<number[][]>([]);
  const [mode, setMode] = useState<Mode>('pick');
  const [show, setShow] = useState<Show>('both');
  const [pending, setPending] = useState<{ p: number; x: number } | null>(null);
  const [picked, setPicked] = useState<number[]>(EXAMPLE_PICK);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(2);
  const st = useMemo(() => stamp(evs), [evs]);
  const pairs = countPairs(st);
  const fooled = lamportFalseOrders(st);
  const span = Math.max(10, ...evs.map((e) => e.x + 1.2));
  const nextId = Math.max(0, ...evs.map((e) => e.id)) + 1;
  const ends = Array.from({ length: NPROC }, (_, p) => Math.max(0, ...evs.filter((e) => e.p === p).map((e) => e.x)));

  const add = (more: Ev[]) => {
    setEvs((xs) => [...xs, ...more]);
    setGroups((g) => [...g, more.map((e) => e.id)]);
  };
  const nudge = (p: number, x: number) => {
    let v = Math.max(0.3, Math.round(x * 4) / 4);
    while (evs.some((e) => e.p === p && Math.abs(e.x - v) < 0.6)) v += 0.25;
    return v;
  };
  const addLocal = (p: number, x = ends[p] + 1) => add([{ id: nextId, p, x: nudge(p, x), kind: 'local' }]);
  const addMsg = (p: number, x: number, q: number, y: number) => {
    const sx = nudge(p, x);
    const rx = nudge(q, Math.max(y, sx + 0.5));
    add([
      { id: nextId, p, x: sx, kind: 'send' },
      { id: nextId + 1, p: q, x: rx, kind: 'recv', from: nextId },
    ]);
  };
  const undo = () => {
    const last = groups[groups.length - 1];
    if (!last) return;
    setEvs((xs) => xs.filter((e) => !last.includes(e.id)));
    setPicked((ps) => ps.filter((id) => !last.includes(id)));
    setGroups((g) => g.slice(0, -1));
  };
  const reset = (example: boolean) => {
    setEvs(example ? exampleEvents() : []);
    setGroups([]);
    setPicked(example ? EXAMPLE_PICK : []);
    setPending(null);
  };
  const pick = (id: number) => setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id].slice(-2)));

  const geom = (w: number) => {
    const left = 46;
    const right = 18;
    return { left, X: (u: number) => left + (u / span) * (w - left - right), U: (x: number) => ((x - left) / (w - left - right)) * span, Y: (p: number) => 62 + p * 96 };
  };

  const pa = st.find((e) => e.id === picked[0]);
  const pb = st.find((e) => e.id === picked[1]);
  let path: Clocked[] | null = null;
  let relation = '';
  if (pa && pb) {
    const [a, b] = before(pb, pa) ? [pb, pa] : [pa, pb];
    if (before(a, b)) {
      path = chain(st, a, b);
      relation = `${a.name} → ${b.name}: ${a.name}가 ${b.name}보다 먼저 일어났습니다. ${a.name}에서 ${b.name}까지 프로세스 안의 순서와 메시지를 따라 이어지는 길(${path?.map((e) => e.name).join(' → ')})이 있습니다. 벡터 시계로는 ${vecStr(a.vec)}의 모든 칸이 ${vecStr(b.vec)}의 같은 칸보다 작거나 같습니다. 램포트 시계도 ${a.lamport} < ${b.lamport}입니다.`;
    } else {
      const [x, y] = a.lamport <= b.lamport ? [a, b] : [b, a];
      const kx = x.vec.findIndex((v, k) => v > y.vec[k]);
      const ky = y.vec.findIndex((v, k) => v > x.vec[k]);
      relation = `${x.name} ∥ ${y.name}: 동시입니다. 어느 쪽에서 출발해도 다른 쪽에 닿는 길이 없습니다. 벡터 시계로는 ${kx + 1}번째 칸은 ${x.name}가(${x.vec[kx]} > ${y.vec[kx]}), ${ky + 1}번째 칸은 ${y.name}가(${y.vec[ky]} > ${x.vec[ky]}) 커서 어느 쪽도 다른 쪽보다 작지 않습니다.${x.lamport < y.lamport ? ` 램포트 시계만 보면 ${x.lamport} < ${y.lamport}라서 ${x.name}가 먼저인 것처럼 보이지만, 이 순서는 실제 인과 관계가 아닙니다.` : ` 램포트 시계도 ${x.lamport}로 같습니다.`}`;
    }
  } else if (pa) relation = `${pa.name}를 골랐습니다. 비교할 사건을 하나 더 고르세요.`;
  else relation = '사건 두 개를 고르면 둘 사이의 관계를 설명합니다.';
  const onPath = new Set<string>();
  path?.forEach((e, k) => k && onPath.add(`${path![k - 1].id}-${e.id}`));

  const hint =
    mode === 'event'
      ? '프로세스 선 위를 누르면 그 자리에 사건이 생깁니다.'
      : mode === 'msg'
        ? pending
          ? `${PROC_NAME[pending.p]}에서 보낼 자리를 정했습니다. 받을 프로세스의 선 위를 누르세요.`
          : '보낼 프로세스의 선 위를 한 번, 받을 프로세스의 선 위를 한 번 누르세요.'
        : '사건(동그라미)을 눌러 두 개를 고르세요.';

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const { x, y } = localPoint(e, el);
    const g = geom(el.clientWidth);
    const p = [0, 1, 2].reduce((best, q) => (Math.abs(y - g.Y(q)) < Math.abs(y - g.Y(best)) ? q : best), 0);
    if (mode === 'pick') {
      const hit = st.find((ev) => Math.hypot(g.X(ev.x) - x, g.Y(ev.p) - y) < 14);
      if (hit) pick(hit.id);
      return;
    }
    if (Math.abs(y - g.Y(p)) > 34 || x < g.left - 6) return;
    const u = Math.max(0.3, g.U(x));
    if (mode === 'event') addLocal(p, u);
    else if (!pending || pending.p === p) setPending({ p, x: u });
    else {
      addMsg(pending.p, pending.x, p, u);
      setPending(null);
    }
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const C = procColors(P);
      const g = geom(w);
      const byId = new Map(st.map((e) => [e.id, e]));
      for (let p = 0; p < NPROC; p++) {
        const y = g.Y(p);
        ctx.strokeStyle = C[p];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.left, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
        drawArrow(ctx, w - 24, y, w - 8, y, C[p], 2, 8);
        text(ctx, PROC_NAME[p], 8, y, C[p], `700 12px ${P.fontMono}`);
      }
      text(ctx, '시간 →', w - 12, h - 10, P.ink3, `10px ${P.fontBody}`, 'right');
      // highlighted chain along process lines
      path?.forEach((e, k) => {
        if (!k) return;
        const a = path![k - 1];
        if (a.p === e.p) {
          ctx.strokeStyle = alpha(P.hl, 0.9);
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(g.X(a.x), g.Y(a.p));
          ctx.lineTo(g.X(e.x), g.Y(e.p));
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
      });
      // messages
      for (const e of st) {
        if (e.kind !== 'recv' || e.from === undefined) continue;
        const s = byId.get(e.from);
        if (!s) continue;
        const hot = onPath.has(`${s.id}-${e.id}`);
        if (hot) {
          ctx.strokeStyle = alpha(P.hl, 0.9);
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(g.X(s.x), g.Y(s.p));
          ctx.lineTo(g.X(e.x), g.Y(e.p));
          ctx.stroke();
        }
        const dx = g.X(e.x) - g.X(s.x);
        const dy = g.Y(e.p) - g.Y(s.p);
        const len = Math.hypot(dx, dy);
        drawArrow(ctx, g.X(s.x) + (dx / len) * 10, g.Y(s.p) + (dy / len) * 10, g.X(e.x) - (dx / len) * 10, g.Y(e.p) - (dy / len) * 10, P.ink2, 1.5, 8);
      }
      if (pending) {
        ctx.strokeStyle = C[pending.p];
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.X(pending.x), g.Y(pending.p), 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // events and their timestamps
      for (const e of st) {
        const x = g.X(e.x);
        const y = g.Y(e.p);
        const sel = picked.includes(e.id);
        if (sel) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, 9.5, 0, Math.PI * 2);
        ctx.fillStyle = e.kind === 'local' ? P.surface : C[e.p];
        ctx.fill();
        ctx.strokeStyle = C[e.p];
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, e.name, x, y + 0.5, e.kind === 'local' ? P.ink : P.surface, `700 11px ${P.fontMono}`, 'center');
        if (show !== 'vector') text(ctx, `${e.lamport}`, x, y - 22, P.ink, `700 11px ${P.fontMono}`, 'center');
        if (show !== 'lamport') text(ctx, vecStr(e.vec), x, y + 24, P.ink2, `10px ${P.fontMono}`, 'center');
      }
    },
    [P, st, picked, pending, show, span, path],
    { height: 300 },
  );

  return (
    <Figure
      no={3}
      title="사건과 메시지로 그리는 시공간 도표"
      hint={hint}
      caption={
        <>
          가로선은 프로세스 셋(P1, P2, P3)의 시간 흐름이고, 동그라미는 사건, 화살표는 메시지입니다. 속이 빈 동그라미는 프로세스 안에서만 일어난 사건이고, 칠한 동그라미는 메시지를 보내거나 받은 사건입니다. 동그라미 위의 수는 램포트 시계, 아래 대괄호는 벡터 시계 [P1, P2, P3]입니다. 두 사건을 고르면 먼저 일어남 관계를 이루는 길이 노랗게 칠해집니다. 가로 위치는 그리기 편하게 놓은 것일 뿐 실제 시각이 아닙니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="누르면"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setPending(null);
          }}
          options={[
            { value: 'pick', label: '사건 고르기' },
            { value: 'event', label: '사건 추가' },
            { value: 'msg', label: '메시지 보내기' },
          ]}
        />
        <Seg
          label="보이는 시계"
          value={show}
          onChange={setShow}
          options={[
            { value: 'lamport', label: '램포트' },
            { value: 'vector', label: '벡터' },
            { value: 'both', label: '둘 다' },
          ]}
        />
      </div>
      <div ref={wrapRef} className="canvas-box ck-diagram" data-mode={mode} onPointerDown={onDown} role="img" aria-label={`시공간 도표. 사건 ${st.length}개, 메시지 ${st.filter((e) => e.kind === 'recv').length}개. ${relation}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="pd-note" aria-live="polite">
        {relation}
      </div>
      <div className="ck-tools">
        <div className="btn-row" role="group" aria-label="키보드로 사건 추가">
          {PROC_NAME.map((n, p) => (
            <Button key={n} small onClick={() => addLocal(p)}>
              {n}에 사건
            </Button>
          ))}
        </div>
        <div className="ck-send" role="group" aria-label="키보드로 메시지 보내기">
          <label>
            <span>보내는 쪽</span>
            <select value={from} onChange={(e) => setFrom(+e.target.value)}>
              {PROC_NAME.map((n, p) => (
                <option key={n} value={p}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>받는 쪽</span>
            <select value={to} onChange={(e) => setTo(+e.target.value)}>
              {PROC_NAME.map((n, p) => (
                <option key={n} value={p}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button small onClick={() => addMsg(from, ends[from] + 1, to, ends[to] + 1)} disabled={from === to}>
            메시지 보내기
          </Button>
        </div>
        <div className="ck-send" role="group" aria-label="비교할 사건 고르기">
          {[0, 1].map((k) => (
            <label key={k}>
              <span>사건 {k + 1}</span>
              <select
                value={picked[k] ?? ''}
                onChange={(e) => {
                  const v = +e.target.value;
                  setPicked((ps) => {
                    const n = [...ps];
                    n[k] = v;
                    return n.filter((x) => x !== undefined);
                  });
                }}
              >
                <option value="" disabled>
                  고르기
                </option>
                {[...st]
                  .sort((a, b) => a.id - b.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({PROC_NAME[e.p]})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <div className="btn-row">
          <Button small onClick={undo} disabled={!groups.length}>
            되돌리기
          </Button>
          <Button small onClick={() => reset(true)}>
            처음 예시로
          </Button>
          <Button small onClick={() => reset(false)}>
            모두 지우기
          </Button>
        </div>
      </div>
      <div className="readouts">
        <Readout label="사건" value={`${st.length}개`} />
        <Readout label="순서가 있는 쌍" value={`${pairs.ordered}쌍`} />
        <Readout label="동시인 쌍" value={`${pairs.conc}쌍`} />
        <Readout label="램포트가 속는 쌍" value={`${fooled.length}쌍`} color={fooled.length ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: a shopping cart edited on two replicas ─────────────── */

function CartFigure() {
  const [actions, setActions] = useState<CartAction[]>(EXAMPLE_CART);
  const [mode, setMode] = useState<CartMode>('vector');
  const states = useMemo(() => runCart(actions, mode), [actions, mode]);
  const s = states[states.length - 1];
  const lost = lostItems(s);
  const conflict = s.rep.some((r) => r.length > 1);
  const push = (a: CartAction) => setActions((xs) => [...xs, a]);

  return (
    <Figure
      no={4}
      title="두 복제본에서 동시에 고친 장바구니"
      hint="A나 B에서 물건을 담고, 동기화해 보세요"
      caption={
        <>
          장바구니를 서버 A와 B 두 곳에 복제해 둡니다. 물건을 담으면 그 서버가 가진 모든 버전을 읽어 합친 뒤 하나를 더해 새 버전을 쓰고, 버전에 벡터 시계 [A, B]를 붙입니다. 동기화하면 두 서버가 버전을 주고받고, 다른 버전에 완전히 포함되는 버전은 버립니다. "마지막 쓰기 승리"로 바꾸면 벡터 대신 쓴 시각만 보고 하나를 남깁니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="합치는 규칙"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'vector', label: '벡터 시계로 갈래 보존' },
            { value: 'lww', label: '마지막 쓰기 승리' },
          ]}
        />
        <div className="btn-row">
          <Button small primary onClick={() => push({ kind: 'add', at: 0 })}>
            A에서 담기
          </Button>
          <Button small primary onClick={() => push({ kind: 'add', at: 1 })}>
            B에서 담기
          </Button>
          <Button small onClick={() => push({ kind: 'sync' })}>
            A ⇄ B 동기화
          </Button>
          <Button small onClick={() => setActions((xs) => xs.slice(0, -1))} disabled={!actions.length}>
            되돌리기
          </Button>
          <Button small onClick={() => setActions(EXAMPLE_CART)}>
            처음 예시로
          </Button>
          <Button small onClick={() => setActions([])}>
            비우기
          </Button>
        </div>
      </div>
      <div className="ck-reps">
        {s.rep.map((vs, k) => (
          <div key={k} className="ck-rep" style={{ ['--c' as string]: PROC_CSS[k] }}>
            <div className="ck-rep-head">
              <strong>서버 {k ? 'B' : 'A'}</strong>
              <span data-bad={vs.length > 1 || undefined}>{vs.length > 1 ? `갈래 ${vs.length}개 (동시 수정)` : vs.length ? '버전 1개' : '비어 있음'}</span>
            </div>
            {vs.map((v, i) => (
              <div key={i} className="ck-ver">
                <span className="ck-vec mono">[{v.vec.join(', ')}]</span>
                <span className="pd-chips">
                  {v.items.map((it) => (
                    <span key={it} className="pd-chip">
                      {it}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <ol className="ck-log" aria-label="지금까지 한 일">
        {s.log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <div className="pd-note" data-bad={lost.length > 0 || undefined} aria-live="polite">
        {lost.length
          ? `${lost.join(', ')}이(가) 사라졌습니다. 마지막 쓰기 승리는 두 버전 중 시각이 늦은 하나만 남기므로, 동시에 담은 물건 중 한쪽이 아무 경고 없이 버려집니다.`
          : conflict
            ? '두 버전이 서로를 포함하지 않으므로(벡터의 한 칸은 이쪽이, 다른 칸은 저쪽이 큼) 둘 다 남겼습니다. 다음에 이 서버에서 담으면 두 갈래를 합친 뒤 새 버전을 씁니다.'
            : '버전이 하나로 정리되어 있습니다. 동기화하기 전에 A와 B에서 각각 담아 보세요.'}
      </div>
      <Legend
        items={[
          { color: PROC_CSS[0], label: '서버 A', shape: 'sq' },
          { color: PROC_CSS[1], label: '서버 B', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Clocks() {
  return (
    <>
      <h2>지금 몇 시인가요?</h2>
      <p>
        한 컴퓨터 안에서는 "무엇이 먼저 일어났는가"가 어렵지 않습니다. 운영체제의 시계 하나가 모든 사건에 시각을 붙여 주기 때문입니다. 컴퓨터가 여러 대가 되면 이야기가 달라집니다. 서버마다 시계가 따로 있고, 그 시계들은 조금씩 다른 속도로 갑니다.
      </p>
      <p>
        컴퓨터의 시계는 수정(쿼츠) 진동자가 1초에 정해진 횟수만큼 떨리는 것을 셉니다. 진동 속도는 만들 때의 오차와 온도에 따라 조금씩 다르고, 흔한 진동자는 수십 <T en="parts per million">ppm</T> 정도 틀립니다. 50ppm이면 1초에 0.00005초, 하루면 4.32초입니다. 그림 1은 같은 순간에 정확히 맞춘 두 서버의 시계가 하루 동안 얼마나 벌어지는지 보여 줍니다.
      </p>
      <DriftFigure />
      <p>
        기본 설정에서 A는 하루에 4.32초 빨라지고 B는 2.59초 느려져서, 하루가 지나면 둘은 6.91초 벌어집니다. 그래서 서버들은 <T en="Network Time Protocol">NTP</T>로 정확한 시계를 가진 서버에 주기적으로 시각을 물어 자기 시계를 고칩니다. 1시간마다 맞추면 가장 크게 벌어진 차이가 290ms로, 1분마다 맞추면 7.7ms로 줄어듭니다. 실제 NTP는 시계를 한 번에 바꾸지 않고, 자기 시계가 얼마나 빠른지를 재서 속도를 조금씩 고치기도 합니다.
      </p>
      <p>
        그래도 0이 되지는 않습니다. NTP 서버에 묻고 답을 받는 사이에 네트워크 지연이 끼고, 그 지연이 가는 길과 오는 길에서 다르면 그만큼 틀린 시각으로 맞춥니다. 같은 데이터센터 안에서는 1ms 안쪽, 인터넷 너머로는 수십 ms의 오차가 흔합니다. 게다가 NTP가 시계를 뒤로 돌리면, 한 서버 안에서조차 나중에 잰 시각이 먼저 잰 시각보다 작아질 수 있습니다.
      </p>

      <h2>나중에 쓴 값이 지는 버그</h2>
      <p>
        시계가 몇십 밀리초 틀리는 것이 무슨 문제일까요? 여러 서버에 복제된 데이터를 합칠 때 문제가 됩니다. 두 서버가 같은 키를 각자 고쳤다면 하나를 골라야 하는데, 가장 간단한 규칙은 타임스탬프가 큰 쪽, 즉 나중에 쓴 쪽을 남기는 <T en="last write wins, LWW">마지막 쓰기 승리</T>입니다. 그림 2에서 시계가 틀린 서버로 이 규칙을 써 보세요.
      </p>
      <LwwFigure />
      <p>
        기본 설정에서는 x = 2가 50ms 나중에 쓰였는데도 x = 1이 남습니다. A의 시계가 120ms 앞서 있어서, 먼저 쓴 x = 1이 1120이라는 더 큰 타임스탬프를 받았기 때문입니다. 두 쓰기의 간격이 120ms를 넘어야 그제야 x = 2가 이깁니다. 시계 차이보다 가까운 간격으로 일어난 두 사건은 타임스탬프로 순서를 정할 수 없습니다.
      </p>
      <Callout kind="warn">
        이 버그는 오류 메시지를 남기지 않습니다. 두 사용자 모두 "저장했습니다"라는 답을 받고, 한 사람의 수정만 조용히 사라집니다. 마지막 쓰기 승리를 기본으로 쓰는 데이터베이스(예를 들어 Cassandra)에서는 서버 시계를 잘 맞추는 일이 곧 데이터를 지키는 일입니다. Google의 Spanner는 아예 GPS 수신기와 원자시계로 시계 오차의 상한(보통 10ms 안쪽)을 재고, 커밋할 때 그 오차만큼 기다려서 타임스탬프 순서가 실제 순서와 어긋나지 않게 합니다.
      </Callout>

      <h2>먼저 일어남</h2>
      <p>
        1978년 램포트(Leslie Lamport)는 다른 질문을 던졌습니다. 정확한 시각이 정말 필요할까요? 우리가 알고 싶은 것은 대개 "이 사건이 저 사건에 영향을 줄 수 있었는가"입니다. 그리고 분산 시스템에서 한 사건이 다른 사건에 영향을 주는 길은 두 가지뿐입니다. 같은 프로세스 안에서 앞서 일어났거나, 메시지로 소식이 전해졌거나. 램포트는 이것으로 <T en="happened-before">먼저 일어남</T> 관계(→)를 정의했습니다.
      </p>
      <ol>
        <li>같은 프로세스 안에서 a가 b보다 앞이면 a → b.</li>
        <li>a가 메시지를 보낸 사건이고 b가 그 메시지를 받은 사건이면 a → b.</li>
        <li>a → b이고 b → c이면 a → c.</li>
      </ol>
      <p>
        a → b도 아니고 b → a도 아니면, a와 b는 <T en="concurrent">동시</T>(a ∥ b)라고 합니다. 같은 순간에 일어났다는 뜻이 아니라, 서로의 존재를 알 수 없었다는 뜻입니다. 동시인 두 사건은 실제 시각으로는 몇 초 차이가 나도 상관없습니다.
      </p>

      <h2>램포트 시계</h2>
      <p>
        <T en="Lamport clock">램포트 시계</T>는 이 관계를 수 하나로 따라가는 방법입니다. 프로세스마다 정수 카운터를 하나 두고, 세 가지 규칙만 지킵니다.
      </p>
      <Code label="램포트 시계">{`
let L = 0;                       // 프로세스마다 하나

function localEvent() { L += 1; }

function send(msg) {
  L += 1;
  network.send({ ...msg, L });  // 보낼 때 자기 시계를 붙인다
}

function receive(msg) {
  L = Math.max(L, msg.L) + 1;    // 받은 시계와 내 시계 중 큰 쪽보다 1 크게
}`}</Code>
      <p>
        이렇게 하면 a → b일 때 언제나 L(a) &lt; L(b)입니다. 같은 프로세스 안에서는 카운터가 늘기만 하고, 메시지를 받으면 보낸 쪽의 값보다 커지기 때문입니다. 그림 3에서 직접 사건과 메시지를 더해 가며 확인해 보세요. 동그라미 위의 수가 램포트 시계입니다.
      </p>
      <SpaceTimeFigure />
      <p>
        처음 예시에는 사건 10개, 쌍으로는 45쌍이 있고, 그중 32쌍은 순서가 있고 13쌍은 동시입니다. 처음 골라 둔 g와 j를 보세요. 램포트 시계는 g가 5, j가 6이라 g가 먼저인 것처럼 보이지만, g는 P2가 P1에게 보낸 메시지이고 j는 P3 안의 사건이라 g에서 j로 가는 길이 없습니다. 반대 방향은 성립하지 않는 것입니다. L(a) &lt; L(b)라고 해서 a → b는 아닙니다. 예시에서 램포트 시계가 이렇게 "속는" 쌍은 8쌍입니다.
      </p>
      <p>
        그래도 램포트 시계는 쓸모가 많습니다. 값이 같은 사건은 프로세스 번호로 순서를 정하면, 모든 프로세스가 똑같이 동의하는 하나의 전체 순서를 얻습니다. 이 순서는 인과 관계를 어기지 않습니다. 램포트는 같은 논문에서 이 전체 순서로 공유 자원을 차례대로 쓰게 하는 분산 상호 배제를 보였습니다. <a href={lessonHref('cs-operating-systems', 'locks')}>경쟁 조건과 락</a> 장의 뮤텍스를 메모리를 공유하지 않는 기계들 사이에서 만든 셈입니다.
      </p>

      <h2>벡터 시계</h2>
      <p>
        두 사건이 동시인지 정확히 알아야 할 때는 <T en="vector clock">벡터 시계</T>를 씁니다. 프로세스마다 수 하나 대신 프로세스 수만큼의 칸을 가진 배열을 두고, 칸 i에 "프로세스 i의 사건을 몇 개까지 알고 있는가"를 적습니다.
      </p>
      <Code label="벡터 시계 (프로세스 i에서)">{`
const V = [0, 0, 0];             // 프로세스 수만큼

function localEvent() { V[i] += 1; }

function send(msg) {
  V[i] += 1;
  network.send({ ...msg, V: [...V] });
}

function receive(msg) {
  // 칸마다 내 값과 받은 값 중 큰 쪽
  for (let k = 0; k < V.length; k++) V[k] = Math.max(V[k], msg.V[k]);
  V[i] += 1;
}

// a → b  ⇔  모든 칸에서 Va[k] ≤ Vb[k]이고, 적어도 한 칸은 작다
const before = (Va, Vb) =>
  Va.every((v, k) => v <= Vb[k]) && Va.some((v, k) => v < Vb[k]);`}</Code>
      <p>
        벡터 시계에서는 a → b와 "모든 칸에서 V(a) ≤ V(b)"가 정확히 같은 말입니다. b가 a의 소식을 들었다면, a가 알던 것을 b도 모두 알기 때문입니다. 그림 3에서 "벡터"만 보이게 하고 g와 j를 다시 보세요. g는 [2,4,0], j는 [2,3,3]입니다. 둘째 칸은 g가, 셋째 칸은 j가 커서 어느 쪽도 다른 쪽보다 작지 않으므로 동시입니다. 메시지를 하나 더해 g의 소식이 j 앞에 P3에 닿게 하면, 동시였던 쌍이 순서 있는 쌍으로 바뀝니다.
      </p>
      <p>
        대가는 크기입니다. 벡터 시계는 프로세스 수만큼 커지므로, 서버가 수천 대이거나 클라이언트가 수백만 명이면 메시지마다 큰 배열을 실어야 합니다. 그래서 실제 시스템은 데이터를 고치는 복제본 몇 개만 칸으로 두는 식으로 줄여 씁니다.
      </p>

      <h2>동시에 고친 장바구니</h2>
      <p>
        벡터 시계가 가장 유명하게 쓰인 곳은 2007년 Amazon이 발표한 키-값 저장소 Dynamo입니다. Dynamo는 데이터를 <a href={lessonHref('cs-system-algorithms', 'consistent-hashing')}>일관된 해싱</a>으로 여러 서버에 나눠 복제하고, 네트워크가 끊겨도 어느 복제본에서나 쓰기를 받습니다. 장바구니에 담기 버튼은 언제나 동작해야 한다는 것이 Amazon의 요구였습니다. 그러면 두 복제본이 같은 장바구니를 동시에 고치는 일이 생깁니다. 그림 4에서 확인해 보세요.
      </p>
      <CartFigure />
      <p>
        처음 예시는 A에서 우유를 담고 동기화한 뒤, A에서 빵을, B에서 달걀을 각각 담고 다시 동기화한 상태입니다. 빵을 담은 버전은 [2, 0], 달걀을 담은 버전은 [1, 1]입니다. 첫 칸은 빵 쪽이, 둘째 칸은 달걀 쪽이 크므로 두 수정은 동시이고, 어느 쪽도 버릴 수 없어 두 <T en="siblings">갈래</T>를 모두 남깁니다. 여기서 A에서 하나를 더 담으면 두 갈래를 합친 [우유, 빵, 달걀]에 사과를 더한 [3, 1] 버전이 생기고, 갈래는 하나로 정리됩니다.
      </p>
      <p>
        "마지막 쓰기 승리"로 바꾸면 같은 순서에서 빵이 사라집니다. 달걀을 담은 쓰기가 시각으로는 나중이라 그 버전만 남았기 때문입니다. 벡터 시계는 충돌을 해결해 주지는 않지만, 충돌이 있었다는 사실을 놓치지 않게 해 줍니다. 해결은 응용 프로그램의 몫입니다. 장바구니는 합집합으로 합치면 되지만, 이 규칙에도 약점이 있습니다. Dynamo 논문은 지운 물건이 다른 갈래에 남아 있다가 합칠 때 다시 나타날 수 있다고 적었습니다.
      </p>
      <Callout kind="note">
        시계를 맞추는 것만으로는 모든 복제본이 같은 결정을 내리게 할 수 없습니다. 동시에 들어온 두 쓰기 중 무엇을 받아들일지, 서버가 꺼지면 누가 이어받을지 모두가 같은 답에 이르게 하는 문제가 <a href={lessonHref('cs-parallel-distributed', 'consensus')}>복제와 합의</a>에서 이어집니다.
      </Callout>

      <Callout kind="key">
        서버의 시계는 수십 ppm씩 틀리고 NTP로 맞춰도 수 ms에서 수십 ms의 오차가 남으므로, 시계 차이보다 가까운 두 사건은 타임스탬프로 순서를 정할 수 없습니다. 램포트의 먼저 일어남 관계는 같은 프로세스 안의 순서와 메시지만으로 순서를 정의하고, 어느 쪽으로도 길이 없는 사건은 동시입니다. 램포트 시계는 a → b이면 L(a) &lt; L(b)를 보장하지만 반대는 아니고, 벡터 시계는 a → b와 V(a) ≤ V(b)가 정확히 같아서 동시인 수정을 찾아낼 수 있습니다.
      </Callout>
      <Quiz
        q="서버 세 대가 벡터 시계를 쓴다. 사건 a의 벡터는 [3, 1, 0], 사건 b의 벡터는 [2, 2, 0]이다. 옳은 것은?"
        options={['a → b. a의 첫 칸이 더 크므로 a가 더 많이 진행했다', 'b → a. 칸의 합이 4로 같으면 뒤 칸이 큰 쪽이 먼저다', 'a와 b는 동시다. 어느 쪽도 다른 쪽의 모든 칸보다 작거나 같지 않다', '알 수 없다. 실제 시각을 함께 봐야 한다']}
        answer={2}
        explain={<>첫 칸은 a가 크고(3 &gt; 2) 둘째 칸은 b가 큽니다(2 &gt; 1). a → b가 되려면 a의 모든 칸이 b의 같은 칸보다 작거나 같아야 하고, b → a도 마찬가지입니다. 둘 다 아니므로 a와 b는 서로의 소식을 모른 채 일어난 동시 사건입니다. 벡터 시계는 이것을 실제 시각 없이 정확히 알려 줍니다.</>}
      />
    </>
  );
}

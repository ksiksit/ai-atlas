import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../shared';
import { BUILD, criticalPath, findCycle, kahnFrames, kahnPicked, type Edge } from './graphs';
import '../../algorithms/lessons/algorithms.css';
import './graphs.css';

const { names: NAMES, dur: DUR0, edges: EDGES } = BUILD;
const N = NAMES.length;
/** Left-to-right layout: column (0..1) and row (0..1) of each task. */
const POS: [number, number][] = [
  [0, 0.3],
  [0, 1],
  [0.36, 0],
  [0.36, 0.333],
  [0.36, 0.667],
  [0.36, 1],
  [0.68, 1],
  [1, 0.5],
];

interface NodeLook {
  fill: string;
  ink: string;
  ring?: string;
  ringW?: number;
}
interface EdgeLook {
  color: string;
  width: number;
  dash?: number[];
}
interface DagSpec {
  edges: readonly Edge[];
  bends?: readonly number[]; // per edge: 0 straight, otherwise arc offset in units of 30px (sign = side)
  node: (v: number) => NodeLook;
  edge: (i: number) => EdgeLook;
  badge?: (v: number) => { text: string; fill: string; ink: string } | null;
  sub?: (v: number) => string;
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.5, y - uy * size + ux * size * 0.5);
  ctx.lineTo(x - ux * size + uy * size * 0.5, y - uy * size - ux * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** Draw the task graph; returns each box as [cx, cy, halfW, halfH] for hit testing. */
function drawDag(ctx: CanvasRenderingContext2D, P: Palette, w: number, h: number, d: DagSpec): [number, number, number, number][] {
  const bw = Math.max(54, Math.min(84, w * 0.17));
  const bh = d.sub ? 38 : 28;
  const padX = bw / 2 + 10;
  const padTop = bh / 2 + 12;
  const padBot = bh / 2 + 6;
  const box = POS.map(([x, y]): [number, number, number, number] => [padX + x * (w - 2 * padX), padTop + y * (h - padTop - padBot), bw / 2, bh / 2]);
  // point where the ray from a box centre towards (tx, ty) leaves the box
  const exit = (v: number, tx: number, ty: number): [number, number] => {
    const [cx, cy, hw, hh] = box[v];
    const dx = tx - cx;
    const dy = ty - cy;
    const t = Math.min((hw + 2) / Math.abs(dx || 1e-9), (hh + 2) / Math.abs(dy || 1e-9));
    return [cx + dx * t, cy + dy * t];
  };
  d.edges.forEach(([u, v], i) => {
    const look = d.edge(i);
    const [x1, y1] = box[u];
    const [x2, y2] = box[v];
    const bend = d.bends?.[i] ?? 0;
    ctx.strokeStyle = look.color;
    ctx.lineWidth = look.width;
    ctx.setLineDash(look.dash ?? []);
    ctx.beginPath();
    let ex: number, ey: number, ux: number, uy: number;
    if (bend) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const qx = (x1 + x2) / 2 + (-(y2 - y1) / len) * bend * 30;
      const qy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend * 30;
      const [sx, sy] = exit(u, qx, qy);
      [ex, ey] = exit(v, qx, qy);
      const tl = Math.hypot(ex - qx, ey - qy);
      ux = (ex - qx) / tl;
      uy = (ey - qy) / tl;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(qx, qy, ex - ux * 6, ey - uy * 6);
    } else {
      const [sx, sy] = exit(u, x2, y2);
      [ex, ey] = exit(v, x1, y1);
      const tl = Math.hypot(ex - sx, ey - sy);
      ux = (ex - sx) / tl;
      uy = (ey - sy) / tl;
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex - ux * 6, ey - uy * 6);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    arrowHead(ctx, ex, ey, ux, uy, 6 + look.width * 1.5, look.color);
  });
  const small = bw < 66;
  box.forEach(([cx, cy, hw, hh], v) => {
    const look = d.node(v);
    ctx.fillStyle = look.fill;
    ctx.strokeStyle = look.ring ?? P.ink;
    ctx.lineWidth = look.ringW ?? 1.4;
    ctx.beginPath();
    ctx.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = look.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${small ? 11.5 : 13}px ${P.fontBody}`;
    const sub = d.sub?.(v);
    ctx.fillText(NAMES[v], cx, sub ? cy - 7 : cy + 0.5);
    if (sub) {
      ctx.font = `500 11px ${P.fontMono}`;
      ctx.fillText(sub, cx, cy + 9);
    }
    const b = d.badge?.(v);
    if (b) {
      const bx = cx + hw - 2;
      const by = cy - hh - 1;
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, Math.PI * 2);
      ctx.fillStyle = b.fill;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = b.ink;
      ctx.font = `700 11px ${P.fontMono}`;
      ctx.fillText(b.text, bx, by + 0.5);
    }
  });
  return box;
}

/** Shared look of Kahn's algorithm: done = green, just taken = orange, ready = yellow, stuck = red outline. */
function kahnLook(P: Palette, f: { indeg: number[]; ready: number[]; out: number[]; cur: number | null; stuck?: boolean }) {
  const done = new Set(f.out);
  const ready = new Set(f.ready);
  return {
    node: (v: number): NodeLook =>
      v === f.cur
        ? { fill: P.pos, ink: P.surface }
        : done.has(v)
          ? { fill: alpha(P.good, 0.85), ink: P.surface }
          : ready.has(v)
            ? { fill: P.hl, ink: '#1a1a1a' }
            : f.stuck
              ? { fill: alpha(P.bad, 0.12), ink: P.ink, ring: P.bad, ringW: 2.4 }
              : { fill: P.surface, ink: P.ink },
    badge: (v: number) => (done.has(v) ? null : { text: String(f.indeg[v]), fill: f.indeg[v] === 0 ? P.good : P.surface, ink: f.indeg[v] === 0 ? P.surface : P.ink }),
    removed: (u: number) => done.has(u),
  };
}

function KahnRows({ label, ready, nextAt, out }: { label: string; ready: number[]; nextAt: number; out: number[] }) {
  return (
    <div className="topo-out" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="ds-row">
        <span className="ds-label">{label}</span>
        {ready.length ? (
          ready.map((v, i) => (
            <span key={v} className="ds-cell" data-next={i === nextAt || undefined}>
              {NAMES[v]}
            </span>
          ))
        ) : (
          <span className="ds-empty">비어 있음</span>
        )}
      </div>
      <div className="ds-row">
        <span className="ds-label">정한 순서</span>
        {out.length ? (
          out.map((v, i) => (
            <span key={v} className="ds-cell">
              {i + 1}. {NAMES[v]}
            </span>
          ))
        ) : (
          <span className="ds-empty">아직 없음</span>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Figure 1: Kahn's algorithm ─────────────── */

type Mode = 'queue' | 'stack' | 'pick';

function KahnFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<Mode>('queue');
  const [picked, setPicked] = useState<number[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const frames = useMemo(() => kahnFrames(N, EDGES, NAMES, mode === 'stack' ? 'stack' : 'queue'), [mode]);
  const s = useStepper(frames.length, 1, mode);
  const boxes = useRef<[number, number, number, number][]>([]);

  const manual = useMemo(() => kahnPicked(N, EDGES, picked), [picked]);
  const f =
    mode === 'pick'
      ? { indeg: manual.indeg, ready: manual.ready, out: picked, cur: picked.length ? picked[picked.length - 1] : null, note: '' }
      : frames[s.i];
  const look = kahnLook(P, f);

  const pick = (v: number) => {
    if (picked.includes(v)) return;
    if (!manual.ready.includes(v)) {
      setWarn(`${NAMES[v]}: 먼저 끝나야 할 작업 ${manual.indeg[v]}개가 남음 → 아직 고를 수 없음`);
      return;
    }
    setWarn(null);
    setPicked([...picked, v]);
  };
  const freed = useMemo(() => {
    if (!picked.length) return [];
    const before = kahnPicked(N, EDGES, picked.slice(0, -1)).ready;
    return manual.ready.filter((v) => !before.includes(v));
  }, [picked, manual]);
  const manualNote =
    warn ??
    (picked.length === N
      ? `작업 ${N}개를 모두 골랐습니다. 화살표가 모두 앞에서 뒤로 향하는 순서입니다.`
      : picked.length
        ? `${NAMES[picked[picked.length - 1]]} 고름 → 나가는 간선 지움${freed.length ? ` → 새로 진입 차수 0: ${freed.map((v) => NAMES[v]).join(', ')}` : ''}`
        : '진입 차수가 0인 작업(노란색) 중 하나를 고르세요. 그림의 노드를 눌러도 됩니다.');

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      boxes.current = drawDag(ctx, P, w, h, {
        edges: EDGES,
        node: look.node,
        badge: look.badge,
        edge: (i) => (look.removed(EDGES[i][0]) ? { color: alpha(P.ink3, 0.45), width: 1.2, dash: [4, 4] } : { color: P.ink2, width: 1.6 }),
      });
    },
    [P, f],
    { aspect: 1.9, maxHeight: 280, minHeight: 230 },
  );

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'pick') return;
    const p = localPoint(e, e.currentTarget);
    const hit = boxes.current.findIndex(([cx, cy, hw, hh]) => Math.abs(p.x - cx) <= hw && Math.abs(p.y - cy) <= hh);
    if (hit >= 0) pick(hit);
  };

  return (
    <Figure
      no={1}
      title="칸 알고리즘: 기다릴 것이 없는 일부터"
      hint="한 단계씩 진행하거나, '직접'을 골라 순서를 정해 보세요"
      caption={<>웹 앱을 빌드해 배포하는 작업입니다. 화살표 u → v는 "u가 끝나야 v를 시작할 수 있다"는 뜻이고, 노드 귀퉁이의 숫자는 아직 끝나지 않은 선행 작업 수(진입 차수)입니다. 노란 노드는 지금 시작할 수 있는 작업, 주황 노드는 방금 꺼낸 작업, 초록 노드는 순서에 들어간 작업입니다. 순서에 들어간 작업의 화살표는 점선으로 지워집니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`작업 ${N}개의 의존 관계 그래프. 정한 순서: ${f.out.map((v) => NAMES[v]).join(', ') || '없음'}`}>
            <canvas ref={canvasRef} onClick={onCanvasClick} style={mode === 'pick' ? { cursor: 'pointer' } : undefined} />
          </div>
          <KahnRows label={mode === 'queue' ? '큐 (왼쪽부터 꺼냄)' : mode === 'stack' ? '스택 (오른쪽 맨 위부터 꺼냄)' : '지금 시작할 수 있는 작업'} ready={f.ready} nextAt={mode === 'queue' ? 0 : mode === 'stack' ? f.ready.length - 1 : -1} out={f.out} />
          <div className="step-note" aria-live="polite" data-bad={(mode === 'pick' && warn !== null) || undefined}>
            {mode === 'pick' ? manualNote : f.note}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="다음 작업 고르는 법"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setWarn(null);
            }}
            options={[
              { value: 'queue', label: '큐' },
              { value: 'stack', label: '스택' },
              { value: 'pick', label: '직접' },
            ]}
          />
          {mode === 'pick' ? (
            <>
              <div className="ctl">
                <span className="ctl-label">
                  <span>다음에 할 작업</span>
                </span>
                <div className="pick-row">
                  {manual.ready.length ? (
                    manual.ready.map((v) => (
                      <Button key={v} small primary onClick={() => pick(v)}>
                        {NAMES[v]}
                      </Button>
                    ))
                  ) : (
                    <span className="ds-empty">모두 골랐습니다</span>
                  )}
                </div>
              </div>
              <div className="btn-row">
                <Button small onClick={() => setPicked((p) => p.slice(0, -1))} disabled={!picked.length}>
                  하나 되돌리기
                </Button>
                <Button
                  small
                  onClick={() => {
                    setPicked([]);
                    setWarn(null);
                  }}
                >
                  처음부터
                </Button>
              </div>
            </>
          ) : (
            <StepControls s={s} id="kahn-speed" maxSpeed={6} />
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="순서에 들어간 작업" value={`${f.out.length} / ${N}`} />
            <Readout label="지금 시작 가능" value={`${f.ready.length}개`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a cycle stops Kahn's algorithm ─────────────── */

function CycleFigure() {
  const P = usePalette();
  const [on, setOn] = useState<boolean[]>([false, true, false, false]);
  const extra = BUILD.extra.filter((_, i) => on[i]);
  const edges = useMemo(() => [...EDGES, ...extra.map((x) => x.e)], [on]); // eslint-disable-line react-hooks/exhaustive-deps
  const bends = [...EDGES.map(() => 0), ...extra.map((x) => x.bend)];
  const frames = useMemo(() => kahnFrames(N, edges, NAMES, 'queue'), [edges]);
  const s = useStepper(frames.length, 2, on.join(), true);
  const f = frames[s.i];
  const last = frames[frames.length - 1];
  const atEnd = s.i === frames.length - 1;
  const left = last.stuck ? NAMES.map((_, v) => v).filter((v) => !last.out.includes(v)) : [];
  const cycle = last.stuck ? findCycle(N, edges, left) : null;
  const onCycle = (u: number, v: number) => !!cycle && cycle.some((x, i) => x === u && cycle[(i + 1) % cycle.length] === v);
  const behind = left.filter((v) => !cycle?.includes(v));
  const look = kahnLook(P, f);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      drawDag(ctx, P, w, h, {
        edges,
        bends,
        node: look.node,
        badge: look.badge,
        edge: (i) => {
          const [u, v] = edges[i];
          if (f.stuck && onCycle(u, v)) return { color: P.bad, width: 3 };
          if (look.removed(u)) return { color: alpha(P.ink3, 0.45), width: 1.2, dash: [4, 4] };
          if (i >= EDGES.length) return { color: P.neg, width: 2.4 };
          return { color: P.ink2, width: 1.6 };
        },
      });
    },
    [P, f, edges],
    { aspect: 1.9, maxHeight: 280, minHeight: 230 },
  );

  return (
    <Figure
      no={2}
      title="순환이 있으면 큐가 먼저 빈다"
      hint="의존 관계를 더하거나 빼 보세요"
      caption={<>파란 화살표는 새로 더한 의존 관계입니다. 큐를 쓰는 칸 알고리즘을 끝까지 실행한 결과가 먼저 보이고, 재생을 누르면 처음부터 볼 수 있습니다. 순서에 들어가지 못한 작업은 빨간 테두리로, 그 안에서 찾은 순환은 굵은 빨간 화살표로 표시합니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`작업 그래프에 의존 관계 ${extra.length}개를 더한 결과: ${last.stuck ? '순환이 있음' : '순서를 정할 수 있음'}`}>
            <canvas ref={canvasRef} />
          </div>
          <KahnRows label="큐 (왼쪽부터 꺼냄)" ready={f.ready} nextAt={0} out={f.out} />
          <div className="step-note" aria-live="polite" data-bad={f.stuck || undefined}>
            {f.note}
            {atEnd && cycle && (
              <>
                <br />
                찾은 순환: {[...cycle, cycle[0]].map((v) => NAMES[v]).join(' → ')}
                {behind.length > 0 && ` · 순환 위에 있지 않지만 막힌 작업: ${behind.map((v) => NAMES[v]).join(', ')}`}
              </>
            )}
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>더할 의존 관계</span>
            </span>
            {BUILD.extra.map((x, i) => (
              <Check key={i} label={`${NAMES[x.e[0]]} → ${NAMES[x.e[1]]}`} checked={on[i]} onChange={(c) => setOn((o) => o.map((b, j) => (j === i ? c : b)))} />
            ))}
          </div>
          <StepControls s={s} id="cyc-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="순서에 들어간 작업" value={`${f.out.length} / ${N}`} />
            <Readout label="결과" value={!atEnd ? '진행 중…' : last.stuck ? '순환 있음 ✗' : '순서 정함 ✓'} color={!atEnd ? undefined : last.stuck ? 'var(--bad)' : 'var(--good)'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '더한 의존 관계', shape: 'ln' },
          { color: 'var(--bad)', label: '순환', shape: 'ln' },
          { color: 'var(--hl)', label: '큐에 있는 작업', shape: 'sq' },
          { color: 'var(--good)', label: '순서에 들어간 작업', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: critical path ─────────────── */

const T_MAX = 22; // fixed time axis so a longer project visibly grows

function CriticalFigure() {
  const P = usePalette();
  const [dur, setDur] = useState<number[]>(DUR0);
  const [sel, setSel] = useState(4);
  const cp = useMemo(() => criticalPath(N, EDGES, dur), [dur]);
  const crit = (v: number) => cp.slack[v] === 0;

  const dag = useCanvas2D(
    (ctx, { w, h }) => {
      drawDag(ctx, P, w, h, {
        edges: EDGES,
        sub: (v) => `${dur[v]}분`,
        node: (v) => ({ fill: crit(v) ? P.pos : P.surface, ink: crit(v) ? P.surface : P.ink, ring: v === sel ? P.accent : P.ink, ringW: v === sel ? 3 : 1.4 }),
        edge: (i) => (cp.critEdge[i] ? { color: P.pos, width: 3.2 } : { color: P.ink3, width: 1.4 }),
      });
    },
    [P, dur, sel, cp],
    { aspect: 2, maxHeight: 260, minHeight: 230 },
  );

  const rowH = 24;
  const gantt = useCanvas2D(
    (ctx, { w }) => {
      const lw = 70;
      const top = 20;
      const x0 = lw;
      const sx = (w - lw - 12) / T_MAX;
      const X = (t: number) => x0 + t * sx;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let t = 0; t <= T_MAX; t += 2) {
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(t), top);
        ctx.lineTo(X(t), top + N * rowH);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.fillText(String(t), X(t), top + N * rowH + 4);
      }
      cp.order.forEach((v, row) => {
        const y = top + row * rowH;
        if (v === sel) {
          ctx.fillStyle = alpha(P.accent, 0.1);
          ctx.fillRect(0, y, w, rowH);
        }
        ctx.fillStyle = P.ink;
        ctx.font = `${v === sel ? 700 : 500} 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(NAMES[v], 4, y + rowH / 2);
        if (cp.slack[v] > 0) {
          ctx.fillStyle = alpha(P.neg, 0.14);
          ctx.fillRect(X(cp.ef[v]), y + 7, cp.slack[v] * sx, rowH - 14);
        }
        ctx.fillStyle = crit(v) ? P.pos : alpha(P.neg, 0.8);
        ctx.fillRect(X(cp.es[v]), y + 4, dur[v] * sx, rowH - 8);
        if (dur[v] * sx > 16) {
          ctx.fillStyle = P.surface;
          ctx.font = `700 11px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.fillText(String(dur[v]), X(cp.es[v] + dur[v] / 2), y + rowH / 2 + 0.5);
        }
      });
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(cp.total), top - 4);
      ctx.lineTo(X(cp.total), top + N * rowH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink;
      ctx.font = `700 11px ${P.fontMono}`;
      ctx.textAlign = cp.total > T_MAX - 3 ? 'right' : 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`끝 ${cp.total}분`, X(cp.total), top - 5);
    },
    [P, dur, sel, cp],
    { height: 20 + N * rowH + 20 },
  );

  const pathText = cp.paths.map((p) => p.map((v) => NAMES[v]).join(' → ')).join(' / ');

  return (
    <Figure
      no={3}
      title="임계 경로: 전체 기간을 정하는 작업들"
      hint="작업 하나의 시간을 바꿔 보세요"
      caption={<>각 작업 아래 숫자가 걸리는 시간(분)입니다. 선행 작업이 끝나는 즉시 시작하고, 서로 기다릴 필요가 없는 작업은 동시에 진행한다고 가정합니다. 막대 그래프는 각 작업이 가장 일찍 시작하고 끝나는 시각이며, 옅은 파란 칸은 전체 기간을 늘리지 않고 늦출 수 있는 여유입니다. 주황색이 여유가 0인 임계 경로입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={dag.wrapRef} className="canvas-box" role="img" aria-label={`작업 그래프와 작업 시간. 임계 경로: ${pathText}`}>
            <canvas ref={dag.canvasRef} />
          </div>
          <div ref={gantt.wrapRef} className="canvas-box" role="img" aria-label={`일정표: 전체 ${cp.total}분`}>
            <canvas ref={gantt.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <label className="ctl-label" htmlFor="cp-task">
              <span>바꿀 작업</span>
            </label>
            <select id="cp-task" className="select" value={sel} onChange={(e) => setSel(Number(e.target.value))}>
              {NAMES.map((nm, v) => (
                <option key={v} value={v}>
                  {nm}
                </option>
              ))}
            </select>
          </div>
          <Slider id="cp-dur" label={`${NAMES[sel]} 시간`} value={dur[sel]} min={1} max={12} step={1} format={(v) => `${v}분`} onChange={(v) => setDur((d) => d.map((x, i) => (i === sel ? v : x)))} />
          <div className="btn-row">
            <Button small onClick={() => setDur(DUR0)}>
              처음 값으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="전체 기간" value={`${cp.total}분`} color="var(--pos)" />
            <Readout label={`${NAMES[sel]}의 여유`} value={`${cp.slack[sel]}분`} color="var(--neg)" />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={cp.paths.length > 1 ? `임계 경로 (${cp.paths.length}개)` : '임계 경로'} value={
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)' }}>
                  {cp.paths.map((p, i) => (
                    <span key={i} style={{ display: 'block' }}>
                      {p.map((v) => NAMES[v]).join(' → ')}
                    </span>
                  ))}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function TopologicalSort() {
  return (
    <>
      <h2>먼저 끝나야 하는 일</h2>
      <p>
        <code>npm install</code>은 패키지를 설치하기 전에 그 패키지가 쓰는 패키지부터 준비합니다. 빌드 도구는 다른 모듈을 가져다 쓰는 모듈보다 가져다 쓰이는 모듈을 먼저 컴파일합니다. 스프레드시트는 <code>=A1+B1</code>이 적힌 셀을 A1과 B1을 계산한 뒤에 계산합니다. 이 사이트의 "알고리즘 설계" 과정도 "기초 알고리즘"을 먼저 들어야 하는 과정으로 묶여 있습니다.
      </p>
      <p>
        모두 "A를 하려면 B가 먼저 끝나야 한다"는 관계입니다. 작업을 노드로, 이 관계를 방향이 있는 간선 B → A로 그리면 <a href="#cs-algorithms/graph-search">그래프</a>가 됩니다. 이제 질문은 이것입니다. <strong>모든 화살표가 앞에서 뒤로 향하도록 노드를 한 줄로 늘어놓을 수 있을까?</strong> 그런 순서를 찾는 것이 <T en="topological sort">위상 정렬</T>입니다.
      </p>
      <p>
        늘 가능하지는 않습니다. A는 B를 기다리고 B는 A를 기다린다면 어느 쪽도 먼저 시작할 수 없습니다. 위상 정렬은 화살표를 따라가다 제자리로 돌아오는 길, 곧 순환이 없는 그래프에서만 가능합니다. 이런 그래프를 <T en="directed acyclic graph, DAG">방향 비순환 그래프</T>, 줄여서 DAG라고 부릅니다. 반대로 DAG라면 위상 정렬이 언제나 하나 이상 있습니다.
      </p>

      <h2>칸 알고리즘: 기다릴 것이 없는 일부터</h2>
      <p>
        노드로 들어오는 화살표의 수를 <T en="in-degree">진입 차수</T>라고 합니다. 아직 끝나지 않은 선행 작업의 수입니다. 진입 차수가 0인 작업은 기다릴 것이 없으니 지금 바로 할 수 있습니다. <T en="Kahn's algorithm">칸 알고리즘</T>은 이 사실만으로 순서를 만듭니다.
      </p>
      <ol>
        <li>진입 차수가 0인 노드를 모두 큐에 넣습니다.</li>
        <li>큐에서 하나를 꺼내 순서의 맨 뒤에 붙입니다.</li>
        <li>그 노드에서 나가는 화살표를 지웁니다. 곧 화살표가 가리키던 노드의 진입 차수를 1씩 줄입니다. 그러다 0이 된 노드는 큐에 넣습니다.</li>
        <li>큐가 빌 때까지 2~3을 반복합니다.</li>
      </ol>
      <KahnFigure />
      <p>
        큐 대신 스택을 쓰면 설치보다 이미지가 먼저 나오는 등 전혀 다른 순서가 나오지만, 이것도 모든 화살표가 앞으로 향하는 올바른 순서입니다. 진입 차수가 0인 노드가 여럿이면 그중 무엇을 먼저 꺼내도 되기 때문입니다. "직접"을 골라 원하는 순서를 만들어 보세요. 이 작은 그래프에도 올바른 순서가 180가지나 있습니다.
      </p>
      <p>
        이 자유는 실제로 쓸모가 있습니다. 같은 시점에 큐에 함께 들어 있는 작업들은 서로를 기다리지 않으므로 동시에 실행해도 됩니다. 빌드 도구나 CI가 여러 작업을 병렬로 돌릴 수 있는 것도 이 덕분입니다.
      </p>
      <Code label="위상 정렬 (칸 알고리즘)">{`
function topoSort(n, edges) {           // edges: [u, v] = u가 v보다 먼저
  const adj = Array.from({ length: n }, () => []);
  const indeg = Array(n).fill(0);
  for (const [u, v] of edges) {
    adj[u].push(v);
    indeg[v]++;
  }
  const queue = [];
  for (let v = 0; v < n; v++) if (indeg[v] === 0) queue.push(v);
  // 꺼낸 순서가 곧 답이므로 큐 배열을 그대로 결과로 쓴다
  for (let head = 0; head < queue.length; head++) {
    for (const v of adj[queue[head]]) {
      indeg[v]--;
      if (indeg[v] === 0) queue.push(v); // 마지막 선행 작업이 끝났다
    }
  }
  return queue.length === n ? queue : null; // 모자라면 순환이 있다
}`}</Code>
      <p>
        노드는 큐에 한 번씩 들어가고, 화살표는 한 번씩 지워지므로 전체 시간은 <M>{'O(V + E)'}</M>입니다. <a href="#cs-algorithms/graph-search">BFS</a>와 같은 비용입니다.
      </p>
      <Callout kind="note">
        올바른 순서 중 특정한 하나가 필요할 때도 있습니다. 예를 들어 번호가 작은 작업을 되도록 먼저 하는, 사전 순으로 가장 앞선 순서를 원한다면 큐 대신 <a href="#cs-algorithms/stack-queue-heap">최소 힙</a>에서 가장 작은 번호를 꺼내면 됩니다. 시간은 <M>{'O(V \\log V + E)'}</M>로 조금 늘어납니다.
      </Callout>

      <h2>순환이 있으면</h2>
      <p>
        그래프에 순환이 있으면 어떻게 될까요? 순환 위의 노드는 저마다 순환 속 바로 앞 노드를 기다리므로, 진입 차수가 영영 0이 되지 않습니다. 그래서 큐가 먼저 비고, 순서에 들어간 노드가 V개보다 적은 채로 알고리즘이 끝납니다. 칸 알고리즘은 따로 애쓰지 않아도 <strong>결과의 길이만 보면 순환이 있는지 알 수 있습니다</strong>.
      </p>
      <CycleFigure />
      <p>
        "E2E → 번들"을 더하면 번들과 E2E가 서로를 기다리는 순환이 생기고, 둘에 더해 배포까지 순서에 들어가지 못합니다. 하지만 배포는 순환 위에 있지 않습니다. 순환 뒤에서 E2E를 기다리고 있을 뿐입니다. 남은 노드에는 순환이 반드시 들어 있지만, 남은 노드가 모두 순환 위에 있는 것은 아닙니다. 사용자에게 "이 의존 관계가 문제"라고 정확히 알려 주려면, 남은 노드 안에서 아래의 DFS로 순환을 찾아 보여 주면 됩니다.
      </p>
      <p>
        빌드 도구가 "circular dependency"(순환 의존) 오류를 내거나, 스프레드시트가 "순환 참조" 경고를 띄우는 것이 바로 이 상황입니다. 서로를 먼저 계산해야 하는 셀들은 어떤 순서로도 계산할 수 없습니다.
      </p>

      <h2>DFS로 위상 정렬하기</h2>
      <p>
        <a href="#cs-algorithms/graph-search">DFS</a>로도 위상 정렬을 할 수 있습니다. DFS가 어떤 노드 u를 <strong>다 마치는 순간</strong>, 곧 u에서 갈 수 있는 노드를 모두 방문하고 돌아오는 순간 u를 목록에 적습니다. 그러면 u보다 뒤에 와야 하는 노드는 모두 u보다 먼저 목록에 적히므로, 목록을 뒤집으면 위상 정렬이 됩니다.
      </p>
      <p>
        순환은 노드를 세 상태(방문 전, 탐색 중, 완료)로 나누어 찾습니다. 탐색 중인 노드는 지금 내려가고 있는 길 위에 있는 노드입니다. 화살표를 따라가다 탐색 중인 노드를 다시 만나면, 길을 따라 제자리로 돌아온 것이므로 순환입니다.
      </p>
      <Code label="DFS로 위상 정렬하기">{`
function topoSortDFS(n, adj) {
  const state = Array(n).fill(0); // 0: 방문 전, 1: 탐색 중, 2: 완료
  const done = [];
  function visit(u) {
    state[u] = 1;
    for (const v of adj[u]) {
      if (state[v] === 1) throw new Error('순환이 있습니다');
      if (state[v] === 0) visit(v);
    }
    state[u] = 2;
    done.push(u); // u 뒤에 와야 할 노드는 이미 모두 적혔다
  }
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v);
  return done.reverse();
}`}</Code>
      <p>
        이 방법도 <M>{'O(V + E)'}</M>입니다. 칸 알고리즘은 "지금 무엇을 할 수 있나"를 그대로 보여 주므로 작업 스케줄링에 잘 맞고, DFS 방법은 재귀로 짧게 쓸 수 있으며 순환이 생긴 길을 바로 찾아냅니다.
      </p>

      <h2>임계 경로: 다 끝나려면 얼마나 걸릴까</h2>
      <p>
        이제 작업마다 걸리는 시간이 있고, 서로 기다릴 필요가 없는 작업은 동시에 진행할 수 있다고 해 봅시다. 모든 작업이 끝나려면 최소 얼마나 걸릴까요?
      </p>
      <p>
        작업 v가 가장 일찍 시작할 수 있는 시각은, v의 선행 작업이 모두 끝나는 시각, 곧 선행 작업들이 끝나는 시각 중 가장 늦은 것입니다. 선행 작업이 없으면 0입니다.
      </p>
      <MB note="d(u)는 작업 u에 걸리는 시간, 최댓값은 v로 들어오는 화살표 u → v 전체에 대해 취합니다">{'\\text{시작}(v) = \\max_{u \\to v} \\big(\\text{시작}(u) + d(u)\\big)'}</MB>
      <p>
        이 식을 계산하려면 선행 작업의 값을 먼저 알아야 합니다. 위상 정렬 순서대로 계산하면 그 조건이 저절로 맞춰지므로, 노드마다 한 번씩만 계산하면 됩니다. 앞에서 구한 답을 표에 적어 두고 다음 답에 쓰는, <a href="#cs-algorithm-design/dynamic-programming">동적 계획법</a> 그대로입니다. DAG에서는 위상 정렬 순서가 곧 표를 채우는 순서입니다.
      </p>
      <CriticalFigure />
      <p>
        처음 값에서 전체 기간은 12분이고, 설치 → 번들 → E2E → 배포(3 + 3 + 5 + 1 = 12분)가 기간을 결정합니다. 이처럼 여유가 하나도 없는 작업들의 경로를 <T en="critical path">임계 경로</T>라고 합니다. 이 경로 위의 작업이 1분 늦어지면 전체가 1분 늦어집니다. 반면 테스트에는 4분, 린트에는 7분의 여유가 있어서 그만큼 늦어져도 전체 기간은 그대로입니다. 테스트 시간을 늘려 보세요. 8분까지는 아무 일도 없다가, 8분에서 임계 경로가 두 개가 되고, 9분부터는 설치 → 테스트 → 배포가 새 임계 경로가 됩니다.
      </p>
      <p>
        여기서 실무의 교훈이 나옵니다. 빌드를 빠르게 하려면 임계 경로 위의 작업을 줄여야 합니다. 린트를 아무리 빠르게 만들어도 전체 기간은 1초도 줄지 않습니다. 그리고 작업을 하나씩 차례로 하면 21분이 걸리지만, 병렬로 하면 12분이면 끝납니다.
      </p>
      <Code label="임계 경로: 가장 이른 시작 시각과 경로 복원">{`
function criticalPath(n, edges, dur) {
  const order = topoSort(n, edges);      // 순환이 없다고 가정
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) adj[u].push(v);
  const start = Array(n).fill(0);        // 가장 이른 시작 시각
  const prev = Array(n).fill(-1);        // 그 시각을 정한 선행 작업
  for (const u of order) {
    for (const v of adj[u]) {
      if (start[u] + dur[u] > start[v]) {
        start[v] = start[u] + dur[u];
        prev[v] = u;
      }
    }
  }
  let last = 0;                          // 가장 늦게 끝나는 작업
  for (let v = 1; v < n; v++) {
    if (start[v] + dur[v] > start[last] + dur[last]) last = v;
  }
  const path = [];
  for (let v = last; v !== -1; v = prev[v]) path.push(v);
  return { total: start[last] + dur[last], path: path.reverse() };
}`}</Code>
      <Callout kind="note">
        임계 경로는 작업 시간을 길이로 본 <strong>가장 긴 경로</strong>입니다. 일반 그래프에서 가장 긴 경로를 찾는 것은 매우 어려운 문제로 알려져 있지만, DAG에서는 위상 정렬 순서로 한 번 훑으면 <M>{'O(V + E)'}</M>에 풀립니다. 순환이 없다는 조건이 문제를 쉽게 만듭니다.
      </Callout>

      <Callout kind="key">
        위상 정렬은 의존 관계 그래프의 노드를 모든 화살표가 앞으로 향하도록 늘어놓는 것이고, 순환이 없는 그래프(DAG)에서만 가능합니다. 칸 알고리즘은 진입 차수가 0인 노드부터 꺼내며 <M>{'O(V + E)'}</M>에 순서를 만들고, 결과가 V개보다 짧으면 순환이 있다는 뜻입니다. 위상 정렬 순서로 가장 이른 시작 시각을 채우면(DAG 위의 동적 계획법) 전체 기간과 임계 경로를 구할 수 있습니다.
      </Callout>
      <Quiz
        q="그림 3의 처음 값(전체 12분)에서 작업 하나의 시간을 2분 줄일 수 있다. 줄여도 전체 기간이 그대로인 작업은?"
        options={['설치 (3분 → 1분)', '번들 (3분 → 1분)', 'E2E (5분 → 3분)', '테스트 (4분 → 2분)']}
        answer={3}
        explain={<>테스트는 임계 경로 밖에 있고 이미 4분의 여유가 있으므로, 줄여도 전체 기간은 12분 그대로입니다. 번들이나 E2E를 줄이면 임계 경로가 10분이 되고 다른 경로도 모두 10분 이하라 전체가 10분이 됩니다. 설치를 줄이면 11분이 되는데, 2분이 아니라 1분만 줄어드는 까닭은 이제 이미지 → 번들 → E2E → 배포(2 + 3 + 5 + 1 = 11분)가 새 임계 경로가 되기 때문입니다. 그림 3에서 직접 확인해 보세요.</>}
      />
    </>
  );
}

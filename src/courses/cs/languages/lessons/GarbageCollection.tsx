import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { COST, HEAP_COLS, SCRIPTS, SLOTS, initialHeap, markSweep, reachable, replay, simulateGen, type GcFrame, type Heap, type RcSnap } from './gc';
import './languages.css';

/* ─────────────── Figure 1: a heap graph with roots, collected by mark and sweep ─────────────── */

const W1 = 620;
const H1 = 322;
const ROOT_W = 84;
const ROOT_H = 40;
const NODE_W = 92;
const NODE_H = 40;
const rowY = (r: number) => 58 + r * 104;
const colX = (c: number) => 182 + c * 120;
const NEW_LABELS = ['주문', '토큰', '로그', '응답', '버퍼', '메시지', '알림', '임시 C'];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function edgePath(a: Box, b: Box, bend: number): { d: string; mx: number; my: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (a.x + b.x) / 2 + nx * bend;
  const cy = (a.y + b.y) / 2 + ny * bend;
  const cut = (bx: Box, tx: number, ty: number) => {
    const ux = tx - bx.x;
    const uy = ty - bx.y;
    const t = Math.min(bx.w / 2 / Math.max(1e-6, Math.abs(ux)), bx.h / 2 / Math.max(1e-6, Math.abs(uy)));
    return [bx.x + ux * t, bx.y + uy * t];
  };
  const [x0, y0] = cut(a, cx, cy);
  const [x1, y1] = cut(b, cx, cy);
  const pad = 3;
  const l1 = Math.hypot(cx - x1, cy - y1) || 1;
  return { d: `M${x0},${y0} Q${cx},${cy} ${x1 + ((cx - x1) / l1) * pad},${y1 + ((cy - y1) / l1) * pad}`, mx: (x0 + 2 * cx + x1) / 4, my: (y0 + 2 * cy + y1) / 4 };
}

function HeapFigure() {
  const [heap, setHeap] = useState<Heap>(initialHeap);
  const [sel, setSel] = useState('user');
  const [gc, setGc] = useState<GcFrame[] | null>(null);
  const [showDead, setShowDead] = useState(false);
  const [msg, setMsg] = useState('참조(화살표)를 눌러 끊거나, 객체를 고르고 새 객체를 할당해 보세요. 그다음 GC를 실행하세요.');
  const [made, setMade] = useState(0);
  const [stats, setStats] = useState({ runs: 0, freed: 0 });
  const s = useStepper(gc ? gc.length : 1, 3, gc);
  const f = gc ? gc[s.i] : null;
  const live = useMemo(() => reachable(heap), [heap]);
  const used = new Set(heap.objs.map((o) => o.slot));
  const free = SLOTS - used.size;

  const boxOf = (id: string): Box => {
    const r = heap.roots.findIndex((x) => x.id === id);
    if (r >= 0) return { x: 50, y: rowY(r), w: ROOT_W, h: ROOT_H };
    const o = heap.objs.find((x) => x.id === id)!;
    return { x: colX(o.slot % HEAP_COLS), y: rowY(Math.floor(o.slot / HEAP_COLS)), w: NODE_W, h: NODE_H };
  };
  // bend an arrow that would pass behind another box, so it does not look like it starts there
  const detour = (from: string, to: string): number => {
    const a = boxOf(from);
    const b = boxOf(to);
    const others = heap.objs.filter((o) => o.id !== from && o.id !== to).map((o) => boxOf(o.id));
    const hits = (bend: number) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cx = (a.x + b.x) / 2 + (-(b.y - a.y) / len) * bend;
      const cy = (a.y + b.y) / 2 + ((b.x - a.x) / len) * bend;
      for (let k = 1; k < 20; k++) {
        const t = k / 20;
        const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
        const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
        if (others.some((o) => Math.abs(x - o.x) < o.w / 2 + 2 && Math.abs(y - o.y) < o.h / 2 + 2)) return true;
      }
      return false;
    };
    for (const bend of [0, 52, -52, 90, -90]) if (!hits(bend)) return bend;
    return 52;
  };
  const label = (id: string) => heap.roots.find((r) => r.id === id)?.label ?? heap.objs.find((o) => o.id === id)?.label ?? id;

  const cut = (i: number) => {
    if (gc) return;
    const r = heap.refs[i];
    setHeap({ ...heap, refs: heap.refs.filter((_, j) => j !== i) });
    setMsg(`${label(r.from)} → ${label(r.to)} 참조를 끊었습니다. 객체는 아직 메모리에 그대로 있습니다.`);
  };
  const alloc = () => {
    if (gc) return;
    const slot = [...Array(SLOTS).keys()].find((k) => !used.has(k));
    if (slot === undefined) {
      setMsg('빈 칸이 없어 할당에 실패했습니다. 실제 런타임이라면 이때 GC가 저절로 돕니다. GC 실행을 눌러 보세요.');
      return;
    }
    const id = `n${made}`;
    const lab = NEW_LABELS[made % NEW_LABELS.length];
    setMade(made + 1);
    setHeap({ ...heap, objs: [...heap.objs, { id, label: lab, slot }], refs: [...heap.refs, { from: sel, to: id }] });
    setMsg(`${slot}번 칸에 새 객체 ${lab}을(를) 만들고 ${label(sel)}이(가) 가리키게 했습니다.`);
  };
  const startGc = () => setGc(markSweep(heap));
  const finishGc = () => {
    if (!gc) return;
    const freed = gc[gc.length - 1].freed;
    setHeap({ ...heap, objs: heap.objs.filter((o) => !freed.has(o.id)), refs: heap.refs.filter((r) => !freed.has(r.from) && !freed.has(r.to)) });
    setStats({ runs: stats.runs + 1, freed: stats.freed + freed.size });
    setMsg(`해제된 칸 ${freed.size}개가 빈 칸이 되었습니다. 프로그램이 다시 달립니다.`);
    setGc(null);
    if (freed.has(sel)) setSel('user');
  };
  const onKey = (e: KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
  const nodeState = (id: string): string | undefined => {
    if (f) {
      if (f.freed.has(id)) return 'freed';
      if (f.at === id) return 'at';
      if (f.work.includes(id)) return 'work';
      if (f.marked.has(id)) return 'marked';
      if (f.phase === 'sweep' || f.phase === 'done') return 'garbage';
      return undefined;
    }
    if (showDead && !live.has(id)) return 'garbage';
    return undefined;
  };
  const pairs = new Set(heap.refs.map((r) => `${r.from}>${r.to}`));
  const done = !!gc && s.i === gc.length - 1;

  return (
    <Figure
      no={1}
      title="루트에서 닿는 것만 살아 있다"
      hint="참조를 끊고, 할당하고, GC를 돌려 보세요"
      caption={<>왼쪽 세 상자가 루트입니다. 전역 변수 app과, 지금 실행 중인 함수의 지역 변수 user와 cart입니다. 오른쪽 격자는 힙의 칸 12개이고, 화살표는 객체가 다른 객체를 가리키는 참조입니다. GC는 루트에서 화살표를 따라가며 닿는 객체에 표시(초록)하고, 그다음 칸을 차례로 훑으며 표시가 없는 객체를 해제(쓸기)합니다. 노란 객체는 지금 살펴보는 객체, 굵은 테두리는 작업 목록에서 차례를 기다리는 객체입니다.</>}
    >
      <div className="gc-wrap">
        <svg viewBox={`0 0 ${W1} ${H1}`} className="gc-svg" role="group" aria-label={`힙 그래프: 루트 ${heap.roots.length}개, 객체 ${heap.objs.length}개, 참조 ${heap.refs.length}개.${f ? ` GC ${f.phase === 'mark' ? '표시' : f.phase === 'sweep' ? '쓸기' : ''} 단계.` : ''}`}>
          <rect className="gc-heap-bg" x={124} y={8} width={W1 - 130} height={H1 - 14} />
          <text className="gc-area" x={130} y={22}>
            힙
          </text>
          <text className="gc-area" x={10} y={22}>
            루트
          </text>
          {[...Array(SLOTS).keys()].map((k) => {
            const x = colX(k % HEAP_COLS);
            const y = rowY(Math.floor(k / HEAP_COLS));
            return <rect key={k} className="gc-slot" data-sweep={f?.sweepSlot === k || undefined} x={x - NODE_W / 2 - 5} y={y - NODE_H / 2 - 5} width={NODE_W + 10} height={NODE_H + 10} rx={4} />;
          })}
          {heap.refs.map((r, i) => {
            const both = pairs.has(`${r.to}>${r.from}`);
            const { d } = edgePath(boxOf(r.from), boxOf(r.to), both ? 16 : detour(r.from, r.to));
            const hot = f?.edge && f.edge.from === r.from && f.edge.to === r.to;
            const dead = f?.freed.has(r.from);
            return (
              <g key={`${r.from}>${r.to}`} className="gc-edge" data-hot={hot || undefined} data-dead={dead || undefined}>
                <path d={d} className="gc-edge-line" markerEnd={hot ? 'url(#gc-ah-hot)' : 'url(#gc-ah)'} />
                {!gc && <path d={d} className="gc-edge-hit" tabIndex={0} role="button" aria-label={`${label(r.from)}에서 ${label(r.to)}로 가는 참조 끊기`} onClick={() => cut(i)} onKeyDown={(e) => onKey(e, () => cut(i))} />}
              </g>
            );
          })}
          {heap.roots.map((r, i) => (
            <g key={r.id} className="gc-root" data-sel={sel === r.id || undefined} tabIndex={gc ? -1 : 0} role="button" aria-label={`루트 ${r.label} 고르기`} aria-pressed={sel === r.id} onClick={() => setSel(r.id)} onKeyDown={(e) => onKey(e, () => setSel(r.id))}>
              <rect x={50 - ROOT_W / 2} y={rowY(i) - ROOT_H / 2} width={ROOT_W} height={ROOT_H} rx={3} />
              <text x={50} y={rowY(i) - 4} className="gc-label">
                {r.label}
              </text>
              <text x={50} y={rowY(i) + 12} className="gc-sub">
                {r.where}
              </text>
            </g>
          ))}
          {heap.objs.map((o) => {
            const b = boxOf(o.id);
            const st = nodeState(o.id);
            return (
              <g key={o.id} className="gc-node" data-s={st} data-sel={sel === o.id || undefined} tabIndex={gc ? -1 : 0} role="button" aria-label={`${o.slot}번 칸 객체 ${o.label} 고르기`} aria-pressed={sel === o.id} onClick={() => !gc && setSel(o.id)} onKeyDown={(e) => onKey(e, () => !gc && setSel(o.id))}>
                <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} rx={5} />
                <text x={b.x} y={b.y + 1} className="gc-label">
                  {o.label}
                </text>
                <text x={b.x - b.w / 2 + 4} y={b.y - b.h / 2 + 10} className="gc-slotno">
                  #{o.slot}
                </text>
                {st === 'freed' && <path d={`M${b.x - b.w / 2 + 6},${b.y - b.h / 2 + 6} L${b.x + b.w / 2 - 6},${b.y + b.h / 2 - 6}`} className="gc-x" />}
              </g>
            );
          })}
          <defs>
            <marker id="gc-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="gc-ah" />
            </marker>
            <marker id="gc-ah-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="gc-ah-hot" />
            </marker>
          </defs>
        </svg>
      </div>
      <div className="fig-split">
        <div className="pl-col">
          <div className="pl-note" aria-live="polite">
            {f ? (
              <>
                <strong>{f.phase === 'mark' ? '표시' : f.phase === 'sweep' ? '쓸기' : 'GC'} · {s.i + 1}단계.</strong> {f.note}
              </>
            ) : (
              msg
            )}
          </div>
          {f && f.work.length > 0 && (
            <div className="pl-chips" aria-label="작업 목록">
              <span className="pl-label">작업 목록:</span>
              {f.work.map((w) => (
                <span key={w} className="pl-chip">
                  {label(w)}
                </span>
              ))}
            </div>
          )}
          <Legend
            items={[
              { color: 'var(--good)', label: '표시됨 (살아 있음)', shape: 'sq' },
              { color: 'var(--hl)', label: '지금 살펴보는 객체', shape: 'sq' },
              { color: 'var(--bad)', label: '쓰레기 · 해제', shape: 'sq' },
            ]}
          />
        </div>
        <div className="controls">
          {gc ? (
            <>
              <StepControls s={s} id="gc-ms-speed" maxSpeed={12} />
              <Button small primary onClick={finishGc} disabled={!done}>
                {done ? '프로그램 계속하기' : 'GC가 끝나야 계속할 수 있습니다'}
              </Button>
            </>
          ) : (
            <>
              <div className="btn-row">
                <Button small onClick={alloc}>
                  새 객체 할당 ({label(sel)}이(가) 가리킴)
                </Button>
                <Button small primary onClick={startGc}>
                  GC 실행
                </Button>
              </div>
              <Check label="닿을 수 없는 객체 미리 보기" checked={showDead} onChange={setShowDead} />
              <Button
                small
                onClick={() => {
                  setHeap(initialHeap());
                  setStats({ runs: 0, freed: 0 });
                  setMsg('처음 상태로 되돌렸습니다.');
                }}
              >
                처음으로
              </Button>
            </>
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="힙의 객체" value={`${heap.objs.length - (f?.freed.size ?? 0)}개`} />
            <Readout label="빈 칸" value={`${free + (f?.freed.size ?? 0)}개`} />
            <Readout label="GC 횟수" value={`${stats.runs}번`} />
            <Readout label="지금까지 해제" value={`${stats.freed + (f?.freed.size ?? 0)}개`} color="var(--bad)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: reference counting next to tracing ─────────────── */

const PW = 300;
const PH = 196;

function RcPanel({ snap, mode, script }: { snap: RcSnap; mode: 'rc' | 'trace'; script: string }) {
  const vars = snap.vars;
  const objs = snap.objs;
  const vx = (i: number) => (vars.length === 1 ? PW / 2 : 46 + (i * (PW - 92)) / (vars.length - 1));
  const ox = (i: number) => (objs.length === 1 ? PW / 2 : 50 + (i * (PW - 100)) / Math.max(1, objs.length - 1));
  const VY = 34;
  const OY = 132;
  const ow = 56;
  const oh = 36;
  const pos = new Map(objs.map((o, i) => [o, ox(i)]));
  const freed = (o: string) => (mode === 'rc' ? snap.rcFreed.has(o) : snap.trFreed.has(o));
  const pairs = new Set(snap.edges.map(([a, , b]) => `${a}>${b}`));
  const title = mode === 'rc' ? '참조 세기' : '추적 (표시-쓸기)';
  return (
    <div className="gc-panel">
      <div className="gc-panel-head">
        <strong>{title}</strong>
        <span className="pl-label">{mode === 'rc' ? '숫자: 이 객체를 가리키는 참조의 수' : 'GC가 돌 때만 치웁니다'}</span>
      </div>
      <svg viewBox={`0 0 ${PW} ${PH}`} className="gc-svg" role="img" aria-label={`${title}: ${objs.map((o) => `${o}${freed(o) ? ' 해제됨' : mode === 'rc' ? ` 참조 ${snap.rc.get(o)}개` : snap.trGarbage.has(o) ? ' 쓰레기' : ' 살아 있음'}`).join(', ') || '객체 없음'}`}>
        <text className="gc-area" x={6} y={14}>
          변수
        </text>
        <text className="gc-area" x={6} y={OY - oh / 2 - 10}>
          힙
        </text>
        {objs.length === 0 && (
          <text x={PW / 2} y={OY} className="gc-sub">
            아직 만든 객체가 없습니다
          </text>
        )}
        {vars.map(([name, to], i) => {
          const x = vx(i);
          const tx = to ? pos.get(to)! : null;
          return (
            <g key={name}>
              {to && tx !== null && !freed(to) && <path d={`M${x},${VY + 13} L${tx},${OY - oh / 2 - 3}`} className="gc-edge-line" markerEnd={`url(#rc-ah-${mode}-${script})`} />}
              <rect x={x - 30} y={VY - 13} width={60} height={26} className="gc-var" rx={3} />
              <text x={x} y={VY + 1} className="gc-label">
                {name}
              </text>
              {!to && (
                <text x={x} y={VY + 28} className="gc-sub">
                  null
                </text>
              )}
            </g>
          );
        })}
        {snap.edges.map(([a, field, b]) => {
          if ((mode === 'rc' && snap.rcFreed.has(a)) || (mode === 'trace' && snap.trFreed.has(a))) return null;
          const x0 = pos.get(a)!;
          const x1 = pos.get(b)!;
          const both = pairs.has(`${b}>${a}`);
          const dir = x1 > x0 ? 1 : -1;
          const bend = both ? (dir > 0 ? -26 : 26) : 0;
          const sx = x0 + (dir * ow) / 2;
          const ex = x1 - (dir * ow) / 2 - dir * 3;
          const cy = OY + bend * 1.4;
          return (
            <g key={`${a}${field}`}>
              <path d={`M${sx},${OY + bend * 0.3} Q${(sx + ex) / 2},${cy} ${ex},${OY + bend * 0.3}`} className="gc-edge-line" markerEnd={`url(#rc-ah-${mode}-${script})`} />
              <text x={(sx + ex) / 2} y={OY + bend * 0.9 + (both ? (bend > 0 ? 10 : -4) : -6)} className="gc-sub">
                {field}
              </text>
            </g>
          );
        })}
        {objs.map((o) => {
          const x = pos.get(o)!;
          const fr = freed(o);
          const garbage = mode === 'trace' ? snap.trGarbage.has(o) : false;
          const just = mode === 'rc' && snap.rcJustFreed.includes(o);
          const leak = mode === 'rc' && !fr && !reachableVar(snap, o);
          return (
            <g key={o} className="gc-node" data-s={fr ? 'freed' : garbage ? 'garbage' : leak ? 'leak' : just ? 'at' : undefined}>
              <rect x={x - ow / 2} y={OY - oh / 2} width={ow} height={oh} rx={5} />
              <text x={x} y={OY + 1} className="gc-label">
                {o}
              </text>
              {mode === 'rc' && !fr && (
                <g className="gc-badge">
                  <circle cx={x + ow / 2} cy={OY - oh / 2} r={10} />
                  <text x={x + ow / 2} y={OY - oh / 2 + 1}>
                    {snap.rc.get(o)}
                  </text>
                </g>
              )}
              <text x={x} y={OY + oh / 2 + 14} className="gc-sub" data-tone={fr ? 'bad' : garbage || leak ? 'bad' : undefined}>
                {fr ? '해제됨' : garbage ? '쓰레기' : leak ? '새는 중' : ''}
              </text>
            </g>
          );
        })}
        <defs>
          <marker id={`rc-ah-${mode}-${script}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="gc-ah" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

/** Is o reachable from a variable (ignoring what any collector has freed)? */
function reachableVar(snap: RcSnap, o: string): boolean {
  const seen = new Set<string>();
  const todo = snap.vars.map(([, v]) => v).filter((v): v is string => !!v);
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const [a, , b] of snap.edges) if (a === id) todo.push(b);
  }
  return seen.has(o);
}

function RcFigure() {
  const [sid, setSid] = useState('cycle');
  const sc = SCRIPTS.find((x) => x.id === sid)!;
  const snaps = useMemo(() => replay(sc), [sc]);
  const s = useStepper(snaps.length, 1, sid);
  const snap = snaps[s.i];
  const cur = s.i - 1;
  const rcLive = snap.objs.filter((o) => !snap.rcFreed.has(o)).length;
  const trLive = snap.objs.filter((o) => !snap.trFreed.has(o)).length;
  const leaked = snap.objs.filter((o) => !snap.rcFreed.has(o) && !reachableVar(snap, o));
  let note = '첫 줄부터 실행해 보세요.';
  if (cur >= 0) {
    const line = sc.ops[cur].code;
    if (snap.gcRan) note = `추적 GC가 루트에서 닿지 않는 객체 ${snap.trFreed.size - (snaps[s.i - 1]?.trFreed.size ?? 0)}개를 치웠습니다. ${leaked.length ? `참조 세기 쪽의 ${leaked.join(', ')}은(는) 서로를 가리켜 숫자가 0이 되지 않으므로 영원히 남습니다.` : '참조 세기는 이미 다 치웠습니다.'}`;
    else if (snap.rcJustFreed.length) note = `${line} → ${snap.rcJustFreed.join(', ')}의 참조 수가 0이 되어 그 자리에서 해제했습니다${snap.rcJustFreed.length > 1 ? '(하나를 해제하면 그것이 가리키던 객체의 수도 줄어 연쇄로 해제됩니다)' : ''}. 추적 쪽은 다음 GC 때까지 쓰레기로 남겨 둡니다.`;
    else if (leaked.length) note = `${line} → 어느 변수에서도 ${leaked.join(', ')}에 닿을 수 없지만, 서로를 가리키고 있어 참조 수가 0이 아닙니다.`;
    else note = `${line} → 참조 수가 바뀌었습니다.`;
  }

  return (
    <Figure
      no={2}
      title="참조 세기는 순환을 못 치운다"
      hint="예제를 고르고 한 줄씩 실행해 보세요"
      caption={<>같은 코드를 두 방식의 수집기로 실행합니다. 참조 세기는 객체마다 자기를 가리키는 참조의 수(동그라미 숫자)를 들고 있다가, 0이 되는 순간 해제합니다. 추적 방식은 평소에는 아무것도 하지 않다가 GC가 돌 때 루트(변수)에서 닿지 않는 것을 한꺼번에 치웁니다. 빨간 글씨는 쓰레기이거나, 쓰레기인데 치워지지 않는(새는) 객체입니다.</>}
    >
      <Seg label="예제" value={sid} onChange={setSid} options={SCRIPTS.map((x) => ({ value: x.id, label: x.label }))} />
      <div className="gc-rc">
        <ol className="gc-code" aria-label="실행할 코드">
          {sc.ops.map((op, i) => (
            <li key={i} data-cur={i === cur || undefined} data-done={i < cur || undefined}>
              <code>{op.code}</code>
            </li>
          ))}
        </ol>
        <div className="gc-pair">
          <RcPanel snap={snap} mode="rc" script={sid} />
          <RcPanel snap={snap} mode="trace" script={sid} />
        </div>
      </div>
      <div className="pl-note" aria-live="polite">
        {note}
      </div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 280px' }}>
          <StepControls s={s} id="gc-rc-speed" maxSpeed={4} />
        </div>
        <div className="readouts" style={{ flex: '1 1 260px', gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="참조 세기: 남은 객체" value={`${rcLive}개`} color={leaked.length && snap.gcRan ? 'var(--bad)' : undefined} />
          <Readout label="추적: 남은 객체" value={`${trLive}개`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: generational collection ─────────────── */

function GenFigure() {
  const P = usePalette();
  const [gen, setGen] = useState(true);
  const [nursery, setNursery] = useState(200);
  const [longFrac, setLongFrac] = useState(0.08);
  const res = useMemo(() => simulateGen({ generational: gen, nursery, longFrac }), [gen, nursery, longFrac]);
  const other = useMemo(() => simulateGen({ generational: !gen, nursery, longFrac }), [gen, nursery, longFrac]);
  const sum = (r: typeof res) => r.events.reduce((a, e) => a + e.pause, 0);
  const max = (r: typeof res) => r.events.reduce((a, e) => Math.max(a, e.pause), 0);
  const minors = res.events.filter((e) => e.kind === 'minor').length;
  const majors = res.events.length - minors;
  const yMaxPause = Math.max(max(res), max(other), 1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 14;
      const top = Math.round((h - gap) * 0.56);
      const pad = { l: 46, r: 12, t: 20, b: 8 };
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: res.ticks, yMin: 0, yMax: res.heap * 1.05, pad });
      p1.grid({ labels: false, xStep: 100, yStep: 300 });
      const X = (t: number) => p1.X(t);
      // stacked occupancy: old generation at the bottom, the nursery above it
      ctx.fillStyle = alpha(P.neg, 0.55);
      ctx.beginPath();
      ctx.moveTo(X(0), p1.Y(0));
      res.old.forEach((v, t) => ctx.lineTo(X(t), p1.Y(v)));
      ctx.lineTo(X(res.ticks - 1), p1.Y(0));
      ctx.fill();
      if (gen) {
        ctx.fillStyle = alpha(P.pos, 0.6);
        ctx.beginPath();
        res.old.forEach((v, t) => (t ? ctx.lineTo(X(t), p1.Y(v)) : ctx.moveTo(X(t), p1.Y(v))));
        for (let t = res.ticks - 1; t >= 0; t--) ctx.lineTo(X(t), p1.Y(res.old[t] + res.young[t]));
        ctx.fill();
        p1.line(0, res.heap - res.nursery, res.ticks, res.heap - res.nursery, alpha(P.ink, 0.45), 1, [4, 4]);
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      res.live.forEach((v, t) => (t ? ctx.lineTo(X(t), p1.Y(v)) : ctx.moveTo(X(t), p1.Y(v))));
      ctx.stroke();
      p1.line(0, res.heap, res.ticks, res.heap, P.ink3, 1.2);
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(res.heap), p1.X(0) - 5, p1.Y(res.heap));
      ctx.fillText('0', p1.X(0) - 5, p1.Y(0));
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink2;
      ctx.fillText('힙 사용량 (칸)', p1.X(0), 9);

      ctx.save();
      ctx.translate(0, top + gap);
      const hb = h - top - gap;
      const p2 = new Plot(ctx, w, hb, P, { xMin: 0, xMax: res.ticks, yMin: 0, yMax: yMaxPause * 1.1, pad: { l: 46, r: 12, t: 20, b: 22 } });
      p2.grid({ labels: false, xStep: 100, yStep: yMaxPause > 8 ? 4 : 2 });
      for (const e of res.events) {
        const x = p2.X(e.t);
        ctx.fillStyle = e.kind === 'minor' ? P.pos : P.bad;
        const bw = e.kind === 'minor' ? 1.6 : 3;
        ctx.fillRect(x - bw / 2, p2.Y(e.pause), bw, p2.Y(0) - p2.Y(e.pause));
      }
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${yMaxPause.toFixed(0)}`, p2.X(0) - 5, p2.Y(yMaxPause));
      ctx.fillText('0', p2.X(0) - 5, p2.Y(0));
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      for (let t = 0; t <= res.ticks; t += 100) ctx.fillText(String(t), p2.X(t), p2.Y(0) + 5);
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink2;
      ctx.fillText('GC 멈춤 시간 (ms, 모형) · 가로: 시간', p2.X(0), 9);
      ctx.restore();
    },
    [P, res, gen, yMaxPause],
    { aspect: 1.75, maxHeight: 420, minHeight: 320 },
  );

  return (
    <Figure
      no={3}
      title="세대별 수집: 젊은 객체만 자주 치우기"
      hint="수집 방식과 손잡이를 바꿔 보세요"
      caption={<>시간마다 객체를 6개씩 할당하는 프로그램을 흉내 냈습니다. 대부분은 몇 틱 만에 죽고, 일부만 오래 삽니다. 위 그래프는 힙의 칸이 얼마나 찼는지(파랑: 오래된 세대 또는 전체 힙, 주황: 젊은 세대, 검은 선: 실제로 살아 있는 객체), 아래 그래프는 GC가 프로그램을 멈춘 시간입니다. 멈춤 시간은 표시가 살아 있는 객체 수에, 쓸기가 힙 크기에, 젊은 세대 수집이 살아남아 복사되는 객체 수에 비례한다고 놓은 모형입니다(표시 {COST.mark}ms/개, 쓸기 {COST.sweep}ms/칸, 복사 {COST.copy}ms/개).</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${gen ? '세대별' : '전체 표시-쓸기'} 수집 시뮬레이션: GC ${res.events.length}번, 가장 긴 멈춤 ${max(res).toFixed(1)}ms, 멈춤 합계 ${sum(res).toFixed(0)}ms`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="수집 방식"
            value={gen ? 'gen' : 'full'}
            onChange={(v) => setGen(v === 'gen')}
            options={[
              { value: 'full', label: '전체 표시-쓸기' },
              { value: 'gen', label: '세대별' },
            ]}
          />
          {gen && <Slider id="gc-nursery" label="젊은 세대 크기 (칸)" value={nursery} min={60} max={600} step={20} onChange={setNursery} />}
          <Slider id="gc-long" label="오래 사는 객체의 비율" value={longFrac} min={0.02} max={0.3} step={0.02} onChange={setLongFrac} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="GC 횟수" value={gen ? `${minors} + ${majors}` : `${res.events.length}번`} />
            <Readout label="가장 긴 멈춤" value={`${max(res).toFixed(1)}ms`} color="var(--bad)" />
            <Readout label="멈춤 합계" value={`${sum(res).toFixed(0)}ms`} />
            <Readout label={gen ? '전체 방식이었다면' : '세대별이었다면'} value={`최대 ${max(other).toFixed(1)}ms`} />
          </div>
          {gen && <div className="pl-label">GC 횟수: 젊은 세대 수집 + 전체 수집</div>}
          <Legend
            items={[
              { color: 'var(--pos)', label: '젊은 세대 수집', shape: 'sq' },
              { color: 'var(--bad)', label: '전체 수집', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function GarbageCollection() {
  return (
    <>
      <h2>메모리는 누가 치우나</h2>
      <p>
        객체를 만들면 메모리의 <T en="heap">힙</T>에 자리가 잡힙니다. 힙과 스택이 메모리 어디에 어떻게 놓이는지는 컴퓨터 구조의 <a href={lessonHref('cs-architecture', 'stack-heap')}>스택과 힙 장</a>에서 다룹니다. 문제는 다 쓴 자리를 돌려주는 일입니다. C에서는 프로그래머가 <code>malloc</code>으로 빌리고 <code>free</code>로 직접 돌려줍니다. 돌려주는 것을 잊으면 메모리가 계속 새고(<T en="memory leak">메모리 누수</T>), 돌려준 자리를 다시 쓰면 다른 데이터를 망가뜨리며(<T en="use-after-free">해제 후 사용</T>), 두 번 돌려주면 할당기가 망가집니다. Chromium과 Microsoft는 각각 자기 제품의 심각한 보안 버그 중 약 70%가 이런 메모리 안전성 문제라고 밝힌 바 있습니다.
      </p>
      <p>
        JavaScript, Java, Python, Go, C#은 이 일을 런타임이 대신합니다. 프로그램은 만들기만 하고, 더 이상 쓰지 않는 객체를 찾아 치우는 일은 <T en="garbage collector">가비지 컬렉터</T>(GC)가 합니다. 1959년 존 매카시(John McCarthy)가 Lisp를 위해 처음 만들었습니다.
      </p>

      <h2>쓰레기란 닿을 수 없는 것</h2>
      <p>
        GC는 "이 객체를 앞으로 쓸까?"를 알 수 없습니다. 그건 프로그램의 미래를 맞히는 문제이기 때문입니다. 대신 확실히 판단할 수 있는 더 약한 질문을 씁니다. "프로그램이 이 객체에 <strong>닿을 수는</strong> 있는가?" 전역 변수, 지금 스택에 있는 지역 변수와 매개변수처럼 프로그램이 바로 손댈 수 있는 것을 <T en="root">루트</T>라고 합니다. 루트에서 참조를 따라가 닿을 수 있는 객체는 <T en="reachable">도달 가능</T>하고, 나머지는 프로그램이 다시는 손댈 방법이 없으므로 쓰레기입니다.
      </p>
      <HeapFigure />
      <p>
        처음 상태에서 GC를 실행해 보세요. 옛 세션은 이미지를 가리키고 있지만 아무도 옛 세션을 가리키지 않으므로 치워집니다. <strong>가리키는 쪽</strong>이 아니라 <strong>가리켜지는 쪽</strong>이어야 산다는 점에 주의하세요. 임시 A와 B는 서로를 가리키지만 루트에서 닿지 않으므로 함께 치워집니다. 상품 2도 마찬가지입니다. 이제 user → 프로필 참조를 끊고(함수가 끝나 지역 변수 user가 사라진 상황입니다) 다시 GC를 돌리면 프로필과 사진이 함께 사라집니다. 빈 칸이 없을 때 할당하면 실패한다는 것도 확인해 보세요. 실제 런타임은 할당이 실패할 때 GC를 돌립니다.
      </p>

      <h2>표시-쓸기</h2>
      <p>
        그림 1의 GC가 쓰는 방법이 <T en="mark-and-sweep">표시-쓸기</T>입니다. 이름 그대로 두 단계입니다.
      </p>
      <Code label="표시-쓸기">{`
function collect(roots, heap) {
  // 1. 표시: 루트에서 닿는 객체에 모두 표시한다
  const work = [...roots];               // 살펴볼 객체 목록
  while (work.length > 0) {
    const obj = work.pop();
    if (obj.marked) continue;            // 이미 본 객체 (순환이 있어도 끝난다)
    obj.marked = true;
    for (const child of obj.refs) work.push(child);
  }
  // 2. 쓸기: 힙 전체를 훑으며 표시 없는 객체를 해제한다
  for (const obj of heap.allObjects()) {
    if (obj.marked) obj.marked = false;  // 다음 GC를 위해 지운다
    else heap.free(obj);
  }
}`}</Code>
      <p>
        표시 단계의 비용은 살아 있는 객체의 수에, 쓸기 단계의 비용은 힙 전체의 크기에 비례합니다. 그리고 표시하는 동안 프로그램이 참조를 바꾸면 안 되므로, 가장 단순한 GC는 프로그램을 통째로 멈추고 일합니다(<T en="stop-the-world">세계 멈춤</T>). 그림 1에서 GC가 도는 동안 다른 단추가 사라지는 것이 그 모습입니다. 힙이 수 GB인 서버에서는 이 멈춤이 수백 밀리초가 될 수 있고, 그동안 모든 요청이 기다립니다.
      </p>
      <Callout kind="note">
        쓸기를 마치면 빈 칸이 힙 곳곳에 흩어집니다. 빈 칸을 모두 합하면 충분한데 큰 객체 하나를 넣을 연속된 자리가 없는 상태를 <T en="fragmentation">단편화</T>라고 합니다. 그래서 많은 GC는 살아남은 객체를 한쪽으로 모아 붙이는 <T en="compaction">압축</T>을 함께 합니다(표시-압축). 객체를 옮기면 그 객체를 가리키던 모든 참조의 주소도 고쳐야 합니다.
      </Callout>

      <h2>참조 세기</h2>
      <p>
        다른 방법도 있습니다. 객체마다 "나를 가리키는 참조가 몇 개인지"를 세어 두고, 참조를 만들 때마다 1을 더하고 없앨 때마다 1을 뺍니다. 0이 되는 순간 아무도 가리키지 않는 것이므로 바로 해제합니다. 이것이 <T en="reference counting">참조 세기</T>입니다. 쓰레기가 생기자마자 치우므로 메모리를 빨리 돌려받고, 프로그램을 오래 멈추지 않습니다. 대신 참조를 대입할 때마다 숫자를 고치는 비용이 들고, 결정적인 약점이 하나 있습니다.
      </p>
      <RcFigure />
      <p>
        "순환 참조"에서 a와 b를 모두 null로 만들면, A와 B는 어느 변수에서도 닿을 수 없는 쓰레기가 됩니다. 그런데 A는 B가, B는 A가 가리키고 있어서 참조 수가 1에서 내려가지 않습니다. 참조 세기만으로는 이 둘을 영원히 치우지 못합니다. 추적 방식은 "누가 나를 가리키는가"가 아니라 "루트에서 닿는가"를 보므로 순환과 상관없이 치웁니다. "부모를 가리키는 자식"은 웹 페이지의 DOM처럼 실제로 흔한 순환입니다.
      </p>
      <Callout kind="intuition">
        Python(CPython)은 참조 세기를 기본으로 쓰고, 순환만 찾아내는 수집기를 따로 가끔 돌립니다. Swift와 Objective-C는 컴파일러가 참조 세기 코드를 넣어 주고(ARC), 순환은 프로그래머가 한쪽 참조를 <code>weak</code>로 표시해 끊어야 합니다. 자식이 부모를 가리킬 때 그 참조를 약한 참조로 두는 것이 전형적인 방법입니다.
      </Callout>

      <h2>세대별 가설: 대부분은 일찍 죽는다</h2>
      <p>
        실제 프로그램을 재 보면 객체의 수명에 뚜렷한 모양이 있습니다. 함수 안에서 잠깐 쓰는 임시 배열, 문자열을 이어 붙이며 생기는 중간 문자열, 요청 하나를 처리하는 동안만 쓰는 객체처럼, <strong>대부분의 객체는 만들어지자마자 죽습니다</strong>. 반대로 한동안 살아남은 객체(설정, 캐시)는 계속 살아남는 경향이 있습니다. 이를 <T en="generational hypothesis">세대별 가설</T>이라고 합니다.
      </p>
      <p>
        이 가설을 이용하는 것이 <T en="generational GC">세대별 수집</T>입니다. 힙을 작은 <T en="young generation">젊은 세대</T>와 큰 <T en="old generation">오래된 세대</T>로 나누고, 새 객체는 젊은 세대에 넣습니다. 젊은 세대가 차면 젊은 세대만 수집합니다. 거기 있는 객체는 대부분 이미 죽었으므로 살아남은 몇 개만 옮기면 되어 아주 빠릅니다. 두 번 살아남은 객체는 오래된 세대로 승격시키고, 오래된 세대가 찼을 때만 드물게 전체를 수집합니다.
      </p>
      <GenFigure />
      <p>
        "전체 표시-쓸기"에서는 힙이 찰 때마다 힙 전체를 표시하고 쓸어서 멈춤이 매번 길게 생깁니다. "세대별"로 바꾸면 짧은 주황 막대가 촘촘히 생기고, 긴 빨간 막대는 드물어집니다. 멈춤의 합계도, 가장 긴 멈춤도 줄어듭니다. "오래 사는 객체의 비율"을 높여 보세요. 세대별 가설이 깨질수록 승격되는 객체가 늘어 오래된 세대가 빨리 차고, 전체 수집이 다시 생겨 이득이 줄어듭니다. 젊은 세대의 크기도 맞바꿈입니다. 너무 작으면 수집이 너무 잦아 아직 살아 있는 갓 만든 객체를 번번이 복사하느라 합계가 늘고, 너무 크면 오래된 세대가 좁아져 전체 수집이 일찍 찾아옵니다.
      </p>
      <Callout kind="note">
        V8(Chrome과 Node.js의 엔진)은 젊은 세대를 두 반쪽으로 나눠 살아남은 객체를 다른 반쪽으로 복사하는 방식(Scavenger)으로, 오래된 세대는 표시-압축으로 수집합니다. 표시는 프로그램이 도는 동안 다른 스레드에서 조금씩 미리 하고(동시 표시), 멈추는 시간을 잘게 나눕니다. Java의 ZGC 같은 최신 수집기는 힙이 수백 GB여도 멈춤을 1밀리초 안팎으로 유지하는 것을 목표로 합니다.
      </Callout>

      <h2>GC가 있어도 메모리는 샌다</h2>
      <p>
        GC는 닿을 수 없는 것만 치웁니다. 다시 쓰지 않을 객체라도 어딘가에서 참조가 남아 있으면 영원히 살아 있습니다. GC가 있는 언어의 메모리 누수는 거의 모두 이렇게 생깁니다.
      </p>
      <ul>
        <li>계속 넣기만 하고 지우지 않는 캐시(전역 Map)</li>
        <li>화면에서 사라진 요소에 등록해 두고 해제하지 않은 이벤트 리스너</li>
        <li>
          큰 데이터를 쓰는 환경을 붙잡은 채 오래 살아남는 클로저(<a href={lessonHref('cs-programming-languages', 'interpreter')}>인터프리터 장</a>에서 "끝났지만 붙잡힘"으로 남던 환경)
        </li>
      </ul>
      <Code label="약한 참조로 캐시 만들기">{`
// Map은 키 객체를 붙잡아 GC가 치우지 못하게 한다
const cache = new Map();
// WeakMap은 키를 약하게 참조한다: 키 객체가 다른 곳에서 닿지 않으면
// GC가 키와 값을 함께 치운다
const sizes = new WeakMap();
function sizeOf(el) {
  if (!sizes.has(el)) sizes.set(el, el.getBoundingClientRect());
  return sizes.get(el);
}`}</Code>

      <Callout kind="key">
        GC는 루트(전역 변수, 스택의 변수)에서 참조를 따라 닿을 수 있는 객체만 살아 있다고 보고 나머지를 치웁니다. 표시-쓸기는 닿는 것을 표시한 뒤 표시 없는 것을 쓸어 내고, 참조 세기는 가리키는 참조가 0이 되는 순간 치우지만 순환을 놓칩니다. 대부분의 객체가 일찍 죽는다는 세대별 가설 덕분에, 젊은 세대만 자주 수집하는 세대별 GC는 멈춤을 크게 줄입니다.
      </Callout>
      <Quiz
        q="웹 서버가 요청마다 사용자 정보를 전역 Map에 기록해 두고 지우지 않는다. 메모리 사용량이 계속 늘어난다. GC가 있는데도 이런 일이 생기는 이유는?"
        options={['GC가 Map 안의 객체는 검사하지 않기 때문에', 'Map이 전역 변수(루트)에서 닿는 곳에 있어서, 안의 객체가 모두 도달 가능하기 때문에', '참조 세기 방식이라 순환을 못 치우기 때문에', 'GC는 프로그램이 끝날 때만 돌기 때문에']}
        answer={1}
        explain={<>GC는 "앞으로 쓸지"가 아니라 "닿을 수 있는지"를 봅니다. 전역 Map은 루트에서 바로 닿고, 그 안의 모든 값도 Map을 거쳐 닿으므로 살아 있는 것으로 판단됩니다. 오래된 항목을 지우거나 크기 제한(LRU)을 두거나, 키가 객체라면 WeakMap을 써야 합니다.</>}
      />
    </>
  );
}

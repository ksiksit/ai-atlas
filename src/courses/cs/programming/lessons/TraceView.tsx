import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StepControls, useStepper } from '../../shared';
import type { FrameSnap, HeapSnap, Program, Snap, Val } from './trace';

/* ─────────────── code listing with the current line ─────────────── */

export type LineMark = 'pick' | 'good' | 'bad';

/** One source line: comments dimmed, everything else plain. */
function LineText({ text }: { text: string }) {
  const c = text.indexOf('//');
  if (c < 0) return <>{text || ' '}</>;
  return (
    <>
      {text.slice(0, c)}
      <span className="cm">{text.slice(c)}</span>
    </>
  );
}

export function CodeView({
  lines,
  cur,
  ann,
  ran,
  marks,
  onPick,
  label,
  anns,
}: {
  lines: string[];
  cur: number;
  ann?: string;
  /** annotations on several lines at once */
  anns?: Record<number, string>;
  /** lines that ran at least once so far (others are dimmed when given) */
  ran?: Set<number>;
  marks?: Record<number, LineMark>;
  /** makes line numbers clickable */
  onPick?: (line: number) => void;
  label?: string;
}) {
  return (
    <div className="tr-code" role="group" aria-label={label ?? '코드'}>
      {lines.map((l, i) => {
        const mark = marks?.[i];
        return (
          <div key={i} className="tr-line" data-cur={i === cur || undefined} data-dim={(ran && !ran.has(i) && i !== cur) || undefined} data-mark={mark}>
            {onPick ? (
              <button type="button" className="tr-ln" onClick={() => onPick(i)} aria-label={`${i + 1}번 줄 고르기`} aria-pressed={mark === 'pick' || mark === 'good' || mark === 'bad'}>
                {i + 1}
              </button>
            ) : (
              <span className="tr-ln" aria-hidden="true">
                {i + 1}
              </span>
            )}
            <span className="tr-src">
              <LineText text={l} />
              {i === cur && ann && <span className="tr-ann">{ann}</span>}
              {anns?.[i] && (
                <span className="tr-ann" data-soft={!/(true|false)$/.test(anns[i]) || undefined} data-true={/true$/.test(anns[i]) || undefined} data-false={/false$/.test(anns[i]) || undefined}>
                  {anns[i]}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── variables, frames and objects ─────────────── */

export function ValText({ v, big }: { v: Val; big?: boolean }) {
  if (v.t === 'ref') return <span className="tr-ref" data-ref={v.id} aria-label="객체를 가리킴" />;
  return (
    <span className="tr-val" data-t={v.t} data-big={big || undefined}>
      {v.s}
    </span>
  );
}

function FrameCard({ f, active, global, solo }: { f: FrameSnap; active: boolean; global: boolean; solo: boolean }) {
  return (
    <div className="tr-frame" data-active={(active && !solo) || undefined} data-global={global || undefined}>
      {!solo && <div className="tr-frame-head">{global ? '전역' : f.title}</div>}
      {f.vars.length === 0 && !f.ret && <div className="tr-empty">변수 없음</div>}
      {f.vars.map((r) => (
        <div key={r.name} className="tr-var" data-changed={r.changed || undefined}>
          <span className="tr-name">{r.name}</span>
          <ValText v={r.v} />
        </div>
      ))}
      {f.ret && (
        <div className="tr-var tr-ret">
          <span className="tr-name">↩ 반환</span>
          <ValText v={f.ret} />
        </div>
      )}
    </div>
  );
}

function HeapCard({ h }: { h: HeapSnap }) {
  if (h.kind === 'array') {
    return (
      <div className="tr-obj" data-obj={h.id} data-fresh={h.fresh || undefined}>
        <div className="tr-obj-head">배열 · 길이 {h.cells.length}</div>
        <div className="tr-arr">
          {h.cells.length === 0 && <span className="tr-empty">비어 있음</span>}
          {h.cells.map((c) => (
            <div key={c.key} className="tr-cell" data-changed={c.changed || undefined}>
              <span className="tr-cell-v">
                <ValText v={c.v} />
              </span>
              <span className="tr-idx">{c.key}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="tr-obj" data-obj={h.id} data-fresh={h.fresh || undefined}>
      <div className="tr-obj-head">객체</div>
      {h.cells.length === 0 && <div className="tr-empty">속성 없음</div>}
      {h.cells.map((c) => (
        <div key={c.key} className="tr-var" data-changed={c.changed || undefined}>
          <span className="tr-name">{c.key}</span>
          <ValText v={c.v} />
        </div>
      ))}
    </div>
  );
}

interface Arrow {
  d: string;
  hot: boolean;
}

/** Frames (newest on top) and, when the program uses objects, the heap with reference arrows. */
export function MemoryView({ snap, heapCol, stackLabel }: { snap: Snap; heapCol: boolean; stackLabel?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const mid = 'tr-ah-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const solo = snap.frames.length === 1 && !stackLabel;

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const out: Arrow[] = [];
      el.querySelectorAll<HTMLElement>('[data-ref]').forEach((src) => {
        const dst = el.querySelector<HTMLElement>(`[data-obj="${src.dataset.ref}"]`);
        if (!dst) return;
        const a = src.getBoundingClientRect();
        const b = dst.getBoundingClientRect();
        const sx = a.left + a.width / 2 - base.left;
        const sy = a.top + a.height / 2 - base.top;
        const ty = b.top - base.top + 14;
        const hot = !!src.closest('[data-changed]');
        const tl = b.left - base.left;
        if (tl > sx + 10) {
          const dx = Math.max(18, (tl - sx) * 0.5);
          out.push({ d: `M${sx},${sy} C${sx + dx},${sy} ${tl - dx},${ty} ${tl - 2},${ty}`, hot });
        } else {
          // target is not to the right: loop around its right edge
          const tr = b.right - base.left;
          const bend = Math.max(sx, tr) + 26;
          out.push({ d: `M${sx},${sy} C${bend},${sy} ${bend},${ty} ${tr + 2},${ty}`, hot });
        }
      });
      setArrows((prev) => (prev.length === out.length && prev.every((p, i) => p.d === out[i].d && p.hot === out[i].hot) ? prev : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap]);

  const depths = heapCol ? Math.max(1, ...snap.heap.map((h) => h.depth)) : 0;
  const cols = Array.from({ length: depths }, (_, d) => snap.heap.filter((h) => h.depth === d + 1));

  return (
    <div className="tr-mem">
      <div className="tr-mem-in" ref={inner}>
        <div className="tr-col tr-col-stack">
          <div className="tr-col-head">{stackLabel ?? (snap.frames.length > 1 ? '호출 스택 (위가 실행 중)' : '변수')}</div>
          <div className="tr-stack">
            {snap.frames.map((f, i) => (
              <FrameCard key={f.key} f={f} active={i === snap.frames.length - 1} global={i === 0} solo={solo} />
            ))}
          </div>
        </div>
        {cols.map((hs, d) => (
          <div key={d} className="tr-col tr-col-heap">
            <div className="tr-col-head">{d === 0 ? '힙 (객체가 사는 곳)' : ' '}</div>
            {hs.length === 0 && <div className="tr-empty">(비어 있음)</div>}
            {hs.map((h) => (
              <HeapCard key={h.id} h={h} />
            ))}
          </div>
        ))}
        {arrows.length > 0 && (
          <svg className="tr-arrows" aria-hidden="true">
            <defs>
              <marker id={mid} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--ink-2)' }} />
              </marker>
              <marker id={mid + 'h'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--part-color, var(--accent))' }} />
              </marker>
            </defs>
            {arrows.map((a, i) => (
              <path key={i} d={a.d} className="tr-arrow" data-hot={a.hot || undefined} markerEnd={`url(#${a.hot ? mid + 'h' : mid})`} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

export function OutputView({ out, label = '콘솔 출력' }: { out: string[]; label?: string }) {
  return (
    <div className="tr-out" aria-label={label}>
      <div className="tr-out-head">{label}</div>
      {out.length === 0 ? (
        <div className="tr-out-empty">아직 출력 없음</div>
      ) : (
        out.map((o, i) => (
          <div key={i} className="tr-out-line">
            {o}
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────── the whole tracer: code | memory, note, output, transport ─────────────── */

export function TraceBlock({
  program,
  resetKey,
  id,
  speed = 2,
  children,
  stackLabel,
  marks,
  onPick,
  showRan,
  atEnd,
}: {
  program: Program;
  resetKey?: unknown;
  id: string;
  speed?: number;
  children?: ReactNode;
  stackLabel?: string;
  marks?: Record<number, LineMark>;
  onPick?: (line: number) => void;
  /** dim lines that have not run yet */
  showRan?: boolean;
  atEnd?: boolean;
}) {
  const s = useStepper(program.snaps.length, speed, resetKey ?? program, atEnd);
  const snap = program.snaps[s.i];
  const hasOut = program.snaps[program.snaps.length - 1].out.length > 0;
  let ran: Set<number> | undefined;
  if (showRan) {
    ran = new Set();
    for (let k = 0; k <= s.i; k++) ran.add(program.snaps[k].line);
  }
  return (
    <div className="tr">
      <div className="tr-main" data-heap={program.hasHeap || undefined}>
        <CodeView lines={program.lines} cur={snap.line} ann={snap.ann} ran={ran} marks={marks} onPick={onPick} />
        <MemoryView snap={snap} heapCol={program.hasHeap} stackLabel={stackLabel} />
      </div>
      <div className="tr-note" aria-live="polite">
        {snap.line >= 0 && <span className="tr-note-ln">{snap.line + 1}번 줄</span>}
        {snap.note}
      </div>
      {hasOut && <OutputView out={snap.out} />}
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 300px' }}>
          <StepControls s={s} id={id} maxSpeed={12} />
        </div>
        {children}
      </div>
    </div>
  );
}

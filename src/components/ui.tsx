import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import katex from 'katex';

/* ───────── Math ───────── */

/** Inline TeX. */
export function M({ children }: { children: string }) {
  const html = useMemo(() => katex.renderToString(children, { throwOnError: false, displayMode: false, strict: false }), [children]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Display TeX in a framed block with an optional note underneath. */
export function MB({ children, note }: { children: string; note?: ReactNode }) {
  const html = useMemo(() => katex.renderToString(children, { throwOnError: false, displayMode: true, strict: false, trust: false }), [children]);
  return (
    <div className="tex-block">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {note && <span className="tex-note">{note}</span>}
    </div>
  );
}

/* ───────── Code ───────── */

/** A code listing. Line comments (// …) are dimmed; no other highlighting. */
export function Code({ children, label }: { children: string; label?: string }) {
  const lines = children.replace(/^\n+|\s+$/g, '').split('\n');
  return (
    <pre className="code" aria-label={label}>
      <code>
        {lines.map((line, i) => {
          // a comment starts a line or follows a space, so URLs like jdbc:mysql://host stay undimmed
          const m = /(^|\s)\/\//.exec(line);
          const c = m ? m.index + m[1].length : -1;
          return (
            <span key={i}>
              {c >= 0 ? (
                <>
                  {line.slice(0, c)}
                  <span className="cm">{line.slice(c)}</span>
                </>
              ) : (
                line
              )}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

/* ───────── Prose helpers ───────── */

/** A key term, optionally with its English name. */
export function T({ children, en }: { children: ReactNode; en?: string }) {
  return (
    <>
      <span className="term">{children}</span>
      {en && <span className="en"> ({en})</span>}
    </>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

type CalloutKind = 'key' | 'intuition' | 'note' | 'warn';
const CALLOUT_LABEL: Record<CalloutKind, string> = { key: '핵심', intuition: '직관', note: '참고', warn: '주의' };

export function Callout({ kind = 'key', label, children }: { kind?: CalloutKind; label?: string; children: ReactNode }) {
  return (
    <aside className={`callout ${kind}`}>
      <div className="callout-label">{label ?? CALLOUT_LABEL[kind]}</div>
      <div className="callout-body">{children}</div>
    </aside>
  );
}

/* ───────── Figure ───────── */

export function Figure({ no, title, hint, caption, wide = true, children, style }: { no?: number | string; title: ReactNode; hint?: ReactNode; caption?: ReactNode; wide?: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <figure className={'figure' + (wide ? ' wide' : '')} style={style}>
      <div className="figure-head">
        <div className="figure-title">
          {no !== undefined && <span className="fig-no">그림 {no}</span>}
          <span>{title}</span>
        </div>
        {hint && <div className="figure-hint">{hint}</div>}
      </div>
      <div className="figure-body">{children}</div>
      {caption && <figcaption className="figure-caption">{caption}</figcaption>}
    </figure>
  );
}

/* ───────── Controls ───────── */

export function Slider({ label, value, min, max, step = 0.01, onChange, format, color, id }: { label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; color?: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="ctl">
      <label className="ctl-label" htmlFor={fid}>
        <span>{label}</span>
        <span className="val">{format ? format(value) : value}</span>
      </label>
      <input id={fid} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ ['--fill' as string]: `${fill}%`, ...(color ? { ['--track-color' as string]: color } : {}) }} />
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: ReactNode }) {
  const seg = (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!label) return seg;
  return (
    <div className="ctl">
      <span className="ctl-label">
        <span>{label}</span>
      </span>
      {seg}
    </div>
  );
}

/** `label` names a button whose visible text is only a symbol (▶, ⏭) for screen readers. */
export function Button({ children, onClick, primary, small, disabled, title, label }: { children: ReactNode; onClick: () => void; primary?: boolean; small?: boolean; disabled?: boolean; title?: string; label?: string }) {
  return (
    <button type="button" className={'btn' + (primary ? ' primary' : '') + (small ? ' small' : '')} onClick={onClick} disabled={disabled} title={title} aria-label={label}>
      {children}
    </button>
  );
}

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Readout({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="readout">
      <span className="readout-label">{label}</span>
      <span className="readout-value" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: ReactNode; shape?: 'dot' | 'sq' | 'ln' }[] }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i}>
          <i className={it.shape === 'sq' ? 'sq' : it.shape === 'ln' ? 'ln' : ''} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ───────── Quiz ───────── */

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

export function Quiz({ q, options, answer, explain }: { q: ReactNode; options: ReactNode[]; answer: number; explain: ReactNode }) {
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked === answer;
  return (
    <div className="quiz" style={picked !== null ? ({ ['--quiz-color' as string]: correct ? 'var(--good)' : 'var(--bad)' } as CSSProperties) : undefined}>
      <div className="quiz-q">
        <span className="tag">확인 문제</span>
        <span>{q}</span>
      </div>
      <div className="quiz-opts">
        {options.map((o, i) => {
          const state = picked === null ? undefined : i === answer ? 'right' : picked === i ? 'wrong' : undefined;
          return (
            <button key={i} type="button" className="quiz-opt" data-state={state} onClick={() => setPicked(i)}>
              <span aria-hidden="true">{CIRCLED[i] ?? `${i + 1}.`}</span>
              <span>{o}</span>
              <span className="mark">{state === 'right' ? '정답' : state === 'wrong' ? '고른 답' : ''}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="quiz-explain">
          <strong style={{ color: correct ? 'var(--good)' : 'var(--bad)' }}>{correct ? '정답입니다. ' : '다시 보기. '}</strong>
          {explain}
        </div>
      )}
    </div>
  );
}

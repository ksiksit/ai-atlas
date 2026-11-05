import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Group } from './group';
import './cayley.css';

/**
 * A group's multiplication (Cayley) table: row a, column b holds ab.
 *
 * - `rows` / `cols` reorder the table (default 0 … n−1), e.g. to line up cosets as blocks.
 * - `colorOf(x)` tints every cell holding x, and the headers of x.
 * - `highlight` emphasises those elements' headers and outlines the cells where both row and column
 *   are in it (a subgroup's block).
 * - `hidden(a, b)` shows "?" in a cell, for figures where the reader fills the table in.
 * - With `onPick`, cells are buttons; arrow keys move between them (one tab stop for the table).
 */
export function CayleyTable({
  G,
  rows,
  cols,
  colorOf,
  highlight,
  hidden,
  picked,
  onPick,
  label,
  compact,
}: {
  G: Group;
  rows?: number[];
  cols?: number[];
  colorOf?: (x: number) => string | undefined;
  highlight?: number[];
  hidden?: (a: number, b: number) => boolean;
  picked?: [number, number] | null;
  onPick?: (a: number, b: number) => void;
  label: string;
  compact?: boolean;
}) {
  const R = rows ?? Array.from({ length: G.n }, (_, i) => i);
  const C = cols ?? Array.from({ length: G.n }, (_, i) => i);
  const hi = new Set(highlight ?? []);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const tableRef = useRef<HTMLTableElement>(null);

  const tint = (x: number): CSSProperties | undefined => {
    const c = colorOf?.(x);
    return c ? { ['--cy-c' as string]: c } : undefined;
  };

  const move = (e: KeyboardEvent, i: number, j: number) => {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -j], End: [0, C.length - 1 - j] };
    const step = d[e.key];
    if (!step) return;
    e.preventDefault();
    const ni = Math.max(0, Math.min(R.length - 1, i + step[0]));
    const nj = Math.max(0, Math.min(C.length - 1, j + step[1]));
    setFocus([ni, nj]);
    const btn = tableRef.current?.querySelector<HTMLButtonElement>(`button[data-i="${ni}"][data-j="${nj}"]`);
    btn?.focus();
  };

  const op = G.op ?? '·';
  return (
    <div className="cy-wrap" tabIndex={onPick ? undefined : 0} role="region" aria-label={label}>
      <table ref={tableRef} className={'cy-table' + (compact ? ' cy-compact' : '')}>
        <thead>
          <tr>
            <th scope="col" className="cy-corner" aria-label={`행 ${op} 열`}>
              {op}
            </th>
            {C.map((b) => (
              <th key={b} scope="col" className="cy-head" style={tint(b)} data-c={colorOf?.(b) ? '' : undefined} data-hi={hi.has(b) || undefined}>
                {G.label(b)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {R.map((a, i) => (
            <tr key={a}>
              <th scope="row" className="cy-head" style={tint(a)} data-c={colorOf?.(a) ? '' : undefined} data-hi={hi.has(a) || undefined}>
                {G.label(a)}
              </th>
              {C.map((b, j) => {
                const x = G.mul(a, b);
                const hide = hidden?.(a, b) ?? false;
                const isPicked = !!picked && picked[0] === a && picked[1] === b;
                const inBlock = hi.size > 0 && hi.has(a) && hi.has(b);
                const text = hide ? '?' : G.label(x);
                const attrs = {
                  style: hide ? undefined : tint(x),
                  'data-c': !hide && colorOf?.(x) ? '' : undefined,
                  'data-block': inBlock || undefined,
                  'data-picked': isPicked || undefined,
                  'data-hidden': hide || undefined,
                  'data-id': !hide && x === G.id ? '' : undefined,
                };
                return onPick ? (
                  <td key={b} {...attrs} className="cy-cell">
                    <button
                      type="button"
                      data-i={i}
                      data-j={j}
                      tabIndex={focus[0] === i && focus[1] === j ? 0 : -1}
                      onFocus={() => setFocus([i, j])}
                      onKeyDown={(e) => move(e, i, j)}
                      onClick={() => onPick(a, b)}
                      aria-label={`${G.label(a)} ${op} ${G.label(b)}${hide ? ', 아직 모름' : ` = ${G.label(x)}`}`}
                      aria-pressed={isPicked}
                    >
                      {text}
                    </button>
                  </td>
                ) : (
                  <td key={b} {...attrs} className="cy-cell">
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A palette of distinct colours for cosets and the like, from the site's tokens. */
export const COSET_COLORS = ['var(--accent)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--neg)', 'var(--c-math-3)', 'var(--c-cs-3)', 'var(--c-net-1)', 'var(--bad)', 'var(--c-cs-4)', 'var(--c-stats-1)', 'var(--c-cs-2)'];

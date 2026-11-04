import type { CSSProperties, ReactNode } from 'react';
import { cellText, type Mark, type Row } from './db';

/** Colours for groups (GROUP BY) and for tables in a decomposition. */
export const GROUP_COLORS = ['var(--c-cs-1)', 'var(--c-cs-2)', 'var(--c-cs-3)', 'var(--c-cs-4)', 'var(--neg)', 'var(--pos)'];

export type CellState = 'new' | 'bad' | 'hl' | 'null-pad' | undefined;

export interface DbTableProps {
  cols: string[];
  rows: Row[];
  /** Korean glosses under column names */
  labels?: Record<string, string>;
  /** primary key columns, drawn underlined */
  pk?: string[];
  title?: ReactNode;
  marks?: (Mark | undefined)[];
  groups?: (number | undefined)[];
  cut?: number;
  rowState?: (i: number) => 'hl' | 'new' | 'dim' | undefined;
  cellState?: (i: number, col: string) => CellState;
  onRowEnter?: (i: number | null) => void;
  empty?: ReactNode;
  /** rows are keyboard-focusable (for hover-linked figures) */
  focusRows?: boolean;
  ariaLabel?: string;
  compact?: boolean;
}

const isNum = (v: unknown) => typeof v === 'number';

/** A small result table. Wide tables scroll inside their own box. */
export function DbTable({ cols, rows, labels, pk, title, marks, groups, cut, rowState, cellState, onRowEnter, empty, focusRows, ariaLabel, compact }: DbTableProps) {
  return (
    <div className="dbt-block">
      {title && <div className="dbt-title">{title}</div>}
      <div className="dbt-wrap" role="region" aria-label={ariaLabel ?? (typeof title === 'string' ? title : '표')} tabIndex={0}>
        <table className={'dbt' + (compact ? ' compact' : '')}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} data-pk={pk?.includes(c) || undefined} data-num={rows.length > 0 && rows.every((r) => r[c] === null || isNum(r[c])) ? true : undefined}>
                  <span className="dbt-col">{c}</span>
                  {labels?.[c] && <span className="dbt-gloss">{labels[c]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onMouseLeave={onRowEnter ? () => onRowEnter(null) : undefined}>
            {rows.map((r, i) => {
              const g = groups?.[i];
              return (
                <tr
                  key={i}
                  data-m={marks?.[i]}
                  data-cut={cut !== undefined && i >= cut ? true : undefined}
                  data-s={rowState?.(i)}
                  data-g={g !== undefined ? true : undefined}
                  style={g !== undefined ? ({ ['--g' as string]: GROUP_COLORS[g % GROUP_COLORS.length] } as CSSProperties) : undefined}
                  tabIndex={focusRows ? 0 : undefined}
                  onMouseEnter={onRowEnter ? () => onRowEnter(i) : undefined}
                  onFocus={onRowEnter ? () => onRowEnter(i) : undefined}
                  onBlur={onRowEnter ? () => onRowEnter(null) : undefined}
                >
                  {cols.map((c) => {
                    const v = r[c];
                    return (
                      <td key={c} data-num={isNum(v) || undefined} data-null={v === null || undefined} data-c={cellState?.(i, c)}>
                        {v === undefined ? '' : cellText(v, c)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={cols.length} className="dbt-empty">
                  {empty ?? '행 없음 (0행)'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** SQL text with some lines highlighted. */
export function SqlBox({ sql, on, label }: { sql: string; on?: (line: string, i: number) => boolean; label?: string }) {
  const lines = sql.split('\n');
  return (
    <pre className="sql-box" aria-label={label ?? 'SQL'}>
      {lines.map((l, i) => (
        <span key={i} className="sql-line" data-on={on?.(l, i) || undefined}>
          {l || ' '}
        </span>
      ))}
    </pre>
  );
}

/** Coloured message: an error from the database or a success line. */
export function DbMsg({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: ReactNode }) {
  return (
    <div className="db-msg" data-k={kind} role="status" aria-live="polite">
      {children}
    </div>
  );
}

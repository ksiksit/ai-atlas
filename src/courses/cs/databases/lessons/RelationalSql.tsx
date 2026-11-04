import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { DEPTS, STUDENTS, STUDENT_COLS, aggName, aggregate, cellText, order, runStages, sqlText, type Agg, type Cond, type Op, type Query, type Row, type StageKey, type Value } from './db';
import { DbMsg, DbTable, GROUP_COLORS, SqlBox } from './DbTable';
import '../../algorithms/lessons/algorithms.css';
import './db.css';

const ALL_COLS = STUDENT_COLS.map((c) => c.name);
const LABELS = Object.fromEntries(STUDENT_COLS.map((c) => [c.name, c.label]));

/* ─────────────── Figure 1: a table and its constraints ─────────────── */

interface Draft {
  id: string;
  name: string;
  dept: string;
  year: string;
  gpa: string;
}
const DRAFTS: { value: string; label: string; d: Draft }[] = [
  { value: 'ok', label: '올바른 행', d: { id: '2024019', name: '오지민', dept: '수학', year: '1', gpa: '' } },
  { value: 'dup', label: '이미 있는 학번', d: { id: '2022014', name: '이서연', dept: '경영', year: '3', gpa: '3.2' } },
  { value: 'null', label: '학번 비우기', d: { id: '', name: '서준우', dept: '컴퓨터공학', year: '2', gpa: '3.1' } },
  { value: 'check', label: '학년 7', d: { id: '2019088', name: '문태희', dept: '경영', year: '7', gpa: '2.8' } },
  { value: 'type', label: '학번에 글자', d: { id: '20학번', name: '배하린', dept: '수학', year: '2', gpa: '3.6' } },
];

type Outcome = { ok: true; row: Row } | { ok: false; msg: string; detail?: string };

/** Check a new row the way PostgreSQL does: types, then NOT NULL, then CHECK, then the unique primary key. */
function tryInsert(rows: Row[], d: Draft): Outcome {
  const int = (s: string) => (s.trim() === '' ? null : /^-?\d+$/.test(s.trim()) ? Number(s) : NaN);
  const id = int(d.id);
  if (Number.isNaN(id)) return { ok: false, msg: `ERROR: invalid input syntax for type integer: "${d.id}"`, detail: 'id 열은 정수(integer)만 받습니다.' };
  const year = int(d.year);
  const gpaS = d.gpa.trim();
  const gpa = gpaS === '' ? null : Number(gpaS);
  if (gpa !== null && Number.isNaN(gpa)) return { ok: false, msg: `ERROR: invalid input syntax for type numeric: "${d.gpa}"` };
  if (id === null) return { ok: false, msg: 'ERROR: null value in column "id" of relation "students" violates not-null constraint', detail: '기본 키에는 NULL을 넣을 수 없습니다.' };
  if (!d.name.trim()) return { ok: false, msg: 'ERROR: null value in column "name" of relation "students" violates not-null constraint' };
  if (year === null || Number.isNaN(year) || year < 1 || year > 6) return { ok: false, msg: 'ERROR: new row for relation "students" violates check constraint "students_year_check"', detail: 'CHECK (year BETWEEN 1 AND 6)을 어깁니다.' };
  if (gpa !== null && (gpa < 0 || gpa > 4.5)) return { ok: false, msg: 'ERROR: new row for relation "students" violates check constraint "students_gpa_check"', detail: 'CHECK (gpa BETWEEN 0 AND 4.5)를 어깁니다.' };
  if (rows.some((r) => r.id === id)) return { ok: false, msg: 'ERROR: duplicate key value violates unique constraint "students_pkey"', detail: `DETAIL: Key (id)=(${id}) already exists.` };
  return { ok: true, row: { id, name: d.name.trim(), dept: d.dept, year, gpa } };
}

const draftSql = (d: Draft) => {
  const lit = (s: string, num: boolean) => (s.trim() === '' ? 'NULL' : num && /^-?[\d.]+$/.test(s.trim()) ? s.trim() : `'${s}'`);
  return `INSERT INTO students (id, name, dept, year, gpa)\nVALUES (${lit(d.id, true)}, ${lit(d.name, false)}, ${lit(d.dept, false)}, ${lit(d.year, true)}, ${lit(d.gpa, true)});`;
};

function InsertFigure() {
  const [rows, setRows] = useState<Row[]>(STUDENTS);
  const [d, setD] = useState<Draft>(DRAFTS[1].d);
  const [res, setRes] = useState<Outcome | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  const run = () => {
    const r = tryInsert(rows, d);
    setRes(r);
    if (r.ok) {
      setRows([...rows, r.row]);
      setFresh(rows.length);
    } else setFresh(null);
  };
  const reset = () => {
    setRows(STUDENTS);
    setRes(null);
    setFresh(null);
  };
  const dupId = res && !res.ok && res.msg.includes('duplicate') ? Number(d.id) : null;

  return (
    <Figure
      no={1}
      title="표와 제약 조건: 데이터베이스가 거절하는 행"
      hint="예시를 고르거나 칸을 고쳐 INSERT를 실행해 보세요"
      caption={<>students 표는 열 다섯 개로 이루어지고, 행 하나가 학생 한 명입니다. 밑줄 친 id가 기본 키입니다. 표를 만들 때 적어 둔 제약 조건(아래 코드)에 어긋나는 행은 데이터베이스가 받지 않습니다. 평점 칸을 비우면 NULL, 곧 "값을 모름"이 들어갑니다. 실제 PostgreSQL이 내는 오류 문구를 그대로 옮겼습니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <DbTable
            title={
              <>
                <span className="mono">students</span> · 열 {ALL_COLS.length}개 · 행 {rows.length}개
              </>
            }
            ariaLabel={`students 표, 행 ${rows.length}개`}
            cols={ALL_COLS}
            labels={LABELS}
            pk={['id']}
            rows={rows}
            rowState={(i) => (i === fresh ? 'new' : dupId !== null && rows[i].id === dupId ? 'hl' : undefined)}
            compact
          />
        </div>
        <div className="controls">
          <Seg label="예시" value={DRAFTS.find((x) => JSON.stringify(x.d) === JSON.stringify(d))?.value ?? ''} onChange={(v) => setD(DRAFTS.find((x) => x.value === v)!.d)} options={DRAFTS.map((x) => ({ value: x.value, label: x.label }))} />
          <div className="db-form">
            <label>
              <span>id</span>
              <input className="text-input mono" value={d.id} onChange={set('id')} inputMode="numeric" spellCheck={false} />
            </label>
            <label>
              <span>name</span>
              <input className="text-input" value={d.name} onChange={set('name')} spellCheck={false} />
            </label>
            <label>
              <span>dept</span>
              <select className="select" value={d.dept} onChange={set('dept')}>
                {DEPTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              <span>year</span>
              <input className="text-input mono" value={d.year} onChange={set('year')} inputMode="numeric" spellCheck={false} />
            </label>
            <label>
              <span>gpa</span>
              <input className="text-input mono" value={d.gpa} onChange={set('gpa')} inputMode="decimal" placeholder="NULL" spellCheck={false} />
            </label>
          </div>
          <div className="btn-row">
            <Button small primary onClick={run}>
              INSERT 실행
            </Button>
            <Button small onClick={reset}>
              표 되돌리기
            </Button>
          </div>
        </div>
      </div>
      <SqlBox sql={draftSql(d)} label="실행할 INSERT 문" />
      {res ? (
        res.ok ? (
          <DbMsg kind="ok">
            <span className="mono">INSERT 0 1</span> · 새 행이 표 끝에 들어갔습니다.
          </DbMsg>
        ) : (
          <DbMsg kind="err">
            <span className="mono">{res.msg}</span>
            {res.detail && (
              <>
                <br />
                {res.detail.startsWith('DETAIL') ? <span className="mono">{res.detail}</span> : res.detail}
              </>
            )}
          </DbMsg>
        )
      ) : (
        <DbMsg kind="info">아직 실행하지 않았습니다.</DbMsg>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: a query builder that shows every logical step ─────────────── */

const COND_VALUES: Record<string, Value[]> = {
  id: [2022000, 2023000],
  name: ['김민준', '이서연'],
  dept: DEPTS,
  year: [1, 2, 3, 4],
  gpa: [2.5, 3.0, 3.5, 4.0],
};
const AGGS: { value: string; agg: Agg }[] = [
  { value: 'count', agg: { fn: 'COUNT(*)', col: '*' } },
  { value: 'avg', agg: { fn: 'AVG', col: 'gpa' } },
  { value: 'max', agg: { fn: 'MAX', col: 'gpa' } },
  { value: 'min', agg: { fn: 'MIN', col: 'gpa' } },
];

const BASE: Query = { table: 'students', cols: ['name', 'dept', 'gpa'], where: [], groupBy: null, agg: null, having: null, orderBy: null, limit: null };
const PRESETS: { value: string; label: string; q: Query }[] = [
  { value: 'cs', label: '컴공 학생', q: { ...BASE, cols: ['name', 'year', 'gpa'], where: [{ col: 'dept', op: '=', val: '컴퓨터공학' }] } },
  { value: 'top', label: '평점 상위 3명', q: { ...BASE, cols: ['name', 'dept', 'gpa'], orderBy: { col: 'gpa', desc: true }, limit: 3 } },
  { value: 'group', label: '학과별 평균', q: { ...BASE, where: [{ col: 'year', op: '>=', val: 2 }], groupBy: 'dept', agg: { fn: 'AVG', col: 'gpa' }, orderBy: { col: 'AVG(gpa)', desc: true } } },
  { value: 'null', label: 'NULL 함정', q: { ...BASE, cols: ['name', 'year', 'gpa'], where: [{ col: 'gpa', op: '<', val: 3.0 }] } },
];
const STAGE_NAME: Record<StageKey, string> = { from: 'FROM', where: 'WHERE', group: 'GROUP BY', having: 'HAVING', select: 'SELECT', order: 'ORDER BY', limit: 'LIMIT' };

function Sel<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="select" aria-label={label} value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CondRow({ c, onChange, onRemove, n }: { c: Cond; onChange: (c: Cond) => void; onRemove: () => void; n: number }) {
  const vals = COND_VALUES[c.col];
  return (
    <div className="qb-cond">
      <Sel label={`조건 ${n}의 열`} value={c.col} options={ALL_COLS.map((x) => ({ value: x, label: x }))} onChange={(col) => onChange({ col, op: c.op, val: COND_VALUES[col][0] })} />
      <Sel label={`조건 ${n}의 연산자`} value={c.op} options={(['=', '<>', '>', '>=', '<', '<='] as Op[]).map((x) => ({ value: x, label: x }))} onChange={(op) => onChange({ ...c, op })} />
      <Sel label={`조건 ${n}의 값`} value={String(c.val)} options={vals.map((v) => ({ value: String(v), label: typeof v === 'string' ? `'${v}'` : cellText(v, c.col) }))} onChange={(s) => onChange({ ...c, val: vals.find((v) => String(v) === s)! })} />
      <Button small onClick={onRemove} label={`조건 ${n} 지우기`} title="조건 지우기">
        ✕
      </Button>
    </div>
  );
}

function BuilderFigure() {
  const [q, setQ] = useState<Query>(PRESETS[2].q);
  const stages = useMemo(() => runStages(q, STUDENTS, ALL_COLS), [q]);
  const s = useStepper(stages.length, 1, sqlText(q), true);
  const st = stages[s.i];
  const grouped = !!(q.groupBy && q.agg);
  const outCols = grouped ? [q.groupBy!, aggName(q.agg!)] : q.cols.length ? q.cols : ALL_COLS;
  const orderOpts = grouped ? outCols : ALL_COLS;
  const preset = PRESETS.find((p) => sqlText(p.q) === sqlText(q))?.value ?? '';
  const final = stages[stages.length - 1];
  const resultRows = final.cut !== undefined ? final.rows.slice(0, final.cut) : final.key === 'where' ? final.rows.filter((_, i) => final.marks![i] === 'keep') : final.rows;

  const toggleCol = (c: string) => {
    const has = q.cols.includes(c);
    const cols = has ? q.cols.filter((x) => x !== c) : ALL_COLS.filter((x) => x === c || q.cols.includes(x));
    setQ({ ...q, cols });
  };
  const setGroup = (g: string) => {
    if (g === '') setQ({ ...q, groupBy: null, agg: null, having: null, orderBy: q.orderBy && ALL_COLS.includes(q.orderBy.col) ? q.orderBy : null });
    else setQ({ ...q, groupBy: g, agg: q.agg ?? AGGS[0].agg, orderBy: null });
  };
  const aggKey = AGGS.find((a) => q.agg && a.agg.fn === q.agg.fn)?.value ?? 'count';
  const stageLine = (line: string) => line.startsWith(STAGE_NAME[st.key]) || (st.key === 'group' && line.startsWith('GROUP')) || (st.key === 'order' && line.startsWith('ORDER'));

  return (
    <Figure
      no={2}
      title="쿼리 만들기: 쓰는 순서와 실행 순서"
      hint="절을 고치고, 단계마다 표가 어떻게 바뀌는지 따라가 보세요"
      caption={<>위쪽에서 SELECT 문을 조립하면 오른쪽에 SQL이 만들어집니다. 아래 표는 그 SQL을 실행하는 중간 결과입니다. 단계를 앞뒤로 옮기면 SQL의 어느 줄이 지금 일하고 있는지 노랗게 표시됩니다. 글로 쓸 때는 SELECT가 맨 앞이지만, 실행은 FROM에서 시작해 SELECT를 거의 끝에 합니다. WHERE 단계에서 흐리게 그은 줄은 조건이 거짓인 행, 노란 빗금은 NULL 때문에 '알 수 없음'이 된 행입니다.</>}
    >
      <Seg label="예시 쿼리" value={preset} onChange={(v) => setQ(PRESETS.find((p) => p.value === v)!.q)} options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
      <div className="qb">
        <div className="qb-form">
          <div className="qb-row">
            <span className="qb-kw">SELECT</span>
            {grouped ? (
              <span className="qb-note">
                <span className="mono">{q.groupBy}</span>,{' '}
                <Sel label="집계 함수" value={aggKey} options={AGGS.map((a) => ({ value: a.value, label: aggName(a.agg) }))} onChange={(v) => setQ({ ...q, agg: AGGS.find((a) => a.value === v)!.agg, orderBy: null })} />
              </span>
            ) : (
              <span className="qb-cols">
                {ALL_COLS.map((c) => (
                  <Check key={c} label={<span className="mono">{c}</span>} checked={q.cols.includes(c)} onChange={() => toggleCol(c)} />
                ))}
              </span>
            )}
          </div>
          <div className="qb-row">
            <span className="qb-kw">WHERE</span>
            <span className="qb-conds">
              {q.where.map((c, i) => (
                <CondRow key={i} n={i + 1} c={c} onChange={(nc) => setQ({ ...q, where: q.where.map((x, k) => (k === i ? nc : x)) })} onRemove={() => setQ({ ...q, where: q.where.filter((_, k) => k !== i) })} />
              ))}
              {q.where.length < 2 && (
                <Button small onClick={() => setQ({ ...q, where: [...q.where, { col: 'dept', op: '=', val: '경영' }] })}>
                  {q.where.length ? '+ AND 조건' : '+ 조건'}
                </Button>
              )}
            </span>
          </div>
          <div className="qb-row">
            <span className="qb-kw">GROUP BY</span>
            <Sel label="묶을 열" value={q.groupBy ?? ''} options={[{ value: '', label: '(없음)' }, { value: 'dept', label: 'dept' }, { value: 'year', label: 'year' }]} onChange={setGroup} />
          </div>
          <div className="qb-row">
            <span className="qb-kw">ORDER BY</span>
            <Sel label="정렬할 열" value={q.orderBy?.col ?? ''} options={[{ value: '', label: '(없음)' }, ...orderOpts.map((c) => ({ value: c, label: c }))]} onChange={(c) => setQ({ ...q, orderBy: c ? { col: c, desc: q.orderBy?.desc ?? false } : null })} />
            {q.orderBy && <Sel label="정렬 방향" value={q.orderBy.desc ? 'desc' : 'asc'} options={[{ value: 'asc', label: 'ASC (오름차순)' }, { value: 'desc', label: 'DESC (내림차순)' }]} onChange={(v) => setQ({ ...q, orderBy: { col: q.orderBy!.col, desc: v === 'desc' } })} />}
          </div>
          <div className="qb-row">
            <span className="qb-kw">LIMIT</span>
            <Sel label="행 수 제한" value={q.limit ?? 0} options={[{ value: 0, label: '(없음)' }, { value: 3, label: '3' }, { value: 5, label: '5' }]} onChange={(v) => setQ({ ...q, limit: v ? v : null })} />
          </div>
        </div>
        <SqlBox sql={sqlText(q)} on={stageLine} label="만들어진 SQL" />
      </div>

      <div className="stage-strip" role="group" aria-label="실행 단계">
        {stages.map((x, i) => (
          <button key={x.key} type="button" aria-pressed={i === s.i} onClick={() => s.go(i)}>
            <span className="mono">{i + 1}</span> {STAGE_NAME[x.key]}
          </button>
        ))}
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="step-note" aria-live="polite">
            <strong className="mono">{st.clause}</strong> · {st.note}
          </div>
          <DbTable cols={st.cols} labels={LABELS} rows={st.rows} marks={st.marks} groups={st.groups} cut={st.cut} ariaLabel={`${STAGE_NAME[st.key]} 단계의 중간 결과`} compact />
        </div>
        <div className="controls">
          <StepControls s={s} id="qb-speed" maxSpeed={3} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="이 단계의 행" value={`${st.marks ? st.marks.filter((m) => m === 'keep').length : st.cut !== undefined ? Math.min(st.cut, st.rows.length) : st.rows.length}행`} />
            <Readout label="최종 결과" value={`${resultRows.length}행 × ${outCols.length}열`} />
          </div>
          <Legend
            items={[
              { color: 'var(--line-strong)', label: '조건이 거짓', shape: 'sq' },
              { color: 'var(--hl)', label: 'NULL → 알 수 없음', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: GROUP BY as buckets ─────────────── */

const G_AGGS: { value: string; agg: Agg }[] = [
  { value: 'count', agg: { fn: 'COUNT(*)', col: '*' } },
  { value: 'countg', agg: { fn: 'COUNT', col: 'gpa' } },
  { value: 'avg', agg: { fn: 'AVG', col: 'gpa' } },
  { value: 'max', agg: { fn: 'MAX', col: 'gpa' } },
];

function GroupFigure() {
  const [g, setG] = useState<'dept' | 'year'>('dept');
  const [ak, setAk] = useState('avg');
  const [useHaving, setUseHaving] = useState(true);
  const [th, setTh] = useState(3.3);
  const agg = G_AGGS.find((a) => a.value === ak)!.agg;
  const isCount = agg.fn === 'COUNT(*)' || agg.fn === 'COUNT';
  const thr = isCount ? Math.round(Math.min(Math.max(th, 1), 4)) : Math.min(Math.max(th, 2.5), 4.2);
  const keys = useMemo(() => [...new Set(STUDENTS.map((r) => r[g]))].sort(order), [g]);
  const groups = keys.map((k) => {
    const rows = STUDENTS.filter((r) => r[g] === k);
    const v = aggregate(rows, agg);
    const pass = !useHaving || (v !== null && Number(v) >= thr);
    return { k, rows, v, pass };
  });
  const an = aggName(agg);
  const sql = `SELECT ${g}, ${an}\nFROM students\nGROUP BY ${g}` + (useHaving ? `\nHAVING ${an} >= ${isCount ? thr : thr.toFixed(1)}` : '') + ';';

  return (
    <Figure
      no={3}
      title="GROUP BY: 묶고, 묶음마다 계산하고, 묶음을 거르기"
      hint="묶는 열과 집계 함수를 바꾸고 HAVING의 기준을 움직여 보세요"
      caption={<>학생 10명을 고른 열의 값에 따라 상자에 나눠 담았습니다. 상자 아래 숫자가 그 묶음의 집계 값이고, 결과 표에는 상자 하나가 한 행으로 나옵니다. HAVING을 넘지 못한 상자는 흐리게 표시했습니다. 정하준(평점 NULL)이 COUNT(*)에는 들어가고 COUNT(gpa)와 AVG(gpa)에서는 빠지는 것을 확인해 보세요.</>}
    >
      <div className="controls row">
        <Seg label="GROUP BY" value={g} onChange={setG} options={[{ value: 'dept', label: 'dept' }, { value: 'year', label: 'year' }]} />
        <Seg label="집계 함수" value={ak} onChange={setAk} options={G_AGGS.map((a) => ({ value: a.value, label: aggName(a.agg) }))} />
      </div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Check label="HAVING 쓰기" checked={useHaving} onChange={setUseHaving} />
        </div>
        {useHaving && (isCount ? <Slider id="gb-th-c" label={`HAVING ${an} ≥`} value={thr} min={1} max={4} step={1} onChange={setTh} /> : <Slider id="gb-th" label={`HAVING ${an} ≥`} value={thr} min={2.5} max={4.2} step={0.1} onChange={setTh} format={(v) => v.toFixed(1)} />)}
      </div>
      <div className="gb-buckets">
        {groups.map((x, gi) => (
          <div key={String(x.k)} className="gb-bucket" data-out={!x.pass || undefined} style={{ ['--g' as string]: GROUP_COLORS[gi % GROUP_COLORS.length] }}>
            <div className="gb-head">
              <span className="mono">{g}</span> = <strong>{cellText(x.k, g)}</strong>
            </div>
            <ul className="gb-rows">
              {x.rows.map((r) => (
                <li key={String(r.id)} data-null={(agg.col === 'gpa' && r.gpa === null) || undefined}>
                  <span>{r.name}</span>
                  <span className="mono">{cellText(r.gpa, 'gpa')}</span>
                </li>
              ))}
            </ul>
            <div className="gb-agg">
              <span className="mono">{an}</span>
              <strong className="mono">{cellText(x.v, an)}</strong>
            </div>
            {!x.pass && <div className="gb-drop">HAVING에서 빠짐</div>}
          </div>
        ))}
      </div>
      <div className="fig-cols">
        <SqlBox sql={sql} label="이 그림의 SQL" />
        <DbTable title="결과" cols={[g, an]} rows={groups.filter((x) => x.pass).map((x) => ({ [g]: x.k, [an]: x.v }))} compact />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RelationalSql() {
  return (
    <>
      <h2>데이터를 표에 담는다</h2>
      <p>
        쇼핑몰의 회원과 주문, 은행의 계좌와 거래 내역, 학교의 학생과 수강 신청. 이런 데이터는 대부분 <T en="relational database">관계형 데이터베이스</T>에 들어 있습니다. PostgreSQL, MySQL, Oracle, SQL Server가 서버에서, SQLite가 휴대폰 앱과 브라우저 안에서 쓰입니다. 겉모습은 달라도 생각하는 방식은 같습니다. 모든 데이터를 <T en="table">표</T>에 담습니다.
      </p>
      <p>
        표의 <T en="column">열</T>은 무엇을 적을지(학번, 이름, 학과), <T en="row">행</T>은 하나의 대상(학생 한 명)입니다. 열마다 이름과 <T en="data type">자료형</T>이 정해져 있어서, 학년 칸에 글자를 넣거나 학번 칸을 비워 두는 일을 데이터베이스가 막아 줍니다. 1970년 IBM의 에드거 코드(Edgar F. Codd)가 이 모델을 제안할 때 표를 <T en="relation">관계</T>라고 불렀기 때문에 "관계형"이라는 이름이 붙었습니다. 표끼리의 관계를 말하는 것이 아니라, 표 자체가 관계라는 수학 용어입니다.
      </p>
      <p>
        표에는 행의 순서가 없습니다. 같은 행이 두 번 있어서도 안 됩니다. 그래서 행 하나를 콕 집어 가리킬 열이 필요한데, 이것이 <T en="primary key">기본 키</T>입니다. 학생이라면 이름은 겹칠 수 있지만 학번은 겹치지 않으니 학번을 기본 키로 삼습니다. 기본 키는 중복될 수 없고 비어 있을 수 없습니다.
      </p>

      <h2>스키마와 제약 조건</h2>
      <p>
        표의 모양, 곧 열의 이름과 자료형과 규칙을 적은 것을 <T en="schema">스키마</T>라고 합니다. 스키마는 SQL의 <code>CREATE TABLE</code>로 정합니다. 규칙(<T en="constraint">제약 조건</T>)을 미리 적어 두면, 어떤 프로그램이 어떤 버그로 잘못된 값을 보내든 데이터베이스가 문 앞에서 거절합니다.
      </p>
      <Code label="students 표 만들기 (SQL)">{`
CREATE TABLE students (
  id    integer PRIMARY KEY,           -- 기본 키: 겹치지 않고 NULL도 안 됨
  name  text    NOT NULL,              -- 이름은 반드시 있어야 함
  dept  text    NOT NULL,
  year  integer CHECK (year BETWEEN 1 AND 6),
  gpa   numeric CHECK (gpa BETWEEN 0 AND 4.5)  -- 비워 두면 NULL
);

INSERT INTO students (id, name, dept, year, gpa)
VALUES (2021001, '김민준', '컴퓨터공학', 4, 3.8);`}</Code>
      <InsertFigure />
      <p>
        그림 1에서 "이미 있는 학번"을 넣으면 <code>duplicate key</code> 오류가 납니다. 기본 키에는 자동으로 유일성 검사용 인덱스가 붙어 있어서, 데이터베이스는 같은 학번이 있는지 순식간에 확인합니다. 학번을 비우면 NOT NULL, 학년을 7로 쓰면 CHECK에 걸립니다. 반대로 이름이 같은 학생은 얼마든지 넣을 수 있습니다. 이름은 키가 아니기 때문입니다.
      </p>
      <Callout kind="intuition">
        스프레드시트와 가장 다른 점이 여기 있습니다. 엑셀 표의 칸에는 아무거나 쓸 수 있지만, 데이터베이스의 표는 스키마라는 계약을 지키는 행만 받습니다. 프로그램 열 개가 같은 데이터베이스를 함께 써도 데이터가 망가지지 않는 이유입니다.
      </Callout>

      <h2>SQL: 어떻게가 아니라 무엇을</h2>
      <p>
        데이터를 꺼낼 때는 <T en="Structured Query Language">SQL</T>로 질문합니다. 가장 많이 쓰는 문장은 <code>SELECT</code>입니다. "어느 표에서(FROM) 어떤 행을(WHERE) 어떤 열만(SELECT) 어떤 순서로(ORDER BY) 몇 개까지(LIMIT)"를 적습니다.
      </p>
      <Code label="SELECT 문의 생김새 (SQL)">{`
SELECT name, gpa            -- 보여 줄 열
FROM students               -- 어느 표에서
WHERE dept = '컴퓨터공학'     -- 어떤 행만
ORDER BY gpa DESC           -- 평점이 높은 순으로
LIMIT 3;                    -- 앞에서 세 명만`}</Code>
      <p>
        SQL에는 반복문이 없습니다. 원하는 결과가 무엇인지만 말하고, 그 결과를 어떻게 구할지(표를 처음부터 훑을지, 인덱스를 쓸지, 무엇부터 할지)는 데이터베이스가 정합니다. 이런 언어를 <T en="declarative language">선언형 언어</T>라고 합니다. 같은 SQL이 데이터가 100행일 때와 1억 행일 때 전혀 다른 방법으로 실행되는데, 그 선택은 <a href={lessonHref('cs-databases', 'indexes')}>인덱스와 쿼리 계획</a>에서 봅니다.
      </p>

      <h2>쓰는 순서와 실행 순서</h2>
      <p>
        SELECT 문은 영어 문장처럼 SELECT로 시작하지만, 데이터베이스가 뜻을 풀 때는 다른 순서를 따릅니다. 먼저 FROM으로 표를 정하고, WHERE로 행을 거르고, GROUP BY로 묶고, HAVING으로 묶음을 거른 다음에야 SELECT로 열을 고르고, 마지막으로 ORDER BY로 줄 세우고 LIMIT으로 자릅니다. 이것을 <T en="logical query processing order">논리적 실행 순서</T>라고 합니다. 실제 실행 엔진은 결과만 같다면 순서를 섞거나 합칠 수 있지만, 쿼리의 뜻은 언제나 이 순서로 정해집니다.
      </p>
      <BuilderFigure />
      <p>
        "학과별 평균" 예시를 단계별로 넘겨 보세요. WHERE가 1학년 두 명을 먼저 빼고, GROUP BY가 남은 8명을 학과별로 묶고, SELECT가 묶음마다 평균을 하나씩 만듭니다. 이 순서를 알면 자주 만나는 오류도 이해됩니다. SELECT에서 붙인 별명(<code>AS</code>)을 WHERE에서 쓸 수 없는 것은 WHERE가 SELECT보다 먼저 실행되기 때문이고, ORDER BY에서는 쓸 수 있는 것은 ORDER BY가 SELECT 뒤에 실행되기 때문입니다.
      </p>
      <p>같은 순서를 JavaScript 배열로 흉내 내면 이렇습니다. 메서드를 부르는 순서가 곧 논리적 실행 순서입니다.</p>
      <Code label="같은 쿼리를 배열 메서드로">{`
// SELECT dept, AVG(gpa) FROM students WHERE year >= 2
// GROUP BY dept ORDER BY AVG(gpa) DESC
const groups = new Map();
students                                     // FROM
  .filter((s) => s.year >= 2)                // WHERE
  .forEach((s) => {                          // GROUP BY
    if (!groups.has(s.dept)) groups.set(s.dept, []);
    groups.get(s.dept).push(s);
  });
const result = [...groups].map(([dept, rows]) => {   // SELECT
  const gpas = rows.map((s) => s.gpa).filter((g) => g !== null); // AVG는 NULL을 건너뜀
  return { dept, avg: gpas.reduce((a, b) => a + b, 0) / gpas.length };
}).sort((a, b) => b.avg - a.avg);            // ORDER BY ... DESC`}</Code>

      <h2>NULL: 모르는 값</h2>
      <p>
        정하준은 이번 학기에 입학해서 아직 평점이 없습니다. 이럴 때 0을 넣으면 "평점이 0점"이라는 틀린 사실이 되므로, 값이 없다는 뜻의 <T en="NULL">NULL</T>을 넣습니다. NULL은 0도 빈 문자열도 아닌 "모름"입니다. 그래서 NULL과의 비교는 참도 거짓도 아닌 세 번째 값, <T en="unknown">알 수 없음</T>이 됩니다. 평점을 모르는 학생이 3.0보다 낮은지는 알 수 없으니까요.
      </p>
      <p>
        WHERE는 조건이 <strong>참인</strong> 행만 남기므로 '알 수 없음'인 행은 버립니다. 그림 2에서 "NULL 함정" 예시(<code>gpa &lt; 3.0</code>)를 고르면 정하준이 빠지고, 연산자를 <code>&gt;=</code>로 바꿔도 역시 빠집니다. 두 결과를 합쳐도 전체 10명이 되지 않습니다.
      </p>
      <Callout kind="warn">
        NULL인 행을 찾으려고 <code>WHERE gpa = NULL</code>이라고 쓰면 결과는 언제나 0행입니다. NULL = NULL조차 '알 수 없음'이기 때문입니다. NULL은 <code>WHERE gpa IS NULL</code>, NULL이 아닌 값은 <code>IS NOT NULL</code>로 찾습니다. 리포트의 숫자가 이상하게 맞지 않을 때 범인이 NULL인 경우가 아주 많습니다.
      </Callout>

      <h2>GROUP BY와 집계</h2>
      <p>
        "학과마다 학생이 몇 명이고 평균 평점은 얼마인가?" 같은 질문은 행 하나하나가 아니라 행의 묶음에 대한 질문입니다. <code>GROUP BY</code>는 지정한 열의 값이 같은 행끼리 묶고, <T en="aggregate function">집계 함수</T>는 묶음 하나를 값 하나로 줄입니다. <code>COUNT</code>, <code>SUM</code>, <code>AVG</code>, <code>MIN</code>, <code>MAX</code>가 기본입니다.
      </p>
      <GroupFigure />
      <p>
        묶은 뒤에는 묶음 하나가 결과의 한 행이 되므로, SELECT에는 묶은 열과 집계 값만 쓸 수 있습니다. <code>SELECT dept, name ... GROUP BY dept</code>가 오류인 것은 학과 하나에 이름이 여럿이라 어느 이름을 보여 줄지 정할 수 없기 때문입니다. 묶음을 거르고 싶을 때는 WHERE가 아니라 <code>HAVING</code>을 씁니다. WHERE는 묶기 전에 행을, HAVING은 묶은 뒤에 묶음을 거릅니다.
      </p>
      <Callout kind="note">
        집계 함수는 NULL을 건너뜁니다. 그래서 그림 3의 경영학과는 <code>COUNT(*)</code>가 3인데 <code>COUNT(gpa)</code>는 2이고, 평균도 두 사람으로 냅니다. NULL을 0점으로 쳐서 평균을 내고 싶다면 <code>AVG(COALESCE(gpa, 0))</code>처럼 직접 바꿔 줘야 합니다. 둘 중 무엇이 맞는지는 데이터베이스가 아니라 질문하는 사람이 정할 일입니다.
      </Callout>

      <Callout kind="key">
        관계형 데이터베이스는 데이터를 열(무엇을 적을지)과 행(대상 하나)으로 된 표에 담고, 기본 키로 행을 구별하며, 스키마의 제약 조건으로 잘못된 데이터를 막습니다. SQL은 원하는 결과만 말하는 선언형 언어이고, 그 뜻은 FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT 순서로 정해집니다. NULL은 "모름"이라서 비교하면 '알 수 없음'이 되고, WHERE와 집계 함수에서 조용히 빠집니다.
      </Callout>
      <Quiz
        q={
          <>
            학과별 평균 평점이 3.3 이상인 학과만 보려고 <code>SELECT dept, AVG(gpa) FROM students WHERE AVG(gpa) &gt;= 3.3 GROUP BY dept;</code>를 실행했더니 오류가 났다. 이유와 고친 방법으로 알맞은 것은?
          </>
        }
        options={[
          'AVG는 NULL이 있는 열에 쓸 수 없다. gpa의 NULL을 먼저 지운다',
          'WHERE는 GROUP BY보다 먼저 실행되어 아직 묶음도 평균도 없다. 조건을 GROUP BY 뒤의 HAVING AVG(gpa) >= 3.3으로 옮긴다',
          'SELECT에 AVG(gpa)가 있으므로 ORDER BY를 반드시 써야 한다',
          'GROUP BY는 WHERE 앞에 써야 한다. 두 줄의 순서를 바꾼다',
        ]}
        answer={1}
        explain={<>논리적 실행 순서에서 WHERE는 행 하나하나를 거르는 단계이고, 묶음과 집계 값은 GROUP BY 다음에야 생깁니다. 묶음에 대한 조건은 HAVING에 씁니다. 집계 함수는 NULL을 건너뛸 뿐 오류를 내지 않고, 절을 쓰는 순서는 SELECT … FROM … WHERE … GROUP BY … HAVING …으로 정해져 있습니다.</>}
      />
    </>
  );
}

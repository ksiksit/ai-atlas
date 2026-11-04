import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Callout, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { order, type Row } from './db';
import { DbMsg, DbTable, GROUP_COLORS, SqlBox, type CellState } from './DbTable';
import './db.css';

/* ─────────────── data: one wide enrolment table ─────────────── */

const W_COLS = ['student_id', 'name', 'dept', 'office', 'course_id', 'title', 'credits', 'grade'];
const LABELS: Record<string, string> = { student_id: '학번', name: '이름', dept: '학과', office: '학과 사무실', course_id: '과목', title: '과목명', credits: '학점', grade: '성적' };

const STU: Record<number, [string, string]> = { 2021001: ['김민준', '컴퓨터공학'], 2022014: ['이서연', '경영'], 2023007: ['박지호', '컴퓨터공학'], 2021033: ['최유나', '수학'] };
const OFFICE: Record<string, string> = { 컴퓨터공학: '공학관 301', 경영: '경영관 210', 수학: '이학관 115' };
const COURSE: Record<string, [string, number]> = { CS101: ['데이터베이스', 3], CS102: ['운영체제', 3], BA201: ['회계원리', 2], MA110: ['선형대수', 3] };
const ENROLL: [number, string, string][] = [
  [2021001, 'CS101', 'A'],
  [2021001, 'CS102', 'B+'],
  [2022014, 'CS101', 'A-'],
  [2022014, 'BA201', 'B'],
  [2023007, 'CS101', 'B+'],
  [2023007, 'BA201', 'B'],
  [2021033, 'MA110', 'A+'],
];

const wideRow = (sid: number, cid: string, grade: string): Row => ({ student_id: sid, name: STU[sid][0], dept: STU[sid][1], office: OFFICE[STU[sid][1]], course_id: cid, title: COURSE[cid][0], credits: COURSE[cid][1], grade });
const WIDE: Row[] = ENROLL.map(([s, c, g]) => wideRow(s, c, g));
const STUDENTS3: Row[] = Object.entries(STU).map(([id, [name, dept]]) => ({ student_id: Number(id), name, dept }));
const DEPTS3: Row[] = Object.entries(OFFICE).map(([dept, office]) => ({ dept, office }));
const COURSES3: Row[] = Object.entries(COURSE).map(([course_id, [title, credits]]) => ({ course_id, title, credits }));
const ENROLL3: Row[] = ENROLL.map(([student_id, course_id, grade]) => ({ student_id, course_id, grade }));

const distinct = (rows: Row[], cols: string[]) => new Set(rows.map((r) => cols.map((c) => String(r[c])).join('|'))).size;

/** Cells that repeat a fact already written in another row. */
function redundantCells(rows: Row[]): number {
  if (!rows.length) return 0;
  const has = (c: string) => c in rows[0];
  let n = 0;
  if (has('name')) n += (rows.length - distinct(rows, ['student_id'])) * (has('dept') ? 2 : 1);
  if (has('office')) n += rows.length - distinct(rows, ['dept']);
  if (has('title')) n += (rows.length - distinct(rows, ['course_id'])) * 2;
  return n;
}

/* ─────────────── Figure 1: anomalies ─────────────── */

type Design = 'wide' | 'split';
type Action = 'update' | 'insert' | 'delete';
interface DbState {
  wide: Row[];
  students: Row[];
  depts: Row[];
  courses: Row[];
  enroll: Row[];
  sql: string;
  msg: { kind: 'ok' | 'err' | 'info'; text: string } | null;
  /** cells to mark as just changed: `${table}:${row}:${col}` */
  touched: Set<string>;
  lost: string[];
}
const fresh = (): DbState => ({ wide: WIDE, students: STUDENTS3, depts: DEPTS3, courses: COURSES3, enroll: ENROLL3, sql: '', msg: null, touched: new Set(), lost: [] });

const NEW_OFFICE = '공학관 405';

function apply(st: DbState, design: Design, a: Action): DbState {
  const touched = new Set<string>();
  if (design === 'wide') {
    if (a === 'update') {
      const sql = `-- 김민준의 정보 화면에서 학과 사무실을 고쳤다\nUPDATE enrollments SET office = '${NEW_OFFICE}'\nWHERE student_id = 2021001;`;
      const wide = st.wide.map((r, i) => {
        if (r.student_id !== 2021001) return r;
        touched.add(`wide:${i}:office`);
        return { ...r, office: NEW_OFFICE };
      });
      return { ...st, wide, sql, touched, lost: [], msg: { kind: 'err', text: `UPDATE ${touched.size} · 오류는 없었지만, 컴퓨터공학과의 사무실이 이제 두 곳입니다. 박지호의 행에는 옛 주소가 남았습니다. 빠짐없이 고치려면 컴퓨터공학과 학생이 수강하는 행을 모두 찾아 고쳐야 합니다.` } };
    }
    if (a === 'insert') {
      const sql = `-- 아직 수강생이 없는 새 과목을 등록하려 한다\nINSERT INTO enrollments (course_id, title, credits)\nVALUES ('CS210', '알고리즘', 3);`;
      return { ...st, sql, touched, lost: [], msg: { kind: 'err', text: 'ERROR: null value in column "student_id" of relation "enrollments" violates not-null constraint · 기본 키가 (student_id, course_id)라서 학생 없이는 과목을 적을 곳이 없습니다.' } };
    }
    const sql = `-- 최유나가 선형대수 수강을 취소했다\nDELETE FROM enrollments\nWHERE student_id = 2021033 AND course_id = 'MA110';`;
    if (!st.wide.some((r) => r.student_id === 2021033 && r.course_id === 'MA110')) return { ...st, sql, touched, lost: [], msg: { kind: 'info', text: 'DELETE 0 · 이미 지운 행입니다.' } };
    return {
      ...st,
      wide: st.wide.filter((r) => !(r.student_id === 2021033 && r.course_id === 'MA110')),
      sql,
      touched,
      lost: ['학생 최유나(2021033, 수학)', '수학과 사무실은 이학관 115', '과목 MA110 선형대수(3학점)'],
      msg: { kind: 'err', text: 'DELETE 1 · 수강 기록 하나를 지웠을 뿐인데, 그 행에만 적혀 있던 사실 세 가지가 함께 사라졌습니다.' },
    };
  }
  if (a === 'update') {
    const sql = `UPDATE depts SET office = '${NEW_OFFICE}'\nWHERE dept = '컴퓨터공학';`;
    const depts = st.depts.map((r, i) => {
      if (r.dept !== '컴퓨터공학') return r;
      touched.add(`depts:${i}:office`);
      return { ...r, office: NEW_OFFICE };
    });
    return { ...st, depts, sql, touched, lost: [], msg: { kind: 'ok', text: 'UPDATE 1 · 사무실은 depts 표의 한 칸에만 적혀 있으므로, 한 행만 고치면 컴퓨터공학과 학생 모두에게 반영됩니다.' } };
  }
  if (a === 'insert') {
    const sql = `INSERT INTO courses (course_id, title, credits)\nVALUES ('CS210', '알고리즘', 3);`;
    if (st.courses.some((r) => r.course_id === 'CS210')) return { ...st, sql, touched, lost: [], msg: { kind: 'err', text: 'ERROR: duplicate key value violates unique constraint "courses_pkey" · 이미 넣었습니다.' } };
    const courses = [...st.courses, { course_id: 'CS210', title: '알고리즘', credits: 3 }];
    ['course_id', 'title', 'credits'].forEach((c) => touched.add(`courses:${courses.length - 1}:${c}`));
    return { ...st, courses, sql, touched, lost: [], msg: { kind: 'ok', text: 'INSERT 0 1 · 과목은 과목 표에 따로 있으니 수강생이 없어도 등록할 수 있습니다.' } };
  }
  const sql = `DELETE FROM enrollments\nWHERE student_id = 2021033 AND course_id = 'MA110';`;
  if (!st.enroll.some((r) => r.student_id === 2021033 && r.course_id === 'MA110')) return { ...st, sql, touched, lost: [], msg: { kind: 'info', text: 'DELETE 0 · 이미 지운 행입니다.' } };
  return { ...st, enroll: st.enroll.filter((r) => !(r.student_id === 2021033 && r.course_id === 'MA110')), sql, touched, lost: [], msg: { kind: 'ok', text: 'DELETE 1 · 수강 기록만 사라지고, 최유나와 수학과와 선형대수는 각자의 표에 그대로 있습니다.' } };
}

function AnomalyFigure() {
  const [design, setDesign] = useState<Design>('wide');
  const [st, setSt] = useState<Record<Design, DbState>>({ wide: fresh(), split: fresh() });
  const cur = st[design];
  const act = (a: Action) => setSt({ ...st, [design]: apply(cur, design, a) });
  const reset = () => setSt({ ...st, [design]: fresh() });

  // conflicting facts in the wide table: one department, two offices
  const officeOf = new Map<string, Set<string>>();
  cur.wide.forEach((r) => {
    const k = String(r.dept);
    if (!officeOf.has(k)) officeOf.set(k, new Set());
    officeOf.get(k)!.add(String(r.office));
  });
  const conflictDepts = [...officeOf].filter(([, s]) => s.size > 1).map(([d]) => d);
  const cell = (t: string) => (i: number, c: string): CellState => {
    if (cur.touched.has(`${t}:${i}:${c}`)) return 'new';
    if (t === 'wide' && c === 'office' && conflictDepts.includes(String(cur.wide[i].dept))) return 'bad';
    return undefined;
  };
  const redundant = design === 'wide' ? redundantCells(cur.wide) : 0;
  const cells = design === 'wide' ? cur.wide.length * W_COLS.length : cur.students.length * 3 + cur.depts.length * 2 + cur.courses.length * 3 + cur.enroll.length * 3;

  return (
    <Figure
      no={1}
      title="이상 현상: 한 표에 모두 담았을 때"
      hint="설계를 고르고 세 가지 작업을 실행해 보세요"
      caption={<>같은 데이터를 한 표(enrollments)에 담은 설계와, 사실마다 표를 나눈 설계에 똑같은 작업 세 가지를 해 봅니다. 초록 칸은 방금 바뀐 칸, 빨간 칸은 서로 어긋난 사실입니다. "중복 칸"은 다른 행에 이미 적힌 사실을 또 적은 칸의 수입니다. 각 설계의 상태는 따로 기억되니 둘을 오가며 비교해 보세요.</>}
    >
      <div className="controls row">
        <Seg
          label="설계"
          value={design}
          onChange={setDesign}
          options={[
            { value: 'wide', label: '한 표' },
            { value: 'split', label: '네 표로 나눔' },
          ]}
        />
        <div className="ctl" style={{ flex: '2 1 320px' }}>
          <span className="ctl-label">
            <span>작업</span>
          </span>
          <div className="btn-row">
            <Button small onClick={() => act('update')}>
              수정: 컴공과 사무실 이전
            </Button>
            <Button small onClick={() => act('insert')}>
              삽입: 새 과목 개설
            </Button>
            <Button small onClick={() => act('delete')}>
              삭제: 최유나 수강 취소
            </Button>
            <Button small onClick={reset}>
              되돌리기
            </Button>
          </div>
        </div>
      </div>
      {design === 'wide' ? (
        <DbTable title={<><span className="mono">enrollments</span> · 기본 키 (student_id, course_id)</>} ariaLabel="한 표로 된 수강 신청 표" cols={W_COLS} labels={LABELS} pk={['student_id', 'course_id']} rows={cur.wide} cellState={cell('wide')} compact />
      ) : (
        <div className="nf-tables">
          <DbTable title={<span className="mono">students</span>} cols={['student_id', 'name', 'dept']} labels={LABELS} pk={['student_id']} rows={cur.students} cellState={cell('students')} compact />
          <DbTable title={<span className="mono">depts</span>} cols={['dept', 'office']} labels={LABELS} pk={['dept']} rows={cur.depts} cellState={cell('depts')} compact />
          <DbTable title={<span className="mono">courses</span>} cols={['course_id', 'title', 'credits']} labels={LABELS} pk={['course_id']} rows={cur.courses} cellState={cell('courses')} compact />
          <DbTable title={<span className="mono">enrollments</span>} cols={['student_id', 'course_id', 'grade']} labels={LABELS} pk={['student_id', 'course_id']} rows={cur.enroll} cellState={cell('enroll')} compact />
        </div>
      )}
      {cur.sql && <SqlBox sql={cur.sql} label="실행한 SQL" />}
      {cur.msg ? (
        <DbMsg kind={cur.msg.kind}>
          {cur.msg.text}
          {cur.lost.length > 0 && (
            <>
              <br />
              사라진 사실: <strong>{cur.lost.join(' · ')}</strong>
            </>
          )}
        </DbMsg>
      ) : (
        <DbMsg kind="info">위의 작업 버튼을 눌러 보세요.</DbMsg>
      )}
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="저장한 칸" value={`${cells}칸`} />
        <Readout label="중복 칸" value={`${redundant}칸`} color={redundant ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="어긋난 사실" value={conflictDepts.length && design === 'wide' ? `${conflictDepts.length}곳` : '없음'} color={conflictDepts.length && design === 'wide' ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: dependencies and normal forms ─────────────── */

interface Tbl {
  name: string;
  cols: string[];
  pk: string[];
  rows: Row[];
}
interface Fd {
  id: string;
  from: string[];
  to: string[];
}
const FDS: Fd[] = [
  { id: 'sc', from: ['student_id', 'course_id'], to: ['grade'] },
  { id: 's', from: ['student_id'], to: ['name', 'dept'] },
  { id: 'd', from: ['dept'], to: ['office'] },
  { id: 'c', from: ['course_id'], to: ['title', 'credits'] },
];

const UNF: Tbl = {
  name: 'students_courses',
  cols: ['student_id', 'name', 'dept', 'office', 'courses'],
  pk: ['student_id'],
  rows: Object.entries(STU).map(([id, [name, dept]]) => ({
    student_id: Number(id),
    name,
    dept,
    office: OFFICE[dept],
    courses: ENROLL.filter((e) => e[0] === Number(id))
      .map((e) => `${e[1]} ${COURSE[e[1]][0]} ${e[2]}`)
      .join(', '),
  })),
};
const project = (rows: Row[], cols: string[]): Row[] => {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = cols.map((c) => String(r[c])).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(Object.fromEntries(cols.map((c) => [c, r[c]])));
  }
  return out;
};
const tbl = (name: string, cols: string[], pk: string[]): Tbl => ({ name, cols, pk, rows: project(WIDE, cols) });
const STAGES: { key: string; label: string; tables: Tbl[]; note: string }[] = [
  { key: '0', label: '정규화 전', tables: [UNF], note: '학생 한 명이 한 행이고, 수강한 과목은 courses 칸에 쉼표로 이어 적었습니다. "CS101을 듣는 학생"을 찾으려면 문자열을 잘라 봐야 하고, 성적 하나를 고치려면 긴 문자열을 다시 써야 합니다.' },
  { key: '1', label: '1NF', tables: [tbl('enrollments', W_COLS, ['student_id', 'course_id'])], note: '칸마다 값을 하나만 두도록 수강 한 건을 한 행으로 펼쳤습니다(제1정규형). 이제 행을 구별하려면 (student_id, course_id) 두 열이 함께 키가 됩니다. 대신 학생과 과목의 정보가 수강 건수만큼 되풀이됩니다.' },
  {
    key: '2',
    label: '2NF',
    tables: [tbl('students', ['student_id', 'name', 'dept', 'office'], ['student_id']), tbl('courses', ['course_id', 'title', 'credits'], ['course_id']), tbl('enrollments', ['student_id', 'course_id', 'grade'], ['student_id', 'course_id'])],
    note: '키의 일부(student_id만, course_id만)에 따라 정해지는 열을 떼어 냈습니다(제2정규형). 이름은 학생 표에, 과목명은 과목 표에 한 번씩만 적힙니다. 하지만 학생 표의 office는 아직 학과마다 되풀이됩니다.',
  },
  {
    key: '3',
    label: '3NF',
    tables: [tbl('students', ['student_id', 'name', 'dept'], ['student_id']), tbl('depts', ['dept', 'office'], ['dept']), tbl('courses', ['course_id', 'title', 'credits'], ['course_id']), tbl('enrollments', ['student_id', 'course_id', 'grade'], ['student_id', 'course_id'])],
    note: '키가 아닌 열(dept)을 거쳐 정해지는 office를 학과 표로 옮겼습니다(제3정규형). 이제 모든 표에서 키가 아닌 열은 오직 그 표의 키 전체에만 의존합니다. 중복 칸이 0이 되었습니다.',
  },
];

function fdStatus(fd: Fd, tables: Tbl[], stage: number): { table: number; tag: string; bad: boolean } {
  const t = tables.findIndex((tb) => [...fd.from, ...fd.to].every((c) => tb.cols.includes(c)));
  if (stage === 0) {
    if (fd.id === 's' || fd.id === 'd') return { table: 0, tag: fd.id === 'd' ? '이행 종속' : '키에 종속', bad: fd.id === 'd' };
    return { table: -1, tag: '목록 칸 안에 숨어 있음', bad: true };
  }
  const tb = tables[t];
  const isKey = fd.from.length === tb.pk.length && fd.from.every((c) => tb.pk.includes(c));
  if (isKey) return { table: t, tag: '키 전체에 종속', bad: false };
  if (fd.from.every((c) => tb.pk.includes(c))) return { table: t, tag: '부분 종속 · 2NF 위반', bad: true };
  return { table: t, tag: '이행 종속 · 3NF 위반', bad: true };
}

function NormalFormFigure() {
  const [i, setI] = useState(1);
  const stage = STAGES[i];
  const cells = stage.tables.reduce((s, t) => s + t.rows.length * t.cols.length, 0);
  const red = stage.tables.reduce((s, t) => s + redundantCells(t.rows), 0);

  return (
    <Figure
      no={2}
      title="함수 종속성을 따라 표 나누기"
      hint="단계를 하나씩 넘겨 보세요"
      caption={<>위쪽은 이 데이터의 함수 종속성 네 가지입니다. "A → B"는 A의 값이 정해지면 B의 값이 하나로 정해진다는 뜻입니다. 종속성마다 지금 어느 표에 들어 있는지를 표의 색으로, 그 표의 키와 어떤 관계인지를 꼬리표로 붙였습니다. 빨간 꼬리표가 남아 있으면 중복이 생길 수 있는 곳입니다. 밑줄 친 열이 각 표의 기본 키입니다.</>}
    >
      <div className="controls row">
        <Seg label="단계" value={i} onChange={setI} options={STAGES.map((s, k) => ({ value: k, label: s.label }))} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <div className="btn-row">
            <Button small onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} label="이전 단계">
              ◀ 이전
            </Button>
            <Button small primary onClick={() => setI(Math.min(STAGES.length - 1, i + 1))} disabled={i === STAGES.length - 1} label="다음 단계">
              다음 ▶
            </Button>
          </div>
        </div>
      </div>
      <ul className="fd-list">
        {FDS.map((fd) => {
          const stt = fdStatus(fd, stage.tables, i);
          const col = stt.table >= 0 ? GROUP_COLORS[stt.table] : 'var(--line-strong)';
          return (
            <li key={fd.id} className="fd" style={{ ['--g' as string]: col } as CSSProperties}>
              <span className="fd-arrow mono">
                {fd.from.join(', ')} <span aria-label="이면 정해짐">→</span> {fd.to.join(', ')}
              </span>
              <span className="fd-where">{stt.table >= 0 ? stage.tables[stt.table].name : '—'}</span>
              <span className="fd-tag" data-bad={stt.bad || undefined}>
                {stt.tag}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="step-note" aria-live="polite">
        {stage.note}
      </div>
      <div className="nf-tables">
        {stage.tables.map((t, k) => (
          <div key={t.name} className="nf-colored" style={{ ['--g' as string]: GROUP_COLORS[k] } as CSSProperties}>
            <DbTable title={<span className="mono">{t.name}</span>} cols={t.cols} labels={LABELS} pk={t.pk} rows={t.rows} compact />
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="표" value={`${stage.tables.length}개`} />
        <Readout label="저장한 칸" value={`${cells}칸`} />
        <Readout label="중복 칸" value={i === 0 ? '—' : `${red}칸`} color={i === 0 ? undefined : red ? 'var(--bad)' : 'var(--good)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: joining the pieces back ─────────────── */

type Split = 'good' | 'bad';
const SPLITS: Record<Split, { a: string[]; b: string[]; on: string; note: string }> = {
  good: { a: ['student_id', 'name', 'dept'], b: ['student_id', 'course_id', 'title', 'grade'], on: 'student_id', note: '공통 열 student_id는 왼쪽 표의 키입니다. 오른쪽 행마다 짝이 정확히 하나라서, 조인하면 원래 행이 그대로 돌아옵니다.' },
  bad: { a: ['student_id', 'name', 'dept'], b: ['dept', 'course_id', 'title', 'grade'], on: 'dept', note: '공통 열 dept는 어느 쪽의 키도 아닙니다. 컴퓨터공학과 학생 둘과 컴퓨터공학과 수강 기록 넷이 서로 모두 짝지어져, 원래 없던 행이 생깁니다.' },
};

function LosslessFigure() {
  const [split, setSplit] = useState<Split>('bad');
  const sp = SPLITS[split];
  const A = useMemo(() => project(WIDE, sp.a), [sp]);
  const B = useMemo(() => project(WIDE, sp.b), [sp]);
  const outCols = ['student_id', 'name', 'dept', 'course_id', 'title', 'grade'];
  const joined = useMemo(() => {
    const out: Row[] = [];
    for (const a of A) for (const b of B) if (a[sp.on] === b[sp.on]) out.push(Object.fromEntries(outCols.map((c) => [c, a[c] ?? b[c]])));
    return out.sort((x, y) => order(x.student_id, y.student_id) || order(x.course_id, y.course_id));
  }, [A, B, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const orig = new Set(WIDE.map((r) => `${r.student_id}|${r.course_id}|${r.grade}`));
  const fake = joined.map((r) => !orig.has(`${r.student_id}|${r.course_id}|${r.grade}`));
  const nFake = fake.filter(Boolean).length;

  return (
    <Figure
      no={3}
      title="나눈 표를 다시 이으면 원래대로 돌아오나"
      hint="두 가지 나누는 법을 비교해 보세요"
      caption={<>그림 1의 수강 표(7행)에서 학생 정보와 수강 정보를 두 표로 나눈 뒤, 공통 열로 다시 조인했습니다. 빨간 행은 원래 표에 없던 가짜 행입니다. 행이 늘어났으니 정보가 늘어난 것 같지만, 어느 행이 진짜인지 알 수 없게 되었으므로 오히려 정보를 잃은 것입니다.</>}
    >
      <Seg
        label="나누는 법"
        value={split}
        onChange={setSplit}
        options={[
          { value: 'good', label: 'student_id로 잇기' },
          { value: 'bad', label: 'dept로 잇기' },
        ]}
      />
      <div className="nf-tables">
        <DbTable title={`왼쪽 (${A.length}행)`} cols={sp.a} labels={LABELS} pk={['student_id']} rows={A} compact />
        <DbTable title={`오른쪽 (${B.length}행)`} cols={sp.b} labels={LABELS} rows={B} compact />
      </div>
      <SqlBox sql={`SELECT ${outCols.map((c) => (c === sp.on ? 'l.' + c : c)).join(', ')}\nFROM left_part l JOIN right_part r ON l.${sp.on} = r.${sp.on};`} on={(l) => l.includes('JOIN')} />
      <div className="step-note">{sp.note}</div>
      <DbTable title={`조인 결과 (${joined.length}행)`} cols={outCols} labels={LABELS} rows={joined} rowState={(k) => (fake[k] ? 'hl' : undefined)} cellState={(k) => (fake[k] ? 'bad' : undefined)} compact />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="원래 행" value={`${WIDE.length}행`} />
        <Readout label="조인 결과" value={`${joined.length}행`} />
        <Readout label="가짜 행" value={nFake ? `${nFake}행 ✗` : '0행 ✓'} color={nFake ? 'var(--bad)' : 'var(--good)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Normalization() {
  return (
    <>
      <h2>한 표에 모두 담으면</h2>
      <p>
        수강 신청 데이터를 처음 정리할 때 가장 자연스러운 모양은 스프레드시트처럼 한 줄에 필요한 것을 다 적는 것입니다. 누가(학번, 이름, 학과, 학과 사무실) 무엇을(과목 코드, 과목명, 학점) 들어서 어떤 성적을 받았는지. 조인할 필요도 없고 한눈에 보입니다. 처음 몇 주는 아무 문제가 없습니다.
      </p>
      <p>
        문제는 데이터를 <strong>고칠 때</strong> 생깁니다. 이 표에는 "컴퓨터공학과의 사무실은 공학관 301이다"라는 사실이 컴퓨터공학과 학생의 수강 건수만큼 여러 번 적혀 있습니다. 같은 사실이 여러 곳에 있으면 고칠 때 모두 고쳐야 하고, 하나라도 놓치면 데이터가 스스로 모순됩니다. 이렇게 표의 구조 때문에 생기는 문제를 <T en="anomaly">이상 현상</T>이라고 하고, 세 가지가 있습니다.
      </p>
      <ul>
        <li>
          <T en="update anomaly">수정 이상</T>: 한 사실을 고치려면 여러 행을 고쳐야 하고, 일부만 고치면 모순이 생깁니다.
        </li>
        <li>
          <T en="insertion anomaly">삽입 이상</T>: 다른 사실 없이는 어떤 사실을 넣을 수 없습니다. 수강생이 없는 과목은 적을 곳이 없습니다.
        </li>
        <li>
          <T en="deletion anomaly">삭제 이상</T>: 한 사실을 지우면 같은 행에 있던 다른 사실까지 사라집니다.
        </li>
      </ul>
      <AnomalyFigure />
      <p>
        "한 표"에서 수정 작업을 누르면 SQL은 오류 없이 성공합니다. 데이터베이스가 보기에는 정상적인 UPDATE이기 때문입니다. 그런데 결과적으로 컴퓨터공학과의 사무실이 두 곳이 되었고, 어느 쪽이 맞는지는 표만 봐서는 알 수 없습니다. 삭제 작업은 더 조용히 위험합니다. 최유나의 유일한 수강 기록을 지웠더니 최유나라는 학생, 수학과 사무실, 선형대수 과목에 대한 기록이 한꺼번에 사라졌습니다. 같은 작업을 "네 표로 나눔"에서 해 보면 세 가지가 모두 아무 일 없이 끝납니다.
      </p>
      <Callout kind="intuition">
        나누는 기준은 하나입니다. <strong>사실 하나는 한곳에만 적는다.</strong> 학과의 사무실은 학과에 대한 사실이니 학과 표에, 과목명은 과목에 대한 사실이니 과목 표에 적고, 수강 표에는 수강에 대한 사실(누가 무엇을 들어서 몇 점)만 남깁니다. 나머지는 <a href={lessonHref('cs-databases', 'joins')}>조인</a>으로 필요할 때 이어 붙입니다.
      </Callout>

      <h2>함수 종속성</h2>
      <p>
        "사실 하나"를 정확히 말하는 도구가 <T en="functional dependency">함수 종속성</T>입니다. 열 A의 값이 같으면 열 B의 값도 언제나 같을 때, "A가 B를 결정한다"고 하고 <code>A → B</code>로 씁니다. 학번이 같으면 이름도 같으니 <code>student_id → name</code>입니다. 반대로 이름이 같다고 학번이 같지는 않으니 <code>name → student_id</code>는 성립하지 않습니다. 함수 종속성은 데이터를 보고 찾는 것이 아니라 업무 규칙에서 나옵니다. 지금 데이터에 동명이인이 없어도 앞으로 생길 수 있다면 이름은 학번을 결정하지 않습니다.
      </p>
      <p>이 수강 데이터의 규칙은 네 가지입니다.</p>
      <ul>
        <li>
          <code>student_id, course_id → grade</code>: 성적은 학생과 과목이 함께 정해야 정해집니다.
        </li>
        <li>
          <code>student_id → name, dept</code>: 학번이 정해지면 이름과 학과가 정해집니다.
        </li>
        <li>
          <code>dept → office</code>: 학과가 정해지면 사무실이 정해집니다.
        </li>
        <li>
          <code>course_id → title, credits</code>: 과목 코드가 정해지면 과목명과 학점이 정해집니다.
        </li>
      </ul>
      <p>
        표의 <T en="key">키</T>는 나머지 모든 열을 결정하는 가장 작은 열의 묶음입니다. 한 표의 키는 <code>(student_id, course_id)</code>입니다. 그런데 이름은 키 전체가 아니라 그 일부인 student_id만으로 정해지고, 사무실은 키가 아닌 dept를 거쳐 정해집니다. 키 말고 다른 것에 매달린 열, 바로 이것이 중복의 원인입니다.
      </p>

      <h2>1NF, 2NF, 3NF</h2>
      <p>
        <T en="normal form">정규형</T>은 표가 이런 문제를 얼마나 없앴는지를 단계로 나눈 것이고, 표를 그 단계에 맞게 나누는 일이 <T en="normalization">정규화</T>입니다. 1970년대 초 코드가 정리했습니다.
      </p>
      <ul>
        <li>
          <strong>제1정규형(1NF)</strong>: 칸마다 값이 하나입니다. 한 칸에 "CS101, CS102"처럼 목록을 넣지 않습니다.
        </li>
        <li>
          <strong>제2정규형(2NF)</strong>: 1NF이면서, 키가 아닌 열이 키의 <strong>일부</strong>에만 의존하지 않습니다(<T en="partial dependency">부분 종속</T> 없음).
        </li>
        <li>
          <strong>제3정규형(3NF)</strong>: 2NF이면서, 키가 아닌 열이 키가 아닌 <strong>다른 열을 거쳐</strong> 정해지지 않습니다(<T en="transitive dependency">이행 종속</T> 없음).
        </li>
      </ul>
      <NormalFormFigure />
      <p>
        세 단계를 한 문장으로 줄인 오래된 경구가 있습니다. 키가 아닌 열은 "키에, 키 전체에, 그리고 키에만" 의존해야 한다(the key, the whole key, and nothing but the key). 1NF가 키를 정할 수 있게 하고, 2NF가 "전체"를, 3NF가 "키에만"을 맡습니다. 그림 2의 마지막 단계에서 꼬리표가 모두 초록이 되고 중복 칸이 0이 되는 것을 확인해 보세요.
      </p>
      <Code label="제3정규형으로 나눈 스키마 (SQL)">{`
CREATE TABLE depts (
  dept    text PRIMARY KEY,
  office  text NOT NULL
);
CREATE TABLE students (
  student_id integer PRIMARY KEY,
  name       text NOT NULL,
  dept       text NOT NULL REFERENCES depts(dept)       -- 외래 키
);
CREATE TABLE courses (
  course_id text PRIMARY KEY,
  title     text NOT NULL,
  credits   integer NOT NULL
);
CREATE TABLE enrollments (
  student_id integer REFERENCES students(student_id),
  course_id  text    REFERENCES courses(course_id),
  grade      text,
  PRIMARY KEY (student_id, course_id)                    -- 수강 한 건
);`}</Code>
      <Callout kind="note">
        3NF 다음에도 BCNF(보이스-코드 정규형), 4NF, 5NF가 있습니다. BCNF는 "모든 결정자가 키여야 한다"로 3NF를 조금 더 엄격하게 한 것이고, 4NF와 5NF는 서로 무관한 목록 두 개를 한 표에 담을 때 생기는 드문 문제를 다룹니다. 실무에서는 3NF나 BCNF까지 나누면 충분한 경우가 대부분입니다.
      </Callout>

      <h2>나눈 표는 손실 없이 다시 이어져야 한다</h2>
      <p>
        표를 나눌 때는 하나를 꼭 확인해야 합니다. 나눈 조각을 조인하면 원래 표가 정확히 돌아와야 합니다. 이것을 <T en="lossless join decomposition">무손실 분해</T>라고 합니다. 아무 열이나 기준으로 나누면 안 됩니다.
      </p>
      <LosslessFigure />
      <p>
        dept로 이으면 김민준이 박지호의 회계원리 수강 기록과 짝지어지는 식으로 가짜 행 네 개가 생깁니다. 규칙은 간단합니다. <strong>두 조각의 공통 열이 적어도 한쪽 조각의 키여야</strong> 무손실입니다. 함수 종속성을 따라 결정자를 키로 삼아 떼어 내면(그림 2처럼) 이 조건이 저절로 지켜집니다.
      </p>

      <h2>일부러 합쳐 두는 경우</h2>
      <p>
        정규화는 쓰기를 안전하게 하는 대신 읽을 때 조인을 요구합니다. 읽기가 압도적으로 많고 조인이 비싼 곳에서는 일부러 중복을 허용하기도 합니다. 이것을 <T en="denormalization">반정규화</T>라고 합니다. 게시글 표에 댓글 수를 적어 두는 것, 분석용 데이터 웨어하우스에서 넓은 표 하나로 펼쳐 두는 것, 문서형 데이터베이스에 주문과 상품 정보를 한 문서로 담는 것이 그렇습니다. 그 대가로 중복된 값을 함께 고치는 책임이 데이터베이스에서 애플리케이션으로 넘어옵니다.
      </p>
      <Callout kind="warn">
        모든 반복이 중복은 아닙니다. 주문 표에 주문 당시의 상품 가격을 적어 두는 것은 상품 표의 가격과 같은 값이어도 다른 사실입니다. 상품 가격이 내일 오르더라도 어제 주문의 결제 금액은 바뀌면 안 되기 때문입니다. 정규화를 하겠다고 이 값을 지우고 상품 표를 조인해 쓰면, 가격이 바뀌는 순간 지난 주문서가 모두 틀려집니다. "이 값은 무엇에 대한 사실인가"를 먼저 물어야 합니다.
      </Callout>

      <Callout kind="key">
        한 표에 여러 사실을 담으면 수정·삽입·삭제 이상이 생깁니다. 함수 종속성 A → B로 어떤 열이 무엇에 대한 사실인지 밝히고, 키가 아닌 열이 키에, 키 전체에, 키에만 의존하도록(1NF → 2NF → 3NF) 표를 나눕니다. 나눌 때는 공통 열이 한쪽의 키가 되게 해서 조인으로 원래 표가 정확히 돌아오게 합니다. 읽기 성능을 위해 일부러 합쳐 둘 수도 있지만, 그러면 일관성을 지키는 일은 애플리케이션의 몫이 됩니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>orders(order_id, customer_id, customer_email, product_id, quantity)</code> 표의 키는 <code>order_id</code>이고, 고객의 이메일은 고객마다 하나다. 이 표가 3NF가 아닌 이유와 고치는 방법은?
          </>
        }
        options={[
          'quantity가 숫자라서 1NF가 아니다. 문자열로 바꾼다',
          'customer_email이 키가 아닌 customer_id를 거쳐 정해지는 이행 종속이다. customers(customer_id, customer_email) 표로 떼어 낸다',
          '키가 열 하나라서 부분 종속이 있다. order_id와 product_id를 함께 키로 삼는다',
          'product_id가 다른 표를 가리키므로 3NF가 될 수 없다. product_id를 지운다',
        ]}
        answer={1}
        explain={<>order_id → customer_id → customer_email이므로 이메일은 주문이 아니라 고객에 대한 사실입니다. 지금 구조에서는 고객이 이메일을 바꾸면 그 고객의 주문 행을 모두 고쳐야 합니다(수정 이상). 키가 열 하나면 부분 종속은 생길 수 없고, 다른 표를 가리키는 외래 키는 정규화된 설계의 정상적인 모습입니다.</>}
      />
    </>
  );
}

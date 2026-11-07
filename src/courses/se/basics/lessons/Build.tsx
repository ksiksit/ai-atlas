import { useId, useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import {
  EDITED,
  SCENARIOS,
  TODO_GRAPH,
  at,
  build,
  builtAtTen,
  clockText,
  depths,
  hash,
  isTask,
  playDay,
  secsOf,
  staleOutputs,
  taskOf,
  totalCost,
  writeSource,
  type Reason,
  type Step,
} from './buildgraph';
import './basics.css';
import './build.css';

const G = TODO_GRAPH;
const TOTAL = totalCost(G);
const base = (p: string) => p.split('/').pop()!;
/** What a node is called in the figures: a source by its file name, a task by the file it writes. */
const nameOf = (id: string) => (isTask(G, id) ? taskOf(G, id).out : base(id));
const USED = new Set(G.tasks.flatMap((t) => t.inputs));

/* ─────────────── the build graph as SVG ─────────────── */

const BW = 132;
const BH = 26;
const PITCH = 36;
const COL = 166;
const TOP = 26;
const HEADS = ['소스', '컴파일 · 설치', '묶기 · 테스트', '압축', '배포 폴더'];

type NodeState = 'edited' | 'run' | 'skip' | 'idle';

function layout() {
  const d = depths(G);
  const y = new Map<string, number>();
  G.sources.forEach((s, i) => y.set(s, TOP + BH / 2 + i * PITCH));
  const cols = Math.max(...d.values());
  for (let c = 1; c <= cols; c++) {
    const ids = G.tasks.filter((t) => d.get(t.id) === c).map((t) => t.id);
    const want = ids.map((id) => ({ id, y: taskOf(G, id).inputs.reduce((a, i) => a + y.get(i)!, 0) / taskOf(G, id).inputs.length }));
    want.sort((a, b) => a.y - b.y);
    let last = -Infinity;
    for (const w of want) {
      const v = Math.max(w.y, last + PITCH);
      y.set(w.id, v);
      last = v;
    }
  }
  const x = new Map<string, number>();
  for (const [id, c] of d) x.set(id, c * COL);
  const W = cols * COL + BW;
  const H = Math.max(...y.values()) + BH / 2 + 4;
  return { x, y, W, H, cols };
}
const LAYOUT = layout();

function BuildGraph({ state, order, label, onSource }: { state: (id: string) => NodeState; order: Map<string, number>; label: string; onSource?: (path: string) => void }) {
  const uid = useId().replace(/:/g, '');
  const { x, y, W, H, cols } = LAYOUT;
  const hot = (id: string) => state(id) === 'edited' || state(id) === 'run';
  return (
    <svg className="bd-graph" viewBox={`-2 0 ${W + 4} ${H}`} role="img" aria-label={label}>
      <defs>
        {['n', 'h'].map((k) => (
          <marker key={k} id={`${uid}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className={'bd-head' + (k === 'h' ? ' hot' : '')} />
          </marker>
        ))}
      </defs>
      {HEADS.slice(0, cols + 1).map((h, c) => (
        <text key={h} className="bd-colhead" x={c * COL + BW / 2} y={12} textAnchor="middle">
          {h}
        </text>
      ))}
      {G.tasks.flatMap((t) =>
        t.inputs.map((i) => {
          const x1 = x.get(i)! + BW;
          const y1 = y.get(i)!;
          const x2 = x.get(t.id)! - 2;
          const y2 = y.get(t.id)!;
          const mx = x2 - 30;
          const h = hot(i) && state(t.id) === 'run';
          return <path key={i + '>' + t.id} className="bd-edge" data-hot={h || undefined} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} markerEnd={`url(#${uid}-${h ? 'h' : 'n'})`} />;
        }),
      )}
      {[...G.sources, ...G.tasks.map((t) => t.id)].map((id) => {
        const src = !isTask(G, id);
        const cx = x.get(id)!;
        const cy = y.get(id)!;
        const n = order.get(id);
        const click = src && onSource && USED.has(id);
        return (
          <g
            key={id}
            className="bd-node"
            data-s={state(id)}
            data-src={src || undefined}
            data-unused={(src && !USED.has(id)) || undefined}
            data-click={click || undefined}
            tabIndex={click ? 0 : undefined}
            role={click ? 'button' : undefined}
            aria-label={click ? `${base(id)} 고치기` : undefined}
            aria-pressed={click ? state(id) === 'edited' : undefined}
            onClick={click ? () => onSource!(id) : undefined}
            onKeyDown={click ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSource!(id)) : undefined}
          >
            <title>{src ? id : `${taskOf(G, id).cmd} (${taskOf(G, id).cost}초)`}</title>
            <rect x={cx} y={cy - BH / 2} width={BW} height={BH} rx={src ? 0 : 3} />
            <text x={cx + BW / 2} y={cy + 1} textAnchor="middle" dominantBaseline="middle">
              {nameOf(id)}
            </text>
            {n !== undefined && (
              <g className="bd-badge">
                <circle cx={cx} cy={cy - BH / 2} r={8} />
                <text x={cx} y={cy - BH / 2 + 0.5} textAnchor="middle" dominantBaseline="middle">
                  {n}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────── Figure 1: edit files, see what reruns ─────────────── */

const EDITABLE = G.sources;
const BUILT = builtAtTen();

function GraphFigure() {
  const [mode, setMode] = useState<'clean' | 'inc'>('inc');
  const [edited, setEdited] = useState<string[]>(['src/format.ts']);
  const toggle = (p: string) => {
    setMode('inc');
    setEdited((e) => (e.includes(p) ? e.filter((x) => x !== p) : [...e, p]));
  };

  const steps: Step[] = useMemo(() => {
    if (mode === 'clean') return build(G, { ...BUILT, files: Object.fromEntries(G.sources.map((p) => [p, BUILT.files[p]])), record: {} }, { mode: 'hash' }).steps;
    let s = at(BUILT, 11 * 60);
    for (const p of edited) s = writeSource(s, p, EDITED[p]);
    return build(G, s, { mode: 'hash' }).steps;
  }, [mode, edited]);

  const ran = steps.filter((s) => s.action === 'run');
  const order = new Map(ran.map((s, i) => [s.task, i + 1]));
  const state = (id: string): NodeState => (isTask(G, id) ? (order.has(id) ? 'run' : 'skip') : mode === 'inc' && edited.includes(id) ? 'edited' : 'idle');

  return (
    <Figure
      no={1}
      title="고친 파일에서 화살표를 따라가기"
      hint="소스 파일을 눌러 고쳐 보세요"
      caption={
        <>
          할 일 서비스 화면 쪽의 빌드 그래프입니다. 왼쪽 네모가 사람이 고치는 소스 파일이고, 둥근 네모는 작업이 만드는 파일입니다. 화살표는 "이 파일을 읽어서 저 파일을 만든다"는 뜻입니다. 번호는 이번 빌드에서 작업이 실제로 실행된 순서(위상 순서)이고, 번호가 없는 작업은 지난번 결과를 그대로 썼습니다. 마우스를 올리면 작업의 명령과 걸리는 시간이 보입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="controls row">
          <Seg
            label="빌드 종류"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'clean', label: '처음부터 빌드' },
              { value: 'inc', label: '고친 뒤 증분 빌드' },
            ]}
          />
        </div>
        <div className="se-chips" role="group" aria-label="고칠 파일">
          {EDITABLE.map((p) => (
            <button key={p} type="button" className="se-chip" data-on={(mode === 'inc' && edited.includes(p)) || undefined} aria-pressed={mode === 'inc' && edited.includes(p)} onClick={() => toggle(p)}>
              {base(p)} 고치기
            </button>
          ))}
        </div>
        <div className="bd-scroll">
          <BuildGraph state={state} order={order} onSource={toggle} label={`빌드 그래프. 실행한 작업: ${ran.map((s) => nameOf(s.task)).join(', ') || '없음'}`} />
        </div>
        <Legend
          items={[
            { color: 'var(--c-se-3)', label: '고친 소스', shape: 'sq' },
            { color: 'var(--accent)', label: '다시 실행한 작업', shape: 'sq' },
            { color: 'var(--line-strong)', label: '지난 결과를 그대로 쓴 작업', shape: 'sq' },
          ]}
        />
        <div className="controls row">
          <Readout label="실행한 작업" value={`${ran.length} / ${G.tasks.length}개`} />
          <Readout label="걸린 시간" value={`${secsOf(steps)}초 (전체 ${TOTAL}초)`} color={ran.length < G.tasks.length ? 'var(--good)' : undefined} />
          <Readout label="실행 순서" value={ran.length ? ran.map((s) => nameOf(s.task)).join(' → ') : '할 일 없음'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: modification time vs content hash ─────────────── */

const short = (h: string) => h.slice(0, 6);

function why(r: Reason): string {
  switch (r.kind) {
    case 'missing':
      return '결과 파일이 없음';
    case 'newer':
      return `${nameOf(r.input)} ${clockText(r.inTime)} > 결과 ${clockText(r.outTime)}`;
    case 'older':
      return `가장 새 입력 ${clockText(r.inTime)} ≤ 결과 ${clockText(r.outTime)}`;
    case 'changed':
      return `${nameOf(r.input)} 해시 ${short(r.before)}→${short(r.after)}`;
    case 'same':
      return '입력 해시 그대로';
    case 'hit':
      return `캐시 키 ${short(r.key)} 있음`;
    case 'miss':
      return `캐시 키 ${short(r.key)} 없음`;
  }
}

function CompareFigure() {
  const [sid, setSid] = useState('restore');
  const sc = SCENARIOS.find((s) => s.id === sid)!;
  const before = BUILT;
  const after = useMemo(() => sc.apply(BUILT), [sc]);
  const m = useMemo(() => build(G, after, { mode: 'mtime' }), [after]);
  const h = useMemo(() => build(G, after, { mode: 'hash' }), [after]);
  const staleM = staleOutputs(G, m.state);
  const staleH = staleOutputs(G, h.state);
  const count = (st: Step[]) => st.filter((x) => x.action === 'run').length;

  const cell = (st: Step, stale: boolean) => (
    <td className="bd-cell" data-stale={stale || undefined}>
      <span className="bd-act" data-a={st.action}>
        {st.action === 'run' ? '실행' : '건너뜀'}
      </span>
      <span className="bd-why">{why(st.reason)}</span>
      {stale && <span className="bd-stale">옛 내용이 남음</span>}
    </td>
  );
  const verdict = (stale: string[], n: number) =>
    stale.length ? <span className="bd-bad">틀림: {stale.map(nameOf).join(', ')}이(가) 소스와 다름</span> : <span className="bd-ok">맞음 · 작업 {n}개 실행</span>;

  return (
    <Figure
      no={2}
      title="수정 시각으로 볼까, 내용으로 볼까"
      hint="상황을 골라 두 방법을 비교해 보세요"
      caption={
        <>
          10:00에 전체 빌드를 한 번 해 둔 프로젝트에서 위의 일이 일어난 뒤 다시 빌드합니다. 가운데 칸은 make처럼 입력 파일과 결과 파일의 수정 시각을 비교하고, 오른쪽 칸은 지난번 빌드 때 적어 둔 입력 내용의 해시와 지금 해시를 비교합니다. 빨간 칸은 빌드가 끝났는데도 결과물이 지금 소스와 맞지 않는 곳입니다. 해시는 8자리 중 앞 6자리만 보입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="se-chips" role="group" aria-label="상황">
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" className="se-chip" data-on={s.id === sid || undefined} aria-pressed={s.id === sid} onClick={() => setSid(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="bd-changes" aria-live="polite">
          {sc.paths.map((p) => {
            const a = before.files[p];
            const b = after.files[p];
            return (
              <div key={p}>
                <b>{base(p)}</b> 수정 시각 <code>{clockText(a.mtime)}</code> → <code>{clockText(b.mtime)}</code>, 내용 해시 <code>{short(hash(a.content))}</code> → <code>{short(hash(b.content))}</code>
                {hash(a.content) === hash(b.content) ? ' (내용 같음)' : ' (내용 바뀜)'}
              </div>
            );
          })}
        </div>
        <div className="bd-scroll">
          <table className="bd-table">
            <thead>
              <tr>
                <th>작업 결과</th>
                <th>수정 시각 비교 (make)</th>
                <th>내용 해시 비교 (Gradle, Bazel)</th>
              </tr>
            </thead>
            <tbody>
              {m.steps.map((st, i) => (
                <tr key={st.task}>
                  <td>{nameOf(st.task)}</td>
                  {cell(st, staleM.includes(st.task))}
                  {cell(h.steps[i], staleH.includes(st.task))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>결과</td>
                <td>{verdict(staleM, count(m.steps))}</td>
                <td>{verdict(staleH, count(h.steps))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a day with a shared build cache ─────────────── */

const HEAD: Record<string, string> = { 'tsc-todo': 'todo', 'tsc-api': 'api', 'tsc-format': 'format', 'tsc-main': 'main', install: 'npm ci', css: 'css', bundle: '묶기', test: '테스트', minify: '압축', dist: 'dist' };

function CacheFigure() {
  const [useCache, setUseCache] = useState(true);
  const [declare, setDeclare] = useState(false);
  const day = useMemo(() => playDay(useCache, declare), [useCache, declare]);
  const without = useMemo(() => playDay(false, declare), [declare]);
  const sum = (d: typeof day) => d.reduce((a, e) => a + e.secs, 0);
  const hits = day.reduce((a, e) => a + e.steps.filter((s) => s.action === 'hit').length, 0);
  const wrong = day.reduce((a, e) => a + e.wrong.length, 0);

  return (
    <Figure
      no={3}
      title="빌드 캐시와 함께 보낸 하루"
      hint="캐시와 입력 선언을 켜고 꺼 보세요"
      caption={
        <>
          한 줄이 한 번의 빌드이고 위에서 아래로 시간이 흐릅니다. 칸은 작업마다 무슨 일이 있었는지입니다. <b>실행</b>은 실제로 돌린 것, <b>적중</b>은 캐시에서 결과를 내려받은 것, <b>–</b>는 그 컴퓨터에 이미 최신 결과가 있어 건너뛴 것입니다. 묶기 작업은 서버 주소를 환경 변수 API_URL에서 읽습니다. 빨간 테두리는 결과물이 그 빌드의 설정과 맞지 않는 칸입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="controls row">
          <Check label="여러 컴퓨터가 함께 쓰는 빌드 캐시 켜기" checked={useCache} onChange={setUseCache} />
          <Check label="묶기 작업이 API_URL을 입력으로 선언하기" checked={declare} onChange={setDeclare} />
        </div>
        <div className="bd-scroll">
          <div className="bd-day" role="table" aria-label="하루 동안의 빌드 기록">
            <div className="bd-day-h" role="columnheader">
              빌드
            </div>
            {G.tasks.map((t) => (
              <div key={t.id} className="bd-day-h" role="columnheader">
                {HEAD[t.id]}
              </div>
            ))}
            <div className="bd-day-h" role="columnheader">
              시간
            </div>
            {day.map((e, i) => (
              <div key={i} role="row" style={{ display: 'contents' }}>
                <div className="bd-day-ep" role="rowheader">
                  <span>
                    {i + 1}. {e.ep.who}
                  </span>
                  <small>{e.ep.what}</small>
                </div>
                {e.steps.map((s) => {
                  const bad = e.wrong.includes(s.task);
                  return (
                    <div key={s.task} className="bd-day-c" role="cell" data-a={s.action} data-wrong={bad || undefined} title={`${nameOf(s.task)}: ${why(s.reason)}${bad ? ' · 결과가 틀림' : ''}`}>
                      {s.action === 'run' ? '실행' : s.action === 'hit' ? '적중' : '–'}
                    </div>
                  );
                })}
                <div className="bd-day-t" role="cell">
                  {e.secs}초
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="controls row">
          <Readout label="하루 빌드 시간 합" value={`${sum(day)}초`} />
          <Readout label="캐시 없이" value={`${sum(without)}초`} />
          <Readout label="캐시 적중" value={`${hits}번`} />
          <Readout label="틀린 결과물" value={wrong ? `${wrong}개` : '없음'} color={wrong ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Build() {
  return (
    <>
      <h2>소스 파일에서 실행 파일까지</h2>
      <p>
        할 일 서비스의 화면 쪽 코드는 TypeScript 파일 네 개(todo.ts, api.ts, format.ts, main.ts)와 CSS 파일 하나, 그리고 <a href={lessonHref('se-basics', 'packages')}>앞 장</a>에서 설치한 datefmt 패키지로 되어 있습니다. 그런데 브라우저는 TypeScript를 바로 읽지 못합니다. 그래서 사용자에게 보내기 전에 몇 단계를 거칩니다.
      </p>
      <ul>
        <li>컴파일: .ts 파일마다 타입 표시를 지우고 브라우저가 읽는 .js 파일로 바꿉니다.</li>
        <li>묶기(bundle): 여러 .js 파일과 node_modules의 패키지를 파일 하나(app.js)로 합칩니다. 브라우저가 파일 수십 개를 따로 받지 않아도 됩니다.</li>
        <li>압축(minify): 공백과 긴 변수 이름을 줄여 내려받을 크기를 줄입니다.</li>
        <li>테스트: 컴파일된 코드로 테스트를 돌려 결과를 남깁니다.</li>
      </ul>
      <p>
        이렇게 소스 파일에서 내보낼 결과물을 만드는 과정 전체를 <T en="build">빌드</T>라고 하고, 그 과정을 자동으로 해 주는 프로그램을 빌드 도구라고 합니다. 가장 단순한 빌드는 명령을 순서대로 적은 스크립트입니다.
      </p>
      <Code label="package.json의 scripts (가장 단순한 빌드)">{`
{
  "scripts": {
    "build": "tsc && esbuild build/main.js --bundle --outfile=build/app.js && terser build/app.js -o dist/app.min.js"
  }
}`}</Code>
      <p>
        이 스크립트는 언제나 맞는 결과를 내지만, 언제나 처음부터 다시 합니다. 할 일 서비스에서는 전체 빌드에 {TOTAL}초가 걸린다고 합시다. 날짜 형식 한 글자를 고치고 결과를 보려고 1분을 기다리면, 하루에 수십 번 고치는 개발자에게는 큰 손해입니다. 프로젝트가 커지면 몇 분, 몇십 분이 됩니다.
      </p>

      <h2>빌드는 작업의 그래프다</h2>
      <p>
        빌드를 명령의 줄이 아니라 <T en="build graph">빌드 그래프</T>로 보면 길이 보입니다. 빌드는 여러 <T en="task">작업</T>으로 나뉘고, 작업마다 읽는 입력 파일과 쓰는 출력 파일이 정해져 있습니다. 묶기 작업은 컴파일 작업들이 쓴 .js 파일을 읽으므로 컴파일이 모두 끝난 뒤에만 시작할 수 있습니다. 이렇게 "A의 출력이 B의 입력"인 관계를 화살표로 이으면, 되돌아오는 화살표가 없는 방향 그래프(DAG)가 됩니다.
      </p>
      <p>
        작업을 실행할 순서는 화살표를 거스르지 않는 순서, 곧 <a href={lessonHref('cs-algorithm-design', 'topological-sort')}>위상 정렬</a>의 결과입니다. 들어오는 화살표가 없는 작업부터 하나씩 꺼내고, 꺼낸 작업에서 나가는 화살표를 지워 가면 됩니다. 화살표가 돌고 돌아 제자리로 오면(A가 B를 기다리고 B가 A를 기다리면) 순서가 없으므로 빌드 도구는 시작도 하지 않고 멈춥니다.
      </p>
      <p>
        그래프의 진짜 쓸모는 따로 있습니다. 파일 하나를 고쳤을 때 다시 해야 하는 작업은 <strong>그 파일에서 화살표를 따라 닿을 수 있는 작업뿐</strong>입니다. 나머지 작업의 입력은 하나도 바뀌지 않았으니, 지난번 출력을 그대로 써도 결과가 같습니다. 이렇게 바뀐 부분만 다시 만드는 것을 <T en="incremental build">증분 빌드</T>라고 합니다.
      </p>
      <GraphFigure />
      <p>
        format.ts를 고치면 format.js, 그것을 읽는 app.js와 테스트, 그 뒤의 압축과 배포 폴더까지 작업 다섯 개가 다시 돕니다. styles/app.css만 고치면 두 개, README.md는 아무 작업도 읽지 않으므로 0개입니다. package-lock.json을 고쳐 datefmt 버전을 올리면 다시 도는 작업은 다섯 개지만, 가장 오래 걸리는 설치가 끼어 있어 시간은 전체의 3분의 2가 넘게 걸립니다. "처음부터 빌드"를 고르면 번호가 위상 순서대로 1부터 {G.tasks.length}까지 붙는 것도 확인해 보세요.
      </p>
      <Callout kind="key">
        증분 빌드의 원리는 하나입니다. <strong>입력이 같으면 출력도 같다.</strong> 그래서 빌드 도구가 알아야 할 것은 두 가지뿐입니다. 작업마다 무엇을 읽고 무엇을 쓰는지(그래프), 그리고 지난번 빌드 뒤로 어떤 입력이 바뀌었는지(변경 감지).
      </Callout>
      <p>오래된 빌드 도구 make는 이 두 가지를 Makefile 한 장에 적습니다. 콜론 왼쪽이 출력, 오른쪽이 입력, 다음 줄이 출력을 만드는 명령입니다.</p>
      <Code label="Makefile">{`
dist/app.min.js: build/app.js
	npx terser build/app.js -o dist/app.min.js

build/app.js: build/main.js build/todo.js build/api.js build/format.js
	npx esbuild build/main.js --bundle --outfile=build/app.js

build/%.js: src/%.ts
	npx tsc $< --outDir build`}</Code>

      <h2>바뀌었는지 어떻게 아나</h2>
      <p>"입력이 바뀌었다"를 알아내는 방법은 크게 두 가지입니다.</p>
      <ul>
        <li>
          <T en="modification time">수정 시각</T> 비교: 파일마다 운영체제가 기록해 두는 마지막 수정 시각을 봅니다. 출력 파일이 입력 파일 가운데 가장 새것보다 오래됐으면 다시 만듭니다. make가 이렇게 합니다. 파일 내용을 읽지 않아도 되니 아주 빠릅니다.
        </li>
        <li>
          <T en="content hash">내용 해시</T> 비교: 작업을 실행할 때 입력 파일 내용의 해시를 적어 두고, 다음 빌드에서 지금 내용의 해시와 비교합니다. 해시는 내용이 한 글자만 달라도 완전히 달라지는 짧은 지문입니다(<a href={lessonHref('cs-algorithms', 'search-hash')}>탐색과 해시 테이블</a>). Gradle, Bazel, tsc의 --incremental이 이 방식을 씁니다.
        </li>
      </ul>
      <p>평소에는 두 방법이 같은 답을 냅니다. 갈리는 것은 "시각은 바뀌었는데 내용은 그대로"이거나 "내용은 바뀌었는데 시각은 그대로(또는 옛날)"인 경우입니다.</p>
      <CompareFigure />
      <p>
        "주석만 고치기"를 보면 두 방법 모두 format.js를 다시 컴파일합니다. 그런데 컴파일러가 주석을 지우므로 새 format.js는 예전과 한 글자도 다르지 않습니다. 해시 방식은 이것을 알아채고 거기서 멈춥니다. 수정 시각 방식은 format.js의 시각이 새로워졌다는 것만 보고 뒤의 작업을 모두 돌립니다. "touch"나 "브랜치를 바꿨다 돌아오기"도 마찬가지입니다. git은 브랜치를 바꿀 때 달라진 파일을 새로 쓰므로, 돌아와서 내용이 원래대로여도 수정 시각은 지금이 됩니다.
      </p>
      <p>
        여기까지는 수정 시각 방식이 조금 느릴 뿐입니다. 위험한 것은 "백업에서 옛 api.ts 되살리기"입니다. <code>cp -p</code>나 압축 풀기처럼 원래 수정 시각을 그대로 살려 복사하면, 내용은 바뀌었는데 시각은 이미 만든 api.js보다 옛날입니다. make는 아무것도 다시 만들지 않고 "다 최신"이라고 말하고, dist/에는 지금 소스와 다른 코드가 남습니다. 시계가 틀린 컴퓨터나 네트워크 드라이브에서도 같은 일이 생깁니다.
      </p>
      <Callout kind="warn">
        증분 빌드가 틀리는 것은 느린 것보다 훨씬 나쁩니다. 고친 버그가 그대로 남아 있는 것처럼 보이면 사람은 엉뚱한 곳을 몇 시간씩 고칩니다. "이상하면 일단 clean 빌드부터"라는 습관은 이런 경험에서 나왔습니다. 해시 방식은 내용이 같으면 같고 다르면 다르다고 답하므로 이 문제가 없습니다.
      </Callout>

      <h2>빌드 캐시: 다른 컴퓨터의 결과 빌려 쓰기</h2>
      <p>
        증분 빌드는 <strong>이 컴퓨터에서 지난번에</strong> 만든 결과만 다시 씁니다. 저장소를 새로 받은 동료의 노트북이나, 커밋마다 깨끗한 컴퓨터에서 시작하는 <a href={lessonHref('se-basics', 'ci')}>CI 서버</a>는 매번 처음부터 빌드합니다. 해시 방식을 한 걸음 더 밀면 이것도 풀립니다.
      </p>
      <p>
        작업의 출력은 입력으로 정해지므로, "명령 + 도구 버전 + 모든 입력의 해시"를 묶어 다시 해시하면 그 작업 결과의 이름표가 됩니다. 이것을 <T en="cache key">캐시 키</T>로 삼아 출력을 저장소에 넣어 두면, 어느 컴퓨터든 같은 키를 계산한 순간 작업을 돌리지 않고 결과를 내려받을 수 있습니다. 여러 컴퓨터가 함께 쓰는 이런 저장소를 <T en="remote build cache">원격 빌드 캐시</T>라고 합니다.
      </p>
      <CacheFigure />
      <p>
        캐시를 켜면 2번 빌드(새로 받은 노트북)는 CI 서버가 만들어 둔 결과를 모두 내려받습니다. 4번이 더 흥미롭습니다. main으로 돌아오면 format.ts의 내용이 1번과 같아지므로, 증분 빌드만으로는 다시 돌려야 할 작업들이 캐시에서 적중합니다. 캐시는 지난번 하나가 아니라 <strong>지금까지 본 모든 입력 조합</strong>의 결과를 기억하기 때문입니다.
      </p>

      <h2>캐시가 틀릴 때와 재현 가능한 빌드</h2>
      <p>
        이제 5번 줄을 보세요. 스테이징 서버는 API_URL을 스테이징 주소로 두고 빌드했는데, 묶기 작업이 API_URL을 입력으로 선언하지 않았으면 캐시 키가 1번과 똑같습니다. 그래서 운영 서버 주소가 박힌 app.js를 그대로 내려받습니다. 빌드는 성공했고 빠르기까지 했지만, 스테이징 화면이 운영 데이터베이스에 할 일을 쓰기 시작합니다. "API_URL을 입력으로 선언하기"를 켜면 키가 달라져 묶기, 압축, 배포 폴더만 다시 만들고, 서버 주소와 상관없는 컴파일과 테스트는 여전히 적중합니다.
      </p>
      <p>
        캐시가 맞으려면 작업의 출력이 <strong>선언한 입력만으로</strong> 정해져야 합니다. 몰래 읽는 환경 변수, 지금 시각, 컴퓨터 이름, 컴퓨터마다 다르게 깔린 도구 버전은 모두 선언하지 않은 입력입니다. 같은 입력이면 언제 어디서 빌드해도 결과가 비트 하나까지 같은 빌드를 <T en="reproducible build">재현 가능한 빌드</T>라고 합니다. 재현 가능해야 캐시를 믿을 수 있고, 배포한 파일이 정말 이 커밋에서 나왔는지도 다시 빌드해 확인할 수 있습니다. <a href={lessonHref('se-basics', 'packages')}>잠금 파일</a>이 의존성 버전을 고정하는 것도 같은 목표의 일부입니다.
      </p>
      <Callout kind="note">
        반대 방향의 실수도 흔합니다. 빌드 결과에 "빌드한 시각"을 넣으면, 입력이 같아도 출력이 매번 달라져 그 뒤의 작업이 모두 캐시를 놓칩니다. 버전 정보가 필요하면 시각 대신 커밋 해시처럼 입력에서 나오는 값을 넣습니다.
      </Callout>

      <h2>실제 도구: Gradle, Maven, Vite</h2>
      <p>
        Java 진영의 Gradle은 이 장의 모델과 가장 가깝습니다. 작업마다 입력과 출력을 선언하고, 입력 파일 내용의 지문을 비교해 바뀐 것이 없으면 UP-TO-DATE로 건너뜁니다. 빌드 캐시를 켜면 다른 컴퓨터가 만든 결과를 FROM-CACHE로 가져옵니다. 직접 만든 작업이라면 그림 3의 교훈대로 환경 변수까지 입력으로 적어야 합니다.
      </p>
      <Code label="build.gradle.kts (Kotlin DSL)">{`
tasks.register<Exec>("bundle") {
    inputs.dir("build/js")                                       // 컴파일된 .js 파일들
    inputs.file("package-lock.json")
    inputs.property("apiUrl", providers.environmentVariable("API_URL"))
    outputs.file("build/app.js")
    outputs.cacheIf { true }                                     // 결과를 빌드 캐시에 넣어도 된다
    commandLine("npx", "esbuild", "build/js/main.js", "--bundle", "--outfile=build/app.js")
}`}</Code>
      <Code label="터미널 (gradle.properties에 org.gradle.caching=true)">{`
$ ./gradlew build
> Task :compileJava UP-TO-DATE
> Task :processResources UP-TO-DATE
> Task :bundle FROM-CACHE
> Task :test
BUILD SUCCESSFUL in 4s
7 actionable tasks: 1 executed, 1 from cache, 5 up-to-date`}</Code>
      <p>
        Maven은 그래프 대신 정해진 단계(compile, test, package …)를 줄지어 밟는 방식이라 구조가 단순한 대신 증분 빌드가 약하고, 많은 플러그인이 수정 시각을 봅니다. 그래서 Maven 사용자는 <code>mvn clean install</code>을 습관처럼 칩니다. Vite는 개발 중에는 브라우저가 요청한 파일만 그때그때 변환해 거의 기다리지 않게 하고, <code>vite build</code>로 내보낼 때는 전체를 다시 묶되 빠른 도구(esbuild, Rollup)로 시간을 줄입니다. 방법은 달라도 모두 같은 질문에 답합니다. 무엇이 바뀌었고, 그 영향을 받는 것은 무엇인가.
      </p>
      <p>
        다음 장 <a href={lessonHref('se-basics', 'http-api')}>HTTP API 설계</a>에서는 이렇게 만든 화면이 서버와 이야기하는 방법을 봅니다. 빌드는 <a href={lessonHref('se-basics', 'ci')}>지속적 통합</a>에서 다시 만나는데, 거기서는 빌드 캐시가 파이프라인 시간을 얼마나 줄이는지 직접 재 봅니다.
      </p>

      <Quiz
        q={
          <>
            10:00에 전체 빌드를 했습니다. 11:00에 백업에서 옛 api.ts를 되살렸는데, 복사 도구가 원래 수정 시각(08:30)을 그대로 남겼습니다. make처럼 수정 시각을 비교하는 빌드 도구로 다시 빌드하면 어떻게 되나요?
          </>
        }
        options={[
          'api.js 하나만 다시 컴파일한다',
          '아무 작업도 다시 하지 않아, dist/에는 되살리기 전 api.ts로 만든 코드가 남는다',
          'api.js, app.js, app.min.js, dist/를 다시 만든다',
          '시각이 거꾸로 갔으므로 전체를 처음부터 다시 빌드한다',
        ]}
        answer={1}
        explain={<>api.ts의 수정 시각 08:30은 10:01에 만든 api.js보다 옛날이므로, make는 api.js가 최신이라고 판단합니다. 그 뒤의 작업도 입력이 바뀌지 않았으니 모두 건너뜁니다. ③은 내용 해시를 비교하는 도구가 하는 일입니다. 그림 2에서 "백업에서 옛 api.ts 되살리기"를 골라 확인해 보세요.</>}
      />
    </>
  );
}

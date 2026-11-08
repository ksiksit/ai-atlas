import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { ACTION_CODE, STRATEGY_NAME, TOTAL_TODOS, renderList, runScript, seedDb, type Action, type Strategy } from './orm';
import '../../basics/lessons/basics.css';
import './backend.css';
import './orm.css';

/* ─────────────── Figure 1: the persistence context ─────────────── */

const ACTIONS: { a: Action; label: string }[] = [
  { a: 'find1', label: 'find(User, 1)' },
  { a: 'find2', label: 'find(User, 2)' },
  { a: 'jpql1', label: 'JPQL: id = 1' },
  { a: 'todoOwner', label: '3번 할 일의 주인 이름' },
  { a: 'rename1', label: '1번 이름 바꾸기' },
  { a: 'flush', label: 'flush' },
  { a: 'clear', label: 'clear' },
];

function ContextFigure() {
  const [script, setScript] = useState<Action[]>(['find1', 'find1', 'todoOwner']);
  const { steps, session } = useMemo(() => runScript(script), [script]);
  const managed = session.managed();
  const sqlCount = session.log.length;
  const noSql = steps.filter((s) => s.sql.length === 0 && s.action !== 'clear').length;

  return (
    <Figure
      no={1}
      title="영속성 컨텍스트 들여다보기"
      hint="버튼을 눌러 호출을 하나씩 더해 보세요"
      caption={<>왼쪽은 한 트랜잭션 안에서 차례로 한 호출과, 그때 ORM이 실제로 보낸 SQL입니다. 쿼리가 없는 줄은 데이터베이스에 가지 않고 끝난 호출입니다. <code>User@번호</code>는 자바 객체 하나하나에 붙인 번호라서, 번호가 같으면 같은 객체(<code>a == b</code>)입니다. 오른쪽은 지금 영속성 컨텍스트가 들고 있는 엔티티입니다.</>}
    >
      <div className="se-chips" role="group" aria-label="호출 더하기">
        {ACTIONS.map((x) => (
          <button key={x.a} type="button" className="se-chip om-chip" onClick={() => setScript((s) => [...s, x.a].slice(-14))}>
            + {x.label}
          </button>
        ))}
      </div>
      <div className="fig-split">
        <ol className="om-steps" aria-label="호출과 SQL 기록" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className="om-step">
              <code className="om-call">{ACTION_CODE[s.action]}</code>
              {s.sql.length ? (
                s.sql.map((q, j) => (
                  <code key={j} className="om-sql" data-kind={q.startsWith('update') ? 'write' : undefined}>
                    {q}
                  </code>
                ))
              ) : (
                <span className="om-nosql">{s.action === 'clear' ? '(SQL 없음)' : '쿼리 없음'}</span>
              )}
              <span className="om-res">
                → {s.result}
                <small>{s.note}</small>
              </span>
            </li>
          ))}
          {!steps.length && <li className="om-nosql">위 버튼으로 호출을 더하세요.</li>}
        </ol>
        <div className="controls">
          <div className="controls row">
            <Readout label="보낸 SQL" value={`${sqlCount}개`} />
            <Readout label="쿼리 없이 끝난 호출" value={`${noSql}개`} color="var(--good)" />
          </div>
          <div>
            <div className="se-label">영속성 컨텍스트</div>
            <table className="om-ctx">
              <tbody>
                {managed.map((m) => (
                  <tr key={m.key} data-proxy={m.loaded ? undefined : ''}>
                    <th>{m.key}</th>
                    <td>@{m.obj}</td>
                    <td>{m.label}</td>
                  </tr>
                ))}
                {!managed.length && (
                  <tr>
                    <td className="om-nosql">비어 있음</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="controls row">
            <Button small onClick={() => setScript((s) => s.slice(0, -1))} disabled={!script.length}>
              하나 되돌리기
            </Button>
            <Button small onClick={() => setScript([])}>
              처음부터
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: counting the queries of one list page ─────────────── */

const STRATS: Strategy[] = ['lazy', 'eager', 'join', 'batch', 'joinBatch'];
const STRAT_COLOR: Record<Strategy, string> = {
  lazy: 'var(--bad)',
  eager: 'var(--c-se-3)',
  join: 'var(--c-se-1)',
  batch: 'var(--c-se-2)',
  joinBatch: 'var(--accent)',
};
const STRAT_SHORT: Record<Strategy, string> = { lazy: '지연', eager: '즉시(EAGER)', join: '페치 조인', batch: '배치', joinBatch: '조인+배치' };

const CW = 760;
const CH = 240;
const PAD = { l: 40, r: 12, t: 12, b: 34 };

function QueryChart({ curves, n, strategy }: { curves: Record<Strategy, number[]>; n: number; strategy: Strategy }) {
  const yMax = Math.max(10, ...STRATS.flatMap((s) => curves[s]));
  const nice = yMax <= 20 ? 20 : yMax <= 50 ? 50 : yMax <= 120 ? 120 : 250;
  const x = (i: number) => PAD.l + ((i - 1) / (TOTAL_TODOS - 1)) * (CW - PAD.l - PAD.r);
  const y = (v: number) => CH - PAD.b - (v / nice) * (CH - PAD.t - PAD.b);
  const ticks = [0, nice / 2, nice];
  const order = [...STRATS.filter((s) => s !== strategy), strategy];
  return (
    <svg className="om-chart" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label={`할 일 개수에 따른 쿼리 수. 지금 설정(${n}개)에서 ${STRATS.map((s) => `${STRATEGY_NAME[s]} ${curves[s][n - 1]}번`).join(', ')}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={CW - PAD.r} y1={y(t)} y2={y(t)} className="om-grid" />
          <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="om-tick">
            {t}
          </text>
        </g>
      ))}
      {[1, 25, 50, 75, 100].map((t) => (
        <text key={t} x={x(t)} y={CH - PAD.b + 16} textAnchor="middle" className="om-tick">
          {t}
        </text>
      ))}
      <text x={CW - PAD.r} y={CH - 2} textAnchor="end" className="om-tick">
        목록에 보이는 할 일 개수 N
      </text>
      <line x1={x(n)} x2={x(n)} y1={PAD.t} y2={CH - PAD.b} className="om-now" />
      {order.map((s) => (
        <polyline
          key={s}
          points={curves[s].map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={STRAT_COLOR[s]}
          strokeWidth={s === strategy ? 2.6 : 1.4}
          strokeDasharray={s === 'eager' ? '6 4' : undefined}
          opacity={s === strategy ? 1 : 0.55}
        />
      ))}
      <circle cx={x(n)} cy={y(curves[strategy][n - 1])} r={4.5} fill={STRAT_COLOR[strategy]} />
    </svg>
  );
}

function NPlusOneFigure() {
  const [n, setN] = useState(20);
  const [strategy, setStrategy] = useState<Strategy>('lazy');
  const [batch, setBatch] = useState(10);
  const [tags, setTags] = useState(false);
  const [owners, setOwners] = useState<'distinct' | 'shared'>('distinct');
  const db = useMemo(() => seedDb(owners), [owners]);
  const r = useMemo(() => renderList(db, n, strategy, batch, tags), [db, n, strategy, batch, tags]);
  const curves = useMemo(() => {
    const out = {} as Record<Strategy, number[]>;
    for (const s of STRATS) out[s] = Array.from({ length: TOTAL_TODOS }, (_, i) => renderList(db, i + 1, s, batch, tags).queries);
    return out;
  }, [db, batch, tags]);
  const batched = strategy === 'batch' || strategy === 'joinBatch';
  const loadQ = r.log.filter((x) => x.phase === 'load').length;

  return (
    <Figure
      no={2}
      title="목록 한 페이지에 쿼리 몇 번?"
      hint="할 일 개수와 가져오는 방법을 바꿔 보세요"
      caption={<>"할 일 N개와 각 할 일의 주인 이름"을 보여 주는 목록 페이지 하나를 그릴 때 ORM이 보낸 SQL을 모두 셌습니다. 데이터베이스에는 할 일이 {TOTAL_TODOS}개 있습니다. 그래프는 지금 설정에서 N을 1부터 {TOTAL_TODOS}까지 바꿔 가며 다섯 방법을 모두 돌려 본 결과이고, 굵은 선과 점이 고른 방법입니다. 아래 기록의 "조회"는 저장소 메서드 안에서, "그리기"는 화면을 그리며 필드를 읽다가 나간 쿼리입니다.</>}
    >
      <div className="controls row">
        <Slider label="목록에 보이는 할 일 N" value={n} min={1} max={TOTAL_TODOS} step={1} onChange={setN} format={(v) => `${v}개`} />
        <Seg label="가져오는 방법" value={strategy} onChange={setStrategy} options={STRATS.map((s) => ({ value: s, label: STRAT_SHORT[s] }))} />
      </div>
      <div className="controls row">
        {batched ? <Slider label="배치 크기 (default_batch_fetch_size)" value={batch} min={1} max={50} step={1} onChange={setBatch} format={(v) => `${v}`} /> : <div className="ctl om-ghost">배치 크기는 배치 로딩에서만 씁니다</div>}
        <Seg
          label="할 일의 주인"
          value={owners}
          onChange={setOwners}
          options={[
            { value: 'distinct', label: '모두 다른 사람' },
            { value: 'shared', label: '8명이 나눠 가짐' },
          ]}
        />
        <Check label="태그(@ManyToMany 컬렉션)도 표시" checked={tags} onChange={setTags} />
      </div>
      <div className="controls row">
        <Readout label="보낸 쿼리" value={`${r.queries}번`} color={STRAT_COLOR[strategy]} />
        <Readout label="받은 행" value={`${r.rows}행`} />
        <Readout label="왕복 1ms면 쿼리에만" value={`${r.queries} ms 이상`} />
        <Readout label="페이지의 서로 다른 주인" value={`${r.owners}명`} />
      </div>
      <div className="se-scroll">
        <QueryChart curves={curves} n={n} strategy={strategy} />
      </div>
      <Legend items={STRATS.map((s) => ({ color: STRAT_COLOR[s], label: STRATEGY_NAME[s], shape: 'ln' as const }))} />
      {r.warnings.map((w) => (
        <div key={w} className="be-verdict om-warn" data-tone="bad">
          <code>WARN {w}</code>
          <span>페이지 크기(limit)를 SQL에 넣지 못해 할 일 {TOTAL_TODOS}개의 모든 행을 읽은 뒤, 메모리에서 앞의 {n}개만 잘랐습니다.</span>
        </div>
      ))}
      <div className="fig-split">
        <div className="se-col">
          <div className="se-label">
            SQL 기록: 조회 {loadQ}번, 그리기 {r.queries - loadQ}번
          </div>
          <ol className="om-log" aria-label="ORM이 보낸 SQL">
            {r.log.map((s, i) => (
              <li key={i}>
                <span className="om-phase" data-phase={s.phase}>
                  {s.phase === 'load' ? '조회' : '그리기'}
                </span>
                <code>{s.sql}</code>
                <small>
                  {s.why} · {s.rows}행
                </small>
              </li>
            ))}
          </ol>
        </div>
        <div className="se-col">
          <div className="se-label">그려진 목록 (앞 6개)</div>
          <table className="om-page">
            <tbody>
              {r.page.slice(0, 6).map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{p.owner}</td>
                  {tags && <td>{p.tags.length ? p.tags.join(', ') : '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="om-small">방법을 바꿔도 화면은 똑같습니다. 달라지는 것은 그 화면을 얻으려고 데이터베이스에 다녀온 횟수뿐입니다.</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Orm() {
  return (
    <>
      <h2>객체와 테이블의 차이</h2>
      <p>
        할 일 목록 서비스에서 할 일은 주인이 있습니다. 자바에서는 이 관계를 참조로 적습니다. <code>todo.getOwner().getName()</code>처럼 점을 찍어 따라가면 됩니다. 데이터베이스에서는 같은 관계를 <code>todos</code> 테이블의 <code>owner_id</code> 열, 곧 <T en="foreign key">외래 키</T>로 적고, 주인 이름이 필요하면 두 테이블을 <a href={lessonHref('cs-databases', 'joins')}>조인</a>합니다.
      </p>
      <Code label="같은 관계, 두 가지 표현">{`
// 자바: 객체가 다른 객체를 가리킨다
class Todo { Long id; String title; User owner; Set<Tag> tags; }

// SQL: 행이 다른 행의 id를 적어 둔다
create table todos (id bigint primary key, title varchar(200), owner_id bigint references users(id));
create table todo_tags (todo_id bigint references todos(id), tag_id bigint references tags(id));`}</Code>
      <p>
        객체는 참조를 따라 한 칸씩 걸어가고, 테이블은 필요한 행을 한 번에 모아 옵니다. 이 차이를 메워 주는 도구가 <T en="ORM, object-relational mapping">ORM</T>입니다. 클래스와 테이블, 필드와 열, 참조와 외래 키가 어떻게 대응하는지 한 번 적어 두면, 객체를 읽고 고치는 코드만으로 SQL이 저절로 나갑니다. 자바에서는 JPA라는 표준과 그 구현인 Hibernate를 가장 많이 씁니다.
      </p>

      <h2>엔티티와 영속성 컨텍스트</h2>
      <p>
        테이블 행 하나에 대응하는 클래스를 <T en="entity">엔티티</T>라고 합니다. 어노테이션으로 어느 테이블, 어느 열인지 적고, 다른 엔티티를 가리키는 필드에는 관계의 종류를 적습니다. 할 일 여러 개가 사용자 하나를 가리키므로 Todo 쪽은 <code>@ManyToOne</code>, User 쪽은 <code>@OneToMany</code>입니다.
      </p>
      <Code label="Todo.java, User.java (Spring Boot 3, Jakarta Persistence)">{`
@Entity
@Table(name = "todos")
public class Todo {
    @Id @GeneratedValue
    private Long id;
    private String title;
    private boolean done;

    @ManyToOne(fetch = FetchType.LAZY)       // owner_id 열
    @JoinColumn(name = "owner_id")
    private User owner;

    @ManyToMany                               // 기본이 LAZY
    @JoinTable(name = "todo_tags", joinColumns = @JoinColumn(name = "todo_id"),
               inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags = new HashSet<>();
}

@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue
    private Long id;
    private String name;
    private String email;

    @OneToMany(mappedBy = "owner")            // 외래 키는 todos 쪽에 있다
    private List<Todo> todos = new ArrayList<>();
}`}</Code>
      <p>
        ORM이 읽어 온 엔티티는 <T en="persistence context">영속성 컨텍스트</T>라는 곳에 들어갑니다. JPA의 EntityManager가 들고 있는 작은 지도로, 열쇠는 "엔티티 종류 + id"입니다. Spring에서는 보통 트랜잭션 하나에 영속성 컨텍스트 하나가 생겼다가 트랜잭션이 끝나면 사라집니다. 이 지도 덕분에 세 가지가 생깁니다.
      </p>
      <ul>
        <li><strong>1차 캐시</strong>: 같은 id를 다시 <code>find</code>하면 데이터베이스에 가지 않습니다.</li>
        <li><strong>같은 객체 보장</strong>: 같은 행은 어느 길로 읽어도 같은 자바 객체입니다. 이 패턴을 <T en="identity map">식별자 지도</T>라고 합니다.</li>
        <li><strong><T en="dirty checking">변경 감지</T></strong>: 읽을 때 찍어 둔 사본과 비교해 달라진 엔티티만 커밋 직전에 update합니다. <code>save()</code>를 따로 부르지 않아도 됩니다.</li>
      </ul>
      <p>아래 그림의 작은 ORM(<code>orm.ts</code>)은 브라우저 메모리에 든 테이블 위에서 이 규칙대로 엔티티를 만들고, 보낸 SQL을 모두 적어 둡니다.</p>
      <ContextFigure />
      <p>
        세 가지를 눌러 보세요. <code>find(User, 1)</code>을 두 번 부르면 두 번째는 쿼리가 없습니다. JPQL로 같은 사용자를 찾으면 쿼리는 나가지만, 이미 관리 중인 엔티티라서 읽은 행은 버리고 원래 객체를 돌려줍니다. 이름을 바꾸고 <code>flush</code>를 누르면 그때서야 update가 나가고, 같은 값이면 아무것도 나가지 않습니다.
      </p>
      <Callout kind="note">
        1차 캐시는 트랜잭션 하나 안에서만 삽니다. 요청 사이에 결과를 나눠 쓰는 캐시(2차 캐시, Redis)와는 다른 것입니다. 성능을 위한 장치라기보다, 한 트랜잭션 안에서 같은 행이 객체 두 개로 갈라지지 않게 하는 장치로 이해하는 것이 정확합니다.
      </Callout>

      <h2>지연 로딩과 즉시 로딩</h2>
      <p>
        할 일을 읽을 때 주인도 함께 읽어야 할까요? 늘 필요하다면 함께 읽는 것이 낫고, 대개 필요 없다면 손해입니다. ORM은 두 가지를 다 제공합니다. <T en="eager loading">즉시 로딩</T>은 할 일을 읽는 순간 주인까지 채웁니다. <T en="lazy loading">지연 로딩</T>은 owner 자리에 id만 아는 빈 껍데기, 곧 <T en="proxy">프록시</T> 객체를 넣어 두고, 누군가 <code>getName()</code>처럼 그 안을 처음 들여다볼 때 쿼리를 보냅니다. 그림 1에서 "3번 할 일의 주인 이름"을 맨 처음에 눌러 보면, 할 일 쿼리 다음에 사용자 쿼리가 따로 나가는 것을 볼 수 있습니다.
      </p>
      <p>
        JPA의 기본값은 <code>@ManyToOne</code>과 <code>@OneToOne</code>이 즉시, <code>@OneToMany</code>와 <code>@ManyToMany</code>가 지연입니다. 실무에서는 대부분 모든 관계를 LAZY로 두고, 함께 필요할 때만 쿼리에서 따로 부탁합니다. 그 이유가 다음 절입니다.
      </p>
      <Callout kind="warn">
        지연 로딩된 프록시는 영속성 컨텍스트가 살아 있을 때만 채울 수 있습니다. 트랜잭션이 끝난 뒤 컨트롤러나 JSON 변환기에서 처음 건드리면 <code>LazyInitializationException</code>이 납니다. Spring Boot는 이것을 피하려고 요청이 끝날 때까지 컨텍스트를 열어 두는 open-in-view를 기본으로 켜 두는데, 그러면 화면을 그리는 동안 몰래 쿼리가 나가는 길도 함께 열립니다.
      </Callout>

      <h2>N+1 문제: 목록 하나에 쿼리 101번</h2>
      <p>목록 페이지를 만드는 가장 자연스러운 코드는 이렇습니다. 할 일을 가져오고, 하나씩 화면용 객체로 바꿉니다.</p>
      <Code label="TodoService.list() (Java)">{`
@Transactional(readOnly = true)
public List<TodoView> list(int size) {
    List<Todo> todos = todoRepository.findAll(PageRequest.of(0, size)).getContent();  // 쿼리 1번
    return todos.stream()
        .map(t -> new TodoView(t.getTitle(), t.getOwner().getName()))  // 할 일마다 1번씩
        .toList();
}`}</Code>
      <p>
        코드에는 반복문 안에 쿼리가 하나도 보이지 않습니다. 그런데 <code>t.getOwner()</code>는 프록시이고, <code>getName()</code>을 부르는 순간 그 주인을 읽는 쿼리가 나갑니다. 할 일 N개를 읽는 쿼리 1번에, 주인을 읽는 쿼리가 N번 더 나갑니다. 이것을 <T en="N+1 problem">N+1 문제</T>라고 합니다. 할 일 100개짜리 목록이면 쿼리가 101번입니다.
      </p>
      <NPlusOneFigure />
      <p>
        "지연"으로 두고 N을 올려 보세요. 빨간 선이 N과 함께 곧게 올라갑니다. "8명이 나눠 가짐"으로 바꾸면 주인 쿼리는 8번에서 멈추는데, 그림 1의 1차 캐시가 이미 읽은 주인을 다시 읽지 않기 때문입니다. 그래서 N+1은 정확히는 "1 + 서로 다른 주인 수"이고, 개발할 때 몇 안 되는 테스트 사용자로는 잘 드러나지 않다가 실제 데이터에서 터집니다.
      </p>
      <p>
        "즉시(EAGER)"를 골라 보세요. 쿼리 수가 똑같습니다. 다른 점은 쿼리가 "그리기"가 아니라 "조회" 단계에서, 저장소 메서드가 돌아오기 전에 한꺼번에 나간다는 것뿐입니다. JPQL 쿼리는 적힌 대로 할 일만 읽고, 그다음 EAGER인 주인을 채우려고 주인마다 쿼리를 하나씩 더 보냅니다. 즉시 로딩은 N+1을 고치지 못하고, 주인이 필요 없는 화면에서도 그 비용을 치르게 만들 뿐입니다.
      </p>

      <h2>페치 조인과 배치 로딩으로 고치기</h2>
      <p>
        첫 번째 해결책은 쿼리에서 처음부터 주인을 함께 달라고 하는 것입니다. JPQL에 <code>join fetch t.owner</code>를 쓰면 ORM이 SQL 조인 한 번으로 할 일과 주인을 함께 읽어 두 엔티티를 모두 채웁니다. 이것을 <T en="fetch join">페치 조인</T>이라고 합니다. 그림에서 "페치 조인"을 고르면 N과 상관없이 쿼리가 1번입니다.
      </p>
      <p>
        그런데 "태그도 표시"를 켜고 페치 조인을 고르면 경고가 뜹니다. 할 일 하나에 태그가 셋이면 조인 결과에서 그 할 일이 세 행이 됩니다. 그래서 "앞의 20개 할 일"을 SQL의 <code>limit 20</code>으로 자를 수 없고, Hibernate는 limit 없이 모든 행을 읽은 뒤 메모리에서 자릅니다. 할 일이 백만 개라면 목록 한 페이지에 백만 행을 읽는 셈입니다. 컬렉션 둘을 함께 페치 조인하면 행 수가 곱으로 늘어나고, 둘 다 List라면 Hibernate가 아예 오류(<code>MultipleBagFetchException</code>)를 냅니다.
      </p>
      <p>
        두 번째 해결책은 <T en="batch fetching">배치 로딩</T>입니다. 지연 로딩은 그대로 두되, 프록시 하나를 채울 때 영속성 컨텍스트에서 아직 기다리는 같은 종류의 프록시를 최대 B개까지 모아 <code>where id in (…)</code> 쿼리 하나로 함께 채웁니다. 쿼리 수는 <code>1 + ⌈N / B⌉</code>가 됩니다. 페이지 크기는 SQL의 limit로 그대로 자를 수 있고, 컬렉션에도 똑같이 통합니다. "배치"를 고르고 배치 크기를 1에서 50까지 움직여 보세요.
      </p>
      <Callout kind="key">
        흔히 쓰는 조합은 이렇습니다. 하나를 가리키는 관계(<code>@ManyToOne</code>)는 페치 조인으로 한 번에 읽고, 여럿을 담는 컬렉션(<code>@OneToMany</code>, <code>@ManyToMany</code>)은 배치 로딩에 맡깁니다. 그림의 "조인+배치"가 그 조합으로, 태그를 켜도 쿼리가 몇 번에 그치고 페이지도 SQL에서 잘립니다.
      </Callout>

      <h2>Spring Data JPA에서</h2>
      <p>
        Spring Data JPA의 저장소 인터페이스에서는 세 가지 방법을 모두 한두 줄로 적습니다. 메서드에 <code>@EntityGraph</code>를 붙이면 그 메서드가 만드는 쿼리에 지정한 관계를 페치 조인으로 넣어 줍니다. JPQL을 직접 쓰려면 <code>@Query</code>에 <code>join fetch</code>를 적습니다. 페이지를 함께 쓸 때는 개수를 세는 쿼리에는 페치가 필요 없으므로 <code>countQuery</code>를 따로 적어 둡니다.
      </p>
      <Code label="TodoRepository.java">{`
public interface TodoRepository extends JpaRepository<Todo, Long> {

    // 이름으로 만든 쿼리에 owner를 페치 조인으로 더한다
    @EntityGraph(attributePaths = "owner")
    Page<Todo> findByDoneFalse(Pageable pageable);

    // 같은 일을 JPQL로 직접
    @Query(value = "select t from Todo t join fetch t.owner where t.done = false",
           countQuery = "select count(t) from Todo t where t.done = false")
    Page<Todo> findOpenWithOwner(Pageable pageable);
}`}</Code>
      <Code label="application.yml">{`
spring:
  jpa:
    open-in-view: false                 # 화면을 그리는 동안 몰래 나가는 쿼리를 막는다
    properties:
      hibernate:
        default_batch_fetch_size: 100   # 모든 지연 관계와 컬렉션에 배치 로딩 (그림의 B)
        format_sql: true
logging:
  level:
    org.hibernate.SQL: debug            # 보낸 SQL을 로그로 (그림의 기록과 같은 것)`}</Code>
      <p>
        N+1은 코드 리뷰로는 잘 보이지 않습니다. 쿼리가 반복문 안이 아니라 getter 뒤에 숨어 있기 때문입니다. 그래서 개발 중에는 SQL 로그를 켜 두고, 중요한 목록은 테스트에서 쿼리 수를 직접 세어 확인합니다. Hibernate의 통계(<code>hibernate.generate_statistics</code>)가 세어 준 쿼리 수를 테스트에서 단언하면, 누군가 화면에 필드 하나를 더해 N+1이 다시 생겼을 때 빌드가 깨집니다. 다음 장 <a href={lessonHref('se-backend', 'transactions')}>트랜잭션 경계</a>에서는 영속성 컨텍스트의 수명을 정하는 트랜잭션이 어디서 시작하고 끝나는지 봅니다.
      </p>

      <Quiz
        q={<>할 일 50개의 목록에 주인 이름을 보여 줍니다. 주인은 모두 다른 사람이고, owner는 LAZY, <code>default_batch_fetch_size</code>는 20입니다. 페이지를 한 번 그릴 때 나가는 쿼리는 모두 몇 번일까요?</>}
        options={['2번', '4번', '21번', '51번']}
        answer={1}
        explain={<>할 일을 읽는 쿼리 1번, 그다음 주인 프록시 50개를 20개, 20개, 10개씩 <code>in (…)</code>으로 채우는 쿼리 3번, 모두 1 + ⌈50 / 20⌉ = 4번입니다. 그림 2에서 N을 50, "배치", 배치 크기 20으로 맞춰 확인해 보세요. 배치 로딩이 없으면 51번입니다.</>}
      />
    </>
  );
}

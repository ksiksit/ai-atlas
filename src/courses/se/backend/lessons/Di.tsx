import { useId, useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { candidates, explain, resolve, type BeanDef, type Result } from './container';
import '../../basics/lessons/basics.css';
import './backend.css';

/* ─────────────── the beans of a small to-do service ─────────────── */

const BEANS: Record<string, BeanDef> = {
  TodoController: { name: 'TodoController', provides: ['TodoController'], deps: ['TodoService'] },
  TodoService: { name: 'TodoService', provides: ['TodoService'], deps: ['TodoRepository', 'Notifier', 'Clock'] },
  MemoryTodoRepository: { name: 'MemoryTodoRepository', provides: ['MemoryTodoRepository', 'TodoRepository'], deps: [] },
  JdbcTodoRepository: { name: 'JdbcTodoRepository', provides: ['JdbcTodoRepository', 'TodoRepository'], deps: ['DataSource'] },
  DataSource: { name: 'DataSource', provides: ['DataSource'], deps: [] },
  EmailNotifier: { name: 'EmailNotifier', provides: ['EmailNotifier', 'Notifier'], deps: ['MailSender'] },
  SlackNotifier: { name: 'SlackNotifier', provides: ['SlackNotifier', 'Notifier'], deps: [] },
  MailSender: { name: 'MailSender', provides: ['MailSender'], deps: [] },
  SystemClock: { name: 'SystemClock', provides: ['SystemClock', 'Clock'], deps: [] },
};

/* ─────────────── the object graph as SVG ─────────────── */

const MIN_W = 600;
const ROW = 66;
const BW = 170;
const BH = 30;

interface GNode {
  id: string;
  label: string;
  state: 'made' | 'pending' | 'bad' | 'ghost';
}

function BeanGraph({ r, label }: { r: Result; label: string }) {
  const uid = useId().replace(/:/g, '');
  const nodes: GNode[] = [...r.depth.keys()].map((id) => ({ id, label: id, state: r.created.includes(id) ? 'made' : 'pending' }));
  const depth = new Map(r.depth);
  const edges = [...r.edges];
  const badEdge = new Set<string>();
  const f = r.fail;
  if (f?.kind === 'missing') {
    const id = '?' + f.type;
    nodes.push({ id, label: '? ' + f.type, state: 'ghost' });
    depth.set(id, (f.by ? depth.get(f.by)! : -1) + 1);
    if (f.by) {
      edges.push([f.by, id]);
      badEdge.add(f.by + '>' + id);
    }
  }
  if (f?.kind === 'ambiguous') {
    for (const c of f.candidates) {
      if (!depth.has(c)) {
        nodes.push({ id: c, label: c, state: 'ghost' });
        depth.set(c, (f.by ? depth.get(f.by)! : -1) + 1);
      }
      if (f.by) {
        edges.push([f.by, c]);
        badEdge.add(f.by + '>' + c);
      }
    }
  }
  if (f?.kind === 'cycle') {
    for (let i = 0; i + 1 < f.path.length; i++) badEdge.add(f.path[i] + '>' + f.path[i + 1]);
    for (const n of nodes) if (f.path.includes(n.id)) n.state = 'bad';
  }

  const rows = new Map<number, GNode[]>();
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    rows.set(d, [...(rows.get(d) ?? []), n]);
  }
  const maxD = Math.max(0, ...rows.keys());
  const W = Math.max(MIN_W, ...[...rows.values()].map((l) => l.length * (BW + 28)));
  const pos = new Map<string, [number, number]>();
  for (const [d, list] of rows) list.forEach((n, i) => pos.set(n.id, [((i + 0.5) / list.length) * W, 22 + d * ROW]));
  const H = 22 + maxD * ROW + BH / 2 + 4;

  const clip = (a: [number, number], b: [number, number]): [number, number, number, number] => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const s = (p: number) => Math.min(Math.abs(dx) > 1e-6 ? BW / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? BH / 2 / Math.abs(dy) : Infinity) + p;
    return [a[0] + dx * s(0), a[1] + dy * s(0), b[0] - dx * s(0.01), b[1] - dy * s(0.01)];
  };

  return (
    <svg className="be-graph" viewBox={`-4 -6 ${W + 8} ${H + 6}`} role="img" aria-label={label}>
      <defs>
        {(['ok', 'bad'] as const).map((k) => (
          <marker key={k} id={`${uid}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`be-head ${k}`} />
          </marker>
        ))}
      </defs>
      {edges.map(([a, b]) => {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) return null;
        const [x1, y1, x2, y2] = clip(pa, pb);
        const bad = badEdge.has(a + '>' + b);
        return <line key={a + '>' + b} x1={x1} y1={y1} x2={x2} y2={y2} className={`be-edge${bad ? ' bad' : ''}`} markerEnd={`url(#${uid}-${bad ? 'bad' : 'ok'})`} />;
      })}
      {nodes.map((n) => {
        const [x, y] = pos.get(n.id)!;
        const order = r.created.indexOf(n.id);
        return (
          <g key={n.id} className={`be-node ${n.state}`}>
            <rect x={x - BW / 2} y={y - BH / 2} width={BW} height={BH} />
            <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle">
              {n.label}
            </text>
            {order >= 0 && (
              <text className="be-order" x={x + BW / 2 - 4} y={y - BH / 2 - 4} textAnchor="end">
                {order + 1}번째 생성
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────── Figure 1: swap an implementation, the service stays the same ─────────────── */

function WiringFigure() {
  const [repo, setRepo] = useState<'MemoryTodoRepository' | 'JdbcTodoRepository'>('MemoryTodoRepository');
  const [notifier, setNotifier] = useState<'EmailNotifier' | 'SlackNotifier'>('SlackNotifier');
  const defs = useMemo(() => ['TodoController', 'TodoService', repo, 'DataSource', notifier, 'MailSender', 'SystemClock'].map((n) => BEANS[n]), [repo, notifier]);
  const r = useMemo(() => resolve(defs, 'TodoController'), [defs]);
  const unused = defs.filter((d) => !r.created.includes(d.name)).map((d) => d.name);

  return (
    <Figure
      no={1}
      title="구현을 바꿔 끼우기"
      hint="저장소와 알림 구현을 골라 보세요"
      caption={<>위는 컨테이너가 TodoController 하나를 만들기 위해 따라간 의존 관계입니다. 화살표는 "생성자에 이것이 필요하다"는 뜻이고, 번호는 실제로 생성자가 불린 순서입니다. 아래 코드는 컨테이너가 한 일을 손으로 적으면 이렇게 된다는 것입니다.</>}
    >
      <div className="se-col">
        <div className="controls row">
          <Seg
            label="TodoRepository 구현"
            value={repo}
            onChange={setRepo}
            options={[
              { value: 'MemoryTodoRepository', label: '메모리' },
              { value: 'JdbcTodoRepository', label: 'JDBC (데이터베이스)' },
            ]}
          />
          <Seg
            label="Notifier 구현"
            value={notifier}
            onChange={setNotifier}
            options={[
              { value: 'SlackNotifier', label: '슬랙' },
              { value: 'EmailNotifier', label: '이메일' },
            ]}
          />
        </div>
        <div className="se-scroll">
          <BeanGraph r={r} label={`객체 그래프: ${r.created.join(', ')} 순서로 생성`} />
        </div>
        <Code label="컨테이너가 대신 써 준 코드">{['// 컨테이너가 한 일을 손으로 쓰면', ...r.code].join('\n')}</Code>
        <div className="controls row">
          <Readout label="만든 객체" value={`${r.created.length}개`} />
          <Readout label="TodoService에서 고친 줄" value="0줄" color="var(--good)" />
          <Readout label="등록됐지만 안 쓰인 빈" value={unused.length ? unused.join(', ') : '없음'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: when wiring fails ─────────────── */

function ErrorFigure() {
  const [both, setBoth] = useState(false);
  const [primary, setPrimary] = useState(false);
  const [noMail, setNoMail] = useState(false);
  const [cycle, setCycle] = useState(false);

  const defs = useMemo(() => {
    const out: BeanDef[] = [BEANS.TodoController, BEANS.TodoService, BEANS.MemoryTodoRepository, BEANS.SystemClock];
    if (both) out.push({ ...BEANS.JdbcTodoRepository, primary }, BEANS.DataSource);
    out.push(cycle ? { ...BEANS.EmailNotifier, deps: ['MailSender', 'TodoService'] } : BEANS.EmailNotifier);
    if (!noMail) out.push(BEANS.MailSender);
    return out;
  }, [both, primary, noMail, cycle]);
  const r = useMemo(() => resolve(defs, 'TodoController'), [defs]);
  const e = r.fail ? explain(r.fail) : null;
  const repoCount = candidates(defs, 'TodoRepository').length;

  return (
    <Figure
      no={2}
      title="컨테이너가 멈추는 세 가지 경우"
      hint="체크 상자를 켜고 끄며 오류를 만들고 고쳐 보세요"
      caption={<>빨간 화살표가 문제가 생긴 곳입니다. 점선 상자는 찾지 못했거나 고르지 못한 빈이고, 번호가 없는 상자는 만들기 시작했지만 끝내지 못한 빈입니다. 오른쪽 기록은 컨테이너가 빈을 찾아 내려가고 만들며 올라온 순서입니다.</>}
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="se-scroll">
            <BeanGraph r={r} label={e ? `연결 실패: ${e.text}` : `연결 성공: ${r.created.join(', ')}`} />
          </div>
          <div className="be-verdict" data-tone={e ? 'bad' : 'good'} aria-live="polite">
            {e ? (
              <>
                <code>{e.exception}</code>
                <span>{e.text}</span>
              </>
            ) : (
              <span>애플리케이션이 떴습니다. 빈 {r.created.length}개를 모두 만들었습니다.</span>
            )}
          </div>
        </div>
        <div className="controls">
          <Check label="JdbcTodoRepository에도 @Repository 붙이기" checked={both} onChange={setBoth} />
          <Check label={<>그중 JdbcTodoRepository에 @Primary 붙이기{!both && ' (위를 먼저 켜세요)'}</>} checked={primary && both} onChange={setPrimary} />
          <Check label="MailSender 등록 빼먹기" checked={noMail} onChange={setNoMail} />
          <Check label="EmailNotifier 생성자가 TodoService도 받게 하기" checked={cycle} onChange={setCycle} />
          <Readout label="TodoRepository 후보" value={`${repoCount}개`} />
          <ol className="be-trace" aria-label="컨테이너 기록">
            {r.steps.map((s, i) => (
              <li key={i} data-kind={s.kind} style={{ paddingLeft: s.depth * 12 }}>
                {s.kind === 'need' ? `${s.bean} 만들기 시작` : s.kind === 'create' ? `${s.bean} 생성 ✓` : `${s.bean} 이미 있음, 재사용`}
              </li>
            ))}
            {e && <li data-kind="fail">멈춤: {e.exception}</li>}
          </ol>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Di() {
  return (
    <>
      <h2>스스로 만들면 생기는 일</h2>
      <p>할 일 목록 서비스를 만든다고 합시다. TodoService는 할 일을 저장소에 저장하고, 마감이 다가오면 알림을 보냅니다. 가장 먼저 떠오르는 코드는 필요한 것을 스스로 만드는 것입니다.</p>
      <Code label="스스로 만드는 서비스 (Java)">{`
public class TodoService {
    private final TodoRepository repo = new JdbcTodoRepository(new DataSource(PROD_DB_URL));
    private final Notifier notifier = new EmailNotifier(new MailSender(SMTP_HOST));

    public Todo add(String title) { ... }
}`}</Code>
      <p>
        이 코드는 잘 돌지만, 세 가지 문제가 있습니다. 테스트를 돌릴 때마다 실제 데이터베이스와 메일 서버가 필요합니다. 이메일 대신 슬랙으로 알림을 보내려면 TodoService를 고쳐야 합니다. 그리고 다른 서비스도 저장소가 필요하다면, 각자 데이터베이스 연결을 따로 만들게 됩니다. 원인은 하나입니다. TodoService가 <strong>무엇이 필요한지</strong>와 <strong>그것을 어떻게 만드는지</strong>를 둘 다 알고 있기 때문입니다.
      </p>

      <h2>필요한 것을 밖에서 받기</h2>
      <p>
        해결책은 놀랄 만큼 단순합니다. 필요한 것을 생성자로 받기만 하고, 만드는 일은 밖에 맡깁니다. 이것을 <T en="dependency injection">의존성 주입</T>이라고 합니다. TodoService는 이제 TodoRepository라는 인터페이스만 알고, 그 뒤에 메모리 저장소가 있는지 데이터베이스가 있는지 모릅니다. <a href={lessonHref('cs-software-design', 'modules')}>모듈과 추상화</a>에서 본 "인터페이스 뒤에 숨기기"를 객체를 만드는 일에까지 적용한 것입니다.
      </p>
      <Code label="생성자로 받는 서비스 (Java)">{`
public class TodoService {
    private final TodoRepository repo;
    private final Notifier notifier;
    private final Clock clock;

    public TodoService(TodoRepository repo, Notifier notifier, Clock clock) {
        this.repo = repo;          // 무엇이 들어올지는 모른다
        this.notifier = notifier;
        this.clock = clock;
    }
}`}</Code>
      <p>
        그러면 누군가는 결국 객체들을 만들어 이어 줘야 합니다. 작은 프로그램이라면 main 함수에서 손으로 해도 됩니다. 하지만 객체가 수백 개가 되면, 무엇을 먼저 만들어야 하는지 따지는 일만으로도 큰일입니다. 이 일을 대신 해 주는 것이 <T en="IoC container">IoC 컨테이너</T>입니다. Spring에서는 클래스에 <code>@Component</code>(또는 <code>@Service</code>, <code>@Repository</code>)를 붙이면 컨테이너가 그 클래스를 <T en="bean">빈</T>으로 등록하고, 생성자에 필요한 타입을 보고 알맞은 빈을 찾아 넣어 줍니다.
      </p>
      <p>
        아래 그림의 컨테이너는 브라우저 안에서 실제로 돌아가는 작은 컨테이너입니다(<code>container.ts</code>, 100줄 남짓). 등록된 빈 목록과 시작점(TodoController)을 받아, 생성자에 필요한 타입을 따라 깊이 우선으로 내려가고, 더 필요한 것이 없는 빈부터 만들며 올라옵니다.
      </p>
      <WiringFigure />
      <Callout kind="key">
        구현을 바꿔도 TodoService의 코드는 한 줄도 바뀌지 않습니다. 바뀌는 것은 어떤 클래스를 빈으로 등록하느냐뿐입니다. 테스트에서는 메모리 저장소와 가짜 알림을, 실제 서비스에서는 데이터베이스와 이메일을 넣으면 됩니다.
      </Callout>

      <h2>제어의 역전</h2>
      <p>
        예전에는 내 코드가 필요한 객체를 만들고 불렀습니다. 이제는 컨테이너가 내 객체를 만들고, 필요한 것을 넣고, 때가 되면 내 메서드를 부릅니다. 흐름의 주인이 바뀌었다고 해서 이것을 <T en="inversion of control">제어의 역전</T>(IoC)이라고 부릅니다. 라이브러리는 내가 부르는 것이고, 프레임워크는 나를 부르는 것이라는 말도 같은 뜻입니다. 이 과목의 나머지 장은 모두 이 구조 위에 서 있습니다. 컨테이너가 객체를 만들기 때문에 진짜 객체 대신 <a href={lessonHref('se-backend', 'aop')}>프록시</a>를 넣을 수 있고, 들어온 요청을 알맞은 <a href={lessonHref('se-backend', 'routing')}>컨트롤러 메서드</a>로 보낼 수 있습니다.
      </p>
      <Callout kind="note">
        Spring의 빈은 기본적으로 하나만 만들어 모두가 함께 씁니다(싱글턴 범위). 그림 1에서 MailSender를 여러 곳이 필요로 해도 한 번만 만들어지는 것도 이 때문입니다. 그래서 빈에는 요청마다 달라지는 값을 필드로 두면 안 됩니다. 여러 요청이 동시에 같은 객체를 쓰기 때문입니다.
      </Callout>

      <h2>컨테이너가 멈출 때</h2>
      <p>
        컨테이너는 애플리케이션이 시작할 때 모든 연결을 한 번에 확인합니다. 그래서 연결이 잘못되면 첫 요청을 받기도 전에 시작 단계에서 멈춥니다. 귀찮아 보이지만, 새벽에 사용자가 그 기능을 처음 눌렀을 때 터지는 것보다 훨씬 낫습니다. 실제로 자주 보는 오류는 세 가지입니다.
      </p>
      <ul>
        <li>필요한 타입의 빈이 없다: 등록을 빼먹었거나 다른 패키지에 있어 스캔되지 않은 경우</li>
        <li>필요한 타입의 빈이 둘 이상이다: 어느 것을 넣을지 모르는 경우. <code>@Primary</code>나 <code>@Qualifier</code>로 정해 줍니다</li>
        <li>생성자끼리 서로를 기다린다: A를 만들려면 B가, B를 만들려면 A가 필요한 순환 의존</li>
      </ul>
      <ErrorFigure />
      <p>
        순환 의존은 고치는 법이 하나로 정해져 있지 않습니다. 대개는 설계가 보내는 신호입니다. EmailNotifier가 TodoService 전체가 아니라 할 일의 주인 이메일 하나만 필요했다면, 그 값만 메서드 인자로 받으면 됩니다. 아니면 두 클래스가 함께 쓰는 부분을 세 번째 클래스로 떼어 냅니다. 필드 주입이나 지연 주입으로 오류만 피하는 방법도 있지만, 그것은 문제를 숨길 뿐입니다.
      </p>

      <Quiz
        q={<>테스트에서 TodoService를 실제 데이터베이스 없이 검사하고 싶습니다. 생성자 주입을 쓰는 TodoService라면 가장 간단한 방법은?</>}
        options={['TodoService 코드 안의 new JdbcTodoRepository를 주석 처리한다', '테스트에서 new TodoService(new MemoryTodoRepository(), fakeNotifier, fixedClock)으로 직접 만든다', '테스트할 때만 데이터베이스를 띄운다', 'TodoService의 repo 필드를 public으로 바꿔 테스트에서 덮어쓴다']}
        answer={1}
        explain={<>생성자로 받기 때문에 테스트에서는 컨테이너 없이도 원하는 구현을 직접 넣어 만들 수 있습니다. 시각까지 고정된 Clock으로 넣으면 "마감 하루 전" 같은 조건도 언제 돌려도 같은 결과로 확인할 수 있습니다.</>}
      />
    </>
  );
}

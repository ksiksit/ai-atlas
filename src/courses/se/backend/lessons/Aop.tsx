import { useEffect, useMemo, useRef, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { JOIN_POINTS, matches, parsePointcut, run, runsOf, type AspectId, type Ev, type JoinPoint, type Row, type RunSpec, type Who } from './proxy';
import '../../basics/lessons/basics.css';
import './backend.css';
import './aop.css';

/* ─────────────── shared bits ─────────────── */

const WHO_NAME: Record<Who, string> = {
  caller: '호출한 쪽',
  proxy: '프록시',
  log: '로그 어드바이스',
  time: '시간 어드바이스',
  tx: '트랜잭션 어드바이스',
  target: '진짜 객체',
  db: '데이터베이스',
};

const WHO_LEGEND = (['proxy', 'log', 'time', 'tx', 'target', 'db'] as Who[]).map((w) => ({ color: `var(--ap-${w})`, label: WHO_NAME[w], shape: 'sq' as const }));

function Rows({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <table className="ap-rows" aria-label={label}>
      <thead>
        <tr>
          <th>id</th>
          <th>title</th>
          <th>done</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-pending={r.pending || undefined}>
            <td>{r.id}</td>
            <td>{r.title}</td>
            <td>{String(r.done)}</td>
            <td className="ap-rows-note">{r.pending ? '커밋 전' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─────────────── Figure 1: one call, step by step ─────────────── */

const ASPECT_PC: Record<AspectId, string> = {
  log: 'execution(* TodoService.*(..))',
  time: 'execution(* TodoService.*(..))',
  tx: '@annotation(Transactional)',
};

type CallId = 'add' | 'complete1' | 'complete99' | 'addAll';
const CALLS: Record<CallId, { label: string; call: RunSpec['call'] }> = {
  add: { label: 'add("우유 사기")', call: { via: 'service', method: 'add', arg: '우유 사기' } },
  complete1: { label: 'complete(1)', call: { via: 'service', method: 'complete', arg: 1 } },
  complete99: { label: 'complete(99)', call: { via: 'service', method: 'complete', arg: 99 } },
  addAll: { label: 'addAll(["우유 사기", "", "빵 사기"])', call: { via: 'service', method: 'addAll', arg: ['우유 사기', '', '빵 사기'] } },
};

function EventList({ events, upto, label }: { events: Ev[]; upto: number; label: string }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current;
    const cur = el?.querySelector<HTMLElement>('[data-now]');
    if (el && cur) el.scrollTop = Math.max(0, cur.offsetTop - el.clientHeight + cur.offsetHeight + 8);
  }, [upto, events]);
  return (
    <ol className="ap-log" ref={box} aria-label={label}>
      {events.map((e, i) => (
        <li key={i} data-who={e.who} data-kind={e.kind} data-now={i === upto || undefined} data-future={i > upto || undefined} style={{ paddingLeft: 8 + Math.max(0, e.stack.length - 1) * 10 }}>
          {e.text}
        </li>
      ))}
    </ol>
  );
}

function StepFigure() {
  const [callId, setCallId] = useState<CallId>('add');
  const [on, setOn] = useState<Record<AspectId, boolean>>({ log: true, time: true, tx: true });
  const spec = useMemo<RunSpec>(
    () => ({
      aspects: (['log', 'time', 'tx'] as AspectId[]).filter((a) => on[a]).map((id) => ({ id, pointcut: ASPECT_PC[id] })),
      call: CALLS[callId].call,
    }),
    [callId, on],
  );
  const r = useMemo(() => run(spec), [spec]);
  const key = `${callId}|${on.log}|${on.time}|${on.tx}`;
  const s = useStepper(r.events.length, 3, key);
  const ev = r.events[s.i];
  const last = s.i === r.events.length - 1;

  return (
    <Figure
      no={1}
      title="호출 하나가 프록시를 지나가는 길"
      hint="호출을 고르고 한 단계씩 넘겨 보세요"
      caption={
        <>
          왼쪽 위는 지금 이 순간의 호출 스택입니다. 위가 바깥, 아래가 안쪽이고, 맨 아래 칸이 지금 실행 중인 코드입니다. 그 아래 기록은 일어난 순서대로이고 들여쓰기가 스택의 깊이입니다. 어드바이스는 등록 순서(로그 → 시간 → 트랜잭션)대로 들어가고, 나올 때는 거꾸로 나옵니다. <code>complete(99)</code>와 <code>addAll</code>은 예외가 나는 경로입니다. 표의 "커밋 전" 줄은 트랜잭션 안에서 쓴, 아직 확정되지 않은 행입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ap-stack" aria-label={`호출 스택: ${ev.stack.map((f) => f.label).join(' → ')}`} role="img">
            <div className="se-label">호출 스택 (바깥 → 안)</div>
            {ev.stack.map((f, i) => (
              <div key={i} className="ap-frame" data-who={f.who} data-top={i === ev.stack.length - 1 || undefined} style={{ marginLeft: i * 10 }}>
                <span>{f.label}</span>
                <small>{WHO_NAME[f.who]}</small>
              </div>
            ))}
            {ev.stack.length === 0 && <div className="ap-frame-empty">비어 있음</div>}
          </div>
          <div className="ap-now" data-who={ev.who} aria-live="polite">
            <span className="ap-now-step">{s.i + 1}</span>
            <span>{ev.text}</span>
          </div>
          <div className="ap-stepbar">
            <StepControls s={s} maxSpeed={12} id="ap-step-speed" />
          </div>
          <EventList events={r.events} upto={s.i} label="일어난 일의 기록" />
          <Legend items={WHO_LEGEND} />
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>컨트롤러가 부르는 메서드</span>
            </span>
            <div className="se-chips" role="group" aria-label="호출 고르기">
              {(Object.keys(CALLS) as CallId[]).map((c) => (
                <button key={c} type="button" className="se-chip" data-on={c === callId || undefined} onClick={() => setCallId(c)}>
                  {CALLS[c].label}
                </button>
              ))}
            </div>
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>프록시에 붙은 애스펙트</span>
            </span>
            <Check label="로그 (모든 메서드)" checked={on.log} onChange={(v) => setOn({ ...on, log: v })} />
            <Check label="시간 재기 (모든 메서드)" checked={on.time} onChange={(v) => setOn({ ...on, time: v })} />
            <Check label="트랜잭션 (@Transactional)" checked={on.tx} onChange={(v) => setOn({ ...on, tx: v })} />
          </div>
          <div>
            <div className="se-label">todo 테이블{ev.inTx ? ' (트랜잭션 열림)' : ''}</div>
            <Rows rows={ev.rows} label="todo 테이블의 현재 행" />
          </div>
          <Readout label="호출한 쪽이 받은 것" value={last ? (r.outcome.ok ? `반환 ${r.outcome.value}` : r.outcome.type) : '…'} color={!last ? undefined : r.outcome.ok ? 'var(--good)' : 'var(--bad)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: what a pointcut picks ─────────────── */

const PC_PRESETS = ['execution(* TodoService.*(..))', 'execution(* TodoService.add*(..))', 'execution(* *.add(String))', 'execution(void *.*(..))', '@annotation(Transactional)', 'within(TodoService) && !execution(* *.find*(..))', 'execution(* *(..))'];

const sig = (j: JoinPoint) => `${j.ret} ${j.cls}.${j.method}(${j.params.join(', ')})`;

function PointcutFigure() {
  const [text, setText] = useState(PC_PRESETS[1]);
  const pc = useMemo(() => parsePointcut(text), [text]);
  const hit = JOIN_POINTS.filter((j) => matches(pc, j));

  return (
    <Figure
      no={2}
      title="포인트컷이 고르는 메서드"
      hint="식을 고르거나 직접 고쳐 보세요"
      caption={
        <>
          아래 표는 할 일 서비스에 있는 메서드들입니다. 진하게 칠해진 줄이 위의 포인트컷에 걸려 어드바이스가 붙는 메서드입니다. <code>*</code>는 아무 이름, <code>(..)</code>는 아무 인자, <code>(*)</code>는 인자 하나를 뜻합니다. <code>&&</code>, <code>||</code>, <code>!</code>로 식을 묶을 수 있습니다.
        </>
      }
    >
      <div className="se-col">
        <div className="se-chips" role="group" aria-label="포인트컷 예시">
          {PC_PRESETS.map((p) => (
            <button key={p} type="button" className="se-chip" data-on={p === text || undefined} onClick={() => setText(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="se-label" htmlFor="ap-pc">
          <code>@Around("…")</code> 안의 포인트컷 식
        </label>
        <input id="ap-pc" className="se-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
        <div className="se-scroll">
          <table className="ap-jp" aria-label="메서드와 포인트컷 일치 여부">
            <thead>
              <tr>
                <th>메서드 시그니처</th>
                <th>애너테이션</th>
                <th>걸림</th>
              </tr>
            </thead>
            <tbody>
              {JOIN_POINTS.map((j) => {
                const ok = hit.includes(j);
                return (
                  <tr key={j.cls + j.method} data-hit={ok || undefined}>
                    <td className="ap-sig">{sig(j)}</td>
                    <td className="ap-anno">{j.annotations.map((a) => '@' + a).join(' ')}</td>
                    <td className="ap-mark">{ok ? '✓' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="controls row">
          <Readout label="식" value={pc.ok ? '읽음' : pc.error} color={pc.ok ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="걸린 메서드" value={pc.ok ? `${hit.length}개 / ${JOIN_POINTS.length}개` : '–'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the self-invocation trap ─────────────── */

const LANES = [
  { id: 'this', title: '① 같은 클래스 안에서 this.add', code: 'todoService.addAll(titles)', note: 'addAll이 for 문에서 this.add(t)를 부릅니다.' },
  { id: 'self', title: '② 자기 프록시를 주입받아 self.add', code: 'todoService.addAll(titles)', note: 'addAll이 주입받은 자기 프록시 self로 self.add(t)를 부릅니다.' },
  { id: 'importer', title: '③ 다른 빈에서 todoService.add', code: 'todoImporter.importAll(titles)', note: 'TodoImporter가 주입받은 todoService(프록시)의 add를 부릅니다.' },
] as const;

function Lane({ lane, r, n }: { lane: (typeof LANES)[number]; r: ReturnType<typeof run>; n: number }) {
  const logs = runsOf(r, 'log', 'add');
  const txs = runsOf(r, 'tx', 'add');
  const shown = r.events.filter((e) => e.who !== 'time' && !(e.kind === 'enter' && e.who === 'target') && !(e.kind === 'return' && e.who === 'target'));
  const added = r.rows.length - 1;
  return (
    <div className="ap-lane" data-tone={logs === n ? 'good' : 'bad'}>
      <div className="ap-lane-head">
        <strong>{lane.title}</strong>
        <code>{lane.code}</code>
        <span>{lane.note}</span>
      </div>
      <ol className="ap-log ap-lane-log" aria-label={`${lane.title}의 기록`}>
        {shown.map((e, i) => (
          <li key={i} data-who={e.who} data-kind={e.kind} style={{ paddingLeft: 8 + Math.max(0, e.stack.length - 1) * 8 }}>
            {e.text}
          </li>
        ))}
      </ol>
      <div className="ap-lane-stats">
        <Readout label="add에 붙은 로그" value={`${logs} / ${n}번`} color={logs === n ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="add의 트랜잭션" value={`${txs} / ${n}번`} color={txs === n ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <div className="ap-lane-out" data-ok={r.outcome.ok || undefined}>
        새로 저장된 행 <strong>{added}개</strong>, {r.outcome.ok ? '정상 반환' : <>예외 <code>{r.outcome.type}</code></>}
      </div>
    </div>
  );
}

function SelfCallFigure() {
  const [bad, setBad] = useState(false);
  const [txAll, setTxAll] = useState(false);
  const titles = bad ? ['우유 사기', '', '빵 사기'] : ['우유 사기', '빵 사기', '달걀 사기'];
  const jps = useMemo(() => JOIN_POINTS.map((j) => (j.cls === 'TodoService' && j.method === 'addAll' ? { ...j, annotations: txAll ? ['Transactional'] : [] } : j)), [txAll]);
  const results = useMemo(() => {
    const aspects: RunSpec['aspects'] = [
      { id: 'log', pointcut: 'execution(* TodoService.add(..))' },
      { id: 'tx', pointcut: '@annotation(Transactional)' },
    ];
    return {
      this: run({ aspects, joinPoints: jps, selfCall: 'this', call: { via: 'service', method: 'addAll', arg: titles } }),
      self: run({ aspects, joinPoints: jps, selfCall: 'self', call: { via: 'service', method: 'addAll', arg: titles } }),
      importer: run({ aspects, joinPoints: jps, call: { via: 'importer', arg: titles } }),
    };
    // titles is derived from `bad`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bad, jps]);

  return (
    <Figure
      no={3}
      title="같은 클래스 안에서 부르면"
      hint="빈 제목을 섞고, addAll에도 @Transactional을 붙여 보세요"
      caption={
        <>
          세 칸 모두 같은 TodoService 프록시에 로그 어드바이스(<code>execution(* TodoService.add(..))</code>)와 트랜잭션 어드바이스(<code>@annotation(Transactional)</code>, add에 붙어 있음)를 걸었습니다. 다른 것은 add에 닿는 길 하나뿐입니다. 기록에 "프록시가 … 가로챔"이 보이는 add만 어드바이스를 받았습니다. 빈 제목은 add에서 IllegalArgumentException을 냅니다.
        </>
      }
    >
      <div className="se-col">
        <div className="controls row">
          <Check label={'제목 목록에 빈 제목 "" 섞기'} checked={bad} onChange={setBad} />
          <Check label="addAll에도 @Transactional 붙이기" checked={txAll} onChange={setTxAll} />
        </div>
        <div className="ap-lanes">
          {LANES.map((l) => (
            <Lane key={l.id} lane={l} r={results[l.id]} n={bad ? 2 : 3} />
          ))}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Aop() {
  return (
    <>
      <h2>메서드마다 붙는 같은 코드</h2>
      <p>
        <a href={lessonHref('se-backend', 'di')}>앞 장</a>의 TodoService에 요구가 셋 늘었다고 합시다. 메서드가 불릴 때마다 로그를 남기고, 얼마나 걸렸는지 재고, 데이터베이스를 바꾸는 메서드는 트랜잭션으로 묶어 실패하면 되돌려야 합니다. 그대로 쓰면 이렇게 됩니다.
      </p>
      <Code label="모든 메서드에 같은 코드를 붙인 서비스 (Java)">{`
public long add(String title) {
    log.info("→ add({})", title);
    long t0 = System.nanoTime();
    TransactionStatus tx = txManager.getTransaction(new DefaultTransactionDefinition());
    try {
        long id = repo.save(new Todo(title));     // 진짜 하려던 일은 이 한 줄
        txManager.commit(tx);
        log.info("← add 반환 {}", id);
        return id;
    } catch (RuntimeException e) {
        txManager.rollback(tx);
        log.warn("✗ add: {}", e.toString());
        throw e;
    } finally {
        metrics.record("add", System.nanoTime() - t0);
    }
}`}</Code>
      <p>
        하려던 일은 한 줄인데 둘레가 열네 줄입니다. 그리고 complete에도, addAll에도, 다른 서비스의 메서드 수백 개에도 똑같은 열네 줄이 붙습니다. 로그 형식을 바꾸려면 그 수백 곳을 모두 고쳐야 합니다. 이렇게 여러 클래스를 가로질러 똑같이 필요한 일을 <T en="cross-cutting concern">횡단 관심사</T>라고 합니다. 로그, 시간 재기, 권한 검사, 트랜잭션, 캐시가 대표적입니다. 할 일을 저장한다는 본래의 관심사와 달리, 이것들은 어느 한 클래스의 일이 아닙니다.
      </p>

      <h2>진짜 객체 앞에 선 대리인</h2>
      <p>
        해결책은 둘레 코드를 메서드 밖으로 빼내어, 호출이 메서드에 닿기 전에 가로채는 것입니다. 이 일을 하는 객체가 <T en="proxy">프록시</T>입니다. 프록시는 진짜 객체와 같은 메서드를 가지고 있어서, 부르는 쪽은 진짜인지 대리인인지 모릅니다. 호출을 받은 프록시는 앞일(트랜잭션 시작, 로그)을 하고, 진짜 객체의 메서드를 부르고, 뒷일(커밋, 로그)을 한 뒤 결과를 돌려줍니다.
      </p>
      <p>
        이것이 가능한 이유는 <a href={lessonHref('se-backend', 'di')}>컨테이너가 객체를 만들어 넣어 주기</a> 때문입니다. TodoController가 TodoService를 생성자로 받을 때, 컨테이너는 진짜 TodoService 대신 그것을 감싼 프록시를 넣습니다. 컨트롤러 코드도, 서비스 코드도 바뀌지 않습니다.
      </p>
      <p>
        아래 그림은 이 장을 위해 만든 작은 AOP 런타임(<code>proxy.ts</code>)이 실제로 돌린 결과입니다. JavaScript에 내장된 <code>Proxy</code>로 TodoService 객체를 감싸고, 메서드를 꺼낼 때마다 그 메서드에 맞는 어드바이스들을 사슬로 엮어 돌립니다. 핵심은 이 몇 줄입니다.
      </p>
      <Code label="proxy.ts의 핵심 (TypeScript)">{`
return new Proxy(target, {
  get(t, name) {
    const method = t[name];
    const chain = aspects.filter((a) => matches(a.pointcut, name));   // 이 메서드에 붙을 어드바이스
    return (...args) => {
      let k = 0;
      const inv = {
        proceed: () => k < chain.length
          ? chain[k++].around(inv)        // 다음 어드바이스
          : method.apply(t, args),        // 사슬 끝: 진짜 객체의 메서드. this는 진짜 객체
      };
      return inv.proceed();
    };
  },
});`}</Code>
      <StepFigure />
      <p>
        <code>complete(99)</code>를 골라 끝까지 넘겨 보세요. 본문에서 TodoNotFoundException이 나면 예외가 안쪽에서 바깥쪽으로 어드바이스를 하나씩 거슬러 올라갑니다. 트랜잭션 어드바이스는 예외를 보고 ROLLBACK을 하고, 로그 어드바이스는 실패를 기록한 뒤 예외를 그대로 다시 던집니다. <code>addAll</code>에서는 첫 번째 INSERT가 "커밋 전" 상태로 들어갔다가, 두 번째 add에서 예외가 나자 ROLLBACK으로 사라집니다.
      </p>
      <Callout kind="key">
        둘레 코드는 이제 애스펙트 클래스 한 곳에만 있습니다. TodoService의 add는 다시 한 줄짜리 본래의 일만 합니다. 로그 형식을 바꾸려면 LoggingAspect 하나만 고치면 됩니다.
      </Callout>

      <h2>어드바이스와 포인트컷</h2>
      <p>AOP(관점 지향 프로그래밍)에는 용어가 몇 개 있습니다. 그림 1에서 이미 본 것들에 이름을 붙이면 이렇습니다.</p>
      <ul>
        <li>
          <T en="advice">어드바이스</T>: 끼워 넣을 둘레 코드. 메서드 앞에서만 도는 before, 뒤에서만 도는 after, 앞뒤를 모두 감싸고 진짜 메서드를 부를지 말지까지 정하는 around가 있습니다. 그림 1의 세 어드바이스는 모두 around입니다.
        </li>
        <li>
          <T en="join point">조인 포인트</T>: 어드바이스를 끼울 수 있는 자리. 프록시 방식에서는 "프록시를 거친 메서드 호출"이 곧 조인 포인트입니다.
        </li>
        <li>
          <T en="pointcut">포인트컷</T>: 어떤 조인 포인트에 끼울지 고르는 식. 메서드 이름이나 클래스, 애너테이션으로 고릅니다.
        </li>
        <li>
          <T en="aspect">애스펙트</T>: 어드바이스와 포인트컷을 한데 묶은 것. "TodoService의 모든 메서드에(포인트컷) 로그를 남긴다(어드바이스)"가 애스펙트 하나입니다.
        </li>
      </ul>
      <p>
        포인트컷 식은 AspectJ라는 언어의 문법을 씁니다. <code>execution(* TodoService.add*(..))</code>는 "반환 타입은 아무거나, TodoService 클래스의, 이름이 add로 시작하는, 인자는 아무거나인 메서드의 실행"이라는 뜻입니다. 아래 그림의 식은 이 모형이 직접 읽어서(<code>parsePointcut</code>) 각 메서드와 맞춰 봅니다.
      </p>
      <PointcutFigure />
      <p>
        <code>execution(* TodoService.add*(..))</code>가 add와 함께 addAll까지 고른다는 점을 눈여겨보세요. 이름 패턴은 편하지만, 나중에 누군가 addTag라는 메서드를 만들면 거기에도 조용히 어드바이스가 붙습니다. 그래서 트랜잭션처럼 중요한 어드바이스는 이름 대신 <code>@annotation(Transactional)</code>처럼 메서드에 직접 표시한 애너테이션으로 고르는 경우가 많습니다.
      </p>
      <Callout kind="note">
        어드바이스가 여럿이면 순서가 중요합니다. 그림 1에서 시간 어드바이스가 트랜잭션 바깥에 있으므로, 잰 시간에는 BEGIN과 COMMIT에 걸린 시간까지 들어갑니다. Spring에서는 애스펙트에 <code>@Order(1)</code>처럼 번호를 붙여 정하고, 번호가 작을수록 바깥에서 감쌉니다.
      </Callout>

      <h2>자기 호출 함정</h2>
      <p>
        그림 1에서 <code>addAll</code>을 다시 보세요. addAll 안에서 부른 두 번의 add에는 로그도, 시간도 붙지 않았습니다. 기록에는 "this.add: 자기 자신을 직접 부름, 프록시를 거치지 않음"이라고 나옵니다. 왜 그럴까요?
      </p>
      <p>
        프록시의 사슬 끝에서 진짜 메서드를 부를 때 <code>method.apply(t, args)</code>, 즉 <code>this</code>를 진짜 객체로 정해서 부르기 때문입니다. 그래서 addAll 안의 <code>this</code>는 프록시가 아니라 진짜 TodoService이고, <code>this.add()</code>는 프록시를 지나지 않고 곧장 진짜 add로 갑니다. 어드바이스는 프록시에 붙어 있으니, 프록시를 지나지 않은 호출에는 아무 일도 일어나지 않습니다. 이것을 <T en="self-invocation">자기 호출</T> 문제라고 합니다.
      </p>
      <SelfCallFigure />
      <p>
        빈 제목을 섞으면 차이가 데이터로 드러납니다. ①에서는 add에 트랜잭션이 붙었다고 믿었지만 실제로는 트랜잭션 없이 저장되어, "우유 사기"는 자동 커밋으로 이미 들어가 버립니다. 여기서 addAll에도 @Transactional을 붙이면 ①과 ②는 addAll 전체가 트랜잭션 하나가 되어 "우유 사기"까지 함께 되돌려집니다. ③의 importAll에는 트랜잭션이 없으므로, add마다 따로 커밋되어 첫 줄은 남습니다. 트랜잭션을 어느 메서드에 거느냐는 <a href={lessonHref('se-backend', 'transactions')}>트랜잭션 경계</a>에서 자세히 다룹니다.
      </p>
      <p>자기 호출을 피하는 방법은 세 가지입니다.</p>
      <ul>
        <li>메서드를 다른 빈으로 옮긴다(③). 가장 흔하고 깔끔한 방법입니다. 대개 "이 둘은 정말 한 클래스의 일인가"를 다시 생각하게 됩니다.</li>
        <li>
          자기 자신의 프록시를 주입받아 <code>self.add()</code>로 부른다(②). 동작은 하지만, 클래스가 자기가 프록시에 싸여 있다는 사실을 알아야 합니다.
        </li>
        <li>프록시를 쓰지 않고 컴파일하거나 클래스를 읽어 들일 때 어드바이스를 바이트코드에 직접 넣는다(AspectJ 위빙). 자기 호출에도 붙지만 빌드 설정이 복잡해집니다.</li>
      </ul>

      <h2>Spring에서는</h2>
      <p>
        Spring AOP는 이 장의 모형과 같은 방식입니다. <code>@Aspect</code>를 붙인 빈의 어드바이스를 모아, 포인트컷에 걸리는 메서드가 있는 빈을 만들 때 프록시로 감싸서 컨테이너에 등록합니다. <code>ProceedingJoinPoint.proceed()</code>가 모형의 <code>inv.proceed()</code>입니다.
      </p>
      <Code label="LoggingAspect.java">{`
@Aspect
@Component
@Order(1)                                        // 작을수록 바깥
public class LoggingAspect {
    private static final Logger log = LoggerFactory.getLogger(LoggingAspect.class);

    @Around("execution(* com.example.todo.TodoService.*(..))")
    public Object log(ProceedingJoinPoint pjp) throws Throwable {
        String name = pjp.getSignature().getName();
        log.info("→ {}{}", name, Arrays.toString(pjp.getArgs()));
        try {
            Object result = pjp.proceed();       // 다음 어드바이스, 마지막엔 진짜 메서드
            log.info("← {} 반환 {}", name, result);
            return result;
        } catch (Throwable e) {
            log.warn("✗ {}: {}", name, e.toString());
            throw e;                             // 삼키지 않고 다시 던진다
        }
    }
}`}</Code>
      <p>
        <code>@Transactional</code>도 같은 장치입니다. Spring이 미리 만들어 둔 TransactionInterceptor라는 어드바이스가 <code>@Transactional</code>이 붙은 메서드를 포인트컷으로 삼습니다. 그래서 자기 호출 함정도 그대로 따라옵니다.
      </p>
      <Code label="TodoService.java">{`
@Service
public class TodoService {
    private final TodoRepository repo;

    public TodoService(TodoRepository repo) { this.repo = repo; }

    @Transactional
    public long add(String title) {
        if (title.isBlank()) throw new IllegalArgumentException("제목이 비어 있습니다");
        return repo.save(new Todo(title));
    }

    public List<Long> addAll(List<String> titles) {
        return titles.stream().map(this::add).toList();   // this.add: 트랜잭션이 붙지 않는다
    }
}`}</Code>
      <p>
        Spring이 실행 중에 만드는 프록시 클래스를 손으로 쓰면 대략 아래와 같습니다. TodoService처럼 인터페이스가 없는 클래스는 CGLIB이라는 라이브러리로 하위 클래스를 만들어 메서드를 덮어씁니다(인터페이스가 있으면 JDK 동적 프록시를 쓸 수도 있습니다). 하위 클래스로 덮어쓰는 방식이라, 덮어쓸 수 없는 <code>private</code>이나 <code>final</code> 메서드에는 <code>@Transactional</code>을 붙여도 아무 일도 일어나지 않습니다.
      </p>
      <Code label="Spring이 만드는 프록시를 손으로 쓰면 (개념도)">{`
class TodoService$$SpringCGLIB$$0 extends TodoService {
    private final TodoService target;                 // 진짜 객체
    private final List<MethodInterceptor> chain;      // 이 메서드에 걸린 어드바이스들

    @Override
    public long add(String title) {
        return (long) new ReflectiveMethodInvocation(target, "add", title, chain).proceed();
    }
    // addAll도 똑같이 덮어쓰지만, 사슬 끝에서 target.addAll()을 부르므로
    // 그 안의 this는 target이다
}`}</Code>
      <Callout kind="warn">
        "@Transactional을 붙였는데 롤백이 안 된다"는 질문의 상당수가 자기 호출이거나 private 메서드입니다. 어드바이스가 실제로 붙었는지 의심스러우면, 그 메서드 안에서 <code>TransactionSynchronizationManager.isActualTransactionActive()</code>를 찍어 보거나 로그 수준을 낮춰 프록시가 남기는 기록을 확인합니다.
      </Callout>
      <p>
        다음 장 <a href={lessonHref('se-backend', 'auto-config')}>자동 구성</a>에서는 이런 프록시와 빈들을 아무 설정 없이도 Spring Boot가 알아서 등록해 주는 규칙을 봅니다.
      </p>

      <Quiz
        q={
          <>
            로그 애스펙트의 포인트컷이 <code>execution(* TodoService.add(..))</code>입니다. 컨트롤러가 <code>todoService.addAll(["a", "b", "c"])</code>를 부르고, addAll은 안에서 <code>this.add(t)</code>를 세 번 부릅니다. 로그 어드바이스는 몇 번 실행될까요?
          </>
        }
        options={['0번', '1번', '3번', '4번']}
        answer={0}
        explain={
          <>
            포인트컷은 이름이 정확히 add인 메서드만 고르므로 addAll 호출에는 어드바이스가 붙지 않습니다. 그 안의 세 번의 add는 <code>this</code>로 부른 자기 호출이라 프록시를 거치지 않습니다. 그래서 0번입니다. 같은 일을 TodoImporter 같은 다른 빈에서 하면 3번이 됩니다. 그림 3의 ①과 ③이 바로 이 두 경우입니다.
          </>
        }
      />
    </>
  );
}

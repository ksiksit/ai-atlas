import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { INITIAL_STOCK, ORDER_ID, exceptionName, placeOrder, type Boundary, type CallPath, type Config, type Ev, type ExKind, type FailAt, type Outcome, type Propagation } from './txstore';
import '../../basics/lessons/basics.css';
import './backend.css';
import './transactions.css';

/* ─────────────── shared pieces ─────────────── */

const TX_COLOR = ['var(--ink-3)', 'var(--c-se-1)', 'var(--c-se-2)', 'var(--c-se-3)'];
const txColor = (tx: number | null) => TX_COLOR[tx ?? 0] ?? 'var(--accent)';

function EventLog({ events, label }: { events: Ev[]; label: string }) {
  return (
    <ol className="tx-log" aria-label={label}>
      {events.map((e, i) => (
        <li key={i} data-kind={e.kind} style={{ paddingLeft: 8 + e.depth * 14, borderLeftColor: txColor(e.tx) }}>
          <span className="tx-tag" style={{ color: txColor(e.tx) }}>
            {e.tx ? `T${e.tx}` : '–'}
          </span>
          <span className="tx-text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

function FinalState({ o }: { o: Outcome }) {
  const order = o.db.orders.length > 0;
  const stock = o.db.stock < INITIAL_STOCK;
  return (
    <div className="se-col">
      <div className="tx-cards">
        <div className="tx-card" data-on={order || undefined}>
          <span className="se-label">orders</span>
          <strong>{order ? `주문 ${ORDER_ID}` : '행 없음'}</strong>
        </div>
        <div className="tx-card" data-on={stock || undefined}>
          <span className="se-label">stock (키보드)</span>
          <strong>
            {INITIAL_STOCK} → {o.db.stock}
          </strong>
        </div>
        <div className="tx-card" data-on={o.charged || undefined}>
          <span className="se-label">카드 결제</span>
          <strong>{o.charged ? '39,000원 승인' : '안 됨'}</strong>
        </div>
        <div className="tx-card" data-on={o.db.audit.length > 0 || undefined} data-side>
          <span className="se-label">audit_log</span>
          <strong>{o.db.audit.length ? `${o.db.audit.length}행` : '행 없음'}</strong>
        </div>
      </div>
      <div className="tx-response" data-ok={o.response.ok || undefined}>
        응답: <code>{o.response.text}</code>
      </div>
      <div className="be-verdict" data-tone={o.problems.length ? 'bad' : 'good'} aria-live="polite">
        {o.problems.length ? (
          <>
            <code>데이터가 어긋났습니다</code>
            <ul className="tx-problems">
              {o.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <span>{order ? '주문, 재고, 결제가 모두 반영됐습니다.' : '주문도 재고도 결제도 없습니다. 모두 함께 되돌려졌습니다.'}</span>
        )}
        {o.notes.map((n) => (
          <span key={n} className="tx-note">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Figure 1: where the boundary is, and what a failure leaves behind ─────────────── */

const BASE: Config = { boundary: 'repo', auditProp: 'REQUIRED', failAt: 'payment', exKind: 'unchecked', rollbackForAll: false, catchAudit: false };

const PRESETS: { name: string; cfg: Config }[] = [
  { name: '경계를 잊은 서비스', cfg: BASE },
  { name: '서비스에 경계', cfg: { ...BASE, boundary: 'service' } },
  { name: '체크 예외', cfg: { ...BASE, boundary: 'service', exKind: 'checked' } },
  { name: '감사 로그는 남기기', cfg: { ...BASE, boundary: 'service', auditProp: 'REQUIRES_NEW' } },
  { name: '잡았는데 롤백', cfg: { ...BASE, boundary: 'service', failAt: 'audit', catchAudit: true } },
];

function codeFor(c: Config): string {
  const svc = c.boundary === 'service';
  const fail = c.failAt === 'none' ? null : exceptionName(c.failAt, c.exKind);
  const checked = c.failAt !== 'none' && c.exKind === 'checked';
  const lines: string[] = [];
  lines.push('@Service');
  lines.push('public class OrderService {');
  if (svc) lines.push(c.rollbackForAll ? '    @Transactional(rollbackFor = Exception.class)' : '    @Transactional');
  else lines.push('    // @Transactional 없음');
  lines.push(`    public void placeOrder(OrderRequest req)${checked ? ` throws ${fail}` : ''} {`);
  lines.push('        orderRepository.save(order);');
  lines.push('        if (stockRepository.decrease(7, 1) == 0) throw new OutOfStockException();');
  if (c.catchAudit) {
    lines.push('        try {');
    lines.push('            auditService.record("주문 1001 시도");');
    lines.push('        } catch (Exception e) {');
    lines.push('            log.warn("감사 로그 실패", e);   // 삼키고 계속');
    lines.push('        }');
  } else lines.push('        auditService.record("주문 1001 시도");');
  lines.push('        paymentClient.charge(order);');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push('@Service');
  lines.push('public class AuditService {');
  lines.push(c.auditProp === 'REQUIRED' ? '    @Transactional   // propagation = REQUIRED (기본값)' : '    @Transactional(propagation = Propagation.REQUIRES_NEW)');
  lines.push('    public void record(String msg) { ... }');
  lines.push('}');
  if (c.boundary === 'none') {
    lines.push('');
    lines.push('// 저장소: 트랜잭션 없이 JDBC 자동 커밋으로 실행');
  }
  return lines.join('\n');
}

function OrderFigure() {
  const [cfg, setCfg] = useState<Config>(BASE);
  const set = <K extends keyof Config>(k: K) => (v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const o = useMemo(() => placeOrder(cfg), [cfg]);
  const preset = PRESETS.find((p) => JSON.stringify(p.cfg) === JSON.stringify(cfg))?.name;

  return (
    <Figure
      no={1}
      title="주문 하나, 실패 하나"
      hint="예시를 고르거나 설정을 하나씩 바꿔 보세요"
      caption={<>placeOrder()가 주문 저장, 재고 감소, 감사 로그, 결제를 차례로 합니다. 왼쪽 기록은 메서드 호출과 그 안에서 나간 SQL이고, 왼쪽 띠의 색과 T1, T2는 그 일이 어느 물리 트랜잭션 안에서 일어났는지 나타냅니다. "–"는 트랜잭션 밖입니다. 오른쪽은 요청이 끝난 뒤 데이터베이스에 실제로 남은 것과 카드 결제 여부입니다. 감사 로그는 주문과 따로 남아도 되는 기록이라 일관성 검사에서 뺍니다.</>}
    >
      <div className="se-chips" role="group" aria-label="예시">
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="se-chip tx-preset" data-on={p.name === preset || undefined} onClick={() => setCfg(p.cfg)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="controls row">
        <Seg<Boundary>
          label="트랜잭션 경계"
          value={cfg.boundary}
          onChange={set('boundary')}
          options={[
            { value: 'none', label: '없음' },
            { value: 'repo', label: '저장소 메서드마다' },
            { value: 'service', label: 'placeOrder 전체' },
          ]}
        />
        <Seg<Propagation>
          label="AuditService.record의 전파"
          value={cfg.auditProp}
          onChange={set('auditProp')}
          options={[
            { value: 'REQUIRED', label: 'REQUIRED' },
            { value: 'REQUIRES_NEW', label: 'REQUIRES_NEW' },
          ]}
        />
      </div>
      <div className="controls row">
        <Seg<FailAt>
          label="실패하는 곳"
          value={cfg.failAt}
          onChange={set('failAt')}
          options={[
            { value: 'none', label: '없음' },
            { value: 'stock', label: '재고' },
            { value: 'audit', label: '감사 로그' },
            { value: 'payment', label: '결제' },
          ]}
        />
        <Seg<ExKind>
          label="던지는 예외"
          value={cfg.exKind}
          onChange={set('exKind')}
          options={[
            { value: 'unchecked', label: 'RuntimeException' },
            { value: 'checked', label: '체크 예외' },
          ]}
        />
      </div>
      <div className="controls row tx-checks">
        <Check label={<span>placeOrder에 <code className="tx-nowrap">rollbackFor = Exception.class</code>{cfg.boundary !== 'service' && ' (경계가 placeOrder일 때만 의미 있음)'}</span>} checked={cfg.rollbackForAll} onChange={set('rollbackForAll')} />
        <Check label="placeOrder가 감사 로그 예외를 잡고 계속" checked={cfg.catchAudit} onChange={set('catchAudit')} />
      </div>
      <div className="fig-split tx-split">
        <div className="se-col">
          <EventLog events={o.events} label="호출과 트랜잭션 기록" />
          <div className="controls row">
            <Readout label="물리 트랜잭션" value={`${o.txCount}개`} />
            <Readout label="던진 예외" value={cfg.failAt === 'none' ? '없음' : exceptionName(cfg.failAt, cfg.exKind)} />
          </div>
        </div>
        <FinalState o={o} />
      </div>
      <Code label="지금 설정을 코드로">{codeFor(cfg)}</Code>
    </Figure>
  );
}

/* ─────────────── Figure 2: self-invocation skips the proxy ─────────────── */

interface Hop {
  label: string;
  kind: 'obj' | 'proxy' | 'proxy-off' | 'self';
  note?: string;
}

const HOPS: Record<CallPath, Hop[]> = {
  proxy: [
    { label: 'OrderController', kind: 'obj' },
    { label: '프록시', kind: 'proxy', note: 'BEGIN / ROLLBACK' },
    { label: 'OrderService.placeOrder()', kind: 'obj' },
  ],
  self: [
    { label: 'OrderController', kind: 'obj' },
    { label: '프록시', kind: 'proxy-off', note: 'checkout()엔 @Transactional 없음' },
    { label: 'OrderService.checkout()', kind: 'obj' },
    { label: 'this.placeOrder()', kind: 'self', note: '프록시를 거치지 않음' },
  ],
  'other-bean': [
    { label: 'OrderController', kind: 'obj' },
    { label: '프록시', kind: 'proxy-off', note: '그냥 통과' },
    { label: 'OrderService.checkout()', kind: 'obj' },
    { label: '프록시', kind: 'proxy', note: 'BEGIN / ROLLBACK' },
    { label: 'OrderTxService.placeOrder()', kind: 'obj' },
  ],
};

function SelfCallFigure() {
  const [path, setPath] = useState<CallPath>('self');
  const o = useMemo(() => placeOrder({ boundary: 'service', auditProp: 'REQUIRED', failAt: 'payment', exKind: 'unchecked', rollbackForAll: false, catchAudit: false, path }), [path]);
  const hops = HOPS[path];

  return (
    <Figure
      no={2}
      title="자기 호출은 프록시를 지나지 않는다"
      hint="호출 경로를 바꿔 보세요"
      caption={<>placeOrder()에는 그림 1의 "서비스에 경계"와 똑같이 <code>@Transactional</code>이 붙어 있고, 결제는 언제나 RuntimeException으로 실패합니다. 달라지는 것은 placeOrder()에 닿는 길뿐입니다. 점선 상자는 트랜잭션을 시작하지 않고 지나간 프록시, 빨간 화살표는 프록시 없이 같은 객체 안에서 부른 호출입니다.</>}
    >
      <Seg<CallPath>
        label="컨트롤러가 placeOrder()에 닿는 길"
        value={path}
        onChange={setPath}
        options={[
          { value: 'proxy', label: '프록시를 거쳐 바로' },
          { value: 'self', label: 'checkout()에서 this.placeOrder()' },
          { value: 'other-bean', label: '다른 빈으로 분리' },
        ]}
      />
      <div className="tx-hops" role="img" aria-label={`호출 경로: ${hops.map((h) => h.label + (h.note ? ` (${h.note})` : '')).join(' → ')}`}>
        {hops.map((h, i) => (
          <div key={i} className="tx-hop-wrap">
            {i > 0 && (
              <span className="tx-arrow" data-self={h.kind === 'self' || undefined} aria-hidden="true">
                →
              </span>
            )}
            <div className="tx-hop" data-kind={h.kind}>
              <code>{h.label}</code>
              {h.note && <small>{h.note}</small>}
            </div>
          </div>
        ))}
      </div>
      <div className="fig-split tx-split">
        <EventLog events={o.events} label="호출과 트랜잭션 기록" />
        <FinalState o={o} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Transactions() {
  return (
    <>
      <h2>한 덩어리로 성공하거나 실패해야 하는 변경</h2>
      <p>할 일 서비스 옆에 작은 가게를 붙였다고 합시다. 주문 하나를 받으면 서버는 네 가지 일을 합니다.</p>
      <ol>
        <li>orders 테이블에 주문을 저장한다</li>
        <li>stock 테이블에서 재고를 하나 줄인다</li>
        <li>audit_log 테이블에 "누가 언제 주문을 시도했다"는 기록을 남긴다</li>
        <li>결제 회사의 API를 불러 카드 결제를 한다</li>
      </ol>
      <p>
        넷 중 하나라도 실패하면 곤란해집니다. 주문은 저장됐는데 재고가 그대로면 팔 수 없는 물건을 팔게 되고, 재고만 줄면 물건이 사라집니다. 앞의 두 변경은 둘 다 일어나거나, 둘 다 일어나지 않아야 합니다. 데이터베이스가 이것을 보장해 주는 단위가 <T en="transaction">트랜잭션</T>이고, 이 성질을 <T en="atomicity">원자성</T>이라고 합니다. 데이터베이스 안에서 트랜잭션이 어떻게 이것을 지키는지는 <a href={lessonHref('cs-databases', 'transactions')}>데이터베이스의 트랜잭션 장</a>에서 봤습니다. 이 장의 질문은 그 다음입니다. 애플리케이션 코드의 어디에서 트랜잭션을 시작하고 끝낼까요?
      </p>

      <h2>경계를 서비스 메서드에 두는 이유</h2>
      <p>
        트랜잭션이 시작하고 끝나는 자리를 <T en="transaction boundary">트랜잭션 경계</T>라고 합니다. Spring에서는 메서드에 <code>@Transactional</code>을 붙이면, 그 메서드가 시작할 때 BEGIN, 정상으로 끝나면 COMMIT, 예외가 나가면 ROLLBACK이 저절로 일어납니다. 아무 데도 붙이지 않아도 트랜잭션이 아예 없지는 않습니다. Spring Data JPA의 저장소 메서드(<code>save</code>, <code>delete</code> …)에는 이미 <code>@Transactional</code>이 붙어 있어서, 저장소 호출 하나하나가 각자 트랜잭션이 됩니다.
      </p>
      <p>
        아래 그림의 저장소(<code>txstore.ts</code>)는 트랜잭션 안의 쓰기를 따로 모아 두었다가 커밋할 때만 테이블에 반영하고, 트랜잭션 밖의 쓰기는 바로 반영합니다(자동 커밋). 그 앞에서 Spring의 트랜잭션 프록시와 같은 규칙으로 BEGIN, COMMIT, ROLLBACK을 정합니다. 처음 설정은 서비스에 <code>@Transactional</code>을 잊은 경우입니다.
      </p>
      <OrderFigure />
      <p>
        처음 설정에서는 결제가 실패했는데 주문과 재고 감소가 이미 커밋되어 있습니다. 저장소 호출마다 트랜잭션이 따로 끝났기 때문입니다. 사용자는 오류 화면을 보고 다시 주문할 테고, 그러면 주문이 둘이 됩니다. "서비스에 경계"를 고르면 네 단계가 모두 T1 하나 안에서 일어나고, 결제가 실패하면 T1 전체가 롤백됩니다. 저장소 메서드의 <code>@Transactional</code>은 이미 열린 T1에 참여할 뿐 따로 커밋하지 않습니다.
      </p>
      <Callout kind="key">
        트랜잭션 경계는 "한 번에 성공하거나 실패해야 하는 일"의 경계와 같아야 합니다. 그 단위는 대개 사용 사례 하나, 곧 서비스 메서드 하나입니다. 저장소는 그 일의 조각만 알고, 컨트롤러는 HTTP를 다루느라 바쁘므로 둘 다 경계로는 알맞지 않습니다.
      </Callout>

      <h2>전파 방식: REQUIRED와 REQUIRES_NEW</h2>
      <p>
        <code>@Transactional</code> 메서드가 다른 <code>@Transactional</code> 메서드를 부르면 어떻게 될까요? 이것을 정하는 것이 <T en="propagation">전파 방식</T>입니다. 기본값 <code>REQUIRED</code>는 "이미 트랜잭션이 있으면 거기에 참여하고, 없으면 새로 시작한다"입니다. 그래서 placeOrder 안에서 부른 저장소와 AuditService는 모두 T1에 참여합니다. <code>REQUIRES_NEW</code>는 "언제나 새로 시작한다"입니다. 바깥 T1을 잠시 보류하고, 별도의 연결로 T2를 열어 따로 커밋하거나 롤백한 뒤 T1으로 돌아옵니다.
      </p>
      <p>
        감사 로그가 좋은 예입니다. 주문이 실패하더라도 "주문을 시도했다"는 기록은 남아야 합니다. 그림 1에서 "감사 로그는 남기기"를 고르면 결제가 실패해 T1이 롤백되어도 T2에서 이미 커밋한 audit_log 행은 남습니다.
      </p>
      <p>
        REQUIRED에는 덜 알려진 함정이 있습니다. 참여한 쪽은 트랜잭션을 직접 롤백할 수 없습니다. 트랜잭션의 주인은 처음 연 바깥 메서드이기 때문입니다. 그래서 안쪽 메서드에서 예외가 나가면, 프록시는 공유한 트랜잭션에 <T en="rollback-only">rollback-only</T> 표시만 해 둡니다. 바깥 메서드가 그 예외를 잡아 삼키고 정상으로 끝나면, 커밋하려는 순간 표시를 발견하고 롤백한 뒤 <code>UnexpectedRollbackException</code>을 던집니다. 그림 1의 "잡았는데 롤백"을 보세요. 개발자는 감사 로그 실패를 무시하려고 했지만, 주문 전체가 사라졌고 결제는 이미 끝났습니다.
      </p>
      <Callout kind="warn">
        안쪽에서 난 예외를 잡고 계속 가고 싶다면, 안쪽을 <code>REQUIRES_NEW</code>로 분리해 실패가 자기 트랜잭션 안에서 끝나게 하세요. 같은 트랜잭션을 공유하면서 "일부만 실패"하는 방법은 없습니다. 그림 1에서 "잡았는데 롤백"을 고른 뒤 전파만 REQUIRES_NEW로 바꿔 보면 주문이 정상으로 끝납니다.
      </Callout>

      <h2>롤백 규칙: 어떤 예외에서 되돌리나</h2>
      <p>
        Spring은 기본적으로 <strong>언체크 예외</strong>(<code>RuntimeException</code>과 <code>Error</code>의 하위 클래스)에서만 롤백합니다. <code>Exception</code>을 직접 상속한 체크 예외가 메서드를 빠져나가면, 트랜잭션은 <strong>커밋</strong>됩니다. 체크 예외는 "호출한 쪽이 처리할 수 있는 정상적인 결과 중 하나"라는 EJB 시절의 관례를 이어받은 것입니다.
      </p>
      <p>
        그림 1에서 "체크 예외"를 고르세요. 카드 승인이 거절되어 <code>PaymentDeclinedException</code>이 났는데, 주문과 재고 감소가 커밋되어 버립니다. 이 규칙을 바꾸려면 <code>rollbackFor = Exception.class</code>를 적습니다. 실패를 나타내는 예외는 처음부터 <code>RuntimeException</code>을 상속하게 만드는 팀도 많습니다.
      </p>
      <Code label="롤백 규칙 적기 (Java)">{`
@Transactional(rollbackFor = Exception.class)        // 체크 예외도 롤백
public void placeOrder(OrderRequest req) throws PaymentDeclinedException { ... }

@Transactional(noRollbackFor = CouponExpiredException.class)  // 이 예외는 커밋
public void applyCoupon(...) { ... }

public class PaymentDeclinedException extends RuntimeException { ... }  // 아예 언체크로`}</Code>

      <h2>트랜잭션 안에서 외부 API를 부르면</h2>
      <p>
        데이터베이스는 롤백할 수 있지만 결제 회사는 우리 트랜잭션을 모릅니다. "잡았는데 롤백"에서 본 것처럼, 결제 API가 성공한 뒤에 트랜잭션이 롤백되면 돈은 빠져나갔는데 주문은 없습니다. 반대로 결제 응답이 30초 걸리면, 그동안 트랜잭션은 데이터베이스 연결 하나와 재고 행의 락을 붙든 채 기다립니다. 주문이 몰리면 연결 풀이 바닥나 결제와 상관없는 요청까지 멈춥니다.
      </p>
      <p>그래서 외부 호출은 가능하면 트랜잭션 밖으로 뺍니다. 흔한 방법은 이렇습니다.</p>
      <ul>
        <li>주문을 "결제 대기" 상태로 먼저 커밋하고, 결제가 끝나면 다음 트랜잭션에서 "확정"으로 바꾼다</li>
        <li>결제 뒤 데이터베이스 저장이 실패하면 결제를 취소하는 보상 동작을 둔다</li>
        <li>같은 주문으로 두 번 결제되지 않게 결제 요청에 멱등 키(주문 번호)를 붙인다</li>
        <li>보낼 메시지를 같은 트랜잭션 안에서 outbox 테이블에 적어 두고, 커밋된 뒤에 따로 보낸다</li>
      </ul>

      <h2>@Transactional은 프록시다</h2>
      <p>
        <code>@Transactional</code>은 마법이 아니라 <a href={lessonHref('se-backend', 'aop')}>프록시와 AOP</a>에서 본 프록시입니다. 컨테이너는 OrderService 대신 그 앞에 선 프록시를 다른 빈에 주입하고, 프록시가 호출을 가로채 트랜잭션을 연 다음 진짜 객체의 메서드를 부릅니다. 그렇다면 진짜 객체 안에서 <code>this.placeOrder()</code>로 자기 메서드를 부를 때는 어떨까요? <code>this</code>는 프록시가 아니라 진짜 객체이므로, 호출이 프록시를 지나지 않고 <code>@Transactional</code>은 아무 일도 하지 않습니다.
      </p>
      <SelfCallFigure />
      <p>
        "checkout()에서 this.placeOrder()"에서는 저장소 호출마다 따로 커밋되어, 그림 1에서 경계를 잊었을 때와 똑같이 어긋납니다. 어노테이션은 분명히 붙어 있는데 말입니다. 가장 깔끔한 해결은 트랜잭션이 필요한 메서드를 다른 빈으로 옮기는 것입니다. 같은 이유로 기본 설정의 Spring은 private 메서드의 <code>@Transactional</code>도 적용하지 않습니다.
      </p>
      <Code label="자기 호출을 피하는 두 가지 방법 (Java)">{`
// 1) 다른 빈으로 분리: 호출이 OrderTxService의 프록시를 지난다
@Service
class OrderService {
    private final OrderTxService tx;
    public void checkout(Cart cart) { validate(cart); tx.placeOrder(toRequest(cart)); }
}

// 2) TransactionTemplate으로 경계를 코드에 직접 적기
public void checkout(Cart cart) {
    validate(cart);
    transactionTemplate.executeWithoutResult(status -> placeOrder(toRequest(cart)));
}`}</Code>
      <Callout kind="note">
        <code>@Transactional(readOnly = true)</code>는 조회만 하는 메서드에 붙입니다. Hibernate는 이때 <a href={lessonHref('se-backend', 'orm')}>영속성 컨텍스트</a>의 변경 감지용 사본을 만들지 않고 flush도 하지 않아 조금 가벼워지며, 일부 데이터베이스 드라이버는 읽기 전용 복제본으로 요청을 보낼 수 있습니다.
      </Callout>

      <Quiz
        q={<>placeOrder()는 <code>@Transactional</code>(기본 설정)이고, 그 안에서 부르는 AuditService.record()도 <code>@Transactional</code>(REQUIRED)입니다. record()에서 RuntimeException이 났고 placeOrder()는 그 예외를 잡아 로그만 남긴 뒤 결제까지 마쳤습니다. 결과는?</>}
        options={['감사 로그만 빠지고 주문과 재고 감소는 커밋된다', '결제까지 끝난 뒤 전체가 롤백되고 UnexpectedRollbackException이 난다', '예외를 잡았으므로 감사 로그까지 모두 커밋된다', 'record()에서 예외가 난 순간 전체가 롤백되고 결제는 시도하지 않는다']}
        answer={1}
        explain={<>record()는 placeOrder()의 T1에 참여했기 때문에 직접 롤백하지 못하고 T1에 rollback-only 표시만 합니다. placeOrder()가 예외를 삼키고 결제까지 마친 뒤 커밋하려 하면, 표시 때문에 롤백하고 UnexpectedRollbackException을 던집니다. 카드는 이미 결제된 뒤입니다. 그림 1의 "잡았는데 롤백"이 바로 이 경우이고, record()를 REQUIRES_NEW로 바꾸면 감사 로그만 빠지고 주문은 커밋됩니다.</>}
      />
    </>
  );
}

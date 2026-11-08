/**
 * A small transactional store and a Spring-like transaction interceptor, for the lesson on
 * transaction boundaries.
 *
 * The store has three tables (orders, stock, audit_log). Writes inside a physical transaction are
 * buffered and applied only on commit; writes outside any transaction are applied at once
 * (auto-commit). invoke() is what the @Transactional proxy does around a method: join the current
 * transaction (REQUIRED) or suspend it and start a new one (REQUIRES_NEW), and on an exception
 * either roll back or, when it only joined, mark the shared transaction rollback-only.
 * placeOrder() is the service flow the reader experiments with.
 */

export type Boundary = 'none' | 'repo' | 'service';
export type Propagation = 'REQUIRED' | 'REQUIRES_NEW';
export type FailAt = 'none' | 'stock' | 'audit' | 'payment';
export type ExKind = 'unchecked' | 'checked';
/** How the controller reaches placeOrder(): through the proxy, or from checkout() in the same class. */
export type CallPath = 'proxy' | 'self' | 'other-bean';

export interface Config {
  boundary: Boundary;
  auditProp: Propagation;
  failAt: FailAt;
  exKind: ExKind;
  /** @Transactional(rollbackFor = Exception.class) on placeOrder */
  rollbackForAll: boolean;
  /** placeOrder wraps auditService.record() in try/catch and carries on */
  catchAudit: boolean;
  path?: CallPath;
}

export type EvKind = 'call' | 'sql' | 'begin' | 'commit' | 'rollback' | 'join' | 'mark' | 'suspend' | 'resume' | 'throw' | 'catch' | 'http' | 'skip';
export interface Ev {
  depth: number;
  kind: EvKind;
  text: string;
  /** physical transaction the event belongs to; 0 = outside any transaction (auto-commit) */
  tx: number | null;
}

export interface DbState {
  orders: number[];
  stock: number;
  audit: string[];
}
export interface Outcome {
  events: Ev[];
  db: DbState;
  charged: boolean;
  response: { ok: boolean; status: number; text: string };
  /** inconsistencies between the tables and the outside world */
  problems: string[];
  notes: string[];
  /** physical transactions that were started */
  txCount: number;
}

export const INITIAL_STOCK = 5;
export const ORDER_ID = 1001;

class SimError {
  constructor(
    public name: string,
    public checked: boolean,
    public text: string,
  ) {}
}

const EX: Record<Exclude<FailAt, 'none'>, Record<ExKind, [string, string]>> = {
  stock: { unchecked: ['OutOfStockException', '재고가 없습니다'], checked: ['OutOfStockException', '재고가 없습니다'] },
  audit: { unchecked: ['DataIntegrityViolationException', 'audit_log 저장 실패'], checked: ['AuditException', '감사 로그 형식 오류'] },
  payment: { unchecked: ['PaymentGatewayException', '결제 서버 응답 없음'], checked: ['PaymentDeclinedException', '카드 승인 거절'] },
};

export function exceptionName(at: Exclude<FailAt, 'none'>, kind: ExKind) {
  return EX[at][kind][0];
}

type Op = { table: 'orders' } | { table: 'stock' } | { table: 'audit'; text: string };
interface PTx {
  id: number;
  ops: Op[];
  rollbackOnly: boolean;
}
interface TxDef {
  prop: Propagation;
  /** roll back on checked exceptions too */
  all: boolean;
  /** who declared it, for the log */
  owner: string;
}

export function placeOrder(cfg: Config): Outcome {
  const path = cfg.path ?? 'proxy';
  const db: DbState = { orders: [], stock: INITIAL_STOCK, audit: [] };
  let charged = false;
  const events: Ev[] = [];
  let current: PTx | null = null;
  let txCount = 0;

  const ev = (depth: number, kind: EvKind, text: string, tx: number | null = current ? current.id : 0) => events.push({ depth, kind, text, tx });
  const apply = (op: Op) => {
    if (op.table === 'orders') db.orders.push(ORDER_ID);
    else if (op.table === 'stock') db.stock -= 1;
    else db.audit.push(op.text);
  };
  const write = (depth: number, op: Op, sql: string) => {
    if (current) {
      current.ops.push(op);
      ev(depth, 'sql', sql);
    } else {
      apply(op);
      ev(depth, 'sql', `${sql}  → 바로 반영 (자동 커밋)`, 0);
    }
  };
  const commit = (depth: number, tx: PTx, why = '') => {
    for (const op of tx.ops) apply(op);
    ev(depth, 'commit', `COMMIT T${tx.id}${why}${tx.ops.length ? '' : ' (바꾼 것 없음)'}`, tx.id);
  };
  const rollback = (depth: number, tx: PTx, why: string) => {
    ev(depth, 'rollback', `ROLLBACK T${tx.id}: ${why}${tx.ops.length ? ` (쓰기 ${tx.ops.length}건 버림)` : ''}`, tx.id);
  };

  /** The @Transactional proxy around one method call. `def` null = no proxy advice. */
  function invoke(depth: number, name: string, def: TxDef | null, body: () => void) {
    ev(depth, 'call', name);
    if (!def) return body();
    const rollsBack = (e: SimError) => !e.checked || def.all;
    if (def.prop === 'REQUIRED' && current) {
      const tx = current;
      ev(depth, 'join', `T${tx.id}에 참여 (REQUIRED)`);
      try {
        body();
      } catch (e) {
        if (e instanceof SimError) {
          if (rollsBack(e)) {
            tx.rollbackOnly = true;
            ev(depth, 'mark', `예외(${e.name})가 ${def.owner}의 경계를 지나감 → T${tx.id}에 rollback-only 표시`, tx.id);
          } else ev(depth, 'skip', `예외(${e.name})가 체크 예외라 표시하지 않음`, tx.id);
        }
        throw e;
      }
      return;
    }
    const outer = current;
    if (outer) ev(depth, 'suspend', `T${outer.id} 잠시 보류 (REQUIRES_NEW)`, outer.id);
    const tx: PTx = { id: ++txCount, ops: [], rollbackOnly: false };
    current = tx;
    ev(depth, 'begin', `BEGIN T${tx.id} (${def.owner})`);
    const resume = () => {
      current = outer;
      if (outer) ev(depth, 'resume', `T${outer.id} 다시 이어감`, outer.id);
    };
    try {
      body();
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      if (rollsBack(e)) rollback(depth, tx, `${e.name} (${e.checked ? '체크 예외지만 rollbackFor에 해당' : '언체크 예외'})`);
      else if (tx.rollbackOnly) {
        rollback(depth, tx, 'rollback-only 표시가 있음');
        resume();
        throw new SimError('UnexpectedRollbackException', false, '커밋하려 했지만 rollback-only 표시 때문에 롤백됨');
      } else commit(depth, tx, `: 예외(${e.name})가 체크 예외라 커밋 (기본 규칙)`);
      resume();
      throw e;
    }
    if (tx.rollbackOnly) {
      rollback(depth, tx, '메서드는 정상 종료했지만 rollback-only 표시가 있음');
      resume();
      throw new SimError('UnexpectedRollbackException', false, 'Transaction silently rolled back because it has been marked as rollback-only');
    }
    commit(depth, tx);
    resume();
  }

  const fail = (depth: number, at: Exclude<FailAt, 'none'>) => {
    const [name, text] = EX[at][cfg.exKind];
    const e = new SimError(name, cfg.exKind === 'checked', text);
    ev(depth, 'throw', `throw ${name}: ${text}`);
    throw e;
  };

  const repoDef = (repo: string): TxDef | null => (cfg.boundary === 'none' ? null : { prop: 'REQUIRED', all: false, owner: repo });
  const serviceTx = cfg.boundary === 'service';
  const serviceDef: TxDef | null = serviceTx && path !== 'self' ? { prop: 'REQUIRED', all: cfg.rollbackForAll, owner: 'placeOrder' } : null;
  const auditDef: TxDef = { prop: cfg.auditProp, all: false, owner: 'AuditService.record' };

  const body = () => {
    invoke(2, 'orderRepository.save(order)', repoDef('orderRepository'), () => write(3, { table: 'orders' }, `insert into orders (id, item_id, qty) values (${ORDER_ID}, 7, 1)`));
    invoke(2, 'stockRepository.decrease(7, 1)', repoDef('stockRepository'), () => {
      if (cfg.failAt === 'stock') ev(3, 'sql', 'update stock set qty = qty - 1 where item_id = 7 and qty >= 1  → 0행 (재고 없음)');
      else write(3, { table: 'stock' }, 'update stock set qty = qty - 1 where item_id = 7 and qty >= 1');
    });
    if (cfg.failAt === 'stock') fail(2, 'stock');
    const audit = () =>
      invoke(2, 'auditService.record("주문 1001 시도")', auditDef, () => {
        if (cfg.failAt === 'audit') {
          ev(3, 'sql', "insert into audit_log (msg) values ('주문 1001 시도')  → 오류");
          fail(3, 'audit');
        }
        write(3, { table: 'audit', text: '주문 1001 시도' }, "insert into audit_log (msg) values ('주문 1001 시도')");
      });
    if (cfg.catchAudit) {
      try {
        audit();
      } catch (e) {
        if (!(e instanceof SimError)) throw e;
        ev(2, 'catch', `catch (${e.name}): 감사 로그는 실패해도 주문은 계속`);
      }
    } else audit();
    ev(2, 'http', 'paymentClient.charge(1001, 39000원)  → POST pay.example/charges');
    if (cfg.failAt === 'payment') fail(3, 'payment');
    charged = true;
    ev(3, 'http', '200 OK: 결제 승인 (카드에서 39,000원 빠져나감)');
  };

  let response: Outcome['response'] = { ok: true, status: 201, text: '201 Created: 주문 완료' };
  ev(0, 'call', 'POST /orders → OrderController.create()', 0);
  try {
    if (path === 'self') {
      invoke(1, 'orderService.checkout()  (프록시 통과, @Transactional 없음)', null, () => {
        ev(1, 'skip', 'this.placeOrder(): 같은 객체 안의 호출이라 프록시를 거치지 않음 → @Transactional 무시', 0);
        invoke(1, 'placeOrder()', null, body);
      });
    } else if (path === 'other-bean') {
      invoke(1, 'orderService.checkout()  (@Transactional 없음)', null, () => invoke(1, 'orderTxService.placeOrder()  (다른 빈의 프록시를 거침)', serviceDef, body));
    } else invoke(1, 'orderService.placeOrder()' + (serviceTx ? '' : '  (@Transactional 없음)'), serviceDef, body);
  } catch (e) {
    if (!(e instanceof SimError)) throw e;
    const status = e.name === 'OutOfStockException' ? 409 : e.name === 'PaymentDeclinedException' ? 402 : 500;
    response = { ok: false, status, text: `${status}: ${e.name}` };
    ev(0, 'throw', `컨트롤러까지 올라온 예외: ${e.name}`, 0);
  }

  const order = db.orders.length > 0;
  const stock = db.stock < INITIAL_STOCK;
  const problems: string[] = [];
  if (order && !stock) problems.push('주문은 저장됐는데 재고는 그대로입니다.');
  if (!order && stock) problems.push('주문은 없는데 재고만 줄었습니다.');
  if (order && !charged) problems.push('결제되지 않은 주문이 저장됐습니다.');
  if (charged && !order) problems.push('카드에서 돈은 빠져나갔는데 주문이 없습니다.');
  if (!response.ok && order) problems.push('사용자는 실패 응답을 받았는데 주문은 남았습니다. 다시 누르면 주문이 둘이 됩니다.');

  const notes: string[] = [];
  if (db.audit.length && !order) notes.push('주문은 되돌려졌지만 감사 로그는 남았습니다.');
  if (!db.audit.length && order) notes.push('주문은 남았지만 감사 로그는 없습니다.');

  return { events, db, charged, response, problems, notes, txCount };
}

/** The four facts the figure compares: is everything there, or nothing? */
export function consistent(o: Outcome) {
  return o.problems.length === 0;
}

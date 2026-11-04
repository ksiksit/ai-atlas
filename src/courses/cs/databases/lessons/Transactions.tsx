import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { prefersReducedMotion } from '../../../../lib/canvas';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { DbMsg } from './DbTable';
import { MODE_HOW, MODE_NAMES, PAGES, SCENARIOS, TOTAL, expected, opText, recover, replay, runnable, verdict, walState, walSteps, won, type LogRec, type Mode, type ScenarioId, type TxId } from './txn';
import './db.css';

/* ─────────────── Figure 1: two transactions, one balance ─────────────── */

const MODES: Mode[] = ['ru', 'rc', 'rr', 'ser'];
const STATUS_TEXT = { active: '진행 중', waiting: '락 대기', committed: '커밋됨', aborted: '중단됨' } as const;
const STEP_MS = 750;

function ScheduleFigure() {
  const [scId, setScId] = useState<ScenarioId>('lost');
  const [mode, setMode] = useState<Mode>('rc');
  const sc = SCENARIOS.find((x) => x.id === scId)!;
  const [schedule, setSchedule] = useState<TxId[]>(sc.order);
  const [playing, setPlaying] = useState(false);
  const sim = useMemo(() => replay(sc, mode, schedule), [sc, mode, schedule]);
  const v = verdict(sc, sim);

  // the problem interleaving, one operation at a time
  useEffect(() => {
    if (!playing) return;
    if (schedule.length >= sc.order.length) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setSchedule(sc.order.slice(0, schedule.length + 1)), schedule.length ? STEP_MS : 250);
    return () => clearTimeout(id);
  }, [playing, schedule, sc]);

  const play = () => {
    if (prefersReducedMotion()) {
      setSchedule(sc.order);
      return;
    }
    setSchedule([]);
    setPlaying(true);
  };
  const pick = (id: ScenarioId) => {
    const next = SCENARIOS.find((x) => x.id === id)!;
    setScId(id);
    setPlaying(false);
    setSchedule(next.order);
  };
  const stepTx = (t: TxId) => {
    setPlaying(false);
    setSchedule([...schedule, t]);
  };
  const latest = sim.versions[sim.versions.length - 1].val;
  const locks = [sim.S.length ? `S: ${sim.S.map((t) => 'T' + t).join(', ')}` : '', sim.X ? `X: T${sim.X}` : ''].filter(Boolean).join(' · ') || '없음';
  const pending = ([1, 2] as TxId[]).filter((t) => sim.pending[t] !== undefined).map((t) => `T${t}: ${won(sim.pending[t]!)}`).join(', ') || '없음';

  return (
    <Figure
      no={1}
      title="두 트랜잭션, 하나의 잔액"
      hint="실행 순서를 직접 고르거나, 격리 수준을 바꿔 같은 순서를 다시 보세요"
      caption={<>두 트랜잭션이 같은 계좌의 잔액(처음 {won(sc.init)})을 읽고 씁니다. "T1 실행"과 "T2 실행"을 눌러 연산이 끼어드는 순서를 정하면, 아래 표에 일어난 일이 시간 순서대로 쌓입니다. 격리 수준을 바꾸면 같은 순서를 그 규칙으로 처음부터 다시 실행합니다. 락을 기다리는 트랜잭션은 상대가 끝나는 순간 자동으로 이어서 실행됩니다. 단순화한 모델이며, 실제 데이터베이스마다 세부 동작은 조금씩 다릅니다.</>}
    >
      <div className="controls row">
        <Seg label="상황" value={scId} onChange={pick} options={SCENARIOS.map((x) => ({ value: x.id, label: x.name }))} />
      </div>
      <Seg label="격리 수준" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: <span className="mono tx-mode">{MODE_NAMES[m]}</span> }))} />
      <div className="step-note">{MODE_HOW[mode]}</div>
      <div className="tx-cards">
        {([1, 2] as TxId[]).map((t) => {
          const x = sim.tx[t];
          return (
            <div key={t} className="tx-card" data-t={t} data-s={x.status}>
              <div className="tx-head">
                <strong>T{t}</strong>
                <span>{sc.story[t]}</span>
                <span className="tx-status">{STATUS_TEXT[x.status]}</span>
              </div>
              <ol className="tx-ops">
                {sc.ops[t].map((op, k) => (
                  <li key={k} data-s={k < x.pc ? 'done' : k === x.pc && x.status === 'active' ? 'next' : k === x.pc && x.status === 'waiting' ? 'wait' : x.status === 'aborted' ? 'dead' : undefined}>
                    {opText(op)}
                  </li>
                ))}
              </ol>
              <Button small primary={runnable(sim, sc, t)} onClick={() => stepTx(t)} disabled={!runnable(sim, sc, t) || playing}>
                T{t} 실행
              </Button>
            </div>
          );
        })}
      </div>
      <div className="btn-row">
        <Button small onClick={play} disabled={playing}>
          ▶ 문제의 순서로 재생
        </Button>
        <Button small onClick={() => (setPlaying(false), setSchedule(schedule.slice(0, -1)))} disabled={!schedule.length || playing}>
          한 단계 취소
        </Button>
        <Button small onClick={() => (setPlaying(false), setSchedule([]))}>
          처음부터
        </Button>
      </div>
      <div className="dbt-wrap" role="region" aria-label="실행 기록" tabIndex={0}>
        <table className="dbt compact tx-log">
          <thead>
            <tr>
              <th>#</th>
              <th>T1</th>
              <th>T2</th>
              <th data-num>커밋된 잔액</th>
            </tr>
          </thead>
          <tbody>
            {sim.log.map((e, k) => (
              <tr key={k} data-k={e.kind}>
                <td data-num>{k + 1}</td>
                <td>{e.t === 1 ? e.text : ''}</td>
                <td>{e.t === 2 ? e.text : ''}</td>
                <td data-num>{won(e.committed)}</td>
              </tr>
            ))}
            {!sim.log.length && (
              <tr>
                <td colSpan={4} className="dbt-empty">
                  아직 아무것도 실행하지 않았습니다. T1 또는 T2를 눌러 시작하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="readouts">
        <Readout label="커밋된 잔액" value={won(latest)} />
        <Readout label="커밋 전 쓰기" value={<span style={{ fontSize: '0.875rem' }}>{pending}</span>} />
        <Readout label="쥐고 있는 락" value={<span style={{ fontSize: '0.875rem' }}>{locks}</span>} />
        {mode === 'rr' && <Readout label="저장된 버전" value={<span style={{ fontSize: '0.875rem' }}>{sim.versions.map((x) => `${(x.val / 10_000).toFixed(0)}만${x.by ? `(T${x.by})` : ''}`).join(' → ')}</span>} />}
      </div>
      <DbMsg kind={!v.done ? 'info' : v.bad ? 'err' : 'ok'}>{v.text}</DbMsg>
    </Figure>
  );
}

/* ─────────────── Figure 2: write-ahead log and a power cut ─────────────── */

const recText = (r: LogRec) => (r.kind === 'UPDATE' ? `#${r.lsn} T${r.t} ${r.page}: ${(r.old! / 10_000).toFixed(0)}만 → ${(r.val! / 10_000).toFixed(0)}만` : `#${r.lsn} T${r.t} ${r.kind}`);

function WalFigure() {
  const [wal, setWal] = useState(true);
  const steps = useMemo(() => walSteps(wal), [wal]);
  const s = useStepper(steps.length, 1, wal);
  const [crash, setCrash] = useState<number | null>(null);
  const [recovered, setRecovered] = useState(false);
  const at = crash ?? s.i;
  const st = useMemo(() => walState(wal, at), [wal, at]);
  const rec = useMemo(() => (crash !== null ? recover(st, wal) : null), [crash, st, wal]);
  const disk = recovered && rec ? rec.disk : st.disk;
  const exp = expected(st.committed);
  const sum = PAGES.reduce((a, p) => a + disk[p], 0);
  const matches = PAGES.every((p) => disk[p] === exp[p]);
  const off = crash !== null;

  const restart = () => {
    setCrash(null);
    setRecovered(false);
    s.go(0);
  };
  const toggleWal = (x: boolean) => {
    setWal(x);
    setCrash(null);
    setRecovered(false);
  };

  return (
    <Figure
      no={2}
      title="로그 먼저 쓰기와 정전 복구"
      hint="단계를 넘기다가 아무 때나 전원을 꺼 보세요"
      caption={<>두 이체 T1(A → B 3만 원)과 T2(C → A 1만 원)가 동시에 진행됩니다. 왼쪽은 전원이 꺼지면 사라지는 메모리, 오른쪽은 남는 디스크입니다. 노란 점은 메모리에서 고쳤지만 아직 디스크에 쓰지 않은(dirty) 페이지입니다. 전원을 끈 뒤 "복구"를 누르면, 디스크에 남은 것만으로 데이터베이스를 다시 세웁니다. 올바른 상태란 커밋을 마친 이체는 모두 반영되고, 마치지 못한 이체는 전혀 반영되지 않은 상태입니다.</>}
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Check label="로그 먼저 쓰기(WAL) 사용" checked={wal} onChange={toggleWal} />
        </div>
      </div>
      <div className="op-list wal-steps" aria-label="진행 단계">
        {steps.map((x, k) => (
          <button key={k} type="button" className="op-chip" data-s={k <= at ? 'done' : 'future'} data-cur={k === at || undefined} disabled={off} onClick={() => s.go(k)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="step-note" aria-live="polite">
            {off ? <strong style={{ color: 'var(--bad)' }}>전원이 꺼졌습니다. 메모리의 내용은 모두 사라졌습니다.</strong> : st.note}
          </div>
          <div className="wal-panels">
            <div className="wal-panel" data-off={off || undefined}>
              <div className="wal-title">메모리 (휘발성)</div>
              <div className="wal-sub">버퍼 풀</div>
              <div className="wal-pages">
                {PAGES.map((p) => {
                  const b = st.buf[p];
                  return (
                    <div key={p} className="wal-page" data-dirty={(b?.dirty && !off) || undefined}>
                      <span className="wal-pn">{p}</span>
                      <span className="mono">{off || !b ? '—' : won(b.val)}</span>
                    </div>
                  );
                })}
              </div>
              {wal && (
                <>
                  <div className="wal-sub">로그 버퍼</div>
                  <ul className="wal-log">
                    {st.logBuf.map((r) => (
                      <li key={r.lsn} data-lost={off || undefined}>
                        {recText(r)}
                      </li>
                    ))}
                    {!st.logBuf.length && <li className="wal-empty">비어 있음</li>}
                  </ul>
                </>
              )}
            </div>
            <div className="wal-panel">
              <div className="wal-title">디스크 (비휘발성)</div>
              <div className="wal-sub">데이터 파일{recovered ? ' (복구 후)' : ''}</div>
              <div className="wal-pages">
                {PAGES.map((p) => (
                  <div key={p} className="wal-page" data-bad={(off && recovered ? disk[p] !== exp[p] : false) || undefined} data-fixed={(recovered && rec && rec.disk[p] !== st.disk[p]) || undefined}>
                    <span className="wal-pn">{p}</span>
                    <span className="mono">{won(disk[p])}</span>
                  </div>
                ))}
              </div>
              {wal && (
                <>
                  <div className="wal-sub">로그 파일</div>
                  <ul className="wal-log">
                    {st.logDisk.map((r) => (
                      <li key={r.lsn} data-k={r.kind}>
                        {recText(r)}
                      </li>
                    ))}
                    {!st.logDisk.length && <li className="wal-empty">비어 있음</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
          {recovered && rec && (
            <ul className="wal-rec" aria-label="복구 과정">
              {rec.lines.map((l, k) => (
                <li key={k} data-k={l.kind}>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="controls">
          {!off ? <StepControls s={s} id="wal-speed" maxSpeed={3} /> : null}
          <div className="btn-row">
            {!off ? (
              <Button small primary onClick={() => setCrash(s.i)}>
                전원 끄기
              </Button>
            ) : (
              <>
                <Button small primary onClick={() => setRecovered(true)} disabled={recovered}>
                  다시 켜고 복구
                </Button>
                <Button small onClick={restart}>
                  처음부터
                </Button>
              </>
            )}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="디스크의 A+B+C" value={won(sum)} color={sum === TOTAL ? undefined : 'var(--bad)'} />
            <Readout label="커밋 완료" value={st.committed.length ? st.committed.map((t) => 'T' + t).join(', ') : '없음'} />
            <Readout label="올바른 상태" value={<span style={{ fontSize: '0.8125rem' }}>{PAGES.map((p) => `${p} ${(exp[p] / 10_000).toFixed(0)}만`).join(' · ')}</span>} />
            <Readout label="판정" value={!off ? '실행 중' : !recovered ? '복구 전' : matches ? '일치 ✓' : '어긋남 ✗'} color={!off || !recovered ? undefined : matches ? 'var(--good)' : 'var(--bad)'} />
          </div>
          {off && recovered && (
            <DbMsg kind={matches ? 'ok' : 'err'}>
              {matches
                ? wal
                  ? '로그만으로 커밋된 이체는 다시 하고(REDO), 커밋되지 않은 이체는 되돌렸습니다(UNDO).'
                  : '이번에는 운 좋게 맞았습니다. 다른 순간에 꺼 보세요.'
                : `디스크가 올바른 상태와 다릅니다. 합계가 ${won(sum)}이라 ${won(Math.abs(TOTAL - sum))}이 ${sum < TOTAL ? '사라졌습니다' : '생겨났습니다'}.`}
            </DbMsg>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Transactions() {
  return (
    <>
      <h2>여러 문장을 하나처럼</h2>
      <p>
        A 계좌에서 B 계좌로 3만 원을 보내려면 SQL 문장이 두 개 필요합니다. A에서 빼고, B에 더하고. 첫 문장이 끝난 직후 서버가 멈추면 3만 원은 어디에도 없게 됩니다. 반대로 둘 사이에 다른 사람이 A의 잔액을 읽으면 아직 B에 도착하지 않은 돈을 보게 됩니다. 이런 일을 막으려고 데이터베이스는 여러 문장을 하나로 묶는 <T en="transaction">트랜잭션</T>을 제공합니다.
      </p>
      <Code label="계좌 이체 트랜잭션 (SQL)">{`
BEGIN;
UPDATE accounts SET balance = balance - 30000 WHERE id = 'A';
UPDATE accounts SET balance = balance + 30000 WHERE id = 'B';
COMMIT;      -- 여기까지 와야 두 변경이 함께 확정된다
-- 중간에 문제가 생기면 ROLLBACK; 으로 둘 다 없던 일로 한다`}</Code>
      <p>트랜잭션이 지키는 네 가지 성질을 머리글자를 따서 <T en="ACID">ACID</T>라고 부릅니다.</p>
      <ul>
        <li>
          <T en="Atomicity">원자성</T>: 전부 일어나거나 전혀 일어나지 않습니다. 이체가 반만 되는 일은 없습니다.
        </li>
        <li>
          <T en="Consistency">일관성</T>: 트랜잭션이 끝나면 제약 조건(잔액 ≥ 0, 외래 키 등)이 다시 성립합니다.
        </li>
        <li>
          <T en="Isolation">격리성</T>: 동시에 실행되는 트랜잭션이 서로의 중간 상태를 보지 않고, 마치 하나씩 차례로 실행된 것처럼 보입니다.
        </li>
        <li>
          <T en="Durability">지속성</T>: "커밋 완료"라고 답한 변경은 그 직후에 전원이 나가도 사라지지 않습니다.
        </li>
      </ul>
      <p>
        이 장은 그중 가장 까다로운 격리성을 먼저 보고, 원자성과 지속성을 동시에 해결하는 로그로 마무리합니다.
      </p>

      <h2>동시에 실행하면 생기는 일</h2>
      <p>
        은행 서버는 수천 개의 요청을 동시에 처리합니다. 트랜잭션을 하나씩 차례로 실행하면 안전하지만 너무 느리므로, 데이터베이스는 여러 트랜잭션의 연산을 서로 끼워 넣어 실행합니다. 끼워 넣는 순서가 나쁘면 차례로 실행했을 때는 절대 나올 수 없는 결과가 나옵니다. 대표적인 <T en="read phenomena">이상 현상</T> 세 가지를 직접 만들어 봅시다.
      </p>
      <ul>
        <li>
          <T en="lost update">갱신 손실</T>: 둘이 같은 값을 읽고 각자 계산해 쓰면, 나중에 쓴 쪽이 먼저 쓴 쪽을 덮어씁니다.
        </li>
        <li>
          <T en="dirty read">더티 읽기</T>: 아직 커밋되지 않은 값을 읽습니다. 그 트랜잭션이 롤백하면 존재한 적 없는 값을 본 셈입니다.
        </li>
        <li>
          <T en="non-repeatable read">반복 불가능 읽기</T>: 한 트랜잭션 안에서 같은 값을 두 번 읽었는데, 그 사이에 남이 커밋해서 값이 달라집니다.
        </li>
      </ul>
      <ScheduleFigure />
      <p>
        처음 화면은 READ COMMITTED에서의 갱신 손실입니다. 두 트랜잭션이 모두 10만 원을 읽고, T1이 7만 원을 쓰고 커밋한 뒤, T2가 자기가 읽은 10만 원에서 5만 원을 빼 5만 원을 씁니다. 8만 원이 빠져나갔는데 잔액은 3만 원만 줄었습니다. 순서는 그대로 두고 격리 수준만 REPEATABLE READ로 바꾸면 T2가 쓰려는 순간 오류로 중단되고, SERIALIZABLE로 바꾸면 두 트랜잭션이 서로의 락을 기다리는 교착 상태가 생겨 데이터베이스가 T2를 중단합니다. 어느 쪽이든 잔액은 정확하고, 중단된 T2는 처음부터 다시 실행하면 됩니다.
      </p>

      <h2>격리 수준</h2>
      <p>
        완벽한 격리는 비쌉니다. 그래서 SQL 표준은 무엇을 허용하는지에 따라 네 가지 <T en="isolation level">격리 수준</T>을 정해 두고, 개발자가 고르게 했습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>격리 수준</th>
              <th>더티 읽기</th>
              <th>반복 불가능 읽기</th>
              <th>팬텀</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['READ UNCOMMITTED', '생길 수 있음', '생길 수 있음', '생길 수 있음'],
              ['READ COMMITTED', '막음', '생길 수 있음', '생길 수 있음'],
              ['REPEATABLE READ', '막음', '막음', '생길 수 있음'],
              ['SERIALIZABLE', '막음', '막음', '막음'],
            ].map((r) => (
              <tr key={r[0]}>
                <td className="mono">{r[0]}</td>
                {r.slice(1).map((c, k) => (
                  <td key={k} style={{ color: c === '막음' ? 'var(--good)' : 'var(--bad)' }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <T en="phantom">팬텀</T>은 반복 불가능 읽기의 범위판입니다. "잔액이 100만 원 넘는 계좌"를 두 번 셌는데 그 사이에 남이 계좌를 새로 만들어 개수가 달라지는 경우입니다. 이 표는 최소한의 약속이고, 실제 데이터베이스는 대개 더 많이 막습니다. PostgreSQL은 READ UNCOMMITTED를 READ COMMITTED처럼 동작시켜 더티 읽기를 아예 허용하지 않고, REPEATABLE READ에서 팬텀도 막습니다. 기본값은 PostgreSQL과 Oracle이 READ COMMITTED, MySQL InnoDB가 REPEATABLE READ입니다.
      </p>
      <Callout kind="warn">
        기본값인 READ COMMITTED에서는 그림 1의 갱신 손실이 실제로 일어납니다. 애플리케이션이 잔액을 SELECT로 읽고, 코드에서 빼고, UPDATE로 쓰는 흔한 코드가 바로 그 모양입니다. 막는 방법은 세 가지입니다. 계산을 데이터베이스 안에서 한 문장으로 하거나(<code>SET balance = balance - 30000</code>), 읽을 때 <code>SELECT ... FOR UPDATE</code>로 미리 쓰기 락을 걸거나, 격리 수준을 올리고 중단되면 다시 시도하는 것입니다. MySQL의 REPEATABLE READ는 PostgreSQL과 달리 이 경우를 오류로 막아 주지 않으니 특히 조심해야 합니다.
      </Callout>
      <Code label="갱신 손실 막기 (SQL)">{`
-- 1) 한 문장으로: 읽기와 쓰기가 한 번에 일어나 끼어들 틈이 없다
UPDATE accounts SET balance = balance - 30000 WHERE id = 'A' AND balance >= 30000;

-- 2) 비관적 락: 읽는 순간 행에 쓰기 락을 걸어 다른 쓰기를 기다리게 한다
BEGIN;
SELECT balance FROM accounts WHERE id = 'A' FOR UPDATE;
UPDATE accounts SET balance = 70000 WHERE id = 'A';
COMMIT;`}</Code>

      <h2>락: 2단계 락킹</h2>
      <p>
        격리를 지키는 첫 번째 방법은 <a href={lessonHref('cs-operating-systems', 'locks')}>락</a>입니다. 읽기 전에는 <T en="shared lock">공유 락</T>(S, 여럿이 함께 쥘 수 있음)을, 쓰기 전에는 <T en="exclusive lock">배타 락</T>(X, 혼자만 쥘 수 있음)을 얻습니다. 여기에 규칙 하나를 더합니다. 락을 하나라도 풀기 시작하면 더는 새 락을 얻지 않습니다. 락을 얻기만 하는 단계와 풀기만 하는 단계로 나뉜다고 해서 <T en="two-phase locking">2단계 락킹</T>(2PL)이라고 하고, 이 규칙을 지키는 트랜잭션들의 결과는 언제나 어떤 순서로 하나씩 실행한 결과와 같다는 것이 증명되어 있습니다. 실제로는 모든 락을 커밋할 때 한꺼번에 푸는 엄격한 2PL을 씁니다. 그래야 남이 커밋 전 값을 읽을 수 없습니다.
      </p>
      <p>
        락의 대가는 기다림과 <T en="deadlock">교착 상태</T>입니다. 그림 1의 SERIALIZABLE에서 두 트랜잭션은 모두 공유 락을 쥔 채 상대가 공유 락을 풀어야 얻을 수 있는 배타 락을 기다립니다. 누구도 먼저 양보하지 않으니 영원히 기다리게 되므로, 데이터베이스는 기다림의 고리를 찾아 한쪽을 강제로 중단합니다. 그래서 2PL을 쓰는 애플리케이션은 "중단되면 다시 시도"를 늘 준비해 둡니다.
      </p>

      <h2>MVCC: 읽기는 옛 버전을 본다</h2>
      <p>
        락만 쓰면 오래 걸리는 보고서 쿼리 하나가 읽는 동안 그 행에 대한 모든 쓰기가 멈춥니다. 오늘날 대부분의 데이터베이스는 <T en="multi-version concurrency control">MVCC</T>로 이 문제를 피합니다. 행을 고칠 때 덮어쓰지 않고 새 버전을 만들어 두고, 트랜잭션마다 시작 시점의 <T en="snapshot">스냅숏</T>을 정해 그때 커밋되어 있던 버전만 보여 줍니다. 읽는 쪽은 쓰는 쪽을 기다리지 않고, 쓰는 쪽도 읽는 쪽을 기다리지 않습니다.
      </p>
      <p>
        그림 1에서 REPEATABLE READ를 고르면 "저장된 버전"에 잔액의 버전들이 쌓이는 것이 보입니다. 반복 불가능 읽기 상황에서 T2가 7만 원을 커밋한 뒤에도 T1은 자기 스냅숏의 10만 원을 계속 읽습니다. PostgreSQL은 옛 버전을 표 안에 그대로 두었다가 아무도 보지 않게 되면 <code>VACUUM</code>이 치우고, MySQL InnoDB와 Oracle은 옛 버전을 되돌리기 로그(undo log)에서 다시 만들어 냅니다.
      </p>
      <Callout kind="note">
        스냅숏 격리도 완벽하지는 않습니다. 당직 의사가 두 명 이상 남아야 하는 병원에서, 두 의사가 동시에 "나 말고도 한 명 더 있네"를 확인하고 각자 자기 행만 고쳐 퇴근하면 당직이 0명이 됩니다. 두 트랜잭션이 서로 다른 행을 썼으므로 충돌로 잡히지 않는 이 현상을 <T en="write skew">쓰기 왜곡</T>이라고 합니다. PostgreSQL의 SERIALIZABLE은 MVCC 위에서 이런 읽기-쓰기 의존의 고리를 추적해 한쪽을 중단하는 SSI(serializable snapshot isolation)로 이것까지 막습니다.
      </Callout>

      <h2>원자성과 지속성: 로그</h2>
      <p>
        이제 전원이 나가는 경우입니다. 데이터베이스는 성능을 위해 고친 페이지를 메모리(버퍼 풀)에 모아 두었다가 나중에 디스크에 씁니다. 커밋할 때마다 흩어진 데이터 페이지를 모두 디스크에 쓰면 무작위 쓰기가 너무 많기 때문입니다. 그러면 커밋한 변경이 아직 메모리에만 있을 때 전원이 나가면 어떻게 될까요? 반대로 커밋 전 변경이 이미 디스크에 쓰였다면요?
      </p>
      <p>
        답은 <T en="write-ahead logging">로그 먼저 쓰기</T>(WAL)입니다. 데이터 페이지를 고치기 전에 "T1이 A를 10만에서 7만으로 바꿈"이라는 기록을 로그 파일 끝에 덧붙입니다. 규칙은 두 가지입니다. 페이지를 디스크에 쓰기 전에 그 변경의 로그가 먼저 디스크에 있어야 하고, 커밋은 COMMIT 기록까지 로그를 디스크에 쓴 뒤에야 완료됩니다. 로그는 파일 끝에 이어 쓰기만 하므로 순차 쓰기라 빠르고, 여러 트랜잭션의 커밋을 모아 한 번에 쓸 수도 있습니다.
      </p>
      <WalFigure />
      <p>
        WAL을 켠 채 "T1 COMMIT" 바로 다음에 전원을 꺼 보세요. 데이터 파일에는 C만 고쳐져 있고 A와 B는 그대로입니다. 그래도 복구하면 로그를 처음부터 다시 적용해(REDO) T1의 이체를 살려 내고, COMMIT 기록이 없는 T2의 변경은 거꾸로 되돌려(UNDO) C를 5만 원으로 돌려놓습니다. 이제 WAL을 끄고 "T1 COMMIT: A 쓰기" 다음에 꺼 보세요. A에서는 3만 원이 빠졌는데 B에는 들어가지 않았고, 커밋하지 않은 T2가 C에서 뺀 1만 원도 이미 디스크에 있습니다. 로그가 없으니 무엇을 되돌려야 하는지 알 방법이 없습니다.
      </p>
      <Callout kind="intuition">
        로그는 데이터베이스의 진짜 원본이고, 데이터 파일은 로그를 빨리 읽으려고 만들어 둔 캐시에 가깝습니다. 같은 생각이 <a href={lessonHref('cs-operating-systems', 'file-systems')}>파일 시스템</a>의 저널링, 복제 서버로 로그를 흘려보내는 데이터베이스 복제, 이벤트 소싱에 그대로 쓰입니다. 실제 복구 알고리즘 ARIES(1992)는 체크포인트에서부터 로그를 읽어 같은 REDO-UNDO를 훨씬 정교하게 합니다.
      </Callout>

      <Callout kind="key">
        트랜잭션은 여러 문장을 ACID를 지키는 하나의 단위로 묶습니다. 동시에 실행되는 트랜잭션은 갱신 손실, 더티 읽기, 반복 불가능 읽기 같은 이상 현상을 만들 수 있고, 격리 수준은 그중 무엇을 허용할지 정합니다. 격리는 2단계 락킹(기다림과 교착 상태가 대가)이나 MVCC(버전과 스냅숏, 쓰기 충돌 시 중단)로 구현합니다. 원자성과 지속성은 로그 먼저 쓰기가 맡습니다. 커밋은 로그가 디스크에 닿는 순간이고, 정전 뒤에는 로그로 커밋된 것은 다시 하고 커밋되지 않은 것은 되돌립니다.
      </Callout>
      <Quiz
        q="WAL을 쓰는 데이터베이스가 이체 트랜잭션에 '커밋 완료'라고 답한 직후 정전이 났다. 이체로 고친 데이터 페이지는 아직 메모리에만 있었다. 다시 켰을 때 어떻게 되나?"
        options={['데이터 파일에 없으므로 이체는 사라진다. 사용자가 다시 해야 한다', 'COMMIT 기록을 포함한 로그가 이미 디스크에 있으므로, 복구가 로그를 다시 적용해 이체를 살려 낸다', '데이터 파일과 로그가 어긋나므로 데이터베이스를 쓸 수 없게 된다', '커밋된 트랜잭션도 안전을 위해 모두 되돌린다']}
        answer={1}
        explain={<>WAL에서 커밋 완료는 "COMMIT 기록까지 로그가 디스크에 있다"는 뜻입니다. 데이터 페이지는 아직 쓰이지 않았어도 로그에 바뀐 값이 모두 적혀 있으므로, 복구의 REDO 단계가 그대로 다시 적용합니다. 이것이 지속성입니다. 되돌리는 것은 COMMIT 기록이 없는 트랜잭션뿐입니다.</>}
      />
    </>
  );
}

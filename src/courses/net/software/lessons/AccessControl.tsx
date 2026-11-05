import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { ACTIONS, DEFAULT_MATRIX, ME, ORDERS, PATHS, READ, RESOURCES, SERVICE_GRANTS, USERS, USER_NOTE, WRITE, abacPayroll, bitsText, deputy, getOrder, grants, roles, scan, type DeputyMode, type Matrix, type Path } from './acl';
import './software.css';
import './access.css';

/* ─────────────── Figure 1: one policy, three ways to store it ─────────────── */

type View = 'acl' | 'cap' | 'rbac';

function MatrixFigure() {
  const [m, setM] = useState<Matrix>(() => DEFAULT_MATRIX.map((r) => r.slice()));
  const [view, setView] = useState<View>('acl');
  const toggle = (u: number, r: number, bit: number) => setM((x) => x.map((row, i) => (i === u ? row.map((b, j) => (j === r ? b ^ bit : b)) : row)));
  const rs = useMemo(() => roles(m), [m]);
  const g = grants(m);
  const changed = m.some((row, i) => row.some((b, j) => b !== DEFAULT_MATRIX[i][j]));

  return (
    <Figure
      no={1}
      title="접근 제어 행렬과 그것을 저장하는 세 가지 방법"
      hint="칸의 읽기·쓰기를 눌러 권한을 바꿔 보세요"
      caption={<>가상의 팀 공간 "모래시계"의 사용자 다섯 명과 자원 네 개입니다. 행렬의 한 칸은 "누가 무엇에 무엇을 할 수 있는가"입니다. 접근 제어 목록(ACL)은 행렬을 자원별로(세로로) 잘라 자원 곁에 두고, 권한 목록(capability)은 사용자별로(가로로) 잘라 사용자에게 줍니다. 역할(RBAC)은 똑같은 가로줄을 가진 사용자들을 한 역할로 묶습니다.</>}
    >
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="ac-matrix">
          <thead>
            <tr>
              <th scope="col">사용자</th>
              {RESOURCES.map((r) => (
                <th key={r} scope="col">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {USERS.map((u, ui) => (
              <tr key={u}>
                <th scope="row">
                  {u}
                  <small>{USER_NOTE[u]}</small>
                </th>
                {RESOURCES.map((r, ri) => (
                  <td key={r}>
                    <span className="ac-cell">
                      {[READ, WRITE].map((bit, k) => (
                        <button key={bit} type="button" className="ac-bit" aria-pressed={(m[ui][ri] & bit) !== 0} aria-label={`${u}의 ${r} ${ACTIONS[k]}`} onClick={() => toggle(ui, ri, bit)}>
                          {ACTIONS[k][0]}
                        </button>
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="controls row">
        <Seg
          label="저장하는 방법"
          value={view}
          onChange={setView}
          options={[
            { value: 'acl', label: '접근 제어 목록 (자원별)' },
            { value: 'cap', label: '권한 목록 (사용자별)' },
            { value: 'rbac', label: '역할 (RBAC)' },
          ]}
        />
        <Button small onClick={() => setM(DEFAULT_MATRIX.map((r) => r.slice()))} disabled={!changed}>
          처음 행렬로
        </Button>
      </div>
      <div className="ac-lists" aria-live="polite">
        {view === 'acl' &&
          RESOURCES.map((r, ri) => {
            const items = USERS.map((u, ui) => [u, bitsText(m[ui][ri])]).filter(([, t]) => t);
            return (
              <div key={r} className="ac-list">
                <h4>{r}</h4>
                {items.length ? (
                  <ul>
                    {items.map(([u, t]) => (
                      <li key={u}>
                        {u}: {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="none">아무도 없음</span>
                )}
              </div>
            );
          })}
        {view === 'cap' &&
          USERS.map((u, ui) => {
            const items = RESOURCES.map((r, ri) => [r, bitsText(m[ui][ri])]).filter(([, t]) => t);
            return (
              <div key={u} className="ac-list">
                <h4>{u}의 권한 목록</h4>
                {items.length ? (
                  <ul>
                    {items.map(([r, t]) => (
                      <li key={r}>
                        {r}: {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="none">아무 권한 없음</span>
                )}
              </div>
            );
          })}
        {view === 'rbac' &&
          rs.map((role, k) => (
            <div key={role.key} className="ac-list">
              <h4>
                역할 {k + 1}: {role.users.map((u) => USERS[u]).join(', ')}
              </h4>
              <ul>
                {role.perms.map((b, ri) => (b ? <li key={ri}>{RESOURCES[ri]}: {bitsText(b)}</li> : null))}
              </ul>
            </div>
          ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="허용 항목 수 (ACL = 권한 목록)" value={`${g}개`} />
        <Readout label="필요한 역할 수" value={`${rs.length}개`} color={rs.length >= USERS.length ? 'var(--bad)' : undefined} />
        <Readout label="사용자 수" value={`${USERS.length}명`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a rule over attributes ─────────────── */

function AbacFigure() {
  const [user, setUser] = useState(2);
  const [hour, setHour] = useState(14);
  const [managed, setManaged] = useState(true);
  const res = abacPayroll({ user, hour, managedDevice: managed });
  return (
    <Figure
      no={2}
      title="속성으로 정하는 규칙: 급여표 읽기"
      hint="사람, 시각, 기기를 바꿔 보세요"
      caption={<>규칙은 "인사팀이나 대표가, 업무 시간(9시~18시)에, 회사가 관리하는 기기에서 요청하면 급여표를 읽을 수 있다"입니다. 행렬의 칸 하나로는 시각이나 기기 같은 조건을 적을 수 없습니다. 속성 기반 접근 제어(ABAC)는 요청할 때마다 사용자, 자원, 상황의 속성을 모아 규칙에 넣어 봅니다.</>}
    >
      <div className="fig-split">
        <div className="ss-col">
          <Code label="규칙">{`
allow 읽기 on 급여표 if
  user.부서 in ["인사", "대표"]
  and 9 <= now.시 < 18
  and device.관리됨 == true`}</Code>
          <ul className="ac-checks" aria-live="polite">
            {res.checks.map((c) => (
              <li key={c.label} data-ok={c.ok || undefined}>
                <i aria-hidden="true">{c.ok ? '✓' : '✕'}</i>
                <span>
                  {c.label}
                  <span className="visually-hidden">{c.ok ? ' 통과' : ' 실패'}</span>
                </span>
              </li>
            ))}
          </ul>
          <div>
            <span className="ac-verdict" data-ok={res.allow || undefined}>
              {res.allow ? '허용' : '거부'}
            </span>
          </div>
        </div>
        <div className="controls">
          <Seg label="요청한 사람" value={user} onChange={setUser} options={USERS.map((u, i) => ({ value: i, label: u }))} />
          <Slider id="ac-hour" label="요청 시각" value={hour} min={0} max={23} step={1} onChange={setHour} format={(v) => `${v}시`} />
          <Check label="회사가 관리하는 기기" checked={managed} onChange={setManaged} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a missing ownership check ─────────────── */

function IdorFigure() {
  const [fixed, setFixed] = useState(false);
  const [id, setId] = useState(1009);
  const [history, setHistory] = useState<number[]>([1009]);
  const [scanned, setScanned] = useState<ReturnType<typeof scan> | null>(null);
  const res = getOrder(id, fixed);
  const set = (v: number) => {
    const x = Math.max(1001, Math.min(1040, Math.round(v) || 1001));
    setId(x);
    setHistory((h) => (h[h.length - 1] === x ? h : [...h.slice(-11), x]));
  };
  const flip = (v: boolean) => {
    setFixed(v);
    setScanned(null);
  };

  return (
    <Figure
      no={3}
      title="주문 번호만 바꾸면 남의 주문이 보인다"
      hint="번호를 1씩 바꿔 요청해 보세요"
      caption={<>가상의 쇼핑 서비스에 민지로 로그인한 상태입니다. {ME}의 주문은 40건 중 {ORDERS.filter((o) => o.owner === ME).length}건입니다. 처리 코드는 로그인 여부만 확인하고 주문의 주인은 확인하지 않습니다. 맨 위의 상자를 켜면 주인 확인 한 줄이 추가됩니다.</>}
    >
      <div className="controls row">
        <Check label="주인 확인 추가 (고친 코드)" checked={fixed} onChange={flip} />
        <Slider id="ac-order" label="주문 번호" value={id} min={1001} max={1040} step={1} onChange={set} />
      </div>
      <div className="fig-cols">
        <Code label="서버 코드">{fixed
          ? `
app.get('/api/orders/:id', requireLogin, (req, res) => {
  const order = db.orders.find(req.params.id);
  if (!order) return res.status(404).end();
  // 이 주문이 요청한 사람의 것인지 확인한다
  if (order.ownerId !== req.user.id) return res.status(403).end();
  res.json(order);
});`
          : `
app.get('/api/orders/:id', requireLogin, (req, res) => {
  const order = db.orders.find(req.params.id);
  if (!order) return res.status(404).end();
  // 로그인했는지는 requireLogin이 확인했다
  // 그런데 누구의 주문인지는 확인하지 않는다
  res.json(order);
});`}</Code>
        <div className="ss-col">
          <div className="ac-request">
            <span>GET /api/orders/</span>
            <input type="number" min={1001} max={1040} value={id} onChange={(e) => set(parseInt(e.target.value, 10))} aria-label="주문 번호" />
            <span className="ac-status" style={{ color: res.status === 200 ? (res.leak ? 'var(--bad)' : 'var(--good)') : 'var(--ink-2)' }}>
              {res.status}
            </span>
          </div>
          <pre className="ac-response" data-leak={res.leak || undefined} data-denied={res.status === 403 || undefined} aria-live="polite">
            {res.body}
          </pre>
          <div className="ss-note" data-bad={res.leak || undefined}>
            {res.leak ? `민지가 아닌 ${ORDERS.find((o) => o.id === id)!.owner}의 이름, 배송지, 금액이 그대로 나왔습니다.` : res.status === 403 ? '남의 주문이라 거절했습니다.' : `${ME}의 주문입니다.`}
          </div>
        </div>
      </div>
      <div className="ac-history" aria-label="요청한 번호">
        <span className="ss-small">요청한 번호</span>
        {history.map((h, k) => {
          const r = getOrder(h, fixed);
          return (
            <span key={k} className="ac-chip" data-leak={r.leak || undefined} data-mine={(r.status === 200 && !r.leak) || undefined}>
              {h}
            </span>
          );
        })}
      </div>
      <div className="controls row">
        <Button small onClick={() => setScanned(scan(1001, 1040, fixed))}>
          1001~1040 모두 요청
        </Button>
        {scanned && (
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)', flex: '1 1 320px' }}>
            <Readout label="남의 주문이 보임" value={`${scanned.leaks}건`} color={scanned.leaks ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="내 주문" value={`${scanned.mine}건`} />
            <Readout label="403 거절" value={`${scanned.denied}건`} />
          </div>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the confused deputy, and least privilege ─────────────── */

const TOTAL_RESOURCES = 20;

function DeputyFigure() {
  const [out, setOut] = useState<Path>('/billing/usage.log');
  const [mode, setMode] = useState<DeputyMode>('ambient');
  const [given, setGiven] = useState<string[]>(SERVICE_GRANTS.map((g) => g.id));
  const res = deputy(out, mode);
  const reach = given.includes('root') ? TOTAL_RESOURCES : SERVICE_GRANTS.filter((g) => given.includes(g.id)).reduce((s, g) => s + g.reach, 0);
  const need = SERVICE_GRANTS.filter((g) => g.needed).reduce((s, g) => s + g.reach, 0);

  return (
    <Figure
      no={4}
      title="남의 권한을 빌려 쓰는 대리인, 그리고 최소 권한"
      hint="출력 경로와 방식을 바꿔 보세요"
      caption={<>왼쪽: 빌드 도우미는 사용량을 기록하려고 /billing/usage.log에 쓸 권한을 가졌습니다. 민지가 출력 파일 이름으로 그 경로를 주면 무슨 일이 생기는지 봅니다. 오른쪽: 사진의 썸네일을 만드는 서비스에 준 권한들입니다. 이 서비스가 침해되면 공격자는 서비스가 가진 권한을 그대로 씁니다. 관리자로 실행하면 이 서버의 자원 {TOTAL_RESOURCES}개 전부에 닿는다고 셉니다.</>}
    >
      <div className="fig-cols">
        <div className="ss-col">
          <Seg label="출력 파일" value={out} onChange={setOut} options={PATHS.map((p) => ({ value: p, label: p.replace('/home/', '~').replace('/app.bin', '') }))} />
          <Seg
            label="빌드 도우미가 파일을 여는 방식"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ambient', label: '자기 권한으로 연다' },
              { value: 'capability', label: '받은 핸들로만 쓴다' },
            ]}
          />
          <ol className="ac-steps" aria-live="polite">
            {res.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="ss-note" data-bad={res.harm || undefined} data-good={(!res.harm && mode === 'capability') || undefined}>
            {res.harm ? '사용 기록이 덮어써졌습니다. 요금 청구가 망가집니다.' : res.wrote ? '정상적으로 썼습니다.' : '아무것도 쓰지 않았습니다. 피해도 없습니다.'}
          </div>
        </div>
        <div className="ss-col">
          <div className="ss-small">썸네일 서비스에 준 권한</div>
          <div className="ac-grants">
            {SERVICE_GRANTS.map((g) => (
              <Check
                key={g.id}
                label={
                  <>
                    {g.label}
                    <small>{g.needed ? '일에 필요' : '필요 없음'}</small>
                  </>
                }
                checked={given.includes(g.id)}
                onChange={(v) => setGiven((x) => (v ? [...x, g.id] : x.filter((y) => y !== g.id)))}
              />
            ))}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setGiven(SERVICE_GRANTS.filter((g) => g.needed).map((g) => g.id))}>
              필요한 것만 남기기
            </Button>
            <Button small onClick={() => setGiven(SERVICE_GRANTS.map((g) => g.id))}>
              모두 주기
            </Button>
          </div>
          <div className="ac-bar" role="img" aria-label={`침해되면 닿는 자원 ${reach}개 중 일에 필요한 것 ${need}개`}>
            <span style={{ width: `${(reach / TOTAL_RESOURCES) * 100}%` }} />
            <span data-need="" style={{ width: `${(Math.min(need, reach) / TOTAL_RESOURCES) * 100}%` }} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="침해되면 닿는 자원" value={`${reach}개`} color={reach > need ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="일에 필요한 자원" value={`${need}개`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function AccessControl() {
  const mine = ORDERS.filter((o) => o.owner === ME).length;
  return (
    <>
      <h2>누구인지와 무엇을 해도 되는지는 다른 질문</h2>
      <p>
        <a href={lessonHref('net-software-security', 'authentication')}>앞 장</a>에서는 요청한 사람이 정말 그 사람인지 확인하는 <T en="authentication">인증</T>을 다뤘습니다. 인증이 끝나면 두 번째 질문이 남습니다. 이 사람이 이 자원에 이 일을 해도 되는가. 이것을 <T en="authorization">인가</T>, 그리고 인가를 강제하는 장치 전체를 <T en="access control">접근 제어</T>라고 합니다. 회사 출입증이 인증이라면, 출입증을 찍었을 때 서버실 문이 열리는지 정하는 것이 인가입니다.
      </p>
      <p>
        운영체제는 이미 이 일을 하고 있습니다. <a href={lessonHref('cs-operating-systems', 'protection')}>보호와 보안</a> 장에서 본 사용자 모드와 페이지 권한 비트, 파일의 읽기·쓰기 권한이 모두 접근 제어입니다. 이 장에서는 웹 서비스처럼 사용자와 자원을 프로그램이 직접 관리하는 경우를 봅니다. 운영체제가 대신 막아 주지 않으므로, 확인 한 줄을 빠뜨리면 그대로 구멍이 됩니다.
      </p>

      <h2>접근 제어 행렬</h2>
      <p>
        규칙을 가장 곧이곧대로 적으면 표가 됩니다. 행은 사용자(주체), 열은 자원(객체), 칸은 허용되는 행동입니다. 1971년 램프슨(Butler Lampson)이 정리한 <T en="access control matrix">접근 제어 행렬</T>입니다. 그림 1의 칸을 눌러 권한을 바꿔 보세요.
      </p>
      <MatrixFigure />
      <p>
        실제 시스템은 이 표를 통째로 저장하지 않습니다. 사용자와 자원이 수천 개면 칸 대부분이 비어 있기 때문입니다. 대신 둘 중 한 방향으로 잘라 둡니다. 자원마다 "누가 무엇을 할 수 있는지" 목록을 붙이면 <T en="access control list, ACL">접근 제어 목록</T>입니다. 유닉스 파일 권한과 클라우드 저장소의 버킷 정책이 이 방식입니다. 사용자마다 "무엇에 무엇을 할 수 있는지" 목록을 쥐여 주면 <T en="capability list">권한 목록</T>입니다. 처음 행렬에서 허용 항목은 23개이고, 어느 쪽으로 잘라도 23개를 저장합니다. 차이는 질문의 방향에 있습니다. ACL은 "급여표를 누가 읽을 수 있나"에 바로 답하고, 권한 목록은 "하늘이 할 수 있는 일이 무엇인가"에 바로 답합니다. 퇴사자의 권한을 한 번에 거두려면 권한 목록이, 파일 하나를 잠그려면 ACL이 편합니다.
      </p>
      <p>
        사용자가 많아지면 사람마다 칸을 채우는 일이 감당이 안 됩니다. <T en="role-based access control, RBAC">역할 기반 접근 제어</T>는 권한을 역할에 붙이고 사람에게는 역할만 줍니다. 처음 행렬에서는 민지와 준호의 줄이 똑같아서 역할 "개발" 하나로 묶이고, 역할은 4개면 됩니다. 이제 준호의 배포 서버 쓰기 권한을 꺼 보세요. 준호의 줄이 민지와 달라지면서 역할이 5개, 즉 사람 수만큼 필요해집니다. 사람마다 조금씩 다른 예외를 허용하다 보면 역할이 사람 수만큼 늘어나는 이 현상을 <T en="role explosion">역할 폭발</T>이라고 합니다. 역할을 쓰려면 예외를 줄이는 결정을 함께 내려야 합니다.
      </p>

      <h2>속성으로 정하기</h2>
      <p>
        "급여표는 인사팀만"까지는 역할로 되지만, "업무 시간에, 회사 노트북으로만"은 역할로 적기 어렵습니다. 시각과 기기는 사람이 아니라 요청의 성질이기 때문입니다. <T en="attribute-based access control, ABAC">속성 기반 접근 제어</T>는 사용자, 자원, 환경의 속성을 요청마다 모아 규칙에 넣어 봅니다.
      </p>
      <AbacFigure />
      <p>
        서연(인사)이 오후 2시에 회사 기기로 요청하면 세 조건을 모두 통과합니다. 시각을 20시로 옮기거나 기기 상자를 끄면 거부됩니다. 대표인 도윤은 같은 조건에서 허용되고, 개발자 민지는 언제 어디서 요청해도 거부됩니다. 속성 규칙은 표현력이 큰 대신 규칙이 서로 겹치기 쉬워서 "결국 누가 급여표를 읽을 수 있나"에 답하기가 행렬보다 어렵습니다. 그래서 실무에서는 역할로 큰 틀을 잡고 속성 규칙은 몇 개의 민감한 자원에만 씁니다.
      </p>

      <h2>가장 흔한 구멍: 확인을 빠뜨린 한 줄</h2>
      <p>
        웹 서비스에서 가장 흔한 접근 제어 실수는 거창한 설계 실수가 아니라 확인 한 줄이 빠진 것입니다. OWASP가 발표하는 웹 취약점 순위(2021년판)에서 "깨진 접근 제어"가 1위였습니다. 그림 3은 그 전형입니다.
      </p>
      <IdorFigure />
      <p>
        처음 화면의 1009번은 민지의 주문입니다. 슬라이더를 1010으로 옮기면 도윤의 이름, 배송지, 금액이 그대로 나옵니다. <strong>1001~1040 모두 요청</strong>을 누르면 40번의 요청 중 민지의 주문 {mine}건을 뺀 32건이 모두 남의 주문입니다. 서버는 "로그인한 사용자인가"는 확인했지만 "이 사용자의 주문인가"는 확인하지 않았습니다. 주소의 번호처럼 사용자가 마음대로 바꿀 수 있는 값으로 객체를 바로 가져오는 이 실수를 <T en="insecure direct object reference, IDOR">안전하지 않은 직접 객체 참조</T>라고 부릅니다. 주인 확인을 켜면 같은 32번의 요청이 모두 403으로 거절됩니다.
      </p>
      <Callout kind="warn">
        번호를 추측하기 어렵게(예를 들어 무작위 문자열로) 바꾸는 것은 고친 것이 아닙니다. 번호는 로그, 공유 링크, 브라우저 기록으로 새어 나가고, 새어 나간 번호로는 여전히 남의 주문이 열립니다. 확인은 언제나 서버에서, 요청마다, 객체의 주인과 요청한 사람을 비교해서 해야 합니다. 화면에서 버튼을 숨기는 것도 확인이 아닙니다. 공격자는 화면을 거치지 않고 요청을 직접 보냅니다. 같은 이유로 <a href={lessonHref('net-security', 'web-security')}>웹 보안</a> 장의 CSRF도 서버의 확인으로만 막을 수 있었습니다.
      </Callout>

      <h2>남의 권한을 빌려 쓰는 대리인</h2>
      <p>
        접근 제어가 더 미묘해지는 곳은 프로그램이 다른 사람을 대신해 일할 때입니다. 1988년 하디(Norm Hardy)가 소개한 <T en="confused deputy">혼동된 대리인</T> 문제는 이렇습니다. 컴파일 서비스는 사용량을 기록하려고 요금 파일에 쓸 권한을 가졌습니다. 사용자는 컴파일을 맡기면서 출력 파일 이름을 지정할 수 있습니다. 사용자가 출력 이름으로 요금 파일을 주면, 서비스는 자기 권한으로 그 파일을 열어 컴파일 결과로 덮어씁니다. 사용자 자신은 그 파일에 쓸 권한이 없는데도요.
      </p>
      <DeputyFigure />
      <p>
        "자기 권한으로 연다"로 두면 민지가 /billing/usage.log를 출력으로 줄 때 빌드 도우미가 그 파일을 덮어씁니다. 문제는 빌드 도우미가 "누구의 권한으로 이 일을 하는가"를 구별하지 못하는 데 있습니다. 서비스가 가진 권한(<T en="ambient authority">주변 권한</T>)이 요청한 사람의 몫까지 대신 쓰입니다. "받은 핸들로만 쓴다"로 바꾸면 민지가 파일을 직접 열어 그 열린 핸들을 건네야 하는데, 민지는 요금 파일을 열 수 없으니 건넬 것이 없습니다. 권한을 이름(경로)이 아니라 위조할 수 없는 열쇠(핸들)로 넘기는 것이 권한 목록 방식의 장점입니다. 유닉스의 파일 디스크립터 전달과 웹의 서명된 일회용 업로드 주소가 같은 생각입니다.
      </p>
      <p>
        오른쪽 그림은 반대쪽에서 같은 문제를 봅니다. 썸네일 서비스가 하는 일에는 업로드 폴더 읽기와 썸네일 폴더 쓰기, 자원 두 개면 충분합니다. 그런데 편해서 관리자로 실행하면, 서비스의 이미지 처리 코드에 버그 하나가 생겼을 때 공격자는 서버의 자원 {TOTAL_RESOURCES}개 모두에 닿습니다. <strong>필요한 것만 남기기</strong>를 누르면 2개로 줄어듭니다. 1975년 솔처(Jerome Saltzer)와 슈뢰더(Michael Schroeder)가 정리한 <T en="principle of least privilege">최소 권한 원칙</T>, 즉 "일에 필요한 권한만 주라"는 원칙은 버그를 막지는 못하지만 버그 하나가 번지는 범위를 줄입니다.
      </p>

      <Callout kind="key">
        인증은 "누구인가", 인가는 "무엇을 해도 되는가"입니다. 접근 제어 행렬을 자원별로 자르면 ACL, 사용자별로 자르면 권한 목록이고, 역할은 같은 권한을 가진 사람들을 묶지만 예외가 많으면 사람 수만큼 늘어납니다. 시각이나 기기 같은 조건은 속성 규칙으로 적습니다. 실제 구멍은 대부분 서버가 요청마다 "이 객체가 이 사용자의 것인가"를 확인하지 않는 데서 생기고, 대리인이 자기 권한을 남의 요청에 빌려줄 때도 생깁니다. 권한은 필요한 만큼만, 넘길 때는 위조할 수 없는 핸들로 넘깁니다.
      </Callout>
      <Quiz
        q="GET /api/invoices/:id가 로그인한 사용자라면 누구에게나 청구서를 돌려준다는 제보가 들어왔다. 가장 알맞은 고침은?"
        options={['청구서 번호를 추측하기 어려운 무작위 문자열로 바꾼다', '화면에서 다른 사람의 청구서로 가는 링크를 숨긴다', '서버가 청구서를 찾은 뒤 청구서의 주인이 요청한 사용자와 같은지 확인하고, 다르면 거절한다', '로그인 세션의 유효 시간을 줄인다']}
        answer={2}
        explain={<>문제는 인증이 아니라 인가입니다. 요청한 사람은 정상적으로 로그인했고, 서버가 그 사람에게 이 객체를 보여 줘도 되는지 확인하지 않았을 뿐입니다. 번호를 숨기거나 링크를 감추는 것은 공격자가 번호를 알아내는 순간 무너지고, 세션 시간은 상관이 없습니다. 요청마다 서버에서 주인을 확인해야 합니다.</>}
      />
    </>
  );
}

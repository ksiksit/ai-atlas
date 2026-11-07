import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import {
  APP_DESC,
  BASE_ERR,
  CANARY_STAGE,
  DDL_SQL,
  HUMAN_DELAY,
  MINUTES,
  PLANS,
  REDEPLOY,
  REQ_PER_MIN,
  ROLL_EVERY,
  STRATEGY_NAME,
  WINDOW,
  check,
  simulateRollout,
  walkPlan,
  type AppVersion,
  type Plan,
  type RolloutResult,
  type Strategy,
} from './rollout';
import './basics.css';
import './deploy.css';

const num = (n: number) => n.toLocaleString('ko-KR');
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(/\.0+$/, '')}%`;

/* ─────────────── Figure 1: the timeline chart ─────────────── */

const W = 600;
const L = 46;
const R = 12;
const P1 = [16, 84] as const; // traffic panel (top, bottom)
const P2 = [112, 222] as const; // error-rate panel
const H = 246;
const xOf = (t: number) => L + (Math.min(MINUTES, Math.max(0, t)) / MINUTES) * (W - L - R);

function niceMax(v: number) {
  for (const m of [0.05, 0.1, 0.2, 0.3, 0.5, 1]) if (v <= m) return m;
  return 1;
}

function RolloutChart({ res, threshold }: { res: RolloutResult; threshold: number }) {
  const ms = res.minutes;
  const yS = (s: number) => P1[1] - s * (P1[1] - P1[0]);
  const all = ms.map((m) => (m.errNew + m.errOld) / REQ_PER_MIN);
  const top = niceMax(Math.max(threshold * 1.4, ...ms.map((m) => m.watched ?? 0), ...all));
  const yE = (e: number) => P2[1] - (Math.min(e, top) / top) * (P2[1] - P2[0]);

  let area = `M${xOf(0)},${yS(0)}`;
  for (const m of ms) area += ` L${xOf(m.t)},${yS(m.share)} L${xOf(m.t + 1)},${yS(m.share)}`;
  area += ` L${xOf(MINUTES)},${yS(0)} Z`;

  // overall error rate of each minute, and the windowed rate the monitor saw
  const allPath = ms.map((m, i) => `${i ? 'L' : 'M'}${xOf(m.t + 0.5).toFixed(1)},${yE(all[i]).toFixed(1)}`).join(' ');
  let watched = '';
  let pen = false;
  for (const m of ms) {
    if (m.watched === null) {
      pen = false;
      continue;
    }
    watched += `${pen ? 'L' : 'M'}${xOf(m.t + 1).toFixed(1)},${yE(m.watched).toFixed(1)} `;
    pen = true;
  }

  const marks: { t: number | null; cls: string }[] = [
    { t: res.detectAt === null ? null : res.detectAt + 1, cls: 'alert' },
    { t: res.auto ? null : res.rollbackAt, cls: 'start' },
    { t: res.doneAt, cls: 'done' },
  ];

  return (
    <svg
      className="dp-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`60분 동안의 배포. ${res.detectAt === null ? '경보 없음' : `${res.detectAt + 1}분에 경보`}, ${res.doneAt === null ? '새 버전이 남음' : `${res.doneAt}분에 복구`}`}
    >
      {/* panel frames and grid */}
      <text className="dp-ax-title" x={L} y={P1[0] - 5}>
        새 버전이 받는 트래픽
      </text>
      {[0, 0.5, 1].map((s) => (
        <g key={s}>
          <line className="dp-grid" x1={L} x2={W - R} y1={yS(s)} y2={yS(s)} />
          <text className="dp-ax" x={L - 6} y={yS(s) + 3.5} textAnchor="end">
            {pct(s, 0)}
          </text>
        </g>
      ))}
      <path className="dp-share" d={area} />

      <text className="dp-ax-title" x={L} y={P2[0] - 6}>
        오류율 ({res.watches === 'new' ? '굵은 선: 모니터가 본 카나리 요청' : '굵은 선: 모니터가 본 전체 요청'}, 최근 {WINDOW}분)
      </text>
      {[0, top / 2, top].map((e) => (
        <g key={e}>
          <line className="dp-grid" x1={L} x2={W - R} y1={yE(e)} y2={yE(e)} />
          <text className="dp-ax" x={L - 6} y={yE(e) + 3.5} textAnchor="end">
            {pct(e, 1)}
          </text>
        </g>
      ))}
      <line className="dp-threshold" x1={L} x2={W - R} y1={yE(threshold)} y2={yE(threshold)} />
      <text className="dp-ax dp-th-label" x={W - R - 2} y={yE(threshold) - 4} textAnchor="end">
        임계값 {pct(threshold)}
      </text>
      <path className="dp-all" d={allPath} />
      <path className="dp-watched" d={watched} />

      {marks.map(({ t, cls }) =>
        t === null || t > MINUTES ? null : <line key={cls} className={`dp-mark ${cls}`} x1={xOf(t)} x2={xOf(t)} y1={P1[0]} y2={P2[1]} />,
      )}

      {Array.from({ length: MINUTES / 10 + 1 }, (_, i) => i * 10).map((t) => (
        <text key={t} className="dp-ax" x={xOf(t)} y={H - 6} textAnchor="middle">
          {t}분
        </text>
      ))}
    </svg>
  );
}

/* ─────────────── Figure 1: releasing a buggy version ─────────────── */

const SEVERITY = [
  { value: BASE_ERR, label: '버그 없음' },
  { value: 0.03, label: '가벼움 3%' },
  { value: 0.1, label: '중간 10%' },
  { value: 0.4, label: '심각 40%' },
];
const STRATS: Strategy[] = ['all', 'rolling', 'bluegreen', 'canary'];

function outcome(r: RolloutResult, buggy: boolean) {
  if (r.doneAt !== null) return buggy ? `${r.doneAt}분에 복구` : `${r.doneAt}분에 되돌림 (헛경보)`;
  if (r.rollbackAt !== null) return '되돌리는 중';
  return buggy ? '못 잡고 끝까지 배포' : '끝까지 배포';
}

function RolloutFigure() {
  const [strategy, setStrategy] = useState<Strategy>('all');
  const [err, setErr] = useState(0.1);
  const [canary, setCanary] = useState(0.05);
  const [threshold, setThreshold] = useState(0.02);
  const [seed, setSeed] = useState(1);
  const runs = useMemo(() => Object.fromEntries(STRATS.map((s) => [s, simulateRollout({ strategy: s, errNew: err, canary, threshold, seed })])) as Record<Strategy, RolloutResult>, [err, canary, threshold, seed]);
  const res = runs[strategy];
  const buggy = err > BASE_ERR;

  return (
    <Figure
      no={1}
      title="버그 있는 버전을 내보내기"
      hint="배포 방식과 버그의 크기를 바꿔 보세요"
      caption={
        <>
          할 일 서비스에 1분마다 요청 {num(REQ_PER_MIN)}개가 들어옵니다. 옛 버전은 요청의 {pct(BASE_ERR)}가 실패하고, 새 버전은 고른 비율만큼 실패합니다. 위 칸은 새 버전이 받는 트래픽의 몫, 아래 칸은 오류율입니다. 가는 선은 그 분의 전체 오류율이고, 굵은 선은 모니터가 최근 {WINDOW}분을 모아 본 값입니다. 굵은 선이 임계값을 넘으면 경보가 울립니다. 사람이 호출을 받고 되돌리기 시작하기까지 {HUMAN_DELAY}분이 걸리고, 카나리는 배포 도구가 스스로 바로 되돌립니다. 아래 표는 같은 설정, 같은 난수로 네 방식을 모두 돌린 결과입니다. 줄을 누르면 그 방식이 위 그림에 나옵니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="dp-scroll">
            <RolloutChart res={res} threshold={threshold} />
          </div>
          <Legend
            items={[
              { color: 'var(--bad)', label: '경보', shape: 'ln' },
              { color: 'var(--ink-3)', label: '되돌리기 시작', shape: 'ln' },
              { color: 'var(--good)', label: '새 버전 트래픽 0 (복구)', shape: 'ln' },
            ]}
          />
        </div>
        <div className="controls">
          <Seg label="배포 방식" value={strategy} onChange={setStrategy} options={STRATS.map((s) => ({ value: s, label: STRATEGY_NAME[s] }))} />
          <Seg label="새 버전의 오류율" value={err} onChange={setErr} options={SEVERITY} />
          <Slider label="카나리 첫 단계 비율" value={canary} min={0.01} max={0.5} step={0.01} onChange={setCanary} format={(v) => pct(v, 0)} />
          <Slider label="경보 임계값" value={threshold} min={0.01} max={0.1} step={0.005} onChange={setThreshold} format={(v) => pct(v)} />
          <Button small onClick={() => setSeed((s) => s + 1)}>
            다시 굴리기 (씨앗 {seed})
          </Button>
        </div>
      </div>
      <div className="controls row dp-readouts">
        <Readout label="경보" value={res.detectAt === null ? '울리지 않음' : `${res.detectAt + 1}분`} color={res.detectAt === null && buggy ? 'var(--bad)' : undefined} />
        <Readout label="결과" value={outcome(res, buggy)} color={buggy ? (res.doneAt === null ? 'var(--bad)' : 'var(--good)') : res.doneAt === null ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="새 버전을 만난 요청" value={num(res.exposed)} />
        <Readout label="새 버전에서 실패한 요청" value={num(res.failedNew)} />
      </div>
      <div className="dp-scroll">
        <table className="dp-table">
          <thead>
            <tr>
              <th>방식</th>
              <th>경보</th>
              <th>결과</th>
              <th>새 버전을 만난 요청</th>
              <th>실패한 요청</th>
              <th>서버</th>
            </tr>
          </thead>
          <tbody>
            {STRATS.map((s) => {
              const r = runs[s];
              return (
                <tr key={s} data-on={s === strategy || undefined} onClick={() => setStrategy(s)}>
                  <td>
                    <button type="button" className="dp-rowbtn" aria-pressed={s === strategy} onClick={() => setStrategy(s)}>
                      {STRATEGY_NAME[s]}
                    </button>
                  </td>
                  <td>{r.detectAt === null ? '–' : `${r.detectAt + 1}분`}</td>
                  <td>{outcome(r, buggy)}</td>
                  <td className="dp-num">{num(r.exposed)}</td>
                  <td className="dp-num">{num(r.failedNew)}</td>
                  <td className="dp-num">{r.servers}대</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: expand → migrate → contract ─────────────── */

const VERSIONS: AppVersion[] = ['v1', 'v2', 'v3'];

function stepCode(plan: Plan, i: number): string {
  const s = PLANS[plan][i].step;
  if (s.kind === 'start') return '-- 서버에서 앱 v1이 돌고, todos 테이블에는 done 열만 있습니다';
  if (s.kind === 'deploy') return `# 앱 ${s.app} 배포 (${APP_DESC[s.app]})\nkubectl set image deployment/todo-api app=todo-api:${s.app}`;
  return s.ddl.map((d) => DDL_SQL[d]).join('\n');
}

function MigrationFigure() {
  const [plan, setPlan] = useState<Plan>('expand');
  const [step, setStep] = useState(0);
  const states = useMemo(() => walkPlan(plan), [plan]);
  const i = Math.min(step, states.length - 1);
  const st = states[i];
  const checks = VERSIONS.map((v) => ({ v, c: check(v, st.table, st.truth) }));
  const rank = (v: AppVersion) => VERSIONS.indexOf(v);
  const backTo = checks.filter(({ v, c }) => rank(v) < rank(st.app) && !c.error && c.misread === 0).map(({ v }) => v);
  const hasOlder = rank(st.app) > 0;

  const choosePlan = (p: Plan) => {
    setPlan(p);
    setStep(0);
  };

  return (
    <Figure
      no={2}
      title="스키마를 바꾸는 동안 어떤 앱이 돌 수 있나"
      hint="단계를 하나씩 눌러 보세요"
      caption={
        <>
          할 일의 "끝냄" 여부를 참·거짓 열 <code>done</code>에서 글자 열 <code>status</code>(todo, done)로 옮깁니다. 앱 v1은 done만, v3는 status만 알고, 다리 역할을 하는 v2는 두 열에 모두 씁니다. 단계마다 그때 서버에 있는 앱이 할 일을 하나씩 더하므로 테이블이 조금씩 자랍니다. 오른쪽 카드는 각 앱 버전을 지금 테이블에 붙여 할 일을 읽고, 더하고, 끝내 본 결과입니다. 배포 중이나 롤백할 때는 두 버전이 동시에 돌기 때문에, 바로 앞뒤 버전이 모두 초록이어야 안전합니다.
        </>
      }
    >
      <div className="se-col">
        <div className="dp-plan">
          <Seg
            label="계획"
            value={plan}
            onChange={choosePlan}
            options={[
              { value: 'oneshot', label: '한 번에 바꾸기' },
              { value: 'expand', label: '확장 → 이전 → 축소' },
            ]}
          />
        </div>
        <ol className="dp-steps" aria-label="단계">
          {PLANS[plan].map((s, k) => (
            <li key={k}>
              <button type="button" className="dp-step" data-on={k === i || undefined} data-past={k < i || undefined} aria-pressed={k === i} onClick={() => setStep(k)}>
                <span className="dp-step-no">{k}</span>
                <span className="dp-step-text">
                  {s.phase && <small>{s.phase}</small>}
                  {s.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <pre className="dp-sql" aria-label="이 단계에서 실행한 것">
          {stepCode(plan, i)}
        </pre>
        <div className="dp-mig">
          <div className="se-col">
            <div className="se-label">todos 테이블 (지금 열: {st.table.cols.join(', ')})</div>
            <div className="dp-scroll">
              <table className="dp-table dp-data">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>title</th>
                    {st.table.cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {st.table.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="dp-num">{r.id}</td>
                      <td>{r.title}</td>
                      {st.table.cols.map((c) => {
                        const v = r[c];
                        return (
                          <td key={c} className="dp-mono" data-null={v == null || undefined}>
                            {v == null ? 'NULL' : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="dp-apps">
            {checks.map(({ v, c }) => {
              const tone = c.error ? 'bad' : c.misread ? 'warn' : c.breaksFor.length ? 'note' : 'good';
              return (
                <div key={v} className="dp-app" data-tone={tone} data-run={v === st.app || undefined}>
                  <div className="dp-app-head">
                    <strong>앱 {v}</strong>
                    {v === st.app && <span className="dp-badge">지금 서버에서 도는 버전</span>}
                  </div>
                  <div className="dp-app-desc">{APP_DESC[v]}</div>
                  <div className="dp-app-res">
                    {c.error ? (
                      <code>{c.error}</code>
                    ) : c.misread ? (
                      `할 일 ${c.misread}개의 상태를 잘못 읽습니다`
                    ) : c.breaksFor.length ? (
                      `돌아가지만, 이 버전이 쓴 행을 ${c.breaksFor.join(', ')}가 잘못 읽습니다`
                    ) : (
                      '문제없이 돕니다'
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="dp-verdict" data-tone={st.error ? 'bad' : hasOlder && backTo.length === 0 ? 'bad' : 'good'} aria-live="polite">
          {st.error ? (
            <span>
              장애: 서버에서 아직 도는 앱 {st.app}이 <code>{st.error}</code> 오류를 냅니다.
            </span>
          ) : !hasOlder ? (
            <span>앱 v1이 정상으로 돌고 있습니다.</span>
          ) : backTo.length ? (
            <span>지금 문제가 생기면 앱 {backTo.join(' 또는 ')}로 안전하게 되돌릴 수 있습니다.</span>
          ) : (
            <span>앱만 되돌릴 수 있는 버전이 없습니다. 옛 버전은 이 스키마에서 돌지 않거나 데이터를 잘못 읽습니다.</span>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Deploy() {
  return (
    <>
      <h2>한꺼번에 배포하기와 그 위험</h2>
      <p>
        <a href={lessonHref('se-basics', 'ci')}>지속적 통합</a>에서 테스트를 통과한 할 일 서비스의 새 버전이 나왔습니다. 이제 이것을 실제 사용자가 쓰는 서버에 올려야 합니다. 이 일을 <T en="deployment">배포</T>라고 합니다. 가장 단순한 방법은 서버 10대를 모두 멈추고, 새 버전으로 바꾸고, 다시 켜는 것입니다. 빠르고 간단하지만, 새 버전에 테스트가 잡지 못한 버그가 있다면 그 버그는 그 순간 <strong>모든 사용자</strong>에게 갑니다.
      </p>
      <p>
        조금 나은 방법은 서버를 한 대씩 바꾸는 <T en="rolling deployment">순차 배포</T>(롤링 배포)입니다. 로드 밸런서는 요청을 서버들에 고르게 나눠 주므로, 서버 한 대를 바꾸면 사용자 요청의 10%만 새 버전을 만납니다. 그 사이 문제가 보이면 나머지 서버는 바꾸지 않고 멈출 수 있습니다. Kubernetes의 기본 배포 방식이 이것입니다.
      </p>
      <Code label="deployment.yaml (Kubernetes 순차 배포)">{`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-api
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 새 서버를 한 대 먼저 띄우고
      maxUnavailable: 0    # 옛 서버는 새 서버가 준비된 뒤에 내린다
  template:
    spec:
      containers:
        - name: app
          image: registry.example.com/todo-api:1.8.0`}</Code>
      <p>
        하지만 순차 배포에도 약점이 있습니다. 바꾼 서버가 몇 대 안 될 때는 새 버전의 오류가 나머지 옛 서버의 정상 요청에 묻혀 전체 오류율이 조금밖에 오르지 않습니다. 모니터는 전체를 보고 있으니 알아채지 못한 채 배포가 계속되고, 절반쯤 바뀌었을 때에야 경보가 울립니다. 되돌릴 때도 서버를 한 대씩 다시 바꿔야 해서 시간이 걸립니다.
      </p>

      <h2>블루-그린 배포</h2>
      <p>
        <T en="blue-green deployment">블루-그린 배포</T>는 같은 크기의 환경을 두 벌 둡니다. 지금 사용자를 받는 쪽을 블루라고 하면, 새 버전은 아무도 쓰지 않는 그린 쪽에 미리 올리고 충분히 확인합니다. 준비가 끝나면 로드 밸런서가 가리키는 곳을 블루에서 그린으로 한 번에 바꿉니다. 블루는 그대로 켜 둡니다. 그래서 문제가 생기면 로드 밸런서를 다시 블루로 돌리기만 하면 되고, 이것은 몇 초면 끝납니다.
      </p>
      <p>
        대가는 두 가지입니다. 서버가 두 배 필요하고(전환 직후 잠깐이라도), 전환하는 순간에는 결국 모든 사용자가 새 버전을 만납니다. 블루-그린은 <strong>되돌리는 시간</strong>을 줄여 주지만 <strong>버그를 만나는 사람 수</strong>를 줄여 주지는 않습니다.
      </p>

      <h2>카나리 배포와 점진적 확대</h2>
      <p>
        옛날 광부들은 탄광에 카나리아를 데리고 들어갔습니다. 유독 가스가 차면 작은 새가 먼저 쓰러지므로 사람이 피할 시간을 벌 수 있었습니다. <T en="canary release">카나리 배포</T>는 새 버전을 먼저 사용자의 작은 일부(예: 5%)에게만 보여 주고, 그 요청들만 따로 지켜봅니다. 정해 둔 시간 동안 문제가 없으면 50%, 100%로 넓히고, 카나리 요청의 오류율이 기준을 넘으면 배포 도구가 사람을 기다리지 않고 트래픽을 옛 버전으로 돌립니다.
      </p>
      <p>
        핵심은 비율이 작다는 것보다 <strong>새 버전의 요청만 따로 잰다</strong>는 데 있습니다. 순차 배포에서는 서버 한 대의 오류가 아홉 대의 정상 요청에 희석되지만, 카나리에서는 새 버전이 받은 요청의 오류율을 그대로 봅니다. 아래 그림의 카나리는 {CANARY_STAGE}분마다 고른 비율 → 50% → 100%로 넓힙니다.
      </p>
      <Code label="rollout.yaml (Argo Rollouts 카나리)">{`
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: todo-api
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5          # 요청의 5%만 새 버전으로
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100
      analysis:
        templates:
          - templateName: error-rate   # 카나리 요청의 오류율이 2%를 넘으면 자동으로 되돌림`}</Code>
      <RolloutFigure />
      <p>
        기본 설정(오류율 10%짜리 버그, 임계값 2%)에서 네 방식을 비교해 보세요. 한꺼번에 배포와 블루-그린은 같은 순간에 경보가 울리지만, 블루-그린은 로드 밸런서만 돌리면 되므로 다시 빌드해 올리는 데 {REDEPLOY}분이 걸리는 한꺼번에 배포보다 일찍 끝납니다. 순차 배포는 {ROLL_EVERY}분에 서버 한 대씩 바꾸므로 처음에는 새 버전을 만난 요청이 적습니다. 카나리는 처음부터 새 버전 요청만 따로 보므로 1~2분 만에 잡고, 실패한 요청이 한꺼번에 배포의 몇백 분의 일로 줄어듭니다.
      </p>
      <p>
        이번에는 버그를 "가벼움 3%"로 바꿔 보세요. 순차 배포에서는 3% 오류가 옛 서버들에 희석되어, 서버가 여러 대 바뀐 뒤에야 전체 오류율이 2%를 넘습니다. 임계값을 4%로 높이면 한꺼번에 배포든 순차 배포든 끝까지 못 잡습니다. 사용자 서른 명 가운데 한 명이 계속 실패를 보는데도 대시보드는 조용합니다.
      </p>
      <Callout kind="warn">
        카나리 비율을 1%로 줄이고 "버그 없음"에 임계값을 1%로 낮춘 뒤 "다시 굴리기"를 몇 번 눌러 보세요. 카나리가 받는 요청이 3분에 30개쯤뿐이라, 멀쩡한 버전에서도 우연히 실패 하나가 겹치면 오류율이 3%로 보여 되돌려 버립니다. 카나리가 너무 작으면 신호보다 잡음이 큽니다. 실제 도구는 그래서 최소 요청 수를 채운 뒤에 판정하거나, 옛 버전의 같은 시간대 오류율과 통계적으로 비교합니다.
      </Callout>

      <h2>롤백: 되돌리기 쉬운 변경과 어려운 변경</h2>
      <p>
        <T en="rollback">롤백</T>은 문제가 생긴 배포를 이전 상태로 되돌리는 것입니다. 롤백이 빠르려면 두 가지가 준비되어 있어야 합니다. 첫째, 이전 버전의 빌드 결과물이 그대로 남아 있어야 합니다. 이미지에 <code>1.8.0</code>처럼 버전 태그를 붙이고 지우지 않으면, 되돌리기는 다시 빌드하는 일이 아니라 태그를 바꾸는 일이 됩니다. 둘째, 버전마다 다른 값은 <a href={lessonHref('se-basics', 'config')}>설정</a>으로 빼 두어 코드와 함께 되돌아가게 합니다.
      </p>
      <Code label="터미널 (순차 배포를 되돌리기)">{`
$ kubectl rollout history deployment/todo-api
REVISION  CHANGE-CAUSE
7         image todo-api:1.7.2
8         image todo-api:1.8.0

$ kubectl rollout undo deployment/todo-api     # 7번(1.7.2)으로 다시 순차 배포
deployment.apps/todo-api rolled back`}</Code>
      <p>
        <T en="feature flag">기능 플래그</T>는 한 걸음 더 나갑니다. 새 기능의 코드는 배포하되 설정 값 하나로 꺼 두었다가, 배포와 상관없이 켜고 끕니다. 문제가 생기면 다시 배포할 필요 없이 플래그만 끄면 됩니다. 배포(코드를 서버에 올리기)와 출시(사용자에게 기능을 보여 주기)를 떼어 놓는 셈입니다.
      </p>
      <p>
        그런데 되돌릴 수 없는 것이 하나 있습니다. 바로 데이터입니다. 코드는 옛 버전으로 바꾸면 그만이지만, 새 버전이 데이터베이스의 열을 지우거나 데이터를 새 형식으로 바꿔 썼다면, 옛 버전으로 돌아가도 옛 버전이 기대하는 데이터는 이미 없습니다.
      </p>

      <h2>데이터베이스 스키마 변경을 나눠서 하기</h2>
      <p>
        할 일의 "끝냄" 여부를 참·거짓으로 저장하던 <code>done</code> 열을, "진행 중" 같은 상태도 담을 수 있는 <code>status</code> 열로 바꾸려 합니다. 한 번에 하면 이렇습니다. 열을 추가하고, 값을 옮기고, 옛 열을 지우는 마이그레이션을 돌리고, 새 앱을 배포합니다. 문제는 그 사이에도 서버에서는 옛 앱이 돌고 있다는 것입니다. 마이그레이션이 끝나는 순간 옛 앱은 없는 열을 찾다가 오류를 냅니다. 새 앱을 배포한 뒤에 문제가 생겨도, 옛 앱으로 되돌릴 수 없습니다.
      </p>
      <p>
        그래서 스키마 변경은 앱 배포와 엇갈리게 세 단계로 나눕니다. 이것을 <T en="expand and contract">확장-축소</T> 패턴이라고 합니다.
      </p>
      <ol>
        <li>확장: 새 열을 <strong>추가만</strong> 합니다. 옛 앱은 모르는 열을 무시하므로 그대로 돕니다. 그다음 두 열에 모두 쓰는 다리 버전(v2)을 배포합니다.</li>
        <li>이전: 기존 행의 값을 새 열로 채웁니다. 그다음 새 열만 쓰는 버전(v3)을 배포합니다.</li>
        <li>축소: 아무도 옛 열을 쓰지 않는 것이 확실해지면 옛 열을 지웁니다.</li>
      </ol>
      <MigrationFigure />
      <p>
        "한 번에 바꾸기"의 1단계를 보세요. 마이그레이션은 성공했는데 서비스는 멈췄습니다. "확장 → 이전 → 축소"로 바꿔 한 단계씩 넘기면, 마지막 단계 전까지는 언제나 앞 버전으로 되돌릴 곳이 남아 있습니다. 1단계에서는 v1이 쓴 새 행의 status가 비어 있으므로, 채우기는 v2 배포가 끝나 v1이 더는 쓰지 않을 때 해야 합니다. 4단계에서 v1으로 되돌리면 v3가 쓴 행의 done이 비어 있어 잘못 읽히지만, v2로 되돌리면 안전합니다. 다리 버전이 필요한 이유입니다.
      </p>
      <Callout kind="key">
        마지막 축소 단계(옛 열 삭제)는 되돌릴 수 없는 유일한 단계입니다. 그래서 새 버전이 충분히 오래 문제없이 돈 것을 확인한 뒤, 보통은 다음 배포 주기에 따로 합니다. 그 전까지는 앱을 언제든 한 단계 앞으로 되돌릴 수 있습니다.
      </Callout>
      <p>
        이 단계들은 Flyway나 Liquibase 같은 마이그레이션 도구에 번호 붙은 파일로 적어 두고, 배포 파이프라인이 순서대로 한 번씩만 실행하게 합니다. 파일 하나가 배포 한 번에 대응합니다.
      </p>
      <Code label="db/migration (Flyway)">{`
-- V7__add_status.sql          (배포 1: 확장, 이후 앱 v2 배포)
ALTER TABLE todos ADD COLUMN status TEXT;

-- V8__backfill_status.sql     (배포 2: 이전, 이후 앱 v3 배포)
UPDATE todos SET status = CASE WHEN done THEN 'done' ELSE 'todo' END
WHERE status IS NULL;

-- V9__drop_done.sql           (배포 3: 축소, v3가 며칠 문제없이 돈 뒤)
ALTER TABLE todos DROP COLUMN done;`}</Code>
      <p>
        배포는 버튼을 누르는 것으로 끝나지 않습니다. 그림 1의 모든 방식은 결국 누군가 오류율을 보고 있어야 의미가 있습니다. 다음 장 <a href={lessonHref('se-basics', 'observability')}>로그와 모니터링</a>에서는 무엇을 재고, 경보를 언제 울려야 하는지 봅니다.
      </p>

      <Quiz
        q={
          <>
            서버 10대에 순차 배포를 합니다. 옛 버전의 오류율은 0.5%이고, 새 버전에는 요청의 4%를 실패시키는 버그가 있습니다. 경보는 전체 오류율이 3%를 넘으면 울립니다. 잡음이 없다면 서버가 몇 대 바뀌었을 때 처음 경보가 울릴까요?
          </>
        }
        options={['1대', '3대', '8대', '10대가 다 바뀌어도 울리지 않는다']}
        answer={2}
        explain={
          <>
            k대가 바뀌면 전체 오류율은 (0.5% × (10 − k) + 4% × k) / 10 = 0.5% + 0.35% × k입니다. 3%를 넘으려면 k가 7.14보다 커야 하므로 8대째에 처음 넘습니다(7대일 때는 2.95%). 그때는 이미 사용자 80%가 버그를 만나고 있습니다. 새 버전 요청만 따로 재는 카나리라면 4% &gt; 3%이므로 첫 단계에서 바로 잡습니다.
          </>
        }
      />
    </>
  );
}

import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { FLAKY_DEFAULTS, falseRedChance, missChance, mmss, plan, simulateFlaky, workflowYaml, type PipeOpts } from './pipeline';
import './basics.css';
import './ci.css';

/* ─────────────── Figure 1: the pipeline on a timeline ─────────────── */

/** Fixed scale so bars visibly shrink as the reader turns things on. */
const SCALE = 14 * 60;
const TICK = 2 * 60;
const pct = (s: number) => `${(s / SCALE) * 100}%`;

function PipelineFigure({ o, set }: { o: PipeOpts; set: (o: PipeOpts) => void }) {
  const p = useMemo(() => plan(o), [o]);
  const seq = useMemo(() => plan({ ...o, parallel: false }), [o]);
  const critLabels = p.jobs.filter((j) => j.critical).map((j) => j.label);

  return (
    <Figure
      no={1}
      title="파이프라인은 얼마나 걸리나"
      hint="병렬, 캐시, 테스트 나누기를 바꿔 보세요"
      caption={
        <>
          가로축은 커밋을 올린 뒤 흐른 시간이고, 막대 하나가 러너(깨끗한 컴퓨터) 한 대에서 도는 잡입니다. 회색은 코드 받기와 설치 같은 준비, 초록은 캐시에서 되살린 부분, 보라는 실제 검사입니다. 주황 테두리를 두른 잡을 이은 것이 임계 경로이고, 점선이 파이프라인이 끝나는 시각입니다. 마우스를 올리면 단계마다 걸린 시간이 보입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ci-gantt" role="img" aria-label={`파이프라인 시간표. 전체 ${mmss(p.wall)}, 임계 경로 ${critLabels.join(' → ')}`}>
            {p.jobs.map((j) => (
              <div key={j.id} className="ci-row" data-crit={j.critical || undefined}>
                <span className="ci-job" title={j.label}>
                  {j.label}
                </span>
                <div className="ci-track" style={{ ['--tick' as string]: pct(TICK) } as CSSProperties}>
                  <div className="ci-bar" style={{ left: pct(j.start), width: pct(j.dur) }} title={`${j.label}: ${mmss(j.start)}에 시작, ${mmss(j.dur)} 걸림`}>
                    {j.steps.map((s, i) => (
                      <span key={i} className="ci-seg" data-k={s.kind} style={{ width: `${(s.secs / j.dur) * 100}%` }} title={`${s.label} ${s.secs}초`}>
                        {s.secs / SCALE > 0.06 ? s.label : ''}
                      </span>
                    ))}
                  </div>
                  <div className="ci-end" style={{ left: pct(p.wall) }} aria-hidden="true" />
                </div>
              </div>
            ))}
            <div className="ci-row">
              <span />
              <div className="ci-axis" aria-hidden="true">
                {Array.from({ length: SCALE / TICK / 2 + 1 }, (_, i) => i * 2 * TICK)
                  .filter((t) => t < SCALE)
                  .map((t) => (
                    <span key={t} style={{ left: pct(t) }}>
                      {t / 60}분
                    </span>
                  ))}
              </div>
            </div>
          </div>
          <Legend
            items={[
              { color: 'color-mix(in srgb, var(--ink-3) 35%, var(--surface))', label: '준비', shape: 'sq' },
              { color: 'color-mix(in srgb, var(--c-se-1) 45%, var(--surface))', label: '캐시', shape: 'sq' },
              { color: 'color-mix(in srgb, var(--c-se-2) 45%, var(--surface))', label: '검사', shape: 'sq' },
              { color: 'var(--c-se-3)', label: '임계 경로', shape: 'ln' },
            ]}
          />
          <div className="controls row">
            <Readout label="커밋에서 결과까지" value={mmss(p.wall)} color={p.wall < seq.wall ? 'var(--good)' : undefined} />
            <Readout label="러너 사용 시간 합" value={mmss(p.runnerSecs)} />
            <Readout label="임계 경로" value={critLabels.join(' → ')} />
          </div>
        </div>
        <div className="controls">
          <Seg
            label="잡 나누기"
            value={o.parallel ? 'par' : 'seq'}
            onChange={(v) => set({ ...o, parallel: v === 'par' })}
            options={[
              { value: 'seq', label: '한 잡에 차례로' },
              { value: 'par', label: '여러 잡을 병렬로' },
            ]}
          />
          <Check label="의존성과 빌드 결과 캐시 쓰기" checked={o.cache} onChange={(v) => set({ ...o, cache: v })} />
          <Check label={<>이번 커밋이 package-lock.json을 바꿈{!o.cache && ' (캐시를 켜면 의미가 있습니다)'}</>} checked={o.lockChanged} onChange={(v) => set({ ...o, lockChanged: v })} />
          <Slider label={<>단위 테스트를 나눌 잡 수{!o.parallel && ' (병렬일 때만)'}</>} value={o.shards} min={1} max={4} step={1} onChange={(v) => set({ ...o, shards: v })} format={(v) => `${v}개`} />
          <Readout label="한 잡에 차례로 했다면" value={mmss(seq.wall)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: flaky tests ─────────────── */

const FLAKY_NAMES = ['로그인 e2e: 버튼이 늦게 뜸', '마감 알림 시각 (시간대)', '목록 정렬 (같은 시각의 할 일)', '포트 3000을 이미 씀', '외부 날씨 API 응답 대기', '애니메이션 끝나기 전 클릭', '임시 파일 이름 충돌', '앞 테스트가 남긴 데이터', '병렬 실행 중 메모리 부족', '자정을 넘는 날짜 계산'];

const OUTCOME_LABEL = { pass: '통과', retried: '재시도 뒤 통과', 'false-red': '빨간 불 (버그 없음)', caught: '빨간 불 (진짜 버그)', missed: '버그가 통과함' } as const;

function FlakyFigure() {
  const [flaky, setFlaky] = useState(FLAKY_DEFAULTS.flaky);
  const [p, setP] = useState(FLAKY_DEFAULTS.p);
  const [retries, setRetries] = useState(0);
  const [commits, setCommits] = useState(FLAKY_DEFAULTS.commits);
  const [seed, setSeed] = useState(1);
  const r = useMemo(() => simulateFlaky({ ...FLAKY_DEFAULTS, flaky, p, retries, commits, seed }), [flaky, p, retries, commits, seed]);
  const expectFalse = falseRedChance(flaky, p, retries);
  const clean = commits - r.bugs;
  const saved = r.savedByRetry.map((n, i) => ({ name: FLAKY_NAMES[i], n })).filter((x) => x.n > 0);

  return (
    <Figure
      no={2}
      title="가끔만 실패하는 테스트"
      hint="불안정한 테스트를 늘리고 재시도를 켜 보세요"
      caption={
        <>
          칸 하나가 커밋 하나의 파이프라인 결과입니다. 커밋의 {FLAKY_DEFAULTS.bugRate * 100}%에는 진짜 버그가 있고, 그 가운데 {FLAKY_DEFAULTS.intermittentShare * 100}%는 경쟁 조건처럼 실행할 때마다 {FLAKY_DEFAULTS.intermittentP * 100}% 확률로만 드러나는 버그입니다. 나머지 실패는 코드와 상관없이 불안정한 테스트가 낸 것입니다. 같은 설정이면 같은 결과가 나오고, "다시 굴리기"는 난수의 씨앗만 바꿉니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ci-commits" role="img" aria-label={`커밋 ${commits}개 가운데 빨간 불 ${r.reds}번, 그중 진짜 버그 ${r.caught}번, 지나간 버그 ${r.missed}개`}>
            {r.runs.map((x, i) => (
              <span key={i} className="ci-commit" data-o={x.outcome} title={`커밋 ${i + 1}: ${OUTCOME_LABEL[x.outcome]}`} />
            ))}
          </div>
          <div className="ci-legend" aria-hidden="true">
            {(Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).map((k) => (
              <span key={k}>
                <span className="ci-commit" data-o={k} />
                {OUTCOME_LABEL[k]}
              </span>
            ))}
          </div>
          <div className="controls row">
            <Readout label="빨간 불" value={`${r.reds}번`} />
            <Readout label="그중 진짜 버그" value={r.reds ? `${r.caught}번 (${Math.round(r.redPrecision * 100)}%)` : '–'} color={r.reds && r.redPrecision < 0.5 ? 'var(--bad)' : undefined} />
            <Readout label="버그 없는 커밋이 빨개진 비율" value={`${clean ? Math.round((r.falseReds / clean) * 1000) / 10 : 0}% (계산 ${Math.round(expectFalse * 1000) / 10}%)`} />
            <Readout label="통과해 버린 버그" value={`${r.missed} / ${r.bugs}개`} color={r.missed ? 'var(--c-se-2)' : 'var(--good)'} />
          </div>
          {retries > 0 && (
            <div>
              <div className="ci-saved-title">재시도 기록: 처음엔 실패했다가 다시 돌려 통과한 테스트</div>
              <ul className="ci-saved">
                {saved.length === 0 && r.bugSavedByRetry === 0 && <li>없음</li>}
                {saved.map((x) => (
                  <li key={x.name}>
                    <span>{x.name}</span>
                    <span className="n">{x.n}번</span>
                  </li>
                ))}
                {r.bugSavedByRetry > 0 && (
                  <li data-bug>
                    <span>할 일 동시 저장 (진짜 버그)</span>
                    <span className="n">{r.bugSavedByRetry}번</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="controls">
          <Slider label="불안정한 테스트 수" value={flaky} min={0} max={10} step={1} onChange={setFlaky} format={(v) => `${v}개`} />
          <Slider label="하나가 이유 없이 실패할 확률" value={p} min={0} max={0.1} step={0.005} onChange={setP} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Seg
            label="실패한 테스트 다시 돌리기"
            value={retries}
            onChange={setRetries}
            options={[
              { value: 0, label: '안 함' },
              { value: 1, label: '1번' },
              { value: 2, label: '2번' },
            ]}
          />
          <Slider label="커밋 수" value={commits} min={20} max={200} step={10} onChange={setCommits} format={(v) => `${v}개`} />
          <Button onClick={() => setSeed((s) => s + 1)}>다시 굴리기</Button>
          <Readout label="재시도로 더 돌린 테스트" value={`${r.extraRuns}번`} />
          <Readout label="경쟁 조건 버그를 놓칠 확률" value={`${Math.round(missChance(FLAKY_DEFAULTS.intermittentP, retries) * 100)}%`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Ci() {
  const [opts, setOpts] = useState<PipeOpts>({ parallel: false, cache: false, shards: 1, lockChanged: false });

  return (
    <>
      <h2>커밋마다 기계가 검사하기</h2>
      <p>
        할 일 서비스를 네 사람이 함께 만듭니다. 각자 브랜치에서 일주일씩 작업하다 금요일에 한꺼번에 합치면, 서로 건드린 코드가 부딪히고, 누구의 변경이 테스트를 깨뜨렸는지 찾느라 하루가 갑니다. 합친 뒤에는 "내 컴퓨터에서는 됐는데"라는 말이 오갑니다. 내 노트북에만 깔린 도구, 커밋하지 않은 파일, 나만 쓰는 환경 변수 때문입니다.
      </p>
      <p>
        <T en="continuous integration">지속적 통합</T>(CI)은 이것을 두 가지 습관으로 막습니다. 변경을 작게 나눠 자주(적어도 하루에 한 번) 주 브랜치에 합치고, 합치려는 커밋마다 <strong>깨끗한 컴퓨터</strong>가 처음부터 설치, 빌드, 테스트를 돌려 결과를 알려 줍니다. 문제가 생기면 방금 올린 작은 변경 안에 원인이 있으므로 찾기도 쉽습니다. 사람끼리 브랜치를 합치는 방법은 <a href={lessonHref('cs-software-design', 'collaboration')}>협업과 책임 있는 소프트웨어</a>에서 보았고, 이 장은 그 뒤에서 기계가 하는 일을 봅니다.
      </p>

      <h2>파이프라인과 단계</h2>
      <p>
        커밋 하나에 대해 CI가 하는 일의 묶음을 <T en="pipeline">파이프라인</T>이라고 합니다. 파이프라인은 여러 <T en="job">잡</T>으로, 잡은 차례로 실행하는 여러 <T en="step">단계</T>로 이루어집니다. 잡 하나는 <T en="runner">러너</T>라고 부르는 컴퓨터 한 대(대개 매번 새로 만드는 가상 머신)에서 돕니다. 할 일 서비스의 파이프라인은 이렇습니다.
      </p>
      <ul>
        <li>준비: 저장소를 받고(checkout), Node를 깔고, <a href={lessonHref('se-basics', 'packages')}>잠금 파일</a>대로 의존성을 설치합니다(npm ci).</li>
        <li>정적 검사: 코드 스타일 검사(lint)와 타입 검사(typecheck). 빠르고 싸므로 앞에 둡니다.</li>
        <li>빌드: <a href={lessonHref('se-basics', 'build')}>빌드와 증분 빌드</a>에서 본 컴파일, 묶기, 압축.</li>
        <li>테스트: 함수 단위로 확인하는 단위 테스트와, 진짜 브라우저로 화면을 눌러 보는 e2e 테스트.</li>
        <li>이미지: 모두 통과하면 배포할 컨테이너 이미지를 만듭니다.</li>
      </ul>
      <p>
        파이프라인이 빠르게 실패할수록 좋습니다. 1분이면 끝나는 lint가 10분짜리 e2e 테스트 뒤에 있으면, 쉼표 하나 때문에 10분을 기다립니다. 그리고 파이프라인 전체가 느리면 사람들은 결과를 기다리지 않고 다음 일로 넘어가, 실패를 알았을 때는 이미 무엇을 하던 중이었는지 잊어버립니다. 흔히 10분 안을 목표로 잡습니다.
      </p>

      <h2>병렬화와 캐시</h2>
      <p>
        한 잡 안에서 단계를 차례로 돌리면 시간은 모든 단계의 합입니다. 서로 기다릴 필요가 없는 일은 잡을 나눠 여러 러너에서 동시에 돌릴 수 있습니다. lint, 타입 검사, 빌드, 단위 테스트는 서로의 결과가 필요 없습니다. e2e 테스트는 빌드한 결과물이 있어야 하고, 이미지는 모든 검사가 통과해야 만듭니다. 이 "기다린다" 관계가 빌드 그래프처럼 잡의 그래프를 이룹니다.
      </p>
      <p>
        잡을 병렬로 돌리면 전체 시간은 가장 긴 사슬이 정합니다. 시작에서 끝까지 서로 기다리는 잡을 이었을 때 가장 오래 걸리는 사슬을 <T en="critical path">임계 경로</T>라고 합니다. 임계 경로 위에 있지 않은 잡은 아무리 빠르게 해도 전체 시간이 줄지 않습니다.
      </p>
      <PipelineFigure o={opts} set={setOpts} />
      <p>몇 가지를 차례로 해 보세요.</p>
      <ul>
        <li>"여러 잡을 병렬로"만 켜면 시간이 생각보다 덜 줄어듭니다. 잡마다 러너가 새 컴퓨터라 저장소 받기와 npm ci를 각자 다시 하기 때문입니다. 러너 사용 시간 합(돈을 내는 시간)은 오히려 늘어납니다.</li>
        <li>여기에 캐시를 켜면 모든 잡의 준비가 함께 짧아집니다. 반복되는 준비가 많은 병렬 파이프라인일수록 캐시가 더 큰 차이를 냅니다.</li>
        <li>캐시를 켠 병렬 파이프라인에서는 단위 테스트가 임계 경로입니다. 둘로 나누면 빨라지지만, 셋, 넷으로 나눠도 더는 빨라지지 않습니다. 임계 경로가 build → e2e → image로 옮겨 갔기 때문입니다.</li>
        <li>"package-lock.json을 바꿈"을 켜면 캐시가 소용없어집니다. 캐시 키가 잠금 파일의 해시로 만들어지므로, 의존성이 바뀐 커밋은 처음부터 설치하고 새 캐시를 저장합니다.</li>
      </ul>
      <Callout kind="key">
        CI 캐시는 <a href={lessonHref('se-basics', 'build')}>빌드 캐시</a>와 같은 원리입니다. 입력(잠금 파일, 소스)의 해시로 키를 만들고, 같은 키면 저장해 둔 결과를 쓰고, 다르면 새로 만들어 저장합니다. 그래서 키에 넣지 않은 입력이 결과를 바꾸면 캐시는 틀린 결과를 돌려줍니다.
      </Callout>

      <h2>불안정한 테스트</h2>
      <p>
        코드를 한 줄도 바꾸지 않았는데 어떤 때는 통과하고 어떤 때는 실패하는 테스트를 <T en="flaky test">불안정한 테스트</T>라고 합니다. 원인은 대개 테스트가 통제하지 못하는 것에 기대는 데 있습니다. 화면에 버튼이 뜨기까지 걸리는 시간, 테스트가 도는 순서, 앞 테스트가 남긴 데이터, 바깥 네트워크, 지금 시각과 시간대 같은 것들입니다.
      </p>
      <p>
        테스트 하나가 이유 없이 실패할 확률이 작아도, 그런 테스트가 여럿이면 이야기가 달라집니다. 불안정한 테스트 <M>k</M>개가 각각 확률 <M>p</M>로 실패하면, 버그가 없는 커밋이 빨간 불을 받을 확률은
      </p>
      <MB note="실패한 테스트를 r번 다시 돌리면 p 자리에 p^(r+1)이 들어갑니다.">{String.raw`P(\text{이유 없는 빨간 불}) = 1 - (1-p)^k`}</MB>
      <p>
        <M>p</M> = 3%, <M>k</M> = 5이면 약 14%입니다. 일곱 커밋에 한 번꼴로 아무 이유 없이 파이프라인이 빨개집니다. 진짜 버그가 들어오는 커밋이 5%뿐이라면, 빨간 불의 대부분은 거짓입니다. 아래 그림에서 직접 세어 보세요.
      </p>
      <FlakyFigure />
      <p>
        처음 설정에서 빨간 불 가운데 진짜 버그는 다섯에 하나 정도입니다. 이런 일이 몇 주 이어지면 팀은 빨간 불을 보고 코드를 살피는 대신 "또 그거겠지" 하고 다시 돌리기 버튼부터 누릅니다. 그러다 진짜 버그의 빨간 불도 같은 버튼으로 넘겨 버립니다. CI의 가치는 빨간 불을 믿을 수 있다는 데서 나오는데, 불안정한 테스트는 바로 그 믿음을 갉아먹습니다.
      </p>
      <p>
        "실패한 테스트 다시 돌리기"를 1번으로 바꾸면 거짓 빨간 불은 거의 사라집니다. 대신 두 가지 값을 치릅니다. 테스트를 더 돌리느라 시간이 들고, 경쟁 조건처럼 가끔만 드러나는 진짜 버그도 다시 돌리면 통과해 버립니다(보라 동그라미). 재시도는 문제를 고치는 것이 아니라 덮는 것입니다. 그래도 쓸모가 있으려면, 그림 아래처럼 <strong>재시도 뒤에야 통과한 테스트를 기록</strong>해야 합니다. 그 목록이 고칠 테스트의 목록이고, 그 안에 진짜 버그가 숨어 있을 수 있습니다.
      </p>
      <Callout kind="warn">
        많은 팀이 불안정한 테스트를 찾으면 격리(quarantine)합니다. 파이프라인의 통과 여부에서는 빼되 계속 돌려 기록하고, 담당자와 기한을 정해 고칩니다. 지우거나 재시도 횟수만 늘리면 그 테스트가 지키던 동작은 아무도 지키지 않게 됩니다.
      </Callout>

      <h2>실제 도구: GitHub Actions</h2>
      <p>
        GitHub Actions에서는 저장소의 <code>.github/workflows/</code> 폴더에 YAML 파일로 파이프라인을 적습니다. <code>on</code>은 언제 돌지, <code>jobs</code> 아래 이름 하나가 잡 하나, <code>runs-on</code>은 러너의 종류, <code>needs</code>는 먼저 끝나야 하는 잡, <code>strategy.matrix</code>는 같은 잡을 값만 바꿔 여러 개 띄우는 방법입니다. 아래 파일은 그림 1의 지금 설정을 그대로 옮긴 것이라, 그림의 설정을 바꾸면 함께 바뀝니다.
      </p>
      <Code label=".github/workflows/ci.yml (그림 1의 설정)">{workflowYaml(opts)}</Code>
      <p>
        병렬로 나누면 잡마다 checkout과 npm ci가 되풀이되는 것이 파일에서도 보입니다. 잡끼리는 파일을 나눠 갖지 않으므로, 빌드 결과물은 <code>upload-artifact</code>로 올리고 <code>download-artifact</code>로 받습니다. 재시도는 테스트 도구에서 켭니다. 아래는 Playwright가 새 프로젝트에 만들어 주는 설정의 일부로, CI에서만 실패한 테스트를 두 번 더 돌립니다. 이 경우에도 결과 보고서에 "flaky"로 따로 표시되므로 그 목록을 챙겨 봐야 합니다.
      </p>
      <Code label="playwright.config.ts">{`
export default defineConfig({
  forbidOnly: !!process.env.CI,      // CI에서는 test.only를 남긴 커밋을 실패로
  retries: process.env.CI ? 2 : 0,   // CI에서만 실패한 테스트를 두 번 더
});`}</Code>
      <p>
        마지막으로, 저장소 설정에서 이 워크플로를 주 브랜치에 합치기 전의 필수 검사로 지정하면 빨간 불인 변경은 합칠 수 없게 됩니다. 이렇게 초록 불을 받은 커밋을 사용자에게 내보내는 방법은 다음 장 <a href={lessonHref('se-basics', 'deploy')}>배포와 롤백</a>에서 봅니다.
      </p>

      <Quiz
        q={<>테스트 스위트에 불안정한 테스트가 10개 있고, 각각 1% 확률로 이유 없이 실패합니다. 재시도를 하지 않는다면, 버그가 없는 커밋의 파이프라인이 빨간 불을 받을 확률은 대략 얼마인가요?</>}
        options={['0.1%', '1%', '약 10%', '약 50%']}
        answer={2}
        explain={<>1 − 0.99¹⁰ ≈ 0.096, 곧 약 10%입니다. 테스트 하나하나는 99% 믿을 만해도, 열 개가 모두 통과해야 초록 불이므로 실패 확률이 거의 열 배로 늘어납니다. 그림 2에서 불안정한 테스트를 10개, 확률을 1%로 두고 커밋 수를 늘려 보세요.</>}
      />
    </>
  );
}

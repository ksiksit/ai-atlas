import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { RunBox, type Task } from '../../programming/lessons/RunBox';
import { DUP, REF, REQUESTS, TESTS, compile, countIfs, diffLines, editStats, maxDepth, runTests, steps, type Concern, type SrcFile } from './refactor';
import '../../programming/lessons/programming.css';
import './software.css';

/* ─────────────── Figure 1: one change, two codebases ─────────────── */

function Files({ files, c, grep, showGrep }: { files: SrcFile[]; c: Concern; grep: string; showGrep: boolean }) {
  return (
    <div className="sw-files">
      {files.map((f) => (
        <div key={f.name} className="sw-file">
          <div className="sw-file-name mono">{f.name}</div>
          <pre className="sw-code" aria-label={f.name}>
            {f.lines.map((ln, i) => {
              const need = !!ln.tags?.includes(c);
              const hit = showGrep && ln.text.includes(grep);
              return (
                <div key={i} className="sw-line" data-s={need ? 'edit' : 'dim'} data-grep={hit || undefined}>
                  <span className="sw-src">{ln.text}</span>
                  {showGrep && need && !hit && <span className="sw-tag" data-t="bad">grep이 놓침</span>}
                </div>
              );
            })}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ChangeCostFigure() {
  const [c, setC] = useState<Concern>('vat');
  const [showGrep, setShowGrep] = useState(false);
  const req = REQUESTS.find((r) => r.id === c)!;
  const dup = editStats(DUP, c, req.grep);
  const ref = editStats(REF, c, req.grepRef);

  return (
    <Figure
      no={1}
      title="같은 요구, 두 코드베이스"
      hint="요구 사항을 바꾸고 grep으로 찾아 보세요"
      caption={<>왼쪽은 금액 계산을 필요한 곳마다 복사해 붙인 코드, 오른쪽은 같은 기능을 money.js 하나로 모은 코드입니다. 노란 줄이 요구를 반영하려면 고쳐야 하는 줄입니다. "grep으로 찾기"를 켜면, 고칠 곳을 찾을 때 흔히 쓰는 문자열 검색이 찾아낸 줄에 파란 테두리를 칩니다.</>}
    >
      <div className="controls row">
        <Seg label="새 요구 사항" value={c} onChange={setC} options={REQUESTS.map((r) => ({ value: r.id, label: r.label }))} />
        <div className="ctl" style={{ flex: '0 1 auto', justifyContent: 'flex-end' }}>
          <Check label="grep으로 찾기" checked={showGrep} onChange={setShowGrep} />
        </div>
      </div>
      <div className="sw-ask">
        <strong>요구:</strong> {req.ask}
      </div>
      <div className="sw-pair">
        <div className="sw-col">
          <strong className="sw-pair-title">
            복사해 붙인 코드{showGrep && <span className="sw-label"> · 검색어 <code>{req.grep}</code></span>}
          </strong>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="고칠 줄" value={dup.sites} color="var(--bad)" />
            <Readout label="열 파일" value={dup.touched} />
            <Readout label="grep이 놓친 줄" value={showGrep ? dup.missed : '?'} color={showGrep && dup.missed ? 'var(--bad)' : undefined} />
          </div>
          <Files files={DUP} c={c} grep={req.grep} showGrep={showGrep} />
        </div>
        <div className="sw-col">
          <strong className="sw-pair-title">
            정리한 코드{showGrep && <span className="sw-label"> · 검색어 <code>{req.grepRef}</code></span>}
          </strong>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="고칠 줄" value={ref.sites} color="var(--good)" />
            <Readout label="열 파일" value={ref.touched} />
            <Readout label="grep이 놓친 줄" value={showGrep ? ref.missed : '?'} />
          </div>
          <Files files={REF} c={c} grep={req.grepRef} showGrep={showGrep} />
        </div>
      </div>
      <div className="sw-note">
        {showGrep
          ? c === 'sum'
            ? '수량 할인은 장바구니와 결제 두 곳만 고치면 될 것 같지만, 여기서는 grep이 둘 다 찾았습니다. 운이 좋은 경우입니다. 대신 정리한 코드에서는 subtotal 하나를 고치면 영수증과 관리자 보고서까지 같은 규칙을 따르게 됩니다.'
            : `왼쪽에서 grep은 ${dup.found}곳을 찾고 adminReport.js를 놓쳤습니다. 이 파일만 같은 계산을 다른 모양으로 적었기 때문입니다. 놓친 한 곳은 배포 뒤에 ${c === 'vat' ? '"관리자 화면의 매출만 세율이 틀렸다"' : '"관리자 화면만 옛 형식으로 금액을 보여 준다"'}는 버그로 돌아옵니다.`
          : '복사된 코드는 고칠 곳이 많은 것도 문제지만, 고칠 곳을 모두 찾을 수 있는지가 더 큰 문제입니다. grep으로 찾기를 켜 보세요.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a refactoring in small, tested steps ─────────────── */

function StepsFigure() {
  const [mistake, setMistake] = useState(false);
  const all = useMemo(() => steps(mistake), [mistake]);
  const expected = useMemo(() => {
    const ref = compile(all[0].code);
    return TESTS.map((t) => ref(structuredClone(t.order)));
  }, [all]);
  const results = useMemo(() => all.map((st) => runTests(st.code, expected)), [all, expected]);
  const s = useStepper(all.length, 1, null);
  const st = all[s.i];
  const res = results[s.i];
  const lines = st.code.split('\n');
  const diff = s.i > 0 ? diffLines(all[s.i - 1].code.split('\n'), lines) : { added: new Set<number>(), removed: 0 };
  const passed = res.filter((r) => r.pass).length;
  const green = passed === TESTS.length;

  return (
    <Figure
      no={2}
      title="한 단계씩 리팩터링하기"
      hint="한 단계씩 넘기며 테스트가 초록으로 남는지 보세요"
      caption={<>주문서를 만드는 함수를 다섯 단계에 걸쳐 고칩니다. 초록 줄은 바로 앞 단계에서 새로 생기거나 바뀐 줄입니다. 오른쪽 테스트 다섯 개는 처음 코드의 출력을 기대값으로 삼아, 단계마다 화면에 보이는 코드를 실제로 실행해 비교합니다. 단계가 바뀌어도 출력이 한 글자도 달라지지 않아야 리팩터링입니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <div className="sw-stephead">
            <strong>{st.title}</strong>
            {st.technique && <span className="sw-badge" data-t="dim">{st.technique}</span>}
          </div>
          <div className="sw-note">{st.why}</div>
          <pre className="sw-code" aria-label={`${st.title} 코드`}>
            {lines.map((ln, i) => (
              <div key={i} className="sw-line" data-s={diff.added.has(i) ? 'add' : undefined}>
                <span className="sw-ln">{i + 1}</span>
                <span className="sw-src">
                  {ln.includes('//') ? (
                    <>
                      {ln.slice(0, ln.indexOf('//'))}
                      <span className="cm">{ln.slice(ln.indexOf('//'))}</span>
                    </>
                  ) : (
                    ln
                  )}
                </span>
              </div>
            ))}
          </pre>
        </div>
        <div className="controls">
          <StepControls s={s} id="rf-speed" maxSpeed={3} />
          <div className="sw-tests" aria-live="polite">
            {TESTS.map((t, i) => (
              <div key={t.name} className="sw-test" data-pass={res[i].pass ? 'y' : 'n'}>
                <span className={res[i].pass ? 'sw-mark-ok' : 'sw-mark-bad'}>{res[i].pass ? '✓' : '✗'}</span>
                <span>{t.name}</span>
                <span className="sw-label">{res[i].pass ? '같음' : '다름'}</span>
                {!res[i].pass && <span className="mono sw-test-err">{res[i].got}</span>}
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="테스트" value={`${passed} / ${TESTS.length}`} color={green ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="바뀐 줄" value={s.i ? `+${diff.added.size} −${diff.removed}` : '—'} />
            <Readout label="if 문" value={countIfs(st.code)} />
            <Readout label="가장 깊은 들여쓰기" value={`${maxDepth(st.code)}단`} />
          </div>
          <Check label="3단계에서 기본값 처리를 빠뜨리기" checked={mistake} onChange={setMistake} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: refactor it yourself ─────────────── */

const MESSY = `
function shippingFee(order) {
  if (order.region === 'jeju') {
    if (order.total >= 50000) {
      return 3000;
    } else {
      return 3000 + 3000;
    }
  } else if (order.region === 'island') {
    if (order.total >= 50000) {
      return 5000;
    } else {
      return 5000 + 3000;
    }
  } else {
    if (order.total >= 50000) {
      return 0;
    } else {
      return 0 + 3000;
    }
  }
}
`;

const CLEAN = `
// 지역별 추가 요금. 새 지역은 여기에 한 줄을 더한다
const EXTRA = { jeju: 3000, island: 5000 };
const FREE_FROM = 50000;   // 이 금액 이상이면 기본 배송비 무료
const BASE_FEE = 3000;

function shippingFee(order) {
  const extra = EXTRA[order.region] ?? 0;
  const base = order.total >= FREE_FROM ? 0 : BASE_FEE;
  return extra + base;
}
`;

const SHIP_TESTS = [
  { args: [{ region: 'seoul', total: 20000 }], expect: 3000 },
  { args: [{ region: 'seoul', total: 50000 }], expect: 0, note: '경계값' },
  { args: [{ region: 'jeju', total: 49999 }], expect: 6000, note: '경계 바로 아래' },
  { args: [{ region: 'jeju', total: 80000 }], expect: 3000 },
  { args: [{ region: 'island', total: 10000 }], expect: 8000 },
  { args: [{ region: 'busan', total: 60000 }], expect: 0, note: '처음 보는 지역' },
];

const TASKS: Task[] = [
  {
    id: 'tidy',
    label: '1. 정리하기',
    prompt: (
      <p>
        같은 모양의 if가 세 번 되풀이되는 배송비 함수입니다. 먼저 실행해 테스트 여섯 개가 모두 통과하는 것을 확인하세요. 그다음 동작은 그대로 두고 구조만 고쳐 보세요. 중복된 숫자를 상수로, 지역별 차이를 표로 뽑아내면 됩니다. 한 번에 다 고치지 말고, 조금 고칠 때마다 실행해 초록이 유지되는지 보세요.
      </p>
    ),
    starter: MESSY,
    fnName: 'shippingFee',
    tests: SHIP_TESTS,
    solution: CLEAN,
  },
  {
    id: 'feature',
    label: '2. 새 요구 넣기',
    prompt: (
      <p>
        정리한 코드에 새 요구가 들어왔습니다. 산간 지역(<code>'mountain'</code>)은 4000원을 더 받고, 무료 배송 기준은 5만 원에서 4만 원으로 내립니다. 정리된 코드에서는 몇 줄을 고치면 될까요? 처음 코드였다면 몇 군데를 고쳐야 했을지도 생각해 보세요.
      </p>
    ),
    starter: CLEAN,
    fnName: 'shippingFee',
    tests: [
      { args: [{ region: 'mountain', total: 20000 }], expect: 7000, note: '새 지역' },
      { args: [{ region: 'seoul', total: 40000 }], expect: 0, note: '새 기준 경계값' },
      { args: [{ region: 'seoul', total: 39999 }], expect: 3000 },
      { args: [{ region: 'jeju', total: 45000 }], expect: 3000 },
      { args: [{ region: 'island', total: 10000 }], expect: 8000 },
    ],
    solution: `
const EXTRA = { jeju: 3000, island: 5000, mountain: 4000 };   // 한 줄 추가
const FREE_FROM = 40000;                                       // 숫자 하나 변경
const BASE_FEE = 3000;

function shippingFee(order) {
  const extra = EXTRA[order.region] ?? 0;
  const base = order.total >= FREE_FROM ? 0 : BASE_FEE;
  return extra + base;
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function Refactoring() {
  return (
    <>
      <h2>요구 사항은 바뀐다</h2>
      <p>
        소프트웨어는 처음 만드는 데보다 고치는 데 훨씬 오랜 시간을 보냅니다. 세율이 바뀌고, 디자이너가 금액 표시 형식을 바꾸고, 영업팀이 새 할인을 요청합니다. 그래서 코드의 품질을 재는 좋은 질문은 "지금 맞게 동작하는가?"와 함께 "다음 변경이 얼마나 쉬운가?"입니다.
      </p>
      <p>
        변경을 가장 어렵게 만드는 것은 <T en="duplication">중복</T>입니다. 같은 지식이 여러 곳에 복사되어 있으면, 그 지식이 바뀔 때 모든 복사본을 찾아 똑같이 고쳐야 합니다. 『실용주의 프로그래머』(1999)는 이를 "모든 지식은 시스템 안에서 단 하나의, 분명한, 권위 있는 표현을 가져야 한다"는 <T en="Don't Repeat Yourself">DRY 원칙</T>으로 정리했습니다.
      </p>
      <ChangeCostFigure />
      <p>
        세율 변경에서 왼쪽은 네 파일의 네 줄, 오른쪽은 <code>VAT_RATE</code> 한 줄입니다. 그런데 차이는 숫자보다 크게 벌어집니다. 복사본은 시간이 지나며 조금씩 달라집니다. adminReport.js를 쓴 사람은 <code>* 1.1</code> 대신 <code>sum + sum / 10</code>이라고 썼고, 금액도 <code>toFixed</code>로 다르게 꾸몄습니다. 그래서 문자열 검색으로는 찾을 수 없습니다. 중복의 진짜 비용은 고칠 곳의 개수가 아니라, <strong>고칠 곳을 빠짐없이 찾을 수 없다</strong>는 데 있습니다.
      </p>

      <h2>리팩터링: 동작은 그대로, 구조만 바꾸기</h2>
      <p>
        이미 중복과 엉킨 구조가 쌓인 코드는 어떻게 할까요? 마틴 파울러(Martin Fowler)는 『리팩터링』(1999)에서 이렇게 정의했습니다. <T en="refactoring">리팩터링</T>은 겉으로 드러나는 동작은 바꾸지 않으면서, 코드를 이해하고 고치기 쉽게 내부 구조를 바꾸는 일입니다. 핵심은 두 가지입니다. 동작을 바꾸지 않는다는 것, 그리고 아주 작은 단계로 나눠 매 단계 뒤에 테스트로 그것을 확인한다는 것입니다.
      </p>
      <p>리팩터링이 필요하다는 신호를 <T en="code smell">코드 냄새</T>라고 부릅니다. 자주 보는 냄새와 처방을 짝지으면 이렇습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>냄새</th>
              <th>처방</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>같은 코드가 여러 곳에</td>
              <td>함수 추출(Extract Function), 상수로 뽑기</td>
            </tr>
            <tr>
              <td>한 화면에 다 안 보이는 긴 함수</td>
              <td>함수 추출, 반복문 쪼개기(Split Loop)</td>
            </tr>
            <tr>
              <td>무슨 뜻인지 모를 이름 (l, amt, data2)</td>
              <td>이름 바꾸기(Rename)</td>
            </tr>
            <tr>
              <td>종류마다 늘어나는 if-else, switch</td>
              <td>조건문을 표(lookup)나 다형성으로 바꾸기</td>
            </tr>
            <tr>
              <td>설명 없는 숫자 (0.9, 50000)</td>
              <td>이름 붙은 상수로 바꾸기</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>그림 2에서 주문서 함수를 다섯 단계에 걸쳐 리팩터링합니다. 한 단계씩 넘겨 보세요.</p>
      <StepsFigure />
      <p>
        다섯 단계를 지나는 동안 테스트는 한 번도 빨개지지 않았고, if 문은 넷에서 0으로, 가장 깊은 들여쓰기는 3단에서 1단으로 줄었습니다. 각 단계는 몇 줄만 바꾸는 작은 변화라서, 무엇이 바뀌었는지 눈으로 확인하기도 쉽습니다. 이제 "새 상품 종류 음반(record) 추가"라는 요구가 오면 <code>PRICING</code> 표에 한 줄을 더하면 됩니다. 처음 코드였다면 반복문 한가운데의 if 사슬을 고쳐야 했습니다.
      </p>
      <p>
        이제 "3단계에서 기본값 처리를 빠뜨리기"를 켜고 3단계로 가 보세요. 원래의 if-else 사슬은 모르는 종류(toy)를 만나면 아무 분기에도 들어가지 않아 조용히 0원을 냈습니다. 표로 바꾸면서 이 숨은 동작을 놓치면, <code>PRICING['toy']</code>가 undefined라 함수 호출에서 멈춥니다. 겉보기에는 똑같은 코드 정리였지만 동작이 바뀐 것이고, 다섯 번째 테스트가 그 자리에서 잡아냅니다. 이 실수는 이후 모든 단계에 그대로 남는다는 점도 보세요. 단계마다 테스트를 돌리지 않았다면, 다섯 단계를 다 끝낸 뒤 어느 단계에서 깨졌는지 거슬러 찾아야 했을 것입니다.
      </p>
      <Callout kind="warn">
        리팩터링과 기능 추가를 한 커밋에 섞지 마세요. 켄트 벡(Kent Beck)은 이것을 "두 개의 모자"라고 불렀습니다. 리팩터링 모자를 쓴 동안에는 동작을 바꾸지 않고 테스트도 고치지 않습니다. 기능 모자를 쓴 동안에는 새 동작과 새 테스트를 더합니다. 둘을 섞으면 테스트가 실패했을 때 구조를 잘못 바꾼 것인지 새 기능이 틀린 것인지 가릴 수 없습니다.
      </Callout>

      <h2>직접 해 보기</h2>
      <Figure no={3} title="테스트를 켜 두고 정리하기" hint="실행 → 조금 고치기 → 다시 실행" caption={<>코드는 브라우저 안의 별도 작업자(Web Worker)에서 1초 제한으로 실행됩니다. 과제 1에서 테스트가 하나라도 빨개지면 방금 고친 것이 동작을 바꾼 것입니다. 되돌리고 더 작게 고쳐 보세요. 과제 2는 정리한 코드에서 시작합니다.</>}>
        <RunBox tasks={TASKS} id="rf-run-status" />
      </Figure>
      <p>
        과제 2의 새 요구는 정리한 코드에서 두 줄이면 끝납니다. 처음 코드였다면 산간 지역을 위한 if 블록 하나를 통째로 복사해 붙이고, 50000을 세 군데에서 40000으로 바꿔야 했습니다. 그중 하나를 빠뜨려도 테스트가 없다면 아무도 모릅니다. 켄트 벡의 말을 빌리면 "변경을 쉽게 만들고(이것은 어려울 수 있다), 그다음 쉬운 변경을 하라"입니다.
      </p>

      <h2>언제, 얼마나</h2>
      <p>
        모든 중복을 당장 없애야 하는 것은 아닙니다. 흔히 쓰는 기준은 <T en="rule of three">세 번의 법칙</T>입니다. 처음엔 그냥 짜고, 두 번째로 비슷한 코드를 쓸 때는 찜찜해도 복사하고, 세 번째에 리팩터링합니다. 사례가 둘뿐일 때 섣불리 공통점을 뽑으면, 세 번째 사례가 그 틀에 맞지 않아 매개변수와 if가 덕지덕지 붙은 함수가 되기 쉽습니다. 샌디 메츠(Sandi Metz)의 말처럼 "중복은 잘못된 추상화보다 훨씬 싸다"는 것도 기억해 둘 만합니다.
      </p>
      <p>
        가장 좋은 때는 기능을 더하기 직전입니다. 새 요구를 넣기 어렵게 생긴 곳을 먼저 리팩터링하고, 그다음 기능을 넣습니다. 오늘날의 편집기는 이름 바꾸기, 함수 추출 같은 리팩터링을 메뉴 하나로 해 주고, 모든 호출 지점을 함께 고쳐 줍니다. 손으로 하든 도구로 하든, 테스트가 없는 코드를 리팩터링하는 것은 안전망 없이 줄을 타는 것과 같습니다. <a href={lessonHref('cs-software-design', 'testing')}>테스트</a>를 먼저 갖추세요.
      </p>
      <p>
        테스트가 하나도 없는 오래된 코드라면, 맞는 동작이 무엇인지부터 모를 때가 많습니다. 그럴 때는 "지금 코드가 하는 일"을 그대로 기록하는 테스트를 먼저 씁니다. 마이클 페더스(Michael Feathers)가 <T en="characterization test">특성 테스트</T>라고 부른 방법입니다. 이 테스트는 옳고 그름을 따지지 않고, 리팩터링하는 동안 동작이 한 글자도 바뀌지 않았는지만 지켜봅니다. 그림 2의 테스트가 바로 이렇게, 처음 코드의 출력을 기대값으로 삼았습니다.
      </p>
      <Code label="특성 테스트: 지금의 출력을 그대로 고정한다">{`
// 1) 기대값을 모르는 채로 먼저 실행해 본다
console.log(statement(sampleOrder));
// → "주문서: 민지\n  소설: 30,000원\n합계: 30,000원"

// 2) 나온 결과를 그대로 기대값으로 적는다 (맞는지는 따지지 않는다)
test('statement: 리팩터링 전과 출력이 같다', () => {
  expect(statement(sampleOrder)).toBe('주문서: 민지\n  소설: 30,000원\n합계: 30,000원');
});
// 3) 이제 한 단계 고칠 때마다 이 테스트를 돌린다`}</Code>
      <Callout kind="key">
        중복은 변경 비용을 키우고, 복사본이 서로 달라지면 고칠 곳을 찾는 것조차 어려워집니다. 리팩터링은 동작을 그대로 둔 채 구조를 고치는 일이고, 작은 단계마다 테스트로 동작이 그대로인지 확인합니다. 기능 추가와 리팩터링은 나눠서 합니다.
      </Callout>
      <Quiz
        q="리팩터링 중에 함수 하나를 추출했더니 테스트 하나가 실패했습니다. 가장 좋은 다음 행동은?"
        options={['실패한 테스트의 기대값을 새 결과에 맞게 고친다', '방금 한 작은 변경을 되돌리고, 무엇이 동작을 바꿨는지 확인한 뒤 더 작게 다시 한다', '실패는 그대로 두고 리팩터링을 끝까지 마친 다음 한꺼번에 고친다', '그 테스트를 지운다. 리팩터링은 동작을 바꾸지 않으니 테스트가 틀린 것이다']}
        answer={1}
        explain={<>리팩터링은 동작을 바꾸지 않아야 하므로, 테스트가 실패했다면 방금 바꾼 작은 단계가 동작을 바꾼 것입니다. 단계가 작을수록 원인을 찾기 쉽고, 되돌리는 비용도 작습니다. 테스트를 고치거나 지우는 것은 동작이 바뀌었다는 경고를 무시하는 것이고, 실패를 쌓아 두면 어느 단계가 원인인지 알 수 없게 됩니다.</>}
      />
    </>
  );
}

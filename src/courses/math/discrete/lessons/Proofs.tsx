import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { ProofSteps, useProof, type ProofStep } from './parts';
import { choose, factor, isPrime, PRIMES, showFactors } from './numbers';
import './discrete.css';

/* ─────────────── Figure 1: √2 is not a fraction ─────────────── */

const SQRT2_STEPS: ProofStep[] = [
  {
    claim: (
      <>
        <strong>반대로 가정한다.</strong> <M>{'\\sqrt2'}</M>가 분수라고 하자. 즉 <M>{'\\sqrt2 = a/b'}</M>인 양의 정수 a, b가 있고, 이 분수는 이미 끝까지 약분되어 a와 b에 공통인 약수가 1뿐이다.
      </>
    ),
    why: '어떤 분수든 약분을 끝까지 하면 이런 꼴이 되므로, 처음부터 약분된 분수를 골라도 잃는 것이 없습니다.',
    tone: 'goal',
  },
  {
    claim: (
      <>
        양변을 제곱하면 <M>{'2 = a^2 / b^2'}</M>, 즉 <M>{'a^2 = 2b^2'}</M>이다.
      </>
    ),
    why: '양변에 b²을 곱했습니다.',
  },
  {
    claim: (
      <>
        <M>{'a^2'}</M>은 2의 배수, 곧 짝수다. 그러면 <strong>a도 짝수</strong>다. 그러니 <M>{'a = 2c'}</M>인 정수 c가 있다.
      </>
    ),
    why: '"n²이 짝수이면 n도 짝수"는 바로 앞 절에서 대우로 증명했습니다.',
  },
  {
    claim: (
      <>
        <M>{'a = 2c'}</M>를 대입하면 <M>{'4c^2 = 2b^2'}</M>, 즉 <M>{'b^2 = 2c^2'}</M>이다.
      </>
    ),
    why: '양변을 2로 나눴습니다.',
  },
  {
    claim: (
      <>
        같은 이유로 <M>{'b^2'}</M>이 짝수이므로 <strong>b도 짝수</strong>다.
      </>
    ),
    why: '3번 줄과 똑같은 논리를 b에 썼습니다.',
  },
  {
    claim: <>a와 b가 둘 다 짝수이므로 둘 다 2로 나누어진다. 그런데 1번 줄에서 a와 b의 공약수는 1뿐이라고 했다. 모순이다.</>,
    why: '같은 수학 안에서 "공약수가 1뿐이다"와 "2가 공약수다"가 동시에 참일 수는 없습니다.',
    tone: 'bad',
  },
  {
    claim: (
      <>
        모순에 이른 원인은 1번 줄의 가정뿐이다. 따라서 가정이 거짓이고, <M>{'\\sqrt2'}</M>는 분수로 쓸 수 없다. 즉 <strong>무리수</strong>다. ∎
      </>
    ),
    why: '∎는 증명이 끝났다는 표시입니다.',
    tone: 'good',
  },
];

function Sqrt2Figure() {
  const p = useProof(SQRT2_STEPS.length);
  const [b, setB] = useState(12);
  const a = Math.round(b * Math.SQRT2);
  const d = a * a - 2 * b * b;
  const NEAR = [
    [3, 2],
    [7, 5],
    [17, 12],
    [41, 29],
    [99, 70],
    [239, 169],
    [577, 408],
  ];
  return (
    <Figure
      no={1}
      title="√2는 분수가 아니다: 귀류법"
      hint="한 줄씩 넘기며 읽고, 분모를 바꿔 보세요"
      caption={<>왼쪽은 증명을 한 줄씩 펼친 것입니다. 오른쪽은 증명이 말하는 내용을 숫자로 확인합니다. 분모 b를 정하면 √2에 가장 가까운 분자 a를 고르고, a²과 2b²을 비교합니다. 두 수가 같아지는 b는 없습니다. 차이가 ±1까지 줄어드는 분수(3/2, 7/5, 17/12, …)는 있지만 0이 되지는 않습니다.</>}
    >
      <div className="fig-split">
        <ProofSteps steps={SQRT2_STEPS} p={p} label="√2가 무리수라는 증명" />
        <div className="controls">
          <Slider id="sq-b" label="분모 b" value={b} min={1} max={500} step={1} onChange={setB} />
          <div className="dm-sentence">
            <M>{`\\sqrt2 \\approx \\tfrac{${a}}{${b}} = ${(a / b).toFixed(6)}`}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="a²" value={(a * a).toLocaleString('ko-KR')} />
            <Readout label="2b²" value={(2 * b * b).toLocaleString('ko-KR')} />
            <Readout label="a² − 2b²" value={d > 0 ? `+${d}` : String(d)} color={Math.abs(d) === 1 ? 'var(--c-math-1)' : undefined} />
            <Readout label="a²이 짝수?" value={a % 2 === 0 ? '예 → a 짝수' : '아니오'} />
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>가장 가까운 분수들 (차이 ±1)</span>
            </span>
            <div className="btn-row">
              {NEAR.map(([x, y]) => (
                <Button key={y} small onClick={() => setB(y)}>
                  {x}/{y}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Euclid's primes ─────────────── */

const EUCLID_POOL = PRIMES.slice(0, 12);

function EuclidPrimesFigure() {
  const [chosen, setChosen] = useState<number[]>([2, 3, 5, 7, 11, 13]);
  const list = EUCLID_POOL.filter((x) => chosen.includes(x));
  const prod = list.reduce((a, x) => a * x, 1);
  const N = prod + 1;
  const fs = useMemo(() => factor(N), [N]);
  const fresh = [...new Set(fs)];
  const toggle = (x: number) => setChosen((c) => (c.includes(x) ? c.filter((y) => y !== x) : [...c, x]));
  const firstK = (k: number) => setChosen(EUCLID_POOL.slice(0, k));

  return (
    <Figure
      no={2}
      title="소수 목록에 없는 소수 만들기"
      hint="소수를 골라 '이것이 전부'라고 가정해 보세요"
      caption={<>고른 소수를 모두 곱하고 1을 더한 수 N은 목록의 어느 소수로 나눠도 나머지가 1입니다. 그래서 N을 소인수분해하면 반드시 목록에 없는 소수가 나옵니다. N 자신이 소수일 때도 있고(2·3·5·7·11 + 1 = 2311), 아닐 때도 있습니다(2·3·5·7·11·13 + 1 = 30031 = 59 × 509). 어느 쪽이든 목록은 전부가 아닙니다.</>}
    >
      <div className="ctl">
        <span className="ctl-label">
          <span>"소수는 이것뿐이다" ({list.length}개)</span>
        </span>
        <div className="dm-keys" role="group" aria-label="목록에 넣을 소수">
          {EUCLID_POOL.map((x) => (
            <button key={x} type="button" className="dm-key dm-toggle" aria-pressed={chosen.includes(x)} onClick={() => toggle(x)}>
              {x}
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          {[1, 3, 5, 6, 8, 12].map((k) => (
            <Button key={k} small onClick={() => firstK(k)}>
              처음 {k}개
            </Button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="dm-note">소수를 하나 이상 골라 주세요.</div>
      ) : (
        <>
          <div className="dm-euclid">
            <div className="dm-euclid-row">
              <span className="lbl">N =</span>
              <span className="mono">
                {list.join(' × ')} + 1 = <strong>{N.toLocaleString('ko-KR')}</strong>
              </span>
            </div>
            <div className="dm-euclid-row">
              <span className="lbl">N을 목록의 소수로 나눈 나머지</span>
              <span className="dm-rems">
                {list.map((x) => (
                  <span key={x} className="dm-chip">
                    ÷{x} → {N % x}
                  </span>
                ))}
              </span>
            </div>
            <div className="dm-euclid-row">
              <span className="lbl">N의 소인수분해</span>
              <span className="mono">
                {N.toLocaleString('ko-KR')} = {fs.length === 1 ? <strong>소수</strong> : showFactors(fs)}
              </span>
            </div>
            <div className="dm-euclid-row">
              <span className="lbl">목록에 없던 소수</span>
              <span className="dm-rems">
                {fresh.map((x) => (
                  <span key={x} className="dm-chip dm-chip-new">
                    {x.toLocaleString('ko-KR')}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            <Readout label="목록의 소수" value={`${list.length}개`} />
            <Readout label="N이 소수인가" value={isPrime(N) ? '예' : '아니오'} />
            <Readout label="새로 찾은 소수" value={`${fresh.length}개`} color="var(--c-math-1)" />
          </div>
        </>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 3: hunting for a counterexample ─────────────── */

interface Check {
  n: number;
  ok: boolean;
  text: string;
}
interface Claim {
  id: string;
  label: string;
  tex: string;
  domain: string;
  checks: () => Check[];
  known: string;
}

const upTo = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const fmtN = (x: number) => x.toLocaleString('ko-KR');

const CLAIMS: Claim[] = [
  {
    id: 'euler',
    label: 'n² + n + 41은 항상 소수다',
    tex: 'n^2 + n + 41 \\text{ 은 소수}',
    domain: 'n = 0, 1, 2, …',
    checks: () =>
      upTo(0, 60).map((n) => {
        const v = n * n + n + 41;
        const ok = isPrime(v);
        return { n, ok, text: `${n}² + ${n} + 41 = ${fmtN(v)}${ok ? ' (소수)' : ` = ${showFactors(factor(v))}`}` };
      }),
    known: '오일러가 1772년에 소개한 식입니다. n = 0부터 39까지 40번 연속으로 소수를 내지만 n = 40에서 41²이 됩니다.',
  },
  {
    id: 'mersenne',
    label: 'n이 소수이면 2ⁿ − 1도 소수다',
    tex: 'n \\text{ 소수} \\Rightarrow 2^n - 1 \\text{ 소수}',
    domain: 'n = 2, 3, 5, 7, 11, … (소수만)',
    checks: () =>
      PRIMES.slice(0, 10).map((n) => {
        const v = 2 ** n - 1;
        const ok = isPrime(v);
        return { n, ok, text: `2^${n} − 1 = ${fmtN(v)}${ok ? ' (소수)' : ` = ${showFactors(factor(v))}`}` };
      }),
    known: '처음 네 번은 맞아서 그럴듯해 보입니다. 거꾸로 "2ⁿ − 1이 소수이면 n이 소수"는 참이고, 이런 소수를 메르센 소수라고 부릅니다.',
  },
  {
    id: 'circle',
    label: '원 위의 점 n개를 모두 이으면 원은 2ⁿ⁻¹ 조각이 된다',
    tex: '\\text{조각 수} = 2^{n-1}',
    domain: 'n = 1, 2, 3, … (세 현이 한 점에서 만나지 않게)',
    checks: () =>
      upTo(1, 12).map((n) => {
        const v = choose(n, 4) + choose(n, 2) + 1;
        const e = 2 ** (n - 1);
        return { n, ok: v === e, text: `점 ${n}개 → ${v}조각, 2^${n - 1} = ${e}${v === e ? '' : ' (다름)'}` };
      }),
    known: '1, 2, 4, 8, 16까지는 정확히 두 배씩 늘어납니다. 실제 조각 수는 C(n,4) + C(n,2) + 1이라 n = 6에서 32가 아니라 31입니다.',
  },
  {
    id: 'fermat',
    label: '2^(2ⁿ) + 1은 항상 소수다',
    tex: '2^{2^n} + 1 \\text{ 은 소수}',
    domain: 'n = 0, 1, 2, …',
    checks: () =>
      upTo(0, 5).map((n) => {
        const v = 2 ** (2 ** n) + 1;
        const ok = isPrime(v);
        return { n, ok, text: `2^${2 ** n} + 1 = ${fmtN(v)}${ok ? ' (소수)' : ` = ${showFactors(factor(v))}`}` };
      }),
    known: '페르마는 1640년에 이것이 참이라고 믿었습니다. 반례 n = 5는 거의 100년 뒤 오일러가 찾았습니다. 손으로 43억을 소인수분해해야 했으니까요.',
  },
  {
    id: 'odd8',
    label: 'n이 홀수이면 n² − 1은 8의 배수다',
    tex: 'n \\text{ 홀수} \\Rightarrow 8 \\mid n^2 - 1',
    domain: 'n = 1, 3, 5, …',
    checks: () =>
      upTo(1, 199, 2).map((n) => {
        const v = n * n - 1;
        return { n, ok: v % 8 === 0, text: `${n}² − 1 = ${fmtN(v)} = 8 × ${fmtN(v / 8)}` };
      }),
    known: '반례가 나오지 않습니다. 이것은 참이고, 아래 본문에서 직접 증명합니다. 하지만 100개를 확인한 것 자체는 증명이 아닙니다.',
  },
  {
    id: 'goldbach',
    label: '4 이상의 짝수는 두 소수의 합이다',
    tex: 'n \\ge 4 \\text{ 짝수} \\Rightarrow n = p + q',
    domain: 'n = 4, 6, 8, …',
    checks: () =>
      upTo(4, 300, 2).map((n) => {
        const p = PRIMES_TO_300.find((x) => isPrime(n - x)) ?? 0;
        return { n, ok: p > 0, text: p ? `${n} = ${p} + ${n - p}` : `${n}: 찾지 못함` };
      }),
    known: '골드바흐의 추측입니다. 컴퓨터로 4 × 10¹⁸까지 확인했지만 아직 아무도 증명하지 못했습니다. 확인한 범위가 아무리 넓어도 증명은 아닙니다.',
  },
];
const PRIMES_TO_300 = upTo(2, 300).filter(isPrime);

function CirclePicture({ n }: { n: number }) {
  const R = 64;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + 0.21 * Math.sin(i * 1.7); // uneven spacing keeps three chords from meeting
    return [80 + R * Math.cos(a), 80 + R * Math.sin(a)];
  });
  return (
    <svg viewBox="0 0 160 160" className="dm-circle" role="img" aria-label={`원 위의 점 ${n}개와 그 사이를 모두 이은 현`}>
      <circle cx="80" cy="80" r={R} className="ring" />
      {pts.map((p, i) =>
        pts.slice(i + 1).map((q, j) => <line key={`${i}-${j}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="chord" />),
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5" className="pt" />
      ))}
    </svg>
  );
}

function CounterFigure() {
  const [cid, setCid] = useState('euler');
  const claim = CLAIMS.find((c) => c.id === cid)!;
  const all = useMemo(() => claim.checks(), [claim]);
  const firstBad = all.findIndex((c) => !c.ok);
  const frames = firstBad >= 0 ? all.slice(0, firstBad + 1) : all;
  const s = useStepper(frames.length, 8, cid);
  const cur = frames[s.i];
  const found = firstBad >= 0 && s.i === firstBad;
  const done = s.i === frames.length - 1;

  return (
    <Figure
      no={3}
      title="반례 찾기"
      hint="주장을 고르고 재생해 보세요"
      caption={<>컴퓨터가 n을 하나씩 넣어 주장을 확인합니다. 초록 칸은 성립한 경우, 빨간 칸은 반례입니다. 반례 하나면 "항상 그렇다"는 주장은 무너집니다. 반대로 반례가 끝까지 나오지 않아도, 그것은 확인한 범위에서 그랬다는 뜻일 뿐 증명은 아닙니다.</>}
    >
      <div className="ctl">
        <label className="ctl-label" htmlFor="ce-claim">
          <span>주장</span>
        </label>
        <select id="ce-claim" className="select" value={cid} onChange={(e) => setCid(e.target.value)}>
          {CLAIMS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="dm-sentence">
        <M>{claim.tex}</M>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-3)' }}>{claim.domain}</span>
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="dm-cells" role="list" aria-label="확인한 경우">
            {frames.slice(0, s.i + 1).map((c, k) => (
              <button key={c.n} type="button" role="listitem" className="dm-cell" data-ok={c.ok ? 't' : 'f'} aria-current={k === s.i || undefined} onClick={() => s.go(k)} aria-label={`n = ${c.n}${c.ok ? ', 성립' : ', 반례'}`}>
                {c.n}
              </button>
            ))}
          </div>
          <div className="dm-note" aria-live="polite">
            <strong>n = {cur.n}:</strong> <span className="mono">{cur.text}</span> {cur.ok ? <span style={{ color: 'var(--good)' }}>성립</span> : <strong style={{ color: 'var(--bad)' }}>반례!</strong>}
          </div>
          {cid === 'circle' && cur.n >= 2 && <CirclePicture n={cur.n} />}
        </div>
        <div className="controls">
          <StepControls s={s} id="ce-speed" maxSpeed={30} />
          <div className="readouts dm-readouts-text" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="확인한 경우" value={`${s.i + 1}개`} />
            <Readout label="결과" value={found ? `반례: n = ${cur.n}` : done ? '확인한 범위에 반례 없음' : '찾는 중…'} color={found ? 'var(--bad)' : done ? 'var(--good)' : undefined} />
          </div>
          {(found || done) && <div className="dm-note">{claim.known}</div>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Proofs() {
  return (
    <>
      <h2>예를 아무리 들어도 증명은 아니다</h2>
      <p>
        식 <M>{'n^2 + n + 41'}</M>에 n = 0, 1, 2, …를 넣으면 41, 43, 47, 53, 61, 71, …로 모두 소수가 나옵니다. 39까지 넣어 봐도 40번 연속 소수입니다. 이 정도면 "항상 소수다"라고 믿고 싶어지지만, n = 40을 넣으면 <M>{'1681 = 41^2'}</M>이 됩니다. 40개의 예가 틀린 주장을 지켜 주지 못했습니다.
      </p>
      <p>
        수학에서 <T en="theorem">정리</T>는 <T en="proof">증명</T>된 참인 명제입니다. 증명은 이미 참이라고 받아들인 사실(정의, 공리, 앞서 증명한 정리)에서 출발해 한 걸음씩 논리 규칙만으로 결론까지 가는 글입니다. 각 걸음이 맞으면 결론은 무한히 많은 n 모두에 대해 참이 됩니다. 테스트 케이스는 코드가 그 입력에서 맞는다는 것만 말해 주고, 증명은 모든 입력에서 맞는다는 것을 말해 줍니다.
      </p>
      <p>이 장에서는 정수의 짝·홀에 관한 정리로 연습합니다. 정의 두 가지만 있으면 됩니다.</p>
      <MB note="k는 어떤 정수. 예: 6 = 2·3은 짝수, 7 = 2·3 + 1은 홀수.">{'n \\text{ 이 짝수} \\iff n = 2k, \\qquad n \\text{ 이 홀수} \\iff n = 2k + 1'}</MB>

      <h2>직접 증명: 가정에서 결론으로</h2>
      <p>
        "p이면 q"를 증명하는 가장 곧은 길은 <T en="direct proof">직접 증명</T>입니다. p가 참이라고 놓고, 정의와 계산으로 q가 참임을 보입니다.
      </p>
      <div className="dm-boxed">
        <p>
          <strong>정리.</strong> 두 홀수의 합은 짝수다.
        </p>
        <p>
          <strong>증명.</strong> 두 홀수를 m, n이라 하자. 홀수의 정의에 따라 <M>{'m = 2a + 1'}</M>, <M>{'n = 2b + 1'}</M>인 정수 a, b가 있다. 그러면 <M>{'m + n = 2a + 2b + 2 = 2(a + b + 1)'}</M>이다. <M>{'a + b + 1'}</M>은 정수이므로 m + n은 짝수의 정의를 만족한다. ∎
        </p>
      </div>
      <p>
        두 홀수에 서로 다른 글자 a, b를 쓴 데 주목하세요. 둘 다 <M>{'2k + 1'}</M>로 쓰면 "같은 홀수 두 개"만 다룬 셈이 되어 증명이 틀립니다. 변수의 이름 하나가 무엇을 증명하는지를 바꿉니다.
      </p>

      <h2>대우 증명: 뒤집어서 증명하기</h2>
      <p>
        명제와 대우는 동치였습니다(<a href={lessonHref('math-discrete', 'logic')}>1장</a>). 그래서 "p이면 q"가 직접 증명하기 어려우면 "q가 아니면 p가 아니다"를 대신 증명해도 됩니다. 이것을 <T en="proof by contrapositive">대우 증명</T>이라고 합니다.
      </p>
      <div className="dm-boxed">
        <p>
          <strong>정리.</strong> 정수 n에 대해 <M>{'n^2'}</M>이 짝수이면 n도 짝수다.
        </p>
        <p>
          <strong>증명.</strong> 대우 "n이 홀수이면 <M>{'n^2'}</M>도 홀수다"를 보인다. n이 홀수이면 <M>{'n = 2k + 1'}</M>이고, <M>{'n^2 = 4k^2 + 4k + 1 = 2(2k^2 + 2k) + 1'}</M>이므로 홀수다. ∎
        </p>
      </div>
      <p>
        직접 증명하려면 "<M>{'n^2 = 2k'}</M>에서 n에 대해 무엇을 알 수 있나"를 따져야 해서 막힙니다. 대우로 바꾸면 n을 정의대로 쓰고 제곱만 하면 됩니다. 증명이 막히면 대우를 생각해 보는 습관이 쓸모 있습니다.
      </p>

      <h2>귀류법: 틀렸다고 가정하고 모순을 찾는다</h2>
      <p>
        <T en="proof by contradiction">귀류법</T>은 증명하려는 명제가 거짓이라고 가정하고 논리를 따라가다가, 동시에 참일 수 없는 두 사실에 이르는 방법입니다. 모순이 나왔다면 출발점인 가정이 틀린 것이므로 원래 명제가 참입니다. 가장 유명한 예는 2천 년도 더 된 증명입니다.
      </p>
      <Sqrt2Figure />
      <p>
        그림 1의 오른쪽에서 b = 408을 누르면 <M>{'577/408 = 1.414215\\ldots'}</M>로 소수 다섯째 자리까지 √2와 같지만, <M>{'577^2'}</M>과 <M>{'2 \\cdot 408^2'}</M>은 여전히 1만큼 다릅니다. 숫자로 아무리 찾아도 차이 0은 나오지 않는데, 증명은 그 이유를 말해 줍니다. 0이 되는 순간 a와 b가 둘 다 짝수여야 하는데, 그러면 약분이 더 될 테니까요.
      </p>

      <h2>소수는 끝없이 많다</h2>
      <p>유클리드의 증명도 귀류법입니다. 이번에는 직접 숫자를 넣어 볼 수 있습니다.</p>
      <ol>
        <li>소수가 유한 개뿐이라고 가정하고, 그 전부를 <M>{'p_1, p_2, \\ldots, p_k'}</M>라 하자.</li>
        <li>
          <M>{'N = p_1 p_2 \\cdots p_k + 1'}</M>을 만든다. N을 목록의 어느 <M>{'p_i'}</M>로 나누어도 나머지는 1이다. 곱한 부분은 나누어떨어지고 1이 남기 때문이다.
        </li>
        <li>1보다 큰 정수는 모두 소수로 나누어떨어진다. N을 나누는 소수 하나를 q라 하자. q는 목록에 없다. 목록의 소수는 N을 나누지 못하기 때문이다.</li>
        <li>그런데 목록이 소수 전부라고 했다. 모순이다. 따라서 소수는 무한히 많다. ∎</li>
      </ol>
      <EuclidPrimesFigure />
      <Callout kind="warn">
        "<M>{'p_1 \\cdots p_k + 1'}</M>은 소수다"라고 기억하는 사람이 많지만 틀렸습니다. 그림 2에서 처음 6개를 고르면 30031 = 59 × 509가 나옵니다. 증명이 말하는 것은 N이 소수라는 것이 아니라, N의 소인수가 목록 밖에 있다는 것입니다. 증명을 정확히 읽으면 이런 오해를 피할 수 있습니다.
      </Callout>

      <h2>반례: 반박하는 가장 짧은 방법</h2>
      <p>
        "모든 n에 대해 P(n)"을 반박하려면 P(n)이 거짓인 n 하나, 즉 <T en="counterexample">반례</T>를 보이면 됩니다. 1장에서 본 <M>{'\\neg\\forall n\\, P(n) \\equiv \\exists n\\, \\neg P(n)'}</M>이 바로 이 말입니다. 반례 찾기는 컴퓨터가 잘하는 일입니다.
      </p>
      <CounterFigure />
      <p>
        그림 3에서 "n이 홀수이면 n² − 1은 8의 배수다"를 골라 끝까지 재생하면 반례가 나오지 않습니다. 이 주장은 참이고, 증명은 짧습니다. <M>{'n = 2k + 1'}</M>이면 <M>{'n^2 - 1 = 4k^2 + 4k = 4k(k + 1)'}</M>입니다. 연속한 두 정수 k와 k + 1 중 하나는 짝수이므로 <M>{'k(k+1)'}</M>은 2의 배수이고, 따라서 <M>{'4k(k+1)'}</M>은 8의 배수입니다. 확인한 100개와 달리 이 네 줄은 모든 홀수를 다룹니다.
      </p>
      <Code label="반례를 찾는 작은 테스트 도구">{`
// 성질 prop이 성립하지 않는 첫 n을 찾는다 (property-based testing의 핵심)
function findCounterexample(prop, from, to) {
  for (let n = from; n <= to; n++) {
    if (!prop(n)) return n; // 반례 하나면 "항상"은 거짓
  }
  return null; // 이 범위에는 없다. 그래도 증명은 아니다
}

const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

findCounterexample((n) => isPrime(n * n + n + 41), 0, 1000); // 40
findCounterexample((n) => (n * n - 1) % 8 === 0 || n % 2 === 0, 0, 1e6); // null`}</Code>
      <Callout kind="note">
        이렇게 무작위 또는 차례로 입력을 만들어 성질을 확인하는 방식을 <T en="property-based testing">속성 기반 테스트</T>라고 합니다. 예제 몇 개를 고르는 보통의 테스트보다 반례를 훨씬 잘 찾아냅니다. 테스트의 역할과 한계는 <a href={lessonHref('cs-programming', 'testing')}>테스트와 디버깅</a>에서 더 다룹니다.
      </Callout>

      <h2>증명을 읽고 쓸 때 조심할 것</h2>
      <ul>
        <li>
          <strong>역을 증명하지 않았는지.</strong> "p이면 q"를 보여야 하는데 q에서 출발해 p에 도착했다면 역을 증명한 것입니다.
        </li>
        <li>
          <strong>결론을 미리 쓰지 않았는지.</strong> 증명 중간에 증명하려는 사실을 슬쩍 쓰면 <T en="circular reasoning">순환 논증</T>이 됩니다.
        </li>
        <li>
          <strong>"모든"과 "어떤"을 바꾸지 않았는지.</strong> "어떤 정수 k가 있어 n = 2k"를 "모든 k에 대해"로 읽으면 엉뚱한 말이 됩니다.
        </li>
        <li>
          <strong>특별한 예만 다루지 않았는지.</strong> n = 3으로 계산해 보고 "따라서 모든 홀수에서"라고 쓰면 예를 든 것이지 증명이 아닙니다. 대신 n = 2k + 1처럼 일반적인 꼴로 씁니다.
        </li>
      </ul>

      <Callout kind="key">
        직접 증명은 가정에서 결론으로 곧게 가고, 대우 증명은 ¬q → ¬p를 대신 보이며, 귀류법은 결론의 부정에서 모순을 끌어냅니다. 예를 아무리 많이 확인해도 "모든 경우"를 증명할 수 없지만, 반례 하나면 반박할 수 있습니다. 다음 장들에서 쓸 귀납법은 무한히 많은 경우를 한 번에 증명하는 또 하나의 도구입니다.
      </Callout>
      <Quiz
        q={<>"정수 n에 대해 3n + 2가 홀수이면 n은 홀수다"를 증명하려 한다. 가장 수월한 방법은?</>}
        options={['n = 1, 3, 5를 넣어 확인한다', '대우: n이 짝수이면 3n + 2가 짝수임을 보인다', '역: n이 홀수이면 3n + 2가 홀수임을 보인다', '반례를 찾는다']}
        answer={1}
        explain={<>n = 2k이면 3n + 2 = 6k + 2 = 2(3k + 1)로 짝수입니다. 대우가 참이니 원래 명제도 참입니다. ①은 예를 든 것이라 증명이 아니고, ③은 역이라 원래 명제와 다른 말이며, ④는 참인 명제에는 반례가 없으니 찾을 수 없습니다.</>}
      />
    </>
  );
}

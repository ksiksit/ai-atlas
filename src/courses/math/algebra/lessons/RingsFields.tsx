import { useMemo, useState, type CSSProperties } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { bits, countTried, egcd, makeGF, mod, pDivSteps, polyStr, powers, primitives, unitsGF, zeroDivisorsGF, zn, type Poly } from './field';
import './algebra.css';
import './rings.css';

/* ─────────────── Figure 1: the multiplication table of ℤ/n ─────────────── */

function ZnFigure() {
  const [n, setN] = useState(6);
  const [sel, setSel] = useState<number | null>(2);
  const Z = useMemo(() => zn(n), [n]);
  const a = sel !== null && sel < n ? sel : null;

  let note: string;
  if (a === null || a === 0) note = '행의 머리(왼쪽 숫자)를 눌러 그 수를 골라 보세요.';
  else if (Z.units.includes(a)) {
    const b = Z.table[a].indexOf(1);
    const { s, t } = egcd(a, n);
    note = `${a}·${b} = ${a * b} ≡ 1 (mod ${n})이므로 ${a}의 역원은 ${b}입니다. 유클리드 호제법으로는 ${a}·(${s}) + ${n}·(${t}) = 1에서 ${mod(s, n)}을 얻습니다.`;
  } else {
    const b = Z.table[a].findIndex((v, j) => j !== 0 && v === 0);
    note = `${a}·${b} = ${a * b} ≡ 0 (mod ${n})입니다. 0이 아닌 두 수를 곱했는데 0이 되었으므로 ${a}는 영인자이고, ${a}의 행에는 1이 한 번도 나오지 않아 역원이 없습니다.`;
  }

  return (
    <Figure
      no={1}
      title={`ℤ/${n}의 곱셈표`}
      hint="n을 바꾸고, 왼쪽 숫자를 눌러 보세요"
      caption={
        <>
          칸에는 행의 수와 열의 수를 곱해 n으로 나눈 나머지가 들어 있습니다. 초록 칸은 곱이 1인 곳(서로 역원), 빨간 칸은 0이 아닌 두 수의 곱이 0인 곳(영인자)입니다. 0의 행과 열은 흐리게 두었습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="rf-n" label="n" value={n} min={2} max={13} step={1} onChange={(v) => setN(v)} />
      </div>
      <div className="rf-tablewrap">
        <table className="rf-table" aria-label={`${n}으로 나눈 나머지의 곱셈표`}>
          <thead>
            <tr>
              <th aria-label="곱">×</th>
              {Array.from({ length: n }, (_, j) => (
                <th key={j}>{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Z.table.map((row, i) => (
              <tr key={i} data-sel={a === i || undefined}>
                <th data-sel={a === i || undefined}>
                  <button type="button" onClick={() => setSel(i)} aria-label={`${i}의 행 고르기`} aria-pressed={a === i}>
                    {i}
                  </button>
                </th>
                {row.map((v, j) => (
                  <td key={j} data-k={i && j ? (v === 1 ? 'one' : v === 0 ? 'zero' : undefined) : undefined} data-dim={!i || !j || undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="역원이 있는 수" value={`${Z.units.length}개`} color="var(--good)" />
        <Readout label="영인자" value={`${Z.zeroDivisors.length}개`} color={Z.zeroDivisors.length ? 'var(--bad)' : undefined} />
        <Readout label="체인가?" value={Z.isField ? '체' : '체가 아님'} color={Z.isField ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <div className="ag-note" aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: polynomial long division ─────────────── */

const DIVS: { id: string; label: string; p: number; a: Poly; b: Poly }[] = [
  { id: 'gf2', label: 'GF(2): (x⁵ + x⁴ + 1) ÷ (x³ + x + 1)', p: 2, a: [1, 0, 0, 0, 1, 1], b: [1, 1, 0, 1] },
  { id: 'gf5', label: 'GF(5): (x⁴ + 2x² + 3) ÷ (x² + 2x + 1)', p: 5, a: [3, 0, 2, 0, 1], b: [1, 2, 1] },
  { id: 'gf2b', label: 'GF(2): (x⁷ + 1) ÷ (x³ + x + 1)', p: 2, a: [1, 0, 0, 0, 0, 0, 0, 1], b: [1, 1, 0, 1] },
];

function DivisionFigure() {
  const [id, setId] = useState('gf2');
  const D = DIVS.find((d) => d.id === id)!;
  const res = useMemo(() => pDivSteps(D.a, D.b, D.p), [D]);
  const s = useStepper(res.steps.length + 1, 1.5, id);
  const k = s.i; // steps done
  const cur = k ? res.steps[k - 1] : null;
  const term = (c: number, e: number) => polyStr(Object.assign(new Array(e + 1).fill(0), { [e]: c }));

  return (
    <Figure
      no={2}
      title="다항식의 나눗셈"
      hint="한 단계씩 넘겨 보세요"
      caption={
        <>
          정수의 긴 나눗셈과 같은 순서입니다. 남은 식의 최고차항을 나누는 식의 최고차항으로 나눈 몫을 하나 정하고, 그 몫과 나누는 식의 곱을 뺍니다. 남은 식의 차수가 나누는 식보다 작아지면 멈춥니다. 계수는 모두 {D.p}로 나눈 나머지로 계산하므로{D.p === 2 ? ' 빼기와 더하기가 같습니다' : ' 음수가 나오지 않습니다'}.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={DIVS.map((d) => ({ value: d.id, label: d.label }))} />
      </div>
      <div className="fig-split">
        <div className="rf-div" aria-label="나눗셈 과정">
          <div className="row">
            <span>나뉘는 식</span>
            <span>{polyStr(D.a)}</span>
          </div>
          <div className="row">
            <span>나누는 식</span>
            <span>{polyStr(D.b)}</span>
          </div>
          {res.steps.map((st, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div className="row" data-later={i >= k || undefined} data-now={i === k - 1 || undefined}>
                <span>{i + 1}단계 몫 항</span>
                <span>
                  {term(st.term[0], st.term[1])} · ({polyStr(D.b)}) = {polyStr(st.subtracted)}
                </span>
              </div>
              <div className="row" data-later={i >= k || undefined}>
                <span>빼고 남은 것</span>
                <span>{polyStr(st.remainder)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="controls">
          <StepControls s={s} id="rf-div-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="몫" value={k ? polyStr(cur!.quotient) : '0'} />
            <Readout label="나머지" value={k === res.steps.length ? polyStr(res.r) : '…'} color={k === res.steps.length && res.r.every((c) => !c) ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>
      <div className="ag-note" aria-live="polite">
        {k === 0
          ? `나뉘는 식의 최고차항은 ${polyStr(D.a).split(' + ')[0]}, 나누는 식의 최고차항은 ${polyStr(D.b).split(' + ')[0]}입니다.`
          : k < res.steps.length
            ? `${k}단계: 몫에 ${term(cur!.term[0], cur!.term[1])}을 더하고 남은 식은 ${polyStr(cur!.remainder)}입니다.`
            : `끝: ${polyStr(D.a)} = (${polyStr(res.q)})(${polyStr(D.b)})${res.r.every((c) => !c) ? '' : ` + ${polyStr(res.r)}`}. ${res.r.every((c) => !c) ? '나머지가 0이므로 나누어떨어집니다.' : `나머지 ${polyStr(res.r)}의 차수가 나누는 식보다 작아 멈췄습니다.`}`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: building GF(2^k) from a polynomial ─────────────── */

const MODS: { id: string; label: string; m: Poly }[] = [
  { id: 'a', label: 'x³ + x + 1', m: [1, 1, 0, 1] },
  { id: 'b', label: 'x³ + 1', m: [1, 0, 0, 1] },
  { id: 'c', label: 'x⁴ + x + 1', m: [1, 1, 0, 0, 1] },
  { id: 'd', label: 'x⁴ + x³ + x² + x + 1', m: [1, 1, 1, 1, 1] },
  { id: 'e', label: 'x⁴ + 1', m: [1, 0, 0, 0, 1] },
];

function FieldFigure() {
  const [id, setId] = useState('a');
  const [g, setG] = useState(2);
  const M_ = MODS.find((x) => x.id === id)!;
  const F = useMemo(() => makeGF(2, M_.m), [M_]);
  const prim = useMemo(() => primitives(F), [F]);
  const zd = useMemo(() => zeroDivisorsGF(F), [F]);
  const units = useMemo(() => unitsGF(F), [F]);
  const gg = g < F.q && g > 0 ? g : 2;
  const pw = useMemo(() => powers(F, gg), [F, gg]);
  const label = (e: number) => bits(e, F.k);

  return (
    <Figure
      no={3}
      title="다항식으로 유한체 만들기"
      hint="법으로 쓸 다항식과 거듭제곱할 원소를 골라 보세요"
      caption={
        <>
          원소는 차수가 {F.k}보다 작고 계수가 0 또는 1인 다항식 {F.q}개이고, 비트열로 적었습니다(왼쪽이 높은 차수, 예를 들어 {bits(5, F.k)}은 x² + 1). 곱한 뒤 고른 다항식으로 나눈 나머지를 칸에 적습니다. 빨간 칸은 0이 아닌 두 원소의 곱이 0인 곳, 초록 칸은 곱이 1인 곳입니다. 칸의 진하기는 값의 크기일 뿐 다른 뜻은 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={(v) => setId(v)} options={MODS.map((x) => ({ value: x.id, label: x.label }))} />
      </div>
      <div className="rf-tablewrap">
        <table className={'rf-table' + (F.q > 8 ? ' small' : '')} aria-label={`${M_.label}로 나눈 나머지의 곱셈표, 원소 ${F.q}개`}>
          <thead>
            <tr>
              <th aria-label="곱">×</th>
              {Array.from({ length: F.q }, (_, j) => (
                <th key={j}>{label(j)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: F.q }, (_, i) => (
              <tr key={i}>
                <th>{label(i)}</th>
                {Array.from({ length: F.q }, (_, j) => {
                  const v = F.mul(i, j);
                  const k = i && j ? (v === 1 ? 'one' : v === 0 ? 'zero' : undefined) : undefined;
                  return (
                    <td key={j} data-k={k} data-dim={!i || !j || undefined} data-shade={!k && i && j ? '' : undefined} style={!k && i && j ? ({ ['--s' as string]: Math.round((v / (F.q - 1)) * 22) } as CSSProperties) : undefined}>
                      {label(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="기약인가?" value={F.irreducible ? `기약 (후보 ${countTried(M_.m, 2)}개 모두 실패)` : `= (${polyStr(F.factor!.factor)})(${polyStr(F.factor!.cofactor)})`} color={F.irreducible ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="역원이 있는 원소" value={`${units.length} / ${F.q - 1}`} />
        <Readout label="영인자" value={`${zd.length}개`} color={zd.length ? 'var(--bad)' : undefined} />
        <Readout label="원시원소" value={`${prim.length}개`} color={prim.length ? 'var(--good)' : undefined} />
      </div>
      <div className="rf-pickrow">
        <label htmlFor="rf-g" className="ag-small">
          거듭제곱할 원소 g
        </label>
        <select id="rf-g" value={gg} onChange={(e) => setG(Number(e.target.value))}>
          {Array.from({ length: F.q - 1 }, (_, i) => i + 1).map((e) => (
            <option key={e} value={e}>
              {label(e)} = {F.label(e)}
              {prim.includes(e) ? ' (원시원소)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="rf-chips" aria-label={`g의 거듭제곱`}>
        {pw.seq.map((e, i) => (
          <span key={i} className="rf-chip" data-one={e === 1 || undefined}>
            <small>g{i + 1 === 1 ? '' : SUPS(i + 1)}</small>
            {label(e)}
          </span>
        ))}
      </div>
      <div className="ag-note" aria-live="polite">
        {pw.order === null
          ? `g = ${F.label(gg)}의 거듭제곱은 1에 닿지 못하고 ${pw.seq.length}번 만에 이미 나온 값으로 돌아갑니다. 역원이 없는 원소입니다.`
          : pw.order === F.q - 1
            ? `g = ${F.label(gg)}의 거듭제곱 ${pw.order}개가 0이 아닌 원소 ${F.q - 1}개를 모두 한 번씩 지나고 1로 돌아옵니다. g는 원시원소이고, 모든 0이 아닌 원소를 g의 몇 제곱으로 적을 수 있습니다.`
            : `g = ${F.label(gg)}는 ${pw.order}제곱에서 1로 돌아옵니다. 0이 아닌 원소 ${F.q - 1}개 중 ${pw.order}개만 지나므로 원시원소가 아닙니다.`}
      </div>
      <Legend
        items={[
          { color: 'color-mix(in srgb, var(--good) 40%, transparent)', label: '곱이 1', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--bad) 40%, transparent)', label: '0이 아닌 두 원소의 곱이 0', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUPS = (n: number) => String(n).split('').map((d) => SUP[+d]).join('');

/* ─────────────── Lesson ─────────────── */

export default function RingsFields() {
  return (
    <>
      <h2>더하기와 곱하기가 함께 있는 구조</h2>
      <p>
        앞의 장들에서 다룬 군에는 연산이 하나뿐이었습니다. 정수에는 연산이 둘 있습니다. 더하기로 보면 정수는 군이고, 여기에 곱하기가 더해지며, 두 연산은 분배법칙 <M>{'a(b + c) = ab + ac'}</M>로 이어져 있습니다. 이런 구조를 <T en="ring">환</T>이라고 합니다.
      </p>
      <MB note="이 장의 환은 모두 곱셈이 교환법칙을 만족하고 곱셈의 항등원 1을 가진다고 둡니다.">{String.raw`\text{환 } (R, +, \cdot):\quad (R, +)\text{는 아벨 군},\quad \cdot\text{는 결합적},\quad a(b+c) = ab + ac`}</MB>
      <p>
        정수 <M>{'\\mathbb{Z}'}</M>, 실수 계수 다항식 <M>{'\\mathbb{R}[x]'}</M>, <M>n</M>으로 나눈 나머지 <M>{'\\mathbb{Z}/n'}</M>이 모두 환입니다. 환 중에서 0이 아닌 모든 원소가 곱셈의 역원을 가지는 것, 즉 0이 아닌 수로 나눌 수 있는 것을 <T en="field">체</T>라고 합니다. 유리수, 실수, 복소수가 체이고 정수는 체가 아닙니다. 2의 역원 1/2이 정수가 아니기 때문입니다.
      </p>
      <p>
        체가 되지 못하게 막는 대표적인 범인이 <T en="zero divisor">영인자</T>입니다. 0이 아닌 <M>a</M>, <M>b</M>의 곱이 0이 되면 <M>a</M>와 <M>b</M>를 영인자라고 합니다. 정수에서는 이런 일이 없지만, 나머지의 세계에서는 흔합니다. 그림 1에서 n = 6의 곱셈표를 보세요.
      </p>
      <ZnFigure />
      <p>
        n = 6이면 2·3 = 6 ≡ 0이고 3·4 = 12 ≡ 0입니다. 영인자는 2, 3, 4 세 개이고 역원이 있는 수는 1과 5 두 개뿐입니다. 2의 행에는 1이 한 번도 나오지 않으니 2로는 나눌 수 없습니다. n = 7로 바꾸면 빨간 칸이 모두 사라지고, 1부터 6까지 모든 행에 초록 칸이 정확히 하나씩 생깁니다. 3의 짝은 5입니다(3·5 = 15 ≡ 1). n = 12에서는 역원이 있는 수가 1, 5, 7, 11의 네 개, 영인자가 일곱 개입니다. 0이 아니면서 영인자가 없는 환을 <T en="integral domain">정역</T>이라고 하고, 유한한 정역은 언제나 체가 됩니다.
      </p>

      <h2>ℤ/p가 체가 되는 조건</h2>
      <p>그림 1에서 n을 하나씩 바꿔 보면 규칙이 보입니다. 체가 되는 것은 n이 2, 3, 5, 7, 11, 13일 때뿐입니다.</p>
      <MB>{String.raw`\mathbb{Z}/n \text{ 이 체이다} \iff n \text{ 이 소수이다}`}</MB>
      <div className="rf-proof">
        <b>증명.</b>
        <p>
          n이 합성수라면 <M>{'n = ab'}</M>, <M>{'1 < a, b < n'}</M>으로 쓸 수 있고 <M>{'ab \\equiv 0'}</M>입니다. 만약 <M>a</M>에 역원 <M>c</M>가 있다면 <M>{'b = (ca)b = c(ab) \\equiv 0'}</M>이 되어 <M>{'0 < b < n'}</M>에 모순입니다. 그러므로 <M>a</M>에는 역원이 없고 체가 아닙니다.
        </p>
        <p>
          n이 소수 <M>p</M>이고 <M>{'0 < a < p'}</M>이면 <M>{'\\gcd(a, p) = 1'}</M>입니다. 베주 항등식에 따라 <M>{'as + pt = 1'}</M>인 정수 <M>s</M>, <M>t</M>가 있고, 이 식을 <M>p</M>로 나눈 나머지로 보면 <M>{'as \\equiv 1'}</M>입니다. 그러므로 <M>s</M>가 <M>a</M>의 역원입니다. <span className="rf-qed">∎</span>
        </p>
      </div>
      <p>
        이 증명은 역원을 구하는 방법까지 알려 줍니다. 확장 유클리드 호제법으로 <M>{'3\\cdot(-2) + 7\\cdot 1 = 1'}</M>을 얻으면 3의 역원은 −2 ≡ 5입니다. 그림 1에서 행을 고르면 같은 계산을 보여 줍니다. 유클리드 호제법과 모듈러 연산은 <a href={lessonHref('math-discrete', 'modular')}>이산수학의 정수와 모듈러 연산</a> 장에서 처음 다뤘습니다. 소수 <M>p</M>로 만든 체를 <M>{'\\mathbb{F}_p'}</M> 또는 <M>{'\\mathrm{GF}(p)'}</M>라고 적습니다.
      </p>

      <h2>다항식도 나눌 수 있습니다</h2>
      <p>
        체 <M>F</M>의 원소를 계수로 쓰는 다항식들의 모임 <M>{'F[x]'}</M>도 환입니다. 정수와 다항식은 닮은 점이 많습니다. 무엇보다 나머지가 있는 나눗셈이 됩니다. 0이 아닌 <M>b(x)</M>에 대해
      </p>
      <MB note="r = 0이거나, r의 차수가 b의 차수보다 작습니다.">{String.raw`a(x) = q(x)\,b(x) + r(x),\qquad \deg r < \deg b`}</MB>
      <p>
        를 만족하는 몫 <M>q</M>와 나머지 <M>r</M>이 하나씩만 있습니다. 정수에서 나머지가 나누는 수보다 작듯이, 다항식에서는 나머지의 차수가 나누는 식의 차수보다 작습니다. 계수에서 나눗셈을 하려면 최고차 계수의 역원이 필요하므로, 계수가 체에 있어야 이 알고리즘이 언제나 돌아갑니다. 그림 2에서 계수가 <M>{'\\mathrm{GF}(2)'}</M>와 <M>{'\\mathrm{GF}(5)'}</M>인 나눗셈을 따라가 보세요.
      </p>
      <DivisionFigure />
      <p>
        첫 번째 예에서 <M>{'x^5 + x^4 + 1 = (x^2 + x + 1)(x^3 + x + 1)'}</M>로 나누어떨어집니다. 실수 계수였다면 나머지가 남았을 텐데, 계수를 2로 나눈 나머지로 계산하면 <M>{'2x = 0'}</M>이 되어 항들이 지워지기 때문입니다. 두 번째 예는 두 단계 만에 몫 <M>{'x^2 + 3x'}</M>, 나머지 <M>{'2x + 3'}</M>으로 끝납니다. 세 번째 예 <M>{'x^7 + 1'}</M>은 네 단계 만에 몫 <M>{'x^4 + x^2 + x + 1'}</M>로 나누어떨어집니다. <M>{'x^3 + x + 1'}</M>로 나눈 나머지만 보는 세계에서는 <M>{'x^7 = 1'}</M>이라는 뜻이고, 이 사실은 다음 그림에서 다시 나옵니다.
      </p>
      <Callout kind="intuition">
        이 나눗셈은 컴퓨터 안에서 매일 일어납니다. 네트워크 패킷과 압축 파일 끝에 붙는 CRC 검사값은 데이터를 비트열로 보고, 그것을 <M>{'\\mathrm{GF}(2)'}</M> 위의 다항식으로 읽어 정해진 다항식으로 나눈 나머지입니다. 계수가 0과 1뿐이라 빼기가 XOR이 되므로 회로 몇 개로 빠르게 계산할 수 있습니다.
      </Callout>

      <h2>기약 다항식과 유한체</h2>
      <p>
        정수에서 소수가 하던 일을 다항식에서는 <T en="irreducible polynomial">기약 다항식</T>이 합니다. 차수가 1 이상인 다항식이 더 낮은 차수의 두 다항식의 곱으로 쓰이지 않으면 기약이라고 합니다. 차수가 3이나 4인 다항식은 차수가 그 절반 이하인 다항식을 모두 나눠 보면 기약인지 알 수 있습니다. <M>{'\\mathrm{GF}(2)'}</M>에서 차수 3이면 후보는 <M>x</M>와 <M>{'x + 1'}</M> 두 개, 차수 4이면 차수 1과 2의 여섯 개입니다.
      </p>
      <p>
        이제 <M>{'\\mathbb{Z}/p'}</M>를 만들 때 정수를 소수 <M>p</M>로 나눈 나머지를 썼듯이, 다항식을 기약 다항식 <M>{'m(x)'}</M>로 나눈 나머지를 씁니다. 차수가 <M>k</M>인 <M>m</M>으로 나눈 나머지는 차수가 <M>k</M>보다 작은 다항식이므로 <M>{'p^k'}</M>개가 있고, 증명은 앞의 정리와 똑같이 갑니다.
      </p>
      <MB note="F[x]/(m)은 다항식을 m으로 나눈 나머지들의 환입니다.">{String.raw`\mathrm{GF}(p)[x]\,/\,(m(x)) \text{ 가 체이다} \iff m(x) \text{ 가 기약이다}`}</MB>
      <FieldFigure />
      <p>
        <M>{'x^3 + x + 1'}</M>로 만든 체는 원소가 8개이고 <M>{'\\mathrm{GF}(8)'}</M>이라고 적습니다. 이 체에서 <M>{'x^3 = x + 1'}</M>입니다(<M>m</M>으로 나눈 나머지이므로). 그래서 <M>x</M>의 거듭제곱은 <M>{'x, x^2, x+1, x^2+x, x^2+x+1, x^2+1, 1'}</M>로, 0이 아닌 원소 일곱 개를 모두 지나고 7제곱에서 1로 돌아옵니다. 이런 원소를 <T en="primitive element">원시원소</T>라고 합니다. 원시원소가 있으면 곱셈은 지수의 덧셈이 됩니다. 컴퓨터가 유한체의 곱셈을 표 두 개(로그와 지수)로 빠르게 하는 방법이 이것입니다.
      </p>
      <p>
        <M>{'x^3 + 1'}</M>을 고르면 표에 빨간 칸이 생깁니다. <M>{'x^3 + 1 = (x + 1)(x^2 + x + 1)'}</M>로 인수분해되므로 <M>{'x + 1'}</M>과 <M>{'x^2 + x + 1'}</M>의 곱이 0이 되는 것입니다. 영인자가 네 개, 역원이 있는 원소가 세 개뿐이고, 원시원소는 없습니다. <M>{'x^4 + 1 = (x + 1)^4'}</M>도 마찬가지로 영인자가 일곱 개 생깁니다. 정수에서 6으로 나눈 나머지가 체가 되지 못한 것과 같은 이유입니다.
      </p>
      <p>
        <M>{'x^4 + x + 1'}</M>로는 원소 16개의 <M>{'\\mathrm{GF}(16)'}</M>이 생기고, <M>x</M>가 원시원소입니다. <M>{'x^4 + x^3 + x^2 + x + 1'}</M>도 기약이어서 역시 체가 되지만, 여기서는 <M>x</M>가 5제곱에서 1로 돌아와 원시원소가 아닙니다. 체는 맞지만 <M>x</M>로 로그 표를 만들 수는 없으므로 실제 구현은 <M>{'x^4 + x + 1'}</M>처럼 <M>x</M> 자체가 원시원소인 다항식을 고릅니다. 두 체 모두 원시원소는 여덟 개입니다(1부터 15 중 15와 서로소인 수의 개수).
      </p>
      <Callout kind="note">
        AES 암호의 바이트 치환은 바이트 하나를 <M>{'\\mathrm{GF}(2^8)'}</M>의 원소로 보고 그 곱셈 역원을 구하는 것에서 시작합니다. 법으로 쓰는 다항식은 <M>{'x^8 + x^4 + x^3 + x + 1'}</M>입니다. 대칭 암호의 구조는 <a href={lessonHref('net-security', 'symmetric')}>네트워크 보안의 대칭 암호와 해시</a> 장에서 다뤘습니다. 원소가 <M>{'p^k'}</M>개인 유한체는 크기마다 본질적으로 하나뿐이라는 것도 알려져 있습니다. 어떤 기약 다항식을 고르든 원소의 이름만 다를 뿐 같은 체가 됩니다.
      </Callout>

      <Callout kind="key">
        환은 더하기와 곱하기가 분배법칙으로 이어진 구조이고, 0이 아닌 모든 원소로 나눌 수 있으면 체입니다. <M>{'\\mathbb{Z}/n'}</M>은 n이 소수일 때만 체이고, 역원은 확장 유클리드 호제법으로 구합니다. 다항식도 나머지가 있는 나눗셈을 할 수 있으며, 기약 다항식으로 나눈 나머지를 모으면 원소가 <M>{'p^k'}</M>개인 유한체가 생깁니다. 유한체의 0이 아닌 원소는 원시원소 하나의 거듭제곱으로 모두 나타낼 수 있어, 곱셈을 로그 표로 계산할 수 있습니다.
      </Callout>
      <Quiz
        q="GF(2) 위의 다항식 x⁴ + x² + 1로 나눈 나머지 16개를 모으면 어떻게 될까요? (힌트: (x² + x + 1)²을 계산해 보세요.)"
        options={['기약 다항식이므로 원소 16개의 체가 된다', 'x² + x + 1을 제곱하면 x⁴ + x² + 1이므로 기약이 아니고, x² + x + 1이 영인자가 되어 체가 되지 않는다', '차수가 4이므로 언제나 체가 된다', '상수항이 1이므로 언제나 체가 된다']}
        answer={1}
        explain={
          <>
            GF(2)에서는 2x³ = 0, 2x² = 0, 2x = 0이므로 <M>{'(x^2 + x + 1)^2 = x^4 + x^2 + 1'}</M>입니다. 기약이 아니므로 체가 되지 않고, <M>{'x^2 + x + 1'}</M>과 자기 자신의 곱이 0이 되어 영인자가 생깁니다. 차수나 상수항만으로는 기약인지 알 수 없고, 낮은 차수의 다항식으로 나눠 봐야 합니다.
          </>
        }
      />
    </>
  );
}

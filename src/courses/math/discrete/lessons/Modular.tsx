import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { egcd, euclidSteps, gcd, mod, modInverse, modPow, PRIMES } from './numbers';
import './discrete.css';

/* ─────────────── Figure 1: clock arithmetic ─────────────── */

type ClockOp = 'add' | 'sub' | 'mul';

function ClockFigure() {
  const [m, setM] = useState(12);
  const [a, setA] = useState(9);
  const [b, setB] = useState(5);
  const [op, setOp] = useState<ClockOp>('add');
  const C = 130;
  const R = 100;
  const ang = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / m;
  const pt = (k: number, r = R): [number, number] => [C + r * Math.cos(ang(k)), C + r * Math.sin(ang(k))];
  const X = op === 'add' ? a + b : op === 'sub' ? a - b : a * b;
  const r = mod(X, m);
  const js = X % m;
  const start = op === 'mul' ? 0 : mod(a, m);

  // path: + and − walk around the dial (spiralling inward each lap); × hops by a, b times, from 0
  let path = '';
  if (op === 'mul') {
    const pts = Array.from({ length: b + 1 }, (_, i) => pt(mod(a * i, m), R - 8));
    path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  } else {
    const dir = op === 'add' ? 1 : -1;
    const steps = b * 24;
    const shrink = Math.min(14, 56 / Math.max(1, b / m)); // inward per lap, so many laps still fit
    const pts: string[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = a + (dir * s) / 24;
      const rr = R - 12 - (s / 24 / m) * shrink;
      const [x, y] = [C + rr * Math.cos(ang(k)), C + rr * Math.sin(ang(k))];
      pts.push(`${s ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    path = pts.join(' ');
  }
  const laps = op === 'mul' ? 0 : Math.floor((op === 'add' ? mod(a, m) + b : b - mod(a, m) + m - 1) / m);
  const tex = op === 'add' ? `${a} + ${b} = ${X}` : op === 'sub' ? `${a} - ${b} = ${X}` : `${a} \\times ${b} = ${X}`;
  const q = Math.floor(X / m);

  return (
    <Figure
      no={1}
      title="시계 위의 덧셈과 곱셈"
      hint="법 m과 두 수, 연산을 바꿔 보세요"
      caption={<>원 위의 눈금 0부터 m − 1까지가 m으로 나눈 나머지 전부입니다. 덧셈은 a에서 시계 방향으로 b칸, 뺄셈은 반시계 방향으로 b칸 갑니다. 한 바퀴를 넘을 때마다 선이 조금씩 안쪽으로 들어갑니다. 곱셈 a × b는 0에서 출발해 a칸씩 b번 뛰는 것으로 그립니다. 어느 쪽이든 도착한 눈금이 (a ∘ b) mod m입니다.</>}
    >
      <div className="fig-split">
        <svg viewBox="0 0 260 260" className="dm-clock" role="img" aria-label={`법 ${m}의 시계: ${tex.replace('\\times', '×')}, 나머지 ${r}`}>
          <circle cx={C} cy={C} r={R} className="rim" />
          {Array.from({ length: m }, (_, k) => {
            const [x, y] = pt(k);
            const [tx, ty] = pt(k, R + 15);
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={k === r ? 7 : k === start ? 5.5 : 3.2} className={k === r ? 'end' : k === start ? 'start' : 'tick'} />
                <text x={tx} y={ty} dy="0.35em" className={k === r ? 'num end' : 'num'}>
                  {k}
                </text>
              </g>
            );
          })}
          <path d={path} className={op === 'mul' ? 'hop' : 'walk'} />
          <text x={C} y={C - 6} className="mid">
            {r}
          </text>
          <text x={C} y={C + 16} className="mid-sub">
            mod {m}
          </text>
        </svg>
        <div className="controls">
          <Seg label="연산" value={op} onChange={(v) => { setOp(v); if (v === 'mul') { setA((x) => Math.max(0, x)); setB((x) => Math.min(12, x)); } }} options={[{ value: 'add', label: 'a + b' }, { value: 'sub', label: 'a − b' }, { value: 'mul', label: 'a × b' }]} />
          <Slider id="ck-m" label="법 m" value={m} min={2} max={24} step={1} onChange={setM} />
          <Slider id="ck-a" label="a" value={a} min={op === 'mul' ? 0 : -20} max={30} step={1} onChange={setA} />
          <Slider id="ck-b" label="b" value={b} min={0} max={op === 'mul' ? 12 : 40} step={1} onChange={setB} />
          <div className="dm-sentence">
            <M>{`${tex} = ${q} \\cdot ${m} + ${r}`}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`${X} mod ${m}`} value={r} color="var(--c-math-3)" />
            <Readout label={`JS의 ${X} % ${m}`} value={js === 0 ? 0 : js} color={js !== r ? 'var(--bad)' : undefined} />
          </div>
          <div className="dm-note">{js !== r ? <>음수에서는 JavaScript의 %가 음수를 돌려줍니다. 수학의 나머지는 언제나 0 이상이므로 ((x % m) + m) % m으로 고쳐 씁니다.</> : op !== 'mul' && laps > 0 ? <>0을 {laps}번 지나쳤지만, 도착 지점은 나머지만으로 정해집니다.</> : <>몫 {q}는 버리고 나머지 {r}만 남깁니다.</>}</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Euclid's algorithm as square tiling ─────────────── */

interface Sq {
  x: number;
  y: number;
  s: number;
  step: number;
}

function tile(a: number, b: number): Sq[] {
  const out: Sq[] = [];
  let [x, y, w, h] = [0, 0, a, b];
  let step = 0;
  let lastSide = -1;
  while (w > 0 && h > 0) {
    const s = Math.min(w, h);
    if (lastSide !== -1 && s !== lastSide) step++;
    lastSide = s;
    out.push({ x, y, s, step });
    if (w >= h) {
      x += s;
      w -= s;
    } else {
      y += s;
      h -= s;
    }
  }
  return out;
}

const STEP_COLORS = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)'];

function EuclidFigure() {
  const [A, setA] = useState(84);
  const [B, setB] = useState(30);
  const a = Math.max(A, B);
  const b = Math.min(A, B);
  const squares = useMemo(() => tile(a, b), [a, b]);
  const steps = useMemo(() => euclidSteps(a, b), [a, b]);
  const s = useStepper(squares.length + 1, 3, `${a}|${b}`);
  const shown = squares.slice(0, Math.min(s.i + 1, squares.length));
  const done = s.i >= squares.length;
  const cur = shown[shown.length - 1];
  const g = gcd(a, b);
  const [, x, y] = egcd(a, b);
  const W = 400;
  const k = W / a;
  const H = Math.max(b * k, 4);

  return (
    <Figure
      no={2}
      title="유클리드 호제법: 정사각형으로 채우기"
      hint="두 수를 바꾸고 재생해 보세요"
      caption={<>가로 a, 세로 b인 직사각형을 가능한 한 큰 정사각형으로 채워 나갑니다. 짧은 변 b로 정사각형을 q개 놓으면 a = q·b + r의 나머지 r만큼 폭이 남고, 이번에는 그 남은 직사각형을 같은 방법으로 채웁니다. 마지막에 남는 가장 작은 정사각형의 한 변이 최대공약수입니다. 그 정사각형으로 처음 직사각형 전체를 빈틈없이 덮을 수 있기 때문입니다.</>}
    >
      <div className="controls row">
        <Slider id="eu-a" label="a" value={A} min={1} max={120} step={1} onChange={setA} />
        <Slider id="eu-b" label="b" value={B} min={1} max={120} step={1} onChange={setB} />
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="dm-tiles" role="img" aria-label={`${a} × ${b} 직사각형을 정사각형으로 채우기: 정사각형 ${shown.length}개${done ? `, 최대공약수 ${g}` : ''}`}>
            <rect x="0" y="0" width={W} height={H} className="frame" />
            {shown.map((q, i) => (
              <rect key={i} x={q.x * k} y={q.y * k} width={q.s * k} height={q.s * k} style={{ fill: `color-mix(in srgb, ${STEP_COLORS[q.step % 3]} ${i === shown.length - 1 && !done ? 70 : 32}%, transparent)`, stroke: STEP_COLORS[q.step % 3] }} className="sq" />
            ))}
            {shown.map((q, i) =>
              q.s * k >= 18 ? (
                <text key={`t${i}`} x={(q.x + q.s / 2) * k} y={(q.y + q.s / 2) * k} dy="0.35em" className="sqlbl" style={{ fontSize: Math.min(16, q.s * k * 0.3) }}>
                  {q.s}
                </text>
              ) : null,
            )}
            {done && g * k >= 3 && (
              <g className="ggrid">
                {Array.from({ length: a / g - 1 }, (_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * g * k} y1="0" x2={(i + 1) * g * k} y2={H} />
                ))}
                {Array.from({ length: b / g - 1 }, (_, i) => (
                  <line key={`h${i}`} x1="0" y1={(i + 1) * g * k} x2={W} y2={(i + 1) * g * k} />
                ))}
              </g>
            )}
          </svg>
          <table className="dm-steps" aria-label="나눗셈 단계">
            <tbody>
              {steps.map((st, i) => (
                <tr key={i} data-now={!done && cur && cur.step === i ? '' : undefined} data-later={cur && cur.step < i && !done ? '' : undefined}>
                  <td className="mono">
                    {st.a} = <strong style={{ color: STEP_COLORS[i % 3] }}>{st.q}</strong> × {st.b} + {st.r}
                  </td>
                  <td className="note">{st.r === 0 ? `나머지 0 → gcd = ${st.b}` : `gcd(${st.a}, ${st.b}) = gcd(${st.b}, ${st.r})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="controls">
          <StepControls s={s} id="eu-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="나눗셈 횟수" value={steps.length} />
            <Readout label="정사각형" value={`${shown.length} / ${squares.length}`} />
            <Readout label={`gcd(${a}, ${b})`} value={done ? g : '?'} color="var(--c-math-3)" />
            <Readout label={`lcm(${a}, ${b})`} value={done ? (a * b) / g : '?'} />
          </div>
          <div className="dm-note" aria-live="polite">
            {done ? (
              <>
                점선 격자가 {g} × {g} 정사각형입니다. 확장 유클리드 호제법으로 거꾸로 따라가면{' '}
                <span className="mono">
                  {a}×({x}) + {b}×({y}) = {g}
                </span>
                도 얻습니다.
              </>
            ) : (
              <>
                지금 놓는 정사각형: 한 변 <strong>{cur?.s}</strong>
              </>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the multiplication table mod m and inverses ─────────────── */

function InverseFigure() {
  const [m, setM] = useState(10);
  const [row, setRow] = useState(3);
  const a = Math.min(row, m - 1);
  const inv = modInverse(a, m);
  const units = Array.from({ length: m }, (_, i) => i).filter((i) => gcd(i, m) === 1 && i > 0);
  return (
    <Figure
      no={3}
      title="곱셈표에서 역원 찾기"
      hint="법 m을 바꾸고 행을 눌러 보세요"
      caption={<>행 a, 열 b의 칸이 a × b mod m입니다. 진한 칸이 값 1, 즉 a × b ≡ 1인 곳이고 그때 b가 a의 역원입니다. 흐린 행은 gcd(a, m) &gt; 1이라 1이 한 번도 나오지 않는 행입니다. m이 소수이면 0을 뺀 모든 행에 1이 정확히 한 번씩 나타납니다.</>}
    >
      <div className="controls row">
        <Slider id="inv-m" label="법 m" value={m} min={2} max={16} step={1} onChange={setM} />
      </div>
      <div className="fig-split">
        <div className="dm-scroll">
          <table className="dm-mul" aria-label={`곱셈표 mod ${m}`}>
            <thead>
              <tr>
                <th className="corner">×</th>
                {Array.from({ length: m }, (_, j) => (
                  <th key={j}>{j}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: m }, (_, i) => {
                const unit = gcd(i, m) === 1 && i > 0;
                return (
                  <tr key={i} data-unit={unit || undefined} data-sel={i === a || undefined}>
                    <th>
                      <button type="button" className="dm-rowbtn" aria-pressed={i === a} onClick={() => setRow(i)} aria-label={`행 ${i} 고르기`}>
                        {i}
                      </button>
                    </th>
                    {Array.from({ length: m }, (_, j) => {
                      const v = (i * j) % m;
                      return (
                        <td key={j} data-one={v === 1 || undefined} onClick={() => setRow(i)}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={`gcd(${a}, ${m})`} value={gcd(a, m)} />
            <Readout label={`${a}의 역원 (mod ${m})`} value={inv === null ? '없음' : `${inv}   (${a} × ${inv} = ${a * inv} ≡ 1)`} color={inv === null ? 'var(--bad)' : 'var(--c-math-3)'} />
            <Readout label="역원이 있는 수" value={`${units.length}개: ${units.join(', ')}`} />
          </div>
          <div className="dm-note">
            {inv === null ? (
              <>
                {a} × b는 언제나 {gcd(a, m)}의 배수에서만 멈추므로 1에 닿지 못합니다. 그래서 mod {m}에서 {a}로는 "나눌" 수 없습니다.
              </>
            ) : (
              <>mod {m}에서 {a}로 나누는 것은 {inv}를 곱하는 것과 같습니다.</>
            )}
          </div>
          <Legend
            items={[
              { color: 'var(--c-math-3)', label: '값이 1인 칸', shape: 'sq' },
              { color: 'var(--surface-3)', label: '역원이 없는 행', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: toy RSA ─────────────── */

const RSA_PRIMES = PRIMES.filter((p) => p >= 11 && p <= 61);
const E_CANDIDATES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

function RsaFigure() {
  const [p, setP] = useState(61);
  const [q, setQ] = useState(53);
  const qq = q === p ? RSA_PRIMES.find((x) => x !== p)! : q;
  const n = p * qq;
  const phi = (p - 1) * (qq - 1);
  const es = E_CANDIDATES.filter((e) => gcd(e, phi) === 1).slice(0, 8);
  const [eWant, setE] = useState(17);
  const e = es.includes(eWant) ? eWant : es[0];
  const d = modInverse(e, phi)!;
  const [msg, setMsg] = useState(65);
  const m = Math.min(msg, n - 1);
  const c = modPow(m, e, n);
  const back = modPow(c, d, n);
  const ch = m >= 32 && m < 127 ? ` ('${String.fromCharCode(m)}')` : '';

  return (
    <Figure
      no={4}
      title="장난감 RSA"
      hint="소수 두 개와 e를 고르고, 메시지를 바꿔 보세요"
      caption={<>두 소수 p, q를 곱한 n과 지수 e가 공개 키이고, d가 개인 키입니다. 누구나 공개 키로 m<sup>e</sup> mod n을 계산해 암호문을 만들 수 있지만, 그것을 되돌리는 c<sup>d</sup> mod n은 d를 아는 사람만 할 수 있습니다. d는 φ(n) = (p − 1)(q − 1)을 알아야 구할 수 있고, φ(n)을 알려면 n을 소인수분해해야 합니다. 여기서는 n이 네 자리라 순식간이지만, 실제 RSA의 n은 600자리가 넘습니다.</>}
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '0 1 140px' }}>
          <label className="ctl-label" htmlFor="rsa-p">
            <span>소수 p</span>
          </label>
          <select id="rsa-p" className="select" value={p} onChange={(ev) => setP(+ev.target.value)}>
            {RSA_PRIMES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="ctl" style={{ flex: '0 1 140px' }}>
          <label className="ctl-label" htmlFor="rsa-q">
            <span>소수 q</span>
          </label>
          <select id="rsa-q" className="select" value={qq} onChange={(ev) => setQ(+ev.target.value)}>
            {RSA_PRIMES.filter((x) => x !== p).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <Seg label="공개 지수 e" value={e} onChange={setE} options={es.map((x) => ({ value: x, label: String(x) }))} />
      </div>
      <div className="dm-rsa-keys">
        <div>
          <span className="lbl">n = p × q</span>
          <span className="mono">
            {p} × {qq} = <strong>{n}</strong>
          </span>
        </div>
        <div>
          <span className="lbl">φ(n) = (p−1)(q−1)</span>
          <span className="mono">
            {p - 1} × {qq - 1} = {phi}
          </span>
        </div>
        <div>
          <span className="lbl">d = e⁻¹ mod φ(n)</span>
          <span className="mono">
            <strong>{d}</strong> ({e} × {d} = {e * d} = {Math.floor((e * d) / phi)} × {phi} + 1)
          </span>
        </div>
      </div>
      <Slider id="rsa-m" label={`메시지 m (0 ~ ${n - 1})${ch}`} value={m} min={0} max={n - 1} step={1} onChange={setMsg} />
      <div className="dm-rsa-flow" aria-live="polite">
        <div className="box">
          <span className="lbl">평문</span>
          <span className="v mono">{m}</span>
        </div>
        <div className="arrow">
          <span className="mono">
            m<sup>{e}</sup> mod {n}
          </span>
          <span className="who pub">공개 키 (n, e)</span>
        </div>
        <div className="box enc">
          <span className="lbl">암호문</span>
          <span className="v mono">{c}</span>
        </div>
        <div className="arrow">
          <span className="mono">
            c<sup>{d}</sup> mod {n}
          </span>
          <span className="who priv">개인 키 d</span>
        </div>
        <div className="box" data-ok={back === m || undefined}>
          <span className="lbl">복호문</span>
          <span className="v mono">{back}</span>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Modular() {
  return (
    <>
      <h2>나머지만 남기는 계산</h2>
      <p>
        지금이 9시이고 5시간 뒤면 몇 시일까요? 14시, 12시간제로는 2시입니다. 우리는 12를 넘으면 12를 빼는 계산을 매일 합니다. 요일도(7로 나눈 나머지), 각도도(360으로 나눈 나머지), 원형 버퍼의 인덱스도 같은 계산입니다. 이렇게 어떤 수 m으로 나눈 나머지만 신경 쓰는 계산을 <T en="modular arithmetic">모듈러 연산</T>이라고 하고, m을 <T en="modulus">법</T>이라고 부릅니다.
      </p>
      <p>출발점은 초등학교에서 배운 나눗셈입니다. 정수 a와 양의 정수 m이 있으면 다음을 만족하는 몫 q와 나머지 r이 정확히 한 쌍 있습니다.</p>
      <MB note="r을 a mod m이라고 씁니다. 예: 14 = 1·12 + 2이므로 14 mod 12 = 2. −7 = (−3)·3 + 2이므로 −7 mod 3 = 2.">{'a = q \\cdot m + r, \\qquad 0 \\le r < m'}</MB>
      <p>
        두 정수를 m으로 나눈 나머지가 같으면 "a와 b는 법 m에 대해 <T en="congruent">합동</T>이다"라고 하고 <M>{'a \\equiv b \\pmod m'}</M>로 씁니다. 같은 말로, m이 <M>{'a - b'}</M>를 나누어떨어뜨립니다. 3장에서 본 대로 합동은 동치 관계이고, 정수 전체를 m개의 묶음(나머지가 0인 수들, 1인 수들, …)으로 나눕니다. 모듈러 연산은 이 m개의 묶음을 m개의 수처럼 계산하는 것입니다.
      </p>

      <h2>더하고 곱한 다음 나눠도, 나눈 다음 더하고 곱해도</h2>
      <p>모듈러 연산이 쓸모 있는 이유는 덧셈과 곱셈이 나머지와 잘 어울리기 때문입니다. 중간에 언제 나머지를 취해도 결과가 같습니다.</p>
      <MB note="a ≡ a′, b ≡ b′ (mod m)이면 a + b ≡ a′ + b′, a·b ≡ a′·b′ (mod m).">{'(a + b) \\bmod m = \\big((a \\bmod m) + (b \\bmod m)\\big) \\bmod m \\qquad (a \\cdot b) \\bmod m = \\big((a \\bmod m)(b \\bmod m)\\big) \\bmod m'}</MB>
      <ClockFigure />
      <p>
        그림 1에서 곱셈을 고르면 점들이 별 모양을 그립니다. m = 12, a = 5이면 열두 눈금을 모두 한 번씩 밟고 돌아오지만, a = 4이면 0, 4, 8만 오갑니다. 이 차이가 뒤에서 볼 역원의 존재와 이어집니다. 그리고 a를 음수로 바꾸면 JavaScript의 <code>%</code>가 수학의 나머지와 달라지는 것을 볼 수 있습니다.
      </p>
      <p>
        중간에 나머지를 취해도 된다는 성질 덕분에 엄청나게 큰 수를 다루지 않고도 계산할 수 있습니다. <M>{'7^{100}'}</M>의 일의 자리를 구할 때 85자리 수를 만들 필요 없이, 7을 곱할 때마다 10으로 나눈 나머지만 남기면 됩니다. 7, 9, 3, 1, 7, 9, …로 4개씩 되풀이되므로 답은 1입니다. 4장의 거듭제곱 함수에 매 단계 <code>% m</code>만 붙이면 <M>{'a^e \\bmod m'}</M>을 곱셈 약 <M>{'2\\log_2 e'}</M>번으로 구할 수 있고, 아래 RSA가 바로 이것을 씁니다.
      </p>
      <Code label="모듈러 연산의 실전 코드">{`
// 수학의 나머지: 음수에서도 항상 0 이상 (JS의 %는 -7 % 3 === -1)
const mod = (a, m) => ((a % m) + m) % m;

// 원형 버퍼: 끝에 닿으면 처음으로 돌아간다
next = (i + 1) % buffer.length;
prev = mod(i - 1, buffer.length); // i = 0이면 마지막 칸

// 해시 테이블: 큰 해시값을 버킷 번호로
const bucket = hash(key) % table.length;

// 거듭제곱 나머지: 곱할 때마다 줄여서 수가 커지지 않게
function modPow(a, e, m) {
  let result = 1, base = a % m;
  while (e > 0) {
    if (e & 1) result = (result * base) % m; // 지수의 이 비트가 1이면 곱한다
    base = (base * base) % m;                // a, a², a⁴, a⁸, ...
    e >>= 1;
  }
  return result;
}
modPow(7, 100, 10); // 1`}</Code>
      <Callout kind="note">
        주민등록번호, ISBN, 신용카드 번호의 마지막 자리는 앞자리들로 계산한 <T en="check digit">검증 숫자</T>입니다. 각 자리에 정해진 가중치를 곱해 더한 뒤 10이나 11로 나눈 나머지를 쓰므로, 한 자리를 잘못 쓰거나 이웃한 두 자리를 바꿔 쓰는 실수 대부분이 나머지를 바꿔 놓아 바로 드러납니다. 네트워크 패킷의 체크섬도 같은 생각입니다.
      </Callout>

      <h2>최대공약수와 유클리드 호제법</h2>
      <p>
        두 수를 모두 나누어떨어뜨리는 가장 큰 수가 <T en="greatest common divisor">최대공약수</T> <M>{'\\gcd(a, b)'}</M>입니다. 두 수를 소인수분해해서 구할 수도 있지만, 큰 수의 소인수분해는 매우 어렵습니다. 기원전 300년 무렵 유클리드가 적어 둔 방법은 소인수분해 없이 나눗셈만 반복합니다.
      </p>
      <MB note="a를 b로 나눈 나머지가 0이 될 때까지 (a, b) → (b, a mod b)를 반복하면, 마지막 b가 최대공약수입니다.">{'\\gcd(a, b) = \\gcd(b,\\; a \\bmod b), \\qquad \\gcd(a, 0) = a'}</MB>
      <p>
        왜 맞을까요? <M>{'a = qb + r'}</M>일 때, a와 b를 둘 다 나누는 수 d는 <M>{'r = a - qb'}</M>도 나눕니다. 거꾸로 b와 r을 둘 다 나누는 수는 <M>{'a = qb + r'}</M>도 나눕니다. 그러니 (a, b)의 공약수와 (b, r)의 공약수는 완전히 같은 집합이고, 그중 가장 큰 것도 같습니다. 수는 매번 작아지므로 언젠가 나머지가 0이 되어 멈춥니다. 4장의 귀납법이 이 알고리즘이 맞다는 증명의 뼈대입니다.
      </p>
      <EuclidFigure />
      <p>
        그림 2에서 a = 89, b = 55처럼 이웃한 피보나치 수를 넣어 보세요. 몫이 매번 1이라 정사각형이 하나씩만 놓이고 나눗셈 횟수가 가장 많아집니다. 이것이 유클리드 호제법의 최악의 경우인데, 그래도 나눗셈 횟수는 작은 수의 자릿수의 약 5배를 넘지 않습니다. 즉 <M>{'O(\\log b)'}</M>번이라 수백 자리 수에서도 순식간에 끝납니다.
      </p>
      <p>
        나눗셈 단계를 거꾸로 따라 올라가면 <M>{'ax + by = \\gcd(a, b)'}</M>를 만족하는 정수 x, y도 얻습니다(<T en="Bézout's identity">베주 항등식</T>). 이것을 함께 구하는 방법을 <T en="extended Euclidean algorithm">확장 유클리드 호제법</T>이라고 하고, 바로 다음 절의 역원을 구하는 데 씁니다.
      </p>

      <h2>모듈러 역원: 나머지 세계의 나눗셈</h2>
      <p>
        보통 수에서 3으로 나누는 것은 1/3을 곱하는 것입니다. 나머지 세계에는 분수가 없으므로 대신 <M>{'a \\cdot x \\equiv 1 \\pmod m'}</M>인 정수 x를 찾습니다. 이 x를 a의 <T en="modular inverse">모듈러 역원</T>이라 하고 <M>{'a^{-1}'}</M>로 씁니다. mod 10에서 3 × 7 = 21 ≡ 1이므로 3의 역원은 7입니다.
      </p>
      <InverseFigure />
      <p>
        그림 3에서 m = 10이면 2, 4, 5, 6, 8, 0의 행에는 1이 없습니다. 2 × b는 언제나 짝수라서 10으로 나눈 나머지도 짝수이니 1이 될 수 없습니다. 일반적으로 <strong>a의 역원은 gcd(a, m) = 1일 때, 그리고 그때만 존재</strong>합니다. gcd가 1이면 베주 항등식이 <M>{'ax + my = 1'}</M>을 주고, 양변을 m으로 나눈 나머지를 보면 <M>{'ax \\equiv 1'}</M>이니 x가 바로 역원입니다. m을 7이나 13 같은 소수로 바꾸면 0을 뺀 모든 행에 1이 있습니다. 소수를 법으로 하면 0이 아닌 모든 수로 나눌 수 있어서, 암호와 오류 정정 부호가 소수 법을 즐겨 씁니다.
      </p>

      <h2>RSA의 아이디어</h2>
      <p>
        <T en="public-key cryptography">공개 키 암호</T>는 잠그는 열쇠와 여는 열쇠가 다른 암호입니다. 잠그는 열쇠는 모두에게 공개하고, 여는 열쇠는 혼자 간직합니다. 1977년에 나온 RSA는 지금까지 본 도구만으로 만들어집니다.
      </p>
      <ol>
        <li>큰 소수 p, q를 몰래 골라 <M>{'n = pq'}</M>와 <M>{'\\varphi(n) = (p-1)(q-1)'}</M>을 계산한다.</li>
        <li>
          <M>{'\\gcd(e, \\varphi(n)) = 1'}</M>인 e를 고르고, 확장 유클리드 호제법으로 <M>{'d = e^{-1} \\bmod \\varphi(n)'}</M>을 구한다.
        </li>
        <li>
          (n, e)를 공개한다. 누구든 메시지 m을 <M>{'c = m^e \\bmod n'}</M>으로 암호화해 보낼 수 있다.
        </li>
        <li>
          받은 사람은 <M>{'c^d \\bmod n'}</M>을 계산해 m을 되찾는다.
        </li>
      </ol>
      <RsaFigure />
      <p>
        복호화가 되는 이유는 오일러의 정리에 있습니다. n과 서로소인 m에 대해 <M>{'m^{\\varphi(n)} \\equiv 1 \\pmod n'}</M>입니다. <M>{'ed = 1 + k\\varphi(n)'}</M>이므로 <M>{'c^d = m^{ed} = m \\cdot (m^{\\varphi(n)})^k \\equiv m \\cdot 1^k = m'}</M>이 됩니다. 소수 p를 법으로 하는 특별한 경우 <M>{'a^{p-1} \\equiv 1 \\pmod p'}</M>를 <T en="Fermat's little theorem">페르마의 소정리</T>라고 부릅니다. 그림 4에서 아무 메시지나 넣어도 복호문이 평문과 같은 것을 확인해 보세요.
      </p>
      <p>
        안전성은 "곱하기는 쉽고 소인수분해는 어렵다"는 비대칭에서 옵니다. 공격자는 n과 e를 알지만, d를 구하려면 φ(n)이, φ(n)을 구하려면 p와 q가 필요합니다. 600자리 수를 소인수분해하는 알려진 방법은 지구의 모든 컴퓨터로도 감당할 수 없을 만큼 오래 걸립니다. 인증서와 TLS에서 공개 키가 어떻게 쓰이는지는 <a href={lessonHref('net-security', 'public-key')}>공개 키와 인증서</a>에서 이어집니다.
      </p>
      <Callout kind="warn">
        그림 4는 원리만 보여 주는 장난감입니다. 같은 m은 언제나 같은 c가 되므로, 공격자가 후보 메시지를 하나씩 암호화해 맞춰 볼 수 있습니다. 실제 RSA는 메시지에 무작위 패딩을 섞고(OAEP), 2048비트 이상의 n을 쓰며, 직접 구현하지 않고 검증된 라이브러리를 씁니다.
      </Callout>

      <Callout kind="key">
        a mod m은 a를 m으로 나눈 0 이상 m 미만의 나머지이고, 덧셈과 곱셈은 중간에 나머지를 취해도 결과가 같습니다. 유클리드 호제법은 gcd(a, b) = gcd(b, a mod b)를 반복해 O(log) 단계에 최대공약수를 구합니다. a의 역원은 gcd(a, m) = 1일 때만 있고 확장 유클리드 호제법으로 구합니다. RSA는 거듭제곱 나머지와 역원, 그리고 소인수분해의 어려움 위에 서 있습니다.
      </Callout>
      <Quiz
        q={<>mod 26에서 알파벳을 x → 3x + 5로 바꾸는 암호(아핀 암호)가 있다. 이 암호를 풀 수 있는 이유와 푸는 방법으로 옳은 것은?</>}
        options={['gcd(3, 26) = 1이라 3의 역원 9가 있고, y → 9(y − 5) mod 26으로 푼다', '3은 소수라서 풀 수 있고, y → (y − 5)/3으로 푼다', '26은 소수가 아니라서 풀 수 없다', 'x → 3x + 5는 단사가 아니라서 풀 수 없다']}
        answer={0}
        explain={<>3 × 9 = 27 ≡ 1 (mod 26)이므로 3의 역원은 9입니다. y ≡ 3x + 5에서 x ≡ 9(y − 5)입니다. 곱하는 수가 26과 서로소이면 이 함수는 전단사가 되어 되돌릴 수 있습니다. 반대로 곱하는 수가 2나 13이면 서로 다른 글자가 같은 글자로 가서 풀 수 없습니다.</>}
      />
    </>
  );
}

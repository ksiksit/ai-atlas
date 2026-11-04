import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { addD, bitsOf, bitsToF32, dyadicToDecimal, f32Dyadic, f32Fields, f32ToBits, f64Dyadic, hexStr, mulD, toSigned, wrap, type Dyadic } from './bits';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻';
const sup = (k: number) => String(k).split('').map((d) => (d === '-' ? SUP[10] : SUP[+d])).join('');
const num = (v: number) => v.toLocaleString('ko-KR');

/* ─────────────── Figure 1: a row of bits read three ways ─────────────── */

function BitRowFigure() {
  const [n, setN] = useState<8 | 16>(8);
  const [u, setU] = useState(0b10100100);
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  const bits = bitsOf(u, n);
  const max = 2 ** n;
  const on = bits.map((b, i) => (b ? 2 ** (n - 1 - i) : 0)).filter(Boolean);

  const set = (v: number, why = '') => {
    setU(wrap(v, n));
    setNote(why);
    setTyped('');
  };
  const changeN = (m: 8 | 16) => {
    setN(m);
    setU((x) => wrap(x, m));
    setNote('');
  };
  const inc = () => set(u + 1, u === max - 1 ? `넘침: ${num(max - 1)} + 1은 ${n}비트에 담기지 않아 맨 위 자리올림이 버려지고 0이 됩니다.` : '');
  const dec = () => set(u - 1, u === 0 ? `0 − 1은 모든 비트가 1인 ${num(max - 1)}이 됩니다. 2의 보수로 읽으면 −1입니다.` : '');
  const shl = () => set(u * 2, u >= max / 2 ? '맨 왼쪽 비트가 밖으로 밀려나 사라졌습니다. 2를 곱한 값이 넘쳤습니다.' : '모든 비트가 한 칸 왼쪽으로: 2를 곱한 것과 같습니다.');
  const shr = () => set(Math.floor(u / 2), u % 2 ? '맨 오른쪽 1이 밀려나 사라졌습니다. 2로 나눈 몫만 남습니다.' : '모든 비트가 한 칸 오른쪽으로: 2로 나눈 것과 같습니다.');
  const not = () => set(max - 1 - u, '모든 비트를 뒤집었습니다. 2의 보수로 읽으면 −x − 1이 됩니다.');

  const onTyped = (s: string) => {
    setTyped(s);
    if (!/^-?\d+$/.test(s.trim())) return;
    const v = parseInt(s, 10);
    const lo = -(2 ** (n - 1));
    if (v < lo || v >= max) {
      setNote(`${n}비트로는 ${num(lo)}부터 ${num(max - 1)}까지만 나타낼 수 있습니다.`);
      return;
    }
    setU(wrap(v, n));
    setNote(v < 0 ? `음수 ${v}는 2의 보수 비트 패턴으로 저장됩니다.` : '');
  };

  const groups = Array.from({ length: n / 4 }, (_, g) => bits.slice(g * 4, g * 4 + 4));
  const s = toSigned(u, n);

  return (
    <Figure
      no={1}
      title="비트 한 줄, 세 가지로 읽기"
      hint="비트를 눌러 켜고 꺼 보세요"
      caption={<>칸 아래의 작은 수가 그 자리의 값(자리값)입니다. 맨 왼쪽 칸의 ±는 해석에 따라 부호가 바뀐다는 뜻입니다. 켜진 칸의 자리값을 모두 더하면 부호 없는 정수가 됩니다. 같은 비트를 2의 보수로 읽으면 맨 왼쪽 칸의 자리값이 음수(−{num(max / 2)})가 되고, 4비트씩 묶어 한 글자로 쓰면 16진수가 됩니다.</>}
    >
      <div className="bit-groups" role="group" aria-label={`${n}개의 비트`}>
        {groups.map((g, gi) => (
          <div key={gi} className="bit-group">
            {g.map((b, k) => {
              const i = gi * 4 + k;
              const pos = n - 1 - i;
              const pv = 2 ** pos;
              return (
                <button key={i} type="button" className="bit-btn" aria-pressed={!!b} aria-label={`2의 ${pos}제곱 자리, 지금 ${b}`} onClick={() => set(u + (b ? -pv : pv))}>
                  <span className="bit-d">{b}</span>
                  <span className="bit-pv">{i === 0 ? `±${num(pv)}` : num(pv)}</span>
                </button>
              );
            })}
            <span className="bit-hex" aria-hidden="true">
              {hexStr(g.reduce((a, x) => a * 2 + x, 0), 4)}
            </span>
          </div>
        ))}
      </div>
      <div className="arch-sum mono" aria-live="polite">
        {on.length ? `${on.map(num).join(' + ')} = ${num(u)}` : '모든 비트가 0: 값은 0'}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <Readout label="부호 없는 정수" value={num(u)} color="var(--neg)" />
        <Readout label="2의 보수 (부호 있음)" value={num(s)} color="var(--pos)" />
        <Readout label="16진수" value={`0x${hexStr(u, n)}`} />
        <Readout label="표현 범위" value={`${num(-(2 ** (n - 1)))} ~ ${num(max - 1)}`} />
      </div>
      <div className="controls row">
        <Seg label="비트 수" value={n} onChange={changeN} options={[{ value: 8, label: '8비트' }, { value: 16, label: '16비트' }]} />
        <div className="ctl" style={{ flex: '2 1 280px' }}>
          <span className="ctl-label">
            <span>연산</span>
          </span>
          <div className="btn-row">
            <Button small onClick={inc}>+1</Button>
            <Button small onClick={dec}>−1</Button>
            <Button small onClick={shl} title="왼쪽으로 한 칸 밀기">{'<< 1'}</Button>
            <Button small onClick={shr} title="오른쪽으로 한 칸 밀기">{'>> 1'}</Button>
            <Button small onClick={not} title="모든 비트 뒤집기">뒤집기</Button>
            <Button small onClick={() => set(0)}>0으로</Button>
          </div>
        </div>
        <div className="ctl" style={{ flex: '1 1 150px' }}>
          <label className="ctl-label" htmlFor="bin-typed">
            <span>10진수로 입력</span>
          </label>
          <input id="bin-typed" className="text-input mono" inputMode="numeric" placeholder="예: -5, 200" value={typed} onChange={(e) => onTyped(e.target.value)} />
        </div>
      </div>
      <div className="arch-note" aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the 4-bit number wheel ─────────────── */

const W4 = 16;

function WheelFigure() {
  const P = usePalette();
  const [a, setA] = useState(6);
  const [b, setB] = useState(3);
  const [op, setOp] = useState<'+' | '-'>('+');
  const b2 = op === '+' ? b : (W4 - b) % W4; // what the adder actually adds
  const res = (a + b2) % W4;
  const ua = a;
  const sa = toSigned(a, 4);
  const sb = toSigned(b, 4);
  const trueU = op === '+' ? ua + b : ua - b;
  const trueS = op === '+' ? sa + sb : sa - sb;
  const uOver = trueU < 0 || trueU > 15;
  const sOver = trueS < -8 || trueS > 7;
  // steps around the wheel: clockwise for +, counter-clockwise for −
  const steps = op === '+' ? b : -b;
  const signedSteps = op === '+' ? sb : -sb; // the same move seen as a signed number

  // column addition a + b2 with carries
  const carries = [0];
  for (let i = 0; i < 4; i++) carries.push(((a >> i) & 1) + ((b2 >> i) & 1) + carries[i] > 1 ? 1 : 0);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 36;
      const ang = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / W4;
      const at = (k: number, r: number): [number, number] => [cx + r * Math.cos(ang(k)), cy + r * Math.sin(ang(k))];

      // seams: between 15 and 0 (unsigned), between 7 and 8 (signed)
      const seam = (k: number, col: string, lit: boolean, label: string) => {
        const t = ang(k - 0.5);
        ctx.strokeStyle = lit ? col : alpha(col, 0.35);
        ctx.lineWidth = lit ? 3 : 1.5;
        ctx.setLineDash(lit ? [] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx + (R - 44) * Math.cos(t), cy + (R - 44) * Math.sin(t));
        ctx.lineTo(cx + (R + 30) * Math.cos(t), cy + (R + 30) * Math.sin(t));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lit ? col : alpha(col, 0.7);
        ctx.font = `${lit ? 700 : 500} 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lx = cx + (R - 84) * Math.cos(t);
        const ly = cy + (R - 84) * Math.sin(t);
        const tw = ctx.measureText(label).width;
        const fill = ctx.fillStyle;
        ctx.fillStyle = P.surface;
        ctx.fillRect(lx - tw / 2 - 3, ly - 8, tw + 6, 16);
        ctx.fillStyle = fill;
        ctx.fillText(label, lx, ly);
      };

      // the move: an arc inside the ring (dashed orange: the same move read as a signed number)
      const move = (st: number, r: number, col: string, dash: number[]) => {
        if (st === 0) return;
        const a0 = ang(a);
        const a1 = ang(a + st);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a1, st < 0);
        ctx.stroke();
        ctx.setLineDash([]);
        // arrow head at the end, tangent to the arc
        const [ex, ey] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
        const dir = a1 + (st > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ex + 8 * Math.cos(dir), ey + 8 * Math.sin(dir));
        ctx.lineTo(ex + 4 * Math.cos(dir + 2.2), ey + 4 * Math.sin(dir + 2.2));
        ctx.lineTo(ex + 4 * Math.cos(dir - 2.2), ey + 4 * Math.sin(dir - 2.2));
        ctx.closePath();
        ctx.fill();
      };
      move(steps, R - 54, P.ink, []);
      if (signedSteps !== steps) move(signedSteps, R - 67, P.pos, [5, 4]);
      seam(0, P.neg, uOver, '부호 없는 넘침');
      seam(8, P.pos, sOver, '부호 있는 넘침');

      for (let k = 0; k < W4; k++) {
        const [x, y] = at(k, R);
        const isA = k === a;
        const isR = k === res;
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.fillStyle = isR ? P.good : isA ? alpha(P.ink, 0.12) : P.surface;
        ctx.fill();
        ctx.strokeStyle = isR ? P.good : isA ? P.ink : P.lineStrong;
        ctx.lineWidth = isA || isR ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = isR ? P.surface : P.ink;
        ctx.font = `600 10.5px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(k.toString(2).padStart(4, '0'), x, y + 0.5);
        const [ox, oy] = at(k, R + 27);
        ctx.fillStyle = P.neg;
        ctx.font = `12px ${P.fontMono}`;
        ctx.fillText(String(k), ox, oy);
        const [ix, iy] = at(k, R - 31);
        ctx.fillStyle = P.pos;
        ctx.fillText(String(toSigned(k, 4)), ix, iy);
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `600 13px ${P.fontBody}`;
      ctx.fillText(`${a.toString(2).padStart(4, '0')} ${op} ${b.toString(2).padStart(4, '0')}`, cx, cy - 9);
      ctx.fillStyle = P.good;
      ctx.font = `700 15px ${P.fontMono}`;
      ctx.fillText(`= ${res.toString(2).padStart(4, '0')}`, cx, cy + 12);
    },
    [P, a, b, op, res, uOver, sOver, steps, signedSteps],
    { aspect: 1, maxHeight: 400, minHeight: 300 },
  );

  return (
    <Figure
      no={2}
      title="4비트 수의 바퀴"
      hint="a, b와 연산을 바꿔 보세요"
      caption={<>4비트로 만들 수 있는 패턴 16개를 시계처럼 둥글게 놓았습니다. 바깥 파란 수는 부호 없이 읽은 값(0~15), 안쪽 주황 수는 2의 보수로 읽은 값(−8~7)입니다. 더하기는 시계 방향, 빼기는 반대 방향으로 b칸 돌기입니다. b를 음수로 읽으면 같은 이동이 반대쪽으로 도는 주황 점선이 됩니다. 회로는 어느 쪽으로 읽든 똑같이 돌 뿐이고, 점선 경계를 넘으면 그 해석에서 넘침이 생깁니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`4비트 수 바퀴: ${a} ${op} ${b}의 결과는 비트 ${res.toString(2).padStart(4, '0')}, 부호 없이 ${res}, 부호 있게 ${toSigned(res, 4)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="연산" value={op} onChange={setOp} options={[{ value: '+', label: '더하기 +' }, { value: '-', label: '빼기 −' }]} />
          <Slider id="wh-a" label="a" value={a} min={0} max={15} step={1} onChange={setA} format={(v) => `${v.toString(2).padStart(4, '0')} (${v} / ${toSigned(v, 4)})`} />
          <Slider id="wh-b" label="b" value={b} min={0} max={15} step={1} onChange={setB} format={(v) => `${v.toString(2).padStart(4, '0')} (${v} / ${toSigned(v, 4)})`} />
          <div className="col-add mono" aria-label="2진수 세로셈">
            <span className="lbl">자리올림</span>
            {carries.slice(1).reverse().map((c, i) => (
              <span key={i} className={c ? 'carry' : 'dim'}>{c}</span>
            ))}
            <span />
            <span className="lbl">a</span>
            <span />
            {a.toString(2).padStart(4, '0').split('').map((d, i) => <span key={i}>{d}</span>)}
            <span className="lbl">{op === '+' ? '+ b' : '+ (−b)'}</span>
            <span />
            {b2.toString(2).padStart(4, '0').split('').map((d, i) => <span key={i}>{d}</span>)}
            <span className="lbl rule">결과</span>
            <span className={'rule ' + (carries[4] ? 'drop' : 'dim')}>{carries[4]}</span>
            {res.toString(2).padStart(4, '0').split('').map((d, i) => <span key={i} className="rule res">{d}</span>)}
          </div>
          {op === '-' && <div className="arch-small">빼기는 b를 뒤집고 1을 더한 값(−b의 2의 보수)을 더해서 합니다. 왼쪽 끝으로 넘친 자리올림은 버립니다.</div>}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="부호 없이 읽으면" value={`${ua} ${op} ${b} → ${res}`} color={uOver ? 'var(--bad)' : 'var(--neg)'} />
            <Readout label="2의 보수로 읽으면" value={`${sa} ${op === '+' ? '+' : '−'} ${sb < 0 ? `(${sb})` : sb} → ${toSigned(res, 4)}`} color={sOver ? 'var(--bad)' : 'var(--pos)'} />
            <Readout label="부호 없는 넘침" value={uOver ? '있음' : '없음'} />
            <Readout label="부호 있는 넘침" value={sOver ? '있음' : '없음'} />
          </div>
          <div className="arch-small">부호 있게 보면 b는 {signedSteps >= 0 ? `시계 방향 ${signedSteps}칸` : `반대 방향 ${-signedSteps}칸`}과 같습니다.</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: float32 bit editor ─────────────── */

const F_PRESETS: { label: string; v: number }[] = [
  { label: '0.1', v: 0.1 },
  { label: '1', v: 1 },
  { label: '−6.5', v: -6.5 },
  { label: '3.14159', v: 3.14159 },
  { label: '16777217', v: 16777217 },
  { label: '최댓값', v: 3.4028234663852886e38 },
  { label: '1/0', v: Infinity },
];

/** Shortest decimal that rounds back to the same float32. */
function shortF32(x: number): string {
  if (!isFinite(x)) return String(x);
  for (let p = 1; p <= 9; p++) {
    const s = x.toPrecision(p);
    if (Math.fround(Number(s)) === x) return String(Number(s));
  }
  return String(x);
}

function FloatFigure() {
  const [u, setU] = useState(f32ToBits(0.1));
  const [typed, setTyped] = useState('0.1');
  const { sign, exp, frac } = f32Fields(u);
  const val = bitsToF32(u);
  const exact = f32Dyadic(u);
  const bits = bitsOf(u, 32);
  const special = exp === 255 ? (frac ? 'NaN' : 'inf') : exp === 0 ? 'sub' : 'normal';
  const e = exp === 0 ? -126 : exp - 127;
  const mant = (exp === 0 ? 0 : 1) + frac / 2 ** 23;
  const typedNum = Number(typed);
  const typedOk = typed.trim() !== '' && !isNaN(typedNum);
  const err = typedOk && isFinite(val) ? val - typedNum : NaN;
  const gap = special === 'normal' || special === 'sub' ? 2 ** (e - 23) : NaN;

  const flip = (i: number) => {
    const nu = (u ^ (2 ** (31 - i))) >>> 0;
    setU(nu);
    setTyped(shortF32(bitsToF32(nu)));
  };
  const fromText = (s: string) => {
    setTyped(s);
    const x = Number(s);
    if (s.trim() !== '' && !isNaN(x)) setU(f32ToBits(x));
  };

  const field = (i: number) => (i === 0 ? 's' : i < 9 ? 'e' : 'm');
  const groups: [string, string, number, number][] = [
    ['부호', 's', 0, 1],
    ['지수 (8비트)', 'e', 1, 9],
    ['가수 (23비트)', 'm', 9, 32],
  ];

  return (
    <Figure
      no={3}
      title="float32의 32비트"
      hint="수를 입력하거나 비트를 눌러 보세요"
      caption={<>32비트를 부호 1비트, 지수 8비트, 가수 23비트로 나눕니다. 지수에서 127을 뺀 만큼 2를 거듭제곱하고, 가수 앞에 보이지 않는 "1."을 붙여 곱합니다. 아래 "실제로 저장된 값"은 그 비트가 뜻하는 수를 반올림 없이 끝까지 쓴 것입니다. 2의 거듭제곱으로 나눈 수는 항상 유한한 소수로 끝나므로 이렇게 정확히 쓸 수 있습니다.</>}
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 160px' }}>
          <label className="ctl-label" htmlFor="f32-in">
            <span>10진수 입력</span>
          </label>
          <input id="f32-in" className="text-input mono" value={typed} onChange={(ev) => fromText(ev.target.value)} spellCheck={false} autoComplete="off" />
        </div>
        <div className="ctl" style={{ flex: '3 1 300px' }}>
          <span className="ctl-label">
            <span>예시</span>
          </span>
          <div className="btn-row">
            {F_PRESETS.map((p) => (
              <Button key={p.label} small onClick={() => fromText(String(p.v))}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="fbits" role="group" aria-label="float32 비트">
        {groups.map(([name, f, from, to]) => (
          <div key={f} className="fbit-group" data-f={f}>
            <span className="fbit-name">{name}</span>
            <div className="fbit-cells">
              {bits.slice(from, to).map((b, k) => {
                const i = from + k;
                return (
                  <button key={i} type="button" className="fbit" data-f={field(i)} aria-pressed={!!b} aria-label={`${31 - i}번 비트 (${name}), 지금 ${b}`} onClick={() => flip(i)}>
                    {b}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="f-formula mono" aria-live="polite">
        {special === 'inf' && <>지수가 모두 1이고 가수가 0: {sign ? '−' : '+'}무한대(Infinity)</>}
        {special === 'NaN' && <>지수가 모두 1이고 가수가 0이 아님: NaN(수가 아님)</>}
        {(special === 'normal' || special === 'sub') && (
          <>
            <span className="fs">{sign ? '−' : '+'}</span>
            {' '}
            <span className="fm">{mant.toPrecision(10).replace(/0+$/, '').replace(/\.$/, '')}</span> × 2<sup className="fe">{e}</sup>
            {special === 'sub' && <span className="arch-small"> (지수 비트가 모두 0: 앞에 1을 붙이지 않는 아주 작은 수)</span>}
          </>
        )}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <Readout label="부호 비트" value={sign ? '1 (음수)' : '0 (양수)'} />
        <Readout label="지수 비트" value={`${exp} − 127 = ${exp === 0 || exp === 255 ? '—' : exp - 127}`} color="var(--neg)" />
        <Readout label="가수 (1.f)" value={special === 'normal' ? `${mant.toFixed(7)}…` : special === 'sub' ? `0.f` : '—'} color="var(--pos)" />
        <Readout label="이웃 float32와의 간격" value={isNaN(gap) ? '—' : `2${sup(e - 23)} ≈ ${gap.toPrecision(3)}`} />
      </div>
      <div className="f-exact">
        <span className="lbl">실제로 저장된 값</span>
        <span className="digits mono">{exact ? dyadicToDecimal(exact) : String(val)}</span>
        <span className="lbl">입력한 값과의 차이</span>
        <span className="mono" style={{ color: err ? 'var(--bad)' : 'var(--good)' }}>{!typedOk || isNaN(err) ? '—' : err === 0 ? '0 (정확히 저장됨)' : `약 ${err.toExponential(2)}`}</span>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '부호', shape: 'sq' },
          { color: 'var(--neg)', label: '지수', shape: 'sq' },
          { color: 'var(--pos)', label: '가수', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: 0.1 + 0.2, every digit ─────────────── */

type ExprId = 'p12' | 'p17' | 'exact' | 'big' | 'mul';
const EXPRS: Record<ExprId, { label: string; a: number; b: number; op: '+' | '×'; want: string; wantNum: number; aText: string; bText: string }> = {
  p12: { label: '0.1 + 0.2', a: 0.1, b: 0.2, op: '+', want: '0.3', wantNum: 0.3, aText: '0.1', bText: '0.2' },
  p17: { label: '0.1 + 0.7', a: 0.1, b: 0.7, op: '+', want: '0.8', wantNum: 0.8, aText: '0.1', bText: '0.7' },
  exact: { label: '0.5 + 0.25', a: 0.5, b: 0.25, op: '+', want: '0.75', wantNum: 0.75, aText: '0.5', bText: '0.25' },
  mul: { label: '1.1 × 1.1', a: 1.1, b: 1.1, op: '×', want: '1.21', wantNum: 1.21, aText: '1.1', bText: '1.1' },
  big: { label: '2⁵³ + 1', a: 2 ** 53, b: 1, op: '+', want: '9007199254740993', wantNum: 9007199254740993, aText: '9007199254740992', bText: '1' },
};

/** Show `s` with the part that differs from `ref` marked. */
function DiffDigits({ s, base: r }: { s: string; base: string }) {
  let k = 0;
  while (k < s.length && k < r.length && s[k] === r[k]) k++;
  if (k >= s.length && s.length === r.length) return <span className="digits mono">{s}</span>;
  return (
    <span className="digits mono">
      {s.slice(0, k)}
      <mark className="dd">{s.slice(k)}</mark>
    </span>
  );
}

function SumFigure() {
  const [id, setId] = useState<ExprId>('p12');
  const ex = EXPRS[id];
  const r = useMemo(() => {
    const da = f64Dyadic(ex.a)!;
    const db = f64Dyadic(ex.b)!;
    const exactSum: Dyadic = ex.op === '+' ? addD(da, db) : mulD(da, db);
    const js = ex.op === '+' ? ex.a + ex.b : ex.a * ex.b;
    return {
      a: dyadicToDecimal(da),
      b: dyadicToDecimal(db),
      exact: dyadicToDecimal(exactSum),
      js: dyadicToDecimal(f64Dyadic(js)!),
      jsText: String(js),
      want: dyadicToDecimal(f64Dyadic(ex.wantNum)!),
      equal: js === ex.wantNum,
    };
  }, [ex]);
  const rows: [string, string, string | null][] = [
    [`${ex.aText}의 저장값`, r.a, null],
    [`${ex.bText}의 저장값`, r.b, null],
    [`두 저장값의 정확한 ${ex.op === '+' ? '합' : '곱'}`, r.exact, null],
    ['결과 (가장 가까운 double로 반올림)', r.js, r.want],
    [`${ex.want}의 저장값`, r.want, null],
  ];
  return (
    <Figure
      no={4}
      title={`${ex.label}을 끝자리까지`}
      hint="식을 바꿔 보세요"
      caption={<>JavaScript의 number는 64비트 부동소수점(double)으로, 가수가 52비트입니다. 표의 수는 모두 브라우저에서 비트를 직접 읽어 반올림 없이 계산한 것입니다. 노란 배경은 결과가 기대한 값의 저장값과 달라지는 부분입니다.</>}
    >
      <Seg value={id} onChange={setId} options={(Object.keys(EXPRS) as ExprId[]).map((k) => ({ value: k, label: EXPRS[k].label }))} />
      <div className="sum-rows">
        {rows.map(([label, v, ref], k) => (
          <div key={k} className="sum-row">
            <span className="lbl">{label}</span>
            {ref ? <DiffDigits s={v} base={ref} /> : <span className="digits mono">{v}</span>}
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Readout label="console.log 출력" value={r.jsText} />
        <Readout label={`${ex.label.replace('2⁵³', '2**53')} === ${ex.want}`} value={String(r.equal)} color={r.equal ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <div className="arch-note">
        {id === 'p12' && <>0.1도 0.2도 정확히 저장되지 않습니다. 두 오차가 같은 방향(조금 큼)이라 더하면 커지고, 반올림한 결과는 0.3에 가장 가까운 double보다 한 칸 위에 떨어집니다. 그래서 0.30000000000000004로 출력됩니다.</>}
        {id === 'p17' && <>이번에는 반올림이 아래로 떨어져 0.8보다 한 칸 작은 0.7999999999999999가 됩니다. 오차의 방향은 수마다 다릅니다.</>}
        {id === 'exact' && <>0.5 = 2⁻¹, 0.25 = 2⁻²는 2진수로 딱 떨어지므로 오차가 전혀 없습니다. 분모가 2의 거듭제곱인 분수는 정확히 저장됩니다.</>}
        {id === 'mul' && <>곱셈도 마찬가지입니다. 1.1의 오차가 곱해져 결과가 1.21의 저장값보다 한 칸 큰 1.2100000000000002가 됩니다.</>}
        {id === 'big' && <>2⁵³을 넘으면 이웃한 double 사이 간격이 2가 되어 홀수를 담을 수 없습니다. 9007199254740993이라고 써도 저장값이 …992가 되므로 비교는 true인데 수학적으로는 틀립니다. Number.MAX_SAFE_INTEGER(2⁵³ − 1)까지만 정수가 안전합니다.</>}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Binary() {
  return (
    <>
      <h2>왜 하필 0과 1인가</h2>
      <p>
        컴퓨터 칩 안의 전선 하나는 전압이 높거나 낮거나, 둘 중 하나의 상태로 읽힙니다. 1.2V쯤이면 1, 0V 근처면 0입니다. 열 단계로 나누어 읽을 수도 있겠지만, 잡음이 조금만 섞여도 3이 4로 읽히는 일이 생깁니다. 두 단계라면 웬만한 잡음에도 헷갈리지 않습니다. 그래서 컴퓨터는 모든 것을 0과 1, 즉 <T en="bit">비트</T>로 나타냅니다.
      </p>
      <p>
        비트 8개를 묶은 것이 <T en="byte">바이트</T>입니다. 1바이트로는 <M>{'2^8 = 256'}</M>가지 패턴을 만들 수 있습니다. 파일 크기, 메모리 주소, 색깔(<code>#FF8800</code>), 문자(UTF-8), 정수와 소수가 모두 결국 바이트들입니다. 중요한 것은 <strong>비트 자체에는 뜻이 없다</strong>는 점입니다. 같은 8비트가 어떤 코드에서는 200이고, 다른 코드에서는 −56이며, 또 다른 곳에서는 문자 하나입니다. 해석을 정하는 것은 프로그램입니다.
      </p>

      <h2>2진수: 자리값이 2배씩</h2>
      <p>
        10진수 <code>352</code>는 <M>{'3 \\times 100 + 5 \\times 10 + 2 \\times 1'}</M>입니다. 자리마다 값이 10배씩 커집니다. <T en="binary">2진수</T>는 자리값이 2배씩 커집니다. 오른쪽부터 1, 2, 4, 8, 16, …이고, 각 자리에는 0이나 1만 올 수 있습니다. 그래서 <code>10100100</code>은 128 + 32 + 4 = 164입니다.
      </p>
      <BitRowFigure />
      <p>
        그림 1에서 <strong>+1</strong>을 계속 눌러 보세요. 맨 오른쪽 비트가 0과 1을 오가고, 1에서 0으로 돌아갈 때마다 왼쪽으로 자리올림이 생깁니다. 10진수에서 9 다음에 10이 되는 것과 같습니다. 모든 비트가 1인 255에서 +1을 하면 결과 256은 9비트가 필요한데 자리가 8개뿐이라 맨 위 자리올림이 버려지고 0이 됩니다. 이것이 <T en="overflow">오버플로(넘침)</T>입니다. <strong>{'<< 1'}</strong>은 모든 비트를 한 칸 왼쪽으로 옮기는데, 자리값이 모두 두 배가 되므로 2를 곱한 것과 같습니다.
      </p>

      <h2>16진수: 4비트를 한 글자로</h2>
      <p>
        2진수는 길어서 읽기 어렵습니다. 그래서 개발자는 4비트를 한 글자로 묶는 <T en="hexadecimal">16진수</T>를 씁니다. 4비트로 0부터 15까지 16가지를 나타낼 수 있으니, 0–9 다음에 A(10), B(11), …, F(15)를 씁니다. 그림 1의 비트 묶음 오른쪽 위에 작게 보이는 글자가 그 4비트의 16진수입니다. 1바이트는 언제나 16진수 두 글자입니다.
      </p>
      <ul>
        <li>
          CSS 색 <code>#FF8800</code>은 빨강 FF(255), 초록 88(136), 파랑 00(0), 세 바이트입니다.
        </li>
        <li>
          JavaScript에서 <code>0xFF</code>는 255, <code>0b1010</code>은 10입니다. <code>(255).toString(16)</code>은 <code>"ff"</code>, <code>parseInt("ff", 16)</code>은 255입니다.
        </li>
        <li>메모리 주소, 해시 값(Git 커밋 <code>a1b2c3d…</code>), UUID도 16진수로 씁니다. 비트 패턴을 짧게 적는 방법일 뿐 특별한 수가 아닙니다.</li>
      </ul>

      <h2>음수: 2의 보수</h2>
      <p>
        비트에는 마이너스 기호가 없습니다. 음수를 나타내는 방법으로 거의 모든 컴퓨터가 쓰는 것이 <T en="two's complement">2의 보수</T>입니다. 규칙은 하나입니다. <strong>맨 왼쪽 비트의 자리값을 음수로 본다</strong>. 8비트라면 맨 왼쪽 자리가 +128이 아니라 −128입니다. 그래서 <code>11111111</code>은 −128 + 127 = −1이고, <code>10000000</code>은 −128입니다. 그림 1의 2의 보수 칸을 보면 맨 왼쪽 비트를 켜는 순간 값이 음수로 바뀝니다.
      </p>
      <MB note="n비트 2의 보수: 맨 위 비트 b_{n-1}만 음의 자리값을 가집니다.">{'x = -b_{n-1} \\cdot 2^{n-1} + \\sum_{i=0}^{n-2} b_i \\cdot 2^i'}</MB>
      <p>
        왜 이렇게 이상한 방법을 쓸까요? 이렇게 하면 <strong>덧셈 회로 하나로 양수와 음수를 모두 계산</strong>할 수 있기 때문입니다. 그림 2는 4비트 패턴 16개를 바퀴처럼 놓은 것입니다. 바깥은 부호 없이 읽은 값, 안쪽은 2의 보수로 읽은 값입니다. 덧셈은 시계 방향으로 도는 것인데, 15 다음이 0으로 이어지므로 "1111에서 한 칸 더 = 0000"입니다. 안쪽 수로 보면 −1 + 1 = 0으로 맞습니다. 회로는 해석을 모르고 그냥 돌 뿐인데, 어느 쪽으로 읽어도 경계를 넘지 않는 한 답이 맞습니다.
      </p>
      <WheelFigure />
      <p>
        a = 6, b = 3에서 b를 늘려 보세요. 6 + 2 = 8에서 결과가 아래쪽 경계를 넘는 순간 2의 보수로는 <M>{'6 + 2 = -8'}</M>이 됩니다. 이것이 부호 있는 오버플로입니다. 반대로 위쪽 경계(15 → 0)를 넘으면 부호 없는 해석이 넘칩니다. 빼기로 바꾸면 반대 방향으로 돌고, 세로셈에서는 b를 뒤집고 1을 더한 값을 더하는 것을 볼 수 있습니다. <M>{'-b = \\lnot b + 1'}</M>이라는 이 성질 덕분에 CPU에는 뺄셈 회로가 따로 필요 없습니다.
      </p>
      <Callout kind="intuition">
        2의 보수는 자동차 주행 거리계와 같습니다. 0000에서 거꾸로 한 칸 돌리면 9999가 되듯이, 0에서 1을 빼면 모든 자리가 1인 패턴이 됩니다. 그 패턴을 −1이라고 부르기로 약속한 것이 2의 보수입니다.
      </Callout>
      <p>
        JavaScript의 number는 원래 부동소수점이지만, 비트 연산자(<code>{'& | ^ ~ << >>'}</code>)를 쓰는 순간 값을 <strong>32비트 2의 보수 정수</strong>로 바꿔서 계산합니다. 그래서 큰 수에 비트 연산을 하면 그림 2와 똑같은 넘침이 일어납니다.
      </p>
      <Code label="JavaScript에서 보는 32비트 정수">{`
(2 ** 31 - 1) | 0        // 2147483647: 32비트 부호 있는 정수의 최댓값
(2 ** 31) | 0            // -2147483648: 한 칸 넘자 맨 위 비트가 켜져 음수로
~5                       // -6: 모든 비트를 뒤집으면 -x - 1
-1 >>> 0                 // 4294967295: 같은 32비트를 부호 없이 읽기
(-1 >>> 0).toString(16)  // "ffffffff": 모든 비트가 1

const a = new Uint8Array([250]);
a[0] += 10;              // 260은 8비트에 안 들어가 260 - 256 = 4가 저장된다
const b = new Int8Array([127]);
b[0] += 1;               // -128: 부호 있는 8비트의 오버플로
`}</Code>
      <Callout kind="warn">
        오버플로는 실제 사고로 이어집니다. 1996년 아리안 5 로켓은 64비트 부동소수점 값을 16비트 정수로 바꾸다 넘침이 나서 발사 37초 만에 폭발했고, 많은 32비트 시스템은 1970년부터 센 초가 <M>{'2^{31} - 1'}</M>을 넘는 2038년 1월에 음수로 돌아가는 문제를 안고 있습니다. 2014년에는 싸이의 강남스타일 조회수가 32비트 정수의 최댓값 2,147,483,647에 다가가자 유튜브가 조회수 칸을 64비트로 바꿨습니다.
      </Callout>

      <h2>소수: 부동소수점</h2>
      <p>
        정수만으로는 3.14나 0.001 같은 수를 담을 수 없습니다. 그래서 수를 <T en="scientific notation">과학적 표기법</T>처럼 저장합니다. <M>{'6.02 \\times 10^{23}'}</M>을 "6.02"와 "23"으로 나눠 적듯이, 2진수로 <M>{'1.f \\times 2^{e}'}</M> 꼴로 바꾸고 f와 e를 비트에 담습니다. 소수점의 위치(지수)가 수마다 움직인다고 해서 <T en="floating point">부동소수점</T>이라고 부릅니다. 거의 모든 컴퓨터가 IEEE 754라는 표준을 따릅니다.
      </p>
      <MB note="s: 부호 비트, e: 지수 비트를 부호 없이 읽은 값, f: 가수 비트. float32는 지수 8비트, 가수 23비트입니다.">{'x = (-1)^{s} \\times 1.f_{(2)} \\times 2^{\\,e - 127}'}</MB>
      <FloatFigure />
      <p>
        그림 3에서 0.1을 넣으면 실제로 저장되는 값은 0.100000001490116119384765625입니다. 10진수 0.1은 2진수로 <code>0.000110011001100…</code>처럼 <code>0011</code>이 끝없이 반복되는 수라서, 23비트에서 잘라 반올림할 수밖에 없습니다. 10진수로 1/3을 0.333…으로 정확히 쓸 수 없는 것과 같은 일입니다. 반면 1, −6.5, 0.75처럼 2의 거듭제곱 분수로 이루어진 수는 정확히 저장됩니다.
      </p>
      <p>
        16777217을 넣어 보세요. float32의 가수는 24자리(보이지 않는 1 포함)뿐이라 <M>{'2^{24} = 16{,}777{,}216'}</M>을 넘으면 이웃한 값 사이 간격이 2가 됩니다. 홀수는 담을 수 없어서 16777216으로 저장됩니다. 부동소수점은 큰 수일수록 간격이 넓어집니다. 정밀도는 <strong>자릿수</strong>로 정해져 있고, 지수가 커지면 그 자릿수가 덮는 범위가 넓어질 뿐입니다. 지수 비트를 하나씩 눌러 보면 값이 두 배, 네 배로 뛰는 것을 볼 수 있습니다.
      </p>

      <h2>0.1 + 0.2 ≠ 0.3</h2>
      <p>
        JavaScript의 number는 64비트 부동소수점(double)입니다. 지수 11비트, 가수 52비트로 float32보다 훨씬 정밀하지만, 0.1이 정확히 저장되지 않는 것은 같습니다. 그림 4에서 각 값이 실제로 무엇인지 끝자리까지 확인해 보세요.
      </p>
      <SumFigure />
      <p>
        세 단계로 정리할 수 있습니다. 첫째, 0.1과 0.2가 저장될 때 이미 반올림됩니다. 둘째, 두 저장값을 정확히 더한 값은 double로 나타낼 수 없어서 다시 반올림됩니다. 셋째, 그 결과가 0.3의 저장값과 한 칸 차이가 납니다. 두 double 사이의 한 칸은 이 크기에서 약 <M>{'5.6 \\times 10^{-17}'}</M>입니다. 아주 작은 오차지만 <code>===</code>는 비트가 하나라도 다르면 false입니다.
      </p>
      <Code label="부동소수점을 안전하게 다루기">{`
0.1 + 0.2 === 0.3                    // false
Math.abs(0.1 + 0.2 - 0.3) < 1e-9     // true: 허용 오차 안이면 같다고 본다

// 돈은 가장 작은 단위의 정수로 센다
const priceWon = 1990;               // 원 단위 정수
const usdCents = 1999;               // 19.99달러를 센트로
const total = usdCents * 3;          // 5997: 정확하다
(total / 100).toFixed(2)             // "59.97": 보여 줄 때만 소수로

Number.MAX_SAFE_INTEGER              // 9007199254740991 = 2**53 - 1
2 ** 53 + 1 === 2 ** 53              // true: 이 위에서는 홀수가 사라진다
9007199254740993n + 1n               // 9007199254740994n: BigInt는 정확하다
`}</Code>
      <Callout kind="note">
        트위터(현 X)의 글 ID는 64비트 정수라서 2⁵³을 넘습니다. JSON을 JavaScript로 읽으면 마지막 자리가 바뀌는 문제가 생겨, API가 같은 ID를 문자열로 담은 <code>id_str</code> 필드를 함께 주었습니다. 데이터베이스의 큰 ID나 금액을 다룰 때는 문자열이나 <code>BigInt</code>로 받으세요.
      </Callout>
      <p>
        이렇게 비트로 나타낸 수를 실제로 더하는 일은 회로가 합니다. 다음 장에서는 AND, OR, NOT 게이트로 그림 2의 덧셈을 해내는 회로를 직접 만듭니다. 해시 함수가 비트 연산을 어떻게 쓰는지는 <a href={lessonHref('cs-algorithms', 'search-hash')}>탐색과 해시</a>에서 볼 수 있습니다.
      </p>

      <Callout kind="key">
        비트에는 뜻이 없고, 해석이 뜻을 정합니다. n비트는 부호 없이 <M>{'0 \\sim 2^n - 1'}</M>, 2의 보수로 <M>{'-2^{n-1} \\sim 2^{n-1} - 1'}</M>을 나타내고, 범위를 넘으면 조용히 한 바퀴 돌아갑니다. 부동소수점은 <M>{'1.f \\times 2^e'}</M> 꼴로 저장하므로 2의 거듭제곱 분수가 아닌 수(0.1 등)는 반올림되고, 큰 수일수록 간격이 넓어집니다.
      </Callout>
      <Quiz
        q="8비트 부호 있는 정수(Int8Array)에 100을 넣고 50을 더했다. 저장되는 값은?"
        options={['150', '127 (최댓값에서 멈춤)', '−106', '오류가 나서 저장되지 않는다']}
        answer={2}
        explain={<>150은 비트로 <code>10010110</code>입니다. 8비트에는 그대로 담기지만, 2의 보수로 읽으면 맨 왼쪽 비트가 −128이므로 −128 + 22 = −106입니다. 하드웨어는 최댓값에서 멈추거나 오류를 내지 않고 그림 2의 바퀴처럼 한 바퀴 돌아갑니다. 150 − 256 = −106으로 계산해도 됩니다.</>}
      />
    </>
  );
}

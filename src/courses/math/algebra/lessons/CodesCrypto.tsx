import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { bruteLog, ecPoints, generator, multiples, powMod, powModCount, ptStr, realAdd, realPoint, rsDecode, rsEncode, type SymbolState } from './crypto';
import './algebra.css';
import './codes.css';

/* ─────────────── Figure 1: Reed–Solomon over GF(17) ─────────────── */

const P_RS = 17;
const N_RS = 8;
const K_RS = 4;
const MSG0 = [7, 2, 11, 5];

function RsFigure() {
  const [msg, setMsg] = useState(MSG0);
  const [state, setState] = useState<SymbolState[]>(Array(N_RS).fill('ok'));
  const cw = useMemo(() => rsEncode(msg, N_RS, P_RS), [msg]);
  // a wrong symbol is shifted by a fixed nonzero amount that depends on its position
  const received = cw.map((v, i) => (state[i] === 'erased' ? null : state[i] === 'wrong' ? (v + 3 + i) % P_RS : v));
  const dec = useMemo(() => rsDecode(received, K_RS, P_RS), [received.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = state.filter((x) => x === 'erased').length;
  const e = state.filter((x) => x === 'wrong').length;
  const ok = dec.msg !== null && dec.msg.every((v, i) => v === msg[i]);

  const cycle = (i: number) => setState((st) => st.map((x, j) => (j !== i ? x : x === 'ok' ? 'erased' : x === 'erased' ? 'wrong' : 'ok')));
  const preset = (er: number[], wr: number[]) => setState(Array.from({ length: N_RS }, (_, i) => (er.includes(i) ? 'erased' : wr.includes(i) ? 'wrong' : 'ok')));
  const bump = (i: number, d: number) => setMsg((m) => m.map((v, j) => (j === i ? (v + d + P_RS) % P_RS : v)));

  let verdict: string;
  if (dec.msg === null && N_RS - s < K_RS) verdict = `남은 칸이 ${N_RS - s}개뿐입니다. 차수 3 이하의 다항식을 정하려면 적어도 ${K_RS}개의 값이 필요합니다.`;
  else if (dec.msg === null) verdict = `가장 가까운 다항식도 남은 칸 중 ${dec.corrected}칸과 어긋납니다. 2·${dec.corrected} + ${s} = ${2 * dec.corrected + s}이 n − k = ${N_RS - K_RS}보다 커서, 답이 하나로 정해진다는 보장이 없으므로 복원을 거부합니다.`;
  else if (ok) verdict = `복원 성공. ${s ? `지운 칸 ${s}개` : ''}${s && dec.corrected ? '와 ' : ''}${dec.corrected ? `틀린 칸 ${dec.corrected}개(노란 테두리)` : ''}${!s && !dec.corrected ? '손상이 없어 그대로 읽었습니다' : '를 넘어 원래 메시지를 되찾았습니다'}. 2e + s = ${2 * e + s} ≤ ${N_RS - K_RS}.`;
  else verdict = `복원한 메시지가 원래와 다릅니다. 틀린 칸이 너무 많아 다른 다항식이 더 가까워졌습니다.`;

  return (
    <Figure
      no={1}
      title="리드-솔로몬 부호: 8칸 중 4칸이 망가져도"
      hint="보낸 칸을 눌러 지우거나(점선) 틀리게(빨강) 만들어 보세요"
      caption={
        <>
          계산은 모두 GF(17), 곧 17로 나눈 나머지로 합니다. 메시지 4개를 다항식 m(x) = m₀ + m₁x + m₂x² + m₃x³의 계수로 보고, x = 1, 2, …, 8에서의 값 8개를 보냅니다. 받는 쪽은 망가진 칸을 모른 채 남은 칸을 가장 잘 맞추는 차수 3 이하의 다항식을 찾습니다. 여기서는 남은 칸 중 4개를 고르는 모든 경우를 시도하고, 실제 장치는 같은 답을 훨씬 빨리 찾는 알고리즘을 씁니다.
        </>
      }
    >
      <div className="cc-row">
        <span className="lbl">메시지 (계수)</span>
        <div className="cc-cells">
          {msg.map((v, i) => (
            <span key={i} className="cc-stepper">
              <button type="button" onClick={() => bump(i, 1)} aria-label={`m${i}을 1 키우기`}>
                ▲
              </button>
              <span className="cc-cell">
                <small>m{i}</small>
                {v}
              </span>
              <button type="button" onClick={() => bump(i, -1)} aria-label={`m${i}을 1 줄이기`}>
                ▼
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="cc-row">
        <span className="lbl">보낸 값 m(1)…m(8)</span>
        <div className="cc-cells">
          {cw.map((v, i) => (
            <button key={i} type="button" className="cc-cell" data-s={state[i]} onClick={() => cycle(i)} aria-label={`x = ${i + 1}의 값 ${v}, 지금 ${state[i] === 'ok' ? '정상' : state[i] === 'erased' ? '지워짐' : '틀림'}. 눌러서 바꾸기`}>
              <small>{i + 1}</small>
              {state[i] === 'erased' ? '?' : received[i]}
            </button>
          ))}
        </div>
      </div>
      <div className="cc-row">
        <span className="lbl">받는 쪽이 복원한 메시지</span>
        <div className="cc-cells" aria-live="polite">
          {Array.from({ length: K_RS }, (_, i) => (
            <span key={i} className="cc-cell" data-good={(dec.msg && ok) || undefined} data-bad={(dec.msg && !ok) || undefined}>
              <small>m{i}</small>
              {dec.msg ? dec.msg[i] : '–'}
            </span>
          ))}
        </div>
      </div>
      <div className="btn-row">
        <Button small onClick={() => preset([], [])}>
          모두 정상
        </Button>
        <Button small onClick={() => preset([1, 4, 6, 7], [])}>
          4칸 지우기
        </Button>
        <Button small onClick={() => preset([], [2, 5])}>
          2칸 틀리게
        </Button>
        <Button small onClick={() => preset([5, 6], [2])}>
          1칸 틀리고 2칸 지움
        </Button>
        <Button small onClick={() => preset([], [0, 2, 5])}>
          3칸 틀리게
        </Button>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="지운 칸 s" value={s} />
        <Readout label="틀린 칸 e" value={e} color={e ? 'var(--bad)' : undefined} />
        <Readout label="2e + s ≤ n − k = 4?" value={`${2 * e + s} ${2 * e + s <= N_RS - K_RS ? '≤' : '>'} 4`} color={2 * e + s <= N_RS - K_RS ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <div className="ag-note" data-bad={!ok || undefined} aria-live="polite">
        {verdict}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: powers mod p look random ─────────────── */

const P_LOG = 101;
const LOG_PRIMES = [101, 1019, 10007, 100003, 1000003];

function DlogFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'exp' | 'lin'>('exp');
  const g = 2;
  const pts = useMemo(() => Array.from({ length: P_LOG - 1 }, (_, x) => [x, mode === 'exp' ? powMod(g, x, P_LOG) : (g * x) % P_LOG] as const), [mode]);
  const table = useMemo(
    () =>
      LOG_PRIMES.map((p) => {
        const gg = generator(p);
        const xTrue = Math.floor(p * 0.73);
        const h = powMod(gg, xTrue, p);
        const bl = bruteLog(gg, h, p);
        return { p, g: gg, x: bl.x, h, steps: bl.steps, mults: powModCount(gg, bl.x, p).mults, bits: Math.ceil(Math.log2(p)) };
      }),
    [],
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 100, yMin: 0, yMax: 101, pad: { l: 40, r: 12, t: 12, b: 30 } });
      p.grid({ xStep: 20, yStep: 20, xLabel: 'x', yLabel: mode === 'exp' ? '2^x mod 101' : '2x mod 101' });
      for (const [x, y] of pts) p.dot(x, y, 3, mode === 'exp' ? P.accent : P.ink2);
    },
    [P, pts, mode],
    { aspect: 1.7, maxHeight: 320 },
  );

  return (
    <Figure
      no={2}
      title="거듭제곱은 쉽고, 거꾸로 찾기는 어렵다"
      hint="곱셈과 거듭제곱을 바꿔 보세요"
      caption={
        <>
          위 그림은 x = 0부터 99까지 2x를 101로 나눈 나머지와 2<sup>x</sup>을 101로 나눈 나머지를 점으로 찍은 것입니다. 아래 표는 소수 p마다 g<sup>x</sup> = h를 만족하는 x를 하나씩 대입해 찾는 데 걸린 횟수(이산 로그)와, 그 x로 g<sup>x</sup>을 제곱과 곱셈으로 계산하는 데 든 곱셈 횟수를 비교합니다. x는 p의 약 73% 자리에 두었습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={setMode} options={[{ value: 'exp', label: '2^x mod 101 (거듭제곱)' }, { value: 'lin', label: '2x mod 101 (곱셈)' }]} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={mode === 'exp' ? '2의 x제곱을 101로 나눈 나머지를 찍은 점들이 0부터 100 사이에 규칙 없이 흩어져 있습니다.' : '2x를 101로 나눈 나머지를 찍은 점들이 기울기 2인 두 줄의 직선 위에 놓입니다.'}>
        <canvas ref={canvasRef} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl" aria-label="소수 크기별 거듭제곱과 이산 로그의 비용">
          <thead>
            <tr>
              <th>p</th>
              <th>비트</th>
              <th>g</th>
              <th>찾은 x</th>
              <th>하나씩 대입한 횟수</th>
              <th>g^x 계산에 든 곱셈</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.p}>
                <td className="mono">{r.p.toLocaleString('ko-KR')}</td>
                <td className="mono">{r.bits}</td>
                <td className="mono">{r.g}</td>
                <td className="mono">{r.x.toLocaleString('ko-KR')}</td>
                <td className="mono">{r.steps.toLocaleString('ko-KR')}</td>
                <td className="mono">{r.mults}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Diffie–Hellman ─────────────── */

const P_DH = 227;
const G_DH = 2;
const B_DH = 83;

function DhFigure() {
  const [a, setA] = useState(19);
  const A = powMod(G_DH, a, P_DH);
  const B = powMod(G_DH, B_DH, P_DH);
  const sA = powMod(B, a, P_DH);
  const sB = powMod(A, B_DH, P_DH);
  const eve = bruteLog(G_DH, A, P_DH);

  return (
    <Figure
      no={3}
      title="디피-헬먼 키 교환"
      hint="여러분이 앨리스입니다. 비밀 수 a를 골라 보세요"
      caption={
        <>
          p = {P_DH}, g = {G_DH}는 모두에게 공개된 값이고, g는 1부터 {P_DH - 1}까지를 모두 지나는 원시원소입니다. 밥의 비밀 b = {B_DH}는 고정해 두었습니다. 빨간 값은 각자만 아는 비밀, 파란 값은 네트워크에 오가는 공개 값, 초록 값은 두 사람이 따로 계산해 얻는 공유 비밀입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="cc-a" label="앨리스의 비밀 a" value={a} min={2} max={P_DH - 2} step={1} onChange={setA} />
      </div>
      <div className="cc-dh">
        <div className="cc-party">
          <h4>앨리스</h4>
          <span className="secret mono">a = {a}</span>
          <span className="pub mono">
            A = {G_DH}^{a} mod {P_DH} = {A}
          </span>
          <span className="mono">받은 B = {B}</span>
          <span className="key mono">
            B^a mod {P_DH} = {sA}
          </span>
        </div>
        <div className="cc-party">
          <h4>밥</h4>
          <span className="secret mono">b = {B_DH}</span>
          <span className="pub mono">
            B = {G_DH}^{B_DH} mod {P_DH} = {B}
          </span>
          <span className="mono">받은 A = {A}</span>
          <span className="key mono">
            A^b mod {P_DH} = {sB}
          </span>
        </div>
        <div className="cc-party" data-eve="">
          <h4>엿듣는 이브</h4>
          <span className="pub mono">
            p = {P_DH}, g = {G_DH}, A = {A}, B = {B}
          </span>
          <span className="mono">
            A에서 a를 찾으려 {G_DH}^0, {G_DH}^1, …을 차례로 계산
          </span>
          <span className="secret mono">
            {eve.steps}번 만에 a = {eve.x}
          </span>
        </div>
      </div>
      <div className="ag-note" aria-live="polite">
        두 사람이 얻은 값은 둘 다 {sA}입니다. 앨리스는 (g<sup>b</sup>)<sup>a</sup>을, 밥은 (g<sup>a</sup>)<sup>b</sup>을 계산했고 둘 다 g<sup>ab</sup>이기 때문입니다. 이브는 이 작은 p에서는 {eve.steps}번 만에 a를 찾았습니다{a < 30 ? '. a가 작을수록 일찍 찾힙니다' : ''}.
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: elliptic curves ─────────────── */

const RA = -1;
const RB = 1;
const X_MIN = -1.32; // y² = x³ − x + 1 is defined for x ≥ −1.3247
const EC = { a: 2, b: 2, p: 17 };
const GEN = { x: 5, y: 1 };

function EcFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'real' | 'finite'>('real');
  const [xP, setXP] = useState(-1);
  const [xQ, setXQ] = useState(1);
  const [lowQ, setLowQ] = useState(false);
  const [tangent, setTangent] = useState(false);
  const [k, setK] = useState(1);

  const Pp = realPoint(RA, RB, xP, true)!;
  const Qp = tangent ? Pp : realPoint(RA, RB, xQ, !lowQ)!;
  const add = realAdd(RA, Pp, Qp);
  const pts = useMemo(() => ecPoints(EC), []);
  const mult = useMemo(() => multiples(EC, GEN), []);
  const kP = mult[k - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (mode === 'real') {
        const p = new Plot(ctx, w, h, P, { xMin: -2.4, xMax: 3.2, yMin: -4.2, yMax: 4.2, pad: { l: 34, r: 12, t: 12, b: 26 } });
        p.grid({ xStep: 1, yStep: 2 });
        const r = (x: number) => x * x * x + RA * x + RB;
        const x0 = -1.32472;
        p.fn((x) => Math.sqrt(Math.max(0, r(x))), P.ink, 2.5, { from: x0, to: 3.2, samples: 600 });
        p.fn((x) => -Math.sqrt(Math.max(0, r(x))), P.ink, 2.5, { from: x0, to: 3.2, samples: 600 });
        if (add.m !== null && add.third && add.sum) {
          p.clip();
          p.slopeLine(Pp.x, Pp.y, add.m, alpha(P.accent, 0.8), 1.8);
          p.unclip();
          p.line(add.third.x, add.third.y, add.sum.x, add.sum.y, alpha(P.ink3, 0.8), 1.2, [4, 4]);
          p.dot(add.third.x, add.third.y, 5, P.surface, P.ink3, 2);
          p.dot(add.sum.x, add.sum.y, 7, P.good);
          p.text('P + Q', add.sum.x, add.sum.y, P.good, { dx: 10, dy: 0, font: `700 12px ${P.fontBody}`, bg: P.surface });
        } else {
          p.line(Pp.x, -4.2, Pp.x, 4.2, alpha(P.accent, 0.8), 1.8);
          p.text('P + Q = O (무한원점)', Pp.x, 3.6, P.good, { dx: 8, font: `700 12px ${P.fontBody}`, bg: P.surface });
        }
        p.dot(Pp.x, Pp.y, 7, P.accent);
        p.text('P', Pp.x, Pp.y, P.accent, { dx: -14, dy: -12, font: `700 12px ${P.fontBody}`, bg: P.surface });
        if (!tangent) {
          p.dot(Qp.x, Qp.y, 7, P.accent);
          p.text('Q', Qp.x, Qp.y, P.accent, { dx: 10, dy: -12, font: `700 12px ${P.fontBody}`, bg: P.surface });
        }
      } else {
        const p = new Plot(ctx, w, h, P, { xMin: -0.8, xMax: 16.8, yMin: -0.8, yMax: 16.8, pad: { l: 30, r: 12, t: 12, b: 26 } });
        p.grid({ xStep: 2, yStep: 2 });
        for (const q of pts) p.dot(q.x, q.y, 4, alpha(P.ink3, 0.6));
        for (let i = 0; i < k; i++) {
          const q = mult[i];
          if (!q) continue;
          p.dot(q.x, q.y, i === k - 1 ? 8 : 5, i === k - 1 ? P.accent : alpha(P.accent, 0.45));
        }
        if (kP) p.text(`${k}P = ${ptStr(kP)}`, kP.x, kP.y, P.accent, { dx: 10, dy: -12, font: `700 12px ${P.fontBody}`, bg: P.surface });
        else p.text(`${k}P = O (무한원점)`, 8, 16, P.good, { font: `700 13px ${P.fontBody}`, bg: P.surface, align: 'center' });
      }
    },
    [P, mode, Pp.x, Pp.y, Qp.x, Qp.y, add.m, k, pts, mult, kP, tangent],
    { aspect: 1.25, maxHeight: 420 },
  );

  const realNote =
    add.sum === null
      ? 'P와 Q가 위아래로 마주 보아 직선이 세로선이 됩니다. 곡선과 세 번째로 만나는 점이 없으므로, 이때의 합을 무한원점 O로 정합니다. O는 이 군의 항등원입니다.'
      : `직선 ${tangent ? '(P에서의 접선)' : 'PQ'}의 기울기는 ${add.m!.toFixed(3)}이고 곡선과 세 번째로 (${add.third!.x.toFixed(3)}, ${add.third!.y.toFixed(3)})에서 만납니다. 이 점을 x축에 대해 뒤집은 (${add.sum.x.toFixed(3)}, ${add.sum.y.toFixed(3)})가 P + Q입니다.`;

  return (
    <Figure
      no={4}
      title="타원곡선 위의 덧셈"
      hint="실수 곡선에서 점을 옮기고, 유한체 곡선에서 k를 바꿔 보세요"
      caption={
        mode === 'real' ? (
          <>
            실수 위의 곡선 y² = x³ − x + 1입니다. 두 점 P, Q(파랑)를 지나는 직선은 곡선과 한 번 더 만나고(속이 빈 점), 그 점을 x축에 대해 뒤집은 것(초록)을 P + Q로 정의합니다. P와 Q가 같으면 접선을 씁니다.
          </>
        ) : (
          <>
            같은 덧셈 공식을 GF(17)에서 계산한 곡선 y² = x³ + 2x + 2입니다. 회색 점은 곡선 위의 점 18개이고, 무한원점 O를 더하면 19개입니다. P = (5, 1)에서 시작해 P를 거듭 더한 점들을 파랑으로 표시하고, 가장 최근 점을 크게 그립니다.
          </>
        )
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={setMode} options={[{ value: 'real', label: '실수 위의 곡선' }, { value: 'finite', label: 'GF(17) 위의 곡선' }]} />
        {mode === 'real' ? (
          <>
            <Slider id="cc-xp" label="P의 x" value={xP} min={X_MIN} max={2.6} step={0.01} onChange={setXP} format={(v) => v.toFixed(2)} />
            {!tangent && <Slider id="cc-xq" label="Q의 x" value={xQ} min={X_MIN} max={2.6} step={0.01} onChange={setXQ} format={(v) => v.toFixed(2)} />}
            {!tangent && <Check label="Q를 아래쪽에" checked={lowQ} onChange={setLowQ} />}
            <Check label="Q = P (접선)" checked={tangent} onChange={setTangent} />
          </>
        ) : (
          <Slider id="cc-k" label="k" value={k} min={1} max={mult.length} step={1} onChange={setK} />
        )}
      </div>
      <div
        ref={wrapRef}
        className="canvas-box"
        role="img"
        aria-label={mode === 'real' ? `실수 타원곡선 위에서 P = (${Pp.x.toFixed(2)}, ${Pp.y.toFixed(2)})와 Q = (${Qp.x.toFixed(2)}, ${Qp.y.toFixed(2)})를 더하는 그림. ${realNote}` : `GF(17) 위의 타원곡선 점 18개와 무한원점. P = (5, 1)의 ${k}배는 ${ptStr(kP)}입니다.`}
      >
        <canvas ref={canvasRef} />
      </div>
      {mode === 'real' ? (
        <div className="ag-note" aria-live="polite">
          {realNote}
        </div>
      ) : (
        <div className="ag-note" aria-live="polite">
          {k}P = {ptStr(kP)}.{' '}
          {kP === null ? `${k}번 더하자 항등원 O로 돌아왔습니다. 점의 개수 19가 소수이므로 O가 아닌 어떤 점에서 시작해도 19개를 모두 지납니다.` : `지금까지 ${k}개의 서로 다른 점을 지났습니다. 다음 점을 계산하는 데는 덧셈 한 번이면 되지만, ${ptStr(kP)}만 보고 k를 알아내려면 처음부터 더해 보는 수밖에 없습니다.`}
        </div>
      )}
      {mode === 'real' && (
        <Legend
          items={[
            { color: 'var(--accent)', label: 'P, Q와 직선', shape: 'dot' },
            { color: 'var(--ink-3)', label: '세 번째 교점', shape: 'dot' },
            { color: 'var(--good)', label: 'P + Q', shape: 'dot' },
          ]}
        />
      )}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function CodesCrypto() {
  return (
    <>
      <h2>망가진 데이터를 되살리는 다항식</h2>
      <p>
        긁힌 CD가 그대로 재생되고, 귀퉁이가 찢긴 QR 코드가 읽히고, 먼 우주 탐사선이 보낸 사진이 잡음 속에서 복원됩니다. 이 기술들의 바탕에는 앞 장에서 만든 유한체와 그 위의 다항식이 있습니다. 가장 널리 쓰이는 것이 1960년 리드(Irving Reed)와 솔로몬(Gustave Solomon)이 만든 <T en="Reed–Solomon code">리드-솔로몬 부호</T>입니다.
      </p>
      <p>
        생각은 단순합니다. 보낼 메시지 <M>k</M>개를 차수가 <M>k</M>보다 작은 다항식의 계수로 보고, 그 다항식의 값을 <M>n</M>개의 점에서 계산해 보냅니다(<M>{'n > k'}</M>). 다항식 하나는 서로 다른 점 <M>k</M>개의 값만 알면 완전히 정해지므로, 나머지 <M>{'n - k'}</M>개는 여분입니다. 계산을 실수가 아니라 유한체에서 하는 이유는 값이 정확히 한정된 비트로 표현되고, 반올림 오차가 없기 때문입니다.
      </p>
      <RsFigure />
      <p>
        처음 메시지 (7, 2, 11, 5)는 다항식 <M>{'7 + 2x + 11x^2 + 5x^3'}</M>이고, x = 1부터 8에서의 값은 GF(17)에서 8, 10, 9, 1, 16, 16, 14, 6입니다. <strong>4칸 지우기</strong>를 누르면 남은 4칸만으로 다항식이 하나로 정해져 메시지가 그대로 돌아옵니다. 어느 칸이 지워졌는지 아는 경우를 <T en="erasure">소거</T>라고 합니다. <strong>2칸 틀리게</strong>는 더 어렵습니다. 받는 쪽은 어느 칸이 틀렸는지 모르기 때문입니다. 그래도 남은 8칸 중 6칸과 맞는 다항식은 원래 다항식 하나뿐이어서, 틀린 2칸을 찾아내고 고칩니다. 이 그림의 복호기는 4칸을 고르는 70가지 경우를 모두 시도해 이것을 확인합니다.
      </p>
      <p>
        <strong>3칸 틀리게</strong>를 누르면 복원을 거부합니다. 이번에는 원래와 다른 다항식도 8칸 중 3칸만 어긋나서, 어느 쪽이 진짜인지 정할 수 없기 때문입니다. 지운 칸이 <M>s</M>개, 틀린 칸이 <M>e</M>개일 때 답이 하나로 정해지는 조건은 다음과 같습니다.
      </p>
      <MB note="n은 보낸 값의 수, k는 메시지 길이. 이 그림에서는 n − k = 4이므로 소거 4개, 오류 2개, 또는 오류 1개와 소거 2개까지 고칠 수 있습니다.">{String.raw`2e + s \le n - k`}</MB>
      <p>이 조건은 다항식에 관한 단순한 사실 하나에서 나옵니다.</p>
      <div className="cc-proof">
        <b>정리.</b> 체 위에서 차수가 <M>k</M>보다 작은 서로 다른 두 다항식은 <M>n</M>개의 점 중 많아야 <M>{'k - 1'}</M>개에서만 같은 값을 가집니다. 따라서 두 부호어는 적어도 <M>{'n - k + 1'}</M>칸에서 다릅니다.
        <p style={{ marginTop: 8 }}>
          <b>증명.</b> 두 다항식 <M>f</M>, <M>g</M>가 서로 다르면 <M>{'h = f - g'}</M>는 0이 아니고 차수가 <M>k</M>보다 작습니다. <M>f</M>와 <M>g</M>가 같은 값을 갖는 점 <M>a</M>는 <M>h</M>의 근이고, 인수 정리에 따라 <M>h</M>는 <M>{'(x - a)'}</M>로 나누어떨어집니다. 체에는 영인자가 없으므로 서로 다른 근 <M>{'a_1, \\dots, a_r'}</M>이 있으면 <M>{'(x - a_1)\\cdots(x - a_r)'}</M>이 <M>h</M>를 나누고, 차수를 비교하면 <M>{'r \\le \\deg h \\le k - 1'}</M>입니다. <span className="cc-qed">∎</span>
        </p>
      </div>
      <p>
        받은 값이 원래 부호어에서 <M>{'e'}</M>칸, 다른 부호어에서 <M>{'e\''}</M>칸 떨어져 있다면, 지워지지 않은 칸에서 두 부호어는 많아야 <M>{"e + e'"}</M>칸 다릅니다. 그런데 정리에 따라 두 부호어는 지워지지 않은 칸에서도 <M>{'n - k + 1 - s'}</M>칸 이상 달라야 하므로, <M>{'2e + s \\le n - k'}</M>이면 원래 부호어보다 가깝거나 같은 다른 부호어는 있을 수 없습니다.
      </p>
      <Callout kind="note">
        실제 리드-솔로몬 부호는 GF(2⁸)에서 계산해 한 칸이 1바이트입니다. CD는 부호 두 개를 겹쳐 써서 수천 비트가 연속으로 긁혀도 복원하고, QR 코드는 오류 정정 수준을 골라 코드의 약 7%에서 30%까지 가려져도 읽히게 합니다. 이 장의 복호기는 경우를 모두 시도하지만, 실제 장치는 벌캄프-웰치나 벌캄프-매시 알고리즘으로 연립방정식을 풀어 같은 답을 빠르게 얻습니다.
      </Callout>

      <h2>거꾸로 풀기 어려운 거듭제곱</h2>
      <p>
        이제 군을 암호에 씁니다. 소수 <M>p</M>로 나눈 나머지 중 0이 아닌 수들은 곱셈에 대해 군 <M>{'(\\mathbb{Z}/p)^\\times'}</M>을 이룹니다. 이 군에는 원시원소 <M>g</M>가 있어서, 모든 원소를 <M>{'g^x'}</M>로 쓸 수 있습니다. <M>x</M>가 주어지면 <M>{'g^x \\bmod p'}</M>은 제곱을 거듭해 곱셈 수십 번으로 계산됩니다. 반대로 <M>{'h = g^x'}</M>이 주어졌을 때 <M>x</M>를 찾는 문제를 <T en="discrete logarithm">이산 로그</T> 문제라고 합니다.
      </p>
      <DlogFigure />
      <p>
        곱셈 2x mod 101은 그림에서 두 줄의 직선을 이룹니다. 값을 보고 x를 되찾는 것은 2의 역원을 곱하면 끝납니다. 거듭제곱 2<sup>x</sup> mod 101은 아무 규칙 없이 흩어진 것처럼 보이고, x를 되찾을 지름길이 눈에 띄지 않습니다. 표에서 p가 101일 때는 x = 73을 찾는 데 74번이 걸리지만 거듭제곱 계산은 곱셈 9번이면 됩니다. p가 1,000,003이면 하나씩 대입해 730,003번이 걸리고, 거듭제곱은 곱셈 28번입니다. p가 열 배 커질 때 대입 횟수는 열 배씩 늘고, 거듭제곱 비용은 비트 수에 비례해 조금씩만 늘어납니다.
      </p>
      <p>
        하나씩 대입하는 것보다 나은 방법(아기 걸음 거인 걸음, 지수 계산법 등)도 있지만, 지금까지 알려진 방법은 모두 비트 수가 커지면 거듭제곱보다 훨씬 빨리 어려워집니다. 실제 시스템은 2,048비트 이상의 <M>p</M>를 씁니다. 이 차이가 공개 키 암호를 가능하게 합니다.
      </p>

      <h2>디피-헬먼: 엿듣는 사람 앞에서 비밀 정하기</h2>
      <p>
        1976년 디피(Whitfield Diffie)와 헬먼(Martin Hellman)은 처음 만난 두 사람이 모두가 엿듣는 통로에서 공통의 비밀 수를 정하는 방법을 발표했습니다. 앨리스와 밥은 공개된 <M>p</M>와 <M>g</M>를 쓰고, 각자 비밀 수 <M>a</M>, <M>b</M>를 고릅니다. 앨리스는 <M>{'A = g^a'}</M>를, 밥은 <M>{'B = g^b'}</M>를 보내고, 받은 값을 자기 비밀로 한 번 더 거듭제곱합니다.
      </p>
      <MB>{String.raw`B^a = (g^b)^a = g^{ab} = (g^a)^b = A^b \pmod p`}</MB>
      <DhFigure />
      <p>
        처음 설정(a = 19)에서 앨리스는 A = 145를, 밥은 B = 98을 보내고, 두 사람은 같은 값 149를 얻습니다. 이브가 아는 것은 p, g, A, B뿐이고, 비밀을 알려면 A에서 a를 찾는 이산 로그를 풀어야 합니다. 이 작은 예에서는 a가 작아서 20번 만에 찾지만, 실제로는 수백 자리의 p와 그만큼 큰 무작위 비밀을 쓰기 때문에 같은 방법으로는 우주의 나이가 걸려도 끝나지 않습니다. 이렇게 정한 비밀을 대칭 암호의 열쇠로 씁니다. 공개 키 암호와 인증서는 <a href={lessonHref('net-security', 'public-key')}>네트워크 보안의 공개 키와 인증서</a> 장에서 다뤘습니다.
      </p>
      <Callout kind="warn">
        디피-헬먼만으로는 상대가 정말 밥인지 알 수 없습니다. 중간에서 이브가 앨리스에게는 밥인 척, 밥에게는 앨리스인 척하며 양쪽과 따로 키를 정하면 모든 대화를 읽을 수 있습니다. 그래서 실제 프로토콜(TLS 등)은 교환한 값에 전자 서명을 붙여 상대를 확인합니다.
      </Callout>

      <h2>타원곡선: 더 작은 수로 같은 안전을</h2>
      <p>
        이산 로그가 어려운 군이면 무엇이든 디피-헬먼에 쓸 수 있습니다. 오늘날 가장 많이 쓰는 것은 <T en="elliptic curve">타원곡선</T> 위의 점들이 이루는 군입니다. 곡선 <M>{'y^2 = x^3 + ax + b'}</M> 위의 두 점을 잇는 직선은 곡선과 한 번 더 만나는데, 그 점을 뒤집은 것을 두 점의 합으로 정합니다. 이 연산은 결합법칙을 만족하고(증명은 길어서 생략합니다), 항등원은 세로 방향 무한히 먼 곳에 있는 무한원점 <M>O</M>입니다.
      </p>
      <EcFigure />
      <p>
        실수 곡선에서 P = (−1, 1), Q = (1, 1)이면 두 점을 잇는 직선 y = 1이 곡선과 (0, 1)에서 다시 만나고, 이것을 뒤집은 (0, −1)이 P + Q입니다. 같은 공식을 GF(17)에서 계산하면 곡선은 점 18개와 O로 이루어진 위수 19의 군이 됩니다. P = (5, 1)에서 시작해 2P = (6, 3), …, 9P = (7, 6), 10P = (7, 11)로 이어지고, 18P = (5, 16) = −P, 19P = O에서 처음으로 돌아옵니다. 19가 소수이므로 라그랑주 정리에 따라 O가 아닌 모든 점이 생성원입니다.
      </p>
      <p>
        kP는 두 배 하기와 더하기를 섞어 덧셈 수십 번으로 계산되지만, 점 kP만 보고 k를 찾는 타원곡선 이산 로그 문제에는 정수의 경우보다도 빠른 방법이 알려져 있지 않습니다. 그래서 256비트 정도의 타원곡선이 2,048비트 이상의 정수 디피-헬먼과 비슷한 안전성을 냅니다. 지금 이 페이지를 받아 온 HTTPS 연결도 대부분 이런 곡선(P-256이나 Curve25519)으로 키를 교환했을 것입니다.
      </p>

      <Callout kind="key">
        리드-솔로몬 부호는 메시지를 유한체 위 다항식의 계수로 보고 여러 점의 값을 보냅니다. 서로 다른 두 다항식은 많아야 k − 1개 점에서만 같으므로, 2e + s ≤ n − k이면 틀린 칸 e개와 지운 칸 s개를 넘어 메시지를 되찾습니다. 한편 유한한 군에서 거듭제곱은 빠르게 계산되지만 거꾸로 지수를 찾는 이산 로그는 어렵고, 디피-헬먼 키 교환은 이 비대칭을 써서 엿듣는 통로에서 공통의 비밀을 정합니다. 타원곡선 위의 점들도 군을 이루며, 더 작은 수로 같은 안전성을 줍니다.
      </Callout>
      <Quiz
        q="리드-솔로몬 부호로 메시지 10개를 값 16개로 보낸다(k = 10, n = 16). 어느 칸이 망가졌는지 모를 때 확실히 고칠 수 있는 틀린 칸의 최대 개수는?"
        options={['6개', '3개', '10개', '16개']}
        answer={1}
        explain={
          <>
            지운 칸이 없으면 조건은 <M>{'2e \\le n - k = 6'}</M>이므로 e는 3까지입니다. 위치를 아는 소거라면 6칸까지 되살릴 수 있지만, 위치를 모르는 오류는 찾는 데도 여분을 쓰기 때문에 그 절반만 고칠 수 있습니다.
          </>
        }
      />
    </>
  );
}

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { GATES, bitsOf, fullAdder, rippleTrace, type GateId } from './bits';
import { Dot, Gate, Lamp, Wire, outX } from './svg';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';

/** Make a table row act like a button. */
const rowKeys = (go: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    go();
  }
};

/* ─────────────── Figure 1: one gate and its truth table ─────────────── */

const GATE_IDS = Object.keys(GATES) as GateId[];

function GateFigure() {
  const P = usePalette();
  const [g, setG] = useState<GateId>('and');
  const [a, setA] = useState(1);
  const [b, setB] = useState(0);
  const G = GATES[g];
  const unary = !!G.unary;
  const out = G.f(a, unary ? 0 : b);
  const rows = unary ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  const ox = outX(g, 130);

  return (
    <Figure
      no={1}
      title="게이트 하나와 진리표"
      hint="입력을 누르거나 표의 줄을 눌러 보세요"
      caption={<>왼쪽 동그라미가 입력, 오른쪽이 출력입니다. 1이 흐르는 선은 주황색으로 굵게 그렸습니다. 진리표는 가능한 모든 입력과 그때의 출력을 적은 표로, 게이트의 뜻은 이 표가 전부입니다. 노란 줄이 지금 입력입니다.</>}
    >
      <Seg label="게이트" value={g} onChange={setG} options={GATE_IDS.map((k) => ({ value: k, label: GATES[k].name }))} />
      <div className="fig-split">
        <div className="gate-svg">
          <svg viewBox="0 0 300 120" role="img" aria-label={`${G.name} 게이트: 입력 A=${a}${unary ? '' : `, B=${b}`}, 출력 ${out}`}>
            {unary ? (
              <Wire d={`M41 60 H130`} on={!!a} P={P} />
            ) : (
              <>
                <Wire d="M41 42 H100 V51 H130" on={!!a} P={P} />
                <Wire d="M41 78 H100 V69 H130" on={!!b} P={P} />
              </>
            )}
            <Gate kind={g} x={130} y={60} P={P} on={!!out} label={false} />
            <Wire d={`M${ox} 60 H241`} on={!!out} P={P} />
            {unary ? <Lamp x={30} y={60} v={a} P={P} name="A" side="top" onClick={() => setA(1 - a)} /> : (
              <>
                <Lamp x={30} y={42} v={a} P={P} name="A" side="top" onClick={() => setA(1 - a)} />
                <Lamp x={30} y={78} v={b} P={P} name="B" side="bottom" onClick={() => setB(1 - b)} />
              </>
            )}
            <Lamp x={252} y={60} v={out} P={P} name="출력" side="top" r={12} />
            <text x={152} y={104} textAnchor="middle" fontFamily={P.fontMono} fontSize={13} fontWeight={700} fill={P.ink}>
              {G.name}
            </text>
          </svg>
          <div className="btn-row" role="group" aria-label="입력">
            <button type="button" className="lamp-btn" aria-pressed={!!a} onClick={() => setA(1 - a)}>
              A = {a}
            </button>
            {!unary && (
              <button type="button" className="lamp-btn" aria-pressed={!!b} onClick={() => setB(1 - b)}>
                B = {b}
              </button>
            )}
          </div>
        </div>
        <div className="controls">
          <table className="tbl tt">
            <thead>
              <tr>
                <th>A</th>
                {!unary && <th>B</th>}
                <th>출력</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([x, y]) => {
                const cur = x === a && (unary || y === b);
                const go = () => {
                  setA(x);
                  if (!unary) setB(y);
                };
                return (
                  <tr key={`${x}${y}`} data-cur={cur || undefined} tabIndex={0} onClick={go} onKeyDown={rowKeys(go)} aria-label={`입력 A=${x}${unary ? '' : `, B=${y}`}로 바꾸기`}>
                    <td>{x}</td>
                    {!unary && <td>{y}</td>}
                    <td className="o" data-one={G.f(x, y) || undefined}>
                      {G.f(x, y)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="뜻" value={<span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)' }}>{G.says}</span>} />
            <Readout label="JavaScript로 쓰면 (a, b가 0 또는 1일 때)" value={G.js} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: half adder and full adder ─────────────── */

function AdderCircuitFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'half' | 'full'>('half');
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [c, setC] = useState(0);
  const full = mode === 'full';
  const cin = full ? c : 0;
  const fa = fullAdder(a, b, cin);
  const s = full ? fa.s : a ^ b;
  const cout = full ? fa.cout : a & b;
  const rows = full ? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [(k >> 2) & 1, (k >> 1) & 1, k & 1]) : [0, 1, 2, 3].map((k) => [(k >> 1) & 1, k & 1, 0]);
  const H = full ? 250 : 165;

  return (
    <Figure
      no={2}
      title={full ? '전가산기: 자리올림까지 더하기' : '반가산기: 1비트 두 개 더하기'}
      hint="입력을 눌러 모든 경우를 확인해 보세요"
      caption={
        full ? (
          <>전가산기는 반가산기 두 개와 OR 게이트 하나입니다. 첫 반가산기가 A + B를, 두 번째 반가산기가 그 결과에 아랫자리에서 올라온 C<sub>in</sub>을 더합니다. 두 반가산기 중 어느 쪽에서든 자리올림이 나면 C<sub>out</sub>이 1입니다. 출력은 언제나 A + B + C<sub>in</sub> = 2 × C<sub>out</sub> + S를 만족합니다.</>
        ) : (
          <>1비트 둘을 더하면 결과는 0, 1, 2(2진수로 10) 중 하나라서 출력 비트가 두 개 필요합니다. 일의 자리 S는 두 입력이 다를 때 1이므로 XOR, 자리올림 C는 둘 다 1일 때만 1이므로 AND입니다.</>
        )
      }
    >
      <Seg value={mode} onChange={setMode} options={[{ value: 'half', label: '반가산기' }, { value: 'full', label: '전가산기' }]} />
      <div className="fig-split">
        <div className="gate-svg wide-svg">
          <svg viewBox={`0 0 440 ${H}`} role="img" aria-label={`${full ? '전가산기' : '반가산기'}: A=${a}, B=${b}${full ? `, Cin=${c}` : ''} → S=${s}, Cout=${cout}`}>
            {/* inputs to the first half adder */}
            <Wire d="M33 36 H60 V50 H120" on={!!a} P={P} />
            <Wire d="M88 50 V121 H120" on={!!a} P={P} />
            <Wire d="M33 84 H60 V68 H120" on={!!b} P={P} />
            <Wire d="M74 68 V139 H120" on={!!b} P={P} />
            <Dot x={88} y={50} on={!!a} P={P} />
            <Dot x={74} y={68} on={!!b} P={P} />
            <Gate kind="xor" x={120} y={59} P={P} on={!!fa.x} />
            <Gate kind="and" x={120} y={130} P={P} on={!!fa.g} />
            {full ? (
              <>
                {/* second half adder: (A xor B) with Cin */}
                <Wire d="M164 59 H200 V71 H250" on={!!fa.x} P={P} />
                <Wire d="M200 71 V156 H250" on={!!fa.x} P={P} />
                <Dot x={200} y={71} on={!!fa.x} P={P} />
                <Wire d="M34 212 H222 V89 H250" on={!!cin} P={P} />
                <Wire d="M222 174 H250" on={!!cin} P={P} />
                <Dot x={222} y={174} on={!!cin} P={P} />
                <Gate kind="xor" x={250} y={80} P={P} on={!!fa.s} />
                <Gate kind="and" x={250} y={165} P={P} on={!!fa.p} />
                <Wire d="M164 130 H184 V232 H318 V199 H330" on={!!fa.g} P={P} />
                <Wire d="M294 165 H312 V181 H330" on={!!fa.p} P={P} />
                <Gate kind="or" x={330} y={190} P={P} on={!!fa.cout} />
                <Wire d="M294 80 H404" on={!!s} P={P} />
                <Wire d="M374 190 H404" on={!!cout} P={P} />
                <Lamp x={416} y={80} v={s} P={P} name="S" side="top" />
                <Lamp x={416} y={190} v={cout} P={P} name="Cout" side="top" />
                <Lamp x={22} y={212} v={c} P={P} name="Cin" side="bottom" onClick={() => setC(1 - c)} />
                <text x={180} y={52} fontFamily={P.fontMono} fontSize={10} fill={P.ink3}>A⊕B</text>
                <text x={230} y={246} fontFamily={P.fontMono} fontSize={10} fill={P.ink3}>
                  A·B
                </text>
                <rect x={110} y={28} width={64} height={128} fill="none" stroke={alpha(P.ink3, 0.6)} strokeDasharray="4 3" />
                <rect x={240} y={56} width={64} height={128} fill="none" stroke={alpha(P.ink3, 0.6)} strokeDasharray="4 3" />
                <text x={142} y={22} textAnchor="middle" fontFamily={P.fontBody} fontSize={10.5} fill={P.ink3}>반가산기 1</text>
                <text x={272} y={198} textAnchor="middle" fontFamily={P.fontBody} fontSize={10.5} fill={P.ink3}>반가산기 2</text>
              </>
            ) : (
              <>
                <Wire d="M164 59 H404" on={!!s} P={P} />
                <Wire d="M164 130 H404" on={!!cout} P={P} />
                <Lamp x={416} y={59} v={s} P={P} name="S (합)" side="top" />
                <Lamp x={416} y={130} v={cout} P={P} name="C (올림)" side="top" />
              </>
            )}
            <Lamp x={22} y={36} v={a} P={P} name="A" side="top" onClick={() => setA(1 - a)} />
            <Lamp x={22} y={84} v={b} P={P} name="B" side="bottom" onClick={() => setB(1 - b)} />
          </svg>
          <div className="btn-row" role="group" aria-label="입력">
            <button type="button" className="lamp-btn" aria-pressed={!!a} onClick={() => setA(1 - a)}>
              A = {a}
            </button>
            <button type="button" className="lamp-btn" aria-pressed={!!b} onClick={() => setB(1 - b)}>
              B = {b}
            </button>
            {full && (
              <button type="button" className="lamp-btn" aria-pressed={!!c} onClick={() => setC(1 - c)}>
                Cin = {c}
              </button>
            )}
          </div>
        </div>
        <div className="controls">
          <table className="tbl tt">
            <thead>
              <tr>
                <th>A</th>
                <th>B</th>
                {full && <th>Cin</th>}
                <th>Cout</th>
                <th>S</th>
                <th className="dec">10진수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([x, y, z]) => {
                const r = fullAdder(x, y, z);
                const cur = x === a && y === b && (!full || z === c);
                const go = () => {
                  setA(x);
                  setB(y);
                  if (full) setC(z);
                };
                return (
                  <tr key={`${x}${y}${z}`} data-cur={cur || undefined} tabIndex={0} onClick={go} onKeyDown={rowKeys(go)} aria-label={`입력을 A=${x}, B=${y}${full ? `, Cin=${z}` : ''}로 바꾸기`}>
                    <td>{x}</td>
                    <td>{y}</td>
                    {full && <td>{z}</td>}
                    <td className="o" data-one={r.cout || undefined}>
                      {r.cout}
                    </td>
                    <td className="o" data-one={r.s || undefined}>
                      {r.s}
                    </td>
                    <td className="dec">{x + y + z}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Readout label="지금 계산" value={`${a} + ${b}${full ? ` + ${c}` : ''} = ${a + b + cin} = ${cout}${s}₍₂₎`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: 8-bit ripple-carry adder, gate delay by gate delay ─────────────── */

const NB = 8;
const ADD_PRESETS: { label: string; a: number; b: number }[] = [
  { label: '255 + 1', a: 255, b: 1 },
  { label: '127 + 1', a: 127, b: 1 },
  { label: '85 + 170', a: 85, b: 170 },
  { label: '200 + 100', a: 200, b: 100 },
  { label: '77 + 45', a: 77, b: 45 },
];

function RippleFigure() {
  const P = usePalette();
  const [ab, setAb] = useState<{ from: [number, number]; to: [number, number]; run: number }>({ from: [0, 0], to: [77, 45], run: 0 });
  const [a, b] = ab.to;
  const { frames, settledAt } = useMemo(() => rippleTrace(ab.from[0], ab.from[1], a, b, NB), [ab, a, b]);
  const auto = useRef(!prefersReducedMotion());
  const s = useStepper(frames.length, 3, ab.run, false, auto.current);
  const f = frames[s.i];
  const prev = frames[Math.max(0, s.i - 1)];
  const final = a + b;
  const setTo = (na: number, nb: number) => setAb((o) => ({ from: o.to, to: [na, nb], run: o.run + 1 }));
  const settledBits = settledAt.slice(0, NB).filter((t) => t <= f.t).length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const labelW = 34;
      const cw = (w - 8 - labelW) / (NB + 0.7);
      const coutX = labelW + cw * 0.35; // carry-out lamp
      const bx = (i: number) => labelW + cw * 0.7 + (NB - 1 - i) * cw; // left edge of the full adder for bit i
      const boxW = cw * 0.72;
      const off = (cw - boxW) / 2;
      const yA = 30;
      const yB = 56;
      const yBox = 76;
      const hBox = 46;
      const yC = yBox + hBox / 2;
      const yS = 152;
      const fs = Math.max(10, Math.min(13, cw * 0.3));

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.fillText('A', 12, yA);
      ctx.fillText('B', 12, yB);
      ctx.fillText('합', 12, yS);
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      for (let i = 0; i < NB; i++) ctx.fillText(`${i}`, bx(i) + cw / 2, 10);

      const bitsA = bitsOf(a, NB).reverse();
      const bitsB = bitsOf(b, NB).reverse();
      for (let i = 0; i < NB; i++) {
        const x = bx(i) + off;
        // input bits
        for (const [y, v] of [
          [yA, bitsA[i]],
          [yB, bitsB[i]],
        ] as const) {
          ctx.fillStyle = v ? alpha(P.ink, 0.85) : P.surface;
          ctx.strokeStyle = P.lineStrong;
          ctx.lineWidth = 1;
          ctx.fillRect(x, y - 10, boxW, 20);
          ctx.strokeRect(x + 0.5, y - 9.5, boxW - 1, 19);
          ctx.fillStyle = v ? P.surface : P.ink2;
          ctx.font = `600 ${fs}px ${P.fontMono}`;
          ctx.fillText(String(v), x + boxW / 2, y + 0.5);
        }
        // the full adder box; outlined when one of its outputs just changed
        const changed = s.i > 0 && (f.nets.s[i] !== prev.nets.s[i] || f.nets.c[i + 1] !== prev.nets.c[i + 1] || f.nets.p[i] !== prev.nets.p[i]);
        ctx.fillStyle = changed ? alpha(P.hl, 0.3) : P.surface2;
        ctx.fillRect(x, yBox, boxW, hBox);
        ctx.strokeStyle = changed ? P.hl : P.ink;
        ctx.lineWidth = changed ? 2.5 : 1.3;
        ctx.strokeRect(x, yBox, boxW, hBox);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 ${Math.max(9, fs - 2)}px ${P.fontMono}`;
        ctx.fillText('FA', x + boxW / 2, yC);
        // sum bit lamp
        const sv = f.nets.s[i];
        const done = settledAt[i] <= f.t;
        const r = Math.min(13, cw * 0.3);
        ctx.beginPath();
        ctx.arc(x + boxW / 2, yS, r, 0, Math.PI * 2);
        ctx.fillStyle = sv ? P.pos : P.surface;
        ctx.fill();
        ctx.lineWidth = done ? 2.2 : 1.4;
        ctx.strokeStyle = done ? P.good : P.ink3;
        ctx.setLineDash(done ? [] : [3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = sv ? P.surface : P.ink;
        ctx.font = `700 ${fs}px ${P.fontMono}`;
        ctx.fillText(String(sv), x + boxW / 2, yS + 0.5);
        ctx.strokeStyle = sv ? P.pos : P.ink3;
        ctx.lineWidth = sv ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.moveTo(x + boxW / 2, yBox + hBox);
        ctx.lineTo(x + boxW / 2, yS - r);
        ctx.stroke();
      }
      // carries: from the right edge of bit i+1's box to the left edge of bit i's box (bit 0 is on the right)
      for (let i = 0; i <= NB; i++) {
        const v = f.nets.c[i];
        const xFrom = i === 0 ? bx(0) + cw : bx(i - 1) + off; // left edge of the adder that produced it
        const xTo = i === NB ? coutX + 8 : bx(i) + off + boxW;
        ctx.strokeStyle = v ? P.pos : P.ink3;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = v ? 2.6 : 1.2;
        ctx.beginPath();
        ctx.moveTo(xFrom, yC);
        ctx.lineTo(xTo + 4, yC);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xTo, yC);
        ctx.lineTo(xTo + 6, yC - 4);
        ctx.lineTo(xTo + 6, yC + 4);
        ctx.closePath();
        ctx.fill();
      }
      // carry-out lamp, the 9th bit of the result
      const cv = f.nets.c[NB];
      const cr = Math.min(13, cw * 0.3);
      ctx.beginPath();
      ctx.arc(coutX, yS, cr, 0, Math.PI * 2);
      ctx.fillStyle = cv ? P.pos : P.surface;
      ctx.fill();
      ctx.strokeStyle = settledAt[NB] <= f.t ? P.good : P.ink3;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = cv ? P.surface : P.ink;
      ctx.font = `700 ${fs}px ${P.fontMono}`;
      ctx.fillText(String(cv), coutX, yS + 0.5);
      ctx.strokeStyle = cv ? P.pos : P.ink3;
      ctx.lineWidth = cv ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.moveTo(coutX + 8, yC);
      ctx.lineTo(coutX, yC);
      ctx.lineTo(coutX, yS - cr);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontBody}`;
      ctx.fillText('올림', coutX, yS + cr + 11);
    },
    [P, f, prev, a, b, settledAt, s.i],
    { height: 184 },
  );

  return (
    <Figure
      no={3}
      title="8비트 리플 캐리 덧셈기"
      hint="두 수를 바꾸면 회로가 다시 계산합니다"
      caption={<>전가산기(FA) 8개를 이어 붙였습니다. 오른쪽이 0번 비트이고, 각 FA의 자리올림이 왼쪽 FA로 들어갑니다. 한 단계는 게이트 하나를 신호가 지나는 시간(게이트 지연)입니다. 노란 테두리는 방금 출력이 바뀐 FA, 초록 테두리는 더는 바뀌지 않을 합 비트, 점선은 아직 바뀔 수 있는 비트입니다. 이전 계산 결과에서 출발하므로 중간에 틀린 값이 잠깐 보입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${a} + ${b}를 계산하는 8비트 덧셈기, 게이트 지연 ${f.t}단계: 출력 ${f.value}, 정답 ${final}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Slider id="rc-a" label="A" value={a} min={0} max={255} step={1} onChange={(v) => setTo(v, b)} format={(v) => `${v} = ${v.toString(2).padStart(8, '0')}`} />
          <Slider id="rc-b" label="B" value={b} min={0} max={255} step={1} onChange={(v) => setTo(a, v)} format={(v) => `${v} = ${v.toString(2).padStart(8, '0')}`} />
          <div className="btn-row">
            {ADD_PRESETS.map((p) => (
              <Button key={p.label} small onClick={() => setTo(p.a, p.b)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="rc-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="지난 시간" value={`게이트 ${f.t}개`} />
            <Readout label="지금 출력이 읽히는 값" value={f.value} color={f.value === final ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="정답" value={`${final}${final > 255 ? ' (9비트)' : ''}`} />
            <Readout label="확정된 합 비트" value={`${settledBits} / ${NB}`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '1이 흐르는 자리올림', shape: 'ln' },
          { color: 'var(--hl)', label: '방금 바뀐 FA', shape: 'sq' },
          { color: 'var(--good)', label: '확정된 비트', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: worst-case delay against width ─────────────── */

const MAXN = 32;
const rippleWorst = (n: number) => rippleTrace(0, 0, 2 ** n - 1, 1, n).frames.length - 1;
const prefixDelay = (n: number) => 2 + 2 * Math.ceil(Math.log2(Math.max(2, n)));

function DelayFigure() {
  const P = usePalette();
  const [n, setN] = useState(32);
  const ripple = useMemo(() => Array.from({ length: MAXN + 1 }, (_, k) => (k ? rippleWorst(k) : 0)), []);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = ripple[MAXN] * 1.08;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: MAXN, yMin: 0, yMax, pad: { l: 40, r: 14, t: 12, b: 30 } });
      plot.grid({ xStep: 8, yStep: 10, xLabel: '비트 수' });
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let k = 1; k <= MAXN; k++) (k === 1 ? ctx.moveTo(plot.X(k), plot.Y(ripple[k])) : ctx.lineTo(plot.X(k), plot.Y(ripple[k])));
      ctx.stroke();
      ctx.strokeStyle = P.good;
      ctx.beginPath();
      for (let k = 1; k <= MAXN; k++) (k === 1 ? ctx.moveTo(plot.X(k), plot.Y(prefixDelay(k))) : ctx.lineTo(plot.X(k), plot.Y(prefixDelay(k))));
      ctx.stroke();
      plot.line(n, 0, n, yMax, alpha(P.ink, 0.4), 1.2, [4, 4]);
      plot.dot(n, ripple[n], 5, P.bad, P.surface, 2);
      plot.dot(n, prefixDelay(n), 5, P.good, P.surface, 2);
    },
    [P, n, ripple],
    { aspect: 2.2, maxHeight: 280, minHeight: 200 },
  );
  return (
    <Figure
      no={4}
      title="자리올림을 기다리는 시간"
      hint="비트 수를 바꿔 보세요"
      caption={<>빨간 선은 그림 3과 같은 시뮬레이션으로 잰 리플 캐리 덧셈기의 최악 지연(모든 비트가 1인 수에 1을 더할 때)입니다. 초록 선은 자리올림을 미리 계산하는 병렬 접두 덧셈기의 대략적인 지연 2 + 2⌈log₂n⌉입니다. 실제 회로의 게이트 지연은 공정과 게이트 종류마다 달라 숫자는 비교용입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${n}비트에서 리플 캐리는 게이트 ${ripple[n]}개, 병렬 접두 덧셈기는 약 ${prefixDelay(n)}개 지연`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="dl-n" label="비트 수 n" value={n} min={1} max={MAXN} step={1} onChange={setN} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="리플 캐리 (최악)" value={`게이트 ${ripple[n]}개`} color="var(--bad)" />
            <Readout label="병렬 접두 (대략)" value={`게이트 ${prefixDelay(n)}개`} color="var(--good)" />
          </div>
          <Legend
            items={[
              { color: 'var(--bad)', label: '리플 캐리: 비트 수에 비례', shape: 'ln' },
              { color: 'var(--good)', label: '병렬 접두: log n에 비례', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LogicGates() {
  return (
    <>
      <h2>스위치 두 개로 만드는 논리</h2>
      <p>
        CPU 안에는 <T en="transistor">트랜지스터</T>가 수십억 개 들어 있습니다. 트랜지스터는 전기로 켜고 끄는 스위치입니다. 한쪽 단자의 전압이 1이면 전류가 흐르고, 0이면 막힙니다. 스위치 두 개를 <strong>한 줄로 이으면</strong> 둘 다 켜져야 전류가 흐르고, <strong>나란히 이으면</strong> 하나만 켜져도 흐릅니다. 이것이 각각 AND와 OR입니다.
      </p>
      <p>
        이렇게 트랜지스터 몇 개를 묶어 0과 1을 받아 0과 1을 내는 부품을 <T en="logic gate">논리 게이트</T>라고 부릅니다. 회로 설계자는 트랜지스터를 하나하나 생각하지 않고 게이트 단위로 생각하고, 게이트를 이어 붙여 더 큰 부품을 만듭니다. 이 장에서는 게이트에서 출발해 8비트 덧셈기까지 쌓아 올립니다.
      </p>

      <h2>기본 게이트와 진리표</h2>
      <p>
        게이트가 하는 일은 <T en="truth table">진리표</T> 하나로 완전히 정해집니다. 입력이 두 개면 가능한 경우가 4가지뿐이므로 표 네 줄이면 끝입니다. 그림 1에서 게이트를 바꿔 가며 입력을 눌러 보세요.
      </p>
      <GateFigure />
      <ul>
        <li>
          <strong>AND</strong>는 둘 다 1일 때만 1, <strong>OR</strong>는 하나라도 1이면 1, <strong>NOT</strong>은 입력을 뒤집습니다.
        </li>
        <li>
          <strong>XOR</strong>(배타적 OR)는 두 입력이 <strong>다를 때</strong> 1입니다. 곧 보겠지만 덧셈의 일의 자리가 바로 XOR입니다.
        </li>
        <li>
          <strong>NAND</strong>와 <strong>NOR</strong>는 AND와 OR의 출력에 NOT을 붙인 것입니다. 기호 끝의 작은 동그라미가 "뒤집기"를 뜻합니다.
        </li>
      </ul>
      <p>
        JavaScript의 비트 연산자 <code>&</code>, <code>|</code>, <code>^</code>, <code>~</code>는 이 게이트를 32개씩 나란히 놓은 것과 같습니다. <code>{'0b1100 & 0b1010'}</code>은 자리마다 AND를 해서 <code>0b1000</code>이 됩니다. 반면 <code>&&</code>와 <code>||</code>는 참/거짓 값 하나를 다루는 논리 연산자로, 비트 단위로 계산하지 않습니다.
      </p>
      <Callout kind="note">
        NAND 하나만 있으면 다른 모든 게이트를 만들 수 있습니다. 입력 두 개를 묶어 NAND에 넣으면 NOT이 되고, NAND 뒤에 NOT을 붙이면 AND가 되고, 입력을 각각 NOT한 뒤 NAND하면 OR가 됩니다(드모르간의 법칙). 실제 칩도 NAND와 NOR처럼 트랜지스터 몇 개로 만들기 쉬운 게이트를 주로 씁니다.
      </Callout>

      <h2>1비트 덧셈: 반가산기</h2>
      <p>
        2진수 덧셈은 10진수와 똑같이 일의 자리부터 더하고, 2가 되면 자리올림을 합니다. 1비트 두 개를 더하는 경우는 넷뿐입니다: 0 + 0 = 0, 0 + 1 = 1, 1 + 0 = 1, 1 + 1 = 10(2). 결과를 두 비트, 자리올림 C와 일의 자리 S로 적으면 진리표가 이렇게 나옵니다.
      </p>
      <ul>
        <li>S는 두 입력이 다를 때만 1입니다. XOR의 진리표와 같습니다.</li>
        <li>C는 둘 다 1일 때만 1입니다. AND의 진리표와 같습니다.</li>
      </ul>
      <p>
        그러니 XOR 하나와 AND 하나를 나란히 놓으면 1비트 덧셈기가 됩니다. 이것을 <T en="half adder">반가산기</T>라고 합니다. 그림 2에서 네 가지 입력을 모두 눌러 표와 맞춰 보세요.
      </p>
      <AdderCircuitFigure />

      <h2>자리올림까지: 전가산기</h2>
      <p>
        여러 자리 수를 더하려면 각 자리에서 <strong>세 개</strong>를 더해야 합니다. 두 수의 그 자리 비트 A, B와 아랫자리에서 올라온 자리올림 <M>{'C_{\\text{in}}'}</M>입니다. 반가산기라는 이름은 이 일의 절반만 한다는 뜻입니다. 셋을 더하는 <T en="full adder">전가산기</T>는 반가산기 두 개로 만듭니다. 먼저 A + B를 하고, 그 합에 <M>{'C_{\\text{in}}'}</M>을 더합니다. 두 단계에서 자리올림이 동시에 생길 수는 없으므로(A + B가 10이면 일의 자리는 0이라 두 번째 덧셈에서 올림이 나지 않습니다) 두 자리올림을 OR로 합치면 됩니다. 그림 2를 전가산기로 바꿔 여덟 줄을 확인해 보세요.
      </p>

      <h2>8비트 덧셈기</h2>
      <p>
        전가산기 8개를 한 줄로 놓고, 각 전가산기의 <M>{'C_{\\text{out}}'}</M>을 왼쪽 전가산기의 <M>{'C_{\\text{in}}'}</M>에 이으면 8비트 덧셈기가 됩니다. 손으로 세로셈을 할 때 자리올림을 왼쪽으로 넘기는 것과 똑같습니다. 맨 오른쪽의 자리올림 입력은 0으로 고정하고, 맨 왼쪽에서 나오는 자리올림이 9번째 비트입니다. 이 자리올림이 지난 장의 오버플로입니다. 8비트 결과만 남기면 버려집니다.
      </p>
      <Code label="전가산기와 8비트 리플 캐리 덧셈 (JavaScript로 흉내 내기)">{`
// a, b, cin은 0 또는 1
function fullAdd(a, b, cin) {
  const x = a ^ b;                 // 반가산기 1: 일의 자리
  const sum = x ^ cin;             // 반가산기 2: 일의 자리
  const carry = (a & b) | (x & cin); // 둘 중 한 곳에서라도 올림
  return [sum, carry];
}

function add8(x, y) {
  let carry = 0, out = 0;
  for (let i = 0; i < 8; i++) {    // 0번 비트(오른쪽)부터
    const [s, c] = fullAdd((x >> i) & 1, (y >> i) & 1, carry);
    out |= s << i;
    carry = c;                     // 다음 자리로 넘긴다
  }
  return { sum: out, overflow: carry === 1 };
}

add8(200, 100); // { sum: 44, overflow: true }: 300 - 256 = 44
`}</Code>
      <p>
        코드의 반복문은 자리올림이 앞 자리에서 다음 자리로 차례로 넘어가는 모습을 그대로 보여 줍니다. 회로에서는 반복문이 없지만 같은 일이 생깁니다. 신호가 게이트 하나를 지나는 데도 아주 짧은 시간이 걸리기 때문입니다. 이것을 <T en="gate delay">게이트 지연</T>이라고 합니다. 그림 3은 모든 게이트가 이전 순간의 입력을 보고 한 단계 뒤에 출력을 바꾸도록 흉내 낸 것입니다.
      </p>
      <RippleFigure />
      <p>
        <strong>255 + 1</strong>을 눌러 보세요. 0번 비트에서 생긴 자리올림이 한 칸씩 왼쪽으로 번져 나가는 동안 합 비트가 1이었다가 차례로 0으로 바뀝니다. 그 사이 출력을 읽으면 254, 252, 248처럼 틀린 값이 나옵니다. 자리올림이 물결처럼 번진다고 해서 이 구조를 <T en="ripple-carry adder">리플 캐리 덧셈기</T>라고 부릅니다. 반대로 <strong>85 + 170</strong>(01010101 + 10101010)은 어느 자리에서도 자리올림이 생기지 않아 몇 단계 만에 끝납니다. 덧셈 시간은 입력에 따라 다르지만, 회로는 언제나 <strong>최악의 경우</strong>를 기다려야 합니다. 그래야 어떤 입력에서도 틀린 값을 읽지 않습니다.
      </p>

      <h2>더 빠른 덧셈기</h2>
      <p>
        8비트에서 게이트 열몇 개면 짧지만, 64비트 CPU에서 자리올림을 64칸 기다리면 덧셈 한 번이 너무 느려집니다. 그래서 실제 CPU는 각 자리가 자리올림을 "만드는지"(A와 B가 둘 다 1) "넘기는지"(둘 중 하나만 1)를 먼저 구한 다음, 이 정보를 토너먼트처럼 두 칸, 네 칸, 여덟 칸씩 묶어 모든 자리의 자리올림을 동시에 계산합니다. <T en="carry-lookahead adder">자리올림 예측 덧셈기</T>, 그중에서도 병렬 접두(parallel prefix) 덧셈기라고 부르는 방식입니다. 게이트를 더 많이 쓰는 대신 지연이 비트 수가 아니라 log n에 비례합니다.
      </p>
      <DelayFigure />
      <Callout kind="intuition">
        리플 캐리는 줄을 서서 앞사람에게 귓속말을 전하는 방식이고, 병렬 접두는 반씩 나눠 동시에 전하는 방식입니다. 64명이면 64번 대 6번입니다. 같은 생각이 소프트웨어에도 나옵니다. 배열의 누적 합을 GPU에서 병렬로 구하는 알고리즘(parallel scan)이 바로 이 구조입니다. 나눠서 정복하는 방법은 <a href={lessonHref('cs-algorithm-design', 'divide-conquer')}>분할 정복</a>에서 더 볼 수 있습니다.
      </Callout>
      <p>
        CPU가 1초에 몇 번 일할 수 있는지(클록 속도)는 한 클록 안에 가장 느린 회로가 끝나야 한다는 조건으로 정해집니다. 덧셈기처럼 자주 쓰는 회로의 지연을 줄이는 것이 곧 CPU를 빠르게 하는 일입니다. 뺄셈은 지난 장에서 본 대로 b를 뒤집고 1을 더하면 되므로, 같은 덧셈기 앞에 XOR 게이트를 줄지어 놓고 맨 오른쪽 자리올림 입력에 1을 넣으면 됩니다. 덧셈, 뺄셈, AND, OR 같은 계산을 한데 모은 회로가 다음 장들에 나올 <T en="arithmetic logic unit">ALU</T>입니다.
      </p>

      <Callout kind="key">
        게이트는 진리표로 정해지는 작은 부품이고, AND·OR·NOT(또는 NAND 하나)으로 어떤 계산이든 만들 수 있습니다. 1비트 덧셈은 XOR(합)과 AND(올림)이고, 전가산기는 반가산기 둘과 OR 하나입니다. 전가산기를 이어 붙이면 n비트 덧셈기가 되지만, 자리올림이 한 칸씩 번지므로 지연이 n에 비례합니다. 빠른 CPU는 자리올림을 미리 계산해 지연을 log n으로 줄입니다.
      </Callout>
      <Quiz
        q="8비트 리플 캐리 덧셈기에서 계산이 가장 오래 걸리는 입력은?"
        options={['0 + 0', '128 + 128', '255 + 1', '85 + 170']}
        answer={2}
        explain={<>255 + 1에서는 0번 비트에서 생긴 자리올림이 1번, 2번, …, 7번 비트를 모두 거쳐 맨 끝까지 번져야 합니다. 128 + 128은 맨 윗자리에서만 올림이 생기므로 금방 끝나고, 85 + 170(01010101 + 10101010)은 어느 자리에서도 올림이 생기지 않습니다. 그림 3에서 직접 비교해 보세요.</>}
      />
    </>
  );
}

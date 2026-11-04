import { useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { bitsOf } from './bits';
import { Dot, Gate, Lamp, Wire } from './svg';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';

/* ─────────────── shared: digital waveforms ─────────────── */

interface WaveRow {
  name: string;
  v: number[];
  color: string;
}

/** Square waves, one row per signal; `edges` marks sample indices with a dashed line. */
function drawWaves(ctx: CanvasRenderingContext2D, P: Palette, rows: WaveRow[], w: number, h: number, slots: number, edges: number[] = [], cursor = -1) {
  const left = 36;
  const rowH = (h - 8) / rows.length;
  const dx = (w - left - 8) / slots;
  for (const e of edges) {
    const x = left + e * dx;
    ctx.strokeStyle = alpha(P.ink3, 0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, h - 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (cursor >= 0) {
    ctx.fillStyle = alpha(P.hl, 0.18);
    ctx.fillRect(left + cursor * dx, 2, dx, h - 4);
  }
  rows.forEach((r, k) => {
    const y0 = 4 + k * rowH;
    const hi = y0 + rowH * 0.22;
    const lo = y0 + rowH * 0.78;
    ctx.fillStyle = P.ink2;
    ctx.font = `600 12px ${P.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name, 2, (hi + lo) / 2);
    ctx.strokeStyle = alpha(P.ink3, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, lo + 0.5);
    ctx.lineTo(w - 8, lo + 0.5);
    ctx.stroke();
    // fill under the high parts
    ctx.fillStyle = alpha(r.color, 0.13);
    for (let i = 0; i < r.v.length; ) {
      if (!r.v[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < r.v.length && r.v[j]) j++;
      ctx.fillRect(left + i * dx, hi, (j - i) * dx, lo - hi);
      i = j;
    }
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    r.v.forEach((v, i) => {
      const y = v ? hi : lo;
      const x = left + i * dx;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.lineTo(x + dx, y);
    });
    ctx.stroke();
  });
}

/* ─────────────── Figure 1: SR latch from two NOR gates ─────────────── */

interface SR {
  s: number;
  r: number;
  q: number;
  qn: number;
}
const nor = (a: number, b: number) => 1 - (a | b);
const SLOTS_SR = 40;
const INIT_SR: SR = { s: 0, r: 0, q: 0, qn: 1 };

/** Unit-delay steps after an input change, until nothing changes (or a few rounds of oscillation). */
function settleSR(from: SR, s: number, r: number, race: () => number): { steps: SR[]; note: string } {
  const steps: SR[] = [];
  let cur = { ...from, s, r };
  steps.push(cur);
  for (let k = 0; k < 6; k++) {
    const nx = { s, r, q: nor(r, cur.qn), qn: nor(s, cur.q) };
    if (nx.q === cur.q && nx.qn === cur.qn) return { steps, note: '' };
    cur = nx;
    steps.push(cur);
  }
  // still flipping: in a real circuit one gate wins by a hair
  const q = race();
  steps.push({ s, r, q, qn: 1 - q });
  return { steps, note: 'race' };
}

function SrLatchFigure() {
  const P = usePalette();
  const [hist, setHist] = useState<SR[]>(() => new Array(8).fill(INIT_SR));
  const [shown, setShown] = useState(8);
  const [note, setNote] = useState('처음에는 Q = 0입니다. S를 눌러 1로 만들어 보세요.');
  const raceSeed = useRef(0);
  const acc = useRef(0);
  const cur = hist[Math.min(shown, hist.length) - 1];
  const last = hist[hist.length - 1];
  const busy = shown < hist.length;

  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current < 0.32) return;
    acc.current = 0;
    setShown((x) => Math.min(hist.length, x + 1));
  }, busy);

  const apply = (s: number, r: number) => {
    const { steps, note: n } = settleSR(last, s, r, () => (raceSeed.current++ % 2 === 0 ? 1 : 0));
    const settled = steps[steps.length - 1];
    const hold = [last, last];
    const next = [...hist, ...hold, ...steps].slice(-SLOTS_SR);
    const reduce = prefersReducedMotion();
    setHist(next);
    setShown(reduce ? next.length : next.length - steps.length + 1);
    acc.current = 0;
    if (n === 'race') setNote(`S와 R을 동시에 0으로 놓자 두 게이트가 서로를 뒤집으며 흔들립니다. 실제 회로에서는 아주 작은 속도 차이로 한쪽이 이기는데, 어느 쪽일지 미리 알 수 없습니다. 이번에는 Q = ${settled.q}로 멈췄습니다.`);
    else if (s && r) setNote('S와 R이 모두 1이면 Q와 Q̄가 둘 다 0이 됩니다. 서로 반대여야 한다는 약속이 깨지므로 쓰지 않는 입력입니다.');
    else if (last.q === last.qn) setNote(`${s ? 'R' : 'S'}만 0으로 돌려 금지 상태에서 벗어났습니다. 남은 ${s ? 'S' : 'R'} = 1에 따라 Q = ${settled.q}가 됩니다.`);
    else if (settled.q !== last.q)
      setNote(
        settled.q
          ? `S = 1: 아래 게이트의 출력 Q̄가 먼저 0이 되고, 한 단계 뒤 위 게이트의 출력 Q가 1이 됩니다. ${steps.length - 1}단계 만에 안정됩니다.`
          : `R = 1: 위 게이트의 출력 Q가 먼저 0이 되고, 한 단계 뒤 Q̄가 1이 됩니다. ${steps.length - 1}단계 만에 안정됩니다.`,
      );
    else if (!s && !r) setNote(`입력을 모두 0으로 돌렸는데도 Q = ${settled.q}가 그대로입니다. Q와 Q̄가 서로를 붙잡고 있기 때문입니다. 이것이 1비트의 기억입니다.`);
    else setNote(`이미 Q = ${last.q}이라 바뀌는 것이 없습니다.`);
  };
  const reset = () => {
    setHist(new Array(8).fill(INIT_SR));
    setShown(8);
    setNote('처음 상태로 돌아왔습니다. Q = 0입니다.');
  };

  const view = hist.slice(0, shown);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) =>
      drawWaves(
        ctx,
        P,
        [
          { name: 'S', v: view.map((x) => x.s), color: P.neg },
          { name: 'R', v: view.map((x) => x.r), color: P.neg },
          { name: 'Q', v: view.map((x) => x.q), color: P.pos },
          { name: 'Q̄', v: view.map((x) => x.qn), color: P.ink2 },
        ],
        w,
        h,
        SLOTS_SR,
      ),
    [P, view],
    { height: 150 },
  );

  const mode = cur.s && cur.r ? 3 : cur.s ? 1 : cur.r ? 2 : 0;
  return (
    <Figure
      no={1}
      title="SR 래치: 출력을 입력으로 되돌리기"
      hint="S와 R을 차례로 켜고 꺼 보세요"
      caption={<>NOR 게이트 두 개의 출력을 서로의 입력으로 엇갈려 이었습니다. S(set)는 Q를 1로, R(reset)은 Q를 0으로 만듭니다. 둘 다 0일 때는 아무것도 바꾸지 않고 지금 상태를 유지합니다. 아래 파형은 시간에 따른 신호로, 한 칸이 게이트 지연 한 번입니다.</>}
    >
      <div className="fig-split">
        <div className="gate-svg">
          <svg viewBox="0 0 400 220" role="img" aria-label={`SR 래치: S=${cur.s}, R=${cur.r}, Q=${cur.q}, Q̄=${cur.qn}`}>
            <Wire d="M41 51 H170" on={!!cur.r} P={P} />
            <Wire d="M41 169 H170" on={!!cur.s} P={P} />
            {/* feedback: Q into the lower gate, Q̄ into the upper gate */}
            <Wire d="M300 60 V100 H140 V151 H170" on={!!cur.q} P={P} />
            <Wire d="M280 160 V120 H120 V69 H170" on={!!cur.qn} P={P} />
            <Gate kind="nor" x={170} y={60} P={P} on={!!cur.q} />
            <Gate kind="nor" x={170} y={160} P={P} on={!!cur.qn} />
            <Wire d="M222 60 H348" on={!!cur.q} P={P} />
            <Wire d="M222 160 H348" on={!!cur.qn} P={P} />
            <Dot x={300} y={60} on={!!cur.q} P={P} />
            <Dot x={280} y={160} on={!!cur.qn} P={P} />
            <Lamp x={30} y={51} v={cur.r} P={P} name="R" side="top" onClick={() => !busy && apply(cur.s, 1 - cur.r)} />
            <Lamp x={30} y={169} v={cur.s} P={P} name="S" side="bottom" onClick={() => !busy && apply(1 - cur.s, cur.r)} />
            <Lamp x={360} y={60} v={cur.q} P={P} name="Q" side="top" r={13} />
            <Lamp x={360} y={160} v={cur.qn} P={P} name="Q̄" side="bottom" r={13} />
            <text x={336} y={114} textAnchor="middle" fontFamily={P.fontBody} fontSize={11} fill={P.ink3}>
              되먹임
            </text>
          </svg>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label="S, R, Q, Q̄ 신호의 시간에 따른 파형">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <div className="btn-row" role="group" aria-label="입력">
            <button type="button" className="lamp-btn" aria-pressed={!!last.s} disabled={busy} onClick={() => apply(1 - last.s, last.r)}>
              S = {last.s}
            </button>
            <button type="button" className="lamp-btn" aria-pressed={!!last.r} disabled={busy} onClick={() => apply(last.s, 1 - last.r)}>
              R = {last.r}
            </button>
          </div>
          <div className="btn-row">
            <Button small onClick={() => apply(0, 0)} disabled={busy || !(last.s && last.r)} title="S와 R이 모두 1일 때 동시에 0으로">
              S, R 동시에 0으로
            </Button>
            <Button small onClick={reset}>
              처음으로
            </Button>
          </div>
          <table className="tbl tt">
            <thead>
              <tr>
                <th>S</th>
                <th>R</th>
                <th>Q</th>
              </tr>
            </thead>
            <tbody>
              {['유지', '1 (set)', '0 (reset)', '금지'].map((t, k) => (
                <tr key={t} data-cur={k === mode || undefined} style={{ cursor: 'default' }}>
                  <td>{k === 1 || k === 3 ? 1 : 0}</td>
                  <td>{k === 2 || k === 3 ? 1 : 0}</td>
                  <td style={{ fontFamily: 'var(--font-body)' }}>{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="arch-note" aria-live="polite">
            {note}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: D latch vs D flip-flop under a clock ─────────────── */

const PERIOD = 8;
const SLOTS_D = 48;
const clkAt = (t: number) => (t % PERIOD >= PERIOD / 2 ? 1 : 0);
// D changes chosen to land both between and during clock pulses
const SCRIPT_D: [number, number][] = [
  [2, 1],
  [6, 0],
  [9, 1],
  [13, 0],
  [14, 1],
  [17, 0],
  [22, 1],
  [27, 0],
  [29, 1],
];
const INIT_D = (() => {
  const d: number[] = [];
  let v = 0;
  for (let t = 0; t < 34; t++) {
    const ch = SCRIPT_D.find(([at]) => at === t);
    if (ch) v = ch[1];
    d.push(v);
  }
  return d;
})();

function qOf(d: number[], mode: 'latch' | 'ff'): number[] {
  let q = 0;
  return d.map((dv, t) => {
    const c = clkAt(t);
    if (mode === 'latch' ? c === 1 : c === 1 && clkAt(t - 1) === 0 && t > 0) q = dv;
    return q;
  });
}

function FlipFlopFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'latch' | 'ff'>('ff');
  const [d, setD] = useState<number[]>(INIT_D);
  const [playing, setPlaying] = useState(false);
  const acc = useRef(0);
  const t = d.length - 1;
  const q = qOf(d, mode);
  const other = qOf(d, mode === 'ff' ? 'latch' : 'ff');
  const start = Math.max(0, d.length - SLOTS_D);
  const changesQ = q.reduce((n, v, i) => n + (i && v !== q[i - 1] ? 1 : 0), 0);
  const changesOther = other.reduce((n, v, i) => n + (i && v !== other[i - 1] ? 1 : 0), 0);

  const tick = () => setD((x) => [...x, x[x.length - 1]]);
  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current < 0.2) return;
    acc.current = 0;
    tick();
  }, playing);

  const toggleD = () => setD((x) => [...x.slice(0, -1), 1 - x[x.length - 1]]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const view = (a: number[]) => a.slice(start);
      const edges: number[] = [];
      for (let i = start; i < d.length; i++) if (i > 0 && clkAt(i) === 1 && clkAt(i - 1) === 0) edges.push(i - start);
      drawWaves(
        ctx,
        P,
        [
          { name: 'CLK', v: view(d.map((_, i) => clkAt(i))), color: P.ink2 },
          { name: 'D', v: view(d), color: P.neg },
          { name: 'Q', v: view(q), color: P.pos },
        ],
        w,
        h,
        SLOTS_D,
        mode === 'ff' ? edges : [],
        d.length - 1 - start,
      );
    },
    [P, d, q, mode, start],
    { height: 160 },
  );

  return (
    <Figure
      no={2}
      title="클록에 맞춰 기억하기"
      hint="D를 바꾸고 클록을 진행해 보세요"
      caption={<>CLK는 일정한 간격으로 0과 1을 오가는 클록 신호입니다. D 래치는 CLK가 1인 동안 내내 D를 그대로 따라가고, D 플립플롭은 CLK가 0에서 1로 바뀌는 순간(점선)에만 D를 한 번 찍어 둡니다. 노란 칸이 지금 시각입니다. 처음 34칸은 미리 만든 예시이고, 그 뒤는 직접 만들 수 있습니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${mode === 'ff' ? 'D 플립플롭' : 'D 래치'}의 CLK, D, Q 파형. 지금 D=${d[t]}, Q=${q[t]}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Seg label="부품" value={mode} onChange={setMode} options={[{ value: 'latch', label: 'D 래치' }, { value: 'ff', label: 'D 플립플롭' }]} />
        <div className="ctl" style={{ flex: '2 1 260px' }}>
          <span className="ctl-label">
            <span>조작</span>
          </span>
          <div className="btn-row">
            <button type="button" className="lamp-btn" aria-pressed={!!d[t]} onClick={toggleD}>
              D = {d[t]}
            </button>
            <Button small primary onClick={() => setPlaying((p) => !p)} label={playing ? '클록 멈추기' : '클록 진행'}>
              {playing ? '❚❚ 멈춤' : '▶ 클록 진행'}
            </Button>
            <Button small onClick={tick} disabled={playing}>
              한 칸
            </Button>
            <Button
              small
              onClick={() => {
                setPlaying(false);
                setD(INIT_D);
              }}
            >
              예시로
            </Button>
          </div>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Readout label="지금 CLK" value={clkAt(t)} />
        <Readout label="지금 Q" value={q[t]} color="var(--pos)" />
        <Readout label={`Q가 바뀐 횟수 (${mode === 'ff' ? '플립플롭' : '래치'})`} value={`${changesQ}번`} />
        <Readout label={`같은 입력에서 ${mode === 'ff' ? '래치' : '플립플롭'}라면`} value={`${changesOther}번`} />
      </div>
      <Legend
        items={[
          { color: 'var(--ink-2)', label: 'CLK (클록)', shape: 'ln' },
          { color: 'var(--neg)', label: 'D (데이터 입력)', shape: 'ln' },
          { color: 'var(--pos)', label: 'Q (기억한 값)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: eight bytes of memory with an address decoder ─────────────── */

const INIT_MEM = [...'Hi, CPU!'].map((c) => c.charCodeAt(0));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k: number) => String(k).split('').map((x) => SUP[+x]).join('');
const show = (v: number) => (v >= 32 && v < 127 ? `'${String.fromCharCode(v)}'` : '');

function MemoryFigure() {
  const [mem, setMem] = useState<number[]>(INIT_MEM);
  const [addr, setAddr] = useState(1);
  const [din, setDin] = useState(0b01001111);
  const [bus, setBus] = useState<{ v: number; from: number } | null>(null);
  const [flash, setFlash] = useState<{ row: number; kind: 'r' | 'w'; n: number } | null>(null);
  const [nBits, setNBits] = useState(32);
  const aBits = bitsOf(addr, 3);
  const cond = (k: number) =>
    bitsOf(k, 3)
      .map((b, i) => (b ? `A${2 - i}` : `¬A${2 - i}`))
      .join('·');

  const read = () => {
    setBus({ v: mem[addr], from: addr });
    setFlash((f) => ({ row: addr, kind: 'r', n: (f?.n ?? 0) + 1 }));
  };
  const write = () => {
    setMem((m) => m.map((v, k) => (k === addr ? din : v)));
    setFlash((f) => ({ row: addr, kind: 'w', n: (f?.n ?? 0) + 1 }));
  };

  const cap = 2 ** nBits;
  const units = ['바이트', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let u = 0;
  let c = cap;
  while (c >= 1024 && u < units.length - 1) {
    c /= 1024;
    u++;
  }

  return (
    <Figure
      no={3}
      title="주소로 칸 고르기: 8바이트 메모리"
      hint="주소 비트를 바꾸고 읽기·쓰기를 해 보세요"
      caption={<>한 줄은 플립플롭 8개로 만든 1바이트입니다. 주소 비트 3개가 해독기(decoder)로 들어가면, 8개의 AND 게이트 중 주소와 정확히 맞는 하나만 1을 냅니다. 그 줄만 데이터 선에 연결되어 읽히거나, 쓰기 신호가 오면 데이터 입력을 기억합니다. 처음 내용은 문자 코드(ASCII)로 쓴 "Hi, CPU!"입니다.</>}
    >
      <div className="ram">
        <div className="ram-addr">
          <span className="ram-h">주소</span>
          <div className="btn-row" role="group" aria-label="주소 비트">
            {aBits.map((b, i) => (
              <button key={i} type="button" className="lamp-btn" aria-pressed={!!b} aria-label={`주소 비트 A${2 - i}, 지금 ${b}`} onClick={() => setAddr(addr ^ (1 << (2 - i)))}>
                A{2 - i}={b}
              </button>
            ))}
          </div>
          <span className="arch-small">
            = {addr.toString(2).padStart(3, '0')}₍₂₎ = {addr}번 줄
          </span>
        </div>
        <div className="ram-grid" role="table" aria-label="메모리 내용">
          <div className="ram-row ram-head" role="row">
            <span role="columnheader">해독기 (AND)</span>
            <span role="columnheader">#</span>
            <span role="columnheader" className="ram-bits-h">
              비트 7 … 0
            </span>
            <span role="columnheader">값</span>
          </div>
          {mem.map((v, k) => {
            const sel = k === addr;
            const fl = flash && flash.row === k ? flash : null;
            return (
              <div key={k} className="ram-row" role="row" data-sel={sel || undefined} data-flash={fl ? `${fl.kind}${fl.n % 2}` : undefined} onClick={() => setAddr(k)}>
                <span className="ram-dec" role="cell">
                  <i className="ram-lamp" data-on={sel || undefined} aria-hidden="true" />
                  <span className="mono">{cond(k)}</span>
                </span>
                <span className="mono ram-no" role="cell">
                  {k}
                </span>
                <span className="ram-bits" role="cell">
                  {bitsOf(v, 8).map((b, i) => (
                    <i key={i} data-on={b || undefined}>
                      {b}
                    </i>
                  ))}
                </span>
                <span className="mono ram-val" role="cell">
                  {v} <span className="ram-ch">{show(v)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="ram-io">
          <div className="ctl">
            <span className="ctl-label">
              <span>데이터 입력 (쓸 값)</span>
              <span className="val">
                {din} {show(din)}
              </span>
            </span>
            <div className="ram-din" role="group" aria-label="데이터 입력 비트">
              {bitsOf(din, 8).map((b, i) => (
                <button key={i} type="button" className="fbit" data-f="m" aria-pressed={!!b} aria-label={`데이터 비트 ${7 - i}, 지금 ${b}`} onClick={() => setDin(din ^ (1 << (7 - i)))}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <Button small primary onClick={read}>
              읽기
            </Button>
            <Button small onClick={write}>
              쓰기
            </Button>
            <Button
              small
              onClick={() => {
                setMem(INIT_MEM);
                setBus(null);
                setFlash(null);
              }}
            >
              처음 내용으로
            </Button>
          </div>
          <Readout label="데이터 출력 (마지막으로 읽은 값)" value={bus ? `M[${bus.from}] = ${bus.v.toString(2).padStart(8, '0')} = ${bus.v} ${show(bus.v)}` : '아직 읽지 않음'} />
        </div>
      </div>
      <div className="controls row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <Slider id="mem-n" label="주소 비트 수를 늘리면" value={nBits} min={3} max={64} step={1} onChange={setNBits} format={(v) => `${v}비트`} />
        <div className="ctl">
          <Readout label="고를 수 있는 칸 (1칸 = 1바이트)" value={`2${sup(nBits)} = ${c >= 100 ? Math.round(c) : +c.toFixed(c < 10 ? 2 : 1)} ${units[u]}`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function MemoryCircuits() {
  return (
    <>
      <h2>계산하는 회로는 기억하지 못한다</h2>
      <p>
        지난 장의 덧셈기는 입력이 바뀌면 잠시 뒤 출력이 따라 바뀝니다. 입력을 치우면 결과도 사라집니다. 이렇게 지금 입력만으로 출력이 정해지는 회로를 <T en="combinational circuit">조합 회로</T>라고 합니다. 하지만 컴퓨터는 방금 계산한 값을 들고 있어야 다음 계산에 쓸 수 있습니다. 반복문의 카운터, 변수, 실행 중인 명령어의 위치가 모두 어딘가에 남아 있어야 합니다.
      </p>
      <p>
        기억하는 회로의 비결은 놀랄 만큼 단순합니다. <strong>출력을 다시 입력으로 되돌리는 것</strong>, 즉 <T en="feedback">되먹임</T>입니다. 그러면 회로의 출력이 지금 입력뿐 아니라 직전 출력에도 달리게 됩니다. 과거가 회로 안에 남는 것입니다. 이런 회로를 <T en="sequential circuit">순차 회로</T>라고 합니다.
      </p>

      <h2>SR 래치: 서로를 붙잡는 두 게이트</h2>
      <p>
        NOR 게이트 두 개의 출력을 엇갈려 서로의 입력에 이으면 1비트를 기억하는 <T en="SR latch">SR 래치</T>가 됩니다. NOR는 입력 중 하나라도 1이면 0을 내므로, 한쪽 출력이 1이면 다른 쪽을 0으로 누르고, 그 0이 다시 처음 쪽을 1로 유지합니다. 서로가 서로를 붙잡은 안정된 상태가 두 가지(Q = 0 또는 Q = 1) 있고, 회로는 그중 하나에 머뭅니다.
      </p>
      <SrLatchFigure />
      <p>
        그림 1에서 S를 1로 했다가 다시 0으로 돌려 보세요. S가 0으로 돌아간 뒤에도 Q는 1로 남습니다. 그 순간 회로가 "S가 한때 1이었다"는 사실을 기억하고 있는 것입니다. R을 1로 했다 0으로 돌리면 Q가 0이 되어 그대로 남습니다. 파형에서 Q가 바뀌는 데 게이트 두 단계가 걸리는 것도 보세요. 되먹임이 한 바퀴 돌아야 안정됩니다.
      </p>
      <Callout kind="warn">
        S와 R을 동시에 1로 두면 Q와 Q̄가 둘 다 0이 되고, 거기서 둘을 정확히 동시에 0으로 돌리면 두 게이트가 서로를 뒤집으며 흔들립니다(그림 1의 "동시에 0으로" 버튼). 실제 회로에서는 결국 한쪽에 정착하지만 어느 쪽인지, 언제인지 보장할 수 없는 <T en="metastability">메타안정</T> 상태가 생길 수 있습니다. 그래서 회로 설계자는 이 입력 조합이 생기지 않게 막습니다.
      </Callout>

      <h2>클록과 D 플립플롭</h2>
      <p>
        SR 래치는 입력이 두 개라 쓰기 번거롭고, 입력이 바뀌는 즉시 출력이 바뀝니다. 회로가 수백만 개의 래치로 이루어져 있으면 신호가 도착하는 시각이 제각각이라, 어떤 래치는 새 값을, 어떤 래치는 아직 옛 값을 보는 혼란이 생깁니다. 지난 장의 리플 캐리 덧셈기에서 본 것처럼 계산 중간에는 틀린 값이 잠깐씩 지나가기도 합니다.
      </p>
      <p>
        해결책은 모두가 같은 박자에 맞춰 움직이는 것입니다. CPU 전체에 일정한 간격으로 0과 1을 오가는 <T en="clock">클록</T> 신호를 뿌리고, 기억 소자는 클록이 0에서 1로 바뀌는 <T en="rising edge">상승 에지</T>에서만 값을 받아들이게 합니다. 이것이 <T en="D flip-flop">D 플립플롭</T>입니다. 입력은 데이터 D 하나뿐이고, 에지 순간의 D가 다음 에지까지 Q에 남습니다. CPU의 "3GHz"는 이 클록이 1초에 30억 번 뛴다는 뜻입니다.
      </p>
      <FlipFlopFigure />
      <p>
        그림 2에서 D 래치와 D 플립플롭을 번갈아 골라 보세요. 같은 D가 들어가는데, 래치는 클록이 1인 동안 D가 흔들리면 그대로 따라 흔들리고, 플립플롭은 점선 위치에서만 값을 바꿉니다. 클록과 클록 사이에 덧셈기 같은 조합 회로가 계산을 마치면, 다음 에지에서 그 결과가 한꺼번에 플립플롭에 들어갑니다. 그래서 클록 주기는 가장 느린 조합 회로가 끝날 만큼 길어야 합니다. 지난 장에서 덧셈기의 지연이 중요했던 이유입니다.
      </p>
      <Code label="D 플립플롭과 8비트 레지스터를 JavaScript로 흉내 내기">{`
class DFlipFlop {
  q = 0;
  #prevClk = 0;
  // 클록이 0에서 1로 바뀌는 순간에만 d를 기억한다
  tick(clk, d) {
    if (this.#prevClk === 0 && clk === 1) this.q = d;
    this.#prevClk = clk;
    return this.q;
  }
}

// 플립플롭 8개가 같은 클록을 나눠 쓰면 1바이트 레지스터
class Register8 {
  bits = Array.from({ length: 8 }, () => new DFlipFlop());
  tick(clk, value) {
    return this.bits.reduce((out, ff, i) => out | (ff.tick(clk, (value >> i) & 1) << i), 0);
  }
}
`}</Code>

      <h2>레지스터에서 메모리로</h2>
      <p>
        플립플롭 8개를 나란히 놓고 같은 클록을 주면 1바이트를 한꺼번에 기억하는 <T en="register">레지스터</T>가 됩니다. 64비트 CPU의 레지스터는 플립플롭 64개입니다. 레지스터를 여러 줄 쌓으면 메모리가 되는데, 문제가 하나 생깁니다. 수많은 줄 중 <strong>어느 줄</strong>을 읽고 쓸지 골라야 합니다.
      </p>
      <p>
        여기서 쓰는 것이 <T en="address">주소</T>와 <T en="decoder">해독기</T>입니다. 줄마다 번호를 붙이고, 번호를 2진수 비트로 보냅니다. 해독기는 줄마다 AND 게이트를 하나씩 두는데, 5번 줄(101)의 게이트는 <M>{'A_2 \\cdot \\lnot A_1 \\cdot A_0'}</M>처럼 "A2가 1이고 A1이 0이고 A0이 1"일 때만 1을 냅니다. 주소가 무엇이든 정확히 한 게이트만 켜지고, 그 줄만 데이터 선에 연결됩니다.
      </p>
      <MemoryFigure />
      <p>
        주소 비트를 하나 늘릴 때마다 고를 수 있는 줄이 두 배가 됩니다. 그림 3 아래의 슬라이더를 32비트에 놓으면 4GB가 나옵니다. 예전 32비트 운영체제가 메모리를 4GB까지만 쓸 수 있었던 이유입니다. 64비트 주소로는 이론상 16EB(엑사바이트)까지 가리킬 수 있어서, 지금의 CPU는 그중 48~57비트 정도만 실제로 씁니다. JavaScript의 <code>Uint8Array</code>에서 <code>mem[5]</code>라고 쓰는 것은, 하드웨어에서는 5를 주소 선에 올리고 해독기가 그 줄을 고르는 일입니다.
      </p>

      <h2>실제 메모리: SRAM과 DRAM</h2>
      <p>
        실제 칩의 메모리는 비트 하나를 만드는 방법에 따라 두 가지로 나뉩니다.
      </p>
      <ul>
        <li>
          <T en="static RAM">SRAM</T>은 이 장에서 본 것처럼 게이트를 엇갈려 이은 래치로 비트를 기억합니다. 트랜지스터 6개로 1비트를 만들고, 전원이 있는 한 값이 유지되며, 매우 빠릅니다. 하지만 자리를 많이 차지해 비쌉니다. CPU의 레지스터와 캐시가 SRAM입니다.
        </li>
        <li>
          <T en="dynamic RAM">DRAM</T>은 아주 작은 축전기(전하를 담는 통) 하나와 트랜지스터 하나로 1비트를 만듭니다. 전하가 있으면 1, 없으면 0입니다. 작고 싸서 수십 GB를 만들 수 있지만, 전하가 조금씩 새어 나가므로 수십 밀리초마다 모든 칸을 읽어 다시 써 주어야(refresh) 하고, 읽는 데도 시간이 더 걸립니다. 메인 메모리(RAM)가 DRAM입니다.
        </li>
      </ul>
      <p>
        빠르지만 작은 SRAM과 크지만 느린 DRAM. 이 차이가 마지막 장 <a href={lessonHref('cs-architecture', 'memory-hierarchy')}>메모리 계층과 캐시</a>의 출발점입니다. 그전에 다음 장에서는 레지스터, 메모리, ALU를 모아 명령어를 실행하는 CPU를 만듭니다.
      </p>
      <Callout kind="note">
        SRAM과 DRAM은 전원이 꺼지면 내용이 사라지는 <T en="volatile">휘발성</T> 메모리입니다. 전원 없이도 남아야 하는 SSD와 USB 메모리는 전하를 절연체 안에 가둬 두는 플래시 메모리를 씁니다. 대신 쓰는 속도가 느리고 같은 칸을 쓸 수 있는 횟수에 한계가 있습니다.
      </Callout>

      <Callout kind="key">
        출력을 입력으로 되돌리면 회로가 기억을 갖습니다. NOR 두 개를 엇갈려 이은 SR 래치가 1비트를 기억하고, 클록의 상승 에지에서만 값을 받는 D 플립플롭은 회로 전체가 같은 박자로 움직이게 합니다. 플립플롭을 모으면 레지스터, 레지스터를 쌓고 주소 해독기로 한 줄을 고르면 메모리가 됩니다. 주소가 n비트면 <M>{'2^n'}</M>칸을 고를 수 있습니다.
      </Callout>
      <Quiz
        q="D 플립플롭의 클록이 1인 동안 D 입력이 0 → 1 → 0으로 바뀌었고, 그 전 상승 에지에서 D는 0이었다. 다음 상승 에지 직전까지 Q는?"
        options={['계속 0이다', 'D를 따라 0 → 1 → 0으로 바뀐다', '1이 된다', '알 수 없다']}
        answer={0}
        explain={<>플립플롭은 상승 에지 순간에만 D를 받아들입니다. 그때 D가 0이었으므로 Q는 0이고, 클록이 1인 동안 D가 흔들려도 무시합니다. D를 따라 흔들리는 것은 D 래치입니다. 그림 2에서 두 부품을 바꿔 가며 확인해 보세요.</>}
      />
    </>
  );
}

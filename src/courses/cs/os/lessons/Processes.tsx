import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { courseHref, lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { box, hatch, label, rrect, text, token } from './draw';
import { PROC_CSS, STATE_KO, procColor, runProcs, type PState, type ProcFrame, type ProcSpec } from './procs';
import './os.css';

/* ─────────────── Figure 1: five states, four processes, one CPU ─────────────── */

const SPECS: ProcSpec[] = [
  { name: 'A', arrive: 0, bursts: [2, 5, 2, 5, 2] },
  { name: 'B', arrive: 1, bursts: [8, 2, 6] },
  { name: 'C', arrive: 2, bursts: [3, 6, 3] },
  { name: 'D', arrive: 4, bursts: [4, 3, 2] },
];
const CPU_TOTAL = SPECS.reduce((a, s) => a + s.bursts.filter((_, i) => i % 2 === 0).reduce((x, y) => x + y, 0), 0);
const RUN_ON = runProcs(SPECS, 3, true);
const RUN_OFF = runProcs(SPECS, 3, false);
const pct = (f: ProcFrame[]) => Math.round((f[f.length - 1].busy / f.length) * 100);

const EDGE_KO: Record<string, string> = {
  'new>ready': '승인',
  'ready>running': '디스패치',
  'running>ready': '시간 만료',
  'running>waiting': '입출력 요청',
  'waiting>ready': '입출력 완료',
  'running>done': '종료',
};

function transNote(f: ProcFrame): string {
  const parts = f.trans.map((tr) => `${SPECS[tr.p].name}: ${STATE_KO[tr.from]} → ${STATE_KO[tr.to]} (${EDGE_KO[`${tr.from}>${tr.to}`]})`);
  const born = f.states.map((s, p) => (s === 'new' && !f.trans.some((tr) => tr.p === p) ? `${SPECS[p].name} 생성` : '')).filter(Boolean);
  const all = [...born, ...parts];
  const cpu = f.running >= 0 ? `CPU: ${SPECS[f.running].name}` : 'CPU: 쉼';
  return `t = ${f.t} · ${all.length ? all.join(', ') : '상태 변화 없음'} · ${cpu}`;
}

function StateFigure() {
  const P = usePalette();
  const [multi, setMulti] = useState(true);
  const [quantum, setQuantum] = useState(3);
  const frames = useMemo(() => runProcs(SPECS, quantum, multi), [quantum, multi]);
  const s = useStepper(frames.length, 3, `${multi}|${quantum}`);
  const f = frames[s.i];
  const T_MAX = Math.max(RUN_OFF.length, frames.length);

  // the state diagram with each process drawn inside its current state
  const diagram = useCanvas2D(
    (ctx, { w }) => {
      const pad = 8;
      const nw = Math.max(62, Math.min(118, (w - 2 * pad - 3 * 26) / 4));
      const gap = (w - 2 * pad - 4 * nw) / 3;
      const nh = 58;
      const y1 = 26;
      const y2 = y1 + nh + 58;
      const xs = [0, 1, 2, 3].map((k) => pad + k * (nw + gap));
      const pos: Record<PState, [number, number]> = { new: [xs[0], y1], ready: [xs[1], y1], running: [xs[2], y1], done: [xs[3], y1], waiting: [(xs[1] + xs[2]) / 2, y2] };
      const hot = new Map<string, string>();
      for (const tr of f.trans) if (!hot.has(`${tr.from}>${tr.to}`)) hot.set(`${tr.from}>${tr.to}`, procColor(P, tr.p));
      const edge = (key: string, x1: number, ya: number, x2: number, yb: number, lx: number, ly: number, align: CanvasTextAlign = 'center') => {
        const c = hot.get(key);
        drawArrow(ctx, x1, ya, x2, yb, c ?? alpha(P.ink3, 0.9), c ? 3 : 1.4, c ? 9 : 7);
        label(ctx, P, EDGE_KO[key], lx, ly, c ?? P.ink3, `${c ? 700 : 500} 11px ${P.fontBody}`, align);
      };
      const mid = y1 + nh / 2;
      edge('new>ready', xs[0] + nw + 2, mid, xs[1] - 2, mid, (xs[0] + nw + xs[1]) / 2, y1 - 12);
      edge('ready>running', xs[1] + nw + 2, mid - 9, xs[2] - 2, mid - 9, (xs[1] + nw + xs[2]) / 2, y1 - 12);
      edge('running>ready', xs[2] - 2, mid + 9, xs[1] + nw + 2, mid + 9, (xs[1] + nw + xs[2]) / 2, y1 + nh + 12);
      edge('running>done', xs[2] + nw + 2, mid, xs[3] - 2, mid, (xs[2] + nw + xs[3]) / 2, y1 - 12);
      const [wx] = pos.waiting;
      edge('running>waiting', xs[2] + nw * 0.45, y1 + nh + 2, wx + nw - 6, y2 - 2, Math.min(w - 4, xs[2] + nw * 0.5 + 6), (y1 + nh + y2) / 2 + 6, 'left');
      edge('waiting>ready', wx + 6, y2 - 2, xs[1] + nw * 0.55, y1 + nh + 2, Math.max(4, xs[1] + nw * 0.5 - 6), (y1 + nh + y2) / 2 + 6, 'right');

      (Object.keys(pos) as PState[]).forEach((st) => {
        const [x, y] = pos[st];
        const members = st === 'ready' ? f.ready : f.states.map((v, p) => (v === st ? p : -1)).filter((p) => p >= 0);
        const isRun = st === 'running';
        rrect(ctx, x, y, nw, nh, 6);
        ctx.fillStyle = isRun && f.running >= 0 ? alpha(procColor(P, f.running), 0.12) : P.surface;
        ctx.fill();
        ctx.strokeStyle = isRun ? P.ink : P.lineStrong;
        ctx.lineWidth = isRun ? 2 : 1.4;
        ctx.stroke();
        text(ctx, STATE_KO[st] + (st === 'running' && nw >= 80 ? ' (CPU)' : ''), x + 7, y + 11, P.ink2, `600 11px ${P.fontBody}`);
        const r = nw < 80 ? 8 : 9.5;
        const per = Math.max(1, Math.floor((nw - 8) / (2 * r + 4)));
        members.forEach((p, k) => {
          const cx = x + 6 + r + (k % per) * (2 * r + 4);
          const cy = y + 30 + Math.floor(k / per) * (2 * r + 3);
          token(ctx, P, cx, cy, r, procColor(P, p), SPECS[p].name, st === 'done');
        });
        if (st === 'ready' && members.length > 1) text(ctx, '← 앞', x + nw - 5, y + 11, P.ink3, `10px ${P.fontBody}`, 'right');
      });
    },
    [P, f],
    { height: 228, minHeight: 40 },
  );

  // the timeline: one row per process plus the CPU
  const rows = SPECS.length + 1;
  const gantt = useCanvas2D(
    (ctx, { w }) => {
      const lw = 34;
      const top = 4;
      const rh = 18;
      const cw = (w - lw - 6) / T_MAX;
      const X = (t: number) => lw + t * cw;
      for (let r = 0; r < rows; r++) {
        const y = top + r * (rh + 4);
        text(ctx, r === 0 ? 'CPU' : SPECS[r - 1].name, 4, y + rh / 2, r === 0 ? P.ink : procColor(P, r - 1), `700 11px ${P.fontMono}`);
        ctx.fillStyle = P.surface2;
        ctx.fillRect(X(0), y, T_MAX * cw, rh);
      }
      for (let t = 0; t <= s.i; t++) {
        const fr = frames[t];
        if (fr.running >= 0) {
          ctx.fillStyle = procColor(P, fr.running);
          ctx.fillRect(X(t), top, Math.max(1, cw - 0.5), rh);
        } else hatch(ctx, X(t), top, cw, rh, alpha(P.ink3, 0.5), 4);
        fr.states.forEach((st, p) => {
          const y = top + (p + 1) * (rh + 4);
          const c = procColor(P, p);
          if (st === 'running') {
            ctx.fillStyle = c;
            ctx.fillRect(X(t), y, Math.max(1, cw - 0.5), rh);
          } else if (st === 'ready' || st === 'new') {
            ctx.fillStyle = alpha(c, st === 'new' ? 0.12 : 0.28);
            ctx.fillRect(X(t), y + 4, Math.max(1, cw - 0.5), rh - 8);
          } else if (st === 'waiting') hatch(ctx, X(t), y + 2, cw, rh - 4, alpha(c, 0.9), 4, 1.2);
        });
      }
      // the current tick
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(s.i) + 0.5, top - 2, Math.max(2, cw - 1), rows * (rh + 4));
      const yb = top + rows * (rh + 4) + 4;
      for (let t = 0; t <= T_MAX; t += 10) text(ctx, String(t), X(t), yb + 6, P.ink3, `10px ${P.fontMono}`, t === 0 ? 'left' : 'center');
    },
    [P, frames, s.i, T_MAX],
    { height: 4 + rows * 22 + 22, minHeight: 40 },
  );

  const done = f.states.filter((x) => x === 'done').length;
  return (
    <Figure
      no={1}
      title="프로세스 네 개, CPU 하나"
      hint="재생하거나 한 틱씩 넘겨 보세요"
      caption={
        <>
          위는 상태 전이도로, 각 프로세스가 지금 어느 상태에 있는지 동그라미로 보여 줍니다. 방금 일어난 전이는 그 프로세스의 색으로 굵게 칠합니다. 아래는 지금까지의 기록으로, 가로축이 시간(틱)입니다. 꽉 찬 칸은 CPU에서 실행, 옅은 칸은 준비 큐에서 차례를 기다림, 빗금 칸은 입출력(디스크, 네트워크)을 기다리는 중입니다. 맨 위 CPU 줄의 회색 빗금은 CPU가 할 일이 없이 논 시간입니다. 각 프로세스는 CPU 작업과 입출력을 번갈아 하고, 한 번에 최대 타임 슬라이스만큼 CPU를 씁니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={diagram.wrapRef} className="canvas-box" role="img" aria-label={`프로세스 상태 전이도, 시각 ${f.t}. ${SPECS.map((sp, p) => `${sp.name}: ${f.states[p] ? STATE_KO[f.states[p] as PState] : '아직 없음'}`).join(', ')}`}>
            <canvas ref={diagram.canvasRef} />
          </div>
          <div ref={gantt.wrapRef} className="canvas-box" role="img" aria-label={`시각 0부터 ${f.t}까지 CPU와 프로세스 A부터 D의 상태 기록. CPU 사용률 ${Math.round((f.busy / (f.t + 1)) * 100)}%`}>
            <canvas ref={gantt.canvasRef} />
          </div>
          <div className="os-note" aria-live="polite">
            {transNote(f)}
          </div>
        </div>
        <div className="controls">
          <Check label="입출력을 기다리는 동안 다른 프로세스 실행" checked={multi} onChange={setMulti} />
          <Seg label="타임 슬라이스 (틱)" value={quantum} onChange={setQuantum} options={[2, 3, 6].map((v) => ({ value: v, label: String(v) }))} />
          <StepControls s={s} id="proc-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="시각" value={`${f.t}틱`} />
            <Readout label="CPU 사용률" value={`${Math.round((f.busy / (f.t + 1)) * 100)}%`} color="var(--good)" />
            <Readout label="준비 큐" value={f.ready.map((p) => SPECS[p].name).join(' ') || '—'} />
            <Readout label="끝난 프로세스" value={`${done} / ${SPECS.length}`} />
          </div>
          <div className="os-small">모두 끝나는 데 {frames.length - 1}틱 (CPU가 실제로 일한 시간은 {CPU_TOTAL}틱)</div>
        </div>
      </div>
      <Legend
        items={[
          ...SPECS.map((sp, p) => ({ color: PROC_CSS[p], label: sp.name, shape: 'sq' as const })),
          { color: 'var(--ink-3)', label: '옅은 칸: 준비 · 빗금: 입출력 대기', shape: 'ln' as const },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: time slice versus switch cost ─────────────── */

const fmtMs = (ms: number) => (ms < 1 ? `${Math.round(ms * 1000)}µs` : ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`);

function SliceFigure() {
  const P = usePalette();
  const [qExp, setQExp] = useState(Math.log10(4)); // time slice in ms, as log10
  const [cost, setCost] = useState(50); // µs per switch, direct plus cache refill
  const [n, setN] = useState(6);
  const q = 10 ** qExp;
  const c = cost / 1000;
  const eff = q / (q + c);
  const wait = (n - 1) * (q + c);

  const strip = useCanvas2D(
    (ctx, { w }) => {
      const span = 2 * n * (q + c); // two full rounds
      const x0 = 4;
      const sw = w - 8;
      const X = (t: number) => x0 + (t / span) * sw;
      let t = 0;
      for (let k = 0; k < 2 * n; k++) {
        ctx.fillStyle = procColor(P, k % n);
        ctx.fillRect(X(t), 8, Math.max(0.6, X(t + q) - X(t)), 30);
        t += q;
        // the switch: at least one pixel so it never vanishes completely
        ctx.fillStyle = P.ink;
        ctx.fillRect(X(t), 4, Math.max(1, X(t + c) - X(t)), 38);
        t += c;
      }
      text(ctx, '0', x0, 52, P.ink3, `10px ${P.fontMono}`, 'left');
      text(ctx, `${fmtMs(span)} (모두 두 바퀴)`, w - 4, 52, P.ink3, `10px ${P.fontMono}`, 'right');
    },
    [P, q, c, n],
    { height: 60, minHeight: 40 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 14;
      const top = (h - gap) / 2;
      const xMin = -1.3;
      const xMax = 2;
      const pad = { l: 44, r: 22, t: 20, b: 6 };
      const p1 = new Plot(ctx, w, top, P, { xMin, xMax, yMin: 0, yMax: 100, pad });
      p1.grid({ xStep: 1, yStep: 25, labels: false });
      for (const y of [0, 50, 100]) text(ctx, `${y}%`, p1.X(xMin) - 5, p1.Y(y), P.ink3, `10px ${P.fontMono}`, 'right');
      text(ctx, '쓸모 있는 일에 쓰인 CPU', p1.X(xMin), 9, P.ink2, `12px ${P.fontBody}`);
      p1.fn((x) => (100 * 10 ** x) / (10 ** x + c), P.good, 2.4, { samples: 160 });
      p1.line(qExp, 0, qExp, 100, alpha(P.ink, 0.4), 1.2, [4, 4]);
      p1.dot(qExp, eff * 100, 5, P.good, P.surface, 2);

      ctx.save();
      ctx.translate(0, top + gap);
      const yMax = 400;
      const p2 = new Plot(ctx, w, h - top - gap, P, { xMin, xMax, yMin: 0, yMax, pad: { l: 44, r: 22, t: 20, b: 22 } });
      p2.grid({ xStep: 1, yStep: 100, labels: false });
      for (const y of [0, 200, 400]) text(ctx, `${y}`, p2.X(xMin) - 5, p2.Y(y), P.ink3, `10px ${P.fontMono}`, 'right');
      for (const e of [-1, 0, 1, 2]) text(ctx, fmtMs(10 ** e), p2.X(e), p2.Y(0) + 11, P.ink3, `10px ${P.fontMono}`, 'center');
      text(ctx, '다시 차례가 오기까지 최대 (ms)', p2.X(xMin), 9, P.ink2, `12px ${P.fontBody}`);
      p2.line(xMin, 100, xMax, 100, alpha(P.bad, 0.7), 1.2, [5, 4]);
      text(ctx, '100ms: 굼뜨다고 느끼기 시작', p2.X(xMin) + 4, p2.Y(100) - 8, P.bad, `10px ${P.fontBody}`, 'left');
      p2.clip();
      p2.fn((x) => (n - 1) * (10 ** x + c), P.pos, 2.4, { samples: 160 });
      p2.unclip();
      if (wait <= yMax) p2.dot(qExp, wait, 5, P.pos, P.surface, 2);
      p2.line(qExp, 0, qExp, yMax, alpha(P.ink, 0.4), 1.2, [4, 4]);
      ctx.restore();
    },
    [P, q, c, n, qExp, eff, wait],
    { aspect: 1.7, maxHeight: 340, minHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="타임 슬라이스는 얼마나 길어야 할까"
      hint="슬라이스와 교환 비용을 바꿔 보세요"
      caption={
        <>
          위 띠는 프로세스 {n}개가 돌아가며 CPU를 쓰는 모습을 두 바퀴 그린 것입니다. 색 칸이 각 프로세스의 타임 슬라이스이고, 그 사이의 검은 칸이 문맥 교환입니다(너무 얇아도 1픽셀은 그립니다). 아래 두 그래프의 가로축은 타임 슬라이스(로그 눈금)입니다. 교환 비용에는 레지스터를 저장하는 직접 비용과, 캐시와 TLB가 식어서 생기는 간접 비용을 함께 넣었다고 생각하세요.
        </>
      }
    >
      <div ref={strip.wrapRef} className="canvas-box" role="img" aria-label={`프로세스 ${n}개가 ${fmtMs(q)}씩 번갈아 실행되고 그 사이마다 ${cost}µs의 문맥 교환이 끼는 시간 띠`}>
        <canvas ref={strip.canvasRef} />
      </div>
      <div className="fig-split">
        <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`타임 슬라이스 ${fmtMs(q)}에서 CPU 효율 ${(eff * 100).toFixed(1)}%, 내 차례가 다시 오기까지 최대 ${wait.toFixed(1)}ms`}>
          <canvas ref={plot.canvasRef} />
        </div>
        <div className="controls">
          <Slider id="slice-q" label="타임 슬라이스" value={qExp} min={-1.3} max={2} step={0.05} onChange={setQExp} format={(v) => fmtMs(10 ** v)} />
          <Slider id="slice-c" label="문맥 교환 1회 비용" value={cost} min={1} max={500} step={1} onChange={setCost} format={(v) => `${v}µs`} />
          <Slider id="slice-n" label="실행할 프로세스 수" value={n} min={2} max={6} step={1} onChange={setN} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="CPU 효율" value={`${(eff * 100).toFixed(1)}%`} color="var(--good)" />
            <Readout label="교환으로 버림" value={`${((1 - eff) * 100).toFixed(1)}%`} color="var(--bad)" />
            <Readout label="초당 문맥 교환" value={`${Math.round(1000 / (q + c)).toLocaleString('ko-KR')}번`} />
            <Readout label="다시 차례까지" value={fmtMs(wait)} color="var(--pos)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: fork() makes a tree ─────────────── */

interface ForkNode {
  pid: number;
  born: number; // index of the fork() call that created it (-1: the original)
  row: number;
  parentRow: number;
  exec: boolean;
}

function forkTree(n: number, execChild: boolean): ForkNode[] {
  // pids follow creation order: at fork call j every live process (in pid order) makes one child
  const procs: { pid: number; born: number; parent: number; exec: boolean }[] = [{ pid: 1000, born: -1, parent: -1, exec: false }];
  for (let j = 0; j < n; j++) {
    const live = procs.filter((p) => !p.exec);
    for (const p of live) procs.push({ pid: 1000 + procs.length, born: j, parent: p.pid, exec: execChild });
  }
  // rows: a process, then its children's subtrees with the latest child first, so branch lines never cross
  const out: ForkNode[] = [];
  const place = (pid: number, parentRow: number) => {
    const me = procs.find((p) => p.pid === pid)!;
    const row = out.length;
    out.push({ pid, born: me.born, row, parentRow, exec: me.exec });
    const kids = procs.filter((p) => p.parent === pid).sort((a, b) => b.born - a.born);
    for (const k of kids) place(k.pid, row);
  };
  place(1000, -1);
  return out;
}

function ForkFigure() {
  const P = usePalette();
  const [n, setN] = useState(3);
  const [execChild, setExecChild] = useState(false);
  const nodes = useMemo(() => forkTree(n, execChild), [n, execChild]);
  const his = nodes.filter((x) => !x.exec).length;
  const rh = nodes.length > 9 ? 16 : 24;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const lw = 50;
      const right = 46;
      const top = 22;
      const X = (j: number) => lw + ((j + 1) / (n + 1)) * (w - lw - right);
      const Y = (r: number) => top + r * rh + rh / 2;
      text(ctx, 'fork()', 4, 9, P.ink3, `10px ${P.fontMono}`);
      for (let j = 0; j < n; j++) text(ctx, `#${j + 1}`, X(j), 9, P.ink3, `10px ${P.fontMono}`, 'center');
      for (let j = 0; j < n; j++) {
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(j), top);
        ctx.lineTo(X(j), Y(nodes.length - 1) + rh / 2);
        ctx.stroke();
      }
      const endX = w - right;
      nodes.forEach((nd) => {
        const y = Y(nd.row);
        const x0 = nd.born < 0 ? lw : X(nd.born);
        const col = nd.exec ? P.stats2 : nd.born < 0 ? P.ink : P.neg;
        if (nd.parentRow >= 0) {
          ctx.strokeStyle = alpha(col, 0.8);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x0, Y(nd.parentRow));
          ctx.lineTo(x0, y);
          ctx.stroke();
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(nd.exec ? x0 + 26 : endX, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x0, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        text(ctx, String(nd.pid), 4, y, nd.born < 0 ? P.ink : P.ink2, `${nd.born < 0 ? 700 : 400} ${rh < 20 ? 10 : 11}px ${P.fontMono}`);
        if (nd.exec) text(ctx, 'ls', x0 + 31, y, P.stats2, `600 ${rh < 20 ? 10 : 11}px ${P.fontMono}`);
        else text(ctx, '"hi"', endX + 5, y, P.good, `600 ${rh < 20 ? 10 : 11}px ${P.fontMono}`);
      });
    },
    [P, nodes, n, rh],
    { height: 22 + nodes.length * rh + 6, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="fork()를 여러 번 부르면"
      hint="fork() 횟수를 바꿔 보세요"
      caption={
        <>
          가로로 그은 선 하나가 프로세스 하나이고, 왼쪽 숫자가 그 프로세스의 번호(PID)입니다. 세로선은 fork()가 자식을 만드는 순간입니다. fork()는 부르는 프로세스 하나를 둘로 만들고, 둘 다 fork() 다음 줄부터 이어서 실행합니다. 그래서 이미 만들어진 자식도 다음 fork()를 부릅니다. 실제 PID는 운영체제가 정하고, 어느 프로세스가 먼저 실행될지도 그때그때 다릅니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <Code label="fork를 n번 부르는 C 프로그램">{execChild ? `for (int i = 0; i < ${n}; i++) {\n  if (fork() == 0) {             // 자식이면\n    execlp("ls", "ls", NULL);   // ls 프로그램으로 바뀐다\n  }\n}\nprintf("hi\\n");                 // 부모만 여기에 온다` : `for (int i = 0; i < ${n}; i++) {\n  fork();                       // 부른 프로세스가 둘이 된다\n}\nprintf("hi\\n");                 // 몇 번 찍힐까?`}</Code>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`fork를 ${n}번 부른 결과 프로세스 ${nodes.length}개가 만들어지고 hi가 ${his}번 출력되는 프로세스 나무`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="fork() 횟수" value={n} onChange={setN} options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
          <Check label="자식은 곧바로 exec(&quot;ls&quot;)" checked={execChild} onChange={setExecChild} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="프로세스 수" value={`${nodes.length}개`} />
            <Readout label='"hi" 출력' value={`${his}번`} color="var(--good)" />
          </div>
          <div className="os-small">{execChild ? <>자식은 exec 이후 우리 코드를 잊고 ls가 됩니다. 셸이 명령을 실행할 때 쓰는 모양입니다.</> : <>fork()를 n번 부르면 프로세스는 <M>{'2^n'}</M>개가 됩니다.</>}</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: process vs thread memory, with copy-on-write ─────────────── */

type Mode = 'fork' | 'thread';
const MEM_STEPS = 4;
const MEM_NOTE: Record<Mode, string[]> = {
  fork: [
    '프로세스 하나가 x = 10을 데이터 영역에 두고 실행 중입니다. 가상 주소 공간의 각 영역은 물리 메모리의 프레임을 가리킵니다.',
    'fork() 직후: 자식은 부모의 주소 공간을 그대로 본뜬 자기만의 주소 공간을 받습니다. 하지만 물리 프레임은 아직 복사하지 않고 함께 가리키며, 둘 다 읽기 전용으로 표시합니다(쓰기 시 복사).',
    '자식이 x = 20을 쓰려는 순간 보호 위반이 나고, 운영체제가 데이터 프레임 하나만 복사해 자식에게 줍니다. 자식의 x는 20, 부모의 x는 여전히 10입니다.',
    '부모가 x를 출력하면 10입니다. 두 프로세스는 서로의 메모리를 볼 수 없습니다. 주고받으려면 파이프, 소켓, 공유 메모리 같은 별도의 통로가 필요합니다.',
  ],
  thread: [
    '프로세스 하나가 x = 10을 데이터 영역에 두고 실행 중입니다. 스레드는 아직 하나(메인 스레드)입니다.',
    '스레드를 하나 더 만들면 주소 공간은 그대로이고 스택과 레지스터만 새로 생깁니다. 코드, 데이터, 힙은 두 스레드가 함께 씁니다.',
    '스레드 B가 x = 20을 씁니다. 같은 데이터 프레임이므로 복사도, 보호 위반도 없습니다.',
    '스레드 A가 x를 출력하면 20입니다. 통신이 공짜인 대신, 두 스레드가 동시에 x를 고치면 무슨 일이 생길지는 3장에서 봅니다.',
  ],
};

function MemoryFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<Mode>('fork');
  const s = useStepper(MEM_STEPS, 1, mode);
  const k = s.i;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: fullW }) => {
      // keep the drawing compact on wide screens
      const w = Math.min(fullW, 540);
      ctx.translate((fullW - w) / 2, 0);
      const two = mode === 'fork' && k >= 1;
      const regions = mode === 'thread' && k >= 1 ? ['코드', '데이터', '힙', '스택 A', '스택 B'] : ['코드', '데이터', '힙', '스택'];
      const fw = Math.min(118, w * 0.27);
      const vw = Math.min(118, w * 0.27);
      const rh = 30;
      const top = 30;
      const physX = w - fw - 6;
      const vx = two ? [6, 6 + vw + Math.max(10, (physX - 2 * vw - 6) * 0.25)] : [6];
      const names = mode === 'fork' ? ['부모 (PID 1000)', '자식 (PID 1001)'] : ['프로세스 (스레드 ' + (k >= 1 ? 'A, B' : 'A') + ')'];
      // physical frames: code, data, heap, stack, [stack 2 / child's data copy]
      const frames: { label: string; color: string; ro?: boolean }[] = [
        { label: '코드', color: P.ink3 },
        { label: 'x = ' + (mode === 'thread' && k >= 2 ? 20 : 10), color: P.neg },
        { label: '힙', color: P.ink3 },
        { label: mode === 'thread' && k >= 1 ? '스택 A' : '스택', color: P.ink3 },
      ];
      if (mode === 'fork' && k >= 1) frames.push({ label: '자식 스택', color: P.ink3 });
      if (mode === 'thread' && k >= 1) frames.push({ label: '스택 B', color: P.ink3 });
      if (mode === 'fork' && k >= 2) frames.push({ label: 'x = 20 (복사본)', color: P.pos });
      const fh = 26;
      const fgap = 6;
      const FY = (i: number) => top + i * (fh + fgap);
      text(ctx, '물리 메모리', physX, 12, P.ink2, `600 11px ${P.fontBody}`);
      frames.forEach((fr, i) => {
        box(ctx, physX, FY(i), fw, fh, alpha(fr.color, fr.color === P.ink3 ? 0.1 : 0.18), fr.color, 1.4);
        text(ctx, fr.label, physX + fw / 2, FY(i) + fh / 2, P.ink, `600 11px ${P.fontMono}`, 'center');
      });
      const shared = mode === 'fork' && k === 1;
      // two passes: the mapping lines first, then the boxes on top so no line crosses a label
      for (const pass of [0, 1]) {
        vx.forEach((x, s2) => {
          if (pass === 1) text(ctx, names[s2], x, 12, P.ink2, `600 11px ${P.fontBody}`);
          regions.forEach((rg, i) => {
            const y = top + i * (rh + 6);
            const isData = rg === '데이터';
            if (pass === 1) {
              const val = isData ? (mode === 'thread' ? (k >= 2 ? 20 : 10) : s2 === 1 && k >= 2 ? 20 : 10) : null;
              const fill = isData ? alpha(s2 === 1 && k >= 2 ? P.pos : P.neg, 0.14) : P.surface2;
              // shared frames are marked read-only (red dashes) until someone writes
              const ro = shared && rg !== '스택';
              box(ctx, x, y, vw, rh, P.surface, P.surface, 0);
              box(ctx, x, y, vw, rh, fill, ro ? P.bad : P.lineStrong, ro ? 1.6 : 1.2, ro ? [4, 3] : undefined);
              text(ctx, val !== null ? `데이터 x=${val}` : rg, x + 6, y + rh / 2, P.ink, `11px ${P.fontMono}`);
              return;
            }
            // which frame this region maps to
            let fi = ['코드', '데이터', '힙', '스택'].indexOf(rg);
            if (rg === '스택 A') fi = 3;
            if (rg === '스택 B') fi = 4;
            if (mode === 'fork' && s2 === 1 && rg === '스택') fi = 4;
            if (mode === 'fork' && s2 === 1 && isData && k >= 2) fi = 5;
            const hot = (isData && k >= 2) || (k === 1 && s2 === 1) || (mode === 'thread' && k === 1 && rg === '스택 B');
            const col = hot ? (isData && mode === 'fork' && s2 === 1 ? P.pos : P.ink) : alpha(P.ink3, 0.7);
            ctx.strokeStyle = col;
            ctx.lineWidth = hot ? 1.8 : 1.1;
            ctx.beginPath();
            const sx = x + vw;
            const sy = y + rh / 2;
            const ex = physX - 3;
            const ey = FY(fi) + fh / 2;
            ctx.moveTo(sx, sy);
            ctx.bezierCurveTo(sx + 30, sy, ex - 30, ey, ex, ey);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();
          });
        });
      }
    },
    [P, mode, k],
    { height: 30 + 6 * 32 + 6, minHeight: 40 },
  );

  const parentX = mode === 'thread' && k >= 2 ? 20 : 10;
  const childX = k >= 2 ? 20 : k >= 1 ? 10 : null;
  return (
    <Figure
      no={4}
      title="fork()한 프로세스와 스레드의 메모리"
      hint="두 방식을 같은 단계로 비교해 보세요"
      caption={
        <>
          왼쪽은 각 프로세스(또는 스레드)가 보는 가상 주소 공간, 오른쪽은 실제 물리 메모리입니다. 선은 각 영역이 어느 프레임에 놓여 있는지를 가리킵니다. 실제로는 영역마다 프레임이 수십에서 수천 개지만 하나로 줄여 그렸습니다. 주소를 바꿔 주는 장치는 4장에서 자세히 봅니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${mode === 'fork' ? 'fork로 만든 두 프로세스' : '한 프로세스 안의 두 스레드'}의 메모리 배치, 단계 ${k + 1}`}>
            <canvas ref={canvasRef} />
          </div>
          <Legend
            items={[
              { color: 'var(--neg)', label: '원래의 x', shape: 'sq' },
              { color: 'var(--pos)', label: '복사된 x', shape: 'sq' },
              { color: 'var(--bad)', label: '빨간 점선: 읽기 전용으로 공유', shape: 'ln' },
            ]}
          />
          <div className="os-note" aria-live="polite">
            {MEM_NOTE[mode][k]}
          </div>
        </div>
        <div className="controls">
          <Seg label="만드는 방법" value={mode} onChange={setMode} options={[{ value: 'fork', label: 'fork() 프로세스' }, { value: 'thread', label: '스레드' }]} />
          <StepControls s={s} id="mem-speed" maxSpeed={3} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={mode === 'fork' ? '부모가 보는 x' : 'A가 보는 x'} value={String(parentX)} color="var(--neg)" />
            <Readout label={mode === 'fork' ? '자식이 보는 x' : 'B가 보는 x'} value={childX === null ? '—' : String(childX)} color={childX === 20 ? 'var(--pos)' : undefined} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Processes() {
  return (
    <>
      <h2>프로그램과 프로세스</h2>
      <p>
        디스크에 있는 <code>chrome</code>이나 <code>python</code> 파일은 <T en="program">프로그램</T>입니다. 명령어와 데이터가 적힌 파일일 뿐, 스스로는 아무것도 하지 않습니다. 그 파일을 실행하면 운영체제가 메모리를 내주고, 프로그램을 거기에 올리고, CPU가 첫 명령어부터 읽게 합니다. 이렇게 실행 중인 프로그램 하나를 <T en="process">프로세스</T>라고 합니다. 같은 프로그램을 두 번 실행하면 프로세스가 둘 생기고, 둘은 서로 다른 메모리를 씁니다. 터미널에서 <code>ps aux</code>를 치거나 작업 관리자를 열면 지금 이 순간에도 수백 개가 떠 있는 것을 볼 수 있습니다.
      </p>
      <p>
        운영체제는 프로세스마다 <T en="process control block, PCB">프로세스 제어 블록</T>이라는 기록을 하나씩 둡니다. 프로세스 번호(PID), 지금 상태, 다음에 실행할 명령어의 주소(프로그램 카운터), 레지스터 값, 메모리 배치, 열어 둔 파일 목록 같은 것이 들어 있습니다. 프로세스를 멈췄다가 나중에 이어서 실행할 수 있는 것은 이 기록 덕분입니다. CPU가 명령어를 읽고 레지스터를 쓰는 방식은 <a href={courseHref('cs-architecture')}>컴퓨터 구조</a> 과목에서 다룹니다.
      </p>

      <h2>프로세스의 다섯 가지 상태</h2>
      <p>
        CPU 코어 하나는 한 순간에 프로세스 하나만 실행합니다. 나머지는 차례를 기다리거나, 디스크나 네트워크가 데이터를 가져다주기를 기다립니다. 그래서 운영체제는 프로세스마다 지금 무엇을 하고 있는지를 상태로 기록합니다.
      </p>
      <ul>
        <li>
          <T en="new">생성</T>: 막 만들어져 메모리와 PCB를 준비하는 중입니다.
        </li>
        <li>
          <T en="ready">준비</T>: 당장이라도 실행할 수 있지만 CPU가 다른 프로세스에게 가 있습니다. 준비 상태의 프로세스는 <T en="ready queue">준비 큐</T>에 줄을 섭니다.
        </li>
        <li>
          <T en="running">실행</T>: 지금 CPU에서 명령어를 실행하고 있습니다.
        </li>
        <li>
          <T en="waiting / blocked">대기</T>: 파일 읽기, 네트워크 응답, 키보드 입력처럼 CPU 밖의 일이 끝나기를 기다립니다. 이 동안은 CPU를 줘도 할 일이 없습니다.
        </li>
        <li>
          <T en="terminated">종료</T>: 실행을 마쳤고, 부모가 종료 코드를 거둬 가면 PCB까지 사라집니다.
        </li>
      </ul>
      <p>그림 1에서 프로세스 A~D가 이 상태들 사이를 오가는 모습을 한 틱씩 따라가 보세요.</p>
      <StateFigure />
      <p>
        처음 몇 틱을 보면 A가 CPU를 2틱 쓰고 입출력을 요청해 대기로 갑니다. 그 순간 CPU는 준비 큐 맨 앞의 B에게 넘어갑니다. B는 8틱이 필요하지만 타임 슬라이스 3틱을 다 쓰면 시간 만료로 준비 큐 맨 뒤로 갑니다. 이렇게 일부러 끊는 것을 <T en="preemption">선점</T>이라고 합니다. 선점 덕분에 오래 걸리는 프로세스 하나가 CPU를 독차지하지 못합니다.
      </p>
      <p>
        이제 체크 상자를 꺼 보세요. 한 프로세스가 끝날 때까지 CPU를 쥐고 있는, 옛날 일괄 처리 시스템처럼 동작합니다. 프로세스가 입출력을 기다리는 동안 CPU도 같이 놉니다. 같은 일을 하는데 모두 끝나는 시각이 {RUN_ON.length - 1}틱에서 {RUN_OFF.length - 1}틱으로 늘고, CPU 사용률은 {pct(RUN_ON)}%에서 {pct(RUN_OFF)}%로 떨어집니다. 입출력이 CPU보다 수천에서 수백만 배 느린 실제 컴퓨터에서는 차이가 훨씬 큽니다. 기다리는 동안 다른 프로세스를 돌리는 것, 이것이 <T en="multiprogramming">다중 프로그래밍</T>이고 운영체제가 존재하는 첫째 이유입니다.
      </p>
      <Callout kind="intuition">
        CPU 하나로 여러 프로그램이 동시에 도는 것처럼 보이는 것은 착시입니다. 운영체제가 몇 밀리초마다 CPU를 다른 프로세스에게 넘기기 때문에, 사람의 눈에는 음악이 재생되면서 동시에 코드가 컴파일되는 것처럼 보입니다. 실제로 동시에 실행하는 <T en="parallelism">병렬</T>은 코어가 여러 개일 때만 가능하고, 하나를 번갈아 쓰는 것은 <T en="concurrency">동시성</T>이라고 구분해 부릅니다.
      </Callout>

      <h2>문맥 교환과 그 비용</h2>
      <p>
        CPU를 A에서 B로 넘기려면 A가 쓰던 레지스터 값과 프로그램 카운터를 A의 PCB에 저장하고, B의 PCB에서 B의 값을 꺼내 레지스터에 다시 채워야 합니다. 이 일을 <T en="context switch">문맥 교환</T>이라고 합니다. 교환은 타이머 인터럽트(시간 만료)나 시스템 콜(입출력 요청) 때 커널 안에서 일어납니다.
      </p>
      <p>
        교환하는 동안 CPU는 어느 프로세스의 일도 하지 않습니다. 레지스터를 옮기는 직접 비용은 요즘 CPU에서 마이크로초 남짓이지만, 더 큰 것은 간접 비용입니다. B가 쓸 데이터는 캐시에 없고, 주소 변환을 기억하던 TLB도 비워야 할 수 있어서(4장), 교환 직후 한동안 B는 느리게 달립니다. 그래서 타임 슬라이스를 짧게 할수록 사용자에게는 빠르게 반응하지만, 교환에 버리는 시간이 늘어납니다.
      </p>
      <SliceFigure />
      <p>
        교환 비용을 50µs로 두고 타임 슬라이스를 0.1ms까지 줄여 보세요. CPU 시간의 3분의 1을 교환에 버립니다. 반대로 100ms로 늘리면 효율은 100%에 가깝지만, 프로세스 6개가 돌 때 내 차례가 다시 오기까지 0.5초가 걸려 키를 눌러도 화면이 늦게 반응합니다. 실제 운영체제의 타임 슬라이스가 대개 수 밀리초에서 수십 밀리초 사이인 것은 이 두 곡선 사이의 타협입니다. 리눅스의 기본 스케줄러는 고정된 슬라이스 대신, 실행할 프로세스 수에 따라 슬라이스를 나눠 주되 너무 짧아지지 않게 아래 한계를 둡니다.
      </p>

      <h2>fork와 exec: 프로세스를 만드는 법</h2>
      <p>
        유닉스 계열 운영체제(리눅스, macOS)에서 새 프로세스는 기존 프로세스가 자기를 복제해서 만듭니다. <code>fork()</code>를 부르면 부르는 프로세스와 똑같은 사본이 하나 생기고, 둘 다 <code>fork()</code>가 돌아온 지점부터 이어서 실행합니다. 차이는 반환값 하나뿐입니다. 부모는 자식의 PID를, 자식은 0을 받습니다. 다른 프로그램을 실행하려면 자식이 <code>exec()</code>를 불러 자기 메모리를 새 프로그램으로 통째로 갈아 끼웁니다.
      </p>
      <Code label="셸이 명령 하나를 실행하는 방식">{`
pid_t pid = fork();              // 여기서 프로세스가 둘이 된다
if (pid == 0) {
  // 자식: 0을 받았다
  execvp("ls", argv);            // 성공하면 이 아래는 실행되지 않는다
  perror("exec 실패");
  exit(1);
} else {
  // 부모: 자식의 PID를 받았다
  int status;
  waitpid(pid, &status, 0);      // 자식이 끝날 때까지 대기 상태로
  printf("종료 코드 %d\\n", WEXITSTATUS(status));
}`}</Code>
      <p>
        터미널에서 <code>ls</code>를 칠 때마다 셸은 정확히 이 일을 합니다. 복제와 갈아 끼우기를 나눈 덕분에, 셸은 그 사이에 자식의 표준 출력을 파일로 돌리거나(<code>ls &gt; out.txt</code>) 파이프로 잇는 일을 자식 쪽 코드에서 간단히 할 수 있습니다. 그림 3에서 반복문 안에서 <code>fork()</code>를 부르면 어떻게 되는지 보세요.
      </p>
      <ForkFigure />
      <Callout kind="warn">
        자식이 끝났는데 부모가 <code>wait()</code>로 종료 코드를 거둬 가지 않으면, 자식의 PCB가 지워지지 않고 남습니다. 이런 프로세스를 <T en="zombie">좀비</T>라고 합니다. 오래 도는 서버가 자식을 만들고 거두지 않으면 좀비가 쌓여 PID가 바닥날 수 있습니다. 반대로 부모가 먼저 죽은 <T en="orphan">고아</T> 프로세스는 init(PID 1)이 대신 거둡니다.
      </Callout>

      <h2>스레드: 주소 공간을 함께 쓰는 실행 흐름</h2>
      <p>
        프로세스는 서로 떨어져 있어서 안전하지만, 같은 일을 나눠 하려면 불편합니다. 웹 서버가 요청마다 프로세스를 하나씩 만들면, 함께 쓰는 캐시 하나를 공유하기도 어렵고 만드는 비용도 큽니다. 그래서 한 프로세스 안에 실행 흐름을 여러 개 두는 <T en="thread">스레드</T>가 생겼습니다. 스레드는 코드, 전역 데이터, 힙, 열린 파일을 모두 함께 쓰고, 자기만의 것은 스택과 레지스터(프로그램 카운터 포함)뿐입니다.
      </p>
      <MemoryFigure />
      <p>
        fork()가 주소 공간 전체를 복사한다면 아주 느리겠지만, 실제로는 그림 4의 둘째 단계처럼 프레임을 함께 가리키고 읽기 전용으로 표시만 해 둡니다. 누군가 쓰려는 순간에만 그 페이지 하나를 복사하는 <T en="copy-on-write">쓰기 시 복사</T>입니다. 곧바로 exec()할 자식이라면 복사는 거의 일어나지 않습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>프로세스</th>
              <th>스레드</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>메모리</td>
              <td>각자 따로 (서로 볼 수 없음)</td>
              <td>코드·데이터·힙 공유, 스택만 따로</td>
            </tr>
            <tr>
              <td>만드는 비용</td>
              <td>큼 (주소 공간, 페이지 테이블)</td>
              <td>작음 (스택과 레지스터)</td>
            </tr>
            <tr>
              <td>통신</td>
              <td>파이프, 소켓, 공유 메모리</td>
              <td>그냥 같은 변수를 읽고 씀</td>
            </tr>
            <tr>
              <td>하나가 죽으면</td>
              <td>그 프로세스만 죽음</td>
              <td>프로세스 전체가 죽음</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        실제 소프트웨어는 이 표를 보고 고릅니다. 크롬은 탭마다 렌더러 프로세스를 따로 두어, 한 탭의 페이지가 죽거나 해킹당해도 다른 탭과 브라우저 본체가 무사하게 합니다. 반면 게임 엔진이나 데이터베이스는 같은 메모리를 빠르게 나눠 쓰려고 스레드를 씁니다. Node.js는 기본적으로 자바스크립트를 스레드 하나에서 실행하고, 무거운 계산이 필요하면 <code>worker_threads</code>로 스레드를, <code>child_process</code>로 프로세스를 따로 만듭니다.
      </p>

      <Callout kind="key">
        프로세스는 실행 중인 프로그램이고, 운영체제는 PCB에 그 상태를 적어 두고 생성, 준비, 실행, 대기, 종료 사이를 옮깁니다. 입출력을 기다리는 동안 다른 프로세스에게 CPU를 넘기는 것이 다중 프로그래밍이고, 넘길 때마다 문맥 교환 비용을 냅니다. 유닉스는 fork()로 복제하고 exec()로 갈아 끼워 프로세스를 만들며, 스레드는 한 주소 공간을 함께 쓰는 여러 실행 흐름입니다. 다음 장에서는 준비 큐에서 누구를 먼저 꺼낼지 정하는 <a href={lessonHref('cs-operating-systems', 'scheduling')}>CPU 스케줄링</a>을 봅니다.
      </Callout>
      <Quiz
        q="웹 서버가 요청 하나를 처리할 때 CPU 계산은 1ms, 데이터베이스 응답 대기는 9ms 걸린다. CPU 코어가 하나일 때, 요청을 하나씩 끝까지 처리하는 대신 대기 중에 다른 요청을 처리하게 하면 초당 처리량은 최대 얼마까지 늘 수 있을까?"
        options={['그대로다. CPU가 하나이므로 동시에 하나밖에 못 한다', '약 2배', '약 10배', '무한히 늘어난다']}
        answer={2}
        explain={<>하나씩 처리하면 요청당 10ms이므로 초당 100개입니다. 기다리는 9ms 동안 다른 요청의 계산을 채워 넣으면 CPU가 쉬지 않게 되고, 그때 한계는 CPU 계산 시간인 요청당 1ms, 즉 초당 1,000개입니다. 그림 1에서 체크 상자를 껐다 켰을 때 사용률이 바뀐 것과 같은 원리입니다. 실제로는 문맥 교환 비용 때문에 10배에 조금 못 미칩니다.</>}
      />
    </>
  );
}

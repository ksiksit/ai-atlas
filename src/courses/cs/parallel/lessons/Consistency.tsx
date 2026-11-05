import { useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button, Callout, Check, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { rng } from '../../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { CUT_FROM, CUT_TO, READ_TIMES, TICKS, arrival, runPartition, runQuorum, runSession, type CapMode, type Routing } from './quorum';
import './parallel.css';
import './consistency.css';

const SET_VAR = ['--c-cs-1', '--c-cs-2'];
const SET_CSS = SET_VAR.map((v) => `var(${v})`);
function setColors(_P: Palette): string[] {
  const cs = getComputedStyle(document.documentElement);
  return SET_VAR.map((v) => cs.getPropertyValue(v).trim() || '#888');
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(1)}%`;

/* ─────────────── Figure 1: which replicas a write and a read touch ─────────────── */

function pickSets(n: number, w: number, r: number, how: 'worst' | 'random', seed: number): [number[], number[]] {
  if (how === 'worst') {
    // the write takes the first W, the read the last R: as little overlap as possible
    return [Array.from({ length: w }, (_, i) => i), Array.from({ length: r }, (_, i) => n - 1 - i)];
  }
  const g = rng(seed);
  const perm = () => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(g() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return [perm().slice(0, w), perm().slice(0, r)];
}

function QuorumSetsFigure() {
  const P = usePalette();
  const [n, setN] = useState(5);
  const [w, setW] = useState(3);
  const [r, setR] = useState(3);
  const [how, setHow] = useState<'worst' | 'random'>('worst');
  const [seed, setSeed] = useState(1);
  const W = Math.min(w, n);
  const R = Math.min(r, n);
  const [ws, rs] = useMemo(() => pickSets(n, W, R, how, seed), [n, W, R, how, seed]);
  const both = ws.filter((i) => rs.includes(i));
  const minOverlap = Math.max(0, R + W - n);
  const safe = R + W > n;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const [cW, cR] = setColors(P);
      const gap = Math.min(86, (cw - 40) / n);
      const x0 = cw / 2 - ((n - 1) * gap) / 2;
      const y = h / 2;
      const rad = Math.min(24, gap * 0.32);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * gap;
        const inW = ws.includes(i);
        const inR = rs.includes(i);
        if (inW && inR) {
          ctx.fillStyle = alpha(P.hl, 0.5);
          rrect(ctx, x - gap / 2 + 4, 14, gap - 8, h - 28, 6);
          ctx.fill();
        }
        if (inW) {
          rrect(ctx, x - 22, y - rad - 34, 44, 20, 4);
          ctx.fillStyle = cW;
          ctx.fill();
          text(ctx, '쓰기', x, y - rad - 24, P.surface, `700 11px ${P.fontBody}`, 'center');
        }
        if (inR) {
          rrect(ctx, x - 22, y + rad + 14, 44, 20, 4);
          ctx.fillStyle = cR;
          ctx.fill();
          text(ctx, '읽기', x, y + rad + 24, P.surface, `700 11px ${P.fontBody}`, 'center');
        }
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = inW ? alpha(cW, 0.22) : P.surface2;
        ctx.fill();
        ctx.strokeStyle = inW && inR ? P.ink : P.lineStrong;
        ctx.lineWidth = inW && inR ? 2.5 : 1.5;
        ctx.stroke();
        text(ctx, inW ? 'v2' : 'v1', x, y, inW ? P.ink : P.ink3, `700 12px ${P.fontMono}`, 'center');
      }
    },
    [P, n, ws, rs],
    { height: 190 },
  );

  return (
    <Figure
      no={1}
      title="쓰기 W대, 읽기 R대, 복제본 N대"
      hint="N, W, R을 바꿔 두 집합이 반드시 겹치는지 보세요"
      caption={
        <>
          동그라미는 같은 데이터를 가진 복제본입니다. 새 값 v2를 쓸 때 W대가 저장했다고 답하면 성공으로 치고, 읽을 때는 R대에 물어 가장 새 버전을 고릅니다. 나머지 복제본은 아직 옛 값 v1을 들고 있을 수 있습니다. 노란 칸이 쓰기와 읽기가 모두 닿은 복제본입니다. "가장 덜 겹치게"는 쓰기가 왼쪽부터, 읽기가 오른쪽부터 골라 겹침이 가장 적은 경우입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`복제본 ${n}대 중 쓰기가 ${W}대, 읽기가 ${R}대에 닿고, 둘이 겹치는 복제본은 ${both.length}대입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pd-note" data-bad={!both.length || undefined} data-good={(safe && both.length > 0) || undefined} aria-live="polite">
            {safe
              ? `R + W = ${R + W} > N = ${n}. 어떻게 골라도 적어도 ${minOverlap}대가 겹치므로, 읽기는 언제나 v2를 가진 복제본을 하나 이상 만납니다.`
              : `R + W = ${R + W} ≤ N = ${n}. ${both.length ? `이번에는 ${both.length}대가 겹쳤지만, 겹치지 않게 고를 수도 있습니다.` : '읽기가 v1만 가진 복제본에만 물었습니다. 방금 성공한 쓰기를 못 보는 낡은 읽기입니다.'}`}
          </div>
        </div>
        <div className="controls">
          <Slider id="cn-n" label="복제본 수 N" value={n} min={1} max={7} step={1} onChange={setN} />
          <Slider id="cn-w" label="쓰기 쿼럼 W" value={W} min={1} max={n} step={1} onChange={setW} color={SET_CSS[0]} />
          <Slider id="cn-r" label="읽기 쿼럼 R" value={R} min={1} max={n} step={1} onChange={setR} color={SET_CSS[1]} />
          <Seg
            label="고르는 방식"
            value={how}
            onChange={setHow}
            options={[
              { value: 'worst', label: '가장 덜 겹치게' },
              { value: 'random', label: '무작위' },
            ]}
          />
          {how === 'random' && (
            <Button small onClick={() => setSeed((s) => s + 1)}>
              다시 고르기
            </Button>
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="최소 겹침" value={`${minOverlap}대`} color={safe ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="이번 겹침" value={`${both.length}대`} />
            <Readout label="쓰기가 견디는 고장" value={`${n - W}대`} />
            <Readout label="읽기가 견디는 고장" value={`${n - R}대`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: stale reads and latency for every (W, R) ─────────────── */

function QuorumGridFigure() {
  const P = usePalette();
  const [n, setN] = useState(3);
  const [w, setW] = useState(1);
  const [r, setR] = useState(1);
  const [seed, setSeed] = useState(7);
  const grid = useMemo(() => Array.from({ length: n }, (_, wi) => Array.from({ length: n }, (_, ri) => runQuorum(n, wi + 1, ri + 1, seed))), [n, seed]);
  const W = Math.min(w, n);
  const R = Math.min(r, n);
  const cur = grid[W - 1][R - 1];
  const worst = Math.max(...grid.flat().map((s) => s.stale));

  const geom = (cw: number, h: number) => {
    const pad = { l: 64, t: 46, r: 10, b: 10 };
    const size = Math.min((cw - pad.l - pad.r) / n, (h - pad.t - pad.b) / n);
    return { pad, size };
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const { x, y } = localPoint(e, el);
    const { pad, size } = geom(el.clientWidth, el.clientHeight);
    const ri = Math.floor((x - pad.l) / size);
    const wi = Math.floor((y - pad.t) / size);
    if (ri >= 0 && ri < n && wi >= 0 && wi < n) {
      setW(wi + 1);
      setR(ri + 1);
    }
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const { pad, size } = geom(cw, h);
      text(ctx, '읽기 쿼럼 R →', pad.l, 12, P.ink2, `600 11px ${P.fontBody}`);
      text(ctx, '쓰기 W ↓', 6, pad.t - 10, P.ink2, `600 11px ${P.fontBody}`);
      for (let wi = 0; wi < n; wi++) {
        text(ctx, `W=${wi + 1}`, pad.l - 8, pad.t + (wi + 0.5) * size, P.ink3, `10px ${P.fontMono}`, 'right');
        for (let ri = 0; ri < n; ri++) {
          const s = grid[wi][ri];
          const x = pad.l + ri * size;
          const y = pad.t + wi * size;
          if (wi === 0) text(ctx, `R=${ri + 1}`, x + size / 2, pad.t - 10, P.ink3, `10px ${P.fontMono}`, 'center');
          const ok = wi + ri + 2 > n;
          ctx.fillStyle = s.stale ? alpha(P.bad, 0.12 + 0.6 * (s.stale / Math.max(1, worst))) : alpha(P.good, ok ? 0.22 : 0.1);
          ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
          const big = size > 58;
          text(ctx, pct(s.stale, s.reads), x + size / 2, y + size / 2 - (big ? 8 : 0), P.ink, `700 ${big ? 13 : 11}px ${P.fontMono}`, 'center');
          if (big) text(ctx, ok ? '보장' : '낡을 수 있음', x + size / 2, y + size / 2 + 10, P.ink3, `10px ${P.fontBody}`, 'center');
        }
      }
      // the R + W > N boundary
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let wi = 0; wi < n; wi++) {
        const ri = n - wi - 1; // first column with R + W > N in this row
        const x = pad.l + ri * size;
        const y = pad.t + wi * size;
        if (wi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        ctx.lineTo(x, y + size);
      }
      ctx.stroke();
      // selection
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(pad.l + (R - 1) * size + 2.5, pad.t + (W - 1) * size + 2.5, size - 5, size - 5);
    },
    [P, grid, n, W, R, worst],
    { height: 320 },
  );

  return (
    <Figure
      no={2}
      title="낡은 읽기는 얼마나 자주, 그리고 얼마나 기다리나"
      hint="칸을 누르거나 W, R을 바꿔 보세요"
      caption={
        <>
          한 작성자가 50ms마다 새 버전을 200번 쓰고, 그동안 읽기 1,000번이 무작위 시각에 일어납니다. 메시지마다 1ms에 평균 12ms를 더한 지연이 붙고, 5%는 80~200ms 늦게 도착합니다. 칸의 수는 "읽기를 시작할 때 이미 성공했다고 알린 쓰기"보다 옛 값을 돌려준 읽기의 비율입니다. 굵은 선 오른쪽 아래가 R + W &gt; N인 칸입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box cn-grid" onPointerDown={onDown} role="img" aria-label={`복제본 ${n}대에서 W와 R의 모든 조합에 대한 낡은 읽기 비율 표. 지금 고른 W=${W}, R=${R}은 ${pct(cur.stale, cur.reads)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="복제본 수 N"
            value={n}
            onChange={setN}
            options={[
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
          />
          <Slider id="cn-gw" label="쓰기 쿼럼 W" value={W} min={1} max={n} step={1} onChange={setW} color={SET_CSS[0]} />
          <Slider id="cn-gr" label="읽기 쿼럼 R" value={R} min={1} max={n} step={1} onChange={setR} color={SET_CSS[1]} />
          <Button small onClick={() => setSeed((s) => s + 1)}>
            다른 지연으로 다시
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="낡은 읽기" value={`${cur.stale} / ${cur.reads}`} color={cur.stale ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="R + W" value={`${R + W} ${R + W > n ? '>' : '≤'} ${n}`} />
            <Readout label="쓰기 응답 (평균)" value={`${cur.writeMs.toFixed(0)}ms`} color={SET_CSS[0]} />
            <Readout label="읽기 응답 (평균)" value={`${cur.readMs.toFixed(0)}ms`} color={SET_CSS[1]} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a partition, answered the CP way or the AP way ─────────────── */

const NODE = ['A', 'B', 'C', 'D', 'E'];
const RES_KO = { ok: '성공', rejected: '거부', stale: '낡은 값' } as const;

function PartitionFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<CapMode>('ap');
  const [cut, setCut] = useState(true);
  const [seed, setSeed] = useState(5);
  const frames = useMemo(() => runPartition(mode, cut, seed), [mode, cut, seed]);
  const s = useStepper(frames.length, 5, `${mode}${cut}${seed}`, true);
  const f = frames[s.i];
  const last = frames[frames.length - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const resColor = { ok: P.good, rejected: P.ink3, stale: P.bad };
      const midX = w * 0.4;
      const nodeY = 132;
      const xs = [w * 0.1, w * 0.27, w * 0.53, w * 0.7, w * 0.87];
      const rad = Math.max(14, Math.min(22, w / 30));
      // links between every pair (cut ones dashed red)
      for (let i = 0; i < 5; i++)
        for (let j = i + 1; j < 5; j++) {
          const across = i < 2 !== j < 2;
          if (across && f.cut) continue;
          ctx.strokeStyle = P.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const bend = (j - i) * 9;
          ctx.moveTo(xs[i], nodeY);
          ctx.quadraticCurveTo((xs[i] + xs[j]) / 2, nodeY + 28 + bend, xs[j], nodeY);
          ctx.stroke();
        }
      if (f.cut) {
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(midX, 20);
        ctx.lineTo(midX, nodeY + 70);
        ctx.stroke();
        ctx.setLineDash([]);
        text(ctx, '네트워크 끊김', midX + 6, nodeY + 62, P.bad, `600 11px ${P.fontBody}`);
      }
      for (let i = 0; i < 5; i++) {
        const side = i < 2 ? 0 : 1;
        ctx.beginPath();
        ctx.arc(xs[i], nodeY, rad, 0, Math.PI * 2);
        ctx.fillStyle = P.surface2;
        ctx.fill();
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        text(ctx, NODE[i], xs[i], nodeY - 6, P.ink3, `600 10px ${P.fontMono}`, 'center');
        text(ctx, `v${f.val[side]}`, xs[i], nodeY + 7, P.ink, `700 12px ${P.fontMono}`, 'center');
      }
      // clients and this tick's operations
      const cx = [(xs[0] + xs[1]) / 2, xs[3]];
      f.ops.forEach((op) => {
        const x = cx[op.side];
        const y = 34;
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        rrect(ctx, x - 34, y - 13, 68, 26, 13);
        ctx.fill();
        ctx.stroke();
        text(ctx, op.side ? '사용자 2' : '사용자 1', x, y, P.ink, `600 11px ${P.fontBody}`, 'center');
        const c = resColor[op.result];
        drawArrow(ctx, x, y + 14, x, nodeY - rad - 6, c, 2, 8);
        const msg = op.result === 'rejected' ? `${op.kind === 'write' ? '쓰기' : '읽기'} 거부` : op.kind === 'write' ? `쓰기 v${op.v}` : `읽기 → v${op.v}${op.result === 'stale' ? ' (낡음)' : ''}`;
        ctx.font = `700 11px ${P.fontBody}`;
        const tw = ctx.measureText(msg).width;
        ctx.fillStyle = P.surface;
        ctx.fillRect(x + 8, (y + nodeY) / 2 - 9, tw + 8, 18);
        text(ctx, msg, x + 12, (y + nodeY) / 2, c, `700 11px ${P.fontBody}`);
      });
      // a strip of every tick so far
      const sy = h - 52;
      const cw = (w - 70) / TICKS;
      text(ctx, '사용자 1', 4, sy + 8, P.ink3, `10px ${P.fontBody}`);
      text(ctx, '사용자 2', 4, sy + 26, P.ink3, `10px ${P.fontBody}`);
      if (cut) {
        ctx.fillStyle = alpha(P.bad, 0.1);
        ctx.fillRect(62 + CUT_FROM * cw, sy - 4, (CUT_TO - CUT_FROM) * cw, 40);
      }
      for (let t = 0; t <= s.i; t++)
        frames[t].ops.forEach((op) => {
          const x = 62 + t * cw;
          const y = sy + op.side * 18;
          ctx.fillStyle = resColor[op.result];
          if (op.kind === 'write') ctx.fillRect(x + 1, y + 1, cw - 2, 14);
          else {
            ctx.globalAlpha = op.result === 'ok' ? 0.45 : 1;
            ctx.fillRect(x + 1, y + 5, cw - 2, 6);
            ctx.globalAlpha = 1;
          }
        });
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(62 + s.i * cw + 0.5, sy - 3.5, cw - 1, 39);
      text(ctx, `틱 ${f.tick}`, w - 6, sy + 48, P.ink3, `10px ${P.fontMono}`, 'right', 'bottom');
    },
    [P, f, s.i, frames, cut],
    { height: 300 },
  );

  return (
    <Figure
      no={3}
      title="네트워크가 끊긴 동안 답할 것인가"
      hint="CP와 AP를 바꿔 같은 작업을 재생해 보세요"
      caption={
        <>
          복제본 다섯 대 중 A와 B는 사용자 1 가까이, C, D, E는 사용자 2 가까이 있습니다. 두 사용자는 틱마다 같은 데이터를 읽거나(35%의 확률로) 씁니다. 틱 {CUT_FROM}부터 {CUT_TO - 1}까지 두 무리 사이의 네트워크가 끊깁니다. CP는 과반(3대)과 연락이 닿는 쪽만 답하고, AP는 어느 쪽이든 가진 값으로 답합니다. 다시 이어지면 AP는 늦게 쓴 값을 남깁니다. 아래 띠의 굵은 칸은 쓰기, 가는 칸은 읽기입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`틱 ${f.tick}. ${f.cut ? '네트워크가 끊겨 있습니다. ' : ''}왼쪽 무리는 v${f.val[0]}, 오른쪽 무리는 v${f.val[1]}을 가졌습니다. ${f.ops.map((o) => `사용자 ${o.side + 1} ${o.kind === 'write' ? '쓰기' : '읽기'} ${RES_KO[o.result]}`).join(', ')}.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pd-note" aria-live="polite">
            {f.note ||
              (f.cut
                ? mode === 'cp'
                  ? '왼쪽 두 대는 과반이 아니므로 읽기도 쓰기도 거부합니다. 오른쪽 세 대는 과반이라 계속 답합니다.'
                  : '양쪽 모두 답합니다. 상대편이 쓴 값은 보이지 않으므로 낡은 값을 돌려줄 수 있습니다.'
                : '네트워크가 이어져 있어 모든 쓰기가 다섯 대 모두에 닿습니다.')}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="끊겼을 때"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cp', label: 'CP: 일관성' },
              { value: 'ap', label: 'AP: 가용성' },
            ]}
          />
          <Check label="네트워크 끊기" checked={cut} onChange={setCut} />
          <StepControls s={s} id="cn-part-speed" maxSpeed={20} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 작업 순서
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="답한 요청" value={`${f.served}`} />
            <Readout label="거부한 요청" value={`${f.rejected}`} color={f.rejected ? 'var(--ink-3)' : undefined} />
            <Readout label="낡은 읽기" value={`${f.stale}`} color={f.stale ? 'var(--bad)' : undefined} />
            <Readout label="버린 쓰기" value={`${f.lost}`} color={f.lost ? 'var(--bad)' : undefined} />
          </div>
          <div className="pd-small">끝까지 가면: 답 {last.served} · 거부 {last.rejected} · 낡은 읽기 {last.stale} · 버린 쓰기 {last.lost}</div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '성공', shape: 'sq' },
          { color: 'var(--bad)', label: '낡은 값', shape: 'sq' },
          { color: 'var(--ink-3)', label: '거부', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: reading your own write from a lagging replica ─────────────── */

function SessionFigure() {
  const P = usePalette();
  const [lag, setLag] = useState(200);
  const [routing, setRouting] = useState<Routing>('any');
  const reads = useMemo(() => runSession(lag, routing), [lag, routing]);
  const ryw = reads.filter((r) => r.ryw).length;
  const back = reads.filter((r) => r.backwards).length;
  const waited = reads.reduce((s, r) => s + r.done - r.t, 0);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 62, r: 16 };
      const span = Math.max(450, 2 * lag + 60);
      const X = (t: number) => pad.l + (t / span) * (w - pad.l - pad.r);
      const rowY = [38, 104, 154, 204];
      const names = ['사용자', 'R1', 'R2', 'R3'];
      names.forEach((nm, k) => text(ctx, nm, 8, rowY[k], k ? P.ink2 : P.ink, `${k ? 600 : 700} 11px ${k ? P.fontMono : P.fontBody}`));
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, rowY[0]);
      ctx.lineTo(w - pad.r, rowY[0]);
      ctx.stroke();
      // each replica line: old photo until the new one arrives, then new
      for (let k = 0; k < 3; k++) {
        const y = rowY[k + 1];
        const a = Math.min(span, arrival(k, lag));
        ctx.lineWidth = 6;
        ctx.strokeStyle = alpha(P.ink3, 0.35);
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(X(a), y);
        ctx.stroke();
        ctx.strokeStyle = alpha(P.accent, 0.75);
        ctx.beginPath();
        ctx.moveTo(X(a), y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        if (k) drawArrow(ctx, X(0) + 2, rowY[1] + 6, X(a), y - 6, alpha(P.accent, 0.8), 1.5, 7);
      }
      drawArrow(ctx, X(0), rowY[0] + 4, X(0), rowY[1] - 6, P.accent, 2, 8);
      text(ctx, '새 사진 올리기', X(0) + 6, rowY[0] - 14, P.accent, `600 11px ${P.fontBody}`);
      // reads
      reads.forEach((r, i) => {
        const y = rowY[r.rep + 1];
        const c = r.fresh ? P.good : P.bad;
        drawArrow(ctx, X(r.t), rowY[0] + 4, X(r.t), y - 6, alpha(P.ink2, 0.7), 1.2, 6);
        if (r.done > r.t) {
          ctx.strokeStyle = alpha(P.hl, 0.95);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(X(r.t), y);
          ctx.lineTo(X(r.done), y);
          ctx.stroke();
        }
        drawArrow(ctx, X(r.done), y - 6, X(r.done), rowY[0] + 6, c, 2, 7);
        ctx.beginPath();
        ctx.arc(X(r.done), rowY[0], 6, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        text(ctx, `${i + 1}`, X(r.done), rowY[0] + 0.5, P.surface, `700 9px ${P.fontMono}`, 'center');
      });
      for (let t = 0; t <= span; t += 100) text(ctx, `${t}`, X(t), h - 12, P.ink3, `10px ${P.fontMono}`, 'center');
      text(ctx, 'ms', w - pad.r, h - 12, P.ink3, `10px ${P.fontMono}`, 'right');
    },
    [P, reads, lag],
    { height: 250 },
  );

  return (
    <Figure
      no={4}
      title="방금 올린 사진이 보이지 않을 때"
      hint="복제 지연과 읽는 방법을 바꿔 보세요"
      caption={
        <>
          사용자가 0ms에 새 프로필 사진을 R1에 올리고, R1은 그것을 R2에 지연 시간 뒤에, R3에 그 두 배 뒤에 전합니다. 회색 선은 옛 사진, 파란 선은 새 사진을 가진 구간입니다. 사용자는 60ms 간격으로 다섯 번 자기 프로필을 엽니다. 초록 점은 새 사진, 빨간 점은 옛 사진을 받은 읽기이고, 노란 구간은 답을 기다린 시간입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="pd-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`복제 지연 ${lag}ms. 읽기 다섯 번 중 ${ryw}번이 방금 올린 사진을 보지 못했고, ${back}번은 이미 본 새 사진보다 옛 사진을 받았습니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <ol className="cn-reads">
            {reads.map((r, i) => (
              <li key={i} data-bad={r.ryw || undefined}>
                <span className="mono">{READ_TIMES[i]}ms</span> R{r.rep + 1}에서 {r.fresh ? '새 사진' : '옛 사진'}
                {r.done > r.t ? ` (${r.done - r.t}ms 기다림)` : ''}
                {r.backwards ? ' · 시간이 거꾸로' : ''}
              </li>
            ))}
          </ol>
        </div>
        <div className="controls">
          <Slider id="cn-lag" label="복제 지연" value={lag} min={0} max={400} step={20} onChange={setLag} format={(v) => `${v}ms`} />
          <Seg
            label="읽는 방법"
            value={routing}
            onChange={setRouting}
            options={[
              { value: 'any', label: '아무 복제본' },
              { value: 'sticky', label: '늘 R1' },
              { value: 'version', label: '버전 확인' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="내 쓰기를 못 본 읽기" value={`${ryw}번`} color={ryw ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="거꾸로 간 읽기" value={`${back}번`} color={back ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="기다린 시간 합" value={`${waited}ms`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Consistency() {
  return (
    <>
      <h2>복제본이 여럿이면 무엇을 읽게 되나</h2>
      <p>
        <a href={lessonHref('cs-parallel-distributed', 'consensus')}>복제와 합의</a> 장에서 Raft는 모든 쓰기를 리더 한 대가 받아 과반에 복제한 뒤에야 성공으로 알렸습니다. 덕분에 클라이언트는 복제본이 다섯 대라는 사실을 몰라도 됩니다. 마치 데이터가 한 벌뿐인 것처럼, 성공한 쓰기는 그 뒤의 모든 읽기에 보입니다. 이런 성질을 <T en="linearizability">선형화 가능성</T>, 흔히 <T en="strong consistency">강한 일관성</T>이라고 합니다.
      </p>
      <p>
        그 대가는 기다림입니다. 모든 쓰기가 리더를 거쳐 과반의 답을 기다려야 하고, 리더가 멀리 있으면 그만큼 느립니다. 많은 저장소는 더 느슨한 방식을 고릅니다. 아무 복제본에나 쓰고 아무 복제본에서나 읽되, 몇 대에게 물을지를 정해 둡니다. 복제본이 N대일 때 쓰기는 W대가 저장했다고 답하면 성공으로 치고, 읽기는 R대에 물어 그중 가장 새 버전을 고릅니다. 이 W와 R을 <T en="quorum">쿼럼</T>이라고 합니다.
      </p>
      <QuorumSetsFigure />
      <p>
        기본 설정(N = 5, W = 3, R = 3)에서는 가장 덜 겹치게 골라도 가운데 한 대가 겹칩니다. 쓰기가 닿은 세 대와 읽기가 닿은 세 대를 합하면 6대인데 복제본은 5대뿐이니, 비둘기집 원리에 따라 적어도 한 대는 양쪽에 다 들어갑니다. 일반적으로 <strong>R + W &gt; N</strong>이면 읽기 집합과 쓰기 집합은 반드시 겹치고, 읽기는 마지막으로 성공한 쓰기를 가진 복제본을 하나 이상 만납니다. W나 R을 2로 낮추면 R + W = 5 = N이 되어 겹치지 않는 경우가 생깁니다.
      </p>
      <p>
        W와 R은 고장을 얼마나 견디는지도 정합니다. W = 3이면 다섯 대 중 두 대가 꺼져도 쓰기가 성공하고, R = 3이면 읽기도 마찬가지입니다. W = 5로 두면 읽기는 R = 1로도 충분하지만, 한 대만 꺼져도 쓰기가 멈춥니다.
      </p>

      <h2>쿼럼을 줄이면 빨라지고, 낡는다</h2>
      <p>
        R + W &gt; N이 아니면 실제로 얼마나 자주 낡은 값을 읽을까요? 그림 2는 지연이 제각각인 네트워크에서 모든 (W, R) 조합을 시뮬레이션한 결과입니다.
      </p>
      <QuorumGridFigure />
      <p>
        복제본 3대에서 W = 1, R = 1이면 읽기 1,000번 중 59번(5.9%)이 이미 성공한 쓰기보다 옛 값을 돌려줍니다. 대신 가장 빠릅니다. 쓰기는 평균 14ms, 읽기는 40ms면 끝납니다. W = 2, R = 2로 올리면 낡은 읽기는 0이 되고, 쓰기는 28ms, 읽기는 60ms로 느려집니다. 가장 느린 복제본까지 기다리는 W = 3은 쓰기에 평균 77ms가 걸립니다. 5% 확률로 늦게 오는 메시지 하나만 있어도 그것을 기다려야 하기 때문입니다.
      </p>
      <p>
        N을 5로 바꾸면 굵은 선 왼쪽 위에도 0.0%인 칸(W = 1, R = 4나 W = 2, R = 3)이 보이는데, 이것은 운이 좋았던 것이지 보장이 아닙니다. 이 차이가 중요합니다. R + W &gt; N은 지연이 아무리 나빠도 성립하는 증명이고, 그 밖의 칸은 지연이 평소와 다르면 언제든 낡은 값을 돌려줄 수 있습니다. Cassandra나 Riak 같은 저장소는 요청마다 이 값을 고르게 해 줍니다. Cassandra의 ONE, QUORUM, ALL이 각각 1, 과반, N에 해당합니다.
      </p>
      <Callout kind="note">
        R + W &gt; N만으로 선형화 가능성이 되지는 않습니다. 쓰기가 아직 일부 복제본에만 닿은 순간에 읽기 두 개가 와서, 먼저 온 읽기는 새 값을, 나중 읽기는 옛 값을 볼 수 있습니다. 이를 막으려면 읽기가 답을 돌려주기 전에 낡은 복제본에 새 값을 먼저 써 주는 장치(동기식 읽기 복구)가 더 필요하고, 동시에 들어온 두 쓰기의 순서는 여전히 <a href={lessonHref('cs-parallel-distributed', 'clocks')}>시간과 순서</a> 장의 문제로 남습니다.
      </Callout>

      <h2>네트워크가 끊기면: CAP</h2>
      <p>
        이제 복제본 사이의 네트워크가 끊긴 경우를 봅시다. 데이터센터 사이의 광케이블이 끊기거나, 스위치 하나가 고장 나거나, 서버가 너무 바빠 답을 못 해도 바깥에서 보기에는 같은 일입니다. 이렇게 네트워크가 둘 이상으로 갈라진 상태를 <T en="network partition">네트워크 분할</T>이라고 합니다. 그림 3에서 같은 작업을 두 방식으로 처리해 보세요.
      </p>
      <PartitionFigure />
      <p>
        기본 설정(AP)을 끝까지 재생하면 80개 요청에 모두 답하지만, 그중 14개의 읽기가 상대편이 이미 바꾼 값을 모른 채 낡은 값을 돌려주고, 네트워크가 다시 이어질 때 사용자 1이 끊긴 동안 쓴 7개가 버려집니다. CP로 바꾸면 낡은 읽기와 버린 쓰기는 0이 되지만, 끊긴 20틱 동안 사용자 1의 요청 20개를 모두 거부합니다. 과반을 잃은 쪽은 자기가 가진 값이 최신인지 알 수 없으므로 답하지 않는 것입니다.
      </p>
      <p>
        2000년 브루어(Eric Brewer)가 추측으로 내놓고 2002년 길버트(Seth Gilbert)와 린치(Nancy Lynch)가 증명한 <T en="CAP theorem">CAP 정리</T>는 이 선택을 피할 수 없다고 말합니다. 네트워크 분할(P)이 일어난 동안에는, 모든 읽기가 마지막 쓰기를 보는 일관성(C)과 고장 나지 않은 모든 서버가 모든 요청에 답하는 가용성(A)을 함께 가질 수 없습니다. 흔히 "셋 중 둘을 고른다"고 줄여 말하지만, 분할은 고를 수 있는 것이 아니라 일어나는 일입니다. 정확히는 분할이 일어났을 때 C와 A 중 무엇을 포기할지를 고르는 것입니다.
      </p>
      <Callout kind="intuition">
        은행 지점 두 곳의 전화가 끊겼다고 해 봅시다. 잔액 10만 원인 계좌에서 두 지점이 각각 7만 원 인출을 요청받았습니다. 인출을 거부하면(CP) 손님은 기다려야 하고, 받아 주면(AP) 계좌는 마이너스가 됩니다. 어느 쪽이 맞는지는 기술이 아니라 업무가 정합니다. 장바구니 담기는 AP가, 계좌 이체는 CP가 어울립니다.
      </Callout>

      <h2>끊기지 않았을 때: PACELC</h2>
      <p>
        분할은 드뭅니다. 대부분의 시간에 시스템이 고르는 것은 다른 맞바꿈입니다. 2012년 아바디(Daniel Abadi)는 이것을 <T en="PACELC">PACELC</T>로 정리했습니다. 분할(P)이 있으면 가용성(A)과 일관성(C) 사이에서, 그렇지 않으면(E, else) 지연 시간(L)과 일관성(C) 사이에서 고른다는 뜻입니다. 그림 2가 바로 E 쪽의 선택이었습니다. 쿼럼을 키우면 일관성을 얻고 응답 시간을 잃습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>시스템</th>
              <th>분할 중</th>
              <th>평소</th>
              <th>방식</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>etcd, ZooKeeper</td>
              <td>일관성 (PC)</td>
              <td>일관성 (EC)</td>
              <td>Raft나 Zab 합의, 과반이 없으면 쓰기를 멈춤</td>
            </tr>
            <tr>
              <td>Google Spanner</td>
              <td>일관성 (PC)</td>
              <td>일관성 (EC)</td>
              <td>Paxos 합의와 시계 오차를 잰 TrueTime</td>
            </tr>
            <tr>
              <td>Dynamo, Cassandra, Riak</td>
              <td>가용성 (PA)</td>
              <td>지연 시간 (EL)</td>
              <td>쿼럼을 요청마다 고름, 기본값은 빠른 쪽</td>
            </tr>
            <tr>
              <td>DNS</td>
              <td>가용성 (PA)</td>
              <td>지연 시간 (EL)</td>
              <td>캐시가 TTL 동안 옛 주소를 돌려줌</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        DNS는 가장 오래된 <T en="eventual consistency">최종 일관성</T> 시스템입니다. 도메인의 주소를 바꾸면 전 세계의 캐시가 TTL이 지날 때까지 옛 주소를 돌려주지만, 새 쓰기가 없으면 결국 모두 새 주소로 맞춰집니다. 최종 일관성이 약속하는 것은 이것뿐입니다. 언제 맞춰질지, 그사이에 무엇을 보게 될지는 약속하지 않습니다. 자세한 동작은 <a href={lessonHref('net-basics', 'dns')}>DNS</a> 장에 있습니다.
      </p>

      <h2>내가 쓴 것은 보여야 한다</h2>
      <p>
        최종 일관성 위에서도 사용자가 이상하다고 느끼지 않게 하는 약한 보장들이 있습니다. 대표적인 둘이 <T en="read-your-writes">자기 쓰기 읽기</T>(내가 쓴 것은 내가 다음에 읽을 때 보인다)와 <T en="monotonic reads">단조 읽기</T>(한 번 본 것보다 옛 것을 다시 보지 않는다)입니다. 그림 4에서 프로필 사진을 바꾼 사용자가 자기 프로필을 다시 열어 봅니다.
      </p>
      <SessionFigure />
      <p>
        기본 설정(복제 지연 200ms, 아무 복제본)에서는 다섯 번 중 세 번이 방금 올린 사진 대신 옛 사진을 보여 줍니다. 그중 두 번(180ms와 300ms)은 이미 R1에서 새 사진을 본 뒤라 시간이 거꾸로 간 것처럼 보입니다. 사용자는 업로드가 실패한 줄 알고 다시 올릴 것입니다. 해결책은 두 가지입니다. <strong>늘 R1</strong>처럼 한 사용자의 요청을 같은 복제본으로 보내면 문제가 사라지지만, R1이 꺼지면 보장도 함께 사라집니다. <strong>버전 확인</strong>은 클라이언트가 자기가 마지막으로 쓰거나 본 버전을 기억해 두었다가, 그보다 낡은 복제본은 따라잡을 때까지 답을 미루게 합니다. 낡은 읽기는 없어지고, 대신 모두 합쳐 460ms를 기다립니다. 여기서도 일관성을 지연 시간과 맞바꾸었습니다.
      </p>

      <Callout kind="key">
        복제본 N대 중 W대에 쓰고 R대에서 읽을 때, R + W &gt; N이면 읽기 집합과 쓰기 집합이 반드시 겹쳐 마지막으로 성공한 쓰기를 만나고, 쿼럼을 줄이면 빨라지는 대신 낡은 값을 읽을 수 있습니다. CAP 정리는 네트워크 분할이 일어난 동안 일관성과 가용성 중 하나를 포기해야 한다고 말하고, PACELC는 분할이 없을 때도 일관성과 지연 시간을 맞바꾼다고 덧붙입니다. 최종 일관성 위에서는 자기 쓰기 읽기와 단조 읽기 같은 세션 보장이 사용자가 겪는 이상한 일을 막아 줍니다.
      </Callout>
      <Quiz
        q="복제본 5대짜리 저장소에서 쓰기 쿼럼을 W = 2로 정했다. 읽기가 마지막으로 성공한 쓰기를 반드시 보게 하려면 읽기 쿼럼 R은 최소 얼마여야 하는가?"
        options={['R = 2', 'R = 3', 'R = 4', 'R = 5']}
        answer={2}
        explain={<>R + W &gt; N, 즉 R + 2 &gt; 5여야 하므로 R ≥ 4입니다. R = 3이면 R + W = 5 = N이라, 쓰기가 닿은 두 대를 피해 나머지 세 대에서만 읽는 경우가 생깁니다. 대신 R = 4이면 읽기는 한 대가 꺼져도 버티지만 두 대가 꺼지면 멈추고, 쓰기는 세 대가 꺼져도 버팁니다.</>}
      />
    </>
  );
}

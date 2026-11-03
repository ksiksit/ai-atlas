import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { RULE_NAMES, cwndTrace, jain, phaseTrace, steadyState, type LossReact, type Rule } from './transport';
import './transport.css';

function label(ctx: CanvasRenderingContext2D, P: Palette, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', size = 11) {
  ctx.font = `${size}px ${P.fontBody}`;
  const tw = ctx.measureText(s).width;
  const bx = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2;
  ctx.fillStyle = alpha(P.surface, 0.85);
  ctx.fillRect(bx - 3, y - size / 2 - 2, tw + 6, size + 4);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ─────────────── Figure 1: one flow's congestion window ─────────────── */

const ROUNDS = 80;
const LOSS_TXT = '용량 + 버퍼: 넘으면 손실';
const CAP_TXT = '회선 용량 (BDP)';
const BUF_TXT = '버퍼에 쌓이는 구간';

function CwndFigure() {
  const P = usePalette();
  const [cap, setCap] = useState(40);
  const [bufPct, setBufPct] = useState(50);
  const [react, setReact] = useState<LossReact>('reno');
  const [iw, setIw] = useState(1);
  const buf = Math.round((cap * bufPct) / 100);
  const tr = useMemo(() => cwndTrace(cap, buf, react, ROUNDS, iw), [cap, buf, react, iw]);
  const util = tr.reduce((a, r) => a + r.util, 0) / tr.length;
  const rtt = tr.reduce((a, r) => a + r.rtt, 0) / tr.length;
  const losses = tr.filter((r) => r.loss).length;
  const firstLoss = tr.findIndex((r) => r.loss);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 14;
      const top = (h - gap) * 0.64;
      const yMax = Math.max(cap + buf, ...tr.map((r) => r.cwnd)) * 1.08;
      const mk = (t: number) => new Plot(ctx, w, top, P, { xMin: 0, xMax: ROUNDS - 1, yMin: 0, yMax, pad: { l: 40, r: 12, t, b: 6 } });

      // A spot for a line label at the first of the given heights (beside its line), tried from the
      // right edge leftwards, where it clears the cwnd curve and its loss marks.
      const clearAt = (p: Plot, s: string, ys: number[], size: number): { x: number; y: number } | null => {
        ctx.font = `${size}px ${P.fontBody}`;
        const tw = ctx.measureText(s).width + 6;
        const half = size / 2 + 6;
        for (const y of ys) {
          if (y - half < p.pad.t || y + half > top - p.pad.b) continue;
          for (let xr = p.X(ROUNDS - 1) - 2; xr - tw >= p.X(0); xr -= 4) {
            const i0 = Math.max(0, Math.floor(p.invX(xr - tw)) - 1);
            const i1 = Math.min(tr.length - 1, Math.ceil(p.invX(xr)) + 1);
            let ok = true;
            for (let i = i0; i < i1 && ok; i++) {
              const ya = p.Y(tr[i].cwnd);
              const yb = p.Y(tr[i + 1].cwnd);
              if (Math.max(ya, yb) > y - half && Math.min(ya, yb) < y + half) ok = false;
            }
            if (ok) return { x: xr, y };
          }
        }
        return null;
      };
      const placeAll = (p: Plot) => {
        const band = p.Y(cap) - p.Y(cap + buf);
        return {
          loss: clearAt(p, LOSS_TXT, [p.Y(cap + buf) - 9, ...(band > 40 ? [p.Y(cap + buf) + 9] : [])], 11),
          cap: clearAt(p, CAP_TXT, [p.Y(cap) + 9, ...(band > 40 ? [p.Y(cap) - 9] : [])], 11),
          // the band explains itself once its lines are labelled, so this one is dropped rather than moved
          buf: buf > 0 && band > 18 ? clearAt(p, BUF_TXT, [(p.Y(cap) + p.Y(cap + buf)) / 2], 10) : null,
        };
      };
      // labels with no clear spot (narrow screens) become a key in an extra header row
      let p1 = mk(22);
      let spots = placeAll(p1);
      const keyRow = !spots.loss || !spots.cap;
      if (keyRow) {
        p1 = mk(40);
        spots = placeAll(p1);
      }
      p1.grid({ xStep: 10, yStep: yMax > 120 ? 40 : 20, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += yMax > 120 ? 40 : 20) ctx.fillText(String(y), p1.X(0) - 5, p1.Y(y));
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink2;
      ctx.fillText('혼잡 창 cwnd (패킷)', p1.X(0), 10);

      // the bottleneck: capacity, then capacity + buffer
      ctx.fillStyle = alpha(P.hl, P.dark ? 0.14 : 0.16);
      ctx.fillRect(p1.X(0), p1.Y(cap + buf), p1.pw, p1.Y(cap) - p1.Y(cap + buf));
      p1.line(0, cap, ROUNDS - 1, cap, alpha(P.ink, 0.55), 1.2, [6, 4]);
      p1.line(0, cap + buf, ROUNDS - 1, cap + buf, P.bad, 1.2, [6, 4]);
      // cwnd, coloured by phase
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1];
        const b = tr[i];
        p1.line(i - 1, a.cwnd, i, b.cwnd, a.slowStart && !a.loss ? P.neg : P.pos, 2.2);
      }
      tr.forEach((r, i) => {
        if (!r.loss) return;
        const x = p1.X(i);
        const y = p1.Y(r.cwnd);
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      });

      // line labels on top of the curve, or as a key under the title
      let keyX = p1.X(0);
      const tag = (txt: string, spot: { x: number; y: number } | null, color: string, size = 11) => {
        if (spot) return label(ctx, P, txt, spot.x, spot.y, color, 'right', size);
        if (!keyRow) return;
        const ky = 28;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(keyX, ky);
        ctx.lineTo(keyX + 16, ky);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${size}px ${P.fontBody}`;
        label(ctx, P, txt, keyX + 21, ky, color, 'left', size);
        keyX += 21 + ctx.measureText(txt).width + 12;
      };
      tag(LOSS_TXT, spots.loss, P.bad);
      tag(CAP_TXT, spots.cap, P.ink2);
      if (spots.buf) tag(BUF_TXT, spots.buf, P.ink3, 10);

      // bottom: round-trip time
      ctx.save();
      ctx.translate(0, top + gap);
      const H2 = h - top - gap;
      const rMax = Math.max(2, 1 + buf / cap) * 1.06;
      const p2 = new Plot(ctx, w, H2, P, { xMin: 0, xMax: ROUNDS - 1, yMin: 0, yMax: rMax, pad: { l: 40, r: 12, t: 20, b: 22 } });
      p2.grid({ xStep: 10, yStep: 1, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= rMax; y++) ctx.fillText(`${y}×`, p2.X(0) - 5, p2.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x < ROUNDS; x += 10) ctx.fillText(String(x), p2.X(x), p2.Y(0) + 5);
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink2;
      ctx.fillText('왕복 시간 (대기가 없을 때의 몇 배)', p2.X(0), 9);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText('왕복 횟수 →', p2.X(ROUNDS - 1), p2.Y(0) - 3);
      p2.fillUnder((x) => tr[Math.min(ROUNDS - 1, Math.round(x))].rtt, alpha(P.hl, P.dark ? 0.2 : 0.3), 0, ROUNDS - 1, 1);
      p2.fn((x) => tr[Math.min(ROUNDS - 1, Math.round(x))].rtt, P.ink2, 1.6, { samples: ROUNDS * 4 });
      p2.line(0, 1, ROUNDS - 1, 1, alpha(P.ink, 0.4), 1, [3, 3]);
      ctx.restore();
    },
    [P, tr, cap, buf],
    { aspect: 1.6, maxHeight: 430, minHeight: 330 },
  );

  return (
    <Figure
      no={1}
      title="혼잡 창의 톱니"
      hint="버퍼 크기와 손실 반응을 바꿔 보세요"
      caption={<>병목 회선 하나를 지나는 TCP 연결 하나를 왕복 단위로 흉내 냈습니다. 회선은 한 왕복에 BDP만큼의 패킷을 나르고, 그보다 많이 보낸 패킷은 버퍼에서 기다리며, 버퍼마저 넘치면 버려집니다. 파란 선은 느린 시작(한 왕복마다 두 배), 주황 선은 혼잡 회피(한 왕복마다 1씩), 빨간 ✕는 손실을 알아챈 왕복입니다. 아래 그림은 버퍼에서 기다리느라 늘어난 왕복 시간입니다. 실제 TCP는 ACK 하나마다 창을 조금씩 늘리고 손실 회복 과정도 더 복잡하지만, 왕복 단위로 보면 모양이 같습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`혼잡 창 그래프: BDP ${cap}패킷, 버퍼 ${buf}패킷. 손실 ${losses}번, 평균 이용률 ${(util * 100).toFixed(1)}%`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="cw-cap" label="회선 용량 BDP (패킷)" value={cap} min={10} max={80} step={2} onChange={setCap} />
          <Slider id="cw-buf" label="버퍼 (BDP 대비)" value={bufPct} min={0} max={200} step={25} onChange={setBufPct} format={(v) => `${v}% · ${Math.round((cap * v) / 100)}개`} />
          <Seg label="손실을 알면" value={react} onChange={setReact} options={[{ value: 'reno', label: '절반으로 (Reno)' }, { value: 'tahoe', label: '1부터 다시' }]} />
          <Seg label="초기 창" value={iw} onChange={setIw} options={[{ value: 1, label: '1개' }, { value: 10, label: '10개' }]} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균 회선 이용률" value={`${(util * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="평균 왕복 시간" value={`${rtt.toFixed(2)}×`} />
            <Readout label="손실" value={`${losses}번`} color="var(--bad)" />
            <Readout label="첫 손실" value={firstLoss >= 0 ? `${firstLoss}번째 왕복` : '없음'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '느린 시작', shape: 'ln' },
          { color: 'var(--pos)', label: '혼잡 회피', shape: 'ln' },
          { color: 'var(--bad)', label: '손실', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: two flows in the Chiu–Jain phase plot ─────────────── */

const RULES: Rule[] = ['aimd', 'aiad', 'mimd', 'miad'];
const RULE_DESC: Record<Rule, string> = {
  aimd: '더할 때는 조금씩, 줄일 때는 절반으로',
  aiad: '더할 때도 줄일 때도 같은 양만큼',
  mimd: '늘릴 때는 12%씩 곱하고, 줄일 때는 절반으로',
  miad: '늘릴 때는 12%씩 곱하고, 줄일 때는 같은 양만큼 빼기',
};
const STARTS: { label: string; at: [number, number] }[] = [
  { label: '한쪽이 먼저 차지', at: [0.7, 0.1] },
  { label: '둘 다 조금', at: [0.08, 0.3] },
  { label: '둘 다 넘침', at: [0.9, 0.55] },
];
const PH_MAX = 1.15;

function PhaseFigure() {
  const P = usePalette();
  const [rule, setRule] = useState<Rule>('aimd');
  const [start, setStart] = useState<[number, number]>([0.7, 0.1]);
  const [steps, setSteps] = useState(60);
  const pts = useMemo(() => phaseTrace(rule, start[0], start[1], steps), [rule, start, steps]);
  const [x1, x2] = pts[pts.length - 1];
  const plotRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: PH_MAX, yMin: 0, yMax: PH_MAX, pad: { l: 34, r: 12, t: 12, b: 42 }, equal: true });
      plotRef.current = plot;
      plot.grid({ xStep: 0.25, yStep: 0.25, labels: true, fmt: (v) => (v === 0 ? '0' : v.toFixed(2).replace(/0$/, '')) });
      // over capacity
      ctx.save();
      plot.clip();
      ctx.fillStyle = alpha(P.bad, P.dark ? 0.1 : 0.07);
      ctx.beginPath();
      ctx.moveTo(plot.X(1), plot.Y(0));
      ctx.lineTo(plot.X(plot.xMax), plot.Y(0));
      ctx.lineTo(plot.X(plot.xMax), plot.Y(plot.yMax));
      ctx.lineTo(plot.X(0), plot.Y(plot.yMax));
      ctx.lineTo(plot.X(0), plot.Y(1));
      ctx.closePath();
      ctx.fill();
      plot.unclip();
      plot.line(0, 1, 1, 0, P.ink2, 1.6, [6, 4]);
      plot.line(0, 0, PH_MAX, PH_MAX, P.good, 1.6, [6, 4]);
      plot.text('효율선: 합이 용량', 0.1, 0.9, P.ink2, { font: `11px ${P.fontBody}`, dx: 8, dy: 4 });
      plot.text('공평선: 똑같이', 1.0, 1.0, P.good, { font: `11px ${P.fontBody}`, align: 'right', dx: -6, dy: -8 });
      ctx.strokeStyle = P.good;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(plot.X(0.5), plot.Y(0.5), 7, 0, Math.PI * 2);
      ctx.stroke();

      // trajectory
      ctx.save();
      plot.clip();
      ctx.strokeStyle = alpha(P.pos, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(plot.X(a), plot.Y(b)) : ctx.moveTo(plot.X(a), plot.Y(b))));
      ctx.stroke();
      pts.forEach(([a, b], i) => {
        if (i === 0 || i === pts.length - 1) return;
        ctx.fillStyle = alpha(P.pos, 0.35 + (0.5 * i) / pts.length);
        ctx.beginPath();
        ctx.arc(plot.X(a), plot.Y(b), 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      plot.unclip();
      plot.dot(x1, x2, 5.5, P.pos, P.surface, 2);
      plot.dot(start[0], start[1], 8, P.surface, P.ink, 2.4);
      ctx.restore();
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('흐름 1의 몫 →', plot.X(plot.xMax), h - 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('↑ 흐름 2의 몫', plot.X(0) + 6, plot.Y(plot.yMax) + 4);
    },
    [P, pts, start, x1, x2],
    { aspect: 1, maxHeight: 440, minHeight: 280 },
  );

  const toWorld = (x: number, y: number): [number, number] => {
    const pl = plotRef.current;
    if (!pl) return start;
    const c = (v: number) => Math.max(0.02, Math.min(1.1, v));
    return [c(pl.invX(x)), c(pl.invY(y))];
  };
  useDrag(canvasRef, {
    hit: (x, y) => {
      const pl = plotRef.current;
      if (!pl) return null;
      return Math.hypot(pl.X(start[0]) - x, pl.Y(start[1]) - y) < 16 ? 'start' : null;
    },
    onDrag: (_, x, y) => setStart(toWorld(x, y)),
    onEmpty: (x, y) => setStart(toWorld(x, y)),
  });

  return (
    <Figure
      no={2}
      title="두 연결이 회선 하나를 나눠 쓸 때"
      hint="출발점을 끌거나 눌러 옮기고, 규칙을 바꿔 보세요"
      caption={<>가로축은 흐름 1, 세로축은 흐름 2가 보내는 양이고, 회선 용량을 1로 두었습니다. 두 흐름은 서로를 모르고, 매 왕복 같은 신호만 받습니다. 합이 1을 넘으면(빨간 영역) 둘 다 손실을 겪고 줄이며, 넘지 않으면 둘 다 늘립니다. 더하기는 용량의 4%씩입니다. 회색 점선 위면 회선을 남김없이 쓰는 것이고, 초록 점선 위면 공평하게 나눈 것입니다. 목표는 두 선이 만나는 초록 원입니다. 1989년 추(Dah-Ming Chiu)와 자인(Raj Jain)이 이 그림으로 증가·감소 규칙을 비교했습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" style={{ maxWidth: 460, justifySelf: 'center' }} role="img" aria-label={`${RULE_NAMES[rule]} 규칙의 궤적. 출발 (${start[0].toFixed(2)}, ${start[1].toFixed(2)}), ${steps}번 뒤 (${x1.toFixed(2)}, ${x2.toFixed(2)})`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="증가 · 감소 규칙" value={rule} onChange={setRule} options={RULES.map((r) => ({ value: r, label: RULE_NAMES[r] }))} />
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginTop: -8 }}>{RULE_DESC[rule]}</div>
          <Slider id="ph-steps" label="왕복 횟수" value={steps} min={0} max={150} step={1} onChange={setSteps} />
          <div className="ctl">
            <span className="ctl-label">
              <span>출발점</span>
            </span>
            <div className="tp-starts">
              {STARTS.map((s) => (
                <Button key={s.label} small onClick={() => setStart(s.at)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="흐름 1" value={x1.toFixed(2)} />
            <Readout label="흐름 2" value={x2.toFixed(2)} />
            <Readout label="합 (이용률)" value={`${Math.round((x1 + x2) * 100)}%`} />
            <Readout label="공평성 지수" value={jain(x1, x2).toFixed(3)} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: bigger buffers, longer waits ─────────────── */

const BCAP = 40;
const BMAX = 4;
const BSTEP = 0.05;

function BufferFigure() {
  const P = usePalette();
  const [b, setB] = useState(1);
  const [base, setBase] = useState(20);
  const curve = useMemo(() => Array.from({ length: Math.round(BMAX / BSTEP) + 1 }, (_, i) => steadyState(BCAP, Math.round(BCAP * i * BSTEP))), []);
  const at = (x: number) => curve[Math.max(0, Math.min(curve.length - 1, Math.round(x / BSTEP)))];
  const cur = at(b);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 14;
      const top = (h - gap) / 2;
      const pad = { l: 46, r: 12, t: 22, b: 6 };
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: BMAX, yMin: 50, yMax: 104, pad });
      p1.grid({ xStep: 0.5, yStep: 25, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const y of [50, 75, 100]) ctx.fillText(`${y}%`, p1.X(0) - 5, p1.Y(y));
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink2;
      ctx.fillText('회선 이용률', p1.X(0), 10);
      p1.line(0, 100, BMAX, 100, alpha(P.good, 0.8), 1.2, [5, 4]);
      p1.fn((x) => at(x).util * 100, P.pos, 2.4, { samples: 240 });
      p1.line(b, 50, b, 104, alpha(P.ink, 0.4), 1.2, [4, 4]);
      p1.dot(b, cur.util * 100, 5, P.pos, P.surface, 2);

      ctx.save();
      ctx.translate(0, top + gap);
      const H2 = h - top - gap;
      const yMax = base * (1 + BMAX) * 1.02;
      const p2 = new Plot(ctx, w, H2, P, { xMin: 0, xMax: BMAX, yMin: 0, yMax, pad: { l: 46, r: 12, t: 22, b: 22 } });
      p2.grid({ xStep: 0.5, yStep: base, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += base * (base >= 50 ? 2 : 1)) ctx.fillText(`${y}`, p2.X(0) - 5, p2.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= BMAX; x += 1) ctx.fillText(`${x}×`, p2.X(x), p2.Y(0) + 5);
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink2;
      ctx.fillText('평균 왕복 시간 (ms)', p2.X(0), 10);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText('버퍼 크기 (BDP의 몇 배) →', p2.X(BMAX), p2.Y(0) - 3);
      p2.fillUnder((x) => at(x).rtt * base, alpha(P.hl, P.dark ? 0.16 : 0.25), 0, BMAX, base);
      p2.line(0, base, BMAX, base, alpha(P.good, 0.8), 1.2, [5, 4]);
      p2.fn((x) => at(x).rtt * base, P.neg, 2.4, { samples: 240 });
      p2.line(b, 0, b, yMax, alpha(P.ink, 0.4), 1.2, [4, 4]);
      p2.dot(b, cur.rtt * base, 5, P.neg, P.surface, 2);
      label(ctx, P, '대기가 없을 때', p2.X(BMAX) - 2, p2.Y(base) - 10, P.good, 'right');
      ctx.restore();
    },
    [P, curve, b, base, cur],
    { aspect: 1.7, maxHeight: 400, minHeight: 320 },
  );

  return (
    <Figure
      no={3}
      title="버퍼가 클수록 좋을까"
      hint="버퍼 크기와 기본 왕복 시간을 바꿔 보세요"
      caption={<>그림 1의 Reno 연결을 오래 돌려, 처음 몇 번의 왕복을 뺀 평균을 버퍼 크기마다 그렸습니다(BDP {BCAP}패킷). 위는 회선을 얼마나 쓰는지, 아래는 패킷이 버퍼에서 기다리는 시간까지 더한 평균 왕복 시간입니다. 초록 점선은 회선을 꽉 채우면서 아무도 기다리지 않는 이상적인 지점입니다. 손실을 신호로 쓰는 방식은 버퍼가 넘칠 때까지 창을 늘리므로, 버퍼가 클수록 그만큼 오래 기다리게 됩니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`버퍼 BDP의 ${b.toFixed(2)}배: 이용률 ${(cur.util * 100).toFixed(1)}%, 평균 왕복 ${(cur.rtt * base).toFixed(0)}ms`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="bb-b" label="버퍼 (BDP의 몇 배)" value={b} min={0} max={BMAX} step={BSTEP} onChange={setB} format={(v) => `${v.toFixed(2)}×`} />
          <Seg label="대기가 없을 때의 왕복" value={base} onChange={setBase} options={[20, 50, 100].map((v) => ({ value: v, label: `${v}ms` }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="회선 이용률" value={`${(cur.util * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="평균 왕복 시간" value={`${(cur.rtt * base).toFixed(0)}ms`} color="var(--neg)" />
            <Readout label="대기로 늘어난 시간" value={`+${((cur.rtt - 1) * base).toFixed(0)}ms`} />
            <Readout label="손실이 난 왕복" value={`${(cur.lossRounds * 100).toFixed(1)}%`} color="var(--bad)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Congestion() {
  return (
    <>
      <h2>모두가 서두르면 모두가 느려진다</h2>
      <p>
        <a href="#cs-networks/tcp">앞 장</a>의 TCP는 받는 쪽이 감당할 수 있는 만큼(수신 창) 보냈습니다. 그런데 그 사이의 네트워크는 누가 지켜 줄까요? 라우터는 들어오는 패킷이 나가는 회선보다 많으면 잠시 <T en="buffer">버퍼</T>에 쌓아 두고, 버퍼마저 가득 차면 새로 오는 패킷을 버립니다. 버려진 패킷은 재전송되어 다시 네트워크를 채우고, 재전송이 재전송을 부르면 회선은 바쁜데 정작 도착하는 데이터는 거의 없는 상태가 됩니다. 이를 <T en="congestion collapse">혼잡 붕괴</T>라고 합니다.
      </p>
      <p>
        실제로 1986년 10월 인터넷에서 이런 일이 있었습니다. 밴 제이컵슨(Van Jacobson)의 1988년 논문에 따르면, 400야드 떨어진 로런스 버클리 연구소와 UC 버클리 사이의 처리량이 32kbps에서 40bps로 떨어졌습니다. 제이컵슨과 마이클 캐럴스(Michael Karels)는 그 원인을 "네트워크의 상태를 생각하지 않고 보내는 TCP"에서 찾았고, 보내는 쪽이 스스로 속도를 조절하는 규칙들을 제안했습니다. 이 규칙들이 오늘날 <T en="congestion control">혼잡 제어</T>의 뼈대입니다.
      </p>

      <h2>손실을 신호로 삼는다</h2>
      <p>
        보내는 쪽은 경로의 회선 속도도, 같은 회선을 쓰는 다른 연결의 수도 모릅니다. 알 수 있는 것은 자기 패킷이 사라졌는지뿐입니다. 그래서 TCP는 <strong>손실이 날 때까지 조금씩 더 보내 보고, 손실이 나면 줄입니다</strong>. 이렇게 어림한 "네트워크에 띄워도 되는 양"이 <T en="congestion window">혼잡 창</T> cwnd입니다. 실제로 띄워 보내는 양은 받는 쪽의 수신 창과 혼잡 창 중 작은 값이고, 한 왕복에 그만큼 보내므로 처리량은 대략 이렇습니다.
      </p>
      <MB note="rwnd: 받는 쪽이 알려 준 수신 창">{'\\text{처리량} \\approx \\frac{\\min(\\text{cwnd},\\ \\text{rwnd})}{\\text{RTT}}'}</MB>

      <h2>느린 시작과 혼잡 회피</h2>
      <p>혼잡 창을 늘리는 속도는 두 단계로 나뉩니다. 아래에서 창의 단위는 세그먼트 하나(MSS)입니다.</p>
      <ul>
        <li>
          <T en="slow start">느린 시작</T>: ACK 하나가 올 때마다 창을 1씩 늘립니다. 한 왕복에 창만큼의 ACK가 오므로 창은 <strong>왕복마다 두 배</strong>가 됩니다. 이름과 달리 지수적으로 빠르게 늘어나는데, "처음부터 창 전체를 쏟아내던 예전 방식보다는 느리다"는 뜻으로 붙은 이름입니다. 오늘날에는 처음 창을 세그먼트 10개로 시작하는 경우가 많습니다.
        </li>
        <li>
          <T en="congestion avoidance">혼잡 회피</T>: 창이 <T en="slow start threshold">임계값</T> ssthresh에 이르면, 그다음부터는 <strong>왕복마다 1씩만</strong> 늘립니다. 손실이 날 즈음에 다가갔으니 조심스럽게 더듬는 단계입니다.
        </li>
      </ul>
      <p>
        손실을 알아채면 줄입니다. 중복 ACK 세 개로 알아챈 손실이라면 다른 패킷은 아직 잘 도착하고 있다는 뜻이므로, <T en="Reno">Reno</T> 방식은 ssthresh를 지금 창의 절반으로 정하고 창도 절반으로 줄인 뒤 혼잡 회피를 이어 갑니다. 타임아웃이 났다면 ACK가 아예 끊긴 심각한 상황이라고 보고, 창을 1로 되돌려 느린 시작부터 다시 합니다. Reno 이전의 Tahoe는 중복 ACK의 경우에도 창을 1로 되돌렸습니다.
      </p>
      <CwndFigure />
      <p>
        처음 설정(BDP 40, 버퍼 20)에서 창은 1, 2, 4, …, 32로 두 배씩 늘다가 64에서 회선과 버퍼(합 60)를 넘어 첫 손실이 납니다. 그 뒤로는 30 언저리와 61 사이를 1씩 올라갔다가 절반으로 떨어지는 톱니를 그립니다. "1부터 다시"로 바꾸면 손실마다 회선이 텅 비는 시간이 생겨 이용률이 떨어집니다. 이 톱니의 모양에서 손실률과 처리량의 관계도 나옵니다. 한 번 손실 날 때마다 창이 W/2에서 W까지 자라는 동안 약 <M>{'3W^2/8'}</M>개의 패킷을 보내므로, 손실률이 p이면 평균 창은 <M>{'\\sqrt{3/(2p)}'}</M>에 비례합니다. 매시스(Mathis) 등이 1997년에 정리한 식입니다.
      </p>
      <MB note="MSS: 세그먼트 크기, p: 패킷 손실률">{'\\text{처리량} \\approx \\frac{\\text{MSS}}{\\text{RTT}} \\cdot \\frac{\\sqrt{3/2}}{\\sqrt{p}}'}</MB>
      <p>
        MSS 1,460바이트, 왕복 100ms에서 손실률이 1%면 약 1.4Mbps, 0.01%면 약 14Mbps입니다. 처리량이 손실률의 제곱근에 반비례하므로, 이 방식으로 같은 경로에서 10Gbps를 내려면 손실이 약 50억 개 중 하나 이하여야 합니다. 빠르고 먼 회선에서 Reno가 회선을 다 쓰지 못하는 이유이고, 뒤에서 볼 CUBIC 같은 방식이 나온 배경입니다.
      </p>

      <h2>AIMD는 왜 공평해지는가</h2>
      <p>
        혼잡 회피의 규칙은 "더할 때는 조금씩 더하고(additive increase), 줄일 때는 곱해서 줄인다(multiplicative decrease)"로 요약되어 <T en="additive increase, multiplicative decrease">AIMD</T>라고 부릅니다. 하필 이 조합인 이유는 연결 두 개가 회선 하나를 나눠 쓰는 그림에서 보입니다. 두 연결은 서로의 존재를 모르고, 각자 손실이라는 같은 신호에 같은 규칙으로 반응할 뿐입니다.
      </p>
      <PhaseFigure />
      <p>
        AIMD를 "한쪽이 먼저 차지"에서 출발시키면, 처음에는 흐름 1이 0.7, 흐름 2가 0.1로 크게 기울어 있지만 60번의 왕복 뒤에는 공평성 지수가 1에 가까워지고 궤적은 공평선 위에서 초록 원 부근을 오르내립니다. 이유는 두 움직임의 방향에 있습니다.
      </p>
      <ul>
        <li>
          <strong>더하기</strong>는 두 흐름에 같은 양을 더하므로 점이 45° 방향(공평선과 나란히)으로 움직입니다. 두 흐름의 <strong>차이</strong>는 그대로입니다.
        </li>
        <li>
          <strong>곱해서 줄이기</strong>는 점을 원점 쪽으로 끌어당기므로 두 흐름의 <strong>비율</strong>은 그대로지만, 차이는 절반이 됩니다.
        </li>
      </ul>
      <p>
        그래서 넘칠 때마다 차이가 절반씩 줄어 결국 공평선에 붙습니다. 다른 규칙은 그렇지 않습니다. AIAD는 더할 때도 뺄 때도 차이를 그대로 두어 처음의 0.6 차이가 영원히 남고, MIMD는 비율을 그대로 두어 7배 차이가 끝까지 갑니다. MIAD는 큰 쪽이 더 크게 늘고 둘이 같은 양씩 줄어 한쪽이 회선을 독차지합니다. 서로 말 한마디 나누지 않는 수많은 연결이 대체로 공평하게 나눠 쓰는 것은 AIMD 덕분입니다.
      </p>
      <Callout kind="note">
        이 공평함에는 단서가 있습니다. Reno는 <strong>왕복마다</strong> 1씩 늘리므로, 왕복 시간이 짧은 연결이 더 빨리 창을 키워 더 많이 가져갑니다. 또 한 프로그램이 연결을 여러 개 열면 그만큼 몫을 더 받습니다. 공평함은 연결 단위의 이야기입니다.
      </Callout>

      <h2>버퍼는 클수록 좋을까: 버퍼블로트</h2>
      <p>
        그림 1에서 버퍼를 0으로 내려 보면, 톱니가 BDP의 절반과 BDP 사이를 오가며 손실 직후마다 회선이 덜 쓰입니다. 버퍼가 있으면 창이 BDP를 넘는 동안 남는 패킷이 버퍼에서 기다렸다가 회선이 빌 때 나가므로 이용률이 올라갑니다. 그렇다면 버퍼는 클수록 좋을까요?
      </p>
      <BufferFigure />
      <p>
        이 모형에서는 버퍼가 없을 때 이용률이 76.2%, BDP의 4분의 1이면 88.9%, 절반이면 95.7%이고, BDP와 같아지면 100%가 됩니다. 연결 하나에는 버퍼를 BDP만큼 두라는 오래된 경험칙과 맞습니다. 하지만 그 너머로 버퍼를 늘리면 이용률은 더 오르지 않고 대기만 길어집니다. 왕복 시간은 BDP 1배에서 대기가 없을 때의 1.51배, 4배에서는 3.77배가 됩니다. 손실을 신호로 쓰는 TCP는 버퍼가 넘칠 때까지 창을 키우므로, 버퍼가 크면 그 버퍼를 늘 거의 채운 채로 지내기 때문입니다.
      </p>
      <p>
        2010년 무렵 짐 게티스(Jim Gettys)는 가정용 공유기와 모뎀에 이렇게 지나치게 큰 버퍼가 흔하다는 것을 알리며 <T en="bufferbloat">버퍼블로트</T>라는 이름을 붙였습니다. 큰 파일을 올리는 동안 같은 집의 화상 통화나 게임이 수백 ms에서 수 초까지 늦어지는 현상입니다. 통화 패킷이 사라지는 것이 아니라, 업로드 패킷이 길게 늘어선 줄 뒤에서 기다리는 것입니다. 대책은 두 방향입니다.
      </p>
      <ul>
        <li>
          <T en="active queue management">능동 큐 관리</T>: 라우터가 버퍼가 가득 차기 전에 일부러 패킷을 버리거나 표시해서, 보내는 쪽이 일찍 줄이게 합니다. 대기 시간을 직접 재서 판단하는 CoDel과, 연결마다 줄을 따로 세우는 FQ-CoDel이 리눅스와 여러 공유기 펌웨어에 들어가 있습니다. 버리는 대신 IP 헤더에 "혼잡하다"는 표시를 남기는 <T en="Explicit Congestion Notification">ECN</T>을 쓰면 재전송 없이도 같은 신호를 줄 수 있습니다.
        </li>
        <li>
          <strong>손실이 아닌 다른 신호</strong>: 보내는 쪽이 왕복 시간이 늘어나는 것 자체를 "버퍼에 줄이 생기기 시작했다"는 신호로 읽고, 버퍼가 넘치기 전에 멈추는 방식입니다. 그림 3의 초록 점선, 즉 회선은 꽉 채우되 줄은 세우지 않는 지점을 노립니다.
        </li>
      </ul>

      <h2>오늘날의 혼잡 제어</h2>
      <p>
        오늘날 리눅스의 기본값은 Reno가 아니라 <T en="CUBIC">CUBIC</T>입니다(2006년 리눅스 2.6.19부터). CUBIC도 손실이 나면 창을 줄이지만, 늘릴 때는 왕복마다 1씩이 아니라 마지막 손실 뒤로 흐른 <strong>시간</strong>의 3차 함수를 따릅니다. 손실이 났던 창 크기 근처에서는 천천히, 거기서 멀어지면 빠르게 늘려 빠르고 먼 회선을 더 잘 채우고, 늘리는 속도가 왕복 시간에 덜 묶여 RTT에 따른 불공평도 줄어듭니다.
      </p>
      <p>
        2016년 구글이 발표한 <T en="Bottleneck Bandwidth and Round-trip propagation time">BBR</T>은 방향이 다릅니다. 손실을 기다리지 않고, 측정한 최대 전달 속도와 최소 왕복 시간으로 병목 회선의 속도와 BDP를 어림해 그 속도에 맞춰 보냅니다. 띄워 두는 양을 BDP 근처로 유지하려 하므로 버퍼를 채우지 않는 것이 목표입니다. 구글은 자사 서비스에 쓰고 있지만, 손실 기반 연결과 섞였을 때 몫을 어떻게 나누는지를 두고 연구와 개정이 이어지고 있습니다. 혼잡 제어는 30년이 넘도록 아직 끝나지 않은 문제입니다.
      </p>

      <Callout kind="key">
        TCP는 네트워크의 용량을 모른 채, 손실을 신호로 혼잡 창을 조절합니다. 느린 시작으로 왕복마다 두 배씩 늘리다가, 임계값부터는 왕복마다 1씩 늘리고, 손실이 나면 절반으로 줄입니다(AIMD). 더하기는 차이를 유지하고 곱해서 줄이기는 차이를 반으로 줄이므로, 서로 모르는 연결들도 회선을 공평하게 나누게 됩니다. 처리량은 대략 <M>{'\\text{MSS}/(\\text{RTT}\\sqrt{p})'}</M>에 비례합니다. 손실 기반 방식은 버퍼가 넘칠 때까지 보내므로 버퍼가 크면 지연이 커지고(버퍼블로트), 이를 막으려고 능동 큐 관리, ECN, 지연이나 대역폭을 재는 방식이 쓰입니다.
      </Callout>
      <Quiz
        q="집 공유기의 업로드 버퍼가 매우 크다. 큰 동영상을 업로드하는 동안, 같은 집의 화상 통화가 1초 넘게 늦어진다. 업로드도 통화도 패킷 손실은 거의 없다. 가장 그럴듯한 설명은?"
        options={['업로드가 회선을 다 써서 통화 패킷이 버려지고 재전송되기 때문이다', '업로드의 TCP가 버퍼가 넘칠 때까지 혼잡 창을 키워 버퍼가 늘 가득 차 있고, 통화 패킷도 그 긴 줄 뒤에서 기다리기 때문이다', '버퍼가 크면 공유기가 체크섬을 계산하는 데 오래 걸리기 때문이다', '업로드 연결이 손실 때문에 느린 시작을 계속 반복하기 때문이다']}
        answer={1}
        explain={<>손실이 거의 없다는 것이 단서입니다. 패킷이 사라지는 것이 아니라 줄을 서서 기다리는 것입니다. 손실 기반 혼잡 제어는 손실이 날 때까지 창을 키우므로, 버퍼가 크면 그 버퍼를 거의 채운 상태로 지냅니다. 업로드 회선이 느린 가정용 회선에서는 그 줄을 비우는 데만 1초가 넘게 걸릴 수 있고, 통화 패킷도 같은 줄에 섭니다. 연결마다 줄을 나누고 대기 시간을 관리하는 FQ-CoDel 같은 큐 관리가 대표적인 처방입니다.</>}
      />
    </>
  );
}

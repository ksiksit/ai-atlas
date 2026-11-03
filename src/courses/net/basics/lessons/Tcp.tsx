import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { ISN_C, ISN_S, LADDER, MSS, fmtBps, fmtBytes, SW_DELAY, SW_RTO, SW_SEGS, slidingWindow, windowThroughput, type LadderMsg } from './transport';
import '../../../cs/systems/lessons/saving.css';
import './transport.css';

function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, color: string, size = 11) {
  ctx.font = `600 ${size}px ${P.fontMono}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = P.surface;
  ctx.fillRect(x - tw / 2 - 3, y - size / 2 - 2, tw + 6, size + 4);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

/* ─────────────── Figure 1: a TCP connection, segment by segment ─────────────── */

const msgLabel = (m: LadderMsg, short: boolean) => {
  const parts = [m.flags, `seq=${m.seq}`];
  if (m.ack !== undefined) parts.push(`ack=${m.ack}`);
  if (m.len) parts.push(short ? `+${m.len}B` : `len=${m.len}`);
  return parts.join(' ');
};

function LadderFigure() {
  const P = usePalette();
  const s = useStepper(LADDER.length + 1, 1, null, true); // open on the whole exchange
  const shown = s.i; // messages 0..shown-1 have arrived
  const cur = shown - 1;
  const last = LADDER[cur];
  const tEnd = LADDER[LADDER.length - 1].t + 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const short = w < 520;
      const xc = short ? 34 : 70;
      const xs = w - xc;
      const top = 40;
      const unit = (h - top - 16) / (tEnd + 0.2);
      const Y = (t: number) => top + t * unit;
      // the two endpoints and their timelines
      ctx.font = `700 13px ${P.fontBody}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = P.neg;
      ctx.fillText('클라이언트', Math.max(xc, 40), 14);
      ctx.fillStyle = P.pos;
      ctx.fillText('서버', Math.min(xs, w - 22), 14);
      for (const [x, c] of [[xc, P.neg], [xs, P.pos]] as [number, string][]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, top - 10);
        ctx.lineTo(x, h - 10);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillText('시간 ↓', 4, h - 12);

      // once established, shade the stretch where data may flow
      if (shown >= 3) {
        const y0 = Y(LADDER[2].t + 1);
        const y1 = shown >= 8 ? Y(LADDER[7].t) : Y(LADDER[cur].t + 1);
        ctx.fillStyle = alpha(P.good, P.dark ? 0.12 : 0.08);
        ctx.fillRect(xc, Math.min(y0, Y(LADDER[3].t)), xs - xc, Math.max(0, y1 - Math.min(y0, Y(LADDER[3].t))));
      }

      LADDER.forEach((m, k) => {
        if (k >= shown) return;
        const from = m.from === 'c' ? xc : xs;
        const to = m.from === 'c' ? xs : xc;
        const col = m.from === 'c' ? P.neg : P.pos;
        const on = k === cur;
        ctx.globalAlpha = on ? 1 : 0.5;
        drawArrow(ctx, from, Y(m.t), to, Y(m.t + 1), col, on ? 2.4 : 1.6, 9);
        ctx.globalAlpha = on ? 1 : 0.75;
        tag(ctx, P, msgLabel(m, short), (from + to) / 2, (Y(m.t) + Y(m.t + 1)) / 2, on ? P.ink : P.ink2, short ? 10 : 11);
        ctx.globalAlpha = 1;
      });
    },
    [P, shown],
    { height: 470 },
  );

  return (
    <Figure
      no={1}
      title="TCP 연결 하나의 일생"
      hint="한 단계씩 넘겨 보세요"
      caption={<>왼쪽은 클라이언트, 오른쪽은 서버이고 시간은 아래로 흐릅니다. 화살표 하나가 세그먼트 하나이며, 비스듬한 것은 상대에게 닿기까지 시간이 걸리기 때문입니다. seq는 그 세그먼트의 첫 바이트 번호, ack는 "다음에 받을 바이트 번호"입니다. 읽기 쉽도록 시작 번호를 {ISN_C}과 {ISN_S}으로 두었지만, 실제로는 연결마다 무작위로 고른 32비트 수입니다. 초록 띠는 연결이 열려 데이터가 오가는 구간입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`클라이언트와 서버 사이의 TCP 세그먼트 교환. 지금까지 ${shown}개: ${LADDER.slice(0, shown).map((m) => m.flags).join(', ') || '없음'}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="step-note" aria-live="polite">
            {last ? last.note : '아직 아무것도 보내지 않았습니다. 서버는 LISTEN 상태로 연결을 기다리고, 클라이언트는 CLOSED 상태입니다.'}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="ladder-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="클라이언트 상태" value={last ? last.cState : 'CLOSED'} color="var(--neg)" />
            <Readout label="서버 상태" value={last ? last.sState : 'LISTEN'} color="var(--pos)" />
            <Readout label="지금까지 걸린 시간" value={last ? `${((last.t + 1) / 2).toFixed(1)} 왕복` : '0 왕복'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a sliding window on a lossy link ─────────────── */

const LOSS_OPTS = [0, 0.05, 0.1, 0.2].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }));

function WindowSimFigure() {
  const P = usePalette();
  const [w, setW] = useState(4);
  const [p, setP] = useState(0);
  const [seed, setSeed] = useState(1);
  const [drops, setDrops] = useState<number[]>([3]);
  const dropSet = useMemo(() => new Set(drops), [drops]);
  const frames = useMemo(() => slidingWindow(w, p, dropSet, seed), [w, p, dropSet, seed]);
  const ideal = useMemo(() => slidingWindow(w, 0, new Set(), 1).length - 1, [w]);
  const s = useStepper(frames.length, 4, `${w}|${p}|${seed}|${drops.join(',')}`, false, true);
  const f = frames[s.i];
  const end = frames[frames.length - 1];

  const toggle = (n: number) => setDrops((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h }) => {
      const padL = 4;
      const cw = Math.min(40, (W - padL * 2) / SW_SEGS);
      const x0 = (W - cw * SW_SEGS) / 2;
      const cx = (n: number) => x0 + n * cw;
      const ch = 26;
      const yS = 22;
      const yR = h - ch - 20;
      const laneTop = yS + ch + 4;
      const laneBot = yR - 4;
      const font = cw < 24 ? 10 : 12;

      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink2;
      ctx.fillText('보내는 쪽', x0, 10);
      ctx.fillText('받는 쪽', x0, h - 9);

      // lane guide
      ctx.fillStyle = alpha(P.ink, P.dark ? 0.04 : 0.025);
      ctx.fillRect(x0, laneTop, cw * SW_SEGS, laneBot - laneTop);

      for (let n = 0; n < SW_SEGS; n++) {
        const acked = n < f.base;
        const inWin = n >= f.base && n < f.base + w;
        const flying = inWin && n < f.next;
        ctx.fillStyle = acked ? alpha(P.good, 0.35) : flying ? P.hl : P.surface;
        ctx.fillRect(cx(n) + 1, yS, cw - 2, ch);
        ctx.strokeStyle = inWin ? P.ink2 : P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx(n) + 1.5, yS + 0.5, cw - 3, ch - 1);
        ctx.fillStyle = flying ? '#1a1a1a' : acked ? P.ink2 : P.ink3;
        ctx.font = `600 ${font}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(n), cx(n) + cw / 2, yS + ch / 2 + 1);
        if (dropSet.has(n) && !f.sentOnce[n]) {
          ctx.fillStyle = P.bad;
          ctx.beginPath();
          ctx.arc(cx(n) + cw - 5, yS + 5, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // receiver
        const got = f.received[n];
        const inOrder = n < f.expected;
        ctx.fillStyle = inOrder ? alpha(P.good, 0.35) : got ? alpha(P.stats2, 0.35) : P.surface;
        ctx.fillRect(cx(n) + 1, yR, cw - 2, ch);
        ctx.strokeStyle = P.line;
        ctx.strokeRect(cx(n) + 1.5, yR + 0.5, cw - 3, ch - 1);
        ctx.fillStyle = got ? P.ink2 : P.ink3;
        ctx.font = `600 ${font}px ${P.fontMono}`;
        ctx.fillText(String(n), cx(n) + cw / 2, yR + ch / 2 + 1);
      }
      // the window bracket
      const wb = Math.min(f.base, SW_SEGS);
      const we = Math.min(f.base + w, SW_SEGS);
      if (we > wb) {
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2.2;
        ctx.strokeRect(cx(wb) - 0.5, yS - 3, cx(we) - cx(wb) + 1, ch + 6);
      }

      // segments and ACKs in the air
      for (const fl of f.flights) {
        const prog = Math.min(1, (f.t - fl.sent) / SW_DELAY);
        if (fl.kind === 'data') {
          const x = cx(fl.n) + cw / 2;
          const k = fl.lost ? Math.min(prog, 0.5) : prog;
          const y = laneTop + 7 + k * (laneBot - laneTop - 14);
          const bw = Math.max(10, cw * 0.62);
          if (fl.lost && prog >= 0.5) {
            ctx.strokeStyle = P.bad;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 6);
            ctx.lineTo(x + 6, y + 6);
            ctx.moveTo(x + 6, y - 6);
            ctx.lineTo(x - 6, y + 6);
            ctx.stroke();
            continue;
          }
          ctx.fillStyle = fl.retx ? P.pos : P.hl;
          ctx.fillRect(x - bw / 2, y - 7, bw, 14);
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1;
          ctx.strokeRect(x - bw / 2 + 0.5, y - 6.5, bw - 1, 13);
          ctx.fillStyle = '#1a1a1a';
          ctx.font = `600 ${font - 1}px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.fillText(String(fl.n), x, y + 1);
        } else {
          const x = cx(Math.min(fl.n, SW_SEGS));
          const y = laneBot - 7 - prog * (laneBot - laneTop - 14);
          ctx.fillStyle = fl.dup ? P.bad : P.neg;
          ctx.beginPath();
          ctx.moveTo(x, y - 8);
          ctx.lineTo(x + 6, y + 4);
          ctx.lineTo(x - 6, y + 4);
          ctx.closePath();
          ctx.fill();
          ctx.font = `600 10px ${P.fontMono}`;
          ctx.textAlign = 'left';
          ctx.fillStyle = fl.dup ? P.bad : P.neg;
          ctx.fillText(`A${fl.n}`, x + 7, y);
        }
      }
    },
    [P, f, w, dropSet],
    { height: 230 },
  );

  return (
    <Figure
      no={2}
      title="슬라이딩 윈도와 재전송"
      hint="창 크기와 손실을 바꾸고, 버릴 세그먼트를 골라 보세요"
      caption={<>세그먼트 {SW_SEGS}개(0~{SW_SEGS - 1}번)를 보냅니다. 읽기 쉽도록 번호를 바이트 대신 세그먼트 단위로 셌습니다. 보내는 쪽은 한 틱에 하나씩 내보내고, 한 방향으로 {SW_DELAY}틱이 걸리므로 왕복은 {SW_DELAY * 2}틱입니다. 굵은 테두리가 창이고, 그 안에서는 ACK를 기다리지 않고 보낼 수 있습니다. 노란 상자는 처음 보낸 세그먼트, 주황 상자는 재전송, 파란 삼각형은 ACK(숫자는 다음에 받을 번호), 빨간 삼각형은 중복 ACK입니다. 받는 쪽의 보라색 칸은 앞 번호가 빠져 보관만 해 둔 세그먼트입니다. ACK는 사라지지 않는다고 가정했고, 재전송 타이머는 {SW_RTO}틱입니다.</>}
    >
      <div className="controls row">
        <Seg label="창 크기 (세그먼트)" value={w} onChange={setW} options={[1, 2, 3, 4, 8].map((v) => ({ value: v, label: String(v) }))} />
        <Seg label="무작위 손실률" value={p} onChange={setP} options={LOSS_OPTS} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`창 크기 ${w}의 슬라이딩 윈도. ${f.t}틱: ${f.base}번 앞까지 확인, 받는 쪽은 ${f.expected}번 앞까지 순서대로 받음.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="step-note" aria-live="polite">
        <span className="mono">{f.t}틱</span> · {f.note}
      </div>
      <div className="fig-split">
        <div className="tp-drops" role="group" aria-label="처음 보낼 때 버릴 세그먼트">
          <span className="ds-label">처음 보낼 때 사라질 세그먼트 (눌러서 고르기)</span>
          {Array.from({ length: SW_SEGS }, (_, n) => (
            <button key={n} type="button" className="tp-chip" aria-pressed={drops.includes(n)} onClick={() => toggle(n)}>
              {n}
            </button>
          ))}
          <div className="btn-row" style={{ marginTop: 6 }}>
            <Button small onClick={() => setDrops([])} disabled={!drops.length}>
              고른 것 지우기
            </Button>
            <Button small onClick={() => setSeed((x) => x + 1)} disabled={p === 0}>
              다른 무작위 손실
            </Button>
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="sw-speed" maxSpeed={20} />
        </div>
      </div>
      <div className="readouts">
        <Readout label="보낸 세그먼트" value={`${f.sent}개`} />
        <Readout label="빠른 재전송" value={`${f.fast}번`} color="var(--pos)" />
        <Readout label="시간 초과 재전송" value={`${f.timeouts}번`} color="var(--bad)" />
        <Readout label="순서대로 넘김" value={`${f.expected} / ${SW_SEGS}`} color="var(--good)" />
        <Readout label="끝나는 시각" value={`${end.t}틱`} />
        <Readout label="손실이 없었다면" value={`${ideal}틱`} />
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '처음 보낸 세그먼트', shape: 'sq' },
          { color: 'var(--pos)', label: '재전송', shape: 'sq' },
          { color: 'var(--neg)', label: 'ACK' },
          { color: 'var(--bad)', label: '중복 ACK · 손실' },
          { color: 'var(--c-stats-2)', label: '보관 중(순서 앞지름)', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: the window caps the throughput ─────────────── */

const LINKS = [1e7, 1e8, 1e9, 1e10];
const LINK_NAMES = ['10M', '100M', '1G', '10G'];
const BYTE_TICKS = ['1KB', '10KB', '100KB', '1MB', '10MB', '100MB'];
const BPS_TICKS = ['10kbps', '100kbps', '1Mbps', '10Mbps', '100Mbps', '1Gbps', '10Gbps'];
const X_MIN = 3; // log10 bytes
const X_MAX = 8;
const Y_MIN = 4; // log10 bps
const Y_MAX = 10.6;
const LIMIT16 = 65535;

function ThroughputFigure() {
  const P = usePalette();
  const [rtt, setRtt] = useState(100);
  const [link, setLink] = useState(1e9);
  const [lw, setLw] = useState(Math.log10(LIMIT16));
  const win = Math.pow(10, lw);
  const thr = windowThroughput(win, rtt, link);
  const bdp = (link * rtt) / 1000 / 8;
  const cap16 = windowThroughput(LIMIT16, rtt, link);
  const sw = windowThroughput(MSS, rtt, link);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: X_MIN, xMax: X_MAX, yMin: Y_MIN, yMax: Y_MAX, pad: { l: 58, r: 12, t: 14, b: 34 } });
      plot.grid({ xStep: 1, yStep: 1, labels: false, axes: false });
      plot.frame();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = X_MIN; x <= X_MAX; x++) {
        ctx.textAlign = x === X_MIN ? 'left' : x === X_MAX ? 'right' : 'center';
        ctx.fillText(BYTE_TICKS[x - X_MIN], plot.X(x), plot.Y(Y_MIN) + 5);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = Y_MIN; y <= 10; y++) ctx.fillText(BPS_TICKS[y - Y_MIN], plot.X(X_MIN) - 5, plot.Y(y));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.fillText('창 크기 →', plot.X(X_MAX) - 4, plot.Y(Y_MIN) - 4);

      // the 16-bit limit and the bandwidth-delay product
      plot.line(Math.log10(LIMIT16), Y_MIN, Math.log10(LIMIT16), Y_MAX, alpha(P.bad, 0.7), 1.4, [5, 4]);
      plot.text('창 확장 없는 상한 65,535B', Math.log10(LIMIT16), Y_MAX - 0.25, P.bad, { dx: 5, font: `11px ${P.fontBody}` });
      const lb = Math.log10(bdp);
      if (lb > X_MIN && lb < X_MAX) {
        plot.line(lb, Y_MIN, lb, Math.log10(link), alpha(P.ink, 0.45), 1.2, [3, 3]);
        plot.text('BDP', lb, Y_MIN + 0.3, P.ink2, { dx: 4, font: `600 11px ${P.fontMono}` });
      }
      plot.line(X_MIN, Math.log10(link), X_MAX, Math.log10(link), alpha(P.ink, 0.35), 1.2, [6, 4]);
      plot.text(`회선 ${LINK_NAMES[LINKS.indexOf(link)]}bps`, X_MIN, Math.log10(link), P.ink2, { dx: 6, dy: -10, font: `11px ${P.fontBody}` });
      plot.fn((x) => Math.log10(windowThroughput(Math.pow(10, x), rtt, link)), P.neg, 2.6);
      plot.dot(Math.log10(MSS), Math.log10(sw), 4, P.surface, P.ink2, 1.6);
      plot.text('멈춰 기다리기', Math.log10(MSS), Math.log10(sw), P.ink2, { dx: 7, dy: 10, font: `11px ${P.fontBody}` });
      plot.dot(lw, Math.log10(thr), 6, P.neg, P.surface, 2);
    },
    [P, rtt, link, lw, thr, bdp, sw],
    { aspect: 1.7, maxHeight: 360, minHeight: 260 },
  );

  return (
    <Figure
      no={3}
      title="창 크기가 처리량의 상한을 정한다"
      hint="왕복 시간과 회선 속도, 창 크기를 바꿔 보세요"
      caption={<>한 왕복에 창 크기만큼만 보낼 수 있으므로 처리량은 <M>{'W / \\text{RTT}'}</M>를 넘지 못하고, 회선 속도에서 다시 막힙니다. 두 축 모두 로그 눈금입니다. 회색 점은 세그먼트 하나({MSS.toLocaleString('ko-KR')}바이트)를 보내고 ACK를 기다리는 방식, 빨간 점선은 창 필드 16비트로 나타낼 수 있는 최대 65,535바이트입니다. 창이 BDP(회선 속도 × 왕복 시간)에 이르러야 회선을 다 씁니다. 손실과 혼잡은 없다고 가정했습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`왕복 ${rtt}ms, 회선 ${fmtBps(link)}에서 창 ${fmtBytes(win)}의 처리량은 ${fmtBps(thr)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="thr-rtt" label="왕복 시간 (RTT)" value={rtt} min={1} max={300} step={1} onChange={setRtt} format={(v) => `${v}ms`} />
          <Seg label="회선 속도 (bps)" value={link} onChange={setLink} options={LINKS.map((v, i) => ({ value: v, label: LINK_NAMES[i] }))} />
          <Slider id="thr-w" label="창 크기" value={lw} min={X_MIN} max={X_MAX} step={0.01} onChange={setLw} format={(v) => fmtBytes(Math.pow(10, v))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="처리량" value={fmtBps(thr)} color="var(--neg)" />
            <Readout label="회선 이용률" value={`${((thr / link) * 100).toFixed(thr / link < 0.01 ? 2 : 1)}%`} />
            <Readout label="BDP (필요한 창)" value={fmtBytes(bdp)} />
            <Readout label="65,535B 창의 상한" value={fmtBps(cap16)} color="var(--bad)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── TCP header ─────────────── */

const HEADER: { label: string; bits: number; k?: boolean }[] = [
  { label: '출발지 포트', bits: 16 },
  { label: '목적지 포트', bits: 16 },
  { label: '순서 번호 (seq)', bits: 32, k: true },
  { label: '확인 응답 번호 (ack)', bits: 32, k: true },
  { label: '헤더 길이', bits: 4 },
  { label: '예약', bits: 4 },
  { label: '플래그 (SYN·ACK·FIN·RST …)', bits: 8, k: true },
  { label: '수신 창 (window)', bits: 16, k: true },
  { label: '체크섬', bits: 16 },
  { label: '긴급 포인터', bits: 16 },
];

function TcpHeader() {
  return (
    <div className="wide" aria-label="TCP 헤더의 필드 배치: 한 줄이 32비트">
      <div className="tp-header-cap" aria-hidden="true">
        <span>0</span>
        <span>15 16</span>
        <span>31비트</span>
      </div>
      <div className="tp-header">
        {HEADER.map((f) => (
          <span key={f.label} data-k={f.k || undefined} style={{ gridColumn: `span ${f.bits}` }}>
            {f.label}
          </span>
        ))}
        <span style={{ gridColumn: 'span 32' }}>옵션 (0~40바이트: MSS, 창 확장, SACK, 타임스탬프 …)</span>
      </div>
    </div>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Tcp() {
  return (
    <>
      <h2>IP가 약속하지 않는 것</h2>
      <p>
        <a href="#net-basics/ip-routing">앞 장</a>에서 본 IP는 패킷을 목적지 쪽으로 한 칸씩 넘길 뿐, 도착을 보장하지 않습니다. 이런 방식을 <T en="best effort">최선형 전달</T>이라고 합니다. 라우터의 버퍼가 넘치면 패킷은 그냥 버려지고, 경로가 바뀌면 뒤에 보낸 패킷이 먼저 도착하기도 하며, 드물게는 같은 패킷이 두 번 오거나 비트가 깨져 옵니다. 그런데 웹 페이지나 파일은 한 바이트만 빠져도 쓸 수 없습니다.
      </p>
      <p>
        <T en="Transmission Control Protocol">TCP</T>는 이 불안한 패킷 전달 위에 <strong>빠짐없고, 순서대로이며, 중복 없는 바이트 흐름</strong>을 만들어 줍니다. 응용 프로그램은 파일에 쓰듯 바이트를 밀어 넣고, 반대쪽은 같은 바이트를 같은 순서로 읽습니다. 이 장은 TCP가 그 약속을 어떻게 지키는지 봅니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>네트워크에서 생기는 일</th>
              <th>TCP의 대책</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>패킷이 사라진다</td>
              <td>확인 응답(ACK)이 오지 않으면 다시 보낸다</td>
            </tr>
            <tr>
              <td>순서가 뒤바뀐다</td>
              <td>바이트마다 번호를 매겨, 받는 쪽이 번호 순서로 다시 맞춘다</td>
            </tr>
            <tr>
              <td>같은 것이 두 번 온다</td>
              <td>이미 받은 번호면 버린다</td>
            </tr>
            <tr>
              <td>비트가 깨진다</td>
              <td>체크섬이 맞지 않으면 버린다(그러면 사라진 것과 같아져 재전송된다)</td>
            </tr>
            <tr>
              <td>받는 프로그램이 느리다</td>
              <td>받을 수 있는 양을 알려 그 이상 보내지 않는다(흐름 제어)</td>
            </tr>
            <tr>
              <td>네트워크가 붐빈다</td>
              <td>손실을 신호로 보내는 양을 줄인다(혼잡 제어, <a href="#net-basics/congestion">다음 장</a>)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>포트와 연결</h2>
      <p>
        한 컴퓨터에서 브라우저, 메신저, 게임이 동시에 통신하므로, 도착한 데이터를 어느 프로그램에 줄지 가려야 합니다. 그래서 TCP는 16비트 <T en="port">포트</T> 번호를 씁니다. 웹 서버는 보통 80번(HTTP)이나 443번(HTTPS)에서 기다리고, 클라이언트는 운영체제가 그때그때 비어 있는 번호(임시 포트)를 골라 씁니다. TCP 연결 하나는 <strong>(출발지 IP, 출발지 포트, 목적지 IP, 목적지 포트)</strong> 네 값의 묶음으로 구별됩니다. 같은 서버의 443번 포트에 수만 명이 동시에 붙어도 각자의 IP와 포트가 달라 서로 섞이지 않습니다.
      </p>
      <p>TCP는 데이터 앞에 최소 20바이트의 헤더를 붙입니다. 이 장에서 중요한 칸은 색으로 표시했습니다.</p>
      <TcpHeader />

      <h2>3-way 핸드셰이크</h2>
      <p>
        TCP는 데이터를 보내기 전에 먼저 <T en="connection">연결</T>을 엽니다. 양쪽이 "내 바이트는 몇 번부터 센다"는 <T en="initial sequence number">시작 순서 번호</T>를 서로 알리고 확인받는 과정입니다. 클라이언트가 SYN을, 서버가 SYN과 ACK를 함께, 클라이언트가 다시 ACK를 보내는 세 번의 메시지로 이루어져 <T en="three-way handshake">3-way 핸드셰이크</T>라고 부릅니다.
      </p>
      <LadderFigure />
      <p>
        왜 두 번이 아니라 세 번일까요? 번호는 방향마다 따로 있습니다. 클라이언트의 번호는 SYN과 SYN-ACK로, 서버의 번호는 SYN-ACK와 마지막 ACK로 확인되므로, 양쪽 번호가 모두 확인되려면 세 번이 필요합니다. 시작 번호를 무작위로 고르는 이유도 있습니다. 예전 연결에서 늦게 도착한 세그먼트가 새 연결의 데이터로 오인되지 않게 하고, 번호를 모르는 공격자가 가짜 세그먼트를 끼워 넣기 어렵게 하려는 것입니다.
      </p>
      <p>
        핸드셰이크에는 대가가 있습니다. 요청을 보내기까지 1 왕복을 먼저 써야 합니다. 서울에서 미국 서버까지 왕복이 150ms라면 아무 데이터도 오가기 전에 150ms가 지나갑니다. 연결을 한 번 열어 여러 요청에 다시 쓰는 것이 중요한 이유이고, <a href="#net-basics/http">HTTP 장</a>에서 이 왕복을 줄이는 방법들을 봅니다. 닫을 때는 양쪽이 FIN을 하나씩 보내고 확인받습니다. 방향마다 따로 닫으므로, 한쪽이 다 보낸 뒤에도 반대쪽은 계속 보낼 수 있습니다.
      </p>

      <h2>순서 번호와 누적 ACK</h2>
      <p>
        TCP의 번호는 세그먼트가 아니라 <strong>바이트</strong>에 매깁니다. 1,000바이트짜리 세그먼트의 seq가 7001이면 그 안의 바이트는 7001~8000번이고, 다음 세그먼트는 8001번부터입니다. 받는 쪽이 보내는 ack 번호는 "이 번호 앞까지는 <strong>빠짐없이</strong> 받았으니, 다음엔 이 번호를 달라"는 뜻입니다. 이를 <T en="cumulative acknowledgment">누적 확인 응답</T>이라고 합니다.
      </p>
      <p>
        누적 ACK에는 두 가지 장점이 있습니다. ACK 하나가 앞의 여러 세그먼트를 한꺼번에 확인하므로 ACK가 하나쯤 사라져도 다음 ACK가 대신하고, 받는 쪽은 "어디까지 받았나" 하나만 알리면 됩니다. 대신 중간이 하나 빠지면, 그 뒤의 세그먼트가 아무리 많이 와도 ack 번호는 빠진 곳에서 멈춥니다. 같은 번호의 ACK가 반복되는 이것이 <T en="duplicate ACK">중복 ACK</T>이고, 보내는 쪽에게는 "무언가 빠졌다"는 신호가 됩니다.
      </p>

      <h2>언제 다시 보낼까</h2>
      <p>보내는 쪽이 손실을 알아채는 방법은 두 가지입니다.</p>
      <ul>
        <li>
          <T en="retransmission timeout">재전송 타임아웃</T>(RTO): 보낸 지 일정 시간이 지나도 ACK가 오지 않으면 다시 보냅니다. 너무 짧으면 멀쩡히 가고 있는 세그먼트를 쓸데없이 다시 보내고, 너무 길면 손실 뒤에 한참을 놀게 됩니다.
        </li>
        <li>
          <T en="fast retransmit">빠른 재전송</T>: 같은 ACK가 세 번 더(중복 ACK 3개) 오면, 타이머를 기다리지 않고 빠진 세그먼트를 바로 다시 보냅니다. 중복 ACK 한두 개는 순서가 살짝 뒤바뀌어도 생기므로, 세 개를 기다려 진짜 손실일 가능성이 클 때만 움직입니다.
        </li>
      </ul>
      <p>
        왕복 시간은 경로와 혼잡에 따라 계속 변하므로, RTO는 측정한 왕복 시간 <M>R</M>로 평균과 흔들림을 함께 추정해 정합니다. 표준(RFC 6298)의 계산은 이렇습니다.
      </p>
      <MB note="α = 1/8, β = 1/4. 표준은 RTO를 최소 1초로 권하지만, 리눅스는 200ms를 하한으로 씁니다.">{'\\begin{aligned} \\text{SRTT} &\\leftarrow (1-\\alpha)\\,\\text{SRTT} + \\alpha R \\\\ \\text{RTTVAR} &\\leftarrow (1-\\beta)\\,\\text{RTTVAR} + \\beta\\,|\\text{SRTT} - R| \\\\ \\text{RTO} &= \\text{SRTT} + 4\\,\\text{RTTVAR} \\end{aligned}'}</MB>
      <p>
        평균에 흔들림의 네 배를 더해 두는 것은, 가끔 늦게 오는 ACK 때문에 쓸데없이 재전송하지 않으려는 여유입니다. 다시 보낸 세그먼트의 ACK로는 왕복 시간을 재지 않습니다. 그 ACK가 처음 보낸 것에 대한 답인지 다시 보낸 것에 대한 답인지 알 수 없기 때문입니다(카른 알고리즘). 그림 2에서 두 방법을 직접 비교해 보세요.
      </p>
      <WindowSimFigure />
      <p>
        처음 설정은 창 4개에서 3번 세그먼트가 사라지는 경우입니다. 뒤따른 4, 5, 6번이 도착할 때마다 받는 쪽은 "아직 3번을 기다린다"는 같은 ACK를 보내고, 세 번째 중복 ACK에서 보내는 쪽이 3번을 다시 보냅니다. 3번이 도착하는 순간 받는 쪽은 보관해 둔 4~6번까지 한꺼번에 넘기고 ACK 7을 보냅니다. 끝나는 시각은 손실이 없을 때의 44틱에서 63틱으로 늘어납니다.
      </p>
      <p>
        이제 창을 3으로 줄여 보세요. 3번 뒤로 4, 5번 두 개밖에 보낼 수 없으니 중복 ACK가 두 번에서 멈추고, 보내는 쪽은 타이머가 끝날 때까지 기다려야 합니다. 손실이 없을 때 61틱이던 것이 81틱이 됩니다. 반대로 창을 8로 늘리면 빠른 재전송이 금방 일어나 28틱에서 41틱으로만 늘어납니다. 빠른 재전송은 뒤에 보낸 세그먼트가 충분히 있어야 작동합니다. 무작위 손실률을 20%로 올리면 재전송이 재전송을 부르면서 시간 초과가 늘어나는 것도 볼 수 있습니다.
      </p>
      <Callout kind="note">
        누적 ACK만으로는 "3번이 빠졌다"는 것만 알 수 있고 "4~6번은 받았다"는 것은 알 수 없습니다. 손실이 여러 개면 하나씩 차례로 알아내야 해서 느립니다. 그래서 오늘날 거의 모든 TCP는 받은 구간을 따로 알려 주는 <T en="selective acknowledgment">SACK</T> 옵션을 함께 씁니다.
      </Callout>

      <h2>창 크기가 처리량을 정한다</h2>
      <p>
        세그먼트를 하나 보내고 ACK를 기다렸다가 다음 것을 보내면(<T en="stop-and-wait">멈춰 기다리기</T>), 한 왕복에 세그먼트 하나밖에 못 보냅니다. 그림 2에서 창을 1로 두면 손실이 없어도 161틱, 창 8의 거의 여섯 배가 걸리는 이유입니다. 그래서 TCP는 확인받지 않은 바이트를 정해진 양까지 띄워 보냅니다. 이 양이 <T en="window">창</T>이고, 앞쪽 바이트가 확인될 때마다 창이 앞으로 미끄러진다고 해서 <T en="sliding window">슬라이딩 윈도</T>라고 부릅니다. 한 왕복에 창 크기 W만큼 보낼 수 있으니 처리량의 상한은 이렇습니다.
      </p>
      <MB note="회선을 다 쓰려면 W가 BDP = 회선 속도 × RTT 이상이어야 합니다.">{'\\text{처리량} \\le \\min\\!\\left(\\frac{W}{\\text{RTT}},\\ \\text{회선 속도}\\right)'}</MB>
      <p>
        회선 속도와 왕복 시간을 곱한 <T en="bandwidth-delay product">대역폭-지연 곱</T>(BDP)은 "회선 위에 동시에 떠 있을 수 있는 데이터의 양"입니다. 1Gbps 회선에 왕복 100ms면 BDP는 12.5MB로, 이만큼을 확인받기 전에 띄워 보내야 회선을 다 씁니다.
      </p>
      <ThroughputFigure />
      <p>
        TCP 헤더의 창 칸은 16비트라서 최대 65,535바이트까지만 나타낼 수 있습니다. 1981년의 네트워크에는 충분했지만, 왕복 100ms에서 이 창으로는 회선이 아무리 빨라도 약 5.24Mbps가 한계입니다. 멈춰 기다리기({MSS.toLocaleString('ko-KR')}바이트)라면 116.8kbps에 그칩니다. 이렇게 빠르고 먼 <T en="long fat network">긴 굵은 네트워크</T>를 위해 연결을 열 때 <T en="window scaling">창 확장</T> 옵션으로 창 값에 곱할 2의 거듭제곱(최대 2¹⁴)을 정해 두고, 창을 1GB 가까이까지 쓸 수 있게 했습니다.
      </p>
      <p>
        이 창은 두 가지로 제한됩니다. 하나는 받는 쪽이 헤더의 창 칸으로 알려 주는 <T en="receive window">수신 창</T>입니다. 받는 프로그램이 데이터를 읽어 가는 속도보다 빨리 보내 받는 쪽 버퍼가 넘치지 않게 하는 것으로, <T en="flow control">흐름 제어</T>라고 합니다. 다른 하나는 네트워크가 감당할 수 있는 양을 보내는 쪽이 스스로 어림한 <T en="congestion window">혼잡 창</T>입니다. 실제로 띄워 보내는 양은 둘 중 작은 값이고, 혼잡 창이 다음 장의 주제입니다.
      </p>

      <h2>UDP: 아무것도 약속하지 않는 쪽</h2>
      <p>
        모든 통신에 TCP가 맞는 것은 아닙니다. <T en="User Datagram Protocol">UDP</T>는 8바이트 헤더에 포트 번호와 길이, 체크섬만 담고, 연결도 재전송도 순서 맞추기도 하지 않습니다. 대신 핸드셰이크 없이 바로 보내고, 사라진 패킷 때문에 뒤의 패킷이 기다리는 일도 없습니다. 짧은 질문과 답 하나로 끝나는 <a href="#net-basics/dns">DNS</a>, 0.2초 늦게 온 음성은 어차피 쓸모없는 화상 통화, 최신 위치만 중요한 게임이 UDP를 씁니다. HTTP/3의 QUIC처럼, UDP 위에 필요한 만큼의 신뢰성을 프로그램이 직접 만들어 얹기도 합니다.
      </p>

      <Callout kind="key">
        IP는 패킷을 최선을 다해 나를 뿐이고, TCP가 그 위에 빠짐없고 순서대로인 바이트 흐름을 만듭니다. 3-way 핸드셰이크로 양쪽의 시작 번호를 맞추고, 바이트마다 번호를 매겨 누적 ACK로 확인하며, 중복 ACK 세 개(빠른 재전송)나 타임아웃(RTO)으로 손실을 알아채 다시 보냅니다. ACK를 기다리지 않고 창 크기만큼 띄워 보내므로 처리량은 <M>{'\\min(W/\\text{RTT},\\ \\text{회선 속도})'}</M>이고, 회선을 다 쓰려면 창이 BDP만큼 커야 합니다.
      </Callout>
      <Quiz
        q="창 확장 옵션이 꺼진 오래된 장비로, 왕복 시간이 200ms인 해외 서버에서 큰 파일을 받는다. 회선은 1Gbps이고 손실은 거의 없다. 다운로드 속도의 상한에 가장 가까운 것은?"
        options={['약 1Gbps: 손실이 없으면 회선 속도가 상한이다', '약 2.6Mbps', '약 26Mbps', '약 320Mbps']}
        answer={1}
        explain={<>창 칸이 16비트이므로 확인받지 않은 데이터를 65,535바이트까지만 띄울 수 있습니다. 한 왕복(0.2초)에 65,535바이트, 즉 <M>{'65{,}535 \\times 8 / 0.2 \\approx 2.6'}</M>Mbps가 상한입니다. 1Gbps를 다 쓰려면 BDP인 25MB만큼의 창이 필요하므로, 회선을 0.3%도 쓰지 못합니다.</>}
      />
    </>
  );
}

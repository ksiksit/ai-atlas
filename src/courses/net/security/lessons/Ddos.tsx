import { useMemo, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { AMPLIFIERS, SYN_ATTACK_FROM, SYN_ATTACK_TO, SYN_BYTES, SYN_HOLD, SYN_LEGIT_RATE, SYN_SECONDS, TB_ABUSE_FROM, TB_ABUSE_RATE, TB_ABUSE_TO, TB_SECONDS, fmtBps, reflected, synFlood, synSuccessDuringAttack, tbSummary, tokenBucket } from './attacks';
import './attacks.css';

function txt(ctx: CanvasRenderingContext2D, P: Palette, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', font = `11px ${P.fontBody}`, base: CanvasTextBaseline = 'middle') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}

/* ─────────────── Figure 1: SYN flood against the backlog ─────────────── */

const ATTACK_RATES = [0, 5, 20, 100, 1000];
const BACKLOGS = [128, 1024, 4096];

function SynFigure() {
  const P = usePalette();
  const [rate, setRate] = useState(100);
  const [backlog, setBacklog] = useState(128);
  const [cookies, setCookies] = useState(false);
  const series = useMemo(() => synFlood(rate, backlog, cookies), [rate, backlog, cookies]);
  const success = synSuccessDuringAttack(series);
  const peak = Math.max(...series.map((s) => s.halfOpen));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 16;
      const top = (h - gap) * 0.56;
      const pad = { l: 46, r: 12, t: 22, b: 6 };
      const yMax = backlog * 1.12;
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: SYN_SECONDS, yMin: 0, yMax, pad });
      // the attack window
      ctx.fillStyle = alpha(P.bad, P.dark ? 0.12 : 0.07);
      ctx.fillRect(p1.X(SYN_ATTACK_FROM), pad.t, p1.X(SYN_ATTACK_TO) - p1.X(SYN_ATTACK_FROM), p1.ph);
      p1.grid({ xStep: 10, yStep: backlog / 2, labels: false, axes: false });
      for (const y of [0, backlog / 2, backlog]) txt(ctx, P, y.toLocaleString('ko-KR'), p1.X(0) - 5, p1.Y(y), P.ink3, 'right', `11px ${P.fontMono}`);
      txt(ctx, P, '반쯤 열린 연결 (백로그를 차지한 칸)', p1.X(0), 10, P.ink2, 'left', `12px ${P.fontBody}`);
      txt(ctx, P, '공격 중', (p1.X(SYN_ATTACK_FROM) + p1.X(SYN_ATTACK_TO)) / 2, pad.t + 9, P.bad, 'center', `600 11px ${P.fontBody}`);
      p1.line(0, backlog, SYN_SECONDS, backlog, alpha(P.ink, 0.6), 1.2, [6, 4]);
      txt(ctx, P, `백로그 ${backlog.toLocaleString('ko-KR')}칸`, p1.X(SYN_SECONDS) - 4, p1.Y(backlog) - 8, P.ink2, 'right');
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      series.forEach((s, i) => {
        const x = p1.X(s.t);
        const y = p1.Y(s.halfOpen);
        if (i === 0) ctx.moveTo(p1.X(0), p1.Y(0));
        ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.save();
      ctx.translate(0, top + gap);
      const H2 = h - top - gap;
      const p2 = new Plot(ctx, w, H2, P, { xMin: 0, xMax: SYN_SECONDS, yMin: 0, yMax: 105, pad: { l: 46, r: 12, t: 22, b: 22 } });
      ctx.fillStyle = alpha(P.bad, P.dark ? 0.12 : 0.07);
      ctx.fillRect(p2.X(SYN_ATTACK_FROM), 22, p2.X(SYN_ATTACK_TO) - p2.X(SYN_ATTACK_FROM), p2.ph);
      p2.grid({ xStep: 10, yStep: 50, labels: false, axes: false });
      for (const y of [0, 50, 100]) txt(ctx, P, `${y}%`, p2.X(0) - 5, p2.Y(y), P.ink3, 'right', `11px ${P.fontMono}`);
      for (let x = 0; x <= SYN_SECONDS; x += 10) txt(ctx, P, `${x}초`, p2.X(x), p2.Y(0) + 5, P.ink3, x === 0 ? 'left' : x === SYN_SECONDS ? 'right' : 'center', `11px ${P.fontMono}`, 'top');
      txt(ctx, P, '정상 사용자의 연결 성공률 (초마다)', p2.X(0), 10, P.ink2, 'left', `12px ${P.fontBody}`);
      const bw = Math.max(1, p2.sx * 0.7);
      for (const s of series) {
        const v = s.legitTried ? (s.legitOk / s.legitTried) * 100 : 100;
        ctx.fillStyle = v >= 99.5 ? alpha(P.good, 0.8) : P.neg;
        ctx.fillRect(p2.X(s.t - 0.5) - bw / 2, p2.Y(v), bw, p2.Y(0) - p2.Y(v));
      }
      ctx.restore();
    },
    [P, series, backlog],
    { aspect: 1.75, maxHeight: 400, minHeight: 300 },
  );

  const attackBps = rate * SYN_BYTES * 8;
  return (
    <Figure
      no={1}
      title="SYN 플러드와 백로그"
      hint="공격 속도와 백로그 크기를 바꾸고, SYN 쿠키를 켜 보세요"
      caption={
        <>
          서버에는 정상 사용자가 초당 {SYN_LEGIT_RATE}번 접속하고, {SYN_ATTACK_FROM}초부터 {SYN_ATTACK_TO}초까지 출발지 주소를 위조한 SYN이 함께 쏟아집니다. 위조한 SYN에 보낸 SYN-ACK는 엉뚱한 곳으로 가므로 마지막 ACK가 오지 않고, 서버는 그 반쯤 열린 연결을 {SYN_HOLD}초 동안 백로그에 붙잡아 둔다고 가정했습니다. 백로그가 가득 차면 새 SYN은 버려집니다. SYN 쿠키를 켜면 백로그가 찼을 때 상태를 남기지 않고 답하므로, 위조한 SYN은 아무것도 차지하지 못하고 정상 사용자는 ACK에 실린 쿠키로 연결을 마칩니다. 무작위 도착은 시드를 고정해 늘 같은 결과를 냅니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`초당 ${rate}개의 위조 SYN, 백로그 ${backlog}칸, SYN 쿠키 ${cookies ? '켬' : '끔'}: 공격 중 정상 연결 성공률 ${(success * 100).toFixed(1)}%`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="위조 SYN (초당)" value={rate} onChange={setRate} options={ATTACK_RATES.map((v) => ({ value: v, label: v.toLocaleString('ko-KR') }))} />
          <Seg label="백로그 크기 (칸)" value={backlog} onChange={setBacklog} options={BACKLOGS.map((v) => ({ value: v, label: v.toLocaleString('ko-KR') }))} />
          <Check label="SYN 쿠키 켜기" checked={cookies} onChange={setCookies} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="공격 중 정상 연결 성공률" value={`${(success * 100).toFixed(1)}%`} color={success > 0.995 ? 'var(--good)' : 'var(--neg)'} />
            <Readout label="공격에 드는 대역폭" value={rate ? fmtBps(attackBps) : '—'} color="var(--bad)" />
            <Readout label="반쯤 열린 연결 최대" value={`${peak.toLocaleString('ko-KR')}개`} />
            <Readout label="백로그를 채우는 공격 속도" value={`초당 ${(backlog / SYN_HOLD).toFixed(1)}개`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '반쯤 열린 연결', shape: 'ln' },
          { color: 'var(--good)', label: '성공률 100%', shape: 'sq' },
          { color: 'var(--neg)', label: '성공률이 떨어진 초', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: reflection and amplification ─────────────── */

const UPLINKS = [
  { value: 10e6, label: '10Mbps' },
  { value: 100e6, label: '100Mbps' },
  { value: 1e9, label: '1Gbps' },
];
const VICTIM_LINK = 10e9;

function AmpFigure() {
  const P = usePalette();
  const [proto, setProto] = useState('ntp');
  const [uplink, setUplink] = useState(100e6);
  const amp = AMPLIFIERS.find((a) => a.id === proto)!;
  const atVictim = reflected(uplink, amp.hi);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 520;
      // three columns: attacker, reflectors, victim
      const colX = [w * 0.12, w * 0.5, w * 0.88];
      const midY = h * 0.42;
      const boxW = narrow ? 66 : 92;
      const boxH = 34;
      const box = (x: number, y: number, label: string, sub: string, color: string) => {
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        txt(ctx, P, label, x, y - 6, P.ink, 'center', `600 ${narrow ? 11 : 12}px ${P.fontBody}`);
        txt(ctx, P, sub, x, y + 8, P.ink3, 'center', `${narrow ? 9 : 10}px ${P.fontMono}`);
      };
      // line widths on a log scale of bits per second
      const lw = (bps: number) => Math.max(1, Math.min(22, (Math.log10(bps) - 6) * 3.2));
      const reflY = [midY - 46, midY, midY + 46];
      for (const ry of reflY) {
        drawArrow(ctx, colX[0] + boxW / 2 + 4, midY, colX[1] - boxW / 2 - 6, ry, alpha(P.neg, 0.9), Math.max(1, lw(uplink / 3) * 0.6), 8);
        drawArrow(ctx, colX[1] + boxW / 2 + 4, ry, colX[2] - boxW / 2 - 6, midY, alpha(P.bad, 0.75), lw(atVictim / 3), 12);
      }
      box(colX[0], midY, '공격자', fmtBps(uplink), P.neg);
      reflY.forEach((ry, i) => box(colX[1], ry, i === 1 ? `반사기 (${amp.name})` : amp.name, amp.port, P.lineStrong));
      box(colX[2], midY, '피해자', `회선 ${fmtBps(VICTIM_LINK)}`, P.bad);
      txt(ctx, P, narrow ? '보낸 사람: 피해자(위조)' : '작은 요청, 보낸 사람 = 피해자 (위조)', (colX[0] + colX[1]) / 2, midY - 70, P.neg, 'center', `600 ${narrow ? 10 : 11}px ${P.fontBody}`);
      txt(ctx, P, narrow ? `응답 ${amp.hi.toLocaleString('ko-KR')}배` : `큰 응답이 피해자에게 (최대 ${amp.hi.toLocaleString('ko-KR')}배)`, (colX[1] + colX[2]) / 2, midY - 70, P.bad, 'center', `600 ${narrow ? 10 : 11}px ${P.fontBody}`);

      // bars on a log axis: attacker uplink, traffic at victim, victim link
      const y0 = h * 0.78;
      const x0 = narrow ? 70 : 100;
      const x1 = w - 16;
      const lo = 6; // 1 Mbps
      const hi = 14; // 100 Tbps
      const X = (bps: number) => x0 + ((Math.log10(Math.max(bps, 1e6)) - lo) / (hi - lo)) * (x1 - x0);
      const rows: [string, number, string][] = [
        ['공격자 회선', uplink, P.neg],
        ['피해자에 도착', atVictim, P.bad],
      ];
      rows.forEach(([name, v, col], i) => {
        const y = y0 + i * 18;
        txt(ctx, P, name, x0 - 8, y, P.ink2, 'right', `${narrow ? 10 : 11}px ${P.fontBody}`);
        ctx.fillStyle = col;
        ctx.fillRect(x0, y - 6, X(v) - x0, 12);
        txt(ctx, P, fmtBps(v), Math.min(X(v) + 5, x1 - 4), y, P.ink, X(v) + 60 > x1 ? 'right' : 'left', `600 11px ${P.fontMono}`);
      });
      // the victim's link capacity
      const vx = X(VICTIM_LINK);
      ctx.strokeStyle = P.ink;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(vx, y0 - 14);
      ctx.lineTo(vx, y0 + 26);
      ctx.stroke();
      ctx.setLineDash([]);
      txt(ctx, P, '피해자 회선', vx, y0 - 20, P.ink2, 'center', `10px ${P.fontBody}`);
      for (let e = lo; e <= hi; e += 2) txt(ctx, P, fmtBps(10 ** e), X(10 ** e), y0 + 34, P.ink3, e === lo ? 'left' : e === hi ? 'right' : 'center', `10px ${P.fontMono}`, 'top');
    },
    [P, amp, uplink, atVictim],
    { aspect: 1.7, maxHeight: 360, minHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="반사와 증폭"
      hint="프로토콜과 공격자의 회선을 바꿔 보세요"
      caption={
        <>
          공격자는 UDP 요청의 출발지 주소를 피해자의 주소로 위조해 인터넷에 열려 있는 서버(반사기)들에 보냅니다. 반사기들은 요청보다 훨씬 큰 응답을 "보낸 사람"인 피해자에게 돌려줍니다. 증폭률은 미국 US-CERT 경보 TA14-017A가 프로토콜별로 보고한 대역폭 증폭률이며, 범위로 보고된 것은 큰 값을 썼습니다. 이는 가장 나쁜 경우의 값이고, 실제 공격량은 쓸 수 있는 반사기의 수와 그 회선에 막혀 이보다 적습니다. 아래 막대의 가로축은 로그 눈금입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="반사에 쓰는 프로토콜" value={proto} onChange={setProto} options={AMPLIFIERS.map((a) => ({ value: a.id, label: a.name }))} />
        <Seg label="공격자가 쓰는 회선" value={uplink} onChange={setUplink} options={UPLINKS} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${amp.name} 반사 공격: 공격자 ${fmtBps(uplink)}로 피해자에게 최대 ${fmtBps(atVictim)}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="보고된 증폭률" value={amp.lo === amp.hi ? `${amp.hi.toLocaleString('ko-KR')}배` : `${amp.lo.toLocaleString('ko-KR')}~${amp.hi.toLocaleString('ko-KR')}배`} color="var(--bad)" />
        <Readout label="피해자에 도착 (이론상 최대)" value={fmtBps(atVictim)} color="var(--bad)" />
        <Readout label="피해자 회선의 몇 배" value={`${(atVictim / VICTIM_LINK).toLocaleString('ko-KR', { maximumFractionDigits: atVictim / VICTIM_LINK < 10 ? 2 : 0 })}배`} />
        <Readout label="악용하는 기능" value={<span style={{ fontSize: 'var(--fs-xs)' }}>{amp.what}</span>} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a token-bucket rate limiter ─────────────── */

function BucketFigure() {
  const P = usePalette();
  const [cap, setCap] = useState(10);
  const [rate, setRate] = useState(5);
  const series = useMemo(() => tokenBucket(cap, rate), [cap, rate]);
  const sum = tbSummary(series);
  const yMax = Math.max(12, ...series.map((s) => s.ok + s.dropped)) * 1.1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 14;
      const top = (h - gap) * 0.62;
      const pad = { l: 40, r: 12, t: 22, b: 6 };
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: TB_SECONDS, yMin: 0, yMax, pad });
      ctx.fillStyle = alpha(P.bad, P.dark ? 0.12 : 0.07);
      ctx.fillRect(p1.X(TB_ABUSE_FROM), pad.t, p1.X(TB_ABUSE_TO) - p1.X(TB_ABUSE_FROM), p1.ph);
      p1.grid({ xStep: 10, yStep: yMax > 40 ? 20 : 10, labels: false, axes: false });
      for (let y = 0; y <= yMax; y += yMax > 40 ? 20 : 10) txt(ctx, P, String(y), p1.X(0) - 5, p1.Y(y), P.ink3, 'right', `11px ${P.fontMono}`);
      txt(ctx, P, '초마다 들어온 요청', p1.X(0), 10, P.ink2, 'left', `12px ${P.fontBody}`);
      txt(ctx, P, '스크립트가 몰아침', (p1.X(TB_ABUSE_FROM) + p1.X(TB_ABUSE_TO)) / 2, pad.t + 9, P.bad, 'center', `600 11px ${P.fontBody}`);
      const bw = Math.max(1.5, p1.sx * 0.72);
      for (const s of series) {
        const x = p1.X(s.t + 0.5) - bw / 2;
        ctx.fillStyle = alpha(P.good, 0.85);
        ctx.fillRect(x, p1.Y(s.ok), bw, p1.Y(0) - p1.Y(s.ok));
        ctx.fillStyle = alpha(P.bad, 0.85);
        ctx.fillRect(x, p1.Y(s.ok + s.dropped), bw, p1.Y(s.ok) - p1.Y(s.ok + s.dropped));
      }
      p1.line(0, rate, TB_SECONDS, rate, alpha(P.ink, 0.6), 1.2, [6, 4]);
      {
        const label = `채우는 속도 초당 ${rate}개`;
        ctx.font = `11px ${P.fontBody}`;
        const tw = ctx.measureText(label).width;
        const lx = p1.X(TB_SECONDS) - 4;
        const ly = Math.max(pad.t + 8, p1.Y(rate) - 9);
        ctx.fillStyle = alpha(P.surface, 0.88);
        ctx.fillRect(lx - tw - 3, ly - 8, tw + 6, 16);
        txt(ctx, P, label, lx, ly, P.ink2, 'right');
      }

      ctx.save();
      ctx.translate(0, top + gap);
      const H2 = h - top - gap;
      const p2 = new Plot(ctx, w, H2, P, { xMin: 0, xMax: TB_SECONDS, yMin: 0, yMax: cap * 1.15, pad: { l: 40, r: 12, t: 20, b: 22 } });
      p2.grid({ xStep: 10, yStep: cap, labels: false, axes: false });
      for (const y of [0, cap]) txt(ctx, P, String(y), p2.X(0) - 5, p2.Y(y), P.ink3, 'right', `11px ${P.fontMono}`);
      for (let x = 0; x <= TB_SECONDS; x += 10) txt(ctx, P, `${x}초`, p2.X(x), p2.Y(0) + 5, P.ink3, x === 0 ? 'left' : x === TB_SECONDS ? 'right' : 'center', `11px ${P.fontMono}`, 'top');
      txt(ctx, P, '양동이에 남은 토큰 (매초 끝)', p2.X(0), 9, P.ink2, 'left', `12px ${P.fontBody}`);
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p2.X(0), p2.Y(cap));
      series.forEach((s) => ctx.lineTo(p2.X(s.t + 1), p2.Y(s.level)));
      ctx.stroke();
      ctx.restore();
    },
    [P, series, cap, rate, yMax],
    { aspect: 1.75, maxHeight: 380, minHeight: 290 },
  );

  return (
    <Figure
      no={3}
      title="토큰 양동이로 속도 제한하기"
      hint="양동이 크기와 채우는 속도를 바꿔 보세요"
      caption={
        <>
          한 IP 주소에서 오는 요청을 토큰 양동이로 거릅니다. 요청 하나가 토큰 하나를 쓰고, 토큰이 없으면 요청을 거절합니다(보통 HTTP 429). 토큰은 정해진 속도로 다시 차되 양동이 크기보다 많이 쌓이지는 않습니다. 이 IP의 사람은 몇 초마다 페이지를 열며 4~12개의 요청을 한꺼번에 보내고, {TB_ABUSE_FROM}초부터 {TB_ABUSE_TO}초까지는 같은 IP의 스크립트가 초당 {TB_ABUSE_RATE}개씩 요청을 보냅니다. 초록은 통과, 빨강은 거절입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`토큰 양동이: 크기 ${cap}, 초당 ${rate}개. 평소 거절 ${(sum.calmDropRate * 100).toFixed(1)}%, 몰아칠 때 거절 ${(sum.abDropRate * 100).toFixed(1)}%`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="tb-cap" label="양동이 크기 (몰아서 보낼 수 있는 양)" value={cap} min={1} max={50} step={1} onChange={setCap} format={(v) => `${v}개`} />
          <Slider id="tb-rate" label="채우는 속도 (오래 유지할 수 있는 양)" value={rate} min={1} max={50} step={1} onChange={setRate} format={(v) => `초당 ${v}개`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평소 요청 거절" value={`${(sum.calmDropRate * 100).toFixed(1)}%`} color={sum.calmDrop ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="몰아칠 때 거절" value={`${(sum.abDropRate * 100).toFixed(1)}%`} color="var(--bad)" />
            <Readout label="평소 통과 / 거절" value={`${sum.calmOk} / ${sum.calmDrop}`} />
            <Readout label="몰아칠 때 통과 / 거절" value={`${sum.abOk} / ${sum.abDrop}`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '통과', shape: 'sq' },
          { color: 'var(--bad)', label: '거절', shape: 'sq' },
          { color: 'var(--neg)', label: '남은 토큰', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Ddos() {
  return (
    <>
      <h2>가용성도 보안이다</h2>
      <p>
        보안이 지키려는 것은 흔히 세 가지로 나눕니다. 허락받지 않은 사람이 내용을 보지 못하게 하는 <T en="confidentiality">기밀성</T>, 내용이 몰래 바뀌지 않게 하는 <T en="integrity">무결성</T>, 그리고 필요할 때 쓸 수 있게 하는 <T en="availability">가용성</T>입니다. 앞 장들의 암호와 TLS는 주로 앞의 둘을 지킵니다. 이 장의 공격은 아무것도 훔치거나 바꾸지 않습니다. 서비스가 감당할 수 없을 만큼 일을 몰아줘서 진짜 사용자가 쓰지 못하게 만듭니다. 이를 <T en="denial of service">서비스 거부(DoS)</T> 공격이라 하고, 많은 컴퓨터에서 한꺼번에 보내면 <T en="distributed denial of service">분산 서비스 거부(DDoS)</T>라고 합니다.
      </p>
      <p>DDoS는 무엇을 바닥나게 하느냐에 따라 크게 셋으로 나눕니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>종류</th>
              <th>바닥내는 것</th>
              <th>예</th>
              <th>재는 단위</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>볼륨 공격</td>
              <td>회선의 대역폭</td>
              <td>UDP 플러드, 반사·증폭 공격</td>
              <td>초당 비트(bps)</td>
            </tr>
            <tr>
              <td>프로토콜 공격</td>
              <td>서버와 장비의 연결 상태 표</td>
              <td>SYN 플러드</td>
              <td>초당 패킷(pps)</td>
            </tr>
            <tr>
              <td>응용 계층 공격</td>
              <td>서버의 CPU, 메모리, 데이터베이스</td>
              <td>비싼 검색이나 로그인 요청을 쏟아붓기</td>
              <td>초당 요청(rps)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        공격에 쓰는 컴퓨터는 대개 공격자의 것이 아닙니다. 악성 코드에 감염되어 원격 명령을 기다리는 기기들의 무리를 <T en="botnet">봇넷</T>이라고 합니다. 2016년의 Mirai는 공장 출고 때의 기본 비밀번호를 그대로 쓰던 IP 카메라와 녹화기 같은 기기를 대량으로 감염시켰고, 그해 10월 DNS 업체 Dyn을 공격해 미국 일부 지역에서 여러 유명 사이트가 한동안 잘 열리지 않았습니다. 사이트 자체가 아니라 그 이름을 풀어 주는 <a href="#net-basics/dns">DNS</a>가 막히자 사이트도 함께 닿지 않게 된 것입니다.
      </p>

      <h2>상태를 바닥내기: SYN 플러드</h2>
      <p>
        <a href="#net-basics/tcp">TCP</a> 연결은 SYN, SYN-ACK, ACK의 3-way 핸드셰이크로 시작합니다. 서버는 SYN을 받으면 SYN-ACK를 보내고, 마지막 ACK가 올 때까지 이 <T en="half-open connection">반쯤 열린 연결</T>을 <T en="SYN backlog">백로그</T>라는 표에 적어 둡니다. 공격자는 출발지 주소를 아무렇게나 위조한 SYN을 계속 보냅니다. 서버의 SYN-ACK는 엉뚱한 주소로 가므로 ACK는 끝내 오지 않고, 서버는 SYN-ACK를 몇 번 더 보내 보며 기다립니다. 리눅스의 기본 설정이면 SYN-ACK를 다섯 번까지 다시 보내며 1분 가까이 기다립니다. 그동안 백로그의 칸은 공격자의 것입니다.
      </p>
      <SynFigure />
      <p>
        백로그 128칸에 반쯤 열린 연결을 30초씩 붙잡아 두면, 초당 4.3개(128 ÷ 30)의 위조 SYN만으로도 표가 가득 찹니다. 초당 100개를 보내면 공격 중 정상 연결의 4.2%만 성공하는데, 이때 공격에 드는 대역폭은 고작 48kbps입니다. 백로그를 4,096칸으로 늘리면 초당 100개는 버티지만 초당 1,000개에는 13.7%로 무너집니다. 표를 키우는 것만으로는 공격자와의 경쟁에서 이길 수 없습니다.
      </p>
      <p>
        <T en="SYN cookies">SYN 쿠키</T>는 1996년 대니얼 번스타인이 제안한 방법으로, 표를 키우는 대신 표를 쓰지 않습니다. 백로그가 가득 차면 서버는 연결 정보를 저장하지 않고, 그 정보(상대 주소와 포트, 시각, 협상한 MSS)를 비밀 키로 섞은 값을 SYN-ACK의 순서 번호에 담아 보냅니다. 진짜 클라이언트는 ACK에서 그 번호에 1을 더해 돌려주므로, 서버는 ACK를 받은 순간 쿠키를 검사해 연결을 다시 만들 수 있습니다. 위조한 SYN은 서버에 아무 상태도 남기지 못합니다. 그림에서 SYN 쿠키를 켜면 어떤 공격 속도에서도 정상 연결이 100% 성공합니다. 리눅스는 백로그가 넘칠 때만 SYN 쿠키를 쓰는 설정이 기본입니다. 옛 구현은 쿠키에 담을 자리가 좁아 일부 TCP 옵션을 잃었기 때문입니다.
      </p>
      <Callout kind="intuition">
        DoS 방어의 핵심 원칙은 <strong>상대가 진짜인지 확인하기 전에는 비싼 자원을 내주지 않는 것</strong>입니다. SYN 쿠키는 확인 전에는 메모리를 쓰지 않고, 로그인 페이지는 비밀번호 검사(일부러 느리게 만든 연산, 다음 장) 전에 속도 제한을 거칩니다. 공격자가 한 번 보내는 비용보다 서버가 한 번 받는 비용이 크면, 공격자는 적은 돈으로 큰 피해를 낼 수 있습니다.
      </Callout>

      <h2>남의 손을 빌리기: 반사와 증폭</h2>
      <p>
        볼륨 공격은 회선을 채우는 공격입니다. 피해자의 회선이 10Gbps라면 그보다 많이 보내면 됩니다. 하지만 공격자가 그만한 회선을 갖기는 어렵습니다. 그래서 <T en="reflection">반사</T>를 씁니다. UDP는 TCP와 달리 핸드셰이크가 없어서, 출발지 주소를 위조한 요청에도 서버가 바로 답합니다. 공격자가 출발지를 피해자의 주소로 적어 요청을 보내면, 응답은 피해자에게 갑니다. 여기에 요청보다 응답이 훨씬 큰 서비스를 고르면 <T en="amplification">증폭</T>까지 얻습니다.
      </p>
      <AmpFigure />
      <p>
        NTP 시간 서버의 옛 monlist 명령은 작은 요청 하나에 최근 접속한 주소 목록을 통째로 돌려줘서 556.9배로 증폭됩니다. 공격자가 100Mbps를 쓰면 이론상 약 56Gbps가 피해자의 10Gbps 회선에 쏟아집니다. 인터넷에 열려 있던 Memcached 캐시 서버는 보고된 증폭률이 최대 51,000배에 이릅니다. 2018년 2월 GitHub은 Memcached 반사를 이용한 약 1.35Tbps의 공격을 받았고, DDoS 방어 업체를 거쳐 몇 분 만에 서비스를 되찾았습니다. 이 일 뒤로 Memcached는 UDP를 기본으로 끄게 바뀌었습니다.
      </p>
      <p>
        반사 공격의 뿌리는 출발지 주소를 위조할 수 있다는 데 있습니다. 통신사가 고객 쪽에서 들어오는 패킷 중 그 고객에게 준 주소가 아닌 출발지를 가진 것을 버리면, 그 망 안에서는 위조가 불가능해집니다. 이를 <T en="ingress filtering">입구 필터링</T>이라 하고, 2000년의 권고 문서 BCP 38(RFC 2827)이 정리했습니다. 문제는 모든 망이 이를 지켜야 효과가 있다는 것이고, 지금도 지키지 않는 망이 남아 있습니다. 그래서 프로토콜 쪽에서도 막습니다. <a href="#net-basics/http">QUIC</a>은 상대의 주소를 확인하기 전에는 받은 바이트의 3배까지만 보내도록 규정해, 반사기로 쓰이지 않게 설계되었습니다. DNS 서버는 같은 주소로 가는 응답의 속도를 제한하고, 아무 질의에나 답하는 열린 리졸버를 닫습니다.
      </p>

      <h2>속도 제한: 토큰 양동이</h2>
      <p>
        응용 계층 공격은 가장 막기 어렵습니다. 요청 하나하나는 정상 사용자의 요청과 똑같이 생겼고, 핸드셰이크도 제대로 마친 진짜 연결이기 때문입니다. 비싼 검색 하나가 데이터베이스를 수백 밀리초 붙잡는다면, 초당 수천 개의 검색만으로 서비스가 멈춥니다. 기본 방어는 한 주체(IP 주소, 계정, API 키)가 보낼 수 있는 요청의 양을 제한하는 것입니다. 가장 널리 쓰이는 방법이 <T en="token bucket">토큰 양동이</T>입니다.
      </p>
      <MB note="b: 양동이 크기, r: 채우는 속도. 어떤 길이 t의 구간에서도 통과하는 요청은 이보다 많지 않습니다">{'\\text{통과하는 요청} \\le b + r\\,t'}</MB>
      <BucketFigure />
      <p>
        두 손잡이는 다른 일을 합니다. 양동이 크기는 <strong>몰아서 보낼 수 있는 양</strong>을, 채우는 속도는 <strong>오래 유지할 수 있는 양</strong>을 정합니다. 크기 10, 초당 5개면 사람이 페이지를 열 때의 몰림은 하나도 거절하지 않으면서, 초당 40개로 몰아치는 스크립트의 요청은 87.0% 거절합니다. 크기를 1로 줄이면 스크립트는 89.4% 막지만 사람의 요청도 78.2%가 거절되어 서비스가 쓸 수 없게 됩니다. 반대로 크기는 10에 두고 채우는 속도를 초당 40개로 올리면 스크립트의 요청이 96.7% 통과합니다. 몰림은 너그럽게, 오래 계속되는 양은 엄격하게 잡는 것이 요령입니다.
      </p>
      <Callout kind="warn">
        IP 주소별 제한에는 한계가 있습니다. 회사나 통신사의 NAT 뒤에서는 수많은 사람이 IP 하나를 함께 쓰므로 정상 사용자까지 막을 수 있고, 반대로 봇넷은 수만 개의 IP로 나눠 보내 IP마다의 양은 정상처럼 보이게 합니다. 그래서 실제 서비스는 IP, 계정, 기기, 요청 패턴을 함께 보고, 의심스러우면 자바스크립트 검사나 CAPTCHA 같은 확인을 한 번 거치게 합니다.
      </Callout>

      <h2>흩어서 받아 내기: 애니캐스트와 CDN</h2>
      <p>
        회선 자체를 넘치게 하는 볼륨 공격은 서버 안에서 할 수 있는 일이 없습니다. 패킷이 서버에 닿기도 전에 회선이 막히기 때문입니다. 답은 공격자보다 더 큰 회선을 더 많은 곳에 두는 것입니다. 대형 CDN과 DDoS 방어 업체는 같은 IP 주소를 전 세계 수백 곳의 거점에서 동시에 알립니다. 이를 <T en="anycast">애니캐스트</T>라고 하며, <a href="#net-basics/ip-routing">BGP</a>는 패킷을 가장 가까운 거점으로 보냅니다. 그러면 세계 곳곳의 봇이 보낸 공격도 출발지 근처의 거점들로 흩어집니다. 1Tbps의 공격이 거점 300곳에 고르게 나뉜다면 한 곳이 받는 양은 약 3.3Gbps입니다. 실제로는 봇이 몰린 지역의 거점이 더 많이 받지만, 한 곳의 회선으로 받는 것과는 비교할 수 없습니다.
      </p>
      <p>
        거점에서는 <T en="scrubbing">세척</T>을 합니다. 반사 공격에 흔히 쓰이는 출발지 포트(NTP의 123, Memcached의 11211 등)에서 온 UDP처럼 뻔한 공격 트래픽을 버리고, SYN 쿠키로 연결을 대신 받아 주고, 남은 정상 트래픽만 원래 서버로 보냅니다. 정적인 페이지는 거점의 캐시가 대신 답하므로 원래 서버까지 가지 않습니다. 결국 DDoS 방어는 비용의 싸움입니다. 공격자가 들이는 비용보다 방어자가 버티는 비용이 싸게 만드는 장치들, 즉 상태를 남기지 않는 응답, 증폭을 막는 프로토콜, 속도 제한, 흩어서 받는 망이 함께 쓰입니다.
      </p>

      <Callout kind="key">
        DDoS는 회선(볼륨), 연결 상태(프로토콜), 서버의 계산(응용 계층) 중 하나를 바닥내 가용성을 무너뜨립니다. SYN 플러드는 반쯤 열린 연결로 백로그를 채우며, 백로그 128칸은 초당 몇 개의 위조 SYN으로도 찹니다. SYN 쿠키는 확인 전에는 상태를 남기지 않아 이를 무력화합니다. 반사·증폭 공격은 출발지 위조와 응답이 큰 UDP 서비스를 엮어 공격량을 수십에서 수만 배로 키우며, 입구 필터링(BCP 38)과 열린 서비스 닫기, 증폭 제한이 뿌리를 막습니다. 응용 계층 공격은 토큰 양동이 같은 속도 제한(통과량 <M>{'\\le b + rt'}</M>)으로, 볼륨 공격은 애니캐스트와 CDN으로 흩어서 받아 냅니다.
      </Callout>
      <Quiz
        q="회사의 공개 DNS 서버가 아무 질의에나 답하도록 열려 있다. 어느 날 이 서버에서 나가는 트래픽이 평소의 수백 배로 늘었는데, 응답이 향하는 주소는 대부분 한 곳이고 그 주소에서 실제로 질의를 보낸 흔적은 없다. 무슨 일이며, 가장 근본적인 대책은?"
        options={[
          '이 서버가 DDoS 공격을 받고 있다. 서버의 백로그를 늘리고 SYN 쿠키를 켠다',
          '이 서버가 반사기로 쓰이고 있다. 누군가 출발지를 그 주소로 위조해 질의를 보내고 있으므로, 우리 고객이 아닌 곳의 재귀 질의는 받지 않게 닫고 같은 곳으로 가는 응답의 속도를 제한한다',
          '그 주소의 사용자가 우리 서버를 과도하게 쓰고 있다. 그 주소를 차단하면 해결된다',
          'DNS 캐시가 깨졌다. 캐시를 비우고 TTL을 줄이면 응답이 줄어든다',
        ]}
        answer={1}
        explain={
          <>
            응답이 한 곳으로 몰리는데 그곳이 질의를 보낸 적이 없다면, 누군가 출발지 주소를 그곳으로 위조한 것입니다. 이 서버는 공격의 피해자가 아니라 증폭기로 쓰이고 있습니다. UDP라서 SYN 쿠키는 상관이 없고, 그 주소를 막으면 진짜 피해자의 질의만 막힐 뿐 위조된 질의는 계속 들어옵니다. 열린 리졸버를 닫고 응답 속도를 제한하는 것이 맞는 대책이며, 더 근본적으로는 출발지 위조 자체를 막는 입구 필터링이 모든 망에 필요합니다.
          </>
        }
      />
    </>
  );
}

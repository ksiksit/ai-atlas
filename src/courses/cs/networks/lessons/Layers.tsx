import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, humanTime, useStepper } from '../../shared';
import { ETH_FCS, ETH_HEADER, IP_HEADER, MSS, PER_PACKET, TCP_HEADER, bdpBytes, bestPayload, ethPadding, overhead, pipeline, pipelineTotal, propagationDelay, segmentSizes, transmissionDelay } from './packets';
import '../../algorithms/lessons/algorithms.css';
import '../../systems/lessons/saving.css';
import './packets.css';

const n0 = (v: number) => Math.round(v).toLocaleString('ko-KR');

/** Decimal byte units, as network speeds use them (1 KB = 1,000 bytes). */
function bytesText(b: number): string {
  if (b < 1000) return `${n0(b)}B`;
  const u = b < 1e6 ? ['KB', 1e3] : b < 1e9 ? ['MB', 1e6] : ['GB', 1e9];
  const v = b / (u[1] as number);
  return `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v)}${u[0]}`;
}

/* ─────────────── Figure 1: encapsulation, down one stack and up the other ─────────────── */

type LayerId = 'app' | 'tcp' | 'ip' | 'eth';
const LAYERS: { id: LayerId; name: string; proto: string }[] = [
  { id: 'app', name: '응용', proto: 'HTTP, DNS …' },
  { id: 'tcp', name: '전송', proto: 'TCP, UDP' },
  { id: 'ip', name: '인터넷', proto: 'IP' },
  { id: 'eth', name: '링크', proto: '이더넷, Wi-Fi' },
];

const MESSAGES = [
  { value: 1, label: '키 입력 1B' },
  { value: 500, label: 'HTTP 요청 500B' },
  { value: 4000, label: '4KB' },
  { value: 1_000_000, label: '사진 1MB' },
];

// step → how many headers are on, and which layer of which side is working
const STEPS: { side: 'send' | 'wire' | 'recv'; layer: number; depth: number }[] = [
  { side: 'send', layer: 0, depth: 0 },
  { side: 'send', layer: 1, depth: 1 },
  { side: 'send', layer: 2, depth: 2 },
  { side: 'send', layer: 3, depth: 3 },
  { side: 'wire', layer: -1, depth: 3 },
  { side: 'recv', layer: 3, depth: 2 },
  { side: 'recv', layer: 2, depth: 1 },
  { side: 'recv', layer: 1, depth: 0 },
  { side: 'recv', layer: 0, depth: 0 },
];

function stepNote(i: number, bytes: number, segs: number): string {
  const many = segs > 1;
  switch (i) {
    case 0:
      return `보내는 쪽의 응용 프로그램이 ${n0(bytes)}바이트를 보내려 합니다. 응용은 이 데이터가 어떻게 전달될지 모릅니다. 운영체제에 "이 바이트들을 저 주소의 저 포트로 보내 달라"고 맡길 뿐입니다.`;
    case 1:
      return many
        ? `TCP가 데이터를 최대 ${n0(MSS)}바이트(MSS)씩 ${n0(segs)}조각으로 자르고, 조각마다 ${TCP_HEADER}바이트 헤더를 붙입니다. 헤더에는 포트 번호와, 이 조각이 전체에서 몇 번째 바이트부터인지 나타내는 순서 번호가 들어 있습니다.`
        : `TCP가 데이터 앞에 ${TCP_HEADER}바이트 헤더를 붙여 세그먼트를 만듭니다. 헤더에는 보내는 쪽과 받는 쪽의 포트 번호, 순서 번호가 들어 있습니다. 데이터가 ${n0(MSS)}바이트보다 작아 한 조각이면 됩니다.`;
    case 2:
      return `IP가 세그먼트마다 ${IP_HEADER}바이트 헤더를 붙여 패킷을 만듭니다. 출발지와 목적지 IP 주소, 몇 번 더 거쳐 갈 수 있는지(TTL), 안에 든 것이 TCP라는 표시가 들어 있습니다. 라우터는 이 헤더만 보고 패킷을 옮깁니다.`;
    case 3:
      return `이더넷이 앞에 ${ETH_HEADER}바이트 헤더(다음 장치의 MAC 주소 등)를, 뒤에 ${ETH_FCS}바이트 오류 검사 값(FCS)을 붙여 프레임을 만듭니다. MAC 주소는 같은 링크 안의 바로 다음 장치, 대개 공유기나 라우터를 가리킵니다.${bytes + TCP_HEADER + IP_HEADER < 46 ? ' 이더넷 프레임은 최소 64바이트여야 해서 빈 바이트(패딩)도 채워 넣습니다.' : ''}`;
    case 4:
      return `프레임이 전기, 빛, 전파 신호가 되어 링크를 건너갑니다. 중간의 라우터는 프레임을 받을 때마다 링크 계층 헤더를 벗기고 IP 헤더를 읽은 다음, 다음 링크에 맞는 새 링크 헤더를 씌워 내보냅니다.`;
    case 5:
      return `받는 쪽의 이더넷이 FCS로 프레임이 깨지지 않았는지 검사하고, 헤더와 꼬리를 벗겨 안의 IP 패킷을 위로 올립니다. 깨진 프레임은 조용히 버립니다.`;
    case 6:
      return `IP가 목적지 주소가 자기 것인지 확인하고, 헤더의 프로토콜 번호를 보고 TCP에 넘깁니다.`;
    case 7:
      return many
        ? `TCP가 포트 번호로 어느 프로그램의 것인지 찾고, 순서 번호대로 ${n0(segs)}조각을 이어 붙입니다. 빠진 조각이 있으면 다시 보내 달라고 하고(3장), 순서가 뒤바뀐 조각은 제자리에 끼웁니다.`
        : `TCP가 포트 번호를 보고 어느 프로그램의 데이터인지 찾아 헤더를 벗깁니다.`;
    default:
      return `받는 쪽 응용 프로그램은 보낸 그대로의 ${n0(bytes)}바이트를 받습니다. 중간에 무엇을 거쳤는지는 모릅니다.`;
  }
}

function Packet({ payload, depth }: { payload: number; depth: number }) {
  const pad = ethPadding(payload);
  return (
    <div className="encap-row">
      {depth >= 3 && (
        <span className="net-l-eth">
          <b>ETH</b>
          {ETH_HEADER}
        </span>
      )}
      {depth >= 2 && (
        <span className="net-l-ip">
          <b>IP</b>
          {IP_HEADER}
        </span>
      )}
      {depth >= 1 && (
        <span className="net-l-tcp">
          <b>TCP</b>
          {TCP_HEADER}
        </span>
      )}
      <span className="encap-data net-l-app">
        <b>데이터</b>
        {n0(payload)}
      </span>
      {depth >= 3 && pad > 0 && (
        <span className="encap-pad">
          <b>패딩</b>
          {pad}
        </span>
      )}
      {depth >= 3 && (
        <span className="net-l-eth">
          <b>FCS</b>
          {ETH_FCS}
        </span>
      )}
    </div>
  );
}

function Stack({ title, active }: { title: string; active: number }) {
  return (
    <div className="encap-stack">
      <span className="encap-head">{title}</span>
      {LAYERS.map((l, i) => (
        <div key={l.id} className={`encap-layer net-l-${l.id}`} data-on={i === active || undefined} aria-current={i === active ? 'step' : undefined}>
          {l.name}
          <small>{l.proto}</small>
        </div>
      ))}
    </div>
  );
}

function EncapFigure() {
  const [bytes, setBytes] = useState(500);
  const s = useStepper(STEPS.length, 1, bytes);
  const st = STEPS[s.i];
  const segs = segmentSizes(bytes);
  const ov = overhead(bytes);
  const whole = s.i === 0 || s.i === STEPS.length - 1;
  const shown = whole ? [] : segs.slice(0, 3);
  const first = segs[0];
  const wireText = useMemo(() => {
    // the first bytes of the first frame: destination MAC, source MAC, EtherType 0x0800 (IPv4),
    // then the IP header: version 4 + length 5 words, DSCP, total length, id, flags, TTL 64, protocol 6 (TCP)
    const total = first + IP_HEADER + TCP_HEADER;
    const hex2 = (v: number) => v.toString(16).padStart(2, '0');
    return `a4 91 b1 2c 5e 03 3c 22 fb 1a 07 9e 08 00 45 00 ${hex2(total >> 8)} ${hex2(total & 255)} 1c 46 40 00 40 06 …`;
  }, [first]);

  return (
    <Figure
      no={1}
      title="계층마다 헤더를 하나씩"
      hint="재생하거나 보낼 데이터 크기를 바꿔 보세요"
      caption={
        <>
          왼쪽은 보내는 컴퓨터, 오른쪽은 받는 컴퓨터의 계층입니다. 보낼 때는 위에서 아래로 내려가며 헤더를 하나씩 붙이고, 받을 때는 아래에서 위로 올라가며 하나씩 벗깁니다. 숫자는 바이트 수이고, TCP와 IP 헤더는 옵션이 없을 때의 최소 크기입니다. 조각이 많으면 처음 세 개만 그렸습니다. 실제로 전선에는 프레임마다 동기 신호(프리앰블) 8바이트와 프레임 사이 간격 12바이트만큼의 시간이 더 들지만, 오버헤드 계산에는 넣지 않았습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="보낼 데이터" value={bytes} onChange={setBytes} options={MESSAGES} />
      </div>
      <div className="encap" role="img" aria-label={`캡슐화 ${s.i + 1}단계: ${stepNote(s.i, bytes, segs.length)}`}>
        <Stack title="보내는 쪽" active={st.side === 'send' ? st.layer : -1} />
        <div className="encap-mid">
          <span className="encap-head">{st.side === 'wire' ? '링크 위' : st.side === 'send' ? (s.i === 0 ? '응용의 데이터' : '아래 계층으로 내려가는 중') : s.i === STEPS.length - 1 ? '응용이 받은 데이터' : '위 계층으로 올라가는 중'}</span>
          {whole ? (
            <div className="encap-row">
              <span className="encap-data net-l-app">
                <b>데이터</b>
                {n0(bytes)}바이트
              </span>
            </div>
          ) : (
            shown.map((p, i) => <Packet key={i} payload={p} depth={st.depth} />)
          )}
          {!whole && segs.length > 3 && (
            <span className="encap-more">
              … 같은 모양의 조각 {n0(segs.length - 3)}개 더 (마지막 조각은 {n0(segs[segs.length - 1])}바이트)
            </span>
          )}
          {st.side === 'wire' && (
            <span className="encap-wire" aria-hidden="true">
              첫 프레임의 앞부분(16진수): {wireText}
            </span>
          )}
        </div>
        <Stack title="받는 쪽" active={st.side === 'recv' ? st.layer : -1} />
      </div>
      <div className="step-note" aria-live="polite">
        {stepNote(s.i, bytes, segs.length)}
      </div>
      <div className="fig-cols">
        <div className="controls">
          <StepControls s={s} id="encap-speed" maxSpeed={4} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="패킷 수" value={`${n0(ov.packets)}개`} />
          <Readout label="헤더·꼬리·패딩" value={`${n0(ov.header)}B`} />
          <Readout label="링크로 나가는 바이트" value={`${n0(ov.wire)}B`} />
          <Readout label="그중 데이터가 아닌 몫" value={`${(ov.ratio * 100).toFixed(1)}%`} color="var(--bad)" />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--c-cs-3)', label: '응용 데이터', shape: 'sq' },
          { color: 'var(--c-cs-2)', label: 'TCP 헤더', shape: 'sq' },
          { color: 'var(--c-cs-1)', label: 'IP 헤더', shape: 'sq' },
          { color: 'var(--c-cs-4)', label: '이더넷 헤더·FCS', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: store-and-forward, whole message vs packets ─────────────── */

const PIPE_BYTES = 30_000;
const PIPE_RATE = 10e6; // 10 Mbps on every link
const LOG_MIN = Math.log10(20);
const LOG_MAX = Math.log10(PIPE_BYTES);

function PipelineFigure() {
  const P = usePalette();
  const [hops, setHops] = useState(4);
  const [lp, setLp] = useState(Math.log10(MSS));
  const payload = Math.round(10 ** lp);
  const cut = useMemo(() => pipeline(PIPE_BYTES, payload, hops, PER_PACKET, PIPE_RATE), [payload, hops]);
  const whole = useMemo(() => pipeline(PIPE_BYTES, PIPE_BYTES, hops, PER_PACKET, PIPE_RATE), [hops]);
  const best = useMemo(() => bestPayload(PIPE_BYTES, hops, PER_PACKET, PIPE_RATE, 20, PIPE_BYTES, 1), [hops]);
  const curve = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 160; i++) {
      const l = LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / 160;
      pts.push([l, pipelineTotal(PIPE_BYTES, Math.round(10 ** l), hops, PER_PACKET, PIPE_RATE) * 1e3]);
    }
    return pts;
  }, [hops]);
  const hdr = (cut.packets * PER_PACKET) / (PIPE_BYTES + cut.packets * PER_PACKET);

  const tMax = Math.max(whole.total, cut.total) * 1e3;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const padL = 58;
      const padR = 12;
      const rowH = 16;
      const gapRow = 4;
      const X = (ms: number) => padL + (ms / tMax) * (w - padL - padR);
      const block = (y0: number, title: string, pl: ReturnType<typeof pipeline>, color: string) => {
        ctx.fillStyle = P.ink2;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, padL, y0 + 8);
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${(pl.total * 1e3).toFixed(1)}ms`, w - padR, y0 + 8);
        for (let l = 0; l < hops; l++) {
          const y = y0 + 20 + l * (rowH + gapRow);
          ctx.fillStyle = P.surface2;
          ctx.fillRect(padL, y, w - padL - padR, rowH);
          ctx.fillStyle = P.ink3;
          ctx.font = `11px ${P.fontBody}`;
          ctx.textAlign = 'right';
          ctx.fillText(`링크 ${l + 1}`, padL - 6, y + rowH / 2 + 0.5);
          for (let j = 0; j < pl.packets; j++) {
            const x0 = X(pl.start[l][j] * 1e3);
            const x1 = X(pl.finish[l][j] * 1e3);
            ctx.fillStyle = j % 2 ? alpha(color, 0.55) : color;
            ctx.fillRect(x0, y, Math.max(0.6, x1 - x0 - (pl.packets > 1 && x1 - x0 > 3 ? 0.8 : 0)), rowH);
          }
        }
        return y0 + 20 + hops * (rowH + gapRow);
      };
      const y1 = block(4, '통째로 보낼 때', whole, P.neg);
      const y2 = block(y1 + 10, `${n0(payload)}바이트씩 ${n0(cut.packets)}개로 나눌 때`, cut, P.pos);
      // time axis
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y2 + 2);
      ctx.lineTo(w - padR, y2 + 2);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'top';
      const step = tMax > 100 ? 25 : tMax > 40 ? 10 : 5;
      for (let t = 0; t <= tMax + 1e-9; t += step) {
        ctx.textAlign = t === 0 ? 'left' : 'center';
        ctx.fillText(`${t}`, X(t), y2 + 6);
      }
      ctx.textAlign = 'left';
      ctx.fillText('ms', w - padR - 16, y2 + 6);
    },
    [P, whole, cut, hops, tMax, payload],
    { height: 2 * (20 + hops * 20) + 44, minHeight: 120, maxHeight: 400 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(...curve.map((p) => p[1])) * 1.05;
      const pl = new Plot(ctx, w, h, P, { xMin: LOG_MIN, xMax: LOG_MAX, yMin: 0, yMax, pad: { l: 44, r: 12, t: 18, b: 22 } });
      pl.grid({ xStep: 1, yStep: yMax > 100 ? 50 : 20, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of [20, 100, 1000, 10000, 30000]) ctx.fillText(v >= 1000 ? `${v / 1000}K` : String(v), pl.X(Math.log10(v)), pl.Y(0) + 5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += yMax > 100 ? 50 : 20) ctx.fillText(String(y), pl.X(LOG_MIN) - 5, pl.Y(y));
      ctx.textAlign = 'left';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.fillText('걸리는 시간 (ms), 가로: 패킷 하나의 데이터 크기 (바이트, 로그 눈금)', pl.X(LOG_MIN), 8);
      ctx.beginPath();
      curve.forEach(([x, y], i) => (i ? ctx.lineTo(pl.X(x), pl.Y(y)) : ctx.moveTo(pl.X(x), pl.Y(y))));
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      pl.line(Math.log10(MSS), 0, Math.log10(MSS), yMax, alpha(P.ink, 0.3), 1, [3, 4]);
      pl.dot(Math.log10(best.payload), best.total * 1e3, 4, P.surface, P.good, 2);
      pl.dot(lp, cut.total * 1e3, 5, P.pos, P.surface, 2);
    },
    [P, curve, lp, cut, best],
    { aspect: 3.2, maxHeight: 190, minHeight: 140 },
  );

  return (
    <Figure
      no={2}
      title="나눠 보내면 왜 빨라질까"
      hint="패킷 크기와 거쳐 가는 링크 수를 바꿔 보세요"
      caption={
        <>
          {n0(PIPE_BYTES)}바이트를 속도가 모두 10Mbps인 링크 {hops}개를 거쳐 보냅니다. 막대는 각 링크가 패킷을 전송하는 시간입니다. 라우터는 패킷을 끝까지 다 받아야 다음 링크로 내보내므로(저장 후 전달), 통째로 보내면 링크마다 전체를 기다립니다. 패킷마다 헤더 {PER_PACKET}바이트(TCP, IP, 이더넷)가 붙고, 전파 지연과 처리 시간은 빼고 계산했습니다. 실제 이더넷에서는 데이터가 {n0(MSS)}바이트보다 큰 패킷을 보낼 수 없지만, 실험을 위해 허용했습니다. 아래 곡선의 초록 점이 가장 빠른 크기, 점선이 {n0(MSS)}바이트입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="pipe-size" label="패킷 하나의 데이터 크기" value={lp} min={LOG_MIN} max={LOG_MAX} step={0.005} onChange={setLp} format={() => `${n0(payload)}B`} />
        <Seg label="링크 수" value={hops} onChange={setHops} options={[1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) }))} />
        <div className="btn-row">
          <Button small onClick={() => setLp(Math.log10(MSS))}>
            {n0(MSS)}B로
          </Button>
          <Button small onClick={() => setLp(Math.log10(best.payload))}>
            가장 빠른 크기로
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`링크 ${hops}개: 통째로 보내면 ${(whole.total * 1e3).toFixed(1)}ms, ${payload}바이트 패킷 ${cut.packets}개로 나누면 ${(cut.total * 1e3).toFixed(1)}ms`}>
        <canvas ref={canvasRef} />
      </div>
      <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`패킷 크기에 따른 전체 시간 곡선. 가장 빠른 크기는 ${best.payload}바이트, ${(best.total * 1e3).toFixed(1)}ms`}>
        <canvas ref={plot.canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="통째로" value={`${(whole.total * 1e3).toFixed(1)}ms`} color="var(--neg)" />
        <Readout label="나눠서" value={`${(cut.total * 1e3).toFixed(1)}ms`} color="var(--pos)" />
        <Readout label="패킷 수" value={`${n0(cut.packets)}개`} />
        <Readout label="헤더가 차지하는 몫" value={`${(hdr * 100).toFixed(1)}%`} />
        <Readout label="가장 빠른 크기" value={`${n0(best.payload)}B · ${(best.total * 1e3).toFixed(1)}ms`} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: transmission vs propagation delay ─────────────── */

const DISTANCES = [
  { value: 100, label: '같은 건물', note: '약 100m' },
  { value: 330e3, label: '서울–부산', note: '약 330km' },
  { value: 1_200e3, label: '서울–도쿄', note: '약 1,200km' },
  { value: 9_600e3, label: '서울–미국 서부', note: '약 9,600km' },
];
const SIZES = [
  { value: 1_000, label: '1KB' },
  { value: 100_000, label: '100KB' },
  { value: 10_000_000, label: '10MB' },
  { value: 1_000_000_000, label: '1GB' },
];
const RATES = [
  { value: 10e6, label: '10Mbps' },
  { value: 100e6, label: '100Mbps' },
  { value: 1e9, label: '1Gbps' },
  { value: 10e9, label: '10Gbps' },
];
const rateText = (r: number) => (r >= 1e9 ? `${r / 1e9}Gbps` : `${r / 1e6}Mbps`);

function DelayFigure() {
  const P = usePalette();
  const [dist, setDist] = useState(9_600e3);
  const [size, setSize] = useState(100_000);
  const [rate, setRate] = useState(100e6);
  const tx = transmissionDelay(size, rate);
  const prop = propagationDelay(dist);
  const total = tx + prop;
  const rtt = 2 * prop;
  const fast = transmissionDelay(size, rate * 10) + prop;
  const bdp = bdpBytes(rate, rtt);
  const near = DISTANCES.find((d) => d.value === dist)!;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 74;
      const padR = 16;
      const top = 30;
      const bot = h - 48;
      const X = (t: number) => padL + (t / total) * (w - padL - padR);
      // sender and receiver lines
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      for (const y of [top, bot]) {
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('보내는 쪽', padL - 8, top);
      ctx.fillText('받는 쪽', padL - 8, bot);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText(near.note, padL - 8, (top + bot) / 2);

      // the bits in flight: first bit leaves at 0 and lands at prop; last leaves at tx and lands at total
      ctx.fillStyle = alpha(P.pos, 0.28);
      ctx.beginPath();
      ctx.moveTo(X(0), top);
      ctx.lineTo(X(tx), top);
      ctx.lineTo(X(total), bot);
      ctx.lineTo(X(prop), bot);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(X(0), top);
      ctx.lineTo(X(prop), bot);
      ctx.moveTo(X(tx), top);
      ctx.lineTo(X(total), bot);
      ctx.stroke();
      // the time spent pushing bits out: thick on the sender line
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(X(0), top);
      ctx.lineTo(Math.max(X(tx), X(0) + 2), top);
      ctx.stroke();

      const label = (s: string, x: number, y: number, color: string, align: CanvasTextAlign) => {
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textAlign = align;
        ctx.fillStyle = color;
        ctx.fillText(s, x, y);
      };
      ctx.textBaseline = 'bottom';
      label(`전송 ${humanTime(tx)}`, Math.min(X(tx), w - padR - 100) > X(0) + 110 ? X(tx) : X(0), top - 6, P.neg, Math.min(X(tx), w - padR - 100) > X(0) + 110 ? 'right' : 'left');
      ctx.textBaseline = 'top';
      label(`첫 비트 도착 ${humanTime(prop)}`, X(prop), bot + 6, P.ink2, X(prop) < padL + 70 ? 'left' : X(prop) > w - padR - 70 ? 'right' : 'center');
      label(`마지막 비트 도착 ${humanTime(total)}`, w - padR, bot + 24, P.ink, 'right');
    },
    [P, tx, prop, total, near],
    { aspect: 3, maxHeight: 230, minHeight: 180 },
  );

  return (
    <Figure
      no={3}
      title="대역폭과 거리, 어느 쪽이 시간을 정할까"
      hint="거리, 데이터 크기, 대역폭을 바꿔 보세요"
      caption={
        <>
          가로는 시간, 세로는 거리입니다. 보내는 쪽이 비트를 링크에 밀어 넣는 데 걸리는 시간이 <strong>전송 지연</strong>(파란 굵은 선), 한 비트가 빛의 속도로 건너가는 데 걸리는 시간이 <strong>전파 지연</strong>(비스듬한 선의 기울기)입니다. 주황색 띠는 링크 위를 날아가는 중인 비트들입니다. 거리는 직선거리를 둥글게 어림한 값이고, 광섬유 안의 빛은 초속 약 20만 km로 계산했습니다. 실제 케이블은 돌아가고 라우터의 처리와 대기 시간도 더해지므로 실제 시간은 이보다 깁니다.
        </>
      }
    >
      <div className="controls">
        <Seg label="거리" value={dist} onChange={setDist} options={DISTANCES} />
        <Seg label="데이터 크기" value={size} onChange={setSize} options={SIZES} />
        <Seg label="대역폭" value={rate} onChange={setRate} options={RATES} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${near.label}로 ${bytesText(size)}를 ${rateText(rate)}로 보내기: 전송 지연 ${humanTime(tx)}, 전파 지연 ${humanTime(prop)}, 합계 ${humanTime(total)}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="전송 지연" value={humanTime(tx)} color="var(--neg)" />
        <Readout label="전파 지연" value={humanTime(prop)} color="var(--pos)" />
        <Readout label="한 방향 합계" value={humanTime(total)} />
        <Readout label="왕복 최소 (RTT)" value={humanTime(rtt)} />
        <Readout label="대역폭을 10배로 하면" value={`${humanTime(fast)} (${(total / fast).toFixed(1)}배 빠름)`} />
        <Readout label="대역폭 × RTT" value={bytesText(bdp)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Layers() {
  return (
    <>
      <h2>전화망과 인터넷의 차이</h2>
      <p>
        옛 전화망은 통화를 시작할 때 두 전화기 사이에 회선을 하나 잡아 두고, 통화가 끝날 때까지 그 회선을 다른 사람이 쓰지 못하게 했습니다. 이런 방식을 <T en="circuit switching">회선 교환</T>이라고 합니다. 대역폭이 미리 예약되어 있으니 한번 연결되면 품질이 일정하지만, 말을 멈추고 있는 동안에도 회선은 놀고 있습니다.
      </p>
      <p>
        컴퓨터의 통신은 대개 몰려서 일어납니다. 웹 페이지를 열 때 잠깐 많은 데이터가 오가고, 페이지를 읽는 동안에는 거의 아무것도 오가지 않습니다. 그래서 1960년대에 폴 배런과 도널드 데이비스는 각자 다른 방식을 제안했습니다. 데이터를 작은 덩어리로 잘라 덩어리마다 목적지를 적고, 예약 없이 링크를 함께 쓰는 것입니다. 이 덩어리가 <T en="packet">패킷</T>이고, 이 방식이 <T en="packet switching">패킷 교환</T>입니다. 1969년 ARPANET이 이 방식으로 처음 연결되었고, 오늘날의 인터넷은 그 후손입니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>회선 교환 (전화망)</th>
              <th>패킷 교환 (인터넷)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>자원</td>
              <td>통화마다 대역폭을 예약</td>
              <td>예약 없이 모두가 나눠 씀</td>
            </tr>
            <tr>
              <td>쉬는 동안</td>
              <td>예약한 회선이 놀고 있음</td>
              <td>다른 사람의 패킷이 그 링크를 씀</td>
            </tr>
            <tr>
              <td>몰릴 때</td>
              <td>새 통화를 받지 않음 (통화 중)</td>
              <td>패킷이 라우터의 줄(큐)에서 기다리고, 줄이 넘치면 버려짐</td>
            </tr>
            <tr>
              <td>품질</td>
              <td>연결되면 일정함</td>
              <td>지연과 손실이 그때그때 달라짐</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        패킷 교환은 링크를 훨씬 알뜰하게 쓰는 대신 아무것도 보장하지 않습니다. 패킷은 늦게 오거나, 순서가 뒤바뀌거나, 아예 사라질 수 있습니다. 인터넷의 IP는 패킷을 목적지 쪽으로 최선을 다해 옮길 뿐 도착을 약속하지 않는데, 이를 <T en="best effort">최선형 전달</T>이라고 합니다. 빠짐없이 순서대로 받아야 하는 프로그램은 양 끝의 컴퓨터가 스스로 확인하고 다시 보내야 합니다. 그 일을 하는 것이 3장의 TCP입니다.
      </p>
      <Callout kind="intuition">
        네트워크 한가운데는 단순하게 두고, 복잡한 일은 양 끝의 컴퓨터가 맡게 하자는 생각을 <T en="end-to-end principle">종단 간 원칙</T>이라고 부릅니다. 라우터는 패킷을 빨리 옮기는 일만 하므로 단순하고 빠르게 만들 수 있고, 새로운 응용은 네트워크를 바꾸지 않고도 양 끝의 프로그램만 고쳐서 만들 수 있습니다.
      </Callout>

      <h2>한 층이 한 가지 일만</h2>
      <p>
        패킷 하나를 전달하려면 많은 일을 해야 합니다. 바로 옆 장치까지 신호를 보내야 하고, 여러 링크를 거쳐 목적지 컴퓨터를 찾아가야 하고, 그 컴퓨터 안에서 어느 프로그램의 데이터인지 가려야 하고, 빠진 것을 다시 보내야 합니다. 이 일들을 <T en="layer">계층</T>으로 나누어, 각 계층은 바로 아래 계층의 서비스만 믿고 자기 일만 합니다. 인터넷에서 쓰는 TCP/IP 모델은 네 계층으로 나눕니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>계층</th>
              <th>하는 일</th>
              <th>예</th>
              <th>데이터 단위</th>
              <th>주소</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>응용</td>
              <td>프로그램끼리 주고받을 내용과 형식</td>
              <td>HTTP, DNS, SMTP</td>
              <td>메시지</td>
              <td>URL, 도메인 이름</td>
            </tr>
            <tr>
              <td>전송</td>
              <td>컴퓨터 안의 어느 프로그램인지 구분, 필요하면 신뢰성</td>
              <td>TCP, UDP</td>
              <td>세그먼트</td>
              <td>포트 번호</td>
            </tr>
            <tr>
              <td>인터넷</td>
              <td>여러 링크를 거쳐 목적지 컴퓨터까지</td>
              <td>IP (IPv4, IPv6)</td>
              <td>패킷</td>
              <td>IP 주소</td>
            </tr>
            <tr>
              <td>링크</td>
              <td>같은 링크 안에서 바로 다음 장치까지</td>
              <td>이더넷, Wi-Fi</td>
              <td>프레임</td>
              <td>MAC 주소</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        교과서에서 자주 보는 <T en="OSI model">OSI 7계층</T>은 같은 일을 물리, 데이터 링크, 네트워크, 전송, 세션, 표현, 응용의 일곱 층으로 더 잘게 나눈 참조 모델입니다. 실제 인터넷의 프로토콜은 TCP/IP 모델에 맞춰 만들어졌지만, 층의 번호는 OSI 쪽이 널리 쓰여서 "L2 스위치"(링크 계층), "L3 라우팅"(IP), "L4 로드 밸런서"(TCP·UDP 포트를 보고 나눔), "L7 로드 밸런서"(HTTP 내용을 보고 나눔)처럼 부릅니다.
      </p>

      <h2>캡슐화: 봉투 안에 봉투</h2>
      <p>
        보내는 쪽에서 데이터가 한 층 내려갈 때마다, 그 층은 자기 일에 필요한 정보를 <T en="header">헤더</T>에 적어 앞에 붙입니다. 아래 층은 위 층이 준 것 전체를 내용물로 보고 그 안을 들여다보지 않습니다. 편지를 봉투에 넣고, 그 봉투를 다시 택배 상자에 넣는 것과 같아서 이를 <T en="encapsulation">캡슐화</T>라고 합니다. 받는 쪽은 반대로 아래에서부터 한 겹씩 벗깁니다.
      </p>
      <EncapFigure />
      <p>
        이더넷 프레임이 실어 나를 수 있는 IP 패킷의 최대 크기를 <T en="maximum transmission unit">MTU</T>라고 하고, 이더넷에서는 1,500바이트입니다. 여기서 IP 헤더 20바이트와 TCP 헤더 20바이트를 빼면 TCP 세그먼트 하나에 담을 수 있는 데이터는 최대 1,460바이트이고, 이 값을 <T en="maximum segment size">MSS</T>라고 합니다. 실제 연결에서는 TCP 헤더에 타임스탬프 같은 옵션이 붙는 경우가 많아 조금 더 작아지기도 합니다.
      </p>
      <p>
        보낼 데이터 크기를 바꿔 보세요. 1MB짜리 사진은 패킷 685개가 되고, 헤더는 전체의 3.8%입니다. 반면 키 하나를 누를 때마다 1바이트씩 보내면(원격 터미널이 그렇습니다) 64바이트짜리 프레임에 데이터는 1바이트뿐이어서, 나가는 바이트의 98.4%가 헤더와 패딩입니다. 그래서 TCP는 작은 쓰기를 잠깐 모아 한꺼번에 보내는 방법(네이글 알고리즘)을 기본으로 쓰고, 지연이 중요한 프로그램은 이 기능을 끕니다.
      </p>
      <Callout kind="note">
        라우터는 IP 계층까지만 봅니다. 프레임을 받으면 링크 헤더를 벗기고, IP 헤더의 목적지 주소를 보고 내보낼 링크를 고른 뒤, 그 링크에 맞는 새 링크 헤더를 씌워 내보냅니다. 그래서 MAC 주소는 링크를 하나 건널 때마다 바뀌지만, 출발지와 목적지 IP 주소는 처음부터 끝까지 그대로입니다. (집의 공유기처럼 주소를 바꿔 쓰는 NAT 장비는 예외로, 2장에서 봅니다.)
      </Callout>

      <h2>저장 후 전달과 파이프라이닝</h2>
      <p>
        데이터를 왜 굳이 작게 나눌까요? 링크를 여럿이 나눠 쓰기 위해서이기도 하지만, 보내는 사람 혼자 링크를 다 쓸 때도 나누는 편이 빠릅니다. 라우터는 패킷 하나를 끝까지 다 받아 오류가 없는지 확인한 다음에야 다음 링크로 내보냅니다. 이를 <T en="store and forward">저장 후 전달</T>이라고 합니다. 큰 데이터를 통째로 보내면 첫 라우터가 전부 받을 때까지 둘째 링크는 놀고 있습니다. 잘게 나누면 첫 패킷이 둘째 링크를 건너는 동안 둘째 패킷이 첫 링크를 건너, 여러 링크가 동시에 일합니다.
      </p>
      <PipelineFigure />
      <p>
        링크 4개를 거쳐 30,000바이트를 보내면, 통째로는 96.2ms가 걸리지만 1,460바이트씩 나누면 28.6ms로 3배 넘게 빨라집니다. 통째로 보내면 링크 수만큼 전체 전송 시간을 되풀이하지만, 나누면 대략 "전체를 한 번 보내는 시간 + 패킷 하나가 남은 링크를 건너는 시간"이 되기 때문입니다. 그렇다고 한없이 작게 나누면 안 됩니다. 패킷마다 붙는 58바이트 헤더가 늘어나, 100바이트씩 나누면 38.3ms, 20바이트씩 나누면 93.8ms로 다시 느려집니다. 이 조건에서 가장 빠른 크기는 약 750바이트입니다. 링크 수를 바꿔 보면 링크가 많을수록 더 작게 나누는 편이 유리해지는 것도 볼 수 있습니다.
      </p>

      <h2>대역폭과 지연은 다르다</h2>
      <p>
        "인터넷이 빠르다"는 말에는 두 가지 뜻이 섞여 있습니다. 1초에 비트를 얼마나 많이 밀어 넣을 수 있는가(<T en="bandwidth">대역폭</T>)와, 한 비트가 반대편에 닿기까지 얼마나 걸리는가(<T en="latency">지연 시간</T>)입니다. 수도관에 빗대면 대역폭은 관의 굵기이고, 전파 지연은 관의 길이입니다. 패킷 하나가 겪는 지연은 보통 네 가지로 나눕니다.
      </p>
      <ul>
        <li>
          <T en="transmission delay">전송 지연</T>: 패킷의 비트를 링크에 다 밀어 넣는 시간. 크기 ÷ 대역폭입니다.
        </li>
        <li>
          <T en="propagation delay">전파 지연</T>: 신호가 링크의 한쪽 끝에서 다른 쪽 끝까지 가는 시간. 거리 ÷ 신호 속도이고, 광섬유에서는 빛의 속도의 약 3분의 2인 초속 약 20만 km입니다.
        </li>
        <li>
          <T en="queuing delay">큐잉 지연</T>: 라우터에서 먼저 온 패킷들이 나갈 때까지 줄 서서 기다리는 시간. 붐빌수록 길어지며, 4장에서 다시 봅니다.
        </li>
        <li>
          <T en="processing delay">처리 지연</T>: 라우터가 헤더를 읽고 내보낼 곳을 고르는 시간. 보통 마이크로초 단위로 작습니다.
        </li>
      </ul>
      <MB note="전파 지연은 대역폭을 늘려도 줄지 않습니다">{'t_{\\text{한 방향}} \\approx \\underbrace{\\frac{\\text{크기}}{\\text{대역폭}}}_{\\text{전송}} + \\underbrace{\\frac{\\text{거리}}{2\\times 10^8\\,\\text{m/s}}}_{\\text{전파}} + \\text{큐잉} + \\text{처리}'}</MB>
      <DelayFigure />
      <p>
        서울에서 미국 서부로 100KB짜리 웹 페이지를 100Mbps로 보내면 전송 지연은 8ms, 전파 지연은 48ms입니다. 대역폭을 10배인 1Gbps로 올려도 전송 지연만 0.8ms로 줄어, 합계는 56ms에서 48.8ms가 될 뿐입니다. 빛보다 빨리 갈 수는 없으므로, 먼 곳과 주고받는 작은 요청은 대역폭이 아니라 거리가 속도를 정합니다. 반대로 1GB 동영상을 같은 건물 안에서 옮길 때는 전파 지연이 0.5µs에 불과해 대역폭이 전부입니다. 웹 페이지 하나에도 여러 번의 왕복이 필요하므로(6장), 서비스를 사용자 가까이에 두는 CDN이 대역폭을 늘리는 것보다 효과가 큰 경우가 많습니다.
      </p>
      <p>
        마지막 수치 <T en="bandwidth-delay product">대역폭–지연 곱</T>은 왕복 시간 동안 링크 위에 떠 있을 수 있는 데이터의 양입니다. 1Gbps로 서울과 미국 서부를 잇는 링크라면 왕복 96ms 동안 12MB가 날아가는 중일 수 있습니다. 보내는 쪽이 "받았다"는 답을 기다리느라 이만큼을 채우지 못하면 굵은 관을 사 놓고도 일부만 쓰게 됩니다. TCP가 답을 기다리지 않고 여러 패킷을 한꺼번에 보내는 슬라이딩 윈도를 쓰는 이유이고, 3장의 주제입니다.
      </p>

      <Callout kind="key">
        인터넷은 데이터를 패킷으로 잘라 예약 없이 링크를 나눠 쓰는 패킷 교환망이고, IP는 도착을 보장하지 않는 최선형 전달만 합니다. 기능은 응용, 전송, 인터넷, 링크의 네 계층으로 나뉘고, 보낼 때는 계층마다 헤더를 붙이고(캡슐화) 받을 때 하나씩 벗깁니다. 이더넷의 MTU는 1,500바이트, TCP 세그먼트의 데이터는 최대 1,460바이트입니다. 패킷으로 나누면 여러 링크가 동시에 일해 빨라지지만, 너무 작으면 헤더가 발목을 잡습니다. 지연은 크기 ÷ 대역폭인 전송 지연과 거리 ÷ 빛의 속도인 전파 지연으로 나뉘고, 대역폭을 늘려도 전파 지연은 줄지 않습니다.
      </Callout>
      <Quiz
        q="서울의 사용자가 미국 서부 서버의 API를 호출하면 응답이 오는 데 약 150ms가 걸린다. 요청과 응답은 각각 2KB 정도다. 회사가 사용자 쪽 회선을 100Mbps에서 1Gbps로 바꾸면 응답 시간은 어떻게 될까?"
        options={[
          '대역폭이 10배가 되므로 약 15ms로 줄어든다',
          '거의 그대로다. 2KB의 전송 지연은 100Mbps에서도 0.2ms 이하이고, 대부분은 태평양을 건너는 전파 지연과 경로 위의 지연이다',
          '절반쯤인 약 75ms로 줄어든다. 요청과 응답 중 한쪽만 빨라지기 때문이다',
          '오히려 느려진다. 대역폭이 커지면 패킷이 더 작게 나뉘어 헤더가 늘어나기 때문이다',
        ]}
        answer={1}
        explain={
          <>
            2KB를 100Mbps로 보내는 전송 지연은 <M>{'2000 \\times 8 / 10^8 = 0.16'}</M>ms이고, 1Gbps면 0.016ms입니다. 반면 서울–미국 서부의 전파 지연은 왕복으로만 약 100ms입니다. 150ms의 대부분은 거리와 경로 위의 대기에서 오므로, 대역폭을 올려도 0.1ms 남짓밖에 줄지 않습니다. 이 응답을 빠르게 하려면 서버를 사용자 가까이 두거나 왕복 횟수를 줄여야 합니다. 패킷 크기는 MTU가 정하며 대역폭과 상관없습니다.
          </>
        }
      />
    </>
  );
}

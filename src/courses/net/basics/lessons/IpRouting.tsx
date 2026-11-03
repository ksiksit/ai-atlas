import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { addressKind, bitsOf, broadcastOf, commonBits, formatIPv4, longestMatch, maskOf, matches, networkOf, parseIPv4, parsePrefix, pathTo, spf, usableHosts, type Link, type Route } from './packets';
import '../../../cs/algorithms/lessons/algorithms.css';
import '../../../cs/systems/lessons/saving.css';
import './packets.css';

const n0 = (v: number) => Math.round(v).toLocaleString('ko-KR');

/* ─────────────── Figure 1: a CIDR calculator ─────────────── */

const CIDR_PRESETS = ['192.168.0.37/24', '10.20.30.200/25', '172.20.5.9/12', '8.8.8.8/24', '203.0.113.77/30'];

function CidrFigure() {
  const [text, setText] = useState('192.168.0.37');
  const [len, setLen] = useState(24);
  const [addr, setAddr] = useState(parseIPv4('192.168.0.37')!);
  const bad = parseIPv4(text) === null;
  const type = (v: string) => {
    setText(v);
    const a = parseIPv4(v);
    if (a !== null) setAddr(a);
  };
  const preset = (p: string) => {
    const [a, l] = p.split('/');
    type(a);
    setLen(Number(l));
  };
  const bits = bitsOf(addr);
  const net = networkOf(addr, len);
  const bc = broadcastOf(addr, len);
  const hosts = usableHosts(len);
  const first = len >= 31 ? net : net + 1;
  const last = len >= 31 ? bc : bc - 1;
  const octets = [0, 1, 2, 3].map((o) => bits.slice(o * 8, o * 8 + 8));

  return (
    <Figure
      no={1}
      title="주소와 프리픽스 계산기"
      hint="주소를 입력하고 프리픽스 길이를 바꿔 보세요"
      caption={
        <>
          IPv4 주소 32비트를 8비트씩 끊어 그렸습니다. 색이 칠해진 앞쪽 비트가 <strong>네트워크 부분</strong>(프리픽스), 나머지가 <strong>호스트 부분</strong>입니다. 호스트 비트를 모두 0으로 하면 네트워크 주소, 모두 1로 하면 브로드캐스트 주소가 되고, 이 둘은 보통 컴퓨터에 주지 않습니다. 예외로 두 장치만 잇는 /31 링크는 두 주소를 모두 쓰고(RFC 3021), /32는 주소 하나를 가리킵니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="cidr-bits" role="img" aria-label={`${formatIPv4(addr)}/${len}: 앞 ${len}비트가 네트워크, 뒤 ${32 - len}비트가 호스트`}>
            {octets.map((o, k) => (
              <div className="cidr-octet" key={k}>
                <span className="dec">{Math.floor(addr / 2 ** (24 - 8 * k)) % 256}</span>
                <div className="cidr-cells">
                  {o.split('').map((b, i) => (
                    <span key={i} data-net={k * 8 + i < len || undefined}>
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            <Readout label="서브넷 마스크" value={formatIPv4(maskOf(len))} />
            <Readout label="네트워크 주소" value={`${formatIPv4(net)}/${len}`} color="var(--c-net-1)" />
            <Readout label="브로드캐스트 주소" value={len >= 31 ? '없음' : formatIPv4(bc)} />
            <Readout label="쓸 수 있는 범위" value={hosts === 1 ? formatIPv4(net) : `${formatIPv4(first)} – ${formatIPv4(last)}`} />
            <Readout label="쓸 수 있는 주소 수" value={`${n0(hosts)}개`} />
            <Readout label="주소의 종류" value={addressKind(addr)} />
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <label className="ctl-label" htmlFor="cidr-ip">
              <span>IPv4 주소</span>
            </label>
            <input id="cidr-ip" className="text-input mono" type="text" inputMode="decimal" value={text} spellCheck={false} autoComplete="off" onChange={(e) => type(e.target.value)} aria-invalid={bad} />
            <span className="cidr-err">{bad ? '0~255 사이의 수 네 개를 점으로 이어 주세요' : ''}</span>
          </div>
          <Slider id="cidr-len" label="프리픽스 길이" value={len} min={0} max={32} step={1} onChange={setLen} format={(v) => `/${v}`} color="var(--c-net-1)" />
          <div className="ctl">
            <span className="ctl-label">
              <span>예시</span>
            </span>
            <div className="chip-row">
              {CIDR_PRESETS.map((p) => (
                <button key={p} type="button" className="op-chip" onClick={() => preset(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: longest prefix match ─────────────── */

const TABLE: Route[] = [
  { prefix: '0.0.0.0/0', hop: '인터넷 회선 (기본 경로)' },
  { prefix: '10.0.0.0/8', hop: '사내 백본' },
  { prefix: '10.20.0.0/16', hop: '서울 사무실' },
  { prefix: '10.20.30.0/24', hop: '서버실' },
  { prefix: '10.20.30.128/25', hop: '보안 구역 방화벽' },
  { prefix: '192.168.0.0/16', hop: '손님용 Wi-Fi' },
];
const DESTS = ['10.20.30.200', '10.20.30.7', '10.20.99.1', '10.77.0.5', '8.8.8.8', '192.168.3.4'];

/** The destination's bits against one prefix: shared bits bold, the first differing bit red, the rest dim. */
function BitCompare({ addr, prefix }: { addr: number; prefix: string }) {
  const { net, len } = parsePrefix(prefix);
  if (len === 0) return <span className="lpm-bits">(비교할 비트 없음: 모든 주소와 일치)</span>;
  const same = Math.min(len, commonBits(addr, net));
  const b = bitsOf(addr);
  const out: ReactNode[] = [];
  for (let i = 0; i < 32; i++) {
    if (i && i % 8 === 0) out.push(' ');
    const ch = b[i];
    out.push(i < same ? <b key={i}>{ch}</b> : i === same && same < len ? <u key={i}>{ch}</u> : <i key={i}>{ch}</i>);
  }
  return <span className="lpm-bits">{out}</span>;
}

function LpmFigure() {
  const [text, setText] = useState(DESTS[0]);
  const [addr, setAddr] = useState(parseIPv4(DESTS[0])!);
  const bad = parseIPv4(text) === null;
  const type = (v: string) => {
    setText(v);
    const a = parseIPv4(v);
    if (a !== null) setAddr(a);
  };
  const best = longestMatch(TABLE, addr);
  const hits = TABLE.filter((r) => matches(addr, r.prefix)).length;

  return (
    <Figure
      no={2}
      title="가장 긴 프리픽스 일치"
      hint="목적지 주소를 바꿔 보세요"
      caption={
        <>
          어느 회사 라우터의 포워딩 테이블입니다. 목적지 주소와 각 프리픽스를 앞에서부터 비트 단위로 비교합니다. 굵은 비트는 프리픽스와 같은 비트, 빨간 비트는 처음으로 달라진 비트, 흐린 비트는 비교하지 않는 호스트 부분입니다. 초록 줄은 일치하는 모든 경로, 노란 줄은 그중 프리픽스가 가장 긴, 실제로 고른 경로입니다. 0.0.0.0/0은 모든 주소와 일치하므로 다른 경로가 없을 때 쓰는 기본 경로가 됩니다.
        </>
      }
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '0 1 220px' }}>
          <label className="ctl-label" htmlFor="lpm-ip">
            <span>목적지 주소</span>
          </label>
          <input id="lpm-ip" className="text-input mono" type="text" inputMode="decimal" value={text} spellCheck={false} autoComplete="off" onChange={(e) => type(e.target.value)} aria-invalid={bad} />
        </div>
        <div className="ctl" style={{ flex: '1 1 260px' }}>
          <span className="ctl-label">
            <span>예시</span>
          </span>
          <div className="chip-row">
            {DESTS.map((d) => (
              <button key={d} type="button" className="op-chip" data-cur={d === formatIPv4(addr) || undefined} onClick={() => type(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
      {bad && <span className="cidr-err">0~255 사이의 수 네 개를 점으로 이어 주세요. 그림은 마지막으로 올바르게 입력한 주소를 보여 줍니다.</span>}
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="tbl lpm-tbl">
          <thead>
            <tr>
              <th className="mono">프리픽스</th>
              <th>목적지 {formatIPv4(addr)}의 비트와 비교</th>
              <th>다음 홉</th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map((r, i) => (
              <tr key={r.prefix} data-m={matches(addr, r.prefix) || undefined} data-best={i === best || undefined}>
                <td className="mono">{r.prefix}</td>
                <td>
                  <BitCompare addr={addr} prefix={r.prefix} />
                </td>
                <td>{r.hop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <Readout label="일치하는 경로" value={`${hits}개`} color="var(--good)" />
        <Readout label="고른 경로" value={TABLE[best].prefix} />
        <Readout label="보낼 곳" value={TABLE[best].hop} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: link-state routing with Dijkstra ─────────────── */

const ROUTERS: [number, number][] = [
  [0.07, 0.5],
  [0.3, 0.14],
  [0.3, 0.86],
  [0.52, 0.5],
  [0.73, 0.14],
  [0.73, 0.86],
  [0.93, 0.5],
];
const LINKS: Link[] = [
  { a: 0, b: 1, cost: 2 },
  { a: 0, b: 2, cost: 5 },
  { a: 1, b: 2, cost: 2 },
  { a: 1, b: 3, cost: 4 },
  { a: 1, b: 4, cost: 7 },
  { a: 2, b: 3, cost: 3 },
  { a: 2, b: 5, cost: 8 },
  { a: 3, b: 4, cost: 2 },
  { a: 3, b: 5, cost: 4 },
  { a: 4, b: 6, cost: 3 },
  { a: 5, b: 6, cost: 3 },
  { a: 4, b: 5, cost: 1 },
];
const rName = (i: number) => `R${i + 1}`;
const linkName = (l: Link) => `${rName(l.a)}–${rName(l.b)}`;

function RoutingFigure() {
  const P = usePalette();
  const [src, setSrc] = useState(0);
  const [down, setDown] = useState<Set<number>>(() => new Set());
  const res = useMemo(() => spf(ROUTERS.length, LINKS, down, src), [down, src]);
  const geo = useRef<{ X: (x: number) => number; Y: (y: number) => number }>({ X: (x) => x, Y: (y) => y });
  const tree = new Set(res.prev.map((p, v) => (p < 0 ? -1 : LINKS.findIndex((l) => (l.a === p && l.b === v) || (l.b === p && l.a === v)))).filter((k) => k >= 0));
  const unreachable = res.dist.filter((d) => d === Infinity).length;

  const toggle = (k: number) =>
    setDown((s) => {
      const t = new Set(s);
      if (t.has(k)) t.delete(k);
      else t.add(k);
      return t;
    });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 26;
      const X = (x: number) => pad + x * (w - 2 * pad);
      const Y = (y: number) => pad + y * (h - 2 * pad);
      geo.current = { X, Y };
      LINKS.forEach((l, k) => {
        const [ax, ay] = ROUTERS[l.a];
        const [bx, by] = ROUTERS[l.b];
        const isDown = down.has(k);
        const inTree = tree.has(k);
        ctx.strokeStyle = isDown ? P.bad : inTree ? P.neg : P.lineStrong;
        ctx.lineWidth = inTree ? 3.5 : 1.5;
        ctx.setLineDash(isDown ? [6, 5] : []);
        ctx.beginPath();
        ctx.moveTo(X(ax), Y(ay));
        ctx.lineTo(X(bx), Y(by));
        ctx.stroke();
        ctx.setLineDash([]);
        // cost label
        const mx = X((ax + bx) / 2);
        const my = Y((ay + by) / 2);
        ctx.font = `600 11px ${P.fontMono}`;
        const t = isDown ? '×' : String(l.cost);
        const tw = ctx.measureText(t).width + 8;
        ctx.fillStyle = P.surface;
        ctx.fillRect(mx - tw / 2, my - 8, tw, 16);
        ctx.strokeStyle = isDown ? P.bad : P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2 + 0.5, my - 7.5, tw - 1, 15);
        ctx.fillStyle = isDown ? P.bad : P.ink2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, mx, my + 0.5);
      });
      ROUTERS.forEach(([x, y], i) => {
        const isSrc = i === src;
        const d = res.dist[i];
        ctx.beginPath();
        ctx.arc(X(x), Y(y), 16, 0, Math.PI * 2);
        ctx.fillStyle = isSrc ? P.ink : d === Infinity ? P.surface2 : P.surface;
        ctx.fill();
        ctx.strokeStyle = d === Infinity ? P.bad : P.ink;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = isSrc ? P.surface : P.ink;
        ctx.font = `700 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rName(i), X(x), Y(y) + 1);
        // distance badge
        const label = isSrc ? '출발' : d === Infinity ? '∞' : String(d);
        ctx.font = `600 11px ${P.fontMono}`;
        const by = Y(y) + (y < 0.3 ? -26 : 26); // top row above, the rest below
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = isSrc ? P.surface : alpha(P.neg, P.dark ? 0.3 : 0.16);
        ctx.fillRect(X(x) - tw / 2, by - 8, tw, 16);
        ctx.fillStyle = d === Infinity ? P.bad : P.ink;
        ctx.fillText(label, X(x), by + 0.5);
      });
    },
    [P, res, down, src],
    { aspect: 1.9, maxHeight: 340, minHeight: 240 },
  );

  // a click picks a router, or breaks / restores the nearest link
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(e, e.currentTarget);
    const { X, Y } = geo.current;
    const r = ROUTERS.findIndex(([rx, ry]) => Math.hypot(X(rx) - x, Y(ry) - y) < 20);
    if (r >= 0) {
      setSrc(r);
      return;
    }
    let best = -1;
    let bd = 12;
    LINKS.forEach((l, k) => {
      const ax = X(ROUTERS[l.a][0]);
      const ay = Y(ROUTERS[l.a][1]);
      const bx = X(ROUTERS[l.b][0]);
      const by = Y(ROUTERS[l.b][1]);
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      const d = Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    if (best >= 0) toggle(best);
  };

  return (
    <Figure
      no={3}
      title="링크 상태 라우팅"
      hint="라우터를 누르면 출발점, 링크를 누르면 끊기·잇기"
      caption={
        <>
          라우터 7대가 모두 같은 지도(링크와 비용)를 알고 있다고 합시다. 고른 라우터가 다익스트라 알고리즘으로 자기에서 출발하는 최단 경로 트리(파란색)를 계산하고, 그 트리에서 목적지마다 "첫 번째로 건너갈 이웃"만 뽑아 포워딩 테이블을 만듭니다. 라우터 옆의 수는 출발점에서의 최단 거리이고, 링크 위의 수는 비용입니다. 링크를 끊으면 모든 라우터가 새 지도로 다시 계산합니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box ls-canvas" onClick={onClick} role="img" aria-label={`${rName(src)}에서 출발하는 최단 경로 트리. 끊긴 링크 ${down.size}개.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>링크 끊기·잇기 (비용)</span>
            </span>
            <div className="ls-links">
              {LINKS.map((l, k) => (
                <button key={k} type="button" className="ls-link" aria-pressed={down.has(k)} onClick={() => toggle(k)} title={down.has(k) ? '다시 잇기' : '끊기'}>
                  {linkName(l)} ({l.cost})
                </button>
              ))}
            </div>
          </div>
          <div className="step-note">
            다익스트라가 거리를 확정한 순서: <span className="mono">{res.order.map((v) => `${rName(v)}(${res.dist[v]})`).join(' → ')}</span>
          </div>
        </div>
        <div className="controls">
          <Seg label="출발 라우터" value={src} onChange={setSrc} options={ROUTERS.map((_, i) => ({ value: i, label: rName(i) }))} />
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>목적지</th>
                  <th>다음 홉</th>
                  <th>비용</th>
                </tr>
              </thead>
              <tbody>
                {ROUTERS.map((_, v) =>
                  v === src ? null : (
                    <tr key={v} title={pathTo(res, v).map(rName).join(' → ')}>
                      <td className="mono">{rName(v)}</td>
                      <td className="mono" style={res.nextHop[v] < 0 ? { color: 'var(--bad)' } : undefined}>
                        {res.nextHop[v] < 0 ? '갈 수 없음' : rName(res.nextHop[v])}
                      </td>
                      <td className="num">{res.dist[v] === Infinity ? '∞' : res.dist[v]}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="btn-row">
            <Button small onClick={() => setDown(new Set())} disabled={!down.size}>
              모든 링크 잇기
            </Button>
          </div>
          {unreachable > 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--bad)' }}>라우터 {unreachable}대에 갈 길이 없습니다. 네트워크가 둘로 쪼개졌습니다.</div>}
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '최단 경로 트리', shape: 'ln' },
          { color: 'var(--line-strong)', label: '쓰지 않는 링크', shape: 'ln' },
          { color: 'var(--bad)', label: '끊긴 링크', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function IpRouting() {
  return (
    <>
      <h2>32비트짜리 주소</h2>
      <p>
        인터넷에 연결된 장치는 저마다 <T en="IP address">IP 주소</T>를 가집니다. 지금도 가장 널리 쓰이는 IPv4의 주소는 32비트 수 하나입니다. 사람이 읽기 쉽도록 8비트씩 네 덩어리로 끊어 각각을 0~255의 십진수로 적고 점으로 잇습니다. 예를 들어 <code>192.168.0.37</code>은 이진수 <code>11000000 10101000 00000000 00100101</code>입니다. 32비트로 만들 수 있는 주소는 <M>{'2^{32}'}</M> = 4,294,967,296개, 약 43억 개입니다.
      </p>
      <p>
        라우터가 43억 개의 주소를 하나하나 기억할 수는 없습니다. 그래서 주소를 전화번호처럼 앞부분과 뒷부분으로 나눕니다. 앞부분은 어느 <T en="network">네트워크</T>인지, 뒷부분은 그 네트워크 안의 어느 장치(<T en="host">호스트</T>)인지를 나타냅니다. 앞부분의 길이를 <T en="prefix length">프리픽스 길이</T>라고 하고, 주소 뒤에 빗금과 함께 적습니다. <code>192.168.0.0/24</code>는 "앞 24비트가 192.168.0인 모든 주소", 즉 192.168.0.0부터 192.168.0.255까지 256개를 뜻합니다. 이렇게 적는 방식을 <T en="Classless Inter-Domain Routing">CIDR</T>라고 합니다.
      </p>
      <CidrFigure />
      <p>
        프리픽스 길이를 1 줄이면 네트워크 크기가 두 배가 됩니다. /24는 주소 256개(쓸 수 있는 것은 254개), /16은 65,536개, /8은 약 1,677만 개입니다. 같은 내용을 <T en="subnet mask">서브넷 마스크</T>로도 적습니다. 네트워크 비트를 모두 1로 채운 32비트 수로, /24는 <code>255.255.255.0</code>입니다. 주소와 마스크를 비트 AND 하면 네트워크 주소가 나옵니다. 컴퓨터가 "목적지가 나와 같은 네트워크에 있는가"를 판단할 때 하는 계산이 바로 이것입니다. 같은 네트워크면 이더넷으로 바로 보내고, 아니면 <T en="default gateway">기본 게이트웨이</T>(대개 공유기)에 맡깁니다.
      </p>
      <Callout kind="note">
        1993년 CIDR이 도입되기 전에는 주소의 첫 비트 몇 개로 네트워크 크기가 /8(A 클래스), /16(B 클래스), /24(C 클래스) 중 하나로 정해졌습니다. 254대로는 모자라고 65,534대는 너무 많은 회사도 B 클래스를 받아야 해서 주소가 크게 낭비되었고, CIDR은 아무 길이로나 자를 수 있게 해 이 문제를 풀었습니다. 지금도 "C 클래스"라는 말을 /24의 뜻으로 쓰는 사람이 있습니다.
      </Callout>

      <h2>주소가 모자라다: 사설 주소와 NAT</h2>
      <p>
        43억 개는 많아 보이지만 세계 인구보다 적고, 한 사람이 스마트폰, 노트북, TV를 함께 씁니다. 2011년 주소를 총괄하는 IANA가 마지막으로 남은 큰 주소 블록을 지역 관리 기관들에 나눠 주었고, 지역 기관들도 이후 차례로 새 주소를 거의 주지 못하게 되었습니다. 인터넷이 그래도 굴러가는 것은 두 가지 덕분입니다.
      </p>
      <p>
        첫째, <T en="private address">사설 주소</T>입니다. RFC 1918은 <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code> 세 범위를 인터넷에 내보내지 않는 내부용으로 정했습니다. 이 주소는 누구나 자기 네트워크 안에서 겹쳐 써도 됩니다. 집 공유기가 나눠 주는 <code>192.168.0.x</code> 같은 주소가 그렇습니다.
      </p>
      <p>
        둘째, <T en="network address translation">NAT</T>입니다. 공유기는 공인 주소 하나만 받고, 안쪽 장치가 바깥으로 보내는 패킷의 출발지 주소와 포트를 자기 공인 주소와 새 포트 번호로 바꿔 씁니다. 그리고 그 짝을 표에 적어 두었다가, 답장이 그 포트로 돌아오면 원래 장치의 사설 주소로 되돌려 넘깁니다. 집 안의 장치 열 대가 공인 주소 하나를 나눠 쓰는 셈입니다. 통신사는 이것을 한 겹 더 해서 가입자 여럿이 공인 주소 하나를 나눠 쓰게 하기도 하고(<code>100.64.0.0/10</code>은 이 용도로 정해진 범위입니다), 그 대가로 바깥에서 안쪽 장치로 먼저 연결을 걸기가 어려워집니다.
      </p>
      <Callout kind="intuition">
        근본적인 해결책은 주소를 128비트로 늘린 <T en="IPv6">IPv6</T>입니다. <M>{'2^{128} \\approx 3.4 \\times 10^{38}'}</M>개라 NAT 없이 모든 장치에 공인 주소를 줄 수 있습니다. 주소는 <code>2001:db8::1</code>처럼 16비트씩 16진수로 적고, 프리픽스와 가장 긴 프리픽스 일치, 라우팅의 원리는 IPv4와 같습니다. 많은 통신사와 대형 서비스가 이미 IPv4와 IPv6를 함께 쓰고 있습니다.
      </Callout>

      <h2>라우터가 다음 칸을 고르는 법</h2>
      <p>
        라우터는 패킷을 받을 때마다 목적지 IP 주소를 보고 어느 링크로 내보낼지 정합니다. 이 일을 <T en="forwarding">포워딩</T>이라고 하고, 이때 보는 표가 <T en="forwarding table">포워딩 테이블</T>입니다. 표의 각 줄은 "이 프리픽스에 속한 주소는 저 이웃에게 보내라"는 뜻입니다. 라우터는 목적지까지의 전체 경로를 몰라도 됩니다. 바로 다음 칸(<T en="next hop">다음 홉</T>)만 알면, 다음 라우터가 또 자기 표를 보고 다음 칸을 고릅니다.
      </p>
      <p>
        한 주소가 여러 줄과 동시에 일치할 수 있습니다. <code>10.20.30.200</code>은 <code>10.0.0.0/8</code>에도, <code>10.20.0.0/16</code>에도, <code>10.20.30.0/24</code>에도 속합니다. 이때 라우터는 <strong>프리픽스가 가장 긴</strong>, 즉 가장 구체적인 줄을 고릅니다. 이 규칙을 <T en="longest prefix match">가장 긴 프리픽스 일치</T>라고 합니다.
      </p>
      <LpmFigure />
      <p>
        <code>10.20.30.200</code>은 다섯 줄과 일치하고, 그중 가장 긴 /25를 따라 보안 구역 방화벽으로 갑니다. 같은 서버실 대역이라도 <code>10.20.30.7</code>은 25번째 비트가 0이라 /25와 맞지 않아 /24의 서버실로, <code>8.8.8.8</code>은 기본 경로 한 줄과만 일치해 인터넷 회선으로 나갑니다. 이 규칙 덕분에 표를 아주 짧게 유지할 수 있습니다. 회사 전체를 /8 한 줄로 묶어 두고, 따로 처리할 부분만 더 긴 프리픽스로 덧붙이면 되기 때문입니다. 이렇게 여러 프리픽스를 짧은 하나로 묶는 것을 <T en="route aggregation">경로 집약</T>이라고 합니다.
      </p>
      <Callout kind="note">
        인터넷의 중심부 라우터는 IPv4 프리픽스만 100만 개가 넘는 표를 들고 초당 수억 개의 패킷을 처리해야 합니다. 그래서 프리픽스를 비트 단위 트라이(trie)나 그것을 압축한 구조에 담아 비트를 앞에서부터 따라 내려가며 찾거나, TCAM이라는 특수 메모리로 모든 줄을 한 번에 비교합니다.
      </Callout>

      <h2>표는 누가 만드나: 링크 상태 라우팅</h2>
      <p>
        포워딩 테이블을 사람이 일일이 적을 수도 있지만(<T en="static route">정적 경로</T>), 링크가 끊길 때마다 고칠 수는 없습니다. 그래서 라우터들은 <T en="routing protocol">라우팅 프로토콜</T>로 서로 정보를 주고받아 표를 스스로 만듭니다. 한 조직 안에서 많이 쓰는 OSPF와 IS-IS는 <T en="link state">링크 상태</T> 방식입니다.
      </p>
      <ol>
        <li>각 라우터는 자기에게 붙은 링크와 그 비용을 알립니다. 이 알림은 이웃에서 이웃으로 퍼져(<T en="flooding">플러딩</T>) 모든 라우터에 전달됩니다.</li>
        <li>그러면 모든 라우터가 똑같은 네트워크 지도를 갖게 됩니다.</li>
        <li>
          각 라우터는 그 지도에서 자기를 출발점으로 <a href="#cs-algorithms/graph-search">다익스트라 알고리즘</a>을 돌려 모든 목적지까지의 최단 경로를 구하고, 각 경로의 첫 칸을 포워딩 테이블에 적습니다.
        </li>
      </ol>
      <p>링크의 비용은 관리자가 정합니다. 흔히 느린 링크일수록 비용을 크게 주어, 최단 경로가 빠른 링크를 타게 합니다.</p>
      <RoutingFigure />
      <p>
        R1에서 출발하면 R4로 가는 길은 R2를 거쳐 비용 6이고, R7로 가는 길은 R2, R4, R5를 거쳐 비용 11입니다. R1의 표에는 이 긴 경로가 아니라 "R4로 가려면 R2에게, R7로 가려면 R2에게"라는 첫 칸만 적힙니다. 나머지는 R2가 자기 표를 보고 알아서 합니다. 이것이 맞아떨어지는 것은 최단 경로의 일부도 최단 경로이기 때문입니다. R1에서 R7까지의 최단 경로가 R2를 지나면, 그중 R2에서 R7까지의 부분도 R2가 계산한 최단 경로와 같습니다. 모든 라우터가 같은 지도로 같은 계산을 하니 서로의 결정이 어긋나지 않습니다.
      </p>
      <p>
        R1–R2 링크를 끊어 보세요. 이 소식이 퍼지면 R1은 남은 R1–R3 링크로 모든 목적지를 다시 계산합니다. 지도가 퍼지고 계산이 끝나기까지의 짧은 동안에는 라우터마다 가진 지도가 달라서, 패킷이 버려지거나 두 라우터 사이를 맴돌 수도 있습니다. 과목 표지의 애니메이션이 바로 이 순간을 보여 줍니다.
      </p>

      <h2>맴도는 패킷 막기: TTL과 traceroute</h2>
      <p>
        지도가 어긋나 패킷이 고리를 돌기 시작하면 영원히 네트워크를 떠돌 수 있습니다. 그래서 IPv4 헤더에는 8비트짜리 <T en="time to live">TTL</T> 필드가 있습니다. 보내는 컴퓨터가 64나 128 같은 값을 적어 보내고, 라우터는 패킷을 넘길 때마다 1씩 줄입니다. 0이 되면 패킷을 버리고, 보낸 쪽에 "시간 초과"라는 ICMP 메시지를 돌려보냅니다. (IPv6에서는 이름이 hop limit으로 바뀌었고 하는 일은 같습니다.)
      </p>
      <p>
        <code>traceroute</code>(Windows에서는 <code>tracert</code>)는 이 동작을 거꾸로 이용합니다. TTL을 1로 해서 보내면 첫 라우터가 버리고 답을 보내므로 첫 라우터의 주소를 알 수 있습니다. TTL을 2, 3, 4로 늘려 가며 보내면 경로 위의 라우터를 차례로 알아낼 수 있습니다.
      </p>
      <Code label="traceroute 출력의 모양 (주소와 시간은 예시)">{`
$ traceroute example.com
 1  192.168.0.1     1.2 ms    // 집 공유기: TTL 1에서 버려짐
 2  100.64.12.1     4.8 ms    // 통신사 안쪽 (공유 주소 대역)
 3  * * *                     // 시간 초과를 보내지 않는 라우터
 4  203.0.113.9    11.5 ms
 ...
12  93.184.215.14  132.0 ms   // 목적지: 태평양을 건너며 시간이 크게 뜀
`}</Code>

      <h2>네트워크들의 네트워크: BGP</h2>
      <p>
        OSPF는 모든 라우터가 지도를 공유하므로 한 조직 안에서만 씁니다. 인터넷은 통신사, 클라우드, 대학, 기업 등 각자 독립적으로 운영되는 수만 개의 <T en="autonomous system">자율 시스템</T>(AS)이 이어진 것이고, AS 사이에서는 <T en="Border Gateway Protocol">BGP</T>로 경로를 주고받습니다. BGP는 지도를 공유하지 않습니다. 각 AS가 "이 프리픽스는 우리를 거쳐 이 AS들을 지나면 닿는다"는 경로를 이웃 AS에 알리고, 받은 AS는 비용보다 계약 관계나 정책을 기준으로 어느 경로를 쓸지, 누구에게 다시 알릴지 고릅니다. 어느 길로 갈지가 기술만이 아니라 돈과 계약으로도 정해지는 것입니다.
      </p>
      <p>
        BGP는 기본적으로 이웃이 알린 경로를 믿고, 포워딩은 가장 긴 프리픽스 일치를 따릅니다. 2008년 파키스탄의 한 통신사가 국내에서 YouTube를 막으려고 YouTube 주소 블록의 일부를 더 긴 프리픽스로 알렸는데, 이 경로가 바깥으로 새어 나가자 세계의 많은 라우터가 더 구체적인 그 경로를 골라 YouTube로 가는 트래픽이 약 두 시간 동안 파키스탄으로 빨려 들어갔습니다. 지금은 주소의 주인이 누구인지 서명으로 확인하는 RPKI 같은 장치가 점점 널리 쓰이고 있습니다.
      </p>

      <Callout kind="key">
        IPv4 주소는 32비트이고, 앞의 프리픽스가 네트워크를, 뒤가 그 안의 호스트를 나타냅니다(<code>192.168.0.0/24</code>). 주소가 모자라 사설 주소와 NAT로 버티며, 근본 해결책은 128비트 IPv6입니다. 라우터는 목적지 주소와 일치하는 포워딩 테이블의 줄 중 <strong>프리픽스가 가장 긴</strong> 줄을 골라 다음 홉으로 넘깁니다. 한 조직 안에서는 OSPF 같은 링크 상태 프로토콜이 모든 라우터에 같은 지도를 퍼뜨리고, 각 라우터가 다익스트라로 최단 경로의 첫 칸을 계산합니다. 조직 사이에서는 BGP가 정책에 따라 경로를 주고받습니다. TTL은 고리에 빠진 패킷을 지우고, traceroute는 이를 이용해 경로를 알아냅니다.
      </Callout>
      <Quiz
        q="어느 회사가 203.0.112.0/22 블록을 BGP로 알리고 있다. 어느 날 다른 AS가 실수로 203.0.113.0/24를 알렸고, 이 경로가 인터넷에 퍼졌다. 이 회사의 서버 203.0.113.50과 203.0.114.10으로 가는 패킷은 어떻게 될까?"
        options={[
          '둘 다 원래 회사로 간다. 먼저 알린 경로가 우선이기 때문이다',
          '203.0.113.50은 /24를 알린 AS로 가고, 203.0.114.10은 원래 회사로 간다',
          '둘 다 /24를 알린 AS로 간다. 더 새로운 경로가 이전 경로를 대체하기 때문이다',
          '둘 다 원래 회사로 간다. /22가 더 많은 주소를 포함하므로 더 큰 블록이 이긴다',
        ]}
        answer={1}
        explain={
          <>
            포워딩은 가장 긴 프리픽스 일치를 따릅니다. 203.0.113.50은 /22와 /24 모두에 속하므로 더 구체적인 /24를 따라 잘못 알린 AS로 갑니다. 203.0.114.10은 203.0.113.0/24에 속하지 않으므로(세 번째 수가 114) /22만 일치하고, 원래 회사로 갑니다. 2008년 YouTube 사고가 이런 식으로 일어났습니다. 먼저 알렸는지, 블록이 큰지는 상관없습니다.
          </>
        }
      />
    </>
  );
}

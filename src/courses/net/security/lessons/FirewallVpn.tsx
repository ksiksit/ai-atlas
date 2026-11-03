import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import {
  LINK_MTU,
  NAS,
  PACKETS,
  PUBLIC_IP,
  RULES,
  UDP_HEADER,
  WG_HEADER,
  WG_TAG,
  evaluate,
  maxInner,
  natReplay,
  outerIpHeader,
  wgOverhead,
  wgPacket,
  type NatFilter,
  type Pkt,
} from './channel';
import '../../../cs/systems/lessons/saving.css';
import './channel.css';

/* ─────────────── Figure 1: a firewall's rules, first match wins ─────────────── */

const INITIAL_ORDER = RULES.map((r) => r.id);
const INITIAL_ON: Record<string, boolean> = Object.fromEntries(RULES.map((r) => [r.id, r.id !== 'web443']));
const pktText = (p: Pkt) => `${p.src}:${p.sport} → ${p.dst}:${p.dport}`;

function FirewallFigure() {
  const [order, setOrder] = useState<string[]>(INITIAL_ORDER);
  const [on, setOn] = useState<Record<string, boolean>>(INITIAL_ON);
  const [dflt, setDflt] = useState<'allow' | 'deny'>('deny');
  const [stateful, setStateful] = useState(false);
  const active = order.filter((id) => on[id]).map((id) => RULES.find((r) => r.id === id)!);
  const verdicts = evaluate(active, PACKETS, dflt, stateful);
  const wrongPass = verdicts.filter((v, i) => v.action === 'allow' && PACKETS[i].want === 'deny').length;
  const wrongBlock = verdicts.filter((v, i) => v.action === 'deny' && PACKETS[i].want === 'allow').length;
  const move = (id: string, d: number) => {
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const reset = () => {
    setOrder(INITIAL_ORDER);
    setOn(INITIAL_ON);
    setDflt('deny');
    setStateful(false);
  };

  return (
    <Figure
      no={1}
      title="방화벽 규칙은 위에서부터"
      hint="규칙을 켜고 끄고 순서를 바꿔, 틀린 판정을 0으로 만들어 보세요"
      caption={
        <>
          회사 네트워크(10.0.0.0/24) 경계의 방화벽입니다. 웹 서버 10.0.0.10은 인터넷에 HTTPS(443)만 열어야 하고, 직원 PC 10.0.0.23은 바깥으로 자유롭게 나가되 바깥에서 먼저 들어오는 연결은 받지 않아야 합니다. 방화벽은 패킷마다 위에서부터 규칙을 보고 처음 맞는 규칙을 따르며, 맞는 규칙이 없으면 기본 정책을 따릅니다. 상태 기반으로 바꾸면 허용한 연결의 응답은 규칙을 보기 전에 연결 표에서 통과시킵니다. 패킷은 위에서 아래로 차례로 도착합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="기본 정책"
          value={dflt}
          onChange={setDflt}
          options={[
            { value: 'deny' as const, label: '기본 차단' },
            { value: 'allow' as const, label: '기본 허용' },
          ]}
        />
        <Seg
          label="방식"
          value={stateful ? 1 : 0}
          onChange={(v) => setStateful(v === 1)}
          options={[
            { value: 0, label: '상태 비저장' },
            { value: 1, label: '상태 기반' },
          ]}
        />
      </div>
      <ol className="fw-rules" aria-label="규칙 목록">
        {order.map((id, i) => {
          const r = RULES.find((x) => x.id === id)!;
          const pos = active.indexOf(r);
          const hits = pos < 0 ? 0 : verdicts.filter((v) => v.by === pos).length;
          return (
            <li key={id} data-off={!on[id] || undefined} data-act={r.action}>
              <Check label={<span className="fw-rule-text">{r.text}</span>} checked={on[id]} onChange={(v) => setOn({ ...on, [id]: v })} />
              <span className="fw-hits mono">{on[id] ? `${hits}건` : '꺼짐'}</span>
              <span className="fw-move">
                <Button small onClick={() => move(id, -1)} disabled={i === 0} label="위로" title="위로">
                  ↑
                </Button>
                <Button small onClick={() => move(id, 1)} disabled={i === order.length - 1} label="아래로" title="아래로">
                  ↓
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="tbl-wrap fw-pkts">
        <table className="tbl">
          <thead>
            <tr>
              <th>패킷</th>
              <th>판정</th>
              <th>근거</th>
            </tr>
          </thead>
          <tbody>
            {PACKETS.map((p, i) => {
              const v = verdicts[i];
              const ok = v.action === p.want;
              return (
                <tr key={i} data-ok={ok || undefined} data-bad={!ok || undefined}>
                  <td>
                    <span className="fw-what">
                      {p.dir === 'in' ? '들어옴' : '나감'} · {p.proto.toUpperCase()} · {p.what}
                    </span>
                    <span className="mono fw-hdr">{pktText(p)}</span>
                  </td>
                  <td className="fw-verdict" data-a={v.action}>
                    {v.action === 'allow' ? '허용' : '차단'}
                    {!ok && <span className="fw-wrong">{p.want === 'deny' ? '막아야 함' : '통과해야 함'}</span>}
                  </td>
                  <td className="fw-by">{v.by === -2 ? '연결 표(응답)' : v.by === -1 ? '기본 정책' : `규칙 ${order.indexOf(active[v.by].id) + 1}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fw-foot">
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Readout label="틀린 판정" value={`${wrongPass + wrongBlock}개`} color={wrongPass + wrongBlock ? 'var(--bad)' : 'var(--good)'} />
          <Readout label="막아야 하는데 통과" value={`${wrongPass}개`} />
          <Readout label="통과해야 하는데 막힘" value={`${wrongBlock}개`} />
        </div>
        <Button small onClick={reset}>
          처음 설정으로
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a home router's NAT, one packet at a time ─────────────── */

const INSIDE = [
  { ip: '192.168.0.11', name: '노트북' },
  { ip: '192.168.0.12', name: '휴대폰' },
  { ip: NAS, name: 'NAS' },
];
const OUTSIDE = [
  { ip: '198.51.100.80', name: '웹사이트' },
  { ip: '192.0.2.99', name: '통화 서버' },
  { ip: '198.51.100.44', name: '통화 상대 · 바깥 사람' },
  { ip: '203.0.113.50', name: '모르는 주소' },
];

function NatFigure() {
  const P = usePalette();
  const [forward, setForward] = useState(false);
  const [filter, setFilter] = useState<NatFilter>('strict');
  const frames = useMemo(() => natReplay(filter, forward), [filter, forward]);
  const s = useStepper(frames.length, 1, `${filter}|${forward}`);
  const f = frames[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const bw = Math.min(120, w * 0.3);
      const bh = 30;
      const lx = 8;
      const rx = w - 8 - bw;
      const routerX = w / 2;
      const rowY = (i: number, n: number) => 30 + ((h - 44) / n) * (i + 0.5);
      // zones
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('집 안 (192.168.0.0/24)', lx, 6);
      ctx.textAlign = 'right';
      ctx.fillText('인터넷', w - 8, 6);
      const hostBox = (x: number, y: number, name: string, ip: string, hot: boolean) => {
        ctx.fillStyle = hot ? alpha(P.hl, P.dark ? 0.35 : 0.3) : P.surface;
        ctx.strokeStyle = hot ? P.ink : P.lineStrong;
        ctx.lineWidth = hot ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.roundRect(x, y - bh / 2, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.font = `600 10.5px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(name, x + bw / 2, y + 1, bw - 6);
        ctx.fillStyle = P.ink2;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textBaseline = 'top';
        ctx.fillText(ip, x + bw / 2, y + 2, bw - 6);
      };
      const ev = f.ev;
      const srcIn = ev ? (ev.dir === 'out' ? INSIDE.findIndex((x) => x.ip === ev.src) : OUTSIDE.findIndex((x) => x.ip === ev.src)) : -1;
      const dstIn = ev && f.after ? (ev.dir === 'out' ? OUTSIDE.findIndex((x) => x.ip === ev.dst) : INSIDE.findIndex((x) => x.ip === f.after!.dst)) : -1;
      INSIDE.forEach((x, i) => hostBox(lx, rowY(i, INSIDE.length), x.name, x.ip, !!ev && ((ev.dir === 'out' && i === srcIn) || (ev.dir === 'in' && i === dstIn))));
      OUTSIDE.forEach((x, i) => hostBox(rx, rowY(i, OUTSIDE.length), x.name, x.ip, !!ev && ((ev.dir === 'in' && i === srcIn) || (ev.dir === 'out' && i === dstIn))));
      // router
      const ry = h / 2 + 6;
      const rw = Math.min(86, w * 0.2);
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.roundRect(routerX - rw / 2, ry - 22, rw, 44, 5);
      ctx.fill();
      ctx.fillStyle = P.surface;
      ctx.font = `700 11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('공유기', routerX, ry, rw - 6);
      ctx.font = `9.5px ${P.fontMono}`;
      ctx.textBaseline = 'top';
      ctx.fillText(PUBLIC_IP, routerX, ry + 2, rw - 6);
      if (!ev) return;
      const col = ev.dir === 'out' ? P.neg : P.pos;
      const inX = lx + bw;
      const outX = rx;
      const fromY = ev.dir === 'out' ? rowY(srcIn, INSIDE.length) : rowY(srcIn, OUTSIDE.length);
      const fromX = ev.dir === 'out' ? inX : outX;
      const toRouterX = ev.dir === 'out' ? routerX - rw / 2 : routerX + rw / 2;
      drawArrow(ctx, fromX, fromY, toRouterX, ry, col, 2.4, 8);
      if (f.dropped) {
        const xx = ev.dir === 'out' ? routerX + rw / 2 + 14 : routerX - rw / 2 - 14;
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xx - 7, ry - 7);
        ctx.lineTo(xx + 7, ry + 7);
        ctx.moveTo(xx + 7, ry - 7);
        ctx.lineTo(xx - 7, ry + 7);
        ctx.stroke();
      } else if (dstIn >= 0) {
        const toY = ev.dir === 'out' ? rowY(dstIn, OUTSIDE.length) : rowY(dstIn, INSIDE.length);
        const toX = ev.dir === 'out' ? outX : inX;
        drawArrow(ctx, ev.dir === 'out' ? routerX + rw / 2 : routerX - rw / 2, ry, toX, toY, col, 2.4, 8);
      }
    },
    [P, f],
    { height: 190 },
  );

  const ev = f.ev;
  return (
    <Figure
      no={2}
      title="공유기는 주소를 어떻게 바꾸나"
      hint="한 단계씩 넘기고, 포트 포워딩과 필터링 방식을 바꿔 보세요"
      caption={
        <>
          집 안의 기기들은 사설 주소(192.168.0.x)를 쓰고, 인터넷 쪽에서는 공유기의 공인 주소 {PUBLIC_IP} 하나만 보입니다. 공유기는 나가는 패킷의 출발지를 자기 주소와 새 포트로 바꾸고 그 짝을 표에 적어 두었다가, 돌아오는 패킷을 표에서 찾아 되돌립니다. "보낸 상대에게서 온 것만"은 매핑을 열 때 연락한 그 주소와 포트에서 온 패킷만 받는 방식이고, "아무에게서나"는 매핑이 열린 동안 어느 주소에서 온 패킷이든 받는 방식입니다. 바깥 포트는 40001부터 차례로 고른다고 단순하게 가정했습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="들어오는 패킷 필터링"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'strict' as NatFilter, label: '보낸 상대에게서 온 것만' },
            { value: 'open' as NatFilter, label: '아무에게서나' },
          ]}
        />
        <Check label="포트 포워딩: 443 → NAS" checked={forward} onChange={setForward} />
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={ev ? `${ev.what}: ${f.dropped ? '공유기가 버림' : '변환해서 전달'}` : 'NAT 변환 표가 비어 있는 처음 상태'}>
            <canvas ref={canvasRef} />
          </div>
          {ev && (
            <div className="nat-hdrs">
              <div>
                <span>공유기에 들어온 패킷</span>
                <span className="mono">
                  {ev.proto.toUpperCase()} {ev.src}:{ev.sport} → {ev.dst}:{ev.dport}
                </span>
              </div>
              <div data-drop={f.dropped || undefined}>
                <span>공유기가 내보낸 패킷</span>
                <span className="mono">{f.after ? `${ev.proto.toUpperCase()} ${f.after.src}:${f.after.sport} → ${f.after.dst}:${f.after.dport}` : '버림'}</span>
              </div>
            </div>
          )}
          <div className="step-note" aria-live="polite">
            {ev && <strong>{ev.what}. </strong>}
            {f.note}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="nat-speed" maxSpeed={3} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="표의 줄" value={`${f.rows.length}개`} />
            <Readout label="버린 패킷" value={`${frames.slice(1, s.i + 1).filter((x) => x.dropped).length}개`} color="var(--bad)" />
          </div>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl nat-table">
          <thead>
            <tr>
              <th>안쪽 주소:포트</th>
              <th>바깥 주소:포트</th>
              <th>연락한 상대</th>
            </tr>
          </thead>
          <tbody>
            {f.rows.length === 0 && (
              <tr>
                <td colSpan={3} className="nat-empty">
                  비어 있음
                </td>
              </tr>
            )}
            {f.rows.map((r, i) => (
              <tr key={i} data-new={i === f.newRow || undefined} data-used={i === f.usedRow || undefined}>
                <td className="mono">
                  {r.proto.toUpperCase()} {r.inside}
                </td>
                <td className="mono">{r.outside}</td>
                <td className="mono">{r.forward ? '아무나 (포트 포워딩)' : r.peer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '나가는 패킷', shape: 'ln' },
          { color: 'var(--pos)', label: '들어오는 패킷', shape: 'ln' },
          { color: 'var(--hl)', label: '새로 적거나 방금 찾은 줄', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: a VPN wraps each packet once more ─────────────── */

type Tunnel = 'none' | 'full' | 'split';
const VPN_SERVER = '203.0.113.9:51820';
const DESTS = [
  { id: 'wiki', name: '회사 위키', addr: '10.1.2.3:443', corp: true },
  { id: 'web', name: '뉴스 사이트', addr: '198.51.100.80:443', corp: false },
  { id: 'dns', name: 'DNS 질의', addr: '192.0.2.53:53', corp: false },
];

function seenBy(t: Tunnel, d: (typeof DESTS)[number]): { cafe: string; tunneled: boolean } {
  const tunneled = t === 'full' || (t === 'split' && d.corp);
  if (tunneled) return { cafe: `UDP → ${VPN_SERVER} · 암호화된 덩어리 · 크기와 시각`, tunneled };
  if (d.corp) return { cafe: '닿을 수 없음 (사설 주소는 인터넷에서 길이 없음)', tunneled };
  if (d.id === 'web') return { cafe: `${d.addr} · SNI www.example.com · 크기와 시각`, tunneled };
  return { cafe: `${d.addr} · 질의한 이름 www.example.com (평문 DNS라면)`, tunneled };
}

function VpnFigure() {
  const P = usePalette();
  const [v, setV] = useState<4 | 6>(4);
  const [mtu, setMtu] = useState(1420);
  const [inner, setInner] = useState(1420);
  const [tunnel, setTunnel] = useState<Tunnel>('full');
  const size = Math.min(inner, mtu);
  const pk = wgPacket(size, v, mtu);
  const ip = outerIpHeader(v);
  const parts = [
    { label: `바깥 IPv${v}`, bytes: ip, color: P.neg },
    { label: 'UDP', bytes: UDP_HEADER, color: P.stats1 },
    { label: 'WG 헤더', bytes: WG_HEADER, color: P.stats2 },
    { label: '암호화된 원래 패킷', bytes: pk.inner, color: P.good },
    { label: '채움', bytes: pk.padded - pk.inner, color: P.ink3 },
    { label: '인증 태그', bytes: WG_TAG, color: P.pos },
  ];
  const scale = Math.max(LINK_MTU, pk.outer) * 1.02;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const x0 = 8;
      const bw = w - 16;
      const X = (b: number) => x0 + (b / scale) * bw;
      const y = 26;
      const bh = 34;
      let at = 0;
      for (const p of parts) {
        if (!p.bytes) continue;
        ctx.fillStyle = alpha(p.color, p.label === '채움' ? 0.35 : P.dark ? 0.7 : 0.8);
        ctx.fillRect(X(at), y, Math.max(1, X(at + p.bytes) - X(at)), bh);
        at += p.bytes;
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(X(0) + 0.5, y + 0.5, X(pk.outer) - X(0) - 1, bh - 1);
      // the link MTU
      const mx = X(LINK_MTU);
      ctx.strokeStyle = pk.fits ? P.ink2 : P.bad;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, y - 10);
      ctx.lineTo(mx, y + bh + 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pk.fits ? P.ink2 : P.bad;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`링크 MTU ${LINK_MTU}`, mx - 4, y - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.ink2;
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillText(`바깥 패킷 ${pk.outer}바이트`, X(0), y + bh + 8);
      if (!pk.fits) {
        ctx.fillStyle = P.bad;
        ctx.textAlign = 'right';
        ctx.fillText(`${pk.outer - LINK_MTU}바이트 넘침`, w - 8, y + bh + 8);
      }
    },
    [P, pk, v],
    { height: 96, minHeight: 80 },
  );

  return (
    <Figure
      no={3}
      title="VPN은 패킷을 한 번 더 포장한다"
      hint="터널 MTU와 원래 패킷 크기, 터널 방식을 바꿔 보세요"
      caption={
        <>
          카페 Wi-Fi에서 회사 VPN(WireGuard)에 접속한 노트북입니다. 원래 IP 패킷 전체를 암호화해 UDP 데이터그램에 싣고, 바깥에 VPN 서버로 가는 새 IP 헤더를 붙입니다. WireGuard는 원래 패킷을 16바이트 배수로 채워(터널 MTU는 넘지 않게) 길이를 조금 숨깁니다. 링크 MTU는 이더넷의 {LINK_MTU}바이트로 두었고, 터널 안의 TCP MSS는 원래 패킷도 옵션 없는 IPv4와 TCP라고 보고 계산했습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="바깥 IP"
          value={v}
          onChange={setV}
          options={[
            { value: 4 as const, label: 'IPv4' },
            { value: 6 as const, label: 'IPv6' },
          ]}
        />
        <Seg
          label="터널 MTU"
          value={mtu}
          onChange={(m) => {
            setMtu(m);
            setInner(Math.min(inner, m));
          }}
          options={[1500, 1440, 1420].map((m) => ({ value: m, label: m === 1420 ? '1420 (기본값)' : String(m) }))}
        />
        <Slider id="vpn-inner" label="원래 패킷 크기" value={size} min={60} max={mtu} step={20} onChange={setInner} format={(x) => `${x}바이트`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`원래 패킷 ${pk.inner}바이트가 바깥 패킷 ${pk.outer}바이트가 됨. 링크 MTU ${LINK_MTU}에 ${pk.fits ? '들어감' : '들어가지 않음'}`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={parts.map((p) => ({ color: p.label === '채움' ? 'var(--ink-3)' : p.label === 'UDP' ? 'var(--c-stats-1)' : p.label === 'WG 헤더' ? 'var(--c-stats-2)' : p.label.startsWith('바깥') ? 'var(--neg)' : p.label === '인증 태그' ? 'var(--pos)' : 'var(--good)', label: `${p.label} ${p.bytes}B`, shape: 'sq' as const }))} />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="고정으로 붙는 바이트" value={`${wgOverhead(v)}B`} />
        <Readout label="링크에 맞는 가장 큰 원래 패킷" value={`${maxInner(v)}B`} />
        <Readout label="터널 안 TCP MSS" value={`${mtu - 40}B`} />
        <Readout label="링크 MTU에" value={pk.fits ? '들어감' : '안 들어감'} color={pk.fits ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <Seg
        label="길 위(카페 Wi-Fi)에서 보이는 것"
        value={tunnel}
        onChange={setTunnel}
        options={[
          { value: 'none' as Tunnel, label: 'VPN 없음' },
          { value: 'full' as Tunnel, label: '전체 터널' },
          { value: 'split' as Tunnel, label: '분할 터널' },
        ]}
      />
      <div className="tbl-wrap">
        <table className="tbl vpn-seen">
          <thead>
            <tr>
              <th>노트북이 하는 일</th>
              <th>카페 Wi-Fi 운영자가 보는 것</th>
            </tr>
          </thead>
          <tbody>
            {DESTS.map((d) => {
              const r = seenBy(tunnel, d);
              return (
                <tr key={d.id} data-tun={r.tunneled || undefined}>
                  <td>
                    {d.name} <span className="mono fw-hdr">{d.addr}</span>
                  </td>
                  <td className="mono">{r.cafe}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FirewallVpn() {
  const initial = evaluate(RULES.filter((r) => INITIAL_ON[r.id]), PACKETS, 'deny', false);
  const initialWrong = initial.filter((v, i) => v.action !== PACKETS[i].want).length;
  return (
    <>
      <h2>경계에서 거르기</h2>
      <p>
        회사나 집의 네트워크는 대개 인터넷과 맞닿는 지점이 한두 곳뿐입니다. 그 경계에 서서 드나드는 패킷을 규칙으로 거르는 장치가 <T en="firewall">방화벽</T>입니다. 가장 단순한 방화벽은 패킷 헤더의 다섯 가지, 즉 프로토콜과 출발지·목적지의 IP 주소와 포트(<a href="#net-basics/tcp">5-튜플</a>)만 보고 허용할지 버릴지 정합니다. 규칙은 위에서부터 차례로 보고 <strong>처음 맞는 규칙</strong>을 따르며, 어느 규칙에도 맞지 않으면 <T en="default policy">기본 정책</T>을 따릅니다. 기본은 거의 언제나 "차단"이어야 합니다. 열어야 할 것만 적고 나머지는 모두 막는 편이, 막아야 할 것을 빠짐없이 떠올리는 것보다 훨씬 쉽기 때문입니다.
      </p>
      <p>
        아래 그림의 처음 설정은 일부러 흔한 실수를 담았습니다. 규칙과 순서를 고쳐 틀린 판정을 0으로 만들어 보세요.
      </p>
      <FirewallFigure />
      <p>처음 설정에서는 패킷 10개 중 {initialWrong}개를 잘못 판정합니다. 실수는 세 종류입니다.</p>
      <ul>
        <li>
          <strong>순서</strong>: 웹 서버로 가는 TCP를 모두 허용하는 넓은 규칙이 SSH를 막는 규칙보다 위에 있어, SSH 시도가 넓은 규칙에 먼저 걸려 통과합니다. 좁고 구체적인 규칙을 위에 두거나, 애초에 넓은 규칙 대신 "웹 서버 443만"처럼 필요한 것만 여는 규칙을 써야 합니다. 그러면 데이터베이스 포트(3306)를 두드리는 패킷도 함께 막힙니다.
        </li>
        <li>
          <strong>응답처럼 보이는 패킷</strong>: 상태 비저장 방화벽은 패킷 하나만 보고 판단하므로, "바깥 웹사이트의 응답"을 들이려면 "출발 포트가 443인 패킷은 허용" 같은 규칙을 둘 수밖에 없습니다. 그런데 출발 포트는 보내는 쪽이 마음대로 정합니다. 공격자가 출발 포트를 443으로 맞추기만 하면 PC의 원격 데스크톱(3389)까지 들어옵니다. 출발 포트 53을 허용한 DNS 규칙도 마찬가지입니다.
        </li>
        <li>
          <strong>상태를 기억하지 않음</strong>: <T en="stateful firewall">상태 기반 방화벽</T>은 안에서 허용한 연결을 연결 표에 적어 두었다가, 그 연결의 응답만 통과시킵니다. 상태 기반으로 바꾸고 출발 포트 규칙 두 개를 끄면, 진짜 응답은 연결 표로 통과하고 응답인 척한 패킷은 기본 정책에 막힙니다.
        </li>
      </ul>
      <p>
        상태 기반 방화벽은 TCP라면 SYN, SYN-ACK, FIN 같은 플래그를 보며 연결이 열리고 닫히는 것을 따라가고, 연결이라는 개념이 없는 UDP는 "이 주소와 포트로 최근에 보냈다"는 기록을 잠시 보관했다가 시간이 지나면 지웁니다. 리눅스의 netfilter(iptables, nftables)가 이 연결 추적을 하는 대표적인 예입니다.
      </p>

      <h2>NAT: 공인 주소 하나를 여럿이</h2>
      <p>
        <a href="#net-basics/ip-routing">IP 주소와 라우팅</a> 장에서 본 것처럼 IPv4 주소는 모자랍니다. 그래서 집과 회사의 기기들은 대개 사설 주소(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)를 쓰고, 경계의 공유기가 인터넷으로 나가는 패킷의 출발지를 자기의 공인 주소로 바꿔 씁니다. 이를 <T en="network address translation">NAT</T>라고 하고, 여러 기기가 주소 하나를 나눠 쓰도록 포트까지 바꾸는 방식을 특히 <T en="port address translation">PAT</T>라고 부릅니다. 공유기는 바꾼 짝을 <T en="translation table">변환 표</T>에 적어 두었다가 응답을 되돌려 줍니다.
      </p>
      <NatFigure />
      <p>
        노트북과 휴대폰이 우연히 같은 출발 포트 50001을 써도, 공유기가 바깥 포트를 40001과 40002로 다르게 골라 주므로 응답이 섞이지 않습니다. 눈여겨볼 것은 표에 없는 패킷의 운명입니다. 바깥에서 먼저 들어온 패킷은 안쪽의 누구에게 줘야 할지 모르니 버려집니다. 그래서 NAT 뒤의 기기는 바깥에서 먼저 연결해 올 수 없고, 집의 NAS를 밖에서 쓰려면 <T en="port forwarding">포트 포워딩</T>으로 "443번은 NAS로"라고 표에 미리 적어 두어야 합니다. 포워딩을 켜 보면 이제 NAS가 인터넷 전체에 열린다는 점도 보입니다.
      </p>
      <Callout kind="warn">
        NAT는 주소를 아끼려고 만든 장치이지 보안 장치가 아닙니다. 먼저 들어오는 연결을 버리는 것은 방화벽과 비슷한 부수 효과일 뿐이고, 필터링 방식이 느슨한 장비도 있으며(그림에서 "아무에게서나"), 안쪽 기기가 UPnP 같은 기능으로 스스로 포트 포워딩을 여는 경우도 있습니다. 주소가 넉넉한 IPv6에서는 NAT가 필요 없으므로, 공유기는 따로 "안에서 시작한 연결만 들인다"는 상태 기반 방화벽을 기본으로 켜 둡니다.
      </Callout>
      <p>
        필터링을 "아무에게서나"로 바꾸면, 휴대폰이 통화 서버로 보내며 연 매핑으로 통화 상대가 직접 패킷을 보낼 수 있게 됩니다. 영상 통화나 게임 같은 P2P 프로그램은 이 성질을 이용해, 서로 상대의 바깥 주소와 포트를 알아낸 뒤 동시에 패킷을 보내 NAT에 구멍을 뚫습니다(<T en="hole punching">홀 펀칭</T>). 그림의 통화 서버가 쓰는 3478번은 바깥 주소를 알려 주는 STUN 프로토콜의 포트입니다. 매핑은 영원하지 않아서, 한동안 패킷이 오가지 않으면 공유기가 지웁니다. 표준 권고(RFC 4787, RFC 5382)는 UDP 매핑을 적어도 2분, 연결이 맺어진 TCP는 2시간이 넘게 유지하라고 하지만, 실제 장비는 이보다 짧은 경우도 많아 프로그램들이 주기적으로 작은 패킷을 보내 매핑을 살려 둡니다.
      </p>

      <h2>VPN: 터널로 감싸기</h2>
      <p>
        <T en="virtual private network">VPN</T>은 공용 네트워크 위에 암호화된 <T en="tunnel">터널</T>을 뚫어, 멀리 있는 기기를 마치 회사 네트워크 안에 있는 것처럼 만듭니다. 원리는 <a href="#net-basics/layers">캡슐화</a>를 한 번 더 하는 것입니다. 노트북은 회사 위키(10.1.2.3)로 가는 원래 IP 패킷을 통째로 암호화해, VPN 서버로 가는 새 패킷 안에 싣습니다. VPN 서버는 바깥 포장을 벗기고 복호화한 원래 패킷을 회사 네트워크 안으로 내보냅니다.
      </p>
      <VpnFigure />
      <p>
        WireGuard의 데이터 패킷은 바깥 IPv4 헤더 {outerIpHeader(4)}바이트, UDP 헤더 {UDP_HEADER}바이트, WireGuard 헤더 {WG_HEADER}바이트(종류, 받는 쪽 번호, 카운터), 인증 태그 {WG_TAG}바이트를 더해 원래 패킷보다 {wgOverhead(4)}바이트 커집니다. 바깥이 IPv6이면 {wgOverhead(6)}바이트입니다. 그래서 원래 패킷이 {LINK_MTU}바이트면 바깥 패킷은 {wgPacket(LINK_MTU, 4, LINK_MTU).outer}바이트가 되어 이더넷에 들어가지 않습니다. 패킷이 쪼개지거나 버려지지 않게 하려면 터널 안쪽의 MTU를 낮춰야 하고, WireGuard 설정 도구가 흔히 쓰는 기본값 1420은 바깥이 IPv6인 경우({LINK_MTU} − {wgOverhead(6)})까지 감안한 값입니다. 터널 안의 TCP는 이에 맞춰 세그먼트를 최대 {1420 - 40}바이트로 줄입니다.
      </p>
      <p>
        VPN이 지켜 주는 것과 아닌 것도 분명히 해 둡시다. 카페 Wi-Fi 운영자는 이제 노트북이 VPN 서버와 이야기한다는 것과 패킷의 크기와 시각만 봅니다. 하지만 엿볼 수 있는 자리가 사라진 것이 아니라 VPN 서버로 옮겨 갔을 뿐이어서, VPN 서버를 운영하는 쪽(회사나 VPN 업체)은 카페 운영자가 보던 것을 그대로 봅니다. <strong>분할 터널</strong>은 회사 주소로 가는 패킷만 터널로 보내고 나머지는 바로 인터넷으로 내보내 회사 회선의 부담을 줄이는데, 그만큼 나머지 통신은 VPN의 보호를 받지 못합니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>방식</th>
              <th>어디서 감싸나</th>
              <th>특징</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>IPsec</td>
              <td>IP 계층 (ESP)</td>
              <td>오래된 표준으로 장비 사이(사이트 간) 연결에 널리 쓰임. 키 교환은 IKEv2. 선택지가 많아 설정이 복잡함</td>
            </tr>
            <tr>
              <td>WireGuard</td>
              <td>UDP 위</td>
              <td>암호 알고리즘을 하나로 고정해 코드가 작음. 2020년 리눅스 커널 5.6에 들어감</td>
            </tr>
            <tr>
              <td>TLS 기반 (OpenVPN 등)</td>
              <td>TLS(대개 UDP 또는 TCP 443)</td>
              <td>HTTPS와 비슷해 보여 막힌 네트워크도 잘 통과함. 사용자 공간에서 돌아 느린 편</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>경계가 사라질 때: 제로 트러스트</h2>
      <p>
        방화벽과 VPN은 "경계 안은 믿고, 밖은 믿지 않는다"는 <T en="perimeter model">경계 모델</T>에 기대고 있습니다. 성 둘레에 해자를 판 셈입니다. 문제는 이 모델이 경계가 하나일 때만 통한다는 점입니다. 직원은 집과 카페에서 일하고, 서비스는 여러 클라우드에 흩어져 있습니다. 더 나쁜 것은, 피싱 메일 하나로 안쪽 PC 한 대가 감염되면 공격자가 "경계 안"의 신뢰를 그대로 물려받아 다른 서버로 옆걸음질(<T en="lateral movement">측면 이동</T>)할 수 있다는 것입니다.
      </p>
      <p>
        <T en="zero trust">제로 트러스트</T>는 네트워크 위치를 신뢰의 근거로 삼지 않습니다. 회사 안에서 온 요청이든 밖에서 온 요청이든, 요청마다 누가(사용자 인증), 어떤 기기로(기기 상태), 무엇에(최소 권한) 접근하려는지 확인합니다. 구글이 2014년부터 BeyondCorp라는 이름으로 사내 시스템을 VPN 없이 이렇게 운영한 사례를 공개했고, 미국 NIST는 2020년 SP 800-207로 이 구조를 정리했습니다. 실제로는 각 서비스 앞에 사용자를 확인하는 <T en="identity-aware proxy">신원 인식 프록시</T>를 두거나, 서비스끼리도 서로 인증서를 내미는 상호 TLS로 통신하게 하는 식입니다. 방화벽이 사라지는 것은 아닙니다. 경계는 여전히 첫 번째 방어선이지만, 마지막 방어선이어서는 안 된다는 뜻입니다.
      </p>

      <Callout kind="key">
        방화벽은 규칙을 위에서부터 보고 처음 맞는 것을 따르므로 좁은 규칙을 위에, 기본 정책은 차단으로 둡니다. 상태 비저장 방화벽은 응답을 들이려면 위조하기 쉬운 출발 포트를 믿어야 하지만, 상태 기반 방화벽은 연결 표로 진짜 응답만 들입니다. NAT는 나가는 패킷의 주소와 포트를 바꾸고 그 짝을 표에 적어 응답을 되돌리며, 표에 없는 들어오는 패킷은 버립니다. 이는 보안 기능이 아니라 부수 효과입니다. VPN은 원래 패킷을 암호화해 한 번 더 감싸므로 헤더만큼 MTU가 줄고(WireGuard는 IPv4 기준 {wgOverhead(4)}바이트), 엿볼 수 있는 자리를 VPN 서버로 옮깁니다. 제로 트러스트는 위치 대신 요청마다 사용자와 기기를 확인합니다.
      </Callout>
      <Quiz
        q={'상태 비저장 방화벽에 "들어오는 TCP 중 출발 포트가 80 또는 443인 패킷은 허용"이라는 규칙이 있다. 직원들이 웹을 쓰려면 이 규칙이 필요하다고 한다. 가장 정확한 평가는?'}
        options={[
          '안전하다. 출발 포트 80과 443은 웹 서버만 쓰는 포트이므로 공격자는 이 포트로 보낼 수 없다',
          '위험하다. 출발 포트는 보내는 쪽이 정하므로 공격자가 출발 포트를 443으로 맞추면 안쪽의 어느 포트로든 연결을 시도할 수 있다. 상태 기반 방화벽으로 바꿔 안에서 시작한 연결의 응답만 들여야 한다',
          '위험하지만 NAT 뒤에 있다면 상관없다. NAT가 보안을 보장하므로 방화벽 규칙은 무엇이든 괜찮다',
          '안전하다. TCP는 3-way 핸드셰이크를 하므로 응답이 아닌 패킷은 방화벽에 닿기 전에 자동으로 버려진다',
        ]}
        answer={1}
        explain={
          <>
            출발 포트는 패킷을 만드는 쪽이 아무 값이나 적을 수 있는 필드입니다. 그림 1의 6번 패킷처럼 출발 포트를 443으로 맞추면 이 규칙을 그대로 통과합니다. 상태 기반 방화벽은 안에서 나간 연결을 기억했다가 그 연결의 응답만 들이므로 이런 규칙이 필요 없습니다. 핸드셰이크는 양 끝의 운영체제가 하는 일이라 방화벽을 대신해 주지 않고, NAT의 필터링은 장비마다 다르며 포트 포워딩이나 UPnP로 쉽게 열립니다.
          </>
        }
      />
    </>
  );
}


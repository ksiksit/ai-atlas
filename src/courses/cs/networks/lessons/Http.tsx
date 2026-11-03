import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { DH_G, DH_P, FLIGHTS, HOL_PACKETS, HOL_RES, HOL_RTT, HTTP_EXAMPLES, PROTOS, PROTO_NAMES, discreteLog, modPow, roundTrips, simulateHol, ttfb, type HolProto, type HttpLine, type Phase, type Proto } from './web';
import './web.css';

/* ─────────────── Figure 1: what a request and a response look like ─────────────── */

const ROLE_NAME = { start: '시작 줄', header: '헤더', blank: '빈 줄', body: '본문' };
const utf8Len = (s: string) => new TextEncoder().encode(s).length;
/** Bytes on the wire: every line before the body ends in CRLF; the body is sent as is. */
function wireBytes(lines: HttpLine[]): number {
  const head = lines.filter((l) => l.role !== 'body').reduce((n, l) => n + utf8Len(l.text) + 2, 0);
  const body = lines.filter((l) => l.role === 'body').map((l) => l.text);
  return head + (body.length ? utf8Len(body.join('\n')) : 0);
}

function RawMessage({ title, sub, lines }: { title: string; sub: string; lines: HttpLine[] }) {
  return (
    <div className="http-msg">
      <div className="http-msg-head">
        <strong>{title}</strong>
        <span>
          {sub} · <span className="mono">{wireBytes(lines).toLocaleString('ko-KR')}</span>바이트
        </span>
      </div>
      <pre className="http-lines">
        {lines.map((l, i) => {
          if (l.role === 'blank')
            return (
              <span key={i} className="http-line" data-r="blank">
                (빈 줄: 헤더가 끝남)
              </span>
            );
          if (l.role === 'header') {
            const c = l.text.indexOf(':');
            return (
              <span key={i} className="http-line" data-r="header">
                <span className="k">{l.text.slice(0, c + 1)}</span>
                {l.text.slice(c + 1)}
              </span>
            );
          }
          return (
            <span key={i} className="http-line" data-r={l.role}>
              {l.text || ' '}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function AnatomyFigure() {
  const [id, setId] = useState(HTTP_EXAMPLES[0].id);
  const ex = HTTP_EXAMPLES.find((e) => e.id === id)!;
  const status = ex.response[0].text.split(' ').slice(1).join(' ');
  return (
    <Figure
      no={1}
      title="요청과 응답 뜯어 보기"
      hint="예시를 바꿔 보세요"
      caption={<>HTTP/1.1 메시지는 사람이 읽을 수 있는 글자입니다. 첫 줄(시작 줄)이 무엇을 하려는지, 그 아래 "이름: 값" 줄들(헤더)이 부가 정보를 말하고, 빈 줄 하나가 헤더의 끝을 알립니다. 본문의 길이는 Content-Length 헤더가 바이트 단위로 알려 줍니다. 줄은 실제로 CR LF 두 글자로 끝나고, 바이트 수는 그것까지 센 값입니다. 날짜와 값은 예시입니다.</>}
    >
      <div className="controls row">
        <Seg label="예시" value={id} onChange={setId} options={HTTP_EXAMPLES.map((e) => ({ value: e.id, label: e.label }))} />
      </div>
      <div className="http-pair">
        <RawMessage title="요청" sub="브라우저 → 서버" lines={ex.request} />
        <RawMessage title="응답" sub={status} lines={ex.response} />
      </div>
      <div className="http-note" aria-live="polite">
        {ex.note}
      </div>
      <Legend
        items={[
          { color: 'var(--c-cs-3)', label: ROLE_NAME.start, shape: 'sq' },
          { color: 'var(--c-cs-2)', label: ROLE_NAME.header, shape: 'sq' },
          { color: 'var(--line-strong)', label: ROLE_NAME.blank, shape: 'sq' },
          { color: 'var(--c-cs-1)', label: ROLE_NAME.body, shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: Diffie–Hellman with small numbers ─────────────── */

function DhFigure() {
  const P = usePalette();
  const [a, setA] = useState(345);
  const [b, setB] = useState(1210);
  const [cracked, setCracked] = useState<{ x: number; tries: number } | null>(null);
  const A = modPow(DH_G, a, DH_P);
  const B = modPow(DH_G, b, DH_P);
  const sA = modPow(B, a, DH_P);
  const sB = modPow(A, b, DH_P);
  const pts = useMemo(() => {
    const out: number[] = [];
    let v = 1;
    for (let k = 1; k < DH_P; k++) out.push((v = (v * DH_G) % DH_P));
    return out;
  }, []);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 40, r: 10, t: 22, b: 24 };
      const X = (k: number) => pad.l + (k / DH_P) * (w - pad.l - pad.r);
      const Y = (v: number) => h - pad.b - (v / DH_P) * (h - pad.t - pad.b);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, w - pad.l - pad.r - 1, h - pad.t - pad.b - 1);
      ctx.fillStyle = alpha(P.ink, P.dark ? 0.45 : 0.3);
      pts.forEach((v, i) => ctx.fillRect(X(i + 1) - 0.8, Y(v) - 0.8, 1.6, 1.6));
      const mark = (k: number, v: number, col: string, name: string) => {
        ctx.strokeStyle = alpha(col, 0.7);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(X(k), h - pad.b);
        ctx.lineTo(X(k), Y(v));
        ctx.lineTo(pad.l, Y(v));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(X(k), Y(v), 5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `700 11px ${P.fontMono}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = X(k) > w - 90 ? 'right' : 'left';
        ctx.fillStyle = col;
        ctx.fillText(name, X(k) + (X(k) > w - 90 ? -9 : 9), Y(v) - 9);
      };
      mark(a, A, P.pos, `a=${a} → A=${A}`);
      mark(b, B, P.neg, `b=${b} → B=${B}`);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', pad.l - 5, Y(0));
      ctx.fillText(String(DH_P), pad.l - 5, Y(DH_P));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('1', X(1), h - pad.b + 5);
      ctx.fillText(String(DH_P - 1), X(DH_P - 1) - 10, h - pad.b + 5);
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink2;
      ctx.fillText(`가로: 지수 k · 세로: ${DH_G}^k mod ${DH_P}`, pad.l, 4);
    },
    [P, a, b, A, B, pts],
    { aspect: 2.3, maxHeight: 260, minHeight: 190 },
  );

  const setPriv = (f: (v: number) => void) => (v: number) => {
    f(v);
    setCracked(null);
  };
  return (
    <Figure
      no={2}
      title="공개된 길에서 비밀 열쇠 만들기"
      hint="두 사람의 비밀 수를 바꿔 보세요"
      caption={<>소수 p = {DH_P}와 g = {DH_G}는 모두에게 공개된 값입니다. 클라이언트는 비밀 수 a를, 서버는 비밀 수 b를 혼자 고르고, 각자 <M>{'g^a \\bmod p'}</M>와 <M>{'g^b \\bmod p'}</M>만 상대에게 보냅니다. 위 그림은 k = 1부터 {DH_P - 1}까지 <M>{`${DH_G}^k \\bmod ${DH_P}`}</M>을 찍은 것으로, 규칙 없이 흩어져 있어서 세로값(공개된 A)만 보고 가로값(비밀 a)을 거꾸로 읽어 낼 지름길이 보이지 않습니다. 이 그림의 p는 손으로 확인할 수 있을 만큼 작아서 모든 k를 대입해 보면 금방 풀립니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${DH_G}의 거듭제곱을 ${DH_P}로 나눈 나머지 분포. a=${a}일 때 A=${A}, b=${b}일 때 B=${B}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="dh-a" label="클라이언트의 비밀 a" value={a} min={2} max={DH_P - 2} step={1} onChange={setPriv(setA)} color="var(--pos)" />
        <Slider id="dh-b" label="서버의 비밀 b" value={b} min={2} max={DH_P - 2} step={1} onChange={setPriv(setB)} color="var(--neg)" />
      </div>
      <div className="dh-cols">
        <div className="dh-col">
          <h4>클라이언트</h4>
          <div className="dh-row" data-secret>
            <span>비밀 a</span>
            <span className="mono">{a}</span>
          </div>
          <div className="dh-row">
            <span>보내는 값 A = gᵃ mod p</span>
            <span className="mono">{A}</span>
          </div>
          <div className="dh-row" data-shared>
            <span>Bᵃ mod p</span>
            <span className="mono">{sA}</span>
          </div>
        </div>
        <div className="dh-col" data-who="eve">
          <h4>엿듣는 사람</h4>
          <div className="dh-row">
            <span>p, g</span>
            <span className="mono">
              {DH_P}, {DH_G}
            </span>
          </div>
          <div className="dh-row">
            <span>A, B</span>
            <span className="mono">
              {A}, {B}
            </span>
          </div>
          <div className="dh-row">
            <span>비밀 열쇠</span>
            <span className="mono">{cracked ? modPow(B, cracked.x, DH_P) : '?'}</span>
          </div>
          <Button small onClick={() => setCracked(discreteLog(A))} disabled={!!cracked}>
            a를 하나씩 대입해 찾기
          </Button>
          {cracked && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-2)' }}>
              {cracked.tries.toLocaleString('ko-KR')}번 만에 a = {cracked.x}를 찾았습니다. 작은 p에서는 많아야 {(DH_P - 2).toLocaleString('ko-KR')}번이면 됩니다.
            </div>
          )}
        </div>
        <div className="dh-col">
          <h4>서버</h4>
          <div className="dh-row" data-secret="b">
            <span>비밀 b</span>
            <span className="mono">{b}</span>
          </div>
          <div className="dh-row">
            <span>보내는 값 B = gᵇ mod p</span>
            <span className="mono">{B}</span>
          </div>
          <div className="dh-row" data-shared>
            <span>Aᵇ mod p</span>
            <span className="mono">{sB}</span>
          </div>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Readout label="두 사람의 비밀 열쇠" value={sA === sB ? `${sA} (같음)` : `${sA} ≠ ${sB}`} color="var(--pos)" />
        <Readout label="길 위로 보낸 값" value={`A=${A}, B=${B}`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: round trips before the first byte ─────────────── */

const PHASE_CSS: Record<Phase | 'dns', string> = { dns: 'var(--ink-3)', tcp: 'var(--c-math)', tls: 'var(--c-stats-2)', quic: 'var(--c-stats-1)', http: 'var(--pos)' };
const phaseColor = (P: Palette, ph: Phase | 'dns') => ({ dns: P.ink3, tcp: P.math, tls: P.stats2, quic: P.stats1, http: P.pos })[ph];
const PHASE_NAME: Record<Phase | 'dns', string> = { dns: 'DNS', tcp: 'TCP 연결', tls: 'TLS 핸드셰이크', quic: 'QUIC 핸드셰이크(연결 + TLS)', http: '요청 → 첫 응답' };
const PROTO_SHORT: Record<Proto, string> = { http: 'HTTP', tls12: 'TLS 1.2', tls13: 'TLS 1.3', quic: 'QUIC', quic0: '0-RTT' };

/** A protocol's time split into DNS and phases, in ms. */
function segments(p: Proto, rtt: number, dns: number): { ph: Phase | 'dns'; ms: number }[] {
  const out: { ph: Phase | 'dns'; ms: number }[] = dns > 0 ? [{ ph: 'dns', ms: dns }] : [];
  for (const f of FLIGHTS[p]) {
    const last = out[out.length - 1];
    if (last && last.ph === f.phase) last.ms += rtt / 2;
    else out.push({ ph: f.phase, ms: rtt / 2 });
  }
  return out;
}

function WaterfallFigure() {
  const P = usePalette();
  const [proto, setProto] = useState<Proto>('tls13');
  const [rtt, setRtt] = useState(100);
  const [dns, setDns] = useState(40);
  const maxT = Math.max(...PROTOS.map((p) => ttfb(p, rtt, dns)));
  const flights = FLIGHTS[proto];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const top = 34;
      const bottom = 16;
      const cx = Math.max(64, w * 0.2);
      const sx = w - Math.max(40, w * 0.14);
      const Y = (ms: number) => top + (ms / maxT) * (h - top - bottom);
      // ms ticks
      const step = maxT > 1200 ? 400 : maxT > 600 ? 200 : maxT > 240 ? 100 : 50;
      ctx.font = `10.5px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let t = 0; t <= maxT + 1e-6; t += step) {
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 6, Math.round(Y(t)) + 0.5);
        ctx.lineTo(sx, Math.round(Y(t)) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.fillText(`${t}ms`, cx - 22, Y(t));
      }
      // the two endpoints
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink;
      ctx.fillText('브라우저', cx, 14);
      ctx.fillText('서버', sx, 14);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      for (const x of [cx, sx]) {
        ctx.beginPath();
        ctx.moveTo(x, top - 6);
        ctx.lineTo(x, h - bottom + 6);
        ctx.stroke();
      }
      // DNS happens before anything is sent to the server
      if (dns > 0) {
        ctx.fillStyle = alpha(P.ink3, 0.25);
        ctx.fillRect(cx - 12, Y(0), 12, Y(dns) - Y(0));
        ctx.save();
        ctx.translate(cx - 6, (Y(0) + Y(dns)) / 2);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 10px ${P.fontBody}`;
        if (Y(dns) - Y(0) > 26) {
          ctx.rotate(-Math.PI / 2);
          ctx.fillText('DNS', 0, 0);
        }
        ctx.restore();
      }
      flights.forEach((f, i) => {
        const t0 = dns + (i * rtt) / 2;
        const t1 = t0 + rtt / 2;
        const col = phaseColor(P, f.phase);
        const [x0, x1] = f.dir === 'c2s' ? [cx, sx] : [sx, cx];
        drawArrow(ctx, x0, Y(t0), x1, Y(t1), col, 2, 8);
        const mx = (cx + sx) / 2;
        const my = (Y(t0) + Y(t1)) / 2;
        ctx.font = `600 10.5px ${P.fontBody}`;
        const text = f.label;
        const tw = Math.min(ctx.measureText(text).width, sx - cx - 16);
        ctx.fillStyle = alpha(P.surface, 0.92);
        ctx.fillRect(mx - tw / 2 - 3, my - 8, tw + 6, 16);
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, mx, my + 0.5, sx - cx - 16);
      });
      // first byte
      const T = ttfb(proto, rtt, dns);
      ctx.fillStyle = P.hl;
      ctx.beginPath();
      ctx.arc(cx, Y(T), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = `700 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`첫 바이트 ${Math.round(T)}ms`, cx + 10, Math.min(Y(T) + 12, h - 6));
    },
    [P, proto, rtt, dns, maxT, flights],
    { height: 360 },
  );

  const T = ttfb(proto, rtt, dns);
  return (
    <Figure
      no={3}
      title="첫 바이트까지 몇 번 왕복하나"
      hint="프로토콜과 왕복 시간을 바꿔 보세요"
      caption={<>처음 방문하는 사이트에서 주소창에 URL을 입력한 뒤 응답의 첫 바이트가 도착하기까지를 그렸습니다. 대각선 화살표 하나가 한쪽으로 가는 데 걸리는 시간, 즉 왕복 시간(RTT)의 절반입니다. 같은 시각에 보내는 메시지는 하나로 묶었고, 서버가 처리하는 시간과 대역폭에 따른 전송 시간은 0으로 두었습니다. DNS 시간을 0으로 하면 주소가 이미 캐시에 있는 경우입니다. 0-RTT는 전에 접속한 적이 있어 세션 정보를 기억하는 경우에만 쓸 수 있습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${PROTO_NAMES[proto]}: 왕복 ${roundTrips(proto)}번, 첫 바이트까지 ${Math.round(T)}ms`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="프로토콜" value={proto} onChange={setProto} options={PROTOS.map((p) => ({ value: p, label: PROTO_SHORT[p] }))} />
          <Slider id="wf-rtt" label="왕복 시간 (RTT)" value={rtt} min={10} max={300} step={10} onChange={setRtt} format={(v) => `${v}ms`} />
          <Slider id="wf-dns" label="DNS 조회 시간" value={dns} min={0} max={200} step={10} onChange={setDns} format={(v) => (v ? `${v}ms` : '캐시됨')} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="첫 바이트까지" value={`${Math.round(T)}ms`} color="var(--pos)" />
            <Readout label="서버와의 왕복" value={`${roundTrips(proto)}번`} />
            <Readout label="TLS 1.2보다" value={proto === 'tls12' ? '—' : `${Math.round(ttfb('tls12', rtt, dns) - T)}ms 빠름`} />
            <Readout label="암호화 없는 HTTP보다" value={T > ttfb('http', rtt, dns) ? `${Math.round(T - ttfb('http', rtt, dns))}ms 느림` : T < ttfb('http', rtt, dns) ? `${Math.round(ttfb('http', rtt, dns) - T)}ms 빠름` : '같음'} />
          </div>
        </div>
      </div>
      <div className="wf-rows" role="group" aria-label="프로토콜별 첫 바이트까지의 시간">
        {PROTOS.map((p) => (
          <button key={p} type="button" className="wf-row" aria-pressed={p === proto} onClick={() => setProto(p)}>
            <span>{PROTO_NAMES[p]}</span>
            <span className="wf-track">
              {segments(p, rtt, dns).map((sg, i) => (
                <span key={i} style={{ width: `${(sg.ms / maxT) * 100}%`, background: PHASE_CSS[sg.ph] }} title={`${PHASE_NAME[sg.ph]} ${Math.round(sg.ms)}ms`} />
              ))}
            </span>
            <span className="wf-ms">{Math.round(ttfb(p, rtt, dns))}ms</span>
          </button>
        ))}
      </div>
      <Legend items={(['dns', 'tcp', 'tls', 'quic', 'http'] as const).map((ph) => ({ color: PHASE_CSS[ph], label: PHASE_NAME[ph], shape: 'sq' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 4: head-of-line blocking under packet loss ─────────────── */

const HOL_ORDER: HolProto[] = ['h1', 'h2', 'h3'];
const HOL_NAME: Record<HolProto, string> = { h1: 'HTTP/1.1 · TCP 연결 6개', h2: 'HTTP/2 · TCP 연결 1개', h3: 'HTTP/3 · QUIC 연결 1개' };
const HOL_SHORT: Record<HolProto, string> = { h1: 'HTTP/1.1', h2: 'HTTP/2', h3: 'HTTP/3' };
const holColor = (P: Palette, p: HolProto) => ({ h1: P.math, h2: P.stats2, h3: P.stats1 })[p];
const HOL_CSS: Record<HolProto, string> = { h1: 'var(--c-math)', h2: 'var(--c-stats-2)', h3: 'var(--c-stats-1)' };
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function HolFigure() {
  const P = usePalette();
  const [loss, setLoss] = useState(2);
  const [seed, setSeed] = useState(1);
  const res = useMemo(() => Object.fromEntries(HOL_ORDER.map((p) => [p, simulateHol(p, loss / 100, seed)])) as Record<HolProto, ReturnType<typeof simulateHol>>, [loss, seed]);
  const tMax = Math.ceil(Math.max(...HOL_ORDER.map((p) => res[p].page)) / 100) * 100 + 50;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 12;
      const padR = 12;
      const head = 18;
      const axis = 20;
      const panelH = (h - axis) / 3;
      const X = (t: number) => padL + (t / tMax) * (w - padL - padR);
      HOL_ORDER.forEach((p, k) => {
        const r = res[p];
        const y0 = k * panelH;
        const col = holColor(P, p);
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(HOL_NAME[p], padL, y0 + head / 2 + 2);
        const rowTop = y0 + head + 4;
        const rowH = (panelH - head - 12) / HOL_RES;
        ctx.fillStyle = P.surface2;
        ctx.fillRect(X(0), rowTop - 2, X(tMax) - X(0), rowH * HOL_RES + 4);
        // lost packets
        for (const t of r.losses) {
          ctx.strokeStyle = alpha(P.bad, 0.85);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(X(t), rowTop - 2);
          ctx.lineTo(X(t), rowTop + rowH * HOL_RES + 2);
          ctx.stroke();
        }
        for (let i = 0; i < HOL_RES; i++) {
          const y = rowTop + i * rowH;
          ctx.fillStyle = alpha(col, 0.85);
          ctx.fillRect(X(r.first[i]), y + rowH * 0.15, Math.max(2, X(r.done[i]) - X(r.first[i])), Math.max(1.5, rowH * 0.7));
        }
        // page done
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(X(r.page), rowTop - 4);
        ctx.lineTo(X(r.page), rowTop + rowH * HOL_RES + 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = X(r.page) > w - 70 ? 'right' : 'left';
        ctx.fillStyle = P.ink;
        ctx.fillText(`${r.page}ms`, X(r.page) + (X(r.page) > w - 70 ? -4 : 4), y0 + head / 2 + 2);
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `10.5px ${P.fontMono}`;
      ctx.textBaseline = 'top';
      const step = tMax > 800 ? 200 : 100;
      for (let t = 0; t <= tMax; t += step) {
        ctx.textAlign = t === 0 ? 'left' : 'center';
        ctx.fillText(`${t}ms`, X(t), h - axis + 4);
      }
    },
    [P, res, tMax],
    { height: 390 },
  );

  return (
    <Figure
      no={4}
      title="패킷 하나를 잃으면 누가 기다리나"
      hint="손실률을 올리고 손실 패턴을 바꿔 보세요"
      caption={<>리소스 {HOL_RES}개(패킷 {HOL_PACKETS}개, 리소스마다 2~12개)로 된 페이지를 RTT {HOL_RTT}ms인 망에서 받습니다. 가로줄 하나가 리소스 하나이고, 막대는 첫 패킷이 도착한 때부터 브라우저가 그 리소스를 다 쓸 수 있게 된 때까지입니다. 빨간 세로선은 사라진 패킷을 보낸 순간, 점선은 페이지가 다 받아진 순간입니다. 서버는 모든 연결을 합쳐 1ms에 패킷 하나를 보내고, 사라진 패킷은 1 RTT 뒤에 알아채 맨 먼저 다시 보냅니다. HTTP/2와 HTTP/3는 똑같은 패킷을 똑같은 순간에 보내고 잃도록 맞췄습니다. 연결을 맺는 시간과 혼잡 제어는 뺐습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`손실률 ${loss}%: HTTP/1.1 ${res.h1.page}ms, HTTP/2 ${res.h2.page}ms, HTTP/3 ${res.h3.page}ms에 페이지 완료`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="hol-loss" label="패킷 손실률" value={loss} min={0} max={10} step={1} onChange={setLoss} format={(v) => `${v}%`} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 손실 패턴
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {HOL_ORDER.map((p) => (
              <Readout key={p} label={`${HOL_SHORT[p]} 리소스 평균`} value={`${Math.round(avg(res[p].done))}ms`} color={HOL_CSS[p]} />
            ))}
            <Readout label="사라진 패킷 (HTTP/2·3)" value={`${res.h2.losses.length}개`} color="var(--bad)" />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>리소스 평균은 리소스마다 다 쓸 수 있게 된 시각의 평균입니다. 페이지 완료 시각은 그림의 점선 옆 숫자입니다.</div>
        </div>
      </div>
      <Legend items={[...HOL_ORDER.map((p) => ({ color: HOL_CSS[p], label: HOL_NAME[p], shape: 'sq' as const })), { color: 'var(--bad)', label: '사라진 패킷', shape: 'ln' as const }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Http() {
  return (
    <>
      <h2>요청 하나, 응답 하나</h2>
      <p>
        <a href="#cs-networks/dns">DNS</a>로 서버의 주소를 알아낸 브라우저는 그 주소로 연결을 열고 <T en="HyperText Transfer Protocol">HTTP</T> 요청을 보냅니다. HTTP의 모양은 단순합니다. 클라이언트가 <T en="request">요청</T>을 보내면 서버가 <T en="response">응답</T>을 하나 돌려줍니다. 웹 페이지 하나를 띄울 때는 이 주고받기가 HTML, 스타일시트, 스크립트, 이미지마다 되풀이되어 수십에서 수백 번 일어납니다.
      </p>
      <AnatomyFigure />
      <p>
        요청의 시작 줄은 <T en="method">메서드</T>, 경로, 버전 세 부분입니다. Host 헤더는 HTTP/1.1부터 반드시 넣어야 하는데, IP 주소 하나에 여러 사이트가 함께 사는 일이 흔해서 어느 사이트를 원하는지 밝혀야 하기 때문입니다. 응답의 시작 줄은 버전, 세 자리 <T en="status code">상태 코드</T>, 사람이 읽을 짧은 설명입니다. 프로그램은 설명이 아니라 숫자를 봅니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>메서드</th>
              <th>뜻</th>
              <th>상태 코드</th>
              <th>뜻</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">GET</td>
              <td>자원을 가져온다. 서버의 상태를 바꾸지 않아야 한다</td>
              <td className="mono">1xx</td>
              <td>정보. 아직 진행 중</td>
            </tr>
            <tr>
              <td className="mono">POST</td>
              <td>데이터를 보내 처리를 맡긴다 (폼 제출, 주문)</td>
              <td className="mono">2xx</td>
              <td>성공. 200 OK, 201 Created</td>
            </tr>
            <tr>
              <td className="mono">PUT</td>
              <td>이 경로의 자원을 통째로 이것으로 바꾼다</td>
              <td className="mono">3xx</td>
              <td>다른 곳을 보라. 301, 303 리다이렉트, 304 바뀌지 않음</td>
            </tr>
            <tr>
              <td className="mono">DELETE</td>
              <td>이 경로의 자원을 지운다</td>
              <td className="mono">4xx</td>
              <td>요청 쪽 문제. 400, 401, 403, 404</td>
            </tr>
            <tr>
              <td className="mono">HEAD</td>
              <td>GET과 같되 헤더만 받는다</td>
              <td className="mono">5xx</td>
              <td>서버 쪽 문제. 500, 502, 503</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        HTTP는 <T en="stateless">상태가 없는</T> 프로토콜입니다. 서버는 요청 하나하나를 따로 처리하고, 방금 그 사람이 로그인했다는 사실을 HTTP 차원에서는 기억하지 않습니다. 그래서 서버가 응답의 Set-Cookie 헤더로 작은 값(보통 세션 번호)을 건네면, 브라우저는 그 뒤 같은 사이트로 가는 요청마다 Cookie 헤더에 그 값을 실어 보냅니다. 서버는 세션 번호를 보고 누구인지 알아봅니다. 쿠키를 훔치면 로그인한 사람 행세를 할 수 있으므로, Secure(HTTPS로만 보내기)와 HttpOnly(페이지의 스크립트가 읽지 못하게 하기) 같은 속성을 붙입니다.
      </p>

      <h2>평문의 문제와 HTTPS</h2>
      <p>
        HTTP 메시지는 글자 그대로 전선을 지나갑니다. 카페의 공유기, 인터넷 회사, 그 사이의 라우터 어디에서든 그림 1의 POST 본문에 있는 비밀번호를 읽을 수 있고, 응답을 슬쩍 바꿔 광고나 악성 스크립트를 끼워 넣을 수도 있습니다. <T en="HTTP Secure">HTTPS</T>는 HTTP 메시지를 <T en="Transport Layer Security">TLS</T>로 감싸서 보내는 것입니다. HTTP 자체는 바뀌지 않고, 그 아래에 세 가지 보장이 추가됩니다.
      </p>
      <ul>
        <li>
          <strong>기밀성</strong>: 오가는 내용을 중간에서 읽을 수 없다.
        </li>
        <li>
          <strong>무결성</strong>: 중간에서 한 바이트라도 바꾸면 받는 쪽이 알아챈다.
        </li>
        <li>
          <strong>인증</strong>: 지금 대화하는 상대가 정말 www.example.com의 주인이다.
        </li>
      </ul>
      <p>
        내용을 빠르게 암호화하려면 양쪽이 같은 비밀 열쇠를 가져야 합니다(<T en="symmetric encryption">대칭 암호</T>, 예를 들어 AES). 문제는 처음 만난 두 컴퓨터가, 모두가 엿볼 수 있는 길 위에서 어떻게 같은 열쇠를 갖게 되느냐입니다. 열쇠를 그대로 보내면 엿보는 사람도 갖게 됩니다.
      </p>

      <h2>엿보는 길 위에서 비밀을 나누기</h2>
      <p>
        1976년 디피(Whitfield Diffie)와 헬먼(Martin Hellman)이 발표한 <T en="Diffie–Hellman key exchange">디피–헬먼 키 교환</T>은 이 문제를 풉니다. 열쇠 자체를 보내지 않고, 각자 비밀 수를 하나씩 골라 그 비밀로 만든 <strong>공개해도 되는 값</strong>만 교환합니다. 그런데도 양쪽은 같은 수에 도달합니다.
      </p>
      <DhFigure />
      <p>
        클라이언트는 받은 B를 자기 비밀 a번 거듭제곱하고, 서버는 받은 A를 자기 비밀 b번 거듭제곱합니다. <M>{'B^a = (g^b)^a = g^{ab} = (g^a)^b = A^b'}</M>이므로 둘은 언제나 같은 값 <M>{'g^{ab} \\bmod p'}</M>를 얻습니다. 엿듣는 사람은 p, g, A, B를 모두 알지만, 이 값을 계산하려면 a나 b가 필요합니다. A에서 a를 구하는 문제를 <T en="discrete logarithm">이산 로그</T> 문제라고 하는데, 그림처럼 결과가 뒤죽박죽 흩어져서 p가 크면 알려진 빠른 방법이 없습니다.
      </p>
      <p>
        그림의 p = {DH_P}는 컴퓨터가 눈 깜짝할 사이에 모두 대입해 보는 크기입니다. 실제로는 2,048비트 이상의 소수를 쓰거나, 오늘날 TLS가 주로 쓰는 것처럼 같은 원리를 <T en="elliptic curve">타원 곡선</T> 위에서 계산하는 ECDHE(예: X25519)를 씁니다. 이때 알려진 가장 좋은 공격에도 대략 <M>{'2^{128}'}</M>번 규모의 연산이 필요해서, 지금의 컴퓨터로는 현실적인 시간 안에 풀 수 없다고 평가됩니다. 접속할 때마다 새 비밀 수를 고르므로, 나중에 서버의 열쇠가 털려도 지난 대화는 풀 수 없다는 장점도 있습니다(<T en="forward secrecy">전방 비밀성</T>).
      </p>
      <Callout kind="warn">
        디피–헬먼만으로는 <strong>누구와</strong> 열쇠를 나눴는지 모릅니다. 중간에 끼어든 공격자가 클라이언트와는 자기 a′로, 서버와는 자기 b′로 따로 열쇠를 나누면 양쪽은 눈치채지 못한 채 공격자를 거쳐 대화합니다(<T en="man-in-the-middle">중간자 공격</T>). 그래서 TLS에서 서버는 <T en="certificate">인증서</T>를 보내고, 핸드셰이크 내용에 자기 개인 키로 서명합니다. 인증서는 "이 공개 키의 주인은 www.example.com"이라는 내용에 <T en="certificate authority">인증 기관</T>(CA)이 서명한 것이고, 브라우저와 운영체제는 믿을 만한 CA의 목록을 미리 갖고 있습니다.
      </Callout>

      <h2>첫 바이트까지의 왕복</h2>
      <p>
        HTTPS로 처음 접속하는 데는 시간이 듭니다. 먼저 TCP 연결을 맺는 <a href="#cs-networks/tcp">3-way 핸드셰이크</a>에 1 RTT, 그다음 TLS 핸드셰이크로 열쇠를 나누고 인증서를 확인하는 데 TLS 1.2는 2 RTT가 걸립니다. 그 뒤에야 요청을 보내고 응답을 기다리는 1 RTT가 시작됩니다. 2018년에 나온 TLS 1.3은 클라이언트가 첫 메시지(ClientHello)에 디피–헬먼 공개 값을 미리 실어 보내게 해서 핸드셰이크를 1 RTT로 줄였습니다.
      </p>
      <WaterfallFigure />
      <p>
        RTT 100ms, DNS 40ms에서 TLS 1.2는 첫 바이트까지 440ms, TLS 1.3은 340ms가 걸립니다. 암호화 없는 HTTP(240ms)와 비교하면 TLS 1.3이 더하는 비용은 왕복 한 번입니다. HTTP/3가 쓰는 <T en="QUIC">QUIC</T>은 TCP 대신 UDP 위에서 연결 설정과 TLS 1.3 핸드셰이크를 한 번에 해서 240ms, 암호화 없는 HTTP와 같은 왕복 두 번으로 줄입니다. 전에 접속했던 서버라면 기억해 둔 정보로 첫 메시지에 요청까지 실어 보내는 <T en="0-RTT">0-RTT</T>로 140ms까지 내려갑니다. RTT를 300ms(멀리 떨어진 서버나 느린 모바일 망)로 올려 보면, 왕복 한 번을 줄이는 것이 왜 그렇게 중요한지 보입니다. 대역폭을 늘려도 이 시간은 줄지 않습니다.
      </p>
      <Callout kind="note">
        0-RTT로 보낸 데이터는 공격자가 녹화해 두었다가 다시 보내는 <T en="replay attack">재전송 공격</T>을 완전히 막지 못합니다. 그래서 서버는 보통 GET처럼 여러 번 받아도 문제없는 요청에만 0-RTT를 허용합니다.
      </Callout>

      <h2>한 페이지, 여러 리소스</h2>
      <p>
        HTTP/1.0은 기본적으로 요청마다 연결을 새로 맺었습니다. HTTP/1.1은 응답 뒤에도 연결을 열어 두고 다음 요청에 다시 쓰지만(keep-alive), 한 연결에서는 한 번에 요청 하나만 오갑니다. 앞 응답이 다 와야 다음 요청을 보낼 수 있으므로, 리소스가 많으면 왕복이 계속 쌓입니다. 브라우저는 이를 피하려고 한 사이트에 연결을 보통 <strong>6개까지</strong> 동시에 엽니다. 연결마다 핸드셰이크를 해야 하고, 연결끼리 대역폭을 다투는 비용이 따릅니다.
      </p>
      <p>
        2015년에 나온 <strong>HTTP/2</strong>는 연결 하나에 여러 요청과 응답을 동시에 싣습니다. 메시지를 작은 <T en="frame">프레임</T>으로 잘라 <T en="stream">스트림</T> 번호를 붙이고, 여러 스트림의 프레임을 섞어 보냅니다(<T en="multiplexing">다중화</T>). 헤더를 글자 대신 이진 형식으로 압축해 보내고, 연결 하나로 페이지 전체를 받습니다. 그런데 이 연결이 TCP라는 데 함정이 있습니다. TCP는 바이트를 반드시 순서대로 넘겨주므로, 패킷 하나가 사라지면 재전송이 도착할 때까지 그 뒤의 모든 바이트가 대기합니다. 그 바이트가 다른 스트림의 것이어도 마찬가지입니다. 이것을 <T en="head-of-line blocking">HOL 블로킹</T>이라고 합니다.
      </p>
      <HolFigure />
      <p>
        손실이 없으면 HTTP/2와 HTTP/3는 똑같이 224ms에 끝나고, 리소스마다 요청을 기다려야 하는 HTTP/1.1은 455ms가 걸립니다. 손실률 2%(처음 패턴)에서는 패킷 3개가 사라집니다. HTTP/2에서는 첫 손실 직후 거의 모든 리소스의 막대가 재전송을 기다리느라 함께 늘어나, 리소스 평균이 181ms에서 246ms로 늦어집니다. 똑같은 패킷을 잃은 HTTP/3에서는 사라진 패킷이 속한 리소스만 기다리므로 평균이 190ms입니다. 페이지 전체가 끝나는 시각(253ms)은 둘이 같습니다. 마지막 재전송을 기다리는 리소스는 어느 쪽이든 기다려야 하기 때문입니다. HTTP/3가 앞서는 것은 그 사이에 다른 리소스를 먼저 쓸 수 있다는 점, 즉 화면이 더 일찍 채워진다는 점입니다.
      </p>
      <p>
        <strong>HTTP/3</strong>(2022년 표준)는 그래서 TCP를 버리고 QUIC 위에서 동작합니다. QUIC은 스트림마다 순서를 따로 관리해서, 한 스트림의 손실이 다른 스트림을 막지 않습니다. 연결을 IP 주소와 포트가 아닌 연결 ID로 구별하므로, 휴대폰이 와이파이에서 LTE로 바뀌어도 연결을 새로 맺지 않고 이어 갈 수 있습니다. QUIC이 UDP 위에 만들어진 것은, 수많은 공유기와 방화벽이 TCP와 UDP 말고는 잘 통과시키지 않아 새 전송 프로토콜을 만들기 어려웠기 때문입니다.
      </p>

      <h2>HTTPS가 숨기지 못하는 것</h2>
      <p>
        HTTPS는 내용을 숨기지만 모든 것을 숨기지는 않습니다. 패킷의 IP 주소는 라우터가 읽어야 하므로 그대로 보입니다. 접속하려는 사이트 이름도 TLS 핸드셰이크의 <T en="Server Name Indication">SNI</T>에 평문으로 실리는 경우가 많고(이를 암호화하는 ECH가 보급되는 중입니다), 기본 DNS 질문도 따로 보입니다. 오가는 데이터의 크기와 시각도 감출 수 없습니다. 길목의 누군가는 내가 어느 사이트에 언제 얼마나 접속했는지는 알 수 있지만, 그 안에서 무엇을 읽고 무엇을 입력했는지는 모릅니다.
      </p>

      <Callout kind="key">
        HTTP는 시작 줄, 헤더, 빈 줄, 본문으로 된 요청과 응답을 주고받는 상태 없는 프로토콜이고, 상태는 쿠키 같은 헤더로 이어 붙입니다. HTTPS는 그 아래에 TLS를 깔아 기밀성, 무결성, 인증을 더합니다. 열쇠는 디피–헬먼으로 공개된 길 위에서 만들고, 상대가 진짜인지는 CA가 서명한 인증서로 확인합니다. 처음 접속의 비용은 왕복 횟수로 정해집니다. TLS 1.3은 핸드셰이크를 2 RTT에서 1 RTT로, QUIC은 연결과 암호화를 합쳐 1 RTT로 줄였습니다. HTTP/2는 연결 하나에 요청을 섞어 보내지만 TCP의 순서 보장 때문에 손실 하나가 모든 스트림을 막고, HTTP/3는 스트림을 따로 다루는 QUIC으로 이 문제를 없앴습니다.
      </Callout>
      <Quiz
        q="패킷 손실이 잦은 모바일 망에서 사이트를 HTTP/1.1에서 HTTP/2로 바꿨더니, 이미지 여러 장이 한동안 한꺼번에 멈췄다가 동시에 뜨는 일이 잦아졌다. 가장 그럴듯한 원인은?"
        options={['HTTP/2의 헤더 압축이 느려서 응답이 늦게 해석된다', '모든 이미지가 TCP 연결 하나에 실려, 패킷 하나가 사라지면 재전송이 올 때까지 그 뒤의 모든 스트림 데이터가 함께 기다린다', 'HTTP/2는 이미지를 한 번에 하나씩만 받을 수 있다', 'HTTP/2는 TLS 1.2 핸드셰이크가 필요해서 왕복이 늘어난다']}
        answer={1}
        explain={<>HTTP/2는 여러 응답을 TCP 연결 하나에 섞어 보냅니다. TCP는 바이트를 순서대로만 넘겨주므로, 패킷 하나가 사라지면 다른 이미지의 데이터가 이미 도착해 있어도 재전송이 올 때까지 브라우저에 전달되지 않습니다(TCP 수준의 HOL 블로킹). HTTP/1.1의 연결 6개였다면 손실은 그 연결 하나만 멈췄을 것입니다. 스트림마다 순서를 따로 관리하는 HTTP/3(QUIC)가 이 문제의 해답입니다. HTTP/2는 오히려 여러 응답을 동시에 받는 것이 특징이고, 쓰는 TLS 버전과는 상관이 없습니다.</>}
      />
    </>
  );
}

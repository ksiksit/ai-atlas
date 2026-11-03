import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { hex, sha256, utf8 } from '../../shared';
import { CHECKS, FS_DAYS, HANDSHAKE, PROT_NAME, mitm, sessionFates, type Attack, type CheckId, type KeyExchange, type Prot, type SessionFate } from './channel';
import '../../../cs/systems/lessons/saving.css';
import './channel.css';

/* ─────────────── Figure 1: the TLS 1.3 handshake, one message at a time ─────────────── */

const protColor = (P: Palette, p: Prot) => (p === 'plain' ? P.ink2 : p === 'hs' ? P.neg : P.good);
const PROT_CSS: Record<Prot, string> = { plain: 'var(--ink-2)', hs: 'var(--neg)', app: 'var(--good)' };

/** Which keys one side holds after message `i` has been sent (server) or received (client). */
function keysAt(side: 'c' | 's', i: number): string {
  // the server derives its handshake keys when it answers ClientHello, the client when ServerHello arrives
  const hs = 1;
  // application keys: the server after sending its Finished, the client after sending its own
  const app = side === 's' ? 5 : 6;
  if (i >= app) return '애플리케이션 키';
  if (i >= hs) return '핸드셰이크 키';
  return '없음';
}

function HandshakeFigure() {
  const P = usePalette();
  const s = useStepper(HANDSHAKE.length, 1, null);
  const m = HANDSHAKE[s.i];
  // a stand-in transcript: the names of the handshake messages so far (application data is not part of it)
  const transcript = useMemo(
    () =>
      HANDSHAKE.map((_, i) =>
        hex(
          sha256(
            utf8(
              HANDSHAKE.slice(0, i + 1)
                .filter((x) => x.prot !== 'app')
                .map((x) => x.name)
                .join('|'),
            ),
          ),
        ).slice(0, 16),
      ),
    [],
  );

  const rowH = 30;
  const top = 34;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cx = Math.max(56, w * 0.14);
      const sx = w - Math.max(56, w * 0.14);
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
        ctx.lineTo(x, h - 8);
        ctx.stroke();
      }
      HANDSHAKE.forEach((msg, i) => {
        const y0 = top + i * rowH + msg.flight * 8;
        const y1 = y0 + 18;
        const [x0, x1] = msg.dir === 'c2s' ? [cx, sx] : [sx, cx];
        const future = i > s.i;
        const cur = i === s.i;
        const col = protColor(P, msg.prot);
        ctx.globalAlpha = future ? 0.22 : 1;
        drawArrow(ctx, x0, y0, x1, y1, col, cur ? 3 : 1.8, 8);
        const mx = (cx + sx) / 2;
        const my = (y0 + y1) / 2;
        ctx.font = `${cur ? 700 : 600} 10.5px ${P.fontMono}`;
        const label = msg.prot === 'plain' ? msg.name : `{${msg.name}}`;
        const maxW = sx - cx - 20;
        const tw = Math.min(ctx.measureText(label).width, maxW);
        ctx.fillStyle = cur ? P.hl : alpha(P.surface, 0.94);
        ctx.fillRect(mx - tw / 2 - 4, my - 8, tw + 8, 16);
        ctx.fillStyle = cur ? '#1a1a1a' : col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my + 0.5, maxW);
        ctx.globalAlpha = 1;
      });
    },
    [P, s.i],
    { height: top + HANDSHAKE.length * rowH + 3 * 8 + 16 },
  );

  const sni = m.fields.find(([k]) => k.startsWith('server_name'));
  const seen = m.prot === 'plain' ? `위의 필드 전부${sni ? `. 특히 접속하려는 이름 ${sni[1]}` : ''}` : '암호화된 레코드 하나 (내용은 안 보이고 길이와 시각만)';
  return (
    <Figure
      no={1}
      title="TLS 1.3 핸드셰이크"
      hint="한 단계씩 넘기며 메시지 안을 보세요"
      caption={
        <>
          화살표 하나가 메시지 하나이고, 같은 높이에 모인 화살표는 한 번에 떠나는 비행(flight)입니다. 중괄호로 감싼 메시지는 암호화되어 있습니다(파란색은 핸드셰이크 키, 초록색은 애플리케이션 키). 필드는 주요한 것만 골랐고, 이전 버전과 호환하려고 끼워 보내는 ChangeCipherSpec 같은 메시지는 뺐습니다. 트랜스크립트 해시는 지금까지 메시지의 이름을 이어 붙인 것을 SHA-256으로 해시해 흉내 낸 값이고, 실제로는 메시지 바이트 전체를 해시합니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`TLS 1.3 핸드셰이크 ${s.i + 1}단계: ${m.name}, ${PROT_NAME[m.prot]}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <StepControls s={s} id="tls-hs-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="브라우저의 키" value={keysAt('c', s.i)} />
            <Readout label="서버의 키" value={keysAt('s', s.i)} />
          </div>
          <div className="tls-hash">
            <span>트랜스크립트 해시</span>
            <span className="mono">{transcript[s.i]}…</span>
          </div>
        </div>
      </div>
      <div className="tls-msg" aria-live="polite">
        <div className="tls-msg-head">
          <strong className="mono">{m.name}</strong>
          <span className="tls-badge" data-p={m.prot}>
            {PROT_NAME[m.prot]}
          </span>
          <span className="tls-dir">{m.dir === 'c2s' ? '브라우저 → 서버' : '서버 → 브라우저'}</span>
        </div>
        <dl className="tls-fields">
          {m.fields.map(([k, v]) => (
            <div key={k}>
              <dt className="mono">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="step-note">{m.note}</p>
        <div className="tls-seen">
          <span>길에서 엿듣는 사람에게 보이는 것</span>
          <span>{seen}</span>
        </div>
      </div>
      <Legend
        items={(['plain', 'hs', 'app'] as Prot[]).map((p) => ({ color: PROT_CSS[p], label: PROT_NAME[p], shape: 'ln' as const }))}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: where a man in the middle gets stopped ─────────────── */

const ATTACKS: { value: Attack; label: string; desc: string }[] = [
  { value: 'own-cert', label: '자기 인증서', desc: '공격자가 자기 도메인(attacker.example)으로 정식 발급받은 인증서를 내밉니다. 공격자는 브라우저와 서버 사이에서 양쪽과 각각 TLS를 맺으려 합니다.' },
  { value: 'self-signed', label: '가짜 인증서', desc: '공격자가 www.example.com이라는 이름으로 인증서를 직접 만들어(자기 서명) 내밉니다.' },
  { value: 'swap-key', label: '공개 값 바꿔치기', desc: '진짜 서버의 인증서를 그대로 전달하되, 양쪽이 보낸 key_share를 자기 공개 값으로 바꿔치기해 양쪽과 따로 키를 만듭니다.' },
  { value: 'tamper-hello', label: 'ClientHello 고치기', desc: 'key_share는 건드리지 않고, ClientHello의 암호 스위트 목록에서 강한 것을 지워 약한 설정을 고르게 하려 합니다.' },
  { value: 'strip', label: 'HTTPS 벗기기', desc: '사용자가 주소창에 https:// 없이 이름만 입력해, 브라우저의 첫 요청이 평문 HTTP로 나갑니다. 공격자는 이 요청을 가로채 HTTPS로 넘어가라는 응답을 지웁니다.' },
];
const CHECK_NAME: Record<CheckId, string> = {
  chain: '인증서 사슬이 신뢰하는 루트까지 이어지나',
  name: '인증서의 이름이 접속한 이름과 같나',
  certVerify: 'CertificateVerify 서명이 맞나',
  finished: 'Finished MAC이 맞나',
  hsts: 'HSTS: 이 이름은 언제나 HTTPS로',
};
const CHECK_SHORT: Record<CheckId, string> = { chain: '인증서 사슬', name: '이름 확인', certVerify: 'CertificateVerify', finished: 'Finished', hsts: 'HSTS' };
const WHY: Record<Attack, Partial<Record<CheckId, string>>> = {
  'own-cert': {
    chain: '인증서 자체는 정식 인증 기관이 발급한 것입니다.',
    name: '인증서는 attacker.example용이라 www.example.com과 다릅니다.',
    certVerify: '공격자는 자기 인증서의 개인 키를 갖고 있어 서명할 수 있습니다.',
    finished: '공격자가 브라우저와 직접 키를 만들었으니 MAC도 맞게 계산합니다.',
  },
  'self-signed': {
    chain: '서명한 주체가 브라우저가 믿는 인증 기관이 아닙니다.',
    name: '이름은 www.example.com으로 맞춰 두었습니다.',
    certVerify: '직접 만든 인증서이니 개인 키도 공격자에게 있습니다.',
    finished: '브라우저와 직접 키를 만들었으니 MAC도 맞습니다.',
  },
  'swap-key': {
    chain: '진짜 서버의 인증서를 그대로 전달했습니다.',
    name: '진짜 인증서이니 이름도 맞습니다.',
    certVerify: '서버의 서명은 서버가 본 트랜스크립트(공격자의 공개 값이 든)에 대한 것이라 브라우저가 본 것과 다릅니다. 공격자에게는 서버의 개인 키가 없어 다시 서명할 수도 없습니다.',
    finished: '공격자가 양쪽과 따로 키를 만들었으므로 Finished는 양쪽 모두에 맞게 만들어 줄 수 있습니다. Finished만으로는 이 공격을 막지 못합니다.',
  },
  'tamper-hello': {
    chain: '진짜 서버의 인증서가 그대로 왔습니다.',
    name: '진짜 인증서이니 이름도 맞습니다.',
    certVerify: '서버가 서명한 트랜스크립트에는 고쳐진 ClientHello가, 브라우저의 트랜스크립트에는 원래 것이 들어 있습니다.',
    finished: '양쪽 트랜스크립트가 다르니 MAC이 맞지 않습니다. 공격자는 키를 몰라 MAC을 고쳐 쓸 수도 없습니다.',
  },
  strip: {
    hsts: '브라우저가 http 요청을 보내기 전에 스스로 https로 바꿔, 가로챌 평문 요청이 생기지 않습니다.',
  },
};
const OUTCOME_TEXT = {
  readwrite: '공격자는 브라우저와 서버 각각과 따로 TLS를 맺고, 가운데서 모든 내용을 평문으로 읽고 고칩니다. 주소창의 자물쇠는 그대로 보입니다.',
  tampered: '공격자는 키를 모르므로 내용을 읽지는 못하지만, 핸드셰이크를 고친 사실이 들키지 않습니다. 약한 설정이 골라졌다면 그 약점을 노릴 수 있습니다.',
  plain: '브라우저는 공격자와 평문 HTTP로, 공격자는 서버와 HTTPS로 이야기합니다. 서버는 정상적인 HTTPS 손님으로 보고, 사용자의 비밀번호와 쿠키는 공격자에게 그대로 보입니다.',
};

function MitmFigure() {
  const P = usePalette();
  const [attack, setAttack] = useState<Attack>('swap-key');
  const [on, setOn] = useState<Record<CheckId, boolean>>({ chain: true, name: true, certVerify: true, finished: true, hsts: true });
  const r = mitm(attack, on);
  const won = r.outcome !== 'blocked';

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const y = h / 2 + 6;
      const bw = Math.min(96, w * 0.24);
      const bh = 40;
      const xs = [bw / 2 + 8, w / 2, w - bw / 2 - 8];
      const names = ['브라우저', '공격자', '서버'];
      const link = (a: number, b: number, color: string, text: string, dashed = false) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.setLineDash(dashed ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(xs[a] + bw / 2, y);
        ctx.lineTo(xs[b] - bw / 2, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `600 10.5px ${P.fontBody}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, (xs[a] + xs[b]) / 2, y - 6, xs[b] - xs[a] - bw);
      };
      const plain = P.bad;
      const enc = P.neg;
      if (r.outcome === 'blocked') {
        // the browser hangs up at the check that failed
        link(0, 1, P.ink3, attack === 'strip' ? 'HTTPS로 바로' : '핸드셰이크 중', true);
        const xx = (xs[0] + xs[1]) / 2;
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xx - 7, y - 7);
        ctx.lineTo(xx + 7, y + 7);
        ctx.moveTo(xx + 7, y - 7);
        ctx.lineTo(xx - 7, y + 7);
        ctx.stroke();
        link(1, 2, P.ink3, '', true);
      } else if (r.outcome === 'readwrite') {
        link(0, 1, enc, 'TLS · 키 A');
        link(1, 2, enc, 'TLS · 키 B');
      } else if (r.outcome === 'tampered') {
        link(0, 1, enc, 'TLS (키는 양 끝만)');
        link(1, 2, enc, 'TLS (키는 양 끝만)');
      } else {
        link(0, 1, plain, 'HTTP · 평문');
        link(1, 2, enc, 'HTTPS');
      }
      names.forEach((n, i) => {
        const x = xs[i];
        const evil = i === 1;
        ctx.fillStyle = evil ? (won ? alpha(P.bad, P.dark ? 0.3 : 0.15) : P.surface) : P.surface;
        ctx.strokeStyle = evil ? P.bad : P.ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = evil ? P.bad : P.ink;
        ctx.font = `700 12px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n, x, y);
      });
      // what the attacker gets
      const gets = r.outcome === 'blocked' ? '연결 실패: 중계만 할 수 있음' : r.outcome === 'readwrite' ? '읽기 · 고치기 가능' : r.outcome === 'tampered' ? '못 읽음 · 고친 것은 안 들킴' : '평문 그대로 읽고 고침';
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.fillStyle = r.outcome === 'blocked' ? P.ink3 : P.bad;
      ctx.textBaseline = 'top';
      ctx.fillText(gets, xs[1], y + bh / 2 + 8, w - 16);
      ctx.fillStyle = P.ink3;
      ctx.textBaseline = 'bottom';
      ctx.fillText('브라우저가 접속하려는 이름: www.example.com', w / 2, 18, w - 16);
    },
    [P, r.outcome, attack, won],
    { height: 150, minHeight: 120 },
  );

  return (
    <Figure
      no={2}
      title="중간자는 어디서 막히나"
      hint="공격 방법을 고르고 브라우저의 검사를 하나씩 꺼 보세요"
      caption={
        <>
          공격자는 브라우저와 서버 사이의 길(공용 Wi-Fi, 감염된 공유기 등)에 있어서 패킷을 마음대로 읽고, 바꾸고, 대신 보낼 수 있다고 가정합니다. 브라우저는 위에서부터 차례로 검사하고, 켜진 검사 하나라도 실패하면 연결을 끊습니다. 실제 브라우저에서는 이 검사들을 끌 수 없지만, 직접 만든 프로그램에서 인증서 검사를 꺼 둔 채 배포하는 실수는 실제로 자주 일어납니다.
        </>
      }
    >
      <Seg label="공격 방법" value={attack} onChange={setAttack} options={ATTACKS.map((a) => ({ value: a.value, label: a.label }))} />
      <div className="stream-note">{ATTACKS.find((a) => a.value === attack)!.desc}</div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${ATTACKS.find((a) => a.value === attack)!.label} 공격: ${r.outcome === 'blocked' ? `${CHECK_SHORT[r.stoppedBy!]} 검사에서 막힘` : '공격 성공'}`}>
        <canvas ref={canvasRef} />
      </div>
      <ul className="mitm-checks">
        {CHECKS.map((c) => {
          const st = r.checks[c];
          const why = WHY[attack][c];
          return (
            <li key={c} data-s={st ?? 'na'}>
              <Check label={CHECK_NAME[c]} checked={on[c]} onChange={(v) => setOn({ ...on, [c]: v })} />
              <span className="mitm-state">{st === 'pass' ? '통과' : st === 'fail' ? '실패 → 연결 끊음' : st === 'off' ? '꺼져 있어 건너뜀' : why ? '검사 전에 끝남' : '해당 없음'}</span>
              {why && st !== null && <span className="mitm-why">{why}</span>}
            </li>
          );
        })}
      </ul>
      <div className="mitm-outcome" data-o={r.outcome} aria-live="polite">
        <strong>{r.outcome === 'blocked' ? '막힘' : '공격 성공'}</strong> {r.outcome === 'blocked' ? `브라우저가 "${CHECK_NAME[r.stoppedBy!]}" 단계에서 연결을 끊고 경고를 띄웁니다.` : OUTCOME_TEXT[r.outcome]}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: forward secrecy ─────────────── */

const FATE_NAME: Record<SessionFate, string> = { safe: '안전', decrypt: '녹화본 복호화됨', impersonate: '서버 사칭 가능' };
const fateColor = (P: Palette, f: SessionFate) => (f === 'safe' ? P.good : f === 'decrypt' ? P.bad : P.hl);
const FATE_CSS: Record<SessionFate, string> = { safe: 'var(--good)', decrypt: 'var(--bad)', impersonate: 'var(--hl)' };

function ForwardSecrecyFigure() {
  const P = usePalette();
  const [kx, setKx] = useState<KeyExchange>('rsa');
  const [leak, setLeak] = useState(10);
  const [delay, setDelay] = useState(3);
  const fates = sessionFates(kx, leak, delay);
  const count = (f: SessionFate) => fates.filter((x) => x === f).length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 8;
      const padR = 8;
      const cw = (w - padL - padR) / FS_DAYS;
      const y0 = 34;
      const ch = Math.min(46, h - y0 - 40);
      const X = (day: number) => padL + (day - 1) * cw; // left edge of a day
      fates.forEach((f, i) => {
        const x = X(i + 1);
        ctx.fillStyle = alpha(fateColor(P, f), f === 'safe' ? (P.dark ? 0.32 : 0.22) : P.dark ? 0.75 : 0.85);
        ctx.fillRect(x + 1.5, y0, cw - 3, ch);
        ctx.strokeStyle = fateColor(P, f);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 1.5, y0, cw - 3, ch);
        ctx.fillStyle = f === 'safe' ? P.ink2 : '#1a1a1a';
        ctx.font = `600 ${cw < 22 ? 9.5 : 11}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + cw / 2, y0 + ch / 2);
      });
      const marker = (day: number, text: string, color: string, row: number) => {
        if (day > FS_DAYS + 1) return;
        const x = X(day);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y0 - 6 - row * 14);
        ctx.lineTo(x, y0 + ch + 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(text).width;
        const left = x + tw + 4 > w;
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(text, left ? x - 3 : x + 3, y0 - 6 - row * 14 + 4);
      };
      marker(leak, '개인 키 유출', P.bad, 1);
      if (delay > 0) marker(leak + delay, '새 키로 교체', P.ink, 0);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('날짜 (하루에 세션 하나씩, 공격자가 모두 녹화)', padL, y0 + ch + 10);
    },
    [P, fates, leak, delay],
    { height: 112, minHeight: 100 },
  );

  return (
    <Figure
      no={3}
      title="키가 샌 뒤에 녹화본은 안전할까"
      hint="키 교환 방식과 유출 시점을 바꿔 보세요"
      caption={
        <>
          공격자는 처음부터 이 서버와의 암호화된 통신을 모두 녹화해 둡니다. 어느 날 서버의 인증서 개인 키가 유출되고, 운영자는 며칠 뒤에야 새 키와 새 인증서로 바꾸고 옛 인증서를 폐지합니다. 폐지가 모든 브라우저에 곧바로 반영된다고 단순하게 가정했습니다. 노란색은 녹화본은 안전하지만, 길 위의 공격자가 유출된 키로 서버 행세를 할 수 있는 세션입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="키 교환"
          value={kx}
          onChange={setKx}
          options={[
            { value: 'rsa' as KeyExchange, label: 'RSA 키 전송 (TLS 1.2까지)' },
            { value: 'ecdhe' as KeyExchange, label: '임시 (EC)DHE' },
          ]}
        />
        <Slider id="fs-leak" label="키가 유출된 날" value={leak} min={2} max={FS_DAYS} step={1} onChange={setLeak} format={(v) => `${v}일째`} />
        <Slider id="fs-delay" label="교체까지 걸린 날" value={delay} min={0} max={7} step={1} onChange={setDelay} format={(v) => `${v}일`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${kx === 'rsa' ? 'RSA 키 전송' : '임시 디피–헬만'}: 세션 ${FS_DAYS}개 중 녹화본이 복호화되는 세션 ${count('decrypt')}개, 서버 사칭이 가능한 세션 ${count('impersonate')}개`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="녹화본이 풀리는 세션" value={`${count('decrypt')}개`} color="var(--bad)" />
        <Readout label="사칭 위험 세션" value={`${count('impersonate')}개`} />
        <Readout label="안전한 세션" value={`${count('safe')}개`} color="var(--good)" />
      </div>
      <Legend items={(['safe', 'impersonate', 'decrypt'] as SessionFate[]).map((f) => ({ color: FATE_CSS[f], label: FATE_NAME[f], shape: 'sq' as const }))} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Tls() {
  return (
    <>
      <h2>자물쇠가 약속하는 것</h2>
      <p>
        <a href="#net-basics/http">기초 네트워크의 HTTP와 HTTPS</a> 장에서 TLS 1.3이 1 왕복 만에 핸드셰이크를 끝낸다는 것과, 작은 수로 디피–헬만 키 교환을 해 보았습니다. 이 장에서는 그 1 왕복 안에서 정확히 무슨 일이 일어나고, 각 조각이 어떤 공격을 막는지 봅니다. 먼저 TLS가 지키는 것을 분명히 해 둡시다.
      </p>
      <ul>
        <li>
          <T en="confidentiality">기밀성</T>: 길에서 엿들어도 내용을 읽을 수 없습니다. <a href="#net-security/symmetric">대칭 암호</a>가 맡습니다.
        </li>
        <li>
          <T en="integrity">무결성</T>: 누가 내용을 바꾸거나 레코드를 빼고 끼우면 드러납니다. 인증 암호(AEAD)가 맡습니다.
        </li>
        <li>
          <T en="authentication">인증</T>: 지금 이야기하는 상대가 정말 www.example.com의 주인입니다. <a href="#net-security/public-key">인증서와 전자 서명</a>이 맡습니다. 보통은 서버만 증명하고, 클라이언트는 비밀번호나 쿠키로 따로 자신을 증명합니다. 서버끼리처럼 양쪽 다 인증서를 내는 방식은 상호 TLS(mTLS)라고 부릅니다.
        </li>
      </ul>
      <p>
        반대로 TLS가 숨기지 못하는 것도 있습니다. 패킷의 IP 주소는 라우터가 읽어야 하므로 그대로이고, 레코드의 크기와 시각도 보입니다. ClientHello에 실린 접속 이름(<T en="Server Name Indication">SNI</T>)도 평문입니다. 이 이름까지 암호화하는 <T en="Encrypted Client Hello">ECH</T>가 마련되어 일부 브라우저와 CDN이 쓰기 시작했지만, 아직 어디서나 쓰이지는 않습니다. DNS 질의도 따로 암호화하지 않으면 보입니다. "HTTPS라서 내가 어느 사이트에 가는지 아무도 모른다"는 생각은 틀린 셈입니다.
      </p>

      <h2>핸드셰이크 한 단계씩</h2>
      <p>
        TLS 1.3의 핸드셰이크는 브라우저의 한 비행, 서버의 한 비행, 다시 브라우저의 한 비행으로 이루어지고, 마지막 비행에 첫 HTTP 요청이 함께 실립니다. 단계를 넘기며 각 메시지가 무엇을 싣고, 누구에게 무엇이 보이는지 확인해 보세요.
      </p>
      <HandshakeFigure />
      <p>
        핵심은 키가 두 번 바뀐다는 점입니다. ServerHello로 양쪽의 공개 값이 모이면 디피–헬만으로 공유 비밀이 생기고, 여기서 <T en="handshake traffic keys">핸드셰이크 키</T>를 뽑아 나머지 핸드셰이크를 암호화합니다. 핸드셰이크가 끝나면 그 비밀에 트랜스크립트를 섞어 <T en="application traffic keys">애플리케이션 키</T>를 다시 뽑습니다. 키를 뽑는 데는 HKDF라는 해시 기반 함수를 쓰고, 단계마다 이름표를 붙여 서로 다른 키가 나오게 합니다. 한 단계의 키가 새더라도 다른 단계의 키를 거꾸로 알아낼 수 없게 하려는 설계입니다.
      </p>
      <p>
        트랜스크립트도 중요합니다. 지금까지 주고받은 핸드셰이크 메시지 전체의 해시로, 서버의 CertificateVerify 서명과 양쪽의 Finished MAC은 모두 이 해시 위에 계산됩니다. 그래서 길에서 어떤 바이트 하나라도 바뀌면 양쪽의 트랜스크립트가 달라지고, 서명이나 MAC이 맞지 않게 됩니다.
      </p>

      <h2>중간자는 어디서 막히나</h2>
      <p>
        이제 공격자 자리에 서 봅시다. 공용 Wi-Fi를 운영하거나 공유기를 장악한 공격자는 브라우저와 서버 사이의 모든 패킷을 읽고, 바꾸고, 대신 보낼 수 있습니다. 이런 공격자를 <T en="man in the middle">중간자</T>라고 합니다. 디피–헬만은 엿듣기만 하는 공격자는 막지만, 가운데서 양쪽에 각각 자기 공개 값을 내미는 공격자는 막지 못합니다. 그 빈틈을 메우는 것이 인증서와 서명입니다.
      </p>
      <MitmFigure />
      <p>
        검사마다 막는 공격이 다릅니다. 자기 인증서를 내미는 공격은 이름 확인이, 가짜 인증서는 사슬 검증이, 공개 값 바꿔치기는 CertificateVerify 서명이 막습니다. 바꿔치기에서 Finished를 켜 두고 CertificateVerify만 꺼 보세요. 공격이 성공합니다. 공격자가 양쪽과 따로 키를 만들었으니 MAC은 얼마든지 맞춰 줄 수 있기 때문입니다. Finished는 키를 모르는 공격자가 핸드셰이크를 고치는 것을 막는 장치이고, 상대가 누구인지는 서명만 증명합니다.
      </p>
      <Callout kind="warn">
        프로그램에서 TLS 라이브러리를 쓸 때 "인증서 검사 끄기" 옵션(예: <code>verify=False</code>, <code>rejectUnauthorized: false</code>, <code>InsecureSkipVerify</code>)을 켜면 그림 2에서 사슬 검증과 이름 확인을 끈 것과 같습니다. 암호화는 그대로 되므로 겉보기에는 멀쩡히 동작하지만, 길 위의 누구든 자기 인증서로 끼어들 수 있습니다. 개발 중에 잠깐 켜 둔 이 옵션이 그대로 배포되는 일은 실제로 흔합니다.
      </Callout>
      <Callout kind="note">
        회사가 직원 컴퓨터에 자기 루트 인증서를 설치해 두고 방화벽에서 모든 HTTPS를 풀어 검사하는 경우가 있습니다(TLS 검사). 원리는 그림 2의 중간자와 같고, 브라우저가 그 루트를 믿도록 설정되어 있어서 경고가 뜨지 않을 뿐입니다. 그래서 그런 장비가 다시 맺는 TLS가 약하면 회사 전체의 보안이 약해집니다.
      </Callout>

      <h2>약한 쪽으로 끌어내리기: 다운그레이드</h2>
      <p>
        양쪽이 모두 최신 버전을 지원하더라도, 공격자가 협상을 방해해 옛 버전이나 약한 암호로 연결되게 만들 수 있다면 최신 버전의 의미가 없습니다. 이를 <T en="downgrade attack">다운그레이드 공격</T>이라고 합니다. TLS 1.3은 두 겹으로 막습니다. 첫째, 협상에 쓰인 메시지 전체가 트랜스크립트로 서명되고 MAC으로 확인되므로, 그림 2의 "ClientHello 고치기"처럼 목록을 고치면 드러납니다. 둘째, TLS 1.3을 지원하는 서버가 어쩔 수 없이 낮은 버전으로 답할 때는 ServerHello의 무작위 수 마지막 8바이트에 정해진 표식(ASCII로 <code>DOWNGRD</code>와 버전 바이트 하나)을 넣습니다. TLS 1.3을 지원하는 브라우저가 이 표식을 보면 누군가 버전을 끌어내렸음을 알고 연결을 끊습니다.
      </p>

      <h2>HTTPS를 벗기는 공격과 HSTS</h2>
      <p>
        TLS가 아무리 튼튼해도, 처음부터 TLS를 쓰지 않게 만들면 소용이 없습니다. 사용자는 주소창에 <code>example.com</code>만 입력하고, 브라우저는 그 첫 요청을 평문 HTTP로 보냅니다. 보통은 서버가 "HTTPS로 다시 오라"고 답하지만, 길 위의 공격자는 이 답을 지우고 자기가 대신 서버와 HTTPS로 이야기하면서 사용자와는 평문으로 계속 이야기할 수 있습니다. 2009년 보안 연구자 목시 말린스파이크(Moxie Marlinspike)가 sslstrip이라는 도구로 보여 준 <T en="SSL stripping">SSL 스트리핑</T>입니다.
      </p>
      <p>
        이를 막는 것이 <T en="HTTP Strict Transport Security">HSTS</T>입니다. 서버가 HTTPS 응답에 아래 헤더를 붙이면, 브라우저는 정해진 기간 동안 이 이름으로는 평문 HTTP 요청을 아예 보내지 않고 스스로 https로 바꿉니다. 인증서 오류가 나도 사용자가 경고를 무시하고 넘어가는 버튼을 없앱니다.
      </p>
      <Code label="HSTS 헤더">{`
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
// max-age: 1년(초) 동안 기억 · includeSubDomains: 하위 이름에도 적용
// preload: 브라우저에 미리 넣어 두는 목록에 올려도 좋다는 표시`}</Code>
      <p>
        다만 HSTS는 한 번은 HTTPS로 접속해 헤더를 받아야 시작됩니다. 그 첫 방문까지 지키려고 주요 브라우저는 HSTS를 쓰는 이름의 목록을 프로그램 안에 미리 넣어 두는데, 이것이 <T en="HSTS preload list">HSTS 프리로드 목록</T>입니다. 구글이 운영하는 <code>.dev</code>, <code>.app</code> 같은 최상위 도메인은 통째로 이 목록에 올라 있어서, 그 아래의 모든 사이트는 처음부터 HTTPS로만 열립니다.
      </p>

      <h2>키가 새면: 전방 비밀성</h2>
      <p>
        TLS 1.2까지 흔히 쓰던 <strong>RSA 키 전송</strong>에서는 브라우저가 세션 키의 재료(premaster secret)를 서버의 인증서 공개 키로 암호화해 보냈습니다. 간단하지만, 서버의 개인 키 하나가 그 키로 맺은 모든 세션의 열쇠가 됩니다. 공격자가 몇 년 치 통신을 녹화해 두었다가 나중에 개인 키를 손에 넣으면, 녹화본 전부를 풀 수 있습니다.
      </p>
      <p>
        <strong>임시(ephemeral) 디피–헬만</strong>에서는 연결마다 새 키 쌍을 만들고, 핸드셰이크가 끝나면 버립니다. 인증서의 개인 키는 CertificateVerify 서명에만 쓰입니다. 그래서 개인 키가 나중에 새더라도 이미 끝난 세션의 키는 어디에도 남아 있지 않습니다. 이 성질을 <T en="forward secrecy">전방 비밀성</T>이라고 합니다.
      </p>
      <ForwardSecrecyFigure />
      <p>
        처음 설정(10일째에 유출, 사흘 뒤 교체)에서 RSA 키 전송이면 교체 전까지의 녹화본 12개가 모두 풀립니다. 키가 새기 전에 끝난 9개도 예외가 아닙니다. 같은 조건에서 임시 디피–헬만으로 바꾸면 풀리는 녹화본은 0개입니다. 대신 유출부터 교체까지 사흘 동안의 세션 3개는 길 위의 공격자가 유출된 키로 서버 행세를 할 수 있는 위험에 놓입니다. 전방 비밀성은 과거를 지켜 줄 뿐, 유출된 키로 미래를 사칭하는 것까지 막지는 못합니다. 그래서 키 유출이 의심되면 서둘러 새 키로 바꾸고 옛 인증서를 폐지해야 합니다.
      </p>
      <p>
        2014년에 OpenSSL의 하트블리드(Heartbleed) 버그로 서버 메모리, 때로는 개인 키까지 새어 나갈 수 있음이 알려지자 전방 비밀성은 선택이 아니라 필수로 여겨지게 되었습니다. TLS 1.3은 RSA 키 전송을 아예 없애, 모든 전체 핸드셰이크가 (EC)DHE를 씁니다. 같은 걱정은 미래의 양자 컴퓨터에도 이어집니다. 지금 녹화해 두었다가 언젠가 양자 컴퓨터로 디피–헬만을 풀겠다는 시나리오 때문에, 주요 브라우저와 CDN은 X25519에 양자 내성 알고리즘 ML-KEM을 섞은 하이브리드 키 교환을 쓰기 시작했습니다.
      </p>

      <h2>다시 접속할 때: 재개와 0-RTT</h2>
      <p>
        핸드셰이크가 끝나면 서버는 세션 티켓(NewSessionTicket)을 보내 둡니다. 다음에 접속할 때 브라우저가 이 티켓을 내밀면, 인증서를 다시 주고받지 않고 미리 나눈 키(PSK)로 핸드셰이크를 줄일 수 있습니다. 이때도 (EC)DHE를 함께 하면 전방 비밀성이 유지되지만, PSK만으로 재개하면 티켓을 암호화한 서버의 키가 샐 경우 그 세션이 풀릴 수 있습니다.
      </p>
      <p>
        재개할 때는 첫 비행에 요청을 바로 싣는 <T en="0-RTT early data">0-RTT</T>도 쓸 수 있습니다. 빠르지만 대가가 있습니다. 0-RTT 데이터는 서버의 새 무작위 수가 섞이기 전에 보내지므로, 길 위의 공격자가 녹화해 두었다가 그대로 다시 보내는 <T en="replay attack">재전송 공격</T>을 막지 못합니다. "송금하기" 같은 요청이 두 번 처리될 수 있다는 뜻이라, 서버는 보통 GET처럼 여러 번 처리해도 결과가 같은 요청만 0-RTT로 받습니다.
      </p>
      <Callout kind="note">
        인증서 대신 서버의 공개 키 자체를 미리 기억해 두는 것을 <T en="certificate pinning">고정(pinning)</T>이라고 합니다. 인증 기관이 실수로 가짜 인증서를 발급해도 막을 수 있지만, 키를 바꾸다가 실수하면 사이트가 스스로 잠겨 버립니다. 브라우저에서 사이트가 헤더로 고정을 지시하던 HPKP는 그런 사고 위험 때문에 몇 년 만에 사라졌고, 지금은 주로 모바일 앱이 자기 서버의 키를 코드에 넣어 둡니다. 브라우저 쪽에서는 발급된 모든 인증서를 공개 로그에 남기는 인증서 투명성(CT)이 그 역할을 대신합니다.
      </Callout>

      <Callout kind="key">
        TLS는 기밀성, 무결성, 서버 인증을 약속하지만 IP 주소, 크기, 시각, (ECH가 없으면) SNI는 숨기지 못합니다. TLS 1.3 핸드셰이크는 ClientHello와 ServerHello로 임시 디피–헬만 비밀을 만들고, 거기서 뽑은 핸드셰이크 키로 인증서와 CertificateVerify, Finished를 암호화해 보낸 뒤 애플리케이션 키로 넘어갑니다. 중간자를 막는 것은 인증서 사슬, 이름 확인, 그리고 트랜스크립트에 대한 서명이며, Finished MAC은 키를 모르는 공격자의 변조를 막습니다. HSTS는 평문으로 시작하는 틈을, 전방 비밀성은 나중에 키가 새도 과거 녹화본이 풀리지 않게 막습니다.
      </Callout>
      <Quiz
        q="어느 서비스의 서버 인증서 개인 키가 오늘 유출되었다. 이 서비스는 TLS 1.3만 쓴다. 지난 1년 동안 누군가 이 서비스와의 통신을 모두 녹화해 두었다면, 무엇이 가장 정확한가?"
        options={[
          '개인 키로 세션 키의 재료를 풀 수 있으므로 지난 1년의 녹화본이 모두 복호화된다',
          '지난 녹화본은 연결마다 버린 임시 키로 암호화되어 풀리지 않는다. 다만 키를 바꾸기 전까지는 공격자가 서버를 사칭할 수 있으니 서둘러 키를 바꾸고 인증서를 폐지해야 한다',
          'TLS 1.3은 인증서를 암호화해 보내므로 개인 키가 유출되어도 아무 위험이 없다',
          '녹화본은 안전하지만, 유출된 키로 지난 세션들의 Finished MAC을 다시 계산해 내용을 바꿀 수 있다',
        ]}
        answer={1}
        explain={
          <>
            TLS 1.3의 전체 핸드셰이크는 언제나 임시 (EC)DHE를 쓰고, 인증서의 개인 키는 CertificateVerify 서명에만 쓰입니다. 그래서 키가 새도 지난 세션의 키는 계산할 수 없습니다(전방 비밀성). 하지만 유출된 키로는 앞으로 맺는 연결에서 진짜 서버처럼 서명할 수 있으므로, 길 위의 공격자가 중간자가 될 수 있습니다. 녹화본은 이미 끝난 통신이라 바꿔 봐야 아무에게도 전달되지 않고, Finished는 개인 키가 아니라 세션 키로 계산합니다. PSK만으로 재개한 세션이 있었다면 티켓 키 쪽 위험은 따로 따져야 합니다.
          </>
        }
      />
    </>
  );
}

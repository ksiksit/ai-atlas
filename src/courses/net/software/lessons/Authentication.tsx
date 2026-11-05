import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { usePalette } from '../../../../lib/theme';
import { StepControls, humanTime, useStepper } from '../../../cs/shared';
import { lessonHref } from '../../../index';
import { FAKE_ORIGIN, REAL_ORIGIN, RFC_CODE8, RFC_SECRET, RFC_T, SECRETS, SETTINGS, avgSeconds, bits, hex, makeKeyPair, sign, stuffing, totp, utf8, verify, type Assertion, type TotpSteps, type Verdict } from './auth';
import './software.css';
import './auth.css';

/* ─────────────── Figure 1: where the attacker guesses matters most ─────────────── */

const UNIVERSE = 4.4e17;

function GuessFigure() {
  const [sid, setSid] = useState('rand8');
  const s = SECRETS.find((x) => x.id === sid)!;
  return (
    <Figure
      no={1}
      title="비밀번호 하나를 맞히는 데 드는 시간"
      hint="비밀번호 종류를 바꿔 보세요"
      caption={
        <>
          무작위로 고른 비밀번호는 경우의 수의 절반을 시도하면 평균적으로 맞힙니다. 막대 길이는 걸리는 시간의 로그 눈금으로, 오른쪽 끝이 우주의 나이(약 4.4×10¹⁷초)입니다. 오프라인 속도는 <a href={lessonHref('net-security', 'web-security')}>웹 보안</a> 장과 같은 어림값(빠른 해시 초당 10¹⁰번, 느린 해시 초당 10⁴번)이고 실제 측정값이 아닙니다.
        </>
      }
    >
      <Seg value={sid} onChange={setSid} options={SECRETS.map((x) => ({ value: x.id, label: x.label }))} />
      <div className="au-secret">
        <span>{s.note}</span>
        <span className="mono">
          경우의 수 {s.space.toExponential(2).replace('e+', '×10^')} · {bits(s.space).toFixed(1)}비트
        </span>
      </div>
      <div className="au-bars">
        {SETTINGS.map((g) => {
          const sec = avgSeconds(s.space, g.rate);
          const w = Math.max(1, Math.min(100, (Math.log10(Math.max(sec, 1e-9)) + 9) / (Math.log10(UNIVERSE) + 9) * 100));
          const safe = sec > 86400 * 365 * 100;
          return (
            <div key={g.id} className="au-bar-row">
              <div className="au-bar-label">
                <strong>{g.label}</strong>
                <span>{g.note}</span>
              </div>
              <div className="au-bar-track" aria-hidden="true">
                <div className="au-bar" data-safe={safe || undefined} style={{ width: `${w}%` }} />
              </div>
              <span className="au-bar-time mono" data-safe={safe || undefined}>
                {humanTime(sec)}
              </span>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: credential stuffing ─────────────── */

const N_USERS = 1000;
const HAS_ACCOUNT = 0.4;
const IPS = 500;
const IP_LIMIT = 5;

function StuffingFigure() {
  const P = usePalette();
  const [reuse, setReuse] = useState(0.5);
  const [mfa, setMfa] = useState(0);
  const [ipLimit, setIpLimit] = useState(false);
  const [seed, setSeed] = useState(1);
  const res = useMemo(() => stuffing(N_USERS, HAS_ACCOUNT, reuse, mfa, IPS, IP_LIMIT, seed), [reuse, mfa, seed]);
  const color = { none: P.surface2, differ: P.lineStrong, mfa: P.good, in: P.bad } as const;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cols = 40, rows = N_USERS / cols;
      const cell = Math.min(w / cols, h / rows);
      const ox = (w - cell * cols) / 2;
      const r = Math.max(1.5, cell * 0.36);
      res.outcomes.forEach((o, i) => {
        const x = ox + (i % cols) * cell + cell / 2;
        const y = Math.floor(i / cols) * cell + cell / 2;
        ctx.fillStyle = color[o];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    [P, res],
    { aspect: 40 / 25, maxHeight: 340, minHeight: 60 },
  );

  return (
    <Figure
      no={2}
      title="한 사이트의 유출이 다른 사이트로 번지는 길"
      hint="재사용 비율과 다중 인증을 바꿔 보세요"
      caption={
        <>
          가상의 게임 포럼에서 회원 {N_USERS.toLocaleString('ko-KR')}명의 이메일과 비밀번호가 유출되었습니다. 공격자는 이 목록을 동네 도서관 서비스의 로그인 화면에 한 번씩 넣어 봅니다. 점 하나가 유출된 회원 한 명이고, 그중 {Math.round(HAS_ACCOUNT * 100)}%가 도서관에도 계정이 있다고 가정했습니다. 공격자는 시도를 IP 주소 {IPS}개에 나눠 보냅니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`유출된 회원 ${N_USERS}명 중 ${res.inCount}명의 도서관 계정이 넘어갔고, ${res.mfaCount}명은 다중 인증 덕분에 막혔고, ${res.differCount}명은 비밀번호가 달랐고, ${res.noneCount}명은 도서관 계정이 없었습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="au-reuse" label="같은 비밀번호를 쓰는 비율" value={reuse} min={0} max={1} step={0.05} onChange={setReuse} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider id="au-mfa" label="다중 인증을 켠 회원" value={mfa} min={0} max={1} step={0.05} onChange={setMfa} format={(v) => `${Math.round(v * 100)}%`} />
          <Check label={`IP 주소마다 ${IP_LIMIT}번까지만 허용`} checked={ipLimit} onChange={setIpLimit} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 회원 명단
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="넘어간 계정" value={`${res.inCount}개`} color="var(--bad)" />
            <Readout label="다중 인증에 막힘" value={`${res.mfaCount}개`} color="var(--good)" />
            <Readout label="비밀번호가 다름" value={`${res.differCount}개`} />
            <Readout label="도서관 계정 없음" value={`${res.noneCount}개`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '로그인 성공 (계정 탈취)' },
          { color: 'var(--good)', label: '비밀번호는 맞았지만 다중 인증에 막힘' },
          { color: 'var(--line-strong)', label: '비밀번호가 다름' },
          { color: 'var(--surface-2)', label: '도서관 계정 없음' },
        ]}
      />
      <div className="ss-note" aria-live="polite">
        {ipLimit
          ? `IP 주소마다 ${IP_LIMIT}번 제한을 켰지만, 공격자는 IP 주소 하나로 ${res.perIp}번만 시도하므로 막힌 시도는 ${res.blockedByIpLimit}번입니다. 결과는 그대로입니다.`
          : `시도 ${res.tried.toLocaleString('ko-KR')}번 중 ${res.inCount}번이 성공했습니다. 공격자는 비밀번호를 하나도 추측하지 않았습니다.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: TOTP, one step at a time ─────────────── */

function TotpFigure() {
  const [secret, setSecret] = useState(RFC_SECRET);
  const [mode, setMode] = useState<'rfc' | 'now'>('rfc');
  const [digits, setDigits] = useState<6 | 8>(8);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [st, setSt] = useState<TotpSteps | null>(null);
  const [err, setErr] = useState('');
  const t = mode === 'rfc' ? RFC_T : now;

  useEffect(() => {
    if (mode !== 'now') return;
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    let live = true;
    if (!globalThis.crypto?.subtle) {
      setErr('이 브라우저에서는 WebCrypto를 쓸 수 없어 계산하지 못했습니다. HTTPS로 연 페이지에서 다시 시도해 보세요.');
      return;
    }
    totp(utf8(secret), t, digits)
      .then((r) => live && (setSt(r), setErr('')))
      .catch(() => live && setErr('HMAC 계산에 실패했습니다.'));
    return () => {
      live = false;
    };
  }, [secret, t, digits]);

  const left = 30 - (t % 30);
  const rfcMatch = st && secret === RFC_SECRET && t === RFC_T && (digits === 8 ? st.code === RFC_CODE8 : st.code === RFC_CODE8.slice(2));

  return (
    <Figure
      no={3}
      title="6자리 코드는 이렇게 만들어진다 (TOTP)"
      hint="비밀 값과 시각을 바꿔 보세요"
      caption={
        <>
          HMAC-SHA1은 이 브라우저의 WebCrypto로 실제로 계산합니다. 처음 값은 RFC 6238 부록 B의 시험값(비밀 값 "12345678901234567890", 시각 59초, 8자리)이고, 표준이 적어 둔 답 {RFC_CODE8}과 비교합니다. 실제 인증 앱은 보통 6자리를 쓰고, 비밀 값은 가입할 때 QR 코드로 받은 무작위 바이트입니다.
        </>
      }
    >
      <div className="controls row">
        <label className="au-input">
          <span>비밀 값 (서버와 휴대폰이 나눠 가짐)</span>
          <input value={secret} onChange={(e) => setSecret(e.target.value)} spellCheck={false} />
        </label>
        <Seg value={mode} onChange={setMode} options={[{ value: 'rfc' as const, label: '시험값 t = 59' }, { value: 'now' as const, label: '지금 시각' }]} label="시각" />
        <Seg value={digits} onChange={setDigits} options={[{ value: 6 as const, label: '6자리' }, { value: 8 as const, label: '8자리' }]} label="자릿수" />
      </div>
      {err ? (
        <div className="ss-note" data-bad="">
          {err}
        </div>
      ) : st ? (
        <ol className="au-steps">
          <li>
            <span className="au-step-h">시간 칸 번호</span>
            <span className="mono">
              ⌊{t} ÷ 30⌋ = {st.step}
            </span>
            <span className="au-bytes mono">{Array.from(st.counter, (b) => b.toString(16).padStart(2, '0')).join(' ')}</span>
            {mode === 'now' && (
              <span className="au-countdown" aria-label={`이 코드는 ${left}초 뒤에 바뀝니다`}>
                <span style={{ width: `${(left / 30) * 100}%` }} />
                <em>{left}초 남음</em>
              </span>
            )}
          </li>
          <li>
            <span className="au-step-h">HMAC-SHA1(비밀 값, 시간 칸)</span>
            <span className="au-bytes mono">
              {Array.from(st.mac, (b, i) => (
                <span key={i} data-pick={i >= st.offset && i < st.offset + 4 ? '' : undefined} data-last={i === st.mac.length - 1 ? '' : undefined}>
                  {b.toString(16).padStart(2, '0')}
                </span>
              ))}
            </span>
            <span className="ss-small">
              마지막 바이트 {st.mac[19].toString(16).padStart(2, '0')}의 끝자리 {(st.mac[19] & 15).toString(16)} → 위치 {st.offset}부터 4바이트를 고릅니다.
            </span>
          </li>
          <li>
            <span className="au-step-h">4바이트를 수로</span>
            <span className="mono">
              {hex(st.picked)} → 맨 앞 비트 지우기 → {st.value.toLocaleString('ko-KR')}
            </span>
          </li>
          <li>
            <span className="au-step-h">끝 {digits}자리</span>
            <span className="mono">
              {st.value} mod 10^{digits} =
            </span>
            <strong className="au-code mono">{st.code}</strong>
            {secret === RFC_SECRET && t === RFC_T && <span className="au-match" data-ok={rfcMatch || undefined}>{rfcMatch ? `RFC 6238의 값 ${digits === 8 ? RFC_CODE8 : RFC_CODE8.slice(2)}과 같습니다` : '표준의 값과 다릅니다'}</span>}
          </li>
        </ol>
      ) : (
        <div className="ss-note">계산 중…</div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 4: phishing relay vs passkey ─────────────── */

type Method = 'pw' | 'totp' | 'passkey';
type Lane = 'user' | 'fake' | 'real';
interface Msg {
  from: Lane;
  to: Lane;
  text: string;
  bad?: boolean;
  good?: boolean;
}

const LANE_KO: Record<Lane, string> = { user: '회원의 브라우저', fake: 'library-login.example (가짜)', real: 'library.example (진짜)' };

const OPEN: Msg[] = [
  { from: 'user', to: 'fake', text: '"반납 기한이 지났습니다" 메일의 링크를 눌러 들어감. 주소가 진짜와 비슷하다' },
  { from: 'fake', to: 'user', text: '진짜와 똑같이 생긴 로그인 화면' },
];

const SCRIPTS: Record<Method, Msg[]> = {
  pw: [
    ...OPEN,
    { from: 'user', to: 'fake', text: '아이디와 비밀번호 입력' },
    { from: 'fake', to: 'real', text: '받은 아이디와 비밀번호로 그대로 로그인' },
    { from: 'real', to: 'fake', text: '로그인 성공, 세션 쿠키 발급', bad: true },
  ],
  totp: [
    ...OPEN,
    { from: 'user', to: 'fake', text: '아이디와 비밀번호 입력' },
    { from: 'fake', to: 'real', text: '받은 아이디와 비밀번호로 로그인' },
    { from: 'real', to: 'fake', text: '"인증 앱의 6자리 코드를 입력하세요"' },
    { from: 'fake', to: 'user', text: '똑같은 코드 입력 화면을 보여 줌' },
    { from: 'user', to: 'fake', text: '휴대폰 앱의 코드 입력 (아직 30초 안)' },
    { from: 'fake', to: 'real', text: '받은 코드를 곧바로 전달' },
    { from: 'real', to: 'fake', text: '코드가 맞음. 로그인 성공, 세션 쿠키 발급', bad: true },
  ],
  passkey: [
    ...OPEN.slice(0, 1),
    { from: 'fake', to: 'real', text: '패스키 로그인 시작' },
    { from: 'real', to: 'fake', text: '무작위 챌린지 "c-7f3a" 발급' },
    { from: 'fake', to: 'user', text: '받은 챌린지로 패스키 로그인 요청' },
    { from: 'user', to: 'user', text: '브라우저가 챌린지와 이 페이지의 실제 출처를 함께 서명' },
    { from: 'user', to: 'fake', text: '서명 전달' },
    { from: 'fake', to: 'real', text: '받은 서명을 그대로 전달' },
    { from: 'real', to: 'fake', text: '서명은 맞지만 출처가 다름. 로그인 거부', good: true },
  ],
};

const LANES: Lane[] = ['user', 'fake', 'real'];

function RelayFigure() {
  const [method, setMethod] = useState<Method>('totp');
  const script = SCRIPTS[method];
  const s = useStepper(script.length, 1, method, true);
  const [proof, setProof] = useState<{ a: Assertion; v: Verdict } | null>(null);
  const [cryptoErr, setCryptoErr] = useState(false);

  useEffect(() => {
    let live = true;
    if (!globalThis.crypto?.subtle) {
      setCryptoErr(true);
      return;
    }
    (async () => {
      const kp = await makeKeyPair();
      const a = await sign(kp.privateKey, 'c-7f3a', FAKE_ORIGIN);
      const v = await verify(kp.publicKey, a, 'c-7f3a', REAL_ORIGIN);
      if (live) setProof({ a, v });
    })().catch(() => live && setCryptoErr(true));
    return () => {
      live = false;
    };
  }, []);

  const shown = script.slice(0, s.i + 1);
  const last = shown[shown.length - 1];

  return (
    <Figure
      no={4}
      title="가짜 사이트가 중간에서 전달할 때"
      hint="인증 방법을 바꿔 한 단계씩 따라가 보세요"
      caption={
        <>
          공격자의 가짜 사이트가 회원과 진짜 사이트 사이에 서서 메시지를 실시간으로 옮깁니다. 패스키 단계의 서명은 이 브라우저의 WebCrypto로 실제로 만든 ECDSA P-256 서명이고, 진짜 사이트가 같은 공개 키로 검증합니다. 실제 브라우저는 출처가 다르면 library.example의 패스키를 아예 꺼내 주지 않으므로, 서명 검사는 그 위에 한 겹 더 있는 방어입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={method} onChange={setMethod} options={[{ value: 'pw' as const, label: '비밀번호' }, { value: 'totp' as const, label: '비밀번호 + TOTP' }, { value: 'passkey' as const, label: '패스키' }]} />
      </div>
      <div className="au-seq" role="list" aria-label="주고받은 메시지">
        <div className="au-lanes" aria-hidden="true">
          {LANES.map((l) => (
            <span key={l} data-lane={l}>
              {LANE_KO[l]}
            </span>
          ))}
        </div>
        {shown.map((m, i) => {
          const a = LANES.indexOf(m.from), b = LANES.indexOf(m.to);
          const lo = Math.min(a, b), hi = Math.max(a, b);
          return (
            <div key={i} className="au-msg" role="listitem" data-bad={m.bad || undefined} data-good={m.good || undefined} data-now={i === s.i || undefined} style={{ gridColumn: `${lo + 1} / span ${hi - lo + 1}`, gridRow: i + 2 }}>
              <span className="au-arrow" data-self={a === b || undefined} data-rev={b < a || undefined} />
              <span className="au-msg-text">
                <span className="visually-hidden">
                  {LANE_KO[m.from]}에서 {LANE_KO[m.to]}로:{' '}
                </span>
                {m.text}
              </span>
            </div>
          );
        })}
      </div>
      {method === 'passkey' && s.i >= script.length - 1 && (
        <div className="au-proof">
          {cryptoErr || !proof ? (
            <span className="ss-small">{cryptoErr ? '이 브라우저에서는 WebCrypto 서명을 만들 수 없어 결과만 보여 줍니다.' : '서명 계산 중…'}</span>
          ) : (
            <>
              <span className="ss-small">브라우저가 서명한 내용 (clientDataJSON)</span>
              <code className="au-json">{proof.a.clientDataJSON}</code>
              <span className="ss-small mono">서명 {hex(proof.a.signature).slice(0, 32)}… ({proof.a.signature.length}바이트)</span>
              <div className="au-checks">
                <span data-ok={proof.v.signatureOk || undefined}>서명 {proof.v.signatureOk ? '맞음' : '틀림'}</span>
                <span data-ok={proof.v.challengeOk || undefined}>챌린지 {proof.v.challengeOk ? '맞음' : '틀림'}</span>
                <span data-ok={proof.v.originOk || undefined}>출처 {proof.v.originOk ? '맞음' : `틀림: ${proof.a.clientData.origin}`}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="controls">
        <StepControls s={s} id="au-relay" maxSpeed={4} />
      </div>
      <div className="ss-note" data-bad={(s.i === script.length - 1 && last.bad) || undefined} data-good={(s.i === script.length - 1 && last.good) || undefined} aria-live="polite">
        {s.i < script.length - 1 ? `${s.i + 1}단계: ${last.text}` : last.bad ? '공격자가 회원의 계정에 로그인했습니다. 회원이 넘겨준 것은 무엇이든 그대로 다시 쓸 수 있었기 때문입니다.' : '진짜 사이트가 로그인을 거부했습니다. 서명 안에 가짜 사이트의 주소가 들어 있어서, 공격자가 그대로 옮겨도 쓸 수 없습니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Authentication() {
  const sec = (id: string, g: string) => humanTime(avgSeconds(SECRETS.find((x) => x.id === id)!.space, SETTINGS.find((x) => x.id === g)!.rate));
  const base = stuffing(N_USERS, HAS_ACCOUNT, 0.5, 0, IPS, IP_LIMIT, 1);
  const half = stuffing(N_USERS, HAS_ACCOUNT, 0.5, 0.3, IPS, IP_LIMIT, 1);
  return (
    <>
      <h2>누구인지 어떻게 아는가</h2>
      <p>
        <T en="authentication">인증</T>은 상대가 자기가 말한 그 사람이 맞는지 확인하는 일입니다. 확인하는 근거는 세 가지로 나뉩니다. 아는 것(비밀번호), 가진 것(휴대폰, 보안 키), 그리고 몸의 특징(지문, 얼굴)입니다. 웹 서비스는 오랫동안 아는 것 하나, 비밀번호에만 기대 왔습니다. 이 장은 비밀번호가 어떻게 뚫리는지 계산해 보고, 그것을 보완하거나 대신하는 방법을 직접 만들어 봅니다. 서버가 비밀번호를 해시와 솔트로 저장하는 법은 <a href={lessonHref('net-security', 'web-security')}>웹 보안</a> 장에서 다뤘습니다.
      </p>

      <h2>추측은 어디서 하느냐가 더 중요하다</h2>
      <p>
        공격자가 비밀번호를 추측하는 길은 두 가지입니다. 로그인 화면에 하나씩 넣어 보는 <T en="online attack">온라인 공격</T>은 서버가 속도를 제한할 수 있습니다. 반면 데이터베이스가 유출되어 해시를 손에 넣은 뒤 자기 컴퓨터에서 맞혀 보는 <T en="offline attack">오프라인 공격</T>은 아무도 막을 수 없고, 계산 속도만이 한계입니다.
      </p>
      <GuessFigure />
      <p>
        흔한 비밀번호는 어디서든 무너집니다. 상위 1만 개 목록 안의 비밀번호는 계정마다 분당 10번으로 제한해도 평균 {sec('common', 'online')}이면 맞고, 오프라인에서는 느린 해시로도 {sec('common', 'slow')}입니다. 반대로 무작위 8자(소문자와 숫자)는 온라인에서는 사실상 안전하지만, 빠른 해시로 저장된 것이 유출되면 {sec('rand8', 'fast')}이면 맞습니다. 결국 서버는 느린 해시로 저장하고 속도를 제한해야 하고, 사용자는 길고 무작위인 비밀번호를 써야 합니다.
      </p>
      <p>
        길고 무작위인 비밀번호를 기억하기 쉽게 만드는 방법이 <T en="passphrase">패스프레이즈</T>입니다. 단어 7,776개 목록에서 주사위로 단어를 고르면 단어 하나가 log₂ 7,776 ≈ 12.9비트입니다. 단어 4개는 {bits(7776 ** 4).toFixed(1)}비트로 무작위 8자({bits(36 ** 8).toFixed(1)}비트)보다 강하고, 단어 6개는 {bits(7776 ** 6).toFixed(1)}비트로 무작위 12자({bits(62 ** 12).toFixed(1)}비트)보다 강합니다. 여기서 중요한 것은 사람이 아니라 주사위가 골라야 한다는 점입니다. 사람이 고른 단어나 "P@ssw0rd!" 같은 변형은 공격자의 목록에 이미 들어 있습니다.
      </p>

      <h2>한 번의 유출이 모든 곳으로: 크리덴셜 스터핑</h2>
      <p>
        아무리 강한 비밀번호도 여러 사이트에서 함께 쓰면 그중 가장 허술한 사이트만큼만 안전합니다. 공격자는 한 사이트에서 유출된 이메일과 비밀번호 목록을 다른 사이트에 그대로 넣어 봅니다. 이것을 <T en="credential stuffing">크리덴셜 스터핑</T>이라고 합니다.
      </p>
      <StuffingFigure />
      <p>
        처음 설정에서 시도 {N_USERS.toLocaleString('ko-KR')}번 중 {base.inCount}번이 성공합니다. 공격자는 비밀번호를 하나도 추측하지 않았고, 계정마다 딱 한 번만 시도했습니다. 그래서 계정마다 걸어 둔 속도 제한에 걸리지 않고, 시도를 IP 주소 {IPS}개에 나눠 보내니 IP 주소마다 {base.perIp}번뿐이어서 IP 주소별 제한도 소용이 없습니다. 이 공격을 막는 것은 두 번째 요소입니다. 회원의 30%만 다중 인증을 켜도 넘어가는 계정이 {base.inCount}개에서 {half.inCount}개로 줄고, 모두 켜면 0개가 됩니다. 서비스 쪽에서는 가입하거나 비밀번호를 바꿀 때 이미 유출된 비밀번호 목록과 대조해 거절하는 방법도 씁니다.
      </p>

      <h2>휴대폰이 만드는 일회용 코드: TOTP</h2>
      <p>
        인증 앱이 30초마다 바꿔 보여 주는 6자리 코드는 <T en="time-based one-time password">TOTP</T>라는 표준(RFC 6238)으로 만듭니다. 가입할 때 서버와 휴대폰이 비밀 값 하나를 나눠 가지고(보통 QR 코드로), 그 뒤로는 둘 다 현재 시각만 보고 같은 코드를 따로 계산합니다. 통신이 필요 없으니 휴대폰이 비행기 모드여도 됩니다.
      </p>
      <TotpFigure />
      <p>
        계산은 네 단계입니다. 현재 시각을 30초 단위로 잘라 칸 번호를 얻고, 비밀 값을 열쇠로 그 칸 번호의 <a href={lessonHref('net-security', 'symmetric')}>HMAC</a>을 계산합니다. HMAC 결과 20바이트 중 마지막 바이트의 끝자리가 가리키는 위치에서 4바이트를 꺼내 수로 바꾸고(<T en="dynamic truncation">동적 절단</T>), 그 수의 끝 6자리를 씁니다. 처음 설정에서 마지막 바이트가 ab이므로 위치 11에서 c1 39 7e ea를 꺼내고, 맨 앞 비트를 지운 1,094,287,082의 끝 8자리가 표준의 답 94287082와 정확히 같습니다. 비밀 값을 한 글자만 바꿔도 코드가 완전히 달라지는 것을 확인해 보세요.
      </p>
      <p>
        공격자가 비밀번호를 알아도 휴대폰 속 비밀 값이 없으면 코드를 만들 수 없고, 한 번 쓴 코드는 30초 뒤에 쓸모가 없어집니다. 그래서 그림 2의 크리덴셜 스터핑은 막힙니다. 하지만 사람이 코드를 읽고 직접 입력한다는 점이 약점으로 남습니다.
      </p>

      <h2>피싱은 코드도 옮긴다</h2>
      <p>
        가짜 로그인 페이지는 비밀번호만 받아 가지 않습니다. 공격자가 회원과 진짜 사이트 사이에 서서 받은 것을 실시간으로 옮기면, 30초 안에 입력된 코드도 그대로 쓸 수 있습니다. 실제로 이런 중계를 자동으로 해 주는 공격 도구들이 널리 퍼져 있습니다.
      </p>
      <RelayFigure />
      <p>
        비밀번호와 TOTP는 둘 다 "회원이 입력한 값"이라서, 어디에 입력했든 같은 값입니다. <T en="passkey">패스키</T>(표준 이름은 WebAuthn)는 다르게 동작합니다. 가입할 때 기기가 그 사이트만을 위한 <a href={lessonHref('net-security', 'public-key')}>공개 키 쌍</a>을 만들어 공개 키만 서버에 보내고, 로그인할 때는 서버가 보낸 무작위 챌린지에 개인 키로 서명합니다. 이때 브라우저가 서명 안에 <strong>지금 이 페이지의 실제 출처</strong>를 함께 넣습니다. 회원이 가짜 사이트에 있었다면 서명 안에 가짜 주소가 들어가고, 진짜 사이트는 그것을 보고 거부합니다. 회원이 주소를 확인하지 않아도, 확인은 브라우저가 대신 합니다. 개인 키는 기기 밖으로 나가지 않으니 서버가 유출되어도 공개 키만 새어 나갑니다.
      </p>
      <Callout kind="note">
        다중 인증의 강도는 종류에 따라 다릅니다. 문자 메시지 코드는 피싱 중계에 더해 휴대폰 번호를 빼앗는 유심 바꿔치기에도 약하고, 인증 앱의 TOTP는 그보다 낫지만 피싱 중계에는 약합니다. 패스키와 보안 키처럼 출처에 묶인 방식만이 피싱 중계를 구조적으로 막습니다. 그래도 TOTP는 비밀번호만 쓰는 것보다 훨씬 낫습니다. 그림 2처럼 가장 흔한 대량 공격을 막아 주기 때문입니다.
      </Callout>

      <h2>로그인 뒤에는: 세션</h2>
      <p>
        인증은 로그인하는 순간에 한 번 하고, 그 뒤의 요청은 서버가 발급한 <T en="session token">세션 토큰</T>으로 같은 사람임을 확인합니다. 그러니 세션 토큰을 훔치면 비밀번호도 패스키도 필요 없습니다. 토큰은 추측할 수 없는 충분히 긴 무작위 값이어야 하고, 쿠키에 담을 때는 스크립트가 읽지 못하게, HTTPS로만, 다른 사이트에서 온 요청에는 실리지 않게 표시합니다. 로그인하거나 권한이 바뀔 때는 새 토큰을 발급하고, 로그아웃하면 서버에서도 지웁니다.
      </p>
      <Code label="세션 쿠키의 속성">{`
Set-Cookie: session=Vb7m2...Qx9; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
// HttpOnly   스크립트(document.cookie)가 읽지 못한다. XSS로 훔치기 어려워진다
// Secure     HTTPS로만 보낸다
// SameSite   다른 사이트에서 시작한 요청에는 싣지 않는다 (CSRF 방어)
// Max-Age    한 시간 뒤 만료된다`}</Code>

      <Callout kind="key">
        비밀번호는 온라인에서는 속도 제한이, 오프라인에서는 느린 해시와 길고 무작위인 값만이 지켜 주며, 사람이 고른 흔한 비밀번호는 어디서든 무너집니다. 한 사이트의 유출은 비밀번호를 재사용한 사람의 다른 계정으로 번지고(크리덴셜 스터핑), 계정마다 한 번씩만 시도하므로 속도 제한으로는 막기 어렵습니다. TOTP는 공유한 비밀 값과 30초 단위 시각의 HMAC으로 만드는 일회용 코드로 이런 대량 공격을 막지만, 실시간 피싱 중계에는 약합니다. 패스키는 출처가 담긴 챌린지에 기기 속 개인 키로 서명하므로 피싱 사이트로 옮겨도 쓸 수 없습니다.
      </Callout>
      <Quiz
        q="한 회원이 비밀번호와 TOTP를 모두 켜 두었는데도 계정을 빼앗겼다. 기록을 보니 비밀번호와 코드가 모두 맞게 입력되었고, 로그인은 회원이 메일의 링크를 누른 지 20초 뒤 다른 나라의 IP에서 일어났다. 가장 알맞은 설명과 대책은?"
        options={[
          'TOTP 비밀 값이 서버에서 유출되었다. 코드를 8자리로 늘리면 된다',
          '가짜 사이트가 회원이 입력한 비밀번호와 코드를 실시간으로 진짜 사이트에 전달했다. 출처에 묶인 패스키나 보안 키를 쓰게 해야 한다',
          '30초 칸 계산이 틀려 다른 시각의 코드가 받아들여졌다. 칸을 15초로 줄이면 된다',
          '회원의 비밀번호가 짧았다. 비밀번호를 20자 이상으로 바꾸면 된다',
        ]}
        answer={1}
        explain={<>메일 링크를 누르고 20초 만에 맞는 비밀번호와 코드로 로그인했다면 전형적인 피싱 중계입니다. 회원이 가짜 사이트에 입력한 값은 길이나 자릿수와 상관없이 그대로 다시 쓸 수 있습니다. 패스키는 서명에 페이지의 실제 출처를 담기 때문에, 가짜 사이트가 옮긴 서명은 진짜 사이트에서 거부됩니다.</>}
      />
    </>
  );
}

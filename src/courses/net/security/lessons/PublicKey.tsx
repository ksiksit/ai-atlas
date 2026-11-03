import { useMemo, useState } from 'react';
import { Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { StepControls, humanTime, useStepper } from '../../../cs/shared';
import {
  E_CHOICES,
  HOST,
  SCENARIOS,
  SMALL_PRIMES,
  TODAY,
  browserError,
  chainFor,
  digestNum,
  gcd,
  modPow,
  rsaKey,
  sign,
  toyKey,
  trialDivide,
  verify,
  verifyChain,
  type Cert,
  type Check,
  type Scenario,
} from './crypto';
import '../../../cs/algorithms/lessons/algorithms.css';
import '../../../cs/systems/lessons/saving.css';
import './crypto.css';

const n0 = (v: number | bigint) => (typeof v === 'bigint' ? v.toLocaleString('ko-KR') : Math.round(v).toLocaleString('ko-KR'));

/* ─────────────── Figure 1: RSA with numbers small enough to follow ─────────────── */

// key sizes for the attacker's table: odd trial divisors up to √n ≈ 2^(bits/2) / 2, at a billion per second
const SIZES = [32, 64, 128, 256, 2048];

function RsaFigure() {
  const [pi, setPi] = useState(SMALL_PRIMES.indexOf(61));
  const [qi, setQi] = useState(SMALL_PRIMES.indexOf(53));
  const [e, setE] = useState(17);
  const [m, setM] = useState(65);
  const p = SMALL_PRIMES[pi];
  const q = SMALL_PRIMES[qi];
  const phi = (p - 1) * (q - 1);
  const validE = E_CHOICES.filter((x) => p !== q && gcd(BigInt(x), BigInt(phi)) === 1n);
  const eUsed = validE.includes(e) ? e : validE[0];
  const key = eUsed !== undefined ? rsaKey(p, q, eUsed) : null;
  const n = p * q;
  const mm = Math.min(m, n - 1);
  const c = key ? modPow(BigInt(mm), key.e, key.n) : 0n;
  const back = key ? modPow(c, key.d, key.n) : 0n;
  const attack = useMemo(() => trialDivide(BigInt(n)), [n]);

  return (
    <Figure
      no={1}
      title="작은 수로 해 보는 RSA"
      hint="두 소수와 공개 지수 e, 보낼 수 m을 바꿔 보세요"
      caption={<>공개 키는 (n, e), 개인 키는 d입니다. 누구나 공개 키로 암호화할 수 있지만, 복호화에는 d가 필요하고 d를 계산하려면 n을 p와 q로 나눌 줄 알아야 합니다. 오른쪽 아래 표는 공격자가 n을 홀수로 하나씩 나눠 보는 가장 단순한 방법(시행 나눗셈)을 1초에 10억 번 한다고 가정한 시간입니다. 실제 공격은 훨씬 빠른 수체 체(GNFS) 같은 방법을 쓰지만, 2048비트에는 그것으로도 한참 모자랍니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="rsa-steps" aria-live="polite">
            <div>
              <span>① 두 소수</span>
              <span className="mono">
                p = {p}, q = {q}
              </span>
            </div>
            <div>
              <span>② n = p × q</span>
              <span className="mono">n = {n0(n)} (공개)</span>
            </div>
            <div>
              <span>③ φ(n)</span>
              <span className="mono">
                (p−1)(q−1) = {n0(phi)} (비밀)
              </span>
            </div>
            <div>
              <span>④ 공개 지수 e</span>
              <span className="mono">{key ? `e = ${eUsed}, gcd(e, φ) = 1` : '—'}</span>
            </div>
            <div>
              <span>⑤ 개인 키 d</span>
              <span className="mono">{key ? `d = ${n0(key.d)}  (e·d mod φ = ${((key.e * key.d) % key.phi).toString()})` : '—'}</span>
            </div>
            <div>
              <span>암호화</span>
              <span className="mono">{key ? `c = m^e mod n = ${mm}^${eUsed} mod ${n} = ${c}` : '—'}</span>
            </div>
            <div>
              <span>복호화</span>
              <span className="mono" style={{ color: back === BigInt(mm) ? 'var(--good)' : 'var(--bad)' }}>
                {key ? `m = c^d mod n = ${c}^${n0(key.d)} mod ${n} = ${back}` : '—'}
              </span>
            </div>
          </div>
          <div className="rsa-warn">{p === q ? 'p와 q가 같으면 안 됩니다. 다른 소수를 고르세요.' : e !== eUsed && eUsed !== undefined ? `e = ${e}는 φ(n) = ${phi}과 서로소가 아니라 쓸 수 없어서 ${eUsed}를 썼습니다.` : ''}</div>
        </div>
        <div className="controls">
          <Slider id="rsa-p" label="소수 p" value={pi} min={0} max={SMALL_PRIMES.length - 1} step={1} onChange={setPi} format={(i) => String(SMALL_PRIMES[i])} />
          <Slider id="rsa-q" label="소수 q" value={qi} min={0} max={SMALL_PRIMES.length - 1} step={1} onChange={setQi} format={(i) => String(SMALL_PRIMES[i])} />
          <Seg label="공개 지수 e" value={e} onChange={setE} options={E_CHOICES.map((x) => ({ value: x, label: x === 65537 ? '65537' : String(x) }))} />
          <Slider id="rsa-m" label="보낼 수 m (0 ≤ m < n)" value={mm} min={0} max={Math.min(999, n - 1)} step={1} onChange={setM} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="공격자가 찾은 인수" value={String(attack.factor)} color="var(--bad)" />
            <Readout label="나눠 본 횟수" value={`${n0(attack.tries)}번`} />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>n의 크기</th>
                  <th>시행 나눗셈</th>
                </tr>
              </thead>
              <tbody>
                {SIZES.map((b) => (
                  <tr key={b}>
                    <td className="mono">{b}비트</td>
                    <td>{humanTime(2 ** (b / 2 - 1) / 1e9)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: sign with the private key, verify with the public one ─────────────── */

type Tamper = 'none' | 'message' | 'signature' | 'otherKey';
const TAMPER_OPTS: { value: Tamper; label: string }[] = [
  { value: 'none', label: '그대로 전달' },
  { value: 'message', label: '메시지 고치기' },
  { value: 'signature', label: '서명 숫자 고치기' },
  { value: 'otherKey', label: '자기 열쇠로 다시 서명' },
];

function SignatureFigure() {
  const alice = useMemo(() => toyKey('alice'), []);
  const mallory = useMemo(() => toyKey('mallory'), []);
  const [msg, setMsg] = useState('계약서: 3월 1일까지 100만 원을 지급한다');
  const [tamper, setTamper] = useState<Tamper>('message');
  const [forged, setForged] = useState('계약서: 3월 1일까지 900만 원을 지급한다');
  const h = digestNum(msg, alice.n);
  const s = sign(msg, alice);
  const gotMsg = tamper === 'message' || tamper === 'otherKey' ? forged : msg;
  const gotSig = tamper === 'signature' ? s + 1n : tamper === 'otherKey' ? sign(forged, mallory) : s;
  const ok = verify(gotMsg, gotSig, alice);
  const recovered = modPow(gotSig, alice.e, alice.n);
  const expected = digestNum(gotMsg, alice.n);
  const short = (v: bigint) => {
    const t = v.toString();
    return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-6)}` : t;
  };

  return (
    <Figure
      no={2}
      title="전자 서명: 개인 키로 서명하고 공개 키로 확인"
      hint="메시지를 쓰고, 중간에서 무엇을 바꿀지 골라 보세요"
      caption={<>앨리스는 메시지의 SHA-256 값(앞 8바이트를 n으로 나눈 나머지)을 개인 키 d로 거듭제곱해 서명합니다. 받는 쪽은 누구나 아는 앨리스의 공개 키 (n, e)로 서명을 거듭제곱해 메시지의 해시와 비교합니다. 열쇠는 그림 1보다 큰 약 62비트이지만 여전히 장난감이고, 실제 서명은 2048비트 이상의 RSA에 PSS 같은 덧붙이기 방식을 쓰거나 타원 곡선 서명을 씁니다.</>}
    >
      <div className="hm-inputs">
        <div className="ctl">
          <label className="ctl-label" htmlFor="sg-m">
            <span>앨리스가 서명할 메시지</span>
          </label>
          <input id="sg-m" className="text-input" value={msg} maxLength={60} onChange={(e) => setMsg(e.target.value)} />
        </div>
        {(tamper === 'message' || tamper === 'otherKey') && (
          <div className="ctl">
            <label className="ctl-label" htmlFor="sg-f">
              <span>공격자가 바꿔 넣은 메시지</span>
            </label>
            <input id="sg-f" className="text-input" value={forged} maxLength={60} onChange={(e) => setForged(e.target.value)} />
          </div>
        )}
      </div>
      <div className="controls row">
        <Seg label="중간에서" value={tamper} onChange={setTamper} options={TAMPER_OPTS} />
      </div>
      <div className="hm-flow">
        <div className="hm-party">
          <strong>앨리스 (개인 키 d)</strong>
          <span>
            해시 h = <span className="mono">{short(h)}</span>
          </span>
          <span>
            서명 s = h^d mod n = <span className="mono">{short(s)}</span>
          </span>
        </div>
        <div className="hm-party" data-active={tamper !== 'none' || undefined}>
          <strong>중간의 공격자</strong>
          <span>
            {tamper === 'none'
              ? '메시지와 서명을 그대로 전달합니다.'
              : tamper === 'message'
                ? '메시지만 바꾸고 앨리스의 서명은 그대로 붙여 보냅니다.'
                : tamper === 'signature'
                  ? '서명 숫자를 1만큼 바꿉니다.'
                  : '메시지를 바꾸고 자기 개인 키로 새로 서명합니다. 받는 쪽은 앨리스의 공개 키로 확인합니다.'}
          </span>
        </div>
        <div className="hm-party" data-v={ok ? (gotMsg === msg ? 'ok' : 'fooled') : 'bad'}>
          <strong>받는 쪽 (앨리스의 공개 키)</strong>
          <span>
            s^e mod n = <span className="mono">{short(recovered)}</span>
          </span>
          <span>
            받은 메시지의 해시 = <span className="mono">{short(expected)}</span>
          </span>
        </div>
      </div>
      <div className="sg-verdict" data-ok={ok || undefined} aria-live="polite">
        {ok ? (gotMsg === msg ? '서명 확인: 앨리스가 쓴 그대로입니다.' : '서명 확인: 바뀐 메시지가 통과했습니다!') : '서명 불일치: 앨리스가 서명한 메시지가 아니거나 중간에 바뀌었습니다.'}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="n의 크기" value={`${alice.n.toString(2).length}비트`} />
        <Readout label="공개 지수 e" value={alice.e.toString()} />
        <Readout label="개인 키 d를 아는 사람" value="앨리스뿐" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: how a browser checks a certificate chain ─────────────── */

type Field = 'subject' | 'issuer' | 'san' | 'date' | 'ca' | 'pub' | 'sig';
const shortNum = (v: bigint) => {
  const t = v.toString(16);
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
};

function CertCard({ cert, role, store, cur, marks, tampered }: { cert?: Cert; role: string; store?: boolean; cur?: boolean; marks: Partial<Record<Field, 'ok' | 'bad'>>; tampered?: Field }) {
  if (!cert)
    return (
      <div className="cc-card" data-empty>
        <span className="cc-role">{role}</span>
        <span>서버가 보내지 않았습니다.</span>
      </div>
    );
  const row = (f: Field, name: string, value: string) => (
    <div className="cc-field" data-s={marks[f]} data-tampered={tampered === f || undefined}>
      <span>{name}</span>
      <span className={f === 'pub' || f === 'sig' ? 'mono' : undefined}>{value}</span>
    </div>
  );
  return (
    <div className="cc-card" data-store={store || undefined} data-cur={cur || undefined}>
      <span className="cc-role">{role}</span>
      <h4 data-s={marks.subject}>{cert.subject}</h4>
      {row('issuer', '발급자', cert.issuer)}
      {cert.san.length > 0 && row('san', '이름', cert.san.join(', '))}
      {row('date', '유효 기간', `${cert.notBefore} ~ ${cert.notAfter}`)}
      {row('ca', 'CA', cert.ca ? '예' : '아니요')}
      {row('pub', '공개 키', shortNum(cert.pub.n))}
      {row('sig', '서명', shortNum(cert.sig))}
    </div>
  );
}

const FIELD_OF: Record<Check['kind'], Field> = { name: 'san', date: 'date', sig: 'sig', ca: 'ca', anchor: 'subject' };

function ChainFigure() {
  const [sc, setSc] = useState<Scenario>('ok');
  const setup = useMemo(() => chainFor(sc), [sc]);
  const res = useMemo(() => verifyChain(setup), [setup]);
  const s = useStepper(res.checks.length + 1, 1.5, sc, true, true);
  const done = res.checks.slice(0, s.i);
  const current = s.i > 0 ? res.checks[s.i - 1] : undefined;
  const finished = s.i >= res.checks.length;
  const failed = res.checks.find((c) => !c.ok);

  // three columns: what the server sent (leaf, next) and the root the browser already has
  const leaf = setup.sent[0];
  const second = setup.sent[1];
  const root = setup.store[0];
  const cards: { cert?: Cert; role: string; store?: boolean }[] = [
    { cert: leaf, role: '서버 인증서' },
    { cert: second, role: second && second.issuer === second.subject ? '서버가 보낸 루트' : '중간 인증서' },
    { cert: root, role: '신뢰 저장소의 루트', store: true },
  ];
  const marksFor = (cert?: Cert) => {
    const m: Partial<Record<Field, 'ok' | 'bad'>> = {};
    if (!cert) return m;
    for (const c of done) {
      if (res.chain[c.at] !== cert) {
        // a signature check also uses the issuer's public key
        if (c.kind === 'sig' && res.chain[c.at]?.issuer === cert.subject && cert.pub) m.pub = c.ok ? 'ok' : 'bad';
        continue;
      }
      m[FIELD_OF[c.kind]] = c.ok ? 'ok' : 'bad';
    }
    return m;
  };
  const curCert = current ? res.chain[current.at] : undefined;
  const err = browserError(failed);

  return (
    <Figure
      no={3}
      title="브라우저가 인증서 사슬을 확인하는 순서"
      hint="상황을 고르고 한 단계씩 따라가 보세요"
      caption={<>브라우저가 <span className="mono">https://{HOST}</span>에 접속해 서버가 보낸 인증서를 확인합니다. 그림 속 오늘은 {TODAY}입니다. 인증 기관 이름은 지어낸 것이고, 서명은 그림 2와 같은 장난감 RSA로 실제로 계산해 확인합니다. "내용 변조"는 공격자가 자기 도메인용으로 정당하게 받은 인증서의 이름을 고친 경우, "모르는 루트"는 공격자가 직접 만든 루트로 서명한 경우입니다. 초록색은 통과한 칸, 빨간색은 실패한 칸, 물결 밑줄은 서명한 뒤 고쳐진 칸입니다.</>}
    >
      <div className="controls row">
        <Seg label="상황" value={sc} onChange={setSc} options={SCENARIOS} />
      </div>
      <div className="cc-chain" role="img" aria-label={`인증서 사슬 확인: ${res.ok ? '모든 단계 통과' : `${failed?.title} 단계에서 실패`}`}>
        {cards.map((c, i) => (
          <CertCard key={i} cert={c.cert} role={c.role} store={c.store} cur={!!curCert && curCert === c.cert} marks={marksFor(c.cert)} tampered={c.cert === leaf && setup.tamperedField === 'san' ? 'san' : undefined} />
        ))}
      </div>
      <div className="fig-split">
        <div className="cc-checks" aria-live="polite">
          {res.checks.map((c, i) => (
            <div key={i} className="cc-check" data-ok={i < s.i ? (c.ok ? '1' : '0') : undefined} data-future={i >= s.i || undefined}>
              <span>{i < s.i ? (c.ok ? '✓' : '✗') : '·'}</span>
              <span>
                <strong>{c.title}</strong>
              </span>
              <span>{i < s.i ? c.detail : ''}</span>
            </div>
          ))}
          <div className="cc-browser" style={{ opacity: finished ? 1 : 0.35 }}>
            {finished ? (
              res.ok ? (
                <>
                  <span aria-hidden="true">🔒</span>
                  <span>연결이 안전합니다. 페이지를 엽니다.</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">⚠</span>
                  <span style={{ color: 'var(--bad)', fontWeight: 700 }}>경고: 연결이 비공개로 설정되어 있지 않습니다</span>
                  {err && <span className="mono">{err}</span>}
                </>
              )
            ) : (
              <span>확인 중…</span>
            )}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="cc-speed" maxSpeed={4} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function PublicKey() {
  return (
    <>
      <h2>열쇠를 어떻게 나눠 가질까</h2>
      <p>
        <a href="#net-security/symmetric">앞 장</a>의 대칭 암호는 두 사람이 같은 열쇠를 이미 나눠 가졌다고 가정했습니다. 하지만 처음 방문하는 쇼핑몰과 미리 열쇠를 나눠 가진 사람은 없습니다. 열쇠를 인터넷으로 보내면 엿듣는 사람도 그 열쇠를 얻습니다. 사람 n명이 서로 비밀스럽게 대화하려면 짝마다 열쇠가 하나씩, 모두 <M>{'n(n-1)/2'}</M>개가 필요하다는 것도 문제입니다. 이것이 <T en="key distribution problem">열쇠 분배 문제</T>입니다.
      </p>
      <p>
        1976년 디피와 헬만은 처음 만난 두 사람이 공개된 통로에서 수를 주고받기만 해서 둘만 아는 비밀을 만드는 방법을 발표했습니다. 기초 네트워크의 <a href="#net-basics/http">HTTP와 HTTPS</a> 장에서 작은 수로 계산해 본 <T en="Diffie–Hellman key exchange">디피–헬만 키 교환</T>입니다. 같은 논문에서 두 사람은 더 큰 생각도 내놓았습니다. 열쇠를 둘로 나누어, 하나는 모두에게 공개하고 하나는 혼자 간직하는 <T en="public-key cryptography">공개 키 암호</T>입니다.
      </p>
      <ul>
        <li>
          <T en="public key">공개 키</T>로 잠근 것은 짝이 되는 <T en="private key">개인 키</T>로만 열 수 있다. 누구나 내게 비밀 메시지를 보낼 수 있다.
        </li>
        <li>
          개인 키로 만든 <T en="digital signature">서명</T>은 공개 키로 누구나 확인할 수 있다. 서명은 나만 만들 수 있다.
        </li>
      </ul>

      <h2>RSA: 곱하기는 쉽고 나누기는 어렵다</h2>
      <p>
        이 생각을 처음 실제 방식으로 만든 것이 1977년 리베스트, 샤미르, 애들먼의 <T en="RSA">RSA</T>입니다. 큰 소수 두 개 p, q를 곱하기는 쉽지만, 곱한 수 n만 보고 p와 q를 되찾기는 매우 어렵다는 사실에 기댑니다. 열쇠는 이렇게 만듭니다.
      </p>
      <MB note="φ(n)은 n보다 작고 n과 서로소인 수의 개수. e·d를 φ(n)으로 나눈 나머지가 1이면 거듭제곱 두 번이 서로를 지운다">{'n = pq,\\quad \\varphi(n) = (p-1)(q-1),\\quad ed \\equiv 1 \\pmod{\\varphi(n)} \\qquad c = m^e \\bmod n,\\quad m = c^d \\bmod n'}</MB>
      <RsaFigure />
      <p>
        기본값은 교과서에 흔히 나오는 예입니다. p = 61, q = 53이면 n = 3,233, φ(n) = 3,120이고, e = 17에 맞는 d는 2,753입니다. m = 65를 암호화하면 <M>{'65^{17} \\bmod 3233 = 2790'}</M>이고, 2790을 d로 거듭제곱하면 65가 돌아옵니다. 공개되는 것은 n과 e뿐이지만, 이렇게 작은 n은 공격자가 3, 5, 7, …로 27번만 나눠 보면 53이 나오고, 그러면 φ(n)과 d를 똑같이 계산할 수 있습니다. 그래서 실제 RSA는 n을 2048비트(십진수 약 617자리) 이상으로 잡습니다. 시행 나눗셈 표에서 보듯 n이 두 배 길어질 때마다 시간은 제곱으로 늘어납니다. 공개된 기록으로는 2020년에 829비트 수(RSA-250)를 수천 CPU 코어·년을 들여 인수분해한 것이 큰 편이고, 2048비트는 아직 아무도 못 했습니다.
      </p>
      <Callout kind="warn" label="교과서 RSA는 그대로 쓰면 안 됩니다">
        위의 계산을 그대로 쓰는 "교과서 RSA"에는 약점이 많습니다. 같은 m은 언제나 같은 c가 되어 그림 2의 ECB처럼 같은 내용인지 드러나고, 암호문에 <M>{'2^e'}</M>를 곱하면 복호화 결과가 2m이 되는 식으로 내용을 몰라도 조작할 수 있습니다(위 예에서 <M>{'2790 \\cdot 2^{17} \\bmod 3233'}</M>을 복호화하면 130). 실제로는 암호화할 때 무작위 덧붙이기(OAEP)를, 서명할 때는 PSS 같은 방식을 함께 씁니다. 그리고 RSA는 느리므로 긴 데이터를 직접 암호화하지 않습니다. 공개 키 암호로는 열쇠를 정하거나 서명만 하고, 데이터는 그 열쇠로 대칭 암호가 맡습니다.
      </Callout>
      <p>
        요즘은 RSA 대신 <T en="elliptic-curve cryptography">타원 곡선 암호</T>(ECC)를 많이 씁니다. 같은 안전성을 훨씬 짧은 열쇠로 얻어서, 256비트 타원 곡선 열쇠가 3072비트 RSA와 비슷한 수준(약 128비트 안전성)으로 평가됩니다. TLS의 키 교환에서 흔히 쓰는 X25519와, 서명에 쓰는 ECDSA, Ed25519가 타원 곡선 방식입니다.
      </p>

      <h2>전자 서명</h2>
      <p>
        RSA를 거꾸로 쓰면 서명이 됩니다. 개인 키 d로 메시지의 해시를 거듭제곱한 값이 서명이고, 누구나 공개 키 e로 서명을 거듭제곱해 해시와 같은지 확인할 수 있습니다. 서명은 MAC과 비슷하지만 결정적인 차이가 있습니다. MAC은 열쇠를 나눠 가진 두 사람 모두 만들 수 있지만, 서명은 개인 키를 가진 한 사람만 만들 수 있고 확인은 누구나 합니다. 그래서 "이 사람이 썼다"는 것을 제3자에게도 보여 줄 수 있습니다.
      </p>
      <SignatureFigure />
      <p>
        메시지를 "100만 원"에서 "900만 원"으로 바꾸면, 앨리스의 서명을 그대로 붙여도 받는 쪽이 계산한 해시와 맞지 않아 걸러집니다. 서명 숫자를 1만 바꿔도 마찬가지입니다. 공격자가 자기 개인 키로 새로 서명하면 서명 자체는 올바르지만, 받는 쪽이 앨리스의 공개 키로 확인하므로 역시 통과하지 못합니다. 그런데 여기에 빈틈이 하나 남아 있습니다. 받는 쪽이 "앨리스의 공개 키"라고 믿은 그 키가 정말 앨리스의 것일까요? 공격자가 처음부터 자기 공개 키를 앨리스의 것이라고 속여 건넸다면 모든 확인이 무의미해집니다.
      </p>

      <h2>인증서: 공개 키에 붙은 신분증</h2>
      <p>
        그 빈틈을 메우는 것이 <T en="certificate">인증서</T>입니다. 인증서는 "이 공개 키는 www.example.com의 것이다"라는 문장에, 모두가 믿는 제3자인 <T en="certificate authority">인증 기관</T>(CA)이 서명한 문서입니다. 웹에서 쓰는 형식은 X.509이고, 이름(SAN), 유효 기간, 공개 키, 발급자, 그리고 발급자의 서명이 들어 있습니다.
      </p>
      <p>
        그러면 CA의 공개 키는 어떻게 믿을까요? 그 키도 다른 CA가 서명한 인증서에 들어 있고, 이렇게 따라 올라가다 보면 스스로 서명한 <T en="root certificate">루트 인증서</T>에 닿습니다. 루트 인증서는 운영체제와 브라우저의 <T en="trust store">신뢰 저장소</T>에 미리 들어 있습니다. 브라우저 회사들은 엄격한 감사와 규칙을 통과한 CA만 이 저장소에 넣고, 규칙을 어긴 CA는 빼 버리기도 합니다. 루트의 개인 키는 오프라인 금고에 두고, 실제 발급은 루트가 서명한 <T en="intermediate certificate">중간 인증서</T>로 합니다.
      </p>
      <ChainFigure />
      <p>
        "정상"에서는 이름, 기간, 서명을 차례로 확인하며 서버 인증서에서 중간 인증서, 다시 신뢰 저장소의 루트까지 올라가 자물쇠가 켜집니다. 나머지 상황은 각각 다른 단계에서 멈춥니다. 기간이 지났거나 이름이 다르면 첫 인증서에서, 이름을 고친 인증서는 서명 확인에서 걸립니다. 서명은 인증서 내용 전체의 해시에 대한 것이므로 한 글자만 바꿔도 맞지 않습니다. 자체 서명 인증서와 공격자가 만든 루트는 사슬 자체는 앞뒤가 맞지만, 끝이 신뢰 저장소에 없어서 거절됩니다. 누구든 스스로 루트 인증서를 만들 수는 있지만 남의 브라우저에 넣을 수는 없기 때문입니다. 중간 인증서를 빠뜨린 것은 서버 설정 실수로 흔히 생기는 일입니다. 브라우저에 따라 빠진 중간 인증서를 스스로 받아 오기도 하지만, 그렇지 않은 프로그램에서는 이 그림처럼 실패합니다.
      </p>
      <Callout kind="note" label="인증서를 둘러싼 장치들">
        <ul>
          <li>
            <strong>Let's Encrypt와 ACME</strong>: 2015년 말부터 무료 인증서를 자동으로 발급하는 CA로, 서버가 그 도메인을 정말 통제하는지 자동으로 확인하는 ACME 프로토콜을 씁니다. 인증서 유효 기간은 90일이고 자동으로 갱신합니다. 웹 인증서의 최대 유효 기간도 브라우저와 CA들의 합의에 따라 앞으로 몇 년에 걸쳐 단계적으로 줄어들 예정이어서, 갱신 자동화는 사실상 필수가 되어 가고 있습니다.
          </li>
          <li>
            <T en="Certificate Transparency">인증서 투명성</T>(CT): CA가 발급한 인증서를 누구나 볼 수 있는 공개 로그에 기록하게 하는 장치입니다. 크롬 같은 브라우저는 로그에 오른 증거가 없는 인증서를 받아들이지 않아서, 어떤 CA가 남의 도메인 인증서를 몰래 발급하면 도메인 주인이 로그를 보고 알아챌 수 있습니다.
          </li>
          <li>
            <strong>폐기</strong>: 개인 키가 유출되면 유효 기간이 남은 인증서도 무효로 해야 합니다. 폐기 목록(CRL)과 OCSP 같은 방식이 있지만 실제로는 잘 작동하지 않는 경우가 많아, 유효 기간을 짧게 하는 쪽으로 무게가 옮겨 가고 있습니다.
          </li>
        </ul>
      </Callout>

      <h2>양자 컴퓨터 이후</h2>
      <p>
        RSA와 타원 곡선 암호는 인수분해와 이산 로그가 어렵다는 데 기댑니다. 1994년 쇼어는 충분히 큰 양자 컴퓨터가 있다면 이 두 문제를 빠르게 풀 수 있다는 알고리즘을 발표했습니다. 아직 그런 양자 컴퓨터는 없지만, 지금 엿들어 저장해 둔 통신을 나중에 풀 수도 있으므로 준비가 시작되었습니다. 미국 NIST는 2024년 양자 컴퓨터로도 풀기 어렵다고 여겨지는 격자 문제에 기반한 키 교환 표준 ML-KEM(FIPS 203)과 서명 표준(FIPS 204 등)을 발표했고, 주요 브라우저는 기존 X25519와 ML-KEM을 함께 쓰는 하이브리드 키 교환을 이미 TLS에 넣었습니다. 대칭 암호와 해시는 양자 컴퓨터의 영향을 훨씬 덜 받아서, 열쇠와 출력을 넉넉히 길게 잡는 것으로 대비합니다.
      </p>

      <Callout kind="key">
        공개 키 암호는 열쇠를 공개 키와 개인 키로 나눠, 미리 열쇠를 나누지 않은 사람끼리도 비밀을 주고받고 서명을 확인하게 합니다. RSA는 n = pq의 인수분해가 어렵다는 데 기대므로 n을 2048비트 이상으로 잡고, 실제로는 OAEP, PSS 같은 덧붙이기와 함께 열쇠 교환과 서명에만 씁니다. 서명은 개인 키로 만들고 공개 키로 누구나 확인하지만, 그 공개 키가 진짜인지는 인증서가 보증합니다. 브라우저는 서버 인증서에서 중간 인증서를 거쳐 신뢰 저장소의 루트까지 이름, 기간, 서명을 하나씩 확인하고, 어느 하나라도 틀리면 연결을 막습니다.
      </Callout>
      <Quiz
        q="공격자가 카페 Wi-Fi에서 www.example.com으로 가는 연결을 가로채, 자기가 직접 만든 루트 CA로 서명한 www.example.com 인증서를 내밀었다. 인증서의 이름과 기간은 모두 맞다. 사용자의 브라우저는 어떻게 반응할까?"
        options={[
          '이름과 기간이 맞으므로 자물쇠를 켜고 접속한다',
          '서명 확인에서 실패한다. 공격자의 루트로 서명했으므로 서명이 수학적으로 틀렸다',
          '인증서 사슬의 서명은 앞뒤가 맞지만, 끝에 있는 루트가 신뢰 저장소에 없으므로 경고를 띄우고 막는다',
          '루트 인증서는 스스로 서명했으므로 언제나 믿을 수 있어 접속한다',
        ]}
        answer={2}
        explain={<>공격자의 루트가 서버 인증서에 서명한 것 자체는 수학적으로 올바르므로 서명 확인은 통과합니다. 문제는 사슬의 끝입니다. 브라우저는 신뢰 저장소에 미리 들어 있는 루트에서 끝나는 사슬만 믿고, 누구나 만들 수 있는 자체 서명 루트는 믿지 않습니다. 그림 3의 "모르는 루트"가 바로 이 경우이고, 크롬이라면 NET::ERR_CERT_AUTHORITY_INVALID 경고가 뜹니다. 그래서 사용자가 경고를 무시하고 넘어가거나, 회사 장비처럼 공격자의 루트가 신뢰 저장소에 설치된 경우가 위험합니다.</>}
      />
    </>
  );
}

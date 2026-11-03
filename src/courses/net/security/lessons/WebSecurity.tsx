import { Fragment, useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { humanTime } from '../../../cs/shared';
import { hex, sha256, utf8 } from '../../shared';
import { CHARSETS, GUESS_RATE, REQ_KINDS, USERS, compileWhere, concatQuery, cookieSent, escapeHtml, exhaustSeconds, originOf, readHtml, siteOf, type ReqKind, type SameSite } from './attacks';
import '../../../cs/algorithms/lessons/algorithms.css';
import '../../../cs/systems/lessons/saving.css';
import './attacks.css';

/* ─────────────── Figure 1: same origin or not ─────────────── */

const ORIGIN_PRESETS: { label: string; a: string; b: string }[] = [
  { label: '경로만 다름', a: 'https://bank.example/login', b: 'https://bank.example/account?id=7' },
  { label: 'http와 https', a: 'https://bank.example/', b: 'http://bank.example/' },
  { label: '하위 도메인', a: 'https://bank.example/', b: 'https://blog.bank.example/' },
  { label: '포트', a: 'https://bank.example/', b: 'https://bank.example:8443/' },
  { label: '다른 사이트', a: 'https://bank.example/', b: 'https://evil.example/' },
];

function OriginFigure() {
  const [a, setA] = useState(ORIGIN_PRESETS[2].a);
  const [b, setB] = useState(ORIGIN_PRESETS[2].b);
  const oa = originOf(a);
  const ob = originOf(b);
  const valid = oa.ok && ob.ok;
  const same = valid && oa.scheme === ob.scheme && oa.host === ob.host && oa.port === ob.port;
  const sameSite = valid && oa.scheme === ob.scheme && siteOf(oa.host) === siteOf(ob.host);
  const parts: { key: 'scheme' | 'host' | 'port'; name: string }[] = [
    { key: 'scheme', name: '스킴' },
    { key: 'host', name: '호스트' },
    { key: 'port', name: '포트' },
  ];
  const show = (o: typeof oa, k: 'scheme' | 'host' | 'port') => (k === 'port' ? `${o.port}${o.portShown ? '' : ' (기본)'}` : o[k]);
  return (
    <Figure
      no={1}
      title="같은 출처일까"
      hint="예시를 고르거나 주소를 직접 고쳐 보세요"
      caption={
        <>
          <T en="origin">출처</T>는 주소의 스킴, 호스트, 포트 세 가지로 정해지며, 셋이 모두 같아야 같은 출처입니다. 경로와 쿼리는 상관없습니다. 포트를 적지 않으면 http는 80, https는 443으로 봅니다. 아래의 "같은 사이트"는 쿠키의 SameSite 속성이 쓰는 더 느슨한 기준으로, 스킴이 같고 등록 가능한 도메인(여기서는 마지막 두 마디, 예: bank.example)이 같으면 같은 사이트입니다.
        </>
      }
    >
      <div className="btn-row" role="group" aria-label="예시">
        {ORIGIN_PRESETS.map((p) => (
          <Button
            key={p.label}
            small
            primary={p.a === a && p.b === b}
            onClick={() => {
              setA(p.a);
              setB(p.b);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="fig-cols">
        <label className="so-url">
          <span className="inj-label">페이지 A</span>
          <input className="text-input mono" type="text" value={a} spellCheck={false} autoComplete="off" onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="so-url">
          <span className="inj-label">페이지 B</span>
          <input className="text-input mono" type="text" value={b} spellCheck={false} autoComplete="off" onChange={(e) => setB(e.target.value)} />
        </label>
      </div>
      {valid ? (
        <div className="so-rows" role="table" aria-label="출처 비교">
          <span className="so-head" role="columnheader"></span>
          {parts.map((p) => (
            <span key={p.key} className="so-head" role="columnheader">
              {p.name}
            </span>
          ))}
          {[
            ['A', oa],
            ['B', ob],
          ].map(([name, o]) => (
            <Fragment key={name as string}>
              <span className="so-head" role="rowheader">
                {name as string}
              </span>
              {parts.map((p) => (
                <span key={p.key} className="so-cell" role="cell" data-same={oa[p.key] === ob[p.key] ? 'yes' : 'no'}>
                  {show(o as typeof oa, p.key)}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="so-verdict" data-v="no">
          http:// 또는 https://로 시작하는 주소를 넣어 주세요.
        </div>
      )}
      {valid && (
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="같은 출처?" value={same ? '예' : '아니요'} color={same ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="같은 사이트? (SameSite 기준)" value={sameSite ? '예' : '아니요'} color={sameSite ? 'var(--good)' : 'var(--bad)'} />
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: a cross-site request and the bank's cookie ─────────────── */

const ATTACKER_HOSTS = [
  { value: 'evil.example', label: 'evil.example' },
  { value: 'blog.bank.example', label: 'blog.bank.example' },
];
const SAMESITES: SameSite[] = ['None', 'Lax', 'Strict'];

function CsrfFigure() {
  const [from, setFrom] = useState('evil.example');
  const [kind, setKind] = useState<ReqKind>('form-post');
  const [ss, setSs] = useState<SameSite>('Lax');
  const [token, setToken] = useState(false);
  const req = REQ_KINDS.find((k) => k.value === kind)!;
  const c = cookieSent(from, 'bank.example', kind, ss);
  const get = req.method === 'GET';
  const line = get ? 'GET /transfer?to=mallory&amount=1000000 HTTP/1.1' : 'POST /transfer HTTP/1.1';
  // the attacker's page cannot read the bank's pages, so it cannot know the token
  const executed = c.sent && !token;
  const outcome = !c.sent ? '로그인하지 않은 요청이라 은행이 거절합니다. 공격 실패.' : token ? '쿠키는 붙었지만 CSRF 토큰이 없어 은행이 거절합니다. 공격 실패.' : '쿠키가 붙어 로그인한 사용자의 요청으로 처리됩니다. 100만 원이 이체됩니다.';
  return (
    <Figure
      no={2}
      title="다른 사이트에서 보낸 요청에 쿠키가 붙을까"
      hint="공격 페이지의 위치, 요청 방식, SameSite를 바꿔 보세요"
      caption={
        <>
          사용자는 bank.example에 로그인해 있고, 브라우저에는 은행의 세션 쿠키가 있습니다. 이 상태로 공격자가 만든 페이지를 열면, 그 페이지가 은행으로 이체 요청을 보내게 할 수 있습니다. 브라우저가 요청에 은행 쿠키를 붙이면 은행은 사용자가 직접 보낸 요청과 구별하지 못합니다. 이것이 <T en="cross-site request forgery">사이트 간 요청 위조(CSRF)</T>입니다. 동일 출처 정책은 공격 페이지가 응답을 <strong>읽는</strong> 것은 막지만, 요청을 <strong>보내는</strong> 것은 막지 않습니다. evil.example은 은행과 다른 사이트이고, blog.bank.example은 출처는 다르지만 같은 사이트입니다. 숨은 폼은 공격 페이지가 열리자마자 스스로 제출되는 폼이고, fetch는 쿠키를 싣는 옵션(<code>credentials: 'include'</code>)을 켠 경우입니다. 그림은 브라우저가 보낼 요청을 보여 줄 뿐 실제로 보내지 않습니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="inj-col">
          <span className="inj-label">브라우저가 bank.example로 보내는 요청</span>
          <pre className="csrf-req" aria-label="보낼 요청">
            {line}
            {'\n'}Host: bank.example{'\n'}Origin: https://{from}
            {'\n'}
            <span className={c.sent ? 'hit' : 'miss'}>Cookie: session=7f3a9c…</span>
            {c.sent ? '' : '   (붙지 않음)'}
            {!get && (
              <>
                {'\n\n'}to=mallory&amount=1000000{token ? '&csrf_token=???' : ''}
              </>
            )}
          </pre>
          <div className="step-note">{c.why}</div>
          <div className="csrf-outcome" data-v={executed ? 'bad' : 'good'} aria-live="polite">
            {outcome}
          </div>
        </div>
        <div className="controls">
          <Seg label="공격 페이지의 위치" value={from} onChange={setFrom} options={ATTACKER_HOSTS} />
          <Seg label="요청을 보내는 방법" value={kind} onChange={setKind} options={REQ_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
          <Seg label="은행 쿠키의 SameSite" value={ss} onChange={setSs} options={SAMESITES.map((v) => ({ value: v, label: v }))} />
          <Check label="은행이 CSRF 토큰을 확인함" checked={token} onChange={setToken} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: injection (simulated, never executed) ─────────────── */

const COMMENT_PRESETS = ['좋은 글 감사합니다!', '<b>정말</b> 좋아요', '<img src=x onerror="alert(document.cookie)">', '<script>alert(1)</script>', '<a href="javascript:alert(1)">이벤트 당첨!</a>'];
const LOGIN_PRESETS: { label: string; u: string; p: string }[] = [
  { label: '정상 로그인', u: 'alice', p: 'sunflower' },
  { label: '틀린 비밀번호', u: 'alice', p: 'tulip' },
  { label: "' OR '1'='1' --", u: "' OR '1'='1' --", p: 'x' },
  { label: "admin' --", u: "admin' --", p: '' },
  { label: "o'brien", u: "o'brien", p: 'pw' },
];
const TEMPLATE_BEFORE = '<p class="comment">';
const TEMPLATE_AFTER = '</p>';

function HtmlPart() {
  const [text, setText] = useState(COMMENT_PRESETS[2]);
  const [escape, setEscape] = useState(false);
  const [csp, setCsp] = useState(false);
  const inserted = escape ? escapeHtml(text) : text;
  const pieces = useMemo(() => readHtml(inserted), [inserted]);
  const dangers = pieces.filter((p) => p.danger);
  const elements = pieces.filter((p) => p.kind === 'tag' && !p.name!.startsWith('/'));
  return (
    <div className="fig-split">
      <div className="inj-col">
        <span className="inj-label">서버가 만든 HTML (노란 부분이 사용자가 쓴 댓글)</span>
        <pre className="inj-src" aria-label="만들어진 HTML">
          {TEMPLATE_BEFORE}
          <span className="user">
            {escape
              ? inserted
              : pieces.map((p, i) =>
                  p.danger ? (
                    <span key={i} className="tag-danger">
                      {p.text}
                    </span>
                  ) : (
                    <Fragment key={i}>{p.text}</Fragment>
                  ),
                )}
          </span>
          {TEMPLATE_AFTER}
        </pre>
        <span className="inj-label">브라우저가 이 HTML을 읽으면 댓글 자리에 생기는 것</span>
        <ul className="inj-nodes">
          {pieces.length === 0 && (
            <li>
              <span className="k">비어 있음</span>
              <span className="v">—</span>
            </li>
          )}
          {pieces
            .filter((p) => !(p.kind === 'tag' && p.name!.startsWith('/')))
            .map((p, i) => (
              <li key={i} data-danger={p.danger ? true : undefined}>
                <span className="k">{p.kind === 'text' ? '글자' : `<${p.name}> 요소`}</span>
                <span className="v">{p.danger ? (csp ? `${p.danger} → CSP가 실행을 막음` : p.danger) : p.kind === 'text' ? p.text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : '모양만 바뀜'}</span>
              </li>
            ))}
        </ul>
      </div>
      <div className="controls">
        <div className="ctl">
          <label className="ctl-label" htmlFor="inj-comment">
            <span>댓글</span>
          </label>
          <input id="inj-comment" className="text-input mono" type="text" value={text} spellCheck={false} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="op-list" role="group" aria-label="댓글 예시">
          {COMMENT_PRESETS.map((c) => (
            <Button key={c} small primary={c === text} onClick={() => setText(c)}>
              <span className="mono">{c.length > 22 ? c.slice(0, 21) + '…' : c}</span>
            </Button>
          ))}
        </div>
        <Seg
          label="댓글을 HTML에 넣는 방법"
          value={escape ? 'esc' : 'raw'}
          onChange={(v) => setEscape(v === 'esc')}
          options={[
            { value: 'raw', label: '그대로 이어 붙이기' },
            { value: 'esc', label: 'HTML 이스케이프' },
          ]}
        />
        <Check label="CSP 헤더: script-src 'self'" checked={csp} onChange={setCsp} />
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="새로 생긴 요소" value={`${elements.length}개`} />
          <Readout label="실행될 스크립트" value={`${csp ? 0 : dangers.length}곳`} color={!csp && dangers.length ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
    </div>
  );
}

function SqlPart() {
  const [u, setU] = useState("' OR '1'='1' --");
  const [p, setP] = useState('x');
  const [bind, setBind] = useState(false);
  const q = concatQuery(u, p);
  const compiled = useMemo(() => compileWhere(q.where), [q.where]);
  const rows = bind ? USERS.filter((r) => r.name === u && r.password === p) : compiled.ok ? USERS.filter(compiled.test) : [];
  const error = !bind && !compiled.ok ? compiled.error : null;
  const who = rows[0];
  const intended = USERS.find((r) => r.name === u && r.password === p);
  const hijack = !!who && who !== intended;
  return (
    <div className="fig-split">
      <div className="inj-col">
        <span className="inj-label">{bind ? '데이터베이스에 보내는 쿼리와 값 (값은 따로 전달됨)' : '데이터베이스에 보내는 쿼리 (노란 부분이 사용자 입력)'}</span>
        <pre className="inj-src" aria-label="쿼리">
          {bind ? (
            <>
              SELECT * FROM users WHERE name = ? AND password = ?{'\n'}
              {'-- 값 1: '}
              <span className="user">{JSON.stringify(u)}</span>
              {'\n-- 값 2: '}
              <span className="user">{JSON.stringify(p)}</span>
            </>
          ) : (
            <>
              {"SELECT * FROM users WHERE name = '"}
              <span className="user">{u}</span>
              {"' AND password = '"}
              <span className="user">{p}</span>
              {"'"}
            </>
          )}
        </pre>
        <div className="tbl-wrap">
          <table className="tbl sql-tbl">
            <thead>
              <tr>
                <th>id</th>
                <th>name</th>
                <th>password</th>
                <th>role</th>
              </tr>
            </thead>
            <tbody>
              {USERS.map((r) => (
                <tr key={r.id} data-hit={rows.includes(r) ? (r === intended ? 'ok' : 'bad') : undefined}>
                  <td>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.password}</td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="csrf-outcome" data-v={hijack ? 'bad' : 'good'} aria-live="polite">
          {error ? `쿼리 문법 오류(${error}): 로그인 실패. 오류 메시지를 그대로 보여 주면 공격자에게 단서가 됩니다.` : who ? (hijack ? `비밀번호를 몰라도 ${who.name}(${who.role})으로 로그인됩니다. 일치한 줄 ${rows.length}개 중 첫 줄.` : `${who.name}으로 정상 로그인합니다.`) : '일치하는 사용자가 없어 로그인 실패.'}
        </div>
      </div>
      <div className="controls">
        <div className="ctl">
          <label className="ctl-label" htmlFor="sql-u">
            <span>아이디</span>
          </label>
          <input id="sql-u" className="text-input mono" type="text" value={u} spellCheck={false} autoComplete="off" onChange={(e) => setU(e.target.value)} />
        </div>
        <div className="ctl">
          <label className="ctl-label" htmlFor="sql-p">
            <span>비밀번호</span>
          </label>
          <input id="sql-p" className="text-input mono" type="text" value={p} spellCheck={false} autoComplete="off" onChange={(e) => setP(e.target.value)} />
        </div>
        <div className="op-list" role="group" aria-label="입력 예시">
          {LOGIN_PRESETS.map((x) => (
            <Button
              key={x.label}
              small
              primary={x.u === u && x.p === p}
              onClick={() => {
                setU(x.u);
                setP(x.p);
              }}
            >
              <span className="mono">{x.label}</span>
            </Button>
          ))}
        </div>
        <Seg
          label="쿼리를 만드는 방법"
          value={bind ? 'bind' : 'concat'}
          onChange={(v) => setBind(v === 'bind')}
          options={[
            { value: 'concat', label: '문자열 이어 붙이기' },
            { value: 'bind', label: '매개변수 바인딩' },
          ]}
        />
      </div>
    </div>
  );
}

function InjectionFigure() {
  const [tab, setTab] = useState<'html' | 'sql'>('html');
  return (
    <Figure
      no={3}
      title="데이터가 코드가 될 때"
      hint="댓글과 로그인 입력을 바꾸고, 넣는 방법을 바꿔 보세요"
      caption={
        <>
          두 실험 모두 시뮬레이션입니다. 댓글은 이 페이지에 실제로 넣지 않고, 브라우저가 그 HTML을 읽었다면 무엇이 생겼을지만 글자로 보여 줍니다. 로그인 실험의 사용자 표는 이 그림 안에만 있는 작은 표이고, SQL은 =, AND, OR, NOT, 괄호, 주석(--)만 이해하는 간단한 해석기로 계산합니다. 이 표는 설명을 위해 비밀번호를 그대로 저장한 나쁜 예입니다(그림 4 참고).
        </>
      }
    >
      <Seg
        label="실험"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'html', label: 'HTML 댓글 (XSS)' },
          { value: 'sql', label: 'SQL 로그인 (SQL 삽입)' },
        ]}
      />
      {tab === 'html' ? <HtmlPart /> : <SqlPart />}
    </Figure>
  );
}

/* ─────────────── Figure 4: storing passwords ─────────────── */

const ACCOUNTS = [
  { name: 'alice', pw: 'password123' },
  { name: 'bob', pw: 'sunflower' },
  { name: 'carol', pw: 'password123' },
  { name: 'dave', pw: 'k7#Qm2!vRw9z' },
];
// a precomputed table of common passwords (an attacker builds this once, offline)
const COMMON = ['123456', 'password', 'password123', 'qwerty', 'sunflower', 'iloveyou', 'admin'];
const MIN_LEN = 4;
const MAX_LEN = 16;
// reference durations for the plot
const MARKS: [number, string][] = [
  [1, '1초'],
  [3600, '1시간'],
  [86400 * 365, '1년'],
  [86400 * 365 * 1e6, '100만 년'],
  [4.35e17, '우주의 나이'],
];

function PasswordFigure() {
  const P = usePalette();
  const [len, setLen] = useState(8);
  const [cs, setCs] = useState(62);
  const [salted, setSalted] = useState(false);
  const fast = exhaustSeconds(cs, len, GUESS_RATE.fast);
  const slow = exhaustSeconds(cs, len, GUESS_RATE.slow);

  const rows = useMemo(() => {
    const common = new Map(COMMON.map((c) => [hex(sha256(utf8(c))), c]));
    return ACCOUNTS.map((a) => {
      const salt = hex(sha256(utf8(`salt:${a.name}`))).slice(0, 16); // stands in for 16 random bytes
      const plainHash = hex(sha256(utf8(a.pw)));
      const saltedHash = hex(sha256(utf8(salt + a.pw)));
      return { ...a, salt, plainHash, saltedHash, cracked: !salted && common.has(plainHash) };
    });
  }, [salted]);
  const dupHashes = new Set(rows.map((r) => (salted ? r.saltedHash : r.plainHash)).filter((hsh, i, all) => all.indexOf(hsh) !== i));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yLo = -6;
      const yHi = 26;
      const p = new Plot(ctx, w, h, P, { xMin: MIN_LEN, xMax: MAX_LEN, yMin: yLo, yMax: yHi, pad: { l: 70, r: 14, t: 18, b: 26 } });
      p.grid({ xStep: 2, yStep: 4, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = MIN_LEN; x <= MAX_LEN; x += 2) ctx.fillText(`${x}자`, p.X(x), p.Y(yLo) + 6);
      // reference durations
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const [sec, name] of MARKS) {
        const y = Math.log10(sec);
        p.line(MIN_LEN, y, MAX_LEN, y, alpha(P.ink, 0.35), 1, [4, 4]);
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontBody}`;
        ctx.fillText(name, p.X(MIN_LEN) - 6, p.Y(y));
      }
      const curve = (rate: number, color: string) => p.fn((x) => Math.log10(exhaustSeconds(cs, x, rate)), color, 2.4);
      curve(GUESS_RATE.fast, P.bad);
      curve(GUESS_RATE.slow, P.neg);
      p.line(len, yLo, len, yHi, alpha(P.ink, 0.45), 1.2, [3, 3]);
      p.dot(len, Math.min(yHi, Math.log10(fast)), 5, P.bad, P.surface, 2);
      p.dot(len, Math.min(yHi, Math.log10(slow)), 5, P.neg, P.surface, 2);
      p.text(w < 520 ? '모두 시도하는 시간 (로그 눈금)' : '모든 경우를 시도하는 데 걸리는 시간 (세로는 로그 눈금)', MIN_LEN, yHi, P.ink2, { dx: 4, dy: 2, font: `12px ${P.fontBody}`, base: 'top' });
    },
    [P, cs, len, fast, slow],
    { aspect: 1.9, maxHeight: 320, minHeight: 230 },
  );

  return (
    <Figure
      no={4}
      title="비밀번호를 어떻게 저장해야 할까"
      hint="길이와 문자 종류를 바꾸고, 솔트를 켜 보세요"
      caption={
        <>
          위 그림은 서버의 비밀번호 표가 통째로 유출된 뒤, 공격자가 자기 컴퓨터에서 가능한 비밀번호를 모두 시도하는 데 걸리는 시간입니다. GPU 몇 장으로 빠른 해시(SHA-256 등)는 초당 약 10<sup>10</sup>번, 일부러 느리게 설정한 해시(bcrypt, Argon2id 등)는 초당 약 10<sup>4</sup>번 계산한다고 가정했습니다. 장비와 설정에 따라 자릿수가 한두 개 달라질 수 있는 대략적인 가정입니다. 실제 사람의 비밀번호는 무작위가 아니어서, 흔한 단어부터 시도하면 이보다 훨씬 빨리 풀립니다. 아래 표의 솔트는 설명을 위해 이름에서 만든 값이며, 실제로는 계정마다 무작위로 만듭니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${cs}가지 문자로 된 ${len}자 비밀번호: 빠른 해시로 ${humanTime(fast)}, 느린 해시로 ${humanTime(slow)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="pw-len" label="비밀번호 길이" value={len} min={MIN_LEN} max={MAX_LEN} step={1} onChange={setLen} format={(v) => `${v}자`} />
          <Seg label="쓰는 문자" value={cs} onChange={setCs} options={CHARSETS.map((c) => ({ value: c.value, label: `${c.label} (${c.value})` }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="가능한 비밀번호 수" value={`약 10^${Math.log10(Math.pow(cs, len)).toFixed(1)}`} />
            <Readout label="평문으로 저장했다면" value="유출 즉시" color="var(--bad)" />
            <Readout label="빠른 해시로 저장" value={humanTime(fast)} color="var(--bad)" />
            <Readout label="느린 해시로 저장" value={humanTime(slow)} color="var(--neg)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '빠른 해시 (초당 10¹⁰번)', shape: 'ln' },
          { color: 'var(--neg)', label: '느린 해시 (초당 10⁴번)', shape: 'ln' },
        ]}
      />
      <Check label="계정마다 솔트를 붙여 해시하기" checked={salted} onChange={setSalted} />
      <div className="tbl-wrap">
        <table className="tbl pw-tbl">
          <thead>
            <tr>
              <th>계정</th>
              {salted && <th>솔트</th>}
              <th>{salted ? 'SHA-256(솔트 + 비밀번호) 앞 16자' : 'SHA-256(비밀번호) 앞 16자'}</th>
              <th>미리 계산한 흔한 비밀번호 표</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hsh = salted ? r.saltedHash : r.plainHash;
              return (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  {salted && <td>{r.salt}</td>}
                  <td data-dup={dupHashes.has(hsh) || undefined}>{hsh.slice(0, 16)}</td>
                  <td data-cracked={r.cracked || undefined}>{r.cracked ? `일치: "${r.pw}"` : '찾지 못함'}</td>
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

export default function WebSecurity() {
  return (
    <>
      <h2>브라우저는 여러 사이트를 한꺼번에 연다</h2>
      <p>
        브라우저의 탭 하나에서는 은행 사이트가, 다른 탭에서는 처음 보는 블로그가 열려 있습니다. 블로그의 자바스크립트가 은행 페이지의 잔액을 읽거나, 은행 사이트로 보낸 요청의 응답을 마음대로 읽을 수 있다면 큰일입니다. 이를 막는 브라우저의 기본 규칙이 <T en="same-origin policy">동일 출처 정책</T>입니다. 한 출처에서 온 스크립트는 다른 출처의 문서와 응답을 읽을 수 없습니다.
      </p>
      <OriginFigure />
      <p>
        blog.bank.example과 bank.example은 호스트가 달라 다른 출처입니다. http와 https도, 포트 443과 8443도 다른 출처입니다. 다만 동일 출처 정책이 모든 것을 막지는 않습니다. 다른 출처의 이미지를 화면에 띄우고, 스크립트와 스타일시트를 불러오고, 다른 출처로 폼을 제출하거나 링크로 이동하는 것은 웹이 처음부터 허락해 온 일입니다. 막는 것은 <strong>읽기</strong>입니다. 다른 출처의 응답을 자바스크립트로 읽어야 한다면 서버가 <code>Access-Control-Allow-Origin</code> 같은 응답 헤더로 허락해야 하며, 이를 <T en="cross-origin resource sharing">CORS</T>라고 합니다.
      </p>

      <h2>쿠키와 사이트 간 요청 위조</h2>
      <p>
        <a href="#net-basics/http">HTTP</a>는 요청마다 독립적이므로, 로그인한 상태는 대개 쿠키로 기억합니다. 서버가 <code>Set-Cookie: session=…</code>로 세션 값을 주면, 브라우저는 그 서버로 가는 요청마다 <code>Cookie</code> 헤더에 실어 보냅니다. 문제는 브라우저가 "누가 요청을 시작했는지"와 상관없이 쿠키를 붙여 왔다는 점입니다. 공격자의 페이지가 은행으로 요청을 보내도 쿠키가 붙으면, 은행은 그것을 사용자가 보낸 요청으로 처리합니다.
      </p>
      <CsrfFigure />
      <p>
        SameSite 속성은 이를 브라우저 쪽에서 막습니다. <code>Strict</code>는 다른 사이트에서 시작한 요청에는 쿠키를 붙이지 않고, <code>Lax</code>는 사용자가 링크를 눌러 주소창이 바뀌는 GET 이동에만 붙입니다. 그래서 숨은 폼의 POST, 이미지로 몰래 보내는 요청, fetch는 Lax 쿠키를 싣지 못합니다. 하지만 Lax에서도 링크를 따라간 GET에는 쿠키가 붙으므로, <strong>GET 요청으로는 아무것도 바꾸지 않는다</strong>는 HTTP의 원칙을 지켜야 합니다. 그림에서 GET으로 이체를 받는 은행은 Lax로도 지켜지지 않습니다. Chrome 계열 브라우저는 SameSite를 적지 않은 쿠키를 Lax처럼 다루지만, 모든 브라우저가 그렇지는 않으니 직접 적는 것이 안전합니다.
      </p>
      <p>
        같은 사이트의 다른 하위 도메인은 SameSite로 막을 수 없다는 점도 보세요. blog.bank.example은 bank.example과 다른 출처지만 같은 사이트라서, Strict 쿠키도 붙습니다. 그래서 서버 쪽 방어를 함께 씁니다. 은행이 폼을 보여 줄 때 예측할 수 없는 <T en="CSRF token">CSRF 토큰</T>을 숨은 필드로 넣고, 요청에 같은 토큰이 없으면 거절하는 것입니다. 공격자의 페이지는 동일 출처 정책 때문에 은행의 폼을 읽을 수 없으므로 토큰을 알아낼 방법이 없습니다. 요청의 <code>Origin</code> 헤더를 확인하는 방법도 함께 쓰입니다.
      </p>
      <Callout kind="note">
        쿠키에는 SameSite 말고도 두 가지 속성을 붙여 두는 것이 기본입니다. <code>Secure</code>는 HTTPS 연결에서만 쿠키를 보내게 해, 암호화되지 않은 와이파이에서 쿠키가 엿보이지 않게 합니다. <code>HttpOnly</code>는 자바스크립트가 <code>document.cookie</code>로 쿠키를 읽지 못하게 해, 아래의 XSS가 일어나도 세션 쿠키를 통째로 훔쳐 가지는 못하게 합니다.
      </Callout>

      <h2>데이터가 코드가 될 때: XSS와 SQL 삽입</h2>
      <p>
        웹 공격의 큰 갈래 하나는 사용자가 넣은 <strong>데이터</strong>가 어딘가에서 <strong>코드</strong>로 해석되는 데서 생깁니다. 서버가 댓글을 HTML 사이에 그대로 이어 붙이면, 댓글에 쓴 <code>&lt;img onerror=…&gt;</code>는 글자가 아니라 이미지 요소와 그 이벤트 처리기가 됩니다. 그 페이지를 여는 모든 사람의 브라우저에서 공격자의 스크립트가 그 사이트의 출처로 실행되므로, 동일 출처 정책도 도움이 되지 않습니다. 이것이 <T en="cross-site scripting">사이트 간 스크립팅(XSS)</T>입니다. 댓글처럼 저장되었다가 다른 사람에게 보이면 저장형, 검색어처럼 요청에 담긴 값을 바로 되돌려 보여 주면 반사형이라고 합니다.
      </p>
      <InjectionFigure />
      <p>
        가장 중요한 방어는 데이터를 넣는 자리에 맞게 <T en="output encoding">출력 인코딩</T>을 하는 것입니다. HTML 사이에 넣을 때는 <code>&lt;</code>, <code>&gt;</code>, <code>&amp;</code>, 따옴표를 문자 참조로 바꿉니다. 그러면 브라우저는 그 내용을 태그가 아닌 글자로 읽습니다. React 같은 요즘 프레임워크는 <code>{'{comment}'}</code>처럼 넣은 값을 기본으로 이스케이프하고, 이스케이프를 끄는 기능에는 <code>dangerouslySetInnerHTML</code>처럼 일부러 위험해 보이는 이름을 붙였습니다. 이 사이트의 그림 3도 같은 방식으로 댓글을 글자로만 보여 줍니다. 두 번째 방어선은 <T en="Content Security Policy">CSP</T>입니다. 응답 헤더 <code>Content-Security-Policy: script-src 'self'</code>는 같은 출처의 스크립트 파일만 실행하게 해, 주입된 인라인 스크립트와 이벤트 속성을 막습니다.
      </p>
      <Code label="출력 인코딩: HTML 사이에 넣기 전에">{`
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;')    // &를 가장 먼저 바꿔야 두 번 바뀌지 않는다
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
}`}</Code>
      <p>
        SQL 삽입도 같은 구조입니다. 아이디 칸에 <code>' OR '1'='1' --</code>를 넣으면 따옴표가 문자열을 일찍 닫고, <code>OR '1'='1'</code>이 언제나 참인 조건을 덧붙이고, <code>--</code>가 뒤의 비밀번호 검사를 주석으로 지웁니다. 그림에서 쿼리는 모든 줄과 일치하고, 첫 줄인 관리자로 로그인됩니다. <code>o'brien</code>처럼 평범한 이름도 쿼리를 깨뜨린다는 점에서, 이것이 단순한 입력 검사 문제가 아니라 데이터와 코드를 섞은 설계의 문제임을 알 수 있습니다. 답은 <T en="parameterized query">매개변수 바인딩</T>입니다. 쿼리의 모양은 <code>?</code> 자리표시자로 먼저 정하고, 값은 따로 보내 데이터베이스가 그 값을 언제나 데이터로만 다루게 합니다.
      </p>
      <Code label="매개변수 바인딩 (Node.js의 pg 라이브러리)">{`
// 나쁨: 입력이 쿼리의 일부가 된다
db.query("SELECT * FROM users WHERE name = '" + name + "'");

// 좋음: 쿼리 모양과 값을 따로 보낸다
db.query('SELECT * FROM users WHERE name = $1', [name]);`}</Code>

      <h2>비밀번호는 어떻게 저장해야 할까</h2>
      <p>
        어떤 서비스든 언젠가 데이터베이스가 유출될 수 있다고 가정해야 합니다. 비밀번호를 그대로 저장했다면 유출되는 순간 모든 계정이 넘어가고, 같은 비밀번호를 다른 사이트에서도 쓰는 사람의 계정까지 위험해집니다. 그래서 비밀번호 대신 <a href="#net-security/symmetric">해시</a>를 저장하고, 로그인할 때 입력한 비밀번호의 해시와 비교합니다. 해시에서 비밀번호를 거꾸로 계산할 수는 없으니, 공격자에게 남은 방법은 후보를 하나씩 해시해 보며 맞추는 것뿐입니다.
      </p>
      <PasswordFigure />
      <p>
        여기서 두 가지가 중요합니다. 첫째, SHA-256 같은 일반 해시는 빠르게 만들어졌다는 것이 오히려 약점입니다. 대소문자와 숫자로 된 8자 비밀번호는 모든 경우를 시도해도 빠른 해시로 6시간이면 끝나지만, 초당 10<sup>4</sup>번밖에 계산하지 못하게 느리게 만든 해시로는 692년이 걸립니다. 비밀번호를 위한 해시인 bcrypt, scrypt, Argon2는 계산에 드는 시간(scrypt와 Argon2는 메모리까지)을 설정으로 키울 수 있게 만들었습니다. OWASP는 Argon2id를 먼저 권하고, 쓸 수 없을 때 scrypt나 bcrypt를 권합니다. 로그인 한 번에 수십 밀리초가 드는 것은 사용자에게는 티가 나지 않지만, 수십억 번을 시도해야 하는 공격자에게는 결정적입니다.
      </p>
      <p>
        둘째, <T en="salt">솔트</T>입니다. 솔트 없이 해시하면 같은 비밀번호는 언제나 같은 해시가 되어, 표에서 alice와 carol의 해시가 똑같고, 흔한 비밀번호들의 해시를 미리 계산해 둔 표에서 바로 찾아집니다. 계정마다 무작위 솔트를 붙여 해시하면 같은 비밀번호도 계정마다 해시가 달라지고, 미리 계산한 표는 쓸모가 없어지며, 공격자는 계정마다 따로 시도해야 합니다. 다만 솔트는 표를 무력화할 뿐 한 계정을 맞히는 속도를 늦추지는 못하므로, 느린 해시와 함께 써야 합니다. 앞의 라이브러리들은 솔트를 알아서 만들어 결과에 함께 담아 줍니다.
      </p>
      <Code label="비밀번호 저장 (Node.js의 argon2 라이브러리)">{`
import argon2 from 'argon2';

// 가입: 솔트와 설정값이 결과 문자열에 함께 담긴다
const stored = await argon2.hash(password);   // "$argon2id$v=19$m=65536,t=3,p=4$…"

// 로그인: 같은 솔트와 설정으로 다시 계산해 비교한다
const ok = await argon2.verify(stored, typed);`}</Code>
      <p>
        아무리 잘 저장해도 사용자가 다른 사이트에서 유출된 비밀번호를 다시 쓰면 소용이 없습니다. 그래서 로그인 시도에 <a href="#net-security/ddos">속도 제한</a>을 걸고, 휴대폰의 인증 앱이나 보안 키 같은 <T en="multi-factor authentication">다중 인증</T>을 더합니다. 비밀번호가 새어도 두 번째 요소가 없으면 로그인할 수 없습니다.
      </p>

      <Callout kind="key">
        동일 출처 정책은 다른 출처의 응답을 <strong>읽는</strong> 것을 막지만 요청을 <strong>보내는</strong> 것은 막지 않으므로, 쿠키가 실린 위조 요청(CSRF)은 SameSite 쿠키, CSRF 토큰, Origin 검사로 막고, GET은 상태를 바꾸지 않게 만듭니다. XSS와 SQL 삽입은 데이터가 코드로 해석되어 생기며, 넣는 자리에 맞는 출력 인코딩과 매개변수 바인딩이 근본 방어이고, CSP와 HttpOnly 쿠키가 두 번째 방어선입니다. 비밀번호는 계정마다 솔트를 붙여 Argon2id나 bcrypt 같은 느린 해시로 저장하고, 속도 제한과 다중 인증을 더합니다.
      </Callout>
      <Quiz
        q="쇼핑몰이 게시판 글을 HTML에 그대로 이어 붙여 보여 주고 있어 XSS 취약점이 발견되었다. 세션 쿠키에는 HttpOnly와 SameSite=Strict가 붙어 있다. 개발자는 '쿠키를 못 훔치니 괜찮다'고 말한다. 옳은 판단은?"
        options={[
          '맞다. HttpOnly 덕분에 스크립트가 쿠키를 읽을 수 없으므로 피해가 없다',
          '틀리다. 주입된 스크립트는 쇼핑몰과 같은 출처에서 실행되므로, 쿠키를 읽지 않고도 그 페이지에서 사용자 대신 주문을 넣거나 화면을 바꿔 비밀번호를 입력받을 수 있다. 출력 인코딩으로 고쳐야 한다',
          '틀리다. SameSite=Strict 때문에 오히려 공격자가 쿠키를 더 쉽게 훔친다',
          '맞다. CSRF 토큰만 있으면 XSS로도 요청을 보낼 수 없다',
        ]}
        answer={1}
        explain={
          <>
            HttpOnly는 쿠키 값을 훔쳐 가는 것만 막습니다. XSS로 실행된 스크립트는 쇼핑몰 자신의 출처에서 돌기 때문에, 같은 출처로 요청을 보내면 브라우저가 쿠키를 알아서 붙이고 SameSite도 걸리지 않습니다. 같은 출처이니 페이지의 CSRF 토큰도 읽을 수 있어 토큰 검사도 통과합니다. XSS는 그 사이트의 모든 방어를 안쪽에서 우회하므로, 원인인 출력 인코딩을 고치고 CSP를 더하는 것이 답입니다.
          </>
        }
      />
    </>
  );
}

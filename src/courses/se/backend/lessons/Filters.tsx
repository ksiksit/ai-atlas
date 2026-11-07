import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { FILTERS, GOOD_ORDER, move, REQUESTS, run, START_ORDER, withErrorsAt, type FilterId, type Frame, type Line, type RequestKind, type Run } from './chain';
import '../../basics/lessons/basics.css';
import './backend.css';
import './filters.css';

/* ─────────────── the onion: each filter wraps the rest of the chain ─────────────── */

const ARROW: Record<Line['tone'], string> = { in: '↓', out: '↑', stop: '■', skip: '⤒', catch: '↑', throw: '✕' };

function LineRow({ l }: { l: Line }) {
  return (
    <div className="fl-line" data-tone={l.tone}>
      <span className="fl-step">{l.step}</span>
      <span className="fl-arrow" aria-hidden="true">
        {ARROW[l.tone]}
      </span>
      <span>{l.text}</span>
    </div>
  );
}

function Layer({ frames, i }: { frames: Frame[]; i: number }) {
  const f = frames[i];
  if (!f.reached) {
    const rest = frames.slice(i).map((x) => x.name);
    return (
      <div className="fl-layer" data-skipped>
        <div className="fl-name">실행되지 않음</div>
        <div className="fl-skipped">{rest.join(' · ')}</div>
      </div>
    );
  }
  const isCtl = f.id === 'controller';
  return (
    <div className="fl-layer" data-ctl={isCtl || undefined}>
      <div className="fl-name">
        {f.name}
        {!isCtl && <small>{FILTERS[f.id as FilterId].does}</small>}
      </div>
      {f.enter && <LineRow l={f.enter} />}
      {i + 1 < frames.length && f.enter?.tone === 'in' && <Layer frames={frames} i={i + 1} />}
      {f.exit && <LineRow l={f.exit} />}
    </div>
  );
}

function Onion({ r, label }: { r: Run; label: string }) {
  return (
    <div className="fl-onion" role="img" aria-label={label}>
      <div className="fl-client">브라우저 (https://app.todo.example)</div>
      <Layer frames={r.frames} i={0} />
    </div>
  );
}

function ResponseBox({ r }: { r: Run }) {
  const res = r.response;
  const ok = res.status < 400;
  return (
    <div className="fl-resp" data-tone={ok ? 'good' : 'bad'} aria-live="polite">
      <div className="fl-resp-line">
        HTTP/1.1 {res.status}
        {r.escaped && <span className="fl-tag">톰캣 기본 오류 페이지</span>}
      </div>
      {res.type !== 'none' && <div className="fl-resp-h">Content-Type: {res.type === 'json' ? 'application/json' : 'text/html'}</div>}
      {Object.entries(res.headers).map(([k, v]) => (
        <div key={k} className="fl-resp-h">
          {k}: {v}
        </div>
      ))}
      {res.body && <div className="fl-resp-body">{res.body}</div>}
    </div>
  );
}

function browserView(kind: RequestKind, r: Run): { tone: 'good' | 'bad'; text: string } {
  if (kind === 'preflight') {
    return r.response.status < 300 && r.readable && r.response.headers['Access-Control-Allow-Methods']
      ? { tone: 'good', text: '허락을 받았으니 브라우저가 실제 DELETE 요청을 보냅니다.' }
      : { tone: 'bad', text: 'CORS 오류: 허락을 받지 못해 브라우저가 실제 DELETE를 보내지 않습니다.' };
  }
  if (!r.readable) return { tone: 'bad', text: `CORS 오류: 응답(${r.response.status})이 왔지만 허락 헤더가 없어 브라우저가 화면의 코드에 넘겨주지 않습니다. 화면은 무엇이 잘못됐는지 모릅니다.` };
  if (r.response.type === 'html') return { tone: 'bad', text: '오류 페이지 HTML이 왔습니다. 화면의 코드는 JSON을 기대하다 읽기에 실패합니다.' };
  const s = r.response.status;
  if (s === 401) return { tone: 'good', text: '401을 읽고 로그인 화면으로 보냅니다.' };
  if (s === 404) return { tone: 'good', text: '"할 일 99번이 없습니다"를 띄웁니다.' };
  if (s >= 500) return { tone: 'good', text: '"잠시 후 다시 시도해 주세요"를 띄웁니다.' };
  return { tone: 'good', text: '할 일 3개를 그립니다.' };
}

const KIND_OPTS = (Object.keys(REQUESTS) as RequestKind[]).map((k) => ({ value: k, label: REQUESTS[k].label }));

/* ─────────────── Figure 1: reorder the chain and send requests ─────────────── */

function ChainFigure() {
  const [order, setOrder] = useState<FilterId[]>(START_ORDER);
  const [off, setOff] = useState<FilterId[]>([]);
  const [kind, setKind] = useState<RequestKind>('ok');
  const active = useMemo(() => order.filter((f) => !off.includes(f)), [order, off]);
  const r = useMemo(() => run(active, kind), [active, kind]);
  const req = REQUESTS[kind];
  const view = browserView(kind, r);
  const ran = r.frames.filter((f) => f.reached).length;

  return (
    <Figure
      no={1}
      title="필터 체인을 지나는 요청"
      hint="필터 순서를 바꾸고 요청을 골라 보내 보세요"
      caption={
        <>
          바깥 상자일수록 체인의 앞쪽 필터입니다. 요청은 위에서 아래로 상자를 하나씩 뚫고 들어가 한가운데 컨트롤러에 닿고, 응답은 아래에서 위로 다시 빠져나옵니다. 번호는 실제로 실행된 순서입니다. 회색 점선 상자는 앞의 필터가 체인을 끊어 실행되지 않은 부분이고, 빨간 줄은 예외가 지나가느라 필터의 뒷부분이 건너뛰어진 곳입니다.
        </>
      }
    >
      <div className="fig-split left">
        <div className="controls">
          <Seg label="보낼 요청" value={kind} onChange={setKind} options={KIND_OPTS} />
          <div className="fl-req">
            <code>
              {req.req.method} {req.req.path}
            </code>
            <span>{req.what}</span>
          </div>
          <div className="se-col">
            <span className="se-label">체인 순서 (위가 바깥)</span>
            <ol className="fl-order">
              {order.map((id, i) => (
                <li key={id} data-off={off.includes(id) || undefined}>
                  <Check label={<code>{FILTERS[id].name}</code>} checked={!off.includes(id)} onChange={(v) => setOff(v ? off.filter((x) => x !== id) : [...off, id])} />
                  <span className="fl-move">
                    <Button small onClick={() => setOrder(move(order, i, -1))} disabled={i === 0} label={`${FILTERS[id].name} 위로`}>
                      ↑
                    </Button>
                    <Button small onClick={() => setOrder(move(order, i, 1))} disabled={i === order.length - 1} label={`${FILTERS[id].name} 아래로`}>
                      ↓
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="btn-row">
              <Button
                small
                onClick={() => {
                  setOrder(START_ORDER);
                  setOff([]);
                }}
              >
                처음 순서
              </Button>
              <Button
                small
                onClick={() => {
                  setOrder(GOOD_ORDER);
                  setOff([]);
                }}
              >
                권장 순서
              </Button>
            </div>
          </div>
        </div>
        <div className="se-col">
          <Onion r={r} label={`${req.req.method} ${req.req.path}: ${r.frames.filter((f) => f.reached).map((f) => f.name).join(', ')}이(가) 실행되고 ${r.response.status}로 응답`} />
          <div className="fl-out">
            <div className="se-col">
              <span className="se-label">브라우저가 받은 응답</span>
              <ResponseBox r={r} />
            </div>
            <div className="se-col">
              <span className="se-label">서버 로그 (LoggingFilter)</span>
              <ul className="fl-log">
                {r.log.length ? r.log.map((l, i) => <li key={i}>{l}</li>) : <li data-empty>(기록 없음)</li>}
              </ul>
              <span className="se-label">화면의 코드가 보는 것</span>
              <div className="be-verdict" data-tone={view.tone}>
                <span>{view.text}</span>
              </div>
            </div>
          </div>
          <div className="controls row">
            <Readout label="실행된 층" value={`${ran} / ${r.frames.length}`} />
            <Readout label="컨트롤러까지" value={r.frames[r.frames.length - 1].reached ? '닿음' : '못 닿음'} />
            <Readout label="걸린 시간 (모형)" value={`${r.ms} ms`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: where should the error handler sit? ─────────────── */

const PLACES: { at: number | null; label: string }[] = [
  { at: 0, label: '맨 바깥' },
  { at: 1, label: 'Logging 안쪽' },
  { at: 2, label: 'Timing 안쪽' },
  { at: 3, label: 'Cors 안쪽' },
  { at: 4, label: '맨 안쪽' },
  { at: null, label: '없음' },
];

const SHORT: Record<FilterId, string> = { log: 'Log', timing: 'Time', cors: 'Cors', auth: 'Auth', errors: 'Err' };

function PlacementFigure() {
  const [kind, setKind] = useState<RequestKind>('crash');
  const [pick, setPick] = useState(0);
  const rows = useMemo(() => PLACES.map((p) => ({ ...p, order: withErrorsAt(p.at), r: run(withErrorsAt(p.at), kind) })), [kind]);
  const sel = rows[pick];

  return (
    <Figure
      no={2}
      title="예외 처리기를 어디에 둘까"
      hint="요청을 고르고 표의 줄을 눌러 보세요"
      caption={
        <>
          나머지 네 필터는 권장 순서(Log → Time → Cors → Auth)로 두고, ErrorHandler만 자리를 바꿔 같은 요청을 여섯 번 보낸 결과입니다. 예외는 ErrorHandler를 만나야 응답이 됩니다. 그보다 바깥에 있는 필터는 예외가 아니라 정상 응답을 돌려받고, 안쪽에 있는 필터는 예외가 지나가느라 뒷부분을 건너뜁니다. 고른 줄의 실행 순서는 아래 그림에 있습니다.
        </>
      }
    >
      <div className="se-col">
        <Seg
          label="보낼 요청"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'crash', label: '처리기에서 예외' },
            { value: 'missing', label: '없는 할 일' },
            { value: 'ok', label: '정상' },
          ]}
        />
        <div className="se-scroll">
          <table className="fl-table" aria-label="예외 처리기 위치별 결과">
            <thead>
              <tr>
                <th>ErrorHandler 자리</th>
                <th>체인</th>
                <th>상태</th>
                <th>본문</th>
                <th>로그에 남은 상태</th>
                <th>시간 헤더</th>
                <th>화면이 읽음</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const res = row.r.response;
                const logged = row.r.log.length > 1 ? row.r.log[row.r.log.length - 1].split(' ').pop() : null;
                return (
                  <tr key={row.label} data-pick={i === pick || undefined}>
                    <td>
                      <button type="button" className="fl-rowbtn" aria-pressed={i === pick} onClick={() => setPick(i)}>
                        {row.label}
                      </button>
                    </td>
                    <td className="fl-mono">{row.order.map((f) => SHORT[f]).join(' › ')}</td>
                    <td className="fl-mono" data-tone={res.status < 400 ? 'good' : 'bad'}>
                      {res.status}
                    </td>
                    <td data-tone={res.type === 'html' ? 'bad' : undefined}>{res.type === 'json' ? 'JSON' : res.type === 'html' ? 'HTML 오류 페이지' : '없음'}</td>
                    <td className="fl-mono" data-tone={logged ? undefined : 'bad'}>
                      {logged ?? '기록 안 됨'}
                    </td>
                    <td data-tone={res.headers['X-Response-Time'] ? undefined : 'bad'}>{res.headers['X-Response-Time'] ?? '없음'}</td>
                    <td data-tone={row.r.readable && res.type !== 'html' ? 'good' : 'bad'}>{row.r.readable && res.type !== 'html' ? '예' : '아니요'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Onion r={sel.r} label={`ErrorHandler ${sel.label}: ${sel.r.response.status} 응답`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Filters() {
  return (
    <>
      <h2>모든 요청이 지나는 길목</h2>
      <p>
        할 일 서비스의 TodoController에는 메서드가 여럿 있습니다. 그런데 그 메서드 모두에 똑같이 필요한 일이 있습니다. 들어온 요청을 로그에 남기고, 걸린 시간을 재고, 로그인했는지 확인하고, 다른 출처의 화면이 응답을 읽어도 되는지 알려 주고, 예상 못 한 예외가 나면 깔끔한 오류 응답으로 바꾸는 일입니다. 이것을 메서드마다 적으면 하나를 빼먹는 날이 반드시 옵니다. 로그인 확인을 빼먹은 메서드 하나가 그대로 보안 구멍이 됩니다.
      </p>
      <p>
        그래서 이런 일은 컨트롤러에 닿기 <em>전</em>, 모든 요청이 지나는 길목에 둡니다. 이 길목에 서서 요청을 보고 응답을 고치는 코드를 서블릿 세계에서는 <T en="filter">필터</T>, Express나 Django 같은 다른 프레임워크에서는 <T en="middleware">미들웨어</T>라고 부릅니다. 이름은 달라도 모양은 같습니다. 요청과 "다음으로 넘기는 함수"를 받고, 그 함수를 부를지 말지, 부르기 전과 후에 무엇을 할지를 스스로 정합니다.
      </p>
      <Code label="필터 하나의 모양 (Java)">{`
public void doFilter(Request req, Response res, FilterChain chain) {
    // ① 앞부분: 컨트롤러로 가는 길에 실행된다
    long start = clock.millis();

    chain.doFilter(req, res);   // ② 다음 필터(마지막이면 컨트롤러)로 넘긴다

    // ③ 뒷부분: 응답이 돌아오는 길에 실행된다
    res.setHeader("X-Response-Time", (clock.millis() - start) + "ms");
}`}</Code>
      <p>
        <a href={lessonHref('se-backend', 'aop')}>프록시와 AOP</a>에서 본 어드바이스와 닮았습니다. 둘 다 진짜 일을 감싸고 앞뒤에 코드를 붙입니다. 다른 점은 감싸는 대상입니다. 프록시는 메서드 호출 하나를, 필터는 HTTP 요청 하나 전체를 감쌉니다.
      </p>

      <h2>체인: 넘기기, 끊기, 돌아오며 고치기</h2>
      <p>
        필터가 여러 개면 한 줄로 이어집니다. 첫 필터의 <code>chain.doFilter</code>는 둘째 필터를 부르고, 둘째는 셋째를 부르고, 마지막 필터의 <code>chain.doFilter</code>가 비로소 <a href={lessonHref('se-backend', 'routing')}>디스패처</a>와 컨트롤러를 부릅니다. 각자 처리하거나 다음에 넘기는 이 구조를 <T en="chain of responsibility">책임 연쇄</T>라고 합니다. 호출이 중첩되기 때문에 실행 순서는 양파 껍질 모양이 됩니다. 앞부분은 1 → 2 → 3 순서로, 뒷부분은 거꾸로 3 → 2 → 1 순서로 실행됩니다.
      </p>
      <p>
        필터가 <code>chain.doFilter</code>를 부르지 않으면 체인은 거기서 끊깁니다. 인증 필터가 로그인하지 않은 요청에 401을 쓰고 그냥 돌아오면, 그 안쪽의 필터와 컨트롤러는 실행되지 않습니다. 이것을 <T en="short circuit">단락</T>이라고 합니다. 그래도 바깥쪽 필터의 뒷부분은 실행됩니다. 바깥 필터 입장에서는 <code>chain.doFilter</code>가 평소처럼 돌아왔을 뿐이기 때문입니다.
      </p>
      <p>아래 그림의 체인은 브라우저 안에서 실제로 필터 다섯 개를 차례로 부릅니다(<code>chain.ts</code>). 처음 순서에는 일부러 문제가 몇 개 숨어 있습니다.</p>
      <ChainFigure />
      <Callout kind="key">
        "로그인 안 함"을 보내 보세요. AuthFilter에서 체인이 끊겨 ErrorHandler와 컨트롤러는 실행되지 않지만, 그보다 바깥에 있는 LoggingFilter와 TimingFilter의 뒷부분은 401 응답을 받아 제 일을 합니다. 앞의 필터일수록 더 많은 요청을 봅니다. 그래서 모든 요청을 기록해야 하는 로그는 맨 앞에, 일부 요청만 통과시키는 인증은 뒤쪽에 둡니다.
      </Callout>

      <h2>순서가 중요한 이유</h2>
      <p>
        처음 순서에서는 CorsFilter가 AuthFilter보다 안쪽에 있습니다. 이 순서로 "로그인 안 함"을 보내면 401은 나가지만 <code>Access-Control-Allow-Origin</code> 헤더가 붙지 않습니다. 할 일 화면은 <code>app.todo.example</code>에서, API는 <code>api.todo.example</code>에서 오기 때문에 브라우저는 이 헤더가 없는 응답을 화면의 코드에 넘겨주지 않습니다(<a href={lessonHref('net-security', 'web-security')}>웹 보안</a>의 동일 출처 정책). 화면은 401을 보지 못하니 로그인 화면으로 보내지도 못하고 "네트워크 오류"만 띄웁니다.
      </p>
      <p>
        "CORS 사전 요청"은 더 미묘합니다. 브라우저는 다른 출처에 DELETE를 보내기 전에, 보내도 되는지 OPTIONS 요청으로 먼저 묻습니다. 이 사전 요청에는 쿠키가 실리지 않습니다. 그래서 인증이 CORS보다 앞에 있으면 사전 요청이 401로 막히고, 진짜 DELETE는 영영 보내지지 않습니다. CorsFilter를 AuthFilter 위로 올리면 두 문제가 함께 풀립니다.
      </p>
      <Callout kind="warn">
        순서는 코드 어디에도 눈에 띄게 적혀 있지 않습니다. Spring에서는 <code>@Order</code> 숫자나 등록 순서로 정해지는데, 숫자를 정하지 않은 필터끼리는 순서를 보장하지 않습니다. 필터가 서로에게 기대는 일(인증이 넣어 둔 사용자를 로그가 읽는 일 등)이 있다면 반드시 순서를 명시하세요.
      </Callout>

      <h2>예외를 한곳에서 응답으로</h2>
      <p>
        컨트롤러가 예외를 던지면 그 예외는 <code>chain.doFilter</code>를 거꾸로 거슬러 올라갑니다. 예외가 지나가는 필터는 <code>chain.doFilter</code> 다음 줄, 곧 뒷부분이 실행되지 않습니다. 아무도 잡지 않으면 예외는 끝내 서블릿 컨테이너(톰캣)까지 올라가고, 컨테이너는 Java 예외 이름이 박힌 HTML 오류 페이지를 돌려줍니다. JSON을 기대하는 화면에도, 내부를 감춰야 하는 보안에도 좋지 않습니다.
      </p>
      <p>
        그래서 예외를 잡아 정해진 모양의 JSON으로 바꾸는 <T en="global exception handler">전역 예외 처리기</T>를 둡니다. 문제는 자리입니다. 그림 1의 처음 순서처럼 맨 바깥에 두면 응답은 제대로 된 500 JSON이 되지만, 그 안의 LoggingFilter는 예외가 지나가는 바람에 상태 코드를 기록하지 못합니다. 운영 중 장애를 찾을 때 가장 필요한 "500이 몇 번 났나"가 로그에서 빠집니다.
      </p>
      <PlacementFigure />
      <p>
        표를 위에서 아래로 읽으면 규칙이 보입니다. ErrorHandler가 안쪽으로 갈수록 그 바깥의 필터가 늘고, 그 필터들은 모두 정상 응답처럼 500을 돌려받아 기록하고, 시간을 재고, CORS 헤더를 붙입니다. 맨 안쪽, 곧 컨트롤러 바로 앞이 가장 좋은 자리입니다. "없음" 줄은 아무도 잡지 않을 때입니다. 상태는 똑같이 500이지만 본문은 HTML이고, 어떤 필터도 뒷부분을 실행하지 못합니다.
      </p>
      <Callout kind="note">
        로그 필터의 뒷부분을 <code>try {'{ … }'} finally {'{ … }'}</code>로 감싸면 예외가 지나가도 실행되기는 합니다. 하지만 그 순간 응답의 상태는 아직 아무도 정하지 않아 기본값 200입니다. 로그에는 "200"이 찍히고 사용자는 500을 받습니다. 틀린 기록은 기록이 없는 것보다 나쁩니다. 예외는 안쪽에서 응답으로 바꾸고, 바깥 필터는 완성된 응답을 보게 하는 편이 낫습니다.
      </Callout>

      <h2>Spring에서는</h2>
      <p>Spring 애플리케이션에서 요청이 지나는 길목은 세 층으로 나뉩니다.</p>
      <ul>
        <li>
          <strong>서블릿 필터</strong> (<code>Filter</code>): 디스패처보다 바깥. 모든 요청을 보지만 어느 컨트롤러로 갈지는 아직 모릅니다. 로그, 시간, CORS, 인증이 여기 삽니다.
        </li>
        <li>
          <strong>핸들러 인터셉터</strong> (<code>HandlerInterceptor</code>): 디스패처 안쪽. 핸들러를 고른 뒤라 어떤 컨트롤러 메서드가 불릴지 압니다. <code>preHandle</code>이 앞부분, <code>postHandle</code>과 <code>afterCompletion</code>이 뒷부분입니다.
        </li>
        <li>
          <strong>
            <code>@ControllerAdvice</code>
          </strong>
          : 컨트롤러가 던진 예외를 디스패처 안에서 잡아 응답으로 바꿉니다. 그림 2의 "맨 안쪽" 자리입니다. 그래서 바깥의 필터는 모두 완성된 JSON 응답을 봅니다.
        </li>
      </ul>
      <Code label="LoggingFilter.java와 AuthFilter.java">{`
@Component
@Order(1)                                          // 가장 바깥
public class LoggingFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        log.info("→ {} {}", req.getMethod(), req.getRequestURI());
        chain.doFilter(req, res);
        log.info("← {} {} {}", req.getMethod(), req.getRequestURI(), res.getStatus());
    }
}

@Component
@Order(4)
public class AuthFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        if (req.getSession(false) == null) {
            res.setStatus(401);
            res.setContentType("application/json");
            res.getWriter().write("{\\"error\\":\\"로그인이 필요합니다\\"}");
            return;                                // chain.doFilter를 부르지 않는다: 단락
        }
        chain.doFilter(req, res);
    }
}`}</Code>
      <Code label="ApiExceptionHandler.java와 인터셉터">{`
@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(TodoNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorBody notFound(TodoNotFoundException e) {
        return new ErrorBody("not_found", e.getMessage());
    }

    @ExceptionHandler(Exception.class)               // 나머지 전부
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorBody internal(Exception e) {
        log.error("처리하지 못한 예외", e);            // 내부 내용은 로그에만
        return new ErrorBody("internal", "잠시 후 다시 시도해 주세요");
    }
}

public class AuditInterceptor implements HandlerInterceptor {
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        return true;                                 // false를 돌려주면 여기서 끊긴다
    }
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                                Object handler, Exception ex) {
        audit.record(handler, res.getStatus());      // 예외가 나도 항상 불린다
    }
}`}</Code>
      <p>
        <code>@ControllerAdvice</code>는 디스패처 안에서 일하기 때문에 필터가 던진 예외는 잡지 못합니다. 필터에서 난 예외까지 JSON으로 바꾸려면 맨 앞에 예외를 잡는 필터를 따로 두거나, 필터 안에서 직접 응답을 쓰고 돌아와야 합니다.
      </p>
      <p>
        로그인과 권한은 대개 직접 필터를 쓰지 않고 <T en="Spring Security">Spring Security</T>에 맡깁니다. Spring Security는 서블릿 필터 하나(<code>FilterChainProxy</code>)로 등록되고, 그 안에 다시 자기만의 필터 체인을 둡니다. 세션을 읽는 필터, CSRF 토큰을 검사하는 필터, 로그인 폼을 처리하는 필터, 권한을 검사하는 필터 등 열 개가 넘는 필터가 정해진 순서로 놓여 있고, <code>CorsFilter</code>는 처음부터 인증 필터들보다 앞에 놓입니다. 그림 1에서 우리가 손으로 찾은 순서가 이미 정해져 있는 셈입니다.
      </p>
      <Code label="SecurityConfig.java">{`
@Bean
SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http
        .cors(Customizer.withDefaults())             // CorsFilter: 인증보다 앞
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .anyRequest().authenticated())           // 로그인 안 했으면 여기서 끊긴다
        .exceptionHandling(e -> e
            .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
        .build();
}

# application.yml: 요청마다 보안 필터 체인의 순서와 결과를 로그로 본다
logging.level.org.springframework.security: DEBUG`}</Code>

      <Quiz
        q={
          <>
            필터 순서가 <code>ErrorHandler → LoggingFilter → TimingFilter → AuthFilter → CorsFilter</code>(앞이 바깥)입니다. 로그인한 사용자의 요청에서 컨트롤러가 NullPointerException을 던지면 무슨 일이 일어날까요?
          </>
        }
        options={[
          <>응답은 HTML 오류 페이지이고, 로그에는 500이 남는다</>,
          <>응답은 500 JSON이고, 로그에는 들어온 줄만 있고 상태 코드는 남지 않는다</>,
          <>응답은 500 JSON이고, 로그에도 500이 남는다</>,
          <>AuthFilter가 예외를 401로 바꾼다</>,
        ]}
        answer={1}
        explain={
          <>
            ErrorHandler가 맨 바깥에 있으니 예외는 결국 잡혀 500 JSON이 됩니다. 하지만 거기까지 올라가는 동안 CorsFilter, AuthFilter, TimingFilter, LoggingFilter를 모두 예외로 지나가므로, 넷 다 <code>chain.doFilter</code> 뒤의 코드를 실행하지 못합니다. 로그에는 "→ GET /todos/7/share"만 남고, CORS 헤더도 붙지 않아 브라우저는 이 500조차 화면에 넘겨주지 않습니다. 그림 1의 처음 순서에서 "처리기에서 예외"를 보내 확인해 보세요.
          </>
        }
      />
    </>
  );
}

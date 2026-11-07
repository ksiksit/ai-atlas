import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { dispatch, matchPath, parseRequestLine, reason, ROUTES, score, specificity, type Dispatch, type Param, type Route } from './router';
import '../../basics/lessons/basics.css';
import './backend.css';
import './routing.css';

/* ─────────────── small pieces shared by the figures ─────────────── */

const ANNOT: Record<Param['from'], string> = { path: '@PathVariable', query: '@RequestParam', body: '@RequestBody' };

function signature(r: Route) {
  return `${r.handler}(${r.params.map((p) => `${p.type} ${p.name}`).join(', ')})`;
}

function Response({ d }: { d: Dispatch }) {
  const ok = d.status < 400;
  return (
    <div className="rt-resp" data-tone={ok ? 'good' : 'bad'} aria-live="polite">
      <div className="rt-resp-line">
        HTTP/1.1 {d.status} {reason(d.status)}
      </div>
      {Object.entries(d.headers).map(([k, v]) => (
        <div key={k} className="rt-resp-h">
          {k}: {v}
        </div>
      ))}
      {d.body && <div className="rt-resp-h">Content-Type: {d.body.startsWith('{') || d.body.startsWith('[') ? 'application/json' : 'text/plain'}</div>}
      {d.body && <div className="rt-resp-body">{d.body}</div>}
      {d.exception && <div className="rt-resp-ex">안에서 일어난 일: {d.exception}</div>}
    </div>
  );
}

/* ─────────────── Figure 1: a router you can send requests to ─────────────── */

const PRESETS: { line: string; body?: string; note: string }[] = [
  { line: 'GET /todos/42', note: '경로 변수' },
  { line: 'GET /todos/today', note: '겹치는 패턴' },
  { line: 'GET /todos?done=false&limit=1', note: '쿼리' },
  { line: 'POST /todos', body: '{ "title": "우유 사기" }', note: '본문' },
  { line: 'GET /todos/abc', note: '변환 실패' },
  { line: 'POST /todos/42', note: '메서드 틀림' },
  { line: 'GET /todo/42', note: '오타' },
  { line: 'PUT /todos/7', body: '{ "title": "", "done": true }', note: '검증 실패' },
  { line: 'GET /files/app.js', note: '와일드카드' },
];

function cellFor(d: Dispatch, r: Route) {
  const row = d.rows.find((x) => x.route === r);
  if (!row) return { text: '', tone: 'dim' };
  if (d.chosen === r) return { text: '✓ 선택됨', tone: 'pick' };
  if (row.full) return { text: '✓ 맞지만 덜 구체적', tone: 'dim' };
  if (row.path.ok) return { text: `경로 ✓ · 메서드 ✗`, tone: 'warn' };
  return { text: `✗ ${row.path.why}`, tone: 'dim' };
}

function RouterFigure() {
  const [line, setLine] = useState(PRESETS[0].line);
  const [body, setBody] = useState('');
  const d = useMemo(() => dispatch(ROUTES, line, body), [line, body]);
  const usesBody = d.chosen?.params.some((p) => p.from === 'body') ?? false;

  return (
    <Figure
      no={1}
      title="요청 하나를 핸들러까지"
      hint="예시를 고르거나 요청 줄과 본문을 직접 고쳐 보세요"
      caption={
        <>
          위 표는 할 일 서비스에 등록된 핸들러 매핑 전부입니다. 디스패처는 요청이 올 때마다 이 표를 위에서 아래로 훑어 경로와 메서드가 모두 맞는 줄을 찾고, 둘 이상이면 가장 구체적인 줄을 고릅니다. 왼쪽 아래는 디스패처가 한 일의 기록, 오른쪽 아래는 골라진 메서드의 인자가 요청의 어느 부분에서 왔는지와 실제로 돌아간 응답입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="se-chips" role="group" aria-label="요청 예시">
          {PRESETS.map((p) => (
            <button
              key={p.line + p.note}
              type="button"
              className="se-chip"
              data-on={(p.line === line && (p.body ?? '') === body) || undefined}
              onClick={() => {
                setLine(p.line);
                setBody(p.body ?? '');
              }}
              title={p.note}
            >
              {p.line}
            </button>
          ))}
        </div>
        <div className="rt-inputs">
          <div className="rt-field">
            <label className="se-label" htmlFor="rt-line">
              요청 줄 (메서드와 경로)
            </label>
            <input id="rt-line" className="se-input" value={line} onChange={(e) => setLine(e.target.value)} spellCheck={false} autoComplete="off" />
          </div>
          <div className="rt-field">
            <label className="se-label" htmlFor="rt-body">
              본문 (JSON){!usesBody && body.trim() !== '' && ' · 이 핸들러는 본문을 읽지 않습니다'}
            </label>
            <textarea id="rt-body" className="se-input rt-body" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} rows={2} placeholder="(비어 있음)" />
          </div>
        </div>

        <div className="se-scroll">
          <table className="rt-table" aria-label="핸들러 매핑 표">
            <thead>
              <tr>
                <th>메서드</th>
                <th>패턴</th>
                <th>이 요청과</th>
                <th>핸들러</th>
              </tr>
            </thead>
            <tbody>
              {ROUTES.map((r) => {
                const c = cellFor(d, r);
                return (
                  <tr key={r.method + r.pattern} data-tone={c.tone}>
                    <td>{r.method}</td>
                    <td>{r.pattern}</td>
                    <td className="rt-res">{c.text}</td>
                    <td>{signature(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rt-two">
          <div className="se-col">
            <span className="se-label">디스패처의 기록</span>
            <ol className="rt-steps" aria-label="디스패처가 한 일">
              {d.steps.map((s, i) => (
                <li key={i} data-tone={s.tone}>
                  {s.text}
                </li>
              ))}
            </ol>
          </div>
          <div className="se-col">
            <span className="se-label">인자 바인딩</span>
            {d.chosen && d.chosen.params.length > 0 ? (
              <div className="rt-binds">
                {d.bindings.map((b) => (
                  <div key={b.param.name} className="rt-bind" data-tone={b.error ? 'bad' : 'good'}>
                    <div className="rt-bind-p">
                      {ANNOT[b.param.from]} {b.param.type} {b.param.name}
                    </div>
                    <div className="rt-bind-src">
                      {b.source}: {b.raw === null ? '(없음)' : b.raw.length > 40 ? b.raw.slice(0, 40) + '…' : JSON.stringify(b.raw)}
                    </div>
                    <div className="rt-bind-v">{b.error ? `✗ ${b.error}` : `→ ${b.shown}`}</div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="rt-none">{d.chosen ? '이 핸들러는 인자를 받지 않습니다.' : '골라진 핸들러가 없어 인자를 만들지 않았습니다.'}</span>
            )}
            <Response d={d} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: overlapping patterns ─────────────── */

const OVERLAP: Route[] = [
  { method: 'GET', pattern: '/todos/today', handler: 'todayTodos', params: [] },
  { method: 'GET', pattern: '/todos/{id}', handler: 'getTodo', params: [{ name: 'id', from: 'path', type: 'long' }] },
  { method: 'GET', pattern: '/todos/*', handler: 'todoPage', params: [] },
  { method: 'GET', pattern: '/todos/**', handler: 'todosFallback', params: [] },
  { method: 'GET', pattern: '/**', handler: 'staticFile', params: [] },
];

const PATHS = ['/todos/today', '/todos/42', '/todos/abc', '/todos/42/done', '/todos', '/app.js'];

function OverlapFigure() {
  const [path, setPath] = useState('/todos/today');
  const [on, setOn] = useState<boolean[]>(OVERLAP.map(() => true));
  const routes = useMemo(() => OVERLAP.filter((_, i) => on[i]), [on]);
  const d = useMemo(() => dispatch(routes, `GET ${path}`, ''), [routes, path]);
  const req = parseRequestLine(`GET ${path}`);
  const segs = 'error' in req ? [] : req.segs;

  return (
    <Figure
      no={2}
      title="패턴이 겹칠 때"
      hint="경로를 고르고, 등록할 패턴을 켜고 꺼 보세요"
      caption={
        <>
          다섯 패턴은 모두 GET이라 메서드로는 가를 수 없습니다. 표는 이 경로에 맞는 패턴을 구체적인 순서로 줄 세운 것입니다. 왼쪽 열부터 비교합니다: <code>**</code>로 끝나는 패턴은 무조건 뒤로 가고, 그다음은 점수(변수 하나에 1점, <code>*</code> 하나에 100점)가 낮은 쪽, 그래도 같으면 패턴이 긴 쪽이 이깁니다. 맨 위 줄이 실제로 불립니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="se-chips" role="group" aria-label="경로 예시">
            {PATHS.map((p) => (
              <button key={p} type="button" className="se-chip" data-on={p === path || undefined} onClick={() => setPath(p)}>
                {p}
              </button>
            ))}
          </div>
          <label className="se-label" htmlFor="rt-path">
            GET 뒤의 경로
          </label>
          <input id="rt-path" className="se-input" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} autoComplete="off" />
          <div className="se-scroll">
            <table className="rt-table rt-rank" aria-label="맞는 패턴의 순위">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>패턴</th>
                  <th>** 끝</th>
                  <th>변수</th>
                  <th>*</th>
                  <th>점수</th>
                  <th>길이</th>
                </tr>
              </thead>
              <tbody>
                {d.ranked.map((r, i) => {
                  const s = specificity(r.pattern);
                  return (
                    <tr key={r.pattern} data-tone={i === 0 ? 'pick' : 'dim'}>
                      <td>{i + 1}</td>
                      <td>{r.pattern}</td>
                      <td>{s.catchAll ? '예' : '–'}</td>
                      <td>{s.vars}</td>
                      <td>{s.stars}</td>
                      <td>{score(s)}</td>
                      <td>{s.length}</td>
                    </tr>
                  );
                })}
                {d.ranked.length === 0 && (
                  <tr data-tone="dim">
                    <td colSpan={7}>맞는 패턴이 없습니다</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="be-verdict" data-tone={d.status < 400 ? 'good' : 'bad'} aria-live="polite">
            {d.chosen ? (
              <>
                <span>
                  <strong>{d.chosen.pattern}</strong> → <code className="rt-plain">{d.call ?? signature(d.chosen)}</code>
                </span>
                <span>
                  {d.status} {reason(d.status)}
                  {d.status === 400 && ': 패턴은 골랐지만 인자를 만들지 못했습니다. 다음 순위로 넘어가지 않습니다.'}
                  {d.status === 404 && d.chosen.handler === 'staticFile' && ': 정적 파일 처리기가 받았지만 그런 파일이 없습니다.'}
                </span>
              </>
            ) : (
              <span>
                {d.status} {reason(d.status)}: 등록된 패턴 가운데 이 경로에 맞는 것이 없습니다.
              </span>
            )}
          </div>
        </div>
        <div className="controls">
          <span className="se-label">등록된 GET 패턴</span>
          {OVERLAP.map((r, i) => {
            const m = matchPath(r.pattern, segs);
            return (
              <Check
                key={r.pattern}
                label={
                  <span className="rt-pat">
                    <code>{r.pattern}</code>
                    <small>{m.ok ? '이 경로에 맞음' : '맞지 않음'}</small>
                  </span>
                }
                checked={on[i]}
                onChange={(v) => setOn(on.map((x, j) => (j === i ? v : x)))}
              />
            );
          })}
          <Readout label="맞는 패턴" value={`${d.ranked.length}개`} />
          <Readout label="불린 핸들러" value={d.chosen ? d.chosen.handler : '없음'} color={d.status < 400 ? 'var(--good)' : 'var(--bad)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Routing() {
  return (
    <>
      <h2>모든 요청이 들어오는 하나의 입구</h2>
      <p>
        브라우저나 앱이 할 일 서비스에 보내는 것은 결국 글자 몇 줄입니다. 첫 줄에 메서드와 경로가 있고, 그 아래 헤더가 있고, 빈 줄 다음에 본문이 옵니다. <a href={lessonHref('se-basics', 'http-api')}>HTTP API 설계</a>에서는 이 글자를 어떻게 정할지를 봤습니다. 이 장에서는 반대편, 서버가 이 글자를 받아 어떤 메서드를 부를지 정하는 과정을 봅니다.
      </p>
      <Code label="서버에 실제로 도착하는 요청">{`
PUT /todos/7?notify=false HTTP/1.1
Host: api.todo.example
Content-Type: application/json

{ "title": "우유 사기", "done": true }`}</Code>
      <p>
        요청마다 다른 클래스가 소켓에서 직접 글자를 읽는다면, 헤더를 읽고 JSON을 풀고 오류를 처리하는 코드가 컨트롤러마다 반복됩니다. 그래서 웹 프레임워크는 모든 요청을 먼저 한곳에서 받습니다. 이 입구를 <T en="front controller">프런트 컨트롤러</T>라고 하고, Spring에서는 <T en="DispatcherServlet">디스패처 서블릿</T>이 그 역할을 합니다. 디스패처는 요청을 읽고, 알맞은 메서드를 찾고, 그 메서드의 인자를 만들고, 반환값을 응답으로 바꿉니다. 우리가 쓰는 컨트롤러 메서드는 그 가운데 "찾아서 부르는" 대상일 뿐입니다. <a href={lessonHref('se-backend', 'di')}>의존성 주입</a>에서 본 제어의 역전이 여기서도 그대로입니다. 내가 요청을 읽는 것이 아니라, 프레임워크가 요청을 읽고 나를 부릅니다.
      </p>

      <h2>핸들러 매핑: 메서드와 패턴으로 고르기</h2>
      <p>
        디스패처가 어떤 메서드를 부를지 아는 것은 <T en="handler mapping">핸들러 매핑</T> 덕분입니다. 애플리케이션이 시작할 때 프레임워크는 컨트롤러 클래스를 훑으며 "GET이고 경로가 /todos/{'{id}'} 모양이면 getTodo"처럼 메서드와 경로 패턴, 부를 메서드를 한 줄씩 표에 적어 둡니다. 요청이 오면 이 표에서 맞는 줄을 찾습니다.
      </p>
      <p>경로 패턴은 /로 나눈 칸 하나하나를 비교합니다. 칸에는 세 종류가 있습니다.</p>
      <ul>
        <li>
          <strong>글자 그대로</strong>: <code>todos</code>, <code>today</code>. 요청의 그 칸이 똑같아야 맞습니다.
        </li>
        <li>
          <strong>
            <T en="path variable">경로 변수</T>
          </strong>
          : <code>{'{id}'}</code>. 비어 있지 않은 칸이면 무엇이든 맞고, 그 값을 이름 붙여 꺼내 둡니다.
        </li>
        <li>
          <strong>
            <T en="wildcard">와일드카드</T>
          </strong>
          : <code>*</code>는 아무 칸 하나, <code>**</code>는 남은 칸 전부와 맞습니다. 값에 이름을 붙이지 않습니다.
        </li>
      </ul>
      <p>
        경로가 맞는 줄을 찾아도 끝이 아닙니다. 메서드까지 맞아야 합니다. 그래서 디스패처가 내는 실패는 두 가지로 나뉩니다. 경로가 맞는 줄이 하나도 없으면 <code>404 Not Found</code>, 경로는 맞는데 그 메서드를 받는 줄이 없으면 <code>405 Method Not Allowed</code>입니다. 405 응답에는 어떤 메서드라면 받는지 <code>Allow</code> 헤더로 알려 줍니다. 아래 그림의 라우터는 브라우저 안에서 실제로 이 일을 합니다(<code>router.ts</code>). 요청 줄을 읽고, 표를 훑고, 인자를 만들고, 작은 할 일 저장소에서 메서드를 실행합니다.
      </p>
      <RouterFigure />
      <Callout kind="key">
        <code>POST /todos/42</code>는 404가 아니라 405입니다. 그 주소에 무언가 있기는 하다는 뜻이기 때문입니다. <code>GET /todo/42</code>처럼 경로에 오타가 있으면 그때 404입니다. 상태 코드 하나로 클라이언트 개발자는 "주소가 틀렸다"와 "메서드가 틀렸다"를 가려낼 수 있습니다.
      </Callout>

      <h2>경로 변수, 쿼리, 본문을 인자로</h2>
      <p>
        부를 메서드를 골랐으면 인자를 만들어야 합니다. 요청에 있는 것은 모두 글자지만, 메서드는 <code>long id</code>, <code>Boolean done</code>, <code>TodoForm form</code>처럼 타입이 있는 값을 원합니다. 글자를 타입이 있는 값으로 바꿔 넣는 일을 <T en="binding">바인딩</T>이라고 합니다. 인자마다 어디서 값을 가져올지 표시해 둡니다.
      </p>
      <ul>
        <li>
          <code>@PathVariable</code>: 경로 변수. <code>/todos/42</code>의 <code>"42"</code>를 <code>42L</code>로 바꿉니다.
        </li>
        <li>
          <code>@RequestParam</code>: 쿼리 문자열. <code>?done=false</code>의 <code>"false"</code>를 <code>false</code>로 바꿉니다. 없어도 되는지(<code>required = false</code>), 없으면 무엇을 쓸지(<code>defaultValue</code>)를 정할 수 있습니다.
        </li>
        <li>
          <code>@RequestBody</code>: 본문. JSON을 읽어 <code>TodoForm</code> 객체로 만듭니다. Spring에서는 Jackson 라이브러리가 이 일을 합니다. <code>@Valid</code>를 붙이면 만든 뒤 <code>@NotBlank</code> 같은 규칙도 검사합니다.
        </li>
      </ul>
      <p>
        바꾸지 못하면 메서드는 불리지 않고 <code>400 Bad Request</code>가 나갑니다. 그림 1에서 <code>GET /todos/abc</code>를 보내 보세요. <code>abc</code>는 long이 될 수 없으니 getTodo는 아예 실행되지 않습니다. 본문이 JSON이 아니거나, <code>title</code>이 비어 있거나, 필요한 본문이 없을 때도 마찬가지입니다. 덕분에 컨트롤러 메서드는 "id가 숫자인가"를 스스로 확인할 필요가 없습니다. 메서드에 들어온 순간 이미 올바른 타입입니다.
      </p>
      <Callout kind="note">
        세 가지 400은 원인이 다릅니다. 글자를 타입으로 못 바꾸면 <code>MethodArgumentTypeMismatchException</code>, 필수 쿼리가 없으면 <code>MissingServletRequestParameterException</code>, 본문을 읽지 못하면 <code>HttpMessageNotReadableException</code>, 읽었지만 검증 규칙을 어기면 <code>MethodArgumentNotValidException</code>입니다. 이 예외들을 한곳에서 보기 좋은 JSON 오류로 바꾸는 법은 <a href={lessonHref('se-backend', 'filters')}>다음 장</a>에서 봅니다.
      </Callout>

      <h2>패턴이 겹칠 때</h2>
      <p>
        할 일 서비스에는 "오늘 할 일" 목록을 주는 <code>/todos/today</code>와 할 일 하나를 주는 <code>/todos/{'{id}'}</code>가 함께 있습니다. <code>GET /todos/today</code>는 두 패턴에 모두 맞습니다. <code>{'{id}'}</code>는 아무 칸이나 받기 때문입니다. 등록한 순서대로 고른다면, 클래스 안에서 메서드를 옮기기만 해도 동작이 바뀝니다. 그래서 프레임워크는 순서 대신 <strong>더 구체적인 패턴</strong>을 고릅니다. 글자 그대로인 칸은 변수보다, 변수는 와일드카드보다 구체적입니다.
      </p>
      <OverlapFigure />
      <p>
        그림 2에서 <code>/todos/abc</code>를 골라 보세요. <code>/todos/{'{id}'}</code>가 1위로 뽑히고, 인자를 만들다 실패해 400이 납니다. 아래 순위의 <code>/todos/*</code>가 받아 줄 수 있었는데도 넘어가지 않습니다. 핸들러를 고르는 일은 패턴만 보고 끝나고, 인자 변환은 고른 다음에 일어나기 때문입니다. "숫자면 이 메서드, 아니면 저 메서드"로 나누고 싶다면 패턴 자체에 정규식을 넣어 <code>{'/todos/{id:\\d+}'}</code>처럼 씁니다. 그러면 숫자가 아닌 칸은 처음부터 맞지 않습니다.
      </p>
      <Callout kind="warn">
        Spring 6부터는 끝에 붙은 <code>/</code>를 따로 봅니다. <code>/todos/</code>는 <code>/todos</code>에 맞지 않아 404가 납니다. 그림 1에서 확인해 보세요. 예전 버전에서 넘어올 때 클라이언트가 슬래시를 붙여 보내고 있었다면 갑자기 404가 늘어납니다.
      </Callout>

      <h2>Spring에서는</h2>
      <p>
        그림 1의 표는 아래 컨트롤러 하나에서 나옵니다. <code>@RestController</code>는 "이 클래스의 메서드가 핸들러이고, 반환값은 JSON으로 바꿔 본문에 쓴다"는 뜻입니다. 클래스에 붙은 <code>@RequestMapping("/todos")</code>는 메서드마다 붙은 경로 앞에 공통으로 붙습니다. 컨트롤러는 요청을 읽지 않고, 받은 인자로 <code>TodoService</code>를 부르기만 합니다.
      </p>
      <Code label="TodoController.java">{`
@RestController
@RequestMapping("/todos")
public class TodoController {
    private final TodoService service;

    public TodoController(TodoService service) { this.service = service; }

    @GetMapping                                   // GET /todos?done=false&limit=1
    public List<TodoDto> listTodos(@RequestParam(required = false) Boolean done,
                                   @RequestParam(defaultValue = "20") int limit) {
        return service.list(done, limit);
    }

    @GetMapping("/today")                         // {id}보다 구체적이라 먼저 뽑힌다
    public List<TodoDto> todayTodos() { return service.dueToday(); }

    @GetMapping("/{id}")                          // "42" → 42L, "abc" → 400
    public TodoDto getTodo(@PathVariable long id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<TodoDto> createTodo(@Valid @RequestBody TodoForm form) {
        TodoDto created = service.add(form);
        return ResponseEntity.created(URI.create("/todos/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public TodoDto updateTodo(@PathVariable long id, @Valid @RequestBody TodoForm form) {
        return service.update(id, form);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTodo(@PathVariable long id) { service.delete(id); }

    @PatchMapping("/{id}/done")
    public TodoDto markDone(@PathVariable long id) { return service.markDone(id); }
}

public record TodoForm(@NotBlank String title, boolean done) {}`}</Code>
      <p>
        <code>@GetMapping</code>, <code>@PostMapping</code> 같은 이름은 <code>@RequestMapping(method = GET)</code>의 줄임말입니다. 애플리케이션이 뜰 때 Spring은 이 애너테이션을 읽어 매핑 표를 만들고, 같은 메서드와 같은 패턴이 두 번 나오면 시작 단계에서 멈춥니다(<code>Ambiguous mapping</code>). 어떤 요청이 어느 메서드로 갔는지 궁금하면 로그 수준을 올려 디스패처의 기록을 볼 수 있습니다.
      </p>
      <Code label="application.yml과 curl로 확인하기">{`
# application.yml: 디스패처가 고른 핸들러를 로그로 본다
logging.level.org.springframework.web: DEBUG

$ curl -i -X POST localhost:8080/todos/42
HTTP/1.1 405
Allow: GET,PUT,DELETE        # 이 주소가 받는 메서드 (버전에 따라 HEAD 등이 더 붙음)

$ curl -i localhost:8080/todos/abc
HTTP/1.1 400
# 로그: Resolved [MethodArgumentTypeMismatchException: Failed to convert value of type
#       'java.lang.String' to required type 'long'; For input string: "abc"]`}</Code>
      <Callout kind="note">
        정적 파일을 주는 처리기도 같은 표에 들어 있습니다. Spring Boot는 <code>/**</code>를 정적 파일 처리기에 연결해 두기 때문에, 어느 컨트롤러에도 맞지 않는 요청은 마지막에 그쪽으로 가서 "그런 파일이 없다"는 404가 됩니다. 가장 덜 구체적인 패턴이라 다른 매핑을 가로채지는 않습니다.
      </Callout>

      <Quiz
        q={
          <>
            할 일 서비스에 <code>GET /todos/today</code>와 <code>DELETE /todos/{'{id}'}</code>(<code>long id</code>)가 등록되어 있습니다. <code>DELETE /todos/today</code> 요청이 오면 어떻게 될까요?
          </>
        }
        options={[
          <>todayTodos()가 실행되고 200이 나간다</>,
          <>경로는 /todos/today에 맞지만 DELETE가 아니므로 405가 나간다</>,
          <>deleteTodo가 골라지지만 "today"를 long으로 바꾸지 못해 400이 나간다</>,
          <>맞는 매핑이 없어 404가 나간다</>,
        ]}
        answer={2}
        explain={
          <>
            디스패처는 경로와 메서드가 <strong>모두</strong> 맞는 매핑 가운데서 고릅니다. DELETE까지 맞는 것은 <code>DELETE /todos/{'{id}'}</code> 하나뿐이라 더 구체적인 /todos/today와 겨룰 일도 없습니다. 405는 메서드까지 맞는 매핑이 하나도 없을 때만 나옵니다. 그다음 "today"를 long으로 바꾸다 실패하므로 deleteTodo는 실행되지 않고 400이 나갑니다. 그림 1의 요청 줄에 그대로 적어 확인해 보세요.
          </>
        }
      />
    </>
  );
}

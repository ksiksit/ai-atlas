import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import {
  INITIAL,
  METHODS,
  REASON,
  RETRY_BODY,
  SHAPE_CHANGES,
  applyChanges,
  etag,
  formatResponse,
  handle,
  readAsOldClient,
  retryRun,
  shapeV1,
  statusClass,
  toCurl,
  type Lost,
  type Method,
  type Outcome,
  type Req,
  type ShapeChange,
  type Store,
  type Strategy,
} from './todoapi';
import './basics.css';
import './httpapi.css';

/* ─────────────── Figure 1: send requests to a live to-do API ─────────────── */

interface Preset {
  label: string;
  method: Method;
  path: string;
  body?: string;
  ifMatch?: string;
}

const PRESETS: Preset[] = [
  { label: '목록 보기', method: 'GET', path: '/todos' },
  { label: '남은 것만', method: 'GET', path: '/todos?done=false' },
  { label: '하나 보기', method: 'GET', path: '/todos/3' },
  {
    label: '추가',
    method: 'POST',
    path: '/todos',
    body: '{"title": "우유 사기"}',
  },
  {
    label: '빈 제목으로 추가',
    method: 'POST',
    path: '/todos',
    body: '{"title": ""}',
  },
  {
    label: '깨진 JSON',
    method: 'POST',
    path: '/todos',
    body: '{"title": "우유',
  },
  {
    label: '완료 표시',
    method: 'PATCH',
    path: '/todos/1',
    body: '{"done": true}',
  },
  {
    label: '통째로 바꾸기',
    method: 'PUT',
    path: '/todos/3',
    body: '{"title": "마감 하루 전 알림", "done": false}',
  },
  {
    label: 'PUT에 필드 빠짐',
    method: 'PUT',
    path: '/todos/3',
    body: '{"title": "마감 하루 전 알림"}',
  },
  { label: '지우기', method: 'DELETE', path: '/todos/2' },
  { label: '없는 번호', method: 'GET', path: '/todos/99' },
  { label: '목록 통째로 지우기', method: 'DELETE', path: '/todos' },
  {
    label: '조건부 수정 (If-Match)',
    method: 'PATCH',
    path: '/todos/1',
    body: '{"title": "datefmt 1.4로 올리기"}',
    ifMatch: '"v1"',
  },
];

const hasBody = (m: Method) => m === 'POST' || m === 'PUT' || m === 'PATCH';

interface Exchange {
  n: number;
  req: Req;
  out: Outcome;
}

function ApiFigure() {
  const [store, setStore] = useState<Store>(INITIAL);
  const [method, setMethod] = useState<Method>('POST');
  const [path, setPath] = useState('/todos');
  const [body, setBody] = useState('{"title": "우유 사기"}');
  const [ifMatch, setIfMatch] = useState('');
  const [log, setLog] = useState<Exchange[]>([]);
  const [prev, setPrev] = useState<Store>(INITIAL);

  const req: Req = {
    method,
    path,
    body: hasBody(method) ? body : undefined,
    headers: ifMatch.trim() ? { 'If-Match': ifMatch } : undefined,
  };
  const last = log[0];

  const pick = (p: Preset) => {
    setMethod(p.method);
    setPath(p.path);
    if (p.body !== undefined) setBody(p.body);
    setIfMatch(p.ifMatch ?? '');
  };
  const send = () => {
    const out = handle(req, store);
    setPrev(store);
    setStore(out.store);
    setLog((l) => [{ n: (l[0]?.n ?? 0) + 1, req, out }, ...l].slice(0, 6));
  };
  const reset = () => {
    setStore(INITIAL);
    setPrev(INITIAL);
    setLog([]);
  };
  const before = new Map(prev.todos.map((t) => [t.id, t]));
  const removed = last?.out.changed ? prev.todos.filter((t) => !store.todos.some((x) => x.id === t.id)) : [];

  return (
    <Figure
      no={1}
      title="할 일 API에 요청 보내기"
      hint="예시를 고르거나 직접 고친 뒤 보내기를 누르세요"
      caption={
        <>
          브라우저 안에서 도는 작은 할 일 API(<code>todoapi.ts</code>)입니다. 요청 하나를 받아 응답과 바뀐 저장소를 돌려주는 순수 함수라서, 같은 요청을 같은 상태에 보내면 언제나 같은 답이 나옵니다. 아래 표에서 방금 바뀐 줄은 색으로, 지워진 줄은
          취소선으로 보입니다. ETag는 할 일이 바뀔 때마다 올라가는 버전 표시입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="se-chips" role="group" aria-label="요청 예시">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="se-chip ha-chip" onClick={() => pick(p)}>
              <b>{p.method}</b> {p.label}
            </button>
          ))}
        </div>
        <div className="ha-grid">
          <div className="se-col">
            <Seg label="메서드" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m }))} />
            <label className="se-label" htmlFor="ha-path">
              주소(경로)
            </label>
            <input id="ha-path" className="se-input" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} autoComplete="off" />
            <label className="se-label" htmlFor="ha-body">
              본문 (JSON)
              {!hasBody(method) && ` · ${method}에는 보내지 않습니다`}
            </label>
            <textarea id="ha-body" className="se-input ha-body" value={body} onChange={(e) => setBody(e.target.value)} disabled={!hasBody(method)} spellCheck={false} rows={3} />
            <label className="se-label" htmlFor="ha-ifmatch">
              If-Match 헤더 (비워 두면 보내지 않음)
            </label>
            <input id="ha-ifmatch" className="se-input" value={ifMatch} onChange={(e) => setIfMatch(e.target.value)} placeholder='예: "v1"' spellCheck={false} autoComplete="off" />
            <div className="ha-buttons">
              <Button primary onClick={send}>
                보내기
              </Button>
              <Button onClick={reset}>처음 상태로</Button>
            </div>
            <Code label="같은 요청을 curl로">{toCurl(req)}</Code>
          </div>
          <div className="se-col" aria-live="polite">
            <div className="se-label">응답</div>
            {last ? (
              <>
                <div className="ha-status" data-k={statusClass(last.out.res.status)}>
                  <span className="ha-code">{last.out.res.status}</span>
                  <span>{REASON[last.out.res.status]}</span>
                </div>
                <pre className="ha-pre">{formatResponse(last.out.res)}</pre>
                <p className="ha-why">{last.out.why}</p>
              </>
            ) : (
              <p className="ha-why">아직 보낸 요청이 없습니다.</p>
            )}
          </div>
        </div>
        <div className="ha-grid">
          <div className="se-col">
            <div className="se-label">서버의 저장소</div>
            <div className="ha-scroll">
              <table className="ha-table">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>title</th>
                    <th>done</th>
                    <th>ETag</th>
                  </tr>
                </thead>
                <tbody>
                  {store.todos.map((t) => {
                    const b = before.get(t.id);
                    const hot = last?.out.changed && (!b || b.version !== t.version);
                    return (
                      <tr key={t.id} data-hot={hot || undefined}>
                        <td>{t.id}</td>
                        <td>{t.title}</td>
                        <td>{t.done ? 'true' : 'false'}</td>
                        <td>{etag(t)}</td>
                      </tr>
                    );
                  })}
                  {removed.map((t) => (
                    <tr key={'x' + t.id} data-gone>
                      <td>{t.id}</td>
                      <td>{t.title}</td>
                      <td>{t.done ? 'true' : 'false'}</td>
                      <td>{etag(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="se-col">
            <div className="se-label">지금까지 보낸 요청 (최근 6개)</div>
            <ol className="ha-log">
              {log.map((x) => (
                <li key={x.n}>
                  <span className="ha-log-req">
                    {x.req.method} {x.req.path}
                  </span>
                  <span className="ha-log-st" data-k={statusClass(x.out.res.status)}>
                    {x.out.res.status}
                  </span>
                </li>
              ))}
              {!log.length && <li className="ha-empty">없음</li>}
            </ol>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the response is lost, the client retries ─────────────── */

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'post', label: 'POST' },
  { value: 'post-key', label: 'POST + 멱등 키' },
  { value: 'post-newkey', label: 'POST + 시도마다 새 키' },
  { value: 'put', label: 'PUT /todos/4' },
];

function RetryFigure() {
  const [strategy, setStrategy] = useState<Strategy>('post');
  const [lost, setLost] = useState<Lost>('response');
  const [losses, setLosses] = useState(2);
  const run = useMemo(() => retryRun(strategy, losses, lost), [strategy, losses, lost]);
  const milk = run.store.todos.filter((t) => t.title === '우유 사기');
  const final = run.attempts[run.attempts.length - 1];

  return (
    <Figure
      no={2}
      title="응답이 사라지면 다시 보낸다"
      hint="전략과 잃어버리는 횟수를 바꿔 보세요"
      caption={
        <>
          모바일 앱이 "우유 사기"를 추가하려고 합니다. 앞의 몇 번은 요청이나 응답이 네트워크에서 사라지고, 앱은 시간 초과를 기다렸다가 같은 일을 다시 보냅니다. 마지막 시도만 응답이 돌아옵니다. 앱 쪽에서는 요청이 사라졌는지 응답이 사라졌는지 구별할 수
          없다는 점을 눈여겨보세요. 저장소는 그림 1의 처음 상태(할 일 3개)에서 시작합니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <ol className="ha-attempts" aria-label="시도 기록">
            {run.attempts.map((a, i) => {
              const key = a.req.headers?.['Idempotency-Key'];
              return (
                <li key={i} data-ok={a.delivered || undefined}>
                  <div className="ha-att-head">
                    <span className="ha-att-no">시도 {i + 1}</span>
                    <code>
                      {a.req.method} {a.req.path}
                      {key ? ` · Idempotency-Key: ${key}` : ''}
                    </code>
                  </div>
                  <div className="ha-att-flow">
                    <span data-off={!a.reached || undefined}>{a.reached ? `서버: ${a.res!.status} ${REASON[a.res!.status]}` : '서버: 받은 적 없음'}</span>
                    <span aria-hidden="true">→</span>
                    <span data-off={!a.delivered || undefined}>{a.delivered ? '앱: 응답 받음' : '앱: 시간 초과, 다시 보냄'}</span>
                  </div>
                  <div className="ha-att-why">
                    {a.why} 서버의 할 일: {a.count}개
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="se-label">끝난 뒤 서버의 저장소</div>
          <ul className="ha-final">
            {run.store.todos.map((t) => (
              <li key={t.id} data-dup={(t.title === '우유 사기' && milk.length > 1) || undefined} data-new={t.id >= 4 || undefined}>
                <span>{t.id}</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
        <div className="controls">
          <Seg label="앱이 보내는 요청" value={strategy} onChange={setStrategy} options={STRATEGIES} />
          <Seg
            label="사라지는 것"
            value={lost}
            onChange={setLost}
            options={[
              { value: 'response', label: '응답이 오다가' },
              { value: 'request', label: '요청이 가다가' },
            ]}
          />
          <Slider label="잃어버리는 횟수" value={losses} min={0} max={3} step={1} onChange={setLosses} format={(v) => `${v}번`} />
          <Readout label="서버에 생긴 '우유 사기'" value={`${milk.length}개`} color={milk.length === 1 ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="앱이 받은 응답" value={final.res ? `${final.res.status} ${REASON[final.res.status]}` : '–'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: changing the response shape ─────────────── */

function ClientCard({ name, note, errs }: { name: string; note: string; errs: string[] }) {
  return (
    <div className="se-machine" data-tone={errs.length ? 'bad' : 'good'}>
      <div className="se-label">{note}</div>
      <div className="se-machine-ver">{name}</div>
      <div className="se-machine-result">{errs.length ? errs.join(', ') : '정상 동작'}</div>
    </div>
  );
}

function CompatFigure() {
  const [changes, setChanges] = useState<ShapeChange[]>(['add-due']);
  const [v2, setV2] = useState(false);
  const toggle = (c: ShapeChange, on: boolean) => setChanges((cs) => (on ? [...cs, c] : cs.filter((x) => x !== c)));
  const changed = applyChanges(changes);
  const v1Body = v2 ? shapeV1() : changed;
  const tolerant = readAsOldClient(v1Body, false);
  const strict = readAsOldClient(v1Body, true);
  const breaking = readAsOldClient(changed, false).length > 0;

  return (
    <Figure
      no={3}
      title="응답 모양을 바꾸면 누가 깨지나"
      hint="바꿀 것을 켜고 끄세요"
      caption={
        <>
          두 클라이언트는 모두 예전 응답 <code>{'{id: 숫자, title: 문자열, done: 참/거짓}'}</code>을 기대하고 만들어졌습니다. 하나는 모르는 필드를 무시하고, 다른 하나는 모르는 필드가 있으면 거절합니다. "/v2로만 내기"를 켜면 바뀐 모양은 새 주소에서만
          나오고, 예전 클라이언트가 부르는 /v1은 그대로입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ha-grid">
            <div className="se-col">
              <div className="se-label">GET /v1/todos/3</div>
              <pre className="ha-pre">{JSON.stringify(v1Body, null, 2)}</pre>
            </div>
            {v2 && (
              <div className="se-col">
                <div className="se-label">GET /v2/todos/3</div>
                <pre className="ha-pre">{JSON.stringify(changed, null, 2)}</pre>
              </div>
            )}
          </div>
          <div className="se-machines">
            <ClientCard name="모바일 앱 1.0" note="모르는 필드는 무시" errs={tolerant} />
            <ClientCard name="파트너사 연동" note="모르는 필드가 있으면 거절" errs={strict} />
          </div>
        </div>
        <div className="controls">
          {SHAPE_CHANGES.map((c) => (
            <Check key={c.id} label={c.label} checked={changes.includes(c.id)} onChange={(on) => toggle(c.id, on)} />
          ))}
          <Check label="바뀐 모양은 /v2로만 내기" checked={v2} onChange={setV2} />
          <Readout label="이 변경은" value={!changes.length ? '변경 없음' : !breaking ? '하위 호환 변경' : v2 ? '깨는 변경, /v2로 분리' : '호환을 깨는 변경'} color={breaking && !v2 ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function HttpApi() {
  return (
    <>
      <h2>API는 약속이다</h2>
      <p>
        할 일 목록 서비스를 만들었다고 합시다. 웹 화면도, 모바일 앱도, 다른 회사의 일정 관리 프로그램도 이 서비스에 할 일을 읽고 쓰고 싶어 합니다. 이들이 서비스와 주고받는 요청과 응답의 모양을 정해 둔 것이{' '}
        <T en="Application Programming Interface">API</T>입니다. 요즘 서비스 API는 대부분 HTTP 위에서 오갑니다. 요청 줄, 헤더, 본문으로 된 HTTP 메시지 자체는 <a href={lessonHref('net-basics', 'http')}>HTTP와 HTTPS</a>에서 봤습니다. 이 장은 그 위에
        "어떤 주소에 어떤 메서드를 보내면 무엇이 돌아오는가"를 정하는 일, 곧 API 설계를 다룹니다.
      </p>
      <p>
        API는 한번 내보내면 쉽게 못 바꿉니다. 내 서버 코드는 내일 고칠 수 있지만, 사용자 휴대폰에 깔린 앱은 몇 달이고 예전 모양 그대로 요청을 보냅니다. 그래서 API는 코드라기보다 <strong>약속</strong>에 가깝고, 처음에 잘 정하는 것이 중요합니다.
      </p>

      <h2>자원과 주소</h2>
      <p>
        HTTP API를 설계하는 가장 흔한 방식은 서비스가 다루는 것을 <T en="resource">자원</T>으로 보고, 자원마다 주소를 하나씩 주는 것입니다. 할 일 서비스라면 할 일 전체의 목록인 <code>/todos</code>가 있고, 그 안의 할 일 하나하나가{' '}
        <code>/todos/1</code>, <code>/todos/42</code>처럼 자기 주소를 가집니다. 앞의 것을 <T en="collection">컬렉션</T>, 뒤의 것을 항목이라고 부릅니다.
      </p>
      <p>
        주소에는 명사만 둡니다. <code>/getTodo?id=42</code>, <code>/deleteTodo</code>, <code>/markDone</code>처럼 동사를 주소에 넣기 시작하면 기능마다 주소가 늘어나고, 어느 것이 무엇을 바꾸는지 이름만 보고 짐작해야 합니다. "무엇을 할지"는 주소가
        아니라 다음 절의 메서드가 말합니다. 목록을 거르거나 정렬하는 조건은 <code>/todos?done=false</code>
        처럼 쿼리로 붙입니다.
      </p>

      <h2>메서드와 상태 코드</h2>
      <p>
        같은 주소에 보내는 <T en="method">메서드</T>가 하려는 일을 정합니다. 할 일 API는 다섯 가지를 씁니다.
      </p>
      <div className="ha-scroll">
        <table className="ha-table ha-methods">
          <thead>
            <tr>
              <th>메서드</th>
              <th>뜻</th>
              <th>예</th>
              <th>안전</th>
              <th>멱등</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GET</td>
              <td>읽기</td>
              <td>GET /todos/3</td>
              <td>예</td>
              <td>예</td>
            </tr>
            <tr>
              <td>POST</td>
              <td>컬렉션에 새로 만들기 (번호는 서버가 정함)</td>
              <td>POST /todos</td>
              <td>아니오</td>
              <td>아니오</td>
            </tr>
            <tr>
              <td>PUT</td>
              <td>그 주소의 자원을 보낸 것으로 통째로 바꾸기 (없으면 만들기)</td>
              <td>PUT /todos/3</td>
              <td>아니오</td>
              <td>예</td>
            </tr>
            <tr>
              <td>PATCH</td>
              <td>일부 필드만 바꾸기</td>
              <td>PATCH /todos/3</td>
              <td>아니오</td>
              <td>보통 예</td>
            </tr>
            <tr>
              <td>DELETE</td>
              <td>지우기</td>
              <td>DELETE /todos/3</td>
              <td>아니오</td>
              <td>예</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <T en="safe">안전</T>하다는 것은 서버의 상태를 바꾸지 않는다는 뜻입니다. 그래서 브라우저나 검색 엔진은 GET을 마음대로 미리 보내거나 캐시해도 됩니다. GET으로 무언가를 지우는 API를 만들면, 어느 날 링크 미리 보기 기능이 할 일을 모두 지워
        버립니다. 멱등은 아래에서 따로 봅니다.
      </p>
      <p>
        서버는 결과를 세 자리 <T en="status code">상태 코드</T>로 알립니다. 첫 자리가 큰 뜻입니다. 2xx는 성공, 4xx는 요청한 쪽의 잘못, 5xx는 서버의 잘못입니다. 이 구분이 중요한 이유는 받는 쪽의 행동이 달라지기 때문입니다. 4xx는 같은 요청을 다시
        보내도 같은 답이 오니 요청을 고쳐야 하고, 5xx는 잠시 뒤 다시 시도해 볼 만합니다.
      </p>
      <ul>
        <li>200 OK: 성공, 본문에 결과가 있다. 201 Created: 새로 만들었고 그 주소는 Location 헤더에 있다. 204 No Content: 성공했지만 돌려줄 본문이 없다.</li>
        <li>400 Bad Request: 본문을 읽을 수 없거나 값이 규칙에 맞지 않는다. 404 Not Found: 그 주소에 자원이 없다. 405 Method Not Allowed: 그 주소에 그 메서드는 안 된다(쓸 수 있는 것은 Allow 헤더에).</li>
        <li>412 Precondition Failed: 요청에 단 조건(If-Match)이 맞지 않는다. 아래에서 다시 봅니다.</li>
      </ul>
      <ApiFigure />
      <p>
        "추가"를 몇 번 눌러 보세요. 누를 때마다 새 번호가 생깁니다. "지우기"를 두 번 누르면 처음에는 204, 두 번째는 404가 옵니다. "목록 통째로 지우기"는 405입니다. 서버가 그런 기능을 일부러 만들지 않았기 때문입니다. 터미널에서는 그림 아래의 curl
        명령으로 똑같은 요청을 보냅니다. <code>-i</code>는 응답 헤더까지 보여 달라는 뜻입니다.
      </p>
      <Code label="터미널에서 API 부르기 (curl)">{`
$ curl -i -X POST localhost:8080/todos \\
    -H 'Content-Type: application/json' \\
    -d '{"title": "우유 사기"}'
HTTP/1.1 201 Created
Location: /todos/4
Content-Type: application/json

{"id": 4, "title": "우유 사기", "done": false}

$ curl -i 'localhost:8080/todos?done=false'    # 쿼리로 거르기: 200 OK
$ curl -i -X DELETE localhost:8080/todos/4     # 204 No Content`}</Code>

      <h2>오류 응답과 입력 검증</h2>
      <p>
        API는 서비스의 바깥 경계라서, 들어오는 값을 믿으면 안 됩니다. 제목이 비어 있거나, 숫자 자리에 문자열이 오거나, JSON이 중간에 끊겨 있을 수 있습니다. 경계에서 한 번 검사하고, 틀렸으면 아무것도 바꾸지 않은 채 400으로 돌려보냅니다. 이때 오류
        본문도 약속의 일부입니다. "무엇이 왜 틀렸는지"를 사람과 프로그램이 모두 읽을 수 있게, 늘 같은 모양으로 보냅니다. 할 일 API는 표준(RFC 9457)의 <T en="problem details">문제 상세</T> 모양을 따릅니다.
      </p>
      <Code label="400 응답 본문 (application/problem+json)">{`
{
  "status": 400,
  "title": "Bad Request",
  "detail": "title이 비어 있습니다."
}`}</Code>
      <Callout kind="warn">오류 응답에 예외의 스택 추적이나 SQL 문을 그대로 담지 마세요. 디버깅에는 편하지만, 서버 내부 구조를 공격자에게 알려 주는 셈입니다. 자세한 내용은 서버 로그에 남기고, 응답에는 고칠 수 있을 만큼만 적습니다.</Callout>
      <p>
        조금 덜 눈에 띄는 오류도 있습니다. 두 사람이 같은 할 일을 거의 동시에 읽고, 각자 제목을 고쳐 PUT을 보냈다고 합시다. 나중에 도착한 것이 먼저 것을 조용히 덮어씁니다. 이것을 <T en="lost update">갱신 손실</T>이라고 합니다. HTTP는 이를 위해{' '}
        <T en="ETag">ETag</T>를 둡니다. 서버는 응답에 자원의 버전 표시를 붙이고, 클라이언트는 수정할 때 <code>If-Match: "v1"</code>로 "내가 읽은 것이 아직 v1이면 바꿔 달라"고 조건을 겁니다. 그사이 누가 바꿨다면 서버는 412로 거절합니다. 그림 1의
        "조건부 수정"을 두 번 보내 보세요. 첫 번째는 200이고 ETag가 "v2"가 되므로, 같은 조건을 단 두 번째는 412가 됩니다.
      </p>

      <h2>멱등성: 두 번 보내도 되는가</h2>
      <p>
        네트워크는 메시지를 잃어버립니다. 휴대폰이 엘리베이터에 들어가거나, 중간의 프록시가 연결을 끊거나, 서버가 응답을 쓰다가 재시작됩니다. 요청을 보낸 쪽은 시간 초과만 보고, 요청이 가다가 사라졌는지 서버가 처리한 뒤 응답이 오다가 사라졌는지 알 수
        없습니다. 그래서 대부분의 클라이언트와 라이브러리는 같은 요청을 다시 보냅니다.
      </p>
      <p>
        같은 요청을 한 번 보내든 여러 번 보내든 서버의 상태가 똑같이 끝나면, 그 요청은 <T en="idempotent">멱등</T>하다고 합니다. 응답이 같다는 뜻은 아닙니다. DELETE를 두 번 보내면 두 번째는 404지만, 할 일이 지워져 있다는 결과는 같습니다. PUT은 "이
        주소의 자원을 이것으로" 바꾸므로 몇 번을 보내도 결과가 같습니다. POST는 "새로 하나 만들어 달라"는 뜻이라 보낼 때마다 하나씩 생깁니다.
      </p>
      <RetryFigure />
      <p>
        POST로 응답을 두 번 잃어버리면 "우유 사기"가 세 개 생깁니다. 결제 API였다면 돈이 세 번 빠져나갔을 것입니다. 해결책은 클라이언트가 작업마다 고유한 <T en="idempotency key">멱등 키</T>를 만들어 헤더에 싣는 것입니다. 서버는 키별로 처리 결과를
        기억해 두고, 같은 키가 다시 오면 새로 만들지 않고 그때의 응답을 그대로 돌려줍니다. 결제 회사 API들이 널리 쓰는 방식이고, IETF에서 <code>Idempotency-Key</code> 헤더로 표준화하고 있습니다.
      </p>
      <p>같은 키로 두 번째 요청을 보내면 서버는 할 일을 새로 만들지 않고, 처음에 보냈던 201 응답을 그대로 다시 보냅니다. 다시 보낸 응답이라는 표시로 헤더 하나를 더 붙이는 서버도 많습니다.</p>
      <Code label="같은 멱등 키로 두 번째 보낸 POST (curl)">{`
$ curl -i -X POST localhost:8080/todos \\
    -H 'Content-Type: application/json' \\
    -H 'Idempotency-Key: add-7f3a' \\
    -d '${RETRY_BODY}'
HTTP/1.1 201 Created
Location: /todos/4
Idempotent-Replayed: true

{"id": 4, "title": "우유 사기", "done": false}`}</Code>
      <Callout kind="key">
        멱등 키는 <strong>시도</strong>마다가 아니라 <strong>작업</strong>마다 하나입니다. 그림 2에서 "시도마다 새 키"를 골라 보세요. 재시도할 때마다 키를 새로 만들면, 서버 눈에는 모두 다른 작업이라 키가 없는 것과 똑같이 중복이 생깁니다. 반대로 같은
        키에 다른 본문을 실어 보내면 재시도가 아니라 실수이므로, 서버는 422로 거절합니다.
      </Callout>
      <p>
        "사라지는 것"을 "요청이 가다가"로 바꾸면 어떤 전략이든 하나만 생깁니다. 서버가 앞의 요청을 본 적이 없기 때문입니다. 문제는 클라이언트가 이 두 경우를 구별할 수 없다는 데 있고, 그래서 재시도해도 안전하게 API를 만드는 책임은 서버에 있습니다.
      </p>

      <h2>API 버전 관리와 하위 호환</h2>
      <p>
        서비스는 계속 자랍니다. 할 일에 마감일을 붙이고 싶고, 처음에 잘못 지은 이름을 바꾸고 싶어집니다. 이때 기준은 <a href={lessonHref('se-basics', 'packages')}>패키지와 의존성 관리</a>
        에서 본 유의적 버전과 같습니다. 예전 클라이언트가 고치지 않고 계속 돌면 <T en="backward compatible">하위 호환</T> 변경이고, 그렇지 않으면 호환을 깨는 변경입니다.
      </p>
      <ul>
        <li>대체로 안전한 변경: 새 필드 더하기, 새 주소 더하기, 선택 입력 더하기</li>
        <li>깨는 변경: 필드 빼기나 이름 바꾸기, 타입 바꾸기(숫자 → 문자열), 필수 입력 더하기, 상태 코드의 뜻 바꾸기</li>
      </ul>
      <CompatFigure />
      <p>
        새 필드 하나를 더했을 뿐인데 파트너사 연동이 깨집니다. 그래서 클라이언트 쪽 원칙도 함께 갑니다. 모르는 필드는 무시하고 아는 필드만 읽는 것입니다. 이것을 <T en="tolerant reader">관대한 독자</T>라고 부릅니다. 할 일 API도 같은 원칙으로, 요청
        본문에 모르는 필드가 있으면 거절하지 않고 무시합니다.
      </p>
      <p>
        깨는 변경이 꼭 필요하면 새 버전을 냅니다. 가장 흔한 방법은 주소에 <code>/v1/todos</code>, <code>/v2/todos</code>처럼 버전을 넣는 것이고, 헤더로 버전을 고르게 하는 API도 있습니다. 어느 쪽이든 핵심은 같습니다. 예전 버전을 한동안 그대로 두고,
        언제 없앨지 미리 알리고(
        <code>Deprecation</code>, <code>Sunset</code> 헤더나 공지), 사용량이 충분히 줄어든 것을 지표로 확인한 뒤에 끕니다. 버전 두 개를 함께 돌리는 것은 비용이므로, 버전은 드물게 올릴수록 좋습니다.
      </p>
      <Callout kind="note">
        이 장의 API는 브라우저 안의 함수 하나지만, 실제 서버는 들어온 요청 줄을 보고 어느 코드를 부를지 먼저 골라야 합니다. 그 일을 하는 라우터는 <a href={lessonHref('se-backend', 'routing')}>웹 백엔드 개발의 요청 라우팅</a>
        에서 Spring의 <code>@GetMapping</code>, <code>@PostMapping</code>과 함께 직접 만들어 봅니다. 다음 장 <a href={lessonHref('se-basics', 'config')}>설정과 환경</a>에서는 같은 서버가 개발용과 운영용 데이터베이스를 골라 쓰게 하는 법을 봅니다.
      </Callout>

      <Quiz
        q={<>모바일 앱이 아래 요청을 보냈는데 응답을 받지 못했습니다. 아무 장치 없이 그대로 다시 보내면 서버 상태가 달라질 수 있는 것은?</>}
        options={['GET /todos/3', 'PUT /todos/3 {"title": "알림 만들기", "done": true}', 'DELETE /todos/3', 'POST /todos {"title": "알림 만들기"}']}
        answer={3}
        explain={
          <>
            POST는 보낼 때마다 새 할 일을 만듭니다. GET은 아무것도 바꾸지 않고, PUT은 몇 번을 보내도 3번이 같은 내용이 되며, DELETE는 두 번째에 404가 오지만 3번이 없다는 결과는 같습니다. 그림 1에서 각 요청을 두 번씩 보내고 저장소를 비교해 보세요.
            POST를 안전하게 재시도하려면 멱등 키를 붙입니다.
          </>
        }
      />
    </>
  );
}

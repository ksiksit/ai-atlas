import { useMemo, useState, type ReactNode } from 'react';
import { Button, Callout, Check, Code, Figure, M, Quiz, Readout, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { CONTACT_SRC, EV_LABEL, FLAG_NAME, GUARD_SRC, L, LEGAL, NAME_SRC, RUN_IDS, SAMPLES, check, execute, flagIndex, flow, replay, runLabel, tyText, type ContactSlot, type Ev, type Guard, type NameSlot, type Union, type XAtom } from './typecheck';
import './software.css';

/* ─────────────── Figure 1: the checker sees what one test run misses ─────────────── */

function Slot<V extends string>({ value, options, onChange, label }: { value: V; options: Record<V, string>; onChange: (v: V) => void; label: string }) {
  return (
    <select className="sw-select" value={value} onChange={(e) => onChange(e.target.value as V)} aria-label={label}>
      {(Object.keys(options) as V[]).map((k) => (
        <option key={k} value={k}>
          {options[k]}
        </option>
      ))}
    </select>
  );
}

function CheckerFigure() {
  const [g, setG] = useState<Guard>('none');
  const [n, setN] = useState<NameSlot>('dot');
  const [c, setC] = useState<ContactSlot>('dot');
  const res = check(g, n, c);
  const runs = RUN_IDS.map((id) => ({ id, out: execute(id, g, n, c) }));
  const errLines = new Set(res.errors.map((e) => e.line));
  const crashes = runs.filter((r) => r.out.crash).length;

  const lines: { src: ReactNode; ty?: string }[] = [
    { src: 'type User = { id: number; name: string; email?: string };' },
    { src: '' },
    { src: 'function findUser(id: number): User | undefined {' },
    { src: <>  return USERS.find((u) =&gt; u.id === id);   <span className="cm">// 없으면 undefined</span></> },
    { src: '}' },
    { src: '' },
    { src: 'function greet(id: number): string {' },
    { src: '  const user = findUser(id);', ty: `user: ${tyText(res.types.user)}` },
    { src: <>  <Slot value={g} onChange={setG} options={GUARD_SRC} label="9번 줄: user 검사" /></>, ty: g === 'guard' ? `이 아래 user: ${tyText(res.types.userAfter)}` : undefined },
    { src: <>  const name = <Slot value={n} onChange={setN} options={NAME_SRC} label="10번 줄: name 읽기" />;</>, ty: `name: ${tyText(res.types.name)}` },
    { src: <>  const contact = <Slot value={c} onChange={setC} options={CONTACT_SRC} label="11번 줄: email 읽기" />;</>, ty: `contact: ${tyText(res.types.contact)}` },
    { src: '  return `${name.toUpperCase()} · ${contact}`;' },
    { src: '}' },
  ];

  return (
    <Figure
      no={1}
      title="실행하기 전에 잡기"
      hint="점선 상자를 눌러 코드를 바꿔 보세요"
      caption={<>9~11번 줄의 점선 상자는 고를 수 있는 코드입니다. 오른쪽 위는 TypeScript 검사기가 코드를 실행하지 않고 찾은 오류이고, 아래는 같은 코드를 사용자 세 명에게 실제로 실행한 결과입니다. 1번은 이메일이 있는 사용자, 2번은 이메일이 없는 사용자, 9번은 없는 사용자입니다. 줄 끝의 회색 글씨는 검사기가 추론한 타입입니다.</>}
    >
      <div className="fig-split">
        <pre className="sw-code" aria-label="greet 함수 코드">
          {lines.map((l, i) => (
            <div key={i} className="sw-line" data-s={errLines.has(i + 1) ? 'err' : undefined}>
              <span className="sw-ln">{i + 1}</span>
              <span className="sw-src">
                <span className={errLines.has(i + 1) ? 'sw-squig' : undefined}>{l.src}</span>
              </span>
              {l.ty && <span className="sw-ty">{l.ty}</span>}
            </div>
          ))}
        </pre>
        <div className="controls">
          <div className="sw-col" style={{ gap: 6 }}>
            <div className="sw-label">타입 검사 (실행 전)</div>
            {res.errors.length ? (
              res.errors.map((e, i) => (
                <div key={i} className="sw-err">
                  <span className="mono">
                    {e.line}번 줄 · {e.code}
                  </span>
                  <span>{e.ko}</span>
                  <span className="en mono">{e.msg}</span>
                </div>
              ))
            ) : (
              <div className="sw-note" data-tone="good">
                ✓ 오류 없음
              </div>
            )}
          </div>
          <div className="sw-col" style={{ gap: 6 }}>
            <div className="sw-label">실행 결과 greet(id)</div>
            {runs.map(({ id, out }) => (
              <div key={id} className="sw-run" data-t={out.crash ? 'bad' : out.odd ? 'odd' : 'good'}>
                <span className="mono">greet({id})</span>
                <span className="mono">{out.crash ? `${out.crashLine}번 줄: ${out.crash}` : `'${out.value}'`}</span>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="검사기가 찾은 오류" value={res.errors.length} color={res.errors.length ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="실행 중 멈춤" value={`${crashes} / ${runs.length}`} color={crashes ? 'var(--bad)' : 'var(--good)'} />
          </div>
        </div>
      </div>
      <div className="sw-note">
        {n === 'bang' && res.errors.every((e) => e.line !== L.name) && runs.some((r) => r.out.crashLine === L.name)
          ? '! 는 검사기에게 "이건 undefined가 아니니 믿어라"라고 말하는 것입니다. 10번 줄의 오류는 사라졌지만, 없는 사용자에게는 여전히 실행 중에 멈춥니다.'
          : !res.errors.length && runs.some((r) => r.out.odd)
            ? '오류는 없지만 2번 사용자의 결과에 undefined가 그대로 찍힙니다. 템플릿 문자열은 undefined도 받아 주기 때문에 검사기가 문제 삼지 않습니다.'
            : !res.errors.length && !crashes
              ? '검사기가 조용하고, 세 사용자 모두 제대로 동작합니다. 검사기의 오류 하나하나가 실행 중의 멈춤 하나하나와 맞아떨어졌다는 점을 보세요.'
              : '1번 사용자로만 테스트했다면 아무 문제도 보이지 않았을 것입니다. 검사기는 사용자를 몰라도 undefined가 들어올 수 있는 길을 모두 찾습니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: narrowing a union ─────────────── */

const Chips = ({ atoms, dim }: { atoms: XAtom[]; dim?: boolean }) => (
  <span className="sw-types" data-dim={dim || undefined}>
    {atoms.length ? atoms.map((a) => <span key={a} className="sw-type" data-a={a}>{a}</span>) : <span className="sw-type" data-a="never">never</span>}
  </span>
);

function NarrowFigure() {
  const [withBool, setWithBool] = useState(false);
  const [nullCheck, setNullCheck] = useState(true);
  const [strCheck, setStrCheck] = useState(false);
  const steps = flow(withBool, nullCheck, strCheck);
  const end = steps[steps.length - 1];
  const params = withBool ? 'number | string | null | boolean' : 'number | string | null';
  const samples = SAMPLES.filter((s) => withBool || s.atom !== 'boolean');

  return (
    <Figure
      no={2}
      title="유니언 타입 좁히기"
      hint="검사를 켜고 끄며 x의 타입이 어떻게 줄어드는지 보세요"
      caption={<>각 줄 오른쪽의 칩은 그 줄에 도착했을 때 x가 가질 수 있는 타입입니다. 검사 하나를 지날 때마다, 검사에 걸린 타입은 return으로 빠져나가고 나머지만 아래로 내려갑니다. 마지막 줄에 number만 남아야 <code>toFixed</code>를 부를 수 있습니다. 아래 표는 같은 코드를 실제 값으로 실행한 결과입니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <div className="sw-flow">
            <div className="sw-flow-row">
              <code className="sw-flow-src">function label(x: {params}) {'{'}</code>
              <Chips atoms={steps[0].before} />
            </div>
            {steps.map((st) =>
              st.id === 'end' ? (
                <div key={st.id} className="sw-flow-row" data-err={st.error ? true : undefined}>
                  <code className="sw-flow-src">
                    {'  '}
                    <span className={st.error ? 'sw-squig' : undefined}>{st.src}</span>
                  </code>
                  <Chips atoms={st.before} />
                  {st.error && (
                    <div className="sw-err" style={{ gridColumn: '1 / -1' }}>
                      <span className="mono">{st.error.code}</span>
                      <span>{st.error.ko}</span>
                      <span className="en mono">{st.error.msg}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div key={st.id} className="sw-flow-row">
                  <code className="sw-flow-src">
                    {'  '}
                    {st.src}
                  </code>
                  <span className="sw-flow-exit">
                    참이면 return ← <Chips atoms={st.taken} />
                  </span>
                  <span className="sw-flow-down">
                    아래로 ↓ <Chips atoms={st.after} />
                  </span>
                </div>
              ),
            )}
            <div className="sw-flow-row">
              <code className="sw-flow-src">{'}'}</code>
            </div>
          </div>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl sw-impls">
              <thead>
                <tr>
                  <th>호출</th>
                  <th>실행 결과</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => {
                  const r = runLabel(s.atom, nullCheck, strCheck);
                  return (
                    <tr key={s.v}>
                      <td className="mono">label({s.v})</td>
                      <td className="mono" style={{ color: r.crash ? 'var(--bad)' : undefined, overflowWrap: 'anywhere' }}>
                        {r.out}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="controls">
          <div className="ctl" style={{ gap: 8 }}>
            <span className="ctl-label">
              <span>코드 고치기</span>
            </span>
            <Check label="null 검사 넣기" checked={nullCheck} onChange={setNullCheck} />
            <Check label="string 검사 넣기" checked={strCheck} onChange={setStrCheck} />
            <Check label="x의 타입에 boolean 추가" checked={withBool} onChange={setWithBool} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="마지막 줄의 x" value={end.before.join(' | ') || 'never'} />
            <Readout label="타입 오류" value={end.error ? '있음' : '없음'} color={end.error ? 'var(--bad)' : 'var(--good)'} />
          </div>
          <div className="sw-note">
            {withBool && end.error
                ? 'boolean을 받기로 바꾸자마자 마지막 줄이 빨개졌습니다. 타입을 바꾸면 검사기가 고쳐야 할 곳을 모두 짚어 줍니다.'
                : end.error
                  ? '검사가 빠진 타입이 마지막 줄까지 내려왔습니다. 아래 표에서 그 값이 실제로 멈추는 것을 확인하세요.'
                  : '모든 경우를 처리했습니다. 마지막 줄의 x는 number뿐입니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: make illegal states unrepresentable ─────────────── */

const START: Ev[] = ['fetch', 'fail', 'fetch', 'ok'];
const MAX_EV = 10;

function MiniUi({ loading, error, data }: { loading: boolean; error: string | null; data: string | null }) {
  return (
    <div className="sw-ui">
      {!loading && !error && !data && <span className="dim">아직 아무것도 없음</span>}
      {loading && <span className="spin">⟳ 불러오는 중…</span>}
      {error && <span className="err">⚠ {error}</span>}
      {data && <span className="ok">✓ {data}를 받았습니다</span>}
    </div>
  );
}

const uName = (u: Union) => ({ idle: '처음', loading: '불러오는 중', error: '오류', success: '성공' })[u.status];

function StatesFigure() {
  const [events, setEvents] = useState<Ev[]>(START);
  const [at, setAt] = useState(START.length);
  const { flags, unions } = useMemo(() => replay(events), [events]);
  const f = flags[at];
  const u = unions[at];
  const visited = new Set(flags.slice(0, at + 1).map(flagIndex));
  const impossible = flags.slice(0, at + 1).filter((x) => !LEGAL.has(flagIndex(x))).length;
  const push = (e: Ev) => {
    const next = [...events.slice(0, at), e].slice(-MAX_EV);
    setEvents(next);
    setAt(next.length);
  };

  return (
    <Figure
      no={3}
      title="불가능한 상태를 표현할 수 없게"
      hint="사건을 보내 두 표현이 어떻게 달라지는지 보세요"
      caption={<>상품 목록을 서버에서 불러오는 화면의 상태를 두 가지로 표현했습니다. 왼쪽은 불리언과 null 셋, 오른쪽은 태그가 붙은 유니언입니다. 같은 사건을 두 쪽에 똑같이 보냅니다. 왼쪽 여덟 칸은 플래그 셋으로 만들 수 있는 모든 조합이고, 실선 칸 넷만 뜻이 있는 상태, 빗금 칸은 화면이 뜻을 알 수 없는 상태입니다. 아래 사건 기록을 누르면 그 시점으로 돌아갑니다.</>}
    >
      <div className="sw-pair">
        <div className="sw-col">
          <strong className="sw-pair-title">플래그 셋</strong>
          <Code label="플래그로 표현한 상태">{`
{ loading: boolean;
  error: string | null;
  data: string | null }`}</Code>
          <div className="sw-flags" role="img" aria-label={`플래그 조합 8칸 중 지금은 ${FLAG_NAME[flagIndex(f)] ?? '불가능한 상태'}`}>
            {[4, 5, 6, 7, 0, 1, 2, 3].map((k) => (
              <div key={k} className="sw-flag" data-legal={LEGAL.has(k) || undefined} data-cur={flagIndex(f) === k || undefined} data-seen={visited.has(k) || undefined}>
                <span className="bits mono">
                  {k & 4 ? 'L' : '·'}
                  {k & 2 ? 'E' : '·'}
                  {k & 1 ? 'D' : '·'}
                </span>
                <span className="nm">{FLAG_NAME[k] ?? '?'}</span>
              </div>
            ))}
          </div>
          <div className="sw-label">L: loading이 참 · E: error가 있음 · D: data가 있음</div>
          <MiniUi {...f} />
        </div>
        <div className="sw-col">
          <strong className="sw-pair-title">태그 유니언</strong>
          <Code label="태그 유니언으로 표현한 상태">{`
| { status: 'idle' }
| { status: 'loading' }
| { status: 'error'; error: string }
| { status: 'success'; data: string }`}</Code>
          <div className="sw-ustates" role="img" aria-label={`유니언 상태 4개 중 지금은 ${uName(u)}`}>
            {(['idle', 'loading', 'error', 'success'] as const).map((st) => (
              <div key={st} className="sw-flag" data-legal data-cur={u.status === st || undefined} data-seen={unions.slice(0, at + 1).some((x) => x.status === st) || undefined}>
                <span className="bits mono">{st}</span>
                <span className="nm">{uName({ status: st } as Union)}</span>
              </div>
            ))}
          </div>
          <MiniUi loading={u.status === 'loading'} error={u.status === 'error' ? u.error : null} data={u.status === 'success' ? u.data : null} />
        </div>
      </div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 300px' }}>
          <span className="ctl-label">
            <span>사건 보내기</span>
          </span>
          <div className="btn-row">
            {(Object.keys(EV_LABEL) as Ev[]).map((e) => (
              <Button key={e} small primary={e === 'fetch'} onClick={() => push(e)}>
                {EV_LABEL[e]}
              </Button>
            ))}
            <Button
              small
              onClick={() => {
                setEvents([]);
                setAt(0);
              }}
            >
              처음으로
            </Button>
          </div>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr', flex: '1 1 320px' }}>
          <Readout label="표현 가능 (플래그)" value="8개" />
          <Readout label="표현 가능 (유니언)" value="4개" />
          <Readout label="들른 불가능 상태" value={`${impossible}번`} color={impossible ? 'var(--bad)' : undefined} />
        </div>
      </div>
      <div className="sw-evlog" aria-label="사건 기록">
        <button type="button" className="sw-ev" data-cur={at === 0 || undefined} onClick={() => setAt(0)}>
          시작
        </button>
        {events.map((e, i) => (
          <button key={i} type="button" className="sw-ev" data-cur={at === i + 1 || undefined} data-bad={!LEGAL.has(flagIndex(flags[i + 1])) || undefined} onClick={() => setAt(i + 1)}>
            {i + 1}. {EV_LABEL[e]}
          </button>
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Types() {
  return (
    <>
      <h2>실행해 봐야 아는 오류</h2>
      <p>
        JavaScript로 웹을 만들어 본 사람이라면 <code>TypeError: Cannot read properties of undefined</code>를 한 번쯤 봤을 것입니다. 없는 값의 속성을 읽으려 할 때 나는 오류입니다. 이 오류의 고약한 점은 <strong>실행해서 그 줄에 도착해야</strong> 나온다는 것입니다. 이메일이 있는 사용자로만 테스트했다면, 이메일이 없는 사용자가 처음 로그인하는 날 운영 서버에서야 터집니다.
      </p>
      <p>
        JavaScript처럼 값이 실행 중에야 자기 타입을 드러내는 언어를 <T en="dynamic typing">동적 타입</T> 언어라고 합니다. 반대로 변수와 함수에 타입을 붙여 두고, 실행하기 전에 컴파일러가 타입이 맞는지 검사하는 언어를 <T en="static typing">정적 타입</T> 언어라고 합니다. TypeScript는 JavaScript에 타입을 덧붙인 언어로, 검사가 끝나면 타입을 지우고 평범한 JavaScript로 바뀌어 실행됩니다.
      </p>
      <Code label="타입을 붙인 TypeScript">{`
let count: number = 0;
count = '열';            // 오류: 'string' 형식은 'number' 형식에 할당할 수 없습니다

function area(w: number, h: number): number {
  return w * h;
}
area(3);                  // 오류: 인수 2개가 필요한데 1개를 받았습니다
const n = area(3, 4);     // n의 타입은 적지 않아도 number로 추론된다`}</Code>
      <p>
        타입을 매번 적을 필요는 없습니다. 검사기는 <code>const n = area(3, 4)</code>를 보고 n이 number라는 것을 스스로 알아냅니다(<T en="type inference">타입 추론</T>). 보통 함수의 매개변수와 반환값처럼 경계에만 타입을 적고, 안쪽은 추론에 맡깁니다.
      </p>

      <h2>null과 undefined 다루기</h2>
      <p>
        null 참조를 발명한 토니 호어(Tony Hoare)는 2009년에 이것을 "10억 달러짜리 실수"라고 불렀습니다. 어떤 값이든 null일 수 있으면, 모든 속성 접근이 잠재적인 오류가 되기 때문입니다. TypeScript의 엄격 모드(<code>strictNullChecks</code>)는 이 문제를 타입으로 풉니다. <code>User</code> 타입에는 undefined가 들어갈 수 없고, undefined일 수 있는 값은 <code>User | undefined</code>로 따로 적습니다. 그리고 그런 값의 속성을 읽기 전에 확인했는지를 검사합니다.
      </p>
      <CheckerFigure />
      <p>
        처음 상태에서 검사기는 오류 세 개를 내고, 실제로 사용자 세 명 중 둘에서 프로그램이 멈춥니다. 9번 줄에 검사를 넣으면 user에 관한 오류 둘이 사라지고, 줄 끝의 타입도 <code>User | undefined</code>에서 <code>User</code>로 바뀝니다. 이메일 줄을 <code>?? '이메일 없음'</code>으로 바꾸면 오류가 0이 되고 세 사용자 모두 동작합니다. 고치는 도구는 세 가지입니다.
      </p>
      <ul>
        <li>
          <code>a?.b</code> (<T en="optional chaining">옵셔널 체이닝</T>): a가 null이나 undefined면 멈추지 않고 undefined를 돌려줍니다. 결과의 타입에 undefined가 더해집니다.
        </li>
        <li>
          <code>a ?? b</code> (<T en="nullish coalescing">널 병합</T>): a가 null이나 undefined면 b를 씁니다. 기본값을 정해 undefined를 없앱니다.
        </li>
        <li>
          <code>a!</code> (<T en="non-null assertion">non-null 단언</T>): 검사기에게 "a는 절대 undefined가 아니다"라고 단언합니다. 검사기는 믿어 주지만, 틀렸다면 실행 중에 똑같이 멈춥니다. 10번 줄을 <code>user!.name</code>으로 바꿔 보세요.
        </li>
      </ul>

      <h2>유니언 타입과 좁히기</h2>
      <p>
        <code>number | string | null</code>처럼 여러 타입 중 하나인 값을 <T en="union type">유니언 타입</T>이라고 합니다. 타입을 "가질 수 있는 값의 <a href={lessonHref('math-discrete', 'sets-functions')}>집합</a>"으로 보면 유니언은 합집합입니다. 유니언 값에는 모든 구성원이 공통으로 가진 연산만 할 수 있습니다. 숫자에만 있는 <code>toFixed</code>를 부르려면 먼저 그 값이 숫자임을 확인해야 합니다.
      </p>
      <p>
        검사기는 코드의 흐름을 따라가며 이 확인을 알아챕니다. <code>if (x === null) return</code>을 지나면 그 아래에서 x는 더 이상 null일 수 없고, <code>typeof x === 'string'</code>이 참인 블록 안에서는 x가 문자열입니다. 이렇게 조건문을 지나며 타입이 줄어드는 것을 <T en="narrowing">좁히기</T>라고 합니다.
      </p>
      <NarrowFigure />
      <p>
        null 검사만 있으면 마지막 줄에 <code>number | string</code>이 내려와 오류가 납니다. string 검사를 켜면 number만 남아 오류가 사라집니다. 이제 "x의 타입에 boolean 추가"를 켜 보세요. 함수가 받을 수 있는 값을 하나 늘렸을 뿐인데 검사기가 즉시 마지막 줄을 짚습니다. 큰 프로그램에서 이 효과는 더 커집니다. 타입 정의 한 곳을 바꾸면, 그 변경 때문에 고쳐야 할 곳을 검사기가 수백 개의 파일에서 빠짐없이 찾아 줍니다. 타입은 실수를 막을 뿐 아니라 <strong>변경을 안전하게</strong> 만듭니다.
      </p>

      <h2>불가능한 상태를 표현할 수 없게</h2>
      <p>
        서버에서 상품 목록을 불러오는 화면을 생각해 봅시다. 흔히 <code>loading</code>, <code>error</code>, <code>data</code> 세 변수로 상태를 표현합니다. 그런데 이 세 변수로 만들 수 있는 조합은 <M>{'2 \\times 2 \\times 2 = 8'}</M>가지이고, 그중 뜻이 있는 것은 처음, 불러오는 중, 오류, 성공의 네 가지뿐입니다. "불러오는 중이면서 오류"나 "오류이면서 데이터도 있음"은 화면이 무엇을 보여 줘야 할지 알 수 없는 상태입니다. 그런데도 타입은 이런 상태를 막지 않습니다.
      </p>
      <StatesFigure />
      <p>
        기본 시나리오는 요청이 실패한 뒤 다시 시도해 성공하는 흔한 흐름입니다. 플래그 쪽은 다시 요청할 때 error를 지우는 것을 잊어서, 3번 사건 뒤에는 회전하는 아이콘과 오류 메시지가 함께 뜨고, 4번 뒤에는 오류와 데이터가 함께 뜹니다. 코드 한 줄을 빠뜨린 작은 실수지만, 타입 검사기는 아무 말도 하지 않습니다. 플래그 셋의 타입은 여덟 조합을 모두 정상으로 보기 때문입니다.
      </p>
      <p>
        오른쪽의 <T en="tagged union">태그 유니언</T>은 status라는 태그로 경우를 나누고, 경우마다 필요한 데이터만 붙입니다. error는 status가 'error'일 때만 존재하고, data는 'success'일 때만 존재합니다. 표현할 수 있는 상태가 처음부터 뜻이 있는 넷뿐이므로, 오류와 데이터를 동시에 가진 값은 <strong>만들 수조차 없습니다</strong>. 같은 사건을 보내도 오른쪽은 언제나 넷 중 하나에 있습니다. "불가능한 상태를 표현할 수 없게 만들라(make illegal states unrepresentable)"는 OCaml로 금융 시스템을 만드는 야론 민스키(Yaron Minsky)가 퍼뜨린 말입니다.
      </p>
      <Code label="태그 유니언과 빠짐없는 switch">{`
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: Product[] };

function render(s: State): string {
  switch (s.status) {
    case 'idle':    return '';
    case 'loading': return '불러오는 중…';
    case 'error':   return '오류: ' + s.error;      // 여기서 s.error가 있음을 검사기가 안다
    case 'success': return s.data.length + '개';    // 여기서는 s.data가 있다
    default: {
      const never: never = s;   // 모든 경우를 처리했으면 s는 never
      return never;             // 새 status를 추가하고 case를 잊으면 여기서 타입 오류
    }
  }
}`}</Code>
      <p>
        switch의 각 case 안에서 s는 그 경우의 타입으로 좁혀지므로, 'error' 쪽에서는 <code>s.error</code>를, 'success' 쪽에서는 <code>s.data</code>를 안전하게 읽을 수 있습니다. 마지막 <code>default</code>의 <code>never</code>는 "여기는 도달할 수 없다"는 표시입니다. 나중에 누군가 <code>{"{ status: 'empty' }"}</code>를 추가하고 case를 잊으면, s가 never가 아니게 되어 컴파일 오류가 납니다. 그림 2에서 boolean을 추가했을 때와 같은 효과를 의도적으로 만든 것입니다.
      </p>
      <Callout kind="key">
        정적 타입은 실행하지 않고도 오류를 찾습니다. 테스트가 고른 입력 몇 개를 시험한다면, 타입 검사는 가능한 모든 입력에 대해 한 종류의 실수(없는 속성 읽기, 틀린 타입 넘기기)가 없음을 확인합니다. null이 될 수 있는 값은 타입에 드러내고 좁혀서 쓰며, 상태는 태그 유니언으로 표현해 뜻 없는 조합이 아예 만들어지지 않게 합니다.
      </Callout>

      <h2>타입이 지켜 주지 못하는 것</h2>
      <p>
        TypeScript의 타입은 실행 전에만 존재하고, 실행할 때는 지워집니다. 그래서 몇 가지 구멍이 있습니다. <code>any</code> 타입과 <code>as</code> 형 변환, <code>!</code> 단언은 검사를 끄는 탈출구입니다. 서버에서 받은 JSON은 타입을 붙여도 실제로 그 모양인지 아무도 확인하지 않았으므로, 들어오는 경계에서 따로 검증해야 합니다. 배열 <code>arr[10]</code>은 범위를 벗어나도 기본 설정에서는 undefined 가능성을 알려 주지 않습니다. 그림 1에서 <code>?.</code>만 쓴 이메일 줄이 오류 없이 "undefined"를 화면에 찍은 것도 이런 구멍 중 하나입니다.
      </p>
      <Callout kind="note">
        타입 검사기가 어떻게 동작하는지, 어떤 프로그램을 받아들이고 거절하는지는 <a href={lessonHref('cs-programming-languages', 'type-systems')}>프로그래밍 언어의 타입 시스템</a>에서 더 깊이 다룹니다. JavaScript의 기본 타입과 <code>typeof</code>는 <a href={lessonHref('cs-programming', 'values')}>값과 타입</a>에서 볼 수 있습니다.
      </Callout>

      <Quiz
        q={<>결제 상태를 <code>{'{ paid: boolean; refunded: boolean; failedReason: string | null }'}</code>로 표현했더니, "환불되었는데 결제는 안 된" 주문이 데이터베이스에서 발견되었습니다. 이런 일을 타입으로 막는 가장 좋은 방법은?</>}
        options={['refunded를 refundedAt: Date | null로 바꾼다', "status: 'pending' | 'paid' | 'refunded' | 'failed'를 태그로 한 유니언으로 바꾸고, failed일 때만 reason을 둔다", '세 필드를 모두 옵셔널(?)로 만든다', '결제 코드에 주석으로 주의 사항을 적는다']}
        answer={1}
        explain={<>불리언 둘과 null 하나로는 8가지 이상의 조합이 생기고, 그중 상당수가 뜻이 없습니다. 태그 유니언으로 바꾸면 표현할 수 있는 상태가 뜻이 있는 넷뿐이 되어, "환불되었지만 결제 안 됨" 같은 값은 만들 수 없습니다. 필드를 옵셔널로 만들면 조합이 오히려 늘어납니다.</>}
      />
    </>
  );
}

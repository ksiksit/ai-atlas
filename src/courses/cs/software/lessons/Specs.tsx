import { useMemo, useState, type ReactElement } from 'react';
import { Button, Callout, Check, Code, Figure, M, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { CLIENTS, IMPLS, OPS, SPECS, checkSpec, clientSafe, isSorted, judge, runAccount, runFind, type FindKind, type OpId } from './contract';
import './software.css';

/* ─────────────── Figure 1: who broke the contract? ─────────────── */

const PRESETS = [
  { id: 'ok', label: '보통', arr: '1, 3, 5, 7, 9, 11', x: '7' },
  { id: 'last', label: '마지막 칸', arr: '1, 3, 5, 7, 9', x: '9' },
  { id: 'one', label: '원소 하나', arr: '4', x: '4' },
  { id: 'none', label: '없는 값', arr: '2, 4, 6, 8', x: '5' },
  { id: 'unsorted', label: '정렬 안 됨', arr: '9, 1, 7, 3, 5', x: '9' },
];

const KIND_OPTS: { value: FindKind; label: string }[] = [
  { value: 'correct', label: '올바른 구현' },
  { value: 'buggy', label: '버그 있는 구현' },
  { value: 'defensive', label: '방어적 구현' },
];

const KIND_LINE: Record<FindKind, string> = {
  correct: 'while (lo <= hi) { … }',
  buggy: 'while (lo < hi) { … }   // 한 칸 일찍 멈춤',
  defensive: "if (!isSorted(arr)) throw new Error('정렬 안 됨');",
};

function parseArr(s: string): number[] | null {
  const parts = s.split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.length > 10) return null;
  const a = parts.map(Number);
  return a.every((v) => Number.isFinite(v)) ? a : null;
}

function ContractFigure() {
  const [arrText, setArrText] = useState(PRESETS[0].arr);
  const [xText, setXText] = useState(PRESETS[0].x);
  const [kind, setKind] = useState<FindKind>('correct');
  const arr = parseArr(arrText);
  const x = xText.trim() === '' ? NaN : Number(xText);
  const valid = arr !== null && Number.isFinite(x);
  const run = valid ? runFind(kind, arr, x) : null;
  const v = valid && run ? judge(arr, x, run) : null;
  const present = valid && arr.includes(x);
  const badPair = arr ? arr.findIndex((a, i) => i > 0 && arr[i - 1] > a) : -1;

  const verdict = !v
    ? '배열은 쉼표로 구분한 숫자 1~10개, x는 숫자 하나로 적어 주세요.'
    : v.who === 'ok'
      ? '계약이 지켜졌습니다. 호출한 쪽은 약속한 입력을 주었고, 구현은 약속한 결과를 돌려주었습니다.'
      : v.who === 'implementer'
        ? '구현한 쪽의 잘못입니다. 사전 조건이 지켜졌는데도 사후 조건을 어겼습니다. find를 고쳐야 합니다.'
        : v.who === 'caller'
          ? `호출한 쪽의 잘못입니다. 정렬되지 않은 배열을 넘겼으므로 구현은 무엇을 돌려줘도 계약 위반이 아닙니다.${v.post ? ' 이번에는 결과가 우연히 맞았을 뿐입니다.' : ''} 호출하는 코드를 고쳐야 합니다.`
          : '사전 조건이 깨진 것을 구현이 스스로 검사해 곧바로 예외를 던졌습니다. 잘못은 여전히 호출한 쪽에 있지만, 엉뚱한 값 대신 원인이 적힌 오류가 바로 나옵니다.';

  return (
    <Figure
      no={1}
      title="누가 계약을 어겼나"
      hint="배열과 x, 구현을 바꿔 보세요"
      caption={<>find는 정렬된 배열에서 x를 찾는 이진 탐색입니다. 파란 칸은 구현이 들여다본 칸, 노란 칸은 돌려준 위치, 빨간 테두리는 정렬 순서가 깨진 곳입니다. 아래 세 칸은 사전 조건 검사, 실행, 사후 조건 검사이고, 맨 아래가 판정입니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <Code label="find의 명세">{`
// find(arr, x)
// requires: arr는 오름차순으로 정렬되어 있다
// effects:  x가 arr에 있으면 arr[i] === x인 i를,
//           없으면 -1을 돌려준다`}</Code>
          <div className="sw-label">arr (들여다본 순서: {run && run.probes.length ? run.probes.join(' → ') : '없음'})</div>
          <div className="sw-arr" aria-label={`배열 ${arr ? arr.join(', ') : '잘못된 입력'}`}>
            {(arr ?? []).map((a, i) => (
              <div key={i} className="sw-cell" data-probe={run?.probes.includes(i) || undefined} data-hit={run?.result === i || undefined} data-unsorted={badPair >= 0 && (i === badPair || i === badPair - 1) ? true : undefined}>
                <span className="v">{a}</span>
                <span className="i">{i}</span>
              </div>
            ))}
          </div>
          <div className="sw-pipe">
            <div className="sw-stage" data-t={!v ? 'dim' : v.pre ? 'good' : 'bad'}>
              <strong>① 사전 조건 {v ? (v.pre ? '✓' : '✗') : ''}</strong>
              {!arr ? '—' : isSorted(arr) ? 'arr가 정렬되어 있습니다.' : `arr[${badPair - 1}] = ${arr[badPair - 1]} > arr[${badPair}] = ${arr[badPair]}. 정렬되어 있지 않습니다.`}
            </div>
            <div className="sw-stage" data-t={!run ? 'dim' : run.thrown ? 'bad' : 'good'}>
              <strong>② 실행</strong>
              {!run ? '—' : run.thrown ? <span className="mono">{run.thrown}</span> : <span className="mono">find(arr, {x}) → {run.result}</span>}
            </div>
            <div className="sw-stage" data-t={!v || v.post === null ? 'dim' : v.post ? 'good' : 'bad'}>
              <strong>③ 사후 조건 {v && v.post !== null ? (v.post ? '✓' : '✗') : ''}</strong>
              {!v ? '—' : v.post === null ? '값을 돌려주지 않았으므로 검사하지 않습니다.' : present ? `x는 arr에 있으므로 arr[i] === ${x}인 i여야 합니다.` : 'x가 arr에 없으므로 -1이어야 합니다.'}
            </div>
          </div>
          <div className="sw-verdict" data-who={v?.who} aria-live="polite">
            {verdict}
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>예시 입력</span>
            </span>
            <div className="sw-chips">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="sw-chip"
                  aria-pressed={arrText === p.arr && xText === p.x}
                  onClick={() => {
                    setArrText(p.arr);
                    setXText(p.x);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sw-form">
            <label>
              arr (쉼표로 구분)
              <input className="sw-input" value={arrText} onChange={(e) => setArrText(e.target.value)} spellCheck={false} />
            </label>
            <label>
              x
              <input className="sw-input" inputMode="decimal" value={xText} onChange={(e) => setXText(e.target.value)} />
            </label>
          </div>
          <Seg label="find의 구현" value={kind} onChange={setKind} options={KIND_OPTS} />
          <div className="sw-label mono" style={{ overflowWrap: 'anywhere' }}>
            {KIND_LINE[kind]}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="들여다본 칸" value={run ? `${run.probes.length}칸` : '—'} />
            <Readout label="책임" value={!v ? '—' : v.who === 'ok' ? '없음' : v.who === 'implementer' ? '구현' : '호출'} color={!v || v.who === 'ok' ? undefined : v.who === 'implementer' ? 'var(--bad)' : 'var(--neg)'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: strong and weak specs ─────────────── */

function StrengthFigure() {
  const [specId, setSpecId] = useState('s2');
  const checks = useMemo(() => Object.fromEntries(SPECS.map((s) => [s.id, IMPLS.map((im) => checkSpec(im, s))])), []);
  const spec = SPECS.find((s) => s.id === specId)!;
  const cur = checks[specId];
  const allowed = cur.filter((c) => c.ok).length;
  const safe = CLIENTS.filter((c) => clientSafe(c.needs, specId)).length;
  // the innermost spec each implementation satisfies (the sets are nested A ⊇ B ⊇ C ⊇ D)
  const level = IMPLS.map((_, k) => {
    let lv = -1;
    SPECS.forEach((s, j) => {
      if (checks[s.id][k].ok) lv = j;
    });
    return lv;
  });
  const selIdx = SPECS.indexOf(spec);

  const nest = (j: number): ReactElement => {
    const inBand = IMPLS.filter((_, k) => level[k] === j);
    const s = j >= 0 ? SPECS[j] : null;
    return (
      <div className="sw-nest" data-on={j === selIdx || undefined} data-in={j >= selIdx || undefined} data-root={j < 0 || undefined}>
        <div className="sw-nest-head">
          <span className="sw-nest-name">{s ? `명세 ${s.short}가 허용` : '아무 명세도 만족하지 못함'}</span>
          {inBand.map((im) => (
            <span key={im.id} className="sw-nest-impl">
              {im.name}
            </span>
          ))}
        </div>
        {j < SPECS.length - 1 && nest(j + 1)}
      </div>
    );
  };

  return (
    <Figure
      no={2}
      title="명세가 허용하는 구현들"
      hint="명세를 바꿔 보세요"
      caption={<>일곱 가지 find 구현을 네 명세에 대어 봅니다. 길이 0~4이고 원소가 1, 2, 3인 모든 배열과 모든 x(363가지 입력)를 실제로 넣어, 사전 조건이 참인 입력마다 사후 조건을 검사했습니다. 상자가 안쪽으로 갈수록 강한 명세이고, 상자 안의 구현은 그 명세를 만족합니다. 강한 명세를 만족하는 구현은 그보다 약한 명세도 모두 만족하므로 상자가 포개집니다.</>}
    >
      <div className="controls row">
        <Seg label="명세" value={specId} onChange={setSpecId} options={SPECS.map((s) => ({ value: s.id, label: `명세 ${s.short}` }))} />
      </div>
      <div className="sw-spec-card">
        <div>
          <span className="sw-label">requires</span> {spec.requires}
        </div>
        <div>
          <span className="sw-label">effects</span> {spec.effects}
        </div>
      </div>
      <div className="fig-split">
        <div className="sw-col">
          <div className="sw-nests" role="img" aria-label={`포개진 상자: 명세 ${spec.short}는 일곱 구현 중 ${allowed}개를 허용합니다`}>
            {nest(-1)}
          </div>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl sw-impls">
              <thead>
                <tr>
                  <th>구현</th>
                  <th>명세 {spec.short}</th>
                </tr>
              </thead>
              <tbody>
                {IMPLS.map((im, k) => {
                  const c = cur[k];
                  return (
                    <tr key={im.id} data-in={c.ok ? 'y' : 'n'}>
                      <td>
                        {im.name}
                        <span className="sw-counter">{im.line}</span>
                      </td>
                      <td>
                        {c.ok ? (
                          <span className="sw-mark-ok">✓ 만족</span>
                        ) : (
                          <>
                            <span className="sw-mark-bad">✗</span> 반례 <span className="mono">find([{c.counter!.a.join(', ')}], {c.counter!.x})</span> → {c.counter!.got}
                            <span className="sw-counter">{c.counter!.why}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="허용하는 구현" value={`${allowed} / ${IMPLS.length}`} color="var(--good)" />
            <Readout label="믿고 쓸 수 있는 호출자" value={`${safe} / ${CLIENTS.length}`} color="var(--neg)" />
          </div>
          <div className="sw-label">이 명세만 믿고 코드를 짜도 되는 호출자</div>
          <div className="sw-clients">
            {CLIENTS.map((c) => {
              const ok = clientSafe(c.needs, specId);
              return (
                <div key={c.id}>
                  <span className={ok ? 'sw-mark-ok' : 'sw-mark-bad'}>{ok ? '✓' : '✗'}</span>
                  <span style={{ color: ok ? 'var(--ink)' : 'var(--ink-3)' }}>{c.text}</span>
                </div>
              );
            })}
          </div>
          <div className="sw-note">
            {specId === 's1'
              ? '가장 약한 명세입니다. 구현하기는 쉽지만, 중복이 있거나 없을 수도 있는 값을 찾는 호출자는 이 함수를 쓸 수 없습니다.'
              : specId === 's4'
                ? '가장 강한 명세입니다. 어떤 입력이든 받고 결과가 하나로 정해지므로 모든 호출자가 믿고 쓸 수 있지만, 만족하는 구현은 하나뿐입니다.'
                : '명세를 강하게 할수록 허용하는 구현은 줄고, 그 명세에 기댈 수 있는 호출자는 늘어납니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a bank account's invariant ─────────────── */

const START_OPS: OpId[] = ['dep', 'wd', 'extBal', 'dep', 'wd', 'stmt'];
const MAX_OPS = 12;

function InvariantFigure() {
  const [ops, setOps] = useState<OpId[]>(START_OPS);
  const [priv, setPriv] = useState(false);
  const [copy, setCopy] = useState(false);
  const [check, setCheck] = useState(false);
  const run = useMemo(() => runAccount(ops, { priv, copy, check }), [ops, priv, copy, check]);
  const stopped = run.caughtAt !== null;
  const gap = run.brokeAt !== null && run.caughtAt !== null ? run.caughtAt - run.brokeAt : null;

  const note =
    run.brokeAt === null
      ? priv && copy
        ? '내부 필드는 private이고 history()는 복사본을 돌려주므로, 밖의 코드가 무엇을 해도 불변식을 깰 수 없습니다. 깰 수 있는 것은 이제 클래스 자신의 메서드뿐이고, 메서드만 검토하면 됩니다.'
        : '지금까지는 불변식이 지켜지고 있습니다. 점선 단추(밖의 코드)를 눌러 보세요.'
      : run.caughtAt !== null
        ? `불변식은 ${run.brokeAt + 1}번 줄에서 깨졌고, checkRep이 ${run.caughtAt + 1}번 줄에서 발견해 프로그램을 멈췄습니다.${gap ? ' 밖의 코드가 깬 것은 다음 메서드 호출에서야 잡힙니다.' : ''}`
        : `불변식은 ${run.brokeAt + 1}번 줄에서 깨졌지만 아무도 모릅니다. 프로그램은 틀린 잔액을 들고 계속 실행됩니다.${check ? '' : ' checkRep을 켜 보세요.'}`;

  return (
    <Figure
      no={3}
      title="계좌의 불변식 지키기"
      hint="설계 선택을 켜고 끄며 같은 연산을 다시 실행해 보세요"
      caption={<>불변식은 "잔액은 0 이상이고, 거래 기록을 모두 더한 값과 같다"입니다. 실선 단추는 계좌의 메서드, 주황 점선 단추는 계좌 밖의 코드가 내부를 건드리는 경우입니다. 표의 마지막 칸은 실제로 불변식이 성립하는지를 바깥에서 본 것이고, 노란 줄은 이상한 일이 일어난 줄, 빨간 줄은 checkRep이 멈춘 줄입니다. 설계 선택을 바꾸면 같은 연산 순서를 처음부터 다시 실행합니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl sw-log">
              <thead>
                <tr>
                  <th>#</th>
                  <th>코드</th>
                  <th>결과</th>
                  <th>잔액 / 거래 합</th>
                  <th>불변식</th>
                </tr>
              </thead>
              <tbody>
                {run.rows.map((r, i) => (
                  <tr key={i} data-k={r.kind}>
                    <td className="mono">{i + 1}</td>
                    <td className="mono">
                      {r.code}
                      {r.external && <span className="ext">밖의 코드</span>}
                    </td>
                    <td>{r.outcome}</td>
                    <td className="mono">
                      {r.bal.toLocaleString('ko-KR')} / {r.sum.toLocaleString('ko-KR')}
                    </td>
                    <td className={r.inv ? 'sw-mark-ok' : 'sw-mark-bad'}>{r.inv ? '✓' : '✗'}</td>
                  </tr>
                ))}
                {!run.rows.length && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--ink-3)' }}>
                      아래 단추로 연산을 추가하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sw-ops" role="group" aria-label="연산 추가">
            {OPS.map((op) => (
              <Button key={op.id} small onClick={() => setOps([...ops, op.id])} disabled={stopped || ops.length >= MAX_OPS}>
                <span data-ext={op.external || undefined}>{op.code}</span>
              </Button>
            ))}
          </div>
          <div className="sw-note" aria-live="polite" data-tone={run.brokeAt === null ? 'good' : run.caughtAt === null ? 'bad' : undefined}>
            {note}
          </div>
        </div>
        <div className="controls">
          <div className="ctl" style={{ gap: 8 }}>
            <span className="ctl-label">
              <span>설계 선택</span>
            </span>
            <Check label={<>필드를 private으로 (<code>#balance</code>)</>} checked={priv} onChange={setPriv} />
            <Check label={<>history()가 복사본을 돌려줌</>} checked={copy} onChange={setCopy} />
            <Check label={<>메서드마다 checkRep() 호출</>} checked={check} onChange={setCheck} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="불변식이 깨진 줄" value={run.brokeAt === null ? '없음' : `${run.brokeAt + 1}번`} color={run.brokeAt === null ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="발견한 줄" value={run.caughtAt === null ? (run.brokeAt === null ? '—' : '못 찾음') : `${run.caughtAt + 1}번`} />
          </div>
          <div className="btn-row">
            <Button small onClick={() => setOps([])}>
              모두 지우기
            </Button>
            <Button small onClick={() => setOps(START_OPS)}>
              처음 예시로
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Specs() {
  return (
    <>
      <h2>이름만으로는 알 수 없다</h2>
      <p>
        동료가 만든 <code>find(arr, x)</code>라는 함수를 쓰려고 합니다. 이름을 보면 배열에서 x를 찾는 함수 같습니다. 그런데 막상 쓰려고 하면 물어볼 것이 많습니다. x가 없으면 무엇을 돌려주나요? -1인가요, undefined인가요, 예외인가요? x가 두 번 있으면 어느 위치를 주나요? 배열이 정렬되어 있어야 하나요? 배열을 바꾸지는 않나요?
      </p>
      <p>
        코드를 열어 보면 답을 알 수 있을 것 같지만, 그것은 함정입니다. 코드는 지금 이 순간의 동작을 알려 줄 뿐, 앞으로도 그렇게 동작하겠다는 약속은 아닙니다. 내일 동료가 더 빠른 방법으로 바꾸면서 중복이 있을 때 다른 위치를 돌려주게 될 수도 있습니다. 그때 깨지는 것은 "코드를 보니 첫 번째 위치를 주더라"에 기댄 내 코드입니다.
      </p>
      <p>
        그래서 함수가 무엇을 약속하는지를 코드와 따로 적어 둡니다. 이것을 <T en="specification">명세</T>라고 합니다. 명세는 함수를 <T en="client">호출하는 쪽</T>과 <T en="implementer">구현하는 쪽</T> 사이의 계약입니다. 호출하는 쪽은 명세만 보고 코드를 짜고, 구현하는 쪽은 명세만 지키면 내부를 마음대로 바꿀 수 있습니다. 두 사람이 서로의 코드를 읽지 않고도 따로 일할 수 있게 해 주는 벽입니다.
      </p>

      <h2>사전 조건과 사후 조건</h2>
      <p>명세는 보통 두 부분으로 이루어집니다.</p>
      <ul>
        <li>
          <T en="precondition">사전 조건</T>(requires): 호출하는 쪽이 지켜야 할 것. "arr는 정렬되어 있어야 한다", "amount는 0보다 커야 한다"처럼 입력에 대한 요구입니다.
        </li>
        <li>
          <T en="postcondition">사후 조건</T>(effects): 사전 조건이 지켜졌을 때 구현하는 쪽이 보장하는 것. 돌려주는 값, 바꾸는 상태, 던지는 예외를 적습니다.
        </li>
      </ul>
      <p>
        논리식으로 쓰면 명세는 "사전 조건이면 사후 조건"이라는 <a href={lessonHref('math-discrete', 'logic')}>함의</a>입니다. 함의는 앞이 거짓이면 뒤가 무엇이든 참이므로, 사전 조건이 깨진 입력에서는 구현이 무엇을 해도 명세를 어긴 것이 아닙니다. 이것이 계약의 핵심입니다. 무언가 잘못되었을 때 누구의 책임인지가 분명해집니다.
      </p>
      <Code label="명세를 주석으로 적은 이진 탐색">{`
/**
 * 정렬된 배열에서 x의 위치를 찾는다.
 * @param arr  오름차순으로 정렬된 숫자 배열 (requires)
 * @param x    찾을 값
 * @returns    x가 arr에 있으면 arr[i] === x인 i, 없으면 -1 (effects)
 *             arr는 바꾸지 않는다.
 */
function find(arr, x) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;   // 가운데 칸
    if (arr[mid] === x) return mid;
    if (arr[mid] < x) lo = mid + 1;   // 오른쪽 절반만 남긴다
    else hi = mid - 1;                // 왼쪽 절반만 남긴다
  }
  return -1;
}`}</Code>
      <p>
        그림 1에서 입력을 바꿔 가며 판정해 보세요. "버그 있는 구현"을 고르고 "마지막 칸"이나 "원소 하나"를 넣으면, 정렬된 배열인데도 있는 값을 찾지 못합니다. 사전 조건은 지켜졌으니 구현의 잘못입니다. 반대로 "정렬 안 됨"에서는 올바른 구현도 9를 찾지 못하지만, 이번에는 호출한 쪽의 잘못입니다. 이진 탐색은 정렬되어 있다는 가정 위에서 절반을 버리는데, 그 가정을 깬 것은 호출자이기 때문입니다.
      </p>
      <ContractFigure />
      <Callout kind="note">
        실제 라이브러리의 명세도 이렇게 생겼습니다. Java의 <code>Arrays.binarySearch</code> 문서에는 "배열은 호출 전에 정렬되어 있어야 한다. 정렬되어 있지 않으면 결과는 정의되지 않는다"라고 적혀 있습니다. 구현이 검사하지 않을 테니 지키는 것은 호출자의 몫이라는 뜻입니다. 그리고 그 구현조차 2006년까지 9년 동안, 배열이 아주 클 때 <code>(lo + hi) / 2</code>가 정수 범위를 넘쳐 음수가 되는 버그를 품고 있었습니다. 열 줄짜리 함수도 계약을 지키기는 생각보다 어렵습니다.
      </Callout>

      <h2>검사할까, 맡길까</h2>
      <p>
        그림 1의 "방어적 구현"은 사전 조건을 직접 검사해, 정렬되지 않은 배열이 들어오면 곧바로 예외를 던집니다. 이렇게 잘못된 입력이나 상태를 일찍, 크게 알리는 것을 <T en="fail fast">빨리 실패하기</T>라고 합니다. 엉뚱한 -1이 조용히 돌아와 한참 뒤에 다른 곳에서 문제가 터지는 것보다, 원인이 적힌 오류가 그 자리에서 나는 편이 디버깅하기 훨씬 쉽습니다.
      </p>
      <p>
        그렇다면 언제나 검사하는 것이 좋을까요? 이진 탐색은 그렇지 않은 대표적인 예입니다. 배열이 정렬되어 있는지 확인하려면 모든 칸을 봐야 해서 <M>{'O(n)'}</M>이 걸리는데, 이진 탐색 자체는 <M>{'O(\\log n)'}</M>입니다. 검사가 함수보다 비싸면 함수를 쓸 이유가 사라집니다. 그래서 검사가 싸면 예외로 알리고, 검사가 비싸거나 불가능하면 사전 조건으로 적어 호출자에게 맡깁니다. 공개 API처럼 누가 어떻게 부를지 모르는 경계에서는 검사하고, 모듈 안쪽의 작은 함수에서는 사전 조건으로 두는 경우가 많습니다.
      </p>

      <h2>강한 명세, 약한 명세</h2>
      <p>
        같은 find에도 여러 명세를 붙일 수 있습니다. "x가 딱 한 번 있을 때 그 위치를 돌려준다"도 명세이고, "어떤 배열이든 받아서, x가 있으면 가장 앞 위치를, 없으면 -1을 돌려준다"도 명세입니다. 명세 S2가 S1보다 <T en="stronger">강하다</T>는 것은 S2의 사전 조건이 S1보다 느슨하고(더 많은 입력을 받고), 사후 조건은 S1보다 엄격하다(더 많이 보장한다)는 뜻입니다. 그러면 S2를 만족하는 구현은 S1도 반드시 만족하므로, 언제든 S1 자리에 S2를 끼워 넣을 수 있습니다.
      </p>
      <StrengthFigure />
      <p>
        그림 2에서 명세 A부터 D로 갈수록 상자가 좁아집니다. 명세 A는 일곱 구현 중 여섯 개를 허용하지만, 중복 없는 목록에서 찾는 호출자만 안심하고 쓸 수 있습니다. 명세 D는 "앞에서부터" 하나만 허용하지만, 세 호출자 모두가 믿고 쓸 수 있습니다. 명세를 정하는 일은 이 둘 사이에서 고르는 일입니다. 너무 약하면 아무도 쓸 수 없고, 너무 강하면 구현을 바꿀 여지가 사라집니다.
      </p>
      <p>
        명세 B처럼 "arr[i] === x인 아무 i"를 허용하는 명세를 <T en="underdetermined">덜 정해진</T> 명세라고 합니다. 일부러 열어 두면 구현하는 쪽이 더 빠른 방법으로 바꿀 자유가 생깁니다. 대신 호출하는 쪽은 "지금 구현이 우연히 첫 위치를 주더라"에 기대면 안 됩니다. 실제로 JavaScript의 <code>Array.prototype.sort</code>는 오랫동안 같은 값의 원래 순서를 지키는지(안정성)를 명세에 적지 않았고, 엔진마다 결과가 달랐습니다. 순서가 유지되리라 믿은 코드는 어떤 브라우저에서만 깨졌습니다. 2019년 명세(ES2019)가 안정 정렬을 요구하도록 강해지면서 이 문제가 사라졌습니다.
      </p>
      <Callout kind="key">
        명세는 호출하는 쪽과 구현하는 쪽의 계약입니다. 사전 조건이 깨지면 호출한 쪽의 책임, 사전 조건이 지켜졌는데 사후 조건이 깨지면 구현한 쪽의 책임입니다. 명세를 강하게 하면 호출자는 더 많이 기댈 수 있고, 구현자는 지킬 것이 늘어납니다.
      </Callout>

      <h2>불변식: 객체가 언제나 지키는 약속</h2>
      <p>
        함수 하나의 약속이 사전·사후 조건이라면, 객체가 살아 있는 동안 늘 지키는 약속은 <T en="invariant">불변식</T>입니다. 은행 계좌라면 "잔액은 0 이상이고, 거래 기록을 모두 더한 값과 같다"가 불변식입니다. 생성자가 불변식이 참인 상태로 객체를 만들고, 모든 메서드가 불변식이 참인 상태에서 시작해 참인 상태로 끝나면, 이 객체는 언제 들여다봐도 불변식을 지킵니다.
      </p>
      <p>
        문제는 메서드가 아닌 길로 내부가 바뀌는 경우입니다. 필드가 밖에서 보이면 누구든 <code>acct.balance = -5000</code>을 쓸 수 있습니다. 필드를 숨겨도 안심할 수 없습니다. <code>history()</code>가 내부 배열을 그대로 돌려주면, 받은 쪽이 그 배열에 <code>push</code>하는 순간 계좌 안의 기록도 바뀝니다. 배열은 값이 아니라 <a href={lessonHref('cs-programming', 'arrays-objects')}>참조</a>로 전달되기 때문입니다. 이렇게 내부 표현이 밖으로 새는 것을 <T en="representation exposure">표현 노출</T>이라고 합니다.
      </p>
      <Code label="불변식을 지키는 계좌">{`
class BankAccount {
  #balance = 0;          // # : 클래스 밖에서는 읽을 수도 쓸 수도 없다
  #history = [];         // 거래 금액 기록 (입금 +, 출금 -)

  // 불변식: #balance >= 0 이고 #balance === #history의 합
  #checkRep() {
    const sum = this.#history.reduce((s, v) => s + v, 0);
    if (this.#balance < 0 || this.#balance !== sum) throw new Error('불변식 깨짐');
  }

  deposit(amount) {
    if (!(amount > 0)) throw new Error('입금액은 양수여야 합니다');  // 빨리 실패하기
    this.#history.push(amount);
    this.#balance += amount;
    this.#checkRep();
  }

  withdraw(amount) {
    if (amount > this.#balance) throw new Error('잔액 부족');
    this.#history.push(-amount);
    this.#balance -= amount;
    this.#checkRep();
  }

  history() {
    return [...this.#history];   // 복사본을 준다: 받은 쪽이 바꿔도 내부는 그대로
  }
}`}</Code>
      <p>
        그림 3의 처음 상태는 이 코드에서 세 가지 보호 장치를 모두 뺀 계좌입니다. 3번 줄에서 밖의 코드가 잔액을 -5000으로 바꾸지만 아무 오류도 나지 않고, 이어지는 입금과 출금은 틀린 잔액 위에서 계속 계산됩니다. 마지막 명세서를 받아 든 사람만 이상하다고 느낄 것입니다. checkRep을 켜면 바로 다음 메서드 호출에서 잡히고, private 필드를 켜면 아예 깨지지 않습니다. <code>acct.history().push(1000000)</code>도 넣어 보세요. 이것은 private만으로는 막히지 않고, 복사본을 돌려줘야 막힙니다.
      </p>
      <InvariantFigure />
      <Callout kind="intuition">
        불변식이 깨질 수 있는 길이 클래스의 메서드뿐이라면, 불변식이 맞는지 확인하려고 프로그램 전체를 읽을 필요가 없습니다. 메서드 몇 개만 읽으면 됩니다. 정보를 숨기는 진짜 이유는 비밀 유지가 아니라, 확인해야 할 코드의 범위를 줄이는 데 있습니다. 이 생각은 <a href={lessonHref('cs-software-design', 'modules')}>모듈과 추상화</a>에서 다시 만납니다.
      </Callout>
      <Callout kind="warn">
        checkRep은 개발 중에 버그를 일찍 찾는 도구입니다. 불변식 검사가 비싸면(예: 매번 기록 전체를 더하는 경우) 배포판에서는 끄거나, 싼 부분만 남기는 경우가 많습니다. 반대로 사용자가 넘긴 입력을 검사하는 코드는 끄면 안 됩니다. 앞의 것은 내 코드의 실수를 찾는 것이고, 뒤의 것은 밖에서 들어오는 잘못을 막는 것입니다.
      </Callout>

      <Quiz
        q={
          <>
            <code>sqrt(x)</code>의 명세가 "requires: x ≥ 0, effects: r × r이 x와 0.0001 이내인 r을 돌려준다"입니다. 이 명세를 <strong>더 강하게</strong> 바꾼 것은?
          </>
        }
        options={['requires: x > 0 (0은 받지 않음), effects는 그대로', 'requires는 그대로, effects: r × r이 x와 0.01 이내인 r', 'requires: 없음 (음수면 예외를 던짐), effects: x ≥ 0이면 r × r이 x와 0.0001 이내인 r', 'requires: x는 완전제곱수, effects는 그대로']}
        answer={2}
        explain={<>강한 명세는 사전 조건이 느슨하고 사후 조건이 엄격합니다. ③은 음수까지 받아 들이면서(사전 조건이 느슨해짐) 음수일 때의 동작도 약속하므로 원래 명세보다 강합니다. ①과 ④는 받는 입력을 줄였으니 약해졌고, ②는 오차를 크게 허용하니 사후 조건이 느슨해져 약해졌습니다.</>}
      />
    </>
  );
}

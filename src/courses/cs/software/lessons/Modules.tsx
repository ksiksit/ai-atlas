import { useState, type KeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { BASE_EDGES, BY_ROLE, CALLS, CLIENTS, FUNCS, MIXED, NODES, NODE_H, NODE_W, OPTIONS, REP_NAME, REP_SRC, buildOrder, cycles, dependents, grouping, runClient, type GEdge, type Rep } from './deps';
import './software.css';

const onKey = (f: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    f();
  }
};

/* ─────────────── Figure 1: change the representation behind an interface ─────────────── */

function HidingFigure() {
  const [rep, setRep] = useState<Rep>('array');
  const [direct, setDirect] = useState(true);
  const results = CLIENTS.map((c) => runClient(rep, c, direct));
  const broken = results.filter((r) => r.status !== 'ok').length;

  return (
    <Figure
      no={1}
      title="내부 표현을 바꿔도 깨지지 않으려면"
      hint="내부 표현과 호출하는 코드의 방식을 바꿔 보세요"
      caption={<>cart 모듈은 사과 2개, 우유 1개, 빵 1개를 담고 있습니다. 같은 기능을 하는 세 가지 내부 표현 중 하나를 고르면, 다른 모듈의 코드 세 조각을 그 cart에 대고 실제로 실행합니다. 초록은 기대한 값, 노랑은 오류 없이 틀린 값, 빨강은 실행 중 오류입니다.</>}
    >
      <div className="controls row">
        <Seg label="cart의 내부 표현" value={rep} onChange={setRep} options={(Object.keys(REP_NAME) as Rep[]).map((r) => ({ value: r, label: REP_NAME[r] }))} />
        <Seg
          label="다른 모듈의 코드"
          value={direct ? 'd' : 'i'}
          onChange={(v) => setDirect(v === 'd')}
          options={[
            { value: 'd', label: 'cart.items를 직접 읽음' },
            { value: 'i', label: '공개 함수만 씀' },
          ]}
        />
      </div>
      <div className="fig-split">
        <div className="sw-col">
          <Code label={`cart.js (${REP_NAME[rep]})`}>{REP_SRC[rep]}</Code>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="깨진 호출" value={`${broken} / ${CLIENTS.length}`} color={broken ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="cart 밖에서 고칠 곳" value={`${broken}곳`} />
          </div>
          <div className="sw-note">
            {!direct
              ? '어떤 표현을 골라도 세 곳 모두 그대로 동작합니다. 다른 모듈은 add, qtyOf, count, entries라는 약속만 알기 때문입니다.'
              : rep === 'array'
                ? '지금은 모두 맞게 동작합니다. 하지만 세 곳 모두 "items는 { id, qty }의 배열"이라는 cart 내부의 결정에 기대고 있습니다. 표현을 Map으로 바꿔 보세요.'
                : '세 곳 모두 배열이라고 믿고 items를 직접 읽었습니다. cart 안의 결정 하나가 바뀌자 다른 파일 세 개를 고쳐야 합니다. 더 나쁜 것은 오류 없이 틀린 값을 내는 경우입니다.'}
          </div>
        </div>
      </div>
      <div className="sw-clientrows">
        {CLIENTS.map((c, k) => {
          const r = results[k];
          return (
            <div key={c.id} className="sw-clientrow" data-s={r.status}>
              <span className="nm">{c.name}</span>
              <code className="cd">{direct ? c.direct : c.viaApi}</code>
              <span className="out mono">
                {r.status === 'ok' ? '✓ ' : r.status === 'wrong' ? '⚠ ' : '✗ '}
                {r.out}
                {r.status === 'wrong' && <span className="sw-label"> (기대 {c.expect})</span>}
              </span>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: grouping functions into modules ─────────────── */

const GX = [72, 210, 348];
const ROW = 34;
const TOP = 58;

function GroupingFigure() {
  const [assign, setAssign] = useState<number[]>(MIXED);
  const g = grouping(assign);
  const slot = FUNCS.map((_, i) => assign.slice(0, i).filter((m) => m === assign[i]).length);
  const pos = (i: number) => ({ x: GX[assign[i]], y: TOP + slot[i] * ROW });
  const maxRows = Math.max(3, ...[0, 1, 2].map((m) => assign.filter((a) => a === m).length));
  const H = TOP + maxRows * ROW + 6;
  const best = g.across === 3;

  const move = (i: number) => setAssign(assign.map((m, k) => (k === i ? (m + 1) % 3 : m)));

  return (
    <Figure
      no={2}
      title="함수를 모듈로 묶기"
      hint="함수를 눌러 다른 모듈로 옮겨 보세요"
      caption={<>매출 보고서 프로그램의 함수 아홉 개와, 누가 누구를 부르는지(화살표)를 그렸습니다. 함수를 누르면(또는 Tab으로 가서 Enter) 오른쪽 모듈로 옮겨 갑니다. 회색 선은 같은 모듈 안의 호출, 주황 점선은 모듈 경계를 넘는 호출입니다. 경계를 넘는 호출이 적을수록 결합도가 낮고, 모듈 안의 호출이 많을수록 응집도가 높습니다.</>}
    >
      <div className="fig-split">
        <div className="sw-scroll">
          <svg className="sw-svg sw-group" viewBox={`0 0 420 ${H}`} style={{ minWidth: 360, maxWidth: 540 }} role="group" aria-label={`모듈 세 개에 함수 아홉 개를 나눈 그림. 모듈 사이 호출 ${g.across}개, 모듈 안 호출 ${g.inside}개`}>
            <defs>
              <marker id="gm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--ink-3)' }} />
              </marker>
              <marker id="gm-x" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--pos)' }} />
              </marker>
            </defs>
            {[0, 1, 2].map((m) => (
              <g key={m}>
                <rect x={GX[m] - 66} y={8} width={132} height={H - 12} rx={4} className="sw-gbox" />
                <text x={GX[m]} y={28} textAnchor="middle" className="sw-gtitle">
                  모듈 {m + 1}
                </text>
              </g>
            ))}
            {CALLS.map(([a, b], k) => {
              const p = pos(a);
              const q = pos(b);
              const inside = assign[a] === assign[b];
              let d: string;
              if (inside) {
                // same column: bow out to the right so the line clears the chips in between
                const sx = p.x + 52;
                const ex = q.x + 52;
                const bow = 18 + Math.abs(slot[a] - slot[b]) * 8;
                d = `M${sx},${p.y} C${sx + bow},${p.y} ${ex + bow},${q.y} ${ex + 2},${q.y}`;
              } else {
                const dir = q.x > p.x ? 1 : -1;
                const sx = p.x + dir * 54;
                const ex = q.x - dir * 56;
                d = `M${sx},${p.y} C${(sx + ex) / 2},${p.y} ${(sx + ex) / 2},${q.y} ${ex},${q.y}`;
              }
              return <path key={k} d={d} className={inside ? 'sw-gedge' : 'sw-gedge x'} markerEnd={inside ? 'url(#gm-a)' : 'url(#gm-x)'} />;
            })}
            {FUNCS.map((f, i) => {
              const p = pos(i);
              return (
                <g key={f} className="sw-gfn" role="button" tabIndex={0} aria-label={`${f}: 지금 모듈 ${assign[i] + 1}. 누르면 다음 모듈로 옮깁니다`} onClick={() => move(i)} onKeyDown={onKey(() => move(i))}>
                  <rect x={p.x - 52} y={p.y - 12} width={104} height={24} rx={12} />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" className="mono">
                    {f}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="모듈 사이 호출" value={g.across} color="var(--pos)" />
            <Readout label="모듈 안 호출" value={`${g.inside} / ${CALLS.length}`} color="var(--good)" />
          </div>
          <div className="sw-cohesion">
            {g.per.map((p, m) => (
              <div key={m}>
                <span>모듈 {m + 1}</span>
                <span className="bar">
                  <i style={{ width: `${p.touching ? (p.inside / p.touching) * 100 : 0}%` }} />
                </span>
                <span className="mono">{p.touching ? `${Math.round((p.inside / p.touching) * 100)}%` : '—'}</span>
              </div>
            ))}
            <span className="sw-label">막대: 그 모듈이 관여한 호출 중 모듈 안에서 끝나는 비율</span>
          </div>
          <div className="btn-row">
            <Button small onClick={() => setAssign(MIXED)}>
              뒤섞인 상태로
            </Button>
            <Button small onClick={() => setAssign(BY_ROLE)}>
              역할별로 묶기
            </Button>
          </div>
          <div className="sw-note" data-tone={best ? 'good' : undefined}>
            {best
              ? '입력(읽기·해석·검증), 계산(합계·평균·순위), 출력(표·그래프·서식)으로 나눴습니다. 경계를 넘는 호출은 꼭 필요한 세 개뿐입니다.'
              : `모듈 경계를 넘는 호출이 ${g.across}개입니다. 서로 자주 부르는 함수끼리 같은 모듈에 모아 보세요.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the dependency graph ─────────────── */

const byId = new Map(NODES.map((n) => [n.id, n]));
const PAIR_SHIFT: Record<string, number> = { 'cart>pricing': -10, 'pricing>cart': 12, 'checkout>inventory': -10, 'inventory>checkout': 12 };

function edgePath(e: GEdge): string {
  const a = byId.get(e.from)!;
  const b = byId.get(e.to)!;
  const h = NODE_H / 2;
  const s = PAIR_SHIFT[`${e.from}>${e.to}`] ?? 0;
  if (e.from === 'cartPage' && e.to === 'db') {
    // around the left edge, past cart
    return `M${a.x - NODE_W / 2},${a.y} C${8},${a.y} ${8},${b.y} ${b.x - NODE_W / 2 - 2},${b.y}`;
  }
  if (a.y === b.y) {
    const dir = b.x > a.x ? 1 : -1;
    return `M${a.x + (dir * NODE_W) / 2},${a.y} L${b.x - dir * (NODE_W / 2 + 2)},${b.y}`;
  }
  if (b.y > a.y) {
    const sx = a.x + s;
    const ex = b.x + s;
    const sy = a.y + h;
    const ey = b.y - h - 2;
    const my = (sy + ey) / 2;
    return `M${sx},${sy} C${sx},${my} ${ex},${my} ${ex},${ey}`;
  }
  const sx = a.x + s;
  const ex = b.x + s;
  const sy = a.y - h;
  const ey = b.y + h + 2;
  const my = (sy + ey) / 2;
  return `M${sx},${sy} C${sx},${my} ${ex},${my} ${ex},${ey}`;
}

function GraphFigure() {
  const [opts, setOpts] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<string | null>('db');
  const edges = [...BASE_EDGES, ...OPTIONS.filter((o) => opts[o.id]).map((o) => o.edge)];
  const affected = sel ? dependents(edges, sel) : new Set<string>();
  const cyc = cycles(edges);
  const inCycle = new Set(cyc.flat());
  const order = buildOrder(edges);
  const hotSet = new Set([...affected, ...(sel ? [sel] : [])]);
  const cycEdge = (e: GEdge) => cyc.some((c) => c.includes(e.from) && c.includes(e.to));
  const fanIn = sel ? edges.filter((e) => e.to === sel).length : 0;
  const fanOut = sel ? edges.filter((e) => e.from === sel).length : 0;

  return (
    <Figure
      no={3}
      title="의존 관계 그래프"
      hint="모듈을 눌러 고쳐 보고, 아래 선택지로 의존을 더해 보세요"
      caption={<>쇼핑몰 프로그램의 모듈 열 개입니다. 화살표 A → B는 "A가 B를 import한다"는 뜻입니다. 모듈을 누르면 그 모듈을 고쳤다고 보고, 그 변경 때문에 다시 확인해야 하는 모듈(화살표를 거슬러 닿는 모든 모듈)을 노랗게 칠합니다. 빨간 점선은 순환 의존입니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <div className="sw-scroll">
            <svg className="sw-svg sw-dep" viewBox="0 0 460 290" style={{ minWidth: 400, maxWidth: 580 }} role="group" aria-label={`모듈 의존 그래프. ${sel ? `${sel}을 고치면 ${affected.size}개 모듈을 다시 확인해야 합니다.` : ''} ${cyc.length ? '순환 의존이 있습니다.' : '순환 의존은 없습니다.'}`}>
              <defs>
                {(['n', 'h', 'c'] as const).map((k) => (
                  <marker key={k} id={`dm-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" style={{ fill: k === 'n' ? 'var(--ink-3)' : k === 'h' ? 'var(--ink)' : 'var(--bad)' }} />
                  </marker>
                ))}
              </defs>
              {edges.map((e, i) => {
                const c = cycEdge(e);
                const hot = !c && hotSet.has(e.to) && affected.has(e.from);
                return <path key={i} d={edgePath(e)} className="sw-dedge" data-s={c ? 'cyc' : hot ? 'hot' : e.opt ? 'opt' : undefined} markerEnd={`url(#dm-${c ? 'c' : hot ? 'h' : 'n'})`} />;
              })}
              {NODES.map((n) => {
                const st = n.id === sel ? 'sel' : affected.has(n.id) ? 'hit' : undefined;
                return (
                  <g key={n.id} className="sw-dnode" data-s={st} data-cyc={inCycle.has(n.id) || undefined} role="button" tabIndex={0} aria-pressed={n.id === sel} aria-label={`${n.label} 모듈 고치기`} onClick={() => setSel(n.id === sel ? null : n.id)} onKeyDown={onKey(() => setSel(n.id === sel ? null : n.id))}>
                    <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={3} />
                    <text x={n.x} y={n.y + 4} textAnchor="middle" className="mono">
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="sw-note" aria-live="polite">
            {cyc.length
              ? `순환 의존: ${cyc.map((c) => c.slice().reverse().join(' ↔ ')).join(', ')}. 이 모듈들은 서로를 필요로 하므로 따로 떼어 테스트하거나 빌드할 순서를 정할 수 없습니다.`
              : order
                ? `빌드·테스트 순서 (의존하는 쪽이 나중): ${order.join(' → ')}`
                : ''}
          </div>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={sel ? `${sel}을 고치면` : '고친 모듈'} value={sel ? `${affected.size}개 다시 확인` : '—'} />
            <Readout label="의존 화살표" value={edges.length} />
            <Readout label="들어오는 화살표" value={sel ? fanIn : '—'} />
            <Readout label="나가는 화살표" value={sel ? fanOut : '—'} />
          </div>
          <div className="ctl" style={{ gap: 6 }}>
            <span className="ctl-label">
              <span>의존 더하기</span>
            </span>
            {OPTIONS.map((o) => (
              <Check key={o.id} label={o.label} checked={!!opts[o.id]} onChange={(v) => setOpts({ ...opts, [o.id]: v })} />
            ))}
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '고친 모듈', shape: 'sq' },
          { color: 'var(--hl)', label: '다시 확인할 모듈', shape: 'sq' },
          { color: 'var(--bad)', label: '순환 의존', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Modules() {
  return (
    <>
      <h2>고친 곳과 깨진 곳이 다를 때</h2>
      <p>
        장바구니 코드에서 상품을 배열 대신 Map에 담도록 바꿨더니, 한 번도 열어 보지 않은 결제 화면이 깨졌습니다. 결제 화면이 장바구니의 배열을 직접 읽고 있었기 때문입니다. 프로그램이 커질수록 이런 일이 잦아집니다. 한 곳을 고칠 때마다 어디가 깨질지 프로그램 전체를 뒤져야 한다면, 코드가 백 줄일 때는 견딜 만해도 십만 줄일 때는 불가능합니다.
      </p>
      <p>
        해법은 프로그램을 <T en="module">모듈</T>로 나누는 것입니다. 모듈은 밖에 보여 주는 <T en="interface">인터페이스</T>(공개 함수와 그 명세)와 안에 숨기는 <T en="implementation">구현</T>으로 이루어집니다. 다른 모듈은 인터페이스만 쓰고, 구현은 모릅니다. 그러면 구현을 아무리 바꿔도 인터페이스의 약속만 지키면 밖은 깨지지 않습니다.
      </p>

      <h2>정보 은닉</h2>
      <p>
        무엇을 숨겨야 할까요? 1972년 데이비드 파나스(David Parnas)는 논문 「시스템을 모듈로 나누는 기준에 대하여」에서 답했습니다. 모듈은 처리 순서대로 나눌 것이 아니라, <strong>바뀔 가능성이 큰 설계 결정</strong> 하나씩을 숨기도록 나눠야 한다는 것입니다. 이것이 <T en="information hiding">정보 은닉</T>입니다. 장바구니를 배열로 담을지 Map으로 담을지는 성능이나 기능 요구에 따라 바뀌기 쉬운 결정이므로, cart 모듈 안에 숨겨야 합니다.
      </p>
      <Code label="cart.js: export한 것만 밖에서 보인다">{`
// cart.js
const items = new Map();          // export하지 않았으므로 다른 파일에서 볼 수 없다

/** id 상품을 qty개 더 담는다. requires: qty > 0 */
export function add(id, qty) {
  items.set(id, (items.get(id) ?? 0) + qty);
}
/** 담긴 id 상품의 개수 (없으면 0) */
export const qtyOf = (id) => items.get(id) ?? 0;
/** [id, qty] 쌍의 배열. 돌려받은 배열을 고쳐도 장바구니는 바뀌지 않는다 */
export const entries = () => [...items];

// checkout.js
import { entries } from './cart.js';   // cart의 내부가 아니라 약속만 가져온다`}</Code>
      <p>
        그림 1에서 "cart.items를 직접 읽음"인 채로 표현을 Map이나 객체로 바꿔 보세요. 상품 화면은 오류로 멈추고, 아이콘의 숫자는 "undefined", 결제 합계는 "NaN"을 오류 없이 보여 줍니다. 조용히 틀리는 쪽이 더 위험합니다. "공개 함수만 씀"으로 바꾸면 어느 표현에서도 모두 맞습니다. 바뀐 것은 cart.js 하나뿐이고, 밖의 코드는 한 글자도 고칠 필요가 없습니다.
      </p>
      <HidingFigure />
      <p>
        이렇게 연산으로만 정의되고 표현은 숨겨진 타입을 <T en="abstract data type">추상 자료형</T>이라고 합니다. 이미 매일 쓰고 있습니다. JavaScript의 <code>Map</code>이 내부에서 해시 테이블을 어떻게 꾸리는지, <code>Date</code>가 날짜를 "1970년 1월 1일부터 흐른 밀리초"로 저장한다는 것을 몰라도 <code>get</code>과 <code>getMonth()</code>만으로 충분합니다. 엔진 개발자는 그 덕분에 언제든 더 빠른 구현으로 바꿀 수 있습니다. <a href={lessonHref('cs-software-design', 'specs')}>명세와 계약</a>에서 본 계좌의 private 필드도 같은 생각입니다.
      </p>

      <h2>결합도와 응집도</h2>
      <p>
        모듈을 잘 나눴는지는 두 가지로 가늠합니다. <T en="coupling">결합도</T>는 모듈끼리 서로 얼마나 많이 알고 기대는지입니다. 낮을수록 좋습니다. 한 모듈을 고쳐도 다른 모듈에 번지지 않기 때문입니다. <T en="cohesion">응집도</T>는 한 모듈 안의 것들이 얼마나 하나의 목적으로 묶여 있는지입니다. 높을수록 좋습니다. 관련된 변경이 한 모듈 안에서 끝나기 때문입니다.
      </p>
      <p>
        그림 2의 처음 상태는 함수를 아무 기준 없이 세 파일에 나눠 담은 모습입니다. 거의 모든 호출이 모듈 경계를 넘습니다. 이런 구조에서는 "CSV 형식이 바뀌었다"는 변경 하나에 세 파일을 모두 열어야 합니다. 함수를 하나씩 옮겨 경계를 넘는 호출을 줄여 보세요.
      </p>
      <GroupingFigure />
      <p>
        역할별로 묶으면 경계를 넘는 호출이 세 개로 줄어듭니다. 이 셋은 "계산은 입력을 읽어야 하고, 출력은 계산 결과를 그려야 한다"는, 프로그램이 원래 해야 하는 일에서 나온 것이라 없앨 수 없습니다. 결합도를 0으로 만드는 것이 목표가 아닙니다. 모든 함수를 한 모듈에 넣으면 경계를 넘는 호출은 0이 되지만, 그것은 모듈을 나누지 않은 것과 같습니다. 꼭 필요한 의존만 남기고, 그 의존이 좁은 인터페이스를 지나가게 하는 것이 목표입니다.
      </p>
      <Callout kind="intuition">
        좋은 모듈은 "이 모듈은 무엇을 하는가?"에 한 문장으로 답할 수 있습니다. "입력 파일을 읽어 검증된 행을 돌려준다"처럼요. 답에 "그리고"가 여러 번 들어가면 응집도가 낮은 것이고, 다른 모듈의 내부 이름이 들어가면 결합도가 높은 것입니다.
      </Callout>

      <h2>의존 관계 그래프와 순환</h2>
      <p>
        모듈이 다른 모듈을 import하는 관계를 화살표로 그리면 <T en="dependency graph">의존 관계 그래프</T>가 됩니다. 이 그래프는 변경이 어디까지 번지는지 알려 줍니다. B를 고치면 B를 import하는 A를 다시 확인해야 하고, A를 import하는 모듈도 다시 확인해야 합니다. 화살표를 거슬러 올라가며 닿는 모든 모듈이 영향권입니다.
      </p>
      <GraphFigure />
      <p>
        db를 고치면 그것을 직접 쓰는 cart와 inventory, 그리고 그 위의 checkout과 두 화면까지 다섯 모듈이 영향권입니다. 반면 화면 하나를 고치면 다시 확인할 모듈은 없습니다. 아무도 화면을 import하지 않기 때문입니다. 의존은 <strong>잘 바뀌지 않는 쪽으로</strong> 향해야 합니다. 자주 바뀌는 화면이 안정된 db에 기대는 것은 괜찮지만, 거꾸로면 화면을 고칠 때마다 아래가 흔들립니다.
      </p>
      <p>
        이제 선택지를 하나씩 켜 보세요. "logger가 http로 로그 전송"을 켜면 http를 고칠 때의 영향권이 갑자기 넓어집니다. 많은 모듈이 기대는 logger가 http에 기대게 되었기 때문입니다. "pricing이 cart를 import"나 "inventory가 checkout을 호출"을 켜면 <T en="circular dependency">순환 의존</T>이 생깁니다. 순환 안의 모듈들은 사실상 한 덩어리입니다. 하나만 떼어 테스트할 수 없고, 무엇을 먼저 빌드할지 정할 수 없으며(순환이 없을 때 그 순서를 정하는 방법이 <a href={lessonHref('cs-algorithm-design', 'topological-sort')}>위상 정렬</a>입니다), JavaScript에서는 모듈이 아직 다 읽히지 않은 상대를 써서 <code>Cannot access 'X' before initialization</code> 오류를 내기도 합니다.
      </p>
      <Callout kind="key">
        모듈은 바뀌기 쉬운 결정 하나를 숨기고, 다른 모듈은 인터페이스만 씁니다. 그러면 구현을 바꿔도 변경이 모듈 안에서 끝납니다. 결합도는 낮게, 응집도는 높게 나누고, 의존 관계 그래프에서 영향권과 순환을 확인합니다.
      </Callout>
      <Callout kind="note">
        순환을 끊는 흔한 방법은 둘입니다. 서로 필요로 하는 부분을 떼어 새 모듈로 만들고 둘 다 그것에 기대게 하거나, 아래 모듈이 위 모듈을 직접 부르는 대신 위 모듈이 넘겨준 함수(콜백)나 인터페이스를 부르게 합니다. 재고가 checkout을 import하는 대신 "품절되면 이 함수를 불러 달라"고 등록받는 식입니다. 실제 프로젝트에서는 dependency-cruiser나 madge 같은 도구가 import 문을 읽어 이 그래프를 그리고 순환을 찾아 줍니다.
      </Callout>

      <Quiz
        q="날짜를 다루는 date 모듈을 30개 모듈이 import합니다. 내부 표현을 문자열 'YYYY-MM-DD'에서 밀리초 숫자로 바꾸려고 합니다. 다른 모듈을 하나도 고치지 않고 바꿀 수 있는 조건은?"
        options={['30개 모듈이 모두 테스트를 갖고 있다', '30개 모듈이 date의 공개 함수(명세)만 쓰고, 내부 표현에 기대지 않는다', 'date 모듈이 다른 모듈을 하나도 import하지 않는다', '새 표현이 옛 표현보다 빠르다']}
        answer={1}
        explain={<>정보 은닉이 지켜졌다면 내부 표현은 date 모듈만 아는 비밀이므로, 공개 함수의 명세를 그대로 지키는 한 밖에서는 바뀐 것을 알 수 없습니다. 테스트는 깨진 곳을 알려 줄 뿐 고칠 곳을 줄여 주지는 않고, date가 무엇을 import하는지는 date를 쓰는 쪽과 관계없습니다.</>}
      />
    </>
  );
}

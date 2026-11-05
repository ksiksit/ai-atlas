import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Callout, Check, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { SOLVED, asTranspositions, blankAt, bruteForceOrbits, burnside, cycleString, cycles, distances, invariant, inversions, necklaceGroup, neighbours, orbitStabilizer, scramble, sign, slide, solve, swapSquares, tileInversions, transpositionCount, type Board, type Perm, type Sym } from './action';
import './algebra.css';
import './actions.css';

const CAT = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)', 'var(--pos)', 'var(--neg)', 'var(--good)'];
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k: number) => String(k).split('').map((d) => SUPD[+d]).join('');
/** Plain-text name of a necklace symmetry: e, r, r², …, s, sr, sr², … */
const symName = (g: Sym, n: number) => {
  // rotation r^k and reflection s r^k both send bead 0 to bead k
  const k = g.perm[0] % n;
  const r = k === 0 ? '' : k === 1 ? 'r' : `r${sup(k)}`;
  return g.kind === 'rot' ? r || 'e' : `s${r}`;
};

function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="gx-proof" role="note" aria-label={title}>
      <b>{title}</b>
      {children}
      <span className="gx-qed" aria-label="증명 끝">∎</span>
    </div>
  );
}

/* ─────────────── Figure 1: swapping arrow heads flips the sign ─────────────── */

const N5 = 5;
const START: Perm = [1, 2, 0, 4, 3];

function PermFigure() {
  const [p, setP] = useState<Perm>(START);
  const [swaps, setSwaps] = useState(0);
  const [i, setI] = useState(0);
  const [j, setJ] = useState(3);
  const [seed, setSeed] = useState(4);
  const cyc = cycles(p);
  const colorOf = (x: number) => {
    const c = cyc.findIndex((cc) => cc.includes(x));
    return c < 0 ? 'var(--ink-3)' : CAT[c % CAT.length];
  };
  const s = sign(p);
  const startSign = sign(START);
  const swap = () => {
    if (i === j) return;
    const q = p.slice();
    [q[i], q[j]] = [q[j], q[i]];
    setP(q);
    setSwaps((k) => k + 1);
  };
  const reset = (q: Perm) => {
    setP(q);
    setSwaps(0);
  };
  const shuffle = () => {
    const r = rng(seed);
    setSeed((x) => x + 1);
    const q = Array.from({ length: N5 }, (_, k) => k);
    for (let k = N5 - 1; k > 0; k--) {
      const t = Math.floor(r() * (k + 1));
      [q[k], q[t]] = [q[t], q[k]];
    }
    reset(q);
  };
  const X = (k: number) => 40 + k * 85;
  const ts = asTranspositions(p);

  return (
    <Figure
      no={1}
      title="화살표 끝을 맞바꿀 때마다 부호가 바뀐다"
      hint="두 수를 골라 맞바꾸기를 눌러 보세요"
      caption={
        <>
          위 줄의 i에서 아래 줄의 σ(i)로 화살표를 그렸습니다. 같은 색의 화살표들이 하나의 순환을 이루고, 회색은 제자리에 있는 수입니다. 맞바꾸기는 i와 j에서 나가는 두 화살표의 끝을 서로 바꾸는 것으로, 순열에 호환 하나를 곱하는 일입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="i" value={i} onChange={setI} options={Array.from({ length: N5 }, (_, k) => ({ value: k, label: String(k + 1) }))} />
        <Seg label="j" value={j} onChange={setJ} options={Array.from({ length: N5 }, (_, k) => ({ value: k, label: String(k + 1) }))} />
        <div className="btn-row">
          <Button small primary onClick={swap} disabled={i === j}>
            {i + 1}과 {j + 1}의 화살표 끝 맞바꾸기
          </Button>
          <Button small onClick={shuffle}>
            무작위 순열
          </Button>
          <Button small onClick={() => reset(START)}>
            처음 순열
          </Button>
        </div>
      </div>
      <div className="fig-split">
        <div className="gx-perm">
          <svg viewBox="0 0 420 150" role="img" aria-label={`순열 σ = ${cycleString(p)}. ${p.map((v, k) => `${k + 1}→${v + 1}`).join(', ')}`}>
            {p.map((v, k) => {
              const x1 = X(k), y1 = 34, x2 = X(v), y2 = 112;
              const ang = Math.atan2(y2 - y1, x2 - x1);
              const hx = x2 - Math.cos(ang) * 4, hy = y2 - Math.sin(ang) * 4;
              const a1 = ang + Math.PI - 0.45, a2 = ang + Math.PI + 0.45;
              return (
                <g key={k} style={{ stroke: colorOf(k), fill: colorOf(k) }}>
                  <line x1={x1} y1={y1} x2={hx} y2={hy} strokeWidth={2.5} />
                  <path d={`M${hx},${hy} L${hx + Math.cos(a1) * 10},${hy + Math.sin(a1) * 10} L${hx + Math.cos(a2) * 10},${hy + Math.sin(a2) * 10} Z`} stroke="none" />
                </g>
              );
            })}
            {Array.from({ length: N5 }, (_, k) => (
              <g key={k} fontFamily="var(--font-mono)" fontSize="15" fontWeight={700} textAnchor="middle" fill="var(--ink)">
                <text x={X(k)} y={22}>
                  {k + 1}
                </text>
                <text x={X(k)} y={136}>
                  {k + 1}
                </text>
              </g>
            ))}
          </svg>
          <table className="gx-twoline" aria-label="두 줄 표기">
            <tbody>
              <tr>{p.map((_, k) => <td key={k}>{k + 1}</td>)}</tr>
              <tr>{p.map((v, k) => <td key={k} style={{ color: colorOf(k) }}>{v + 1}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="순환 표기" value={<span style={{ whiteSpace: 'nowrap' }}>{cycleString(p)}</span>} />
          <Readout label="호환으로 쓰면" value={ts.length ? ts.map(([a, b]) => <span key={`${a}-${b}`} style={{ whiteSpace: 'nowrap' }}>{`(${a + 1} ${b + 1})`}</span>) : 'e'} />
          <Readout label="필요한 호환 수" value={`${transpositionCount(p)}`} />
          <Readout label="뒤바뀐 쌍" value={`${inversions(p)}`} />
          <Readout label="부호" value={s === 1 ? '+1 (짝)' : '−1 (홀)'} color={s === 1 ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="맞바꾼 횟수" value={`${swaps}`} />
        </div>
      </div>
      <div className="ag-note" aria-live="polite">
        {swaps === 0
          ? `σ = ${cycleString(p)}는 호환 ${transpositionCount(p)}개의 곱이고 뒤바뀐 쌍이 ${inversions(p)}개라 둘 다 ${transpositionCount(p) % 2 ? '홀수' : '짝수'}입니다.`
          : `처음 부호 ${startSign === 1 ? '+1' : '−1'}에서 ${swaps}번 맞바꿨으므로 지금 부호는 ${startSign * (swaps % 2 ? -1 : 1) === 1 ? '+1' : '−1'}이어야 하고, 실제로 ${s === 1 ? '+1' : '−1'}입니다. 맞바꾸는 방법을 어떻게 골라도 이 관계는 깨지지 않습니다.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the 8-puzzle and its invariant ─────────────── */

function PuzzleFigure() {
  const [seed, setSeed] = useState(1);
  const [board, setBoard] = useState<Board>(() => scramble(40, rng(1)));
  const [cheat, setCheat] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [plan, setPlan] = useState<number[] | null>(null);
  const [planFor, setPlanFor] = useState('');
  const [solvedInfo, setSolvedInfo] = useState<string | null>(null);
  const z = blankAt(board);
  const movable = new Set(neighbours(z));
  const inv = invariant(board);
  const ti = tileInversions(board);
  const done = board.join('') === SOLVED.join('');
  const key = board.join('');
  const myPlan = plan && planFor === key ? plan : null;

  const click = (sq: number) => {
    setSolvedInfo(null);
    if (cheat) {
      if (board[sq] === 0) return;
      if (picked === null) setPicked(sq);
      else if (picked === sq) setPicked(null);
      else {
        setBoard(swapSquares(board, picked, sq));
        setPicked(null);
      }
      return;
    }
    const nb = slide(board, sq);
    if (nb) {
      if (myPlan && myPlan[0] === sq) {
        setPlan(myPlan.slice(1));
        setPlanFor(nb.join(''));
      }
      setBoard(nb);
    }
  };
  const findPlan = () => {
    const d = distances();
    const sol = solve(board);
    if (sol) {
      setPlan(sol);
      setPlanFor(key);
      setSolvedInfo(`가장 짧은 해는 ${sol.length}수입니다. 아래 버튼으로 한 수씩 둘 수 있습니다.`);
    } else {
      setPlan(null);
      let reach = 0;
      for (const v of d) if (v !== 255) reach++;
      setSolvedInfo(`맞춘 상태에서 시작해 갈 수 있는 배치 ${reach.toLocaleString('ko-KR')}가지를 모두 찾아봤지만, 이 배치는 그 안에 없습니다.`);
    }
  };
  const stepPlan = () => {
    if (!myPlan || !myPlan.length) return;
    const nb = slide(board, myPlan[0])!;
    setBoard(nb);
    setPlan(myPlan.slice(1));
    setPlanFor(nb.join(''));
  };
  const onKey = (e: KeyboardEvent, sq: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      click(sq);
    }
  };

  return (
    <Figure
      no={2}
      title="8 퍼즐: 풀 수 있는 배치와 없는 배치"
      hint="빈칸 옆 조각을 눌러 밀어 보세요"
      caption={
        <>
          빈칸 옆의 조각(파란 테두리)을 누르면 빈칸으로 밀립니다. "두 조각 몰래 맞바꾸기"를 켜면 규칙을 어기고 아무 두 조각이나 바꿀 수 있습니다. 불변량은 빈칸까지 포함한 아홉 칸의 순열의 부호에, 빈칸이 오른쪽 아래 제자리에서 떨어진 거리의 홀짝을 곱한 값입니다. 가장 짧은 해는 맞춘 상태에서 시작하는 너비 우선 탐색으로 찾습니다.
        </>
      }
    >
      <div className="controls row">
        <Check
          label="두 조각 몰래 맞바꾸기"
          checked={cheat}
          onChange={(v) => {
            setCheat(v);
            setPicked(null);
          }}
        />
        <div className="btn-row">
          <Button
            small
            onClick={() => {
              const s = seed + 1;
              setSeed(s);
              setBoard(scramble(40, rng(s)));
              setSolvedInfo(null);
            }}
          >
            다시 섞기
          </Button>
          <Button
            small
            onClick={() => {
              setBoard(SOLVED.slice());
              setSolvedInfo(null);
            }}
          >
            맞춘 상태로
          </Button>
          <Button small primary onClick={findPlan}>
            가장 짧은 해 찾기
          </Button>
          <Button small onClick={stepPlan} disabled={!myPlan || !myPlan.length}>
            한 수 두기{myPlan ? ` (남은 ${myPlan.length}수)` : ''}
          </Button>
        </div>
      </div>
      <div className="fig-split">
        <div className="gx-board" role="grid" aria-label={`8 퍼즐 판. ${board.map((t) => (t === 0 ? '빈칸' : t)).join(', ')}`}>
          {board.map((t, sq) => (
            <button
              key={sq}
              type="button"
              className="gx-tile"
              data-blank={t === 0 || undefined}
              data-movable={(!cheat && movable.has(sq)) || undefined}
              data-picked={picked === sq || undefined}
              data-home={(t !== 0 && SOLVED[sq] === t) || undefined}
              onClick={() => click(sq)}
              onKeyDown={(e) => onKey(e, sq)}
              aria-label={t === 0 ? '빈칸' : `조각 ${t}${!cheat && movable.has(sq) ? ', 밀 수 있음' : ''}`}
              tabIndex={t === 0 ? -1 : 0}
            >
              {t === 0 ? '' : t}
            </button>
          ))}
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="아홉 칸 순열의 부호" value={inv.sign === 1 ? '+1' : '−1'} />
          <Readout label="빈칸이 제자리에서 떨어진 거리" value={`${inv.blankDist}칸`} />
          <Readout label="불변량" value={inv.value === 1 ? '+1' : '−1'} color={inv.value === 1 ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="조각 순서의 뒤바뀜" value={`${ti}개 (${ti % 2 ? '홀' : '짝'})`} />
        </div>
      </div>
      <div className="ag-note" data-bad={inv.value !== 1 || undefined} data-good={done || undefined} aria-live="polite">
        {done
          ? '맞췄습니다. 불변량은 +1입니다.'
          : solvedInfo ?? (inv.value === 1 ? '불변량이 +1이므로 풀 수 있는 배치입니다. 직접 풀거나 가장 짧은 해를 찾아보세요.' : '불변량이 −1입니다. 조각을 어떻게 밀어도 이 값은 바뀌지 않으므로 맞춘 상태(+1)에 도달할 수 없습니다.')}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: orbit and stabilizer of a necklace ─────────────── */

function Necklace({ col, size, onBead }: { col: number[]; size: number; onBead?: (i: number) => void }) {
  const n = col.length;
  const c = size / 2;
  const R = size * 0.36;
  const br = Math.max(5, size * 0.075);
  const pos = (i: number): [number, number] => [c + R * Math.sin((2 * Math.PI * i) / n), c - R * Math.cos((2 * Math.PI * i) / n)];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={onBead ? 'group' : 'img'} aria-label={`구슬 ${n}개 목걸이: ${col.map((k) => k + 1).join(', ')}`}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} />
      {col.map((k, i) => {
        const [x, y] = pos(i);
        return onBead ? (
          <circle
            key={i}
            className="gx-bead"
            cx={x}
            cy={y}
            r={br}
            style={{ fill: CAT[k] }}
            stroke="var(--surface)"
            strokeWidth={2}
            role="button"
            tabIndex={0}
            aria-label={`${i + 1}번 구슬, 색 ${k + 1}. 눌러서 색 바꾸기`}
            onClick={() => onBead(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBead(i);
              }
            }}
          />
        ) : (
          <circle key={i} cx={x} cy={y} r={br} style={{ fill: CAT[k] }} stroke="var(--surface)" strokeWidth={1.5} />
        );
      })}
      {onBead && (
        <text x={c} y={c + 4} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-body)">
          1번이 맨 위
        </text>
      )}
    </svg>
  );
}

function OrbitFigure() {
  const [n, setN] = useState(6);
  const [k, setK] = useState(2);
  const [flips, setFlips] = useState(false);
  const [col, setCol] = useState<number[]>([0, 1, 0, 1, 0, 1]);
  const cur = col.length === n ? col.map((x) => x % k) : Array.from({ length: n }, (_, i) => col[i % col.length] % k);
  const G = useMemo(() => necklaceGroup(n, flips), [n, flips]);
  const { orbit, stabilizer } = orbitStabilizer(G, cur);
  const stabSet = new Set(stabilizer.map((g) => g.perm.join(',')));
  const recolor = (i: number) => {
    const c = cur.slice();
    c[i] = (c[i] + 1) % k;
    setCol(c);
  };

  return (
    <Figure
      no={3}
      title="궤도와 안정자"
      hint="구슬을 눌러 색을 바꿔 보세요"
      caption={
        <>
          왼쪽 목걸이의 구슬을 누르면 색이 바뀝니다. 군의 각 원소(돌리기, 그리고 켜면 뒤집기)를 이 색칠에 적용해서 나오는 서로 다른 색칠이 궤도이고, 오른쪽에 모두 그렸습니다. 아래 줄에서 초록으로 칠한 원소가 이 색칠을 그대로 두는 원소, 곧 안정자입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider label="구슬 수 n" value={n} min={3} max={8} step={1} onChange={(v) => setN(v)} />
        <Seg label="색 수" value={k} onChange={setK} options={[2, 3].map((v) => ({ value: v, label: String(v) }))} />
        <Seg label="군" value={flips ? 'd' : 'c'} onChange={(v) => setFlips(v === 'd')} options={[{ value: 'c', label: '돌리기만' }, { value: 'd', label: '돌리기와 뒤집기' }]} />
      </div>
      <div className="fig-split">
        <div className="gx-neck">
          <Necklace col={cur} size={190} onBead={recolor} />
        </div>
        <div className="ag-col">
          <div className="ag-small">궤도: 서로 다른 색칠 {orbit.length}개</div>
          <div className="gx-orbit">
            {orbit.map((o, i) => (
              <Necklace key={i} col={o} size={62} />
            ))}
          </div>
          <div className="ag-small">안정자: {stabilizer.length}개</div>
          <div className="gx-stab">
            {G.map((g, gi) => (
              <span key={gi} data-on={stabSet.has(g.perm.join(',')) || undefined}>
                {symName(g, n)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="|궤도|" value={`${orbit.length}`} />
        <Readout label="|안정자|" value={`${stabilizer.length}`} />
        <Readout label="곱" value={`${orbit.length * stabilizer.length}`} color="var(--good)" />
        <Readout label="|G|" value={`${G.length}`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Burnside's lemma ─────────────── */

function BurnsideFigure() {
  const [n, setN] = useState(6);
  const [k, setK] = useState(2);
  const [flips, setFlips] = useState(false);
  const b = useMemo(() => burnside(n, k, flips), [n, k, flips]);
  const brute = useMemo(() => bruteForceOrbits(n, k, flips), [n, k, flips]);
  const G = b.rows.length;

  return (
    <Figure
      no={4}
      title="번사이드 보조정리로 목걸이 세기"
      hint="구슬 수, 색 수, 군을 바꿔 보세요"
      caption={
        <>
          표의 각 줄은 군의 원소 하나입니다. 그 원소가 구슬을 몇 개의 순환으로 나누는지 세면, 같은 순환 안의 구슬이 모두 같은 색일 때만 색칠이 그대로 남으므로 고정되는 색칠은 k^(순환 수)개입니다. 그 합을 군의 크기로 나눈 값이 서로 다른 목걸이의 수입니다. "직접 나열해 센 궤도"는 모든 색칠을 하나하나 나열해 궤도를 센 값으로, 공식이 맞는지 확인하는 용도입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider label="구슬 수 n" value={n} min={3} max={12} step={1} onChange={setN} />
        <Slider label="색 수 k" value={k} min={2} max={5} step={1} onChange={setK} />
        <Seg label="군" value={flips ? 'd' : 'c'} onChange={(v) => setFlips(v === 'd')} options={[{ value: 'c', label: '돌리기만' }, { value: 'd', label: '돌리기와 뒤집기' }]} />
      </div>
      <div className="fig-split">
        <div className="gx-scroll">
          <table className="gx-burn" aria-label="원소마다 고정되는 색칠의 수">
            <thead>
              <tr>
                <th>원소</th>
                <th>순환 수</th>
                <th>고정되는 색칠</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {symName(r.sym, n)} <span style={{ color: 'var(--ink-3)' }}>{r.sym.name}</span>
                  </td>
                  <td>{r.cyc}</td>
                  <td>
                    {k}
                    {sup(r.cyc)} = {r.fixed.toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>합</td>
                <td />
                <td>{b.total.toLocaleString('ko-KR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr', alignContent: 'start' }}>
          <Readout label="색칠 전체 kⁿ" value={Math.pow(k, n).toLocaleString('ko-KR')} />
          <Readout label="합 ÷ |G|" value={`${b.total.toLocaleString('ko-KR')} ÷ ${G} = ${b.orbits.toLocaleString('ko-KR')}`} color="var(--good)" />
          <Readout label="직접 나열해 센 궤도" value={brute === null ? '너무 많아 생략' : brute.toLocaleString('ko-KR')} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function GroupActions() {
  return (
    <>
      <h2>순열과 순환</h2>
      <p>
        {'{1, 2, …, n}'}을 자기 자신으로 보내는 일대일 대응을 <T en="permutation">순열</T>이라 하고, n개의 순열 전체는 합성을 곱으로 하는 군 <M>{'S_n'}</M>을 이룹니다. 크기는 n!입니다. 순열은 두 줄로 적거나, 수가 어디로 돌아가는지 따라가 <T en="cycle notation">순환 표기</T>로 적습니다. 예를 들어 1→2→3→1로 돌고 4와 5가 서로 바뀌는 순열은 (1 2 3)(4 5)입니다.
      </p>
      <p>
        이 장의 중요한 사실은 모든 유한군이 어떤 순열군 안에 들어 있다는 <T en="Cayley's theorem">케일리 정리</T>입니다. 군의 원소 g는 곱셈표에서 x를 gx로 보내는 순열이고, 이 대응이 준동형이기 때문입니다. 그래서 순열을 이해하면 모든 유한군의 원소를 다룰 수 있습니다.
      </p>
      <p>
        두 원소만 맞바꾸는 순열을 <T en="transposition">호환</T>이라고 합니다. 모든 순열은 호환의 곱으로 쓸 수 있습니다. k개짜리 순환 하나는 호환 k − 1개로 쓸 수 있으므로, n개 중 순환이 c개(제자리인 수도 하나로 셈)인 순열은 호환 n − c개로 충분합니다. 쓰는 방법은 여러 가지지만, 호환 개수의 홀짝만은 언제나 같습니다. 그림 1에서 확인해 보세요.
      </p>
      <PermFigure />
      <p>
        처음 순열 (1 2 3)(4 5)는 호환 3개의 곱이고 뒤바뀐 쌍도 3개라 부호가 −1입니다. 어느 두 화살표의 끝을 맞바꿔도 부호가 뒤집히므로, 몇 번을 어떻게 바꾸든 지금 부호는 처음 부호에 (−1)^(맞바꾼 횟수)를 곱한 값입니다.
      </p>
      <Proof title="정리. 한 순열을 호환의 곱으로 쓰는 방법은 여러 가지지만, 호환 개수의 홀짝은 하나로 정해진다.">
        <p>
          순열의 뒤바뀐 쌍, 곧 i &lt; j인데 σ(i) &gt; σ(j)인 쌍의 수를 셉니다. 이웃한 두 자리를 맞바꾸면 그 두 수의 순서만 바뀌므로 뒤바뀐 쌍은 정확히 1개 늘거나 줄어듭니다.
        </p>
        <p>
          i &lt; j인 두 자리를 맞바꾸는 호환은 이웃끼리의 맞바꿈 2(j − i) − 1번으로 할 수 있습니다. 앞쪽 수를 j까지 옮기고(j − i번) 뒤쪽 수를 i까지 되돌리면(j − i − 1번) 되기 때문입니다. 홀수 번이므로 호환 하나는 뒤바뀐 쌍의 홀짝을 반드시 바꿉니다.
        </p>
        <p>
          항등 순열은 뒤바뀐 쌍이 0개입니다. 따라서 σ를 호환 m개의 곱으로 쓸 수 있다면 m의 홀짝은 σ의 뒤바뀐 쌍의 수의 홀짝과 같고, 쓰는 방법과 상관이 없습니다. 이 홀짝이 <M>{'\\operatorname{sgn}\\sigma = \\pm 1'}</M>이고, 곱하면 개수가 더해지므로 <M>{'\\operatorname{sgn}(\\sigma\\tau) = \\operatorname{sgn}\\sigma \\cdot \\operatorname{sgn}\\tau'}</M>, 곧 준동형입니다.
        </p>
      </Proof>

      <h2>15 퍼즐의 절반은 풀 수 없다</h2>
      <p>
        부호가 실제로 쓰이는 유명한 예가 숫자 조각을 빈칸으로 밀어 순서대로 맞추는 슬라이딩 퍼즐입니다. 3×3 판의 8 퍼즐로 보겠습니다. 빈칸도 9번 조각으로 치면 판의 배치는 아홉 칸의 순열이고, 조각 하나를 미는 것은 빈칸과 그 조각을 맞바꾸는 호환입니다. 그래서 한 번 밀 때마다 순열의 부호가 바뀝니다. 그런데 동시에 빈칸이 한 칸 움직이므로, 빈칸이 제자리(오른쪽 아래)에서 떨어진 거리의 홀짝도 바뀝니다. 둘을 곱한 값은 그대로입니다.
      </p>
      <MB note="조각을 한 번 밀 때마다 두 인수가 함께 부호를 바꿉니다">{'\\operatorname{sgn}(\\text{아홉 칸 순열}) \\cdot (-1)^{\\text{빈칸의 거리}} \\;=\\; \\text{불변량}'}</MB>
      <PuzzleFigure />
      <p>
        처음 판은 맞춘 상태에서 무작위로 40번 민 것이라 불변량이 +1이고, 가장 짧은 해는 24수입니다. "두 조각 몰래 맞바꾸기"를 켜고 맞춘 상태에서 7과 8만 바꿔 보세요. 불변량이 −1이 되고, 탐색은 맞춘 상태에서 갈 수 있는 181,440가지 배치를 모두 뒤져도 이 배치를 찾지 못합니다. 181,440은 정확히 9!/2이고, 불변량이 +1인 배치는 모두 이 안에 있습니다. 실제로 이 그림의 탐색으로 아홉 칸 배치 362,880가지를 모두 확인하면, 갈 수 있는 배치와 불변량이 +1인 배치가 정확히 일치하고 가장 먼 배치도 31수면 맞출 수 있습니다.
      </p>
      <p>
        4×4 판의 15 퍼즐도 같습니다. 16!/2 = 10,461,394,944,000가지 배치만 맞출 수 있고, 14와 15만 바꿔 놓은 판은 영원히 맞출 수 없습니다. 이렇게 "움직여도 변하지 않는 값"을 찾는 것은 어떤 상태에 도달할 수 없음을 증명하는 가장 강력한 방법입니다.
      </p>

      <h2>군이 물건을 움직이는 방식</h2>
      <p>
        정삼각형의 대칭은 꼭짓점을, 순열은 수를, 목걸이를 돌리는 동작은 구슬의 색칠을 움직입니다. 군 G의 원소 g가 집합 X의 원소 x를 g·x로 보내고, 항등원은 아무것도 바꾸지 않으며, 두 동작을 이어 하는 것이 곱과 같을 때 G가 X에 <T en="group action">작용</T>한다고 합니다.
      </p>
      <MB>{'e\\cdot x = x, \\qquad g\\cdot(h\\cdot x) = (gh)\\cdot x'}</MB>
      <p>
        x에 군의 원소를 모두 적용해 얻는 집합을 x의 <T en="orbit">궤도</T>, x를 그대로 두는 원소들의 집합을 <T en="stabilizer">안정자</T>라고 합니다. 안정자는 부분군입니다. 그림 3에서 구슬 n개짜리 목걸이에 돌리기(와 뒤집기)가 작용하는 모습을 보세요.
      </p>
      <OrbitFigure />
      <p>
        처음 목걸이는 두 색이 번갈아 있는 구슬 6개입니다. 돌리기만 쓰면 궤도는 색이 엇갈린 두 가지뿐이고, 안정자는 두 칸씩 돌리는 {'{e, r², r⁴}'} 3개입니다. 2 × 3 = 6이 군의 크기입니다. 뒤집기까지 넣으면 궤도는 그대로 2개, 안정자는 6개, 곱은 12입니다. 구슬을 바꿔 봐도 곱은 언제나 군의 크기입니다.
      </p>
      <Proof title="궤도-안정자 정리. 유한군 G가 X에 작용하면 모든 x에 대해 |G| = |G·x| × |Stab(x)|이다.">
        <p>
          안정자를 S라 합니다. 두 원소 g, h가 x를 같은 곳으로 보낸다는 것은 g·x = h·x ⟺ (h⁻¹g)·x = x ⟺ h⁻¹g ∈ S ⟺ gS = hS입니다.
        </p>
        <p>
          따라서 잉여류 gS를 g·x로 보내는 대응은 잘 정의되고 일대일이며, 정의상 궤도 전체를 덮습니다. 궤도의 크기는 S의 잉여류 개수와 같고, <a href={lessonHref('math-abstract-algebra', 'subgroups-lagrange')}>라그랑주 정리</a>에서 잉여류 개수는 |G| / |S|입니다.
        </p>
      </Proof>

      <h2>번사이드 보조정리: 대칭을 빼고 세기</h2>
      <p>
        구슬 6개를 두 색으로 칠하는 방법은 2⁶ = 64가지지만, 돌려서 같아지는 목걸이를 하나로 치면 몇 가지일까요? 궤도의 개수를 세는 문제입니다. 궤도마다 크기가 달라서 64를 6으로 나눌 수는 없습니다. <a href={lessonHref('math-discrete', 'counting')}>경우의 수</a>에서 겹치는 것을 빼던 방법 대신, 군의 원소마다 그대로 남는 색칠을 세서 평균을 냅니다.
      </p>
      <MB note="Fix(g)는 g를 적용해도 바뀌지 않는 색칠의 집합입니다">{'|X/G| \\;=\\; \\frac{1}{|G|}\\sum_{g \\in G} |\\operatorname{Fix}(g)|'}</MB>
      <Proof title="증명. g·x = x인 쌍 (g, x)의 개수를 두 가지로 센다.">
        <p>
          g마다 세면 <M>{'\\sum_g |\\operatorname{Fix}(g)|'}</M>이고, x마다 세면 <M>{'\\sum_x |\\operatorname{Stab}(x)|'}</M>입니다. 궤도-안정자 정리로 <M>{'|\\operatorname{Stab}(x)| = |G| / |G\\cdot x|'}</M>이므로, 한 궤도에 속한 원소들의 몫을 더하면 |G| × (궤도 크기) / (궤도 크기) = |G|입니다. 따라서 둘째 합은 |G| × (궤도의 수)이고, 양변을 |G|로 나누면 됩니다.
        </p>
      </Proof>
      <BurnsideFigure />
      <p>
        처음 설정(구슬 6개, 두 색, 돌리기만)에서 고정되는 색칠은 그대로 둘 때 64, 한 칸 돌릴 때 2, 두 칸 4, 세 칸 8, 네 칸 4, 다섯 칸 2이고, 합 84를 6으로 나누면 14가지 목걸이입니다. 모든 색칠을 직접 나열해 센 값도 14입니다. 뒤집기를 넣으면 156 ÷ 12 = 13, 세 색이면 돌리기만 130가지, 뒤집기까지 92가지입니다. j칸 돌리기는 구슬을 gcd(n, j)개의 순환으로 나누므로, 순환 수만 알면 2^n가지를 하나하나 볼 필요가 없습니다.
      </p>
      <Callout kind="note">
        같은 생각은 훨씬 큰 군에도 통합니다. 루빅스 큐브를 돌리는 모든 방법도 순열군의 부분군을 이루고, 그 크기는 43,252,003,274,489,856,000입니다. 이 수도 조각의 순열과 방향에 대한 홀짝 불변량 몇 개로 계산합니다. 모서리 조각 하나만 뒤집어 놓은 큐브를 풀 수 없는 것은 15 퍼즐에서 두 조각을 바꾼 판을 풀 수 없는 것과 같은 이유입니다.
      </Callout>

      <Callout kind="key">
        순열은 순환으로 쪼개 적고, 호환의 곱으로 쓸 때의 개수의 홀짝, 곧 부호는 쓰는 방법과 상관없이 정해지는 준동형입니다. 슬라이딩 퍼즐에서는 순열의 부호와 빈칸 거리의 홀짝을 곱한 값이 변하지 않아서 배치의 절반에는 도달할 수 없습니다. 군이 집합에 작용하면 한 원소의 궤도 크기와 안정자 크기의 곱은 언제나 군의 크기이고, 이것으로 대칭을 하나로 친 경우의 수를 원소마다 고정되는 것의 평균으로 세는 번사이드 보조정리가 나옵니다.
      </Callout>
      <Quiz
        q="구슬 4개를 두 색으로 칠한 목걸이를, 돌려서 같아지는 것을 하나로 칠 때 몇 가지인가?"
        options={['4가지', '6가지', '8가지', '16가지']}
        answer={1}
        explain={<>돌리기 4가지가 고정하는 색칠은 그대로 둘 때 2⁴ = 16, 한 칸과 세 칸 돌릴 때 순환이 1개라 2¹ = 2씩, 두 칸 돌릴 때 순환이 2개라 2² = 4입니다. (16 + 2 + 4 + 2) ÷ 4 = 6입니다. 실제로 흰 구슬의 수가 0, 1, 3, 4개인 목걸이가 하나씩, 2개인 목걸이가 이웃한 것과 마주 보는 것 두 가지라서 모두 6가지입니다.</>}
      />
    </>
  );
}

import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button, Callout, Code, Figure, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import './discrete.css';

/** Make an SVG <g> behave like a button for mouse and keyboard. */
const press = (fn: () => void) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  },
});

const setText = (xs: (number | string)[]) => (xs.length ? `{${xs.join(', ')}}` : '∅');

/* ─────────────── Figure 1: Venn diagram ─────────────── */

type Region = 'a' | 'ab' | 'b' | 'out';
type Op = 'union' | 'inter' | 'amb' | 'bma' | 'compA' | 'sym';
const OPS: Record<Op, { label: string; tex: string; regions: Region[]; code: string; sql: string }> = {
  union: { label: 'A ∪ B', tex: 'A \\cup B', regions: ['a', 'ab', 'b'], code: 'A.union(B)', sql: 'UNION' },
  inter: { label: 'A ∩ B', tex: 'A \\cap B', regions: ['ab'], code: 'A.intersection(B)', sql: 'INTERSECT' },
  amb: { label: 'A − B', tex: 'A - B', regions: ['a'], code: 'A.difference(B)', sql: 'EXCEPT' },
  bma: { label: 'B − A', tex: 'B - A', regions: ['b'], code: 'B.difference(A)', sql: 'EXCEPT' },
  compA: { label: 'Aᶜ', tex: 'A^c = U - A', regions: ['b', 'out'], code: 'U.difference(A)', sql: 'NOT IN' },
  sym: { label: 'A △ B', tex: 'A \\,\\triangle\\, B', regions: ['a', 'b'], code: 'A.symmetricDifference(B)', sql: '' },
};
const U = Array.from({ length: 12 }, (_, i) => i + 1);
const VA = { x: 150, y: 128, r: 90 };
const VB = { x: 250, y: 128, r: 90 };
const inC = (c: typeof VA, x: number, y: number, m: number) => Math.hypot(x - c.x, y - c.y) < c.r - m;
const outC = (c: typeof VA, x: number, y: number, m: number) => Math.hypot(x - c.x, y - c.y) > c.r + m;

/** Grid positions inside each region, nearest to the region's middle first. */
const SLOTS: Record<Region, [number, number][]> = (() => {
  const out: Record<Region, [number, number][]> = { a: [], ab: [], b: [], out: [] };
  const mid: Record<Region, [number, number]> = { a: [100, 128], ab: [200, 128], b: [300, 128], out: [200, 236] };
  for (let y = 21; y <= 231; y += 21) {
    for (let x = 20; x <= 380; x += 22.5) {
      const m = 10;
      if (inC(VA, x, y, m) && inC(VB, x, y, m)) out.ab.push([x, y]);
      else if (inC(VA, x, y, m) && outC(VB, x, y, m)) out.a.push([x, y]);
      else if (inC(VB, x, y, m) && outC(VA, x, y, m)) out.b.push([x, y]);
      else if (outC(VA, x, y, m) && outC(VB, x, y, m)) out.out.push([x, y]);
    }
  }
  (Object.keys(out) as Region[]).forEach((r) => out[r].sort((p, q) => Math.hypot(p[0] - mid[r][0], (p[1] - mid[r][1]) * 1.4) - Math.hypot(q[0] - mid[r][0], (q[1] - mid[r][1]) * 1.4)));
  return out;
})();

const VPRESETS: { name: string; a: number[]; b: number[] }[] = [
  { name: '짝수와 3의 배수', a: [2, 4, 6, 8, 10, 12], b: [3, 6, 9, 12] },
  { name: '소수와 홀수', a: [2, 3, 5, 7, 11], b: [1, 3, 5, 7, 9, 11] },
  { name: '겹치지 않음', a: [1, 2, 3], b: [8, 9, 10] },
  { name: '부분집합', a: [4, 8, 12], b: [2, 4, 6, 8, 10, 12] },
];

function VennFigure() {
  const raw = useId().replace(/:/g, '');
  const id = (s: string) => `${raw}-${s}`;
  const [A, setA] = useState<number[]>(VPRESETS[0].a);
  const [B, setB] = useState<number[]>(VPRESETS[0].b);
  const [op, setOp] = useState<Op>('inter');
  const O = OPS[op];
  const region = (x: number): Region => (A.includes(x) ? (B.includes(x) ? 'ab' : 'a') : B.includes(x) ? 'b' : 'out');
  const result = U.filter((x) => O.regions.includes(region(x)));
  const inter = A.filter((x) => B.includes(x));
  const union = U.filter((x) => A.includes(x) || B.includes(x));

  // click cycles: outside → A only → both → B only → outside
  const cycle = (x: number) => {
    const r = region(x);
    const [na, nb] = r === 'out' ? [true, false] : r === 'a' ? [true, true] : r === 'ab' ? [false, true] : [false, false];
    setA((s) => (na ? [...s.filter((y) => y !== x), x].sort((p, q) => p - q) : s.filter((y) => y !== x)));
    setB((s) => (nb ? [...s.filter((y) => y !== x), x].sort((p, q) => p - q) : s.filter((y) => y !== x)));
  };

  const pos = new Map<number, [number, number]>();
  const used: Record<Region, number> = { a: 0, ab: 0, b: 0, out: 0 };
  for (const x of U) {
    const r = region(x);
    const slots = SLOTS[r];
    pos.set(x, slots[Math.min(used[r]++, slots.length - 1)]);
  }
  const on = (r: Region) => O.regions.includes(r);

  return (
    <Figure
      no={1}
      title="벤 다이어그램으로 집합 연산"
      hint="연산을 고르고, 숫자를 눌러 옮겨 보세요"
      caption={<>네모가 전체집합 U = {'{1, …, 12}'}, 왼쪽 원이 A, 오른쪽 원이 B입니다. 색칠된 영역이 고른 연산의 결과이고, 그 안의 숫자가 결과 집합의 원소입니다. 숫자를 누르면 바깥 → A만 → 둘 다 → B만 → 바깥 순서로 자리를 옮깁니다.</>}
    >
      <div className="controls row">
        <Seg label="연산" value={op} onChange={setOp} options={(Object.keys(OPS) as Op[]).map((k) => ({ value: k, label: OPS[k].label }))} />
      </div>
      <div className="fig-split">
        <svg viewBox="0 0 400 250" className="dm-venn" role="img" aria-label={`벤 다이어그램: A = ${setText(A)}, B = ${setText(B)}, ${O.label} = ${setText(result)}`}>
          <defs>
            <clipPath id={id('cb')}>
              <circle cx={VB.x} cy={VB.y} r={VB.r} />
            </clipPath>
            <mask id={id('nb')}>
              <rect x="0" y="0" width="400" height="250" fill="white" />
              <circle cx={VB.x} cy={VB.y} r={VB.r} fill="black" />
            </mask>
            <mask id={id('na')}>
              <rect x="0" y="0" width="400" height="250" fill="white" />
              <circle cx={VA.x} cy={VA.y} r={VA.r} fill="black" />
            </mask>
            <mask id={id('no')}>
              <rect x="0" y="0" width="400" height="250" fill="white" />
              <circle cx={VA.x} cy={VA.y} r={VA.r} fill="black" />
              <circle cx={VB.x} cy={VB.y} r={VB.r} fill="black" />
            </mask>
          </defs>
          <rect x="4" y="4" width="392" height="242" className="u" />
          {on('out') && <rect x="4" y="4" width="392" height="242" className="shade" mask={`url(#${id('no')})`} />}
          {on('a') && <circle cx={VA.x} cy={VA.y} r={VA.r} className="shade" mask={`url(#${id('nb')})`} />}
          {on('b') && <circle cx={VB.x} cy={VB.y} r={VB.r} className="shade" mask={`url(#${id('na')})`} />}
          {on('ab') && <circle cx={VA.x} cy={VA.y} r={VA.r} className="shade" clipPath={`url(#${id('cb')})`} />}
          <circle cx={VA.x} cy={VA.y} r={VA.r} className="ca" />
          <circle cx={VB.x} cy={VB.y} r={VB.r} className="cb" />
          <text x="66" y="52" className="lbl la">
            A
          </text>
          <text x="334" y="52" className="lbl lb">
            B
          </text>
          <text x="384" y="238" className="lbl lu">
            U
          </text>
          {U.map((x) => {
            const [px, py] = pos.get(x)!;
            const inRes = result.includes(x);
            return (
              <g key={x} className="el" data-in={inRes || undefined} transform={`translate(${px} ${py})`} {...press(() => cycle(x))} aria-label={`${x}: ${region(x) === 'out' ? '바깥' : region(x) === 'a' ? 'A만' : region(x) === 'b' ? 'B만' : 'A와 B 모두'}`}>
                <circle r="11" />
                <text dy="0.35em">{x}</text>
              </g>
            );
          })}
        </svg>
        <div className="controls">
          <div className="dm-sentence">
            <M>{O.tex}</M>
            <span className="mono">= {setText(result)}</span>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="A" value={setText(A)} color="var(--c-math-1)" />
            <Readout label="B" value={setText(B)} color="var(--c-math-2)" />
            <Readout label="|A| + |B| − |A ∩ B|" value={`${A.length} + ${B.length} − ${inter.length} = ${union.length} = |A ∪ B|`} />
          </div>
          <div className="dm-codeline mono">
            {O.code}
            {O.sql && (
              <>
                <br />
                SQL: {O.sql}
              </>
            )}
          </div>
          <div className="btn-row">
            {VPRESETS.map((p) => (
              <Button
                key={p.name}
                small
                onClick={() => {
                  setA(p.a);
                  setB(p.b);
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: arrow diagrams of functions ─────────────── */

const YN = ['A', 'B', 'C', 'D', 'E'];

function FunctionFigure() {
  const raw = useId().replace(/:/g, '');
  const [nx, setNx] = useState(4);
  const [ny, setNy] = useState(4);
  const [f, setF] = useState<number[]>([1, 0, 1, 3, -1]);
  const [sel, setSel] = useState<number | null>(null);
  const [seed, setSeed] = useState(3);
  const fx = f.slice(0, nx).map((y) => (y < ny ? y : -1));
  const H = 40 + Math.max(nx, ny) * 44;
  const yAt = (i: number, n: number) => H / 2 + (i - (n - 1) / 2) * 44;
  const XL = 80;
  const YL = 280;

  const total = fx.every((y) => y >= 0);
  const hits = Array.from({ length: ny }, (_, y) => fx.filter((v) => v === y).length);
  const injective = total && hits.every((h) => h <= 1);
  const surjective = total && hits.every((h) => h >= 1);
  const collide = hits.map((h) => h > 1);
  const missed = hits.map((h) => h === 0);

  const assign = (x: number, y: number) => setF((cur) => cur.map((v, i) => (i === x ? y : v)));
  const clickY = (y: number) => {
    if (sel === null) return;
    assign(sel, y);
    setSel(sel + 1 < nx ? sel + 1 : null);
  };
  const preset = (kind: 'inj' | 'sur' | 'bij' | 'rand') => {
    const r = rng(seed * 17 + 1);
    setSeed((s) => s + 1);
    const perm = Array.from({ length: 5 }, (_, i) => i).sort(() => r() - 0.5);
    let out: number[];
    if (kind === 'rand') out = Array.from({ length: 5 }, () => Math.floor(r() * ny));
    else if (kind === 'inj' || kind === 'bij') out = perm.filter((y) => y < ny).concat([0, 0, 0, 0, 0]).slice(0, 5);
    else {
      // surjective: cover every y once, then fill the rest at random
      const cover = perm.filter((y) => y < ny);
      out = Array.from({ length: 5 }, (_, i) => (i < cover.length ? cover[i] : Math.floor(r() * ny)));
      out = out.slice(0, nx).sort(() => r() - 0.5).concat(out.slice(nx));
    }
    setF(out);
    setSel(null);
  };

  const verdict = !total
    ? `아직 함수가 아닙니다: ${fx.map((y, i) => (y < 0 ? i + 1 : 0)).filter(Boolean).join(', ')}에 화살표가 없습니다.`
    : injective && surjective
      ? '전단사입니다. 모든 B 쪽 원소가 정확히 하나의 화살표를 받으므로 화살표를 뒤집으면 역함수가 됩니다.'
      : injective
        ? `단사이지만 전사가 아닙니다. ${YN.filter((_, y) => y < ny && missed[y]).join(', ')}에 오는 화살표가 없습니다.`
        : surjective
          ? `전사이지만 단사가 아닙니다. ${YN.filter((_, y) => y < ny && collide[y]).join(', ')}에 화살표가 둘 이상 옵니다(충돌).`
          : '단사도 전사도 아닙니다. 충돌하는 곳도, 비어 있는 곳도 있습니다.';

  return (
    <Figure
      no={2}
      title="함수의 화살표 그림: 단사, 전사, 전단사"
      hint="왼쪽 원소를 누른 다음 오른쪽 원소를 눌러 화살표를 바꾸세요"
      caption={<>왼쪽이 정의역 X, 오른쪽이 공역 Y입니다. 함수는 X의 모든 원소에서 화살표가 정확히 하나씩 나가는 규칙입니다. 빨간 테두리는 화살표가 둘 이상 들어온 곳(단사가 깨짐), 점선은 화살표가 하나도 오지 않은 곳(전사가 깨짐)입니다. X와 Y의 크기를 바꾸면 어떤 성질이 아예 불가능해지는지 보세요.</>}
    >
      <div className="fig-split">
        <svg viewBox={`0 0 360 ${H}`} className="dm-fn" role="img" aria-label={`함수 그림: ${fx.map((y, i) => `${i + 1}→${y >= 0 ? YN[y] : '없음'}`).join(', ')}. ${verdict}`}>
          <defs>
            <marker id={`${raw}-ah`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="ah" />
            </marker>
          </defs>
          <ellipse cx={XL} cy={H / 2} rx="44" ry={H / 2 - 6} className="set" />
          <ellipse cx={YL} cy={H / 2} rx="44" ry={H / 2 - 6} className="set" />
          <text x={XL} y="16" className="setname">
            X
          </text>
          <text x={YL} y="16" className="setname">
            Y
          </text>
          {fx.map((y, i) => {
            if (y < 0) return null;
            const x1 = XL + 16;
            const y1 = yAt(i, nx);
            const x2 = YL - 18;
            const y2 = yAt(y, ny);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="arrow" data-bad={collide[y] || undefined} markerEnd={`url(#${raw}-ah)`} />;
          })}
          {Array.from({ length: nx }, (_, i) => (
            <g key={i} className="node x" data-sel={sel === i || undefined} data-none={fx[i] < 0 || undefined} transform={`translate(${XL} ${yAt(i, nx)})`} {...press(() => setSel(sel === i ? null : i))} aria-label={`정의역 원소 ${i + 1}${sel === i ? ' (선택됨)' : ''}`}>
              <circle r="14" />
              <text dy="0.35em">{i + 1}</text>
            </g>
          ))}
          {Array.from({ length: ny }, (_, y) => (
            <g key={y} className="node y" data-bad={collide[y] || undefined} data-miss={missed[y] || undefined} data-target={sel !== null || undefined} transform={`translate(${YL} ${yAt(y, ny)})`} {...press(() => clickY(y))} aria-label={`공역 원소 ${YN[y]}${sel !== null ? `: ${sel + 1}을 여기로 보내기` : ''}`}>
              <circle r="14" />
              <text dy="0.35em">{YN[y]}</text>
            </g>
          ))}
        </svg>
        <div className="controls">
          <Seg label="|X| (정의역 크기)" value={nx} onChange={(v) => { setNx(v); setSel(null); }} options={[3, 4, 5].map((v) => ({ value: v, label: String(v) }))} />
          <Seg label="|Y| (공역 크기)" value={ny} onChange={(v) => { setNy(v); setSel(null); }} options={[3, 4, 5].map((v) => ({ value: v, label: String(v) }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="단사 (일대일)" value={injective ? '예' : '아니오'} color={injective ? 'var(--good)' : 'var(--ink-3)'} />
            <Readout label="전사 (위로)" value={surjective ? '예' : '아니오'} color={surjective ? 'var(--good)' : 'var(--ink-3)'} />
          </div>
          <div className="dm-note" aria-live="polite">
            {sel !== null ? <strong>{sel + 1}을 어디로 보낼까요? 오른쪽 원소를 누르세요. </strong> : null}
            {verdict}
          </div>
          <div className="btn-row">
            <Button small onClick={() => preset('inj')} disabled={nx > ny}>
              단사로
            </Button>
            <Button small onClick={() => preset('sur')} disabled={nx < ny}>
              전사로
            </Button>
            <Button small onClick={() => preset('bij')} disabled={nx !== ny}>
              전단사로
            </Button>
            <Button small onClick={() => preset('rand')}>
              무작위
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: relations, their properties and equivalence classes ─────────────── */

const RN = 6;
type RelKind = 'mod3' | 'le' | 'div' | 'near' | 'empty';
const RELS: Record<RelKind, { label: string; tex: string; f: (a: number, b: number) => boolean }> = {
  mod3: { label: '3으로 나눈 나머지가 같다', tex: 'a \\equiv b \\pmod 3', f: (a, b) => a % 3 === b % 3 },
  le: { label: 'a ≤ b', tex: 'a \\le b', f: (a, b) => a <= b },
  div: { label: 'a가 b를 나눈다', tex: 'a \\mid b', f: (a, b) => b % a === 0 },
  near: { label: '차이가 1 이하', tex: '|a - b| \\le 1', f: (a, b) => Math.abs(a - b) <= 1 },
  empty: { label: '빈 관계', tex: '\\varnothing', f: () => false },
};
const build = (k: RelKind) => Array.from({ length: RN }, (_, i) => Array.from({ length: RN }, (_, j) => RELS[k].f(i + 1, j + 1)));
const CLASS_COLORS = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)', 'var(--good)', 'var(--neg)', 'var(--pos)'];

function RelationFigure() {
  const raw = useId().replace(/:/g, '');
  const [kind, setKind] = useState<RelKind | 'custom'>('mod3');
  const [R, setR] = useState<boolean[][]>(() => build('mod3'));

  const info = useMemo(() => {
    const noRefl = Array.from({ length: RN }, (_, i) => i).filter((i) => !R[i][i]);
    let sym: [number, number] | null = null;
    let tr: [number, number, number] | null = null;
    for (let i = 0; i < RN && !sym; i++) for (let j = 0; j < RN && !sym; j++) if (R[i][j] && !R[j][i]) sym = [i, j];
    for (let i = 0; i < RN && !tr; i++) for (let j = 0; j < RN && !tr; j++) for (let k = 0; k < RN && !tr; k++) if (R[i][j] && R[j][k] && !R[i][k]) tr = [i, j, k];
    const eq = !noRefl.length && !sym && !tr;
    const cls: number[] = Array(RN).fill(-1);
    let c = 0;
    if (eq) for (let i = 0; i < RN; i++) if (cls[i] < 0) { for (let j = 0; j < RN; j++) if (R[i][j]) cls[j] = c; c++; }
    return { noRefl, sym, tr, eq, cls, nCls: c, pairs: R.flat().filter(Boolean).length };
  }, [R]);

  const toggle = (i: number, j: number) => {
    setR((m) => m.map((row, a) => row.map((v, b) => (a === i && b === j ? !v : v))));
    setKind('custom');
  };
  const mark = (i: number, j: number): string | undefined => {
    if (info.tr && ((i === info.tr[0] && j === info.tr[1]) || (i === info.tr[1] && j === info.tr[2]))) return 'via';
    if (info.tr && i === info.tr[0] && j === info.tr[2]) return 'need';
    if (info.sym && i === info.sym[1] && j === info.sym[0]) return 'need';
    if (i === j && info.noRefl.includes(i)) return 'need';
    return undefined;
  };
  const col = (i: number) => (info.eq ? CLASS_COLORS[info.cls[i] % CLASS_COLORS.length] : 'var(--ink-2)');

  // graph layout: six nodes on a circle
  const P = (i: number): [number, number] => [110 + 78 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / RN), 110 + 78 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / RN)];
  const edges: ReactElement[] = [];
  for (let i = 0; i < RN; i++)
    for (let j = 0; j < RN; j++) {
      if (!R[i][j]) continue;
      const [x1, y1] = P(i);
      if (i === j) {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / RN;
        const cx = x1 + 17 * Math.cos(ang);
        const cy = y1 + 17 * Math.sin(ang);
        edges.push(<circle key={`${i}-${j}`} cx={cx} cy={cy} r="8" className="loop" />);
        continue;
      }
      const [x2, y2] = P(j);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const L = Math.hypot(dx, dy);
      const ux = dx / L;
      const uy = dy / L;
      const bend = R[j][i] ? 10 : 0; // two-way pairs curve apart
      const mx = (x1 + x2) / 2 - uy * bend;
      const my = (y1 + y2) / 2 + ux * bend;
      const sx = x1 + ux * 13;
      const sy = y1 + uy * 13;
      const ex = x2 - ux * 14;
      const ey = y2 - uy * 14;
      edges.push(<path key={`${i}-${j}`} d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`} className="edge" markerEnd={`url(#${raw}-rh)`} />);
    }

  return (
    <Figure
      no={3}
      title="관계의 세 가지 성질과 동치류"
      hint="관계를 고르거나 표의 칸을 눌러 바꿔 보세요"
      caption={<>집합 {'{1, …, 6}'} 위의 관계를 표(행 a, 열 b에 ● 이면 a R b)와 화살표 그래프로 함께 보여 줍니다. 성질이 깨지면 그 이유가 되는 칸을 표시합니다: 노란 칸은 문제를 만든 쌍, 빨간 점선 칸은 있어야 하는데 빠진 쌍입니다. 세 성질이 모두 성립하면 동치 관계이고, 같은 색으로 묶인 원소들이 동치류입니다.</>}
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 260px' }}>
          <label className="ctl-label" htmlFor={`${raw}-rel`}>
            <span>관계 a R b</span>
          </label>
          <select
            id={`${raw}-rel`}
            className="select"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as RelKind | 'custom';
              if (k === 'custom') return;
              setKind(k);
              setR(build(k));
            }}
          >
            {(Object.keys(RELS) as RelKind[]).map((k) => (
              <option key={k} value={k}>
                {RELS[k].label}
              </option>
            ))}
            {kind === 'custom' && <option value="custom">직접 고친 관계</option>}
          </select>
        </div>
        <div className="dm-sentence" style={{ flex: '1 1 160px' }}>
          {kind !== 'custom' && <M>{RELS[kind].tex}</M>}
        </div>
      </div>
      <div className="dm-rel">
        <div className="dm-scroll">
          <table className="dm-matrix" aria-label="관계 행렬">
            <thead>
              <tr>
                <th>a\b</th>
                {Array.from({ length: RN }, (_, j) => (
                  <th key={j} style={{ color: col(j) }}>
                    {j + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {R.map((row, i) => (
                <tr key={i}>
                  <th style={{ color: col(i) }}>{i + 1}</th>
                  {row.map((v, j) => (
                    <td key={j}>
                      <button type="button" className="dm-mcell" data-on={v || undefined} data-mark={mark(i, j)} style={v && info.eq ? { color: col(i) } : undefined} aria-pressed={v} aria-label={`${i + 1} R ${j + 1}`} onClick={() => toggle(i, j)}>
                        {v ? '●' : ''}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <svg viewBox="0 0 220 220" className="dm-graph" role="img" aria-label={`관계 그래프: 순서쌍 ${info.pairs}개`}>
          <defs>
            <marker id={`${raw}-rh`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="ah" />
            </marker>
          </defs>
          {edges}
          {Array.from({ length: RN }, (_, i) => {
            const [x, y] = P(i);
            return (
              <g key={i} transform={`translate(${x} ${y})`} className="gnode">
                <circle r="12" style={{ stroke: col(i) }} />
                <text dy="0.35em">{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="readouts dm-readouts-text" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <Readout label="반사적" value={info.noRefl.length ? `아니오 (${info.noRefl.map((i) => `${i + 1}R${i + 1}`).join(', ')} 없음)` : '예'} color={info.noRefl.length ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="대칭적" value={info.sym ? `아니오 (${info.sym[0] + 1}R${info.sym[1] + 1}인데 ${info.sym[1] + 1}R${info.sym[0] + 1} 없음)` : '예'} color={info.sym ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="추이적" value={info.tr ? `아니오 (${info.tr[0] + 1}R${info.tr[1] + 1}, ${info.tr[1] + 1}R${info.tr[2] + 1}인데 ${info.tr[0] + 1}R${info.tr[2] + 1} 없음)` : '예'} color={info.tr ? 'var(--bad)' : 'var(--good)'} />
      </div>
      <div className="dm-note" aria-live="polite">
        {info.eq ? (
          <>
            <strong>동치 관계입니다.</strong> 동치류 {info.nCls}개:{' '}
            {Array.from({ length: info.nCls }, (_, c) => (
              <span key={c} className="mono" style={{ color: CLASS_COLORS[c % CLASS_COLORS.length], marginRight: 10 }}>
                {setText(info.cls.map((v, i) => (v === c ? i + 1 : 0)).filter(Boolean))}
              </span>
            ))}
          </>
        ) : (
          <>동치 관계가 아닙니다. 세 성질 중 깨진 것을 고쳐 보세요. 빨간 점선 칸을 누르면 빠진 쌍이 채워집니다.</>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function SetsFunctions() {
  return (
    <>
      <h2>집합: 모아 놓은 것</h2>
      <p>
        <T en="set">집합</T>은 서로 다른 대상들의 모임입니다. 집합에 들어 있는 대상을 <T en="element">원소</T>라고 하고, x가 A의 원소이면 <M>{'x \\in A'}</M>, 아니면 <M>{'x \\notin A'}</M>로 씁니다. 집합에는 순서와 중복이 없습니다. <M>{'\\{1, 2, 3\\}'}</M>과 <M>{'\\{3, 1, 2, 2\\}'}</M>는 같은 집합입니다. JavaScript의 <code>new Set([3, 1, 2, 2])</code>가 원소 세 개짜리가 되는 것과 같습니다.
      </p>
      <p>집합을 적는 방법은 두 가지입니다. 원소를 늘어놓는 <T en="roster notation">원소나열법</T>과, 원소가 만족할 조건을 쓰는 <T en="set-builder notation">조건제시법</T>입니다.</p>
      <MB note="세로 막대 |는 '단, ~인'으로 읽습니다. ℤ는 정수 전체의 집합입니다.">{'E = \\{2, 4, 6, 8\\} = \\{\\, x \\in \\mathbb{Z} \\mid x \\text{ 는 짝수이고 } 1 \\le x \\le 9 \\,\\}'}</MB>
      <p>
        조건제시법은 코드의 <code>filter</code>와 꼭 닮았습니다: <code>{'range(1, 9).filter(x => x % 2 === 0)'}</code>. 원소가 하나도 없는 집합은 <T en="empty set">공집합</T> <M>{'\\varnothing'}</M>이고, A의 원소 개수는 <M>{'|A|'}</M>로 씁니다. A의 모든 원소가 B에도 있으면 A는 B의 <T en="subset">부분집합</T>이고 <M>{'A \\subseteq B'}</M>로 씁니다.
      </p>

      <h2>집합 연산</h2>
      <p>
        두 집합에서 새 집합을 만드는 연산은 1장의 논리 연산자와 짝을 이룹니다. <T en="union">합집합</T> <M>{'A \\cup B'}</M>는 "A에 있거나 B에 있는" 원소, <T en="intersection">교집합</T> <M>{'A \\cap B'}</M>는 "A에 있고 B에도 있는" 원소, <T en="difference">차집합</T> <M>{'A - B'}</M>는 "A에 있고 B에는 없는" 원소, <T en="complement">여집합</T> <M>{'A^c'}</M>는 전체집합 U에서 "A에 없는" 원소입니다.
      </p>
      <MB note="∪는 ∨, ∩는 ∧, 여집합은 ¬에 해당합니다.">{'A \\cup B = \\{x \\mid x \\in A \\lor x \\in B\\} \\qquad A \\cap B = \\{x \\mid x \\in A \\land x \\in B\\}'}</MB>
      <VennFigure />
      <p>
        그림 1에서 연산을 바꿔 가며 색칠된 영역을 보세요. 드모르간 법칙도 그대로 성립합니다. <M>{'(A \\cup B)^c = A^c \\cap B^c'}</M>입니다. "A나 B에 있지 않다"는 "A에도 없고 B에도 없다"이니까요. 오른쪽의 <M>{'|A| + |B| - |A \\cap B| = |A \\cup B|'}</M>는 5장에서 볼 포함·배제 원리의 가장 작은 형태입니다. 두 집합을 그냥 더하면 겹친 부분을 두 번 세게 되어 한 번 빼 줍니다.
      </p>
      <p>
        SQL의 <code>UNION</code>, <code>INTERSECT</code>, <code>EXCEPT</code>는 이름부터 집합 연산이고, 요즘 JavaScript의 <code>Set</code>에도 <code>union</code>, <code>intersection</code>, <code>difference</code> 메서드가 있습니다. 관계형 데이터베이스가 집합 위에 어떻게 세워졌는지는 <a href={lessonHref('cs-databases', 'relational-sql')}>관계형 모델과 SQL</a>에서 이어집니다.
      </p>

      <h2>순서쌍과 곱집합</h2>
      <p>
        집합에는 순서가 없지만, 순서가 중요한 짝도 필요합니다. <T en="ordered pair">순서쌍</T> <M>{'(a, b)'}</M>는 첫째와 둘째가 정해진 짝이라 <M>{'(1, 2) \\ne (2, 1)'}</M>입니다. 두 집합의 원소로 만들 수 있는 모든 순서쌍의 집합을 <T en="Cartesian product">곱집합</T>이라고 합니다.
      </p>
      <MB note="|A × B| = |A| · |B|. 셔츠 3벌과 바지 2벌로 만드는 차림은 6가지입니다.">{'A \\times B = \\{(a, b) \\mid a \\in A,\\; b \\in B\\}'}</MB>
      <p>데이터베이스의 표 한 장은 열마다 가능한 값의 집합을 곱한 곱집합의 부분집합입니다. 그리고 곱집합의 부분집합을 고르는 것이 이 장의 나머지 두 주제, 함수와 관계입니다.</p>

      <h2>함수: 하나에 하나씩</h2>
      <p>
        집합 X에서 Y로 가는 <T en="function">함수</T> <M>{'f: X \\to Y'}</M>는 X의 <strong>모든</strong> 원소 x에 Y의 원소 <strong>하나</strong> f(x)를 짝지어 주는 규칙입니다. X를 <T en="domain">정의역</T>, Y를 <T en="codomain">공역</T>이라고 합니다. 화살표로 그리면 X의 각 원소에서 화살표가 정확히 하나씩 나갑니다. Y 쪽에는 그런 제한이 없습니다. 여러 화살표가 한 곳에 모여도 되고, 아무것도 오지 않는 원소가 있어도 됩니다.
      </p>
      <p>Y 쪽 모양에 따라 함수를 세 가지로 나눕니다.</p>
      <ul>
        <li>
          <T en="injective, one-to-one">단사</T>: 서로 다른 x는 서로 다른 곳으로 간다. <M>{'f(x_1) = f(x_2) \\Rightarrow x_1 = x_2'}</M>. 화살표가 겹치는 곳이 없습니다.
        </li>
        <li>
          <T en="surjective, onto">전사</T>: Y의 모든 y에 화살표가 적어도 하나 온다. <M>{'\\forall y\\, \\exists x\\; f(x) = y'}</M>.
        </li>
        <li>
          <T en="bijective">전단사</T>: 단사이면서 전사. Y의 모든 원소가 화살표를 정확히 하나씩 받습니다. 이때만 화살표를 뒤집은 <T en="inverse function">역함수</T> <M>{'f^{-1}'}</M>가 함수가 됩니다.
        </li>
      </ul>
      <FunctionFigure />
      <p>
        그림 2에서 |X| = 5, |Y| = 4로 놓으면 "단사로" 버튼이 꺼집니다. 다섯 개의 화살표가 네 곳에 들어가면 어딘가에서 반드시 둘이 겹치기 때문입니다. 이것이 5장의 비둘기집 원리입니다. 반대로 |X| = 3, |Y| = 4이면 어딘가가 반드시 비어 전사가 불가능합니다. 유한집합 사이에 전단사가 있다는 것은 곧 두 집합의 크기가 같다는 뜻이고, 수학에서 "크기가 같다"의 정의가 바로 이것입니다.
      </p>
      <Callout kind="intuition">
        해시 함수는 무한히 많은 문자열을 유한한 버킷 번호로 보내므로 단사일 수 없습니다. 충돌은 버그가 아니라 정의상 피할 수 없는 일이고, 좋은 해시 함수는 충돌을 고르게 퍼뜨릴 뿐입니다(<a href={lessonHref('cs-algorithms', 'search-hash')}>탐색과 해시 테이블</a>). 반대로 암호화 함수는 복호화가 가능해야 하므로 반드시 단사여야 합니다. 서로 다른 평문이 같은 암호문이 되면 되돌릴 방법이 없습니다.
      </Callout>
      <Code label="함수가 단사인지 확인하기">{`
// f를 정의역의 모든 원소에 적용해 결과가 겹치는지 본다
function isInjective(domain, f) {
  const seen = new Map(); // 결과 → 그 결과를 낸 입력
  for (const x of domain) {
    const y = f(x);
    if (seen.has(y)) return [seen.get(y), x]; // 충돌: 단사가 아님
    seen.set(y, x);
  }
  return true;
}

isInjective([1, 2, 3, 4], (x) => 2 * x + 1);  // true
isInjective([1, 2, 3, 4], (x) => x % 3);      // [1, 4]: 둘 다 1로 간다`}</Code>

      <h2>관계: 무엇과 무엇이 이어져 있나</h2>
      <p>
        함수보다 느슨한 연결도 있습니다. "a는 b의 친구다", "a ≤ b", "a가 b를 나눈다"처럼 두 원소 사이에 성립하거나 성립하지 않는 것을 <T en="relation">관계</T>라고 합니다. 형식적으로 집합 A 위의 관계 R은 <M>{'A \\times A'}</M>의 부분집합이고, <M>{'(a, b) \\in R'}</M>을 <M>{'a \\mathrel{R} b'}</M>로 씁니다. 함수는 각 a에 대해 짝이 정확히 하나인 특별한 관계입니다.
      </p>
      <p>관계가 가질 수 있는 성질 중 세 가지가 특히 중요합니다.</p>
      <ul>
        <li>
          <T en="reflexive">반사적</T>: 모든 a에 대해 <M>{'a \\mathrel{R} a'}</M>. 표의 대각선이 모두 차 있습니다.
        </li>
        <li>
          <T en="symmetric">대칭적</T>: <M>{'a \\mathrel{R} b \\Rightarrow b \\mathrel{R} a'}</M>. 표가 대각선을 기준으로 좌우 대칭입니다.
        </li>
        <li>
          <T en="transitive">추이적</T>: <M>{'a \\mathrel{R} b \\land b \\mathrel{R} c \\Rightarrow a \\mathrel{R} c'}</M>. 두 걸음에 갈 수 있으면 한 걸음에도 갈 수 있습니다.
        </li>
      </ul>
      <RelationFigure />
      <p>
        그림 3에서 "a ≤ b"는 반사적이고 추이적이지만 대칭이 아닙니다. 1 ≤ 2이지만 2 ≤ 1은 아니니까요. "차이가 1 이하"는 반사적이고 대칭이지만 추이적이지 않습니다. 1과 2, 2와 3은 가깝지만 1과 3은 아닙니다. 표에서 노란 칸 두 개가 빨간 점선 칸을 요구하는 모양을 보세요.
      </p>
      <p>
        세 성질을 모두 가진 관계를 <T en="equivalence relation">동치 관계</T>라고 합니다. 동치 관계는 집합을 겹치지 않는 묶음, <T en="equivalence class">동치류</T>로 나눕니다. "3으로 나눈 나머지가 같다"는 1부터 6을 {'{1, 4}'}, {'{2, 5}'}, {'{3, 6}'}으로 나눕니다. 6장의 모듈러 연산은 바로 이 묶음들을 하나의 수처럼 다루는 계산입니다. 같은 사람을 가리키는 계정끼리 묶기, 연결된 컴퓨터끼리 묶기처럼 "같은 것으로 취급하기"가 필요한 곳마다 동치 관계가 있고, 이 묶음을 빠르게 관리하는 자료구조가 <a href={lessonHref('cs-algorithm-design', 'union-find-mst')}>유니온 파인드</a>입니다.
      </p>
      <Callout kind="note">
        반사적이고 추이적이며 대칭 대신 <T en="antisymmetric">반대칭</T>(<M>{'a \\mathrel{R} b \\land b \\mathrel{R} a \\Rightarrow a = b'}</M>)인 관계를 <T en="partial order">부분 순서</T>라고 합니다. "a ≤ b"와 "a가 b를 나눈다"가 그 예이고, 작업의 선후 관계를 정리하는 <a href={lessonHref('cs-algorithm-design', 'topological-sort')}>위상 정렬</a>이 부분 순서를 한 줄로 펴는 알고리즘입니다.
      </Callout>

      <Callout kind="key">
        집합은 순서와 중복이 없는 모임이고, ∪ ∩ − 여집합은 ∨ ∧ ¬의 집합판입니다. 함수는 정의역의 모든 원소에 공역의 원소 하나를 짝짓는 규칙이고, 단사는 겹침이 없고 전사는 빈 곳이 없으며 전단사일 때만 역함수가 있습니다. 관계는 곱집합의 부분집합이고, 반사·대칭·추이를 모두 만족하는 동치 관계는 집합을 동치류로 나눕니다.
      </Callout>
      <Quiz
        q={<>회원 ID(서로 다름)를 받아 그 회원의 가입 연도를 돌려주는 함수 f를 생각하자. 회원이 수천 명이고 연도는 2010~2025년이다. f에 대해 옳은 것은?</>}
        options={['단사이다', '단사가 아니다', '역함수가 있다', '함수가 아니다']}
        answer={1}
        explain={<>회원 수천 명이 16개의 연도로 가므로 같은 연도에 가입한 회원이 반드시 있습니다(비둘기집 원리). 그래서 단사가 아니고, 연도에서 회원을 하나로 되돌릴 수 없으니 역함수도 없습니다. 모든 회원에게 가입 연도가 정확히 하나 있으므로 함수인 것은 맞습니다.</>}
      />
    </>
  );
}

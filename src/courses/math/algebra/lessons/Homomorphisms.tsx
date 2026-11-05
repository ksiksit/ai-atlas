import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Callout, Figure, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { CayleyTable } from './CayleyTable';
import { allSubgroups, cosets, cyclic, dihedral, inverse, isNormal, kleinFour, orderCounts, quaternion, symmetric, type Group } from './group';
import { CATALOGUE, checkHom, compare, cyclicMap, dihedralMap, findIsomorphism, generators, quotient, quotientGroup } from './hom';
import './algebra.css';
import './homomorphisms.css';

/** Categorical colours for images and cosets. */
const CAT = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)', 'var(--pos)', 'var(--neg)', 'var(--good)', 'var(--c-cs-2)', 'var(--c-cs-4)'];
const cat = (i: number) => CAT[i % CAT.length];
const tint = (c: string) => ({ ['--c' as string]: c }) as CSSProperties;

function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="hm-proof" role="note" aria-label={title}>
      <b>{title}</b>
      {children}
      <span className="hm-qed" aria-label="증명 끝">∎</span>
    </div>
  );
}

const prod = (G: Group, a: number, b: number) => (G.op === '+' ? `${G.label(a)} + ${G.label(b)}` : `${G.label(a)}·${G.label(b)}`);

/* ─────────────── Figure 1: is this map a homomorphism? ─────────────── */

function HomFigure() {
  const [kind, setKind] = useState<'cyc' | 'dih'>('cyc');
  const [n, setN] = useState(12);
  const [m, setM] = useState(4);
  const [a0, setA] = useState(1);
  const [dn, setDn] = useState(3);
  const [dm, setDm] = useState(2);
  const [ra0, setRa] = useState(0);
  const [sb0, setSb] = useState(1);
  const a = Math.min(a0, m - 1);
  const ra = Math.min(ra0, dm - 1);
  const sb = Math.min(sb0, dm - 1);

  const { G, H, f } = useMemo(() => {
    if (kind === 'cyc') return { G: cyclic(n), H: cyclic(m), f: cyclicMap(n, m, a) };
    return { G: dihedral(dn), H: cyclic(dm), f: dihedralMap(dn, dm, ra, sb) };
  }, [kind, n, m, a, dn, dm, ra, sb]);
  const c = useMemo(() => checkHom(G, H, f), [G, H, f]);
  const ker = new Set(c.kernel);
  const bad = new Set(c.failures.map(([x, y]) => x * G.n + y));
  const ok = c.failures.length === 0;
  const ex = c.failures[0];

  const note = ok
    ? `준동형입니다. ${c.pairs}쌍 모두에서 φ(ab) = φ(a)φ(b)가 성립합니다. 핵은 {${c.kernel.map(G.label).join(', ')}}로 ${c.kernel.length}개, 상은 {${c.image.map(H.label).join(', ')}}로 ${c.image.length}개입니다.`
    : `준동형이 아닙니다. ${c.pairs}쌍 중 ${c.failures.length}쌍에서 어긋납니다. 예를 들어 ${prod(G, ex[0], ex[1])} = ${G.label(G.mul(ex[0], ex[1]))}이므로 φ(${prod(G, ex[0], ex[1])}) = ${H.label(f[G.mul(ex[0], ex[1])])}이지만, φ(${G.label(ex[0])}) + φ(${G.label(ex[1])}) = ${H.label(f[ex[0]])} + ${H.label(f[ex[1]])} = ${H.label(H.mul(f[ex[0]], f[ex[1]]))} (mod ${H.n})입니다.`;

  return (
    <Figure
      no={1}
      title="준동형인지 모든 쌍에서 확인하기"
      hint="생성원을 어디로 보낼지 고르세요"
      caption={
        <>
          생성원(ℤ/n에서는 1, D_n에서는 회전 r과 뒤집기 s)의 상을 정하면 나머지 원소의 상은 곱의 규칙을 따라 정해집니다. 위의 칩은 각 원소와 그 상이고, 같은 색은 같은 곳으로 가는 원소들입니다. 테두리가 진한 칩이 핵, 곧 항등원으로 가는 원소입니다. 아래 격자는 a(행)와 b(열)의 모든 쌍에서 φ(ab) = φ(a)φ(b)인지 확인한 결과로, 초록 칸은 성립, 빨간 칸은 어긋남입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={kind} onChange={setKind} options={[{ value: 'cyc', label: 'ℤ/n → ℤ/m' }, { value: 'dih', label: 'D_n → ℤ/m' }]} />
        {kind === 'cyc' ? (
          <>
            <Seg label="n" value={n} onChange={setN} options={[6, 8, 12].map((v) => ({ value: v, label: String(v) }))} />
            <Seg label="m" value={m} onChange={setM} options={[2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) }))} />
            <Seg label="φ(1)" value={a} onChange={setA} options={Array.from({ length: m }, (_, v) => ({ value: v, label: String(v) }))} />
          </>
        ) : (
          <>
            <Seg label="n" value={dn} onChange={setDn} options={[3, 4].map((v) => ({ value: v, label: String(v) }))} />
            <Seg label="m" value={dm} onChange={setDm} options={[2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
            <Seg label="φ(r)" value={ra} onChange={setRa} options={Array.from({ length: dm }, (_, v) => ({ value: v, label: String(v) }))} />
            <Seg label="φ(s)" value={sb} onChange={setSb} options={Array.from({ length: dm }, (_, v) => ({ value: v, label: String(v) }))} />
          </>
        )}
      </div>
      <div className="ag-small">{kind === 'cyc' ? <M>{`\\varphi(x) = ${a}\\cdot x \\bmod ${m}`}</M> : <M>{`\\varphi(s^e r^k) = ${sb}\\,e + ${ra}\\,k \\bmod ${dm}`}</M>}</div>
      <div className="hm-map" aria-label="원소와 상">
        {f.map((y, x) => (
          <span key={x} className="hm-chip" style={tint(cat(y))} data-ker={ker.has(x) || undefined}>
            {G.label(x)} <span>↦</span> {H.label(y)}
          </span>
        ))}
      </div>
      <div className="hm-split">
        <div>
          <div className="hm-grid" style={{ gridTemplateColumns: `repeat(${G.n}, 14px)` }} role="img" aria-label={`${G.n}×${G.n} 쌍 중 ${c.failures.length}쌍에서 어긋남`}>
            {Array.from({ length: G.n * G.n }, (_, k) => (
              <i key={k} data-bad={bad.has(k) || undefined} />
            ))}
          </div>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', flex: '1 1 220px' }}>
          <Readout label="어긋난 쌍" value={`${c.failures.length} / ${c.pairs}`} color={ok ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="핵의 크기" value={`${c.kernel.length}`} />
          <Readout label="상의 크기" value={`${c.image.length}`} />
          <Readout label="|핵| × |상|" value={`${c.kernel.length * c.image.length}`} />
        </div>
      </div>
      <div className="ag-note" data-bad={!ok || undefined} aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: left cosets, right cosets, conjugates ─────────────── */

const SMALL: Record<string, () => Group> = { D3: () => dihedral(3), D4: () => dihedral(4), Q8: () => quaternion() };

function CosetFigure() {
  const [gid, setGid] = useState<'D3' | 'D4' | 'Q8'>('D3');
  const G = useMemo(() => SMALL[gid](), [gid]);
  const subs = useMemo(() => allSubgroups(G).filter((h) => h.length > 1 && h.length < G.n), [G]);
  const [hi, setHi] = useState(0);
  const H = subs[Math.min(hi, subs.length - 1)];
  const left = cosets(G, H, 'left');
  const right = cosets(G, H, 'right');
  const leftOf = new Array(G.n);
  left.forEach((c, i) => c.forEach((x) => (leftOf[x] = i)));
  const leftKeys = new Set(left.map((c) => c.join(',')));
  const normal = isNormal(G, H);
  const conj = Array.from({ length: G.n }, (_, g) => {
    const gi = inverse(G, g);
    return H.map((h) => G.mul(G.mul(g, h), gi)).sort((x, y) => x - y);
  });
  const Hkey = H.join(',');
  const moved = conj.filter((c) => c.join(',') !== Hkey).length;
  const set = (xs: number[]) => `{${xs.map(G.label).join(', ')}}`;

  return (
    <Figure
      no={2}
      title="왼쪽 잉여류와 오른쪽 잉여류"
      hint="군과 부분군을 바꿔 보세요"
      caption={
        <>
          왼쪽 칸은 gH, 오른쪽 칸은 Hg입니다. 원소의 색은 그 원소가 속한 왼쪽 잉여류를 뜻합니다. 오른쪽 잉여류 한 줄의 색이 섞여 있으면 그 Hg는 어떤 gH와도 같지 않은 것이고, 빨간 테두리가 그 원소들입니다. 아래 줄은 모든 g에 대해 gHg⁻¹를 계산한 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          value={gid}
          onChange={(v) => {
            setGid(v);
            setHi(0);
          }}
          options={[
            { value: 'D3', label: 'D₃' },
            { value: 'D4', label: 'D₄' },
            { value: 'Q8', label: 'Q₈' },
          ]}
        />
        <label className="ctl">
          <span className="ctl-label">
            <span>부분군 H</span>
          </span>
          <select className="hm-select" value={Math.min(hi, subs.length - 1)} onChange={(e) => setHi(+e.target.value)}>
            {subs.map((h, i) => (
              <option key={h.join(',')} value={i}>
                {set(h)}
                {isNormal(G, h) ? ' · 정규' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hm-cosets">
        <div>
          <h4>왼쪽 잉여류 gH</h4>
          {left.map((c, i) => (
            <div key={i} className="hm-coset-row">
              <span className="lbl">{i === 0 ? 'H' : `${G.label(c[0])}H`}</span>
              {c.map((x) => (
                <span key={x} className="hm-el" style={tint(cat(leftOf[x]))}>
                  {G.label(x)}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div>
          <h4>오른쪽 잉여류 Hg</h4>
          {right.map((c, i) => {
            const same = leftKeys.has(c.join(','));
            return (
              <div key={i} className="hm-coset-row">
                <span className="lbl">{i === 0 ? 'H' : `H${G.label(c[0])}`}</span>
                {c.map((x) => (
                  <span key={x} className="hm-el" style={tint(cat(leftOf[x]))} data-diff={!same || undefined}>
                    {G.label(x)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="ag-small">
        켤레 gHg⁻¹: {conj.map((c, g) => `${G.label(g)} → ${set(c)}`).join(' · ')}
      </div>
      <div className="ag-note" data-good={normal || undefined} data-bad={!normal || undefined} aria-live="polite">
        {normal
          ? `H = ${set(H)}는 정규부분군입니다. 모든 g에서 gH = Hg이고, gHg⁻¹도 언제나 H 자신입니다.`
          : `H = ${set(H)}는 정규부분군이 아닙니다. ${G.n}개의 g 중 ${moved}개에서 gHg⁻¹가 H와 다른 부분군이 되고, 그만큼 gH와 Hg가 어긋납니다.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: collapse the table into cosets ─────────────── */

const QG: Record<string, () => Group> = { Z12: () => cyclic(12), D3: () => dihedral(3), D4: () => dihedral(4) };

/** A familiar name for a small group, found by isomorphism search: [TeX, plain text]. */
function nameOf(Q: Group): [string, string] {
  const cands: [string, string, () => Group][] = [[`\\mathbb{Z}/${Q.n}`, `ℤ/${Q.n}`, () => cyclic(Q.n)]];
  if (Q.n === 4) cands.push(['V_4', 'V₄', kleinFour]);
  if (Q.n === 6) cands.push(['S_3', 'S₃', () => symmetric(3)]);
  for (const [tex, text, make] of cands) if (findIsomorphism(Q, make())) return [tex, text];
  return ['?', '이름 없는 군'];
}

function QuotientFigure() {
  const [gid, setGid] = useState<'Z12' | 'D3' | 'D4'>('Z12');
  const G = useMemo(() => QG[gid](), [gid]);
  const subs = useMemo(() => allSubgroups(G).filter((h) => h.length > 1 && h.length < G.n), [G]);
  const defaultIdx = (g: Group, s: number[][]) => Math.max(0, s.findIndex((h) => g.n === 12 && h.join(',') === '0,4,8'));
  const [ni, setNi] = useState(() => defaultIdx(G, subs));
  const N = subs[Math.min(ni, subs.length - 1)];
  const q = useMemo(() => quotient(G, N), [G, N]);
  const blockName = (i: number) => (i === 0 ? 'N' : G.op === '+' ? `${G.label(q.blocks[i][0])}+N` : `${G.label(q.blocks[i][0])}N`);
  const Q = useMemo(() => quotientGroup(G, N, blockName), [G, N, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const qname = Q ? nameOf(Q) : null;
  const badPair = (() => {
    for (let i = 0; i < q.blocks.length; i++) for (let j = 0; j < q.blocks.length; j++) if (q.products[i][j].length > 1) return [i, j] as const;
    return null;
  })();
  const set = (xs: number[]) => `{${xs.map(G.label).join(', ')}}`;

  let example = '';
  if (badPair) {
    const [i, j] = badPair;
    const A = q.blocks[i], B = q.blocks[j];
    const hits: string[] = [];
    for (const a of A) for (const b of B) hits.push(`${prod(G, a, b)} = ${G.label(G.mul(a, b))} (${blockName(q.blockOf[G.mul(a, b)])})`);
    example = `예를 들어 ${blockName(i)}의 원소와 ${blockName(j)}의 원소를 곱하면 ${hits.join(', ')}로, 결과가 ${q.products[i][j].map(blockName).join('과 ')}에 흩어집니다.`;
  }

  return (
    <Figure
      no={3}
      title="곱셈표를 잉여류로 접기"
      hint="군과 부분군 N을 고르세요"
      caption={
        <>
          왼쪽은 G의 곱셈표를 N의 잉여류끼리 모이도록 행과 열을 다시 늘어놓은 것이고, 각 칸은 곱이 속한 잉여류의 색으로 칠했습니다. N이 정규부분군이면 표가 한 색짜리 덩어리로 나뉘고, 덩어리 하나를 칸 하나로 접으면 오른쪽의 몫군 G/N 표가 됩니다. 정규가 아니면 한 덩어리 안에 색이 섞여 접을 수 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          value={gid}
          onChange={(v) => {
            setGid(v);
            const g = QG[v]();
            setNi(defaultIdx(g, allSubgroups(g).filter((h) => h.length > 1 && h.length < g.n)));
          }}
          options={[
            { value: 'Z12', label: 'ℤ/12' },
            { value: 'D3', label: 'D₃' },
            { value: 'D4', label: 'D₄' },
          ]}
        />
        <label className="ctl">
          <span className="ctl-label">
            <span>부분군 N</span>
          </span>
          <select className="hm-select" value={Math.min(ni, subs.length - 1)} onChange={(e) => setNi(+e.target.value)}>
            {subs.map((h, i) => (
              <option key={h.join(',')} value={i}>
                {set(h)}
                {isNormal(G, h) ? ' · 정규' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hm-split">
        <div>
          <CayleyTable G={G} rows={q.order} cols={q.order} colorOf={(x) => cat(q.blockOf[x])} highlight={N} compact={G.n > 8} label={`${G.name}의 곱셈표를 ${set(N)}의 잉여류로 묶은 것`} />
        </div>
        {Q && (
          <div>
            <div className="ag-small" style={{ marginBottom: 6 }}>
              몫군 G/N
            </div>
            <CayleyTable G={Q} colorOf={(i) => cat(i)} label="몫군의 곱셈표" />
          </div>
        )}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="잉여류 수 |G/N|" value={`${q.blocks.length}`} />
        <Readout label="색이 섞인 덩어리" value={`${q.bad} / ${q.blocks.length ** 2}`} color={q.bad ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="G/N" value={Q && qname ? <M>{`\\cong ${qname[0]}`}</M> : '만들 수 없음'} />
      </div>
      <div className="ag-note" data-bad={!Q || undefined} aria-live="polite">
        {Q ? `N = ${set(N)}는 정규부분군이라 잉여류의 곱이 대표를 어떻게 골라도 같은 잉여류로 떨어집니다. 잉여류 ${q.blocks.length}개가 이루는 몫군의 곱셈표는 ${qname?.[1]}의 곱셈표와 모양이 같습니다.` : `N = ${set(N)}는 정규부분군이 아닙니다. ${example}`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: are these two groups the same? ─────────────── */

function CompareFigure() {
  const [aId, setA] = useState('z4');
  const [bId, setB] = useState('u5');
  const A = CATALOGUE.find((e) => e.id === aId)!;
  const B = CATALOGUE.find((e) => e.id === bId)!;
  const r = useMemo(() => compare(A, B), [A, B]);
  const pa = orderCounts(r.G), pb = orderCounts(r.H);
  const maxCount = Math.max(...pa.map((x) => x[1]), ...pb.map((x) => x[1]));
  const orders = [...new Set([...pa, ...pb].map((x) => x[0]))].sort((x, y) => x - y);
  const verdict =
    r.G.n !== r.H.n
      ? `두 군의 크기가 각각 ${r.G.n}개, ${r.H.n}개로 서로 달라 동형일 수 없습니다. 동형 사상은 일대일 대응이라 크기가 같아야 합니다.`
      : r.iso
        ? `동형입니다. ${generators(r.G)
            .map((g) => `${r.G.label(g)} ↦ ${r.H.label(r.iso![g])}`)
            .join(', ')}로 보내면 곱셈표가 그대로 옮겨집니다.`
        : r.same
          ? `원소의 위수 분포는 똑같지만 동형이 아닙니다. ${r.abelianG !== r.abelianH ? '한쪽은 가환군이고 다른 쪽은 아니기 때문입니다.' : '생성원을 어떻게 보내도 곱셈표가 맞지 않습니다.'}`
          : '원소의 위수 분포가 달라 동형이 아닙니다. 동형 사상은 위수를 보존하기 때문입니다.';

  const pick = (value: string, set: (v: string) => void, label: string) => (
    <label className="ctl">
      <span className="ctl-label">
        <span>{label}</span>
      </span>
      <select className="hm-select" value={value} onChange={(e) => set(e.target.value)}>
        {CATALOGUE.map((e) => (
          <option key={e.id} value={e.id}>
            {e.make().name} (크기 {e.make().n})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Figure
      no={4}
      title="두 군이 같은 군인가"
      hint="두 군을 골라 견주어 보세요"
      caption={
        <>
          막대는 위수가 1, 2, 4, …인 원소가 몇 개인지 보여 줍니다. 동형 사상은 원소의 위수를 바꾸지 않으므로, 막대가 다르면 동형이 아닙니다. 막대가 같으면 생성원을 보낼 곳을 모두 시도해 곱셈표를 보존하는 일대일 대응을 찾습니다.
        </>
      }
    >
      <div className="controls row">
        {pick(aId, setA, '첫째 군')}
        {pick(bId, setB, '둘째 군')}
      </div>
      <div className="hm-profiles">
        {[r.G, r.H].map((G, gi) => {
          const prof = new Map(orderCounts(G));
          return (
            <div key={gi} className="hm-prof">
              <h4>
                {G.name} · 크기 {G.n} · {(gi ? r.abelianH : r.abelianG) ? '가환' : '비가환'}
              </h4>
              {orders.map((o) => (
                <div key={o} className="hm-bar">
                  <span>위수 {o}</span>
                  <i style={{ width: `${((prof.get(o) ?? 0) / maxCount) * 100}%` }} />
                  <b>{prof.get(o) ?? 0}</b>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="ag-note" data-good={!!r.iso || undefined} aria-live="polite">
        {verdict}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Homomorphisms() {
  return (
    <>
      <h2>곱셈을 보존하는 함수</h2>
      <p>
        두 군을 비교하려면 원소를 대응시키는 함수가 필요합니다. 아무 함수나 쓰면 구조가 사라지므로, 곱을 곱으로 보내는 함수만 봅니다. 군 G에서 군 H로 가는 함수 φ가 모든 a, b에 대해 다음을 만족하면 <T en="homomorphism">준동형</T>이라고 합니다.
      </p>
      <MB note="왼쪽의 곱은 G의 곱, 오른쪽의 곱은 H의 곱입니다">{'\\varphi(ab) = \\varphi(a)\\,\\varphi(b)'}</MB>
      <p>이미 본 계산 중 상당수가 준동형입니다.</p>
      <ul>
        <li>
          정수를 n으로 나눈 나머지: <M>{'\\mathbb{Z} \\to \\mathbb{Z}/n,\\ x \\mapsto x \\bmod n'}</M>. 합의 나머지는 나머지의 합입니다.
        </li>
        <li>
          행렬식: <M>{'\\det: GL_2(\\mathbb{R}) \\to \\mathbb{R}^\\times'}</M>. <a href={lessonHref('math-linear-algebra', 'determinants')}>행렬식</a> 장에서 본 <M>{'\\det(AB) = \\det A \\det B'}</M>가 바로 이 성질입니다.
        </li>
        <li>
          지수 함수: <M>{'(\\mathbb{R}, +) \\to (\\mathbb{R}_{>0}, \\times),\\ x \\mapsto e^x'}</M>. <M>{'e^{a+b} = e^a e^b'}</M>이므로 덧셈을 곱셈으로 바꿉니다.
        </li>
        <li>
          순열의 부호: <M>{'S_n \\to \\{\\pm 1\\}'}</M>. 다음 장에서 보듯 두 순열을 이어 하면 부호가 곱해집니다.
        </li>
      </ul>
      <p>
        순환군에서 나가는 준동형은 생성원의 상 하나로 전부 정해집니다. ℤ/n에서 1을 a로 보내면 x는 a를 x번 더한 ax로 가야 하기 때문입니다. 남은 질문은 그렇게 정한 함수가 정말 일관된가입니다. 그림 1에서 확인해 보세요.
      </p>
      <HomFigure />
      <p>
        처음 설정인 ℤ/12 → ℤ/4, φ(1) = 1은 144쌍 모두에서 성립하는 준동형입니다. 핵은 {'{0, 4, 8}'}, 상은 ℤ/4 전체입니다. m을 5로 바꾸면 144쌍 중 66쌍이 어긋납니다. 1 + 11 = 0 (mod 12)이므로 φ(0) = 0이어야 하는데, φ(1) + φ(11) = 12 ≡ 2 (mod 5)이기 때문입니다. ℤ/12에서는 1을 12번 더하면 0으로 돌아오므로, 상 a도 12번 더하면 0이 되어야 합니다. 그래서 <M>{'\\varphi(1) = a'}</M>가 준동형을 주는 것은 m이 12a를 나눌 때뿐입니다.
      </p>
      <p>
        D_n으로 바꾸면 처음 설정 D₃ → ℤ/2, φ(r) = 0, φ(s) = 1은 뒤집기의 수가 홀수인지를 세는 준동형이고, 핵은 회전 {'{e, r, r²}'}입니다. 이번에는 φ(r) = 1, φ(s) = 0으로 ℤ/3에 보내 보세요. 36쌍 중 12쌍이 어긋납니다. D₃에서는 <M>{'srs^{-1} = r^{-1}'}</M>이므로 φ(r) = −φ(r), 곧 2φ(r) = 0이어야 하는데 ℤ/3에서는 1이 그렇지 않습니다.
      </p>

      <h2>핵은 정규부분군입니다</h2>
      <p>
        준동형 φ: G → H에서 항등원으로 가는 원소들의 집합을 <T en="kernel">핵</T>, 실제로 나오는 값의 집합을 <T en="image">상</T>이라고 합니다. 그림 1의 모든 준동형에서 |핵| × |상| = |G|였습니다. 이것은 우연이 아니고, 이 장의 끝에서 이유가 나옵니다. 먼저 핵이 아주 특별한 부분군이라는 것을 증명합니다.
      </p>
      <MB>{'\\ker\\varphi = \\{\\, g \\in G : \\varphi(g) = e_H \\,\\}, \\qquad \\operatorname{im}\\varphi = \\{\\, \\varphi(g) : g \\in G \\,\\}'}</MB>
      <Proof title="정리. 준동형의 핵 K는 G의 부분군이고, 모든 g ∈ G에 대해 gKg⁻¹ = K이다.">
        <p>
          먼저 φ(e) = e입니다. φ(e) = φ(ee) = φ(e)φ(e)의 양변에 φ(e)⁻¹을 곱하면 됩니다. 그러면 φ(b)φ(b⁻¹) = φ(bb⁻¹) = φ(e) = e이므로 φ(b⁻¹) = φ(b)⁻¹입니다.
        </p>
        <p>
          부분군: e ∈ K이고, a, b ∈ K이면 φ(ab⁻¹) = φ(a)φ(b)⁻¹ = e·e = e이므로 ab⁻¹ ∈ K입니다.
        </p>
        <p>
          켤레에 대해 닫힘: k ∈ K, g ∈ G이면 φ(gkg⁻¹) = φ(g)·e·φ(g)⁻¹ = e이므로 gkg⁻¹ ∈ K입니다. 따라서 gKg⁻¹ ⊆ K이고, g 대신 g⁻¹을 쓰면 반대쪽 포함도 나옵니다.
        </p>
      </Proof>
      <p>
        모든 g에 대해 <M>{'gNg^{-1} = N'}</M>인 부분군 N을 <T en="normal subgroup">정규부분군</T>이라고 합니다. 양변 오른쪽에 g를 곱하면 gN = Ng, 곧 왼쪽 잉여류와 오른쪽 잉여류가 같다는 뜻입니다. 가환군에서는 모든 부분군이 정규지만, 비가환군에서는 그렇지 않을 수 있습니다. 그림 2에서 비교해 보세요.
      </p>
      <CosetFigure />
      <p>
        처음 설정인 D₃의 H = {'{e, s}'}에서 왼쪽 잉여류는 {'{r, sr²}'}, {'{r², sr}'}인데 오른쪽 잉여류는 {'{r, sr}'}, {'{r², sr²}'}로 짝이 다릅니다. 켤레를 보면 rHr⁻¹ = {'{e, sr}'}처럼 뒤집기의 축이 돌아가 다른 부분군이 됩니다. 축 하나를 고른 것은 회전 앞에서 특별하지 않기 때문입니다. 반면 회전 부분군 {'{e, r, r²}'}는 정규입니다. 크기가 G의 절반인 부분군은 잉여류가 둘뿐이라 언제나 정규입니다. Q₈은 가환이 아닌데도 모든 부분군이 정규인 드문 예입니다.
      </p>

      <h2>몫군: 잉여류를 원소로</h2>
      <p>
        N이 정규부분군이면 잉여류끼리 곱할 수 있습니다. aN과 bN의 곱을 (ab)N으로 정하는데, 이것이 말이 되려면 aN에서 다른 대표 a′를, bN에서 다른 대표 b′을 골라도 a′b′이 같은 잉여류에 떨어져야 합니다. 정규성이 정확히 그것을 보장하고, 그렇게 만든 군을 <T en="quotient group">몫군</T> G/N이라고 합니다.
      </p>
      <MB note="N이 정규일 때만 대표의 선택과 상관없이 정해집니다">{'(aN)(bN) = (ab)N'}</MB>
      <QuotientFigure />
      <p>
        처음 설정 ℤ/12와 N = {'{0, 4, 8}'}에서 곱셈표는 4×4개의 한 색 덩어리로 나뉘고, 접으면 ℤ/4의 표가 됩니다. 시계를 4칸씩 묶어 본 셈입니다. D₄와 N = {'{e, r²}'}로 바꾸면 잉여류 4개가 V₄를 이룹니다. N = {'{e, s}'}로 바꾸면 16개 덩어리 중 8개에서 색이 섞입니다. rN = {'{r, sr³}'}끼리 곱하면 r·r = r²는 r²N에, sr³·sr³ = e는 N에 떨어져 rN·rN이 무엇인지 정할 수 없습니다.
      </p>

      <h2>제1 동형 정리</h2>
      <p>
        그림 1의 준동형 ℤ/12 → ℤ/4, φ(1) = 1의 핵이 {'{0, 4, 8}'}였고, 그림 3에서 그 핵으로 접은 몫군이 ℤ/4, 곧 φ의 상이었습니다. 이것이 일반적인 사실입니다.
      </p>
      <MB note="준동형은 핵만큼을 하나로 뭉치고, 그 뒤에는 일대일입니다">{'G / \\ker\\varphi \\;\\cong\\; \\operatorname{im}\\varphi'}</MB>
      <Proof title="증명. 핵을 K라 하고 잉여류 gK를 φ(g)로 보내는 함수 ψ를 생각한다.">
        <p>
          잘 정의됨과 일대일: gK = g′K ⟺ g⁻¹g′ ∈ K ⟺ φ(g)⁻¹φ(g′) = e ⟺ φ(g) = φ(g′). 앞쪽 방향은 같은 잉여류의 대표가 같은 값으로 간다는 것이고, 뒤쪽 방향은 다른 잉여류가 다른 값으로 간다는 것입니다.
        </p>
        <p>
          준동형: ψ(gK·hK) = ψ(ghK) = φ(gh) = φ(g)φ(h) = ψ(gK)ψ(hK). 상은 정의에 따라 im φ 전체이므로 ψ는 G/K에서 im φ로 가는 동형 사상입니다. 크기를 세면 |G| / |K| = |im φ|이고, 이것이 그림 1에서 본 |핵| × |상| = |G|입니다.
        </p>
      </Proof>
      <p>
        이 정리로 익숙한 몫군에 이름이 붙습니다. 부호 준동형의 핵은 짝순열의 군 A_n이므로 <M>{'S_n / A_n \\cong \\{\\pm 1\\}'}</M>이고, 행렬식의 핵은 행렬식이 1인 행렬의 군 SL₂이므로 <M>{'GL_2 / SL_2 \\cong \\mathbb{R}^\\times'}</M>입니다.
      </p>

      <h2>같은 군 알아보기</h2>
      <p>
        일대일 대응이면서 준동형인 사상을 <T en="isomorphism">동형 사상</T>이라고 하고, 그런 사상이 있는 두 군을 동형이라고 합니다. 원소의 이름만 다를 뿐 곱셈표가 같은 군입니다. 동형 사상은 원소의 위수를 보존하므로, 위수가 k인 원소의 개수를 세어 비교하는 것이 가장 빠른 검사입니다.
      </p>
      <CompareFigure />
      <p>
        처음 고른 ℤ/4와 (ℤ/5)ˣ는 생김새가 전혀 다르지만, 1을 2로 보내면 동형입니다. 2의 거듭제곱 2, 4, 3, 1이 5로 나눈 나머지의 곱셈표를 차례로 훑기 때문입니다. 같은 방법으로 (ℤ/8)ˣ ≅ V₄, ℤ/6 ≅ ℤ/2 × ℤ/3, S₃ ≅ D₃, ℤ/4 × ℤ/2 ≅ (ℤ/15)ˣ를 확인할 수 있습니다. D₄와 Q₈은 둘 다 크기 8인 비가환군이지만 위수 2인 원소가 5개와 1개로 달라 동형이 아닙니다. 크기 8인 군은 동형인 것을 하나로 치면 ℤ/8, ℤ/4 × ℤ/2, (ℤ/2)³, D₄, Q₈의 다섯 가지뿐입니다.
      </p>
      <Callout kind="warn">
        위수 분포가 같다고 동형인 것은 아닙니다. ℤ/4 × ℤ/4와 Q₈ × ℤ/2는 크기 16에 위수 2인 원소 3개, 위수 4인 원소 12개로 분포가 똑같지만, 앞의 것은 가환이고 뒤의 것은 아니라서 동형이 아닙니다. 그림 4에서 두 군을 골라 확인해 보세요. 분포는 동형이 아님을 보이는 데만 쓸 수 있고, 동형임을 보이려면 사상을 실제로 찾아야 합니다.
      </Callout>

      <Callout kind="key">
        준동형은 곱을 곱으로 보내는 함수입니다. 핵은 언제나 정규부분군, 곧 왼쪽과 오른쪽 잉여류가 같은 부분군이고, 정규부분군 N으로는 잉여류를 원소로 하는 몫군 G/N을 만들 수 있습니다. 정규가 아니면 잉여류의 곱이 대표에 따라 달라져 몫군이 생기지 않습니다. 제1 동형 정리는 준동형이 핵만큼을 하나로 뭉치고 나머지는 그대로 옮긴다는 것, G/ker φ ≅ im φ를 말합니다. 동형인 두 군은 이름만 다른 같은 군이고, 원소의 위수 분포가 다르면 동형일 수 없습니다.
      </Callout>
      <Quiz
        q="D₄의 부분군 H = {e, s}로 몫군 D₄/H를 만들 수 없는 이유로 가장 알맞은 것은?"
        options={['H의 크기 2가 8의 약수가 아니라서', 'H가 정규부분군이 아니어서, 잉여류의 곱이 대표를 고르는 방법에 따라 달라지기 때문', 'D₄가 가환군이 아니어서, 어떤 부분군으로도 몫군을 만들 수 없기 때문', 'H가 순환군이라서']}
        answer={1}
        explain={<>2는 8의 약수이므로 잉여류 4개로 깔끔하게 나뉩니다. 문제는 곱입니다. rH = {'{r, sr³}'}끼리 곱하면 r·r = r²는 r²H에, sr³·sr³ = e는 H에 떨어집니다. H가 정규가 아니기 때문이고, D₄도 {'{e, r²}'}처럼 정규인 부분군으로는 몫군을 만들 수 있습니다.</>}
      />
    </>
  );
}

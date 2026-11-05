import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { CayleyTable, COSET_COLORS } from './CayleyTable';
import { alternating, allSubgroups, cosets, cyclic, dihedral, gcd, inverse, isNormal, isPrime, order, phi, powMod, quaternion, subgroupGenerated, symmetric, type Group } from './group';
import './algebra.css';
import './lagrange.css';

/* ─────────────── shared ─────────────── */

const GROUPS: Record<string, () => Group> = {
  z12: () => cyclic(12),
  d4: () => dihedral(4),
  s3: () => symmetric(3),
  q8: () => quaternion(),
  a4: () => alternating(4),
};
const GROUP_KO: Record<string, string> = { z12: 'ℤ/12', d4: 'D₄', s3: 'S₃', q8: 'Q₈', a4: 'A₄' };

const setLabel = (G: Group, H: number[]) => `{${H.map(G.label).join(', ')}}`;

/** A short name for a subgroup: ⟨a⟩ if one element generates it, else ⟨a, b⟩ (or the group's name). */
function subName(G: Group, H: number[]): string {
  if (H.length === 1) return '{e}';
  if (H.length === G.n) return G.name;
  for (const a of H) if (order(G, a) === H.length) return `⟨${G.label(a)}⟩`;
  for (const a of H)
    for (const b of H) if (a < b && subgroupGenerated(G, [a, b]).length === H.length) return `⟨${G.label(a)}, ${G.label(b)}⟩`;
  return setLabel(G, H);
}

/* ─────────────── Figure 1: is this subset a subgroup? ─────────────── */

function SubsetFigure() {
  const [gid, setGid] = useState<'z12' | 'd4' | 's3'>('z12');
  const G = useMemo(() => GROUPS[gid](), [gid]);
  const [pick, setPick] = useState<Set<number>>(() => new Set([0, 4]));
  const H = [...pick].sort((a, b) => a - b);
  const hasE = pick.has(G.id);
  let notClosed: [number, number] | null = null;
  for (const a of H) {
    for (const b of H)
      if (!pick.has(G.mul(a, b))) {
        notClosed = [a, b];
        break;
      }
    if (notClosed) break;
  }
  const noInv = H.find((a) => !pick.has(inverse(G, a)));
  const ok = hasE && !notClosed && noInv === undefined;
  const toggle = (a: number) => {
    const s = new Set(pick);
    if (s.has(a)) s.delete(a);
    else s.add(a);
    setPick(s);
  };
  const switchGroup = (v: 'z12' | 'd4' | 's3') => {
    setGid(v);
    setPick(new Set([0]));
  };
  const verdict = !H.length
    ? '원소를 하나 이상 고르세요.'
    : ok
      ? `부분군입니다. 원소 ${H.length}개, ${G.name}의 크기 ${G.n}의 약수입니다.`
      : !hasE
        ? `항등원 ${G.label(G.id)}가 없어서 부분군이 아닙니다.`
        : notClosed
          ? `${G.label(notClosed[0])} ${G.op ?? '·'} ${G.label(notClosed[1])} = ${G.label(G.mul(notClosed[0], notClosed[1]))}이 고른 집합 밖에 있어서 닫혀 있지 않습니다.`
          : `${G.label(noInv!)}의 역원 ${G.label(inverse(G, noInv!))}이 없습니다.`;
  return (
    <Figure
      no={1}
      title="이 부분집합은 부분군인가"
      hint="원소를 눌러 넣고 빼 보세요"
      caption={
        <>
          고른 원소들이 항등원을 포함하고, 그중 두 원소의 곱과 각 원소의 역원이 모두 다시 고른 집합 안에 있으면 부분군입니다. 조건이 깨지면 첫 번째로 걸리는 예를 보여 줍니다. "생성하기"는 고른 원소들을 품는 가장 작은 부분군을 만듭니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="군"
          value={gid}
          onChange={switchGroup}
          options={[
            { value: 'z12', label: 'ℤ/12' },
            { value: 'd4', label: 'D₄' },
            { value: 's3', label: 'S₃' },
          ]}
        />
      </div>
      <div className="lg-chips" role="group" aria-label={`${G.name}의 원소. 눌러서 고르기`}>
        {Array.from({ length: G.n }, (_, a) => (
          <button key={a} type="button" className="lg-chip" aria-pressed={pick.has(a)} onClick={() => toggle(a)}>
            {G.label(a)}
          </button>
        ))}
      </div>
      <ul className="lg-checks" aria-label="부분군 조건">
        <li data-ok={hasE || undefined}>
          <span aria-hidden="true">{hasE ? '✓' : '✗'}</span>항등원 {G.label(G.id)}를 포함
        </li>
        <li data-ok={(H.length > 0 && !notClosed) || undefined}>
          <span aria-hidden="true">{H.length && !notClosed ? '✓' : '✗'}</span>곱에 대해 닫혀 있음
        </li>
        <li data-ok={(H.length > 0 && noInv === undefined) || undefined}>
          <span aria-hidden="true">{H.length && noInv === undefined ? '✓' : '✗'}</span>역원을 포함
        </li>
      </ul>
      <div className="ag-note" data-good={ok || undefined} data-bad={(!ok && H.length > 0) || undefined} aria-live="polite">
        {verdict}
      </div>
      <div className="btn-row">
        <Button small primary onClick={() => setPick(new Set(subgroupGenerated(G, H)))} disabled={ok || !H.length}>
          생성하기
        </Button>
        <Button small onClick={() => setPick(new Set([G.id]))}>
          비우기
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the subgroup lattice ─────────────── */

function LatticeFigure() {
  const [gid, setGid] = useState<keyof typeof GROUPS>('d4');
  const G = useMemo(() => GROUPS[gid](), [gid]);
  const subs = useMemo(() => allSubgroups(G), [G]);
  const [sel, setSel] = useState(1);
  const sizes = [...new Set(subs.map((h) => h.length))].sort((a, b) => a - b);
  const W = 560, rowH = 74, H = sizes.length * rowH + 10;
  const nodeH = 34;
  const names = subs.map((h) => subName(G, h));
  const widthOf = (i: number) => Math.max(64, names[i].length * 7 + 16);
  const pos = subs.map((h) => {
    const level = sizes.indexOf(h.length);
    const row = subs.filter((k) => k.length === h.length);
    const i = row.indexOf(h);
    const x = ((i + 0.5) / row.length) * W;
    const y = H - 10 - nodeH / 2 - level * rowH;
    return [x, y];
  });
  const contains = (big: number[], small: number[]) => small.every((x) => big.includes(x));
  // draw only covering edges: small ⊂ big with nothing strictly in between
  const edges: [number, number][] = [];
  subs.forEach((s, i) =>
    subs.forEach((b, j) => {
      if (b.length <= s.length || !contains(b, s)) return;
      const between = subs.some((m) => m.length > s.length && m.length < b.length && contains(m, s) && contains(b, m));
      if (!between) edges.push([i, j]);
    }),
  );
  const cur = subs[Math.min(sel, subs.length - 1)];
  const divisors = Array.from({ length: G.n }, (_, k) => k + 1).filter((d) => G.n % d === 0);
  const missing = divisors.filter((d) => !sizes.includes(d));
  return (
    <Figure
      no={2}
      title="부분군의 지도"
      hint="군을 바꾸고, 상자를 눌러 원소를 보세요"
      caption={
        <>
          한 군의 부분군을 모두 찾아 크기별로 층을 나눠 놓았습니다. 아래 층에 있는 부분군이 위 층 부분군에 바로 들어가면 선으로 잇습니다. 왼쪽 눈금이 층의 크기입니다. 모든 부분군은 컴퓨터가 원소를 하나씩, 둘씩 묶어 생성해 찾은 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="군"
          value={gid}
          onChange={(v) => {
            setGid(v);
            setSel(1);
          }}
          options={(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((k) => ({ value: k, label: GROUP_KO[k] }))}
        />
      </div>
      <div className="lg-lattice">
        <svg viewBox={`-34 0 ${W + 40} ${H}`} role="group" aria-label={`${G.name}의 부분군 ${subs.length}개. 크기는 ${subs.map((h) => h.length).join(', ')}.`}>
          {sizes.map((s, level) => (
            <text key={s} className="lg-level" x={-30} y={H - 10 - nodeH / 2 - level * rowH} dy="0.35em">
              {s}
            </text>
          ))}
          {edges.map(([i, j]) => (
            <line key={`${i}-${j}`} className="lg-edge" x1={pos[i][0]} y1={pos[i][1] - nodeH / 2} x2={pos[j][0]} y2={pos[j][1] + nodeH / 2} />
          ))}
          {subs.map((h, i) => (
            <g key={i} className="lg-node" data-on={h === cur || undefined} transform={`translate(${pos[i][0] - widthOf(i) / 2}, ${pos[i][1] - nodeH / 2})`} role="button" tabIndex={0} aria-label={`부분군 ${names[i]}, 크기 ${h.length}`} aria-pressed={h === cur} onClick={() => setSel(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(i))}>
              <rect width={widthOf(i)} height={nodeH} rx={4} />
              <text x={widthOf(i) / 2} y={nodeH / 2} dy="0.35em">
                {names[i]}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="ag-note">
        <span className="mono">{subName(G, cur)}</span> = <span className="mono">{setLabel(G, cur)}</span> · 크기 {cur.length} · {isNormal(G, cur) ? '정규부분군' : '정규부분군 아님'}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label={`${G.name}의 크기`} value={G.n} />
        <Readout label="부분군 수" value={subs.length} />
        <Readout label="크기가 없는 약수" value={missing.length ? missing.join(', ') : '없음'} color={missing.length ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: cosets colour the table ─────────────── */

function CosetFigure() {
  const [gid, setGid] = useState<'s3' | 'd4' | 'z12'>('s3');
  const G = useMemo(() => GROUPS[gid](), [gid]);
  const proper = useMemo(() => allSubgroups(G).filter((h) => h.length > 1 && h.length < G.n), [G]);
  // S3's proper subgroups in order: {e,(2 3)}, {e,(1 2)}, {e,(1 3)}, ⟨(1 2 3)⟩; start on {e,(1 2)}
  const [hi, setHi] = useState(1);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const H = proper[Math.min(hi, proper.length - 1)];
  const cs = cosets(G, H, side);
  const which = new Map<number, number>();
  cs.forEach((c, i) => c.forEach((x) => which.set(x, i)));
  const ordered = cs.flat();
  const normal = isNormal(G, H);
  const other = cosets(G, H, side === 'left' ? 'right' : 'left');
  const same = cs.every((c) => other.some((o) => o.join() === c.join()));
  return (
    <Figure
      no={3}
      title="잉여류로 군 나누기"
      hint="군과 부분군, 왼쪽과 오른쪽을 바꿔 보세요"
      caption={
        <>
          부분군 H를 고르면 각 원소 g에 대해 왼쪽 잉여류 gH = {'{'}gh : h ∈ H{'}'}(또는 오른쪽 잉여류 Hg)를 만듭니다. 잉여류마다 색을 하나씩 주고, 곱셈표의 행과 열을 잉여류 순서대로 다시 늘어놓아 칸을 그 칸의 값이 속한 잉여류 색으로 칠했습니다. 굵은 테두리는 H 자신의 블록입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="군"
          value={gid}
          onChange={(v) => {
            setGid(v);
            setHi(0);
          }}
          options={[
            { value: 's3', label: 'S₃' },
            { value: 'd4', label: 'D₄' },
            { value: 'z12', label: 'ℤ/12' },
          ]}
        />
        <label className="ctl lg-select">
          <span className="ctl-label">
            <span>부분군 H</span>
          </span>
          <select value={Math.min(hi, proper.length - 1)} onChange={(e) => setHi(+e.target.value)}>
            {proper.map((h, i) => (
              <option key={i} value={i}>
                {subName(G, h)} (크기 {h.length})
              </option>
            ))}
          </select>
        </label>
        <Seg
          label="잉여류"
          value={side}
          onChange={setSide}
          options={[
            { value: 'left', label: '왼쪽 gH' },
            { value: 'right', label: '오른쪽 Hg' },
          ]}
        />
      </div>
      <div className="lg-cosets">
        <CayleyTable G={G} rows={ordered} cols={ordered} colorOf={(x) => COSET_COLORS[which.get(x)! % COSET_COLORS.length]} highlight={H} label={`${G.name}의 곱셈표를 ${subName(G, H)}의 ${side === 'left' ? '왼쪽' : '오른쪽'} 잉여류로 칠한 것`} compact={G.n > 8} />
        <div className="ag-col">
          <ul className="lg-list" aria-label="잉여류">
            {cs.map((c, i) => (
              <li key={i} style={{ ['--c' as string]: COSET_COLORS[i % COSET_COLORS.length] }}>
                <i aria-hidden="true" />
                <span className="mono">{setLabel(G, c)}</span>
              </li>
            ))}
          </ul>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="|G| / |H|" value={`${G.n} / ${H.length} = ${G.n / H.length}`} />
            <Readout label="잉여류 수" value={cs.length} />
          </div>
          <div className="ag-note">
            {normal ? 'H는 정규부분군입니다. 왼쪽 잉여류와 오른쪽 잉여류가 같고, 표가 색 블록으로 깔끔하게 나뉩니다.' : same ? '' : `H는 정규부분군이 아닙니다. 반대쪽 잉여류는 ${other.map((c) => setLabel(G, c)).join(', ')}로 다릅니다.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Fermat and Euler ─────────────── */

const PRIMES = Array.from({ length: 60 }, (_, k) => k + 2).filter(isPrime);

function FermatFigure() {
  const [mode, setMode] = useState<'prime' | 'any'>('prime');
  const [pi, setPi] = useState(PRIMES.indexOf(13));
  const [nAny, setNAny] = useState(15);
  const n = mode === 'prime' ? PRIMES[pi] : nAny;
  const units = Array.from({ length: n }, (_, k) => k).filter((k) => gcd(k, n) === 1 && k > 0);
  const [ai, setAi] = useState(2);
  const a = units[Math.min(ai, units.length - 1)] ?? 1;
  const f = phi(n);
  const seq = Array.from({ length: f }, (_, k) => powMod(a, k + 1, n));
  const ord = seq.indexOf(1) + 1;
  return (
    <Figure
      no={4}
      title="a를 거듭 곱하면 언제 1이 되나"
      hint="n과 a를 바꿔 보세요"
      caption={
        <>
          n과 서로소인 a를 n으로 나눈 나머지 세계에서 거듭 곱해 <M>{'a^1, a^2, \\dots, a^{\\varphi(n)}'}</M>을 늘어놓았습니다. 처음으로 1이 되는 자리가 a의 위수이고 굵은 테두리로, 마지막 칸 <M>{'a^{\\varphi(n)}'}</M>은 점선으로 표시합니다. 소수 모드에서는 <M>{'\\varphi(p) = p - 1'}</M>입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="n"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'prime', label: '소수 p' },
            { value: 'any', label: '아무 수 n' },
          ]}
        />
        {mode === 'prime' ? (
          <Slider id="lg-p" label="p" value={pi} min={0} max={PRIMES.length - 1} step={1} format={(v) => String(PRIMES[Math.round(v)])} onChange={setPi} />
        ) : (
          <Slider id="lg-n" label="n" value={nAny} min={2} max={40} step={1} onChange={setNAny} />
        )}
        <Slider id="lg-a" label="a" value={Math.min(ai, units.length - 1)} min={0} max={Math.max(0, units.length - 1)} step={1} format={(v) => String(units[Math.round(v)] ?? 1)} onChange={setAi} />
      </div>
      <div className="lg-pow" role="img" aria-label={`${n}으로 나눈 나머지에서 ${a}의 거듭제곱: ${seq.join(', ')}. 위수 ${ord}, φ(${n}) = ${f}.`}>
        {seq.map((v, k) => (
          <span key={k} data-one={v === 1 || undefined} data-ord={k + 1 === ord || undefined} data-last={k + 1 === f || undefined}>
            <small>{a}{k + 1 > 1 ? <sup>{k + 1}</sup> : null}</small>
            <b className="mono">{v}</b>
          </span>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label={`φ(${n}) = 군의 크기`} value={f} />
        <Readout label={`${a}의 위수`} value={ord} />
        <Readout label={`${a}^${f} mod ${n}`} value={powMod(a, f, n)} color="var(--good)" />
      </div>
      <div className="ag-note">
        위수 {ord}는 {f}의 약수입니다 ({f} = {ord} × {f / ord}). 그래서 {a}
        <sup>{f}</sup> = ({a}
        <sup>{ord}</sup>)<sup>{f / ord}</sup> = 1입니다.
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Lagrange() {
  return (
    <>
      <h2>군 안의 작은 군</h2>
      <p>
        <a href={lessonHref('math-abstract-algebra', 'groups')}>앞 장</a>에서 정사각형의 대칭군 <M>{'D_4'}</M>를 보았습니다. 그중 회전 네 개 <M>{'\\{e, r, r^2, r^3\\}'}</M>만 모아도 그 안에서 곱하고 되돌리는 것이 다 됩니다. 회전끼리 곱하면 회전이고, 회전의 역원도 회전이기 때문입니다. 이렇게 군 G의 부분집합 H가 G와 같은 연산으로 그 자체로 군이 되면 H를 G의 <T en="subgroup">부분군</T>이라 하고 <M>{'H \\le G'}</M>로 씁니다.
      </p>
      <MB note="결합법칙은 G에서 물려받으므로 따로 확인할 필요가 없습니다.">{'H \\le G \\iff e \\in H,\\quad a, b \\in H \\Rightarrow ab \\in H,\\quad a \\in H \\Rightarrow a^{-1} \\in H'}</MB>
      <SubsetFigure />
      <p>
        처음 설정인 <M>{'\\mathbb{Z}/12'}</M>에서 {'{'}0, 4{'}'}를 고르면 4 + 4 = 8이 빠져 있어서 닫혀 있지 않습니다. 8을 넣으면 {'{'}0, 4, 8{'}'}이 되고, 이것은 부분군입니다. "생성하기"는 이렇게 빠진 곱과 역원을 계속 채워 넣어, 고른 원소들을 품는 가장 작은 부분군을 만듭니다. 원소 하나 <M>{'a'}</M>로 만든 부분군 <M>{'\\langle a \\rangle = \\{e, a, a^2, \\dots\\}'}</M>의 크기는 앞 장에서 본 <M>{'a'}</M>의 위수와 같습니다.
      </p>
      <Callout kind="note">
        유한군에서는 역원 조건을 따로 확인하지 않아도 됩니다. <M>{'a'}</M>의 거듭제곱이 언젠가 <M>{'a^k = e'}</M>로 돌아오므로 <M>{'a^{-1} = a^{k-1}'}</M>이 곱에 대해 닫힌 집합 안에 이미 들어 있기 때문입니다.
      </Callout>

      <h2>부분군의 크기에는 규칙이 있습니다</h2>
      <p>그림 2는 여러 군의 부분군을 모두 찾아 크기별로 늘어놓은 것입니다. 층의 높이, 곧 부분군의 크기에 주목하세요.</p>
      <LatticeFigure />
      <p>
        <M>{'D_4'}</M>(크기 8)의 부분군은 10개이고 크기는 1, 2, 4, 8뿐입니다. <M>{'\\mathbb{Z}/12'}</M>의 부분군 6개는 크기가 1, 2, 3, 4, 6, 12로 12의 약수가 하나씩입니다. 어느 군을 골라도 부분군의 크기는 늘 군 크기의 약수입니다. 크기 5인 부분군이나 크기 3인 <M>{'D_4'}</M>의 부분군은 나타나지 않습니다. 이 규칙을 설명하는 도구가 잉여류입니다.
      </p>

      <h2>잉여류</h2>
      <p>
        부분군 <M>{'H'}</M>와 원소 <M>{'g'}</M>에 대해 <M>{'H'}</M>의 원소 전부에 왼쪽에서 <M>{'g'}</M>를 곱한 집합 <M>{'gH = \\{gh : h \\in H\\}'}</M>를 <M>{'H'}</M>의 <T en="left coset">왼쪽 잉여류</T>, 오른쪽에서 곱한 <M>{'Hg'}</M>를 <T en="right coset">오른쪽 잉여류</T>라 합니다. <M>{'H'}</M>를 군 안에서 통째로 옮겨 놓은 사본이라고 생각하면 됩니다.
      </p>
      <CosetFigure />
      <p>
        처음 설정은 <M>{'S_3'}</M>(세 물건의 순열, <M>{'D_3'}</M>와 같은 구조)와 <M>{'H = \\{e, (1\\,2)\\}'}</M>입니다. 왼쪽 잉여류는 {'{'}e, (1 2){'}'}, {'{'}(2 3), (1 3 2){'}'}, {'{'}(1 2 3), (1 3){'}'} 세 개로, 여섯 원소를 크기 2짜리 세 덩어리로 빈틈없이 나눕니다. 오른쪽으로 바꾸면 {'{'}(2 3), (1 2 3){'}'}, {'{'}(1 3 2), (1 3){'}'}로 덩어리가 달라지지만, 역시 크기 2짜리 세 덩어리입니다. 부분군을 <M>{'\\langle (1\\,2\\,3) \\rangle'}</M>로 바꾸면 왼쪽과 오른쪽 잉여류가 같아지고 곱셈표가 색 블록으로 깔끔하게 나뉘는데, 이런 부분군의 뜻은 <a href={lessonHref('math-abstract-algebra', 'homomorphisms')}>다음 장</a>에서 봅니다.
      </p>

      <h2>라그랑주 정리</h2>
      <div className="lg-proof">
        <p>
          <strong>정리 (라그랑주).</strong> G가 유한군이고 <M>{'H \\le G'}</M>이면 <M>{'|H|'}</M>는 <M>{'|G|'}</M>의 약수이다. 더 정확히는 <M>{'|G| = [G:H]\\,|H|'}</M>이고, <M>{'[G:H]'}</M>는 H의 왼쪽 잉여류의 개수이다.
        </p>
        <p>
          <strong>증명.</strong> 세 가지를 보이면 된다. (1) 각 잉여류의 크기는 <M>{'|H|'}</M>이다. 함수 <M>{'h \\mapsto gh'}</M>는 H에서 gH로 가는 전사 함수이고, <M>{'gh_1 = gh_2'}</M>이면 왼쪽에 <M>{'g^{-1}'}</M>를 곱해 <M>{'h_1 = h_2'}</M>이므로 단사이기도 하다. (2) 두 잉여류는 같거나 서로소이다. <M>{'x \\in gH \\cap kH'}</M>라 하면 <M>{'x = gh_1 = kh_2'}</M>이고 <M>{'g = k h_2 h_1^{-1} \\in kH'}</M>이다. 그러면 모든 <M>{'h'}</M>에 대해 <M>{'gh = k(h_2h_1^{-1}h) \\in kH'}</M>이므로 <M>{'gH \\subseteq kH'}</M>이고, 같은 논리로 반대 방향도 성립해 <M>{'gH = kH'}</M>이다. (3) 모든 원소 <M>{'g = ge'}</M>는 자기 잉여류 gH에 들어 있다. 따라서 G는 크기 <M>{'|H|'}</M>인 잉여류 <M>{'[G:H]'}</M>개로 겹치지 않게 나뉘고, <M>{'|G| = [G:H]\\,|H|'}</M>이다. ∎
        </p>
      </div>
      <p>이 정리 하나에서 바로 따라 나오는 사실이 여럿 있습니다.</p>
      <ul>
        <li>
          원소 <M>{'a'}</M>의 위수는 <M>{'|\\langle a \\rangle|'}</M>이므로 <M>{'|G|'}</M>의 약수이고, 그래서 언제나 <M>{'a^{|G|} = e'}</M>입니다. 앞 장의 <M>{'D_n'}</M>에서 위수가 1, 2, n의 약수뿐이었던 이유입니다.
        </li>
        <li>
          크기가 소수 p인 군은 순환군입니다. 항등원이 아닌 원소의 위수는 p의 약수이면서 1이 아니므로 p이고, 그 원소가 군 전체를 생성합니다.
        </li>
      </ul>

      <h2>페르마의 소정리</h2>
      <p>
        라그랑주 정리를 <M>{'(\\mathbb{Z}/n)^{\\times}'}</M>에 쓰면 정수론의 고전적인 정리가 한 줄로 나옵니다. 이 군의 크기는 n과 서로소인 수의 개수 <M>{'\\varphi(n)'}</M>(오일러 피 함수)이므로, n과 서로소인 모든 a에 대해 다음이 성립합니다.
      </p>
      <MB note="왼쪽이 오일러 정리, n이 소수 p일 때의 특수한 경우가 페르마의 소정리입니다.">{'a^{\\varphi(n)} \\equiv 1 \\pmod n, \\qquad a^{p-1} \\equiv 1 \\pmod p'}</MB>
      <FermatFigure />
      <p>
        처음 설정인 p = 13, a = 3에서는 3, 9, 1로 세 번 만에 1이 되고, 그 뒤로 같은 세 수가 되풀이되어 열두 번째에 다시 1입니다. 위수 3이 12의 약수이기 때문입니다. a = 2로 바꾸면 열두 번 모두 다른 수가 나오고 12번째에 처음 1이 됩니다. 2는 <M>{'(\\mathbb{Z}/13)^{\\times}'}</M>의 생성원입니다. "아무 수 n"으로 바꿔 n = 15를 고르면 <M>{'\\varphi(15) = 8'}</M>이고, 어느 a를 골라도 여덟 번째 거듭제곱은 1입니다. 이 성질은 <a href={lessonHref('net-security', 'public-key')}>공개 키 암호 RSA</a>가 복호화를 할 수 있는 이유이기도 합니다.
      </p>

      <h2>거꾸로는 성립하지 않습니다</h2>
      <p>
        부분군의 크기는 군 크기의 약수여야 하지만, 약수마다 그 크기의 부분군이 있는 것은 아닙니다. 그림 2에서 <M>{'A_4'}</M>(네 물건의 짝순열 12개)를 골라 보세요. 부분군은 10개이고 크기는 1, 2, 3, 4, 12뿐입니다. 12의 약수인 6 크기의 부분군이 없습니다. 순환군에서는 약수마다 정확히 하나씩 부분군이 있다는 것과 대조적입니다. 어떤 약수에 대해 부분군이 반드시 있는지는 실로우 정리가 답하는데, 이 과목의 범위를 넘습니다.
      </p>

      <Callout kind="key">
        부분군은 같은 연산으로 그 자체가 군이 되는 부분집합입니다. 부분군 H를 군 안에서 옮겨 놓은 잉여류 gH는 모두 크기가 |H|이고 서로 겹치지 않아 군을 빈틈없이 나눕니다. 그래서 유한군에서 부분군의 크기와 원소의 위수는 언제나 군 크기의 약수이고(라그랑주 정리), 이것을 나머지 곱셈의 군에 쓰면 페르마의 소정리와 오일러 정리가 나옵니다. 거꾸로 약수마다 부분군이 있지는 않습니다.
      </Callout>
      <Quiz
        q="원소가 35개인 군 G가 있다. G의 원소가 가질 수 없는 위수는?"
        options={['1', '5', '7', '10']}
        answer={3}
        explain={<>라그랑주 정리에 따라 원소의 위수는 35의 약수인 1, 5, 7, 35 중 하나여야 합니다. 10은 35의 약수가 아니므로 위수가 10인 원소는 있을 수 없습니다.</>}
      />
    </>
  );
}

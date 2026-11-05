import { useId, useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { FULL, NAMES, PRESETS, SUBSET_ORDER, canonical, check, closure, continuityFailures, generate, interior, preimage, setLabel, squareToDisk, topologyClasses, wobble } from './topo';
import './topology.css';
import './topspace.css';

/* ─────────────── a small picture of a family of open sets on three points ─────────────── */

/** Points a, b, c sit on a triangle; each open set is drawn as a translucent blob around its points. */
const PT: [number, number][] = [
  [60, 34],
  [28, 92],
  [92, 92],
];
const bits = (m: number) => [0, 1, 2].filter((i) => m & (1 << i));

function OpenSetsPicture({ fam, size = 120, label }: { fam: number[]; size?: number; label: string }) {
  const opens = fam.filter((m) => m !== 0).sort((x, y) => bits(y).length - bits(x).length);
  return (
    <svg className="ts-pic" viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={label}>
      {opens.map((m) => {
        const pts = bits(m);
        const key = `o${m}`;
        if (pts.length === 3) return <circle key={key} cx={60} cy={66} r={51} className="ts-blob" />;
        if (pts.length === 2) {
          const [p, q] = pts.map((i) => PT[i]);
          return <line key={key} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="ts-blob ts-blob-line" />;
        }
        const p = PT[pts[0]];
        return <circle key={key} cx={p[0]} cy={p[1]} r={15} className="ts-blob" />;
      })}
      {PT.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={4.5} className="ts-dot" />
          <text x={x} y={y - 9} className="ts-dot-label" textAnchor="middle">
            {NAMES[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ─────────────── Figure 1: build a topology ─────────────── */

function BuildFigure({ fam, setFam }: { fam: Set<number>; setFam: (s: Set<number>) => void }) {
  const [A, setA] = useState(2);
  const selId = useId();
  const c = check(fam);
  const list = SUBSET_ORDER.filter((m) => fam.has(m));
  const toggle = (m: number) => {
    const s = new Set(fam);
    if (s.has(m)) s.delete(m);
    else s.add(m);
    setFam(s);
  };
  const preset = PRESETS.find((p) => p.opens.length === list.length && p.opens.every((m) => fam.has(m)));
  const problems = [
    ...c.missingEnds.map((m) => `${setLabel(m)}이 없습니다`),
    ...c.badUnion.map(([u, v, w]) => `${setLabel(u)} ∪ ${setLabel(v)} = ${setLabel(w)}가 없습니다`),
    ...c.badMeet.map(([u, v, w]) => `${setLabel(u)} ∩ ${setLabel(v)} = ${setLabel(w)}가 없습니다`),
  ];
  return (
    <Figure
      no={1}
      title="세 점 위에 위상 만들기"
      hint="부분집합을 눌러 열린 집합으로 넣고 빼 보세요"
      caption={
        <>
          세 점 {'{a, b, c}'}의 부분집합 8개 중 열린 집합으로 정한 것을 왼쪽 그림에 덩어리로 그립니다. 공리를 어기면 무엇이 빠졌는지 적고, "빠진 집합 채우기"는 지금 고른 집합들을 담는 가장 작은 위상을 만듭니다. 아래에서 집합 A를 고르면 지금 위상에서의 내부(A 안의 열린 집합을 모두 합친 것)와 폐포(A의 여집합의 내부의 여집합)를 계산합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={preset?.id ?? ''} onChange={(id) => setFam(new Set(PRESETS.find((p) => p.id === id)!.opens))} options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} label="예" />
      </div>
      <div className="fig-split left">
        <div className="tp-col" style={{ alignItems: 'center' }}>
          <OpenSetsPicture fam={list} size={180} label={`열린 집합 ${list.map((m) => setLabel(m)).join(', ')}`} />
        </div>
        <div className="controls">
          <div className="ts-toggles" role="group" aria-label="열린 집합으로 넣을 부분집합">
            {SUBSET_ORDER.map((m) => (
              <button key={m} type="button" className="ts-toggle" aria-pressed={fam.has(m)} onClick={() => toggle(m)}>
                {setLabel(m)}
              </button>
            ))}
          </div>
          <div className="tp-note" data-good={c.ok || undefined} data-bad={!c.ok || undefined} aria-live="polite">
            {c.ok ? `위상입니다. 열린 집합 ${list.length}개.` : problems.slice(0, 3).join(' · ') + (problems.length > 3 ? ` 외 ${problems.length - 3}개` : '')}
          </div>
          <div className="btn-row">
            <Button small primary onClick={() => setFam(generate(fam))} disabled={c.ok}>
              빠진 집합 채우기
            </Button>
            <Button small onClick={() => setFam(new Set([0, FULL]))}>
              처음부터
            </Button>
          </div>
          <label className="ts-select" htmlFor={selId}>
            <span>집합 A</span>
            <select id={selId} value={A} onChange={(e) => setA(+e.target.value)}>
              {SUBSET_ORDER.map((m) => (
                <option key={m} value={m}>
                  {setLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="A의 내부" value={setLabel(interior(fam, A))} />
            <Readout label="A의 폐포" value={setLabel(closure(fam, A))} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: all 29 topologies on three points ─────────────── */

function GalleryFigure({ fam, setFam }: { fam: Set<number>; setFam: (s: Set<number>) => void }) {
  const classes = useMemo(() => topologyClasses(), []);
  const total = classes.reduce((n, c) => n + c.count, 0);
  const cur = check(fam).ok ? canonical([...fam]) : null;
  return (
    <Figure
      no={2}
      title={`세 점 위의 위상 ${total}개`}
      hint="카드를 눌러 그림 1로 불러오세요"
      caption={
        <>
          세 점 위의 위상을 모두 찾아, 점의 이름표만 바꾸면 같아지는 것끼리 묶었습니다. 카드는 열린 집합이 적은(거친) 위상에서 많은(고운) 위상 순서이고, 오른쪽 위 숫자는 이름표를 바꿔 얻는 위상의 수입니다. 그림 1의 위상과 같은 꼴의 카드에 테두리를 칠합니다.
        </>
      }
    >
      <div className="ts-gallery">
        {classes.map((c, i) => {
          const k = canonical(c.rep);
          return (
            <button key={k} type="button" className="ts-card" data-current={cur === k || undefined} onClick={() => setFam(new Set(c.rep))} aria-label={`꼴 ${i + 1}: 열린 집합 ${c.rep.length}개, 이름표를 바꾸면 ${c.count}개. 그림 1로 불러오기`}>
              <span className="ts-card-head">
                <span>열린 집합 {c.rep.length}개</span>
                <span className="mono">×{c.count}</span>
              </span>
              <OpenSetsPicture fam={c.rep} size={84} label="" />
              <span className="ts-card-sets">{c.rep.filter((m) => m !== 0 && m !== FULL).map((m) => setLabel(m)).join(' ') || '∅와 X만'}</span>
            </button>
          );
        })}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: continuity between finite spaces ─────────────── */

const YN = ['1', '2', '3'];

function ContinuityFigure() {
  const [xId, setX] = useState('chain');
  const [yId, setY] = useState('sierpinski');
  const [f, setF] = useState([1, 0, 0]);
  const ids = [useId(), useId(), useId(), useId(), useId()];
  const TX = new Set(PRESETS.find((p) => p.id === xId)!.opens);
  const TY = new Set(PRESETS.find((p) => p.id === yId)!.opens);
  const fails = continuityFailures(f, TX, TY);
  const ok = fails.length === 0;
  const ys = SUBSET_ORDER.filter((m) => TY.has(m));
  return (
    <Figure
      no={3}
      title="역상으로 연속 판정하기"
      hint="두 공간의 위상과 함수 f를 바꿔 보세요"
      caption={
        <>
          X = {'{a, b, c}'}에서 Y = {'{1, 2, 3}'}으로 가는 함수 f를 정합니다. 표는 Y의 열린 집합 V마다 역상 <M>{'f^{-1}(V)'}</M>를 계산하고, 그것이 X에서 열려 있는지 확인합니다. 한 줄이라도 아니오이면 f는 연속이 아닙니다.
        </>
      }
    >
      <div className="ts-selects">
        <label htmlFor={ids[0]}>
          <span>X의 위상</span>
          <select id={ids[0]} value={xId} onChange={(e) => setX(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids[1]}>
          <span>Y의 위상</span>
          <select id={ids[1]} value={yId} onChange={(e) => setY(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.replace(/a/g, '1').replace(/b/g, '2').replace(/c/g, '3')}
              </option>
            ))}
          </select>
        </label>
        {NAMES.map((nm, i) => (
          <label key={nm} htmlFor={ids[i + 2]}>
            <span>f({nm})</span>
            <select id={ids[i + 2]} value={f[i]} onChange={(e) => setF(f.map((v, j) => (j === i ? +e.target.value : v)))}>
              {YN.map((y, k) => (
                <option key={y} value={k}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="ts-table">
          <thead>
            <tr>
              <th>Y의 열린 집합 V</th>
              <th>역상 f⁻¹(V)</th>
              <th>X에서 열림?</th>
            </tr>
          </thead>
          <tbody>
            {ys.map((V) => {
              const pre = preimage(f, V);
              const good = TX.has(pre);
              return (
                <tr key={V} data-bad={!good || undefined}>
                  <td className="mono">{setLabel(V, YN)}</td>
                  <td className="mono">{setLabel(pre)}</td>
                  <td>{good ? '예' : '아니오'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tp-note" data-good={ok || undefined} data-bad={!ok || undefined} aria-live="polite">
        {ok ? 'Y의 모든 열린 집합의 역상이 X에서 열려 있습니다. f는 연속입니다.' : `${setLabel(fails[0].V, YN)}의 역상 ${setLabel(fails[0].pre)}가 X에서 열려 있지 않으므로 f는 연속이 아닙니다.`}
      </div>
      <div className="btn-row">
        <Button small onClick={() => setF([0, 0, 1])}>f = (1, 1, 2)</Button>
        <Button small onClick={() => setF([1, 0, 0])}>f = (2, 1, 1)</Button>
        <Button small onClick={() => setX('discrete')}>X를 이산 위상으로</Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: rubber-sheet deformation ─────────────── */

type Morph = 'square' | 'wobble';

function RubberFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [kind, setKind] = useState<Morph>('square');
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const phase = useRef(0);
  useAnimationFrame((dt) => {
    phase.current += dt * 0.5;
    setT(0.5 - 0.5 * Math.cos(phase.current * Math.PI));
  }, playing && inView && !prefersReducedMotion());

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h) / 3.2;
      const cx = w / 2, cy = h / 2;
      const map = (x: number, y: number) => (kind === 'square' ? squareToDisk(x, y, t) : wobble(x, y, t));
      const sample = (x: number, y: number) => {
        // the wobble works on the disk: feed it the disk picture of the square
        const [u, v] = kind === 'square' ? [x, y] : squareToDisk(x, y, 1);
        const [px, py] = map(u, v);
        return [cx + px * S, cy - py * S];
      };
      const n = 12, steps = 40;
      // fill
      ctx.fillStyle = alpha(P.math, 0.12);
      ctx.beginPath();
      for (let k = 0; k <= 4 * steps; k++) {
        const s = (k % steps) / steps, side = Math.floor(k / steps) % 4;
        const [x, y] = side === 0 ? [-1 + 2 * s, -1] : side === 1 ? [1, -1 + 2 * s] : side === 2 ? [1 - 2 * s, 1] : [-1, 1 - 2 * s];
        const [px, py] = sample(x, y);
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // grid lines, two colours for the two directions
      for (const dir of [0, 1]) {
        ctx.strokeStyle = dir ? alpha(P.neg, 0.75) : alpha(P.pos, 0.75);
        ctx.lineWidth = 1.2;
        for (let i = 0; i <= n; i++) {
          const c = -1 + (2 * i) / n;
          ctx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const s = -1 + (2 * k) / steps;
            const [px, py] = dir ? sample(c, s) : sample(s, c);
            if (k) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
      }
      // one marked cell, to follow
      ctx.fillStyle = alpha(P.good, 0.55);
      ctx.beginPath();
      const cell: [number, number][] = [];
      for (let k = 0; k <= 8; k++) cell.push([1 / 6 + k / 48, 1 / 6]);
      for (let k = 0; k <= 8; k++) cell.push([1 / 3, 1 / 6 + k / 48]);
      for (let k = 0; k <= 8; k++) cell.push([1 / 3 - k / 48, 1 / 3]);
      for (let k = 0; k <= 8; k++) cell.push([1 / 6, 1 / 3 - k / 48]);
      cell.forEach(([x, y], i) => {
        const [px, py] = sample(x, y);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    },
    [P, kind, t],
    { aspect: 1.2, maxHeight: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="고무판처럼 늘이고 휘기"
      hint="t를 움직이거나 재생해 보세요"
      caption={
        <>
          격자를 그린 고무판을 찢거나 붙이지 않고 늘이고 휩니다. "정사각형 → 원판"은 t = 1에서 정사각형을 원판으로 보내는 위상 동형이고, "원판 휘기"는 원판을 물결 모양으로 늘이고 비트는 위상 동형입니다. 초록 칸 하나를 따라가면 이웃한 칸은 끝까지 이웃해 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={kind} onChange={setKind} options={[{ value: 'square', label: '정사각형 → 원판' }, { value: 'wobble', label: '원판 휘기' }]} label="변형" />
        <Slider label="t" value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => v.toFixed(2)} />
        <Button small onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ 멈춤' : '▶ 재생'}</Button>
      </div>
      <div ref={outer}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`격자를 그린 ${kind === 'square' ? '정사각형이 원판으로' : '원판이 물결 모양으로'} 변형되는 그림. 지금 t = ${t.toFixed(2)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function TopologicalSpaces() {
  const [fam, setFam] = useState<Set<number>>(() => new Set(PRESETS.find((p) => p.id === 'chain')!.opens));
  return (
    <>
      <h2>거리를 버리고 열린 집합만 남기기</h2>
      <p>
        <a href={lessonHref('math-topology', 'metric-spaces')}>앞 장</a>에서 d₁, d₂, d∞는 값이 서로 달라도 같은 열린 집합을 준다는 것을 보았습니다. 그렇다면 거리 대신 "어떤 집합들이 열려 있는가"라는 목록만 들고 다녀도 될 것입니다. 열린 집합들이 지켜야 할 성질은 거리 공간에서 이미 증명할 수 있는 세 가지입니다.
      </p>
      <div className="ts-thm">
        <b>정의 (위상 공간).</b> 집합 X의 부분집합들의 모임 <M>{'\\mathcal{T}'}</M>가 다음을 만족하면 <T en="topology">위상</T>이라고 하고, 그 원소를 <T en="open set">열린 집합</T>, 쌍 <M>{'(X, \\mathcal{T})'}</M>를 <T en="topological space">위상 공간</T>이라고 합니다.
        <MB>{'\\begin{aligned} &\\varnothing \\in \\mathcal{T}, \\quad X \\in \\mathcal{T} \\\\ &U_i \\in \\mathcal{T} \\text{이면 } \\textstyle\\bigcup_i U_i \\in \\mathcal{T} \\quad \\text{(아무리 많이 합쳐도)} \\\\ &U, V \\in \\mathcal{T} \\text{이면 } U \\cap V \\in \\mathcal{T} \\quad \\text{(유한 개의 교집합)} \\end{aligned}'}</MB>
      </div>
      <p>
        합집합은 무한히 많아도 되지만 교집합은 유한 개까지만 요구하는 데에는 이유가 있습니다. 실수에서 열린 구간 <M>{'(-1/n, 1/n)'}</M>을 모든 n에 대해 겹치면 한 점 {'{0}'}만 남는데, 이것은 열린 집합이 아닙니다. 점이 세 개뿐인 집합에서는 모든 것이 유한하므로, 두 개씩의 합집합과 교집합만 확인하면 됩니다.
      </p>
      <BuildFigure fam={fam} setFam={setFam} />
      <p>
        처음 열린 사슬 위상 <M>{'\\varnothing \\subset \\{a\\} \\subset \\{a, b\\} \\subset X'}</M>에서 A = {'{b}'}를 고르면, {'{b}'} 안에 든 열린 집합은 ∅뿐이라 내부가 ∅이고, 폐포는 {'{b, c}'}입니다. 같은 위상에서 {'{a}'}는 열린 집합이라 내부가 자기 자신이지만, 폐포는 X 전체입니다. 이 작은 공간에서는 a가 모든 점에 "가깝습니다". 여기서 {'{a, b}'}를 빼고 {'{b}'}를 넣으면 {'{a} ∪ {b} = {a, b}'}가 없다고 알려 주고, "빠진 집합 채우기"를 누르면 그것을 채워 위상을 완성합니다.
      </p>
      <p>
        양 끝의 두 위상에는 이름이 있습니다. ∅와 X만 열려 있는 <T en="indiscrete topology">밀집 위상</T>에서는 어떤 두 점도 열린 집합으로 떼어 놓을 수 없고, 모든 부분집합이 열려 있는 <T en="discrete topology">이산 위상</T>에서는 모든 점이 혼자 떨어져 있습니다. 앞 장의 이산 거리가 주는 위상이 바로 이산 위상입니다. 그 사이에 얼마나 많은 위상이 있을까요?
      </p>
      <GalleryFigure fam={fam} setFam={setFam} />
      <p>
        세 점 위에는 위상이 모두 29개 있고, 점의 이름표를 바꾸면 같아지는 것끼리 묶으면 9가지 꼴이 됩니다. 꼴마다 수가 다른 것은 대칭 때문입니다. 밀집 위상과 이산 위상은 이름표를 바꿔도 그대로라 하나씩이고, 사슬 위상처럼 세 점의 역할이 모두 다른 꼴은 이름표를 바꾸는 방법 3! = 6가지가 모두 다른 위상을 줍니다. 위상 하나가 다른 위상의 열린 집합을 모두 포함하면 더 <T en="finer">곱다</T>고 하고, 반대이면 더 <T en="coarser">거칠다</T>고 합니다. 갤러리의 왼쪽 위가 가장 거칠고 오른쪽 아래가 가장 곱습니다.
      </p>

      <h2>연속: 열린 집합의 역상이 열려 있다</h2>
      <p>
        이제 거리가 없으므로 연속을 ε-δ로 정의할 수 없습니다. 대신 다음 정의를 씁니다. 함수 <M>{'f : X \\to Y'}</M>가 <T en="continuous">연속</T>이라는 것은 Y의 모든 열린 집합 V에 대해 그 <T en="preimage">역상</T> <M>{'f^{-1}(V) = \\{x : f(x) \\in V\\}'}</M>가 X에서 열려 있다는 것입니다. 상이 아니라 역상이라는 데 주의하세요.
      </p>
      <ContinuityFigure />
      <p>
        기본값은 X에 사슬 위상, Y에 {'{1}'}만 더 열려 있는 위상을 주고 f(a) = 2, f(b) = f(c) = 1로 보냅니다. 그러면 Y의 열린 집합 {'{1}'}의 역상이 {'{b, c}'}인데, 이것은 사슬 위상에서 열려 있지 않으므로 f는 연속이 아닙니다. f = (1, 1, 2), 곧 a와 b를 1로, c를 2로 보내면 {'{1}'}의 역상이 {'{a, b}'}가 되어 연속입니다. X를 이산 위상으로 바꾸면 모든 역상이 열려 있으므로 어떤 f든 연속이 됩니다.
      </p>
      <p>이 정의가 정말 우리가 알던 연속과 같은지는 거리 공간에서 확인할 수 있습니다.</p>
      <div className="ts-thm">
        <b>정리.</b> 거리 공간 사이의 함수 f에 대해, f가 모든 점에서 ε-δ의 뜻으로 연속인 것과, 모든 열린 집합의 역상이 열린 집합인 것은 같습니다.
      </div>
      <div className="ts-proof">
        <p>
          <span className="ts-proof-head">증명 (⇒).</span> V가 Y에서 열려 있고 <M>{'x \\in f^{-1}(V)'}</M>라고 합시다. <M>{'f(x) \\in V'}</M>이고 V가 열려 있으므로 어떤 ε &gt; 0이 있어 <M>{'B(f(x), \\varepsilon) \\subseteq V'}</M>입니다. 연속성에서 δ &gt; 0이 있어 <M>{'d(x, x\') < \\delta'}</M>이면 <M>{'d(f(x), f(x\')) < \\varepsilon'}</M>입니다. 곧 <M>{'f(B(x, \\delta)) \\subseteq B(f(x), \\varepsilon) \\subseteq V'}</M>이므로 <M>{'B(x, \\delta) \\subseteq f^{-1}(V)'}</M>입니다. x가 역상의 내부의 점이므로 역상은 열려 있습니다.
        </p>
        <p>
          <span className="ts-proof-head">(⇐).</span> x와 ε &gt; 0을 고정합니다. 열린 공 <M>{'B(f(x), \\varepsilon)'}</M>은 열린 집합이므로 그 역상은 x를 담은 열린 집합이고, 따라서 어떤 δ &gt; 0에 대해 <M>{'B(x, \\delta)'}</M>가 그 안에 들어갑니다. 이것이 바로 <M>{'d(x, x\') < \\delta \\Rightarrow d(f(x), f(x\')) < \\varepsilon'}</M>입니다. <span className="ts-qed">∎</span>
        </p>
      </div>
      <p>
        ε-δ 정의는 <a href={lessonHref('math-analysis', 'continuity')}>해석학의 연속 함수</a> 장에서 다룬 그대로입니다. 증명에서 ε 공과 δ 공의 역할이 "V 안에 공이 있다"와 "역상 안에 공이 있다"로 그대로 옮겨진 것을 볼 수 있습니다.
      </p>

      <h2>위상 동형: 같은 모양</h2>
      <p>
        연속이고 일대일 대응이며 역함수도 연속인 함수를 <T en="homeomorphism">위상 동형 사상</T>이라고 하고, 그런 함수가 있는 두 공간을 위상 동형이라고 합니다. 위상 동형 사상은 열린 집합을 열린 집합으로 정확히 맞바꾸므로, 위상의 눈으로 보면 두 공간은 이름만 다를 뿐 같은 공간입니다. 그림으로는 찢거나 붙이지 않고 고무판처럼 늘이고 휘는 변형입니다.
      </p>
      <RubberFigure />
      <p>
        정사각형과 원판은 모서리가 있느냐 없느냐가 다르지만 위상 동형입니다. 모서리와 길이와 넓이는 늘이면 바뀌는 성질이라 위상수학에서는 보지 않습니다. 흔히 "위상수학자에게 커피잔과 도넛은 같다"고 말하는 것도 이 뜻입니다. 손잡이에 난 구멍 하나가 도넛의 구멍 하나로 늘어날 뿐, 찢거나 붙이는 일이 없기 때문입니다.
      </p>
      <p>
        반대로 두 공간이 위상 동형이 <strong>아님</strong>을 보이려면 늘여도 바뀌지 않는 <T en="topological invariant">위상 불변량</T>이 서로 다르다는 것을 보이면 됩니다. 가장 쉬운 불변량이 조각의 수와 구멍의 수입니다.
      </p>
      <div className="tbl-wrap">
        <table className="ts-table">
          <thead>
            <tr>
              <th>공간</th>
              <th>조각의 수</th>
              <th>구멍의 수</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>원판, 정사각형, 삼각형</td>
              <td className="mono">1</td>
              <td className="mono">0</td>
            </tr>
            <tr>
              <td>고리(가운데가 뚫린 원판), 원기둥 옆면</td>
              <td className="mono">1</td>
              <td className="mono">1</td>
            </tr>
            <tr>
              <td>떨어진 원판 두 개</td>
              <td className="mono">2</td>
              <td className="mono">0</td>
            </tr>
            <tr>
              <td>숫자 8 모양</td>
              <td className="mono">1</td>
              <td className="mono">2</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        "조각"을 정확히 정의하는 것이 <a href={lessonHref('math-topology', 'connectedness')}>연결성</a>이고, "구멍"을 고리를 줄여 보는 것으로 정확히 세는 것이 <a href={lessonHref('math-topology', 'fundamental-group')}>기본군</a>입니다. 두 개념 모두 열린 집합과 연속 함수만으로 정의되므로, 위상 동형 사상으로 옮겨도 값이 바뀌지 않습니다.
      </p>

      <Callout kind="key">
        위상은 ∅와 전체를 담고, 합집합과 유한 교집합에 닫혀 있는 부분집합들의 모임이고, 그 원소를 열린 집합이라고 부릅니다. 거리 공간의 열린 집합은 위상이 되지만, 위상은 거리 없이도 정의됩니다. 세 점 위에는 위상이 29개, 이름표를 무시하면 9가지 꼴이 있습니다. 연속은 "열린 집합의 역상이 열린 집합"으로 정의하며, 거리 공간에서는 ε-δ 연속과 같습니다. 위상 동형 사상은 열린 집합을 정확히 맞바꾸는 연속 일대일 대응이고, 조각과 구멍의 수 같은 위상 불변량으로 두 공간이 다름을 보일 수 있습니다.
      </Callout>
      <Quiz
        q="X에 이산 위상을 주었다. X에서 임의의 위상 공간 Y로 가는 함수 f에 대해 옳은 것은?"
        options={['f가 일대일일 때만 연속이다', 'f는 항상 연속이다', 'Y도 이산 위상일 때만 연속이다', 'f는 상수 함수일 때만 연속이다']}
        answer={1}
        explain={<>이산 위상에서는 X의 모든 부분집합이 열린 집합입니다. 그러므로 Y의 열린 집합 V가 무엇이든 역상 <M>{'f^{-1}(V)'}</M>는 X의 부분집합이라 열려 있고, f는 항상 연속입니다. 그림 3에서 "X를 이산 위상으로"를 누른 뒤 f를 어떻게 바꿔도 연속이 나오는 것을 확인할 수 있습니다. 반대로 Y가 밀집 위상이어도 모든 f가 연속입니다. 역상이 ∅ 아니면 X뿐이기 때문입니다.</>}
      />
    </>
  );
}

import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { CayleyTable } from './CayleyTable';
import { cyclic, dihedral, dihedralMatrix, gcd, order, orderCounts, powers, unitsMod } from './group';
import './algebra.css';
import './groups.css';

/* ─────────────── shared drawing: a regular polygon moved by an element of D_n ─────────────── */

const VCOL = ['var(--pos)', 'var(--neg)', 'var(--good)', 'var(--c-stats-2)', 'var(--c-math-3)', 'var(--c-cs-3)', 'var(--c-net-1)', 'var(--bad)'];

/** Where vertex v (0-based) of the regular n-gon sits after element g acts, in unit coordinates (y up). */
function vertexAt(n: number, g: number, v: number): [number, number] {
  const t = Math.PI / 2 + (2 * Math.PI * v) / n;
  const p: [number, number] = [Math.cos(t), Math.sin(t)];
  const [a, b, c, d] = dihedralMatrix(n, g);
  return [a * p[0] + b * p[1], c * p[0] + d * p[1]];
}

/** The polygon with numbered corners, after g. `axis` draws the mirror line of a reflection. */
function Poly({ n, g, size, axis, animate, label }: { n: number; g: number; size: number; axis?: boolean; animate?: boolean; label: string }) {
  const R = size * 0.36;
  const c = size / 2;
  const X = (x: number) => c + R * x;
  const Y = (y: number) => c - R * y;
  const outline = Array.from({ length: n }, (_, v) => {
    const t = Math.PI / 2 + (2 * Math.PI * v) / n;
    return `${X(Math.cos(t))},${Y(Math.sin(t))}`;
  }).join(' ');
  const refl = g >= n;
  // the mirror of s r^k is the line at angle π/2 − πk/n through the centre
  const phi = Math.PI / 2 - (Math.PI * (g % n)) / n;
  const big = size >= 160;
  const dot = big ? 13 : Math.max(6, size * 0.11);
  return (
    <svg className="gr-poly" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
      <polygon points={outline} className="gr-shape" />
      {axis && refl && <line className="gr-axis" x1={X(-1.25 * Math.cos(phi))} y1={Y(-1.25 * Math.sin(phi))} x2={X(1.25 * Math.cos(phi))} y2={Y(1.25 * Math.sin(phi))} />}
      {Array.from({ length: n }, (_, v) => {
        const [x, y] = vertexAt(n, g, v);
        return (
          <g key={v} className={animate ? 'gr-vtx gr-anim' : 'gr-vtx'} style={{ transform: `translate(${X(x)}px, ${Y(y)}px)` }}>
            <circle r={dot} style={{ fill: VCOL[v % VCOL.length] }} />
            <text dy="0.35em" style={{ fontSize: dot * 1.05 }}>
              {v + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** How the corners read after g, going around from the top: e.g. "1 2 3". */
const reading = (n: number, g: number) => {
  // which original corner now sits at each position
  const at: number[] = [];
  for (let v = 0; v < n; v++) {
    const [x, y] = vertexAt(n, g, v);
    let best = 0, bd = Infinity;
    for (let k = 0; k < n; k++) {
      const t = Math.PI / 2 + (2 * Math.PI * k) / n;
      const d = Math.hypot(Math.cos(t) - x, Math.sin(t) - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    at[best] = v + 1;
  }
  return at.join(' ');
};

/* ─────────────── Figure 1: turn and flip a triangle ─────────────── */

const D3 = dihedral(3);
const R1 = 1; // r
const S0 = 3; // s

function TriangleFigure() {
  const [moves, setMoves] = useState<string[]>([]);
  // pressing a move applies it after what is already there: new = move · old
  const g = useMemo(() => moves.reduce((acc, m) => D3.mul(m === 'r' ? R1 : S0, acc), D3.id), [moves]);
  return (
    <Figure
      no={1}
      title="정삼각형을 돌리고 뒤집기"
      hint="r와 s를 아무 순서로 여러 번 눌러 보세요"
      caption={
        <>
          r는 삼각형을 시계 반대 방향으로 120° 돌리고, s는 세로축을 거울 삼아 뒤집습니다. 삼각형은 자기 자리에 그대로 겹치고 꼭짓점 번호만 바뀝니다. 아래 여섯 그림이 가능한 배치 전부이고, 지금 배치에 테두리가 쳐집니다. 이름 sr는 "r를 먼저 하고 그다음 s"라는 뜻입니다.
        </>
      }
    >
      <div className="gr-tri">
        <Poly n={3} g={g} size={220} animate axis label={`정삼각형. 위에서부터 시계 반대 방향으로 꼭짓점 ${reading(3, g)}. 지금까지 누른 것을 모두 합치면 ${D3.label(g)}입니다.`} />
        <div className="ag-col">
          <div className="btn-row">
            <Button primary onClick={() => setMoves([...moves, 'r'])}>
              r: 120° 돌리기
            </Button>
            <Button primary onClick={() => setMoves([...moves, 's'])}>
              s: 뒤집기
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={() => setMoves(moves.slice(0, -1))} disabled={!moves.length}>
              하나 되돌리기
            </Button>
            <Button small onClick={() => setMoves([])} disabled={!moves.length}>
              처음으로
            </Button>
          </div>
          <div className="gr-trail" aria-label="누른 순서">
            <span className="ag-small">누른 순서</span>
            <span className="mono">{moves.length ? moves.join(' → ') : '아직 없음'}</span>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="누른 횟수" value={`${moves.length}번`} />
            <Readout label="합쳐서 한 동작으로" value={<span className="mono">{D3.label(g)}</span>} />
          </div>
        </div>
      </div>
      <div className="gr-thumbs" role="list" aria-label="가능한 여섯 가지 배치">
        {Array.from({ length: 6 }, (_, a) => (
          <div key={a} role="listitem" className="gr-thumb" data-on={a === g || undefined}>
            <Poly n={3} g={a} size={64} label={`${D3.label(a)}: 꼭짓점 ${reading(3, a)}`} />
            <span className="mono">{D3.label(a)}</span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: fill the multiplication table ─────────────── */

function FillFigure() {
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const pick = (a: number, b: number) => {
    setPicked([a, b]);
    setShown((s) => new Set(s).add(`${a},${b}`));
  };
  const all = shown.size === 36;
  const [a, b] = picked ?? [R1, S0];
  const ab = D3.mul(a, b);
  return (
    <Figure
      no={2}
      title="곱셈표 채우기"
      hint="칸을 누르면 그 두 동작을 이어 한 결과가 나옵니다"
      caption={
        <>
          행이 a, 열이 b인 칸에 곱 ab를 적습니다. ab는 b를 먼저 하고 그다음 a를 하는 것입니다. 오른쪽 세 그림은 처음 배치에서 b를 한 뒤, 이어서 a를 한 모습입니다. 표 안에서는 화살표 키로 칸을 옮겨 다닐 수 있습니다.
        </>
      }
    >
      <div className="gr-fill">
        <CayleyTable G={D3} hidden={(x, y) => !shown.has(`${x},${y}`)} picked={picked} onPick={pick} label="D3의 곱셈표. 칸을 눌러 채웁니다." />
        <div className="ag-col">
          <div className="gr-steps" aria-live="polite">
            <figure>
              <Poly n={3} g={D3.id} size={72} label="처음 배치" />
              <figcaption>처음</figcaption>
            </figure>
            <span aria-hidden="true">→</span>
            <figure>
              <Poly n={3} g={b} size={72} label={`${D3.label(b)}를 한 뒤`} />
              <figcaption>
                먼저 <span className="mono">{D3.label(b)}</span>
              </figcaption>
            </figure>
            <span aria-hidden="true">→</span>
            <figure>
              <Poly n={3} g={ab} size={72} label={`이어서 ${D3.label(a)}를 한 뒤`} />
              <figcaption>
                그다음 <span className="mono">{D3.label(a)}</span>
              </figcaption>
            </figure>
          </div>
          <div className="ag-note">
            <span className="mono">
              {D3.label(a)} · {D3.label(b)} = {D3.label(ab)}
            </span>
            {picked ? '' : ' (예시: 아무 칸이나 눌러 보세요)'}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setShown(new Set(Array.from({ length: 36 }, (_, k) => `${Math.floor(k / 6)},${k % 6}`)))} disabled={all}>
              모두 채우기
            </Button>
            <Button
              small
              onClick={() => {
                setShown(new Set());
                setPicked(null);
              }}
              disabled={!shown.size}
            >
              비우기
            </Button>
          </div>
          <Readout label="채운 칸" value={`${shown.size} / 36`} />
          {all && <div className="ag-note" data-good="">다 채웠습니다. 어느 행과 어느 열을 보아도 여섯 원소가 한 번씩만 나옵니다.</div>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: clocks — ℤ/n and (ℤ/n)ˣ ─────────────── */

function ClockFigure() {
  const [mode, setMode] = useState<'add' | 'mul'>('add');
  const [n, setN] = useState(12);
  const [pickAdd, setPickAdd] = useState(5);
  const [pickMul, setPickMul] = useState(1);
  const G = useMemo(() => (mode === 'add' ? cyclic(n) : unitsMod(n)), [mode, n]);
  const value = (a: number) => (mode === 'add' ? a : (G as ReturnType<typeof unitsMod>).value(a));
  const a = mode === 'add' ? Math.min(pickAdd, n - 1) : Math.min(pickMul, G.n - 1);
  const pw = powers(G, a);
  const ord = pw.length;
  const gens = Array.from({ length: G.n }, (_, k) => k).filter((k) => order(G, k) === G.n);
  const size = 260;
  const c = size / 2, R = size * 0.38;
  const pos = (k: number): [number, number] => {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / n;
    return [c + R * Math.cos(t), c + R * Math.sin(t)];
  };
  const path = pw.map((x) => pos(value(x)).join(',')).join(' ');
  const isUnit = (k: number) => gcd(k, n) === 1;
  const opName = mode === 'add' ? '더하기' : '곱하기';
  return (
    <Figure
      no={3}
      title="시계 위의 군"
      hint="연산과 n, 원소를 바꿔 보세요"
      caption={
        <>
          시계에 0부터 n − 1까지 적고, 고른 원소를 자기 자신에게 계속 {opName}하며 지나간 자리를 잇습니다. 다시 {mode === 'add' ? '0' : '1'}으로 돌아올 때까지 걸린 횟수가 그 원소의 위수입니다. 곱하기에서는 n과 서로소인 수만 군에 들어가고, 나머지는 흐리게 그립니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="연산"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'add', label: '더하기 ℤ/n' },
            { value: 'mul', label: '곱하기 (ℤ/n)ˣ' },
          ]}
        />
        <Slider id="gr-n" label="n" value={n} min={2} max={20} step={1} onChange={(v) => setN(v)} />
        <Slider
          id="gr-a"
          label="원소"
          value={a}
          min={0}
          max={G.n - 1}
          step={1}
          format={(k) => String(value(Math.round(k)))}
          onChange={(v) => (mode === 'add' ? setPickAdd(v) : setPickMul(v))}
        />
      </div>
      <div className="gr-clock">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${G.name}에서 ${value(a)}의 거듭제곱: ${pw.map(value).join(', ')}. 위수 ${ord}.`}>
          <circle cx={c} cy={c} r={R} className="gr-ring" />
          {ord > 1 && <polygon points={path} className="gr-star" />}
          {Array.from({ length: n }, (_, k) => {
            const [x, y] = pos(k);
            const on = pw.some((p) => value(p) === k);
            const inG = mode === 'add' || isUnit(k);
            return (
              <g key={k} className="gr-tick" data-on={on || undefined} data-out={!inG || undefined}>
                <circle cx={x} cy={y} r={11} />
                <text x={x} y={y} dy="0.35em">
                  {k}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="ag-col">
          <div className="gr-pw" aria-label="거듭 지나간 수">
            {pw.map((x, k) => (
              <span key={k} className="mono">
                {value(x)}
              </span>
            ))}
            <span className="mono gr-back">→ {mode === 'add' ? 0 : 1}</span>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="군의 크기" value={G.n} />
            <Readout label={`${value(a)}의 위수`} value={ord} color={ord === G.n ? 'var(--good)' : undefined} />
          </div>
          <div className="ag-small">
            생성원 (위수가 {G.n}인 원소): {gens.length ? <span className="mono">{gens.map(value).join(', ')}</span> : '없음. 이 군은 순환군이 아닙니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: dihedral groups D_n ─────────────── */

function DihedralFigure() {
  const [n, setN] = useState(4);
  const [g, setG] = useState(5);
  const D = useMemo(() => dihedral(n), [n]);
  const el = Math.min(g, D.n - 1);
  const counts = orderCounts(D);
  return (
    <Figure
      no={4}
      title="정다각형의 대칭군"
      hint="꼭짓점 수와 원소를 바꿔 보세요"
      caption={
        <>
          정n각형의 대칭은 회전 n개와 뒤집기 n개, 모두 2n개입니다. 원소 칩을 누르면 다각형이 그 동작대로 움직이고, 뒤집기라면 거울 축이 점선으로 나타납니다. 칩 아래의 수는 위수입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider
          id="gr-dn"
          label="꼭짓점 수 n"
          value={n}
          min={3}
          max={8}
          step={1}
          onChange={(v) => {
            setN(v);
            setG(Math.min(g, 2 * v - 1));
          }}
        />
      </div>
      <div className="gr-tri">
        <Poly n={n} g={el} size={220} axis animate label={`정${n}각형에 ${D.label(el)}를 한 모습. 위에서부터 시계 반대 방향으로 꼭짓점 ${reading(n, el)}.`} />
        <div className="ag-col">
          <div className="gr-chips" role="group" aria-label={`D${n}의 원소`}>
            {Array.from({ length: D.n }, (_, a) => (
              <button key={a} type="button" className="gr-chip" aria-pressed={a === el} onClick={() => setG(a)}>
                <span className="mono">{D.label(a)}</span>
                <small>{order(D, a)}</small>
              </button>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`D${n}의 크기`} value={D.n} />
            <Readout label={`${D.label(el)}의 위수`} value={order(D, el)} />
          </div>
          <div className="ag-small">
            위수별 원소 수: {counts.map(([o, c]) => `위수 ${o}: ${c}개`).join(' · ')}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Groups() {
  return (
    <>
      <h2>삼각형을 제자리에 놓는 방법</h2>
      <p>
        종이에 정삼각형을 그리고 오려 낸 다음, 원래 자리에 다시 끼워 넣는 방법이 몇 가지인지 세어 봅시다. 시계 반대 방향으로 120°나 240° 돌려 끼울 수 있고, 뒤집어서 끼울 수도 있습니다. 아무것도 하지 않는 것도 한 방법으로 칩니다. 이렇게 모양을 바꾸지 않고 자기 자신에게 겹치게 하는 동작을 <T en="symmetry">대칭</T>이라고 합니다.
      </p>
      <p>그림 1에서 두 기본 동작 r(돌리기)와 s(뒤집기)를 아무렇게나 섞어 눌러 보세요.</p>
      <TriangleFigure />
      <p>
        몇 번을 누르든 결과는 아래 여섯 배치 중 하나에 떨어집니다. r를 세 번 누르면 처음으로 돌아오고, s를 두 번 눌러도 처음으로 돌아옵니다. 동작을 길게 이어 붙여도 결국 한 동작과 같다는 것, 그리고 모든 동작을 되돌릴 수 있다는 것이 이 장에서 다룰 구조의 전부입니다.
      </p>

      <h2>동작을 곱하기</h2>
      <p>
        두 동작을 이어서 하는 것을 <T en="composition">합성</T>이라 하고, 곱처럼 붙여 적습니다. 이 과목에서는 함수를 합성할 때처럼 <M>{'ab'}</M>를 "<M>{'b'}</M>를 먼저 하고 그다음 <M>{'a'}</M>"로 읽습니다. 여섯 동작끼리의 곱을 모두 적은 표를 <T en="Cayley table">곱셈표</T>(케일리 표)라고 합니다. 그림 2에서 칸을 눌러 표를 채워 보세요.
      </p>
      <FillFigure />
      <p>
        행 r, 열 s인 칸을 누르면 <M>{'rs = sr^2'}</M>이 나오고, 행 s, 열 r인 칸은 <M>{'sr'}</M>입니다. 두 결과는 다른 배치이므로 <M>{'rs \\neq sr'}</M>입니다. 순서를 바꾸면 결과가 달라지는 곱셈이 처음에는 이상하지만, 신발을 신고 양말을 신는 것과 양말을 신고 신발을 신는 것이 다르듯 동작의 합성에서는 흔한 일입니다.
      </p>

      <h2>군의 정의</h2>
      <p>곱셈표를 다 채우고 보면 눈에 띄는 성질이 세 가지 있습니다. 이 세 성질만 뽑아낸 것이 군입니다.</p>
      <MB note="결합법칙은 곱셈표에서 바로 보이지 않지만, 동작의 합성은 언제나 결합법칙을 만족합니다.">{'\\begin{aligned} &\\text{집합 } G\\text{와 연산 } G\\times G \\to G,\\ (a,b)\\mapsto ab \\text{ 가 다음을 만족하면 } G \\text{를 군이라 한다.}\\\\ &\\text{(결합법칙)}\\quad (ab)c = a(bc)\\\\ &\\text{(항등원)}\\quad ea = ae = a \\text{ 인 } e \\text{가 있다}\\\\ &\\text{(역원)}\\quad \\text{모든 } a \\text{에 대해 } aa^{-1} = a^{-1}a = e \\text{ 인 } a^{-1} \\text{가 있다} \\end{aligned}'}</MB>
      <p>
        이 셋을 만족하는 집합과 연산을 <T en="group">군</T>이라고 하고, 원소의 개수를 군의 <T en="order">위수</T>라고 합니다. 정삼각형의 대칭군은 위수 6이고 <M>{'D_3'}</M>라고 씁니다. 곱의 순서를 바꿔도 늘 같은 군, 곧 <M>{'ab = ba'}</M>가 언제나 성립하는 군은 <T en="abelian group">아벨 군</T>이라 합니다. <M>{'D_3'}</M>는 아벨 군이 아닙니다.
      </p>
      <p>그림 2를 다 채웠다면 어느 행, 어느 열에도 여섯 원소가 정확히 한 번씩 나온다는 것을 보았을 것입니다. 이것은 우연이 아니라 역원이 있다는 사실에서 바로 나옵니다.</p>
      <div className="gr-proof">
        <p>
          <strong>명제.</strong> 유한군의 곱셈표에서 각 행과 각 열에는 모든 원소가 정확히 한 번씩 나온다.
        </p>
        <p>
          <strong>증명.</strong> 행 <M>{'a'}</M>에서 두 칸 <M>{'ab'}</M>와 <M>{'ac'}</M>가 같다고 하자. 양변의 왼쪽에 <M>{'a^{-1}'}</M>를 곱하면 결합법칙과 항등원에 의해 <M>{'b = a^{-1}(ab) = a^{-1}(ac) = c'}</M>이다. 그러므로 한 행의 칸들은 모두 다르다. 칸이 원소 수만큼 있고 모두 다르므로 모든 원소가 한 번씩 나온다. 열에 대해서는 오른쪽에 곱하면 같다. ∎
        </p>
      </div>
      <Callout kind="note">
        같은 논리로 항등원은 하나뿐이고, 각 원소의 역원도 하나뿐입니다. 항등원 <M>{"e, e'"}</M>가 둘이라면 <M>{'e = ee\' = e\''}</M>이기 때문입니다. 그래서 "항등원", "역원"이라고 정관사처럼 부를 수 있습니다.
      </Callout>

      <h2>더하기도 군입니다</h2>
      <p>
        군은 대칭에서 출발했지만 정의에는 "동작"이라는 말이 없습니다. 정수 전체는 덧셈에 대해 군입니다. 항등원은 0이고 <M>{'a'}</M>의 역원은 <M>{'-a'}</M>입니다. 12시간 시계처럼 n으로 나눈 나머지끼리 더하는 <M>{'\\mathbb{Z}/n'}</M>도 원소가 n개인 군입니다. 나머지 산술은 <a href={lessonHref('math-discrete', 'modular')}>이산수학의 정수와 모듈러 연산</a> 장에서 다뤘습니다.
      </p>
      <p>
        한 원소 <M>{'a'}</M>를 거듭 곱하면 <M>{'e, a, a^2, \\dots'}</M>가 나오는데, 유한군에서는 언젠가 반드시 <M>{'e'}</M>로 돌아옵니다. 처음 돌아오는 거듭제곱 횟수를 <M>{'a'}</M>의 <T en="order of an element">위수</T>라 합니다. 위수가 군의 크기와 같아서 <M>{'a'}</M>의 거듭제곱만으로 군 전체가 나온다면, <M>{'a'}</M>를 <T en="generator">생성원</T>이라 하고 그런 군을 <T en="cyclic group">순환군</T>이라 합니다.
      </p>
      <ClockFigure />
      <p>
        처음 설정인 <M>{'\\mathbb{Z}/12'}</M>에서 5를 계속 더하면 0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7을 모두 지나 12번 만에 0으로 돌아옵니다. 5는 생성원입니다. 4를 고르면 0, 4, 8을 지나 3번 만에 돌아옵니다. <M>{'\\mathbb{Z}/12'}</M>의 생성원은 1, 5, 7, 11이고, 모두 12와 서로소인 수입니다. 일반적으로 <M>{'k'}</M>의 위수는 <M>{'n/\\gcd(k, n)'}</M>이고, 그래서 <M>{'k'}</M>가 생성원일 필요충분조건은 <M>{'\\gcd(k, n) = 1'}</M>입니다.
      </p>
      <p>
        연산을 곱하기로 바꾸면 n과 서로소인 나머지만 남습니다. 서로소가 아닌 수는 역원이 없기 때문입니다. 이 군을 <M>{'(\\mathbb{Z}/n)^{\\times}'}</M>라고 씁니다. n = 7이면 원소가 1부터 6까지 여섯 개이고 3이 생성원입니다(3, 2, 6, 4, 5, 1). n = 8이면 1, 3, 5, 7 네 원소가 모두 자기 자신을 두 번 곱하면 1이 되어서, 생성원이 없습니다. 크기가 4인 군이라도 <M>{'\\mathbb{Z}/4'}</M>처럼 순환군일 수도 있고 이렇게 아닐 수도 있습니다.
      </p>

      <h2>정다각형의 대칭군</h2>
      <p>
        정삼각형 대신 정n각형을 쓰면 대칭은 회전 n개(0°, 360°/n, …)와 뒤집기 n개, 모두 2n개이고 이 군을 <T en="dihedral group">정이면체군</T> <M>{'D_n'}</M>이라고 합니다. 회전 <M>{'r'}</M>는 위수 n이고 뒤집기는 모두 위수 2이며, 정삼각형에서 본 관계 <M>{'rs = sr^{-1}'}</M>가 그대로 성립합니다. 회전과 뒤집기는 평면의 선형변환이므로 2×2 행렬로 쓸 수 있고, 행렬의 곱이 곧 군의 곱입니다(<a href={lessonHref('math-linear-algebra', 'matrices')}>행렬과 선형변환</a>).
      </p>
      <DihedralFigure />
      <p>
        처음 설정인 정사각형(<M>{'D_4'}</M>)에서 원소 8개의 위수를 세면 위수 1이 하나(항등원), 위수 2가 다섯(<M>{'r^2'}</M>와 뒤집기 넷), 위수 4가 둘(<M>{'r, r^3'}</M>)입니다. n = 6으로 바꾸면 위수 2가 일곱, 3이 둘, 6이 둘입니다. 어느 경우에도 위수는 1, 2, n의 약수 중 하나뿐이라는 점을 기억해 두세요. 다음 장에서 이것이 모든 유한군에서 성립하는 이유를 증명합니다.
      </p>

      <Callout kind="key">
        군은 결합법칙, 항등원, 역원을 만족하는 연산이 있는 집합입니다. 도형의 대칭(<M>{'D_n'}</M>), 나머지의 덧셈(<M>{'\\mathbb{Z}/n'}</M>), 서로소인 나머지의 곱셈(<M>{'(\\mathbb{Z}/n)^{\\times}'}</M>)이 모두 군이고, 곱의 순서가 중요할 수도 있습니다. 역원이 있으므로 곱셈표의 모든 행과 열에는 원소가 한 번씩만 나옵니다. 한 원소를 거듭 곱해 항등원으로 돌아오기까지의 횟수가 위수이고, 한 원소의 거듭제곱이 군 전체를 덮으면 순환군입니다.
      </Callout>
      <Quiz
        q="ℤ/12(12로 나눈 나머지의 덧셈)에서 생성원이 아닌 것은?"
        options={['5', '7', '9', '11']}
        answer={2}
        explain={<>9를 거듭 더하면 0, 9, 6, 3을 지나 네 번 만에 0으로 돌아옵니다. 위수가 12 / gcd(9, 12) = 12 / 3 = 4이므로 군 전체를 덮지 못합니다. 5, 7, 11은 모두 12와 서로소라서 위수가 12인 생성원입니다.</>}
      />
    </>
  );
}

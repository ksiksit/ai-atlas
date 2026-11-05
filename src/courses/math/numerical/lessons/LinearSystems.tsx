import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { factorOps, hilbertTable, itersTo, iterate, luFactor, luSolve, poisson, randomMatrix, solveOps, tinyExact, tinyPivot, twoLines, type Iter, type Mat } from './linalg';
import './numerical.css';
import './linsolve.css';

const fmtInt = (v: number) => Math.round(v).toLocaleString('ko-KR');
const sci = (v: number, d = 1) => {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return `${m.toFixed(d)}×10${String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c])}`;
};
/** A double printed with enough digits to show the damage, minus sign as a real minus. */
const full = (v: number) => (Number.isInteger(v) ? String(v) : v.toPrecision(16).replace(/0+$/, '').replace(/\.$/, '')).replace('-', '−');

/* ─────────────── Figure 1: factor once, solve many times ─────────────── */

const EXAMPLE: Mat = [
  [2, 1, 1, 0],
  [4, 3, 3, 1],
  [8, 7, 9, 5],
  [6, 7, 9, 8],
];

function MatBox({ m, label, mult }: { m: Mat; label: string; mult?: boolean }) {
  return (
    <div>
      <div className="lu-mat" style={{ gridTemplateColumns: `repeat(${m.length}, auto)` }} role="table" aria-label={label}>
        {m.flatMap((row, i) =>
          row.map((v, j) => (
            <span key={`${i}-${j}`} role="cell" data-mult={mult && j < i ? '' : undefined} data-zero={v === 0 ? '' : undefined}>
              {String(v).replace('-', '−')}
            </span>
          )),
        )}
      </div>
      <span className="lu-mat-label">{label}</span>
    </div>
  );
}

function LuFigure() {
  const f = useMemo(() => luFactor(EXAMPLE, false), []);
  const [n, setN] = useState(100);
  const [k, setK] = useState(20);
  const [timing, setTiming] = useState<{ n: number; k: number; again: number; once: number; err: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const opsAgain = k * (factorOps(n) + solveOps(n));
  const opsOnce = factorOps(n) + k * solveOps(n);

  const measure = () => {
    setBusy(true);
    // let the button show "측정 중" before the work blocks the page
    window.setTimeout(() => {
      const r = rng(n * 1000 + k);
      const A = randomMatrix(n, r);
      const bs = Array.from({ length: k }, () => Array.from({ length: n }, () => r() * 2 - 1));
      const t0 = performance.now();
      const xs1 = bs.map((b) => luSolve(luFactor(A, true), b).x);
      const t1 = performance.now();
      const lu = luFactor(A, true);
      const xs2 = bs.map((b) => luSolve(lu, b).x);
      const t2 = performance.now();
      const err = Math.max(...xs1.map((x, i) => Math.max(...x.map((v, j) => Math.abs(v - xs2[i][j])))));
      setTiming({ n, k, again: t1 - t0, once: t2 - t1, err });
      setBusy(false);
    }, 30);
  };
  const fresh = timing && timing.n === n && timing.k === k;

  return (
    <Figure
      no={1}
      title="한 번 분해하고 여러 번 풀기"
      hint="크기와 우변 개수를 고르고 측정을 누르세요"
      caption={
        <>
          위: 가우스 소거를 하며 쓴 배수를 버리지 않고 L의 대각선 아래에 모으면(파란 칸) A = LU가 됩니다. 이 예에서는 행을 바꿀 필요가 없었습니다. 아래: 무작위 n×n 행렬 하나로 우변 k개를 푸는 두 방법을 이 브라우저에서 실제로 잽니다. 시간은 기기와 그때의 부하에 따라 달라지고, 버튼을 누를 때만 계산합니다. 연산 횟수는 곱하고 빼기 한 쌍을 1로 센 정확한 값입니다.
        </>
      }
    >
      <div className="lu-mats" aria-label="A = LU 예시">
        <MatBox m={EXAMPLE} label="A" />
        <span className="lu-op">=</span>
        <MatBox m={f.L} label="L (배수)" mult />
        <span className="lu-op">×</span>
        <MatBox m={f.U} label="U (소거 결과)" />
      </div>
      <div className="controls row">
        <Seg label="크기 n" value={n} onChange={setN} options={[50, 100, 200].map((v) => ({ value: v, label: String(v) }))} />
        <Slider id="lu-k" label="우변 개수 k" value={k} min={1} max={60} step={1} onChange={setK} />
        <Button primary small onClick={measure} disabled={busy}>
          {busy ? '측정 중…' : '이 브라우저에서 측정'}
        </Button>
      </div>
      <div className="lu-timing">
        <div className="lu-way">
          <strong>매번 소거부터</strong>
          <span className="lu-big">{fmtInt(opsAgain)}회</span>
          <span className="lu-sub">
            k × (분해 {fmtInt(factorOps(n))} + 대입 {fmtInt(solveOps(n))})
          </span>
          <span className="lu-sub">{fresh ? `측정: ${timing!.again.toFixed(1)}ms` : '측정 전'}</span>
        </div>
        <div className="lu-way">
          <strong>LU 한 번, 대입 k번</strong>
          <span className="lu-big">{fmtInt(opsOnce)}회</span>
          <span className="lu-sub">
            분해 {fmtInt(factorOps(n))} + k × 대입 {fmtInt(solveOps(n))}
          </span>
          <span className="lu-sub">{fresh ? `측정: ${timing!.once.toFixed(1)}ms · 두 방법의 답 차이 ${sci(timing!.err)}` : '측정 전'}</span>
        </div>
      </div>
      <div className="na-note" aria-live="polite">
        연산 횟수로는 {(opsAgain / opsOnce).toFixed(1)}배 차이입니다.
        {fresh ? ` 이번 측정에서는 ${(timing!.again / Math.max(0.01, timing!.once)).toFixed(1)}배 빨랐습니다.` : ''}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the tiny pivot ─────────────── */

function PivotFigure() {
  const [e, setE] = useState(-17);
  const eps = 10 ** e;
  const no = tinyPivot(eps, false);
  const yes = tinyPivot(eps, true);
  const ex = tinyExact(eps);
  const relErr = (x: number[]) => Math.max(Math.abs(x[0] - ex[0]), Math.abs(x[1] - ex[1])) / Math.max(Math.abs(ex[0]), Math.abs(ex[1]));
  const bad = relErr(no.x) > 1e-6;
  return (
    <Figure
      no={2}
      title="0에 가까운 피벗으로 나누면"
      hint="ε을 줄여 보세요"
      caption={
        <>
          <M>{'\\begin{bmatrix}\\varepsilon & 1\\\\ 1 & 1\\end{bmatrix}x = \\begin{bmatrix}1\\\\2\\end{bmatrix}'}</M>을 배정밀도로 풉니다. 참값은 ε이 작을 때 거의 (1, 1)입니다. 피벗 없이 풀면 첫 행의 ε으로 나누어 배수가 1/ε이 되고, 둘째 행이 그 배수만큼 커져 원래 숫자가 반올림으로 사라집니다. 행을 바꾼 뒤(부분 피벗) 풀면 배수는 ε이 되어 아무것도 커지지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="lu-eps" label="ε = 10의 거듭제곱" value={e} min={-20} max={-1} step={1} onChange={setE} format={(v) => `10^${v}`} />
      </div>
      <div className="tbl-wrap">
        <table className="lu-solve">
          <thead>
            <tr>
              <th>방법</th>
              <th>배수</th>
              <th>x₁</th>
              <th>x₂</th>
            </tr>
          </thead>
          <tbody>
            <tr data-bad={bad || undefined}>
              <td>피벗 없이</td>
              <td className="num">{sci(no.mult, 0)}</td>
              <td className="num">{full(no.x[0])}</td>
              <td className="num">{full(no.x[1])}</td>
            </tr>
            <tr data-good="">
              <td>부분 피벗</td>
              <td className="num">{sci(yes.mult, 0)}</td>
              <td className="num">{full(yes.x[0])}</td>
              <td className="num">{full(yes.x[1])}</td>
            </tr>
            <tr>
              <td>참값</td>
              <td className="num">–</td>
              <td className="num">{full(ex[0])}</td>
              <td className="num">{full(ex[1])}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="na-note" data-bad={bad || undefined} aria-live="polite">
        {bad
          ? `피벗 없이 푼 x₁의 상대 오차는 ${(relErr(no.x) * 100).toFixed(relErr(no.x) > 0.1 ? 0 : 3)}%입니다. 둘째 행에서 1 − 1/ε을 계산하는 순간 1이 반올림으로 사라졌습니다.`
          : `피벗 없이도 상대 오차가 ${sci(relErr(no.x))}로 작습니다. ε을 더 줄여 보세요.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: two nearly parallel lines ─────────────── */

function LinesFigure() {
  const P = usePalette();
  const [theta, setTheta] = useState(10);
  const [delta, setDelta] = useState(0.01);
  const base = twoLines(theta, 0);
  const moved = twoLines(theta, delta);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 2, yMin: 0, yMax: 2, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      pl.grid({ xStep: 0.5, yStep: 0.5 });
      const line = (a: number[], c: number, color: string, width: number, dash?: number[]) => {
        // a·x = c, drawn across the view
        const [p, q] = a;
        if (Math.abs(q) > Math.abs(p)) pl.line(pl.xMin - 5, (c - p * (pl.xMin - 5)) / q, pl.xMax + 5, (c - p * (pl.xMax + 5)) / q, color, width, dash);
        else pl.line((c - q * (pl.yMin - 5)) / p, pl.yMin - 5, (c - q * (pl.yMax + 5)) / p, pl.yMax + 5, color, width, dash);
      };
      const A = base.A;
      line(A[0], A[0][0] + A[0][1], P.ink, 2);
      line(A[1], A[1][0] + A[1][1], P.accent, 2);
      line(A[1], A[1][0] + A[1][1] + delta, P.accent, 2, [6, 4]);
      pl.dot(1, 1, 5, P.ink2, P.surface);
      const [x, y] = moved.x;
      if (Math.abs(x) < 50 && Math.abs(y) < 50) {
        pl.arrow(1, 1, x, y, P.bad, 2.5, 7);
        pl.dot(x, y, 5, P.bad, P.surface);
      }
    },
    [P, theta, delta],
    { aspect: 1.2, maxHeight: 380 },
  );

  return (
    <Figure
      no={3}
      title="거의 평행한 두 직선"
      hint="두 직선 사이의 각을 좁혀 보세요"
      caption={
        <>
          두 방정식은 각각 직선이고, 해는 두 직선이 만나는 점 (1, 1)입니다. 파란 직선의 오른쪽 변을 δ만큼 바꾸면 파란 직선이 점선으로 평행 이동하고, 해는 빨간 화살표만큼 옮겨 갑니다. 두 직선이 이루는 각이 작을수록 같은 δ에 해가 더 멀리 달아나고, 그 비율을 재는 수가 조건수 κ입니다(여기서는 무한 노름).
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`두 직선이 ${theta}도 각도로 (1, 1)에서 만납니다. 둘째 방정식의 오른쪽 변을 ${delta}만큼 바꾸면 해가 ${moved.moved.toFixed(3)}만큼 움직입니다. 조건수는 ${base.kappa.toFixed(1)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="lu-theta" label="두 직선 사이의 각" value={theta} min={0.1} max={90} step={0.1} onChange={setTheta} format={(v) => `${v.toFixed(1)}°`} />
          <Slider id="lu-delta" label="오른쪽 변의 변화 δ" value={delta} min={0} max={0.05} step={0.001} onChange={setDelta} format={(v) => v.toFixed(3)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="조건수 κ∞" value={base.kappa < 1e4 ? base.kappa.toFixed(1) : sci(base.kappa)} />
            <Readout label="해가 움직인 거리" value={moved.moved.toFixed(4)} color={moved.moved > 0.2 ? 'var(--bad)' : undefined} />
          </div>
          <Legend
            items={[
              { color: 'var(--ink)', label: '첫째 방정식', shape: 'ln' },
              { color: 'var(--accent)', label: '둘째 방정식', shape: 'ln' },
              { color: 'var(--bad)', label: '해의 이동', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: iterative methods ─────────────── */

const ITER_KO: Record<Iter, string> = { jacobi: '야코비', gs: '가우스-자이델', cg: '켤레 기울기' };

function IterFigure() {
  const P = usePalette();
  const [n, setN] = useState(30);
  const runs = useMemo(() => {
    const { A, b } = poisson(n);
    return (['jacobi', 'gs', 'cg'] as Iter[]).map((m) => ({ m, hist: iterate(A, b, m, 20000, 1e-10) }));
  }, [n]);
  const colors: Record<Iter, string> = { jacobi: P.ink3, gs: P.accent, cg: P.good };
  const maxIt = Math.max(...runs.map((r) => r.hist.length - 1));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 44, r: 12, t: 12, b: 30 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const lx = Math.log10(maxIt + 1);
      const X = (k: number) => pad.l + (Math.log10(k + 1) / lx) * pw;
      const Y = (r: number) => pad.t + ((1 - Math.log10(Math.min(10, Math.max(r, 1e-11)))) / 12) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let e = 0; e >= -10; e -= 2) {
        if (e === 0) {
          const y0 = Math.round(Y(10)) + 0.5;
          ctx.fillText('10', pad.l - 5, y0);
        }
        const y = Math.round(Y(10 ** e)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + pw, y);
        ctx.stroke();
        ctx.fillText(e === 0 ? '1' : `1e${e}`, pad.l - 5, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const k of [1, 10, 100, 1000, 10000]) {
        if (k > maxIt) break;
        const x = Math.round(X(k)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ph);
        ctx.stroke();
        ctx.fillText(k >= 1000 ? `${k / 1000}천` : String(k), x, pad.t + ph + 6);
      }
      // the 1e-6 target
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = alpha(P.bad, 0.7);
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(1e-6));
      ctx.lineTo(pad.l + pw, Y(1e-6));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const { m, hist } of runs) {
        ctx.strokeStyle = colors[m];
        ctx.lineWidth = m === 'cg' ? 2.5 : 2;
        ctx.beginPath();
        hist.forEach((r, k) => (k ? ctx.lineTo(X(k), Y(r)) : ctx.moveTo(X(k), Y(r))));
        ctx.stroke();
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('반복 횟수 (로그 눈금)', pad.l + pw, pad.t + ph - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('상대 잔차', pad.l + 6, pad.t + 4);
    },
    [P, runs, maxIt],
    { aspect: 1.7, maxHeight: 320 },
  );

  const its = runs.map((r) => ({ m: r.m, k: itersTo(r.hist, 1e-6) }));
  return (
    <Figure
      no={4}
      title="반복법: 조금씩 고쳐 가며 풀기"
      hint="격자 크기 n을 바꿔 보세요"
      caption={
        <>
          막대의 온도처럼 양 끝이 0인 1차원 문제 <M>{"u'' = -1"}</M>을 점 n개로 나누면, 각 행에 −1, 2, −1만 있는 n×n 연립방정식이 됩니다. 0에서 시작해 반복할 때마다 잔차 <M>{'\\|b - Ax\\|/\\|b\\|'}</M>가 얼마나 줄어드는지 로그 눈금으로 그렸습니다. 빨간 점선이 <M>{'10^{-6}'}</M>입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="격자 점 n" value={n} onChange={setN} options={[10, 30, 60].map((v) => ({ value: v, label: String(v) }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = ${n}일 때 잔차가 10⁻⁶ 아래로 내려가기까지 ${its.map((r) => `${ITER_KO[r.m]} ${r.k ?? '도달 못 함'}번`).join(', ')}이 걸립니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {its.map((r) => (
          <Readout key={r.m} label={`${ITER_KO[r.m]} (10⁻⁶까지)`} value={r.k === null ? '–' : `${fmtInt(r.k)}번`} color={r.m === 'cg' ? 'var(--good)' : undefined} />
        ))}
      </div>
      <Legend items={(['jacobi', 'gs', 'cg'] as Iter[]).map((m) => ({ color: colors[m], label: ITER_KO[m], shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LinearSystems() {
  const hil = useMemo(() => hilbertTable([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), []);
  return (
    <>
      <h2>소거를 다시 보면 분해입니다</h2>
      <p>
        연립방정식 <M>{'Ax = b'}</M>를 푸는 가우스 소거는 <a href={lessonHref('math-linear-algebra', 'elimination')}>선형대수</a>에서 한 단계씩 따라가 보았습니다. 이 장에서는 같은 알고리즘을 계산하는 사람의 눈으로 다시 봅니다. 얼마나 많은 연산이 드는지, 반올림 오차가 어디서 자라는지, 그리고 답을 얼마나 믿을 수 있는지입니다.
      </p>
      <p>
        소거하면서 "둘째 행에서 첫 행의 2배를 뺀다" 할 때의 2 같은 <T en="multiplier">배수</T>를 버리지 않고 모아 두면, 행렬은 대각선이 1인 아래삼각행렬 L과 위삼각행렬 U의 곱으로 쪼개집니다. 이것이 <T en="LU factorization">LU 분해</T>입니다.
      </p>
      <MB note="P는 피벗 때문에 바꾼 행의 순서. 바꾸지 않았다면 P = I입니다.">{'PA = LU, \\qquad Ax = b \\;\\Longleftrightarrow\\; Ly = Pb,\\; Ux = y'}</MB>
      <p>
        삼각행렬로 된 방정식은 위에서 아래로(L), 아래에서 위로(U) 하나씩 대입하면 풀립니다. 분해에는 n×n 행렬에서 곱하고 빼기가 약 <M>{'n^3/3'}</M>번, 대입 두 번에는 약 <M>{'n^2'}</M>번 듭니다. n = 100이면 분해가 328,350번, 대입이 9,900번입니다. 그래서 행렬은 같고 오른쪽 변만 바뀌는 문제(같은 구조물에 하중만 바꿔 가며 계산하기, 같은 회로에 입력만 바꾸기)에서는 분해를 한 번만 하고 대입만 되풀이합니다.
      </p>
      <LuFigure />
      <p>
        n = 100, 우변 20개라면 매번 소거부터 하는 쪽은 6,765,000번, 한 번 분해하는 쪽은 526,350번을 계산해 12.9배 차이가 납니다. n을 200으로 늘리면 분해 비용이 8배(2,646,700번)로 뛰는데 대입은 4배만 늘기 때문에 차이가 더 벌어집니다. 실제 시간은 기기마다 다르지만, 측정해 보면 대체로 연산 횟수의 비율을 따라갑니다.
      </p>
      <Callout kind="note">
        역행렬 <M>{'A^{-1}'}</M>를 구해 두고 곱하는 방법도 있지만, 수치해석에서는 거의 쓰지 않습니다. 역행렬을 구하는 데 LU 분해의 약 세 배가 들고, 반올림 오차도 더 큽니다. 라이브러리의 <code>solve(A, b)</code>는 모두 내부에서 LU 분해(또는 그 친척)를 씁니다.
      </Callout>

      <h2>작은 피벗이 답을 망가뜨린다</h2>
      <p>
        정확한 산술이라면 소거는 피벗(나눌 대각 원소)이 0만 아니면 됩니다. 하지만 컴퓨터의 수는 유효숫자가 약 16자리뿐이라, 0이 아니어도 아주 작은 피벗으로 나누면 문제가 생깁니다. 그림 2에서 ε을 줄여 보세요.
      </p>
      <PivotFigure />
      <p>
        ε = <M>{'10^{-17}'}</M>에서 피벗 없이 풀면 <M>{'x_1 = 0'}</M>이 나옵니다. 참값은 거의 1이니 답이 완전히 틀렸습니다. 배수가 <M>{'10^{17}'}</M>이 되어 둘째 행의 1 − <M>{'10^{17}'}</M>을 계산하는 순간 1이 반올림으로 사라지고, 그 손실이 대입을 거쳐 x₁로 옮겨 갑니다. ε = <M>{'10^{-8}'}</M>만 되어도 x₁이 소수 아홉째 자리부터 틀립니다. 반면 각 열에서 절댓값이 가장 큰 원소가 피벗이 되도록 행을 바꾸는 <T en="partial pivoting">부분 피벗</T>을 쓰면 배수의 크기가 언제나 1 이하라서 어떤 ε에서도 정답이 나옵니다.
      </p>
      <Callout kind="key" label="안정한 알고리즘">
        문제 자체는 멀쩡한데(이 행렬의 조건수는 약 4로 작습니다) 푸는 방법 때문에 답이 망가졌습니다. 이런 알고리즘을 <T en="unstable">불안정</T>하다고 합니다. 부분 피벗을 쓴 가우스 소거는 실제로 쓰는 거의 모든 행렬에서 안정하고, 그래서 모든 선형대수 라이브러리의 기본값입니다.
      </Callout>

      <h2>문제 자체가 예민할 때: 조건수</h2>
      <p>
        이번에는 반대의 경우입니다. 알고리즘은 안정한데 문제 자체가 예민해서, 입력이 조금만 흔들려도 답이 크게 흔들리는 경우입니다. 실제 데이터의 오른쪽 변 b에는 측정 오차가 섞여 있으니, 이 예민함은 피할 수 없습니다.
      </p>
      <LinesFigure />
      <p>
        두 직선이 직각(90°)으로 만나면 δ = 0.01의 변화에 해도 0.01만 움직입니다. 각을 10°로 좁히면 0.058, 1°면 0.57, 0.1°면 5.7만큼 움직입니다. 이 증폭률을 재는 것이 <T en="condition number">조건수</T>입니다.
      </p>
      <MB note="상대 오차의 증폭률. 어떤 행렬 노름을 쓰든 같은 모양입니다.">{'\\kappa(A) = \\|A\\|\\,\\|A^{-1}\\|, \\qquad \\frac{\\|\\delta x\\|}{\\|x\\|} \\le \\kappa(A)\\, \\frac{\\|\\delta b\\|}{\\|b\\|}'}</MB>
      <p>
        이유는 짧습니다. <M>{'A(x + \\delta x) = b + \\delta b'}</M>에서 <M>{'\\delta x = A^{-1}\\delta b'}</M>이므로 <M>{'\\|\\delta x\\| \\le \\|A^{-1}\\|\\|\\delta b\\|'}</M>이고, <M>{'\\|b\\| = \\|Ax\\| \\le \\|A\\|\\|x\\|'}</M>입니다. 두 부등식을 나누면 위 식이 나옵니다. 배정밀도의 반올림 오차는 약 <M>{'10^{-16}'}</M>이니, 어림하면 <strong>조건수가 <M>{'10^k'}</M>일 때 답의 유효숫자 약 k자리를 잃습니다</strong>.
      </p>
      <p>
        조건이 나쁜 행렬의 대표가 <T en="Hilbert matrix">힐베르트 행렬</T> <M>{'H_{ij} = 1/(i+j-1)'}</M>입니다. 다항식으로 데이터를 근사할 때 자연스럽게 나타나는 행렬입니다. 참값 x가 모두 1이 되도록 b = H·(1, …, 1)을 만들고, 부분 피벗을 쓴 소거로 풀어 보았습니다. 조건수는 역행렬의 정확한 공식으로 계산했습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>n</th>
              <th>조건수 κ∞</th>
              <th>답의 상대 오차</th>
              <th>맞는 자릿수</th>
            </tr>
          </thead>
          <tbody>
            {hil.map((r) => (
              <tr key={r.n}>
                <td className="mono">{r.n}</td>
                <td className="mono">{sci(r.kappa)}</td>
                <td className="mono">{sci(r.relErr)}</td>
                <td className="mono">{Math.max(0, r.digits).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        조건수는 n이 하나 늘 때마다 약 30배씩 커집니다. n = 6에서 이미 2.9×10⁷이라 맞는 자릿수가 9.3자리로 줄고, n = 10에서는 3.5자리, n = 12에서는 조건수가 4.1×10¹⁶으로 배정밀도의 한계를 넘어 0.4자리, 사실상 하나도 맞지 않습니다. 알고리즘은 잘못한 것이 없습니다. 이런 문제는 더 좋은 알고리즘이 아니라 <strong>문제를 바꿔야</strong> 합니다. 다항식 근사라면 직교 다항식이나 다른 기저를 쓰는 식입니다.
      </p>

      <h2>큰 문제는 반복해서 풉니다</h2>
      <p>
        유체, 열, 구조물을 컴퓨터로 계산하면 미지수가 수백만 개인 연립방정식이 나옵니다. n = 10⁶이면 LU 분해에 <M>{'n^3/3 \\approx 3 \\times 10^{17}'}</M>번의 연산이 필요해 현실적이지 않습니다. 다행히 이런 행렬은 대부분의 원소가 0인 <T en="sparse">희소 행렬</T>이라, 행렬을 곱하는 데는 원소 수만큼만 듭니다. 그래서 대충 짐작한 답에서 시작해 행렬 곱만으로 조금씩 고쳐 가는 <T en="iterative method">반복법</T>을 씁니다.
      </p>
      <ul>
        <li>
          <T en="Jacobi">야코비</T> 방법: 각 미지수를 "자기 행의 나머지 항을 지난번 값으로 둘 때" 맞는 값으로 한꺼번에 바꿉니다.
        </li>
        <li>
          <T en="Gauss–Seidel">가우스-자이델</T> 방법: 같은 일을 하되, 방금 고친 값을 바로 다음 계산에 씁니다.
        </li>
        <li>
          <T en="conjugate gradient">켤레 기울기</T> 방법: 대칭 양의 정부호 행렬에서, 지난 방향들과 서로 겹치지 않는 방향으로만 나아가 이론상 n번 안에 끝납니다.
        </li>
      </ul>
      <IterFigure />
      <p>
        n = 30이면 야코비가 2,733번, 가우스-자이델이 1,368번 반복해야 잔차가 <M>{'10^{-6}'}</M> 아래로 내려가고, 켤레 기울기는 15번이면 됩니다(이 문제는 좌우 대칭이라 n번보다도 빨리 끝납니다). 야코비가 느린 이유는 한 번 반복할 때 오차가 <M>{'\\cos(\\pi/(n+1))'}</M>배, n = 30에서 0.9949배밖에 줄지 않기 때문입니다. n을 60으로 늘리면 야코비는 10,595번으로 약 4배 늘지만 켤레 기울기는 30번으로 2배만 늘어납니다. 실제 계산에서는 켤레 기울기에 행렬의 조건을 미리 고쳐 주는 <T en="preconditioning">전처리</T>를 더해 씁니다.
      </p>

      <Callout kind="key">
        가우스 소거는 LU 분해로 정리하면 분해 한 번(<M>{'n^3/3'}</M>)에 우변마다 대입(<M>{'n^2'}</M>)으로 나뉘어, 같은 행렬로 여러 번 풀 때 빨라집니다. 작은 피벗으로 나누면 반올림이 커져 답이 망가지므로 부분 피벗으로 행을 바꿉니다. 알고리즘이 안정해도 조건수 κ가 크면 답의 유효숫자를 약 <M>{'\\log_{10}\\kappa'}</M>자리 잃고, 이것은 문제의 성질입니다. 크고 희소한 문제는 행렬 곱만 쓰는 반복법으로 풀고, 켤레 기울기가 야코비나 가우스-자이델보다 훨씬 빠릅니다.
      </Callout>
      <Quiz
        q="조건수가 약 10¹⁰인 행렬로 Ax = b를 배정밀도(유효숫자 약 16자리)에서, 부분 피벗을 쓴 안정한 방법으로 풀었다. 답 x를 몇 자리쯤 믿을 수 있을까?"
        options={['16자리 모두. 안정한 알고리즘을 썼으니까', '약 6자리', '약 10자리', '하나도 믿을 수 없다']}
        answer={1}
        explain={<>안정한 알고리즘은 반올림 오차를 크게 키우지 않을 뿐, 문제 자체의 예민함은 없애지 못합니다. 입력에 이미 있는 약 10⁻¹⁶의 상대 오차가 조건수만큼, 최대 10¹⁰배 증폭되므로 상대 오차는 약 10⁻⁶, 믿을 수 있는 자리는 16 − 10 = 6자리쯤입니다. 표에서 힐베르트 행렬 n = 8(조건수 3.4×10¹⁰)의 맞는 자릿수가 6.4자리였던 것과 같습니다.</>}
      />
    </>
  );
}

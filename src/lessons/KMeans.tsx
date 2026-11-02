import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Slider, T } from '../components/ui';
import { useCanvas2D, useDrag, useInView } from '../lib/canvas';
import { Plot, fmt } from '../lib/plot';
import { alpha, parseColor, usePalette, type Palette } from '../lib/theme';
import { gauss, rng } from '../lib/math';

interface P2 {
  x: number;
  y: number;
}

const clusterColors = (P: Palette) => [P.neg, P.pos, P.ml, P.dl, P.hl, P.ink2];

function blobs(centers: P2[], per: number, sigma: number, seed: number): P2[] {
  const r = rng(seed);
  const out: P2[] = [];
  for (const c of centers) for (let i = 0; i < per; i++) out.push({ x: c.x + gauss(r) * sigma, y: c.y + gauss(r) * sigma });
  return out;
}

const d2 = (a: P2, b: P2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const nearest = (p: P2, cs: P2[]) => {
  let bi = 0;
  let bd = Infinity;
  cs.forEach((c, i) => {
    const d = d2(p, c);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
};

/** Full k-means with k-means++ init; used for the elbow chart. */
function kmeans(pts: P2[], K: number, seed: number) {
  const r = rng(seed);
  const cs: P2[] = [pts[Math.floor(r() * pts.length)]];
  while (cs.length < K) {
    const ds = pts.map((p) => Math.min(...cs.map((c) => d2(p, c))));
    const tot = ds.reduce((a, b) => a + b, 0);
    let t = r() * tot;
    let idx = 0;
    while (idx < pts.length - 1 && t > ds[idx]) t -= ds[idx++];
    cs.push({ ...pts[idx] });
  }
  let assign = pts.map((p) => nearest(p, cs));
  for (let it = 0; it < 40; it++) {
    for (let k = 0; k < K; k++) {
      const m = pts.filter((_, i) => assign[i] === k);
      if (m.length) cs[k] = { x: m.reduce((a, p) => a + p.x, 0) / m.length, y: m.reduce((a, p) => a + p.y, 0) / m.length };
    }
    const na = pts.map((p) => nearest(p, cs));
    if (na.every((a, i) => a === assign[i])) break;
    assign = na;
  }
  const inertia = pts.reduce((a, p, i) => a + d2(p, cs[assign[i]]), 0);
  return { cs, assign, inertia };
}

/* ─────────────── Figure 1: step-by-step k-means ─────────────── */

const BASE_POINTS = blobs(
  [
    { x: -0.62, y: 0.5 },
    { x: 0.5, y: 0.62 },
    { x: -0.15, y: -0.6 },
    { x: 0.72, y: -0.25 },
  ],
  32,
  0.17,
  3,
);

interface Cent extends P2 {
  trail: P2[];
}

function StepFigure() {
  const P = usePalette();
  const [pts, setPts] = useState<P2[]>(BASE_POINTS);
  const [assign, setAssign] = useState<number[]>(() => BASE_POINTS.map(() => -1));
  const [K, setK] = useState(4);
  const [seed, setSeed] = useState(5);
  const [cents, setCents] = useState<Cent[]>([]);
  const [phase, setPhase] = useState<'assign' | 'update'>('assign');
  const [iter, setIter] = useState(0);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const plotRef = useRef<Plot | null>(null);

  const init = (k = K, s = seed, p = pts) => {
    const r = rng(s * 131 + 7);
    const idx = new Set<number>();
    while (idx.size < Math.min(k, p.length)) idx.add(Math.floor(r() * p.length));
    setCents([...idx].map((i) => ({ x: p[i].x, y: p[i].y, trail: [{ x: p[i].x, y: p[i].y }] })));
    setAssign(p.map(() => -1));
    setPhase('assign');
    setIter(0);
    setDone(false);
  };
  useEffect(() => init(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const step = () => {
    if (done || !cents.length) return;
    if (phase === 'assign') {
      const na = pts.map((p) => nearest(p, cents));
      const same = na.every((a, i) => a === assign[i]);
      setAssign(na);
      if (same && iter > 0) {
        setDone(true);
        setRunning(false);
      } else setPhase('update');
    } else {
      setCents(
        cents.map((c, k) => {
          const m = pts.filter((_, i) => assign[i] === k);
          if (!m.length) return c;
          const nx = m.reduce((a, p) => a + p.x, 0) / m.length;
          const ny = m.reduce((a, p) => a + p.y, 0) / m.length;
          return { x: nx, y: ny, trail: [...c.trail, { x: nx, y: ny }] };
        }),
      );
      setPhase('assign');
      setIter((i) => i + 1);
    }
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.3, xMax: 1.3, yMin: -1.2, yMax: 1.2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plotRef.current = plot;
      const cols = clusterColors(P);
      if (cents.length) {
        const rgb = cols.map((c) => parseColor(c));
        plot.heatmap((x, y) => {
          const k = nearest({ x, y }, cents);
          const c = rgb[k % rgb.length];
          return [c[0], c[1], c[2], 34];
        }, 4);
      }
      plot.grid({ xStep: 0.5, yStep: 0.5, labels: false, axes: false });
      // lines from point to its centroid during assignment view
      if (phase === 'update' && !done) {
        pts.forEach((p, i) => {
          const a = assign[i];
          if (a >= 0 && cents[a]) plot.line(p.x, p.y, cents[a].x, cents[a].y, alpha(cols[a % cols.length], 0.35), 1);
        });
      }
      pts.forEach((p, i) => {
        const a = assign[i];
        plot.dot(p.x, p.y, 4.5, a >= 0 ? cols[a % cols.length] : P.ink3, P.surface, 1);
      });
      cents.forEach((c, k) => {
        const col = cols[k % cols.length];
        if (c.trail.length > 1) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          c.trail.forEach((t, i) => (i ? ctx.lineTo(plot.X(t.x), plot.Y(t.y)) : ctx.moveTo(plot.X(t.x), plot.Y(t.y))));
          ctx.stroke();
          ctx.restore();
          c.trail.slice(0, -1).forEach((t) => plot.dot(t.x, t.y, 2.5, P.ink));
        }
        const X = plot.X(c.x);
        const Y = plot.Y(c.y);
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = col;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.rect(-8, -8, 16, 16);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    },
    [P, pts, assign, cents, phase, done],
    { aspect: 1.35, maxHeight: 460, minHeight: 280 },
  );

  const visible = useInView(wrapRef as unknown as RefObject<HTMLElement>);
  useEffect(() => {
    if (!running || !visible) return;
    const id = window.setInterval(() => stepRef.current(), 550);
    return () => window.clearInterval(id);
  }, [running, visible]);

  useDrag(canvasRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (x, y) => {
      const p = plotRef.current;
      if (!p) return;
      const np = { x: p.invX(x), y: p.invY(y) };
      setPts((s) => [...s, np]);
      setAssign((a) => [...a, -1]);
      setDone(false);
      setPhase('assign');
    },
  });

  const inertia = cents.length ? pts.reduce((a, p, i) => a + d2(p, cents[assign[i] >= 0 ? assign[i] : nearest(p, cents)]), 0) : 0;
  const status = done ? '수렴 완료: 배정이 더 이상 바뀌지 않음' : phase === 'assign' ? '다음 단계: ① 배정 (각 점을 가장 가까운 중심에)' : '다음 단계: ② 갱신 (중심을 소속 점들의 평균으로)';

  return (
    <Figure no={1} title="K-평균을 한 단계씩 실행하기" hint="빈 곳을 누르면 점이 추가됩니다" caption={<>마름모가 군집의 중심이고 점선은 중심이 지나온 길입니다. 배경색은 각 중심이 차지하는 영역(가장 가까운 중심이 같은 곳)입니다. 여러 번 "다른 시작점"을 눌러 보면 시작 위치에 따라 결과가 달라지는 경우가 있습니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button primary onClick={step} disabled={done || running}>
              한 단계
            </Button>
            <Button onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '❚❚ 멈춤' : '▶ 자동 실행'}
            </Button>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: done ? 'var(--good)' : 'var(--ink-2)', fontWeight: 600, minHeight: '3em' }}>{status}</div>
          <Slider
            id="km-k"
            label="군집 개수 K"
            value={K}
            min={1}
            max={6}
            step={1}
            onChange={(v) => {
              setK(v);
              setRunning(false);
              init(v);
            }}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="반복 횟수" value={iter} />
            <Readout label="관성 (거리² 합)" value={fmt(inertia, 2)} />
          </div>
          <div className="btn-row">
            <Button
              small
              onClick={() => {
                setRunning(false);
                setSeed((s) => s + 1);
                init(K, seed + 1);
              }}
            >
              다른 시작점
            </Button>
            <Button
              small
              onClick={() => {
                setRunning(false);
                setPts(BASE_POINTS);
                init(K, seed, BASE_POINTS);
              }}
            >
              데이터 되돌리기
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the elbow method ─────────────── */

const CENTER_POOL: P2[] = [
  { x: -0.65, y: 0.55 },
  { x: 0.6, y: -0.55 },
  { x: 0.55, y: 0.6 },
  { x: -0.6, y: -0.55 },
  { x: 0.0, y: 0.0 },
];

function ElbowFigure() {
  const P = usePalette();
  const [trueK, setTrueK] = useState(3);
  const [K, setK] = useState(3);
  const pts = useMemo(() => blobs(CENTER_POOL.slice(0, trueK), Math.round(150 / trueK), 0.16, 40 + trueK), [trueK]);
  const runs = useMemo(() => {
    const out: ReturnType<typeof kmeans>[] = [];
    for (let k = 1; k <= 8; k++) {
      let best: ReturnType<typeof kmeans> | null = null;
      for (let s = 0; s < 6; s++) {
        const r = kmeans(pts, k, s * 17 + k);
        if (!best || r.inertia < best.inertia) best = r;
      }
      out.push(best!);
    }
    return out;
  }, [pts]);
  const cur = runs[K - 1];

  const scatter = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.2, xMax: 1.2, yMin: -1.15, yMax: 1.15, equal: true, pad: { l: 6, r: 6, t: 6, b: 6 } });
      plot.grid({ xStep: 0.5, yStep: 0.5, labels: false, axes: false });
      const cols = clusterColors(P);
      const all = [...cols, P.math, P.bad];
      pts.forEach((p, i) => plot.dot(p.x, p.y, 4, all[cur.assign[i] % all.length], P.surface, 1));
      cur.cs.forEach((c, k) => {
        ctx.save();
        ctx.translate(plot.X(c.x), plot.Y(c.y));
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = all[k % all.length];
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      });
    },
    [P, pts, cur],
    { aspect: 1.15, maxHeight: 320, minHeight: 220 },
  );

  const elbow = useCanvas2D(
    (ctx, { w, h }) => {
      const maxI = runs[0].inertia * 1.08;
      const plot = new Plot(ctx, w, h, P, { xMin: 0.5, xMax: 8.5, yMin: 0, yMax: maxI, pad: { l: 44, r: 12, t: 14, b: 32 } });
      plot.grid({ xStep: 1, axes: false, xLabel: 'K', yLabel: '관성' });
      plot.line(trueK, 0, trueK, maxI, alpha(P.good, 0.3), 10);
      ctx.save();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      runs.forEach((r, i) => (i ? ctx.lineTo(plot.X(i + 1), plot.Y(r.inertia)) : ctx.moveTo(plot.X(i + 1), plot.Y(r.inertia))));
      ctx.stroke();
      ctx.restore();
      runs.forEach((r, i) => plot.dot(i + 1, r.inertia, i + 1 === K ? 7 : 4, i + 1 === K ? P.surface : P.accent, i + 1 === K ? P.ink : undefined, 2.5));
      plot.text('팔꿈치', trueK, runs[trueK - 1].inertia, P.good, { dx: 10, dy: -14, font: `700 12px ${P.fontBody}` });
    },
    [P, runs, K, trueK],
    { aspect: 1.15, maxHeight: 320, minHeight: 220 },
  );

  return (
    <Figure no={2} title="팔꿈치 방법으로 K 고르기" hint="K를 바꿔 보세요" caption={<>K를 늘리면 관성(각 점과 소속 중심 사이 거리 제곱의 합)은 무조건 줄어듭니다. 점 하나마다 중심을 하나씩 주면 0이 되니까요. 그래서 가장 작은 값이 아니라, 줄어드는 속도가 갑자기 꺾이는 "팔꿈치"를 찾습니다. 초록 띠가 데이터를 만들 때 쓴 실제 덩어리 수입니다.</>}>
      <div className="fig-cols">
        <div ref={scatter.wrapRef} className="canvas-box">
          <canvas ref={scatter.canvasRef} />
        </div>
        <div ref={elbow.wrapRef} className="canvas-box">
          <canvas ref={elbow.canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="el-true" label="데이터의 실제 덩어리 수" value={trueK} min={2} max={5} step={1} onChange={setTrueK} color="var(--good)" />
        <Slider id="el-k" label="K-평균의 K" value={K} min={1} max={8} step={1} onChange={setK} />
        <div className="readouts" style={{ flex: '1 1 160px' }}>
          <Readout label={`K = ${K}일 때 관성`} value={fmt(cur.inertia, 2)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function KMeans() {
  return (
    <>
      <h2>정답이 없는 데이터</h2>
      <p>
        지금까지 본 모델들은 모두 정답이 붙은 데이터로 배웠습니다. 집값이 얼마였는지, 이 메일이 스팸이었는지를 알려 주고 그것을 맞히도록 학습시켰죠. 이런 방식을 <T en="supervised learning">지도학습</T>이라고 합니다.
      </p>
      <p>
        하지만 정답을 다는 일은 비싸고, 세상의 데이터 대부분에는 정답이 없습니다. 쇼핑몰의 고객 100만 명의 구매 기록이 있다고 해 봅시다. 누가 어떤 유형의 고객인지 아무도 적어 두지 않았습니다. 그래도 비슷하게 행동하는 사람들끼리 묶어 볼 수는 있습니다. 이처럼 정답 없이 데이터 안의 구조를 찾는 방식을 <T en="unsupervised learning">비지도학습</T>이라 하고, 비슷한 것끼리 묶는 작업을 <T en="clustering">군집화</T>라고 합니다.
      </p>

      <h2>K-평균: 두 단계를 반복할 뿐</h2>
      <p>
        <T en="K-means">K-평균</T>은 가장 유명한 군집화 알고리즘입니다. 묶음의 개수 K를 정해 주면, 다음 두 단계를 배정이 더 이상 바뀌지 않을 때까지 되풀이합니다.
      </p>
      <ol>
        <li>
          <strong>배정</strong>: 각 점을 가장 가까운 중심의 군집에 넣습니다.
        </li>
        <li>
          <strong>갱신</strong>: 각 중심을 자기 군집에 속한 점들의 평균 위치로 옮깁니다.
        </li>
      </ol>
      <p>처음 중심은 데이터 중 K개를 무작위로 골라서 정합니다. 아래 그림에서 "한 단계"를 눌러 가며 중심이 어떻게 자리를 찾아가는지 보세요.</p>
      <StepFigure />
      <p>
        K-평균이 줄이려는 값은 각 점과 소속 중심 사이 거리 제곱의 합입니다. 이 값을 <T en="inertia">관성</T>이라 부릅니다. 배정 단계와 갱신 단계는 각각 이 값을 절대 늘리지 않기 때문에, 알고리즘은 반드시 언젠가 멈춥니다.
      </p>
      <MB note="Cₖ는 k번째 군집에 속한 점들의 집합, μₖ는 그 군집의 중심(평균)입니다.">{'J = \\sum_{k=1}^{K} \\sum_{\\mathbf{x} \\in C_k} \\lVert \\mathbf{x} - \\boldsymbol{\\mu}_k \\rVert^2, \\qquad \\boldsymbol{\\mu}_k = \\frac{1}{|C_k|}\\sum_{\\mathbf{x}\\in C_k}\\mathbf{x}'}</MB>
      <Callout kind="warn" label="약점">
        반드시 멈추기는 하지만 가장 좋은 답에서 멈춘다는 보장은 없습니다. 그림 1에서 K = 4로 두고 "다른 시작점"을 여러 번 눌러 보세요. 가끔 두 중심이 한 덩어리를 나눠 갖고, 다른 두 덩어리는 중심 하나를 같이 쓰는 어색한 결과가 나옵니다. 그래서 실제로는 시작점을 바꿔 여러 번 실행한 뒤 관성이 가장 작은 결과를 고르고, 시작점을 서로 멀리 떨어뜨려 뽑는 k-means++ 방법을 씁니다.
      </Callout>

      <h2>K는 몇으로 해야 할까</h2>
      <p>
        K-평균은 K를 스스로 정하지 못합니다. 흔히 쓰는 방법은 K를 1부터 늘려 가며 관성을 그래프로 그려 보는 것입니다. 실제 덩어리 수보다 K가 작을 때는 K를 하나 늘릴 때마다 관성이 크게 줄지만, 실제 수를 넘어서면 이미 잘 묶인 덩어리를 쪼갤 뿐이라 별로 줄지 않습니다. 그래프가 꺾이는 곳이 팔꿈치처럼 보여서 <T en="elbow method">팔꿈치 방법</T>이라고 부릅니다.
      </p>
      <ElbowFigure />
      <p>
        현실의 데이터에서는 팔꿈치가 이렇게 선명하지 않은 경우도 많습니다. 그럴 때는 군집 결과를 사람이 직접 해석해 보고 쓸모 있는 K를 고르기도 합니다. 고객을 3개 그룹으로 나눌지 5개로 나눌지는 결국 마케팅 팀이 몇 가지 전략을 운영할 수 있느냐에 달려 있기도 합니다.
      </p>

      <h2>어디에 쓰이나</h2>
      <ul>
        <li>고객 세분화: 구매 패턴이 비슷한 고객끼리 묶어 맞춤 마케팅을 합니다.</li>
        <li>
          색 줄이기: 이미지의 수많은 색을 K개의 대표 색으로 묶으면 파일 크기를 줄일 수 있습니다. 각 픽셀의 (R, G, B)를 3차원 점으로 보고 K-평균을 돌리면 됩니다.
        </li>
        <li>이상 탐지: 어느 중심에서도 멀리 떨어진 점은 이상한 데이터일 가능성이 큽니다.</li>
      </ul>
      <Callout kind="key">
        비지도학습은 정답 없이 데이터의 모양을 찾습니다. K-평균은 "가장 가까운 중심에 배정"과 "중심을 평균으로 옮기기"를 반복해 관성 <M>{'J'}</M>를 줄이는 단순한 방법이고, 시작점과 K의 선택에 민감하다는 점을 기억해 두세요.
      </Callout>
      <Quiz
        q="K-평균에서 K를 데이터 개수와 같게 하면 관성 J는 어떻게 될까요?"
        options={['0이 된다', '가장 커진다', '변하지 않는다', '음수가 된다']}
        answer={0}
        explain={<>점마다 중심을 하나씩 가지면 모든 점이 자기 중심과 같은 위치에 있으므로 거리가 0입니다. 관성이 가장 작다고 좋은 군집은 아니라는 것, 그래서 팔꿈치를 찾는다는 것을 보여 주는 예입니다.</>}
      />
    </>
  );
}

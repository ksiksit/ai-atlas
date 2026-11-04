import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { Reroll, label, polyline, ticks, useMathColors } from './parts';
import { pct } from './prob';
import './probability.css';

/* ─────────────── shared chain helpers ─────────────── */

type Matrix = number[][];
const step = (pi: number[], T: Matrix) => pi.map((_, j) => pi.reduce((s, p, i) => s + p * T[i][j], 0));
function stationary(T: Matrix, iters = 2000): number[] {
  let pi = T.map(() => 1 / T.length);
  for (let k = 0; k < iters; k++) pi = step(pi, T);
  return pi;
}
function pickFrom(row: number[], u: number): number {
  let acc = 0;
  for (let j = 0; j < row.length; j++) {
    acc += row[j];
    if (u < acc) return j;
  }
  return row.length - 1;
}

/* ─────────────── Figure 1: a weather chain you can edit ─────────────── */

const WX = ['맑음', '흐림', '비'];
const WX_CSS = ['var(--c-math-3)', 'var(--ink-3)', 'var(--c-math-2)'];
const DEFAULT_W: Matrix = [
  [0.7, 0.2, 0.1],
  [0.3, 0.4, 0.3],
  [0.2, 0.4, 0.4],
];
const DAYS = 1000;
const NODE_XY: [number, number][] = [
  [95, 85],
  [245, 85],
  [170, 210],
];

function StateDiagram({ T }: { T: Matrix }) {
  const R = 30;
  const edges: JSX.Element[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const p = T[i][j];
      if (p < 0.005) continue;
      const sw = 1 + 6 * p;
      if (i === j) {
        // self loop drawn outside the triangle
        const [x, y] = NODE_XY[i];
        const cx = 170;
        const cy = 120;
        const dx = x - cx;
        const dy = y - cy;
        const L = Math.hypot(dx, dy);
        const ux = dx / L;
        const uy = dy / L;
        const lx = x + ux * (R + 16);
        const ly = y + uy * (R + 16);
        edges.push(
          <g key={`${i}${j}`} className="pr-edge">
            <circle cx={lx} cy={ly} r={16} style={{ strokeWidth: sw }} />
            <text x={x + ux * (R + 44)} y={y + uy * (R + 44)} dy="0.35em">
              {p.toFixed(2)}
            </text>
          </g>,
        );
        continue;
      }
      const [x1, y1] = NODE_XY[i];
      const [x2, y2] = NODE_XY[j];
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / L;
      const uy = (y2 - y1) / L;
      const nx = -uy;
      const ny = ux;
      const off = 14; // the two directions bend to opposite sides
      const sx = x1 + ux * R + nx * off * 0.6;
      const sy = y1 + uy * R + ny * off * 0.6;
      const ex = x2 - ux * (R + 6) + nx * off * 0.6;
      const ey = y2 - uy * (R + 6) + ny * off * 0.6;
      const mx = (x1 + x2) / 2 + nx * off * 2;
      const my = (y1 + y2) / 2 + ny * off * 2;
      edges.push(
        <g key={`${i}${j}`} className="pr-edge">
          <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} style={{ strokeWidth: sw }} markerEnd="url(#pr-arrow)" />
          <text x={0.49 * sx + 0.42 * mx + 0.09 * ex + nx * 12} y={0.49 * sy + 0.42 * my + 0.09 * ey + ny * 12} dy="0.35em">
            {p.toFixed(2)}
          </text>
        </g>,
      );
    }
  return (
    <svg viewBox="0 0 340 300" className="pr-graph" role="img" aria-label={`날씨 상태 전이도. ${WX.map((a, i) => WX.map((b, j) => `${a}에서 ${b}로 ${T[i][j].toFixed(2)}`).join(', ')).join('. ')}`}>
      <defs>
        <marker id="pr-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="pr-arrowhead" />
        </marker>
      </defs>
      {edges}
      {NODE_XY.map(([x, y], i) => (
        <g key={i} className="pr-node">
          <circle cx={x} cy={y} r={R} style={{ fill: `color-mix(in srgb, ${WX_CSS[i]} 30%, var(--surface))`, stroke: WX_CSS[i] }} />
          <text x={x} y={y} dy="0.35em">
            {WX[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function WeatherFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [W, setW] = useState<Matrix>(DEFAULT_W);
  const [start, setStart] = useState(2);
  const [seed, setSeed] = useState(1);
  const T = W.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return s > 0 ? row.map((x) => x / s) : row.map((_, j) => (j === 0 ? 1 : 0));
  });
  const pi = stationary(T);
  const traj = useMemo(() => {
    const out = [[0, 0, 0]];
    out[0][start] = 1;
    for (let t = 1; t <= 20; t++) out.push(step(out[t - 1], T));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, start]);
  const walk = useMemo(() => {
    const r = rng(seed * 6151 + start);
    const days = [start];
    for (let t = 1; t < DAYS; t++) days.push(pickFrom(T[days[t - 1]], r()));
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, start, seed]);
  const freq = [0, 1, 2].map((s) => walk.filter((d) => d === s).length / DAYS);
  const cols = [c3, P.ink3, c2];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 20, yMin: 0, yMax: 1, pad: { l: 40, r: 50, t: 12, b: 28 } });
      plot.grid({ xStep: 5, yStep: 0.25, xLabel: '날짜 t', fmt: (v) => (v > 0 && v <= 1 ? `${Math.round(v * 100)}%` : String(v)) });
      const xs = traj.map((_, t) => t);
      [0, 1, 2].forEach((s) => {
        plot.line(0, pi[s], 20, pi[s], alpha(cols[s], 0.5), 1, [4, 3]);
        polyline(plot, xs, traj.map((v) => v[s]), cols[s], 2.2);
        traj.forEach((v, t) => t % 2 === 0 && plot.dot(t, v[s], 2.4, cols[s]));
        label(ctx, P, `${WX[s]} ${pct(pi[s], 0)}`, plot.X(20) + 4, plot.Y(pi[s]) + (s === 1 ? 0 : s === 0 ? -6 : 6), cols[s], 'left', 'middle', 10, 600);
      });
    },
    [P, traj, pi, c1, c2, c3],
    { aspect: 2.1, maxHeight: 280, minHeight: 210 },
  );

  return (
    <Figure
      no={1}
      title="날씨 마르코프 체인"
      hint="전이 확률을 바꾸고 시작 날씨를 바꿔 보세요"
      caption={<>표의 줄이 오늘 날씨, 칸이 내일 날씨입니다. 슬라이더는 가중치이고 줄마다 합이 1이 되도록 나눠서 전이 확률을 만듭니다. 그래프는 오늘 날씨만 알 때 t일 뒤 날씨의 확률이고, 점선은 정상 분포입니다. 어느 날씨에서 시작해도 며칠 지나면 같은 비율로 모입니다.</>}
    >
      <div className="fig-split left">
        <div className="controls">
          <div className="pr-scroll">
            <table className="pr-matrix">
              <thead>
                <tr>
                  <th>오늘 \ 내일</th>
                  {WX.map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WX.map((a, i) => (
                  <tr key={a}>
                    <th>{a}</th>
                    {WX.map((b, j) => (
                      <td key={b}>
                        <span className="mono">{T[i][j].toFixed(2)}</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={W[i][j]}
                          aria-label={`${a} 다음 날 ${b}의 가중치`}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setW((M) => M.map((row, r) => (r === i ? row.map((x, c) => (c === j ? v : x)) : row)));
                          }}
                          style={{ ['--fill' as string]: `${W[i][j] * 100}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Seg label="오늘 날씨 (t = 0)" value={start} onChange={setStart} options={WX.map((x, i) => ({ value: i, label: x }))} />
          <div className="btn-row">
            <Button small onClick={() => setW(DEFAULT_W)}>
              처음 값으로
            </Button>
            <Reroll onClick={() => setSeed((s) => s + 1)} label="다른 1000일" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <StateDiagram T={T} />
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`t일 뒤 날씨 확률의 변화. 정상 분포는 맑음 ${pct(pi[0])}, 흐림 ${pct(pi[1])}, 비 ${pct(pi[2])}.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="pr-days" aria-label={`무작위로 걸은 첫 60일: ${walk.slice(0, 60).map((d) => WX[d]).join(', ')}`}>
            {walk.slice(0, 60).map((d, t) => (
              <span key={t} title={`${t}일: ${WX[d]}`} style={{ background: WX_CSS[d] }} />
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {WX.map((x, s) => (
              <Readout key={x} label={`${x}: ${DAYS}일 중 / 정상`} value={`${pct(freq[s], 0)} / ${pct(pi[s], 0)}`} color={WX_CSS[s]} />
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a word chain that writes sentences ─────────────── */

const CORPUS = [
  '나는 오늘 학교에 간다',
  '나는 오늘 밥을 먹는다',
  '너는 오늘 학교에 안 간다',
  '너는 내일 친구를 만난다',
  '나는 내일 밥을 먹는다',
  '친구는 오늘 영화를 본다',
  '나는 친구를 만난다',
  '친구는 밥을 안 먹는다',
  '너는 영화를 본다',
];
const START = '⟨시작⟩';
const END = '.';

function buildChain() {
  const next = new Map<string, Map<string, number>>();
  for (const s of CORPUS) {
    const toks = [START, ...s.split(' '), END];
    for (let k = 0; k + 1 < toks.length; k++) {
      const m = next.get(toks[k]) ?? new Map<string, number>();
      m.set(toks[k + 1], (m.get(toks[k + 1]) ?? 0) + 1);
      next.set(toks[k], m);
    }
  }
  return next;
}
const CHAIN = buildChain();

function TextFigure() {
  const [seed, setSeed] = useState(3);
  const [sel, setSel] = useState(0);
  const words = useMemo(() => {
    const r = rng(seed * 997 + 13);
    const out = [START];
    while (out[out.length - 1] !== END && out.length < 20) {
      const m = CHAIN.get(out[out.length - 1])!;
      const tot = [...m.values()].reduce((a, b) => a + b, 0);
      let u = r() * tot;
      let pick = END;
      for (const [w, c] of m) {
        if (u < c) {
          pick = w;
          break;
        }
        u -= c;
      }
      out.push(pick);
    }
    return out;
  }, [seed]);
  const sentence = words.slice(1, -1).join(' ');
  const novel = !CORPUS.includes(sentence);
  const cur = words[Math.min(sel, words.length - 2)];
  const nxt = CHAIN.get(cur) ?? new Map<string, number>();
  const tot = [...nxt.values()].reduce((a, b) => a + b, 0);
  const chosen = words[Math.min(sel, words.length - 2) + 1];
  let prob = 1;
  for (let k = 0; k + 1 < words.length; k++) {
    const m = CHAIN.get(words[k])!;
    prob *= (m.get(words[k + 1]) ?? 0) / [...m.values()].reduce((a, b) => a + b, 0);
  }

  return (
    <Figure
      no={2}
      title="단어 마르코프 체인으로 문장 만들기"
      hint="문장을 새로 만들고, 단어를 눌러 다음 단어 확률을 보세요"
      caption={<>상태는 "마지막 단어"이고, 전이 확률은 아래 글에서 그 단어 다음에 각 단어가 나온 비율입니다. 문장은 ⟨시작⟩에서 출발해 마침표에 닿을 때까지 걷습니다. 바로 앞 단어만 기억하므로 글에 없던 문장도 만들어지고, 가끔 말이 안 되는 문장도 나옵니다.</>}
    >
      <div className="pr-corpus">{CORPUS.map((s) => s + '.').join(' ')}</div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => { setSeed((s) => s + 1); setSel(0); }} label="새 문장" />
        </div>
        <div className="pr-note" style={{ flex: '1 1 240px' }}>
          {novel ? <strong>원래 글에 없던 문장입니다.</strong> : '원래 글에 있던 문장입니다.'} 이 문장이 나올 확률은 {pct(prob, 1)}입니다(전이 확률들의 곱).
        </div>
      </div>
      <div className="pr-chain" role="group" aria-label="만들어진 문장. 단어를 누르면 그다음 단어의 확률이 보입니다.">
        {words.slice(0, -1).map((w, k) => (
          <button key={k} type="button" className="pr-tok" aria-pressed={k === Math.min(sel, words.length - 2)} onClick={() => setSel(k)}>
            {w}
          </button>
        ))}
        <span className="pr-tok-end">.</span>
      </div>
      <div className="pr-next" aria-live="polite">
        <div className="pr-note">
          "<strong>{cur}</strong>" 다음에 올 단어 (글에서 {tot}번 나옴)
        </div>
        {[...nxt.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([w, c]) => (
            <div key={w} className="pr-next-row" data-chosen={w === chosen || undefined}>
              <span>{w === END ? '마침표 (끝)' : w}</span>
              <span className="pr-next-track">
                <span className="pr-next-bar" style={{ width: `${(c / tot) * 100}%` }} />
              </span>
              <span className="mono">{pct(c / tot, 0)}</span>
            </div>
          ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: random walk on a graph ─────────────── */

interface Graph {
  label: string;
  xy: [number, number][];
  edges: [number, number][];
}
const GRAPHS: Record<'tri' | 'bip', Graph> = {
  tri: {
    label: '삼각형이 있는 그래프',
    xy: [
      [50, 60],
      [150, 30],
      [130, 130],
      [240, 90],
      [230, 200],
      [320, 160],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [4, 5],
      [3, 5],
    ],
  },
  bip: {
    label: '이분 그래프 (육각형)',
    xy: [
      [90, 40],
      [230, 40],
      [300, 120],
      [230, 200],
      [90, 200],
      [20, 120],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [0, 3],
    ],
  },
};
const WALK = 400;

function WalkFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [gid, setGid] = useState<'tri' | 'bip'>('tri');
  const [lazy, setLazy] = useState(false);
  const [seed, setSeed] = useState(1);
  const G = GRAPHS[gid];
  const n = G.xy.length;
  const adj = useMemo(() => {
    const a: number[][] = Array.from({ length: n }, () => []);
    for (const [u, v] of G.edges) {
      a[u].push(v);
      a[v].push(u);
    }
    return a;
  }, [G, n]);
  const T: Matrix = useMemo(() => adj.map((nb, i) => Array.from({ length: n }, (_, j) => (lazy ? (i === j ? 0.5 : 0) : 0) + (nb.includes(j) ? (lazy ? 0.5 : 1) / nb.length : 0))), [adj, n, lazy]);
  const deg = adj.map((a) => a.length);
  const twoE = deg.reduce((a, b) => a + b, 0);
  const piStar = deg.map((d) => d / twoE);
  const run = useMemo(() => {
    const r = rng(seed * 7717 + (gid === 'tri' ? 1 : 2) + (lazy ? 10 : 0));
    const path = [0];
    for (let t = 1; t <= WALK; t++) path.push(pickFrom(T[path[t - 1]], r()));
    const dists: number[][] = [[1, ...new Array(n - 1).fill(0)]];
    for (let t = 1; t <= WALK; t++) dists.push(step(dists[t - 1], T));
    return { path, dists };
  }, [T, seed, gid, lazy, n]);
  const s = useStepper(WALK + 1, 8, `${gid}-${lazy}-${seed}`);
  const t = s.i;
  const visits = new Array(n).fill(0);
  for (let k = 0; k <= t; k++) visits[run.path[k]]++;
  const emp = visits.map((v) => v / (t + 1));
  const piT = run.dists[t];
  const here = run.path[t];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = 0.6;
      const plot = new Plot(ctx, w, h, P, { xMin: -0.6, xMax: n - 0.4, yMin: 0, yMax, pad: { l: 40, r: 10, t: 12, b: 24 } });
      plot.grid({ axes: false, xStep: 1, yStep: 0.1, labels: false });
      ticks(
        plot,
        P,
        Array.from({ length: n }, (_, i) => [i, String.fromCharCode(65 + i)] as [number, string]),
        [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((v) => [v, `${Math.round(v * 100)}%`] as [number, string]),
      );
      const bw = 0.26;
      for (let i = 0; i < n; i++) {
        const groups: [number, string][] = [
          [emp[i], alpha(c1, 0.8)],
          [Math.min(piT[i], yMax), alpha(c2, 0.8)],
          [piStar[i], alpha(c3, 0.9)],
        ];
        groups.forEach(([v, col], g) => {
          const x = i + (g - 1) * bw;
          ctx.fillStyle = col;
          const l = plot.X(x - bw / 2 + 0.02);
          const r2 = plot.X(x + bw / 2 - 0.02);
          ctx.fillRect(l, plot.Y(v), r2 - l, plot.Y(0) - plot.Y(v));
        });
      }
    },
    [P, c1, c2, c3, emp, piT, piStar, n],
    { aspect: 2.4, maxHeight: 240, minHeight: 170 },
  );

  return (
    <Figure
      no={3}
      title="그래프 위의 랜덤 워크"
      hint="재생하거나 한 걸음씩 걸어 보세요. 이분 그래프와 '게으른 걸음'도 비교해 보세요"
      caption={<>걷는 사람(진한 테두리)은 매 걸음 이웃 중 하나로 같은 확률로 옮겨 갑니다. 막대는 꼭짓점마다 지금까지 머문 비율(빨강), A에서 출발했을 때 t걸음 뒤에 거기 있을 확률 π_t(파랑), 정상 분포 deg/2|E|(노랑)입니다. 이분 그래프에서는 π_t가 두 쪽을 번갈아 오가며 수렴하지 않습니다. 게으른 걸음(절반 확률로 제자리)을 켜면 수렴합니다.</>}
    >
      <div className="controls row">
        <Seg label="그래프" value={gid} onChange={setGid} options={[{ value: 'tri', label: '삼각형 있음' }, { value: 'bip', label: '이분 그래프' }]} />
        <Check label="게으른 걸음 (1/2 확률로 제자리)" checked={lazy} onChange={setLazy} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((x) => x + 1)} />
        </div>
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <svg viewBox="-20 -24 380 270" className="pr-graph" role="img" aria-label={`${G.label}. ${t}걸음째 걷는 사람은 ${String.fromCharCode(65 + here)}에 있습니다.`}>
            {G.edges.map(([u, v], k) => (
              <line key={k} x1={G.xy[u][0]} y1={G.xy[u][1]} x2={G.xy[v][0]} y2={G.xy[v][1]} className="pr-gedge" data-hot={(t > 0 && ((run.path[t - 1] === u && here === v) || (run.path[t - 1] === v && here === u))) || undefined} />
            ))}
            {G.xy.map(([x, y], i) => (
              <g key={i} className="pr-node" data-here={i === here || undefined}>
                <circle cx={x} cy={y} r={12 + 40 * Math.sqrt(emp[i]) * 0.6} style={{ fill: `color-mix(in srgb, var(--c-math-1) ${Math.round(15 + 60 * emp[i])}%, var(--surface))` }} />
                <text x={x} y={y} dy="0.35em">
                  {String.fromCharCode(65 + i)}
                </text>
                <text x={x} y={y + 30 + 40 * Math.sqrt(emp[i]) * 0.6 - 10} className="sub">
                  deg {deg[i]}
                </text>
              </g>
            ))}
          </svg>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`꼭짓점별 방문 비율, ${t}걸음 뒤 확률, 정상 분포 막대그래프. ${G.xy.map((_, i) => `${String.fromCharCode(65 + i)}: 방문 ${pct(emp[i], 0)}, 정상 ${pct(piStar[i], 0)}`).join('; ')}`}>
            <canvas ref={canvasRef} />
          </div>
          <Legend
            items={[
              { color: 'var(--c-math-1)', label: '머문 비율', shape: 'sq' },
              { color: 'var(--c-math-2)', label: `π_t (t = ${t})`, shape: 'sq' },
              { color: 'var(--c-math-3)', label: '정상 분포 deg/2|E|', shape: 'sq' },
            ]}
          />
        </div>
        <div className="controls">
          <StepControls s={s} id="walk-speed" maxSpeed={60} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="걸음 t" value={String(t)} />
            <Readout label="지금 위치" value={String.fromCharCode(65 + here)} color="var(--c-math-1)" />
            <Readout label="π_t와 정상 분포의 차이" value={(0.5 * piT.reduce((a, v, i) => a + Math.abs(v - piStar[i]), 0)).toFixed(3)} color="var(--c-math-2)" />
            <Readout label="2|E|" value={String(twoE)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: PageRank on a tiny web ─────────────── */

const PAGES = ['A', 'B', 'C', 'D', 'E', 'F'];
const PAGE_XY: [number, number][] = [
  [70, 50],
  [200, 30],
  [300, 100],
  [270, 210],
  [130, 220],
  [40, 140],
];
type Links = boolean[][];
const toLinks = (pairs: string[]): Links => {
  const L = PAGES.map(() => PAGES.map(() => false));
  for (const p of pairs) L[PAGES.indexOf(p[0])][PAGES.indexOf(p[1])] = true;
  return L;
};
const WEBS: Record<string, { label: string; links: string[] }> = {
  basic: { label: '보통 웹', links: ['AB', 'AC', 'BC', 'CA', 'DC', 'ED', 'EC', 'FE', 'FA', 'BF'] },
  trap: { label: '거미줄 함정', links: ['AB', 'AC', 'BC', 'CA', 'CD', 'DE', 'ED', 'FA', 'FB'] },
  dead: { label: '막다른 페이지', links: ['AB', 'BC', 'CA', 'AD', 'ED', 'FE', 'FA'] },
};

function pagerank(L: Links, d: number) {
  const n = L.length;
  const out = L.map((row) => row.filter(Boolean).length);
  let r = new Array(n).fill(1 / n);
  let it = 0;
  let diff = 1;
  for (; it < 300 && diff > 1e-10; it++) {
    const dangling = r.reduce((s, v, i) => s + (out[i] === 0 ? v : 0), 0);
    const nr = new Array(n).fill((1 - d) / n + (d * dangling) / n);
    for (let i = 0; i < n; i++) if (out[i]) for (let j = 0; j < n; j++) if (L[i][j]) nr[j] += (d * r[i]) / out[i];
    diff = nr.reduce((s, v, i) => s + Math.abs(v - r[i]), 0);
    r = nr;
  }
  return { r, it, converged: diff <= 1e-10 };
}

function PageRankFigure() {
  const [L, setL] = useState<Links>(() => toLinks(WEBS.basic.links));
  const [d, setD] = useState(0.85);
  const [sel, setSel] = useState<number | null>(null);
  const { r, it, converged } = pagerank(L, d);
  const order = r.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const rmax = Math.max(...r);

  const click = (i: number) => {
    if (sel === null) setSel(i);
    else if (sel === i) setSel(null);
    else {
      setL((M) => M.map((row, a) => (a === sel ? row.map((x, b) => (b === i ? !x : x)) : row)));
      setSel(null);
    }
  };
  const key = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      click(i);
    }
  };
  const radius = (v: number) => 14 + 22 * Math.sqrt(v / rmax);

  return (
    <Figure
      no={4}
      title="작은 웹의 페이지랭크"
      hint="페이지를 누른 뒤 다른 페이지를 누르면 링크가 생기거나 사라집니다"
      caption={<>원의 크기가 페이지랭크입니다. 무작위 서퍼는 확률 d로 지금 페이지의 링크 중 하나를 따라가고, 1 − d로 아무 페이지로나 순간 이동합니다. 링크가 없는 페이지에서는 언제나 순간 이동합니다. "거미줄 함정"에서 d를 1로 올리면 서퍼가 D와 E 사이에 갇혀 둘이 순위를 독차지합니다.</>}
    >
      <div className="controls row">
        <Seg label="예시" value={(Object.keys(WEBS).find((k) => toLinks(WEBS[k].links).flat().join() === L.flat().join()) ?? '') as string} onChange={(k) => { setL(toLinks(WEBS[k].links)); setSel(null); }} options={Object.keys(WEBS).map((k) => ({ value: k, label: WEBS[k].label }))} />
        <Slider id="pr-d" label="감쇠 계수 d" value={d} min={0.5} max={1} step={0.01} onChange={setD} format={(v) => v.toFixed(2)} />
      </div>
      <div className="fig-split">
        <svg viewBox="-10 -14 360 290" className="pr-graph" role="group" aria-label="웹 페이지 여섯 개와 링크. 페이지를 고른 뒤 다른 페이지를 고르면 링크를 토글합니다.">
          <defs>
            <marker id="pr-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="pr-arrowhead" />
            </marker>
          </defs>
          {L.flatMap((row, i) =>
            row.map((on, j) => {
              if (!on) return null;
              const [x1, y1] = PAGE_XY[i];
              const [x2, y2] = PAGE_XY[j];
              const len = Math.hypot(x2 - x1, y2 - y1);
              const ux = (x2 - x1) / len;
              const uy = (y2 - y1) / len;
              const both = L[j][i];
              const ox = both ? -uy * 5 : 0;
              const oy = both ? ux * 5 : 0;
              const r1 = radius(r[i]);
              const r2 = radius(r[j]) + 3;
              return <line key={`${i}-${j}`} x1={x1 + ux * r1 + ox} y1={y1 + uy * r1 + oy} x2={x2 - ux * r2 + ox} y2={y2 - uy * r2 + oy} className="pr-link" markerEnd="url(#pr-arrow2)" />;
            }),
          )}
          {PAGE_XY.map(([x, y], i) => (
            <g key={i} className="pr-page" data-sel={sel === i || undefined} role="button" tabIndex={0} aria-pressed={sel === i} aria-label={`페이지 ${PAGES[i]}, 페이지랭크 ${pct(r[i])}${sel !== null && sel !== i ? `. 누르면 ${PAGES[sel]}에서 ${PAGES[i]}로 가는 링크를 ${L[sel][i] ? '지웁니다' : '만듭니다'}` : ''}`} onClick={() => click(i)} onKeyDown={(e) => key(e, i)}>
              <circle cx={x} cy={y} r={radius(r[i])} />
              <text x={x} y={y - 4} dy="0.35em">
                {PAGES[i]}
              </text>
              <text x={x} y={y + 10} dy="0.35em" className="sub">
                {pct(r[i], 0)}
              </text>
            </g>
          ))}
        </svg>
        <div className="controls">
          <div className="pr-note" aria-live="polite">
            {sel === null ? '링크를 바꾸려면 출발 페이지를 누르세요.' : `${PAGES[sel]}에서 나가는 링크: 도착 페이지를 누르세요. (${PAGES[sel]}를 다시 누르면 취소)`}
          </div>
          <div className="pr-next">
            {order.map(([v, i], k) => (
              <div key={i} className="pr-next-row">
                <span>
                  {k + 1}위 · {PAGES[i]}
                </span>
                <span className="pr-next-track">
                  <span className="pr-next-bar" style={{ width: `${(v / rmax) * 100}%`, background: 'var(--c-math-1)' }} />
                </span>
                <span className="mono">{pct(v, 1)}</span>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="거듭제곱 반복 횟수" value={converged ? `${it}번` : '300번에도 수렴 안 함'} />
            <Readout label="순간 이동 확률 1 − d" value={pct(1 - d, 0)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Markov() {
  return (
    <>
      <h2>지금만 기억하는 무작위 과정</h2>
      <p>
        지금까지의 확률변수는 대개 서로 독립이었습니다. 하지만 오늘 날씨는 어제 날씨와, 다음 단어는 앞 단어와 얽혀 있습니다. 그렇다고 과거 전체를 기억하면 계산할 수 없을 만큼 복잡해집니다. 그 중간이 <T en="Markov chain">마르코프 체인</T>입니다. 시스템은 정해진 <T en="state">상태</T>들 중 하나에 있고, 다음 상태의 확률은 <strong>지금 상태에만</strong> 달려 있습니다.
      </p>
      <MB note="Xₜ는 t번째 시점의 상태입니다. 과거 X₀, …, Xₜ₋₁은 지금 Xₜ를 알면 더 알려 주는 것이 없습니다(마르코프 성질).">{'P(X_{t+1} = j \\mid X_t = i, X_{t-1}, \\dots, X_0) = P(X_{t+1} = j \\mid X_t = i) = P_{ij}'}</MB>
      <p>
        <M>{'P_{ij}'}</M>는 상태 i에서 j로 옮겨 갈 <T en="transition probability">전이 확률</T>이고, 이것을 모은 표가 <T en="transition matrix">전이 행렬</T> P입니다. i번째 줄은 "i에 있을 때 다음 상태의 분포"이므로 줄마다 합이 1입니다.
      </p>

      <h2>분포가 한 걸음씩 움직인다</h2>
      <p>
        지금 상태를 정확히 모르고 확률로만 안다고 합시다. 상태별 확률을 가로 벡터 <M>{'\\pi_t'}</M>(파이)로 쓰면, 다음 시점의 분포는 전확률 법칙 <M>{'\\pi_{t+1}(j) = \\sum_i \\pi_t(i) P_{ij}'}</M>이고, 행렬로 쓰면 곱셈 한 번입니다.
      </p>
      <MB note="t걸음 뒤의 분포는 P를 t번 곱한 것입니다. P^t의 (i, j) 칸은 i에서 출발해 정확히 t걸음 뒤 j에 있을 확률입니다.">{'\\pi_{t+1} = \\pi_t P \\qquad \\pi_t = \\pi_0 P^t'}</MB>
      <WeatherFigure />
      <p>
        그림 1에서 시작 날씨를 바꿔 보세요. 첫 며칠은 시작이 어디였는지가 중요하지만, 일주일쯤 지나면 세 곡선이 모두 같은 높이로 모입니다. 그 값이 <T en="stationary distribution">정상 분포</T> π입니다. 한 걸음 더 가도 바뀌지 않는 분포라는 뜻입니다.
      </p>
      <MB note="π는 확률이므로 성분이 0 이상이고 합이 1입니다. 기본값에서는 맑음 46%, 흐림 31%, 비 23%쯤입니다.">{'\\pi = \\pi P'}</MB>
      <p>
        아래쪽 색 띠는 체인을 따라 실제로 걸은 날씨이고, 1000일 동안 각 날씨가 나온 비율이 정상 분포와 거의 같습니다. 정상 분포에는 두 얼굴이 있습니다. 먼 미래의 어느 날 날씨의 확률이기도 하고, 아주 오래 걸었을 때 각 상태에 머문 시간의 비율이기도 합니다. 식 <M>{'\\pi = \\pi P'}</M>는 π가 행렬 P의 고윳값 1에 대한 (왼쪽) 고유벡터라는 말이고, <M>{'\\pi_0 P^t'}</M>를 반복해 π를 찾는 것은 <a href={lessonHref('math-linear-algebra', 'eigen')}>고윳값과 고유벡터</a>에서 다루는 거듭제곱법 그 자체입니다.
      </p>

      <h2>텍스트를 만드는 체인</h2>
      <p>
        상태를 "마지막 단어"로 두면 마르코프 체인이 글을 씁니다. 글에서 단어 a 다음에 b가 나온 횟수를 세어 비율로 바꾸면 그것이 전이 확률이고, 이것을 <T en="bigram model">바이그램 모델</T>이라고 합니다.
      </p>
      <TextFigure />
      <p>
        그림 2에서 "새 문장"을 몇 번 눌러 보면 "너는 내일 밥을 먹는다"처럼 글에 없던 그럴듯한 문장과 "친구는 오늘 학교에 안 간다"처럼 조합된 문장이 나옵니다. 앞 단어 하나만 보니 긴 문맥은 놓칩니다. 상태를 앞 단어 두세 개로 늘리면 더 자연스러워지지만 상태 수가 폭발합니다. 오늘날의 언어 모델은 상태를 표로 세는 대신 신경망으로 앞 문맥 전체에서 다음 토큰의 분포를 계산합니다. 그래도 "분포에서 하나 뽑고, 붙이고, 다시"라는 생성 방식은 같습니다(<a href={lessonHref('ai-basics', 'language-model')}>언어 모델이 글을 쓰는 법</a>).
      </p>

      <h2>랜덤 워크와 수렴의 조건</h2>
      <p>
        그래프의 꼭짓점을 상태로 두고, 매 걸음 이웃 중 하나로 같은 확률로 옮겨 가는 체인을 <T en="random walk">랜덤 워크</T>라고 합니다. 꼭짓점 i의 이웃 수(차수)를 <M>{'\\deg(i)'}</M>, 간선 수를 <M>{'|E|'}</M>라고 하면, 무방향 그래프에서 정상 분포는 놀랍게도 차수에 비례합니다.
      </p>
      <MB note="차수를 모두 더하면 간선마다 두 번씩 세므로 2|E|입니다. 이 π를 πP에 넣어 보면 그대로 나옵니다.">{'\\pi(i) = \\frac{\\deg(i)}{2|E|}'}</MB>
      <WalkFigure />
      <p>
        그림 3에서 재생을 누르면 머문 비율(빨강)이 정상 분포(노랑)에 점점 가까워집니다. 그런데 "이분 그래프"를 고르면 π_t(파랑)가 이상하게 움직입니다. 꼭짓점을 두 편으로 나눌 수 있어서, 짝수 걸음에는 늘 한쪽에, 홀수 걸음에는 늘 다른 쪽에 있기 때문입니다. 이런 체인을 <T en="periodic">주기적</T>이라고 합니다. 머문 비율은 여전히 정상 분포로 가지만, t걸음 뒤의 분포 자체는 수렴하지 않습니다.
      </p>
      <p>
        일반적으로 유한한 체인에서 어디서 출발하든 <M>{'\\pi_t \\to \\pi'}</M>가 되려면 두 조건이 필요합니다. 모든 상태가 서로 오갈 수 있어야 하고(<T en="irreducible">기약</T>), 주기가 없어야 합니다(<T en="aperiodic">비주기</T>). "게으른 걸음"처럼 제자리에 머무는 확률을 조금만 넣어도 주기가 깨집니다.
      </p>

      <h2>페이지랭크</h2>
      <p>
        1998년 구글은 웹 페이지의 중요도를 랜덤 워크로 정의했습니다. 웹을 링크라는 방향 간선이 있는 그래프로 보고, 링크를 무작위로 따라가며 서핑하는 사람을 상상합니다. 오래 서핑했을 때 그 사람이 어떤 페이지에 머무는 비율, 즉 정상 분포가 그 페이지의 <T en="PageRank">페이지랭크</T>입니다. 중요한 페이지에서 많이 링크된 페이지가 중요해집니다.
      </p>
      <p>
        실제 웹에서는 이 체인이 앞의 두 조건을 어깁니다. 나가는 링크가 없는 막다른 페이지에서는 갈 곳이 없고, 서로만 가리키는 페이지 무리(거미줄 함정)에 들어가면 빠져나오지 못합니다. 그래서 서퍼가 확률 <M>{'1 - d'}</M>로 아무 페이지로나 순간 이동하게 합니다. d를 <T en="damping factor">감쇠 계수</T>라 하고 보통 0.85를 씁니다.
      </p>
      <MB note="N은 페이지 수, out(i)는 i에서 나가는 링크 수입니다. 첫 항이 순간 이동, 둘째 항이 링크를 따라 들어온 몫입니다.">{'r(j) = \\frac{1-d}{N} + d \\sum_{i \\to j} \\frac{r(i)}{\\mathrm{out}(i)}'}</MB>
      <PageRankFigure />
      <p>
        그림 4의 "보통 웹"에서 링크를 가장 많이(네 개) 받는 페이지는 C인데, 1위는 링크를 두 개만 받는 A입니다. C가 나가는 링크를 A 하나에만 걸어서, 많이 모은 표를 통째로 A에게 넘기기 때문입니다. 링크의 수보다 누가 링크했는지가 중요합니다. "거미줄 함정"에서 d를 1로 올려 보고, "막다른 페이지"에서 D에 나가는 링크를 하나 만들어 순위가 어떻게 바뀌는지 보세요. d가 1에 가까울수록 수렴에 필요한 반복 횟수도 늘어납니다. 반복마다 오차가 대략 d배씩 줄기 때문입니다.
      </p>
      <Code label="거듭제곱법으로 페이지랭크 구하기">{`
// links[i] = i에서 나가는 링크의 도착 페이지 목록
function pageRank(links, d = 0.85, tol = 1e-10) {
  const n = links.length;
  let r = new Array(n).fill(1 / n);          // 처음에는 모두 같게
  for (let iter = 0; iter < 1000; iter++) {
    // 막다른 페이지의 몫은 모든 페이지에 고르게 나눈다
    const dangling = r.reduce((s, v, i) => s + (links[i].length ? 0 : v), 0);
    const next = new Array(n).fill((1 - d) / n + (d * dangling) / n);
    for (let i = 0; i < n; i++)
      for (const j of links[i]) next[j] += (d * r[i]) / links[i].length;
    const diff = next.reduce((s, v, i) => s + Math.abs(v - r[i]), 0);
    r = next;                                  // r ← rP 한 번
    if (diff < tol) break;                     // 더 이상 바뀌지 않으면 정상 분포
  }
  return r;
}`}</Code>
      <Callout kind="intuition">
        페이지랭크의 계산은 행렬 곱셈 몇십 번이 전부입니다. 웹 페이지가 수십억 개여도 행렬은 대부분 0이라, 링크 목록만 훑으면 한 번 곱할 수 있습니다. 같은 아이디어가 소셜 네트워크의 영향력 순위, 논문 인용 분석, 추천 시스템에서 쓰입니다.
      </Callout>

      <Callout kind="key">
        마르코프 체인은 다음 상태가 지금 상태에만 달린 과정이고, 전이 행렬 P의 줄마다 합이 1입니다. 분포는 π_{'{'}t+1{'}'} = π_t P로 움직이며, 기약이고 비주기이면 어디서 출발해도 정상 분포 π = πP로 수렴합니다. 무방향 그래프의 랜덤 워크는 π(i) = deg(i)/2|E|이고, 페이지랭크는 순간 이동을 더한 랜덤 워크의 정상 분포입니다.
      </Callout>
      <Quiz
        q={<>상태가 "정상"과 "고장" 둘인 서버가 있다. 정상인 날 다음 날 고장 날 확률은 0.1, 고장 난 날 다음 날 고쳐질 확률은 0.6이다. 오랫동안 보았을 때 서버가 고장 나 있는 날의 비율은?</>}
        options={['10%', '약 14%', '40%', '60%']}
        answer={1}
        explain={<>정상 분포에서는 "정상 → 고장"으로 넘어가는 흐름과 "고장 → 정상"으로 돌아오는 흐름이 같아야 합니다. π(정상) × 0.1 = π(고장) × 0.6이고 둘의 합이 1이므로 π(고장) = 0.1 / (0.1 + 0.6) = 1/7 ≈ 14%입니다. 서버 가용성을 계산하는 기본 모델입니다.</>}
      />
    </>
  );
}

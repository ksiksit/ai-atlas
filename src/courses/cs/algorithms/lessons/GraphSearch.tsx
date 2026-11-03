import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { MUD, WALL, defaultGrid, makeMaze, search, type Grid, type Search } from './grid';
import './algorithms.css';

/* ─────────────── Figure 1: BFS vs DFS on a small graph ─────────────── */

const NODES: Record<string, [number, number]> = {
  A: [0.08, 0.5],
  B: [0.3, 0.18],
  C: [0.3, 0.82],
  D: [0.52, 0.08],
  E: [0.52, 0.5],
  F: [0.52, 0.92],
  G: [0.76, 0.28],
  H: [0.92, 0.72],
};
const EDGES: [string, string][] = [
  ['A', 'B'],
  ['A', 'C'],
  ['B', 'D'],
  ['B', 'E'],
  ['C', 'E'],
  ['C', 'F'],
  ['D', 'G'],
  ['E', 'G'],
  ['E', 'H'],
  ['F', 'H'],
  ['G', 'H'],
];
const ADJ: Record<string, string[]> = Object.fromEntries(Object.keys(NODES).map((k) => [k, EDGES.flatMap(([a, b]) => (a === k ? [b] : b === k ? [a] : [])).sort()]));

interface GStep {
  current: string | null;
  visited: string[];
  frontier: string[];
  parent: Record<string, string>;
  note: string;
}

function graphSteps(kind: 'bfs' | 'dfs'): GStep[] {
  const out: GStep[] = [];
  const parent: Record<string, string> = {};
  const visited: string[] = [];
  const snap = (current: string | null, frontier: string[], note: string) => out.push({ current, visited: [...visited], frontier: [...frontier], parent: { ...parent }, note });
  if (kind === 'bfs') {
    const q = ['A'];
    const seen = new Set(['A']);
    snap(null, q, '시작: 큐에 A를 넣습니다');
    while (q.length) {
      const u = q.shift()!;
      visited.push(u);
      const added: string[] = [];
      for (const v of ADJ[u]) {
        if (seen.has(v)) continue;
        seen.add(v);
        parent[v] = u;
        q.push(v);
        added.push(v);
      }
      snap(u, q, `큐 맨 앞의 ${u}를 꺼내 방문 → ${added.length ? `처음 보는 이웃 ${added.join(', ')}를 큐 뒤에 추가` : '새로 추가할 이웃 없음'}`);
    }
  } else {
    const st: [string, string | null][] = [['A', null]];
    const seen = new Set<string>();
    snap(null, ['A'], '시작: 스택에 A를 넣습니다');
    while (st.length) {
      const [u, from] = st.pop()!;
      if (seen.has(u)) {
        snap(null, st.map(([x]) => x), `스택 맨 위의 ${u}는 이미 방문했으므로 버립니다`);
        continue;
      }
      seen.add(u);
      if (from) parent[u] = from;
      visited.push(u);
      const add = ADJ[u].filter((v) => !seen.has(v));
      // push in reverse alphabetical order so the alphabetically first neighbour is explored first
      for (const v of [...add].reverse()) st.push([v, u]);
      snap(u, st.map(([x]) => x), `스택 맨 위의 ${u}를 꺼내 방문 → ${add.length ? `이웃 ${add.join(', ')}를 스택에 쌓음` : '새로 쌓을 이웃 없음'}`);
    }
  }
  return out;
}

function SmallGraphFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<'bfs' | 'dfs'>('bfs');
  const steps = useMemo(() => graphSteps(kind), [kind]);
  const s = useStepper(steps.length, 1, kind);
  const st = steps[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 26;
      const pos = (k: string): [number, number] => [pad + NODES[k][0] * (w - 2 * pad), pad + NODES[k][1] * (h - 2 * pad)];
      for (const [a, b] of EDGES) {
        const tree = st.parent[b] === a || st.parent[a] === b;
        const [x1, y1] = pos(a);
        const [x2, y2] = pos(b);
        ctx.strokeStyle = tree ? P.ink : P.lineStrong;
        ctx.lineWidth = tree ? 3 : 1.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      const r = Math.min(20, w / 26);
      for (const k of Object.keys(NODES)) {
        const [x, y] = pos(k);
        const visitedIdx = st.visited.indexOf(k);
        const inFrontier = st.frontier.includes(k) && visitedIdx < 0;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = st.current === k ? P.pos : visitedIdx >= 0 ? alpha(P.good, 0.85) : inFrontier ? alpha(P.hl, 0.85) : P.surface;
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = st.current === k || visitedIdx >= 0 ? P.surface : P.ink;
        ctx.font = `700 ${Math.round(r * 0.8)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(k, x, y + 1);
        if (visitedIdx >= 0) {
          ctx.fillStyle = P.ink2;
          ctx.font = `600 11px ${P.fontMono}`;
          ctx.fillText(String(visitedIdx + 1), x + r + 8, y - r + 2);
        }
      }
    },
    [P, st],
    { aspect: 1.9, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={1}
      title="큐를 쓰면 BFS, 스택을 쓰면 DFS"
      hint="한 단계씩 진행해 보세요"
      caption={<>A에서 출발해 모든 노드를 방문합니다. 주황 노드는 방금 방문한 노드, 초록 노드는 방문을 마친 노드(옆의 숫자는 방문 순서), 노란 노드는 큐나 스택에서 차례를 기다리는 노드입니다. 굵은 선은 각 노드를 처음 발견한 길입니다. 두 방법은 대기열에서 무엇을 먼저 꺼내느냐만 다릅니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
          <div className="ds-row" aria-live="polite">
            <span className="ds-label">{kind === 'bfs' ? '큐 (왼쪽부터 꺼냄)' : '스택 (오른쪽 맨 위부터 꺼냄)'}</span>
            {st.frontier.length ? (
              st.frontier.map((k, i) => (
                <span key={i} className="ds-cell" data-next={(kind === 'bfs' ? i === 0 : i === st.frontier.length - 1) || undefined}>
                  {k}
                </span>
              ))
            ) : (
              <span className="ds-empty">비어 있음</span>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }}>{st.note}</div>
        </div>
        <div className="controls">
          <Seg
            label="방법"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bfs', label: 'BFS (큐)' },
              { value: 'dfs', label: 'DFS (스택)' },
            ]}
          />
          <StepControls s={s} id="sg-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="방문 순서" value={st.visited.join(' → ') || '—'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: path finding on a grid ─────────────── */

const GW = 29;
const GH = 15;
const SEARCHES: Record<Search, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: '다익스트라', astar: 'A*' };
type Tool = 'wall' | 'mud' | 'erase';

function MazeFigure() {
  const P = usePalette();
  const [grid, setGrid] = useState<Grid>(() => defaultGrid(GW, GH));
  const [alg, setAlg] = useState<Search>('bfs');
  const [tool, setTool] = useState<Tool>('wall');
  const [seed, setSeed] = useState(3);
  const res = useMemo(() => search(grid, alg), [grid, alg]);
  const total = res.order.length + 1; // last frame also draws the path
  const s = useStepper(total, 80, `${alg}|${grid.cells.join('')}`, true);
  const geom = useRef<{ cw: number; ox: number; oy: number } | null>(null);
  const painting = useRef<number | null>(null);

  const shown = Math.min(s.i, res.order.length);
  const showPath = s.i >= total - 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cw = Math.min((w - 4) / GW, (h - 4) / GH);
      const ox = (w - cw * GW) / 2;
      const oy = (h - cw * GH) / 2;
      geom.current = { cw, ox, oy };
      const visitedAt = new Int32Array(GW * GH).fill(-1);
      for (let k = 0; k < shown; k++) visitedAt[res.order[k]] = k;
      for (let i = 0; i < GW * GH; i++) {
        const x = ox + (i % GW) * cw;
        const y = oy + Math.floor(i / GW) * cw;
        const c = grid.cells[i];
        if (c === WALL) ctx.fillStyle = P.ink;
        else if (c === MUD) ctx.fillStyle = visitedAt[i] >= 0 ? alpha(P.hl, 0.75) : alpha(P.hl, 0.4);
        else ctx.fillStyle = visitedAt[i] >= 0 ? alpha(P.neg, 0.12 + 0.2 * (visitedAt[i] / Math.max(1, shown))) : P.surface;
        ctx.fillRect(x, y, cw, cw);
      }
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx <= GW; gx++) {
        ctx.moveTo(Math.round(ox + gx * cw) + 0.5, oy);
        ctx.lineTo(Math.round(ox + gx * cw) + 0.5, oy + GH * cw);
      }
      for (let gy = 0; gy <= GH; gy++) {
        ctx.moveTo(ox, Math.round(oy + gy * cw) + 0.5);
        ctx.lineTo(ox + GW * cw, Math.round(oy + gy * cw) + 0.5);
      }
      ctx.stroke();
      if (!showPath && shown > 0) {
        const cur = res.order[shown - 1];
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox + (cur % GW) * cw + 1, oy + Math.floor(cur / GW) * cw + 1, cw - 2, cw - 2);
      }
      if (showPath && res.path.length) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = Math.max(2.5, cw * 0.28);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        res.path.forEach((p, k) => {
          const px = ox + (p % GW) * cw + cw / 2;
          const py = oy + Math.floor(p / GW) * cw + cw / 2;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      for (const [cell, col, label] of [
        [grid.start, P.good, 'S'],
        [grid.goal, P.bad, 'G'],
      ] as const) {
        const x = ox + (cell % GW) * cw;
        const y = oy + Math.floor(cell / GW) * cw;
        ctx.fillStyle = col;
        ctx.fillRect(x + 1, y + 1, cw - 2, cw - 2);
        ctx.fillStyle = P.surface;
        ctx.font = `700 ${Math.round(cw * 0.6)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cw / 2, y + cw / 2 + 1);
      }
    },
    [P, grid, res, shown, showPath],
    { aspect: GW / GH, maxHeight: 420, minHeight: 150 },
  );

  const cellAt = (px: number, py: number) => {
    const g = geom.current;
    if (!g) return null;
    const cx = Math.floor((px - g.ox) / g.cw);
    const cy = Math.floor((py - g.oy) / g.cw);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return null;
    return cy * GW + cx;
  };
  const paint = (i: number) => {
    if (i === grid.start || i === grid.goal) return;
    const v = tool === 'wall' ? WALL : tool === 'mud' ? MUD : 0;
    setGrid((g) => {
      if (g.cells[i] === v) return g;
      const cells = g.cells.slice();
      cells[i] = v;
      return { ...g, cells };
    });
  };
  useDrag(canvasRef, {
    hit: (x, y) => cellAt(x, y),
    onDrag: (_id, x, y) => {
      const i = cellAt(x, y);
      if (i === null || i === painting.current) return;
      painting.current = i;
      paint(i);
    },
    onEnd: () => (painting.current = null),
  });

  const newMaze = () => {
    const r = rng(seed * 7 + 1);
    setSeed((k) => k + 1);
    setGrid((g) => ({ ...g, cells: makeMaze(GW, GH, g.start, g.goal, r) }));
  };
  const sprinkleMud = () => {
    const r = rng(seed * 13 + 5);
    setSeed((k) => k + 1);
    setGrid((g) => {
      const cells = g.cells.slice();
      for (let k = 0; k < 6; k++) {
        const cx = 2 + Math.floor(r() * (GW - 4));
        const cy = 1 + Math.floor(r() * (GH - 2));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
          const i = (cy + dy) * GW + (cx + dx);
          if (cells[i] === 0 && i !== g.start && i !== g.goal) cells[i] = MUD;
        }
      }
      return { ...g, cells };
    });
  };

  return (
    <Figure
      no={2}
      title="미로에서 길 찾기"
      hint="격자를 드래그해 벽이나 진흙을 그려 보세요"
      caption={<>S에서 G까지 가는 길을 찾습니다. 진흙(노란 칸)은 지나가는 데 5만큼, 빈 칸은 1만큼 듭니다. 파란색은 알고리즘이 살펴본 칸으로, 진할수록 나중에 본 칸입니다. 주황 선이 찾은 길입니다. 재생을 누르면 탐색 과정을 처음부터 볼 수 있습니다.</>}
    >
      <div ref={wrapRef} className="canvas-box grab">
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Seg label="알고리즘" value={alg} onChange={setAlg} options={(Object.keys(SEARCHES) as Search[]).map((a) => ({ value: a, label: SEARCHES[a] }))} />
        <Seg
          label="그리기 도구"
          value={tool}
          onChange={setTool}
          options={[
            { value: 'wall', label: '벽' },
            { value: 'mud', label: '진흙' },
            { value: 'erase', label: '지우개' },
          ]}
        />
        <div className="ctl" style={{ flex: '0 1 auto' }}>
          <div className="btn-row">
            <Button small onClick={newMaze}>
              미로 만들기
            </Button>
            <Button small onClick={sprinkleMud}>
              진흙 뿌리기
            </Button>
            <Button small onClick={() => setGrid(defaultGrid(GW, GH))}>
              처음 지도
            </Button>
          </div>
        </div>
      </div>
      <div className="fig-cols">
        <div className="controls">
          <StepControls s={s} id="mz-speed" maxSpeed={600} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="살펴본 칸" value={`${shown}칸`} color="var(--neg)" />
          <Readout label="길이 (칸 수)" value={showPath ? (res.path.length ? `${res.path.length - 1}칸` : '길 없음') : '—'} />
          <Readout label="비용 (진흙 = 5)" value={showPath && res.path.length ? String(res.cost) : '—'} color="var(--pos)" />
          <Readout label="최단 보장" value={alg === 'dfs' ? '없음' : alg === 'bfs' ? '칸 수 기준' : '비용 기준'} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '벽', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--hl) 55%, transparent)', label: '진흙 (비용 5)', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--neg) 30%, transparent)', label: '살펴본 칸', shape: 'sq' },
          { color: 'var(--pos)', label: '찾은 길', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function GraphSearch() {
  return (
    <>
      <h2>점과 선으로 된 데이터</h2>
      <p>
        지하철 노선도, SNS의 친구 관계, 웹 페이지 사이의 링크, <code>npm</code> 패키지의 의존 관계는 모두 같은 모양을 하고 있습니다. 무언가(점)와 그것들 사이의 연결(선)입니다. 이런 데이터를 <T en="graph">그래프</T>라고 하고, 점을 <T en="node, vertex">노드</T>, 선을 <T en="edge">간선</T>이라고 부릅니다.
      </p>
      <p>
        코드에서는 보통 노드마다 이웃 목록을 저장하는 <T en="adjacency list">인접 리스트</T>로 표현합니다. 아래 그림 1의 그래프는 이렇게 적을 수 있습니다.
      </p>
      <Code label="인접 리스트">{`
const graph = {
  A: ['B', 'C'],
  B: ['A', 'D', 'E'],
  C: ['A', 'E', 'F'],
  // ... 나머지 노드도 같은 방식
};`}</Code>

      <h2>BFS와 DFS: 큐와 스택의 차이</h2>
      <p>
        그래프의 모든 노드를 빠짐없이 방문하는 기본 방법은 두 가지입니다. 둘 다 "아직 방문할 차례를 기다리는 노드"를 모아 두는 대기열을 쓰는데, 그 대기열이 무엇이냐만 다릅니다.
      </p>
      <ul>
        <li>
          <T en="breadth-first search">너비 우선 탐색(BFS)</T>은 <strong>큐</strong>(먼저 들어온 것을 먼저 꺼냄)를 씁니다. 출발점에서 가까운 노드부터 한 겹씩 퍼져 나갑니다.
        </li>
        <li>
          <T en="depth-first search">깊이 우선 탐색(DFS)</T>은 <strong>스택</strong>(마지막에 들어온 것을 먼저 꺼냄)을 씁니다. 한 방향으로 갈 수 있는 데까지 깊이 들어갔다가 막히면 되돌아옵니다.
        </li>
      </ul>
      <SmallGraphFigure />
      <p>
        BFS의 방문 순서를 보면 A 다음에 A의 이웃(B, C), 그다음에 거리 2인 노드들(D, E, F)이 옵니다. 그래서 BFS로 처음 발견한 길은 언제나 <strong>간선 수가 가장 적은 길</strong>입니다. DFS는 A → B → D → G → …처럼 한 줄기로 깊이 내려갑니다. 모든 노드를 방문한다는 점은 같지만, 최단 경로는 보장하지 않습니다.
      </p>
      <Code label="BFS">{`
function bfs(graph, start) {
  const queue = [start];
  const seen = new Set([start]);
  const order = [];
  // queue.shift()는 O(n)이라 인덱스로 앞을 가리킨다
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    order.push(node);
    for (const next of graph[node]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return order;
}`}</Code>
      <p>
        각 노드는 큐에 한 번만 들어가고, 각 간선은 양 끝에서 한 번씩 살펴보므로 BFS와 DFS는 모두 노드 수 V와 간선 수 E에 대해 <M>{'O(V + E)'}</M>입니다. 위 코드에서 방문 여부를 <code>Set</code>으로 확인하는 것은 <a href="#cs-algorithms/search-hash">해시 테이블</a> 장에서 본 그대로입니다.
      </p>

      <h2>격자 위의 길 찾기</h2>
      <p>
        게임 지도나 미로도 그래프입니다. 칸 하나가 노드이고, 상하좌우로 이웃한 칸이 간선으로 이어져 있습니다. 여기서는 간선마다 비용이 다를 수 있습니다. 진흙을 지나는 데는 5, 빈 칸은 1이 든다고 해 봅시다.
      </p>
      <MazeFigure />
      <p>처음 지도에서 알고리즘을 바꿔 보세요.</p>
      <ul>
        <li>
          <strong>BFS</strong>는 칸 수가 가장 적은 길을 찾지만 비용은 보지 않으므로 진흙 한가운데를 지나갑니다.
        </li>
        <li>
          <T en="Dijkstra's algorithm">다익스트라 알고리즘</T>은 큐 대신 <strong>지금까지 비용이 가장 작은 칸부터</strong> 꺼내는 우선순위 큐를 씁니다. 그래서 길이는 더 길어도 진흙을 피해 위로 돌아가는, 비용이 가장 작은 길을 찾습니다.
        </li>
        <li>
          <strong>A*</strong>는 다익스트라에 "목표까지 남은 거리의 어림값"을 더해 우선순위를 정합니다. 목표 쪽 칸을 먼저 살펴보므로 같은 최소 비용 길을 훨씬 적은 칸만 보고 찾아냅니다. 지도 앱과 게임의 길 찾기가 이 방법을 바탕으로 합니다.
        </li>
        <li>
          <strong>DFS</strong>는 이 열린 지도에서는 오른쪽부터 파고들어 운 좋게 곧장 도착합니다. "미로 만들기"를 누르면 막다른 길을 헤매다 돌아 나오는 DFS의 진짜 모습과, 최단이 아닌 길을 찾는 모습을 볼 수 있습니다.
        </li>
      </ul>
      <Callout kind="note">
        A*가 최소 비용 길을 보장하려면 남은 거리의 어림값이 실제 비용보다 크면 안 됩니다. 여기서는 상하좌우로만 움직이고 한 칸에 최소 1이 들므로, 가로세로 칸 수의 합(맨해튼 거리)이 안전한 어림값입니다. 다익스트라는 우선순위 큐를 이진 힙으로 만들면 <M>{'O((V + E)\\log V)'}</M>입니다.
      </Callout>

      <Callout kind="key">
        그래프 탐색은 대기열에서 무엇을 먼저 꺼내느냐로 갈립니다. 큐면 BFS(간선 수 기준 최단), 스택이면 DFS(깊이 먼저, 최단 보장 없음), 비용이 가장 작은 것부터면 다익스트라(비용 기준 최단), 여기에 목표까지의 어림값을 더하면 A*입니다. BFS와 DFS는 O(V + E)입니다.
      </Callout>
      <Quiz
        q="SNS에서 나와 어떤 사람이 '몇 다리 건너' 아는 사이인지(최소 몇 명을 거치는지) 알고 싶다. 관계에는 가중치가 없다. 가장 알맞은 방법은?"
        options={['DFS', 'BFS', '정렬 후 이진 탐색', '해시 테이블 한 번 조회']}
        answer={1}
        explain={<>가중치가 없는 그래프에서 간선 수가 가장 적은 경로는 BFS가 찾습니다. 출발점에서 거리 1, 2, 3인 사람을 차례로 한 겹씩 방문하기 때문입니다. DFS도 연결되어 있는지는 알 수 있지만, 처음 찾은 경로가 가장 짧다는 보장은 없습니다.</>}
      />
    </>
  );
}

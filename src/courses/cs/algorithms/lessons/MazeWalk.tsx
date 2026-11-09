import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame } from '../../../../lib/canvas';
import { fmt } from '../../../../lib/plot';
import { lerpColor } from '../../../../lib/theme';
import { color3, THREE } from '../../../../lib/three';
import { World3D, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { WALL, search, type Grid, type Search, type SearchResult } from './grid';
import { CELL, GOAL, MH, MW, START, bfsLayers, cellAt, cellCenter, compareSearches, mazeGrid, moveThread, slide, type Compare } from './maze3d';

const WALL_H = 1.1;
const EYE = 0.55;
const N = MW * MH;
const NAMES: Record<Search, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: '다익스트라', astar: 'A*' };

/** What the lesson paints on top of the maze; the scene redraws when `ver` changes. */
interface Overlay {
  ver: number;
  /** Per cell: 0…1 for a painted floor cell (its colour along the accent → highlight ramp), −1 for plain floor. */
  floor: Float32Array;
  /** Cells that get a glowing orb (a found path). */
  path: number[];
  /** Cell with a tall light beam (the search's current cell), or −1. */
  beam: number;
  /** Ariadne's thread, start to walker. */
  thread: number[];
}

const emptyOverlay = (): Overlay => ({ ver: 0, floor: new Float32Array(N).fill(-1), path: [], beam: -1, thread: [] });

/** Face from cell `from` toward its first open neighbour. */
function openYaw(g: Grid, from: number): number {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    const c = from + dy * MW + dx;
    if (g.cells[c] !== WALL) return Math.atan2(-dx, -dy);
  }
  return 0;
}

interface MazeProps {
  grid: Grid;
  seedKey: string;
  view: WorldView;
  fog?: number;
  tallGoal: boolean;
  overlay: React.MutableRefObject<Overlay>;
  api: React.MutableRefObject<WorldApi | null>;
  onMove?: (x: number, z: number) => void;
  onKey: (k: string) => boolean;
  label: string;
  children: (full: boolean) => React.ReactNode;
}

function MazeWorld({ grid, seedKey, view, fog, tallGoal, overlay, api, onMove, onKey, label, children }: MazeProps) {
  const [sx, sz] = cellCenter(grid.start);
  const start = useMemo(() => ({ x: sx, z: sz, yaw: openYaw(grid, grid.start), pitch: -0.08 }), [grid, sx, sz]);
  return (
    <World3D
      label={label}
      height={520}
      bounds={(MW / 2) * CELL}
      ground={() => 0}
      start={start}
      view={view}
      fog={fog}
      eye={EYE}
      speed={1.5}
      skyCamera={{ pos: [0, 17.5, 9.5], target: [0, 0, 0.6] }}
      api={api}
      deps={[seedKey, tallGoal]}
      constrain={(x0, z0, x1, z1) => slide(grid, x0, z0, x1, z1)}
      onMove={(w) => onMove?.(w.x, w.z)}
      onKey={onKey}
      setup={({ scene, palette }) => {
        const P = palette;
        const base = color3(P.surface2);
        // floor: one tile per open cell so the lesson can colour cells
        const open: number[] = [];
        for (let i = 0; i < N; i++) if (grid.cells[i] !== WALL) open.push(i);
        const tileGeo = new THREE.PlaneGeometry(CELL * 0.97, CELL * 0.97).rotateX(-Math.PI / 2);
        const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial(), open.length);
        const m = new THREE.Matrix4();
        open.forEach((c, k) => {
          const [x, z] = cellCenter(c);
          m.makeTranslation(x, 0, z);
          tiles.setMatrixAt(k, m);
          tiles.setColorAt(k, base);
        });
        scene.add(tiles);
        const under = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL + 4, MH * CELL + 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color3(P.lineStrong) }));
        under.position.y = -0.005;
        scene.add(under);

        // walls
        const walls: number[] = [];
        for (let i = 0; i < N; i++) if (grid.cells[i] === WALL) walls.push(i);
        const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.dark ? '#46506a' : '#b4bed0'), roughness: 0.85 });
        const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMat, walls.length);
        walls.forEach((c, k) => {
          const [x, z] = cellCenter(c);
          m.makeTranslation(x, WALL_H / 2, z);
          wallMesh.setMatrixAt(k, m);
        });
        scene.add(wallMesh);

        // start and goal
        const disc = (c: number, col: string) => {
          const [x, z] = cellCenter(c);
          const d = new THREE.Mesh(new THREE.CircleGeometry(CELL * 0.36, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color3(col) }));
          d.position.set(x, 0.006, z);
          scene.add(d);
        };
        disc(grid.start, P.good);
        disc(grid.goal, P.bad);
        const [gx, gz] = cellCenter(grid.goal);
        const goalH = tallGoal ? 4 : 0.8;
        const goalMat = new THREE.MeshStandardMaterial({ color: color3(P.bad), emissive: color3(P.bad), emissiveIntensity: 0.6, transparent: true, opacity: 0.55 });
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, goalH, 16), goalMat);
        beacon.position.set(gx, goalH / 2, gz);
        scene.add(beacon);

        // the search's current cell: a light beam above the walls
        const beamMat = new THREE.MeshBasicMaterial({ color: color3(P.accent), transparent: true, opacity: 0.45, depthWrite: false });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5, 20, 1, true), beamMat);
        beam.visible = false;
        scene.add(beam);

        // path orbs
        const orbMat = new THREE.MeshStandardMaterial({ color: color3(P.pos), emissive: color3(P.pos), emissiveIntensity: 0.7 });
        const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 14, 10), orbMat, N);
        orbs.count = 0;
        orbs.frustumCulled = false;
        scene.add(orbs);

        // Ariadne's thread: one short bar per step, just above the floor
        const threadMat = new THREE.MeshStandardMaterial({ color: color3(P.neg), emissive: color3(P.neg), emissiveIntensity: 0.4 });
        const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 0.05), threadMat, N);
        bars.count = 0;
        bars.frustumCulled = false;
        scene.add(bars);

        const ramp = (t: number) => {
          const c = lerpColor(P.accent, P.hl, t);
          return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).lerp(base, 0.12);
        };
        const q = new THREE.Quaternion();
        const yAxis = new THREE.Vector3(0, 1, 0);
        const one = new THREE.Vector3(1, 1, 1);
        let seen = -1;
        const redraw = () => {
          const o = overlay.current;
          open.forEach((c, k) => tiles.setColorAt(k, o.floor[c] >= 0 ? ramp(o.floor[c]) : base));
          tiles.instanceColor!.needsUpdate = true;
          orbs.count = o.path.length;
          o.path.forEach((c, k) => {
            const [x, z] = cellCenter(c);
            m.makeTranslation(x, 0.32, z);
            orbs.setMatrixAt(k, m);
          });
          orbs.instanceMatrix.needsUpdate = true;
          beam.visible = o.beam >= 0;
          if (o.beam >= 0) {
            const [x, z] = cellCenter(o.beam);
            beam.position.set(x, 2.5, z);
          }
          const th = o.thread;
          bars.count = Math.max(0, th.length - 1);
          for (let k = 1; k < th.length; k++) {
            const [ax, az] = cellCenter(th[k - 1]);
            const [bx, bz] = cellCenter(th[k]);
            q.setFromAxisAngle(yAxis, Math.abs(bx - ax) > 1e-6 ? 0 : Math.PI / 2);
            m.compose(new THREE.Vector3((ax + bx) / 2, 0.03, (az + bz) / 2), q, one);
            bars.setMatrixAt(k - 1, m);
          }
          bars.instanceMatrix.needsUpdate = true;
        };
        return {
          update(_dt, t) {
            if (overlay.current.ver !== seen) {
              seen = overlay.current.ver;
              redraw();
            }
            if (beam.visible) beamMat.opacity = 0.35 + 0.12 * Math.sin(t * 6);
          },
        };
      }}
    >
      {children}
    </World3D>
  );
}

/* ─────────────── Figure 1: the search from inside ─────────────── */

const SEED1 = 3;

function SearchFigure() {
  const [seed, setSeed] = useState(SEED1);
  const grid = useMemo(() => mazeGrid(seed), [seed]);
  const openCount = useMemo(() => grid.cells.reduce((s, c) => s + (c === WALL ? 0 : 1), 0), [grid]);
  const [alg, setAlg] = useState<Search>('bfs');
  const [view, setView] = useState<WorldView>('walk');
  const [rate, setRate] = useState(30);
  const [run, setRun] = useState<{ res: SearchResult; from: number } | null>(null);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [following, setFollowing] = useState(false);
  const acc = useRef(0);
  const api = useRef<WorldApi | null>(null);
  const overlay = useRef<Overlay>(emptyOverlay());

  const total = run?.res.order.length ?? 0;
  const done = !!run && k >= total;

  // paint the first k visited cells, the beam and (when done) the path
  useEffect(() => {
    const o = overlay.current;
    o.floor.fill(-1);
    o.beam = -1;
    o.path = [];
    if (run) {
      const order = run.res.order;
      const shown = Math.min(k, order.length);
      for (let i = 0; i < shown; i++) o.floor[order[i]] = order.length > 1 ? i / (order.length - 1) : 0;
      if (shown < order.length && shown > 0) o.beam = order[shown - 1];
      if (shown >= order.length) o.path = run.res.path;
    }
    o.ver++;
  }, [run, k]);

  useAnimationFrame((dt) => {
    if (!run) return;
    acc.current += dt * rate;
    const n = Math.floor(acc.current);
    if (n <= 0) return;
    acc.current -= n;
    setK((x) => {
      const nx = Math.min(total, x + n);
      if (nx >= total) setPlaying(false);
      return nx;
    });
  }, playing);

  const begin = () => {
    const w = api.current?.get();
    const from = w ? cellAt(w.x, w.z) : grid.start;
    if (from < 0 || grid.cells[from] === WALL) return;
    setFollowing(false);
    setRun({ res: search({ ...grid, start: from }, alg), from });
    setK(0);
    acc.current = 0;
    setPlaying(true);
  };
  const togglePlay = () => {
    if (!run || done) begin();
    else setPlaying((p) => !p);
  };
  const clear = () => {
    setRun(null);
    setK(0);
    setPlaying(false);
    setFollowing(false);
  };
  const reset = () => {
    clear();
    const [x, z] = cellCenter(grid.start);
    api.current?.place({ x, z, yaw: openYaw(grid, grid.start), pitch: -0.08 });
  };
  const pickAlg = (a: Search) => {
    setAlg(a);
    clear();
  };
  const newMaze = () => {
    setSeed((s) => s + 1);
    clear();
  };
  useEffect(() => {
    const [x, z] = cellCenter(grid.start);
    api.current?.place({ x, z, yaw: openYaw(grid, grid.start), pitch: -0.08 });
  }, [grid]);

  // walk the found path, one cell per glide
  const follow = () => {
    if (!done || !run?.res.path.length) return;
    setFollowing((f) => !f);
  };
  useEffect(() => {
    if (!following || !run) return;
    const path = run.res.path;
    let i = 0;
    const id = window.setInterval(() => {
      const a = api.current;
      if (!a || a.gliding()) return;
      if (i >= path.length) {
        setFollowing(false);
        return;
      }
      const [x, z] = cellCenter(path[i++]);
      a.glideTo(x, z, { dur: 0.16, face: true });
    }, 30);
    return () => window.clearInterval(id);
  }, [following, run]);

  const pathLen = run && done ? Math.max(0, run.res.path.length - 1) : null;
  const status = !run
    ? { text: '"탐색 시작"을 누르면 지금 서 있는 칸에서 출구(빨간 기둥)를 찾기 시작합니다.', color: 'var(--ink-2)' }
    : !done
      ? { text: `${NAMES[alg]}가 ${k}번째 칸을 꺼냈습니다. 빛기둥이 지금 살펴보는 칸입니다.`, color: 'var(--ink-2)' }
      : run.res.path.length
        ? { text: `출구까지 ${pathLen}걸음짜리 길을 찾았습니다. 공중의 구슬을 따라가 보세요.`, color: 'var(--good)' }
        : { text: '출구에 닿는 길이 없습니다.', color: 'var(--bad)' };

  const onKey = (key: string) => {
    const act: Record<string, () => void> = {
      ' ': togglePlay,
      enter: follow,
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: reset,
    };
    act[key]?.();
    return key in act;
  };

  return (
    <Figure
      no={1}
      title="미로 안에서 탐색 지켜보기"
      hint="화면을 누르고 W·A·S·D로 걷거나, 탐색 시작을 눌러 보세요"
      caption={
        <>
          가로세로 {MW}칸짜리 미로이고, 열린 칸은 {openCount}개입니다. 탐색은 지금 서 있는 칸에서 출발해 앞 장과 같은 코드로 돌아갑니다. 바닥 색은 칸을 꺼낸 순서(파랑이 먼저, 노랑이 나중)이고, 빛기둥은 지금 꺼낸 칸, 공중의 구슬은 다 찾은 뒤의 경로입니다. 벽은 통과할 수 없습니다. 키: Space 탐색 시작·멈춤, Enter 경로 따라 걷기, V 시점 바꾸기, R 처음 자리로, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <MazeWorld
          grid={grid}
          seedKey={`s${seed}`}
          view={view}
          fog={view === 'walk' ? 14 : undefined}
          tallGoal
          overlay={overlay}
          api={api}
          onKey={onKey}
          label="미로 안을 1인칭으로 걸으며 그래프 탐색이 퍼지는 것을 보는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                {NAMES[alg]} · 꺼낸 칸 <strong>{k}</strong> / {openCount}
                {pathLen !== null && run!.res.path.length > 0 && (
                  <>
                    {' '}
                    · 경로 <strong>{pathLen}</strong>걸음
                  </>
                )}
                <div style={{ color: status.color }}>{status.text}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small primary onClick={togglePlay}>
                    {playing ? '멈추기' : '탐색 시작'}
                  </Button>
                  <Button small onClick={follow} disabled={!done}>
                    {following ? '멈추기' : '경로 따라 걷기'}
                  </Button>
                  <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
                    {view === 'walk' ? '하늘에서' : '1인칭'}
                  </Button>
                </div>
              )}
            </>
          )}
        </MazeWorld>
        <div className="controls">
          <Seg label="탐색 방법" value={alg} onChange={pickAlg} options={(['bfs', 'dfs', 'astar'] as Search[]).map((a) => ({ value: a, label: NAMES[a] }))} />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <Slider id="mw1-rate" label="빠르기 (초당 칸)" value={rate} min={5} max={120} step={5} onChange={setRate} format={(v) => `${v}칸`} color="var(--accent)" />
          <div className="btn-row">
            <Button small primary onClick={togglePlay}>
              {playing ? '멈추기' : run && !done ? '이어서' : '탐색 시작'}
            </Button>
            <Button small onClick={follow} disabled={!done || !run?.res.path.length}>
              {following ? '멈추기' : '경로 따라 걷기'}
            </Button>
            <Button small onClick={reset}>
              처음 자리로
            </Button>
            <Button small onClick={newMaze}>
              새 미로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="꺼낸 칸" value={`${k} / ${total || '–'}`} color="var(--accent)" />
            <Readout label="경로 길이" value={pathLen === null ? '–' : run!.res.path.length ? `${pathLen}걸음` : '없음'} color="var(--pos)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Ariadne's thread ─────────────── */

const SEED2 = 6;

function ThreadFigure() {
  const [seed, setSeed] = useState(SEED2);
  const grid = useMemo(() => mazeGrid(seed), [seed]);
  const [view, setView] = useState<WorldView>('walk');
  const [fogD, setFogD] = useState(2.5);
  const api = useRef<WorldApi | null>(null);
  const overlay = useRef<Overlay>(emptyOverlay());
  const thread = useRef<number[]>([START]);
  const stepped = useRef(new Set<number>([START]));
  const last = useRef<[number, number] | null>(null);
  const dist = useRef(0);
  const [stats, setStats] = useState({ thread: 0, stepped: 1, dist: 0 });
  const [result, setResult] = useState<{ thread: number; stepped: number; dist: number; cmp: Compare[] } | null>(null);
  const [showBest, setShowBest] = useState(false);
  const layers = useMemo(() => bfsLayers(grid, START), [grid]);

  const paint = () => {
    const o = overlay.current;
    o.floor.fill(-1);
    for (const c of stepped.current) o.floor[c] = 0.85;
    o.thread = thread.current.slice();
    o.path = [];
    if (showBest) {
      const r = search(grid, 'bfs');
      o.path = r.path;
    }
    o.beam = -1;
    o.ver++;
  };

  const restart = (g = grid) => {
    thread.current = [START];
    stepped.current = new Set([START]);
    last.current = null;
    dist.current = 0;
    setStats({ thread: 0, stepped: 1, dist: 0 });
    setResult(null);
    setShowBest(false);
    const [x, z] = cellCenter(START);
    api.current?.place({ x, z, yaw: openYaw(g, START), pitch: -0.08 });
    paint();
  };
  useEffect(() => {
    restart(grid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
  useEffect(paint, [showBest]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (x: number, z: number) => {
    const prev = last.current;
    last.current = [x, z];
    dist.current += prev ? Math.hypot(x - prev[0], z - prev[1]) : 0;
    const c = cellAt(x, z);
    const before = thread.current;
    thread.current = moveThread(grid, before, c);
    if (c >= 0 && grid.cells[c] !== WALL) stepped.current.add(c);
    const changed = thread.current !== before;
    setStats({ thread: thread.current.length - 1, stepped: stepped.current.size, dist: dist.current });
    if (changed) paint();
    if (c === GOAL && !result) {
      setResult({ thread: thread.current.length - 1, stepped: stepped.current.size, dist: dist.current, cmp: compareSearches(grid, START) });
    }
  };

  const bfs = result?.cmp.find((x) => x.alg === 'bfs');
  const here = last.current ? cellAt(last.current[0], last.current[1]) : START;
  const toGoal = layers[GOAL];
  const fromStart = here >= 0 ? layers[here] : -1;

  const onKey = (key: string) => {
    const act: Record<string, () => void> = {
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: () => restart(),
    };
    act[key]?.();
    return key in act;
  };

  return (
    <Figure
      no={2}
      title="실을 풀며 미로 빠져나오기"
      hint="안개 속에서 직접 출구를 찾아보세요"
      caption={
        <>
          초록 원에서 출발해 빨간 원(출구)을 찾습니다. 바닥의 파란 실은 출발점에서 지금 자리까지 이어져 있고, 왔던 칸으로 되돌아가면 그만큼 감깁니다. 다른 길로 돌아 실이 깔린 칸에 다시 들어서면 그 사이의 고리만큼 실이 감겨, 실은 언제나 갈림 없는 한 줄입니다. 밟은 칸은 바닥이 노랗게 바뀝니다. 키: V 시점 바꾸기(하늘에서 보면 지도가 보이니 다 푼 뒤에 보세요), R 처음부터, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <MazeWorld
          grid={grid}
          seedKey={`t${seed}`}
          view={view}
          fog={fogD >= 10 ? undefined : fogD}
          tallGoal={false}
          overlay={overlay}
          api={api}
          onMove={onMove}
          onKey={onKey}
          label="안개 낀 미로를 1인칭으로 걸으며 출발점에서 이어진 실을 끌고 다니는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                실 <strong>{stats.thread}</strong>칸 · 밟은 칸 <strong>{stats.stepped}</strong> · 걸은 거리 <strong>{fmt(stats.dist, 0)}</strong>
                <div style={{ color: result ? 'var(--good)' : 'var(--ink-2)' }}>
                  {result
                    ? `출구입니다! 실은 ${result.thread}칸, 가장 짧은 길은 ${bfs?.path}칸입니다.`
                    : fromStart >= 0
                      ? `출발점에서 가장 짧게 오면 ${fromStart}걸음인 칸에 서 있습니다.`
                      : ''}
                </div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
                    {view === 'walk' ? '하늘에서' : '1인칭'}
                  </Button>
                  <Button small onClick={() => restart()}>
                    처음부터
                  </Button>
                </div>
              )}
            </>
          )}
        </MazeWorld>
        <div className="controls">
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <Slider id="mw2-fog" label="안개 속에서 보이는 거리" value={fogD} min={1.2} max={10} step={0.1} onChange={setFogD} format={(v) => (v >= 10 ? '맑음' : `${fmt(v, 1)}칸`)} color="var(--ink-3)" />
          <div className="btn-row">
            <Button small onClick={() => restart()}>
              처음부터
            </Button>
            <Button small onClick={() => setSeed((s) => s + 1)}>
              새 미로
            </Button>
            <Button small onClick={() => setShowBest((b) => !b)} disabled={!result}>
              {showBest ? '최단 경로 숨기기' : '최단 경로 보기'}
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실 길이" value={`${stats.thread}칸`} color="var(--neg)" />
            <Readout label="밟은 칸" value={stats.stepped} color="var(--hl)" />
            <Readout label="출발점 → 출구 최단" value={`${toGoal}걸음`} />
            <Readout label="걸은 거리" value={fmt(stats.dist, 1)} />
          </div>
          {result && (
            <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {result.cmp.map((c) => (
                <Readout key={c.alg} label={`${NAMES[c.alg]}가 꺼낸 칸`} value={`${c.visited}칸 · 길 ${c.path}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function MazeWalk() {
  return (
    <>
      <h2>미로 안에 서면</h2>
      <p>
        <a href="#cs-algorithms/graph-search">그래프 탐색</a>에서는 미로를 위에서 내려다보며 BFS와 DFS가 칸을 칠해 가는 모습을 봤습니다. 그런데 알고리즘은 그런 지도를 본 적이 없습니다. 칸 하나를 꺼냈을 때 아는 것은 그 칸의 이웃 네 칸이 벽인지 아닌지뿐입니다. 이번 장에서는 미로 안으로 직접 들어가, 벽 너머가 보이지 않는 자리에서 탐색을 지켜봅니다.
      </p>
      <p>
        아래 그림을 한 번 누르면 키보드로 걸을 수 있습니다. W·A·S·D나 화살표 키로 걷고, 화면을 끌어 둘러봅니다. 휴대폰에서는 왼쪽 아래 동그란 막대로 걷습니다. 전체 화면(F 키)으로 보면 미로 안에 있는 느낌이 훨씬 강해집니다.
      </p>
      <SearchFigure />
      <p>
        처음 자리에서 BFS로 탐색을 시작하고 1인칭 시점 그대로 지켜보세요. 바닥 색이 물이 차오르듯 모든 통로로 고르게 번져 나갑니다. BFS는 큐에서 먼저 들어온 칸부터 꺼내므로, 출발점에서 1걸음인 칸을 모두 본 뒤에 2걸음인 칸을, 그다음 3걸음인 칸을 봅니다. 그래서 바닥의 같은 색은 출발점에서 같은 거리인 칸들이고, 빛기둥은 한 통로에 머물지 않고 여러 갈래를 번갈아 오갑니다. 이 미로에서 BFS는 열린 칸 213개 가운데 207개를 꺼낸 뒤에야 출구에 닿고, 찾은 길은 52걸음입니다.
      </p>
      <p>
        이제 DFS로 바꿔 같은 자리에서 다시 시작해 보세요. 빛기둥이 한 통로를 따라 막다른 곳까지 곧장 달려가다가, 막히면 순간 이동하듯 뒤쪽의 갈림길로 돌아가 다른 길로 들어섭니다. 이 순간 이동이 스택에서 칸을 꺼내는 순간입니다. 스택의 맨 위에는 가장 최근에 본 갈림길의 다른 갈래가 있기 때문입니다. DFS는 132칸만 보고 출구에 닿지만, 찾은 길은 68걸음입니다. 먼저 들어선 갈래를 끝까지 따라갔을 뿐 짧은 길을 찾으려 한 적이 없기 때문에, 52걸음짜리 길이 있는데도 16걸음을 더 돌아갑니다. "경로 따라 걷기"로 두 길을 직접 걸어 비교해 보세요.
      </p>
      <p>
        A*는 칸을 꺼낼 때 "지금까지 온 거리 + 출구까지의 맨해튼 거리"가 가장 작은 칸을 고릅니다. 1인칭으로 보면 빛기둥이 출구 쪽 통로를 먼저 파고들고, 출구에서 멀어지는 통로는 뒤로 미룹니다. 93칸만 보고도 BFS와 같은 52걸음짜리 길을 찾습니다. 맨해튼 거리는 벽을 무시한 거리라서 실제 거리보다 길 수 없으므로, A*가 찾은 길도 가장 짧다는 것이 보장됩니다.
      </p>
      <Callout kind="key">
        벽이 없는 격자에서 걸음마다 비용이 같다면, BFS는 출발점에서 가까운 칸부터 거리 순서대로 보므로 처음 닿은 길이 곧 가장 짧은 길입니다. DFS는 길을 찾기는 하지만 가장 짧다는 보장이 없습니다. A*는 출구까지의 거리를 넘겨짚지 않는 어림값을 써서, 가장 짧은 길을 찾으면서도 BFS보다 적은 칸을 봅니다.
      </Callout>

      <h2>아리아드네의 실</h2>
      <p>
        그리스 신화에서 테세우스는 미궁에 들어가며 아리아드네에게 받은 실타래를 풀었습니다. 막다른 길에 닿으면 실을 감으며 되돌아가고, 아직 실이 지나가지 않은 갈래로 들어갑니다. 이것이 정확히 DFS입니다. 바닥에 깔린 실이 스택이고, 실을 푸는 것이 넣기(push), 감으며 되돌아가는 것이 꺼내기(pop)입니다. 19세기에는 분필로 통로에 표시를 하며 미로를 푸는 방법(<T en="Trémaux's algorithm">트레모의 방법</T>)이 알려져 있었는데, 이것도 같은 깊이 우선 탐색입니다.
      </p>
      <p>
        이번에는 지도도 빛기둥도 없이 직접 탐색기가 되어 봅니다. 안개가 짙어서 두세 칸 앞까지만 보입니다.
      </p>
      <ThreadFigure />
      <p>
        출구에 닿으면 바닥의 실이 출발점에서 출구까지 이어진 길 하나가 됩니다. 실은 늘 갈림 없는 한 줄이므로 이 길에는 군더더기가 없지만, 가장 짧다는 보장은 없습니다. 어느 갈래로 먼저 들어섰느냐에 따라 길이가 달라집니다. "최단 경로 보기"를 누르면 BFS가 찾은 가장 짧은 길이 구슬로 나타나니, 실과 겹쳐 보세요.
      </p>
      <p>
        실의 길이는 DFS가 기억해야 하는 양이기도 합니다. 지금 서 있는 곳까지의 길 하나만 기억하면 되므로, 미로가 아무리 넓어도 길이 길지 않으면 기억할 것이 적습니다. BFS는 그렇게 할 수 없습니다. 같은 거리의 칸을 모두 큐에 들고 다니며, 사람으로 치면 모든 갈래에 동시에 한 명씩 사람을 보내야 합니다. 혼자 미로에 들어간 사람이 자연스럽게 DFS로 걷게 되는 이유입니다.
      </p>
      <Quiz
        q="그림 1의 미로에서 DFS가 찾은 길은 68걸음, BFS가 찾은 길은 52걸음이었습니다. 왜 다를까요?"
        options={['DFS가 칸을 더 적게 봐서 계산을 틀렸다', 'DFS는 처음 들어선 갈래를 끝까지 따라가 처음 닿은 길을 돌려주므로, 그 길이 가장 짧다는 보장이 없다', 'BFS는 벽을 통과할 수 있다', '미로에 길이 하나뿐이라서 원래 같아야 하는데, 반올림 오차 때문이다']}
        answer={1}
        explain={<>DFS는 가장 짧은 길을 찾으려 하지 않습니다. 오른쪽부터 갈래를 골라 깊이 들어가고, 출구에 처음 닿은 순간의 스택(실)이 곧 답입니다. BFS는 거리 순서대로 칸을 보므로 처음 닿은 순간의 길이 가장 짧은 길입니다.</>}
      />
    </>
  );
}

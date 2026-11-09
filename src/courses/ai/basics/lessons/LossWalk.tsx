import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { fmt } from '../../../../lib/plot';
import { color3, surfaceMesh, THREE } from '../../../../lib/three';
import { World3D, drapeSegment, makeArrow, pointArrow, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { R, TERRAINS, f2, gridMin, numGrad, optStep, type OptKind, type OptState, type TerrainId } from './landscape';

/*
 * Coordinates: a parameter point (u, v) stands at world (x, z) = (u, −v), at height L(u, v) · zs.
 */

const MAX_TRAIL = 600;
const FLAT = 1e-3;

type Trail = ([number, number] | null)[];

interface LandscapeProps {
  f: (u: number, v: number) => number;
  zs: number;
  start: [number, number];
  yaw: number;
  view: WorldView;
  fog?: number;
  flags?: [number, number][];
  rebuildKey: string;
  api: React.MutableRefObject<WorldApi | null>;
  trail: React.MutableRefObject<{ pts: Trail; ver: number }>;
  onMove: (u: number, v: number) => void;
  onKey: (k: string) => boolean;
  label: string;
  children: (full: boolean) => React.ReactNode;
}

/** The walkable loss surface, with a downhill arrow at the walker's feet and the trail of optimizer steps. */
function LandscapeWorld({ f, zs, start, yaw, view, fog, flags = [], rebuildKey, api, trail, onMove, onKey, label, children }: LandscapeProps) {
  const ground = (x: number, z: number) => f(x, -z) * zs;
  return (
    <World3D
      label={label}
      height={520}
      bounds={R}
      ground={ground}
      start={{ x: start[0], z: -start[1], yaw, pitch: -0.42 }}
      view={view}
      fog={fog}
      eye={0.1}
      speed={0.55}
      api={api}
      deps={[rebuildKey]}
      onMove={(w) => onMove(w.x, -w.z)}
      onKey={onKey}
      setup={({ scene, palette, walker }) => {
        const { group } = surfaceMesh(f, { range: R, n: 150, lo: palette.dark ? '#0f6b56' : '#0c8467', hi: palette.dark ? '#4a5770' : '#f1f4f8', zScale: zs, wireColor: palette.dark ? '#ffffff' : '#0d1530' });
        scene.add(group);

        // downhill arrow (−∇L) at the walker's feet
        const arrow = makeArrow(color3(palette.pos), 0.0045);
        scene.add(arrow);

        // trail of optimizer steps: draped line segments plus a dot at each step
        const segVerts = 17;
        const linePos = new Float32Array(MAX_TRAIL * (segVerts - 1) * 2 * 3);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        const line = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: color3(palette.neg) }));
        line.frustumCulled = false;
        scene.add(line);
        const dotPos = new Float32Array((MAX_TRAIL + 1) * 3);
        const dotGeo = new THREE.BufferGeometry();
        dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
        const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: color3(palette.neg), size: 0.035, sizeAttenuation: true }));
        dots.frustumCulled = false;
        scene.add(dots);

        // flags on the minima
        for (const [u, v] of flags) {
          const flag = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.45, 8), new THREE.MeshStandardMaterial({ color: color3(palette.ink2) }));
          pole.position.y = 0.225;
          // two crossed cloths so the flag reads from every direction
          const clothMat = new THREE.MeshStandardMaterial({ color: color3(palette.good), side: THREE.DoubleSide, emissive: color3(palette.good), emissiveIntensity: 0.3 });
          for (const r of [0, Math.PI / 2]) {
            const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), clothMat);
            cloth.position.y = 0.39;
            cloth.rotation.y = r;
            cloth.translateX(0.08);
            flag.add(cloth);
          }
          flag.add(pole);
          flag.position.set(u, f(u, v) * zs, -v);
          scene.add(flag);
        }

        const g = (x: number, z: number) => f(x, -z) * zs;
        let seenVer = -1;
        const rebuildTrail = () => {
          const pts = trail.current.pts;
          let li = 0;
          let di = 0;
          for (let i = 0; i < pts.length && di < MAX_TRAIL + 1; i++) {
            const p = pts[i];
            if (!p) continue;
            dotPos[di * 3] = p[0];
            dotPos[di * 3 + 1] = g(p[0], -p[1]) + 0.012;
            dotPos[di * 3 + 2] = -p[1];
            di++;
            const q = pts[i - 1];
            if (!q || li >= MAX_TRAIL * (segVerts - 1) * 2) continue;
            const seg = drapeSegment(g, [q[0], -q[1]], [p[0], -p[1]], 0.008, segVerts - 1);
            for (let k = 0; k < seg.length - 1; k++) {
              linePos.set([seg[k].x, seg[k].y, seg[k].z, seg[k + 1].x, seg[k + 1].y, seg[k + 1].z], li * 3);
              li += 2;
            }
          }
          lineGeo.setDrawRange(0, li);
          lineGeo.attributes.position.needsUpdate = true;
          dotGeo.setDrawRange(0, di);
          dotGeo.attributes.position.needsUpdate = true;
        };

        const from = new THREE.Vector3();
        const dir = new THREE.Vector3();
        return {
          update() {
            if (trail.current.ver !== seenVer) {
              seenVer = trail.current.ver;
              rebuildTrail();
            }
            const u = walker.x;
            const v = -walker.z;
            const [gu, gv] = numGrad(f, u, v);
            const m = Math.hypot(gu, gv);
            // hide it where the ground is practically flat (the optimizer has stopped there too)
            arrow.visible = m > 0.005;
            if (!arrow.visible) return;
            // unit horizontal downhill direction in world (x, z), dropping m·zs per unit of horizontal travel
            dir.set(-gu / m, -m * zs, gv / m);
            // start a little ahead of the feet (along the arrow) so it is not right under the eye
            const ax = walker.x - (gu / m) * 0.08;
            const az = walker.z + (gv / m) * 0.08;
            from.set(ax, g(ax, az) + 0.01, az);
            pointArrow(arrow, from, dir, 0.08 + 0.3 * Math.min(m, 1.5));
          },
        };
      }}
    >
      {children}
    </World3D>
  );
}

/** Drives an optimizer from wherever the walker stands; shared by both figures. */
function useStepper(f: (u: number, v: number) => number, kind: OptKind, lr: number, opts: { face: boolean; dur: number; autoDur: number; done?: (u: number, v: number) => boolean }) {
  const api = useRef<WorldApi | null>(null);
  const trail = useRef<{ pts: Trail; ver: number }>({ pts: [], ver: 0 });
  const last = useRef<OptState | null>(null);
  const [steps, setSteps] = useState(0);
  const [auto, setAuto] = useState(false);
  const [stalled, setStalled] = useState(false);
  /** Step count at which `opts.done` first held in the current run. */
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const count = useRef(0);

  const step = (dur = opts.dur): boolean => {
    const a = api.current;
    if (!a || a.gliding()) return true;
    const w = a.get();
    const u = w.x;
    const v = -w.z;
    const l = last.current;
    // The walker moved on foot since the last step: start a fresh run (and forget the momentum) from here.
    const fresh = !l || Math.hypot(l.u - u, l.v - v) > 1e-6;
    const s: OptState = fresh ? { u, v, vu: 0, vv: 0 } : l;
    if (fresh) {
      trail.current.pts.push(null, [u, v]);
      count.current = 0;
      setDoneAt(null);
    }
    const n = optStep(f, s, kind, lr);
    const moved = Math.hypot(n.u - u, n.v - v);
    if (moved < FLAT) {
      setStalled(true);
      last.current = { ...n, u, v };
      return false;
    }
    setStalled(false);
    last.current = n;
    a.glideTo(n.u, -n.v, { dur, face: opts.face });
    const pts = trail.current.pts;
    pts.push([n.u, n.v]);
    if (pts.length > MAX_TRAIL) pts.splice(0, pts.length - MAX_TRAIL);
    trail.current.ver++;
    setSteps((k) => k + 1);
    count.current++;
    if (opts.done?.(n.u, n.v)) {
      setDoneAt(count.current);
      return false;
    }
    return true;
  };

  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!auto) return;
    let n = 0;
    // poll often and step as soon as the previous glide has finished
    const id = window.setInterval(() => {
      if (api.current?.gliding()) return;
      n++;
      if (!stepRef.current(opts.autoDur) || n > 400) setAuto(false);
    }, 40);
    return () => window.clearInterval(id);
  }, [auto, opts.autoDur]);

  const clear = () => {
    trail.current = { pts: [], ver: trail.current.ver + 1 };
    last.current = null;
    count.current = 0;
    setSteps(0);
    setAuto(false);
    setStalled(false);
    setDoneAt(null);
  };

  // A new learning rate or optimizer starts a fresh run from where the walker stands.
  useEffect(() => {
    last.current = null;
    setStalled(false);
  }, [kind, lr]);

  return { api, trail, steps, auto, setAuto, stalled, doneAt, step, clear };
}

function useReadout(f: (u: number, v: number) => number, start: [number, number]) {
  const [pos, setPos] = useState<[number, number]>(start);
  const L = f(pos[0], pos[1]);
  const [gu, gv] = numGrad(f, pos[0], pos[1]);
  return { pos, setPos, L, grad: Math.hypot(gu, gv) };
}

const fogLabel = (d: number) => (d >= 6 ? '맑음' : fmt(d, 1));

/* ─────────────── Figure 1: walking down in the fog ─────────────── */

const START1: [number, number] = [-2, 1.25];
const yawDownhill = (f: (u: number, v: number) => number, [u, v]: [number, number]) => {
  const [gu, gv] = numGrad(f, u, v);
  // travel direction in world (x, z) is (−gu, gv); yaw = atan2(−dx, −dz)
  return Math.atan2(gu, -gv);
};

function FogFigure() {
  const [view, setView] = useState<WorldView>('walk');
  const [fogD, setFogD] = useState(1);
  const [lr, setLr] = useState(0.3);
  const st = useStepper(f2, 'sgd', lr, { face: true, dur: 0.45, autoDur: 0.32 });
  const rd = useReadout(f2, START1);
  const best = useMemo(() => gridMin(f2), []);
  const yaw0 = useMemo(() => yawDownhill(f2, START1), []);

  const reset = () => {
    st.clear();
    st.api.current?.place({ x: START1[0], z: -START1[1], yaw: yaw0, pitch: -0.42 });
  };

  const atBest = rd.L - best.f < 0.02;
  const flat = rd.grad < 0.02 || st.stalled;
  const status = atBest
    ? { text: '가장 깊은 골짜기의 바닥입니다. 이 지형의 전역 최솟값이에요.', color: 'var(--good)' }
    : flat
      ? { text: '발밑이 평평합니다. 골짜기 바닥에 닿았지만, 여기가 가장 깊은 곳인지는 안개 속에서 알 수 없습니다.', color: 'var(--hl)' }
      : { text: '발밑 화살표가 가장 가파른 내리막(−∇L)입니다.', color: 'var(--ink-2)' };

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      ' ': () => st.step(),
      enter: () => st.setAuto((a) => !a),
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: () => reset(),
    };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={1}
      title="안개 속에서 산 내려가기"
      hint="화면을 누르고 W·A·S·D로 걷거나, 한 걸음을 눌러 보세요"
      caption={
        <>
          지형은 <a href="#ai-basics/gradient-descent">경사하강법</a> 그림 2와 같은 손실 지형이고, 높이가 손실 <M>{'L(u, v)'}</M>입니다. 발밑 화살표는 그래디언트의 반대 방향이고, 길이는 경사의 크기를 나타냅니다. "한 걸음"은 지금 서 있는 곳에서 <M>{'\\theta \\leftarrow \\theta - \\eta\\nabla L'}</M>를 한 번 계산해 그 자리로 옮겨 줍니다. 직접 걸어서 다른 곳에 선 다음 누르면 거기서 새로 출발합니다. 키: Space 한 걸음, Enter 자동, V 시점 바꾸기, R 처음으로, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <LandscapeWorld
          f={f2}
          zs={1}
          start={START1}
          yaw={yaw0}
          view={view}
          fog={fogD >= 6 ? Infinity : fogD}
          rebuildKey="fog"
          api={st.api}
          trail={st.trail}
          onMove={(u, v) => rd.setPos([u, v])}
          onKey={onKey}
          label="손실 지형 위를 1인칭으로 걷는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                손실(고도) <strong>{fmt(rd.L, 3)}</strong> · 경사 <strong>{fmt(rd.grad, 3)}</strong> · {st.steps}걸음
                <div style={{ color: status.color }}>{status.text}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small primary onClick={() => st.step()}>
                    한 걸음
                  </Button>
                  <Button small onClick={() => st.setAuto((a) => !a)}>
                    {st.auto ? '멈추기' : '자동'}
                  </Button>
                  <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
                    {view === 'walk' ? '하늘에서' : '1인칭'}
                  </Button>
                </div>
              )}
            </>
          )}
        </LandscapeWorld>
        <div className="controls">
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <Slider id="lw1-fog" label="안개 속에서 보이는 거리" value={fogD} min={0.3} max={6} step={0.1} onChange={setFogD} format={fogLabel} color="var(--ink-3)" />
          <Slider id="lw1-lr" label="학습률 η (보폭)" value={lr} min={0.05} max={1.2} step={0.05} onChange={setLr} format={(v) => fmt(v, 2)} color="var(--c-ml)" />
          <div className="btn-row">
            <Button small primary onClick={() => st.step()} disabled={st.auto}>
              한 걸음
            </Button>
            <Button small onClick={() => st.setAuto((a) => !a)}>
              {st.auto ? '멈추기' : '자동으로 내려가기'}
            </Button>
            <Button small onClick={reset}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="손실 L" value={fmt(rd.L, 3)} color="var(--pos)" />
            <Readout label="경사 |∇L|" value={fmt(rd.grad, 3)} />
            <Readout label="걸음 수" value={st.steps} />
            <Readout label="가장 깊은 곳" value={fmt(best.f, 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: ravine, saddle and plateau ─────────────── */

function TerrainFigure() {
  const [tid, setTid] = useState<TerrainId>('ravine');
  const terrain = TERRAINS.find((t) => t.id === tid)!;
  const [kind, setKind] = useState<OptKind>('sgd');
  const [lr, setLr] = useState(terrain.lr);
  const [view, setView] = useState<WorldView>('walk');
  const nearFlag = (u: number, v: number) => Math.min(...terrain.minima.map(([a, b]) => Math.hypot(u - a, v - b)));
  const st = useStepper(terrain.f, kind, lr, { face: false, dur: 0.3, autoDur: 0.14, done: (u, v) => nearFlag(u, v) < 0.1 });
  const rd = useReadout(terrain.f, terrain.start);

  const reset = (t = terrain) => {
    st.clear();
    st.api.current?.place({ x: t.start[0], z: -t.start[1], yaw: t.yaw, pitch: -0.42 });
    rd.setPos(t.start);
  };
  const pickTerrain = (id: TerrainId) => {
    const t = TERRAINS.find((x) => x.id === id)!;
    setTid(id);
    setLr(t.lr);
    reset(t);
  };

  const dist = nearFlag(rd.pos[0], rd.pos[1]);
  const flat = rd.grad < 0.01 || st.stalled;
  const status = st.doneAt !== null
    ? { text: `깃발에서 0.1 안쪽에 들어왔습니다. ${st.doneAt}걸음 걸렸어요.`, color: 'var(--good)' }
    : dist < 0.1
      ? { text: '깃발 근처입니다.', color: 'var(--good)' }
      : flat
        ? { text: '기울기가 0이라 더 움직이지 않습니다. 그런데 깃발(최솟값)은 여기가 아닙니다.', color: 'var(--bad)' }
        : { text: kind === 'sgd' ? '보통의 경사하강법(SGD)으로 걷습니다.' : '모멘텀(β = 0.9)으로 걷습니다.', color: 'var(--ink-2)' };

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      ' ': () => st.step(),
      enter: () => st.setAuto((a) => !a),
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: () => reset(),
    };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={2}
      title="걷기 힘든 지형 세 곳"
      hint="지형을 고르고 자동으로 걸어 보세요"
      caption={
        <>
          깃발이 손실이 가장 낮은 곳입니다. 높이는 지형마다 보기 좋게 늘이거나 줄였고, 계산에는 영향이 없습니다. 같은 학습률로 SGD와 모멘텀을 번갈아 돌려 걸음 수를 비교해 보세요. 걷다가 직접 옆으로 비켜선 뒤 이어서 누르면, 그 자리에서 모멘텀(속도)을 0으로 놓고 새로 출발합니다.
        </>
      }
    >
      <div className="fig-split">
        <LandscapeWorld
          f={terrain.f}
          zs={terrain.zs}
          start={terrain.start}
          yaw={terrain.yaw}
          view={view}
          flags={terrain.minima}
          rebuildKey={tid}
          api={st.api}
          trail={st.trail}
          onMove={(u, v) => rd.setPos([u, v])}
          onKey={onKey}
          label="협곡, 안장점, 고원 지형을 1인칭으로 걷는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                {terrain.name} · 손실 <strong>{fmt(rd.L, 3)}</strong> · 경사 <strong>{fmt(rd.grad, 3)}</strong> · {st.steps}걸음
                <div style={{ color: status.color }}>{status.text}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small primary onClick={() => st.setAuto((a) => !a)}>
                    {st.auto ? '멈추기' : '자동'}
                  </Button>
                  <Button small onClick={() => reset()}>
                    처음으로
                  </Button>
                </div>
              )}
            </>
          )}
        </LandscapeWorld>
        <div className="controls">
          <Seg label="지형" value={tid} onChange={pickTerrain} options={TERRAINS.map((t) => ({ value: t.id, label: t.name }))} />
          <Seg label="방법" value={kind} onChange={(k) => { setKind(k); reset(); }} options={[{ value: 'sgd', label: 'SGD' }, { value: 'momentum', label: '모멘텀' }]} />
          <Slider id="lw2-lr" label="학습률 η" value={lr} min={0.05} max={1.2} step={0.05} onChange={(v) => { setLr(v); reset(); }} format={(v) => fmt(v, 2)} color="var(--c-ml)" />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <div className="btn-row">
            <Button small primary onClick={() => st.setAuto((a) => !a)}>
              {st.auto ? '멈추기' : '자동으로 걷기'}
            </Button>
            <Button small onClick={() => st.step()} disabled={st.auto}>
              한 걸음
            </Button>
            <Button small onClick={() => reset()}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="손실 L" value={fmt(rd.L, 3)} color="var(--pos)" />
            <Readout label="경사 |∇L|" value={fmt(rd.grad, 3)} />
            <Readout label="걸음 수" value={st.steps} />
            <Readout label="깃발까지" value={fmt(dist, 2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LossWalk() {
  return (
    <>
      <h2>공이 되어 보기</h2>
      <p>
        <a href="#ai-basics/gradient-descent">경사하강법</a>에서는 손실 지형을 하늘에서 내려다보며 공이 굴러가는 모습을 지켜봤습니다. 그런데 실제 옵티마이저는 그런 지도를 가진 적이 없습니다. 아는 것은 지금 서 있는 점의 손실과 그 점의 <a href="#ai-basics/gradients">그래디언트</a>뿐입니다. 이번 장에서는 직접 그 공이 되어, 안개가 낀 손실 지형 위에 서 봅니다.
      </p>
      <p>
        아래 그림을 한 번 누르면 키보드로 걸을 수 있습니다. W·A·S·D나 화살표 키로 걷고, 화면을 끌어 둘러봅니다. 휴대폰에서는 왼쪽 아래 동그란 막대로 걷습니다. 오른쪽 위 단추나 F 키로 전체 화면을 켜면 지형 안에 들어간 느낌이 훨씬 강해집니다.
      </p>
      <FogFigure />
      <p>
        처음 자리에서 "자동으로 내려가기"를 눌러 보세요. 학습률 0.3이면 17걸음 만에 손실이 약 −0.41인 골짜기 바닥에 멈춥니다. 발밑 화살표가 점점 짧아지다가 사라지는 것은 경사가 0에 가까워진다는 뜻이고, 경사가 0이면 <M>{'\\eta\\nabla L'}</M>도 0이라 더는 움직이지 않습니다. 이제 시점을 "하늘에서"로 바꿔 보세요. 안개 밖에서 보면 조금 떨어진 곳에 훨씬 깊은 골짜기(손실 약 −0.91)가 있습니다. 공은 그 골짜기를 한 번도 본 적이 없습니다.
      </p>
      <p>
        학습률을 0.1로 줄이면 같은 골짜기에 더 천천히(40걸음) 도착합니다. 0.6으로 키우면 걸음이 골짜기 폭보다 커져서 얕은 골짜기의 양쪽 비탈을 끝없이 오갑니다. 1.0까지 키우면 큰 걸음 덕분에 얕은 골짜기를 빠져나와 가장 깊은 골짜기로 건너가지만, 이번에는 그 골짜기의 양쪽 비탈을 오가며 바닥에 닿지 못합니다. 큰 걸음은 멀리 가는 데, 작은 걸음은 바닥에 내려앉는 데 좋습니다. 처음에는 학습률을 크게 두었다가 점점 줄이는 <T en="learning rate schedule">학습률 스케줄</T>은 이 둘을 함께 얻으려는 방법입니다.
      </p>
      <Callout kind="key">
        그래디언트는 발밑의 정보입니다. 경사하강법은 "지금 이 점에서 가장 가파른 내리막"만 알고 움직이므로, 도착한 곳이 가장 깊은 곳이라는 보장이 없습니다. 안개를 짙게 해 두고 직접 걸어서 가장 깊은 골짜기를 찾아보면 옵티마이저가 처한 상황을 몸으로 느낄 수 있습니다.
      </Callout>

      <h2>걷기 힘든 지형</h2>
      <p>골짜기가 여러 개인 것만 문제가 아닙니다. 신경망의 손실 지형에는 경사하강법이 특히 힘들어하는 모양이 자주 나타납니다. 세 가지를 골라 직접 걸어 봅니다.</p>
      <ul>
        <li>
          <strong>좁은 협곡</strong>: 한 방향(가로)으로는 벽처럼 가파르고 다른 방향(세로, 골짜기 바닥을 따라)으로는 거의 평평합니다. 손실이 <M>{'0.005u^2 + 0.8v^2'}</M>이라 두 방향의 곡률이 160배 차이 납니다.
        </li>
        <li>
          <strong>안장점</strong>: 말안장처럼 한쪽으로는 오르막, 다른 쪽으로는 내리막인 점입니다. 그 점에서는 그래디언트가 정확히 0입니다.
        </li>
        <li>
          <strong>고원</strong>: 높고 넓은 평지가 이어지다가 갑자기 절벽으로 떨어지는 지형입니다. 평지에서는 경사가 거의 0입니다.
        </li>
      </ul>
      <TerrainFigure />
      <p>
        <strong>협곡</strong>에서 SGD(학습률 1.1)로 자동으로 걸으면, 1인칭 시점에서 양쪽 벽을 번갈아 오르내리는 것이 보입니다. 가파른 방향에 맞춘 걸음이 협곡 폭보다 커서 매번 건너편으로 넘어가기 때문입니다. 학습률을 줄이면 지그재그는 사라지지만 이번에는 바닥을 따라 거의 나아가지 못합니다. 평평한 방향의 경사가 너무 작아서입니다. 어느 쪽이든 오래 걸려서, 학습률 1.1에서는 깃발까지 280걸음이 걸립니다. 같은 학습률로 모멘텀을 고르면 51걸음입니다. 좌우로 흔들리는 성분은 걸음마다 부호가 바뀌어 속도에 쌓이지 않고 서로 상쇄되지만, 바닥을 따라가는 성분은 늘 같은 방향이라 속도가 계속 쌓이기 때문입니다.
      </p>
      <MB note="β = 0.9이면 같은 방향의 기울기가 계속될 때 걸음이 최대 1/(1−β) = 10배까지 커집니다.">{'v \\leftarrow \\beta v + \\nabla L, \\qquad \\theta \\leftarrow \\theta - \\eta v'}</MB>
      <p>
        <strong>안장점</strong>에서는 능선 한가운데에서 출발합니다. SGD는 24걸음이면 안장 한가운데에 닿고, 그 뒤로는 거의 움직이지 않다가 멈춥니다. 그래디언트가 0이니 골짜기 바닥에 도착한 것과 구별되지 않지만, 깃발은 양옆 골짜기에 있습니다. 모멘텀도 마찬가지로 안장에 멈춥니다. 이제 A나 D 키로 옆으로 아주 조금만 비켜선 뒤 다시 걸어 보세요. 0.05만 비켜서도 공은 안장에서 미끄러져 한쪽 골짜기로 내려갑니다. 변수가 수백만 개인 신경망의 손실 지형에서는 모든 방향이 오르막인 지역 최솟값보다, 어떤 방향으로는 내리막이 남아 있는 안장점이 훨씬 흔하다고 알려져 있습니다. 미니배치의 잡음(<T en="stochastic gradient descent">확률적 경사하강법</T>)이 이렇게 공을 옆으로 살짝 밀어 안장점을 빠져나오게 도와줍니다.
      </p>
      <p>
        <strong>고원</strong>에서 SGD(학습률 0.5)는 처음 15걸음 동안 중심 쪽으로 0.5도 나아가지 못합니다. 그러다 절벽 끝에 닿으면 갑자기 경사가 커져서 한 걸음에 0.8 가까이 뛰어내립니다. 모멘텀은 평지에서 속도를 모아 9걸음째에 벌써 절벽을 내려가지만, 그 속도 그대로 분지를 건너 반대편 비탈까지 올라갔다가 몇 번 오간 뒤에 자리를 잡습니다. 그래도 깃발에는 22걸음 만에 들어가서, 48걸음 걸린 SGD보다 빠릅니다.
      </p>
      <Callout kind="note">
        실제 신경망은 변수가 둘이 아니라 수백만 개라서 이런 지형을 눈으로 볼 수 없습니다. 그래서 학습이 느리면 "고원에 있나", 손실이 들쭉날쭉하면 "협곡에서 지그재그하나"처럼 2차원 그림에 빗대어 생각합니다. 모멘텀과 <a href="#ai-basics/gradient-descent">Adam</a> 같은 방법은 바로 이런 지형을 지나가려고 만든 것입니다.
      </Callout>
      <Quiz
        q="경사하강법이 그래디언트가 0인 점에 도착해 멈췄습니다. 이 점에 대해 확실히 말할 수 있는 것은?"
        options={['손실이 가장 낮은 전역 최솟값이다', '지역 최솟값이다', '최솟값, 최댓값, 안장점 가운데 하나인 정지점이다', '학습률이 너무 컸다']}
        answer={2}
        explain={<>그래디언트가 0이라는 것은 발밑이 평평하다는 뜻일 뿐입니다. 그림 1의 얕은 골짜기처럼 지역 최솟값일 수도 있고, 그림 2의 안장점처럼 옆으로 내리막이 남아 있는 점일 수도 있습니다. 어느 쪽인지는 주변을 더 살펴봐야 알 수 있습니다.</>}
      />
    </>
  );
}

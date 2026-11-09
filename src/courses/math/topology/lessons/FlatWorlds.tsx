import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import type { Palette } from '../../../../lib/theme';
import { color3, textSprite, THREE } from '../../../../lib/three';
import { World3D, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { L, clampWalls, loopStep, parity, recenter, tileOf, tileWord, tilesFor, type GlueId, type Loop } from './flatworld';

/*
 * World coordinates: floor point (u, v) stands at (x, z) = (u, −v), so the reader starts looking along +v.
 */

const EYE = 0.45;
const R = 3;
const MAX_TRAIL = 6000;
const GLUE_NAMES: Record<GlueId, string> = { none: '벽', cylinder: '원기둥', torus: '토러스', klein: '클라인 병' };
const START_V = -1.2;

export interface WorldInfo {
  /** Tile of the walker counted from the start tile, in the plane of all copies. */
  m: number;
  n: number;
  /** −1 when the walker is the mirror image of the reader who started. */
  s: 1 | -1;
  /** Standing on a copy of the start point. */
  onFlag: boolean;
}

/** Arrow heads along an edge strip: `count` triangles pointing along +x in a strip lying on the floor. */
function chevrons(count: number, len: number, size: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let k = 0; k < count; k++) {
    const c = -len / 2 + (len * (k + 0.5)) / count;
    pts.push(c + size * 0.6, 0, 0, c - size * 0.5, 0, -size * 0.55, c - size * 0.5, 0, size * 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

const F_SHAPE: [number, number][] = [
  [0, 0],
  [0.2, 0],
  [0.2, 0.42],
  [0.48, 0.42],
  [0.48, 0.6],
  [0.2, 0.6],
  [0.2, 0.82],
  [0.6, 0.82],
  [0.6, 1],
  [0, 1],
];

/** One copy of the room, in its own coordinates (x = u, z = −v). */
function buildRoom(P: Palette, id: GlueId, flag: boolean): THREE.Group {
  const room = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: color3(P.surface2), roughness: 0.95 }));
  room.add(floor);

  const W = 0.16;
  const stripGeo = new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2);
  const chev = chevrons(4, L, 0.22);
  const ink = new THREE.MeshBasicMaterial({ color: color3(P.surface), side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshStandardMaterial({ color: color3(P.ink3), roughness: 0.7 });
  /** One edge: a coloured strip with arrows (glued) or a fence (not glued). `rot` turns +x into the arrow direction. */
  const edge = (cx: number, cz: number, rot: number, glued: boolean, col: string) => {
    if (!glued) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(L, 0.7, 0.1), fenceMat);
      fence.position.set(cx, 0.35, cz);
      fence.rotation.y = rot;
      room.add(fence);
      return;
    }
    const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: color3(col) }));
    strip.position.set(cx, 0.004, cz);
    strip.rotation.y = rot;
    const arrows = new THREE.Mesh(chev, ink);
    arrows.position.set(cx, 0.008, cz);
    arrows.rotation.y = rot;
    room.add(strip, arrows);
  };
  const h = L / 2 - W / 2;
  const sideGlued = id !== 'none';
  const endGlued = id === 'torus' || id === 'klein';
  // left and right edges (crossing them is α): arrows point along +v, i.e. world −z
  edge(h, 0, Math.PI / 2, sideGlued, P.neg);
  edge(-h, 0, Math.PI / 2, sideGlued, P.neg);
  // bottom and top edges (crossing them is β): arrows along +u; the Klein bottle's top edge points back
  edge(0, h, 0, endGlued, P.pos);
  edge(0, -h, id === 'klein' ? Math.PI : 0, endGlued, P.pos);

  // a tree (symmetric) and a letter F (not), so mirrored copies can be told apart
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), new THREE.MeshStandardMaterial({ color: color3(P.ink3) }));
  trunk.position.set(-1.1, 0.25, -1.0);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 16), new THREE.MeshStandardMaterial({ color: color3(P.good), roughness: 0.8 }));
  crown.position.set(-1.1, 0.9, -1.0);
  room.add(trunk, crown);

  const shape = new THREE.Shape(F_SHAPE.map(([a, b]) => new THREE.Vector2(a, b)));
  const fGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  const F = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ color: color3(P.accent), roughness: 0.5 }));
  F.scale.set(1.1, 1.1, 1);
  F.position.set(0.6, 0, -1.2);
  room.add(F);

  const mark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color3(P.ink2) }));
  mark.position.y = 0.006;
  room.add(mark);
  if (flag) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), new THREE.MeshStandardMaterial({ color: color3(P.ink2) }));
    pole.position.y = 0.45;
    const clothMat = new THREE.MeshStandardMaterial({ color: color3(P.bad), side: THREE.DoubleSide, emissive: color3(P.bad), emissiveIntensity: 0.25 });
    for (const r of [0, Math.PI / 2]) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), clothMat);
      cloth.position.y = 0.8;
      cloth.rotation.y = r;
      cloth.translateX(0.13);
      room.add(cloth);
    }
    room.add(pole);
  }
  return room;
}

/** The walker as others (and the reader's own copies) see it: a green glove on the right hand only. */
function buildPawn(P: Palette): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: color3(P.math), roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 18), bodyMat);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), bodyMat);
  head.position.y = 0.45;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 12), new THREE.MeshStandardMaterial({ color: color3(P.ink) }));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.45, -0.1);
  // facing −z, the right hand is on +x
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), new THREE.MeshStandardMaterial({ color: color3(P.good), emissive: color3(P.good), emissiveIntensity: 0.3 }));
  glove.position.set(0.17, 0.26, -0.02);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ color: color3(P.ink2) }));
  hand.position.set(-0.15, 0.26, -0.02);
  g.add(body, head, nose, glove, hand);
  return g;
}

interface FlatProps {
  id: GlueId;
  /** Where the walker starts, on the line u = 0. */
  startV: number;
  view: WorldView;
  flags: boolean;
  trail: boolean;
  resetKey: number;
  api: React.MutableRefObject<WorldApi | null>;
  onInfo: (i: WorldInfo) => void;
  onKey: (k: string) => boolean;
  label: string;
  children: (full: boolean) => React.ReactNode;
}

function FlatWorld({ id, startV, view, flags, trail, resetKey, api, onInfo, onKey, label, children }: FlatProps) {
  const start = useMemo(() => ({ x: 0, z: -startV, yaw: 0, pitch: -0.1 }), [startV]);
  const viewRef = useRef(view);
  viewRef.current = view;
  return (
    <World3D
      label={label}
      height={520}
      bounds={3 * L}
      ground={() => 0}
      start={start}
      view={view}
      fog={view === 'walk' ? 10 : undefined}
      eye={EYE}
      speed={1.3}
      skyDistance={4.5}
      pawn={false}
      api={api}
      deps={[id, flags, trail, resetKey]}
      constrain={(x0, z0, x1, z1) => {
        const [u, v] = clampWalls(id, x1, -z1);
        return [u, -v];
      }}
      onKey={onKey}
      setup={({ scene, palette, walker }) => {
        const P = palette;
        const room = buildRoom(P, id, flags);
        const pawn = buildPawn(P);
        const tiles = tilesFor(id, R).map((d) => {
          const g = room.clone();
          g.position.set(d.m * L, 0, -d.n * L);
          g.scale.x = d.s;
          const p = pawn.clone();
          g.add(p);
          scene.add(g);
          return { d, pawn: p };
        });
        // the walker always starts in the start tile, at the start of a fresh plane of copies
        const cover = { m: 0, n: 0 };
        let info: WorldInfo | null = null;

        // trail of the walk, drawn in the plane of copies
        const trailPos = new Float32Array(MAX_TRAIL * 3);
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
        trailGeo.setDrawRange(0, 0);
        const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: color3(P.bad) }));
        trailLine.frustumCulled = false;
        const trailGroup = new THREE.Group();
        trailGroup.add(trailLine);
        trailGroup.visible = trail;
        scene.add(trailGroup);
        let nTrail = 0;
        let lastAbs: [number, number] | null = null;

        // names of the start copies near the walker
        const labels = new THREE.Group();
        scene.add(labels);
        let labelKey = '';
        const relabel = () => {
          const key = `${cover.m},${cover.n}`;
          if (!flags || key === labelKey) return;
          labelKey = key;
          for (const c of [...labels.children]) {
            labels.remove(c);
            const s = c as THREE.Sprite;
            s.material.map?.dispose();
            s.material.dispose();
          }
          for (const { d } of tiles) {
            if (Math.abs(d.m) > 2 || d.n < -2 || d.n > 3) continue;
            const s = textSprite(tileWord(d.m + cover.m, d.n + cover.n), P.ink, P.fontBody, 0.3, true);
            s.position.set(d.m * L, 1.15, -d.n * L);
            labels.add(s);
          }
        };
        relabel();

        return {
          update() {
            let u = walker.x;
            let v = -walker.z;
            if (!api.current?.gliding()) {
              const r = recenter(id, u, v);
              if (r.dm || r.dn) {
                u = r.u;
                v = r.v;
                walker.x = u;
                walker.z = -v;
                cover.m += r.dm;
                cover.n += r.dn;
                relabel();
              }
            }
            const [tm, tn] = tileOf(u, v);
            const s = parity(id, tn);
            // the walker's place in its own copy of the room, then shown in every copy
            const u0 = s * (u - tm * L);
            const v0 = v - tn * L;
            const yaw0 = s * walker.yaw;
            for (const t of tiles) {
              t.pawn.position.set(u0, 0, -v0);
              t.pawn.rotation.y = yaw0;
              t.pawn.visible = viewRef.current === 'sky' || t.d.m !== tm || t.d.n !== tn;
            }
            const next: WorldInfo = { m: tm + cover.m, n: tn + cover.n, s, onFlag: Math.hypot(u0, v0) < 0.35 };
            if (!info || next.m !== info.m || next.n !== info.n || next.s !== info.s || next.onFlag !== info.onFlag) {
              info = next;
              onInfo(next);
            }
            if (trail) {
              const au = u + cover.m * L;
              const av = v + cover.n * L;
              if (!lastAbs || Math.hypot(au - lastAbs[0], av - lastAbs[1]) > 0.05) {
                if (nTrail >= MAX_TRAIL) {
                  trailPos.copyWithin(0, 3 * (MAX_TRAIL / 2));
                  nTrail = MAX_TRAIL / 2;
                }
                trailPos.set([au, 0.03, -av], nTrail * 3);
                nTrail++;
                lastAbs = [au, av];
                trailGeo.setDrawRange(0, nTrail);
                trailGeo.attributes.position.needsUpdate = true;
              }
              trailGroup.position.set(-cover.m * L, 0, cover.n * L);
            }
          },
          dispose() {
            for (const c of labels.children) {
              const s = c as THREE.Sprite;
              s.material.map?.dispose();
            }
          },
        };
      }}
    >
      {children}
    </World3D>
  );
}

const placeStart = (api: React.MutableRefObject<WorldApi | null>, v = START_V) => api.current?.place({ x: 0, z: -v, yaw: 0, pitch: -0.1 });

const sideText = (s: 1 | -1) => (s === 1 ? '오른손' : '왼손');

/* ─────────────── Figure 1: four ways to glue the room ─────────────── */

function GlueFigure() {
  const [id, setId] = useState<GlueId>('torus');
  const [view, setView] = useState<WorldView>('walk');
  const [info, setInfo] = useState<WorldInfo>({ m: 0, n: 0, s: 1, onFlag: false });
  const api = useRef<WorldApi | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const pick = (g: GlueId) => {
    setId(g);
    setResetKey((k) => k + 1);
    placeStart(api);
  };
  const reset = () => {
    setResetKey((k) => k + 1);
    placeStart(api);
  };

  const note: Record<GlueId, string> = {
    none: '네 변이 모두 벽입니다. 방 하나뿐이고 복사본도 없습니다.',
    cylinder: '왼쪽과 오른쪽 변만 붙였습니다. 옆으로는 끝없이 같은 방이 이어지고, 앞뒤는 벽입니다.',
    torus: '두 쌍을 모두 같은 방향으로 붙였습니다. 어느 쪽으로 걸어도 같은 방으로 돌아옵니다.',
    klein: '위아래 변은 뒤집어 붙였습니다. 주황 선을 넘으면 좌우가 바뀝니다.',
  };

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: reset,
      '1': () => pick('none'),
      '2': () => pick('cylinder'),
      '3': () => pick('torus'),
      '4': () => pick('klein'),
    };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={1}
      title="변을 붙인 방 안에 서기"
      hint="화면을 누르고 W·A·S·D로 걸어 변을 넘어가 보세요"
      caption={
        <>
          한 변이 {L}인 정사각형 방입니다. 파란 선은 왼쪽과 오른쪽 변, 주황 선은 위와 아래 변이고, 선 위의 화살표가 붙이는 방향입니다. 회색 울타리는 붙이지 않은 변입니다. 멀리 보이는 방과 사람은 다른 방이 아니라, 붙인 변을 지나 돌아온 빛으로 보는 이 방과 나 자신입니다. 사람 모형은 오른손에만 초록 장갑을 꼈습니다. 키: 1·2·3·4 붙이는 방법, V 시점 바꾸기, R 처음 자리로, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <FlatWorld
          id={id}
          startV={START_V}
          view={view}
          flags={false}
          trail={false}
          resetKey={resetKey}
          api={api}
          onInfo={setInfo}
          onKey={onKey}
          label="변을 붙인 정사각형 방 안을 1인칭으로 걷는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                {GLUE_NAMES[id]} · 장갑 낀 손 <strong>{sideText(info.s)}</strong>
                <div style={{ color: info.s === 1 ? 'var(--ink-2)' : 'var(--bad)' }}>{info.s === 1 ? note[id] : '지금 나는 처음 출발한 나의 거울상입니다. 장갑이 왼손에 있어요.'}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  {(['none', 'cylinder', 'torus', 'klein'] as GlueId[]).map((g) => (
                    <Button key={g} small primary={g === id} onClick={() => pick(g)}>
                      {GLUE_NAMES[g]}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </FlatWorld>
        <div className="controls">
          <Seg label="붙이는 방법" value={id} onChange={pick} options={(['none', 'cylinder', 'torus', 'klein'] as GlueId[]).map((g) => ({ value: g, label: GLUE_NAMES[g] }))} />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <div className="btn-row">
            <Button small onClick={reset}>
              처음 자리로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="지나온 방 (가로, 세로)" value={`(${info.m}, ${info.n})`} />
            <Readout label="장갑 낀 손" value={sideText(info.s)} color={info.s === 1 ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: loops, flags and the group ─────────────── */

const STEP_NAMES: Record<Loop, string> = { a: 'α', A: 'α⁻¹', b: 'β', B: 'β⁻¹' };

function LoopFigure() {
  const [id, setId] = useState<GlueId>('klein');
  const [view, setView] = useState<WorldView>('walk');
  const [info, setInfo] = useState<WorldInfo>({ m: 0, n: 0, s: 1, onFlag: true });
  const [steps, setSteps] = useState<Loop[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const api = useRef<WorldApi | null>(null);

  const reset = (g = id) => {
    if (g !== id) setId(g);
    setResetKey((k) => k + 1);
    setSteps([]);
    placeStart(api, 0);
  };

  /** Walk one loop step from the centre of the room the walker is in. */
  const go = (step: Loop) => {
    const a = api.current;
    if (!a || a.gliding()) return;
    const w = a.get();
    const u = w.x;
    const v = -w.z;
    const [tm, tn] = tileOf(u, v);
    const [nm, nn] = loopStep(id, tm, tn, step);
    a.glideTo(nm * L, -nn * L, { dur: 0.9, face: true });
    setSteps((s) => [...s, step]);
  };

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      d: () => go('a'),
      a: () => go('A'),
      w: () => go('b'),
      s: () => go('B'),
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      r: () => reset(),
    };
    act[k]?.();
    return k in act;
  };

  const here = tileWord(info.m, info.n);

  return (
    <Figure
      no={2}
      title="고리를 걸어 깃발 찾기"
      hint="α, β 단추로 한 바퀴씩 걸어 보세요"
      caption={
        <>
          출발점과 그 모든 복사본에 깃발을 꽂았습니다. 깃발 위의 이름은 출발점에서 "α를 m번, 그다음 β를 n번" 걸으면 그 깃발에 닿는다는 뜻입니다. α는 방의 화살표를 따라 오른쪽 변(파랑)을, β는 위 변(주황)을 넘어 한 바퀴 도는 고리이고, 단추를 누르면 지금 방의 가운데에서 그 방의 화살표 방향으로 한 바퀴 걷습니다. 빨간 선은 지금까지 걸은 길입니다. 키: W·A·S·D는 β, α⁻¹, β⁻¹, α 단추이고, ↑ ↓ 화살표 키로는 직접 걸을 수 있습니다. V 시점 바꾸기, R 처음으로, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <FlatWorld
          id={id}
          startV={0}
          view={view}
          flags
          trail
          resetKey={resetKey}
          api={api}
          onInfo={setInfo}
          onKey={onKey}
          label="출발점의 복사본마다 고리 이름이 적힌 깃발이 꽂힌 평평한 우주를 걷는 3D 장면."
        >
          {(full) => (
            <>
              <div className="w3-hud">
                걸은 고리 <strong>{steps.length ? steps.map((s) => STEP_NAMES[s]).join('') : 'e'}</strong> → 깃발 <strong>{info.onFlag ? here : '…'}</strong>
                <div style={{ color: info.s === 1 ? 'var(--ink-2)' : 'var(--bad)' }}>{info.s === 1 ? '장갑은 오른손에 있습니다.' : '거울상입니다. 이 방에서 α는 세상의 왼쪽으로 갑니다.'}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  {(['a', 'b', 'A', 'B'] as Loop[]).map((s) => (
                    <Button key={s} small primary onClick={() => go(s)}>
                      {STEP_NAMES[s]}
                    </Button>
                  ))}
                  <Button small onClick={() => reset()}>
                    처음으로
                  </Button>
                </div>
              )}
            </>
          )}
        </FlatWorld>
        <div className="controls">
          <Seg label="곡면" value={id} onChange={(g) => reset(g)} options={(['torus', 'klein'] as GlueId[]).map((g) => ({ value: g, label: GLUE_NAMES[g] }))} />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <div className="btn-row">
            {(['a', 'b', 'A', 'B'] as Loop[]).map((s) => (
              <Button key={s} small primary={s === 'a' || s === 'b'} onClick={() => go(s)}>
                {STEP_NAMES[s]}
              </Button>
            ))}
            <Button small onClick={() => reset()}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="걸은 고리" value={steps.length ? steps.map((s) => STEP_NAMES[s]).join('') : 'e (제자리)'} color="var(--bad)" />
            <Readout label="도착한 깃발" value={info.onFlag ? here : '깃발 사이'} color="var(--accent)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FlatWorlds() {
  return (
    <>
      <h2>곡면 안에서 살기</h2>
      <p>
        <a href={lessonHref('math-topology', 'surfaces')}>곡면의 분류</a>에서는 정사각형의 변을 붙여 토러스와 클라인 병을 만들고, 그 위를 걷는 납작한 생물을 위에서 내려다봤습니다. 이번에는 직접 그 생물이 되어 봅니다. 바닥이 정사각형이고 변을 붙인 방에 들어가면, 변은 벽이 아니라 그냥 지나갈 수 있는 선입니다. 오른쪽 변을 넘으면 왼쪽 변으로 들어옵니다.
      </p>
      <p>
        빛도 똑같이 지나갑니다. 오른쪽을 바라보면, 시선이 오른쪽 변을 지나 왼쪽 변으로 다시 들어와 방을 가로지르고, 또 오른쪽 변을 지나갑니다. 그래서 방 안에 서서 보면 같은 방이 끝없이 이어진 것처럼 보이고, 그 방마다 나 자신이 서 있습니다. 아래 그림을 한 번 누르면 W·A·S·D나 화살표 키로 걷고, 화면을 끌어 둘러볼 수 있습니다.
      </p>
      <GlueFigure />
      <p>
        <strong>토러스</strong>에서 그대로 앞을 보면, {L}만큼 앞에 누군가의 뒷모습이 보입니다. 내 뒷모습입니다. 그 너머에도, 또 그 너머에도 같은 뒷모습이 있습니다. 걸어가면 앞의 나도 같이 걸어가서 결코 따라잡을 수 없습니다. <strong>원기둥</strong>에서는 옆으로만 방이 이어지고, 앞뒤의 울타리 너머에는 아무것도 없습니다. <strong>벽</strong>으로 막힌 방에는 복사본이 하나도 없습니다.
      </p>
      <p>
        <strong>클라인 병</strong>에서 앞(주황 선 너머)을 보면 F가 거꾸로 쓰인 방이 보이고, 그 방의 나는 장갑을 왼손에 꼈습니다. 주황 선을 넘어가 보세요. 넘는 순간 아무 일도 일어나지 않은 것처럼 보이지만, 왼쪽 위 상태 표시가 거울상이 됐다고 알려 줍니다. 처음 출발한 나와 비교하면 내가 뒤집혔다는 뜻입니다. 방 안에서는 이것을 알아챌 방법이 없습니다. 내 몸과 함께 내 눈도 뒤집혔기 때문입니다. 뒤를 돌아보면 방금 떠난 방의 F가 거꾸로 보이는 것으로만 알 수 있습니다. 파란 선을 넘어 옆으로 아무리 걸어도 거울상은 그대로이고, 주황 선을 한 번 더 넘어야 돌아옵니다. 앞 장의 말로 하면 클라인 병에는 방향을 줄 수 없습니다.
      </p>
      <Callout kind="key">
        방 안에서 보이는 끝없는 방들은 평면을 방의 복사본으로 빈틈없이 덮은 것입니다. 붙이는 규칙은 복사본을 어떻게 놓을지를 정합니다. 토러스는 평행이동으로만 놓고, 클라인 병은 한 줄 건너 한 줄씩 거울에 비춰 놓습니다.
      </Callout>

      <h2>깃발 하나가 고리 하나</h2>
      <p>
        <a href={lessonHref('math-topology', 'fundamental-group')}>기본군과 구멍</a>에서는 원의 고리를 실수 직선 위로 펼쳤습니다. 원을 한 바퀴 도는 고리는 직선 위에서 0에서 1로 가는 길이 되고, 그 끝점이 감김 수였습니다. 평평한 우주도 같습니다. 방 안의 고리를 평면 위로 펼치면 출발점에서 출발점의 복사본 중 하나로 가는 길이 되고, 어느 복사본에 닿느냐가 고리의 정체입니다. 고리를 연속적으로 조금씩 바꿔도 끝점은 복사본 사이를 건너뛸 수 없으므로, 호모토픽한 고리는 같은 복사본에 닿습니다.
      </p>
      <p>
        그래서 출발점의 복사본마다 깃발을 꽂으면 깃발 하나가 기본군의 원소 하나입니다. 아래 그림에서 α는 오른쪽 변을, β는 위 변을 한 번 넘는 고리입니다. 단추를 누르면 그 고리를 한 바퀴 걷고, 걸은 길이 빨간 선으로 남습니다.
      </p>
      <LoopFigure />
      <p>
        먼저 <strong>토러스</strong>를 고르고 α 다음 β를 눌러 보세요. αβ라는 깃발에 닿습니다. 처음으로 돌아가 β 다음 α를 누르면 같은 깃발에 닿습니다. 토러스에서는 걷는 순서가 상관없어서, α를 m번, β를 n번 걸은 고리는 순서와 상관없이 깃발 <M>{'\\alpha^m\\beta^n'}</M>에 닿습니다. 그래서 토러스의 기본군은 정수 두 개의 쌍 (m, n)을 더하는 군입니다.
      </p>
      <MB>{'\\pi_1(T^2) \\cong \\mathbb{Z} \\times \\mathbb{Z}'}</MB>
      <p>
        이제 <strong>클라인 병</strong>에서 똑같이 해 봅니다. α 다음 β는 αβ 깃발에 닿지만, β 다음 α는 <M>{'\\alpha^{-1}\\beta'}</M> 깃발에 닿습니다. β로 주황 선을 넘으면 거울상이 되므로, 그 방에서 α를 따라 오른쪽으로 걸으면 처음 방의 기준으로는 왼쪽으로 가기 때문입니다. 걷는 순서가 결과를 바꿉니다.
      </p>
      <MB note="β를 한 번 넘은 뒤의 α는 처음 방에서 본 α의 역입니다.">{'\\beta\\alpha = \\alpha^{-1}\\beta, \\qquad \\text{곧}\\quad \\beta\\alpha\\beta^{-1} = \\alpha^{-1}'}</MB>
      <p>
        α, β, <M>{'\\alpha^{-1}'}</M>, <M>{'\\beta^{-1}'}</M> 순서로 걸어 보세요. 토러스에서는 출발점 e로 돌아오지만, 클라인 병에서는 <M>{'\\alpha^2'}</M> 깃발에 닿습니다. 교환법칙이 성립하는 군이라면 <M>{'\\alpha\\beta\\alpha^{-1}\\beta^{-1}'}</M>는 언제나 e여야 하므로, 클라인 병의 기본군은 교환법칙이 성립하지 않습니다. 기본군 장의 구멍 두 개 뚫린 평면과 같은 현상을, 이번에는 구멍이 아니라 뒤집힘이 만들어 냅니다.
      </p>
      <Callout kind="note">
        고리를 펼쳐 놓는 평면처럼, 고리가 모두 풀리는 공간으로 원래 공간을 감싸는 것을 <T en="universal cover">보편 덮개</T>라고 하고, 복사본끼리 옮기는 변환(평행이동과 거울 반사를 섞은 이동)들이 이루는 군이 기본군과 같습니다. 원의 보편 덮개는 실수 직선, 토러스와 클라인 병의 보편 덮개는 평면입니다. 천문학자들은 우리 우주가 이런 식으로 붙어 있다면 하늘의 먼 곳에 같은 무늬가 되풀이되어 보일 것이라 보고 우주 배경 복사에서 그런 무늬를 찾아봤지만, 지금까지 관측한 범위에서는 찾지 못했습니다.
      </Callout>
      <Quiz
        q="클라인 병에서 출발해 β를 한 바퀴 걷고, 이어서 α⁻¹를 한 바퀴 걸었습니다. 어느 깃발에 닿을까요?"
        options={['e (출발점)', 'αβ', 'α⁻¹β', 'β²']}
        answer={1}
        explain={<>β를 넘으면 거울상이 되므로 그 방에서 α⁻¹(왼쪽)로 걸으면 처음 방의 기준으로는 오른쪽으로 갑니다. 그래서 α 다음 β와 같은 αβ 깃발에 닿습니다. <M>{'\\beta\\alpha^{-1} = \\alpha\\beta'}</M>이고, 이것도 관계식 <M>{'\\beta\\alpha\\beta^{-1} = \\alpha^{-1}'}</M>에서 나옵니다. 그림 2에서 직접 확인해 보세요.</>}
      />
    </>
  );
}

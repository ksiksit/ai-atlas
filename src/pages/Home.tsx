import { type CSSProperties } from 'react';
import { LESSONS, PARTS, lessonNo } from '../curriculum';
import { ThreeView, surfaceMesh, color3, THREE } from '../lib/three';
import { rng } from '../lib/math';
import { prefersReducedMotion } from '../lib/canvas';
import './home.css';

/** A bumpy loss landscape with a few valleys. */
function loss(x: number, y: number) {
  return (
    0.09 * (x * x + y * y) -
    1.15 * Math.exp(-((x - 0.9) ** 2 + (y - 0.7) ** 2) / 0.55) -
    0.8 * Math.exp(-((x + 1.1) ** 2 + (y + 0.6) ** 2) / 0.45) -
    0.55 * Math.exp(-((x + 0.6) ** 2 + (y - 1.3) ** 2) / 0.3) +
    0.18 * Math.sin(1.7 * x) * Math.cos(1.4 * y)
  );
}
function grad(x: number, y: number): [number, number] {
  const h = 1e-3;
  return [(loss(x + h, y) - loss(x - h, y)) / (2 * h), (loss(x, y + h) - loss(x, y - h)) / (2 * h)];
}

const Z = 0.9; // vertical scale
const R = 2.4;

function HeroLandscape() {
  return (
    <ThreeView
      height={430}
      camera={[5.3, 4.1, 5.1]}
      target={[0, -0.35, 0]}
      autoRotate={!prefersReducedMotion()}
      enableZoom={false}
      hint="드래그해서 돌려 보세요"
      setup={({ scene, palette }) => {
        const { group } = surfaceMesh(loss, { range: R, n: 110, lo: palette.dark ? '#2a4bd0' : '#1f3fb8', hi: palette.dark ? '#f2d7b8' : '#f7e3c9', zScale: Z, wireColor: palette.dark ? '#ffffff' : '#0d1530' });
        scene.add(group);

        const r = rng(3);
        const N = 7;
        const ballGeo = new THREE.SphereGeometry(0.075, 20, 14);
        const ballMat = new THREE.MeshStandardMaterial({ color: color3(palette.pos), roughness: 0.35, emissive: color3(palette.pos), emissiveIntensity: 0.25 });
        const TRAIL = 140;
        const balls = Array.from({ length: N }, () => {
          const mesh = new THREE.Mesh(ballGeo, ballMat);
          scene.add(mesh);
          const geo = new THREE.BufferGeometry();
          const arr = new Float32Array(TRAIL * 3);
          geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          geo.setDrawRange(0, 0);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color3(palette.pos), transparent: true, opacity: 0.85 }));
          scene.add(line);
          return { mesh, line, arr, n: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0 };
        });
        const reset = (b: (typeof balls)[number], delay = 0) => {
          b.x = (r() * 2 - 1) * R * 0.92;
          b.y = (r() * 2 - 1) * R * 0.92;
          b.vx = b.vy = 0;
          b.n = 0;
          b.life = -delay;
          b.line.geometry.setDrawRange(0, 0);
        };
        balls.forEach((b, i) => reset(b, i * 0.6));
        let acc = 0;
        return {
          update(dt) {
            acc += dt;
            const steps = Math.floor(acc / (1 / 40));
            acc -= steps / 40;
            for (let s = 0; s < steps; s++) {
              for (const b of balls) {
                b.life += 1 / 40;
                if (b.life < 0) continue;
                const [gx, gy] = grad(b.x, b.y);
                b.vx = 0.86 * b.vx - 0.05 * gx;
                b.vy = 0.86 * b.vy - 0.05 * gy;
                b.x = Math.max(-R, Math.min(R, b.x + b.vx));
                b.y = Math.max(-R, Math.min(R, b.y + b.vy));
                if (b.n < TRAIL) {
                  b.arr[b.n * 3] = b.x;
                  b.arr[b.n * 3 + 1] = loss(b.x, b.y) * Z + 0.03;
                  b.arr[b.n * 3 + 2] = -b.y;
                  b.n++;
                  b.line.geometry.attributes.position.needsUpdate = true;
                  b.line.geometry.setDrawRange(0, b.n);
                }
                if (b.life > 6.5) reset(b, r() * 0.8);
              }
            }
            for (const b of balls) {
              b.mesh.visible = b.life >= 0;
              b.mesh.position.set(b.x, loss(b.x, b.y) * Z + 0.07, -b.y);
            }
          },
        };
      }}
    />
  );
}

export default function Home() {
  const start = LESSONS[0];
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>
            <span className="bar" />
            인터랙티브 인공지능 입문서
          </div>
          <h1 className="hero-title">
            학습이란,
            <br />
            <em>오차의 골짜기</em>를
            <br />
            내려가는 일입니다.
          </h1>
          <p className="hero-lede">
            오른쪽 곡면은 모델이 틀린 정도, 즉 손실을 높이로 그린 지형입니다. 주황색 공은 기울기만 보고 한 걸음씩 아래로 굴러가요. 신경망이 학습하는 방식도 정확히 이렇습니다. 이 사이트는 이 장면을 이해하는 데 필요한 수학부터 트랜스포머까지, 19개의 장을 직접 만지며 따라가도록 만들었습니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={'#' + start.id}>
              처음부터 시작하기
            </a>
            <a className="btn" href="#neural-network">
              신경망 놀이터 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <HeroLandscape />
          <div className="hero-figure-cap">
            <span className="mono">L(w₁, w₂)</span> 손실 지형 위의 경사하강법 · 모멘텀 0.86
          </div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>만져 보세요</h3>
          <p>모든 장에 슬라이더, 드래그할 수 있는 점, 3D 장면이 있습니다. 값을 바꾸며 결과가 어떻게 달라지는지 보는 것이 설명을 읽는 것보다 빠릅니다.</p>
        </div>
        <div>
          <h3>직관 먼저, 수식은 확인용</h3>
          <p>그림으로 먼저 감을 잡고, 수식은 그 감을 정확한 말로 옮긴 것으로 읽으면 됩니다. 고등학교 수학이면 충분합니다.</p>
        </div>
        <div>
          <h3>순서대로 쌓입니다</h3>
          <p>수학 기초의 벡터와 미분이 머신러닝의 손실과 경사하강법이 되고, 그것이 다시 신경망과 어텐션이 됩니다.</p>
        </div>
      </section>

      <section className="map" aria-labelledby="map-title">
        <h2 id="map-title" className="map-title">
          전체 지도
        </h2>
        {PARTS.map((p) => (
          <div className="map-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
            <div className="map-part-head">
              <span className="map-part-en">{p.en}</span>
              <h3>{p.title}</h3>
              <p>{p.blurb}</p>
            </div>
            <div className="map-cards">
              {LESSONS.filter((l) => l.part === p.id).map((l) => (
                <a className="map-card" key={l.id} href={'#' + l.id}>
                  <span className="map-card-no">{lessonNo(l)}</span>
                  <span className="map-card-title">{l.title}</span>
                  <span className="map-card-en">{l.en}</span>
                  <span className="map-card-learn">{l.learn.join(' · ')}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
      <footer className="home-foot">
        모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.
      </footer>
    </div>
  );
}

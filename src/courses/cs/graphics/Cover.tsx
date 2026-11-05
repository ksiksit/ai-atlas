import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { Seg } from '../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import { Framebuffer, add, chain, clamp01, cube, cssToRgb, dot, drawMesh, lookAt, mix, mul, normalize, perspective, plane, reflect, rotateX, rotateY, scale, scaling, sphere, sub, translate, type RGB, type RasterStats, type Vec3 } from './lessons/gfx';
import '../../../styles/cover.css';
import './lessons/graphics.css';

/* ─────────────── Hero: a scene drawn pixel by pixel by the course's own renderer ─────────────── */

const RES: Record<string, [number, number]> = { low: [48, 32], mid: [96, 64], high: [192, 128] };
const LIGHT: Vec3 = normalize([-0.6, 1, 0.7]);
const EYE: Vec3 = [0, 1.25, 3.4];

function GraphicsHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [res, setRes] = useState<'low' | 'mid' | 'high'>('mid');
  const [t, setT] = useState(0.6);
  useAnimationFrame((dt) => setT((x) => x + dt * 0.45), inView && !still);

  const [W, H] = RES[res];
  const meshes = useMemo(() => ({ ball: sphere(18), box: cube(), floor: plane(6) }), []);

  const { image, stats } = useMemo(() => {
    const fb = new Framebuffer(W, H);
    const bg = cssToRgb(P.surface2);
    const ink = cssToRgb(P.ink);
    const accent = cssToRgb(P.accent);
    const warm = cssToRgb(P.neg);
    fb.clear(bg);
    const vp = mul(perspective(Math.PI / 3.4, W / H, 0.1, 20), lookAt(EYE, [0, 0.35, 0]));
    const st: RasterStats = { tested: 0, covered: 0, depthRejected: 0 };
    const phong = (base: RGB, shiny: number) => (f: { a: number[] }): RGB => {
      const n = normalize([f.a[3], f.a[4], f.a[5]]);
      const p: Vec3 = [f.a[0], f.a[1], f.a[2]];
      const v = normalize(sub(EYE, p));
      const diff = Math.max(0, dot(n, LIGHT));
      const r = reflect(scale(LIGHT, -1), n);
      const spec = shiny > 0 ? Math.pow(Math.max(0, dot(r, v)), shiny) : 0;
      const lit = add(scale(base, 0.28 + 0.72 * diff), [spec * 0.8, spec * 0.8, spec * 0.8]);
      return [clamp01(lit[0]), clamp01(lit[1]), clamp01(lit[2])];
    };
    // floor: a checkerboard that fades into the background
    drawMesh(fb, meshes.floor, scaling(6), vp, (f) => {
      const u = f.a[6], v = f.a[7];
      const odd = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      const d = Math.hypot(f.a[0], f.a[2]);
      return mix(odd ? mix(bg, ink, 0.16) : mix(bg, ink, 0.06), bg, clamp01((d - 1.2) / 2));
    }, { cullBack: true }, st);
    drawMesh(fb, meshes.ball, chain(translate(-0.75, 0.55, 0), rotateY(t), scaling(0.55)), vp, phong(accent, 24), { cullBack: true }, st);
    drawMesh(fb, meshes.box, chain(translate(0.8, 0.45, -0.1), rotateY(-t * 0.8), rotateX(0.35), scaling(0.75)), vp, phong(warm, 0), { cullBack: true }, st);
    return { image: fb, stats: st };
  }, [P, W, H, t, meshes]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const px = Math.min(w / W, h / H);
      const ox = (w - W * px) / 2;
      const oy = (h - H * px) / 2;
      const tmp = document.createElement('canvas');
      tmp.width = W;
      tmp.height = H;
      tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.color), W, H), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, ox, oy, W * px, H * px);
      // the pixel grid, where pixels are big enough to see
      if (px >= 6) {
        ctx.strokeStyle = P.surface;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= W; i++) {
          ctx.moveTo(ox + i * px + 0.5, oy);
          ctx.lineTo(ox + i * px + 0.5, oy + H * px);
        }
        for (let j = 0; j <= H; j++) {
          ctx.moveTo(ox, oy + j * px + 0.5);
          ctx.lineTo(ox + W * px, oy + j * px + 0.5);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    [P, image, W, H],
    { aspect: 1.5, maxHeight: 420, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`이 과목의 렌더러가 ${W}×${H} 픽셀로 그린 장면: 바둑판 바닥 위에 빛을 받는 공과 상자가 천천히 돕니다. 이번 화면에서 픽셀 ${stats.covered.toLocaleString('ko-KR')}개를 삼각형이 덮었습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center' }}>
        <Seg value={res} onChange={setRes} options={[{ value: 'low', label: '48×32' }, { value: 'mid', label: '96×64' }, { value: 'high', label: '192×128' }]} />
        <span>
          삼각형이 덮은 픽셀 <strong className="mono">{stats.covered.toLocaleString('ko-KR')}</strong>개 · 깊이 검사로 버린 픽셀 <span className="mono">{stats.depthRejected.toLocaleString('ko-KR')}</span>개
        </span>
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            모든 화면은
            <br />
            <em>삼각형과 픽셀</em>로
            <br />
            그립니다.
          </h1>
          <p className="hero-lede">
            오른쪽 장면은 WebGL 없이 이 과목의 작은 렌더러가 픽셀 하나하나의 색을 직접 계산해서 그린 것입니다. 해상도를 낮추면 공과 상자가 정사각형 칸으로 이루어진 것이 보입니다. 게임과 영화의 그래픽도 같은 일을 훨씬 많이, 훨씬 빠르게 할 뿐입니다. {course.lessons.length}개의 장에서 삼각형을 픽셀로 바꾸는 래스터화부터 카메라, 빛, 텍스처, 레이 트레이싱, 곡선까지 이 렌더러를 키워 가며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'ray-tracing')}>
              레이 트레이싱 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <GraphicsHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>렌더러를 열어 봅니다</h3>
          <p>꼭짓점을 끌고, 카메라를 돌리고, 빛을 옮기면 그 자리에서 다시 그립니다. 픽셀이 보일 만큼 해상도를 낮춰 두었기 때문에 어느 픽셀이 왜 그 색인지 하나씩 따라갈 수 있습니다.</p>
        </div>
        <div>
          <h3>수학이 그림이 됩니다</h3>
          <p>내적은 밝기가 되고, 행렬 곱셈은 카메라가 되고, 이차방정식의 판별식은 광선이 공에 맞았는지가 됩니다. 식마다 그 식이 바꾸는 그림을 함께 둡니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            벡터, 행렬, 행렬식은 <a href={courseHref('math-linear-algebra')}>선형대수</a>에서, 반복문과 함수는 <a href={courseHref('cs-programming')}>프로그래밍 입문</a>에서 다룹니다. 이 과목에서 쓰는 만큼은 다시 설명합니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}

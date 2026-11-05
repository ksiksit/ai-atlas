import { useEffect, useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, MB, M, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { cssToRgb, Framebuffer, present, type RGB } from './gfx';
import { ALL_TERMS, EYE, lightAt, panelLayout, renderSphere, sphereMesh, type LightParams, type ShadeMode, type Terms } from './light';
import './graphics.css';
import './shading.css';

const KA = 0.12;
const KD = 0.75;
const KS = 0.6;
const FB = 112; // framebuffer side for the sphere panels

/** Canvas whose height follows its width through a panel layout. */
function usePanelCanvas(n: number, draw: (ctx: CanvasRenderingContext2D, lay: ReturnType<typeof panelLayout>, w: number) => void, deps: unknown[], opts?: Parameters<typeof panelLayout>[2]) {
  const [W, setW] = useState(640);
  const lay = panelLayout(W, n, opts);
  const c = useCanvas2D((ctx, { w }) => draw(ctx, panelLayout(w, n, opts), w), [...deps, W], { height: lay.h, minHeight: 60, maxHeight: 2000 });
  useEffect(() => {
    if (c.size.w !== W) setW(c.size.w);
  }, [c.size.w, W]);
  return c;
}

function panelLabel(ctx: CanvasRenderingContext2D, P: Palette, s: string, x: number, y: number, size: number, sub?: string) {
  ctx.fillStyle = P.ink;
  ctx.font = `600 12px ${P.fontBody}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(s, x + size / 2, y + size + 5);
  if (sub) {
    ctx.fillStyle = P.ink3;
    ctx.font = `10px ${P.fontMono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(sub, x + size - 4, y + 4);
  }
}

/* ─────────────── Figure 1: Lambert's cosine law ─────────────── */

function LambertFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(50);
  const th = (deg * Math.PI) / 180;
  const cos = Math.cos(th);
  const geom = useRef({ cx: 0, sy: 0, R: 0 });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const split = w >= 560;
      const sw = split ? w * 0.6 : w;
      const sceneH = split ? h : h - 130;
      const cx = sw / 2;
      const sy = sceneH - 46;
      const R = Math.min(sw * 0.4, sceneH - 70);
      geom.current = { cx, sy, R };
      const L = { x: cx + R * Math.sin(th), y: sy - R * Math.cos(th) };

      // the lit footprint and the beam of parallel rays
      const B = R * 0.36;
      const u = { x: -Math.sin(th), y: Math.cos(th) };
      const perp = { x: Math.cos(th), y: Math.sin(th) };
      const ends: number[] = [];
      const starts: { x: number; y: number }[] = [];
      for (let k = 0; k < 5; k++) {
        const o = -B / 2 + (k * B) / 4;
        const s = { x: L.x + o * perp.x + u.x * 22, y: L.y + o * perp.y + u.y * 22 };
        const t = (sy - s.y) / u.y;
        starts.push(s);
        ends.push(s.x + t * u.x);
      }
      const fx0 = Math.min(...ends), fx1 = Math.max(...ends);
      ctx.fillStyle = alpha(P.hl, 0.25 + 0.75 * cos);
      ctx.fillRect(fx0, sy - 7, fx1 - fx0, 7);
      ctx.strokeStyle = alpha(P.hl, 0.9);
      ctx.lineWidth = 1.5;
      starts.forEach((s, k) => {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ends[k], sy - 7);
        ctx.stroke();
      });

      // the surface
      ctx.fillStyle = P.surface3;
      ctx.fillRect(cx - R - 20, sy, 2 * R + 40, 16);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - R - 20, sy);
      ctx.lineTo(cx + R + 20, sy);
      ctx.stroke();

      // the angle arc between n and l
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const ar = R * 0.28;
      const a0 = -Math.PI / 2, a1 = -Math.PI / 2 + th;
      ctx.arc(cx, sy, ar, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const am = -Math.PI / 2 + th / 2;
      if (Math.abs(deg) > 6) ctx.fillText('θ', cx + Math.cos(am) * (ar + 12), sy + Math.sin(am) * (ar + 12));

      // n and l as unit arrows
      const ul = R * 0.55;
      drawArrow(ctx, cx, sy, cx, sy - ul, P.ink, 2.5, 9);
      drawArrow(ctx, cx, sy, cx + Math.sin(th) * ul, sy - Math.cos(th) * ul, P.accent, 2.5, 9);
      ctx.font = `700 13px ${P.fontMono}`;
      ctx.fillStyle = P.ink;
      ctx.fillText('n', cx - 12, sy - ul + 4);
      ctx.fillStyle = P.accent;
      ctx.fillText('l', cx + Math.sin(th) * (ul + 14), sy - Math.cos(th) * (ul + 14));

      // the light, which can be dragged
      ctx.beginPath();
      ctx.arc(L.x, L.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = P.hl;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = alpha(P.ink3, 0.5);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(cx, sy, R, -Math.PI, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText(`빛이 닿는 폭 ×${(1 / cos).toFixed(2)}`, (fx0 + fx1) / 2, sy + 28);

      // cos θ against θ
      const px = split ? sw + 16 : 40;
      const py = split ? 30 : sceneH + 18;
      const pw = (split ? w - sw - 28 : w - 56);
      const ph = split ? h - 80 : 92;
      const X = (d: number) => px + ((d + 90) / 180) * pw;
      const Y = (v: number) => py + (1 - v) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (const v of [0, 0.5, 1]) {
        ctx.beginPath();
        ctx.moveTo(px, Y(v) + 0.5);
        ctx.lineTo(px + pw, Y(v) + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0, 0.5, 1]) ctx.fillText(String(v), px - 5, Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const d of [-90, -60, 0, 60, 90]) ctx.fillText(`${d}°`, X(d), Y(0) + 5);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let d = -90; d <= 90; d += 2) {
        const y = Y(Math.cos((d * Math.PI) / 180));
        if (d === -90) ctx.moveTo(X(d), y);
        else ctx.lineTo(X(d), y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(deg), Y(cos), 5, 0, Math.PI * 2);
      ctx.fillStyle = P.hl;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = P.ink2;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('밝기 = n · l = cos θ', px, py - 8);
    },
    [P, deg, th, cos],
    { height: 330, minHeight: 60 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const { cx, sy, R } = geom.current;
      const lx = cx + R * Math.sin(th), ly = sy - R * Math.cos(th);
      return Math.hypot(x - lx, y - ly) < 24 ? 'L' : null;
    },
    onDrag: (_, x, y) => {
      const { cx, sy } = geom.current;
      const a = (Math.atan2(x - cx, sy - y) * 180) / Math.PI;
      setDeg(Math.round(Math.max(-85, Math.min(85, a))));
    },
  });

  return (
    <Figure
      no={1}
      title="비스듬히 비추면 어두워지는 이유"
      hint="노란 광원을 끌거나 슬라이더를 움직이세요"
      caption={<>같은 굵기의 빛다발(노란 선 다섯 줄)이 비스듬히 들어오면 표면에 닿는 폭이 1/cos θ배로 넓어집니다. 같은 양의 빛이 넓게 퍼지므로 넓이당 받는 빛은 cos θ배가 됩니다. 표면의 노란 띠가 진할수록 밝습니다. 오른쪽 그래프는 θ에 따른 cos θ입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`표면에 수직인 법선 n과 광원 쪽을 가리키는 l 사이의 각도가 ${deg}도입니다. n·l = cos θ = ${cos.toFixed(2)}이고, 빛이 닿는 폭은 정면일 때의 ${(1 / cos).toFixed(2)}배입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Slider id="sh-theta" label="광원 각도 θ" value={deg} min={-85} max={85} step={1} onChange={setDeg} format={(v) => `${v}°`} />
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, 1fr)', flex: '1 1 220px' }}>
          <Readout label="n · l" value={cos.toFixed(2)} color="var(--accent)" />
          <Readout label="닿는 폭" value={`×${(1 / cos).toFixed(2)}`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the three Phong terms ─────────────── */

const TERM_LABEL: Record<keyof Terms, string> = { ambient: '주변광', diffuse: '난반사', specular: '정반사' };

function PhongFigure() {
  const P = usePalette();
  const [terms, setTerms] = useState<Terms>(ALL_TERMS);
  const [shine, setShine] = useState(32);
  const [az, setAz] = useState(-40);
  const [el, setEl] = useState(35);
  const [blinn, setBlinn] = useState(false);
  const mesh = useMemo(() => sphereMesh(40), []);

  const images = useMemo(() => {
    const base = cssToRgb(P.accent);
    const bg = cssToRgb(P.surface);
    const L: LightParams = { pos: lightAt(az, el), eye: EYE, ka: KA, kd: KD, ks: KS, shininess: blinn ? shine * 4 : shine, blinn, terms };
    const one = (t: Terms) => {
      const fb = new Framebuffer(FB, FB);
      const info = renderSphere(fb, mesh, 'phong', { ...L, terms: t }, base, bg);
      return { fb, info };
    };
    return {
      ambient: one({ ambient: true, diffuse: false, specular: false }),
      diffuse: one({ ambient: false, diffuse: true, specular: false }),
      specular: one({ ambient: false, diffuse: false, specular: true }),
      all: one(terms),
    };
  }, [P, terms, shine, az, el, blinn, mesh]);

  const { wrapRef, canvasRef } = usePanelCanvas(
    4,
    (ctx, lay) => {
      const keys = ['ambient', 'diffuse', 'specular', 'all'] as const;
      keys.forEach((k, i) => {
        const { x, y } = lay.pos(i);
        const on = k === 'all' || terms[k];
        ctx.globalAlpha = on ? 1 : 0.35;
        present(ctx, images[k].fb, x, y, lay.size / FB);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = k === 'all' ? P.ink : P.line;
        ctx.lineWidth = k === 'all' ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, lay.size - 1, lay.size - 1);
        panelLabel(ctx, P, k === 'all' ? '합' : `${TERM_LABEL[k]}${on ? '' : ' (꺼짐)'}`, x, y, lay.size, k === 'all' ? undefined : i === 0 ? `k_a ${KA}` : i === 1 ? `k_d ${KD}` : `k_s ${KS}`);
        if (i < 3) {
          ctx.fillStyle = P.ink3;
          ctx.font = `600 16px ${P.fontBody}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const nx = lay.pos(i + 1);
          if (nx.y === y) ctx.fillText(i < 2 ? '+' : '=', (x + lay.size + nx.x) / 2, y + lay.size / 2);
        }
      });
    },
    [P, images, terms],
  );

  const on = (k: keyof Terms) => (v: boolean) => setTerms({ ...terms, [k]: v });
  const peak = images.all.info.peakSpec;

  return (
    <Figure
      no={2}
      title="퐁 반사 모델의 세 항"
      hint="항을 켜고 끄고, 빛을 옮기고, 반짝임을 바꿔 보세요"
      caption={<>구 하나를 픽셀마다 계산해 그렸습니다(픽셀 {FB}×{FB}, 삼각형 {images.all.info.triangles}개). 앞의 세 칸은 각 항만 따로, 마지막 칸은 켜 둔 항의 합입니다. 주변광과 난반사는 물체의 색을 띠고, 정반사는 빛의 색(흰색)을 띱니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`주변광, 난반사, 정반사, 그리고 그 합으로 그린 구 네 개. 켜진 항: ${(Object.keys(terms) as (keyof Terms)[]).filter((k) => terms[k]).map((k) => TERM_LABEL[k]).join(', ') || '없음'}. 광원은 가로 ${az}도, 높이 ${el}도, 반짝임 지수 ${shine}${blinn ? ', 블린-퐁' : ''}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-split" style={{ marginTop: 14 }}>
        <div className="controls">
          <Slider id="sh-az" label="광원 가로 방향" value={az} min={-90} max={90} step={1} onChange={setAz} format={(v) => `${v}°`} />
          <Slider id="sh-el" label="광원 높이" value={el} min={-30} max={80} step={1} onChange={setEl} format={(v) => `${v}°`} />
          <Slider id="sh-shine" label="반짝임 지수 n" value={shine} min={1} max={128} step={1} onChange={setShine} />
        </div>
        <div className="controls">
          <div className="sh-checks">
            <Check label="주변광" checked={terms.ambient} onChange={on('ambient')} />
            <Check label="난반사" checked={terms.diffuse} onChange={on('diffuse')} />
            <Check label="정반사" checked={terms.specular} onChange={on('specular')} />
            <Check label="블린-퐁 (반각 벡터)" checked={blinn} onChange={setBlinn} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="하이라이트 최대" value={terms.specular ? peak.toFixed(2) : '꺼짐'} color="var(--accent)" />
            <Readout label="지수" value={blinn ? `${shine}×4` : String(shine)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: flat, Gouraud, Phong ─────────────── */

const MODES: { mode: ShadeMode; name: string }[] = [
  { mode: 'flat', name: '플랫: 면마다 한 번' },
  { mode: 'gouraud', name: '구로: 꼭짓점마다' },
  { mode: 'phong', name: '퐁: 픽셀마다' },
];

function ModesFigure() {
  const P = usePalette();
  const [seg, setSeg] = useState(8);
  const [shine, setShine] = useState(32);
  const mesh = useMemo(() => sphereMesh(seg), [seg]);

  const images = useMemo(() => {
    const base = cssToRgb(P.accent);
    const bg = cssToRgb(P.surface);
    const L: LightParams = { pos: lightAt(-40, 35), eye: EYE, ka: KA, kd: KD, ks: KS, shininess: shine, blinn: false, terms: ALL_TERMS };
    return MODES.map(({ mode }) => {
      const fb = new Framebuffer(FB, FB);
      const info = renderSphere(fb, mesh, mode, L, base, bg);
      return { fb, info };
    });
  }, [P, mesh, shine]);

  const { wrapRef, canvasRef } = usePanelCanvas(
    3,
    (ctx, lay) => {
      images.forEach((im, i) => {
        const { x, y } = lay.pos(i);
        present(ctx, im.fb, x, y, lay.size / FB);
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, lay.size - 1, lay.size - 1);
        panelLabel(ctx, P, MODES[i].name, x, y, lay.size, `하이라이트 ${im.info.peakSpec.toFixed(2)}`);
      });
    },
    [P, images],
    { maxSize: 250 },
  );

  const [fl, go, ph] = images.map((im) => im.info.peakSpec);

  return (
    <Figure
      no={3}
      title="같은 공, 세 가지 셰이딩"
      hint="조각 수를 늘리고 줄여 보세요"
      caption={<>세 그림 모두 같은 삼각형과 같은 빛을 씁니다. 다른 것은 퐁 모델을 어디서 계산하느냐뿐입니다. 각 칸 오른쪽 위의 수는 그림 안에서 가장 센 정반사 세기이고, 최댓값은 k_s = {KS}입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`가로 조각 ${seg}개(삼각형 ${mesh.tris.length}개)로 만든 구를 세 방식으로 칠했습니다. 가장 센 하이라이트는 플랫 ${fl.toFixed(2)}, 구로 ${go.toFixed(2)}, 퐁 ${ph.toFixed(2)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Slider id="sh-seg" label="가로 조각 수" value={seg} min={4} max={40} step={2} onChange={setSeg} format={(v) => `${v} (삼각형 ${sphereMesh(v).tris.length})`} />
        <Slider id="sh-shine3" label="반짝임 지수 n" value={shine} min={1} max={128} step={1} onChange={setShine} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: gamma ─────────────── */

function GammaFigure() {
  const P = usePalette();
  const [correct, setCorrect] = useState(true);
  const mesh = useMemo(() => sphereMesh(40), []);
  const images = useMemo(() => {
    const L: LightParams = { pos: lightAt(-60, 20), eye: EYE, ka: 0, kd: 1, ks: 0, shininess: 1, blinn: false, terms: { ambient: false, diffuse: true, specular: false } };
    const grey: RGB = [1, 1, 1];
    const bg: RGB = [0, 0, 0];
    const fb = new Framebuffer(FB, FB);
    renderSphere(fb, mesh, 'phong', L, grey, bg);
    const out = new Framebuffer(FB, FB);
    for (let y = 0; y < FB; y++)
      for (let x = 0; x < FB; x++) {
        const v = fb.get(x, y)[0];
        const e = correct ? Math.pow(v, 1 / 2.2) : v;
        out.set(x, y, [e, e, e]);
      }
    // a ramp of the light intensity 0..1, encoded the same way
    const ramp = new Framebuffer(16, 1);
    for (let i = 0; i < 16; i++) {
      const v = i / 15;
      const e = correct ? Math.pow(v, 1 / 2.2) : v;
      ramp.set(i, 0, [e, e, e]);
    }
    return { out, ramp };
  }, [mesh, correct]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const s = Math.min(h - 30, w * 0.42);
      present(ctx, images.out, 0, 0, s / FB);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      const rx = s + 20, rw = w - rx;
      const ry = s / 2 - 22;
      present(ctx, images.ramp, rx, ry, rw / 16);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textBaseline = 'top';
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        ctx.textAlign = v === 0 ? 'left' : v === 1 ? 'right' : 'center';
        ctx.fillText(String(v), rx + v * rw, ry + rw / 16 + 6);
      }
      ctx.textAlign = 'left';
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.fillText('빛의 세기 0에서 1까지 같은 간격', rx, ry - 20);
      ctx.fillStyle = P.ink2;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(correct ? '감마 보정함 (값^(1/2.2)로 보냄)' : '계산한 값을 그대로 보냄', 0, s + 8);
    },
    [P, images, correct],
    { height: 210, minHeight: 60 },
  );

  return (
    <Figure
      no={4}
      title="계산한 밝기를 화면에 그대로 보내면"
      hint="감마 보정을 켜고 꺼 보세요"
      caption={<>난반사만 있는 흰 공을 흰 빛 하나로 비췄습니다. 감마 보정을 끄면 계산한 빛의 세기를 그대로 화면 값으로 보내는데, 화면은 받은 값을 대략 2.2제곱해서 빛을 내므로 어두운 쪽이 실제보다 훨씬 어두워지고 빛과 그림자의 경계가 급해집니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`난반사만으로 칠한 흰 구와 0부터 1까지의 밝기 띠. 감마 보정이 ${correct ? '켜져 있어 어두운 쪽이 부드럽게 이어집니다' : '꺼져 있어 어두운 쪽이 뭉개지고 경계가 급합니다'}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Check label="감마 보정" checked={correct} onChange={setCorrect} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Shading() {
  return (
    <>
      <h2>둥글게 보이는 것은 밝기 때문입니다</h2>
      <p>
        <a href={lessonHref('cs-graphics', 'rasterization')}>앞 장</a>의 렌더러는 삼각형마다 한 가지 색을 칠했습니다. 그렇게 그린 공은 화면에서 납작한 원판으로 보입니다. 우리가 공을 둥글다고 느끼는 것은 윤곽 때문만이 아니라, 빛을 정면으로 받는 쪽은 밝고 옆으로 돌아갈수록 어두워지는 밝기의 변화 때문입니다. 이 장에서는 표면의 한 점이 얼마나 밝아야 하는지를 계산하는 법, 즉 <T en="shading">셰이딩</T>을 다룹니다.
      </p>
      <p>
        계산에 필요한 재료는 세 방향입니다. 표면이 바라보는 방향인 <T en="normal vector">법선 벡터</T> <M>{'\\mathbf n'}</M>, 그 점에서 광원 쪽을 가리키는 <M>{'\\mathbf l'}</M>, 그 점에서 눈(카메라) 쪽을 가리키는 <M>{'\\mathbf v'}</M>입니다. 셋 모두 길이 1인 단위 벡터로 만들어 두면, 두 방향이 얼마나 같은 쪽을 보는지를 <a href={lessonHref('math-linear-algebra', 'vectors')}>내적</a> 하나로 잴 수 있습니다. 단위 벡터끼리의 내적은 둘 사이 각도의 코사인입니다(<a href={lessonHref('ai-basics', 'vectors')}>벡터와 내적</a>에서 본 바로 그 성질입니다).
      </p>

      <h2>램버트의 코사인 법칙</h2>
      <p>
        종이나 분필처럼 거친 표면은 받은 빛을 모든 방향으로 고르게 흩뿌립니다. 그래서 어디서 보든 밝기가 같고, 밝기를 정하는 것은 그 점이 빛을 <strong>얼마나 많이 받느냐</strong>뿐입니다. 그림 1에서 광원을 옆으로 끌어 보세요.
      </p>
      <LambertFigure />
      <p>
        빛이 정면(θ = 0°)에서 오면 빛다발이 가장 좁은 폭에 몰립니다. 기본 위치인 50°에서는 같은 빛다발이 1.56배 넓게 퍼지므로, 넓이당 받는 빛은 1/1.56 = 0.64배, 곧 cos 50°입니다. 60°에서는 정확히 절반이고, 90°에 가까워지면 빛이 표면을 스치기만 해서 0이 됩니다. 이것이 <T en="Lambert's cosine law">램버트의 코사인 법칙</T>이고, 이렇게 고르게 흩어지는 반사를 <T en="diffuse reflection">난반사</T>라고 합니다.
      </p>
      <MB note="광원이 표면 뒤에 있으면 내적이 음수가 되므로 0으로 자릅니다.">{'I_{\\text{난반사}} = k_d \\, \\max(0,\\ \\mathbf n \\cdot \\mathbf l)'}</MB>
      <p>
        <M>{'k_d'}</M>는 표면이 빛을 얼마나 되돌려 보내는지 정하는 0과 1 사이의 수입니다. 색이 있는 물체라면 빨강, 초록, 파랑마다 다른 <M>{'k_d'}</M>를 씁니다. 빨간 공은 빨간 빛은 많이, 파란 빛은 조금만 되돌려 보낸다는 뜻입니다.
      </p>

      <h2>퐁 반사 모델</h2>
      <p>
        난반사만으로 그린 공은 석고처럼 보입니다. 플라스틱이나 사과처럼 매끈한 표면에는 광원이 비치는 작은 밝은 점, 곧 <T en="specular highlight">하이라이트</T>가 생깁니다. 매끈한 표면은 빛을 거울처럼 한쪽으로 튕겨 보내기 때문에, 그 반사 방향 근처에서 볼 때만 밝습니다. 1975년 퐁(Bui Tuong Phong)은 이 둘에 주변의 간접광을 대신하는 상수 하나를 더한 간단한 식을 내놓았고, 이 식은 지금도 실시간 그래픽스의 출발점입니다.
      </p>
      <MB note="r은 l을 n에 대해 거울처럼 뒤집은 반사 방향입니다. 지수 n이 클수록 하이라이트가 작고 날카로워집니다.">{'I = \\underbrace{k_a}_{\\text{주변광}} + \\underbrace{k_d \\max(0,\\ \\mathbf n\\cdot\\mathbf l)}_{\\text{난반사}} + \\underbrace{k_s \\max(0,\\ \\mathbf r\\cdot\\mathbf v)^{n}}_{\\text{정반사}}'}</MB>
      <PhongFigure />
      <p>
        세 항을 하나씩 꺼 보세요. <strong>주변광</strong>만 남기면 구는 테두리만 보이는 납작한 원판이 됩니다. 실제로는 벽과 바닥에서 튕겨 온 빛이 그늘진 쪽도 조금 밝히는데, 그것을 모두 계산하는 대신 어디에나 같은 양을 더하는 근사입니다. <strong>주변광을 끄면</strong> 빛을 등진 쪽이 완전히 까맣게 되어 공의 윤곽이 배경에 묻힙니다. <strong>정반사</strong>는 구의 왼쪽 위에 작은 흰 점으로 나타나고, 반짝임 지수를 1로 내리면 넓게 번진 광택이, 128로 올리면 바늘 끝 같은 점이 됩니다. 지수는 표면이 얼마나 매끈한지를 나타내는 셈입니다.
      </p>
      <p>
        <strong>블린-퐁</strong>을 켜면 반사 방향 <M>{'\\mathbf r'}</M>을 계산하는 대신, 빛과 눈 방향의 한가운데인 <T en="half vector">반각 벡터</T> <M>{'\\mathbf h = \\text{normalize}(\\mathbf l + \\mathbf v)'}</M>와 법선의 내적 <M>{'(\\mathbf n \\cdot \\mathbf h)^n'}</M>을 씁니다. 같은 각도 차이에서 <M>{'\\mathbf n\\cdot\\mathbf h'}</M>는 <M>{'\\mathbf r \\cdot \\mathbf v'}</M>보다 덜 줄어들기 때문에, 비슷한 크기의 하이라이트를 얻으려면 지수를 대략 네 배로 키웁니다. 그림도 블린-퐁에서는 지수에 4를 곱해 씁니다. 계산이 조금 싸고, 빛이 표면을 스칠 때도 자연스러워서 OpenGL과 Direct3D의 예전 고정 파이프라인이 기본으로 썼습니다.
      </p>
      <Callout kind="note">
        퐁 모델은 물리 법칙이 아니라 그럴듯해 보이게 맞춘 식입니다. 예를 들어 정반사 항은 들어온 빛보다 많은 빛을 내보낼 수도 있습니다. 요즘 게임과 영화는 에너지를 보존하고 거칠기와 금속성 같은 측정 가능한 값으로 표면을 정하는 <T en="physically based rendering">물리 기반 렌더링</T>을 씁니다. 그래도 계산의 뼈대, 곧 법선과 빛과 눈 방향의 내적으로 밝기를 정한다는 구조는 같습니다.
      </Callout>

      <h2>어디서 계산할 것인가</h2>
      <p>
        식이 정해졌으니 남은 질문은 <strong>어느 점에서</strong> 계산하느냐입니다. 화면의 픽셀은 수십만 개이고 삼각형의 꼭짓점은 그보다 훨씬 적으므로, 계산을 아끼고 싶은 마음이 듭니다. 세 가지 선택이 있습니다.
      </p>
      <ul>
        <li>
          <T en="flat shading">플랫 셰이딩</T>: 삼각형마다 한 번, 면의 법선으로 계산해서 삼각형 전체를 한 색으로 칠합니다.
        </li>
        <li>
          <T en="Gouraud shading">구로 셰이딩</T>: 꼭짓점마다 계산하고, 삼각형 안쪽은 세 꼭짓점의 색을 무게중심 좌표로 섞습니다(1971년, 앙리 구로).
        </li>
        <li>
          <T en="Phong shading">퐁 셰이딩</T>: 꼭짓점의 <strong>법선</strong>을 섞어 픽셀마다 법선을 만들고, 픽셀마다 계산합니다. 반사 모델과 이름이 같지만 다른 것입니다.
        </li>
      </ul>
      <ModesFigure />
      <p>
        기본 설정(가로 조각 8개, 삼각형 48개)에서 플랫 셰이딩은 면이 하나하나 보이는 보석 같은 공이 됩니다. 구로 셰이딩은 면의 경계가 사라져 매끄럽지만 <strong>하이라이트가 아예 없습니다</strong>. 각 칸의 숫자로 보면 플랫이 0.35, 구로가 0.00, 퐁이 0.60입니다. 하이라이트는 광원 반사 방향 근처의 좁은 곳에만 생기는데, 마침 그 근처에 꼭짓점이 하나도 없으면 꼭짓점에서 계산한 정반사가 모두 0이고, 0끼리 섞으면 삼각형 안쪽도 0이기 때문입니다. 조각을 16개로 늘리면 구로의 하이라이트가 0.12로 희미하게 나타나고, 40개면 0.57로 퐁의 0.60에 가까워집니다. 반대로 퐁 셰이딩은 조각이 4개뿐이어도 하이라이트를 정확한 자리에 그립니다. 픽셀마다 법선을 다시 만들기 때문에 실제 삼각형보다 둥근 표면을 흉내 내는 것입니다. 다만 윤곽선은 여전히 각져 있다는 것을 보세요. 셰이딩은 밝기만 속일 뿐 모양을 바꾸지는 못합니다.
      </p>
      <Callout kind="intuition">
        구로 셰이딩은 몇 군데에서만 온도를 재고 그 사이는 짐작하는 것과 같습니다. 온도가 고르게 변하는 곳에서는 잘 맞지만, 측정 지점 사이에 작은 난로(하이라이트)가 있으면 그 존재를 영영 모릅니다. 1990년대 하드웨어는 픽셀마다 계산할 여유가 없어 구로 셰이딩을 썼고, 지금의 GPU는 픽셀마다 작은 프로그램(<T en="fragment shader">프래그먼트 셰이더</T>)을 돌리므로 퐁 셰이딩이 기본입니다. 이 렌더러의 <code>drawMesh</code>가 픽셀마다 부르는 <code>shade</code> 함수가 바로 그 프래그먼트 셰이더 역할입니다.
      </Callout>

      <h2>마지막 한 걸음: 감마</h2>
      <p>
        계산한 밝기 0.5를 화면에 0.5(8비트로 128)로 보내면, 화면은 빛을 절반만 내지 않습니다. 모니터와 이미지 파일의 표준인 sRGB는 사람 눈이 어두운 쪽의 차이에 더 예민하다는 점을 이용해, 값을 대략 2.2제곱한 세기로 빛을 냅니다. 128을 받은 픽셀은 실제로 <M>{'0.5^{2.2} \\approx 0.22'}</M>, 최대 밝기의 22% 정도만 냅니다.
      </p>
      <GammaFigure />
      <p>
        그래서 빛을 계산할 때는 실제 빛의 세기(선형 값)로 계산하고, 화면에 보내기 직전에 <M>{'1/2.2'}</M>제곱해서 화면이 하는 일을 미리 되돌려 둡니다. 이것이 <T en="gamma correction">감마 보정</T>입니다. 보정을 끄면 공의 그늘진 쪽이 너무 빨리 까맣게 떨어져 빛과 그림자의 경계가 칼로 자른 듯 급해집니다. 밝기 띠도 보세요. 보정한 띠는 실제 빛의 세기가 같은 간격으로 늘어나는 모습이라 밝은 쪽이 넓어 보이고, 보정하지 않은 띠의 가운데(세기 0.5)는 실제로는 22%의 빛만 내고 있습니다. 반대로 텍스처 사진처럼 이미 sRGB로 저장된 색은 계산에 쓰기 전에 2.2제곱해서 선형으로 되돌려야 합니다. 이 장의 그림 1~3은 단순하게 보이려고 감마 보정을 하지 않았습니다.
      </p>

      <Callout kind="key">
        표면의 밝기는 법선 n, 광원 방향 l, 눈 방향 v의 내적으로 계산합니다. 난반사는 n·l에 비례하고(램버트의 코사인 법칙), 정반사는 반사 방향과 눈 방향이 가까울수록 밝으며 지수가 클수록 하이라이트가 작아집니다. 퐁 반사 모델은 여기에 상수 주변광을 더합니다. 이 식을 면마다(플랫), 꼭짓점마다(구로), 픽셀마다(퐁) 계산할 수 있는데, 꼭짓점에서만 계산하면 꼭짓점 사이에 떨어진 하이라이트를 놓칩니다. 계산은 선형 값으로 하고 화면에 보낼 때 감마 보정을 합니다.
      </Callout>
      <Quiz
        q="삼각형 200개로 만든 매끈한 주전자를 구로 셰이딩으로 그렸더니, 주전자를 천천히 돌릴 때 하이라이트가 깜빡이며 나타났다 사라진다. 삼각형 수를 그대로 두고 고치는 방법으로 가장 알맞은 것은?"
        options={['반짝임 지수를 크게 올린다', '퐁 셰이딩으로 바꿔 법선을 보간하고 픽셀마다 계산한다', '주변광 계수를 올린다', '플랫 셰이딩으로 바꾼다']}
        answer={1}
        explain={<>구로 셰이딩은 하이라이트가 꼭짓점 근처를 지날 때만 그것을 봅니다. 주전자가 돌면 하이라이트가 꼭짓점 위를 지났다가 삼각형 안쪽으로 들어가기를 되풀이하므로 깜빡입니다. 법선을 보간해 픽셀마다 계산하면 하이라이트가 어디에 떨어지든 그려집니다. 지수를 올리면 하이라이트가 더 작아져 더 자주 놓치고, 플랫 셰이딩은 면마다 한 번만 계산하므로 더 나빠집니다.</>}
      />
    </>
  );
}

import { useMemo, useState } from 'react';
import { Callout, Check, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { Framebuffer, cssToRgb, drawTriangle, mix, rgbCss, type RGB, type Vec2 } from './gfx';
import { DEPTH_TRIS, DH, DW, GH, GW, area2, bary, bbox, claims, cover, depthRun, edgeValues, type EdgeRule, type Tri2 } from './raster';
import './graphics.css';
import './raster.css';

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const VNAME = ['v₀', 'v₁', 'v₂'];

/* ─────────────── the zoomed pixel grid ─────────────── */

interface Grid {
  ox: number;
  oy: number;
  px: number;
}

function gridOf(w: number, h: number, gw: number, gh: number): Grid {
  const px = Math.min((w - 2) / gw, (h - 2) / gh);
  return { ox: (w - px * gw) / 2, oy: (h - px * gh) / 2, px };
}

function drawGridLines(ctx: CanvasRenderingContext2D, P: Palette, g: Grid, gw: number, gh: number) {
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= gw; i++) {
    const x = Math.round(g.ox + i * g.px) + 0.5;
    ctx.moveTo(x, g.oy);
    ctx.lineTo(x, g.oy + gh * g.px);
  }
  for (let j = 0; j <= gh; j++) {
    const y = Math.round(g.oy + j * g.px) + 0.5;
    ctx.moveTo(g.ox, y);
    ctx.lineTo(g.ox + gw * g.px, y);
  }
  ctx.stroke();
}

function drawTriOutline(ctx: CanvasRenderingContext2D, P: Palette, g: Grid, t: Tri2, color: string, hiEdge = -1) {
  const X = (p: Vec2) => g.ox + p[0] * g.px;
  const Y = (p: Vec2) => g.oy + p[1] * g.px;
  for (let k = 0; k < 3; k++) {
    // edge k is the one opposite vertex k
    const a = t[(k + 1) % 3], b = t[(k + 2) % 3];
    ctx.strokeStyle = k === hiEdge ? P.hl : color;
    ctx.lineWidth = k === hiEdge ? 3 : 1.6;
    ctx.beginPath();
    ctx.moveTo(X(a), Y(a));
    ctx.lineTo(X(b), Y(b));
    ctx.stroke();
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, P: Palette, g: Grid, t: Tri2, colors: string[], active: number) {
  t.forEach((p, k) => {
    const x = g.ox + p[0] * g.px, y = g.oy + p[1] * g.px;
    ctx.beginPath();
    ctx.arc(x, y, k === active ? 8 : 6.5, 0, Math.PI * 2);
    ctx.fillStyle = colors[k];
    ctx.fill();
    ctx.strokeStyle = P.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `700 12px ${P.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // put the label outside the triangle, away from its centroid
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1;
    const lx = x + (dx / d) * 17, ly = y + (dy / d) * 17;
    ctx.fillStyle = P.surface;
    ctx.fillRect(lx - 11, ly - 8, 22, 16);
    ctx.fillStyle = P.ink;
    ctx.fillText(VNAME[k], lx, ly + 0.5);
  });
}

/** A triangle the reader drags by its corners, with a vertex picker and sliders as the keyboard route. */
function useDraggableTri(initial: Tri2) {
  const [tri, setTri] = useState<Tri2>(initial);
  const [sel, setSel] = useState(0);
  const move = (k: number, x: number, y: number) => {
    setSel(k);
    setTri((t) => {
      const n = t.map((p) => [...p]) as Tri2;
      n[k] = [Math.max(0, Math.min(GW, Math.round(x * 10) / 10)), Math.max(0, Math.min(GH, Math.round(y * 10) / 10))];
      return n;
    });
  };
  return { tri, sel, setSel, move, reset: () => setTri(initial) };
}

function VertexControls({ d, idPrefix }: { d: ReturnType<typeof useDraggableTri>; idPrefix: string }) {
  const p = d.tri[d.sel];
  return (
    <>
      <Seg label="움직일 꼭짓점" value={d.sel} onChange={d.setSel} options={[0, 1, 2].map((k) => ({ value: k, label: VNAME[k] }))} />
      <Slider id={`${idPrefix}-x`} label={`${VNAME[d.sel]}의 x`} value={p[0]} min={0} max={GW} step={0.1} onChange={(v) => d.move(d.sel, v, p[1])} format={f1} />
      <Slider id={`${idPrefix}-y`} label={`${VNAME[d.sel]}의 y`} value={p[1]} min={0} max={GH} step={0.1} onChange={(v) => d.move(d.sel, p[0], v)} format={f1} />
    </>
  );
}

/* ─────────────── Figure 1: which pixels does a triangle cover? ─────────────── */

const TRI0: Tri2 = [
  [3.2, 2.4],
  [20.6, 5.1],
  [8.3, 14.2],
];

function CoverageFigure() {
  const P = usePalette();
  const d = useDraggableTri(TRI0);
  const [tint, setTint] = useState(-1);
  const [showBox, setShowBox] = useState(true);
  const { inside, stats } = useMemo(() => cover(d.tri), [d.tri]);
  const box = bbox(d.tri);
  const area = Math.abs(area2(d.tri)) / 2;

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const g = gridOf(w, h, GW, GH);
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const X = g.ox + x * g.px, Y = g.oy + y * g.px;
          if (tint >= 0) {
            const e = edgeValues(d.tri, x + 0.5, y + 0.5)[tint];
            ctx.fillStyle = alpha(e >= 0 ? P.good : P.bad, 0.16);
            ctx.fillRect(X, Y, g.px, g.px);
          }
          if (inside[y * GW + x]) {
            ctx.fillStyle = alpha(P.accent, 0.5);
            ctx.fillRect(X, Y, g.px, g.px);
          }
        }
      drawGridLines(ctx, P, g, GW, GH);
      if (showBox) {
        ctx.strokeStyle = P.ink3;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(g.ox + box.x0 * g.px, g.oy + box.y0 * g.px, (box.x1 - box.x0 + 1) * g.px, (box.y1 - box.y0 + 1) * g.px);
        ctx.setLineDash([]);
      }
      // pixel centres: the points that are actually tested
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          ctx.beginPath();
          ctx.arc(g.ox + (x + 0.5) * g.px, g.oy + (y + 0.5) * g.px, inside[y * GW + x] ? 2.4 : 1.6, 0, Math.PI * 2);
          ctx.fillStyle = inside[y * GW + x] ? P.ink : P.lineStrong;
          ctx.fill();
        }
      drawTriOutline(ctx, P, g, d.tri, P.ink, tint);
      drawHandles(ctx, P, g, d.tri, [P.ink, P.ink, P.ink], d.sel);
    },
    [P, d.tri, d.sel, tint, showBox, inside],
    { aspect: GW / GH, maxHeight: 440, minHeight: 180 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const g = gridOf(size.w, size.h, GW, GH);
      let best: number | null = null, bd = 18;
      d.tri.forEach((p, k) => {
        const dd = Math.hypot(g.ox + p[0] * g.px - x, g.oy + p[1] * g.px - y);
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      });
      return best;
    },
    onDrag: (k, x, y) => {
      const g = gridOf(size.w, size.h, GW, GH);
      d.move(k as number, (x - g.ox) / g.px, (y - g.oy) / g.px);
    },
  });

  const ratio = stats.tested ? stats.covered / stats.tested : 0;
  return (
    <Figure
      no={1}
      title="삼각형이 덮는 픽셀"
      hint="꼭짓점을 끌어 보세요"
      caption={
        <>
          {GW}×{GH} 픽셀 화면을 크게 확대했습니다. 점은 픽셀의 중심이고, 래스터화는 이 점이 삼각형 안에 있는지만 묻습니다. 안에 든 중심(진한 점)의 픽셀이 칠해집니다. 점선 상자는 삼각형을 감싸는 경계 상자로, 렌더러는 이 상자 안의 픽셀만 검사합니다. 변 함수를 하나 고르면 그 변의 안쪽(초록)과 바깥쪽(빨강)이 칠해지고, 세 변 모두 안쪽인 곳이 삼각형입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="gx-col">
          <div ref={wrapRef} className="canvas-box grab">
            <canvas ref={canvasRef} role="img" aria-label={`꼭짓점 ${d.tri.map((p, k) => `${VNAME[k]} (${f1(p[0])}, ${f1(p[1])})`).join(', ')}인 삼각형이 픽셀 ${stats.covered}개를 덮습니다. 경계 상자 안의 픽셀 ${stats.tested}개를 검사했습니다.`} />
          </div>
        </div>
        <div className="controls">
          <VertexControls d={d} idPrefix="rz-cov" />
          <Seg
            label="변 함수의 부호 보기"
            value={tint}
            onChange={setTint}
            options={[
              { value: -1, label: '끄기' },
              { value: 0, label: 'E₀' },
              { value: 1, label: 'E₁' },
              { value: 2, label: 'E₂' },
            ]}
          />
          <Check label="경계 상자 보이기" checked={showBox} onChange={setShowBox} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="검사한 픽셀" value={stats.tested} />
            <Readout label="칠한 픽셀" value={stats.covered} color="var(--accent)" />
            <Readout label="삼각형 넓이" value={f1(area)} />
            <Readout label="검사 중 적중" value={`${Math.round(ratio * 100)}%`} />
          </div>
          <div className="gx-small">E₀는 {VNAME[0]}의 맞은편 변({VNAME[1]}→{VNAME[2]}), E₁은 {VNAME[1]}의 맞은편 변, E₂는 {VNAME[2]}의 맞은편 변입니다.</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the shared edge ─────────────── */

const SQ: Vec2[] = [
  [3.5, 2.5],
  [15.5, 2.5],
  [15.5, 14.5],
  [3.5, 14.5],
];
const SHARED: Tri2[] = [
  [SQ[0], SQ[1], SQ[2]],
  [SQ[0], SQ[2], SQ[3]],
];
const RULE_KO: Record<EdgeRule, string> = { 'top-left': '왼쪽 위 규칙', inclusive: '변 위도 칠함', exclusive: '변 위는 안 칠함' };

function SharedEdgeFigure() {
  const P = usePalette();
  const [rule, setRule] = useState<EdgeRule>('inclusive');
  const per = useMemo(() => SHARED.map((t) => claims([t], rule)), [rule]);
  const n = useMemo(() => claims(SHARED, rule), [rule]);
  let twice = 0, total = 0, holes = 0;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const v = n[y * GW + x];
      if (v) total++;
      if (v > 1) twice++;
      // a pixel centre strictly inside the square that nobody claimed
      const cx = x + 0.5, cy = y + 0.5;
      if (!v && cx > SQ[0][0] && cx < SQ[1][0] && cy > SQ[0][1] && cy < SQ[2][1]) holes++;
    }

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const g = gridOf(w, h, GW, GH);
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      const cols = [P.pos, P.neg];
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const i = y * GW + x;
          const X = g.ox + x * g.px, Y = g.oy + y * g.px;
          // both triangles are drawn half-transparent, so a pixel drawn twice comes out darker
          for (let k = 0; k < 2; k++)
            if (per[k][i]) {
              ctx.fillStyle = alpha(cols[k], 0.45);
              ctx.fillRect(X, Y, g.px, g.px);
            }
          if (n[i] > 1) {
            ctx.strokeStyle = P.bad;
            ctx.lineWidth = 2;
            ctx.strokeRect(X + 2, Y + 2, g.px - 4, g.px - 4);
          }
          const cx = x + 0.5, cy = y + 0.5;
          if (!n[i] && cx > SQ[0][0] && cx < SQ[1][0] && cy > SQ[0][1] && cy < SQ[2][1]) {
            ctx.strokeStyle = P.bad;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(X + 2, Y + 2, g.px - 4, g.px - 4);
            ctx.setLineDash([]);
          }
        }
      drawGridLines(ctx, P, g, GW, GH);
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          ctx.beginPath();
          ctx.arc(g.ox + (x + 0.5) * g.px, g.oy + (y + 0.5) * g.px, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = P.lineStrong;
          ctx.fill();
        }
      drawTriOutline(ctx, P, g, SHARED[0], P.ink);
      drawTriOutline(ctx, P, g, SHARED[1], P.ink);
    },
    [P, per, n],
    { aspect: GW / GH, maxHeight: 440, minHeight: 180 },
  );

  return (
    <Figure
      no={2}
      title="두 삼각형이 함께 쓰는 변"
      hint="규칙을 바꿔 보세요"
      caption={
        <>
          가로세로 12픽셀인 정사각형을 삼각형 두 개(주황, 파랑)로 나눴습니다. 꼭짓점을 픽셀 중심에 두었기 때문에 대각선과 네 변이 픽셀 중심 위를 정확히 지나갑니다. 두 삼각형을 반투명하게 칠해서, 두 번 칠한 픽셀(빨간 테두리)은 더 진하게 보입니다. 아무도 칠하지 않은 정사각형 안쪽 픽셀은 빨간 점선 테두리로 표시했습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`${RULE_KO[rule]}: 정사각형 픽셀 144개 중 칠한 픽셀 ${total}개, 두 번 칠한 픽셀 ${twice}개, 안쪽의 빈 픽셀 ${holes}개.`} />
        </div>
        <div className="controls">
          <Seg
            label="변 위에 걸친 픽셀 중심"
            value={rule}
            onChange={setRule}
            options={[
              { value: 'inclusive', label: '칠함' },
              { value: 'exclusive', label: '안 칠함' },
              { value: 'top-left', label: '왼쪽 위 규칙' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="칠한 픽셀" value={total} />
            <Readout label="정사각형 넓이" value="144" />
            <Readout label="두 번 칠함" value={twice} color={twice ? 'var(--bad)' : undefined} />
            <Readout label="안쪽 빈 픽셀" value={holes} color={holes ? 'var(--bad)' : undefined} />
          </div>
          <div className={'gx-note'} data-good={(!twice && !holes && total === 144) || undefined} data-bad={(twice > 0 || holes > 0) || undefined}>
            {rule === 'inclusive' && `대각선 위의 픽셀 ${twice}개를 두 삼각형이 모두 칠했고, 오른쪽 변과 아래 변 위의 픽셀까지 칠해서 넓이 144인 정사각형이 ${total}픽셀이 되었습니다.`}
            {rule === 'exclusive' && `대각선 위의 픽셀 ${holes}개는 아무도 칠하지 않아 틈이 생겼고, 위쪽 변과 왼쪽 변도 빠져서 ${total}픽셀만 칠했습니다.`}
            {rule === 'top-left' && `모든 픽셀을 정확히 한 번씩, 144개를 칠했습니다. 대각선은 위 삼각형(주황)에게는 왼쪽 변이라 주황이 가져갑니다.`}
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: alpha(P.pos, 0.6), label: '위 삼각형', shape: 'sq' },
          { color: alpha(P.neg, 0.6), label: '아래 삼각형', shape: 'sq' },
          { color: 'var(--bad)', label: '두 번 칠함 또는 빈 틈', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: barycentric interpolation ─────────────── */

function BaryFigure() {
  const P = usePalette();
  const d = useDraggableTri(TRI0);
  const [pix, setPix] = useState<[number, number]>([9, 6]);
  const vcol = useMemo(() => [P.pos, P.neg, P.good].map(cssToRgb), [P]);

  const fb = useMemo(() => {
    const f = new Framebuffer(GW, GH);
    f.clear(cssToRgb(P.surface));
    const [a, b, c] = d.tri.map((p, k) => ({ x: p[0], y: p[1], z: 0, a: vcol[k] as number[] }));
    drawTriangle(f, a, b, c, (fr) => fr.a as RGB, { depthTest: false });
    return f;
  }, [d.tri, vcol, P.surface]);

  const [bx, by] = pix;
  const w = bary(d.tri, bx + 0.5, by + 0.5);
  const inside = w.every((v) => v >= 0);
  const col: RGB = [0, 1, 2].map((i) => w[0] * vcol[0][i] + w[1] * vcol[1][i] + w[2] * vcol[2][i]) as RGB;

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const g = gridOf(cw, h, GW, GH);
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, cw, h);
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          ctx.fillStyle = rgbCss(fb.get(x, y));
          ctx.fillRect(g.ox + x * g.px, g.oy + y * g.px, g.px + 0.5, g.px + 0.5);
        }
      drawGridLines(ctx, P, g, GW, GH);
      drawTriOutline(ctx, P, g, d.tri, P.ink);
      // the inspected pixel and its three sub-triangles
      const cx = g.ox + (bx + 0.5) * g.px, cy = g.oy + (by + 0.5) * g.px;
      ctx.strokeStyle = alpha(P.ink, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (const p of d.tri) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(g.ox + p[0] * g.px, g.oy + p[1] * g.px);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.hl;
      ctx.lineWidth = 3;
      ctx.strokeRect(g.ox + bx * g.px + 1.5, g.oy + by * g.px + 1.5, g.px - 3, g.px - 3);
      drawHandles(ctx, P, g, d.tri, [P.pos, P.neg, P.good], d.sel);
    },
    [P, fb, d.tri, d.sel, bx, by],
    { aspect: GW / GH, maxHeight: 440, minHeight: 180 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const g = gridOf(size.w, size.h, GW, GH);
      let best: number | null = null, bd = 18;
      d.tri.forEach((p, k) => {
        const dd = Math.hypot(g.ox + p[0] * g.px - x, g.oy + p[1] * g.px - y);
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      });
      return best;
    },
    onDrag: (k, x, y) => {
      const g = gridOf(size.w, size.h, GW, GH);
      d.move(k as number, (x - g.ox) / g.px, (y - g.oy) / g.px);
    },
    onEmpty: (x, y) => {
      const g = gridOf(size.w, size.h, GW, GH);
      const gx = Math.floor((x - g.ox) / g.px), gy = Math.floor((y - g.oy) / g.px);
      if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) setPix([gx, gy]);
    },
  });

  return (
    <Figure
      no={3}
      title="무게중심 좌표로 색 섞기"
      hint="픽셀을 누르면 그 자리의 무게를 봅니다"
      caption={
        <>
          세 꼭짓점에 주황, 파랑, 초록을 주고, 삼각형 안의 픽셀마다 세 색을 무게중심 좌표만큼 섞었습니다. 노란 테두리가 살펴보는 픽셀이고, 점선은 그 픽셀 중심에서 세 꼭짓점으로 이은 선입니다. 이 선이 삼각형을 작은 삼각형 셋으로 나누는데, 각 꼭짓점의 무게는 그 맞은편 작은 삼각형의 넓이 비율입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`픽셀 (${bx}, ${by})의 무게중심 좌표는 ${w.map(f2).join(', ')}입니다. ${inside ? '삼각형 안입니다.' : '하나가 음수라 삼각형 밖입니다.'}`} />
        </div>
        <div className="controls">
          <Slider id="rz-bx" label="살펴볼 픽셀 x" value={bx} min={0} max={GW - 1} step={1} onChange={(v) => setPix([v, by])} />
          <Slider id="rz-by" label="살펴볼 픽셀 y" value={by} min={0} max={GH - 1} step={1} onChange={(v) => setPix([bx, v])} />
          <div className="rz-bary">
            {w.map((v, k) => (
              <div key={k} className="rz-bar" style={{ ['--c' as string]: ['var(--pos)', 'var(--neg)', 'var(--good)'][k] }}>
                <span className="mono">b{['₀', '₁', '₂'][k]}</span>
                <span className="rz-track">
                  <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
                </span>
                <span className="mono" style={{ color: v < 0 ? 'var(--bad)' : undefined }}>
                  {f2(v)}
                </span>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="b₀ + b₁ + b₂" value={f2(w[0] + w[1] + w[2])} />
            <Readout
              label="섞은 색"
              value={
                <span className="rz-swatch" style={{ background: inside ? rgbCss(col) : 'transparent' }}>
                  {inside ? '' : '밖'}
                </span>
              }
            />
          </div>
          <VertexControls d={d} idPrefix="rz-bc" />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the depth buffer ─────────────── */

function DepthFigure() {
  const P = usePalette();
  const [first, setFirst] = useState(0);
  const [test, setTest] = useState(false);
  const [view, setView] = useState<'color' | 'depth'>('color');
  const run = useMemo(
    () => depthRun(first === 0 ? [0, 1] : [1, 0], test, [cssToRgb(P.pos), cssToRgb(P.neg)], cssToRgb(P.surface)),
    [first, test, P],
  );
  let a = 0, b = 0;
  for (const o of run.owner) {
    if (o === 0) a++;
    if (o === 1) b++;
  }
  const near = cssToRgb(P.ink), far = cssToRgb(P.surface2);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const g = gridOf(w, h, DW, DH);
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < DH; y++)
        for (let x = 0; x < DW; x++) {
          let c: RGB;
          if (view === 'color') c = run.fb.get(x, y);
          else {
            const z = run.fb.depth[y * DW + x];
            c = z === Infinity ? cssToRgb(P.surface) : mix(near, far, (z + 1) / 2);
          }
          ctx.fillStyle = rgbCss(c);
          ctx.fillRect(g.ox + x * g.px, g.oy + y * g.px, g.px + 0.5, g.px + 0.5);
        }
      if (g.px >= 8) drawGridLines(ctx, P, g, DW, DH);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(g.ox + 0.5, g.oy + 0.5, DW * g.px - 1, DH * g.px - 1);
    },
    [P, run, view],
    { aspect: DW / DH, maxHeight: 420, minHeight: 160 },
  );

  const fN = DEPTH_TRIS[first].name, sN = DEPTH_TRIS[1 - first].name;
  return (
    <Figure
      no={4}
      title="서로 꿰뚫는 두 삼각형"
      hint="그리는 순서와 깊이 검사를 바꿔 보세요"
      caption={
        <>
          주황 삼각형 A는 왼쪽이 가깝고(깊이 −0.8) 오른쪽이 멉니다(+0.8). 파랑 삼각형 B는 모든 점의 깊이가 0입니다. 그래서 A는 B를 비스듬히 꿰뚫습니다. "깊이 버퍼" 보기에서는 픽셀마다 저장된 깊이를 가까울수록 진하게 칠했습니다. 깊이 검사를 꺼도 렌더러는 깊이를 기록하므로, 그때의 깊이 버퍼는 마지막에 그린 면의 깊이입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`${fN}를 먼저, ${sN}를 나중에 그렸고 깊이 검사는 ${test ? '켜져' : '꺼져'} 있습니다. 화면에 A가 ${a}픽셀, B가 ${b}픽셀 보입니다.`} />
        </div>
        <div className="controls">
          <Seg label="먼저 그릴 삼각형" value={first} onChange={setFirst} options={[{ value: 0, label: 'A 먼저' }, { value: 1, label: 'B 먼저' }]} />
          <Check label="깊이 검사" checked={test} onChange={setTest} />
          <Seg label="보기" value={view} onChange={setView} options={[{ value: 'color', label: '색' }, { value: 'depth', label: '깊이 버퍼' }]} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="A가 보이는 픽셀" value={a} color="var(--pos)" />
            <Readout label="B가 보이는 픽셀" value={b} color="var(--neg)" />
            <Readout label="삼각형 안 픽셀" value={run.stats.covered} />
            <Readout label="깊이 검사로 버림" value={run.stats.depthRejected} />
          </div>
          <div className="gx-note">
            {test
              ? `어느 순서로 그려도 A ${a}픽셀, B ${b}픽셀로 같습니다. 두 면이 만나는 선에서 앞뒤가 바뀝니다.`
              : `나중에 그린 ${sN}가 겹치는 곳을 모두 덮었습니다. 앞뒤가 아니라 그린 순서가 화면을 정합니다.`}
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: 'A (기울어짐)', shape: 'sq' },
          { color: 'var(--neg)', label: 'B (깊이 0)', shape: 'sq' },
          { color: 'var(--ink)', label: '깊이 버퍼: 가까움', shape: 'sq' },
          { color: 'var(--surface-2)', label: '멂', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Rasterization() {
  return (
    <>
      <h2>화면은 칸의 격자입니다</h2>
      <p>
        모니터는 가로세로로 늘어선 작은 칸, 곧 <T en="pixel">픽셀</T>의 격자입니다. 1920×1080 화면이라면 칸이 207만 개쯤 있고, 칸 하나는 한 가지 색만 낼 수 있습니다. 반면 게임이나 지도 앱이 다루는 장면은 연속된 공간 속의 도형입니다. 매끈한 도형을 칸의 격자로 옮기는 일을 <T en="rasterization">래스터화</T>라고 합니다.
      </p>
      <p>
        3차원 그래픽스는 거의 모든 표면을 <strong>삼각형</strong>으로 쪼개서 그립니다. 꼭짓점 세 개면 언제나 평평한 면이 하나로 정해지고, 볼록하며, 안과 밖을 가리기 쉽기 때문입니다. 공도 얼굴도 수천에서 수백만 개의 작은 삼각형입니다. 그러니 래스터화의 핵심 질문은 하나입니다. <strong>이 삼각형은 어떤 픽셀을 덮는가?</strong> 이 과목의 렌더러는 이 질문에 답하는 함수를 직접 갖고 있습니다. 그림 1에서 꼭짓점을 끌어 보세요.
      </p>
      <CoverageFigure />
      <p>
        렌더러는 픽셀마다 "중심점이 삼각형 안에 있는가"만 묻습니다. 삼각형이 픽셀을 조금 걸쳐도 중심을 덮지 않으면 칠하지 않습니다. 이렇게 한 점만 보고 판정하는 것을 <T en="sampling">샘플링</T>이라고 하고, 계단처럼 깨진 가장자리는 그 대가입니다. 가장자리를 부드럽게 하는 방법은 <a href={lessonHref('cs-graphics', 'textures')}>텍스처와 샘플링</a> 장에서 다룹니다.
      </p>

      <h2>안과 밖을 가리는 변 함수</h2>
      <p>
        점이 삼각형 안에 있는지는 곱셈 몇 번으로 판정합니다. 변 하나를 a에서 b로 가는 화살표로 보고, 점 p가 그 화살표의 어느 쪽에 있는지 계산합니다.
      </p>
      <MB note="화면 좌표에서 y는 아래로 갑니다. 이 값은 a, b, p를 꼭짓점으로 하는 삼각형 넓이의 두 배에 부호를 붙인 것입니다.">{`E_{ab}(p) = (b_x - a_x)(p_y - a_y) - (b_y - a_y)(p_x - a_x)`}</MB>
      <p>
        이 식은 두 벡터 b − a와 p − a로 만든 2×2 행렬의 <a href={lessonHref('math-linear-algebra', 'determinants')}>행렬식</a>입니다. 값이 0이면 p는 변 위에 있고, 부호가 양이냐 음이냐가 왼쪽과 오른쪽을 가릅니다. 삼각형의 세 변에 대해 이 <T en="edge function">변 함수</T>를 계산해서 세 값의 부호가 모두 같으면 p는 안에 있습니다. 그림 1에서 E₀, E₁, E₂를 차례로 켜 보면, 각 변이 평면을 반으로 가르고 세 반평면이 겹치는 곳이 삼각형임을 볼 수 있습니다.
      </p>
      <p>
        처음 삼각형에서는 경계 상자 안의 픽셀 266개를 검사해서 95개를 칠했습니다. 검사의 64%는 헛수고입니다. 꼭짓점 하나를 멀리 끌어 길쭉하고 비스듬한 삼각형을 만들면 이 비율은 훨씬 나빠집니다. 실제 GPU는 화면을 8×8 같은 타일로 나눠 타일의 네 모서리만 먼저 검사하고, 통째로 밖인 타일은 건너뜁니다. 그래도 변 함수가 좋은 점은 픽셀마다 계산이 서로 독립이라는 것입니다. 수천 개의 픽셀을 동시에 검사할 수 있어서 <a href={lessonHref('cs-parallel-distributed', 'data-parallel')}>데이터 병렬</a> 하드웨어에 딱 맞습니다.
      </p>

      <h2>변 위에 걸친 픽셀은 누구 것인가</h2>
      <p>
        변 함수가 정확히 0인 픽셀, 즉 중심이 변 위에 놓인 픽셀은 어떻게 할까요? 삼각형 하나만 그린다면 별일 아닙니다. 하지만 3차원 모델에서는 이웃한 두 삼각형이 늘 변을 함께 씁니다. 그림 2는 정사각형 하나를 삼각형 두 개로 나눈 가장 흔한 경우입니다.
      </p>
      <SharedEdgeFigure />
      <p>
        "칠함"으로 두면 대각선 위의 픽셀 13개를 두 삼각형이 모두 칠합니다. 불투명한 색이면 눈에 띄지 않지만, 반투명한 유리나 연기처럼 색을 겹쳐 칠하는 경우에는 대각선을 따라 진한 줄이 생깁니다. 오른쪽 변과 아래 변 위의 픽셀까지 가져가서 넓이 144인 정사각형이 169픽셀이 됩니다. "안 칠함"으로 두면 대각선의 11픽셀이 비어 틈이 생기고, 바깥 변까지 빠져서 110픽셀만 칠합니다. 3차원 장면에서 이런 틈은 배경색이 반짝이며 비치는 균열로 보입니다.
      </p>
      <p>
        해법은 변마다 주인을 정하는 것입니다. Direct3D가 명세로 정해 둔 <T en="top-left rule">왼쪽 위 규칙</T>은 픽셀 중심이 변 위에 있을 때, 그 변이 삼각형의 <strong>위쪽 변</strong>(수평이면서 삼각형 위에 있는 변)이나 <strong>왼쪽 변</strong>일 때만 칠합니다. 함께 쓰는 변은 한 삼각형에게는 왼쪽 변이고 다른 삼각형에게는 오른쪽 변이므로, 언제나 정확히 한쪽만 그 픽셀을 가져갑니다. 규칙을 바꿔 보면 144픽셀을 한 번씩만 칠하는 것을 볼 수 있습니다. OpenGL 명세는 함께 쓰는 변의 픽셀을 두 번 칠하거나 빠뜨리지 말라고만 요구하고 구체적인 규칙은 구현에 맡기는데, 실제 드라이버들도 대개 이와 같은 왼쪽 위 규칙을 씁니다.
      </p>

      <h2>꼭짓점 사이를 채우는 무게중심 좌표</h2>
      <p>
        덮는 픽셀을 찾았으면 이제 무슨 색으로 칠할지 정해야 합니다. 3차원 모델은 꼭짓점에만 정보를 담습니다. 색, 표면이 향하는 방향(법선), 그림을 붙일 좌표 같은 것들입니다. 삼각형 안의 픽셀은 세 꼭짓점의 값을 적당히 섞어 얻습니다. 섞는 비율이 <T en="barycentric coordinates">무게중심 좌표</T>입니다.
      </p>
      <MB note="E는 그림 1의 변 함수, A는 삼각형 전체의 변 함수 값(넓이의 두 배)입니다.">{`b_0 = \\frac{E_0(p)}{A},\\quad b_1 = \\frac{E_1(p)}{A},\\quad b_2 = \\frac{E_2(p)}{A},\\qquad \\text{값}(p) = b_0\\,c_0 + b_1\\,c_1 + b_2\\,c_2`}</MB>
      <BaryFigure />
      <p>
        처음 살펴보는 픽셀 (9, 6)의 무게는 0.44, 0.28, 0.28입니다. 세 무게는 언제나 합이 1이고, 삼각형 안에서는 모두 0 이상입니다. 픽셀을 꼭짓점 쪽으로 옮기면 그 꼭짓점의 무게가 1에 가까워지고, 삼각형 밖으로 나가면 무게 하나가 음수가 됩니다. 덮기 판정에 쓴 변 함수를 넓이로 나누기만 하면 되니, 색을 섞는 데 드는 계산은 거의 공짜입니다.
      </p>
      <Callout kind="note">
        여기서는 화면 위의 2차원 삼각형에서 무게를 그대로 썼습니다. 원근이 있는 3차원 장면에서는 멀리 있는 쪽이 화면에서 작아지므로, 화면 위의 무게로 섞으면 무늬가 휘어 보입니다. 이 렌더러가 꼭짓점마다 1/w라는 값을 함께 넘기는 이유가 그것이고, <a href={lessonHref('cs-graphics', 'transforms')}>변환과 카메라</a> 장에서 직접 켜고 꺼 봅니다.
      </Callout>

      <h2>앞에 있는 면만 남기기: 깊이 버퍼</h2>
      <p>
        삼각형이 여러 개면 같은 픽셀을 여러 삼각형이 덮습니다. 이때 화면에는 가장 가까운 면이 보여야 합니다. 가장 쉬운 생각은 화가처럼 먼 것부터 차례로 칠하는 것입니다. 이것을 <T en="painter's algorithm">화가 알고리즘</T>이라고 합니다. 하지만 두 면이 서로를 꿰뚫으면 어느 쪽이 "더 먼" 삼각형인지 정할 수 없습니다. 그림 4의 두 삼각형이 그렇습니다.
      </p>
      <DepthFigure />
      <p>
        깊이 검사를 끄면 화면은 그리는 순서로 정해집니다. A를 먼저 그리면 B가 412픽셀, A가 224픽셀 보이고, B를 먼저 그리면 A가 453픽셀, B가 183픽셀 보입니다. 둘 다 틀렸습니다. A의 왼쪽은 B보다 앞에 있고 오른쪽은 뒤에 있으니, 두 면이 만나는 선에서 앞뒤가 바뀌어야 합니다.
      </p>
      <p>
        <T en="depth buffer, z-buffer">깊이 버퍼</T>는 픽셀마다 지금까지 그린 것 중 가장 가까운 깊이를 하나씩 기억합니다. 새 픽셀을 칠하기 전에 그 깊이를 버퍼의 값과 비교해서, 더 가까울 때만 칠하고 버퍼를 고칩니다. 깊이 검사를 켜면 어느 순서로 그려도 A 353픽셀, B 283픽셀로 같은 그림이 나오고, 두 면이 만나는 선이 정확히 나타납니다. 깊이도 무게중심 좌표로 꼭짓점 깊이를 섞어 픽셀마다 얻습니다.
      </p>
      <p>
        순서가 결과를 바꾸지는 않지만 일의 양은 바꿉니다. 두 삼각형 안의 픽셀 865개 중 A를 먼저 그리면 129개를, B를 먼저 그리면 100개를 깊이 검사에서 버립니다. 실제 장면에서는 픽셀 하나의 색을 계산하는 일이 비싸므로, 엔진은 가까운 물체부터 그려서 뒤에 가려질 픽셀의 계산을 아예 건너뜁니다.
      </p>
      <Callout kind="warn">
        깊이 버퍼는 픽셀마다 수 하나를 정해진 정밀도로 저장합니다. 두 면의 깊이가 거의 같으면 반올림 오차 때문에 픽셀마다 이긴 쪽이 바뀌어, 두 무늬가 얼룩덜룩 섞여 깜박입니다. 이것을 <T en="z-fighting">z-파이팅</T>이라고 합니다. 바닥에 붙인 그림자나 벽에 붙인 포스터가 깜박인다면 대개 이것이 원인입니다.
      </Callout>

      <Callout kind="key">
        래스터화는 삼각형이 덮는 픽셀을 찾는 일입니다. 픽셀 중심마다 세 변 함수의 부호를 보고, 모두 안쪽이면 칠합니다. 변 함수는 넓이의 두 배이기도 해서, 넓이로 나누면 꼭짓점의 값을 섞는 무게중심 좌표가 됩니다. 함께 쓰는 변 위의 픽셀은 왼쪽 위 규칙으로 정확히 한 삼각형에 줍니다. 여러 삼각형이 겹치면 깊이 버퍼가 픽셀마다 가장 가까운 깊이를 기억해서, 그리는 순서와 상관없이 앞에 있는 면만 남깁니다.
      </Callout>
      <Quiz
        q="삼각형 v₀v₁v₂ 안의 한 픽셀에서 무게중심 좌표가 (0.6, 0.3, 0.1)이다. 꼭짓점의 깊이가 각각 0.2, 0.5, −0.4라면 이 픽셀의 깊이는?"
        options={['0.23', '0.10', '0.30', '0.43']}
        answer={0}
        explain={<>깊이도 다른 값처럼 무게를 곱해 더합니다. 0.6 × 0.2 + 0.3 × 0.5 + 0.1 × (−0.4) = 0.12 + 0.15 − 0.04 = 0.23입니다. 깊이 버퍼는 이 값을 지금 저장된 값과 비교해서, 더 작을(가까울) 때만 픽셀을 칠합니다.</>}
      />
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { chain, cssToRgb, Framebuffer, mix, present, rotateX, rotateY, type RGB } from './gfx';
import { panelLayout } from './light';
import { aliasFrequency, atlasCube, ATLAS_CELL, bricks, buildMips, checker, diceAtlas, FACE_NAME, FACE_PIPS, FLOOR_CAMERA, floorLod, floorUV, mipOverhead, renderCube, renderFloor, sampleBilinear, sampleNearest, type FloorMode, type Texture } from './texture';
import './graphics.css';
import './textures.css';

/** Copy a texture into a framebuffer (row 0 of the texture is its bottom). */
function texFb(t: Texture): Framebuffer {
  const fb = new Framebuffer(t.w, t.h);
  for (let j = 0; j < t.h; j++)
    for (let i = 0; i < t.w; i++) {
      const k = (j * t.w + i) * 3;
      fb.set(i, t.h - 1 - j, [t.data[k], t.data[k + 1], t.data[k + 2]]);
    }
  return fb;
}

/** Canvas whose height follows its width through a panel layout. */
function usePanels(n: number, draw: (ctx: CanvasRenderingContext2D, lay: ReturnType<typeof panelLayout>) => void, deps: unknown[], opts?: Parameters<typeof panelLayout>[2]) {
  const [W, setW] = useState(640);
  const lay = panelLayout(W, n, opts);
  const c = useCanvas2D((ctx, { w }) => draw(ctx, panelLayout(w, n, opts)), [...deps, W], { height: lay.h, minHeight: 60, maxHeight: 2000 });
  useEffect(() => {
    if (c.size.w !== W) setW(c.size.w);
  }, [c.size.w, W]);
  return c;
}

function caption(ctx: CanvasRenderingContext2D, P: Palette, s: string, x: number, y: number, w: number) {
  ctx.fillStyle = P.ink;
  ctx.font = `600 12px ${P.fontBody}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(s, x + w / 2, y + 5);
}

const PIP: RGB = [0.12, 0.12, 0.12];

/* ─────────────── Figure 1: uv coordinates on a die ─────────────── */

function UVFigure() {
  const P = usePalette();
  const [yaw, setYaw] = useState(35);
  const [pitch, setPitch] = useState(25);
  const [dist, setDist] = useState(2.6);
  const [face, setFace] = useState(0);
  const [persp, setPersp] = useState(true);
  const mesh = useMemo(() => atlasCube(), []);
  const atlas = useMemo(() => {
    const tints = [P.pos, P.neg, P.good, P.stats2, P.stats1, P.hl].map((c) => mix(cssToRgb(c), [1, 1, 1], 0.55));
    return diceAtlas(32, tints, PIP, cssToRgb(P.surface2));
  }, [P]);
  const atlasFb = useMemo(() => texFb(atlas), [atlas]);
  const cubeFb = useMemo(() => {
    const fb = new Framebuffer(128, 128);
    const model = chain(rotateX((pitch * Math.PI) / 180), rotateY((-yaw * Math.PI) / 180));
    renderCube(fb, atlas, mesh, model, [0, 0, dist], 'nearest', !persp, face, cssToRgb(P.hl), cssToRgb(P.surface));
    return fb;
  }, [atlas, mesh, yaw, pitch, dist, persp, face, P]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const stack = w < 560;
      const cs = stack ? Math.min(w, 300) : Math.min(h - 26, w * 0.4);
      const cx = stack ? (w - cs) / 2 : 0;
      present(ctx, cubeFb, cx, 0, cs / 128);
      ctx.strokeStyle = P.line;
      ctx.strokeRect(cx + 0.5, 0.5, cs - 1, cs - 1);
      caption(ctx, P, '화면', cx, cs, cs);

      // the atlas in uv space, v up
      const ax = stack ? 26 : cs + 50;
      const ay = stack ? cs + 34 : 10;
      const aw = (stack ? w - 36 : w - ax - 10);
      const scale = Math.min(aw / 128, (stack ? h - ay - 30 : h - 40) / 96);
      const AW = 128 * scale, AH = 96 * scale;
      present(ctx, atlasFb, ax, ay, scale);
      const cell = 32 * scale;
      ATLAS_CELL.forEach(([c, r], f) => {
        ctx.strokeStyle = f === face ? P.ink : P.lineStrong;
        ctx.lineWidth = f === face ? 2.5 : 1;
        ctx.strokeRect(ax + c * cell + 0.5, ay + r * cell + 0.5, cell - 1, cell - 1);
      });
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1;
      ctx.strokeRect(ax + 0.5, ay + 0.5, AW - 1, AH - 1);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const [v, s] of [[0, '0'], [0.5, '0.5'], [1, '1']] as [number, string][]) ctx.fillText(s, ax + v * AW, ay + AH + 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const [v, s] of [[0, '0'], [1, '1']] as [number, string][]) ctx.fillText(s, ax - 5, ay + AH - v * AH);
      ctx.fillStyle = P.ink2;
      ctx.font = `italic 600 12px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('u →', ax + AW * 0.75, ay + AH + 4);
      ctx.save();
      ctx.translate(ax - 16, ay + AH * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('v →', 0, -6);
      ctx.restore();
    },
    [P, cubeFb, atlasFb, face],
    { height: 300, minHeight: 60 },
  );

  const [c, r] = ATLAS_CELL[face];
  return (
    <Figure
      no={1}
      title="주사위 하나와 그 전개도"
      hint="주사위를 돌리고, 면을 골라 전개도에서 찾아보세요"
      caption={<>오른쪽은 텍스처 한 장(128×96 텍셀)이고, 가로가 u, 세로가 v입니다. 정육면체의 꼭짓점 24개는 각자 이 그림 위의 한 점 (u, v)를 기억하고, 삼각형 안쪽의 픽셀은 꼭짓점의 uv를 보간해서 그 자리의 텍셀 색을 가져옵니다. 고른 면은 화면에서는 노랗게, 전개도에서는 굵은 테두리로 표시됩니다. 회색 칸은 어느 면도 쓰지 않는 자리입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`정육면체 주사위를 가로 ${yaw}도, 세로 ${pitch}도 돌린 화면과 6개 면이 십자 모양으로 펼쳐진 텍스처. 고른 면은 ${FACE_NAME[face]}, 눈 ${FACE_PIPS[face]}개이며 텍스처에서 가로 ${c + 1}번째, 위에서 ${r + 1}번째 칸입니다.${persp ? '' : ' 원근 보정을 꺼서 면 위의 직선이 휘어 보입니다.'}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-split" style={{ marginTop: 14 }}>
        <div className="controls">
          <Slider id="tx-yaw" label="좌우로 돌리기" value={yaw} min={-180} max={180} step={1} onChange={setYaw} format={(v) => `${v}°`} />
          <Slider id="tx-pitch" label="위아래로 돌리기" value={pitch} min={-80} max={80} step={1} onChange={setPitch} format={(v) => `${v}°`} />
          <Slider id="tx-dist" label="카메라 거리" value={dist} min={1.4} max={5} step={0.1} onChange={setDist} format={(v) => v.toFixed(1)} />
        </div>
        <div className="controls">
          <Seg label="표시할 면" value={face} onChange={setFace} options={FACE_PIPS.map((p, f) => ({ value: f, label: String(p) }))} />
          <Check label="원근 보정 (uv/w 보간)" checked={persp} onChange={setPersp} />
          <Readout label="고른 면의 uv 범위" value={`u ${(c / 4).toFixed(2)}–${((c + 1) / 4).toFixed(2)}, v ${((2 - r) / 3).toFixed(2)}–${((3 - r) / 3).toFixed(2)}`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: magnification ─────────────── */

const MAG_FB = 96;

function MagnifyFigure() {
  const P = usePalette();
  const [zoom, setZoom] = useState(8);
  const tex = useMemo(() => {
    const brick = mix(cssToRgb(P.neg), [0.5, 0.25, 0.2], 0.4);
    return bricks(16, brick, [0.88, 0.86, 0.8], mix(brick, [0, 0, 0], 0.3));
  }, [P]);
  const fbs = useMemo(
    () =>
      (['nearest', 'bilinear'] as const).map((mode) => {
        const fb = new Framebuffer(MAG_FB, MAG_FB);
        for (let y = 0; y < MAG_FB; y++)
          for (let x = 0; x < MAG_FB; x++) {
            const u = ((x + 0.5) / zoom + 3) / 16, v = (-(y + 0.5) / zoom + 13) / 16;
            fb.set(x, y, mode === 'nearest' ? sampleNearest(tex, u, v) : sampleBilinear(tex, u, v));
          }
        return fb;
      }),
    [tex, zoom],
  );

  const { wrapRef, canvasRef } = usePanels(
    2,
    (ctx, lay) => {
      ['가장 가까운 텍셀', '이중선형 보간'].forEach((name, i) => {
        const { x, y } = lay.pos(i);
        present(ctx, fbs[i], x, y, lay.size / MAG_FB);
        ctx.strokeStyle = P.line;
        ctx.strokeRect(x + 0.5, y + 0.5, lay.size - 1, lay.size - 1);
        caption(ctx, P, name, x, y + lay.size, lay.size);
      });
    },
    [P, fbs],
    { maxSize: 300, minSize: 150 },
  );

  return (
    <Figure
      no={2}
      title="작은 텍스처를 크게 붙이면"
      hint="확대 배율을 바꿔 보세요"
      caption={<>16×16 텍셀짜리 벽돌 텍스처의 한 부분을 {MAG_FB}×{MAG_FB} 픽셀 화면에 확대했습니다. 왼쪽은 픽셀 중심에서 가장 가까운 텍셀 하나의 색을 그대로 쓰고, 오른쪽은 둘러싼 네 텍셀의 색을 거리에 따라 섞습니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`벽돌 텍스처를 텍셀 하나가 화면 픽셀 ${zoom}개 폭이 되도록 확대했습니다. 왼쪽은 계단처럼 각진 블록, 오른쪽은 경계가 부드럽게 번진 모습입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Slider id="tx-zoom" label="확대 (텍셀 하나 = 화면 픽셀 몇 개)" value={zoom} min={1} max={16} step={1} onChange={setZoom} format={(v) => `${v}×${v}`} />
        <Readout label="화면에 보이는 텍셀" value={`${(MAG_FB / zoom).toFixed(1)} × ${(MAG_FB / zoom).toFixed(1)}`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: sampling a sine ─────────────── */

function NyquistFigure() {
  const P = usePalette();
  const [f, setF] = useState(8);
  const [n, setN] = useState(10);
  const fa = aliasFrequency(f, n);
  const k = Math.round(f / n);
  const shown = f - k * n; // signed: a negative value is the same sine flipped

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 12, r: 12, t: 16, b: 26 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const X = (x: number) => pad.l + x * pw;
      const Y = (v: number) => pad.t + ((1 - v) / 2) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0) + 0.5);
      ctx.lineTo(X(1), Y(0) + 0.5);
      ctx.stroke();
      // the real signal
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 800; i++) {
        const x = i / 800;
        const y = Y(Math.sin(2 * Math.PI * f * x));
        if (i) ctx.lineTo(X(x), y);
        else ctx.moveTo(X(x), y);
      }
      ctx.stroke();
      // what the samples describe
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const x = i / 400;
        const y = Y(Math.sin(2 * Math.PI * shown * x));
        if (i) ctx.lineTo(X(x), y);
        else ctx.moveTo(X(x), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < n; i++) {
        const x = i / n;
        ctx.beginPath();
        ctx.arc(X(x), Y(Math.sin(2 * Math.PI * f * x)), 5, 0, Math.PI * 2);
        ctx.fillStyle = P.hl;
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('← 화면 한 줄의 픽셀 위치 →', X(0), Y(-1) + 8);
    },
    [P, f, n, shown],
    { height: 220, minHeight: 60 },
  );

  return (
    <Figure
      no={3}
      title="표본이 너무 성기면 다른 무늬가 보입니다"
      hint="무늬의 촘촘함과 표본 수를 바꿔 보세요"
      caption={<>회색 곡선은 화면의 한 줄을 지나는 실제 무늬(주기 {f}번)이고, 노란 점은 픽셀마다 한 번씩 읽은 표본({n}개)입니다. 파란 점선은 그 표본만 보고 떠올릴 수 있는 가장 느린 무늬입니다. 표본 수가 무늬 주기의 두 배보다 적으면 둘이 달라집니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`주기 ${f}번인 사인 곡선을 ${n}개 점에서 읽었습니다. 표본이 보여 주는 무늬는 주기 ${fa}번입니다.${fa !== f ? ' 원래보다 느린 가짜 무늬, 즉 앨리어싱입니다.' : ''}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-split" style={{ marginTop: 12 }}>
        <div className="controls">
          <Slider id="tx-f" label="무늬의 주기 수 (실제)" value={f} min={1} max={20} step={1} onChange={setF} />
          <Slider id="tx-n" label="표본 수 (픽셀 수)" value={n} min={4} max={40} step={1} onChange={setN} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="나이퀴스트 한계 N/2" value={String(n / 2)} />
          <Readout label="보이는 주기 수" value={String(fa)} color={fa !== f ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink-3)', label: '실제 무늬', shape: 'ln' },
          { color: 'var(--hl)', label: '표본', shape: 'dot' },
          { color: 'var(--accent)', label: '표본이 말하는 무늬', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: the floor to the horizon ─────────────── */

const FLOOR_W = 160;
const FLOOR_H = 100;
const MODE_LABEL: Record<FloorMode, string> = { nearest: '가장 가까운 텍셀', super: '슈퍼샘플링 4×4', mip: '밉맵 (삼선형)', lod: '밉맵 단계 보기' };
const LEVEL_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--bad)', 'var(--c-stats-1)', 'var(--hl)'];

function FloorFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<FloorMode>('nearest');
  const tex = useMemo(() => checker(64, 8, [0.1, 0.1, 0.1], [0.95, 0.95, 0.95]), []);
  const mips = useMemo(() => buildMips(tex), [tex]);
  const levelRgb = useMemo(() => [P.neg, P.pos, P.good, P.stats2, P.bad, P.stats1, P.hl].map(cssToRgb), [P]);
  const mipFbs = useMemo(() => mips.map(texFb), [mips]);
  const result = useMemo(() => {
    const fb = new Framebuffer(FLOOR_W, FLOOR_H);
    const st = renderFloor(fb, mips, mode, cssToRgb(P.surface2), levelRgb);
    // brightness spread where one pixel covers 8 or more texels (far away)
    const far: number[] = [];
    for (let y = 0; y < FLOOR_H; y++)
      for (let x = 0; x < FLOOR_W; x++) {
        if (floorUV(FLOOR_CAMERA, FLOOR_W, FLOOR_H, x + 0.5, y + 0.5) && floorLod(FLOOR_CAMERA, FLOOR_W, FLOOR_H, x, y, tex.w) > 3) far.push(fb.get(x, y)[0]);
      }
    const m = far.reduce((a, b) => a + b, 0) / far.length;
    const sd = Math.sqrt(far.reduce((a, b) => a + (b - m) ** 2, 0) / far.length);
    return { fb, st, sd };
  }, [mips, mode, P, levelRgb, tex]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const s = w / FLOOR_W;
      present(ctx, result.fb, 0, 0, s);
      // the pyramid, side by side, each level drawn at its true size relative to the first
      const top = FLOOR_H * s + 18;
      const unit = Math.min(1.6, (w - 6 * 8) / 127);
      let x = 0;
      mipFbs.forEach((fb, i) => {
        const side = Math.max(4, fb.w * unit);
        present(ctx, fb, x, top, side / fb.w);
        ctx.strokeStyle = mode === 'lod' ? levelRgbCss(P, i) : P.lineStrong;
        ctx.lineWidth = mode === 'lod' ? 3 : 1;
        ctx.strokeRect(x + 0.5, top + 0.5, side - 1, side - 1);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${fb.w}`, x, top + side + 4);
        x += side + 8;
      });
    },
    [P, result, mipFbs, mode],
    { aspect: 1.1, maxHeight: 900, minHeight: 60 },
  );

  return (
    <Figure
      no={4}
      title="지평선까지 이어진 바둑판"
      hint="네 가지 방법을 바꿔 보세요"
      caption={<>64×64 텍셀, 8×8칸 바둑판 텍스처를 깐 바닥을 {FLOOR_W}×{FLOOR_H} 픽셀로 그렸습니다. 아래 줄은 같은 텍스처의 밉맵 피라미드(64, 32, …, 1)입니다. "먼 곳의 얼룩"은 한 픽셀이 텍셀 8개 이상을 덮는 먼 곳에서 밝기가 픽셀마다 얼마나 들쭉날쭉한지(표준편차)이고, 회색 하나로 고르게 보일수록 작습니다.</>}
    >
      <div className="controls row" style={{ marginBottom: 12 }}>
        <Seg value={mode} onChange={setMode} options={(Object.keys(MODE_LABEL) as FloorMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`지평선까지 이어진 바둑판 바닥을 ${MODE_LABEL[mode]} 방식으로 그렸습니다. 픽셀당 텍셀 읽기 ${result.st.reads}번, 먼 곳의 밝기 표준편차 ${result.sd.toFixed(2)}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
        <Readout label="픽셀당 텍셀 읽기" value={mode === 'lod' ? '–' : `${result.st.reads}번`} />
        <Readout label="먼 곳의 얼룩" value={mode === 'lod' ? '–' : result.sd.toFixed(2)} color={mode === 'lod' ? undefined : result.sd > 0.2 ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="밉맵 메모리" value={`×${mipOverhead(mips).toFixed(2)}`} />
      </div>
      {mode === 'lod' && <Legend items={LEVEL_CSS.map((c, i) => ({ color: c, label: `${i}단계 (${64 >> i}×${64 >> i})`, shape: 'sq' as const }))} />}
    </Figure>
  );
}

function levelRgbCss(P: Palette, i: number) {
  return [P.neg, P.pos, P.good, P.stats2, P.bad, P.stats1, P.hl][Math.min(6, i)];
}

/* ─────────────── Lesson ─────────────── */

export default function Textures() {
  return (
    <>
      <h2>삼각형에 그림을 입히기</h2>
      <p>
        <a href={lessonHref('cs-graphics', 'shading')}>앞 장</a>의 공은 한 가지 색이었습니다. 벽돌 벽, 나뭇결, 사람 얼굴의 주근깨까지 모두 삼각형으로 만들려면 삼각형이 수억 개 필요합니다. 그래서 모양은 적은 삼각형으로 대충 만들고, 그 위에 사진이나 그림을 입혀 세부를 채웁니다. 이 그림을 <T en="texture">텍스처</T>, 그 안의 한 칸을 <T en="texel">텍셀</T>이라고 부릅니다. 화면의 칸인 픽셀과 구별하기 위한 이름입니다.
      </p>
      <p>
        텍스처를 입히려면 꼭짓점마다 "나는 그림의 어디에 해당하는가"를 적어 두어야 합니다. 그림의 왼쪽 아래를 (0, 0), 오른쪽 위를 (1, 1)로 두는 좌표를 <T en="texture coordinates">텍스처 좌표</T> 또는 <strong>uv</strong>라고 합니다. 텍스처 크기가 64든 4096이든 같은 0에서 1 사이의 수로 가리킨다는 점이 편리합니다.
      </p>

      <h2>uv 좌표: 전개도 위의 주소</h2>
      <p>
        그림 1의 주사위는 앞 장들과 같은 정육면체이고, 꼭짓점 24개에 uv만 붙였습니다. 텍스처 한 장에 여섯 면을 십자 모양 전개도로 모아 두고, 각 꼭짓점이 전개도의 어느 모서리에 해당하는지 적어 둔 것입니다. 이렇게 여러 면의 그림을 한 장에 모은 텍스처를 <T en="texture atlas">아틀라스</T>라고 합니다. 3D 모델을 만드는 사람이 하는 일 중 꽤 큰 몫이 이 전개도를 잘 펼치는 일입니다.
      </p>
      <UVFigure />
      <p>
        삼각형 안의 픽셀은 래스터화 때 구한 무게중심 좌표로 세 꼭짓점의 uv를 섞어 자기 uv를 얻고, 그 자리의 텍셀을 읽습니다. 여기서 한 가지 함정이 있습니다. 화면에서 픽셀 간격이 같아도, 비스듬히 놓인 면 위에서는 가까운 쪽 한 픽셀이 텍스처의 좁은 구간을, 먼 쪽 한 픽셀이 넓은 구간을 덮습니다. 화면에서 uv를 그냥 직선으로 섞으면 이 차이를 무시하게 됩니다. <strong>원근 보정</strong>을 끄고 카메라를 가까이 가져가 보세요. 면을 가로지르는 대각선에서 무늬가 꺾이고 눈의 위치가 비뚤어집니다. 1990년대 플레이스테이션 게임의 바닥이 꿀렁거리던 것이 바로 이 현상입니다. 바로잡는 방법은 <M>{'u/w'}</M>, <M>{'v/w'}</M>, <M>{'1/w'}</M>를 화면에서 선형으로 섞은 뒤 나누는 것이고, 이유는 <a href={lessonHref('cs-graphics', 'transforms')}>변환과 카메라</a>에서 본 원근 나눗셈에 있습니다.
      </p>

      <h2>그림을 그리지 않고 계산하기</h2>
      <p>
        이 장의 텍스처는 사진 파일을 하나도 쓰지 않습니다. 주사위 눈, 벽돌, 바둑판 모두 <code>(i, j) → 색</code>인 작은 함수로 만들었습니다. 이런 <T en="procedural texture">절차적 텍스처</T>는 용량이 거의 들지 않고, 원하는 해상도로 얼마든지 만들 수 있어서 나무, 대리석, 구름 같은 자연 무늬에 많이 씁니다.
      </p>
      <MB note="i, j는 텍셀 번호, n은 텍스처 크기, k는 한 줄의 칸 수입니다.">{'\\text{바둑판}(i, j) = \\begin{cases} \\text{검정} & \\lfloor ik/n \\rfloor + \\lfloor jk/n \\rfloor \\text{ 이 홀수} \\\\ \\text{흰색} & \\text{짝수} \\end{cases}'}</MB>

      <h2>확대: 텍셀보다 픽셀이 많을 때</h2>
      <p>
        uv를 텍셀 번호로 바꾸면 보통 정수가 아닌 값이 나옵니다. 가장 간단한 방법은 가장 가까운 텍셀 하나를 고르는 것이고, 조금 더 공을 들이면 둘러싼 네 텍셀을 거리에 따라 섞습니다. 가로로 한 번, 세로로 한 번 선형 보간을 하므로 <T en="bilinear interpolation">이중선형 보간</T>이라고 합니다. 그림 2에서 텍스처를 크게 확대해 보세요.
      </p>
      <MagnifyFigure />
      <p>
        배율이 8이면 텍셀 하나가 화면 픽셀 8×8개를 차지합니다. 가장 가까운 텍셀을 쓰면 벽돌이 계단 모양 블록으로 보이고, 이중선형 보간을 쓰면 블록은 사라지는 대신 경계가 흐릿해집니다. 어느 쪽도 원래 없던 정보를 만들어 내지는 못합니다. 16×16 텍셀에 담긴 것이 전부이기 때문입니다. 마인크래프트처럼 블록 느낌을 일부러 살리는 게임은 가장 가까운 텍셀을, 대부분의 3D 게임은 이중선형 보간을 씁니다.
      </p>

      <h2>축소: 픽셀보다 텍셀이 많을 때</h2>
      <p>
        더 까다로운 쪽은 반대 경우입니다. 멀리 있는 바닥에서는 화면 픽셀 하나가 텍셀 수십 개를 덮습니다. 그런데 픽셀 중심에서 텍셀 하나만 읽으면, 그 픽셀이 덮는 수십 개 중 무엇이 뽑힐지는 사실상 운입니다. 이웃 픽셀은 우연히 검은 칸을, 그 옆 픽셀은 흰 칸을 뽑아서 원래 없던 무늬가 생깁니다. 이 현상을 <T en="aliasing">앨리어싱</T>이라고 합니다. 원리를 한 줄짜리 무늬로 먼저 보겠습니다.
      </p>
      <NyquistFigure />
      <p>
        기본 설정에서 실제 무늬는 화면 한 줄에 8번 오르내리는데, 표본(픽셀) 10개만으로 읽으면 표본들은 2번 오르내리는 느린 무늬를 그립니다. 노란 점은 회색 곡선과 파란 점선 위에 똑같이 놓여 있어서, 표본만 가지고는 둘을 구별할 방법이 없습니다. 무늬를 4로 낮추면 표본 10개로 충분하고, 12로 올리면 다시 2로 보입니다. 일반적으로 무늬를 제대로 담으려면 한 주기마다 표본이 두 개보다 많아야 합니다. 표본 수의 절반을 <T en="Nyquist limit">나이퀴스트 한계</T>라고 하고, 그보다 촘촘한 무늬는 다른 느린 무늬로 둔갑합니다. 영화에서 달리는 마차의 바퀴가 거꾸로 도는 것처럼 보이는 것도 같은 현상입니다. 이번에는 시간 축의 표본(초당 24장)이 모자란 경우입니다.
      </p>
      <FloorFigure />
      <p>
        <strong>가장 가까운 텍셀</strong>로 그리면 가까운 바닥은 깔끔하지만, 지평선 쪽은 바둑판 대신 지글거리는 줄무늬(<T en="moiré">모아레</T>)와 소금 후추 같은 점으로 가득합니다. 먼 곳의 얼룩이 0.42로, 검은 칸과 흰 칸을 거의 반반 무작위로 뽑고 있다는 뜻입니다. 카메라가 조금만 움직여도 이 점들이 반짝이며 흔들립니다.
      </p>
      <p>
        무식하지만 확실한 해결책은 표본을 늘리는 것입니다. <strong>슈퍼샘플링 4×4</strong>는 픽셀 하나 안의 16곳에서 읽어 평균을 냅니다. 얼룩이 0.17로 줄지만 텍셀 읽기도 16배가 됩니다. 그래도 아주 먼 곳은 한 픽셀이 텍셀 수백 개를 덮으므로 16개로는 여전히 모자랍니다.
      </p>
      <p>
        <T en="mipmap">밉맵</T>은 계산을 미리 해 두는 방법입니다(1983년, 랜스 윌리엄스). 텍스처를 가로세로 절반으로 줄인 사본을 1×1이 될 때까지 만들어 두고(아래 줄의 64, 32, 16, …, 1), 픽셀마다 "한 픽셀이 텍셀 몇 개를 덮는가"를 재서 거기에 맞는 크기의 사본을 고릅니다. 한 픽셀이 텍셀 8개를 덮으면 8분의 1 크기 사본(8×8)에서는 한 텍셀이 되므로, 그 사본에서 읽으면 평균이 이미 계산되어 있습니다. <strong>밉맵 단계 보기</strong>를 고르면 픽셀마다 고른 단계가 색으로 칠해집니다. 가까운 곳은 원본(0단계), 지평선으로 갈수록 작은 사본입니다. 두 단계 사이에서 이중선형으로 읽어 다시 섞는 <T en="trilinear filtering">삼선형 필터링</T>을 쓰면 단계가 바뀌는 경계도 보이지 않습니다. 텍셀 8번(이중선형 4번 × 두 단계)을 읽고 얼룩은 0.05까지 줄어, 슈퍼샘플링보다 적게 읽고도 고르게 회색이 됩니다. 사본들을 다 합쳐도 원본의 1/4 + 1/16 + … ≈ 1/3이므로 메모리는 4/3배면 됩니다.
      </p>
      <Callout kind="note">
        밉맵에도 약점이 있습니다. 한 픽셀이 덮는 영역은 정사각형이 아니라 바닥처럼 비스듬한 면에서는 길쭉한데, 밉맵은 긴 쪽에 맞춰 사본을 고르기 때문에 먼 바닥이 실제보다 흐릿해집니다. 그림 4의 먼 곳이 아예 매끈한 회색인 것도 그 때문입니다. 실제 GPU는 길쭉한 방향으로 표본을 여러 개 더 읽는 <T en="anisotropic filtering">비등방성 필터링</T>으로 이것을 보완하고, 게임 설정의 "비등방성 16×"가 그 옵션입니다.
      </Callout>

      <Callout kind="key">
        텍스처는 꼭짓점마다 붙인 uv 좌표로 삼각형 위에 입히며, 비스듬한 면에서 무늬가 휘지 않으려면 uv를 원근 보정해서 보간해야 합니다. 텍스처를 확대할 때는 가장 가까운 텍셀이나 이중선형 보간으로 텍셀 사이를 메웁니다. 축소할 때는 한 픽셀이 여러 텍셀을 덮으므로 하나만 읽으면 앨리어싱이 생기는데, 무늬가 나이퀴스트 한계(표본 수의 절반)보다 촘촘하면 다른 무늬로 보이기 때문입니다. 슈퍼샘플링은 표본을 늘려서, 밉맵은 미리 줄여 둔 사본을 4/3배의 메모리로 준비해서 이것을 막습니다.
      </Callout>
      <Quiz
        q="1024×1024 텍스처를 쓰는 게임에서, 멀리 있는 철망 울타리가 카메라를 움직일 때마다 반짝이고 줄무늬가 생긴다. 가장 알맞은 처방은?"
        options={['텍스처를 4096×4096으로 키운다', '밉맵을 만들어 거리에 맞는 단계에서 읽는다', '가장 가까운 텍셀 대신 이중선형 보간만 켠다', '원근 보정을 끈다']}
        answer={1}
        explain={<>먼 울타리는 한 픽셀이 텍셀 여럿을 덮는 축소 상황이고, 그 텍셀들의 평균을 써야 할 자리에서 하나만 뽑아서 생기는 앨리어싱입니다. 밉맵은 미리 평균 낸 작은 사본에서 읽게 하므로 정확히 이 문제를 고칩니다. 텍스처를 키우면 한 픽셀이 덮는 텍셀이 더 많아져 오히려 나빠지고, 이중선형 보간은 이웃 네 텍셀만 섞으므로 수십 개를 덮는 경우에는 부족합니다.</>}
      />
    </>
  );
}

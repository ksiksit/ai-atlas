import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { cssToRgb, mix, present, type Mat4 } from './gfx';
import { FH, FW, F_SHAPE, TH, TW, ap3, floorVerts, journey, matrices, mul3, postHeight, renderCube, renderFloor, rot2, trans2, type CamState, type Mat3 } from './xform';
import './graphics.css';
import './transforms.css';

const n2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
};
const texM3 = (m: Mat3) => `\\begin{bmatrix}${[0, 1, 2].map((r) => [0, 1, 2].map((c) => n2(m[r * 3 + c])).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;

/* ─────────────── Figure 1: order matters (2-D, homogeneous 3×3) ─────────────── */

function OrderFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(45);
  const [tx, setTx] = useState(3);
  const [ty, setTy] = useState(1);
  const R = rot2(deg), Tm = trans2(tx, ty);
  const TR = mul3(Tm, R), RT = mul3(R, Tm);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      const panels: { m: Mat3; mid: Mat3; color: string; title: string }[] = [
        { m: TR, mid: R, color: P.pos, title: '먼저 회전, 그다음 이동 (T·R)' },
        { m: RT, mid: Tm, color: P.neg, title: '먼저 이동, 그다음 회전 (R·T)' },
      ];
      const stack = w < 560;
      const pw = stack ? w : w / 2, ph = stack ? h / 2 : h;
      const xr: [number, number] = [-4, 6.5], yr: [number, number] = [-2.5, 6];
      panels.forEach((pn, k) => {
        const ox = stack ? 0 : k * pw, oy = stack ? k * ph : 0;
        const s = Math.min((pw - 16) / (xr[1] - xr[0]), (ph - 34) / (yr[1] - yr[0]));
        const cx = ox + 8 - xr[0] * s + (pw - 16 - (xr[1] - xr[0]) * s) / 2;
        const cy = oy + 26 + yr[1] * s;
        const X = (x: number) => cx + x * s, Y = (y: number) => cy - y * s;
        // grid and axes
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = Math.ceil(xr[0]); i <= xr[1]; i++) {
          ctx.moveTo(X(i), Y(yr[0]));
          ctx.lineTo(X(i), Y(yr[1]));
        }
        for (let j = Math.ceil(yr[0]); j <= yr[1]; j++) {
          ctx.moveTo(X(xr[0]), Y(j));
          ctx.lineTo(X(xr[1]), Y(j));
        }
        ctx.stroke();
        ctx.strokeStyle = P.lineStrong;
        ctx.beginPath();
        ctx.moveTo(X(xr[0]), Y(0));
        ctx.lineTo(X(xr[1]), Y(0));
        ctx.moveTo(X(0), Y(yr[0]));
        ctx.lineTo(X(0), Y(yr[1]));
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(pn.title, ox + 10, oy + 12);
        const shape = (m: Mat3 | null, fill: string | null, stroke: string, dash: number[] = []) => {
          ctx.beginPath();
          F_SHAPE.forEach((p, i) => {
            const q = m ? ap3(m, p) : p;
            if (i) ctx.lineTo(X(q[0]), Y(q[1]));
            else ctx.moveTo(X(q[0]), Y(q[1]));
          });
          ctx.closePath();
          if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
          }
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(dash);
          ctx.stroke();
          ctx.setLineDash([]);
        };
        shape(null, null, P.ink3, [4, 3]);
        shape(pn.mid, alpha(pn.color, 0.08), alpha(pn.color, 0.5), [3, 3]);
        shape(pn.m, alpha(pn.color, 0.45), pn.color);
        // where the model's origin ended up
        const o = ap3(pn.m, [0, 0]);
        ctx.beginPath();
        ctx.arc(X(o[0]), Y(o[1]), 4, 0, Math.PI * 2);
        ctx.fillStyle = pn.color;
        ctx.fill();
        ctx.fillStyle = P.ink2;
        ctx.font = `11px ${P.fontMono}`;
        ctx.fillText(`(${n2(o[0])}, ${n2(o[1])})`, X(o[0]) + 7, Y(o[1]) + 10);
        if (k === 0 && !stack) {
          ctx.strokeStyle = P.line;
          ctx.beginPath();
          ctx.moveTo(pw + 0.5, 0);
          ctx.lineTo(pw + 0.5, h);
          ctx.stroke();
        }
      });
    },
    [P, TR, RT, R, Tm],
    { aspect: 2, maxHeight: 360, minHeight: 300 },
  );

  const o1 = ap3(TR, [0, 0]), o2 = ap3(RT, [0, 0]);
  return (
    <Figure
      no={1}
      title="같은 두 변환, 다른 순서"
      hint="각도와 이동량을 바꿔 보세요"
      caption={
        <>
          점선은 처음 위치의 F, 옅은 점선은 첫 번째 변환만 한 중간 모습, 진한 색이 두 변환을 모두 한 결과입니다. 점은 F의 원점(왼쪽 아래 모서리)이 간 곳입니다. 회전은 언제나 원점 (0, 0)을 중심으로 돕니다. 그래서 먼저 옮긴 뒤 돌리면 F가 원점을 중심으로 큰 원을 그리며 다른 자리로 갑니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} role="img" aria-label={`F를 ${deg}도 돌리고 (${tx}, ${ty})만큼 옮깁니다. 돌린 뒤 옮기면 원점이 (${n2(o1[0])}, ${n2(o1[1])})로, 옮긴 뒤 돌리면 (${n2(o2[0])}, ${n2(o2[1])})로 갑니다.`} />
      </div>
      <div className="controls row">
        <Slider id="tf-deg" label="회전 각도" value={deg} min={-180} max={180} step={5} onChange={setDeg} format={(v) => `${v}°`} />
        <Slider id="tf-tx" label="이동 x" value={tx} min={-3} max={4} step={0.5} onChange={setTx} />
        <Slider id="tf-ty" label="이동 y" value={ty} min={-2} max={4} step={0.5} onChange={setTy} />
      </div>
      <div className="tf-tex-row">
        <div>
          <M>{`T\\cdot R = ${texM3(TR)}`}</M>
        </div>
        <div>
          <M>{`R\\cdot T = ${texM3(RT)}`}</M>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: model, view, projection ─────────────── */

const CORNER: [number, number, number] = [0.5, 0.5, 0.5];

function MatBox({ name, m, note }: { name: string; m: Mat4; note: string }) {
  return (
    <div className="tf-matbox">
      <div className="tf-matname">
        <strong>{name}</strong> <span>{note}</span>
      </div>
      <div className="tf-mat" role="table" aria-label={`${name} 행렬`}>
        {m.map((v, i) => (
          <span key={i} role="cell" data-zero={Math.abs(v) < 0.005 || undefined}>
            {n2(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CameraFigure() {
  const P = usePalette();
  const [s, setS] = useState<CamState>({ spin: -25, yaw: 35, pitch: 25, dist: 3.2, fov: 60, ortho: false });
  const set = (k: keyof CamState) => (v: number | boolean) => setS((o) => ({ ...o, [k]: v }));
  const m = useMemo(() => matrices(s), [s]);
  const fb = useMemo(() => renderCube(s, cssToRgb(P.accent), cssToRgb(P.surface2)), [s, P]);
  const j = journey(CORNER, m);
  const last = useRef<{ x: number; y: number } | null>(null);

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      const px = Math.min(w / FW, h / FH);
      const ox = (w - FW * px) / 2, oy = (h - FH * px) / 2;
      present(ctx, fb, ox, oy, px);
      // the corner we follow in the table below
      const sx = ox + j.screen[0] * px, sy = oy + j.screen[1] * px;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = P.hl;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('p', sx + 9, sy - 9);
    },
    [P, fb, j.screen[0], j.screen[1]],
    { aspect: FW / FH, maxHeight: 420, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      last.current = { x, y };
      return 'orbit';
    },
    onDrag: (_id, x, y) => {
      const l = last.current ?? { x, y };
      const dx = x - l.x, dy = y - l.y;
      last.current = { x, y };
      const k = 180 / Math.max(200, size.w);
      setS((o) => ({ ...o, yaw: Math.round(((o.yaw - dx * k + 540) % 360) - 180), pitch: Math.max(-80, Math.min(80, Math.round(o.pitch + dy * k))) }));
    },
    onEnd: () => (last.current = null),
  });

  const row = (label: string, v: number[], note?: string) => (
    <tr>
      <th scope="row">{label}</th>
      <td className="mono">({v.map(n2).join(', ')})</td>
      <td>{note}</td>
    </tr>
  );
  return (
    <Figure
      no={2}
      title="모델, 뷰, 투영"
      hint="그림을 끌면 카메라가 정육면체 둘레를 돕니다"
      caption={
        <>
          한 변이 1인 정육면체를 이 과목의 렌더러로 {FW}×{FH} 픽셀에 그렸습니다. 아래 행렬 세 개가 지금 설정의 모델, 뷰, 투영 행렬이고, 표는 노란 동그라미로 표시한 꼭짓점 p = (0.5, 0.5, 0.5)가 각 단계를 지나며 바뀌는 좌표입니다. 행렬의 0은 흐리게 표시했습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`정육면체를 ${s.ortho ? '직교 투영' : `시야각 ${s.fov}도 원근 투영`}으로 그렸습니다. 카메라는 방위 ${s.yaw}도, 높이각 ${s.pitch}도, 거리 ${s.dist}에 있습니다. 꼭짓점 p는 화면 (${n2(j.screen[0])}, ${n2(j.screen[1])}) 픽셀에 찍힙니다.`} />
        </div>
        <div className="controls">
          <Slider id="tf-spin" label="모델: y축 회전" value={s.spin} min={-180} max={180} step={5} onChange={set('spin')} format={(v) => `${v}°`} />
          <Slider id="tf-yaw" label="카메라 방위" value={s.yaw} min={-180} max={180} step={1} onChange={set('yaw')} format={(v) => `${v}°`} />
          <Slider id="tf-pitch" label="카메라 높이각" value={s.pitch} min={-80} max={80} step={1} onChange={set('pitch')} format={(v) => `${v}°`} />
          <Slider id="tf-dist" label="카메라 거리" value={s.dist} min={1.6} max={8} step={0.1} onChange={set('dist')} format={(v) => v.toFixed(1)} />
          <Seg label="투영" value={s.ortho ? 1 : 0} onChange={(v) => set('ortho')(v === 1)} options={[{ value: 0, label: '원근' }, { value: 1, label: '직교' }]} />
          <Slider id="tf-fov" label="시야각 (세로)" value={s.fov} min={20} max={120} step={1} onChange={set('fov')} format={(v) => `${v}°`} />
        </div>
      </div>
      <div className="tf-mats">
        <MatBox name="M" note="모델 → 세계" m={m.M} />
        <MatBox name="V" note="세계 → 카메라" m={m.V} />
        <MatBox name="P" note="카메라 → 클립" m={m.P} />
      </div>
      <div className="tbl-wrap">
        <table className="tf-journey">
          <thead>
            <tr>
              <th>공간</th>
              <th>p의 좌표</th>
              <th>어떻게</th>
            </tr>
          </thead>
          <tbody>
            {row('모델 공간', j.model, '정육면체 자신의 좌표, 끝에 1을 붙임')}
            {row('세계 공간', j.world, 'M · p')}
            {row('카메라 공간', j.view, 'V · M · p, 카메라는 원점에서 −z 쪽을 봄')}
            {row('클립 공간', j.clip, `P · V · M · p, 넷째 값 w = ${n2(j.clip[3])}`)}
            {row('정규화 장치 좌표', j.ndc, '앞의 세 값을 w로 나눔')}
            {row('화면 픽셀', j.screen, `x, y를 ${FW}×${FH} 화면에 맞춤`)}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the perspective divide, seen from the side ─────────────── */

const POSTS = [2, 4, 8];

function ProjectionFigure() {
  const P = usePalette();
  const [ortho, setOrtho] = useState(false);
  const [fov, setFov] = useState(60);
  const hs = POSTS.map((d) => postHeight(d, fov, ortho));
  const cols = [P.pos, P.neg, P.good];
  const css = ['var(--pos)', 'var(--neg)', 'var(--good)'];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      const narrow = w < 520;
      const sw = narrow ? 0 : Math.min(150, w * 0.24);
      const vw = w - sw - (narrow ? 0 : 20);
      const xr = [-0.6, 9], yr = 2.6;
      const s = Math.min((vw - 12) / (xr[1] - xr[0]), (h - 30) / (2 * yr));
      const X = (x: number) => 6 + (x - xr[0]) * s, Y = (y: number) => h / 2 + 8 - y * s;
      const t = Math.tan((fov * Math.PI) / 360);
      // the view volume
      ctx.save();
      ctx.beginPath();
      ctx.rect(X(xr[0]), Y(yr), (xr[1] - xr[0]) * s, 2 * yr * s);
      ctx.clip();
      ctx.fillStyle = alpha(P.accent, 0.07);
      ctx.beginPath();
      if (ortho) {
        const hh = 4 * t;
        ctx.rect(X(0), Y(hh), (xr[1] - 0) * s, 2 * hh * s);
      } else {
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(xr[1]), Y(xr[1] * t));
        ctx.lineTo(X(xr[1]), Y(-xr[1] * t));
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = alpha(P.accent, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      // rays to the top and bottom of each post
      POSTS.forEach((d, k) => {
        ctx.strokeStyle = alpha(cols[k], 0.75);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (const y of [0.5, -0.5]) {
          ctx.moveTo(X(ortho ? -0.6 : 0), Y(ortho ? y : 0));
          ctx.lineTo(X(d), Y(y));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = cols[k];
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(X(d), Y(0.5));
        ctx.lineTo(X(d), Y(-0.5));
        ctx.stroke();
      });
      ctx.restore();
      // the camera and the axis
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(xr[1]), Y(0));
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.moveTo(X(0) + 2, Y(0));
      ctx.lineTo(X(0) - 10, Y(0) - 7);
      ctx.lineTo(X(0) - 10, Y(0) + 7);
      ctx.closePath();
      ctx.fill();
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.ink3;
      POSTS.forEach((d) => ctx.fillText(`거리 ${d}`, X(d), Math.min(h - 14, Y(-0.5) + 6)));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('카메라', X(0) - 10, Y(0) - 16);
      // what the screen shows
      if (!narrow) {
        const bx = w - sw, by = 26, bh = h - 50;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx + 0.5, by + 0.5, sw - 1, bh);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText('화면', bx + sw / 2, by - 12);
        hs.forEach((v, k) => {
          const hh = Math.min(1, v) * bh;
          const cx = bx + (sw / 4) * (k + 1);
          ctx.fillStyle = cols[k];
          ctx.fillRect(cx - 7, by + bh / 2 - hh / 2, 14, hh);
        });
      }
    },
    [P, ortho, fov, hs[0], hs[1], hs[2]],
    { aspect: 2.1, maxHeight: 340, minHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="옆에서 본 투영"
      hint="투영 방식과 시야각을 바꿔 보세요"
      caption={
        <>
          카메라를 옆에서 본 그림입니다. 키가 1로 같은 막대 셋이 거리 2, 4, 8에 서 있고, 옅은 영역이 카메라에 보이는 공간입니다. 점선은 막대의 위아래 끝에서 카메라로 오는 빛입니다. 오른쪽 "화면"은 각 막대가 화면 높이의 몇 퍼센트로 찍히는지 보여 줍니다. 직교 투영의 보이는 공간은 원근 투영에서 거리 4일 때의 높이로 맞췄습니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} role="img" aria-label={`${ortho ? '직교 투영' : `시야각 ${fov}도 원근 투영`}. 거리 2, 4, 8의 막대가 화면 높이의 ${hs.map((v) => Math.round(v * 100) + '%').join(', ')}로 찍힙니다.`} />
      </div>
      <div className="controls row">
        <Seg label="투영" value={ortho ? 1 : 0} onChange={(v) => setOrtho(v === 1)} options={[{ value: 0, label: '원근' }, { value: 1, label: '직교' }]} />
        <Slider id="tf-pfov" label="시야각 (세로)" value={fov} min={20} max={120} step={1} onChange={setFov} format={(v) => `${v}°`} />
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', minWidth: 240 }}>
          {POSTS.map((d, k) => (
            <Readout key={d} label={`거리 ${d}`} value={`${Math.round(hs[k] * 100)}%`} color={css[k]} />
          ))}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: perspective-correct interpolation ─────────────── */

function FloorFigure() {
  const P = usePalette();
  const [camH, setCamH] = useState(1.5);
  const [correct, setCorrect] = useState(false);
  const [seam, setSeam] = useState(true);
  const ink = cssToRgb(P.ink), surf = cssToRgb(P.surface);
  const r = useMemo(() => renderFloor(camH, correct, mix(surf, ink, 0.78), mix(surf, ink, 0.08), cssToRgb(P.surface2)), [camH, correct, P]);
  const verts = useMemo(() => floorVerts(camH), [camH]);
  const pct = Math.round((100 * r.wrong) / r.floor);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.surface;
      ctx.fillRect(0, 0, w, h);
      const px = Math.min(w / TW, h / TH);
      const ox = (w - TW * px) / 2, oy = (h - TH * px) / 2;
      present(ctx, r.fb, ox, oy, px);
      if (seam) {
        ctx.strokeStyle = P.hl;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ox + verts[0].x * px, oy + verts[0].y * px);
        ctx.lineTo(ox + verts[2].x * px, oy + verts[2].y * px);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [P, r, seam, verts],
    { aspect: TW / TH, maxHeight: 400, minHeight: 180 },
  );

  return (
    <Figure
      no={4}
      title="바닥의 체크무늬"
      hint="원근 보정을 켜고 꺼 보세요"
      caption={
        <>
          가로 4칸, 세로 6칸짜리 체크무늬 바닥을 삼각형 두 개로 그렸습니다. 노란 점선이 두 삼각형의 경계입니다. 원근 보정을 끄면 텍스처 좌표를 화면 위의 무게중심 좌표로 그대로 섞고, 켜면 1/w로 나눠 둔 값을 섞은 뒤 다시 나눕니다. "틀린 픽셀"은 보정한 그림과 칸의 색이 다른 바닥 픽셀의 비율입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`높이 ${camH}에서 본 체크무늬 바닥, 원근 보정 ${correct ? '켬' : '끔'}. ${correct ? '칸이 곧게 줄어듭니다.' : `칸이 두 삼각형의 경계에서 꺾이고, 바닥 픽셀의 ${pct}%가 틀린 색입니다.`}`} />
        </div>
        <div className="controls">
          <Check label="원근 보정" checked={correct} onChange={setCorrect} />
          <Check label="삼각형 경계 보이기" checked={seam} onChange={setSeam} />
          <Slider id="tf-camh" label="카메라 높이" value={camH} min={0.5} max={6} step={0.1} onChange={setCamH} format={(v) => v.toFixed(1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="바닥 픽셀" value={r.floor} />
            <Readout label="틀린 픽셀" value={`${pct}%`} color={pct ? 'var(--bad)' : 'var(--good)'} />
          </div>
          <div className="gx-note" data-bad={!correct || undefined} data-good={correct || undefined}>
            {correct ? '먼 칸은 작게, 가까운 칸은 크게, 칸의 선은 모두 곧습니다.' : '칸의 선이 경계에서 꺾이고, 먼 쪽 칸이 너무 크게 늘어났습니다.'}
          </div>
        </div>
      </div>
      <Legend items={[{ color: 'var(--hl)', label: '두 삼각형의 경계', shape: 'ln' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Transforms() {
  return (
    <>
      <h2>움직임은 행렬 곱셈입니다</h2>
      <p>
        3차원 모델은 저마다 자기 좌표로 만들어집니다. 정육면체는 중심이 원점이고, 의자는 다리 끝이 원점입니다. 장면에 놓으려면 이 모델을 키우고, 돌리고, 옮겨야 합니다. 키우기와 돌리기는 <a href={lessonHref('math-linear-algebra', 'matrices')}>선형변환</a>이라 행렬 하나로 나타납니다. 그런데 옮기기는 그렇지 않습니다. 선형변환은 언제나 원점을 원점으로 보내는데, 옮기기는 원점까지 옮겨 버리기 때문입니다.
      </p>
      <p>
        그래픽스는 이 문제를 좌표를 하나 늘려서 풉니다. 2차원 점 (x, y)를 (x, y, 1)로 적고, 3×3 행렬을 곱합니다. 마지막 열에 이동량을 넣으면, 그 열은 늘 1인 셋째 좌표와 곱해져 더해집니다. 이렇게 1을 덧붙인 좌표를 <T en="homogeneous coordinates">동차 좌표</T>라고 합니다.
      </p>
      <MB note="2차원에서는 3×3, 3차원에서는 같은 이유로 4×4 행렬을 씁니다.">{`\\begin{bmatrix} 1 & 0 & t_x \\\\ 0 & 1 & t_y \\\\ 0 & 0 & 1 \\end{bmatrix} \\begin{bmatrix} x \\\\ y \\\\ 1 \\end{bmatrix} = \\begin{bmatrix} x + t_x \\\\ y + t_y \\\\ 1 \\end{bmatrix}`}</MB>
      <p>
        이제 이동, 회전, 크기 조절이 모두 행렬이니, 여러 변환을 곱해서 행렬 하나로 합칠 수 있습니다. 꼭짓점이 수십만 개라도 꼭짓점마다 곱하는 행렬은 하나뿐입니다. 다만 행렬 곱셈은 순서를 바꾸면 결과가 달라집니다. 그림 1에서 확인해 보세요.
      </p>
      <OrderFigure />
      <p>
        기본값인 45° 회전과 (3, 1) 이동에서, 먼저 돌리고 옮기면 F의 원점은 정확히 (3, 1)에 갑니다. 먼저 옮기고 돌리면 (3, 1)에 간 원점이 다시 원점을 중심으로 45° 돌아 (1.41, 2.83)에 갑니다. 행렬의 마지막 열에 바로 그 좌표가 적혀 있습니다. 점에 가장 가까운 오른쪽 행렬이 먼저 적용되므로, <M>{'T\\cdot R'}</M>은 "회전 다음 이동"이라고 읽습니다. 모델을 제자리에서 돌린 뒤 장면에 놓으려면 대개 크기, 회전, 이동 순서로 <M>{'T\\cdot R\\cdot S'}</M>를 씁니다.
      </p>

      <h2>3차원: 모델, 뷰, 투영</h2>
      <p>
        3차원에서는 같은 생각으로 4×4 행렬을 씁니다. 꼭짓점 하나가 화면의 픽셀이 되기까지는 행렬 세 개를 차례로 지납니다.
      </p>
      <ol>
        <li>
          <T en="model matrix">모델 행렬</T> M은 모델 자신의 좌표를 장면 전체가 함께 쓰는 세계 좌표로 옮깁니다.
        </li>
        <li>
          <T en="view matrix">뷰 행렬</T> V는 세계를 통째로 움직여서 카메라가 원점에 있고 −z 방향을 보는 것처럼 만듭니다. 카메라를 오른쪽으로 옮기는 것과 세계를 왼쪽으로 옮기는 것은 화면에서 같아 보이기 때문입니다.
        </li>
        <li>
          <T en="projection matrix">투영 행렬</T> P는 카메라에 보이는 공간을 가로세로 깊이 모두 −1에서 1인 정육면체로 옮깁니다. 이 정육면체의 좌표를 <T en="normalized device coordinates, NDC">정규화 장치 좌표</T>라고 하고, 여기서 화면 픽셀까지는 단순한 늘이기입니다.
        </li>
      </ol>
      <CameraFigure />
      <p>
        처음 설정에서 꼭짓점 p = (0.5, 0.5, 0.5)는 모델 행렬의 −25° 회전으로 세계 좌표 (0.24, 0.50, 0.66)이 되고, 뷰 행렬을 지나 카메라 좌표 (−0.18, 0.16, −2.37)이 됩니다. z가 음수인 것은 카메라 앞에 있다는 뜻이고, 2.37은 카메라에서 p까지의 깊이입니다. 투영 행렬을 곱한 클립 좌표는 (−0.24, 0.28, 2.19, 2.37)인데, 넷째 값 w가 바로 그 깊이 2.37입니다. 앞의 세 값을 w로 나누면 (−0.10, 0.12, 0.93)이 되고, 이것을 160×120 화면에 맞추면 (72.0, 52.8) 픽셀입니다.
      </p>
      <Callout kind="note">
        행렬 P의 맨 아래 줄 (0, 0, −1, 0)을 보세요. 이 줄은 x, y는 버리고 카메라 좌표의 z에 −1을 곱해 w로 보냅니다. 투영 행렬이 하는 가장 중요한 일이 이것입니다. 실제 나눗셈은 행렬 곱셈으로 할 수 없으니, 깊이를 w에 넣어 두었다가 다음 단계에서 나눕니다.
      </Callout>

      <h2>원근 나눗셈: 멀수록 작게</h2>
      <p>
        w로 나누는 단계를 <T en="perspective divide">원근 나눗셈</T>이라고 합니다. 멀리 있는 점일수록 w가 크니, 나누면 화면 중심 쪽으로 더 많이 끌려옵니다. 철길이 멀어질수록 좁아지는 이유가 이것입니다. 그림 3은 카메라를 옆에서 본 모습입니다.
      </p>
      <ProjectionFigure />
      <p>
        시야각 60°에서 거리 2, 4, 8의 막대는 화면 높이의 43%, 22%, 11%로 찍힙니다. 거리가 두 배가 될 때마다 크기가 정확히 절반이 됩니다. 시야각을 90°로 넓히면 각각 25%, 13%, 6%로 작아지고, 30°로 좁히면 93%, 47%, 23%로 커집니다. 시야각을 좁히는 것이 망원 렌즈로 당겨 찍는 것과 같습니다.
      </p>
      <p>
        <T en="orthographic projection">직교 투영</T>을 고르면 w가 언제나 1이라 나눗셈이 아무것도 바꾸지 않습니다. 세 막대는 거리와 상관없이 모두 22%입니다. 원근이 없어서 실제 길이를 재기 쉬우니, 설계 도면, 건축 평면도, 위에서 내려다보는 2차원 게임이 직교 투영을 씁니다. 그림 2에서 투영을 직교로 바꾸면 정육면체의 평행한 모서리가 화면에서도 평행하게 남습니다.
      </p>

      <h2>원근이 있으면 섞는 법도 달라집니다</h2>
      <p>
        <a href={lessonHref('cs-graphics', 'rasterization')}>래스터화</a> 장에서는 꼭짓점의 값을 화면 위의 무게중심 좌표로 섞었습니다. 그런데 원근 나눗셈은 먼 쪽을 화면에서 줄여 놓습니다. 3차원 공간에서 고르게 변하던 값이 화면 위에서는 고르게 변하지 않습니다. 그림 4의 체크무늬 바닥에서 원근 보정을 끄면 무슨 일이 생기는지 보세요.
      </p>
      <FloorFigure />
      <p>
        보정을 끄면 칸의 선이 두 삼각형의 경계에서 꺾이고, 먼 쪽 칸이 지나치게 크게 늘어납니다. 처음 설정에서는 바닥 픽셀의 46%가 틀린 색입니다. 해법은 이렇습니다. 텍스처 좌표 u를 그대로 섞지 말고 u/w와 1/w를 화면 위에서 섞은 다음, 픽셀마다 둘을 나눕니다. u/w와 1/w는 화면 위에서 정확히 고르게 변하는 양이기 때문입니다.
      </p>
      <MB note="b는 화면 위의 무게중심 좌표, w는 각 꼭짓점의 클립 좌표 w입니다.">{`u(p) = \\frac{b_0\\,u_0/w_0 + b_1\\,u_1/w_1 + b_2\\,u_2/w_2}{b_0/w_0 + b_1/w_1 + b_2/w_2}`}</MB>
      <p>
        이 과목의 렌더러가 꼭짓점마다 invW(1/w)를 넘기는 이유가 이 식입니다. 1994년에 나온 첫 플레이스테이션은 이 나눗셈을 하지 않았습니다. 그래서 그 시절 게임에서는 바닥과 벽의 무늬가 카메라가 움직일 때마다 출렁였습니다. 지금의 GPU는 픽셀마다 이 나눗셈을 하드웨어로 합니다.
      </p>

      <Callout kind="key">
        이동은 선형변환이 아니지만, 좌표 끝에 1을 붙인 동차 좌표를 쓰면 이동, 회전, 크기 조절이 모두 행렬 곱셈이 됩니다. 행렬 곱셈은 순서가 중요해서, 점에 가까운 오른쪽 행렬이 먼저 적용됩니다. 꼭짓점은 모델 행렬로 세계에 놓이고, 뷰 행렬로 카메라 앞에 서고, 투영 행렬로 깊이가 w에 담긴 클립 좌표가 됩니다. w로 나누는 원근 나눗셈이 먼 것을 작게 만들고, 그 때문에 화면 위에서 값을 섞을 때도 1/w로 보정해야 합니다.
      </Callout>
      <Quiz
        q="회전 행렬 R과 이동 행렬 T가 있다. 모델을 자기 원점을 중심으로 제자리에서 돌린 뒤 (5, 0, 0)으로 옮기려면 꼭짓점 p에 무엇을 곱해야 하는가?"
        options={['T · R · p', 'R · T · p', 'T · p + R · p', 'R · p 한 다음 T의 역행렬을 곱한다']}
        answer={0}
        explain={<>p에 가까운 오른쪽 행렬이 먼저 적용됩니다. T · R · p는 R이 먼저 원점을 중심으로 돌리고, 그다음 T가 옮깁니다. R · T · p는 먼저 (5, 0, 0)으로 옮긴 뒤 원점을 중심으로 돌리므로, 모델이 반지름 5인 원을 따라 다른 자리로 가 버립니다.</>}
      />
    </>
  );
}

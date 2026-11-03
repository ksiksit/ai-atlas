import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, parseColor, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { GLYPH_N, alphaSigma, glyph, makeGMM, noiseVec, sampleGMM, sampleReverse, sampleStats, type GMM, type Sampler, type Sched, type Shape2D } from './generative';
import './generative.css';

const fmt = (v: number, d = 3) => (isFinite(v) ? v.toFixed(d) : '—');
const pct = (v: number) => (isFinite(v) ? `${Math.round(v * 100)}%` : '—');
const classColors = (P: Palette) => [P.pos, P.neg];
const CLASS_VARS = ['var(--pos)', 'var(--neg)'];

/** Faint discs where the mixture's components sit (radius 2s). */
function drawMixture(p: Plot, P: Palette, g: GMM, colored: boolean) {
  const cols = classColors(P);
  const r = 2 * g.s * p.sx;
  g.mu.forEach((m, k) => {
    p.ctx.beginPath();
    p.ctx.arc(p.X(m[0]), p.Y(m[1]), r, 0, Math.PI * 2);
    p.ctx.fillStyle = colored ? alpha(cols[g.cls[k]], 0.16) : alpha(P.ink3, 0.16);
    p.ctx.fill();
  });
}

/* ─────────────── Figure 1: the forward process ─────────────── */

const SPIRAL = makeGMM('spiral');
const RINGS = makeGMM('rings');
const FWD_X0 = sampleGMM(SPIRAL, 500, 4);
const FWD_EPS = noiseVec(1000, 8);
const GLYPH = glyph();
const GLYPH_EPS = noiseVec(GLYPH_N * GLYPH_N, 12);

function ForwardFigure() {
  const P = usePalette();
  const [t, setT] = useState(0.3);
  const [sched, setSched] = useState<Sched>('cosine');
  const [a, s] = alphaSigma(sched, t);

  const pts = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.4, xMax: 2.4, yMin: -2.4, yMax: 2.4, equal: true, pad: { l: 4, r: 4, t: 4, b: 4 } });
      p.grid({ xStep: 1, yStep: 1, labels: false });
      p.clip();
      FWD_X0.forEach((x0, i) => p.dot(a * x0[0] + s * FWD_EPS[2 * i], a * x0[1] + s * FWD_EPS[2 * i + 1], 1.9, P.accent));
      p.unclip();
    },
    [P, a, s],
    { aspect: 1, maxHeight: 320, minHeight: 140 },
  );

  const img = useCanvas2D(
    (ctx, { w, h }) => {
      const bg = parseColor(P.surface);
      const ink = parseColor(P.ink);
      const side = Math.min(w, h);
      const ox = Math.floor((w - side) / 2);
      const oy = Math.floor((h - side) / 2);
      const c = side / GLYPH_N;
      for (let j = 0; j < GLYPH_N; j++) {
        for (let i = 0; i < GLYPH_N; i++) {
          const k = j * GLYPH_N + i;
          const v = a * GLYPH[k] + s * GLYPH_EPS[k];
          const u = Math.max(0, Math.min(1, (v + 1) / 2)); // −1 → background, 1 → ink
          ctx.fillStyle = `rgb(${Math.round(bg[0] + (ink[0] - bg[0]) * u)},${Math.round(bg[1] + (ink[1] - bg[1]) * u)},${Math.round(bg[2] + (ink[2] - bg[2]) * u)})`;
          ctx.fillRect(ox + Math.floor(i * c), oy + Math.floor(j * c), Math.ceil(c) + 1, Math.ceil(c) + 1);
        }
      }
    },
    [P, a, s],
    { aspect: 1, maxHeight: 320, minHeight: 140 },
  );

  const curves = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 1.05, pad: { l: 34, r: 12, t: 10, b: 26 } });
      p.grid({ xStep: 0.25, yStep: 0.25, axes: false });
      const other: Sched = sched === 'cosine' ? 'linear' : 'cosine';
      p.fn((x) => alphaSigma(other, x)[0], alpha(P.pos, 0.3), 1.6);
      p.fn((x) => alphaSigma(other, x)[1], alpha(P.neg, 0.3), 1.6, { dash: [5, 4] });
      p.fn((x) => alphaSigma(sched, x)[0], P.pos, 2.6);
      p.fn((x) => alphaSigma(sched, x)[1], P.neg, 2.6, { dash: [7, 4] });
      p.line(t, 0, t, 1.05, P.ink2, 1.2);
      p.dot(t, a, 4.5, P.pos, P.surface, 1.5);
      p.dot(t, s, 4.5, P.neg, P.surface, 1.5);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('t', p.X(1), p.Y(0) - 3);
    },
    [P, sched, t, a, s],
    { aspect: 2.6, maxHeight: 230, minHeight: 150 },
  );

  return (
    <Figure
      no={1}
      title="정방향 과정: 데이터를 잡음으로"
      hint="t를 0에서 1까지 움직여 보세요"
      caption={
        <>
          나선 모양 분포에서 뽑은 점 500개와 16×16 이미지 하나에 같은 식 <M>{'x_t = \\alpha_t x_0 + \\sigma_t \\varepsilon'}</M>을 적용했습니다. 잡음 <M>{'\\varepsilon'}</M>은 고정해 두고 t만 바꾸므로, 슬라이더를 움직이면 한 가지 잡음 경로를 따라 앞뒤로 오갑니다. 이미지는 −1(배경)~1(잉크)로 나타낸 픽셀 값을 같은 범위의 회색으로 그렸습니다. 아래 그래프의 실선은 <M>{'\\alpha_t'}</M>, 점선은 <M>{'\\sigma_t'}</M>이고, 흐린 선은 다른 스케줄입니다.
        </>
      }
    >
      <div className="gen-fwd">
        <div ref={pts.wrapRef} className="canvas-box" role="img" aria-label={`t = ${t.toFixed(2)}에서 잡음이 섞인 나선 데이터`}>
          <canvas ref={pts.canvasRef} />
        </div>
        <div ref={img.wrapRef} className="canvas-box" role="img" aria-label={`t = ${t.toFixed(2)}에서 잡음이 섞인 웃는 얼굴 이미지`}>
          <canvas ref={img.canvasRef} />
        </div>
      </div>
      <div ref={curves.wrapRef} className="canvas-box" role="img" aria-label={`${sched === 'cosine' ? '코사인' : '선형 β'} 스케줄의 α와 σ 곡선`}>
        <canvas ref={curves.canvasRef} />
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Slider id="fwd-t" label="시간 t" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => v.toFixed(2)} />
          <Seg
            label="스케줄"
            value={sched}
            onChange={setSched}
            options={[
              { value: 'linear', label: '선형 β' },
              { value: 'cosine', label: '코사인' },
            ]}
          />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr', alignSelf: 'start' }}>
          <Readout label="신호 α" value={fmt(a, 3)} color="var(--pos)" />
          <Readout label="잡음 σ" value={fmt(s, 3)} color="var(--neg)" />
          <Readout label="α²/σ²" value={s > 0 ? (a * a) / (s * s) >= 100 ? '100 이상' : fmt((a * a) / (s * s), 2) : '∞'} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '신호의 크기 α', shape: 'ln' },
          { color: 'var(--neg)', label: '잡음의 크기 σ (점선)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: reverse sampling with the exact denoiser ─────────────── */

const N_REV = 300;
const N_TRACK = 24;
const STEP_OPTS = [2, 5, 20, 100];

function ReverseFigure() {
  const P = usePalette();
  const [data, setData] = useState<Shape2D>('spiral');
  const [steps, setSteps] = useState(20);
  const [sampler, setSampler] = useState<Sampler>('ddim');
  const [sched, setSched] = useState<Sched>('cosine');
  const [seed, setSeed] = useState(1);
  const [showPred, setShowPred] = useState(true);
  const g = data === 'spiral' ? SPIRAL : RINGS;
  const run = useMemo(() => sampleReverse(g, { n: N_REV, steps, sampler, sched, seed }), [g, steps, sampler, sched, seed]);
  const finals = useMemo(() => run.paths.map((p) => p[p.length - 1]), [run]);
  const st = useMemo(() => sampleStats(g, finals), [g, finals]);
  const ref = useMemo(() => sampleStats(g, sampleGMM(g, N_REV, 11)), [g]);
  const s = useStepper(steps + 1, 8, `${data}|${steps}|${sampler}|${sched}|${seed}`, true, true);
  const { setSpeed } = s;
  useEffect(() => setSpeed(steps <= 5 ? 2 : steps <= 20 ? 8 : 30), [steps, setSpeed]);
  const j = s.i;
  const tNow = run.times[j];
  const done = j === steps;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.9, xMax: 1.9, yMin: -1.9, yMax: 1.9, equal: true, pad: { l: 4, r: 4, t: 4, b: 4 } });
      p.grid({ xStep: 1, yStep: 1, labels: false });
      p.clip();
      drawMixture(p, P, g, false);
      // trajectories of a few samples
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = alpha(P.ink2, 0.45);
      for (let i = 0; i < N_TRACK; i++) {
        const path = run.paths[i];
        ctx.beginPath();
        for (let k = 0; k <= j; k++) {
          const [x, y] = path[k];
          if (k === 0) ctx.moveTo(p.X(x), p.Y(y));
          else ctx.lineTo(p.X(x), p.Y(y));
        }
        ctx.stroke();
      }
      run.paths.forEach((path, i) => p.dot(path[j][0], path[j][1], i < N_TRACK ? 3.2 : 2, i < N_TRACK ? P.accent : alpha(P.accent, 0.6)));
      if (showPred && !done) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2;
        for (let i = 0; i < N_TRACK; i++) {
          const [x, y] = run.preds[i][j];
          const cx = p.X(x);
          const cy = p.Y(y);
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 4);
          ctx.lineTo(cx + 4, cy + 4);
          ctx.moveTo(cx + 4, cy - 4);
          ctx.lineTo(cx - 4, cy + 4);
          ctx.stroke();
        }
      }
      p.unclip();
    },
    [P, g, run, j, showPred, done],
    { aspect: 1, maxHeight: 440, minHeight: 260 },
  );

  return (
    <Figure
      no={2}
      title="역방향 샘플링: 잡음에서 데이터로"
      hint="단계 수와 샘플러를 바꿔 결과를 비교해 보세요"
      caption={
        <>
          표준 정규분포에서 뽑은 점 {N_REV}개를 t = 1에서 t = 0까지 같은 간격의 단계로 되돌립니다. 흐린 원은 데이터 분포를 이루는 정규분포 성분들이고, 선은 그중 {N_TRACK}개 점이 지나온 길입니다. × 표시는 지금 위치에서 디노이저가 추측한 최종 위치 <M>{'\\hat{x}_0'}</M>입니다. 디노이저는 학습한 신경망이 아니라 이 분포에 대해 정확히 계산한 <M>{'\\mathbb{E}[x_0 \\mid x_t]'}</M>입니다. 아래 수치는 모든 단계를 마친 결과로 잽니다.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${steps}단계 ${sampler.toUpperCase()} 샘플링, ${j}단계째, t = ${tNow.toFixed(2)}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="gen-note" aria-live="polite">
            {j === 0 ? `t = 1: 순수한 잡음입니다. ${steps}단계에 걸쳐 되돌립니다.` : done ? `t = 0: ${steps}단계를 모두 마쳤습니다.` : `${j}단계를 지나 t = ${tNow.toFixed(2)}입니다.`}
          </div>
        </div>
        <div className="controls">
          <Seg label="데이터" value={data} onChange={setData} options={[{ value: 'spiral', label: '나선' }, { value: 'rings', label: '두 고리' }]} />
          <Seg label="단계 수" value={steps} onChange={setSteps} options={STEP_OPTS.map((v) => ({ value: v, label: String(v) }))} />
          <Seg label="샘플러" value={sampler} onChange={setSampler} options={[{ value: 'ddpm', label: 'DDPM' }, { value: 'ddim', label: 'DDIM' }]} />
          <Seg label="스케줄" value={sched} onChange={setSched} options={[{ value: 'linear', label: '선형 β' }, { value: 'cosine', label: '코사인' }]} />
          <StepControls s={s} id="rev-speed" maxSpeed={40} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((k) => k + 1)}>
              새 잡음
            </Button>
          </div>
          <Check label="x̂₀ 추측 보기" checked={showPred} onChange={setShowPred} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="성분까지 평균 거리" value={fmt(st.dist, 3)} color="var(--accent)" />
            <Readout label="실제 데이터라면" value={fmt(ref.dist, 3)} />
            <Readout label="샘플이 닿은 성분" value={pct(st.coverage)} color="var(--accent)" />
            <Readout label="실제 데이터라면" value={pct(ref.coverage)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '샘플', shape: 'dot' },
          { color: 'var(--pos)', label: '디노이저의 추측 x̂₀', shape: 'dot' },
          { color: 'var(--ink-3)', label: '데이터 분포의 성분', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: classifier-free guidance ─────────────── */

const W_OPTS = [0, 1, 3, 7];
const GUIDE_STEPS = 40;

function GuidanceFigure() {
  const P = usePalette();
  const [cls, setCls] = useState(0);
  const [w, setW] = useState(1);
  const [seed, setSeed] = useState(1);
  const runs = useMemo(
    () =>
      W_OPTS.map((wv) => {
        const run = sampleReverse(RINGS, { n: N_REV, steps: GUIDE_STEPS, sampler: 'ddim', sched: 'cosine', seed, c: cls, w: wv });
        const pts = run.paths.map((p) => p[p.length - 1]);
        return { w: wv, pts, st: sampleStats(RINGS, pts, cls) };
      }),
    [cls, seed],
  );
  const ref = useMemo(() => sampleStats(RINGS, sampleGMM(RINGS, N_REV, 11, cls), cls), [cls]);
  const cur = runs[W_OPTS.indexOf(w)];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const p = new Plot(ctx, cw, h, P, { xMin: -1.05, xMax: 1.05, yMin: -0.8, yMax: 0.8, equal: true, pad: { l: 4, r: 4, t: 4, b: 4 } });
      p.grid({ xStep: 0.5, yStep: 0.5, labels: false });
      p.clip();
      drawMixture(p, P, RINGS, true);
      const col = classColors(P)[cls];
      cur.pts.forEach(([x, y]) => p.dot(x, y, 2.6, col, P.surface, 0.8));
      p.unclip();
    },
    [P, cur, cls],
    { aspect: 1.35, maxHeight: 380, minHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="가이던스: 원하는 쪽으로 더 세게"
      hint="가이던스 크기 w를 키워 보세요"
      caption={
        <>
          데이터는 왼쪽 고리(클래스 A)와 오른쪽 고리(클래스 B)가 겹친 분포이고, 두 고리가 만나는 곳의 점은 어느 클래스인지 애매합니다. 고른 클래스의 조건부 디노이저와 조건 없는 디노이저를 <M>{'\\hat{x} = \\hat{x}_{\\text{무조건}} + w(\\hat{x}_{\\text{조건}} - \\hat{x}_{\\text{무조건}})'}</M>로 섞어 DDIM {GUIDE_STEPS}단계로 {N_REV}개를 뽑았습니다. 클래스 일치율은 정확한 베이즈 분류기가 고른 클래스로 판정한 비율, 성분 커버리지는 그 클래스의 성분 16개 가운데 샘플이 하나라도 가장 가깝게 붙은 성분의 비율, 퍼짐은 샘플들이 무게중심에서 떨어진 평균 거리(RMS)입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`클래스 ${cls ? 'B' : 'A'}, 가이던스 w = ${w}로 뽑은 샘플 ${N_REV}개`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="조건 (클래스)"
            value={cls}
            onChange={setCls}
            options={[
              { value: 0, label: 'A 왼쪽' },
              { value: 1, label: 'B 오른쪽' },
            ]}
          />
          <Seg label="가이던스 w" value={w} onChange={setW} options={W_OPTS.map((v) => ({ value: v, label: String(v) }))} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((k) => k + 1)}>
              새 잡음
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="클래스 일치율" value={pct(cur.st.acc)} color={CLASS_VARS[cls]} />
            <Readout label="성분 커버리지" value={pct(cur.st.coverage)} />
            <Readout label="퍼짐 (RMS)" value={fmt(cur.st.spread, 2)} />
            <Readout label="성분까지 평균 거리" value={fmt(cur.st.dist, 3)} />
          </div>
        </div>
      </div>
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="tbl gen-tbl">
          <thead>
            <tr>
              <th>w</th>
              <th>일치율</th>
              <th>커버리지</th>
              <th>퍼짐</th>
              <th>평균 거리</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.w} data-cur={r.w === w || undefined}>
                <td>{r.w}</td>
                <td>{pct(r.st.acc)}</td>
                <td>{pct(r.st.coverage)}</td>
                <td>{fmt(r.st.spread, 2)}</td>
                <td>{fmt(r.st.dist, 3)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontFamily: 'var(--font-body)' }}>실제</td>
              <td>{pct(ref.acc)}</td>
              <td>{pct(ref.coverage)}</td>
              <td>{fmt(ref.spread, 2)}</td>
              <td>{fmt(ref.dist, 3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '클래스 A 성분', shape: 'dot' },
          { color: 'var(--neg)', label: '클래스 B 성분', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Diffusion() {
  return (
    <>
      <h2>망치기는 쉽고 되돌리기는 어렵다</h2>
      <p>
        사진에 잡음을 조금 섞으면 지글거리는 사진이 됩니다. 계속 섞으면 결국 원래 사진의 흔적이 하나도 없는 순수한 잡음만 남습니다. 이 방향은 쉽습니다. 반대 방향, 곧 잡음에서 출발해 잡음을 조금씩 걷어 내 사진을 만들어 내는 법을 배울 수 있다면 어떨까요? 그러면 아무 잡음이나 뽑아서 새 사진을 얻을 수 있습니다.
      </p>
      <p>
        <T en="diffusion model">확산 모델</T>이 바로 이것입니다. 2020년 Ho 등의 DDPM(Denoising Diffusion Probabilistic Models) 이후 이미지 생성의 주류가 되었고, 지금은 이미지뿐 아니라 영상과 소리를 만드는 모델에도 쓰입니다. 앞 장의 <a href="#ai-deep-learning/autoencoder-vae">VAE</a>가 한 번에 잠재 코드를 이미지로 바꾸었다면, 확산 모델은 작은 걸음 여러 번으로 나누어 조금씩 다듬습니다. 이 장에서는 2차원 점으로 그 원리를 모두 따라가 봅니다.
      </p>

      <h2>정방향 과정: 잡음 섞기</h2>
      <p>
        데이터 <M>{'x_0'}</M>에 표준 정규분포 잡음 <M>{'\\varepsilon \\sim \\mathcal{N}(0, I)'}</M>을 섞어 시간 <M>{'t'}</M>의 상태를 만듭니다. 시간은 0(깨끗한 데이터)에서 1(순수한 잡음)까지 흐른다고 놓겠습니다.
      </p>
      <MB note="α는 남은 신호의 크기, σ는 섞인 잡음의 크기입니다. α² + σ² = 1을 지키면 데이터의 분산이 1일 때 x_t의 분산도 계속 1입니다.">{'x_t = \\alpha_t\\, x_0 + \\sigma_t\\, \\varepsilon, \\qquad \\alpha_t^2 + \\sigma_t^2 = 1'}</MB>
      <p>
        원래 DDPM은 잡음을 1000단계에 걸쳐 조금씩 더하는 식으로 정의했지만, 정규분포 잡음을 여러 번 더한 결과는 다시 하나의 정규분포이므로 어떤 시점이든 위 식 한 번으로 바로 갈 수 있습니다. 학습할 때 중간 단계를 일일이 거칠 필요가 없다는 뜻입니다.
      </p>
      <p>
        <M>{'\\alpha_t'}</M>가 시간에 따라 줄어드는 모양을 <T en="noise schedule">잡음 스케줄</T>이라고 합니다. DDPM은 단계마다 섞는 잡음의 분산 <M>{'\\beta'}</M>를 <M>{'10^{-4}'}</M>에서 0.02까지 1000단계 동안 일정하게 늘렸습니다(선형 β). 그러면 마지막에 남는 신호의 분산 <M>{'\\alpha^2'}</M>이 약 <M>{'4\\times10^{-5}'}</M>으로 사실상 잡음뿐입니다. 이 스케줄은 신호를 일찍 지워 버리는 편이라, 뒤이어 Nichol과 Dhariwal(2021)은 <M>{'\\alpha'}</M>가 코사인 곡선을 따라 천천히 줄어드는 <T en="cosine schedule">코사인 스케줄</T>을 제안했습니다. 그림 1에서 t = 0.5일 때 선형 β는 신호가 <M>{'\\alpha'}</M> = 0.28만 남지만 코사인은 0.70이 남습니다.
      </p>
      <ForwardFigure />
      <p>
        t를 끌어 보면 점과 이미지가 같은 속도로 망가집니다. 2차원 점이든 픽셀 256개짜리 이미지든 수식은 똑같고, 차원 수만 다릅니다. 이미지에서는 픽셀 하나하나가 좌표 하나입니다.
      </p>
      <Code label="정방향 과정과 DDPM의 학습 손실">{`
// 시점 t에서의 신호/잡음 크기 (코사인 스케줄)
const f = (t) => Math.cos(((t + 0.008) / 1.008) * Math.PI / 2) ** 2;
const alphaSigma = (t) => { const a2 = f(t) / f(0); return [Math.sqrt(a2), Math.sqrt(1 - a2)]; };

// 정방향: 어떤 t로든 한 번에 간다
function noisy(x0, t, eps) {
  const [a, s] = alphaSigma(t);
  return x0.map((v, i) => a * v + s * eps[i]);
}

// 학습 한 번: 무작위 t와 잡음으로 섞고, 신경망이 그 잡음을 맞히게 한다
function trainStep(x0) {
  const t = Math.random();
  const eps = x0.map(() => randn());
  const pred = epsNet(noisy(x0, t, eps), t);           // 신경망의 잡음 예측
  const loss = mean(pred.map((p, i) => (p - eps[i]) ** 2));
  backprop(loss);
}`}</Code>

      <h2>되돌리려면 무엇을 알아야 하나</h2>
      <p>
        거꾸로 가는 데 필요한 것은 하나입니다. 잡음 섞인 <M>{'x_t'}</M>를 보고 <strong>원래 데이터 <M>{'x_0'}</M>가 무엇이었을지</strong> 추측하는 함수, 곧 <T en="denoiser">디노이저</T>입니다. <M>{'x_t = \\alpha_t x_0 + \\sigma_t \\varepsilon'}</M>이니 <M>{'x_0'}</M>를 추측하는 것과 섞인 잡음 <M>{'\\varepsilon'}</M>을 추측하는 것은 같은 일입니다. 하나를 알면 다른 하나가 나옵니다.
      </p>
      <MB>{'\\hat{x}_0 = \\frac{x_t - \\sigma_t\\, \\hat{\\varepsilon}}{\\alpha_t}, \\qquad \\hat{\\varepsilon} = \\frac{x_t - \\alpha_t\\, \\hat{x}_0}{\\sigma_t}'}</MB>
      <p>
        실제 확산 모델은 신경망 <M>{'\\varepsilon_\\theta(x_t, t)'}</M>에게 잡음을 맞히게 합니다. 위 코드의 <code>trainStep</code>처럼 훈련 데이터에 무작위 시점의 잡음을 섞고, 신경망이 예측한 잡음과 실제로 섞은 잡음의 제곱 오차를 줄입니다. DDPM 논문이 쓴 간단한 손실이 바로 이것입니다.
      </p>
      <MB note="제곱 오차를 최소로 하는 예측은 조건부 기댓값입니다. 그래서 완벽히 학습된 신경망은 E[ε | x_t], 곧 E[x₀ | x_t]를 내놓습니다.">{'L_{\\text{simple}} = \\mathbb{E}_{x_0,\\, t,\\, \\varepsilon}\\Big[\\big\\lVert \\varepsilon - \\varepsilon_\\theta(\\alpha_t x_0 + \\sigma_t \\varepsilon,\\ t) \\big\\rVert^2\\Big]'}</MB>
      <p>
        이 장의 그림은 신경망을 학습시키는 대신 한 가지 요령을 씁니다. 데이터 분포를 작은 정규분포 여러 개를 섞은 <T en="Gaussian mixture">정규분포 혼합</T>으로 정해 두면, 완벽한 신경망이 내놓을 답 <M>{'\\mathbb{E}[x_0 \\mid x_t]'}</M>을 식으로 정확히 계산할 수 있습니다. 성분 <M>{'k'}</M>의 평균을 <M>{'\\mu_k'}</M>, 표준편차를 <M>{'s'}</M>라고 하면, <M>{'x_t'}</M>는 평균 <M>{'\\alpha_t\\mu_k'}</M>, 분산 <M>{'v_t = \\alpha_t^2 s^2 + \\sigma_t^2'}</M>인 정규분포들의 혼합이 되고, <a href="#ai-basics/probability">베이즈 정리</a>로 각 성분에서 왔을 확률을 구해 평균을 냅니다.
      </p>
      <MB note="w_k는 x_t가 성분 k에서 왔을 확률(사후 확률)이고, 괄호 안은 그 성분 안에서의 최선의 추측입니다.">
        {'\\mathbb{E}[x_0 \\mid x_t] = \\sum_k w_k \\Big(\\mu_k + \\frac{\\alpha_t s^2}{v_t}\\,(x_t - \\alpha_t \\mu_k)\\Big), \\qquad w_k \\propto \\exp\\!\\Big(-\\frac{\\lVert x_t - \\alpha_t \\mu_k \\rVert^2}{2 v_t}\\Big)'}
      </MB>
      <p>
        식을 보면 디노이저의 성격이 드러납니다. 잡음이 크면(<M>{'\\sigma_t'}</M>가 1에 가까우면) 모든 성분의 확률이 비슷해서 추측이 데이터 전체의 평균 근처로 갑니다. 무엇이었는지 알 수 없으니 평균을 고르는 것이 제곱 오차를 가장 줄이는 선택입니다. 잡음이 작아지면 가까운 성분 하나에 확률이 몰리면서 추측이 또렷해집니다.
      </p>

      <h2>역방향 샘플링: 한 걸음씩 되돌리기</h2>
      <p>
        이제 순수한 잡음 <M>{'x_1 \\sim \\mathcal{N}(0, I)'}</M>에서 출발해 t를 조금씩 줄여 갑니다. 한 걸음은 이렇습니다. 지금의 <M>{'x_t'}</M>로 <M>{'\\hat{x}_0'}</M>와 <M>{'\\hat{\\varepsilon}'}</M>을 추측하고, 그 둘로 조금 덜 시끄러운 시점 <M>{'s < t'}</M>의 상태를 다시 만듭니다. 이렇게 하는 <T en="DDIM">DDIM</T>(Song 등, 2020년 arXiv 공개, ICLR 2021)은 무작위성이 전혀 없어서 같은 잡음에서 출발하면 언제나 같은 결과가 나옵니다.
      </p>
      <MB note="DDIM 한 걸음: 추측한 x̂₀를 시점 s의 비율로 다시 섞습니다.">{'x_s = \\alpha_s\\, \\hat{x}_0 + \\sigma_s\\, \\hat{\\varepsilon}'}</MB>
      <p>
        DDPM의 샘플러는 같은 자리에서 <M>{'x_0 = \\hat{x}_0'}</M>라고 칠 때 <M>{'x_s'}</M>가 따르는 정규분포에서 무작위로 뽑습니다. 평균은 비슷하지만 매 걸음 새 잡음이 조금씩 들어가 경로가 지그재그가 됩니다.
      </p>
      <ReverseFigure />
      <p>
        단계 수를 2로 두고 "나선"을 보세요. 첫걸음에서 디노이저가 볼 수 있는 것은 잡음뿐이라 × 표시가 모두 데이터의 한가운데에 모입니다. 두 걸음 만에 끝내면 그 흐릿한 추측에서 크게 벗어나지 못해, 점들이 나선의 팔 사이에 떨어지고 일부 구간에만 몰립니다. 이 그림의 처음 설정(코사인, 새 잡음을 누르기 전)에서 DDIM 2단계는 성분까지 평균 거리가 0.126이고 성분의 50%에만 닿습니다. 실제 데이터에서 뽑은 점이라면 0.055에 100%입니다. 20단계면 0.061에 100%로 실제 데이터와 거의 구별되지 않습니다. × 표시가 단계마다 조금씩 또렷해지며 나선 위로 옮겨 가는 것도 볼 수 있습니다.
      </p>
      <p>
        스케줄을 선형 β로 바꾸면 같은 20단계로도 결과가 나빠집니다(평균 거리 0.102). 선형 β는 t의 앞쪽 절반에서 이미 신호를 거의 다 지우므로, t를 같은 간격으로 나누면 걸음의 절반 이상을 아무 정보도 없는 구간에서 허비하기 때문입니다. 이 장난감 문제에서는 DDIM과 DDPM의 품질 차이가 크지 않지만, DDIM 논문은 실제 이미지에서 단계를 크게 줄였을 때 결정적인 DDIM이 DDPM식 샘플링보다 품질이 좋다고 보고했습니다. 단계 수는 곧 생성 시간이므로, 적은 단계로 좋은 결과를 내는 샘플러를 찾는 것이 확산 모델 연구의 큰 줄기입니다.
      </p>
      <Code label="DDIM 한 걸음: 디노이저만 있으면 된다">{`
// denoise(x, a, s): x_t를 보고 x0를 추측한다 (실제로는 신경망, 여기서는 정확한 식)
function ddimSample(x, steps) {           // x: 표준 정규분포에서 뽑은 시작점
  for (let j = 0; j < steps; j++) {
    const [a, s] = alphaSigma(1 - j / steps);        // 지금 시점 t
    const [a2, s2] = alphaSigma(1 - (j + 1) / steps); // 다음 시점 (덜 시끄러움)
    const x0 = denoise(x, a, s);
    const eps = x.map((v, i) => (v - a * x0[i]) / s);  // 섞여 있던 잡음의 추측
    x = x0.map((v, i) => a2 * v + s2 * eps[i]);       // 다음 시점의 비율로 다시 섞는다
  }
  return x;                                // 마지막 시점은 t = 0, 곧 x = x0
}`}</Code>
      <Callout kind="note">
        이 그림의 디노이저는 "정답 분포"를 알고 계산한 것이라 새 점을 끝없이 만들어 냅니다. 그런데 정답 분포 대신 훈련 데이터 몇 장만 놓고 같은 식을 정확히 계산하면, 샘플링은 훈련 데이터를 그대로 복제하는 것으로 끝납니다. 실제 신경망이 새 이미지를 그려 내는 것은 훈련 데이터를 완벽히 외우지 못하고 그 사이를 매끄럽게 메우기 때문이기도 합니다.
      </Callout>

      <h2>원하는 것을 그리게 하기: 가이던스</h2>
      <p>
        "바닷가의 강아지"처럼 원하는 것을 그리게 하려면 디노이저에 조건 <M>{'c'}</M>를 함께 줍니다. 신경망은 <M>{'\\hat{x}_0(x_t, t, c)'}</M>를 배우고, 학습 데이터에는 이미지와 그 설명이 짝지어 들어갑니다. 그런데 조건만 주어서는 결과가 조건을 충분히 따르지 않는 경우가 많습니다. Ho와 Salimans가 제안한 <T en="classifier-free guidance">분류기 없는 가이던스</T>는 간단한 요령으로 이를 해결합니다. 학습할 때 일정 확률로 조건을 빈칸으로 바꿔서 한 신경망이 조건부 추측과 무조건 추측을 모두 하게 만들고, 샘플링할 때 둘의 차이를 <M>{'w'}</M>배로 키웁니다.
      </p>
      <MB note="w = 0이면 조건을 무시하고, w = 1이면 평범한 조건부 모델이며, w > 1이면 조건 쪽으로 더 밀어붙입니다. 잡음 예측에 적용해도 결과는 같습니다.">{'\\hat{x}_0^{\\,w} = \\hat{x}_0(x_t) + w\\,\\big(\\hat{x}_0(x_t, c) - \\hat{x}_0(x_t)\\big)'}</MB>
      <p>
        조건 <M>{'c'}</M>가 있을 때의 정확한 디노이저도 식으로 구할 수 있습니다. 위 식의 합에서 그 클래스의 성분만 남기면 됩니다. 그림 3은 두 고리가 겹친 분포에서 이것을 해 봅니다.
      </p>
      <GuidanceFigure />
      <p>
        <M>{'w = 0'}</M>이면 조건이 없으니 샘플의 절반쯤만 고른 클래스에 속합니다. <M>{'w = 1'}</M>이면 일치율이 실제 그 클래스 데이터와 같은 수준(93~95%)이 됩니다. 실제 데이터도 두 고리가 만나는 곳에서는 다른 클래스로 판정될 수 있으니 100%가 아닙니다. <M>{'w = 3'}</M>이면 일치율이 거의 100%가 되지만 샘플이 겹치는 부분을 피해 고리의 바깥쪽으로 몰리고, <M>{'w = 7'}</M>에서는 고리의 일부에만 모여 성분 커버리지가 절반 아래로 떨어지고 퍼짐도 실제 데이터의 절반쯤으로 줄어듭니다. 조건에 대한 확신을 얻는 대신 다양성을 잃는 것입니다.
      </p>
      <p>
        잡음 예측으로 보면 가이던스는 각 시점의 분포 <M>{'p_t(x \\mid c)^w\\, p_t(x)^{1-w}'}</M>의 기울기를 따라가는 것과 같습니다. 이것은 <M>{'p_t(x)\\, p_t(c \\mid x)^w'}</M>에 비례하므로, 큰 <M>{'w'}</M>는 "분류기가 c라고 확신하는 곳"에 무게를 몰아 줍니다. 텍스트로 그림을 그리는 실제 모델은 보통 1보다 꽤 큰 <M>{'w'}</M>를 씁니다. 널리 쓰이는 Stable Diffusion 도구의 기본값은 7.5입니다. 설명을 잘 따르는 대신 그림이 조금 과장되고 비슷비슷해지는 것을 감수하는 선택입니다.
      </p>
      <Code label="분류기 없는 가이던스: 두 추측을 섞기">{`
// 한 신경망이 조건이 있을 때와 없을 때(null)를 모두 예측한다
function guidedDenoise(x, a, s, cond, w) {
  const u = denoise(x, a, s, null);   // 조건 없는 추측
  const c = denoise(x, a, s, cond);   // 조건부 추측
  return u.map((v, i) => v + w * (c[i] - v));
}
// 학습할 때는 일정 확률(예: 10%)로 cond를 null로 바꿔, 두 역할을 함께 배우게 한다`}</Code>

      <h2>실제 이미지 생성 모델로</h2>
      <p>
        실제 모델도 원리는 이 장과 같습니다. 다른 점은 규모와 디노이저입니다. 2차원 점 대신 수만~수백만 차원의 이미지(또는 그 잠재 표현)를 다루고, 정확한 식 대신 U-Net이나 트랜스포머 같은 큰 신경망이 수억 장의 이미지로 <M>{'\\mathbb{E}[x_0 \\mid x_t]'}</M>를 근사하도록 학습합니다.
      </p>
      <ul>
        <li>
          <strong>잠재 확산.</strong> 픽셀 공간에서 바로 확산을 돌리면 계산이 너무 많아서, 먼저 <a href="#ai-deep-learning/autoencoder-vae">오토인코더</a>로 이미지를 작은 잠재 표현으로 압축하고 그 안에서 확산 모델을 돌립니다. 다 만든 잠재 표현은 디코더가 이미지로 되돌립니다. Rombach 등(2022)의 <T en="latent diffusion">잠재 확산 모델</T>이고, Stable Diffusion이 이 방식입니다.
        </li>
        <li>
          <strong>텍스트 조건.</strong> 문장을 텍스트 인코더로 벡터의 나열로 바꾸고, 디노이저 안에서 이미지의 각 위치가 그 벡터들을 <a href="#ai-basics/attention">어텐션</a>으로 참고합니다(교차 어텐션). 이 조건과 무조건 추측을 위의 가이던스로 섞습니다.
        </li>
        <li>
          <strong>적은 단계.</strong> 1000단계를 다 밟지 않고 DDIM 같은 샘플러로 수십 단계만 쓰는 것이 보통이고, 더 적은 단계로 줄이는 증류 기법도 활발히 연구됩니다.
        </li>
      </ul>

      <Callout kind="key">
        확산 모델은 데이터에 잡음을 섞는 정방향 과정 <M>{'x_t = \\alpha_t x_0 + \\sigma_t\\varepsilon'}</M>을 정해 두고, 신경망이 섞인 잡음(곧 <M>{'\\mathbb{E}[x_0 \\mid x_t]'}</M>)을 맞히도록 제곱 오차로 학습합니다. 생성은 순수한 잡음에서 출발해 디노이저의 추측으로 조금씩 덜 시끄러운 상태를 다시 만드는 것을 되풀이합니다. 잡음이 클 때의 추측은 흐릿한 평균이라 단계가 너무 적으면 결과도 흐릿해집니다. 분류기 없는 가이던스는 조건부와 무조건 추측의 차이를 w배로 키워 조건을 더 잘 따르게 하는 대신 다양성을 줄입니다.
      </Callout>
      <Quiz
        q="그림 2에서 단계를 2개만 쓰면 점들이 나선의 팔 사이에 떨어지는 가장 직접적인 이유는?"
        options={['디노이저의 식이 틀렸기 때문', '잡음이 클 때 디노이저의 최선의 추측은 가능한 x₀들의 평균이라 흐릿한데, 그것을 고칠 걸음이 부족하기 때문', 'DDIM은 무작위성이 없어서 다양한 점을 만들 수 없기 때문', '코사인 스케줄은 t = 1에서 신호를 완전히 지우지 못하기 때문']}
        answer={1}
        explain={<>디노이저는 제곱 오차를 가장 줄이는 추측, 곧 조건부 기댓값을 내놓습니다. 잡음이 클 때는 여러 성분이 모두 그럴듯하므로 그 평균, 곧 나선의 팔 사이 어딘가를 가리킵니다. 걸음이 많으면 잡음이 조금 줄 때마다 추측을 고쳐 가며 한 성분을 골라 들어가지만, 두 걸음으로는 그 평균 근처에서 크게 벗어나지 못합니다. 디노이저 자체는 정확하고, DDIM도 시작 잡음이 다르면 다른 점을 만듭니다.</>}
      />
    </>
  );
}

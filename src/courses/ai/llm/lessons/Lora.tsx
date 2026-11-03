import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { alpha, parseColor, usePalette, type Palette } from '../../../../lib/theme';
import { bytesStr, countParams, korNum, type TfConfig } from '../../deep/lessons/sequence';
import {
  LR_M,
  LR_N,
  TL_FT_STEPS,
  TL_NEW_N,
  TL_PRE_STEPS,
  TL_ROT,
  TlFinetune,
  TlPretrain,
  loraParamCount,
  makeDeltaW,
  memPlan,
  rankApprox,
  relErrFromS,
  svdJacobi,
  tlSets,
  type FtMethod,
  type LoraTarget,
  type TlData,
} from './adapt';
import './adapt.css';

/** Start once when the figure first scrolls into view (unless the reader prefers reduced motion). */
function useAutoStart(ref: RefObject<HTMLElement>, start: () => void) {
  const done = useRef(false);
  const cb = useRef(start);
  cb.current = start;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !done.current) {
          done.current = true;
          cb.current();
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/* ─────────────── Figure 1: transfer learning ─────────────── */

type FtView = 'head' | 'full' | 'lora';
const FT_NAMES: Record<FtView, string> = { head: '마지막 층만', full: '전체', lora: 'LoRA' };
const MAP_G = 44;
const OLD_SHOWN = 160; // old-task test points drawn on the map

// the data and the pretrained base are shared by every mount of the figure
let SETS: ReturnType<typeof tlSets> | null = null;
let PRE: TlPretrain | null = null;
const getSets = () => (SETS ??= tlSets());
const getPre = () => (PRE ??= new TlPretrain(getSets().preTrain));

function drawProbMap(ctx: CanvasRenderingContext2D, P: Palette, w: number, h: number, grid: Float64Array | null, data: TlData, nPts: number, angle: number, title: string, note?: string) {
  const top = 22;
  const size = Math.min(w - 8, h - top - 6);
  const x0 = (w - size) / 2;
  const y0 = top;
  ctx.fillStyle = P.ink2;
  ctx.font = `600 12px ${P.fontBody}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, w / 2, 15);
  if (grid) {
    const base = parseColor(P.surface);
    const pos = parseColor(P.pos);
    const neg = parseColor(P.neg);
    const img = ctx.createImageData(MAP_G, MAP_G);
    for (let k = 0; k < MAP_G * MAP_G; k++) {
      const p = grid[k];
      const c = p >= 0.5 ? pos : neg;
      const a = Math.min(1, Math.abs(p - 0.5) * 2) * 0.5;
      img.data[4 * k] = base[0] + (c[0] - base[0]) * a;
      img.data[4 * k + 1] = base[1] + (c[1] - base[1]) * a;
      img.data[4 * k + 2] = base[2] + (c[2] - base[2]) * a;
      img.data[4 * k + 3] = 255;
    }
    const off = document.createElement('canvas');
    off.width = MAP_G;
    off.height = MAP_G;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, x0, y0, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = P.surface2;
    ctx.fillRect(x0, y0, size, size);
  }
  // true boundaries: two perpendicular lines through the origin
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.strokeStyle = alpha(P.ink, 0.55);
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  for (const a of [angle, angle + Math.PI / 2]) {
    const dx = Math.cos(a) * size;
    const dy = -Math.sin(a) * size;
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
  }
  ctx.restore();
  const rad = size > 220 ? 3.2 : 2.6;
  for (let i = 0; i < Math.min(nPts, data.n); i++) {
    const px = x0 + ((data.X[2 * i] + 1) / 2) * size;
    const py = y0 + ((1 - data.X[2 * i + 1]) / 2) * size;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = data.Y[i] ? P.pos : P.neg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = P.surface;
    ctx.stroke();
  }
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
  if (note) {
    ctx.font = `600 12px ${P.fontBody}`;
    const tw = ctx.measureText(note).width + 14;
    ctx.fillStyle = alpha(P.surface, 0.92);
    ctx.fillRect(cx - tw / 2, cy - 12, tw, 24);
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(note, cx, cy);
  }
}

function TransferFigure() {
  const P = usePalette();
  const sets = getSets();
  const pre = getPre();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<FtView>('lora');
  const [rank, setRank] = useState(2);
  const [off, setOff] = useState(false);
  const [run, setRun] = useState(0);
  const [, setTick] = useState(0);
  useAutoStart(figRef, () => setRunning(true));

  const preDone = pre.done;
  const base = useMemo(() => (preDone ? { head: new TlFinetune(pre.net, 'head', sets.newTrain), full: new TlFinetune(pre.net, 'full', sets.newTrain) } : null), [preDone, run, pre, sets]);
  const lora = useMemo(() => (preDone ? new TlFinetune(pre.net, 'lora', sets.newTrain, rank) : null), [preDone, run, rank, pre, sets]);
  const runs: Record<FtView, TlFinetune> | null = base && lora ? { head: base.head, full: base.full, lora } : null;
  const ftDone = !!runs && runs.head.done && runs.full.done && runs.lora.done;

  useAnimationFrame(() => {
    const t0 = performance.now();
    if (!pre.done) {
      while (!pre.done && performance.now() - t0 < 7) pre.run(4);
    } else if (runs) {
      while (!(runs.head.done && runs.full.done && runs.lora.done) && performance.now() - t0 < 7) {
        runs.head.run(4);
        runs.full.run(4);
        runs.lora.run(4);
      }
      if (runs.head.done && runs.full.done && runs.lora.done) setRunning(false);
    }
    setTick((k) => k + 1);
  }, running && inView && !ftDone);

  // accuracies and maps are refreshed every few dozen steps, not every frame
  const preKey = Math.floor(pre.step / 100);
  const ftStep = runs ? Math.min(runs.head.step, runs.full.step, runs.lora.step) : 0;
  const ftKey = Math.floor(ftStep / 40); // maps: 10 refreshes over the run
  const statKey = Math.floor(ftStep / 100); // accuracies on 1,200 test points: 4 refreshes
  const stats = useMemo(() => {
    if (!runs) return null;
    const out = {} as Record<FtView, { newAcc: number; oldAcc: number; oldOff: number; params: number }>;
    for (const k of ['head', 'full', 'lora'] as FtView[]) {
      const n = runs[k].net;
      out[k] = { newAcc: n.accuracy(sets.newTest, 1), oldAcc: n.accuracy(sets.preTest, 0), oldOff: k === 'lora' ? n.accuracy(sets.preTest, 0, false) : NaN, params: n.trainableCount(k) };
    }
    return out;
  }, [runs?.head, runs?.full, runs?.lora, statKey, sets]); // eslint-disable-line react-hooks/exhaustive-deps
  const preAcc = useMemo(() => pre.net.accuracy(sets.preTest, 0), [preKey, preDone, pre, sets]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalParams = useMemo(() => pre.net.trainableCount('full'), [pre]);

  const shown = runs ? runs[view].net : null;
  const useAd = !(view === 'lora' && off);
  const grids = useMemo(
    () => ({
      newMap: shown ? shown.probGrid(MAP_G, 1) : null,
      oldMap: shown ? shown.probGrid(MAP_G, 0, useAd) : pre.net.probGrid(MAP_G, 0),
    }),
    [shown, useAd, ftKey, preKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rot = (TL_ROT * Math.PI) / 180;
  const newCv = useCanvas2D(
    (ctx, { w, h }) => drawProbMap(ctx, P, w, h, grids.newMap, sets.newTrain, TL_NEW_N, rot, `새 작업 · 새 출력 층`, preDone ? undefined : '사전 학습이 끝나면 시작'),
    [P, grids, preDone],
    { aspect: 1, maxHeight: 300, minHeight: 210 },
  );
  const oldCv = useCanvas2D(
    (ctx, { w, h }) => drawProbMap(ctx, P, w, h, grids.oldMap, sets.preTest, OLD_SHOWN, 0, `옛 작업 · 옛 출력 층${view === 'lora' && off ? ' (어댑터 뗌)' : ''}`),
    [P, grids, view, off],
    { aspect: 1, maxHeight: 300, minHeight: 210 },
  );

  const phase = !preDone ? `사전 학습 ${pre.step.toLocaleString('ko-KR')} / ${TL_PRE_STEPS.toLocaleString('ko-KR')}단계` : `파인튜닝 ${ftStep} / ${TL_FT_STEPS}단계`;
  const st = stats?.[view];

  return (
    <Figure
      no={1}
      title="전이 학습: 무엇을 얼마나 고칠까"
      hint="방법을 바꿔 보고, LoRA에서는 어댑터를 떼어 보세요"
      caption={
        <>
          입력 2개, 폭 24인 tanh 은닉층 3개짜리 신경망을 먼저 옛 작업(같은 부호인 사분면이 주황)의 점 600개로 {TL_PRE_STEPS.toLocaleString('ko-KR')}단계 사전 학습합니다(Adam, 미니배치 64). 새 작업은 경계를 {TL_ROT}° 돌린 같은 모양이고 학습용 점은 {TL_NEW_N}개뿐입니다. 사전 학습된 모델을 복사해 새 출력 층을 붙이고, 세 방법으로 똑같이 {TL_FT_STEPS}단계 학습합니다. LoRA는 24×24 은닉층 두 개에만 붙입니다. 정확도는 학습에 쓰지 않은 점 600개로 재고, 옛 작업은 옛 출력 층을 그대로 둔 채 바뀐 몸통에 연결해 잽니다. 점선은 진짜 경계입니다. 시드가 고정되어 있어 다시 돌려도 같은 결과가 나옵니다.
        </>
      }
    >
      <div ref={figRef} className="ad-col">
        <div className="ad-bar">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={ftDone}>
              {running ? '일시정지' : ftDone ? '학습 끝' : '학습 시작'}
            </Button>
            <Button
              onClick={() => {
                setRun((k) => k + 1);
                setRunning(true);
              }}
              disabled={!preDone}
            >
              파인튜닝 다시
            </Button>
          </div>
          <span className="ad-phase mono" aria-live="polite">
            {phase}
          </span>
        </div>
        <div className="controls row">
          <Seg label="보기" value={view} onChange={setView} options={(['head', 'full', 'lora'] as FtView[]).map((k) => ({ value: k, label: FT_NAMES[k] }))} />
          <Seg
            label="LoRA 랭크 r"
            value={rank}
            onChange={(v) => {
              setRank(v);
              if (preDone) setRunning(true);
            }}
            options={[1, 2, 4, 8].map((r) => ({ value: r, label: String(r) }))} />
          <div className="ctl ad-check">
            <Check
              label="LoRA 어댑터 떼기"
              checked={off}
              onChange={(v) => {
                setOff(v);
                if (v) setView('lora');
              }}
            />
          </div>
        </div>
        <div className="fig-cols">
          <div ref={newCv.wrapRef} className="canvas-box" role="img" aria-label={`${FT_NAMES[view]} 방법으로 학습한 새 작업의 결정 경계${st ? `, 정확도 ${pct(st.newAcc)}` : ''}`}>
            <canvas ref={newCv.canvasRef} />
          </div>
          <div ref={oldCv.wrapRef} className="canvas-box" role="img" aria-label={`같은 모델의 옛 작업 결정 경계${st ? `, 정확도 ${pct(view === 'lora' && off ? st.oldOff : st.oldAcc)}` : `, 사전 학습 정확도 ${pct(preAcc)}`}`}>
            <canvas ref={oldCv.canvasRef} />
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl ad-tbl">
            <thead>
              <tr>
                <th>방법</th>
                <th>학습한 파라미터</th>
                <th>새 작업</th>
                <th>옛 작업</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>사전 학습만</td>
                <td className="mono">—</td>
                <td className="mono">—</td>
                <td className="mono">{pct(preAcc)}</td>
              </tr>
              {(['head', 'full', 'lora'] as FtView[]).map((k) => {
                const s = stats?.[k];
                return (
                  <tr key={k} data-on={k === view || undefined}>
                    <td>{k === 'lora' ? `LoRA r = ${rank}` : FT_NAMES[k]}</td>
                    <td className="mono">{s ? `${s.params.toLocaleString('ko-KR')} (${((s.params / totalParams) * 100).toFixed(1)}%)` : '—'}</td>
                    <td className="mono">{s ? pct(s.newAcc) : '—'}</td>
                    <td className="mono">
                      {s ? pct(s.oldAcc) : '—'}
                      {s && k === 'lora' && <span className="ad-sub">
                          <span className="ad-dot"> · </span>떼면 {pct(s.oldOff)}
                        </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '레이블 1', shape: 'dot' },
          { color: 'var(--neg)', label: '레이블 0', shape: 'dot' },
          { color: 'var(--ink-3)', label: '진짜 경계 (점선)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: low-rank approximation ─────────────── */

function drawMatrix(ctx: CanvasRenderingContext2D, P: Palette, M: Float64Array, x: number, y: number, size: number, scale: number, label: string) {
  const c = size / LR_N;
  ctx.fillStyle = P.surface;
  ctx.fillRect(x, y, size, size);
  for (let i = 0; i < LR_M; i++)
    for (let j = 0; j < LR_N; j++) {
      const v = M[i * LR_N + j] / scale;
      ctx.fillStyle = alpha(v >= 0 ? P.pos : P.neg, Math.min(1, Math.abs(v)) * 0.95);
      ctx.fillRect(x + j * c, y + i * c, Math.ceil(c), Math.ceil(c));
    }
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.fillStyle = P.ink2;
  ctx.font = `600 12px ${P.fontBody}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + size / 2, y - 6);
}

function LowRankFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<'lowrank' | 'random'>('lowrank');
  const [noise, setNoise] = useState(0.05);
  const [r, setR] = useState(4);
  const D = useMemo(() => makeDeltaW(kind, noise), [kind, noise]);
  const svd = useMemo(() => svdJacobi(D, LR_M, LR_N), [D]);
  const approx = useMemo(() => rankApprox(svd, r), [svd, r]);
  const resid = useMemo(() => approx.map((v, i) => D[i] - v), [approx, D]);
  const err = relErrFromS(svd.S, r);
  const scale = useMemo(() => {
    // colour saturates at 2 × the root-mean-square entry
    let s = 0;
    for (let i = 0; i < D.length; i++) s += D[i] * D[i];
    return 2 * Math.sqrt(s / D.length);
  }, [D]);

  const mats = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = w < 420 ? 10 : 18;
      const size = Math.min((w - 2 * gap) / 3, h - 24);
      const x0 = (w - 3 * size - 2 * gap) / 2;
      drawMatrix(ctx, P, D, x0, 20, size, scale, 'ΔW');
      drawMatrix(ctx, P, approx, x0 + size + gap, 20, size, scale, `랭크 ${r} 근사`);
      drawMatrix(ctx, P, resid, x0 + 2 * (size + gap), 20, size, scale, '남은 차이');
    },
    [P, D, approx, resid, r, scale],
    { aspect: 3, maxHeight: 230, minHeight: 130 },
  );

  const bars = useCanvas2D(
    (ctx, { w, h }) => {
      const l = 34;
      const b = 22;
      const t = 10;
      const pw = w - l - 8;
      const ph = h - t - b;
      const sMax = Math.ceil(svd.S[0]);
      ctx.strokeStyle = P.grid;
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const step = sMax > 6 ? 2 : 1;
      for (let v = 0; v <= sMax; v += step) {
        const y = t + ph - (v / sMax) * ph;
        ctx.beginPath();
        ctx.moveTo(l, Math.round(y) + 0.5);
        ctx.lineTo(l + pw, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.fillText(String(v), l - 6, y);
      }
      const bw = pw / LR_N;
      for (let k = 0; k < LR_N; k++) {
        const bh = (svd.S[k] / sMax) * ph;
        ctx.fillStyle = k < r ? P.accent : alpha(P.ink3, 0.55);
        ctx.fillRect(l + k * bw + 1, t + ph - bh, Math.max(1, bw - 2), bh);
      }
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const k of [1, 8, 16, 24, 32]) ctx.fillText(String(k), l + (k - 0.5) * bw, t + ph + 5);
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('특잇값 σₖ (큰 순서)', l + pw, t + 2);
    },
    [P, svd, r],
    { aspect: 2.6, maxHeight: 210, minHeight: 150 },
  );

  return (
    <Figure
      no={2}
      title="저랭크 업데이트"
      hint="랭크 r을 움직여 보세요"
      caption={
        <>
          32×32 행렬 ΔW를 만들어 특잇값 분해(야코비 방법)로 가장 좋은 랭크 r 근사를 구합니다. "저랭크 + 잡음"은 서로 다른 방향 네 개의 바깥곱(세기 8, 5, 3, 2)에 칸마다 독립인 잡음을 더한 것이고, "무작위"는 모든 칸이 독립인 잡음뿐입니다. 상대 오차는 ‖ΔW − ΔWᵣ‖ / ‖ΔW‖(프로베니우스 노름)입니다. 색은 세 행렬에 같은 눈금을 씁니다(주황 +, 파랑 −). 강조한 막대가 근사에 쓰는 특잇값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="ad-col">
          <div ref={mats.wrapRef} className="canvas-box" role="img" aria-label={`ΔW, 랭크 ${r} 근사, 남은 차이의 색 지도. 상대 오차 ${pct(err)}`}>
            <canvas ref={mats.canvasRef} />
          </div>
          <div ref={bars.wrapRef} className="canvas-box" role="img" aria-label={`특잇값 막대: 가장 큰 값 ${svd.S[0].toFixed(2)}, ${r}개를 사용`}>
            <canvas ref={bars.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg
            label="ΔW의 종류"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'lowrank', label: '저랭크 + 잡음' },
              { value: 'random', label: '무작위' },
            ]}
          />
          {kind === 'lowrank' && <Slider id="lr-noise" label="잡음 크기 (표준편차)" value={noise} min={0} max={0.2} step={0.01} onChange={setNoise} format={(v) => v.toFixed(2)} />}
          <Slider id="lr-rank" label="랭크 r" value={r} min={0} max={32} step={1} onChange={setR} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="상대 오차" value={pct(err)} color="var(--accent)" />
            <Readout label="설명한 제곱 합" value={pct(1 - err * err)} />
            <Readout label="BA로 저장할 수" value={`${(r * (LR_M + LR_N)).toLocaleString('ko-KR')}개`} />
            <Readout label="ΔW 전체" value={`${(LR_M * LR_N).toLocaleString('ko-KR')}개`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: parameter and memory calculator ─────────────── */

interface MemPreset {
  id: string;
  label: string;
  cfg: TfConfig;
}
const gptCfg = (d: number, layers: number, ctx: number, vocab = 50257): TfConfig => ({ d, layers, heads: Math.max(1, Math.round(d / 64)), dff: 4 * d, vocab, ctx, learnedPos: true, tied: true });
const MEM_PRESETS: MemPreset[] = [
  { id: 'toy', label: '장난감', cfg: gptCfg(128, 4, 256, 1000) },
  { id: 'gpt2', label: 'GPT-2 small', cfg: gptCfg(768, 12, 1024) },
  { id: 'mid', label: 'd 4096·32층', cfg: gptCfg(4096, 32, 2048) },
  { id: 'gpt3', label: 'GPT-3', cfg: gptCfg(12288, 96, 2048) },
];
const TARGETS: { value: LoraTarget; label: string }[] = [
  { value: 'qv', label: 'q, v' },
  { value: 'attn', label: '어텐션 전체' },
  { value: 'attnMlp', label: '어텐션 + MLP' },
];
const METHODS: { id: FtMethod; name: string }[] = [
  { id: 'full', name: '전체 파인튜닝' },
  { id: 'lora', name: 'LoRA' },
  { id: 'qlora', name: 'QLoRA' },
];

function MemoryFigure() {
  const [cfg, setCfg] = useState<TfConfig>(MEM_PRESETS[2].cfg);
  const [target, setTarget] = useState<LoraTarget>('qv');
  const [logR, setLogR] = useState(3);
  const r = 2 ** logR;
  const preset = MEM_PRESETS.find((p) => p.cfg.d === cfg.d && p.cfg.layers === cfg.layers && p.cfg.vocab === cfg.vocab);
  const total = countParams(cfg).total;
  const ad = loraParamCount(cfg.d, cfg.dff, cfg.layers, target, r);
  const plans = METHODS.map((m) => ({ ...m, plan: memPlan(m.id, total, ad) }));
  const maxB = plans[0].plan.total;

  return (
    <Figure
      no={3}
      title="파라미터와 메모리 계산기"
      hint="모델 크기, LoRA를 붙일 행렬, 랭크를 바꿔 보세요"
      caption={
        <>
          GPT-2와 같은 구조(d_ff = 4·d_model, 어휘 50,257, 출력 층은 임베딩과 공유)로 전체 파라미터를 셉니다. LoRA는 층마다 고른 d_in×d_out 행렬에 r·(d_in + d_out)개를 더합니다. 메모리는 혼합 정밀도 Adam 기준으로, 학습하는 파라미터 하나에 16바이트(16비트 가중치 2 + 16비트 기울기 2 + fp32 마스터 가중치 4 + fp32 Adam 상태 두 개 8)를, 얼려 둔 가중치에는 2바이트(QLoRA는 4비트, 0.5바이트)를 잡습니다. 활성값, 양자화 상수, 프레임워크의 여분 메모리는 뺐으므로 실제로 필요한 양은 이보다 큽니다.
        </>
      }
    >
      <div className="ad-tight">
        <Seg
          value={preset?.id ?? 'custom'}
          onChange={(id) => {
            const p = MEM_PRESETS.find((x) => x.id === id);
            if (p) setCfg(p.cfg);
          }}
          options={MEM_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </div>
      <div className="fig-split">
        <div className="ad-col">
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <Readout label="전체 파라미터" value={korNum(total)} />
            <Readout label="LoRA 학습 파라미터" value={korNum(ad)} color="var(--accent)" />
            <Readout label="전체 대비" value={`${(ad / total) * 100 < 0.01 ? ((ad / total) * 100).toFixed(4) : ((ad / total) * 100).toFixed(3)}%`} />
            <Readout label="줄어든 배수" value={`${Math.round(total / ad).toLocaleString('ko-KR')}배`} />
          </div>
          <div className="ad-mem" role="img" aria-label={plans.map((p) => `${p.name} ${bytesStr(p.plan.total)}`).join(', ')}>
            {plans.map((p) => (
              <div key={p.id} className="ad-mem-row">
                <span className="ad-mem-name">{p.name}</span>
                <span className="ad-mem-track">
                  <span className="ad-mem-seg" style={{ width: `${(p.plan.weights / maxB) * 100}%`, background: 'var(--ink-3)' }} />
                  <span className="ad-mem-seg" style={{ width: `${(p.plan.grads / maxB) * 100}%`, background: 'var(--accent)' }} />
                  <span className="ad-mem-seg" style={{ width: `${(p.plan.optim / maxB) * 100}%`, background: 'var(--pos)' }} />
                </span>
                <span className="ad-mem-val mono">{bytesStr(p.plan.total)}</span>
              </div>
            ))}
          </div>
          <Legend
            items={[
              { color: 'var(--ink-3)', label: '가중치', shape: 'sq' },
              { color: 'var(--accent)', label: '기울기', shape: 'sq' },
              { color: 'var(--pos)', label: '옵티마이저 상태 + fp32 사본', shape: 'sq' },
            ]}
          />
        </div>
        <div className="controls">
          <Slider id="mem-d" label="d_model" value={cfg.d} min={128} max={12288} step={128} onChange={(d) => setCfg((c) => gptCfg(d, c.layers, c.ctx, c.vocab))} />
          <Slider id="mem-l" label="층 수" value={cfg.layers} min={1} max={96} step={1} onChange={(layers) => setCfg((c) => gptCfg(c.d, layers, c.ctx, c.vocab))} />
          <Seg label="LoRA를 붙일 행렬" value={target} onChange={setTarget} options={TARGETS} />
          <Slider id="mem-r" label="랭크 r" value={logR} min={0} max={7} step={1} onChange={setLogR} format={(v) => String(2 ** v)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Lora() {
  return (
    <>
      <h2>처음부터 학습하지 않는 이유</h2>
      <p>
        <a href="#ai-basics/language-model">언어 모델 장</a>에서 본 사전 학습은 수조 개의 토큰과 엄청난 계산을 씁니다. 회사 내부 문서에 맞는 말투, 특정 형식의 출력, 새로운 분류 작업이 필요할 때마다 이것을 다시 할 수는 없습니다. 대신 이미 학습된 모델을 출발점으로 삼아 내 데이터로 조금 더 학습합니다. 이것이 <T en="transfer learning">전이 학습</T>이고, 사전 학습된 모델을 새 작업의 데이터로 이어서 학습하는 일을 <T en="fine-tuning">파인튜닝</T>이라고 합니다.
      </p>
      <p>
        전이 학습이 통하는 이유는 깊은 신경망의 아래쪽 층이 배우는 특징이 여러 작업에 두루 쓰이기 때문입니다. 이미지 모델의 앞쪽 층은 모서리와 질감을, 언어 모델의 층들은 문법과 단어의 뜻과 사실 관계를 담습니다. 새 작업은 이 특징들을 조금 다르게 조합하면 되는 경우가 많습니다. 그러면 무엇을 얼마나 고칠지가 실무의 첫 번째 결정이 됩니다.
      </p>
      <ul>
        <li>
          <strong>마지막 층만 학습</strong>: 몸통을 얼리고 새 출력 층만 학습합니다. 가장 싸고 원래 모델을 전혀 건드리지 않지만, 특징 자체를 바꿀 수 없으니 새 작업이 많이 다르면 한계가 있습니다.
        </li>
        <li>
          <strong>전체 파인튜닝</strong>: 모든 가중치를 학습합니다. 가장 유연하지만 모델 크기만큼의 기울기와 옵티마이저 상태가 필요하고, 작업마다 모델 전체를 따로 저장해야 합니다.
        </li>
        <li>
          <strong>LoRA</strong>: 원래 가중치는 얼리고, 가중치에 더할 변화량을 작은 행렬 두 개의 곱으로 학습합니다. 이 장의 주인공입니다.
        </li>
      </ul>
      <p>
        전체 파인튜닝에는 대가가 하나 더 있습니다. 새 작업에 맞춰 가중치를 옮기다 보면 원래 잘하던 일을 잊어버립니다. 이것을 <T en="catastrophic forgetting">파국적 망각</T>이라고 합니다. 그림 1에서 세 방법을 같은 조건으로 비교해 봅시다.
      </p>
      <TransferFigure />
      <p>
        사전 학습을 마친 모델은 옛 작업의 시험 점 600개 중 99.7%를 맞힙니다. 경계를 30° 돌린 새 작업에서 마지막 층만 학습하면 75.7%에 그칩니다. 몸통이 만든 특징이 "x축과 y축의 부호"에 맞춰져 있어서, 그것을 다시 섞기만 해서는 돌아간 경계를 그릴 수 없기 때문입니다. 대신 몸통을 건드리지 않았으니 옛 작업은 99.7% 그대로입니다.
      </p>
      <p>
        전체 파인튜닝은 새 작업에서 95.0%까지 올라가지만, 같은 몸통에 옛 출력 층을 다시 연결하면 옛 작업 정확도가 77.7%로 떨어집니다. 그림의 옛 작업 지도에서 경계가 함께 돌아가 버린 것이 보입니다. LoRA(r = 2)는 전체 파라미터 1,297개 중 217개(16.7%)만 학습하고 새 작업에서 94.7%를 냅니다. 어댑터를 붙인 상태에서는 옛 작업도 76.7%로 전체 파인튜닝만큼 잊지만, <strong>원래 가중치는 한 숫자도 바뀌지 않았으므로</strong> 어댑터를 떼면 99.7%로 돌아옵니다. 작업마다 작은 어댑터만 따로 저장해 두고 필요할 때 갈아 끼울 수 있다는 뜻입니다. 이 장난감은 입력이 2차원이라 처음부터 학습해도 금방 풀리지만, 실제 언어 모델에서는 사전 학습이 담고 있는 지식을 처음부터 다시 얻을 방법이 없다는 점이 전이 학습의 가장 큰 이유입니다.
      </p>

      <h2>LoRA: 바뀌는 양을 작은 두 행렬로</h2>
      <p>
        <T en="Low-Rank Adaptation">LoRA</T>(Hu 외, 2021)의 출발점은 파인튜닝이 가중치를 바꾸는 양 <M>{'\\Delta W'}</M>에 관한 가설입니다. 사전 학습된 모델을 새 작업에 맞출 때 필요한 변화는 행렬 전체를 자유롭게 바꿀 만큼 복잡하지 않고, 몇 개의 방향만으로 대부분 설명된다는 것입니다. 행렬의 말로 하면 <M>{'\\Delta W'}</M>의 <T en="rank">랭크</T>가 낮다는 뜻입니다. 그렇다면 d×k 행렬 <M>{'\\Delta W'}</M>를 통째로 학습하는 대신 두 개의 가는 행렬의 곱으로 나타내면 됩니다.
      </p>
      <MB note="W는 얼려 둔 사전 학습 가중치(d×k), B는 d×r, A는 r×k이고 r은 d, k보다 훨씬 작습니다. α는 크기를 맞추는 상수입니다.">{"h = W x + \\frac{\\alpha}{r} B A\\, x, \\qquad W' = W + \\frac{\\alpha}{r} B A"}</MB>
      <p>
        학습하는 파라미터는 d·k개에서 r·(d + k)개로 줄어듭니다. d = k = 4,096이고 r = 8이면 1,677만 개가 6만 5,536개, 256분의 1이 됩니다. 초기화에도 의도가 있습니다. <M>{'A'}</M>는 작은 무작위 값으로, <M>{'B'}</M>는 <strong>0으로</strong> 시작하므로 처음에는 <M>{'BA = 0'}</M>이고 모델은 사전 학습된 모델과 정확히 같은 출력을 냅니다. 학습은 원래 모델에서 출발해 조금씩 벗어납니다. <M>{'\\alpha / r'}</M> 배율은 r을 바꿔도 같은 학습률이 비슷한 크기의 업데이트를 만들도록 맞춰 주는 장치입니다.
      </p>
      <p>
        랭크가 낮다는 것이 무슨 뜻인지 그림 2에서 확인해 봅시다. 어떤 행렬이든 <T en="singular value decomposition, SVD">특잇값 분해</T>로 "방향 쌍 × 세기"의 합 <M>{'\\Delta W = \\sum_k \\sigma_k u_k v_k^{\\top}'}</M>로 쓸 수 있고, 세기 <M>{'\\sigma_k'}</M>가 큰 것부터 r개만 남긴 것이 제곱 오차로 가장 좋은 랭크 r 근사입니다(에카르트–영 정리).
      </p>
      <LowRankFigure />
      <p>
        "저랭크 + 잡음"에서는 특잇값 네 개가 우뚝 서 있고 나머지는 잡음 수준으로 낮습니다. 잡음 0.05에서 r = 4만 남겨도 상대 오차가 14.0%이고, 그 뒤로는 r을 8로 늘려도 10.3%로 조금씩만 줄어듭니다. 남은 것은 잡음뿐이기 때문입니다. 이때 BA로 저장하는 수는 256개로 원래 1,024개의 4분의 1입니다. 반면 "무작위"는 특잇값이 고르게 퍼져 있어 r = 4에서 오차가 78.1%, r = 16에서도 32.2%입니다. 아무 행렬이나 압축되는 것이 아닙니다. LoRA가 통한다는 것은 실제 파인튜닝에서 필요한 변화가 첫 번째 경우에 가깝다는 관찰이고, Hu 외는 GPT-3 같은 큰 모델에서도 아주 작은 r로 전체 파인튜닝에 견줄 만한 성능을 보고했습니다.
      </p>
      <Code label="LoRA 선형 층과 병합">{`
// 얼려 둔 W (d×k)에 학습하는 A (r×k), B (d×r)를 더한 선형 층
function loraLinear(W, A, B, alpha, x) {
  const r = A.length, s = alpha / r;
  const Ax = A.map((row) => dot(row, x));       // r개: 먼저 좁은 쪽으로 투영
  return W.map((row, i) =>
    dot(row, x) + s * dot(B[i], Ax));           // Wx + (α/r)·B(Ax)
}

// 초기화: A는 작은 무작위 값, B는 0 → 처음엔 원래 모델과 똑같다
const A = randn(r, k, 1 / Math.sqrt(k));
const B = zeros(d, r);

// 서비스할 때는 BA를 W에 더해 두면 추가 계산이 0이다
function merge(W, A, B, alpha) {
  const s = alpha / A.length;
  return W.map((row, i) =>
    row.map((w, j) => w + s * B[i].reduce((acc, b, t) => acc + b * A[t][j], 0)));
}
// 다른 작업으로 바꿀 때는 W' − (α/r)·BA로 되돌리거나 원본 W를 다시 쓴다`}</Code>
      <p>
        <M>{'B(Ax)'}</M> 순서로 계산하면 d×k 행렬을 만들지 않고도 r·(d + k)번의 곱셈만 더 하면 됩니다. 학습이 끝나면 <M>{'W + \\frac{\\alpha}{r}BA'}</M>를 한 번 계산해 원래 가중치 자리에 넣으면 되므로, 병합한 모델은 원래 모델과 모양도 속도도 똑같습니다. 그림 1의 신경망으로 병합 전후의 출력을 비교해 보면 차이가 <M>{'10^{-16}'}</M> 수준, 즉 부동소수점 반올림 오차뿐입니다. 반대로 병합하지 않고 두면 어댑터를 요청마다 바꿔 끼우며 원래 모델 하나로 여러 작업을 서비스할 수 있습니다.
      </p>

      <h2>얼마나 아끼나: 파라미터와 메모리</h2>
      <p>
        <a href="#ai-deep-learning/transformer">트랜스포머 장</a>에서 셌듯이 블록 하나에는 어텐션의 <M>{'W_Q, W_K, W_V, W_O'}</M>(각 d×d)와 MLP의 두 행렬(d×d_ff, d_ff×d)이 있습니다. LoRA를 어느 행렬에 붙일지가 다음 결정입니다. 원래 논문은 주로 <M>{'W_Q'}</M>와 <M>{'W_V'}</M>에 붙였고, 이후에는 어텐션과 MLP의 모든 선형 층에 붙이는 설정도 흔히 씁니다.
      </p>
      <p>
        학습할 때 메모리를 차지하는 것은 가중치만이 아닙니다. 학습하는 파라미터마다 기울기가 있고, <a href="#ai-deep-learning/regularization">AdamW</a>는 파라미터마다 이동 평균 두 개(m, v)를 들고 있습니다. 16비트로 계산하는 혼합 정밀도 학습에서는 보통 fp32 사본까지 둡니다. 그래서 전체 파인튜닝은 파라미터 하나에 약 16바이트가 듭니다. LoRA에서는 얼려 둔 가중치에 기울기와 옵티마이저 상태가 필요 없으므로, 큰 몫이 가중치 자체(파라미터당 2바이트)만 남습니다.
      </p>
      <MemoryFigure />
      <p>
        d = 4,096, 32층 구성(약 66.6억 개)으로 계산해 보면 전체 파인튜닝은 가중치, 기울기, 옵티마이저 상태만으로 99.2GiB가 필요합니다. q, v에 r = 8인 LoRA를 붙이면 학습 파라미터가 419만 개(0.063%)로 줄고 메모리는 12.5GiB, 그중 대부분이 얼려 둔 가중치입니다. GPT-3 구성(약 1,746억 개)에서는 같은 설정의 학습 파라미터가 3,775만 개로 전체의 0.022%입니다. Hu 외는 GPT-3 175B에서 학습 파라미터를 1만 분의 1로, GPU 메모리 요구량을 3분의 1로 줄였다고 보고했습니다. 그림 3의 셈은 활성값을 빼고 옵티마이저 상태를 fp32로 잡았기 때문에 메모리 차이가 이보다 크게 나옵니다.
      </p>
      <p>
        LoRA에서 남은 가장 큰 몫이 얼려 둔 가중치라면, 그것을 더 작게 저장하면 됩니다. <T en="QLoRA">QLoRA</T>(Dettmers 외, 2023)는 기본 모델을 4비트(NF4라는 4비트 형식)로 양자화해 얼려 두고, 계산할 때만 16비트로 풀어서 그 위에 LoRA 어댑터를 학습합니다. 기울기는 4비트 가중치를 거쳐 어댑터로만 흐릅니다. 가중치 몫이 파라미터당 0.5바이트로 줄어, d = 4,096·32층 구성은 3.2GiB가 됩니다. 논문은 이 방법으로 650억 파라미터 모델을 48GB GPU 한 장에서 파인튜닝할 수 있다고 보고했습니다. 650억 개 × 0.5바이트는 32.5GB(30.3GiB)이니 활성값과 어댑터가 들어갈 자리가 남습니다. 양자화가 무엇이고 오차가 얼마나 생기는지는 <a href="#ai-llm/inference">추론 최적화</a>에서 다룹니다.
      </p>
      <Callout kind="note" label="실무에서 고르는 것">
        <strong>랭크 r</strong>은 보통 한 자릿수에서 수십 사이에서 고르고, 데이터가 많고 작업이 원래 모델과 많이 다를수록 키웁니다. <strong>붙일 행렬</strong>은 많을수록 표현력이 늘고 파라미터도 늘어납니다. <strong>α</strong>는 r과 함께 업데이트 크기를 정하므로, r을 바꿀 때 학습률을 다시 찾지 않도록 α/r을 고정하는 경우가 많습니다. 어느 것이든 그림 3에서 보듯 전체 모델에 비하면 작은 숫자라서, 메모리를 정하는 것은 거의 기본 모델을 몇 비트로 들고 있느냐입니다.
      </Callout>

      <Callout kind="key">
        전이 학습은 사전 학습된 특징을 재사용합니다. 마지막 층만 학습하면 싸고 안전하지만 특징을 바꾸지 못하고, 전체 파인튜닝은 유연하지만 비싸고 원래 능력을 잊게 합니다. LoRA는 <M>{"W' = W + \\frac{\\alpha}{r}BA"}</M>로 변화량을 랭크 r로 제한해 학습 파라미터를 d·k에서 r(d + k)로 줄이고, B = 0에서 시작해 원래 모델에서 출발하며, 학습 후 W에 병합하면 추론 비용이 늘지 않습니다. 원래 가중치가 그대로 있으니 어댑터를 떼거나 바꿔 끼울 수 있습니다. 메모리는 학습하는 파라미터당 약 16바이트, 얼린 파라미터당 2바이트(QLoRA는 0.5바이트)로 어림합니다.
      </Callout>
      <Quiz
        q="LoRA에서 B를 0으로, A를 작은 무작위 값으로 초기화하는 이유로 가장 알맞은 것은?"
        options={['A와 B를 모두 0으로 두면 계산이 더 빠르기 때문에', '학습을 시작할 때 BA = 0이라 모델이 사전 학습된 모델과 똑같이 동작하고, 그러면서도 기울기가 흐를 수 있기 때문에', 'B를 0으로 두면 학습이 끝난 뒤에도 BA의 랭크가 0으로 유지되기 때문에', '0으로 둔 행렬은 옵티마이저 상태가 필요 없기 때문에']}
        answer={1}
        explain={
          <>
            B = 0이면 BA = 0이라 시작점이 정확히 사전 학습된 모델입니다. 둘 다 0이면 B에 대한 기울기(Ax에 비례)도 A에 대한 기울기(Bᵀ에 비례)도 0이라 아무것도 학습되지 않습니다. A를 무작위로 두면 첫 단계부터 B가 움직이고, 그 뒤로 A도 함께 학습됩니다. B는 학습하면서 0에서 벗어나므로 BA의 랭크는 r까지 올라갈 수 있습니다.
          </>
        }
      />
    </>
  );
}

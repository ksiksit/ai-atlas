import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { sci } from '../../deep/lessons/sequence';
import {
  BtFit,
  DpoFit,
  HACK_PAIRS,
  HACK_SEED,
  KlAscent,
  LEN100,
  PI_REF,
  PROMPT,
  RESPONSES,
  TRUE_Q,
  btNewton,
  centered,
  expect,
  kl,
  klObjective,
  klOptimum,
  pairsInOrder,
  rmse,
  samplePairs,
  tradeoffCurve,
} from './adapt';
import './adapt.css';

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

/** Render `code` spans inside a response text. */
function withCode(text: string): ReactNode {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>));
}

const TAGS = RESPONSES.map((r) => r.tag);
const TRUE_C = centered(TRUE_Q);

/* ─────────────── Figure 1: pairwise comparisons → rewards ─────────────── */

const N_OPTS = [10, 20, 50, 100, 200, 500, 1000, 2000];
const BT_LAMBDA = 1 / 9; // Gaussian prior with standard deviation 3 on each reward
const BT_STEPS = 300;
const R_LIM = 3.2;
const toPct = (v: number) => ((Math.max(-R_LIM, Math.min(R_LIM, v)) + R_LIM) / (2 * R_LIM)) * 100;

function PreferenceFigure() {
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [ni, setNi] = useState(2);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  useAutoStart(figRef, () => setRunning(true));
  const N = N_OPTS[ni];
  const pairs = useMemo(() => samplePairs(N, seed), [N, seed]);
  const fit = useMemo(() => new BtFit(pairs, BT_LAMBDA), [pairs, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = fit.step >= BT_STEPS;

  useAnimationFrame(() => {
    fit.run(3);
    if (fit.step >= BT_STEPS) setRunning(false);
    setTick((k) => k + 1);
  }, running && inView && !done);

  const learned = centered(fit.r);
  const restart = (f: () => void) => {
    f();
    setRunning(true);
  };
  const wins = TAGS.map((_, i) => pairs.filter((p) => p.w === i).length);
  const games = TAGS.map((_, i) => pairs.filter((p) => p.w === i || p.l === i).length);

  return (
    <Figure
      no={1}
      title="쌍대 비교에서 보상으로"
      hint="비교 수를 늘리거나 다른 표본을 뽑아 보세요"
      caption={
        <>
          여섯 답변에 숨은 "참 품질"(세로 눈금)을 정해 두고, 가상의 평가자가 무작위로 고른 두 답변 중 a를 확률 σ(품질 a − 품질 b)로 고르게 했습니다. 막대는 이 비교들만 보고 경사 하강법(학습률 2, {BT_STEPS}단계)으로 맞춘 브래들리–테리 보상입니다. 보상은 상수를 더해도 확률이 같으므로 두 값 모두 평균을 0으로 맞춰 그렸고, 비교가 적을 때 값이 무한히 커지지 않도록 표준편차 3인 정규 사전 분포에 해당하는 L2 규제를 넣었습니다.
        </>
      }
    >
      <div ref={figRef} className="fig-split">
        <div className="ad-col">
          <p className="ad-prompt">
            <strong>질문</strong> {PROMPT}
          </p>
          <div className="ad-resp" role="img" aria-label={`학습한 보상: ${TAGS.map((t, i) => `${t} ${fmt(learned[i])} (참 ${fmt(TRUE_C[i])})`).join(', ')}`}>
            {RESPONSES.map((r, i) => (
              <div key={r.id} className="ad-resp-row">
                <span className="ad-resp-tag">{r.tag}</span>
                <span className="ad-rbar">
                  <span className="zero" />
                  <span className="fill" style={{ left: `${Math.min(50, toPct(learned[i]))}%`, width: `${Math.abs(toPct(learned[i]) - 50)}%`, background: learned[i] >= 0 ? 'var(--pos)' : 'var(--neg)' }} />
                  <span className="truth" style={{ left: `${toPct(TRUE_C[i])}%` }} />
                </span>
                <span className="ad-resp-text">
                  {withCode(r.text)}{' '}
                  <span className="mono">
                    · {wins[i]}승 {games[i] - wins[i]}패
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="ad-pairs">
            처음 비교 몇 개: {pairs.slice(0, 5).map((p) => `${TAGS[p.w]} ≻ ${TAGS[p.l]}`).join(' · ')}
          </p>
        </div>
        <div className="controls">
          <Slider id="bt-n" label="비교 수" value={ni} min={0} max={N_OPTS.length - 1} step={1} onChange={(v) => restart(() => setNi(v))} format={(v) => N_OPTS[v].toLocaleString('ko-KR')} />
          <div className="btn-row">
            <Button primary onClick={() => (done ? restart(() => setRun((k) => k + 1)) : setRunning((x) => !x))}>
              {running ? '일시정지' : done ? '다시 학습' : '학습'}
            </Button>
            <Button onClick={() => restart(() => setSeed((s) => s + 1))}>다른 표본</Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="경사 하강 단계" value={`${fit.step}`} />
            <Readout label="손실 (평균)" value={fmt(fit.loss, 3)} />
            <Readout label="순서가 맞은 쌍" value={`${pairsInOrder(learned, TRUE_C)} / 15`} color="var(--accent)" />
            <Readout label="참 품질과의 RMSE" value={fmt(rmse(learned, TRUE_C), 2)} />
          </div>
          <span className="ad-sub">표본 번호 {seed}</span>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '학습한 보상 (+)', shape: 'sq' },
          { color: 'var(--neg)', label: '학습한 보상 (−)', shape: 'sq' },
          { color: 'var(--ink)', label: '숨은 참 품질', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: the KL-regularised optimum ─────────────── */

const GA_STEPS = 3000;

function PolicyRows({ rows, label }: { rows: { tag: ReactNode; bars: { v: number; color: string; thin?: boolean }[]; mark?: number; value: string }[]; label: string }) {
  return (
    <div className="ad-pol" role="img" aria-label={label}>
      {rows.map((r, i) => (
        <div key={i} className="ad-pol-row">
          <span className="ad-pol-tag">{r.tag}</span>
          <span className="ad-pol-track">
            {r.bars.map((b, j) => (
              <span key={j} className="ad-pol-bar" data-thin={b.thin || undefined} style={{ width: `${Math.max(0, Math.min(1, b.v)) * 100}%`, background: b.color }} />
            ))}
            {r.mark !== undefined && <span className="ad-pol-mark" style={{ left: `${r.mark * 100}%` }} />}
          </span>
          <span className="ad-pol-val mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function KlFigure() {
  const P = usePalette();
  const [lb, setLb] = useState(0);
  const beta = Math.pow(10, lb);
  const pi = useMemo(() => klOptimum(PI_REF, TRUE_Q, beta), [beta]);
  const curve = useMemo(() => tradeoffCurve(PI_REF, TRUE_Q, [], 0.05, 50, 160), []);
  const [ga, setGa] = useState<KlAscent | null>(null);
  const [, setTick] = useState(0);
  const gaRunning = !!ga && ga.step < GA_STEPS;
  useEffect(() => setGa(null), [beta]);
  useAnimationFrame(() => {
    if (!ga) return;
    ga.run(30);
    setTick((k) => k + 1);
  }, gaRunning);

  const er = expect(pi, TRUE_Q);
  const d = kl(pi, PI_REF);
  const gaPi = ga ? ga.pi : null;
  const gaErr = gaPi ? Math.max(...gaPi.map((p, i) => Math.abs(p - pi[i]))) : NaN;

  const cv = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1.75, yMin: 0, yMax: 2.4, pad: { l: 38, r: 12, t: 12, b: 30 } });
      p.grid({ xStep: 0.5, yStep: 0.5, xLabel: 'KL(π ‖ π_ref)', yLabel: '기대 보상 E[r]' });
      ctx.save();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      curve.forEach((c, i) => (i ? ctx.lineTo(p.X(c.kl), p.Y(c.reward)) : ctx.moveTo(p.X(c.kl), p.Y(c.reward))));
      ctx.stroke();
      ctx.restore();
      p.line(0, 2, 1.75, 2, alpha(P.ink3, 0.8), 1, [4, 4]);
      p.text('최고 답변만 (β → 0)', 0.04, 2, P.ink3, { align: 'left', dy: -10, font: `11px ${P.fontBody}`, bg: P.surface });
      p.dot(0, expect(PI_REF, TRUE_Q), 4, P.ink3);
      p.text('π_ref', 0, expect(PI_REF, TRUE_Q), P.ink2, { dx: 8, dy: 10, font: `11px ${P.fontMono}`, bg: P.surface });
      p.dot(d, er, 6, P.accent, P.surface, 2);
      const nearRight = p.X(d) > w - 90;
      p.text(`β = ${fmt(beta, 2)}`, d, er, P.ink, { dx: nearRight ? -10 : 10, dy: 14, align: nearRight ? 'right' : 'left', font: `600 12px ${P.fontMono}`, bg: P.surface });
      if (gaPi) p.dot(kl(gaPi, PI_REF), expect(gaPi, TRUE_Q), 3.5, P.ink);
    },
    [P, curve, d, er, beta, gaPi],
    { aspect: 1.5, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={2}
      title="KL로 묶어 둔 최적화"
      hint="β를 움직여 보세요"
      caption={
        <>
          회색 막대는 기준 정책 π_ref(지시 튜닝을 마친 모델이 여섯 답변을 내는 확률이라고 가정한 값), 색 막대는 보상을 그림 1의 참 품질로 둘 때의 최적 정책 π* ∝ π_ref·exp(r/β)입니다. 곡선은 β를 50에서 0.05까지 줄여 가며 π*가 지나는 (KL, 기대 보상) 자리를 이은 것입니다. "경사 상승으로 확인"은 공식을 쓰지 않고 π_ref에서 출발해 목적 함수의 기울기만 따라 {GA_STEPS.toLocaleString('ko-KR')}단계 올라가며, 막대 위의 세로 눈금과 곡선 위의 작은 점이 그 결과입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="ad-col">
          <PolicyRows
            label={`최적 정책 (β = ${fmt(beta, 2)}): ${TAGS.map((t, i) => `${t} ${(pi[i] * 100).toFixed(1)}%`).join(', ')}`}
            rows={RESPONSES.map((r, i) => ({
              tag: r.tag,
              bars: [
                { v: PI_REF[i], color: alpha(P.ink3, 0.6), thin: true },
                { v: pi[i], color: P.accent },
              ],
              mark: gaPi ? gaPi[i] : undefined,
              value: `${(pi[i] * 100).toFixed(1)}%`,
            }))}
          />
          <div ref={cv.wrapRef} className="canvas-box" role="img" aria-label={`β를 바꿀 때의 기대 보상과 KL 곡선. 지금 KL ${fmt(d, 3)}, 기대 보상 ${fmt(er, 3)}`}>
            <canvas ref={cv.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="kl-beta" label="β (KL 벌점의 세기)" value={lb} min={-1.3} max={1.3} step={0.02} onChange={setLb} format={() => fmt(beta, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="기대 보상 E[r]" value={fmt(er, 3)} color="var(--accent)" />
            <Readout label="KL(π* ‖ π_ref)" value={fmt(d, 3)} />
            <Readout label="목적 J = E[r] − β·KL" value={fmt(klObjective(pi, PI_REF, TRUE_Q, beta), 4)} />
            <Readout label="β·log Z" value={fmt(beta * Math.log(PI_REF.reduce((s, p, i) => s + p * Math.exp(TRUE_Q[i] / beta), 0)), 4)} />
          </div>
          <div className="btn-row">
            <Button primary onClick={() => setGa(new KlAscent(PI_REF, TRUE_Q, beta, Math.min(10, 2 / beta)))} disabled={gaRunning}>
              경사 상승으로 확인
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }} aria-live="polite">
            <Readout label="경사 상승 단계" value={ga ? ga.step.toLocaleString('ko-KR') : '—'} />
            <Readout label="최대 |π − π*|" value={ga ? sci(gaErr, 2) : '—'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'color-mix(in srgb, var(--ink-3) 60%, transparent)', label: 'π_ref', shape: 'sq' },
          { color: 'var(--accent)', label: 'π* (닫힌 형태)', shape: 'sq' },
          { color: 'var(--ink)', label: '경사 상승의 결과', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: reward hacking and DPO ─────────────── */

const KAPPAS = [0, 0.5, 1, 1.5, 2];
const DPO_BETAS = [0.25, 0.5, 1, 2];
const DPO_STEPS = 2000;

function HackFigure() {
  const P = usePalette();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [kappa, setKappa] = useState(1.5);
  const [beta, setBeta] = useState(0.5);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  useAutoStart(figRef, () => setRunning(true));

  const pairs = useMemo(() => samplePairs(HACK_PAIRS, HACK_SEED, kappa), [kappa]);
  const rhat = useMemo(() => centered(btNewton(pairs, 0)), [pairs]);
  const curve = useMemo(() => tradeoffCurve(PI_REF, rhat, [TRUE_Q], 0.03, 50, 200), [rhat]);
  const peak = useMemo(() => curve.reduce((b, c) => (c.extra[0] > b.extra[0] ? c : b), curve[0]), [curve]);
  const rl = useMemo(() => klOptimum(PI_REF, rhat, beta), [rhat, beta]);
  const dpo = useMemo(() => new DpoFit(PI_REF, pairs, beta), [pairs, beta, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = dpo.step >= DPO_STEPS;

  useAnimationFrame(() => {
    dpo.run(20);
    if (dpo.step >= DPO_STEPS) setRunning(false);
    setTick((k) => k + 1);
  }, running && inView && !done);

  const dpi = dpo.pi;
  const diff = Math.max(...dpi.map((p, i) => Math.abs(p - rl[i])));
  const yMax = Math.max(3.5, Math.ceil(Math.max(...rhat) + 0.5));

  const cv = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1.7, yMin: -0.5, yMax, pad: { l: 38, r: 12, t: 12, b: 30 } });
      p.grid({ xStep: 0.5, yStep: 1, xLabel: 'KL(π ‖ π_ref)', yLabel: '기댓값' });
      const line = (k: (c: (typeof curve)[number]) => number, color: string) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        curve.forEach((c, i) => (i ? ctx.lineTo(p.X(c.kl), p.Y(k(c))) : ctx.moveTo(p.X(c.kl), p.Y(k(c)))));
        ctx.stroke();
        ctx.restore();
      };
      line((c) => c.reward, P.pos);
      line((c) => c.extra[0], P.good);
      p.dot(peak.kl, peak.extra[0], 4, P.surface, P.good, 2);
      p.text(`참 품질 최고 ${fmt(peak.extra[0], 2)}`, peak.kl, peak.extra[0], P.ink2, { dy: 14, align: 'center', font: `11px ${P.fontBody}`, bg: P.surface });
      const k1 = kl(rl, PI_REF);
      p.line(k1, -0.5, k1, yMax, alpha(P.ink, 0.35), 1, [4, 4]);
      p.dot(k1, expect(rl, rhat), 5.5, P.pos, P.surface, 2);
      p.dot(k1, expect(rl, TRUE_Q), 5.5, P.good, P.surface, 2);
      const nearRight = p.X(k1) > w - 80;
      p.text(`β = ${beta}`, k1, yMax, P.ink, { dx: nearRight ? -6 : 6, dy: 10, align: nearRight ? 'right' : 'left', font: `600 12px ${P.fontMono}`, bg: P.surface });
      p.dot(kl(dpi, PI_REF), expect(dpi, TRUE_Q), 3, P.ink);
      p.dot(kl(dpi, PI_REF), expect(dpi, rhat), 3, P.ink);
    },
    [P, curve, peak, rl, rhat, beta, dpi, yMax],
    { aspect: 1.5, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={3}
      title="보상 해킹과 DPO"
      hint="길이 편향과 β를 바꿔 보세요"
      caption={
        <>
          평가자가 품질 외에 길이도 좋아한다고 가정합니다. 두 답변 중 a를 고를 확률은 σ(품질 차 + κ × 글자 수 차 / 100)입니다. 이렇게 모은 비교 {HACK_PAIRS.toLocaleString('ko-KR')}개로 보상 모델 r̂을 맞추고(뉴턴법), 주황 곡선은 r̂에 대한 KL 최적 정책의 기대 r̂, 초록 곡선은 같은 정책의 참 품질 기댓값입니다. 아래 막대는 π_ref(회색), r̂으로 구한 RLHF 최적 정책(파랑), 같은 비교 데이터로 DPO 손실만 써서 학습한 정책(주황, Adam 학습률 0.05, {DPO_STEPS.toLocaleString('ko-KR')}단계)입니다. 곡선 위의 작은 점은 DPO 정책의 현재 위치입니다. r̂은 평균을 0으로 맞춘 값이고, 참 품질은 그림 1과 같은 값입니다.
        </>
      }
    >
      <div ref={figRef} className="ad-col">
        <div className="controls row">
          <Seg label="길이 편향 κ" value={kappa} onChange={(v) => { setKappa(v); setRunning(true); }} options={KAPPAS.map((k) => ({ value: k, label: String(k) }))} />
          <Seg label="β" value={beta} onChange={(v) => { setBeta(v); setRunning(true); }} options={DPO_BETAS.map((b) => ({ value: b, label: String(b) }))} />
        </div>
        <div className="fig-split">
          <div ref={cv.wrapRef} className="canvas-box" role="img" aria-label={`β를 바꿀 때 보상 모델 점수와 참 품질의 기댓값. 참 품질은 KL ${fmt(peak.kl, 2)}에서 최고 ${fmt(peak.extra[0], 2)}`}>
            <canvas ref={cv.canvasRef} />
          </div>
          <div className="controls">
            <div className="btn-row">
              <Button primary onClick={() => (done ? (setRun((k) => k + 1), setRunning(true)) : setRunning((x) => !x))}>
                {running ? '일시정지' : done ? 'DPO 다시' : 'DPO 학습'}
              </Button>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }} aria-live="polite">
              <Readout label="DPO 단계" value={dpo.step.toLocaleString('ko-KR')} />
              <Readout label="DPO 손실" value={fmt(dpo.loss, 4)} />
              <Readout label="최대 |π_DPO − π_RLHF|" value={diff < 1e-4 ? '< 0.0001' : fmt(diff, 4)} color="var(--accent)" />
              <Readout label="참 품질 E[q] (DPO)" value={fmt(expect(dpi, TRUE_Q), 3)} color="var(--good)" />
            </div>
          </div>
        </div>
        <PolicyRows
          label={`β ${beta}: ${TAGS.map((t, i) => `${t} RLHF ${(rl[i] * 100).toFixed(1)}%, DPO ${(dpi[i] * 100).toFixed(1)}%`).join(', ')}`}
          rows={RESPONSES.map((r, i) => ({
            tag: (
              <>
                {r.tag}
                <span className="ad-pol-sub mono">
                  r̂ {fmt(rhat[i], 1)} · 참 {fmt(TRUE_Q[i], 1)}
                </span>
              </>
            ),
            bars: [
              { v: PI_REF[i], color: alpha(P.ink3, 0.6), thin: true },
              { v: rl[i], color: P.accent },
              { v: dpi[i], color: P.pos },
            ],
            value: `${(dpi[i] * 100).toFixed(1)}%`,
          }))}
        />
        <p className="ad-note">
          글자 수: {RESPONSES.map((r, i) => `${r.tag} ${Math.round(LEN100[i] * 100)}`).join(' · ')}
        </p>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '보상 모델 점수 E[r̂]', shape: 'ln' },
          { color: 'var(--good)', label: '참 품질 E[q]', shape: 'ln' },
          { color: 'var(--accent)', label: 'RLHF 최적 정책', shape: 'sq' },
          { color: 'var(--pos)', label: 'DPO 정책', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Alignment() {
  return (
    <>
      <h2>정답 대신 선호</h2>
      <p>
        <a href="#ai-basics/language-model">언어 모델 장</a>에서 사전 학습만 마친 모델은 글을 이어 쓸 줄은 알지만 비서처럼 행동하지는 않는다고 했습니다. 질문 뒤에 그럴듯한 다음 질문을 이어 쓰거나, 인터넷에 흔한 무례한 말투를 흉내 내기도 합니다. 그래서 두 단계를 더 거칩니다. 하나는 <T en="supervised fine-tuning, SFT">지시 튜닝</T>입니다. 사람이 쓴 "질문과 좋은 답변" 예시로 <a href="#ai-llm/lora">앞 장의 파인튜닝</a>을 하는 것으로, 손실은 사전 학습과 같은 다음 토큰 크로스엔트로피입니다.
      </p>
      <p>
        그런데 "좋은 답"은 정답 하나로 적기가 어렵습니다. 정확하면서 친절하고, 너무 길지도 짧지도 않고, 해로운 부탁은 거절하는 답을 사람이 매번 직접 쓰기는 비쌉니다. 반면 두 답변을 보여 주고 <strong>어느 쪽이 나은지 고르는 것</strong>은 훨씬 쉽고 빠릅니다. 이 선호 데이터로 모델을 다듬는 것이 두 번째 단계입니다. InstructGPT(Ouyang 외, 2022)는 이 과정을 세 단계로 정리했습니다.
      </p>
      <ol>
        <li>
          <strong>지시 튜닝(SFT)</strong>: 사람이 쓴 시범 답변으로 파인튜닝합니다. 결과를 기준 정책 <M>{'\\pi_{\\text{ref}}'}</M>라고 부릅니다.
        </li>
        <li>
          <strong>보상 모델</strong>: 같은 질문에 대한 여러 답변을 사람이 비교한 데이터로, 답변에 점수 <M>{'r(x, y)'}</M>를 매기는 모델을 학습합니다.
        </li>
        <li>
          <strong>강화 학습</strong>: 보상 모델의 점수가 높아지도록 정책을 고치되, <M>{'\\pi_{\\text{ref}}'}</M>에서 너무 멀어지지 않게 KL 벌점을 겁니다. InstructGPT는 PPO라는 강화 학습 알고리즘을 썼습니다.
        </li>
      </ol>
      <p>
        논문에서 평가자들은 13억 파라미터의 InstructGPT 답변을 1,750억 파라미터 GPT-3의 답변보다 더 선호했습니다. 모델 크기보다 무엇을 목표로 학습했느냐가 사용자가 느끼는 품질을 더 크게 바꿀 수 있다는 뜻입니다. 2단계와 3단계를 합쳐 <T en="reinforcement learning from human feedback">RLHF</T>라고 하고, 2023년에 나온 <T en="Direct Preference Optimization">DPO</T>(Rafailov 외)는 2·3단계를 손실 함수 하나로 합칩니다. 이 장에서는 질문 하나와 답변 여섯 개라는 아주 작은 세계에서 이 과정을 끝까지 계산해 봅니다. 실제로는 답변이 토큰 수열이라 경우의 수가 천문학적이지만, 식은 그대로입니다.
      </p>

      <h2>쌍대 비교에서 보상으로</h2>
      <p>
        비교 데이터에서 점수를 끌어내는 고전적인 모형이 <T en="Bradley–Terry model">브래들리–테리 모형</T>입니다. 답변마다 보이지 않는 점수 <M>{'r'}</M>가 있고, 두 답변 중 a가 선택될 확률은 점수 차의 시그모이드라고 가정합니다. 체스의 Elo 점수와 같은 생각입니다.
      </p>
      <MB note="y_w는 선택된(이긴) 답변, y_l은 선택되지 않은(진) 답변입니다. 점수에 같은 상수를 더해도 확률은 변하지 않습니다.">{'P(a \\succ b) = \\sigma(r_a - r_b), \\qquad \\mathcal{L}(r) = -\\frac{1}{N}\\sum_{(y_w,\\,y_l)} \\log \\sigma\\big(r(y_w) - r(y_l)\\big)'}</MB>
      <p>
        손실은 "실제로 고른 쪽을 고를 확률"의 음의 로그 가능도이고, <a href="#ai-basics/logistic-regression">로지스틱 회귀</a>와 같은 모양입니다. 실제 보상 모델은 언어 모델의 마지막 층을 점수 하나를 내는 층으로 바꾼 신경망이고 질문과 답변을 함께 입력받지만, 손실은 이것과 똑같습니다. 그림 1에서는 답변이 여섯 개뿐이라 답변마다 점수 하나씩, 파라미터 여섯 개를 학습합니다.
      </p>
      <PreferenceFigure />
      <p>
        비교 50개(표본 1)로 학습하면 15개의 답변 쌍 중 13개의 순서를 맞히고, 참 품질과의 차이(RMSE)는 0.56입니다. 표본을 50번 바꿔 가며 평균을 내 보면, 비교 20개에서는 RMSE 0.91에 순서가 맞는 쌍이 평균 12.7개, 100개에서는 0.47과 14.3개, 1,000개에서는 0.13과 15개 전부입니다. 평가자가 일관되지 않아도(품질 차가 1이면 27%는 반대로 고릅니다) 비교가 쌓이면 숨은 점수가 드러납니다. "다른 표본"을 눌러 보면 비교가 적을 때는 표본마다 순서가 뒤바뀌는 것도 볼 수 있습니다.
      </p>
      <Code label="브래들리–테리 손실과 경사 하강">{`
// pairs: [{ w, l }, ...]  (w가 선택된 답변의 번호)
function btLossAndGrad(r, pairs) {
  let loss = 0;
  const g = new Array(r.length).fill(0);
  for (const { w, l } of pairs) {
    const p = sigmoid(r[w] - r[l]);        // 모델이 본 "w가 이길 확률"
    loss -= Math.log(p);
    g[w] -= 1 - p;                         // 이긴 쪽 점수는 올리고
    g[l] += 1 - p;                         // 진 쪽 점수는 내린다
  }
  return { loss: loss / pairs.length, grad: g.map((v) => v / pairs.length) };
}

for (let step = 0; step < 300; step++) {
  const { grad } = btLossAndGrad(r, pairs);
  r = r.map((v, i) => v - lr * grad[i]);
}`}</Code>

      <h2>원래 모델에서 너무 멀어지지 않게</h2>
      <p>
        보상 모델이 생겼으니 그 점수가 가장 높은 답만 내도록 정책을 바꾸면 될까요? 두 가지 문제가 있습니다. 첫째, 보상 모델은 사람의 판단을 유한한 데이터로 흉내 낸 것이라 학습 데이터에서 멀리 떨어진 답에서는 틀린 점수를 줍니다. 둘째, 한 답으로 몰리면 지시 튜닝 모델이 가진 다양성과 언어 능력이 무너집니다. 그래서 RLHF는 보상을 높이되 기준 정책과의 <a href="#ai-basics/entropy">KL 발산</a>을 벌점으로 뺀 목적 함수를 최대화합니다.
      </p>
      <MB note="β가 크면 π_ref 가까이 머물고, β가 작으면 보상을 더 쫓습니다.">{'\\max_{\\pi}\\; J(\\pi) = \\mathbb{E}_{y\\sim\\pi}\\big[r(y)\\big] - \\beta\\, \\mathrm{KL}\\big(\\pi \\,\\|\\, \\pi_{\\text{ref}}\\big)'}</MB>
      <p>
        이 문제에는 닫힌 형태의 답이 있습니다. <M>{'Z = \\sum_y \\pi_{\\text{ref}}(y)\\, e^{r(y)/\\beta}'}</M>로 두고 정리하면 <M>{'J(\\pi) = \\beta \\log Z - \\beta\\,\\mathrm{KL}(\\pi \\,\\|\\, \\pi^*)'}</M>가 되는데, KL은 0 이상이고 <M>{'\\pi = \\pi^*'}</M>일 때만 0이므로 최적 정책은 다음과 같습니다.
      </p>
      <MB note="기준 정책의 확률에 보상의 지수를 곱해 다시 정규화한 것입니다. 기준 정책이 0을 준 답은 끝까지 0입니다.">{'\\pi^*(y) = \\frac{1}{Z}\\, \\pi_{\\text{ref}}(y)\\, \\exp\\!\\big(r(y)/\\beta\\big)'}</MB>
      <KlFigure />
      <p>
        β = 1이면 최적 정책은 정확·친절 57.3%, 짧음 26.4%, 장황 12.8%로 좋은 답 쪽으로 기울지만 다른 답도 남겨 둡니다. 기대 보상은 π_ref의 0.25에서 1.43으로 오르고 그 대가로 KL 0.48을 씁니다. β를 줄이면 곡선을 따라 오른쪽 위로 올라가 결국 최고 답변 하나에 확률 1을 주고, 이때 KL은 <M>{'-\\log \\pi_{\\text{ref}}(\\text{정확·친절}) = -\\log 0.2 \\approx 1.61'}</M>입니다. 표의 J와 β·log Z가 언제나 같은 것이 위 유도의 확인이고, "경사 상승으로 확인"은 공식 없이 기울기만으로 같은 정책에 도달하는 것을 보여 줍니다(β가 작을수록 확률이 아주 작은 답들이 천천히 수렴해 오래 걸립니다).
      </p>
      <p>
        실제 언어 모델에서는 가능한 답변이 너무 많아 Z를 계산할 수 없습니다. 그래서 InstructGPT는 정책에서 답변을 뽑고, 보상 모델로 점수를 매기고, 토큰마다 <M>{'\\log \\pi/\\pi_{\\text{ref}}'}</M>에 비례하는 KL 벌점을 빼서 PPO로 정책의 기울기를 근사합니다. 목표는 같고 푸는 방법이 근사일 뿐입니다.
      </p>
      <Code label="KL로 묶어 둔 최적 정책">{`
// π*(y) ∝ π_ref(y) · exp(r(y) / β)  — 로그 공간에서 계산해 넘침을 막는다
function klOptimum(piRef, r, beta) {
  const z = piRef.map((p, i) => Math.log(p) + r[i] / beta);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const Z = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / Z);
}

const objective = (pi, piRef, r, beta) =>
  pi.reduce((s, p, i) => s + p * r[i] - beta * (p > 0 ? p * Math.log(p / piRef[i]) : 0), 0);`}</Code>

      <h2>보상 해킹</h2>
      <p>
        보상 모델은 진짜 목표의 대리일 뿐입니다. 평가자가 긴 답을 무의식적으로 더 좋게 보는 경향이 있으면, 보상 모델도 길이에 점수를 더 주도록 학습됩니다. 정책이 이 대리 점수를 세게 최적화할수록 진짜 품질이 아니라 대리 점수의 허점을 파고듭니다. "측정값이 목표가 되면 좋은 측정값이 아니게 된다"는 <T en="Goodhart's law">굿하트의 법칙</T>이 그대로 일어나는 것이고, 이것을 <T en="reward hacking">보상 해킹</T>이라고 합니다.
      </p>
      <HackFigure />
      <p>
        그림 3에서는 평가자가 글자 수 100자당 κ만큼 점수를 더 준다고 가정했습니다. κ = 1.5에서 맞춘 보상 모델은 "장황"에 가장 높은 점수(평균을 0으로 맞춰 3.11)를 주고, 실제로 가장 좋은 "정확·친절"은 2.28로 두 번째입니다. β를 줄여 가면(곡선의 오른쪽) 보상 모델 점수는 계속 오르지만 참 품질은 KL 0.6 근처에서 0.96으로 최고를 찍은 뒤 떨어져, 장황한 답 하나로 몰리면 0.5까지 내려갑니다. κ = 0이면 두 곡선이 함께 오르기만 합니다. KL 벌점은 이 과최적화를 막는 브레이크이기도 합니다.
      </p>

      <h2>DPO: 보상 모델 없이 바로</h2>
      <p>
        DPO는 닫힌 형태의 답을 거꾸로 읽습니다. <M>{'\\pi^*(y) = \\pi_{\\text{ref}}(y)\\,e^{r(y)/\\beta}/Z'}</M>를 r에 대해 풀면 <M>{'r(y) = \\beta \\log \\frac{\\pi^*(y)}{\\pi_{\\text{ref}}(y)} + \\beta \\log Z'}</M>입니다. 정책이 곧 보상을 정해 주는 셈이고, 이것을 브래들리–테리 손실에 넣으면 두 답변의 차이에서 <M>{'\\beta\\log Z'}</M>가 지워집니다.
      </p>
      <MB note="π_θ는 학습하는 정책, π_ref는 얼려 둔 기준 정책입니다. 보상 모델도, 정책에서 답변을 뽑는 강화 학습 루프도 필요 없습니다.">{'\\mathcal{L}_{\\text{DPO}}(\\theta) = -\\mathbb{E}_{(x,\\,y_w,\\,y_l)}\\Big[\\log \\sigma\\Big(\\beta \\log \\frac{\\pi_\\theta(y_w \\mid x)}{\\pi_{\\text{ref}}(y_w \\mid x)} - \\beta \\log \\frac{\\pi_\\theta(y_l \\mid x)}{\\pi_{\\text{ref}}(y_l \\mid x)}\\Big)\\Big]'}</MB>
      <p>
        이 손실은 보통의 지도 학습처럼 선호 쌍에서 바로 계산하고 경사 하강법으로 줄이면 됩니다. 그림 3에서 같은 비교 3,000개로 DPO를 학습하면, 2,000단계 뒤의 정책이 보상 모델을 따로 맞추고 닫힌 형태로 구한 RLHF 정책과 네 가지 β 모두에서 소수 넷째 자리까지 같습니다. 이 작은 세계에서는 정책이 답변마다 확률을 자유롭게 정할 수 있어서 두 방법의 최적점이 정확히 일치합니다. 그래서 DPO도 보상 해킹에서 자유롭지 않습니다. κ = 1.5, β = 0.5에서 DPO 정책은 장황한 답에 83.8%를 주고 참 품질 기댓값은 0.74로, 참 품질이 가장 높았던 지점(0.96)보다 낮습니다. 데이터에 들어 있는 편향은 어떤 최적화 방법을 써도 그대로 따라옵니다.
      </p>
      <Code label="DPO 손실">{`
// logp, logpRef: 각 답변의 (전체 토큰 로그 확률의 합) — 정책과 기준 정책에서
function dpoLoss(pairs, logp, logpRef, beta) {
  let loss = 0;
  for (const { w, l } of pairs) {
    const margin = beta * ((logp[w] - logpRef[w]) - (logp[l] - logpRef[l]));
    loss -= logSigmoid(margin);           // 브래들리–테리 손실과 같은 모양
  }
  return loss / pairs.length;
}
const logSigmoid = (z) => (z >= 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z)));`}</Code>
      <p>
        실제 언어 모델에서 <M>{'\\log \\pi_\\theta(y \\mid x)'}</M>는 답변의 토큰마다 모델이 준 로그 확률을 더한 값이고, 기준 정책 값은 얼려 둔 SFT 모델로 한 번 계산해 둡니다. 학습 중에 답변을 새로 생성하지 않으므로 구현이 단순하고 안정적이라 널리 쓰입니다. 대신 정책이 만든 새 답변으로 피드백을 받지 않는다는 점이 RLHF와의 차이이고, 어느 쪽이 나은지는 작업과 데이터에 따라 다르다는 것이 현재까지의 대체적인 이해입니다.
      </p>

      <Callout kind="key">
        사람에게 두 답 중 나은 것을 고르게 하고, 브래들리–테리 모형 <M>{'P(a \\succ b) = \\sigma(r_a - r_b)'}</M>로 그 비교를 가장 잘 설명하는 보상을 맞춥니다. RLHF는 이 보상에서 β·KL(π‖π_ref)를 뺀 목적을 최대화하며, 최적 정책은 <M>{'\\pi^* \\propto \\pi_{\\text{ref}}\\, e^{r/\\beta}'}</M>입니다. β는 보상을 쫓는 정도와 원래 모델에 머무는 정도를 맞바꿉니다. DPO는 이 관계를 뒤집어 <M>{'\\beta\\log(\\pi/\\pi_{\\text{ref}})'}</M>를 보상 자리에 넣고 선호 쌍에서 정책을 바로 학습합니다. 어느 방법이든 보상(또는 선호 데이터)에 든 편향을 세게 최적화하면 진짜 품질이 오히려 떨어지는 보상 해킹이 생깁니다.
      </Callout>
      <Quiz
        q="KL로 묶어 둔 목적 E[r] − β·KL(π‖π_ref)에서 β를 아주 크게 하면 최적 정책은 어떻게 되는가?"
        options={['보상이 가장 높은 답변 하나에 확률 1을 준다', '기준 정책 π_ref와 거의 같아진다', '모든 답변에 같은 확률을 준다', '보상이 가장 낮은 답변의 확률이 가장 커진다']}
        answer={1}
        explain={
          <>
            π* ∝ π_ref·exp(r/β)에서 β가 커지면 r/β가 0에 가까워져 지수 항이 모든 답에서 거의 1이 되므로 π*는 π_ref로 돌아갑니다. KL 벌점이 보상보다 훨씬 무거워 원래 모델에서 벗어날 이유가 없는 것입니다. 반대로 β → 0이면 보상이 가장 높은 답 하나로 몰리고, 보상 모델이 틀린 곳이 있으면 보상 해킹이 일어납니다.
          </>
        }
      />
    </>
  );
}

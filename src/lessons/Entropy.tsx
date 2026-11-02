import { useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../components/ui';
import { useCanvas2D, useDrag } from '../lib/canvas';
import { Plot, fmt } from '../lib/plot';
import { alpha, usePalette } from '../lib/theme';
import { softmax } from '../lib/math';

const log2 = (x: number) => Math.log(x) / Math.LN2;

/* ─────────────── Figure 1: surprise −log₂ p ─────────────── */

const EVENTS: { label: string; p: number }[] = [
  { label: '동전 앞면', p: 1 / 2 },
  { label: '주사위 6', p: 1 / 6 },
  { label: '카드 52장 중 스페이드 A', p: 1 / 52 },
  { label: '맑은 날 예보가 맞음', p: 0.9 },
];

function SurpriseFigure() {
  const P = usePalette();
  const [p, setP] = useState(1 / 6);
  const plotRef = useRef<Plot | null>(null);
  const info = -log2(p);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 7.5, pad: { l: 40, r: 14, t: 14, b: 32 } });
      plotRef.current = plot;
      plot.grid({ xStep: 0.1, yStep: 1, xLabel: '확률 p', yLabel: '정보량 (비트)' });
      plot.fillUnder((x) => -log2(x), alpha(P.math, 0.08), 0.004, 1);
      plot.fn((x) => -log2(x), P.math, 2.5, { from: 0.004, to: 1, samples: 400 });
      for (const e of EVENTS) {
        plot.dot(e.p, -log2(e.p), 3.5, P.ink3);
      }
      const y = Math.min(7.5, info);
      plot.line(p, 0, p, y, P.pos, 1.5, [4, 4]);
      plot.line(0, y, p, y, P.pos, 1.5, [4, 4]);
      plot.dot(p, y, 8, P.surface, P.pos, 3);
      const right = p < 0.6;
      plot.text(`p = ${fmt(p, 3)} → ${fmt(info, 2)}비트`, p, y, P.pos, { dx: right ? 14 : -14, dy: -14, align: right ? 'left' : 'right', bg: alpha(P.surface, 0.9) });
    },
    [P, p],
    { aspect: 1.7, maxHeight: 360, minHeight: 230 },
  );

  useDrag(canvasRef, {
    hit: () => 'p',
    onDrag: (_id, x) => {
      const pl = plotRef.current!;
      setP(Math.max(0.006, Math.min(1, pl.invX(x))));
    },
  });

  return (
    <Figure no={1} title="드문 일일수록 놀랍다" hint="그래프 위를 좌우로 끌어 보세요" caption={<>확률이 1이면(반드시 일어나는 일) 정보량은 0비트입니다. 확률이 절반으로 줄 때마다 정보량은 정확히 1비트씩 늘어납니다. 회색 점은 오른쪽 예시 사건들의 위치입니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="확률 p" value={fmt(p, 3)} />
            <Readout label="정보량 −log₂p" value={fmt(info, 2) + ' 비트'} color="var(--pos)" />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>예시 사건</div>
          <div className="btn-row">
            {EVENTS.map((e) => (
              <Button key={e.label} small onClick={() => setP(e.p)}>
                {e.label}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            {info < 0.2 ? '거의 예상한 대로입니다. 새로 알게 된 것이 거의 없어요.' : info < 2 ? '조금 놀랍습니다.' : info < 5 ? '꽤 놀라운 일입니다.' : '아주 놀라운 일입니다. 정보가 많습니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: entropy of a distribution ─────────────── */

const WEATHER = ['맑음', '흐림', '비', '눈'];

function EntropyFigure() {
  const P = usePalette();
  const [wts, setWts] = useState([0.6, 0.25, 0.1, 0.05]);
  const plotRef = useRef<Plot | null>(null);
  const sum = wts.reduce((a, b) => a + b, 0) || 1;
  const ps = wts.map((x) => x / sum);
  const H = ps.reduce((s, p) => s + (p > 0 ? -p * log2(p) : 0), 0);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -0.5, xMax: 3.5, yMin: 0, yMax: 1.12, pad: { l: 40, r: 10, t: 14, b: 46 } });
      plotRef.current = plot;
      plot.grid({ xStep: 10, yStep: 0.25, axes: false, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(String(v), plot.pad.l - 6, plot.Y(v));
      const bw = Math.min(70, plot.sx * 0.62);
      ps.forEach((p, i) => {
        const x = plot.X(i);
        const y0 = plot.Y(0);
        const y1 = plot.Y(p);
        ctx.fillStyle = alpha(P.math, 0.8);
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y1, bw, Math.max(0.5, y0 - y1), [5, 5, 0, 0]);
        ctx.fill();
        // drag handle
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = P.math;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - 14, y1 - 5, 28, 10, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmt(p, 2), x, y1 - 9);
        ctx.font = `600 13px ${P.fontBody}`;
        ctx.textBaseline = 'top';
        ctx.fillText(WEATHER[i], x, y0 + 7);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.fillText(p > 0 ? `${fmt(-log2(p), 2)}비트` : '—', x, y0 + 26);
      });
    },
    [P, wts],
    { aspect: 1.7, maxHeight: 340, minHeight: 240 },
  );

  useDrag(canvasRef, {
    hit: (x) => {
      const pl = plotRef.current;
      if (!pl) return null;
      const i = Math.round(pl.invX(x));
      return i >= 0 && i < 4 ? i : null;
    },
    onDrag: (id, _x, y) => {
      const pl = plotRef.current!;
      const target = Math.max(0, Math.min(1, pl.invY(y)));
      const i = id as number;
      // set bar i to `target` probability, rescale the others proportionally
      setWts((old) => {
        const s = old.reduce((a, b) => a + b, 0) || 1;
        const cur = old.map((v) => v / s);
        const rest = 1 - cur[i];
        return cur.map((v, j) => (j === i ? target : rest > 1e-9 ? (v / rest) * (1 - target) : (1 - target) / 3));
      });
    },
  });

  return (
    <Figure no={2} title="날씨 분포의 엔트로피" hint="막대 위 손잡이를 위아래로 끌어 보세요" caption={<>막대 아래 작은 숫자는 그 날씨가 실제로 왔을 때의 놀라움(−log₂p)입니다. 엔트로피는 이 놀라움을 확률로 가중평균한 값입니다. 네 날씨가 똑같이 가능할 때 최대 2비트, 하나로 확실할 때 0비트가 됩니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Readout label="엔트로피 H(p)" value={fmt(H, 3) + ' 비트'} color="var(--c-math)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${(H / 2) * 100}%`, height: '100%', background: 'var(--c-math)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
              <span>0 (확실함)</span>
              <span>2 = log₂4 (최대)</span>
            </div>
          </div>
          <div className="btn-row">
            <Button small onClick={() => setWts([1, 1, 1, 1])}>
              균등
            </Button>
            <Button small onClick={() => setWts([0.6, 0.25, 0.1, 0.05])}>
              치우침
            </Button>
            <Button small onClick={() => setWts([1, 0, 0, 0])}>
              확실
            </Button>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', lineHeight: 1.8, overflowWrap: 'anywhere' }}>
            H = {ps.map((p, i) => (p > 0 ? `${fmt(p, 2)}×${fmt(-log2(p), 2)}` : '0') + (i < 3 ? ' + ' : '')).join('')}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: cross-entropy loss ─────────────── */

const CLASSES = ['고양이', '개', '여우', '토끼'];

function CrossEntropyFigure() {
  const P = usePalette();
  const [label, setLabel] = useState(0);
  const [soft, setSoft] = useState<'hard' | 'soft'>('hard');
  const [logits, setLogits] = useState([2.0, 0.6, 1.2, -0.8]);
  const q = softmax(logits);
  const p: number[] = CLASSES.map((_, i) => (soft === 'hard' ? (i === label ? 1 : 0) : i === label ? 0.85 : 0.05));
  const ce = -p.reduce((s, pi, i) => s + (pi > 0 ? pi * Math.log(q[i]) : 0), 0);
  const hp = -p.reduce((s, pi) => s + (pi > 0 ? pi * Math.log(pi) : 0), 0);
  const kl = ce - hp;
  const qTrue = q[label];

  const bars = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -0.5, xMax: 3.5, yMin: 0, yMax: 1.1, pad: { l: 34, r: 8, t: 12, b: 28 } });
      plot.grid({ xStep: 10, yStep: 0.25, axes: false, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0, 0.5, 1]) ctx.fillText(String(v), plot.pad.l - 5, plot.Y(v));
      const bw = Math.min(56, plot.sx * 0.6);
      CLASSES.forEach((c, i) => {
        const x = plot.X(i);
        const y0 = plot.Y(0);
        // model prediction q
        ctx.fillStyle = i === label ? P.dl : alpha(P.dl, 0.45);
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, plot.Y(q[i]), bw, y0 - plot.Y(q[i]), [4, 4, 0, 0]);
        ctx.fill();
        // true p outline
        if (p[i] > 0) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(x - bw / 2 - 5, plot.Y(p[i]), bw + 10, y0 - plot.Y(p[i]));
          ctx.setLineDash([]);
        }
        ctx.fillStyle = P.ink;
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmt(q[i], 2), x, plot.Y(q[i]) - 4);
        ctx.font = `${i === label ? 700 : 500} 12px ${P.fontBody}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = i === label ? P.ink : P.ink2;
        ctx.fillText(c, x, y0 + 7);
      });
    },
    [P, logits, label, soft],
    { aspect: 1.45, maxHeight: 300, minHeight: 210 },
  );

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 5, pad: { l: 34, r: 12, t: 12, b: 28 } });
      plot.grid({ xStep: 0.25, yStep: 1, xLabel: '정답에 준 확률 q', yLabel: '손실 −ln q' });
      plot.fn((x) => -Math.log(x), P.bad, 2.5, { from: 0.005, to: 1, samples: 300 });
      const y = Math.min(5, -Math.log(qTrue));
      plot.dot(qTrue, y, 7, P.surface, P.dl, 3);
      plot.text(fmt(-Math.log(qTrue), 2), qTrue, y, P.dl, { dx: qTrue < 0.7 ? 12 : -12, dy: -22, align: qTrue < 0.7 ? 'left' : 'right', bg: alpha(P.surface, 0.9) });
    },
    [P, qTrue],
    { aspect: 1.45, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure no={3} title="크로스엔트로피 손실" hint="모델의 점수(로짓)를 바꿔 보세요" caption={<>점선 상자는 정답 분포 p, 색 막대는 모델이 예측한 분포 q입니다. 정답 칸의 q가 1에 가까우면 손실은 0에 가깝고, 0에 가까워지면 오른쪽 곡선처럼 손실이 끝없이 커집니다. "확신을 갖고 틀리는 것"에 가장 큰 벌을 주는 셈입니다.</>}>
      <div className="fig-split">
        <div className="fig-cols">
          <div ref={bars.wrapRef} className="canvas-box">
            <canvas ref={bars.canvasRef} />
          </div>
          <div ref={curve.wrapRef} className="canvas-box">
            <canvas ref={curve.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg<number> label="정답" value={label} onChange={(v) => setLabel(v)} options={CLASSES.map((c, i) => ({ value: i, label: c }))} />
          <Seg<'hard' | 'soft'>
            label="정답 분포의 형태"
            value={soft}
            onChange={(v) => setSoft(v)}
            options={[
              { value: 'hard', label: '원-핫' },
              { value: 'soft', label: '부드러운 정답' },
            ]}
          />
          {CLASSES.map((c, i) => (
            <Slider key={c} id={`ce-logit-${i}`} label={`${c} 점수`} value={logits[i]} min={-4} max={4} step={0.1} color="var(--c-dl)" onChange={(v) => setLogits((l) => l.map((x, j) => (j === i ? v : x)))} format={(v) => fmt(v, 1)} />
          ))}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="H(p, q)" value={fmt(ce, 3)} color="var(--bad)" />
            <Readout label="H(p)" value={fmt(hp, 3)} />
            <Readout label="KL(p‖q)" value={fmt(kl, 3)} />
          </div>
          <Legend
            items={[
              { color: 'var(--ink)', label: '정답 p (점선)', shape: 'ln' },
              { color: 'var(--c-dl)', label: '예측 q', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Entropy() {
  return (
    <>
      <h2>정보는 놀라움의 양이다</h2>
      <p>
        "내일 아침에도 해가 뜬다"는 소식은 아무 정보도 주지 않습니다. 이미 알고 있었으니까요. 반면 "로또 1등에 당첨됐다"는 소식은 엄청난 정보입니다. 거의 일어나지 않을 일이 일어났기 때문입니다. 1948년 클로드 섀넌은 이 직관을 그대로 수식으로 옮겼습니다. 확률 <M>p</M>인 사건이 일어났을 때 얻는 <T en="information content">정보량</T>은 다음과 같습니다.
      </p>
      <MB note="밑이 2인 로그를 쓰면 단위가 비트(bit)입니다. 동전 한 번의 결과가 정확히 1비트입니다.">{'I(x) = -\\log_2 p(x)'}</MB>
      <SurpriseFigure />
      <p>
        왜 하필 로그일까요? 서로 무관한 두 사건이 함께 일어날 확률은 곱해지지만(<M>{'p_1 p_2'}</M>), 그로부터 얻는 정보는 더해져야 자연스럽습니다. 곱을 합으로 바꿔 주는 함수가 바로 로그입니다. 로또 1등의 확률은 약 814만 분의 1이니 정보량은 약 23비트입니다. 동전 23번을 던져 모두 앞면이 나오는 것과 비슷한 놀라움이죠.
      </p>

      <h2>엔트로피: 평균적인 놀라움</h2>
      <p>
        하나의 사건이 아니라 분포 전체가 얼마나 예측하기 어려운지 알고 싶다면, 각 결과의 정보량을 그 확률로 가중평균하면 됩니다. 이 값이 <T en="entropy">엔트로피</T>입니다. 날씨가 거의 항상 맑은 사막 도시는 엔트로피가 낮고, 날씨가 변덕스러운 도시는 엔트로피가 높습니다.
      </p>
      <MB>{'H(p) = \\sum_x p(x)\\,\\bigl(-\\log_2 p(x)\\bigr) = -\\sum_x p(x)\\log_2 p(x)'}</MB>
      <EntropyFigure />
      <Callout kind="intuition">
        엔트로피는 "결과를 알려 주려면 평균 몇 번의 예/아니오 질문이 필요한가"로 생각할 수 있습니다. 네 날씨가 똑같이 가능하면 질문 두 번(2비트)이 필요하고, 늘 맑다면 물어볼 필요가 없습니다(0비트). 압축 프로그램이 자주 나오는 글자에 짧은 코드를 주는 것도 같은 원리입니다.
      </Callout>

      <h2>크로스엔트로피: 모델의 예측을 채점하기</h2>
      <p>
        이제 분류 모델이 나올 차례입니다. 사진 속 동물이 실제로는 고양이인데 모델은 <M>{'q = (0.5,\\ 0.2,\\ 0.25,\\ 0.05)'}</M>로 예측했다고 해 봅시다. 이 예측이 얼마나 좋은지 하나의 숫자로 재고 싶습니다. 정답 분포 <M>p</M>로 사건이 일어나는데 모델의 분포 <M>q</M>로 놀라움을 계산하면 <T en="cross-entropy">크로스엔트로피</T>가 됩니다.
      </p>
      <MB note="정답이 원-핫(정답 칸만 1)이면 합이 한 항만 남아, 정답 클래스에 준 확률의 −log가 됩니다.">{'H(p, q) = -\\sum_x p(x)\\ln q(x) \\;\\;\\xrightarrow{\\;p\\text{가 원-핫}\\;}\\;\\; -\\ln q(\\text{정답})'}</MB>
      <CrossEntropyFigure />
      <p>
        크로스엔트로피는 언제나 정답 자체의 엔트로피 <M>{'H(p)'}</M>보다 크거나 같고, 그 차이를 <T en="KL divergence">KL 발산</T>이라고 부릅니다. KL은 두 분포가 얼마나 다른지 재는 거리 비슷한 양이며, 모델의 예측이 정답과 완전히 같을 때만 0이 됩니다. 원-핫 정답에서는 <M>{'H(p)=0'}</M>이라 크로스엔트로피와 KL이 같은 값입니다.
      </p>
      <MB>{'D_{\\mathrm{KL}}(p\\,\\|\\,q) = H(p, q) - H(p) = \\sum_x p(x)\\ln\\frac{p(x)}{q(x)} \\;\\ge\\; 0'}</MB>
      <p>
        머신러닝에서는 계산이 편한 자연로그(단위: 내트)를 주로 씁니다. 밑만 다를 뿐 모양은 같습니다. 뒤에서 볼 로지스틱 회귀, 신경망 분류기, 그리고 다음 단어를 맞히는 언어 모델까지 모두 이 크로스엔트로피를 줄이도록 학습합니다.
      </p>
      <Callout kind="key">
        정보량은 <M>{'-\\log p'}</M>, 엔트로피는 그 평균, 크로스엔트로피는 "틀린 분포로 계산한 평균 놀라움"입니다. 분류 모델의 손실 함수는 정답에 준 확률의 −log이고, 학습은 정답에 더 높은 확률을 주도록 모델을 고치는 과정입니다.
      </Callout>
      <Quiz
        q="정답이 '개'인 사진에 모델 A는 개 확률 0.5, 모델 B는 개 확률 0.05를 주었습니다. 크로스엔트로피 손실(자연로그)은 대략?"
        options={['A ≈ 0.69, B ≈ 3.00', 'A ≈ 0.5, B ≈ 0.05', 'A ≈ 1.0, B ≈ 10.0', '둘 다 같다']}
        answer={0}
        explain={<>−ln 0.5 ≈ 0.69, −ln 0.05 ≈ 3.00 입니다. 확률이 10분의 1로 줄었을 뿐인데 손실은 4배 이상 커집니다. 그림 3에서 정답 칸 점수를 낮춰 곡선을 따라가 보세요.</>}
      />
    </>
  );
}

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { usePalette, alpha, parseColor } from '../../../../lib/theme';
import { gauss, rng, sigmoid } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import './WhatIsAI.css';

/* ─────────────── Figure 1: AI ⊃ ML ⊃ DL ─────────────── */

type RingId = 'ai' | 'ml' | 'dl';
const RINGS: Record<RingId, { name: string; en: string; color: string; def: string; examples: string[]; links: { id: string; label: string }[] }> = {
  ai: {
    name: '인공지능',
    en: 'Artificial Intelligence',
    color: 'var(--c-math)',
    def: '사람이 지능을 써서 하는 일을 기계가 해내도록 만드는 모든 기술을 말합니다. 방법은 따지지 않습니다. 사람이 손으로 규칙을 써 넣은 프로그램도 인공지능입니다.',
    examples: ['수많은 규칙과 탐색으로 체스를 두는 엔진', '내비게이션의 최단 경로 탐색', '"만약 ~라면 ~하라" 규칙을 모은 전문가 시스템'],
    links: [],
  },
  ml: {
    name: '머신러닝',
    en: 'Machine Learning',
    color: 'var(--c-ml)',
    def: '규칙을 사람이 쓰지 않고 데이터에서 찾아내는 인공지능입니다. 예시와 정답을 많이 보여 주면 프로그램이 스스로 규칙(모델의 숫자들)을 조정합니다.',
    examples: ['스팸 메일 필터', '면적과 위치로 집값 예측하기', '카드 이상 거래 탐지', '쇼핑몰 상품 추천'],
    links: [
      { id: 'linear-regression', label: '선형회귀' },
      { id: 'logistic-regression', label: '분류' },
      { id: 'k-means', label: 'K-평균' },
    ],
  },
  dl: {
    name: '딥러닝',
    en: 'Deep Learning',
    color: 'var(--c-dl)',
    def: '여러 층으로 쌓은 인공 신경망을 쓰는 머신러닝입니다. 사람이 특징을 골라 주지 않아도 사진의 픽셀이나 문장의 글자에서 쓸모 있는 특징을 스스로 만들어 냅니다.',
    examples: ['사진 속 얼굴과 물체 인식', '음성 인식과 번역', 'ChatGPT 같은 대형 언어 모델', '이미지 생성 모델'],
    links: [
      { id: 'neural-network', label: '신경망' },
      { id: 'cnn', label: 'CNN' },
      { id: 'attention', label: '트랜스포머' },
    ],
  },
};

function RingsFigure() {
  const [active, setActive] = useState<RingId>('ml');
  const r = RINGS[active];
  const ring = (id: RingId, cx: number, cy: number, rad: number, labelY: number) => {
    const on = id === active;
    const R = RINGS[id];
    return (
      <g
        className="ai-ring"
        role="button"
        tabIndex={0}
        aria-pressed={on}
        aria-label={R.name}
        onMouseEnter={() => setActive(id)}
        onFocus={() => setActive(id)}
        onClick={(e) => {
          e.stopPropagation();
          setActive(id);
        }}
      >
        <circle cx={cx} cy={cy} r={rad} fill={R.color} fillOpacity={on ? 0.22 : 0.09} stroke={R.color} strokeWidth={on ? 2.5 : 1.2} />
        <text x={cx} y={labelY} textAnchor="middle" fill={R.color} style={{ font: `700 ${id === 'dl' ? 15 : 16}px var(--font-display)` }}>
          {R.name}
        </text>
        <text x={cx} y={labelY + 16} textAnchor="middle" fill="var(--ink-3)" style={{ font: '500 10px var(--font-mono)' }}>
          {R.en}
        </text>
      </g>
    );
  };
  return (
    <Figure no={1} title="세 용어의 관계" hint="원을 누르거나 마우스를 올려 보세요" caption="딥러닝은 머신러닝의 한 방법이고, 머신러닝은 인공지능의 한 방법입니다. 바깥 원으로 갈수록 범위가 넓어집니다.">
      <div className="fig-split ai-split">
        <div className="ai-rings">
          <svg viewBox="0 0 400 330" role="group" aria-label="인공지능, 머신러닝, 딥러닝 포함 관계">
            {ring('ai', 200, 166, 158, 40)}
            {ring('ml', 200, 211, 112, 132)}
            {ring('dl', 200, 258, 64, 252)}
          </svg>
        </div>
        <div className="ai-info" style={{ ['--c' as string]: r.color } as CSSProperties}>
          <div className="ai-info-tag" style={{ color: r.color }}>
            {r.en.toUpperCase()}
          </div>
          <h3>{r.name}</h3>
          <p>{r.def}</p>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', fontWeight: 600 }}>예시</div>
          <ul>
            {r.examples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {r.links.length > 0 && (
            <div className="ai-chips">
              {r.links.map((l) => (
                <a key={l.id} href={lessonHref('ai-basics', l.id)}>
                  {l.label} 장 →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: hand-written rule vs learned boundary ─────────────── */

interface Mail {
  x: number; // links
  y: number; // ad words
  spam: number;
}

function makeMails(): Mail[] {
  const r = rng(11);
  const out: Mail[] = [];
  const u = [Math.SQRT1_2, -Math.SQRT1_2];
  const v = [Math.SQRT1_2, Math.SQRT1_2];
  for (let i = 0; i < 64; i++) {
    const spam = i % 2;
    const c = spam ? 6.7 : 3.0;
    const s = gauss(r) * 2.1;
    const t = gauss(r) * 0.85;
    const x = Math.max(0.3, Math.min(9.7, c + s * u[0] + t * v[0]));
    const y = Math.max(0.3, Math.min(9.7, c + s * u[1] + t * v[1]));
    out.push({ x, y, spam });
  }
  return out;
}

function RuleVsLearnFigure() {
  const P = usePalette();
  const data = useMemo(makeMails, []);
  const [L, setL] = useState(6);
  const [K, setK] = useState(4);
  const [op, setOp] = useState<'and' | 'or'>('and');
  const [mode, setMode] = useState<'rule' | 'learn'>('rule');
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  const wRef = useRef({ w1: 0, w2: 0, b: 0, step: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);

  const norm = (v: number) => (v - 5) / 2.5;
  const ruleSays = (m: { x: number; y: number }) => (op === 'and' ? m.x >= L && m.y >= K : m.x >= L || m.y >= K);
  const learnProb = (x: number, y: number) => {
    const w = wRef.current;
    return sigmoid(w.w1 * norm(x) + w.w2 * norm(y) + w.b);
  };
  const predict = (m: Mail) => (mode === 'rule' ? ruleSays(m) : learnProb(m.x, m.y) >= 0.5);
  const correct = data.filter((m) => (predict(m) ? 1 : 0) === m.spam).length;
  const acc = correct / data.length;

  let loss = 0;
  for (const m of data) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, learnProb(m.x, m.y)));
    loss += -(m.spam * Math.log(p) + (1 - m.spam) * Math.log(1 - p));
  }
  loss /= data.length;

  useAnimationFrame(() => {
    const w = wRef.current;
    for (let k = 0; k < 3; k++) {
      let g1 = 0;
      let g2 = 0;
      let gb = 0;
      for (const m of data) {
        const e = learnProb(m.x, m.y) - m.spam;
        g1 += e * norm(m.x);
        g2 += e * norm(m.y);
        gb += e;
      }
      const n = data.length;
      w.w1 -= 0.6 * (g1 / n);
      w.w2 -= 0.6 * (g2 / n);
      w.b -= 0.6 * (gb / n);
      w.step++;
    }
    if (w.step >= 360) setRunning(false);
    setTick((t) => t + 1);
  }, running && inView);

  const startLearn = () => {
    wRef.current = { w1: 0.15, w2: -0.6, b: 0.4, step: 0 };
    setMode('learn');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      // jump to the end
      for (let i = 0; i < 120; i++) {
        const w = wRef.current;
        let g1 = 0,
          g2 = 0,
          gb = 0;
        for (const m of data) {
          const e = learnProb(m.x, m.y) - m.spam;
          g1 += e * norm(m.x);
          g2 += e * norm(m.y);
          gb += e;
        }
        w.w1 -= 0.6 * (g1 / data.length) * 3;
        w.w2 -= 0.6 * (g2 / data.length) * 3;
        w.b -= 0.6 * (gb / data.length) * 3;
        w.step = 360;
      }
      setTick((t) => t + 1);
    } else setRunning(true);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 10, yMin: 0, yMax: 10, pad: { l: 46, r: 12, t: 12, b: 34 } });
      if (mode === 'rule') {
        // shade the rule's spam region
        ctx.save();
        ctx.fillStyle = P.posSoft;
        if (op === 'and') {
          ctx.fillRect(plot.X(L), plot.Y(10), plot.X(10) - plot.X(L), plot.Y(K) - plot.Y(10));
        } else {
          ctx.fillRect(plot.X(L), plot.Y(10), plot.X(10) - plot.X(L), plot.Y(0) - plot.Y(10));
          ctx.fillRect(plot.X(0), plot.Y(10), plot.X(L) - plot.X(0), plot.Y(K) - plot.Y(10));
        }
        ctx.restore();
      } else {
        const pc = parseColor(P.pos);
        const nc = parseColor(P.neg);
        plot.heatmap((x, y) => {
          const p = learnProb(x, y);
          const c = p >= 0.5 ? pc : nc;
          return [c[0], c[1], c[2], Math.round(Math.abs(p - 0.5) * 2 * 70)];
        }, 6);
      }
      plot.grid({ xStep: 1, yStep: 1, axes: false });
      plot.frame();
      if (mode === 'rule') {
        plot.line(L, 0, L, 10, P.ink, 2, [6, 4]);
        plot.line(0, K, 10, K, P.ink, 2, [6, 4]);
        plot.text(`링크 ≥ ${fmt(L, 1)}`, L, 9.6, P.ink, { dx: 6, font: `600 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
        plot.text(`광고 단어 ≥ ${fmt(K, 1)}`, 9.9, K, P.ink, { dy: -12, align: 'right', font: `600 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      } else {
        const ww = wRef.current;
        // boundary: w1*(x-5)/2.5 + w2*(y-5)/2.5 + b = 0
        if (Math.abs(ww.w2) > 1e-4) {
          const yAt = (x: number) => 5 + (-ww.b - ww.w1 * norm(x)) * 2.5 / ww.w2;
          plot.ctx.save();
          plot.clip();
          plot.line(0, yAt(0), 10, yAt(10), P.ink, 2.5);
          plot.unclip();
          plot.ctx.restore();
        }
      }
      for (const m of data) {
        const ok = (predict(m) ? 1 : 0) === m.spam;
        plot.dot(m.x, m.y, 5.5, m.spam ? P.pos : P.neg, P.surface, 1.5);
        if (!ok) {
          ctx.beginPath();
          ctx.arc(plot.X(m.x), plot.Y(m.y), 9.5, 0, Math.PI * 2);
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText('메일 속 링크 수 →', plot.X(5), h - 4);
      ctx.save();
      ctx.translate(12, plot.Y(5));
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('광고 단어 수 →', 0, 0);
      ctx.restore();
    },
    [P, data, L, K, op, mode, wRef.current.step],
    { aspect: 1.15, maxHeight: 460 },
  );

  return (
    <Figure
      no={2}
      title="규칙을 직접 쓰기 vs 데이터에서 배우기"
      hint="기준선을 옮겨 정확도를 올려 보세요"
      caption={<>점 하나가 메일 하나입니다. 주황은 스팸, 파랑은 정상 메일이고 빨간 테두리는 잘못 분류된 메일입니다. 가로·세로 기준선만으로는 대각선으로 놓인 경계를 잘 따라갈 수 없습니다. 학습은 데이터를 보고 비스듬한 경계를 스스로 찾아냅니다.</>}
    >
      <div className="fig-split">
        <div ref={boxRef}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg
            value={mode}
            onChange={(m) => {
              if (m === 'learn') startLearn();
              else {
                setRunning(false);
                setMode('rule');
              }
            }}
            options={[
              { value: 'rule', label: '사람이 쓴 규칙' },
              { value: 'learn', label: '학습한 경계' },
            ]}
          />
          {mode === 'rule' ? (
            <>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                규칙: 링크가 <strong>{fmt(L, 1)}개 이상</strong> {op === 'and' ? '이고' : '이거나'} 광고 단어가 <strong>{fmt(K, 1)}개 이상</strong>이면 스팸
              </div>
              <Slider id="wia-l" label="링크 수 기준" value={L} min={0} max={10} step={0.5} onChange={setL} format={(v) => fmt(v, 1)} />
              <Slider id="wia-k" label="광고 단어 기준" value={K} min={0} max={10} step={0.5} onChange={setK} format={(v) => fmt(v, 1)} />
              <Seg
                label="두 조건을"
                value={op}
                onChange={setOp}
                options={[
                  { value: 'or', label: '또는' },
                  { value: 'and', label: '그리고' },
                ]}
              />
              <Button primary onClick={startLearn}>
                데이터로 학습하기
              </Button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                모델: <M>{'p(\\text{스팸}) = \\sigma(w_1 x_1 + w_2 x_2 + b)'}</M>
                <br />
                숫자 세 개를 오차가 줄어드는 쪽으로 조금씩 고칩니다.
              </div>
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="학습 단계" value={wRef.current.step} />
                <Readout label="손실" value={fmt(loss, 3)} />
              </div>
              <Button onClick={startLearn}>처음부터 다시 학습</Button>
            </>
          )}
          <Readout label="정확도" value={`${correct} / ${data.length} (${fmt(acc * 100, 0)}%)`} color={acc > 0.9 ? 'var(--good)' : undefined} />
          <Legend
            items={[
              { color: 'var(--pos)', label: '스팸' },
              { color: 'var(--neg)', label: '정상 메일' },
              { color: 'var(--bad)', label: '틀린 판정', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: timeline ─────────────── */

const ERA = {
  rule: { label: '규칙과 탐색의 시대', color: 'var(--c-math)' },
  nn: { label: '신경망의 부침', color: 'var(--c-ml)' },
  deep: { label: '딥러닝의 시대', color: 'var(--c-dl)' },
};
const EVENTS: { year: string; era: keyof typeof ERA; title: string; text: string; link?: { id: string; label: string } }[] = [
  { year: '1950', era: 'rule', title: '튜링 테스트', text: '앨런 튜링이 논문 「계산 기계와 지능」에서 "기계가 생각할 수 있는가?"라는 질문을 대화 시험으로 바꿔 제안했습니다. 6년 뒤 1956년 다트머스 회의에서 "인공지능"이라는 이름이 처음 쓰였습니다.' },
  { year: '1957', era: 'nn', title: '퍼셉트론', text: '프랭크 로젠블랫이 뉴런을 흉내 낸 학습 기계 퍼셉트론을 발표했습니다. 데이터를 보고 가중치를 스스로 고치는, 학습하는 기계의 출발점입니다.', link: { id: 'neuron', label: '인공 뉴런' } },
  { year: '1969', era: 'nn', title: '첫 번째 AI 겨울', text: '민스키와 패퍼트가 층이 하나뿐인 퍼셉트론은 XOR 같은 간단한 문제도 풀 수 없음을 보였습니다. 기대가 꺾이며 1970년대 연구 지원이 크게 줄었습니다.' },
  { year: '1986', era: 'nn', title: '역전파의 재발견', text: '럼멜하트, 힌턴, 윌리엄스가 여러 층의 신경망을 학습시키는 역전파 알고리즘을 널리 알렸습니다. 층을 쌓으면 XOR도 풀 수 있게 되었습니다.', link: { id: 'backprop', label: '역전파' } },
  { year: '1997', era: 'rule', title: '딥블루, 체스 챔피언을 이기다', text: 'IBM의 딥블루가 세계 챔피언 카스파로프를 이겼습니다. 다만 딥블루는 학습보다는 사람이 설계한 평가 규칙과 초당 수억 수의 탐색에 기댄 시스템이었습니다.' },
  { year: '2012', era: 'deep', title: 'AlexNet', text: 'GPU로 학습한 합성곱 신경망 AlexNet이 이미지 인식 대회 ImageNet에서 오류율을 2위보다 10%p 넘게 낮추며 우승했습니다. 딥러닝 붐이 여기서 시작됩니다.', link: { id: 'cnn', label: '합성곱 신경망' } },
  { year: '2017', era: 'deep', title: '트랜스포머', text: '구글 연구진의 논문 「Attention Is All You Need」가 어텐션만으로 만든 트랜스포머 구조를 제안했습니다. 오늘날 거의 모든 대형 언어 모델의 뼈대입니다.', link: { id: 'attention', label: '어텐션과 트랜스포머' } },
  { year: '2022', era: 'deep', title: 'ChatGPT', text: 'OpenAI가 대화형 언어 모델 ChatGPT를 공개했고, 두 달 만에 사용자 1억 명을 넘긴 것으로 알려졌습니다. 다음 단어를 예측하도록 학습한 모델이 일상의 도구가 되었습니다.', link: { id: 'language-model', label: '언어 모델' } },
  { year: '2024', era: 'deep', title: '노벨상을 받은 인공지능 연구', text: '인공 신경망으로 학습하는 기계의 기초를 놓은 존 홉필드와 제프리 힌턴이 노벨 물리학상을 받았습니다. 같은 해 단백질 구조를 예측하는 AlphaFold를 만든 데미스 허사비스와 존 점퍼가 단백질 설계 연구자 데이비드 베이커와 함께 노벨 화학상을 받았습니다. 인공지능이 과학 연구의 도구로 자리 잡았음을 보여 준 해입니다.', link: { id: 'neural-network', label: '신경망 놀이터' } },
];

function TimelineFigure() {
  const [i, setI] = useState(5);
  const e = EVENTS[i];
  const era = ERA[e.era];
  return (
    <Figure no={3} title="인공지능 70년" hint="연도를 눌러 보세요" caption="점 사이 간격은 실제 시간 간격과 비례하지 않습니다. 색은 시대를 나타냅니다.">
      <div className="tl-track" role="group" aria-label="연표" style={{ ['--tl-n' as string]: EVENTS.length } as CSSProperties}>
        {EVENTS.map((ev, k) => (
          <button key={ev.year} type="button" className="tl-dot" aria-pressed={k === i} onClick={() => setI(k)} style={{ ['--tl-color' as string]: ERA[ev.era].color } as CSSProperties} aria-label={`${ev.year}년 ${ev.title}`}>
            <i />
            <span>{ev.year}</span>
          </button>
        ))}
      </div>
      <div className="tl-card">
        <span className="era" style={{ color: era.color }}>
          {e.year} · {era.label}
        </span>
        <h3>{e.title}</h3>
        <p>{e.text}</p>
        {e.link && <a href={lessonHref('ai-basics', e.link.id)}>「{e.link.label}」 장에서 자세히 →</a>}
      </div>
      <div className="btn-row">
        <Button small onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0}>
          ← 이전
        </Button>
        <Button small onClick={() => setI((k) => Math.min(EVENTS.length - 1, k + 1))} disabled={i === EVENTS.length - 1}>
          다음 →
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function WhatIsAI() {
  return (
    <>
      <h2>세 개의 원</h2>
      <p>
        뉴스에서는 인공지능, 머신러닝, 딥러닝이라는 말이 거의 같은 뜻처럼 섞여 쓰입니다. 하지만 셋은 크기가 다른 원처럼 서로를 품고 있습니다. 가장 바깥의 <T en="AI">인공지능</T>은 기계가 똑똑하게 행동하도록 만드는 모든 시도를 가리킵니다. 그 안의 <T en="ML">머신러닝</T>은 그중에서 데이터로부터 배우는 방법만 모은 것이고, 가장 안쪽의 <T en="DL">딥러닝</T>은 머신러닝 중에서도 여러 층의 신경망을 쓰는 방법입니다.
      </p>
      <RingsFigure />

      <h2>규칙을 쓰는 대신 데이터에서 배운다</h2>
      <p>
        스팸 메일을 걸러 내는 프로그램을 만든다고 해 봅시다. 가장 먼저 떠오르는 방법은 규칙을 직접 쓰는 것입니다. "링크가 5개 이상이면 스팸", "'무료', '당첨' 같은 단어가 많으면 스팸". 이런 방식은 이해하기 쉽지만 금방 한계에 부딪힙니다. 예외가 끝없이 생기고, 스팸 발송자는 규칙을 피해 갑니다.
      </p>
      <p>
        머신러닝은 질문을 바꿉니다. 규칙을 사람이 쓰는 대신, 스팸과 정상 메일의 <strong>예시</strong>를 잔뜩 보여 주고 규칙은 프로그램이 찾게 합니다. 아래 그림에서 먼저 기준선 두 개로 규칙을 만들어 정확도를 최대한 올려 보세요. 그다음 "데이터로 학습하기"를 눌러 비교해 보세요.
      </p>
      <RuleVsLearnFigure />
      <p>
        학습한 경계가 더 나은 이유는 대단한 지능 때문이 아닙니다. 사람의 규칙은 "가로 기준선과 세로 기준선"이라는 좁은 틀 안에 있었지만, 학습 모델은 기울어진 직선 전체 중에서 데이터에 가장 잘 맞는 것을 골랐을 뿐입니다. 그리고 데이터가 바뀌면 다시 학습시키기만 하면 됩니다.
      </p>

      <h2>학습이란 함수를 찾는 일</h2>
      <p>
        조금 더 정확히 말하면, 머신러닝은 입력 <M>{'x'}</M>를 받아 출력 <M>{'y'}</M>를 내놓는 <T en="function">함수</T>를 데이터로 찾는 일입니다. 메일(입력)을 받아 스팸일 확률(출력)을 내놓는 함수, 사진을 받아 "고양이"라는 이름을 내놓는 함수, 문장을 받아 다음 단어를 내놓는 함수가 모두 그렇습니다.
      </p>
      <MB note="θ(세타)는 모델 안의 조정 가능한 숫자들, 즉 파라미터입니다. 위 그림에서는 w₁, w₂, b 세 개였고 대형 언어 모델에서는 수천억 개입니다.">{'\\hat{y} = f(x;\\ \\theta)'}</MB>
      <p>이 함수를 찾는 과정에는 언제나 세 가지 재료가 들어갑니다. 이 과목의 머신러닝과 딥러닝 장들은 모두 이 세 가지를 바꿔 가며 반복하는 이야기입니다.</p>
      <div className="ingredients">
        <div>
          <span className="ing-q">어떤 모양의 함수인가?</span>
          <span className="ing-name">모델</span>
          <p>직선, 곡선, 신경망처럼 함수의 틀을 정합니다. 틀 안의 숫자(파라미터)는 아직 비어 있습니다.</p>
        </div>
        <div>
          <span className="ing-q">얼마나 틀렸는가?</span>
          <span className="ing-name">손실 함수</span>
          <p>모델의 예측과 실제 정답의 차이를 숫자 하나로 잽니다. 작을수록 좋은 모델입니다.</p>
        </div>
        <div>
          <span className="ing-q">어떻게 고칠 것인가?</span>
          <span className="ing-name">최적화</span>
          <p>손실이 줄어드는 방향으로 파라미터를 조금씩 고칩니다. 대표적인 방법이 경사하강법입니다.</p>
        </div>
      </div>
      <MB note="데이터 N개에 대한 평균 손실이 가장 작아지는 파라미터를 찾는다는 뜻입니다.">{'\\theta^{*} = \\arg\\min_{\\theta}\\ \\frac{1}{N}\\sum_{i=1}^{N} L\\big(f(x_i;\\theta),\\ y_i\\big)'}</MB>

      <h2>짧은 역사</h2>
      <p>인공지능의 역사는 규칙을 직접 쓰는 쪽과 데이터에서 배우는 쪽이 번갈아 주목받은 역사이기도 합니다. 학습하는 기계에 대한 아이디어는 1950년대부터 있었지만, 데이터와 계산 능력이 충분해진 2010년대에야 본격적으로 꽃을 피웠습니다.</p>
      <TimelineFigure />

      <h2>이 과목의 길</h2>
      <p>
        이제부터 걸어갈 길은 세 구간입니다. <strong>수학 기초</strong>에서는 데이터를 담는 벡터와 행렬, 변화를 재는 미분, 불확실성을 다루는 확률을 익힙니다. <strong>머신러닝</strong>에서는 그 도구로 직선을 긋고, 오차를 줄이고, 모델을 평가합니다. <strong>딥러닝</strong>에서는 뉴런을 쌓아 신경망을 만들고, 이미지와 언어를 다루는 구조를 거쳐 언어 모델이 문장을 만들어 내는 과정까지 갑니다.
      </p>
      <Callout kind="key">
        인공지능은 가장 넓은 이름이고, 머신러닝은 데이터에서 규칙을 배우는 인공지능, 딥러닝은 여러 층의 신경망으로 배우는 머신러닝입니다. 어떤 학습이든 모델, 손실, 최적화라는 세 재료로 이루어집니다.
      </Callout>
      <Quiz
        q="다음 중 머신러닝에는 속하지만 딥러닝은 아닌 것은?"
        options={['사람이 쓴 수천 개의 규칙으로 체스를 두는 프로그램', '면적과 방 개수로 집값을 예측하는 선형회귀', '사진 속 고양이를 찾는 합성곱 신경망', 'ChatGPT 같은 대형 언어 모델']}
        answer={1}
        explain={<>선형회귀는 데이터에서 직선의 기울기와 절편을 배우므로 머신러닝이지만, 신경망을 쓰지 않으므로 딥러닝은 아닙니다. 규칙 기반 체스 프로그램은 인공지능이지만 머신러닝이 아니고, 나머지 둘은 딥러닝입니다.</>}
      />
    </>
  );
}

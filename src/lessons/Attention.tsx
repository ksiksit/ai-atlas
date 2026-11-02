import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Seg, Slider, T } from '../components/ui';
import { useCanvas2D, useDrag } from '../lib/canvas';
import { Plot, fmt } from '../lib/plot';
import { usePalette, alpha } from '../lib/theme';
import { softmax } from '../lib/math';

/* ─────────────── Figure 1: attention viewer ─────────────── */

const TOKENS = ['고양이가', '매트', '위에', '앉았다', '왜냐하면', '그것이', '너무', '피곤했기', '때문이다'];
const NT = TOKENS.length;

function sparse(entries: Record<number, Record<number, number>>, base = 0): number[][] {
  return Array.from({ length: NT }, (_, i) => Array.from({ length: NT }, (_, j) => entries[i]?.[j] ?? base));
}

/** Head 1: meaning links (who/what refers to what). Hand-made scores for illustration. */
const HEAD_MEANING = sparse({
  0: { 0: 2.0, 3: 1.6, 7: 1.2, 5: 1.0 },
  1: { 1: 1.5, 2: 2.0, 3: 1.2, 0: 0.6 },
  2: { 1: 2.4, 3: 1.4, 2: 0.8 },
  3: { 0: 2.4, 1: 1.4, 2: 1.0, 3: 0.8 },
  4: { 8: 2.4, 3: 1.2, 7: 1.0, 4: 0.6 },
  5: { 0: 3.0, 1: 1.0, 7: 1.2, 5: 0.5 },
  6: { 7: 2.6, 6: 0.6 },
  7: { 5: 2.0, 0: 1.8, 6: 1.6, 8: 0.8, 7: 0.6 },
  8: { 4: 2.4, 7: 1.8, 3: 1.0, 8: 0.5 },
});

/** Head 2: looks mostly at the previous word. */
const HEAD_POSITION: number[][] = Array.from({ length: NT }, (_, i) =>
  Array.from({ length: NT }, (_, j) => {
    if (i === 0 && j === 0) return 2.5;
    if (j === i - 1) return 2.5;
    if (j === i) return 1.2;
    if (j === i - 2) return 0.6;
    return 0;
  }),
);

function AttentionViewer() {
  const [head, setHead] = useState<'meaning' | 'position'>('meaning');
  const [temp, setTemp] = useState(1);
  const [mask, setMask] = useState(false);
  const [sel, setSel] = useState(5);

  const W = useMemo(() => {
    const L = head === 'meaning' ? HEAD_MEANING : HEAD_POSITION;
    return L.map((row, i) => {
      const masked = row.map((v, j) => (mask && j > i ? -Infinity : v));
      const finite = masked.map((v) => (isFinite(v) ? v : -1e9));
      return softmax(finite, temp).map((w, j) => (mask && j > i ? 0 : w));
    });
  }, [head, temp, mask]);

  const row = W[sel];
  const RH = 34;
  const H = NT * RH + 16;
  const lx = 112;
  const rx = 248;
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSel(i);
    }
    if (e.key === 'ArrowDown') setSel((s) => Math.min(NT - 1, s + 1));
    if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
  };
  const top = row
    .map((w, j) => ({ w, j }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 2);

  return (
    <Figure
      no={1}
      title="문장 속 단어들이 서로를 보는 방식"
      hint="왼쪽 단어를 누르거나 위에 올려 보세요"
      caption={<>왼쪽 단어(Query)가 오른쪽 단어들(Key)에 나눠 주는 주의의 양을 선의 굵기로 그렸습니다. 한 줄의 가중치를 모두 더하면 100%입니다. 오른쪽 표는 모든 단어 쌍을 한눈에 본 것으로, 행이 보는 쪽, 열이 보이는 쪽입니다. 점수는 설명을 위해 손으로 만든 값입니다.</>}
    >
      <div className="controls row" style={{ alignItems: 'center' }}>
        <Seg
          label="어텐션 헤드"
          value={head}
          onChange={setHead}
          options={[
            { value: 'meaning', label: '헤드 1 · 의미 연결' },
            { value: 'position', label: '헤드 2 · 바로 앞 단어' },
          ]}
        />
        <Slider id="att-temp" label="온도 (점수를 나누는 값)" value={temp} min={0.25} max={3} step={0.05} onChange={setTemp} format={(v) => fmt(v, 2)} />
        <Check label="뒤쪽 단어 가리기 (마스킹)" checked={mask} onChange={setMask} />
      </div>
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <svg viewBox={`0 0 360 ${H}`} style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'block' }} role="group" aria-label="어텐션 연결선">
          {row.map((w, j) => {
            if (w < 0.004) return null;
            const y1 = 8 + sel * RH + RH / 2;
            const y2 = 8 + j * RH + RH / 2;
            return <path key={j} d={`M${lx + 6} ${y1} C ${lx + 70} ${y1}, ${rx - 70} ${y2}, ${rx - 6} ${y2}`} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 1 + w * 16, strokeOpacity: 0.18 + w * 0.82, strokeLinecap: 'round' }} />;
          })}
          {TOKENS.map((t, i) => {
            const y = 8 + i * RH + RH / 2;
            const active = i === sel;
            return (
              <g key={i}>
                <g role="button" tabIndex={0} aria-pressed={active} aria-label={`${t} 선택`} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} onKeyDown={onKey(i)} style={{ cursor: 'pointer', outline: 'none' }}>
                  <rect x={4} y={y - 13} width={lx - 2} height={26} rx={6} style={{ fill: active ? 'var(--accent)' : 'var(--surface-2)' }} />
                  <text x={lx - 8} y={y} textAnchor="end" dominantBaseline="central" style={{ fill: active ? 'var(--accent-ink)' : 'var(--ink)', fontSize: 14, fontWeight: active ? 700 : 500, fontFamily: 'var(--font-body)' }}>
                    {t}
                  </text>
                </g>
                <rect x={rx} y={y - 13} width={88} height={26} rx={6} style={{ fill: `color-mix(in srgb, var(--accent) ${Math.round(row[i] * 70)}%, var(--surface-2))` }} />
                <text x={rx + 8} y={y} dominantBaseline="central" style={{ fill: row[i] > 0.45 ? 'var(--accent-ink)' : 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-body)' }}>
                  {t}
                </text>
                <text x={356} y={y} textAnchor="end" dominantBaseline="central" style={{ fill: 'var(--ink-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  {row[i] < 0.005 ? '' : Math.round(row[i] * 100) + '%'}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${NT}, minmax(22px, 1fr))`, gap: 2, minWidth: 290, maxWidth: 440, fontSize: '0.7rem' }}>
              <span />
              {TOKENS.map((t, j) => (
                <span key={j} style={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap', justifySelf: 'center', alignSelf: 'end', color: 'var(--ink-2)', paddingBottom: 4, lineHeight: 1 }}>
                  {t}
                </span>
              ))}
              {W.map((r, i) => [
                <button
                  key={'l' + i}
                  type="button"
                  onClick={() => setSel(i)}
                  style={{ font: 'inherit', fontSize: '0.7rem', textAlign: 'right', paddingRight: 4, border: 0, background: 'transparent', color: i === sel ? 'var(--accent)' : 'var(--ink-2)', fontWeight: i === sel ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                  {TOKENS[i]}
                </button>,
                ...r.map((w, j) => (
                  <span
                    key={i + '-' + j}
                    title={`${TOKENS[i]} → ${TOKENS[j]}: ${Math.round(w * 100)}%`}
                    style={{ aspectRatio: '1', borderRadius: 3, background: `color-mix(in srgb, var(--accent) ${Math.round(Math.sqrt(w) * 95)}%, var(--surface-2))`, outline: i === sel ? '1.5px solid var(--hl)' : 'none', outlineOffset: -1 }}
                  />
                )),
              ])}
            </div>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--ink)' }}>"{TOKENS[sel]}"</strong>은(는) <strong>{TOKENS[top[0].j]}</strong>({Math.round(top[0].w * 100)}%)와 <strong>{TOKENS[top[1].j]}</strong>({Math.round(top[1].w * 100)}%)를 가장 많이 참고합니다.
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '진할수록 많이 참고', shape: 'sq' },
              { color: 'var(--hl)', label: '선택한 행', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Q·K·V step by step ─────────────── */

type V2 = [number, number];
const QK_TOKENS = ['나는', '사과를', '맛있게', '먹었다'];
const KEYS: V2[] = [
  [1.4, -0.2],
  [0.2, 1.5],
  [-1.2, 0.6],
  [0.9, -1.1],
];
const QUERIES: V2[] = [
  [1.6, 0.3],
  [-0.4, 1.2],
  [0.6, -1.4],
  [1.0, 1.6],
];
const VALUES: V2[] = [
  [-1.3, 1.1],
  [1.3, 1.3],
  [-0.2, -1.4],
  [1.4, -0.7],
];
const TOK_COLOR = ['var(--neg)', 'var(--pos)', 'var(--c-ml)', 'var(--c-dl)'];

function QKVFigure() {
  const P = usePalette();
  const [qi, setQi] = useState(3);
  const [q, setQ] = useState<V2>(QUERIES[3]);
  const plotRef = useRef<Plot | null>(null);
  const tokCol = [P.neg, P.pos, P.ml, P.dl];

  const scores = KEYS.map((k) => q[0] * k[0] + q[1] * k[1]);
  const scaled = scores.map((s) => s / Math.SQRT2);
  const w = softmax(scaled);
  const out: V2 = [w.reduce((s, x, i) => s + x * VALUES[i][0], 0), w.reduce((s, x, i) => s + x * VALUES[i][1], 0)];

  const qk = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const p = new Plot(ctx, cw, h, P, { xMin: -2, xMax: 2, yMin: -2, yMax: 2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plotRef.current = p;
      p.grid({ xStep: 1, yStep: 1, labels: false });
      KEYS.forEach((k, i) => {
        p.arrow(0, 0, k[0], k[1], alpha(tokCol[i], 0.9), 2.5, 10);
        p.text('k·' + QK_TOKENS[i], k[0], k[1], tokCol[i], { dx: k[0] >= 0 ? 6 : -6, dy: k[1] >= 0 ? -10 : 12, align: k[0] >= 0 ? 'left' : 'right', font: `600 12px ${P.fontBody}` });
      });
      p.arrow(0, 0, q[0], q[1], P.ink, 3.5, 13);
      p.dot(q[0], q[1], 7, P.surface, P.ink, 2.5);
      p.text('q', q[0], q[1], P.ink, { dx: 10, dy: -10, font: `700 14px ${P.fontMono}`, bg: alpha(P.surface, 0.85) });
    },
    [P, q],
    { aspect: 1, maxHeight: 300, minHeight: 220 },
  );

  useDrag(qk.canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      return p && Math.hypot(p.X(q[0]) - x, p.Y(q[1]) - y) < 18 ? 'q' : null;
    },
    onDrag: (_id, x, y) => {
      const p = plotRef.current!;
      const c = (v: number) => Math.max(-1.9, Math.min(1.9, Math.round(v * 10) / 10));
      setQ([c(p.invX(x)), c(p.invY(y))]);
    },
  });

  const vv = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const p = new Plot(ctx, cw, h, P, { xMin: -2, xMax: 2, yMin: -2, yMax: 2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      p.grid({ xStep: 1, yStep: 1, labels: false });
      VALUES.forEach((v, i) => {
        p.line(out[0], out[1], v[0], v[1], alpha(tokCol[i], 0.25 + w[i] * 0.75), 1 + w[i] * 9);
      });
      VALUES.forEach((v, i) => {
        p.dot(v[0], v[1], 6 + w[i] * 6, tokCol[i]);
        p.text('v·' + QK_TOKENS[i], v[0], v[1], tokCol[i], { dx: v[0] >= 0 ? 10 : -10, dy: v[1] >= 0 ? -12 : 14, align: v[0] >= 0 ? 'left' : 'right', font: `600 12px ${P.fontBody}` });
      });
      p.dot(out[0], out[1], 8, P.hl, P.ink, 2);
      p.text('출력', out[0], out[1], P.ink, { dx: 12, dy: 0, font: `700 12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, q],
    { aspect: 1, maxHeight: 300, minHeight: 220 },
  );

  return (
    <Figure
      no={2}
      title="한 단어의 어텐션 계산 따라가기"
      hint="q 화살표 끝을 끌어 보세요"
      caption={<>① 왼쪽: 질문 벡터 q와 각 단어의 열쇠 벡터 k. 방향이 비슷할수록 내적이 큽니다. ② 가운데: 내적을 √2로 나눈 뒤 소프트맥스로 합이 1인 가중치를 만듭니다. ③ 오른쪽: 값 벡터 v들을 가중치만큼 섞은 노란 점이 이 단어의 새로운 표현입니다. 벡터들은 2차원 예시 값입니다.</>}
    >
      <Seg
        label="질문하는 단어 (Query)"
        value={qi}
        onChange={(i) => {
          setQi(i);
          setQ(QUERIES[i]);
        }}
        options={QK_TOKENS.map((t, i) => ({ value: i, label: t }))}
      />
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">① q와 k 비교</div>
          <div ref={qk.wrapRef} className="canvas-box">
            <canvas ref={qk.canvasRef} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">② 점수 → 가중치</div>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Key</th>
                  <th style={{ textAlign: 'right' }}>q·k</th>
                  <th style={{ textAlign: 'right' }}>÷√2</th>
                  <th>가중치</th>
                </tr>
              </thead>
              <tbody>
                {QK_TOKENS.map((t, i) => (
                  <tr key={t}>
                    <td style={{ color: TOK_COLOR[i], fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</td>
                    <td className="num">{fmt(scores[i], 2)}</td>
                    <td className="num">{fmt(scaled[i], 2)}</td>
                    <td style={{ minWidth: 80 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${w[i] * 100}%`, height: '100%', background: TOK_COLOR[i] }} />
                        </div>
                        <span className="mono" style={{ fontSize: '0.75rem', width: 32, textAlign: 'right' }}>
                          {Math.round(w[i] * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--ink-2)', lineHeight: 1.8 }}>
            q = ({fmt(q[0], 1)}, {fmt(q[1], 1)})
            <br />
            출력 = Σ 가중치 × v = ({fmt(out[0], 2)}, {fmt(out[1], 2)})
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">③ v들의 가중 평균</div>
          <div ref={vv.wrapRef} className="canvas-box">
            <canvas ref={vv.canvasRef} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: transformer block ─────────────── */

interface Part {
  key: string;
  title: string;
  body: string;
}
const PARTS: Record<string, Part> = {
  embed: { key: 'embed', title: '토큰 임베딩', body: '입력 문장을 토큰으로 자르고, 각 토큰을 임베딩 표에서 찾아 벡터로 바꿉니다. 앞 장에서 본 바로 그 임베딩입니다.' },
  pos: { key: 'pos', title: '위치 정보', body: '어텐션은 단어들을 한꺼번에 보기 때문에 그대로 두면 순서를 모릅니다. "개가 사람을 물었다"와 "사람이 개를 물었다"를 구별하려고, 몇 번째 자리인지 알려 주는 벡터를 임베딩에 더합니다.' },
  mha: { key: 'mha', title: '멀티헤드 어텐션', body: '그림 1, 2에서 본 계산을 여러 개의 헤드가 동시에 합니다. 어떤 헤드는 주어와 동사를, 어떤 헤드는 바로 앞 단어를, 어떤 헤드는 대명사가 가리키는 대상을 봅니다. 각 헤드의 결과를 이어 붙인 뒤 행렬 하나로 섞습니다.' },
  add1: { key: 'add1', title: '잔차 연결과 층 정규화', body: '어텐션의 결과를 입력에 더합니다(잔차 연결). 층이 수십 개로 깊어져도 원래 정보와 기울기가 지름길로 흐를 수 있어 학습이 안정됩니다. 이어서 층 정규화로 각 벡터 값의 크기를 고르게 맞춥니다.' },
  ffn: { key: 'ffn', title: '피드포워드 신경망', body: '각 토큰의 벡터를 따로따로 2층짜리 신경망에 통과시킵니다. 어텐션이 "다른 단어에서 정보 모으기"라면, 피드포워드는 "모은 정보를 소화하기"입니다. 모델이 외운 지식의 상당 부분이 이 층의 가중치에 저장된다고 봅니다.' },
  add2: { key: 'add2', title: '잔차 연결과 층 정규화', body: '피드포워드 결과도 다시 입력에 더하고 정규화합니다. 여기까지가 트랜스포머 블록 하나이고, 대형 모델은 이런 블록을 수십에서 백 개 넘게 쌓습니다.' },
  out: { key: 'out', title: '출력: 다음 토큰 확률', body: '마지막 블록을 지난 벡터에 행렬을 곱해 어휘 수만큼의 점수를 만들고, 소프트맥스로 확률을 냅니다. 언어 모델은 이 확률에서 다음 토큰을 고릅니다. 다음 장에서 자세히 봅니다.' },
};

function BlockFigure() {
  const [sel, setSel] = useState('mha');
  const part = PARTS[sel];
  const box = (key: string, x: number, y: number, w: number, h: number, label: string, fillVar: string) => {
    const active = sel === key;
    return (
      <g
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={label}
        onClick={() => setSel(key)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSel(key);
          }
        }}
        style={{ cursor: 'pointer', outline: 'none' }}
      >
        <rect x={x} y={y} width={w} height={h} rx={8} style={{ fill: fillVar, stroke: active ? 'var(--ink)' : 'var(--line-strong)', strokeWidth: active ? 2.5 : 1 }} />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 600, fontFamily: 'var(--font-body)' }}>
          {label}
        </text>
      </g>
    );
  };
  const arrowUp = (x: number, y1: number, y2: number) => (
    <g style={{ stroke: 'var(--ink-3)', strokeWidth: 1.5, fill: 'none' }}>
      <line x1={x} y1={y1} x2={x} y2={y2 + 5} />
      <path d={`M${x - 4} ${y2 + 7} L${x} ${y2} L${x + 4} ${y2 + 7}`} />
    </g>
  );
  const mix = (v: string, p: number) => `color-mix(in srgb, ${v} ${p}%, var(--surface))`;
  return (
    <Figure no={3} title="트랜스포머 블록 해부도" hint="각 부품을 눌러 보세요" caption={<>점선 상자 안이 블록 하나입니다. 옆으로 돌아가는 선이 잔차 연결입니다. GPT-3는 이런 블록 96개를 쌓았고, 각 블록에 어텐션 헤드가 96개 있습니다.</>}>
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'center' }}>
        <svg viewBox="0 0 320 520" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }} role="group" aria-label="트랜스포머 블록 구조도">
          {/* bottom: tokens */}
          <text x={160} y={505} textAnchor="middle" style={{ fill: 'var(--ink-2)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
            입력: "고양이가 매트 위에 …"
          </text>
          {arrowUp(160, 490, 470)}
          {box('embed', 40, 432, 150, 38, '토큰 임베딩', mix('var(--c-math)', 18))}
          <text x={205} y={451} dominantBaseline="central" style={{ fill: 'var(--ink-2)', fontSize: 18 }}>
            +
          </text>
          {box('pos', 222, 432, 80, 38, '위치', mix('var(--c-math)', 18))}
          {arrowUp(160, 432, 378)}
          {/* block */}
          <rect x={18} y={88} width={284} height={308} rx={12} style={{ fill: 'none', stroke: 'var(--line-strong)', strokeDasharray: '5 5' }} />
          <text x={292} y={110} textAnchor="end" style={{ fill: 'var(--ink-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            × N
          </text>
          {box('mha', 50, 330, 220, 46, '멀티헤드 어텐션', mix('var(--c-dl)', 22))}
          {arrowUp(160, 330, 296)}
          {box('add1', 50, 262, 220, 34, '더하기 & 정규화', mix('var(--hl)', 22))}
          {arrowUp(160, 262, 228)}
          {box('ffn', 50, 182, 220, 46, '피드포워드', mix('var(--c-ml)', 22))}
          {arrowUp(160, 182, 148)}
          {box('add2', 50, 114, 220, 34, '더하기 & 정규화', mix('var(--hl)', 22))}
          {/* residual paths */}
          <path d="M160 392 H36 V279 H50" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.8 }} />
          <path d="M160 245 H36 V131 H50" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.8 }} />
          {arrowUp(160, 114, 66)}
          {box('out', 60, 28, 200, 38, '다음 토큰 확률', mix('var(--pos)', 22))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="figure-hint">선택한 부품</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem' }}>{part.title}</div>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 'var(--fs-sm)', lineHeight: 1.75 }}>{part.body}</p>
          <div className="btn-row" style={{ marginTop: 6 }}>
            {Object.values(PARTS)
              .filter((p, i, arr) => arr.findIndex((x) => x.title === p.title) === i)
              .map((p) => (
                <button key={p.key} type="button" className="btn small" aria-pressed={sel === p.key} onClick={() => setSel(p.key)} style={sel === p.key || (p.key === 'add1' && sel === 'add2') ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                  {p.title}
                </button>
              ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Attention() {
  return (
    <>
      <h2>같은 단어, 다른 의미</h2>
      <p>
        "배가 고파서 배를 깎아 먹고 배를 타러 갔다." 이 문장에서 세 번 나온 "배"는 모두 뜻이 다릅니다. 사람은 주변 단어를 보고 자연스럽게 구별하지만, <a href="#embeddings">임베딩</a> 표는 세 "배"에게 같은 벡터를 줍니다. 단어의 뜻을 제대로 알려면 문맥을 봐야 합니다.
      </p>
      <p>
        예전의 언어 모델(RNN)은 문장을 앞에서부터 한 단어씩 읽으며 기억을 갱신했습니다. 그러다 보니 문장이 길어지면 앞부분을 잊어버리기 쉬웠습니다. 2017년 논문 「Attention Is All You Need」가 소개한 <T en="Transformer">트랜스포머</T>는 방식을 바꿨습니다. 모든 단어가 문장의 모든 단어를 한 번에, 직접 볼 수 있게 한 것입니다. 이때 누구를 얼마나 볼지 정하는 장치가 <T en="attention">어텐션</T>입니다.
      </p>
      <AttentionViewer />
      <p>
        헤드 1에서 "그것이"를 눌러 보세요. 대부분의 주의가 "고양이가"로 향합니다. "그것"이 매트가 아니라 고양이라는 것은 뒤에 나오는 "피곤했기"까지 봐야 알 수 있는데, 실제 학습된 모델에서도 이런 연결이 나타납니다. 온도를 낮추면 주의가 한두 단어에 몰리고, 높이면 모든 단어에 고르게 퍼집니다.
      </p>

      <h2>Query, Key, Value</h2>
      <p>도서관에서 책을 찾는 장면을 떠올려 봅시다. 찾고 싶은 내용을 적은 검색어가 있고, 책마다 제목 표지가 붙어 있고, 책을 펼치면 내용이 있습니다. 어텐션은 각 단어가 이 세 가지 역할을 동시에 하도록 만듭니다.</p>
      <ul>
        <li>
          <T en="Query">질문 q</T>: "나는 어떤 정보가 필요한가?"
        </li>
        <li>
          <T en="Key">열쇠 k</T>: "나는 이런 정보를 가지고 있다"는 표지
        </li>
        <li>
          <T en="Value">값 v</T>: 실제로 건네줄 내용
        </li>
      </ul>
      <p>
        세 벡터는 단어의 임베딩 <M>{'\\mathbf{x}'}</M>에 학습되는 행렬 세 개를 곱해서 만듭니다. <M>{'\\mathbf{q} = W_Q\\mathbf{x}'}</M>, <M>{'\\mathbf{k} = W_K\\mathbf{x}'}</M>, <M>{'\\mathbf{v} = W_V\\mathbf{x}'}</M>입니다. 그다음 내 질문과 각 단어의 열쇠를 <a href="#vectors">내적</a>해서 점수를 매기고, 소프트맥스로 확률처럼 바꾼 뒤, 그 비율대로 값들을 섞습니다.
      </p>
      <QKVFigure />
      <p>이 과정을 모든 단어에 대해 한꺼번에 행렬로 계산하면 트랜스포머 논문의 그 유명한 식이 됩니다.</p>
      <MB note="Q, K, V는 모든 단어의 q, k, v를 행으로 쌓은 행렬이고, d는 벡터의 차원입니다.">{'\\text{Attention}(Q, K, V) = \\text{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d}}\\right)V'}</MB>
      <Callout kind="intuition">
        왜 <M>{'\\sqrt{d}'}</M>로 나눌까요? 차원이 커지면 내적 값도 덩달아 커집니다. 점수가 너무 크면 소프트맥스가 가장 큰 하나에만 거의 100%를 주게 되고, 나머지 단어로는 기울기가 거의 흐르지 않아 학습이 잘 안 됩니다. 그림 1에서 온도를 아주 낮췄을 때와 같은 상태입니다. <M>{'\\sqrt{d}'}</M>로 나누면 차원과 상관없이 점수의 크기가 적당하게 유지됩니다.
      </Callout>

      <h2>머리가 여러 개인 이유</h2>
      <p>
        문장을 이해하려면 여러 관계를 동시에 봐야 합니다. 주어와 동사, 대명사와 그 대상, 바로 앞 단어와의 연결 같은 것들이죠. 그래서 트랜스포머는 서로 다른 <M>{'W_Q, W_K, W_V'}</M>를 가진 어텐션을 여러 개 나란히 돌립니다. 이것을 <T en="multi-head attention">멀티헤드 어텐션</T>이라고 합니다. 그림 1의 헤드 2는 거의 항상 바로 앞 단어만 보는데, 실제 모델에서도 이런 단순한 헤드가 흔하게 발견됩니다.
      </p>
      <p>
        그림 1의 "뒤쪽 단어 가리기"는 GPT 같은 언어 모델이 쓰는 방식입니다. 다음 단어를 예측하도록 학습하는데 뒤에 올 단어를 미리 보면 반칙이니, 각 단어가 자기보다 앞에 있는 단어만 보도록 가립니다. 그래도 "그것이"는 앞에 있는 "고양이가"를 볼 수 있습니다.
      </p>

      <h2>트랜스포머 블록</h2>
      <p>어텐션 하나만으로 모델이 되지는 않습니다. 어텐션과 몇 가지 부품을 묶은 블록을 여러 층 쌓은 것이 트랜스포머입니다.</p>
      <BlockFigure />
      <p>
        층이 깊어질수록 각 단어의 벡터에는 문맥 정보가 점점 더 많이 섞입니다. 첫 층에서 "배"는 그냥 "배"이지만, 몇 층을 지나면 "깎아 먹는 과일 배"를 뜻하는 벡터로 바뀌어 있습니다. 이렇게 문맥을 품은 벡터 덕분에 번역, 요약, 질문 답변을 모두 같은 구조로 해낼 수 있습니다.
      </p>
      <Callout kind="key">
        어텐션은 각 단어가 질문(q)을 던지고, 다른 단어들의 열쇠(k)와 비교해 관련 있는 단어의 값(v)을 모아 오는 장치입니다. 트랜스포머는 이 어텐션과 피드포워드 층을 잔차 연결로 묶어 수십 층 쌓은 구조입니다.
      </Callout>
      <Quiz
        q={<>어텐션 점수를 <M>{'\\sqrt{d}'}</M>로 나누는 가장 중요한 이유는?</>}
        options={['계산 속도를 높이려고', '차원이 클 때 점수가 너무 커져 소프트맥스가 한쪽으로 쏠리는 것을 막으려고', '가중치의 합을 1로 만들려고', '단어의 순서 정보를 넣으려고']}
        answer={1}
        explain={<>내적은 차원이 커질수록 커지는 경향이 있습니다. 점수가 크면 소프트맥스가 사실상 하나만 고르게 되어 학습이 불안정해집니다. 가중치의 합을 1로 만드는 것은 소프트맥스의 역할이고, 순서 정보는 위치 인코딩이 담당합니다.</>}
      />
    </>
  );
}

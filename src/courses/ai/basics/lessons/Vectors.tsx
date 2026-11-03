import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, M, MB, Quiz, Readout, Slider, T, Legend } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { usePalette, alpha } from '../../../../lib/theme';
import type { Vec2 } from '../../../../lib/math';

/* ─────────────── Figure 1: two draggable vectors ─────────────── */

function DotProductFigure() {
  const P = usePalette();
  const [a, setA] = useState<Vec2>([3, 1]);
  const [b, setB] = useState<Vec2>([1.5, 2.5]);
  const [showProj, setShowProj] = useState(true);
  const plotRef = useRef<Plot | null>(null);

  const dot = a[0] * b[0] + a[1] * b[1];
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  const cos = la && lb ? dot / (la * lb) : 0;
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  const projLen = la ? dot / la : 0;
  const proj: Vec2 = la ? [(a[0] / la) * projLen, (a[1] / la) * projLen] : [0, 0];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -4.5, xMax: 4.5, yMin: -3.5, yMax: 3.5, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plotRef.current = plot;
      plot.grid({ xStep: 1, yStep: 1, labels: false });
      // tick numbers along axes
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      for (let x = Math.ceil(plot.xMin); x <= plot.xMax; x++) if (x) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 13);
      ctx.textAlign = 'right';
      for (let y = Math.ceil(plot.yMin); y <= plot.yMax; y++) if (y) ctx.fillText(String(y), plot.X(0) - 5, plot.Y(y) + 3);

      // angle arc
      const angA = Math.atan2(a[1], a[0]);
      const angB = Math.atan2(b[1], b[0]);
      let d = angB - angA;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(plot.X(0), plot.Y(0));
      ctx.arc(plot.X(0), plot.Y(0), 34, -angA, -angA - d, d > 0);
      ctx.closePath();
      ctx.fillStyle = alpha(P.hl, 0.22);
      ctx.fill();

      if (showProj && la > 0.05) {
        // line through a
        plot.slopeLine(0, 0, Math.abs(a[0]) < 1e-6 ? 1e6 : a[1] / a[0], alpha(P.neg, 0.25), 1, [4, 4]);
        // perpendicular drop
        plot.line(b[0], b[1], proj[0], proj[1], P.ink3, 1.5, [3, 4]);
        // projection vector
        plot.line(0, 0, proj[0], proj[1], dot >= 0 ? P.good : P.bad, 7);
        plot.text('사영', proj[0], proj[1], dot >= 0 ? P.good : P.bad, { dx: 8, dy: 14, font: `600 12px ${P.fontBody}` });
      }
      plot.arrow(0, 0, a[0], a[1], P.neg, 3, 13);
      plot.arrow(0, 0, b[0], b[1], P.pos, 3, 13);
      plot.dot(a[0], a[1], 7, P.surface, P.neg, 2.5);
      plot.dot(b[0], b[1], 7, P.surface, P.pos, 2.5);
      plot.text(`a = (${fmt(a[0], 1)}, ${fmt(a[1], 1)})`, a[0], a[1], P.neg, { dx: 12, dy: -12, bg: alpha(P.surface, 0.85) });
      plot.text(`b = (${fmt(b[0], 1)}, ${fmt(b[1], 1)})`, b[0], b[1], P.pos, { dx: 12, dy: -12, bg: alpha(P.surface, 0.85) });
    },
    [P, a, b, showProj],
    { aspect: 1.55, maxHeight: 460 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      if (Math.hypot(p.X(a[0]) - x, p.Y(a[1]) - y) < 16) return 'a';
      if (Math.hypot(p.X(b[0]) - x, p.Y(b[1]) - y) < 16) return 'b';
      return null;
    },
    onDrag: (id, x, y) => {
      const p = plotRef.current!;
      const snap = (v: number) => Math.round(v * 10) / 10;
      const v: Vec2 = [snap(Math.max(p.xMin + 0.2, Math.min(p.xMax - 0.2, p.invX(x)))), snap(Math.max(p.yMin + 0.2, Math.min(p.yMax - 0.2, p.invY(y))))];
      if (id === 'a') setA(v);
      else setB(v);
    },
  });

  const verdict = Math.abs(cos) < 0.05 ? '거의 직각 → 서로 무관' : cos > 0.95 ? '거의 같은 방향' : cos < -0.95 ? '거의 정반대 방향' : cos > 0 ? '대체로 같은 쪽' : '대체로 반대쪽';

  return (
    <Figure no={1} title="두 벡터의 내적" hint="화살표 끝의 동그라미를 끌어 보세요" caption={<>초록 막대는 b를 a 방향으로 눌러 비춘 그림자(사영)입니다. 내적은 이 그림자의 길이에 |a|를 곱한 값이라서, b가 a 반대쪽을 향하면 그림자가 뒤로 생기고 내적이 음수가 됩니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="a · b (내적)" value={fmt(dot, 2)} color={dot >= 0 ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="사이각 θ" value={fmt(angle, 1) + '°'} />
            <Readout label="|a|" value={fmt(la, 2)} color="var(--neg)" />
            <Readout label="|b|" value={fmt(lb, 2)} color="var(--pos)" />
            <Readout label="cos θ (코사인 유사도)" value={fmt(cos, 3)} />
            <Readout label="사영 길이" value={fmt(projLen, 2)} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            판정: <strong>{verdict}</strong>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
            {fmt(a[0], 1)}×{fmt(b[0], 1)} + {fmt(a[1], 1)}×{fmt(b[1], 1)}
            <br />= {fmt(a[0] * b[0], 2)} + {fmt(a[1] * b[1], 2)} = <strong>{fmt(dot, 2)}</strong>
          </div>
          <Check label="사영(그림자) 보기" checked={showProj} onChange={setShowProj} />
          <Legend
            items={[
              { color: 'var(--neg)', label: '벡터 a', shape: 'ln' },
              { color: 'var(--pos)', label: '벡터 b', shape: 'ln' },
              { color: 'var(--hl)', label: '사이각', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: taste vectors & cosine similarity ─────────────── */

const GENRES = ['액션', '로맨스', 'SF', '공포'];
const PEOPLE: { name: string; v: number[] }[] = [
  { name: '민준', v: [9, 2, 8, 6] },
  { name: '서연', v: [2, 9, 3, 1] },
  { name: '도윤', v: [7, 6, 2, 1] },
  { name: '하은', v: [1, 3, 9, 8] },
];

function cosine(a: number[], b: number[]) {
  const d = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  return na && nb ? d / (na * nb) : 0;
}

function TasteFigure() {
  const [me, setMe] = useState([8, 3, 7, 4]);
  const sims = useMemo(() => PEOPLE.map((p) => ({ ...p, s: cosine(me, p.v) })).sort((x, y) => y.s - x.s), [me]);
  const best = sims[0];
  return (
    <Figure no={2} title="취향 벡터로 친구 추천하기" hint="내 점수를 바꿔 보세요" caption={<>4차원이라 그림으로 그릴 수는 없지만 계산은 2차원과 똑같습니다. 각 사람을 장르 점수 4개짜리 벡터로 보고, 나와의 코사인 유사도가 가장 큰 사람을 추천합니다. 넷플릭스나 유튜브의 추천도 원리는 이와 같습니다.</>}>
      <div className="fig-split left">
        <div className="controls">
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>나의 취향 (0~10점)</div>
          {GENRES.map((g, i) => (
            <Slider key={g} id={`taste-${i}`} label={g} value={me[i]} min={0} max={10} step={1} onChange={(v) => setMe((m) => m.map((x, j) => (j === i ? v : x)))} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>사람</th>
                  {GENRES.map((g) => (
                    <th key={g} style={{ textAlign: 'right' }}>
                      {g}
                    </th>
                  ))}
                  <th style={{ width: '38%' }}>나와의 유사도 (cos θ)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>나</strong>
                  </td>
                  {me.map((x, i) => (
                    <td key={i} className="num">
                      <strong>{x}</strong>
                    </td>
                  ))}
                  <td />
                </tr>
                {sims.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    {p.v.map((x, i) => (
                      <td key={i} className="num">
                        {x}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(0, p.s) * 100}%`, height: '100%', background: p === best ? 'var(--good)' : 'var(--accent)', transition: 'width .2s' }} />
                        </div>
                        <span className="mono" style={{ width: 42, textAlign: 'right' }}>
                          {fmt(p.s, 2)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            취향이 가장 비슷한 사람: <strong style={{ color: 'var(--good)' }}>{best.name}</strong> (유사도 {fmt(best.s, 3)})
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Vectors() {
  return (
    <>
      <h2>데이터는 숫자의 목록이다</h2>
      <p>
        컴퓨터에게 집 한 채를 보여 주려면 어떻게 해야 할까요? 면적 84㎡, 방 3개, 지은 지 12년. 이렇게 특징을 순서대로 적은 숫자 목록 <M>{'[84,\\ 3,\\ 12]'}</M>가 컴퓨터가 보는 집입니다. 이런 숫자 목록을 <T en="vector">벡터</T>라고 부릅니다.
      </p>
      <p>
        AI가 다루는 거의 모든 것이 벡터입니다. 28×28 흑백 손글씨 이미지는 픽셀 밝기 784개짜리 벡터이고, 언어 모델 안에서 단어 하나는 수천 개의 숫자로 된 벡터입니다. 숫자 개수를 벡터의 <T en="dimension">차원</T>이라고 합니다.
      </p>
      <MB note="n차원 벡터. 굵은 글씨나 화살표로 벡터임을 표시합니다.">{'\\mathbf{a} = (a_1, a_2, \\dots, a_n)'}</MB>
      <p>
        2차원 벡터는 평면 위의 화살표로 그릴 수 있습니다. 원점에서 출발해 <M>{'(a_1, a_2)'}</M>에서 끝나는 화살표죠. 화살표의 길이가 벡터의 <T en="norm">크기</T>이고, 피타고라스 정리로 구합니다.
      </p>
      <MB>{'\\lVert \\mathbf{a} \\rVert = \\sqrt{a_1^2 + a_2^2 + \\cdots + a_n^2}'}</MB>

      <h2>내적: 두 벡터가 얼마나 같은 쪽을 보는가</h2>
      <p>
        두 벡터의 <T en="dot product">내적</T>은 같은 자리의 숫자끼리 곱해서 모두 더한 값입니다. 계산은 단순하지만 의미가 풍부합니다. 아래 그림에서 두 화살표를 움직이며 내적이 어떻게 변하는지 보세요.
      </p>
      <DotProductFigure />
      <MB note="왼쪽은 계산하는 방법, 오른쪽은 기하학적 의미입니다. 둘은 언제나 같은 값입니다.">{'\\mathbf{a}\\cdot\\mathbf{b} = \\sum_{i=1}^{n} a_i b_i = \\lVert\\mathbf{a}\\rVert\\,\\lVert\\mathbf{b}\\rVert\\cos\\theta'}</MB>
      <Callout kind="intuition">
        <ul style={{ margin: 0 }}>
          <li>
            같은 방향을 볼수록 내적이 크고 <strong>양수</strong>입니다.
          </li>
          <li>
            직각이면 내적은 정확히 <strong>0</strong>입니다. 한쪽이 다른 쪽에 대해 아무 정보도 주지 않는다는 뜻입니다.
          </li>
          <li>
            반대 방향을 보면 <strong>음수</strong>입니다.
          </li>
        </ul>
      </Callout>
      <p>
        내적에서 길이의 효과를 빼고 방향만 비교하고 싶다면 두 크기로 나눠 줍니다. 이것이 <T en="cosine similarity">코사인 유사도</T>이고 항상 −1에서 1 사이입니다. 검색 엔진, 추천 시스템, 그리고 뒤에서 볼 임베딩과 어텐션이 모두 이 값으로 "비슷함"을 잽니다.
      </p>
      <MB>{'\\text{cos\\_sim}(\\mathbf{a},\\mathbf{b}) = \\frac{\\mathbf{a}\\cdot\\mathbf{b}}{\\lVert\\mathbf{a}\\rVert\\,\\lVert\\mathbf{b}\\rVert}'}</MB>

      <h2>고차원에서도 똑같이</h2>
      <p>4차원 이상은 머릿속에 그릴 수 없지만 걱정할 필요 없습니다. 내적 공식은 차원이 몇이든 "곱해서 더하기"로 똑같이 작동하고, 2차원에서 얻은 직관(같은 방향이면 크다)도 그대로 통합니다.</p>
      <TasteFigure />

      <h2>신경망 속의 내적</h2>
      <p>
        다음 장들에서 자주 보게 될 식을 미리 하나 보여 드리겠습니다. 인공 뉴런 하나는 입력 벡터 <M>{'\\mathbf{x}'}</M>와 가중치 벡터 <M>{'\\mathbf{w}'}</M>의 내적에 편향 <M>{'b'}</M>를 더합니다.
      </p>
      <MB note="뉴런은 입력이 자신이 좋아하는 패턴(w)과 얼마나 같은 방향인지 재는 장치입니다.">{'z = \\mathbf{w}\\cdot\\mathbf{x} + b'}</MB>
      <Callout kind="key">
        벡터는 데이터를 담는 그릇이고, 내적은 두 그릇이 얼마나 닮았는지 재는 자입니다. 이 두 가지만으로도 추천, 검색, 뉴런의 계산을 설명할 수 있습니다.
      </Callout>
      <Quiz
        q="두 벡터 a = (2, 1), b = (−1, 2)의 내적은 얼마이고, 두 벡터 사이의 각은?"
        options={['0, 직각', '4, 예각', '−4, 둔각', '3, 예각']}
        answer={0}
        explain={<>2×(−1) + 1×2 = 0 입니다. 내적이 0이면 cos θ = 0이므로 두 벡터는 직각입니다. 그림 1에서 a를 (2, 1), b를 (−1, 2)에 놓아 확인해 보세요.</>}
      />
    </>
  );
}

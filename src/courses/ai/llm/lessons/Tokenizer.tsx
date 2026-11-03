import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { korNum } from '../../deep/lessons/sequence';
import { MAX_MERGES, PAIRS, charBPE, charCount, encodeBytes, hex, mixModel, normalizeSpaces, tokenCurve, truncateModel, utf8, type Mix, type Tok } from './build';
import './build.css';

/** A token string with its leading space drawn as ▁. */
function TokText({ s }: { s: string }) {
  return (
    <>
      {Array.from(s).map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className="sp">
            ▁
          </span>
        ) : (
          ch
        ),
      )}
    </>
  );
}

const MIX_OPTIONS: { value: Mix; label: string }[] = [
  { value: 'en', label: '영어 90%' },
  { value: 'half', label: '반반' },
  { value: 'ko', label: '한국어 90%' },
];

/* ─────────────── Figure 1: BPE merges step by step ─────────────── */

const F1_PRESETS = [
  { value: 'low', label: 'low·newest', text: 'low low low low low lower lower newest newest newest newest newest newest widest widest widest' },
  { value: 'ko', label: '한국어', text: '학생들이 학교에서 공부를 한다. 학생이 학교에 간다. 학생들은 학교를 좋아한다. 선생님이 학생들에게 공부를 가르친다.' },
  { value: 'mix', label: '섞어서', text: 'the cat sat on the mat. 고양이가 매트 위에 앉았다. the cat is on the mat. 고양이가 매트 위에 있다.' },
];
const F1_MAX = 40;
const F1_CHARS = 240;

function BpeStepFigure() {
  const [text, setText] = useState(F1_PRESETS[0].text);
  const bpe = useMemo(() => charBPE(text, F1_MAX), [text]);
  const s = useStepper(bpe.frames.length, 2, text);
  const f = bpe.frames[s.i];
  const preset = F1_PRESETS.find((p) => p.text === text)?.value ?? 'custom';
  const willMerge = f.k < bpe.merges.length;
  const next = willMerge ? f.pairs[0] : null;
  const newTok = f.k > 0 ? bpe.sym[bpe.baseSize + f.k - 1] : null;
  const maxCount = f.pairs.length ? f.pairs[0].count : 1;
  const show = (t: string) => t.replace(/ /g, '▁');

  const note = next
    ? `가장 자주 붙어 나오는 쌍: ${show(next.a)} + ${show(next.b)} (${next.count}번). 다음 단계에서 합쳐 새 토큰 ${show(next.a + next.b)} 하나가 됩니다.`
    : f.k === 0
      ? '두 번 이상 붙어 나오는 쌍이 없어 합칠 것이 없습니다.'
      : f.k >= F1_MAX
        ? `병합 ${F1_MAX}번에서 멈췄습니다. 실제 토크나이저는 이것을 수만 번 반복합니다.`
        : '이제 두 번 이상 붙어 나오는 쌍이 없습니다. 이 말뭉치에서 BPE가 배울 수 있는 것은 여기까지입니다.';

  // mark the halves the next merge joins, left to right without overlap (as the merge itself does)
  const nextMarks = (seg: string[]) => {
    const marks = new Set<number>();
    if (!next) return marks;
    for (let j = 0; j < seg.length - 1; j++) {
      if (seg[j] === next.a && seg[j + 1] === next.b) {
        marks.add(j);
        marks.add(j + 1);
        j++;
      }
    }
    return marks;
  };

  return (
    <Figure
      no={1}
      title="BPE 학습: 가장 흔한 쌍을 하나씩 합치기"
      hint="재생하거나 말뭉치를 고쳐 보세요"
      caption={
        <>
          말뭉치를 단어 단위로 먼저 나눈 뒤(▁는 단어 앞의 공백), 처음에는 모든 글자가 토큰 하나씩입니다. 단계마다 단어 안에서 바로 붙어 있는 두 토큰의 쌍을 모두 세고, 가장 많이 나온 쌍(파란 막대, 말뭉치에서는 밑줄 친 두 조각)을 새 토큰 하나로 합칩니다. 노란 칩이 방금 생긴 토큰입니다. 같은 횟수가 여럿이면 먼저 등장한 글자로 된 쌍을 고릅니다. 맨 앞 예시는 Sennrich 등(2016)의 논문에 나오는 단어 빈도(low 5번, lower 2번, newest 6번, widest 3번)를 그대로 쓴 것입니다.
        </>
      }
    >
      <div className="controls">
        <Seg label="말뭉치" value={preset} onChange={(v) => setText(F1_PRESETS.find((p) => p.value === v)?.text ?? text)} options={F1_PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
        <textarea className="tk-input" aria-label="BPE를 학습할 말뭉치" rows={2} value={text} spellCheck={false} onChange={(e) => setText(e.target.value.slice(0, F1_CHARS))} />
      </div>
      <div className="fig-split" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div>
            <div className="tk-sub">지금의 토큰으로 자른 말뭉치</div>
            <div className="tk-flow" role="img" aria-label={`병합 ${f.k}번 뒤 말뭉치: 토큰 ${f.tokens}개`}>
              {bpe.order.map((wi, i) => {
                const seg = f.seg[wi];
                const marks = nextMarks(seg);
                return (
                  <span key={i} className="tk-word">
                    {seg.map((t, j) => (
                      <span key={j} className="tk-chip" data-c={j % 2} data-new={t === newTok || undefined} data-next={marks.has(j) || undefined}>
                        <TokText s={t} />
                      </span>
                    ))}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="tk-note" aria-live="polite">
            {note}
          </div>
          <div>
            <div className="tk-sub">붙어 나온 횟수가 많은 쌍</div>
            {f.pairs.length ? (
              <div className="tk-pairs">
                {f.pairs.map((p, j) => (
                  <div key={j} style={{ display: 'contents' }}>
                    <span className="pair">
                      <TokText s={p.a} /> + <TokText s={p.b} />
                    </span>
                    <div className="bar" data-top={(j === 0 && !!next) || undefined} style={{ width: `${(p.count / maxCount) * 100}%` }} />
                    <span className="cnt">{p.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="tk-sub">두 번 이상 나온 쌍이 없음</span>
            )}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="tk-bpe-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="병합 횟수" value={f.k} />
            <Readout label="어휘 크기" value={f.vocab} color="var(--accent)" />
            <Readout label="처음 토큰 수 (글자)" value={bpe.frames[0].tokens} />
            <Readout label="지금 토큰 수" value={f.tokens} color="var(--pos)" />
          </div>
        </div>
      </div>
      <div className="tk-vocab" style={{ marginTop: 12 }}>
        <span className="lbl">어휘 ({f.vocab}개):</span>
        {bpe.sym.slice(0, bpe.baseSize).map((t, j) => (
          <span key={'b' + j} className="tk-chip" data-base>
            <TokText s={t} />
          </span>
        ))}
        {bpe.sym.slice(bpe.baseSize, bpe.baseSize + f.k).map((t, j) => (
          <span key={'m' + j} className="tk-chip" data-new={j === f.k - 1 || undefined}>
            <TokText s={t} />
          </span>
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: bytes and Korean ─────────────── */

const F2_PRESETS = [
  { value: 'ko', label: '한국어', text: PAIRS[0].ko },
  { value: 'en', label: 'English', text: PAIRS[0].en },
  { value: 'num', label: '숫자', text: 'In 2019 and 2021, 12345 + 67890 = 80235' },
];
const F2_CHARS = 60;

/** A byte that is not a whole character: a space shows as ▁, anything else as hex. */
const byteLabel = (b: number) => (b === 0x20 ? '▁' : hex(b));

function TokChips({ toks }: { toks: Tok[] }) {
  return (
    <>
      {toks.map((t, i) =>
        t.text !== null ? (
          <span key={i} className="tk-chip" data-c={i % 2}>
            <TokText s={t.text} />
          </span>
        ) : (
          <span key={i} className="tk-chip" data-partial title={`글자의 일부인 바이트 ${t.bytes.map(hex).join(' ')}`}>
            {t.bytes.map(byteLabel).join(' ')}
          </span>
        ),
      )}
    </>
  );
}

function stats(text: string, model: ReturnType<typeof truncateModel>) {
  const chars = charCount(text);
  const bytes = utf8(normalizeSpaces(text)).length;
  const tokens = encodeBytes(text, model).length;
  return { chars, bytes, tokens, perChar: chars ? tokens / chars : NaN };
}

function ByteFigure() {
  const [mix, setMix] = useState<Mix>('en');
  const full = useMemo(() => mixModel(mix), [mix]);
  const [want, setWant] = useState(MAX_MERGES);
  const k = Math.min(want, full.merges.length);
  const model = useMemo(() => truncateModel(full, k), [full, k]);
  const [text, setText] = useState(F2_PRESETS[0].text);
  const toks = useMemo(() => encodeBytes(text, model), [text, model]);
  const preset = F2_PRESETS.find((p) => p.text === text)?.value ?? 'custom';
  const chars = Array.from(normalizeSpaces(text));
  const st = stats(text, model);
  const ko = stats(PAIRS[0].ko, model);
  const en = stats(PAIRS[0].en, model);

  return (
    <Figure
      no={2}
      title="바이트에서 시작하는 BPE와 한국어"
      hint="학습 데이터의 비율과 병합 수를 바꿔 보세요"
      caption={
        <>
          첫 줄은 입력을 UTF-8 바이트(16진수)로 바꾼 것이고, 주황 테두리는 바이트가 여러 개인 글자입니다. 둘째 줄은 같은 입력을 바이트 단위 BPE로 자른 결과입니다. 점선 칩은 한 글자를 다 채우지 못한 바이트 조각입니다. 토크나이저는 이 글에서 쓴 예문 여덟 쌍과 겹치지 않는 약 3,600바이트의 영어·한국어 글에서 이 브라우저가 직접 학습한 것이며, 병합 수를 줄이면 앞쪽에서 배운 병합만 씁니다. 표의 두 문장은 같은 뜻의 한국어와 영어 문장입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="학습 데이터" value={mix} onChange={setMix} options={MIX_OPTIONS} />
        <Slider id="tk-byte-merges" label="병합 수" value={k} min={0} max={full.merges.length} step={1} onChange={setWant} format={(v) => `${v} (어휘 ${256 + v})`} />
      </div>
      <div className="controls" style={{ marginTop: 14 }}>
        <Seg label="입력" value={preset} onChange={(v) => setText(F2_PRESETS.find((p) => p.value === v)?.text ?? text)} options={F2_PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
        <input className="tk-input" type="text" aria-label="토큰으로 자를 문장" value={text} spellCheck={false} autoComplete="off" onChange={(e) => setText(Array.from(e.target.value).slice(0, F2_CHARS).join(''))} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        <div>
          <div className="tk-sub">UTF-8 바이트 ({st.bytes}개)</div>
          <div className="tk-bytes" role="img" aria-label={`글자 ${chars.length}개, 바이트 ${st.bytes}개`}>
            {chars.map((ch, i) => {
              const b = utf8(ch);
              return (
                <span key={i} className="tk-byte-group" data-multi={b.length > 1 || undefined}>
                  <span className="ch">{ch === ' ' ? '▁' : ch}</span>
                  <span className="hx">{b.map(hex).join(' ')}</span>
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <div className="tk-sub">토큰 ({toks.length}개)</div>
          <div className="tk-flow" aria-live="polite" aria-label={`토큰 ${toks.length}개`}>
            <TokChips toks={toks} />
          </div>
        </div>
        <div className="readouts tk-readouts4">
          <Readout label="글자 (공백 제외)" value={st.chars} />
          <Readout label="바이트" value={st.bytes} />
          <Readout label="토큰" value={st.tokens} color="var(--accent)" />
          <Readout label="글자당 토큰" value={isFinite(st.perChar) ? fmt(st.perChar, 2) : '—'} color="var(--pos)" />
        </div>
        <div className="tbl-wrap" style={{ margin: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>같은 뜻의 문장</th>
                <th style={{ textAlign: 'right' }}>글자</th>
                <th style={{ textAlign: 'right' }}>바이트</th>
                <th style={{ textAlign: 'right' }}>토큰</th>
                <th style={{ textAlign: 'right' }}>글자당</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: '한국어', s: ko },
                { label: '영어', s: en },
              ].map(({ label, s }) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{s.chars}</td>
                  <td className="num">{s.bytes}</td>
                  <td className="num">{s.tokens}</td>
                  <td className="num">{fmt(s.perChar, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: vocabulary size trade-off ─────────────── */

const CTX = 1024;

function VocabFigure() {
  const P = usePalette();
  const [mix, setMix] = useState<Mix>('en');
  const [d, setD] = useState(768);
  const [untied, setUntied] = useState(false);
  const model = useMemo(() => mixModel(mix), [mix]);
  const curves = useMemo(
    () => ({
      ko: tokenCurve(
        model,
        PAIRS.map((p) => p.ko),
      ).map((t) => t / PAIRS.length),
      en: tokenCurve(
        model,
        PAIRS.map((p) => p.en),
      ).map((t) => t / PAIRS.length),
    }),
    [model],
  );
  const M = model.merges.length;
  const [want, setWant] = useState(MAX_MERGES);
  const k = Math.min(want, M);
  const V = 256 + k;
  const mats = untied ? 2 : 1;
  const params = V * d * mats;
  const koChars = PAIRS.reduce((a, p) => a + charCount(p.ko), 0) / PAIRS.length;
  const enChars = PAIRS.reduce((a, p) => a + charCount(p.en), 0) / PAIRS.length;
  const koFit = Math.round((CTX * koChars) / curves.ko[k]);
  const enFit = Math.round((CTX * enChars) / curves.en[k]);
  const xMax = 256 + MAX_MERGES;
  const pMax = xMax * d * mats;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const topH = Math.round(h * 0.58);
      const pad = { l: 46, r: 14, t: 12, b: 26 };
      const top = new Plot(ctx, w, topH, P, { xMin: 256, xMax, yMin: 0, yMax: 80, pad });
      top.grid({ xStep: 100, yStep: 20, yLabel: '문장당 토큰', labels: true });
      const series: [number[], string][] = [
        [curves.ko, P.pos],
        [curves.en, P.neg],
      ];
      top.line(V, 0, V, 80, alpha(P.ink, 0.4), 1.2, [4, 4]);
      for (const [c, col] of series) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        c.forEach((v, i) => (i ? ctx.lineTo(top.X(256 + i), top.Y(v)) : ctx.moveTo(top.X(256 + i), top.Y(v))));
        ctx.stroke();
        top.dot(V, c[k], 4.5, col, P.surface, 2);
      }

      ctx.save();
      ctx.translate(0, topH);
      const bot = new Plot(ctx, w, h - topH, P, { xMin: 256, xMax, yMin: 0, yMax: pMax * 1.05, pad: { ...pad, t: 14, b: 28 } });
      bot.grid({ xStep: 100, yStep: niceParamStep(pMax), fmt: (v) => (v === 0 ? '0' : korNum(v)), yLabel: untied ? '임베딩 + 출력 행렬' : '임베딩 행렬 (출력과 공유)', xLabel: '어휘 크기 V' });
      bot.line(V, 0, V, pMax * 1.05, alpha(P.ink, 0.4), 1.2, [4, 4]);
      bot.line(256, 256 * d * mats, xMax, xMax * d * mats, P.stats2, 2.2);
      bot.dot(V, params, 4.5, P.stats2, P.surface, 2);
      ctx.restore();
    },
    [P, curves, k, V, d, mats, pMax, untied],
    { aspect: 1.45, maxHeight: 420, minHeight: 300 },
  );

  return (
    <Figure
      no={3}
      title="어휘 크기의 맞바꿈"
      hint="어휘 크기를 바꿔 보세요"
      caption={
        <>
          위: 그림 2의 토크나이저로 학습에 쓰지 않은 예문 여덟 쌍(같은 뜻의 한국어·영어 문장)을 잘랐을 때 문장당 평균 토큰 수입니다. 어휘 크기 256은 병합이 없는 상태, 즉 바이트 하나가 토큰 하나입니다. 아래: 어휘 크기 × d_model 크기의 임베딩 행렬에 든 파라미터 수입니다. 출력 층을 임베딩과 공유하지 않으면 같은 크기의 행렬이 하나 더 생깁니다. 곡선이 중간에 끝나는 것은 이 작은 말뭉치에서 두 번 이상 나오는 쌍이 바닥났기 때문입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`어휘 ${V}개: 한국어 문장당 토큰 ${fmt(curves.ko[k], 1)}, 영어 ${fmt(curves.en[k], 1)}, 행렬 파라미터 ${params.toLocaleString('ko-KR')}개`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="학습 데이터" value={mix} onChange={setMix} options={MIX_OPTIONS} />
          <Slider id="tk-vocab" label="어휘 크기 V" value={V} min={256} max={256 + M} step={1} onChange={(v) => setWant(v - 256)} />
          <Seg
            label="d_model"
            value={d}
            onChange={setD}
            options={[
              { value: 128, label: '128' },
              { value: 768, label: '768' },
            ]}
          />
          <Check label="출력 행렬 따로 두기" checked={untied} onChange={setUntied} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="한국어 토큰/문장" value={fmt(curves.ko[k], 1)} color="var(--pos)" />
            <Readout label="영어 토큰/문장" value={fmt(curves.en[k], 1)} color="var(--neg)" />
            <Readout label={`${CTX.toLocaleString('ko-KR')}토큰에 담기는 한국어`} value={`${koFit.toLocaleString('ko-KR')}자`} color="var(--pos)" />
            <Readout label={`${CTX.toLocaleString('ko-KR')}토큰에 담기는 영어`} value={`${enFit.toLocaleString('ko-KR')}자`} color="var(--neg)" />
            <Readout label="행렬 파라미터" value={params.toLocaleString('ko-KR')} color="var(--c-stats-2)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '한국어 예문', shape: 'ln' },
          { color: 'var(--neg)', label: '영어 예문', shape: 'ln' },
          { color: 'var(--c-stats-2)', label: '행렬 파라미터 (V × d)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

function niceParamStep(max: number): number {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/* ─────────────── Lesson ─────────────── */

export default function Tokenizer() {
  return (
    <>
      <h2>어휘는 누가 정하나</h2>
      <p>
        <a href="#ai-basics/language-model">언어 모델 장</a>에서 모델이 글을 글자도 단어도 아닌 <T en="token">토큰</T> 단위로 읽고, 토큰마다 번호를 붙여 <a href="#ai-basics/embeddings">임베딩</a> 표에서 벡터를 꺼낸다는 것을 보았습니다. 그때 쓴 분할기는 손으로 정한 규칙이었습니다. 실제 모델에서는 어휘, 즉 토큰 목록 자체를 데이터에서 학습합니다. 어휘를 정하는 방법은 크게 세 가지를 생각해 볼 수 있습니다.
      </p>
      <ul>
        <li>
          <strong>글자 단위</strong>: 어휘가 작고 모르는 글자가 거의 없지만, 문장이 아주 긴 토큰 열이 됩니다. <a href="#ai-deep-learning/transformer">트랜스포머</a>의 어텐션 비용은 토큰 수의 제곱으로 늘고 문맥 길이도 토큰 수로 정해지므로, 같은 글이 길어지는 것은 그대로 비용입니다.
        </li>
        <li>
          <strong>단어 단위</strong>: 문장은 짧아지지만 어휘가 끝없이 커집니다. 학습 때 못 본 단어(신조어, 오타, 이름)는 "모르는 단어" 하나로 뭉개집니다. 한국어처럼 "학교", "학교에", "학교에서"가 모두 다른 형태로 나타나는 언어에서는 더 심합니다.
        </li>
        <li>
          <strong>그 사이의 조각(subword)</strong>: 자주 나오는 단어는 통째로, 드문 단어는 자주 나오는 조각 여러 개로 나타냅니다. 오늘날 대부분의 언어 모델이 이 방식을 씁니다.
        </li>
      </ul>
      <p>
        조각을 고르는 가장 널리 쓰이는 방법이 <T en="Byte Pair Encoding">BPE</T>입니다. 원래는 데이터 압축 기법이었는데, Sennrich 등이 2016년 기계 번역에서 드문 단어를 다루려고 어휘 학습에 가져왔습니다.
      </p>

      <h2>BPE: 가장 흔한 쌍을 합친다</h2>
      <p>규칙은 한 문장으로 끝납니다. 모든 글자를 토큰 하나로 놓고 시작해서, 말뭉치에서 바로 붙어 나오는 두 토큰의 쌍 중 가장 흔한 것을 새 토큰으로 합치는 일을 원하는 어휘 크기가 될 때까지 반복합니다.</p>
      <ol>
        <li>말뭉치를 공백과 문장 부호 기준으로 단어 조각으로 나누고 조각마다 몇 번 나왔는지 셉니다. 병합은 이 조각 안에서만 일어납니다.</li>
        <li>조각을 글자 하나하나로 쪼갭니다. 처음 어휘는 등장한 글자 전체입니다.</li>
        <li>모든 조각에서 이웃한 두 토큰의 쌍을 세고(조각의 빈도만큼 더해서) 가장 많이 나온 쌍을 고릅니다.</li>
        <li>그 쌍이 나오는 곳을 모두 새 토큰 하나로 바꾸고, 병합 규칙 목록 끝에 적습니다. 3으로 돌아갑니다.</li>
      </ol>
      <BpeStepFigure />
      <p>
        low·newest 예시를 끝까지 재생하면 15번 병합한 뒤 멈춥니다. 처음에는 es, est처럼 여러 단어에 걸쳐 나오는 조각이 먼저 생기고, 나중에는 ▁low, ▁newest처럼 단어 전체가 토큰이 됩니다. 처음 95개였던 토큰이 16개가 되어, 단어 16개가 토큰 하나씩이 됩니다. 어휘는 글자 11개에서 26개로 늘었습니다. 병합 한 번마다 어휘는 정확히 하나 늘고, 전체 토큰 수는 (같은 토큰이 셋 이상 연달아 있지 않다면) 그 쌍이 나온 횟수만큼 줄어듭니다. 그래서 BPE는 "토큰 수를 가장 많이 줄이는 병합"을 한 번에 하나씩 탐욕적으로 고르는 알고리즘이라고 볼 수도 있습니다.
      </p>
      <Code label="BPE 학습: 쌍을 세고 가장 흔한 것을 합친다">{`
// words: [{ syms: ['▁','l','o','w'], n: 5 }, ...]  조각과 빈도
function trainBPE(words, numMerges) {
  const merges = [];
  for (let k = 0; k < numMerges; k++) {
    const counts = new Map();                    // "a b" → 횟수
    for (const { syms, n } of words) {
      for (let i = 0; i < syms.length - 1; i++) {
        const key = syms[i] + ' ' + syms[i + 1];
        counts.set(key, (counts.get(key) ?? 0) + n);
      }
    }
    let best = null, bestCount = 1;
    for (const [key, c] of counts) if (c > bestCount) { best = key; bestCount = c; }
    if (!best) break;                            // 두 번 이상 나온 쌍이 없음
    const [a, b] = best.split(' ');
    merges.push([a, b]);
    for (const w of words) w.syms = mergePair(w.syms, a, b);
  }
  return merges;
}

function mergePair(syms, a, b) {                 // 왼쪽부터, 겹치지 않게
  const out = [];
  for (let i = 0; i < syms.length; i++) {
    if (syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; }
    else out.push(syms[i]);
  }
  return out;
}`}</Code>
      <p>
        이 코드는 병합할 때마다 모든 쌍을 처음부터 다시 셉니다. 실제 구현은 병합된 쌍이 들어 있는 조각만 다시 세어 개수를 고쳐 나가고, 가장 흔한 쌍을 빨리 찾으려고 <a href="#cs-algorithms/stack-queue-heap">힙</a>을 씁니다. 그림의 토크나이저도 바뀐 조각만 다시 셉니다.
      </p>

      <h2>배운 병합으로 새 글 자르기</h2>
      <p>
        학습이 끝나면 남는 것은 병합 규칙의 순서 목록입니다. 새 문장을 자를 때는 먼저 같은 방식으로 단어 조각으로 나누고, 각 조각을 글자로 쪼갠 뒤 <strong>먼저 배운 규칙부터</strong> 적용합니다. 지금 조각 안에 있는 쌍 중 규칙 목록에서 가장 앞에 있는 것을 합치고, 더 합칠 쌍이 없을 때까지 반복합니다. 학습 때와 같은 순서로 합치므로 학습 말뭉치에 있던 단어는 학습 때와 똑같이 잘립니다.
      </p>
      <Code label="학습한 병합으로 인코딩">{`
function encodeWord(word, merges) {
  const rank = new Map(merges.map(([a, b], i) => [a + ' ' + b, i]));
  let syms = Array.from(word);
  for (;;) {
    let best = -1;                               // 지금 있는 쌍 중 가장 먼저 배운 것
    for (let i = 0; i < syms.length - 1; i++) {
      const r = rank.get(syms[i] + ' ' + syms[i + 1]);
      if (r !== undefined && (best < 0 || r < best)) best = r;
    }
    if (best < 0) return syms;
    const [a, b] = merges[best];
    syms = mergePair(syms, a, b);
  }
}`}</Code>
      <p>
        <strong>미리 나누기.</strong> 단계 1처럼 병합 전에 글을 나누는 것을 <T en="pre-tokenization">사전 분할</T>이라고 합니다. 나누지 않으면 "the"와 다음 단어의 첫 글자가 합쳐진 "e▁c" 같은 토큰이 생겨 어휘가 낭비됩니다. GPT-2는 글자 묶음, 숫자 묶음, 문장 부호 묶음을 정규식으로 나누고 단어 앞의 공백 하나를 그 단어에 붙였습니다. 그래서 문장 맨 앞의 "low"와 문장 중간의 "▁low"는 서로 다른 토큰이 될 수 있습니다. 이 장의 그림들도 같은 방식으로 나누되, 첫 단어도 다른 단어처럼 보이게 맨 앞에 공백을 하나 붙입니다.
      </p>
      <p>
        <strong>특수 토큰.</strong> 어휘에는 학습으로 얻지 않은 토큰도 몇 개 들어갑니다. 문서의 끝을 알리는 토큰, 대화에서 누가 말하는지 표시하는 토큰, 길이를 맞추려고 채우는 토큰 같은 것입니다. 이 토큰들은 사전 분할 전에 따로 떼어 내므로 일반 글에 같은 글자열이 나와도 특수 토큰으로 바뀌지 않게 합니다. 시스템이 이 경계를 지키지 않으면 사용자가 입력한 글이 "문서 끝"이나 "다른 화자"로 해석되는 사고가 생깁니다.
      </p>

      <h2>바이트에서 시작하기</h2>
      <p>
        글자에서 시작하는 BPE에는 약점이 있습니다. 처음 어휘가 "학습 데이터에 나온 글자 전체"라서, 한자·이모지·드문 기호처럼 학습 때 못 본 글자는 여전히 표현할 수 없습니다. 유니코드에 정의된 글자는 십수만 개라 모두 넣어 두기도 어렵습니다. GPT-2는 글자 대신 <strong>UTF-8 바이트</strong>에서 시작했습니다. 바이트는 256가지뿐이고 어떤 글이든 바이트로 바꿀 수 있으므로 모르는 입력이 없습니다. GPT-2의 어휘 50,257개는 바이트 256개, 병합 50,000번으로 얻은 토큰, 문서 끝 특수 토큰 1개를 더한 것입니다.
      </p>
      <p>
        UTF-8에서 영어 알파벳과 숫자, 공백은 1바이트지만 한글 음절은 <strong>모두 3바이트</strong>입니다. "가"(U+AC00)부터 "힣"(U+D7A3)까지 11,172개 음절이 모두 3바이트로 저장됩니다. 예를 들어 "한"은 ED 95 9C입니다. 병합을 하나도 배우지 않은 바이트 BPE에서는 한국어 한 글자가 토큰 세 개입니다. 한국어가 토큰을 덜 쓰려면 이 세 바이트가 합쳐지는 병합, 나아가 음절끼리 합쳐지는 병합을 배워야 하고, 그러려면 학습 데이터에 한국어가 충분히 있어야 합니다.
      </p>
      <ByteFigure />
      <p>
        영어가 90%인 데이터로 배운 375번의 병합을 모두 쓰면, 예문 여덟 쌍에서 한국어는 글자당 2.31토큰, 영어는 글자당 0.50토큰을 씁니다. 같은 뜻을 전하는 데 한국어가 토큰을 2.12배 씁니다. 영어 쪽 병합은 ▁the, ▁books 같은 단어까지 자랐지만 한국어 쪽은 대부분 음절도 다 채우지 못한 바이트 조각으로 남아 있기 때문입니다. 학습 데이터를 반반으로 바꾸면 이 배율이 1.06배로, 한국어가 90%이면 0.58배로 뒤집힙니다. 실제 토크나이저도 같은 원리로, 학습 데이터에 영어가 많을수록 다른 언어는 토큰을 더 많이 씁니다. 토큰 수는 곧 요금, 응답 시간, 그리고 한 번에 넣을 수 있는 글의 양이므로, 다국어 모델을 만들 때는 토크나이저의 학습 데이터 비율을 따로 정합니다.
      </p>
      <Callout kind="note">
        병합이 바이트 경계를 무시하고 일어나므로, 한 토큰이 한 글자의 앞 두 바이트와 앞 글자의 마지막 바이트를 함께 담는 일도 생깁니다. 그림 2의 점선 칩이 그런 토큰입니다. 모델이 이런 토큰을 하나씩 내놓을 때는 한 글자가 완성되기 전까지 화면에 보여 줄 수 없으므로, 스트리밍 출력은 바이트를 모아 두었다가 완전한 글자가 되면 내보냅니다.
      </Callout>

      <h2>토큰이 만드는 이상한 일들</h2>
      <p>모델은 글자를 보지 않고 토큰 번호를 봅니다. 그래서 사람에게는 쉬운 일이 모델에게는 어렵기도 합니다.</p>
      <ul>
        <li>
          <strong>글자 세기.</strong> 영어 90% 토크나이저는 strawberry를 ▁st, ra, w, ber, r, y로 자릅니다. "r이 몇 개인가"에 답하려면 모델은 각 토큰 번호에 어떤 글자가 들었는지를 따로 외우고 있어야 합니다. 토큰 안의 글자는 입력에 직접 드러나지 않습니다.
        </li>
        <li>
          <strong>숫자.</strong> 그림 2의 숫자 예문을 반반 데이터로 학습한 토크나이저에 넣어 보세요. 학습 글에 두 번 나온 2019는 ▁2019 한 토큰이지만 2021은 ▁20, 2, 1 세 토큰이고, 12345는 공백 토큰 하나 뒤에 한 자리씩 다섯 토큰으로 잘립니다. 자릿수가 같은 수가 전혀 다른 모양으로 잘리니 자리 맞춤이 필요한 덧셈이 어려워집니다. 그래서 숫자는 항상 한 자리씩 자르도록 사전 분할을 정하는 모델도 있습니다.
        </li>
        <li>
          <strong>공백과 대소문자.</strong> "low"와 "▁low"와 "▁Low"는 서로 다른 번호입니다. 띄어쓰기 하나가 달라지면 모델이 보는 입력이 통째로 달라집니다.
        </li>
      </ul>

      <h2>어휘 크기의 맞바꿈</h2>
      <p>
        병합을 더 할수록, 즉 어휘가 클수록 문장은 짧은 토큰 열이 됩니다. 문맥 길이는 토큰 수로 정해지므로 같은 문맥에 더 많은 글이 들어가고, 생성할 때 토큰을 하나씩 내놓는 횟수도 줄어듭니다. 대신 대가가 있습니다.
      </p>
      <ul>
        <li>
          임베딩 행렬은 어휘 크기 V × d_model입니다. 출력 층도 모든 토큰에 점수를 매기므로 같은 크기의 행렬이 필요하고(임베딩과 공유하기도 합니다), 토큰 하나를 만들 때마다 약 <M>{'2Vd'}</M> FLOPs를 씁니다.
        </li>
        <li>어휘가 커질수록 각 토큰은 드물게 나옵니다. 드문 토큰의 임베딩은 학습 신호를 적게 받아 덜 다듬어집니다.</li>
      </ul>
      <VocabFigure />
      <p>
        영어 90% 토크나이저에서 병합이 없을 때(어휘 256) 예문은 한국어 문장당 66.8토큰, 영어 55.8토큰이고, 병합 375번을 다 쓰면(어휘 631) 한국어 48.0토큰, 영어 22.6토큰입니다. 영어는 절반 아래로 줄었지만 한국어는 28%만 줄었습니다. 그림 3에서 학습 데이터를 바꿔 보면 어느 쪽 곡선이 빨리 내려가는지가 바뀝니다. 곡선은 처음에 가파르고 점점 평평해집니다. 앞쪽 병합은 아주 흔한 쌍이라 토큰을 많이 줄이지만, 뒤로 갈수록 드문 쌍이라 줄이는 양이 적습니다. 반면 행렬 크기는 V에 정비례해서 늘어납니다.
      </p>
      <p>
        실제 규모로 옮겨 보면, GPT-2의 어휘 50,257개 × d_model 768이면 임베딩 행렬만 38,597,376개, 약 3,860만 개의 파라미터입니다. 124M 모델에서 약 31%를 차지합니다(<a href="#ai-deep-learning/transformer">트랜스포머 장</a>의 계산기 참고). 모델이 클수록 이 몫은 작아지므로, 큰 모델일수록 어휘를 크게 잡아 문장을 짧게 만드는 쪽이 유리해집니다. 다국어 모델의 어휘가 영어 위주 모델보다 큰 경우가 많은 것도 여러 언어의 흔한 조각을 모두 담아야 하기 때문입니다.
      </p>

      <Callout kind="key">
        토크나이저는 학습되는 것입니다. BPE는 가장 흔한 이웃 쌍을 하나씩 합쳐 어휘를 만들고, 인코딩할 때는 먼저 배운 병합부터 적용합니다. 바이트에서 시작하면 어떤 입력도 표현할 수 있지만, 한글처럼 여러 바이트로 된 글자는 학습 데이터에 충분히 있어야 짧게 잘립니다. 어휘를 키우면 문장이 짧아져 문맥과 생성 비용을 아끼는 대신 임베딩과 출력 층이 V에 비례해 커집니다.
      </Callout>
      <Quiz
        q="병합을 하나도 배우지 않은 바이트 단위 BPE에 공백 없이 '토큰화' 세 글자를 넣으면 토큰은 몇 개인가?"
        options={['1개', '3개', '6개', '9개']}
        answer={3}
        explain={<>바이트 단위 BPE의 처음 어휘는 바이트 256개뿐이고, UTF-8에서 한글 음절은 하나에 3바이트입니다. 그래서 세 글자는 9바이트, 곧 토큰 9개입니다. 한국어가 섞인 데이터로 병합을 배우면 세 바이트가 한 음절로, 다시 음절들이 한 단어로 합쳐지면서 이 수가 줄어듭니다.</>}
      />
    </>
  );
}

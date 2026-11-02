import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Slider, T } from '../components/ui';
import { softmax } from '../lib/math';
import { fmt } from '../lib/plot';

/* ─────────────── Figure 1: toy tokenizer ─────────────── */

const KO_VOCAB = ['인공지능', '데이터', '학습', '모델', '언어', '고양이', '오늘', '날씨', '사람', '컴퓨터', '트랜스포머', '신경망', '문장', '단어', '토큰'];
const KO_SUFFIX = ['에서는', '에게서', '으로는', '이라는', '에서', '으로', '에게', '까지', '부터', '처럼', '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '로', '만', '다', '요'];
const EN_VOCAB = ['attention', 'language', 'learn', 'model', 'token', 'trans', 'form', 'neat', 'data', 'believ', 'able', 'tion', 'ing', 'ers', 'ize', 'the', 'are', 'is', 'un', 'er', 'ed', 's'];

interface Tok {
  text: string;
  space: boolean;
}

function splitKorean(word: string): string[] {
  if (KO_VOCAB.includes(word)) return [word];
  let stem = word;
  let suf = '';
  for (const s of KO_SUFFIX) {
    if (word.length > s.length + 1 && word.endsWith(s)) {
      stem = word.slice(0, -s.length);
      suf = s;
      break;
    }
  }
  const parts: string[] = [];
  if (KO_VOCAB.includes(stem)) parts.push(stem);
  else {
    // try known vocab prefix, then 2-syllable chunks
    let rest = stem;
    while (rest.length) {
      const known = KO_VOCAB.find((v) => rest.startsWith(v));
      if (known) {
        parts.push(known);
        rest = rest.slice(known.length);
      } else {
        parts.push(rest.slice(0, 2));
        rest = rest.slice(2);
      }
    }
  }
  if (suf) parts.push(suf);
  return parts;
}

function splitEnglish(word: string): string[] {
  const parts: string[] = [];
  let i = 0;
  const low = word.toLowerCase();
  while (i < word.length) {
    const m = EN_VOCAB.filter((v) => low.startsWith(v, i)).sort((a, b) => b.length - a.length)[0];
    const len = m ? m.length : Math.min(3, word.length - i);
    parts.push(word.slice(i, i + len));
    i += len;
  }
  return parts;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /(\s+)|([가-힣]+)|([A-Za-z]+)|([0-9]+)|([^\sA-Za-z0-9가-힣])/g;
  let m: RegExpExecArray | null;
  let space = false;
  while ((m = re.exec(text))) {
    if (m[1]) {
      space = true;
      continue;
    }
    let pieces: string[] = [];
    if (m[2]) pieces = splitKorean(m[2]);
    else if (m[3]) pieces = splitEnglish(m[3]);
    else if (m[4]) pieces = m[4].match(/.{1,3}/g) ?? [];
    else pieces = [m[5]];
    pieces.forEach((p, k) => out.push({ text: p, space: k === 0 && space }));
    space = false;
  }
  return out;
}

function fakeId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 50257;
}

const CHIP_COLORS = ['var(--c-math)', 'var(--pos)', 'var(--c-ml)', 'var(--c-dl)', 'var(--hl)'];

function TokenizerFigure() {
  const [text, setText] = useState('인공지능은 데이터에서 패턴을 배운다. Transformers learn attention!');
  const [showId, setShowId] = useState(false);
  const toks = useMemo(() => tokenize(text), [text]);
  const chars = text.replace(/\s/g, '').length;
  return (
    <Figure
      no={1}
      title="문장을 토큰으로 자르기"
      hint="아무 문장이나 입력해 보세요"
      caption={<>색이 바뀌는 곳이 토큰의 경계이고, 작은 점(·)은 앞에 띄어쓰기가 붙은 토큰입니다. 이 분할기는 원리를 보여 주려고 만든 간단한 규칙이라 실제 모델의 결과와는 다릅니다. 실제 토크나이저(BPE 등)는 대량의 글에서 자주 붙어 나오는 글자 조각을 통계적으로 찾아 어휘를 만듭니다.</>}
    >
      <div className="ctl">
        <label className="ctl-label" htmlFor="lm-tok-input">
          <span>입력 문장</span>
        </label>
        <textarea
          id="lm-tok-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 300))}
          rows={2}
          style={{ font: 'inherit', fontSize: 'var(--fs-base)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical', width: '100%' }}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 12, borderRadius: 8, background: 'var(--bg)', minHeight: 56 }}>
        {toks.map((t, i) => (
          <span
            key={i}
            title={`가상의 ID ${fakeId(t.text)}`}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '3px 8px',
              borderRadius: 6,
              background: `color-mix(in srgb, ${CHIP_COLORS[i % CHIP_COLORS.length]} 20%, var(--surface))`,
              border: `1px solid color-mix(in srgb, ${CHIP_COLORS[i % CHIP_COLORS.length]} 45%, transparent)`,
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            <span>
              {t.space && <span style={{ color: 'var(--ink-3)' }}>·</span>}
              {t.text}
            </span>
            {showId && (
              <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--ink-3)' }}>
                {fakeId(t.text)}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="controls row" style={{ alignItems: 'center' }}>
        <div className="readouts" style={{ flex: '1 1 300px' }}>
          <Readout label="글자 수 (공백 제외)" value={chars} />
          <Readout label="토큰 수" value={toks.length} color="var(--accent)" />
          <Readout label="토큰당 글자" value={toks.length ? fmt(chars / toks.length, 2) : '—'} />
        </div>
        <Button small onClick={() => setShowId((v) => !v)}>
          {showId ? '번호 숨기기' : '토큰 번호 보기'}
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── sampling helpers ─────────────── */

interface Cand {
  t: string;
  logit: number;
}

/** Apply temperature, top-k, top-p. Returns original p and final p (0 if filtered). */
function distribution(cands: Cand[], temp: number, topK: number, topP: number) {
  const p = softmax(
    cands.map((c) => c.logit),
    temp,
  );
  const order = p.map((v, i) => i).sort((a, b) => p[b] - p[a]);
  const keep = new Set<number>();
  let cum = 0;
  for (let r = 0; r < order.length; r++) {
    if (r >= topK) break;
    keep.add(order[r]);
    cum += p[order[r]];
    if (cum >= topP) break;
  }
  const z = [...keep].reduce((s, i) => s + p[i], 0);
  const q = p.map((v, i) => (keep.has(i) ? v / z : 0));
  return { p, q };
}

function sample(q: number[]): number {
  let r = Math.random();
  for (let i = 0; i < q.length; i++) {
    r -= q[i];
    if (r <= 0) return i;
  }
  return q.findIndex((v) => v > 0);
}

/* ─────────────── Figure 2: next-token distribution ─────────────── */

const NEXT: Cand[] = [
  { t: '좋다', logit: 3.0 },
  { t: '덥다', logit: 2.4 },
  { t: '춥다', logit: 2.1 },
  { t: '맑다', logit: 1.8 },
  { t: '좋네요', logit: 1.5 },
  { t: '습하다', logit: 0.9 },
  { t: '이상하다', logit: 0.6 },
  { t: '변덕스럽다', logit: 0.2 },
  { t: '맛있다', logit: -1.2 },
  { t: '바나나', logit: -3.0 },
];

function NextTokenFigure() {
  const [temp, setTemp] = useState(1);
  const [topK, setTopK] = useState(10);
  const [topP, setTopP] = useState(1);
  const [counts, setCounts] = useState<number[]>(() => new Array(NEXT.length).fill(0));
  const [last, setLast] = useState<number | null>(null);
  const { p, q } = useMemo(() => distribution(NEXT, temp, topK, topP), [temp, topK, topP]);
  const total = counts.reduce((a, b) => a + b, 0);
  const reset = () => {
    setCounts(new Array(NEXT.length).fill(0));
    setLast(null);
  };
  const draw = (n: number) => {
    const c = counts.slice();
    let li = 0;
    for (let k = 0; k < n; k++) {
      li = sample(q);
      c[li]++;
    }
    setCounts(c);
    setLast(li);
  };
  const kept = q.filter((v) => v > 0).length;

  return (
    <Figure
      no={2}
      title="다음 토큰의 확률과 샘플링"
      hint="온도와 후보 수를 바꾼 뒤 뽑아 보세요"
      caption={<>연한 막대는 온도만 적용한 확률, 진한 막대는 top-k와 top-p로 후보를 거른 뒤 다시 합이 1이 되게 맞춘 최종 확률입니다. 오른쪽 숫자는 실제로 뽑힌 횟수입니다. 로짓 값은 설명을 위해 손으로 정했습니다.</>}
    >
      <div style={{ fontSize: '1.15rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        오늘 날씨가 정말 <span style={{ color: last === null ? 'var(--ink-3)' : 'var(--pos)', borderBottom: '2px dashed var(--line-strong)', padding: '0 4px' }}>{last === null ? '___' : NEXT[last].t}</span>
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          {NEXT.map((c, i) => {
            const off = q[i] === 0;
            return (
              <div key={c.t} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 52px 40px', gap: 8, alignItems: 'center', fontSize: 'var(--fs-sm)', opacity: off ? 0.5 : 1 }}>
                <span style={{ fontWeight: last === i ? 700 : 500, color: last === i ? 'var(--pos)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.t}</span>
                <div style={{ position: 'relative', height: 14, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${p[i] * 100}%`, background: 'color-mix(in srgb, var(--accent) 28%, transparent)', transition: 'width .2s' }} />
                  <div style={{ position: 'absolute', inset: 0, width: `${q[i] * 100}%`, background: 'var(--accent)', transition: 'width .2s' }} />
                </div>
                <span className="mono" style={{ fontSize: '0.75rem', textAlign: 'right', color: off ? 'var(--ink-3)' : 'var(--ink)' }}>
                  {off ? '제외' : fmt(q[i] * 100, 1) + '%'}
                </span>
                <span className="mono" style={{ fontSize: '0.75rem', textAlign: 'right', color: 'var(--ink-3)' }}>
                  {total ? counts[i] : ''}
                </span>
              </div>
            );
          })}
        </div>
        <div className="controls">
          <Slider id="lm-next-temp" label="온도 T" value={temp} min={0.1} max={2.5} step={0.05} onChange={(v) => (setTemp(v), reset())} format={(v) => fmt(v, 2)} />
          <Slider id="lm-next-topk" label="top-k (후보 개수)" value={topK} min={1} max={10} step={1} onChange={(v) => (setTopK(v), reset())} />
          <Slider id="lm-next-topp" label="top-p (누적 확률)" value={topP} min={0.1} max={1} step={0.05} onChange={(v) => (setTopP(v), reset())} format={(v) => fmt(v, 2)} />
          <div className="btn-row">
            <Button primary onClick={() => draw(1)}>
              한 번 뽑기
            </Button>
            <Button onClick={() => draw(100)}>100번 뽑기</Button>
            <Button small onClick={reset}>
              초기화
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="남은 후보" value={`${kept}개`} />
            <Readout label="뽑은 횟수" value={total} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: generate with a tiny bigram model ─────────────── */

const END = '.';
const BIGRAM: Record<string, Cand[]> = {
  '<시작>': [
    { t: '오늘', logit: 2.0 },
    { t: '나는', logit: 1.8 },
    { t: '우리는', logit: 1.2 },
    { t: '고양이가', logit: 1.0 },
  ],
  오늘: [
    { t: '날씨가', logit: 2.2 },
    { t: '나는', logit: 1.2 },
    { t: '아침에', logit: 1.0 },
  ],
  날씨가: [
    { t: '정말', logit: 2.0 },
    { t: '너무', logit: 1.5 },
    { t: '맑아서', logit: 1.2 },
    { t: '흐려서', logit: 0.8 },
  ],
  정말: [
    { t: '좋다', logit: 2.0 },
    { t: '좋아서', logit: 1.5 },
    { t: '덥다', logit: 1.4 },
    { t: '춥다', logit: 1.2 },
  ],
  너무: [
    { t: '덥다', logit: 1.6 },
    { t: '춥다', logit: 1.5 },
    { t: '좋아서', logit: 1.4 },
    { t: '피곤해서', logit: 0.8 },
  ],
  맑아서: [
    { t: '산책을', logit: 1.8 },
    { t: '공원에', logit: 1.6 },
    { t: '기분이', logit: 1.4 },
  ],
  흐려서: [
    { t: '집에서', logit: 1.8 },
    { t: '우산을', logit: 1.4 },
    { t: '기분이', logit: 1.2 },
  ],
  좋아서: [
    { t: '산책을', logit: 1.6 },
    { t: '공원에', logit: 1.6 },
    { t: '기분이', logit: 1.2 },
  ],
  피곤해서: [
    { t: '집에서', logit: 2.0 },
    { t: '잠을', logit: 1.6 },
  ],
  나는: [
    { t: '커피를', logit: 1.5 },
    { t: '공원에', logit: 1.4 },
    { t: '집에서', logit: 1.4 },
    { t: '고양이와', logit: 1.2 },
    { t: '아침에', logit: 1.0 },
  ],
  우리는: [
    { t: '공원에', logit: 1.6 },
    { t: '커피를', logit: 1.4 },
    { t: '산책을', logit: 1.2 },
  ],
  고양이가: [
    { t: '잠을', logit: 1.6 },
    { t: '너무', logit: 1.4 },
    { t: '공원에', logit: 0.8 },
  ],
  고양이와: [
    { t: '잠을', logit: 1.5 },
    { t: '집에서', logit: 1.2 },
    { t: '산책을', logit: 1.0 },
  ],
  아침에: [
    { t: '커피를', logit: 2.0 },
    { t: '산책을', logit: 1.5 },
    { t: '공원에', logit: 1.0 },
  ],
  공원에: [
    { t: '갔다', logit: 2.2 },
    { t: '가고', logit: 1.4 },
  ],
  집에서: [
    { t: '쉬었다', logit: 2.0 },
    { t: '잠을', logit: 1.2 },
    { t: '커피를', logit: 1.2 },
  ],
  산책을: [
    { t: '했다', logit: 2.2 },
    { t: '하고', logit: 1.4 },
  ],
  커피를: [
    { t: '마셨다', logit: 2.2 },
    { t: '마시고', logit: 1.4 },
  ],
  기분이: [
    { t: '좋다', logit: 2.0 },
    { t: '좋아서', logit: 1.0 },
  ],
  우산을: [{ t: '챙겼다', logit: 2.0 }],
  잠을: [
    { t: '잤다', logit: 2.2 },
    { t: '자고', logit: 1.2 },
  ],
  가고: [{ t: '싶다', logit: 2.0 }],
  하고: [
    { t: '싶다', logit: 1.6 },
    { t: '커피를', logit: 1.2 },
  ],
  마시고: [
    { t: '산책을', logit: 1.5 },
    { t: '싶다', logit: 1.2 },
  ],
  자고: [{ t: '싶다', logit: 2.0 }],
};
for (const w of ['좋다', '덥다', '춥다', '갔다', '했다', '마셨다', '쉬었다', '잤다', '챙겼다', '싶다']) BIGRAM[w] = [{ t: END, logit: 3 }];

interface Step {
  t: string;
  p: number;
}

function GenerateFigure() {
  const [temp, setTemp] = useState(1);
  const [steps, setSteps] = useState<Step[]>(() => [
    { t: '오늘', p: distribution(BIGRAM['<시작>'], 1, 99, 1).q[0] },
    { t: '날씨가', p: distribution(BIGRAM['오늘'], 1, 99, 1).q[0] },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const lastTok = steps.length ? steps[steps.length - 1].t : '<시작>';
  const done = lastTok === END;
  const cands = BIGRAM[lastTok] ?? [{ t: END, logit: 1 }];
  const probs = useMemo(() => distribution(cands, temp, 99, 1).q, [cands, temp]);

  const stepOnce = (cur: Step[]): Step[] => {
    const lt = cur.length ? cur[cur.length - 1].t : '<시작>';
    if (lt === END) return cur;
    const cs = BIGRAM[lt] ?? [{ t: END, logit: 1 }];
    const q = distribution(cs, temp, 99, 1).q;
    const i = sample(q);
    return [...cur, { t: cs[i].t, p: q[i] }];
  };
  const finish = (cur: Step[]) => {
    let s = cur;
    for (let k = 0; k < 14 && (s.length === 0 || s[s.length - 1].t !== END); k++) s = stepOnce(s);
    return s;
  };
  const record = (s: Step[]) => {
    if (s.length && s[s.length - 1].t === END) setHistory((h) => [sentence(s), ...h].slice(0, 6));
  };
  const sentence = (s: Step[]) => s.map((x) => x.t).join(' ').replace(' .', '.');

  return (
    <Figure
      no={3}
      title="한 토큰씩 문장 만들기"
      hint="같은 설정으로 여러 번 생성해 보세요"
      caption={<>이 작은 모델은 바로 앞 토큰 하나만 보고 다음 토큰을 고릅니다(바이그램). 온도를 0.1 근처로 낮추면 매번 가장 확률 높은 길만 따라가서 같은 문장이 반복되고, 높이면 더 다양하지만 가끔 어색한 문장이 나옵니다.</>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 44, padding: 12, borderRadius: 8, background: 'var(--bg)' }}>
        {steps.length === 0 && <span style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>아직 생성한 토큰이 없습니다. "다음 토큰"을 눌러 시작하세요.</span>}
        {steps.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', padding: '3px 9px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 600 }}>{s.t}</span>
            <span className="mono" style={{ fontSize: '0.65rem', color: s.p < 0.2 ? 'var(--bad)' : 'var(--ink-3)' }}>
              {Math.round(s.p * 100)}%
            </span>
          </span>
        ))}
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="figure-hint">{done ? '문장이 끝났습니다.' : `"${lastTok}" 다음에 올 후보`}</div>
          {!done &&
            cands.map((c, i) => (
              <div key={c.t} style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr) 48px', gap: 8, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <span style={{ whiteSpace: 'nowrap' }}>{c.t === END ? '(마침표)' : c.t}</span>
                <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${probs[i] * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
                </div>
                <span className="mono" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                  {fmt(probs[i] * 100, 0)}%
                </span>
              </div>
            ))}
          {history.length > 0 && (
            <>
              <div className="figure-hint" style={{ marginTop: 8 }}>
                지금까지 만든 문장
              </div>
              <ol style={{ margin: 0, paddingLeft: '1.3em', fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
                {history.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="controls">
          <Slider id="lm-gen-temp" label="온도 T" value={temp} min={0.1} max={2.5} step={0.05} onChange={setTemp} format={(v) => fmt(v, 2)} />
          <div className="btn-row">
            <Button
              primary
              disabled={done}
              onClick={() => {
                const s = stepOnce(steps);
                setSteps(s);
                record(s);
              }}
            >
              다음 토큰
            </Button>
            <Button
              disabled={done}
              onClick={() => {
                const s = finish(steps);
                setSteps(s);
                record(s);
              }}
            >
              끝까지 생성
            </Button>
            <Button
              onClick={() => {
                const s = finish([]);
                setSteps(s);
                record(s);
              }}
            >
              새 문장
            </Button>
            <Button small onClick={() => setSteps([])}>
              비우기
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

const JOURNEY: { href: string; from: string; to: string }[] = [
  { href: '#vectors', from: '벡터와 내적', to: '임베딩과 어텐션 점수' },
  { href: '#matrices', from: '행렬 곱', to: 'q, k, v를 만드는 W 행렬과 모든 층' },
  { href: '#probability', from: '확률분포와 소프트맥스', to: '다음 토큰의 확률' },
  { href: '#entropy', from: '크로스엔트로피', to: '사전 학습의 손실 함수' },
  { href: '#gradient-descent', from: '경사하강법', to: '수천억 개 가중치의 학습' },
  { href: '#backprop', from: '역전파', to: '그 기울기를 계산하는 방법' },
  { href: '#attention', from: '어텐션', to: '문맥을 읽는 트랜스포머' },
];

export default function LanguageModel() {
  return (
    <>
      <h2>언어 모델이 하는 일은 단 하나</h2>
      <p>
        챗봇은 질문에 답하고, 코드를 짜고, 시를 씁니다. 하지만 그 안의 <T en="Large Language Model, LLM">대형 언어 모델</T>이 하는 일은 놀랍도록 단순합니다. 지금까지의 글을 보고 <strong>다음에 올 토큰의 확률분포</strong>를 내놓는 것, 그게 전부입니다. 긴 답변도 이 일을 수백 번 반복한 결과입니다.
      </p>
      <MB note="앞의 토큰들 w₁…w_{t−1}이 주어졌을 때 다음 토큰 w_t가 무엇일지에 대한 확률. 문장 전체의 확률은 이것들의 곱입니다.">{'P(w_1, \\dots, w_n) = \\prod_{t=1}^{n} P(w_t \\mid w_1, \\dots, w_{t-1})'}</MB>

      <h2>토큰: 모델이 읽는 단위</h2>
      <p>
        모델은 글자를 한 자씩 읽지도, 단어를 통째로 읽지도 않습니다. 그 중간 크기의 조각인 <T en="token">토큰</T>으로 자릅니다. 자주 나오는 단어는 한 토큰이 되고, 드문 단어는 여러 조각으로 나뉩니다. 이렇게 하면 수만 개 정도의 어휘로 세상의 거의 모든 글을 표현할 수 있습니다. 각 토큰은 번호로 바뀐 뒤 <a href="#embeddings">임베딩</a> 표에서 벡터를 찾아 모델에 들어갑니다.
      </p>
      <TokenizerFigure />
      <Callout kind="note">
        영어 위주로 학습한 토크나이저는 한국어를 더 잘게 자르는 경향이 있습니다. 같은 내용이라도 한국어가 토큰을 더 많이 쓰게 되고, 토큰 단위로 요금을 받는 서비스에서는 비용 차이로 이어지기도 합니다. 최근 모델들은 다국어 어휘를 늘려 이 차이를 줄이고 있습니다.
      </Callout>

      <h2>다음 토큰의 확률분포</h2>
      <p>
        모델의 마지막 층은 어휘에 있는 모든 토큰에 점수(로짓)를 매기고, 소프트맥스로 이를 확률로 바꿉니다. 이때 점수를 <T en="temperature">온도</T> <M>{'T'}</M>로 나누면 분포의 모양을 조절할 수 있습니다.
      </p>
      <MB note="T < 1이면 큰 점수가 더 커져서 분포가 뾰족해지고, T > 1이면 평평해집니다.">{'P(\\text{토큰}_i) = \\frac{e^{z_i / T}}{\\sum_j e^{z_j / T}}'}</MB>
      <p>
        확률이 아주 낮은 후보까지 가끔 뽑히면 "오늘 날씨가 정말 바나나" 같은 문장이 나올 수 있습니다. 그래서 상위 k개만 남기는 <T en="top-k">top-k</T>, 확률을 높은 순으로 더해 p에 도달할 때까지만 남기는 <T en="top-p, nucleus">top-p</T> 같은 방법으로 후보를 거릅니다.
      </p>
      <NextTokenFigure />

      <h2>한 토큰씩 문장 만들기</h2>
      <p>
        다음 토큰을 하나 뽑으면 그것을 입력 끝에 붙이고, 다시 다음 토큰의 분포를 계산합니다. 자기가 방금 만든 출력을 다음 입력으로 쓰는 이 방식을 <T en="autoregressive">자기회귀</T> 생성이라고 합니다. 아래의 작은 모델로 직접 문장을 만들어 보세요.
      </p>
      <GenerateFigure />
      <p>
        이 장난감 모델은 바로 앞 토큰 하나만 봅니다. 그래서 "나는 커피를 마시고 산책을 했다"처럼 앞뒤만 맞고 전체 흐름은 엉성한 문장이 나오기도 합니다. 실제 LLM은 <a href="#attention">어텐션</a>으로 앞에 나온 수천에서 수십만 개의 토큰을 모두 참고해서 분포를 계산합니다. 원리는 같고, 보는 범위와 계산의 깊이가 다를 뿐입니다.
      </p>

      <h2>어떻게 학습할까</h2>
      <p>
        <strong>사전 학습.</strong> 인터넷 문서, 책, 코드 등 수조 개의 토큰에서 문장의 일부를 보여 주고 바로 다음 토큰을 맞히게 합니다. 정답 토큰에 준 확률이 낮을수록 벌점이 큰 <a href="#entropy">크로스엔트로피</a>가 손실 함수이고, <a href="#gradient-descent">경사하강법</a>과 <a href="#backprop">역전파</a>로 가중치를 고칩니다. 정답 데이터를 따로 만들 필요가 없어서 엄청난 양의 글로 학습할 수 있습니다.
      </p>
      <MB note="정답 다음 토큰 w_t에 모델이 준 확률의 로그를 모든 위치에서 평균 낸 값입니다.">{'\\mathcal{L} = -\\frac{1}{n}\\sum_{t=1}^{n} \\log P_\\theta(w_t \\mid w_{<t})'}</MB>
      <p>
        다음 단어를 잘 맞히려면 문법은 물론이고 사실, 논리, 말투까지 알아야 합니다. "대한민국의 수도는"의 다음을 맞히려면 서울을 알아야 하니까요. 모델과 데이터를 키울수록 이런 능력이 함께 늘어난다는 것이 지난 몇 년간의 핵심 발견입니다. 2020년의 GPT-3는 가중치가 1,750억 개였고 약 3,000억 개의 토큰으로 학습했습니다.
      </p>
      <p>
        <strong>지시 따르기와 사람의 피드백.</strong> 사전 학습만 마친 모델은 글을 이어 쓸 줄은 알지만 질문에 답하는 비서처럼 행동하지는 않습니다. 그래서 질문과 좋은 답변의 예시로 추가 학습하고(지시 튜닝), 사람들이 두 답변 중 더 나은 쪽을 고른 데이터로 모델을 다듬습니다(RLHF, 인간 피드백 강화학습). 우리가 쓰는 챗봇은 이 단계를 거친 모델입니다.
      </p>

      <h2>환각은 왜 생길까</h2>
      <p>
        언어 모델은 "그럴듯한 다음 토큰"을 고르도록 학습했지 "사실인 문장"을 고르도록 학습한 것이 아닙니다. 학습 데이터에 드물게 나온 내용이나 아예 없는 내용을 물으면, 모델은 모른다고 말하는 대신 형식상 자연스러운 답을 만들어 낼 수 있습니다. 이것을 <T en="hallucination">환각</T>이라고 합니다. 존재하지 않는 논문 제목이나 틀린 날짜가 대표적인 예입니다.
      </p>
      <p>
        환각을 줄이기 위해 믿을 만한 문서를 검색해 함께 넣어 주거나(RAG), 모르는 것을 모른다고 답하도록 추가 학습하는 방법을 씁니다. 그래도 중요한 정보는 출처를 직접 확인하는 습관이 필요합니다.
      </p>
      <Callout kind="key">
        언어 모델은 다음 토큰의 확률분포를 계산하는 함수입니다. 그 분포에서 온도와 top-k, top-p로 토큰을 뽑아 붙이기를 반복하면 문장이 됩니다. 이 함수를 수조 개의 토큰으로 크로스엔트로피를 줄이도록 학습한 것이 대형 언어 모델입니다.
      </Callout>

      <h2>여기까지 온 길</h2>
      <p>첫 장의 화살표 두 개에서 시작해 여기까지 왔습니다. 대형 언어 모델 안을 들여다보면, 앞에서 배운 조각들이 모두 들어 있습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>배운 것</th>
              <th>언어 모델 안에서의 역할</th>
            </tr>
          </thead>
          <tbody>
            {JOURNEY.map((j) => (
              <tr key={j.href}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a href={j.href}>{j.from}</a>
                </td>
                <td>{j.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        이 사이트의 그림들은 모두 작고 단순하지만, 실제 모델도 같은 원리를 아주 큰 규모로 반복할 뿐입니다. 궁금한 장으로 돌아가 슬라이더를 다시 움직여 보세요. 처음 볼 때와는 다른 것이 보일 겁니다.
      </p>
      <Quiz
        q="온도 T를 0에 아주 가깝게 낮추면 생성 결과는 어떻게 될까요?"
        options={['완전히 무작위로 아무 토큰이나 고른다', '매번 확률이 가장 높은 토큰만 골라서 같은 입력에는 같은 문장이 나온다', '확률이 가장 낮은 토큰을 고른다', '문장이 더 길어진다']}
        answer={1}
        explain={<>점수를 아주 작은 T로 나누면 가장 큰 점수와 나머지의 차이가 엄청나게 벌어져서, 소프트맥스가 1등에게 거의 100%를 줍니다. 그림 3에서 온도를 0.1로 놓고 "새 문장"을 여러 번 눌러 확인해 보세요.</>}
      />
    </>
  );
}

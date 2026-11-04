import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { RegexError, backtrackSteps, nfaSearchSteps, parseRegex, regexAlphabet, regexText, simulateNfa, subsetDfaSize, thompson, type Ast, type Nfa } from './automata';
import { StateDiagram, type Mark } from './Diagram';
import './computation.css';

/** Parse and build, or report where the pattern breaks. */
function useNfa(src: string): { nfa: Nfa | null; err: RegexError | null } {
  return useMemo(() => {
    try {
      return { nfa: thompson(parseRegex(src)), err: null };
    } catch (e) {
      if (e instanceof RegexError) return { nfa: null, err: e };
      throw e;
    }
  }, [src]);
}

function RegexInput({ id, value, onChange, err, label = '정규 표현식' }: { id: string; value: string; onChange: (v: string) => void; err: RegexError | null; label?: string }) {
  return (
    <div className="ctl">
      <label className="ctl-label" htmlFor={id}>
        <span>{label}</span>
      </label>
      <input id={id} className="cmp-text" type="text" value={value} spellCheck={false} autoComplete="off" aria-invalid={!!err} aria-describedby={`${id}-err`} onChange={(e) => onChange(e.target.value.replace(/\s/g, '').slice(0, 18))} />
      <div id={`${id}-err`} className="cmp-err" aria-live="polite">
        {err ? `${err.pos + 1}번째 글자: ${err.message}` : ''}
      </div>
    </div>
  );
}

/* ─────────────── Figure 1: Thompson's construction, fragment by fragment ─────────────── */

const BUILD_PRESETS = ['(a|b)*abb', 'ab*c', 'a(b|c)+d?', '(ab|a)*'];

function stepNote(n: Ast): string {
  const t = regexText(n);
  switch (n.type) {
    case 'lit':
      return `글자 ${t}: 상태 두 개를 ${t} 화살표 하나로 잇습니다.`;
    case 'eps':
      return '빈 문자열 ε: 상태 두 개를 ε 화살표로 잇습니다.';
    case 'cat':
      return `${t}: 이어 붙이기. 앞 조각의 끝 상태를 다음 조각의 시작 상태로 그대로 씁니다. 새 상태도 새 화살표도 없습니다.`;
    case 'alt':
      return `${t}: 고르기. 새 시작 상태에서 갈래마다 ε로 들어가고, 갈래의 끝에서 새 끝 상태로 ε로 모입니다.`;
    case 'star':
      return `${t}: 0번 이상 반복. 아래의 ε는 조각을 건너뛰고(0번), 위의 ε는 조각의 끝에서 처음으로 되돌아갑니다(여러 번).`;
    case 'plus':
      return `${t}: 1번 이상 반복. 되돌아가는 ε만 있고 건너뛰는 ε는 없습니다.`;
    case 'opt':
      return `${t}: 0번 또는 1번. 건너뛰는 ε만 있고 되돌아가는 ε는 없습니다.`;
  }
}

function BuildFigure() {
  const [src, setSrc] = useState(BUILD_PRESETS[0]);
  const { nfa, err } = useNfa(src);
  const [last, setLast] = useState<Nfa | null>(null);
  const shownNfa = nfa ?? last;
  useEffect(() => {
    if (nfa) setLast(nfa);
  }, [nfa]);
  const steps = shownNfa ? shownNfa.order.length : 1;
  const s = useStepper(steps, 1, shownNfa, true);
  const k = s.i;

  // the step at which each state and arrow first appears
  const firstEdge = shownNfa ? shownNfa.edges.map((e) => e.owner) : [];
  const firstNode = new Map<number, number>();
  if (shownNfa) {
    for (const n of shownNfa.nodes) firstNode.set(n.id, n.owner);
    shownNfa.edges.forEach((e) => {
      for (const q of [e.from, e.to]) firstNode.set(q, Math.min(firstNode.get(q)!, e.owner));
    });
  }
  const nodeMark = (q: number): Mark => {
    const f = firstNode.get(q)!;
    return f > k ? 'hide' : f === k ? 'new' : undefined;
  };
  const edgeMark = (i: number): Mark => (firstEdge[i] > k ? 'hide' : firstEdge[i] === k ? 'new' : undefined);
  const cur = shownNfa?.order[k];
  const visibleStates = shownNfa ? shownNfa.nodes.filter((n) => firstNode.get(n.id)! <= k).length : 0;
  const visibleEdges = firstEdge.filter((o) => o <= k).length;

  return (
    <Figure
      no={1}
      title="정규 표현식을 NFA로: 톰슨 구성법"
      hint="표현식을 고르거나 입력하고 한 단계씩 넘겨 보세요"
      caption={<>표현식을 가장 안쪽 조각부터 차례로 기계로 바꿉니다. 단계마다 새로 생긴 상태와 화살표가 주황색입니다. 점선 화살표는 글자를 읽지 않고 건너가는 ε 전이입니다. 각 조각은 시작 상태 하나와 끝 상태 하나만 바깥에 내놓기 때문에, 조각이 무엇이든 같은 방법으로 이어 붙이고 감쌀 수 있습니다. 마지막 단계의 끝 상태가 수락 상태가 됩니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {shownNfa && (
            <StateDiagram
              nodes={shownNfa.nodes.map((n) => ({ ...n, accept: n.accept && k === steps - 1 }))}
              edges={shownNfa.edges}
              start={k === steps - 1 ? shownNfa.start : null}
              width={shownNfa.width}
              height={shownNfa.height}
              r={14}
              minWidth={Math.min(shownNfa.width * 0.8, 520)}
              nodeMark={nodeMark}
              edgeMark={edgeMark}
              label={`${src}의 톰슨 NFA, ${k + 1}단계: 상태 ${visibleStates}개, 화살표 ${visibleEdges}개`}
            />
          )}
          <div className="cmp-note" aria-live="polite">
            <strong>{k + 1}단계.</strong> {cur ? stepNote(cur) : ''}
          </div>
        </div>
        <div className="controls">
          <Seg label="예시" value={BUILD_PRESETS.includes(src) ? src : ''} onChange={setSrc} options={BUILD_PRESETS.map((p) => ({ value: p, label: <span className="mono">{p}</span> }))} />
          <RegexInput id="rx-build" value={src} onChange={setSrc} err={err} />
          <StepControls s={s} id="rx-build-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="상태" value={visibleStates} />
            <Readout label="화살표" value={visibleEdges} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '이번 단계에 생김', shape: 'ln' },
          { color: 'var(--ink-3)', label: '글자 전이 (실선) · ε 전이 (점선)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: following a set of states ─────────────── */

const SIM_PRESETS: { re: string; input: string }[] = [
  { re: '(a|b)*abb', input: 'babaabb' },
  { re: '(ab|a)*', input: 'aabab' },
  { re: 'a(b|c)+d?', input: 'abcbd' },
];

function SimFigure() {
  const [src, setSrc] = useState(SIM_PRESETS[0].re);
  const [input, setInput] = useState(SIM_PRESETS[0].input);
  const { nfa, err } = useNfa(src);
  const alphabet = useMemo(() => regexAlphabet(src), [src]);
  const frames = useMemo(() => (nfa ? simulateNfa(nfa, input) : []), [nfa, input]);
  const dfaSize = useMemo(() => (nfa ? subsetDfaSize(nfa, alphabet) : 0), [nfa, alphabet]);
  const s = useStepper(Math.max(1, frames.length), 2, `${src}|${input}`);
  const f = frames[s.i];
  const done = !!f && s.i === frames.length - 1;
  const accepted = !!nfa && !!f && f.set.has(nfa.accept);
  const work = frames.slice(0, s.i + 1).reduce((a, fr) => a + fr.set.size, 0);
  const preset = SIM_PRESETS.findIndex((p) => p.re === src && p.input === input);

  return (
    <Figure
      no={2}
      title="상태 집합을 한꺼번에 따라가기"
      hint="문자열을 바꿔 한 글자씩 넘겨 보세요"
      caption={<>NFA는 같은 글자에 갈 곳이 여럿일 수 있고, ε 화살표는 글자를 읽지 않고도 건너갑니다. 그래서 "지금 있을 수 있는 상태"를 하나가 아니라 집합으로 들고 다닙니다(노란 상태). 글자를 하나 읽으면 집합의 모든 상태에서 그 글자 화살표(주황)를 동시에 따라가고, 도착한 상태에서 ε 화살표로 갈 수 있는 곳을 모두 더합니다. 다 읽었을 때 집합에 수락 상태가 들어 있으면 수락입니다. 집합이 비면 더 볼 것도 없이 거부입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {nfa && f && (
            <StateDiagram
              nodes={nfa.nodes}
              edges={nfa.edges}
              start={nfa.start}
              width={nfa.width}
              height={nfa.height}
              r={14}
              minWidth={Math.min(nfa.width * 0.8, 520)}
              nodeMark={(q) => (f.set.has(q) ? 'on' : undefined)}
              edgeMark={(i) => (f.fired.has(i) ? 'hot' : undefined)}
              label={`${src}의 NFA. ${f.pos}글자를 읽은 뒤 있을 수 있는 상태: ${[...f.set].sort((a, b) => a - b).join(', ') || '없음'}`}
            />
          )}
          <div className="cmp-input" aria-label="입력 문자열">
            <span className="lbl">입력</span>
            {input.length ? (
              [...input].map((c, i) => (
                <span key={i} className="cmp-ch" data-st={f && i < f.pos - 1 ? 'done' : f && i === f.pos - 1 ? 'cur' : undefined}>
                  {c}
                </span>
              ))
            ) : (
              <span className="cmp-empty">빈 문자열 ε</span>
            )}
          </div>
          <div className="cmp-chips" aria-live="polite">
            <span className="lbl">지금 있을 수 있는 상태</span>
            {f && f.set.size ? (
              [...f.set]
                .sort((a, b) => a - b)
                .map((q) => (
                  <span key={q} className="cmp-chip" data-s={nfa && q === nfa.accept ? 'good' : 'on'}>
                    {q}
                  </span>
                ))
            ) : (
              <span className="cmp-empty">없음 (공집합)</span>
            )}
          </div>
          <div className="cmp-verdict">
            {done ? (
              <>
                다 읽었고 집합에 수락 상태 {nfa?.accept}가 {accepted ? '있으므로' : '없으므로'} <strong data-ok={accepted ? 'yes' : 'no'}>{accepted ? '수락' : '거부'}</strong>
              </>
            ) : f ? (
              <>{f.pos === 0 ? '시작 상태와, 거기서 ε로 갈 수 있는 상태에서 출발합니다.' : `${f.pos}번째 글자 ${input[f.pos - 1]}를 읽었습니다.`}</>
            ) : null}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="예시"
            value={preset}
            onChange={(i) => {
              if (i < 0) return;
              setSrc(SIM_PRESETS[i].re);
              setInput(SIM_PRESETS[i].input);
            }}
            options={SIM_PRESETS.map((p, i) => ({ value: i, label: <span className="mono">{p.re}</span> }))}
          />
          <RegexInput id="rx-sim" value={src} onChange={setSrc} err={err} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="rx-sim-input">
              <span>문자열 ({alphabet.join(', ')})</span>
            </label>
            <input id="rx-sim-input" className="cmp-text" type="text" value={input} spellCheck={false} autoComplete="off" onChange={(e) => setInput(e.target.value.replace(/[^a-z0-9]/g, '').slice(0, 14))} />
          </div>
          <StepControls s={s} id="rx-sim-speed" maxSpeed={8} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="집합 크기" value={f ? f.set.size : '—'} />
            <Readout label="지금까지 다룬 상태" value={work} />
            <Readout label="NFA 상태 수" value={nfa ? nfa.nodes.length : '—'} />
            <Readout label="DFA로 바꾸면" value={nfa ? `${dfaSize}개` : '—'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '있을 수 있는 상태' },
          { color: 'var(--pos)', label: '방금 읽은 글자로 따라간 화살표', shape: 'ln' },
          { color: 'var(--good)', label: '집합 안의 수락 상태', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: backtracking versus the state set ─────────────── */

const BAD = ['(a+)+b', '(a|aa)*b', 'a*a*b'];
const N_MAX = 20;
const BUDGET = 3e7;
const seriesCache = new Map<string, { bt: number[]; nfa: number[] }>();

/** Work for n = 1..N_MAX, filled in one n at a time so the page never freezes. */
function useSeries(pat: string, withB: boolean) {
  const key = `${pat}|${withB}`;
  const [, bump] = useState(0);
  useEffect(() => {
    let stop = false;
    const ast = parseRegex(pat);
    const nfa = thompson(ast);
    if (!seriesCache.has(key)) seriesCache.set(key, { bt: [], nfa: [] });
    const s = seriesCache.get(key)!;
    const next = () => {
      if (stop || s.bt.length >= N_MAX) return;
      const n = s.bt.length + 1;
      const text = 'a'.repeat(n) + (withB ? 'b' : '');
      s.bt.push(backtrackSteps(ast, text, BUDGET).steps);
      s.nfa.push(nfaSearchSteps(nfa, text).steps);
      bump((x) => x + 1);
      setTimeout(next, 0);
    };
    const t = setTimeout(next, 0);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [key, pat, withB]);
  return seriesCache.get(key) ?? { bt: [], nfa: [] };
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => '10' + String(k).split('').map((d) => SUP[+d]).join('');

function BacktrackFigure() {
  const P = usePalette();
  const [pat, setPat] = useState(BAD[0]);
  const [n, setN] = useState(18);
  const [withB, setWithB] = useState(false);
  const [measured, setMeasured] = useState<{ key: string; ms: number } | null>(null);
  const series = useSeries(pat, withB);
  const ready = series.bt.length >= n;
  const bt = series.bt[n - 1];
  const nf = series.nfa[n - 1];
  const text = 'a'.repeat(n) + (withB ? 'b' : '');
  const mkey = `${pat}|${text}`;

  const measure = () => {
    const re = new RegExp(pat);
    let best = Infinity;
    for (let r = 0; r < 3; r++) {
      const t = performance.now();
      re.test(text);
      best = Math.min(best, performance.now() - t);
    }
    setMeasured({ key: mkey, ms: best });
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = 8;
      const plot = new Plot(ctx, w, h, P, { xMin: 1, xMax: N_MAX, yMin: 0, yMax, pad: { l: 40, r: 12, t: 12, b: 28 } });
      plot.grid({ xStep: 1, yStep: 1, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 2; x <= N_MAX; x += 2) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += 2) ctx.fillText(pow10(y), plot.X(1) - 6, plot.Y(y));
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillText('n (a의 개수)', plot.X(N_MAX), plot.Y(0) - 4);
      plot.line(n, 0, n, yMax, P.lineStrong, 1.2, [4, 4]);
      const draw = (ys: number[], col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ys.forEach((v, i) => {
          const X = plot.X(i + 1);
          const Y = plot.Y(Math.min(yMax, Math.log10(Math.max(1, v))));
          if (i) ctx.lineTo(X, Y);
          else ctx.moveTo(X, Y);
        });
        ctx.stroke();
        if (ys.length >= n) plot.dot(n, Math.min(yMax, Math.log10(Math.max(1, ys[n - 1]))), 5, col, P.surface, 2);
      };
      draw(series.bt, P.bad);
      draw(series.nfa, P.good);
    },
    [P, series.bt.length, n, pat, withB],
    { aspect: 1.9, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={3}
      title="역추적 엔진과 상태 집합 시뮬레이션의 일의 양"
      hint="패턴과 n을 바꾸고, b를 붙였다 떼어 보세요"
      caption={<>입력은 a를 n개 늘어놓은 문자열이고, 두 방법 모두 RegExp.test처럼 문자열 어디에서든 일치를 찾습니다. 빨간 선은 갈래를 하나씩 시도하고 실패하면 되돌아가는 역추적 매처가 글자를 비교한 횟수, 초록 선은 그림 2처럼 상태 집합을 들고 한 번 지나가는 방법이 다룬 상태 수입니다. 세로축은 로그 눈금이라 한 칸이 10배입니다. 일치가 없을 때 역추적은 a들을 나누는 모든 방법을 다 시도하고 나서야 포기합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = ${n}, 패턴 ${pat}: 역추적 ${bt ?? '계산 중'}번, 상태 집합 ${nf ?? '계산 중'}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="패턴" value={pat} onChange={setPat} options={BAD.map((p) => ({ value: p, label: <span className="mono">{p}</span> }))} />
          <Slider id="rx-n" label="n (a의 개수)" value={n} min={1} max={N_MAX} step={1} onChange={setN} color="var(--c-cs-1)" />
          <Check label="문자열 끝에 b를 붙인다 (일치함)" checked={withB} onChange={setWithB} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="역추적: 글자 비교" value={ready ? bt.toLocaleString('ko-KR') : '계산 중…'} color="var(--bad)" />
            <Readout label="상태 집합: 다룬 상태" value={ready ? nf.toLocaleString('ko-KR') : '계산 중…'} color="var(--good)" />
            <Readout label="이 브라우저의 RegExp" value={measured && measured.key === mkey ? `${measured.ms < 1 ? measured.ms.toFixed(2) : Math.round(measured.ms).toLocaleString('ko-KR')}ms` : '—'} />
          </div>
          <div className="btn-row">
            <Button small onClick={measure}>
              /{pat}/.test 직접 재 보기
            </Button>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '역추적 (글자 비교 수)', shape: 'ln' },
          { color: 'var(--good)', label: '상태 집합 (다룬 상태 수)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Regex() {
  return (
    <>
      <h2>유한 오토마타를 적는 짧은 방법</h2>
      <p>
        회원 가입 양식이 우편번호를 검사하거나, 편집기에서 <code>TODO|FIXME</code>를 찾거나, 로그에서 <code>ERROR [0-9]+</code>를 골라낼 때 우리는 <T en="regular expression">정규 표현식</T>을 씁니다. 정규 표현식도 앞 장의 DFA처럼 문자열의 집합, 즉 언어를 나타냅니다. 다른 점은 다이어그램 대신 한 줄의 글로 적는다는 것입니다.
      </p>
      <p>정규 표현식은 글자 하나에서 출발해 딱 세 가지 연산으로 만들어집니다.</p>
      <ul>
        <li>
          <strong>이어 붙이기</strong> <code>rs</code>: r에 맞는 부분 뒤에 s에 맞는 부분. <code>ab</code>는 문자열 "ab" 하나입니다.
        </li>
        <li>
          <strong>고르기</strong> <code>r|s</code>: r이나 s 중 하나. <code>cat|dog</code>는 "cat"과 "dog"입니다.
        </li>
        <li>
          <strong>반복</strong> <code>r*</code>: r을 0번 이상. 이 연산을 처음 연구한 수학자 클리니의 이름을 따 <T en="Kleene star">클리니 스타</T>라고 부릅니다. <code>(ab)*</code>는 ε, ab, abab, …입니다.
        </li>
      </ul>
      <p>
        우리가 자주 쓰는 나머지 문법은 이 셋의 줄임말입니다. <code>r+</code>는 <code>rr*</code>(1번 이상), <code>r?</code>는 <code>(r|ε)</code>(0번 또는 1번), <code>[0-9]</code>는 <code>0|1|…|9</code>입니다. 1950년대에 클리니는 정규 표현식으로 적을 수 있는 언어와 DFA가 인식하는 언어가 <strong>정확히 같다</strong>는 것을 보였습니다. 둘은 같은 것을 다르게 적은 것이고, 그래서 둘 다 "정규"라는 이름을 씁니다.
      </p>

      <h2>NFA: 여러 갈래를 동시에</h2>
      <p>
        정규 표현식을 바로 DFA로 바꾸기는 까다롭습니다. 그래서 중간 단계로 규칙이 느슨한 기계를 씁니다. <T en="nondeterministic finite automaton, NFA">비결정적 유한 오토마타</T>(NFA)는 DFA와 같지만 두 가지가 허용됩니다. 한 상태에서 같은 글자로 가는 화살표가 여러 개일 수도, 하나도 없을 수도 있고, 글자를 읽지 않고 건너가는 <T en="epsilon transition">ε 전이</T>가 있을 수 있습니다. NFA는 입력을 다 읽었을 때 수락 상태에서 끝나는 길이 <strong>하나라도 있으면</strong> 수락합니다.
      </p>
      <p>
        "갈래가 여러 개면 기계는 어느 쪽으로 가나?"라는 질문에는 "운 좋게 맞는 쪽을 고른다"고 생각해도 되고, "모든 갈래로 동시에 복제되어 간다"고 생각해도 됩니다. 두 번째 생각이 그대로 알고리즘이 됩니다. 그 전에, 정규 표현식에서 NFA를 만드는 방법부터 봅시다.
      </p>

      <h2>톰슨 구성법</h2>
      <p>
        유닉스를 만든 켄 톰슨은 1968년, 정규 표현식을 NFA로 바꾸어 텍스트를 검색하는 방법을 발표하고 그것을 편집기에 넣었습니다. 이 방법은 표현식을 <a href={lessonHref('cs-algorithm-design', 'recursion')}>재귀</a>적으로 다룹니다. 글자 하나는 화살표 하나짜리 작은 기계가 되고, 세 연산은 이미 만든 조각을 ε 화살표로 잇거나 감싸는 규칙이 됩니다. 조각마다 시작 상태 하나와 끝 상태 하나만 있다는 약속 덕분에 규칙은 조각 안이 어떻게 생겼는지 신경 쓰지 않아도 됩니다.
      </p>
      <BuildFigure />
      <p>
        규칙 하나가 상태를 많아야 둘 더하므로, 길이 m인 표현식에서 나오는 NFA의 상태는 많아야 2m개 정도입니다. 표현식이 길어져도 기계는 그에 비례해서만 커집니다. 그림 1에서 <code>(a|b)*abb</code>를 넣으면 상태 11개짜리 NFA가 나옵니다.
      </p>

      <h2>상태 집합으로 따라가기</h2>
      <p>
        이제 NFA로 문자열을 검사합니다. "모든 갈래로 동시에 간다"를 그대로 옮겨, 지금 있을 수 있는 상태를 <strong>집합</strong>으로 들고 다니면 됩니다. 글자를 하나 읽을 때마다 집합 안의 모든 상태에서 그 글자의 화살표를 따라가 새 집합을 만들고, ε 화살표로 갈 수 있는 상태를 모두 덧붙입니다(이것을 <T en="epsilon closure">ε-닫힘</T>이라고 합니다).
      </p>
      <SimFigure />
      <Code label="NFA를 상태 집합으로 시뮬레이션하기">{`
// nfa.edges: [{ from, to, sym }]  (sym이 null이면 ε 전이)
function closure(nfa, states) {
  const out = new Set(states);
  const stack = [...states];
  while (stack.length) {                    // ε 화살표를 따라 갈 수 있는 곳을 모두
    const q = stack.pop();
    for (const e of nfa.edges)
      if (e.from === q && e.sym === null && !out.has(e.to)) {
        out.add(e.to);
        stack.push(e.to);
      }
  }
  return out;
}

function matches(nfa, input) {
  let cur = closure(nfa, [nfa.start]);
  for (const ch of input) {
    const next = nfa.edges.filter((e) => cur.has(e.from) && e.sym === ch).map((e) => e.to);
    cur = closure(nfa, next);               // 모든 갈래를 한꺼번에 한 걸음
    if (cur.size === 0) return false;       // 살아남은 갈래가 없다
  }
  return cur.has(nfa.accept);
}`}</Code>
      <p>
        집합에는 상태가 많아야 m개이므로, 길이 n인 문자열을 검사하는 데 드는 일은 많아야 <M>{'O(nm)'}</M>입니다. 어떤 표현식, 어떤 입력에서도 이 한도를 넘지 않습니다.
      </p>
      <Callout kind="note" label="DFA로 바꾸기">
        상태 집합 하나를 DFA의 상태 하나로 보면, NFA를 DFA로 바꿀 수 있습니다. 이것을 <T en="subset construction">부분집합 구성</T>이라고 하고, 그림 2의 "DFA로 바꾸면"이 그렇게 만든 DFA의 상태 수입니다. 대개는 NFA보다 작지만, 상태 m개짜리 NFA에서 나올 수 있는 집합은 <M>{'2^m'}</M>개라 최악에는 DFA가 지수적으로 커집니다. 그래서 grep 같은 도구는 필요한 DFA 상태만 그때그때 만들어 캐시해 두는 방법을 씁니다.
      </Callout>

      <h2>역추적 엔진이 느려지는 순간</h2>
      <p>
        그런데 JavaScript, Python, Java, Perl의 정규 표현식 엔진은 대부분 이 방법을 쓰지 않습니다. 이들은 <T en="backtracking">역추적</T> 방식입니다. 갈래를 만나면 한쪽을 먼저 끝까지 시도하고, 실패하면 갈림길로 되돌아와 다른 쪽을 시도합니다. 미로에서 한 번에 한 길만 걷는 것과 같습니다. 대부분의 패턴에서는 금방 끝나지만, 갈래가 겹겹이 쌓인 패턴에 맞지 않는 입력을 주면 되돌아가 시도할 조합이 기하급수적으로 늘어납니다.
      </p>
      <BacktrackFigure />
      <p>
        <code>(a+)+b</code>에 a만 n개 있는 문자열을 넣어 봅시다. 바깥 <code>+</code>와 안쪽 <code>+</code>가 a들을 몇 묶음으로 나눌지에 대한 방법은 <M>{'2^{n-1}'}</M>가지입니다. 끝에 b가 없으니 모든 나누는 방법이 실패하고, 역추적 엔진은 그 전부를 시도한 뒤에야 거부합니다. n이 1 늘 때마다 일이 두 배가 됩니다. 반면 상태 집합 방법에서는 집합의 크기가 몇 개로 고정되어 있어 일이 n에 비례합니다. b를 붙여 일치하게 만들면 역추적도 첫 시도에 성공해서 금방 끝난다는 점도 보세요. 이 문제는 <strong>실패할 때</strong> 드러납니다.
      </p>
      <Callout kind="warn" label="실제로 일어난 일">
        2016년 7월 Stack Overflow는 공백 문자가 2만 개 남짓 이어진 게시물 하나 때문에 30분 넘게 멈췄습니다. 줄 끝의 공백을 지우는 정규 표현식이 공백마다 다시 시도하느라 입력 길이의 제곱에 비례하는 일을 했기 때문입니다. 2019년 7월에는 Cloudflare의 방화벽 규칙에 들어간 <code>.*(?:.*=.*)</code> 같은 패턴이 전 세계 서버의 CPU를 다 써 버려 약 30분 동안 많은 웹사이트가 응답하지 않았습니다. 사용자가 보낸 문자열에 정규 표현식을 돌리는 서버라면, 공격자가 일부러 이런 입력을 보내 서버를 멈출 수 있습니다. 이를 <T en="ReDoS">정규 표현식 서비스 거부</T>라고 합니다.
      </Callout>
      <p>그런데도 역추적 엔진을 쓰는 이유는 기능 때문입니다. 역추적 엔진은 정규 언어의 범위를 벗어나는 기능을 쉽게 붙일 수 있습니다.</p>
      <Code label="역추적만 할 수 있는 기능: 역참조">{`
// \\1은 "첫 번째 괄호가 실제로 맞춘 글자열"을 다시 요구한다
/^(a+)b\\1$/.test('aaabaaa');   // true  : a를 n개, b, a를 같은 n개
/^(a+)b\\1$/.test('aaabaa');    // false

// 이 언어 { aⁿ b aⁿ }은 앞 장의 aⁿbⁿ처럼 무한히 세어야 해서 정규 언어가 아니다.
// 어떤 DFA·NFA도 인식할 수 없으니, 상태 집합 방법으로는 구현할 수 없다.`}</Code>
      <p>
        <T en="backreference">역참조</T>나 앞을 내다보는 조건(lookahead)을 쓰지 않는다면 선택지가 있습니다. Google이 만든 RE2, Go의 <code>regexp</code>, Rust의 <code>regex</code>는 처음부터 오토마타 방식이라 입력 길이에 비례하는 시간을 보장하고, 대신 역참조를 지원하지 않습니다. 역추적 엔진을 써야 한다면 <code>(a+)+</code>처럼 반복 안에 반복을 넣은 패턴, <code>(a|a)*</code>처럼 같은 글자에 맞는 갈래가 겹치는 패턴을 피하고, 입력 길이를 먼저 제한하세요.
      </p>

      <Callout kind="key">
        정규 표현식, NFA, DFA는 모두 정규 언어라는 같은 집합을 나타냅니다. 톰슨 구성법은 표현식을 크기에 비례하는 NFA로 바꾸고, 상태 집합 시뮬레이션은 그 NFA로 어떤 입력이든 <M>{'O(nm)'}</M>에 검사합니다. 역추적 엔진은 기능이 많은 대신 갈래가 겹친 패턴에서 지수 시간이 걸릴 수 있습니다.
      </Callout>
      <Quiz
        q="사용자가 입력한 문자열을 JavaScript의 RegExp로 검사하는 서버가 있다. 다음 중 공격자가 고른 입력에 가장 오래 붙잡힐 위험이 큰 패턴은?"
        options={[<code key="1">^[0-9]+$</code>, <code key="2">^([a-z]+)*$</code>, <code key="3">^[a-z]+@[a-z]+\.com$</code>, <code key="4">^(cat|dog)s?$</code>]}
        answer={1}
        explain={<>
          <code>([a-z]+)*</code>는 그림 3의 <code>(a+)+</code>와 같은 모양입니다. 소문자 n개를 몇 묶음으로 나눌지 <M>{'2^{n-1}'}</M>가지 방법이 있고, 끝에 숫자 하나만 붙여 일치를 실패시키면 역추적 엔진은 그 방법을 모두 시도합니다. 나머지 패턴은 반복 안에 반복이 없어서, 같은 글자를 여러 갈래가 나눠 가질 수 없습니다.
        </>}
      />
    </>
  );
}

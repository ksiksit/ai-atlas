import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D } from '../../../../lib/canvas';
import { usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { BRANCHES, BUGS, BUG_SHORT, FUZZERS, FUZZER_KO, N_BRANCH, SAMPLES, campaign, ddmin, fromHex, fuzzSteps, glyph, newFuzzer, parse, toHex, type Bug, type FuzzState, type FuzzerKind } from './fuzz';
import './software.css';
import './fuzzing.css';

const STATUS_KO = { ok: '성공', reject: '거절', crash: '충돌', hang: '멈춤' } as const;
const DEFAULT_SEED = 1;
const DEFAULT_BUDGET = 50000;

/** One byte as a small cell: index, hex, character. */
function ByteCell({ x, i, k }: { x: number | undefined; i: number; k?: string }) {
  return (
    <span className="fz-byte" data-k={k}>
      <small>{i}</small>
      <b>{x === undefined ? '??' : x.toString(16).padStart(2, '0')}</b>
      <span>{x === undefined ? '' : glyph(x)}</span>
    </span>
  );
}

/* ─────────────── Figure 1: run the parser by hand ─────────────── */

function HandFigure() {
  const [sample, setSample] = useState('ok');
  const [text, setText] = useState(toHex(SAMPLES[0].bytes));
  const [san, setSan] = useState(true);
  const input = fromHex(text);
  const res = input ? parse(input, san) : null;
  const pick = (id: string) => {
    setSample(id);
    setText(toHex(SAMPLES.find((s) => s.id === id)!.bytes));
  };

  return (
    <Figure
      no={1}
      title="퍼징할 프로그램: 작은 이미지 머리말 해석기"
      hint="예시를 고르거나 16진수를 직접 고쳐 보세요"
      caption={<>파일은 매직 바이트 AT, 버전(1 또는 2), 그리고 "종류 1바이트, 길이 1바이트, 값" 레코드의 연속입니다. W와 H는 너비와 높이, C는 설명, P는 팔레트(버전 2), Z는 태그, S는 다음 레코드까지 건너뛸 길이(2바이트)입니다. 이 해석기에는 버그 세 개가 심어져 있습니다. 아래 목록은 이번 입력이 지나간 분기이고, 해석기 전체의 분기는 {N_BRANCH}개입니다.</>}
    >
      <div className="controls row">
        <Seg label="예시 입력" value={sample} onChange={pick} options={SAMPLES.map((s) => ({ value: s.id, label: s.label }))} />
        <Check label="새니타이저 켜기" checked={san} onChange={setSan} />
      </div>
      <label className="ss-small" htmlFor="fz-hex">
        입력 바이트 (16진수, 최대 256바이트)
      </label>
      <textarea id="fz-hex" className="fz-hex" value={text} spellCheck={false} aria-invalid={!input} onChange={(e) => setText(e.target.value)} />
      {input ? (
        <>
          <div className="fz-bytes" aria-label={`입력 ${input.length}바이트`}>
            {input.map((x, i) => (
              <ByteCell key={i} x={x} i={i} />
            ))}
          </div>
          <div className="ss-col" aria-live="polite">
            <div>
              <span className="fz-status" data-s={res!.status}>
                {STATUS_KO[res!.status]}
              </span>{' '}
              <span className="ss-note">{res!.note}</span>
            </div>
            <div className="ss-small">
              지나간 분기 {res!.branches.length}개 / {N_BRANCH}개{res!.silentOob ? ' · 파일 밖을 읽었지만 아무도 알아채지 못했습니다' : ''}
            </div>
            <ol className="fz-branches">
              {res!.branches.map((b) => (
                <li key={b} value={b}>
                  {BRANCHES[b]}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <div className="ss-note" data-bad="">
          16진수가 아닌 글자가 있습니다. 바이트는 41 54 01처럼 띄어 쓰거나 415401처럼 붙여 쓸 수 있습니다.
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: three fuzzers, same budget ─────────────── */

const fuzzColor = (P: Palette, k: FuzzerKind) => (k === 'random' ? P.ink3 : k === 'mutate' ? P.pos : P.neg);
const FUZZ_CSS: Record<FuzzerKind, string> = { random: 'var(--ink-3)', mutate: 'var(--pos)', coverage: 'var(--neg)' };
const PER_FRAME = 1200;

function RaceFigure() {
  const P = usePalette();
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [running, setRunning] = useState(false);
  const states = useRef<FuzzState[]>(FUZZERS.map((k) => newFuzzer(k, DEFAULT_SEED)));
  const [, setTick] = useState(0);
  const execs = states.current[0].execs;
  const finished = execs >= budget;

  const restart = (s: number, b: number) => {
    states.current = FUZZERS.map((k) => newFuzzer(k, s));
    setSeed(s);
    setBudget(b);
    setRunning(false);
    setTick((x) => x + 1);
  };

  useAnimationFrame(() => {
    const left = budget - states.current[0].execs;
    if (left <= 0) {
      setRunning(false);
      return;
    }
    for (const st of states.current) fuzzSteps(st, Math.min(PER_FRAME, left));
    setTick((x) => x + 1);
  }, running);

  const finishNow = () => {
    for (const st of states.current) fuzzSteps(st, budget - st.execs);
    setRunning(false);
    setTick((x) => x + 1);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 12, t: 12, b: 30 };
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const X = (e: number) => pad.l + (e / budget) * pw;
      const Y = (c: number) => pad.t + ph - (c / N_BRANCH) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (const c of [0, 10, 20, N_BRANCH]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(c) + 0.5);
        ctx.lineTo(w - pad.r, Y(c) + 0.5);
        ctx.stroke();
        ctx.fillText(String(c), pad.l - 6, Y(c));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= 5; k++) {
        const e = (budget / 5) * k;
        ctx.fillText(e >= 1000 ? `${e / 1000}천` : String(e), X(e), pad.t + ph + 6);
      }
      ctx.fillText('실행 횟수', pad.l + pw / 2, pad.t + ph + 18);
      FUZZERS.forEach((k, i) => {
        const st = states.current[i];
        ctx.strokeStyle = fuzzColor(P, k);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let prev = st.history[0][1];
        ctx.moveTo(X(0), Y(prev));
        for (const [e, c] of st.history) {
          ctx.lineTo(X(e), Y(prev));
          ctx.lineTo(X(e), Y(c));
          prev = c;
        }
        ctx.lineTo(X(st.execs), Y(prev));
        ctx.stroke();
        // where each bug was first found
        for (const f of st.found) {
          ctx.fillStyle = P.bad;
          ctx.beginPath();
          ctx.arc(X(f.at), Y(st.history.filter(([e]) => e <= f.at).pop()![1]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    [P, budget, execs, seed],
    { height: 260, minHeight: 40 },
  );

  const summary = FUZZERS.map((k, i) => `${FUZZER_KO[k]} 분기 ${states.current[i].covered.size}개, 버그 ${states.current[i].found.length}개`).join('; ');

  return (
    <Figure
      no={2}
      title="같은 실행 횟수, 세 가지 퍼저"
      hint="실행을 누르면 세 퍼저가 같은 수만큼 입력을 만들어 넣습니다"
      caption={<>세로축은 지금까지 한 번이라도 지나간 분기 수, 가로축은 실행 횟수입니다. 빨간 점은 버그를 처음 찾은 순간입니다. 변이 퍼저와 커버리지 기반 퍼저는 그림 1의 "올바른 파일"과 "버전 2와 팔레트"를 씨앗으로 받아서, 시작부터 그 둘이 지나가는 분기 10개를 압니다. 커버리지 기반 퍼저만 새 분기를 연 입력을 씨앗 목록(말뭉치)에 더합니다. 씨앗 {seed}번, 예산 {budget.toLocaleString('ko-KR')}번.</>}
    >
      <div className="controls row">
        <div className="btn-row">
          <Button small primary onClick={() => (finished ? (restart(seed, budget), setRunning(true)) : setRunning((r) => !r))}>
            {running ? '❚❚ 멈춤' : finished ? '▶ 다시 실행' : execs ? '▶ 이어서' : '▶ 실행'}
          </Button>
          <Button small onClick={finishNow} disabled={finished}>
            끝까지 바로
          </Button>
          <Button small onClick={() => restart(seed, budget)} disabled={execs === 0}>
            처음으로
          </Button>
          <Button small onClick={() => restart(seed + 1, budget)}>
            다른 씨앗
          </Button>
        </div>
        <Seg
          label="실행 예산"
          value={budget}
          onChange={(b) => restart(seed, b)}
          options={[
            { value: 10000, label: '1만 번' },
            { value: 50000, label: '5만 번' },
            { value: 100000, label: '10만 번' },
          ]}
        />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`실행 ${execs.toLocaleString('ko-KR')}번까지의 분기 수 그래프. ${summary}.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={FUZZERS.map((k) => ({ color: FUZZ_CSS[k], label: FUZZER_KO[k], shape: 'ln' as const }))} />
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="fz-table">
          <thead>
            <tr>
              <th>퍼저</th>
              <th>실행</th>
              <th>분기</th>
              <th>말뭉치</th>
              <th>거절된 입력</th>
              <th>찾은 버그 (처음 찾은 실행 번호)</th>
            </tr>
          </thead>
          <tbody>
            {FUZZERS.map((k, i) => {
              const st = states.current[i];
              return (
                <tr key={k}>
                  <td>
                    <span className="fz-swatch" style={{ background: FUZZ_CSS[k] }} />
                    {FUZZER_KO[k]}
                  </td>
                  <td className="num">{st.execs.toLocaleString('ko-KR')}</td>
                  <td className="num">
                    {st.covered.size}/{N_BRANCH}
                  </td>
                  <td className="num">{k === 'random' ? '없음' : st.corpus.length}</td>
                  <td className="num">{st.execs ? `${Math.round((st.counts.reject / st.execs) * 100)}%` : '-'}</td>
                  <td>
                    {st.found.length
                      ? st.found.map((f) => (
                          <span key={f.bug} className="fz-bug">
                            {BUG_SHORT[f.bug]}
                            <small>{f.at.toLocaleString('ko-KR')}</small>
                          </span>
                        ))
                      : <span className="ss-small">아직 없음</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: shrink a crashing input ─────────────── */

function MinimizeFigure() {
  const run = useMemo(() => campaign('coverage', DEFAULT_SEED, DEFAULT_BUDGET), []);
  const [bug, setBug] = useState<Bug>('hang');
  const found = run.found.find((f) => f.bug === bug)!;
  const steps = useMemo(() => ddmin(found.input, bug), [found, bug]);
  const s = useStepper(steps.length, 3, bug);
  const cur = steps[s.i];
  const tests = Math.min(s.i + 1, steps.length - 1);
  const last = s.i === steps.length - 1;
  // mark which bytes of the current input the tried candidate keeps (by matching a contiguous slice or a gap)
  const keptMask = useMemo(() => {
    const inp = cur.input, t = cur.tried;
    const mask = inp.map(() => false);
    for (let a = 0; a + t.length <= inp.length; a++) {
      if (t.every((x, k) => inp[a + k] === x)) {
        for (let k = 0; k < t.length; k++) mask[a + k] = true;
        return mask;
      }
    }
    // a complement: find the removed gap
    for (let a = 0; a <= t.length; a++) {
      const gap = inp.length - t.length;
      if (t.slice(0, a).every((x, k) => inp[k] === x) && t.slice(a).every((x, k) => inp[a + gap + k] === x)) {
        for (let k = 0; k < inp.length; k++) mask[k] = k < a || k >= a + gap;
        return mask;
      }
    }
    return inp.map(() => true);
  }, [cur]);

  return (
    <Figure
      no={3}
      title="충돌한 입력을 최소로 줄이기 (델타 디버깅)"
      hint="재생하거나 한 단계씩 넘겨 보세요"
      caption={<>그림 2의 커버리지 기반 퍼저(씨앗 {DEFAULT_SEED}번, 예산 {DEFAULT_BUDGET.toLocaleString('ko-KR')}번)가 찾은 입력에서 시작합니다. 한 단계마다 바이트 일부를 지운 입력을 해석기에 넣어 보고, 같은 버그가 그대로 나면 지운 채로 둡니다. 흐린 칸은 이번 시도에서 지운 바이트입니다.</>}
    >
      <div className="fig-split">
        <div className="ss-col">
          <div className="fz-bytes" aria-label={`지금 입력 ${cur.input.length}바이트`}>
            {cur.input.map((x, i) => (
              <ByteCell key={i} x={x} i={i} k={last ? undefined : keptMask[i] ? undefined : 'gone'} />
            ))}
          </div>
          <div className="ss-note" data-good={last || undefined} data-bad={(!last && !cur.kept) || undefined} aria-live="polite">
            {last ? `${cur.note} ${found.input.length}바이트가 ${cur.input.length}바이트(${toHex(cur.input)})가 되었습니다.` : `시험 ${s.i + 1}: ${cur.note} → ${cur.tried.length}바이트. ${cur.kept ? '같은 버그가 납니다. 이대로 줄입니다.' : '버그가 사라지거나 바뀌었습니다. 되돌립니다.'}`}
          </div>
        </div>
        <div className="controls">
          <Seg label="줄일 버그" value={bug} onChange={setBug} options={BUGS.map((b) => ({ value: b, label: BUG_SHORT[b] }))} />
          <StepControls s={s} id="fz-dd-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="처음 길이" value={`${found.input.length}바이트`} />
            <Readout label="지금 길이" value={`${cur.input.length}바이트`} color={last ? 'var(--good)' : undefined} />
          </div>
          <div className="ss-small">해석기를 {tests}번 실행했습니다 (전체 {steps.length - 1}번).</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: silent out-of-bounds reads ─────────────── */

const FILE = SAMPLES[0].bytes; // AT 01 W.. H.. C 03 "hi!"
const NEIGHBOR = Array.from('SID=7F3A9C2E1B;usr=doyun', (c) => c.charCodeAt(0));
const C_LEN_AT = 12;
const C_VAL_AT = 13;

function SanitizerFigure() {
  const [len, setLen] = useState(3);
  const [san, setSan] = useState(false);
  const [compare, setCompare] = useState<{ on: FuzzState; off: FuzzState } | null>(null);
  const file = FILE.map((b, i) => (i === C_LEN_AT ? len : b));
  const mem = file.concat(NEIGHBOR);
  const end = C_VAL_AT + len;
  const oob = end > file.length;
  const crashAt = file.length;
  const shown = san && oob ? [] : mem.slice(C_VAL_AT, Math.min(end, mem.length));
  const leaked = Math.max(0, Math.min(end, mem.length) - file.length);
  const res = parse(file, san);

  return (
    <Figure
      no={4}
      title="파일 밖을 읽어도 아무 일도 일어나지 않을 때"
      hint="설명 C의 길이를 키워 보세요"
      caption={<>위 줄은 메모리입니다. 앞의 {FILE.length}바이트는 파일이고, 그 뒤 점선 칸은 같은 프로그램이 다른 일로 메모리에 들고 있던 값(여기서는 다른 사용자의 세션 토큰)입니다. 해석기는 설명 C의 길이를 믿고 그만큼 읽어 설명으로 돌려줍니다. 노란 칸은 파일 안에서 읽은 바이트, 빨간 칸은 파일 밖에서 읽은 바이트입니다.</>}
    >
      <div className="controls row">
        <Slider id="fz-clen" label="설명 C에 적힌 길이" value={len} min={0} max={27} step={1} onChange={setLen} format={(v) => `${v}바이트`} />
        <Check label="새니타이저(ASan) 켜기" checked={san} onChange={setSan} />
      </div>
      <div className="fz-bytes" aria-label="메모리">
        {mem.map((x, i) => {
          const read = i >= C_VAL_AT && i < end;
          const k = read ? (i < file.length ? 'read' : san ? (i === crashAt ? 'oob' : 'gone') : 'oob') : i >= file.length ? 'other' : undefined;
          return <ByteCell key={i} x={x} i={i} k={k} />;
        })}
      </div>
      <div className="fz-mem-legend" aria-hidden="true">
        <span>
          <i style={{ background: 'color-mix(in srgb, var(--hl) 22%, var(--surface))' }} />
          파일 안에서 읽음
        </span>
        <span>
          <i style={{ background: 'color-mix(in srgb, var(--bad) 16%, var(--surface))' }} />
          파일 밖에서 읽음
        </span>
        <span>
          <i style={{ background: 'var(--surface-2)', borderStyle: 'dashed' }} />
          옆 메모리 (세션 토큰)
        </span>
      </div>
      <div className="ss-col" aria-live="polite">
        <div>
          <span className="fz-status" data-s={res.status}>
            {STATUS_KO[res.status]}
          </span>{' '}
          <span className="ss-note">{san && oob ? `${crashAt}번 바이트는 파일 밖입니다. 새니타이저가 그 읽기를 잡아 프로그램을 멈췄습니다.` : oob ? `해석기는 정상적으로 끝났다고 보고했지만, 설명으로 돌려준 값에 파일 밖의 ${leaked}바이트가 섞였습니다.` : res.note}</span>
        </div>
        <div className="ss-small">설명으로 돌려준 값</div>
        <div className="fz-out">{shown.length ? shown.map(glyph).join('') : san && oob ? '(돌려준 값 없음, 프로그램이 멈춤)' : '(빈 값)'}</div>
      </div>
      <div className="controls row">
        <Button small onClick={() => setCompare({ on: campaign('coverage', DEFAULT_SEED, DEFAULT_BUDGET, true), off: campaign('coverage', DEFAULT_SEED, DEFAULT_BUDGET, false) })} disabled={!!compare}>
          5만 번 퍼징으로 비교
        </Button>
        {compare && (
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr', flex: '1 1 380px' }}>
            <Readout label="ASan 끔: 찾은 버그" value={compare.off.found.map((f) => BUG_SHORT[f.bug]).join(', ') || '없음'} />
            <Readout label="ASan 끔: 조용히 넘어간 범위 밖 읽기" value={`${compare.off.silent}번`} color="var(--bad)" />
            <Readout label="ASan 켬: 찾은 버그" value={compare.on.found.map((f) => BUG_SHORT[f.bug]).join(', ')} color="var(--good)" />
          </div>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Fuzzing() {
  return (
    <>
      <h2>사람이 생각하지 못한 입력</h2>
      <p>
        테스트는 대개 작성자가 떠올린 입력을 넣어 봅니다. 그런데 보안 버그는 작성자가 떠올리지 못한 입력에서 나옵니다. 길이가 255라고 적혀 있는데 실제로는 3바이트뿐인 파일, 버전 번호 자리에 0이 들어간 파일 같은 것들입니다. <T en="fuzzing">퍼징</T>은 이런 입력을 기계가 대량으로 만들어 프로그램에 넣고, 충돌하거나 멈추는 입력을 모으는 방법입니다. 1988년 밀러(Barton Miller)가 수업 과제로 유닉스 명령어들에 무작위 문자를 넣었더니 상당수가 충돌한 것이 시작입니다.
      </p>
      <p>
        이 장에서 퍼징할 프로그램은 그림 1의 작은 해석기입니다. 이미지 파일의 머리말을 읽어 너비와 높이를 알아내는, 실제 파일 형식들을 아주 작게 줄인 것입니다. 작성자가 모르는 버그 세 개가 들어 있습니다. 예시 입력을 하나씩 골라 무엇이 일어나는지 먼저 보세요.
      </p>
      <HandFigure />
      <p>
        "설명 길이 부풀리기"는 설명 C의 길이를 200이라고 적었지만 파일에는 3바이트밖에 없습니다. 해석기는 길이를 믿고 200바이트를 읽으려다 파일 끝을 넘습니다. "태그 FUZZ"는 작성자가 "이런 값은 올 리 없다"며 단언을 걸어 둔 곳에 닿습니다. "건너뛰기 길이 0"은 해석기가 같은 자리를 끝없이 다시 읽게 만듭니다. 새니타이저를 끄고 "설명 길이 부풀리기"를 다시 넣어 보세요. 해석기는 <strong>성공</strong>이라고 답합니다. 이 차이는 그림 4에서 다시 봅니다.
      </p>
      <p>
        목록에 적힌 분기는 해석기의 조건문 하나하나에 번호를 붙여, 입력이 어느 갈래로 갔는지 기록한 것입니다. 실제 퍼저는 컴파일할 때 이런 기록 코드를 프로그램에 끼워 넣습니다. 이 기록을 어떻게 쓰느냐가 다음 절의 주제입니다.
      </p>

      <h2>무작위에서 커버리지까지</h2>
      <p>세 가지 퍼저를 같은 실행 횟수로 겨룹니다.</p>
      <ul>
        <li>
          <strong>무작위 바이트</strong>: 길이 1~32의 아무 바이트를 만듭니다.
        </li>
        <li>
          <strong>변이</strong>: 올바른 파일 두 개를 씨앗으로 받아, 비트를 뒤집거나 바이트를 바꾸거나 넣고 빼서 조금씩 망가뜨립니다. 씨앗 목록은 바꾸지 않습니다.
        </li>
        <li>
          <strong>커버리지 기반</strong>: 변이 퍼저와 같지만, 새 분기를 지나간 입력을 씨앗 목록에 더하고, 그중 가장 최근 것을 더 자주 고릅니다. 2013년 잘레프스키(Michał Zalewski)가 만든 AFL이 널리 퍼뜨린 방식입니다.
        </li>
      </ul>
      <RaceFigure />
      <p>
        기본 설정(씨앗 1번, 5만 번)으로 끝까지 돌리면 결과가 크게 갈립니다. 무작위 퍼저의 5만 개 입력은 하나도 빠짐없이 거절되고, 지나간 분기는 4개뿐입니다. 첫 두 바이트가 A와 T일 확률이 65,536분의 1이라 대부분 첫 줄에서 돌려보내지기 때문입니다. 변이 퍼저는 올바른 파일에서 출발하므로 시작부터 깊이 들어가 분기 23개를 지나고, 범위 밖 읽기(13번째 실행)와 무한 반복(7,646번째)을 찾습니다. 커버리지 기반 퍼저는 분기 27개를 지나며 세 버그를 모두 찾습니다. 범위 밖 읽기는 67번째, 무한 반복은 262번째, 그리고 FUZZ 단언은 30,342번째 실행에서입니다.
      </p>
      <p>
        FUZZ 단언에 닿으려면 레코드 종류가 Z이고, 길이가 4 이상이고, 값이 F, U, Z, Z로 시작해야 합니다. 무작위로 네 바이트를 한꺼번에 맞힐 확률은 약 43억분의 1이라 변이 퍼저는 사실상 닿지 못합니다. 커버리지 기반 퍼저는 첫 글자 F를 맞힌 입력이 새 분기를 열면 그 입력을 씨앗으로 남기고, 거기서 둘째 글자를 맞히는 식으로 한 바이트씩 나아갑니다. 문제를 네 번의 256분의 1로 쪼갠 셈입니다.
      </p>
      <Callout kind="note">
        여기서는 FUZZ 비교를 바이트마다 다른 분기로 나눠 두었습니다. 실제 프로그램의 <code>memcmp(value, "FUZZ", 4)</code>는 분기가 하나뿐이라 커버리지 기반 퍼저도 한 바이트씩 나아갈 수 없습니다. 그래서 실제 퍼저는 컴파일러로 비교를 바이트 단위로 쪼개거나(laf-intel), 프로그램이 비교하는 값을 엿보고 입력에 직접 넣어 보거나(AFL++의 CmpLog), 사람이 준 단어 사전을 씁니다.
      </Callout>

      <h2>충돌한 입력을 줄이기</h2>
      <p>
        퍼저가 찾은 입력은 대개 쓸데없는 바이트로 가득합니다. 버그를 고치는 사람에게는 같은 버그를 내는 가장 짧은 입력이 필요합니다. 2002년 첼러(Andreas Zeller)의 <T en="delta debugging">델타 디버깅</T>은 입력을 조각으로 나눠 하나씩 지워 보고, 같은 버그가 그대로 나면 지운 채로 두고, 더 이상 지울 수 없으면 조각을 더 잘게 나눕니다.
      </p>
      <MinimizeFigure />
      <p>
        무한 반복을 일으킨 19바이트는 해석기를 40번 실행한 끝에 <code>41 54 02 53 00 00</code>, 6바이트가 됩니다. "AT, 버전 2, 건너뛰기, 길이 0"이니 버그의 원인이 그대로 드러납니다. 범위 밖 읽기는 15바이트가 55번 만에 9바이트로 줄어듭니다. 그런데 <code>41 54 01 43 21</code>(AT, 버전 1, 설명, 길이 33)처럼 5바이트로도 같은 버그가 납니다. 델타 디버깅은 "바이트 하나를 더 지우면 버그가 사라지는" 지점에서 멈출 뿐, 가장 짧은 입력을 보장하지는 않습니다. FUZZ 단언은 22바이트가 17바이트까지만 줄어듭니다. 태그의 길이 바이트가 8이라 값 바이트를 하나 지우면 레코드가 잘려 버리고, 길이 바이트와 값 바이트를 함께 고쳐야 하는 변화는 지우기만으로는 만들 수 없기 때문입니다.
      </p>

      <h2>조용한 버그를 시끄럽게: 새니타이저</h2>
      <p>
        퍼저는 프로그램이 충돌하거나 멈춰야 버그를 알아챕니다. 그런데 C나 C++에서 배열 끝을 조금 넘어 읽는 것은 대개 충돌하지 않습니다. <a href={lessonHref('cs-architecture', 'pointers')}>포인터와 배열</a> 장에서 본 것처럼, 그 자리에도 다른 값이 들어 있는 메모리가 있기 때문입니다. 그림 4에서 길이를 키워 보세요.
      </p>
      <SanitizerFigure />
      <p>
        길이를 20으로 두면 해석기는 성공이라고 보고하면서 설명으로 <code>hi!</code> 뒤에 파일 밖의 17바이트, 다른 사용자의 세션 토큰 앞부분을 돌려줍니다. 2014년 OpenSSL의 하트블리드(Heartbleed)가 바로 이 모양이었습니다. 요청에 적힌 길이를 믿고 그만큼 메모리를 복사해 돌려주는 바람에, 서버 메모리의 비밀 키와 비밀번호가 새어 나갔습니다.
      </p>
      <p>
        <T en="sanitizer">새니타이저</T>는 이런 조용한 잘못을 즉시 충돌로 바꿔 주는 컴파일러 기능입니다. AddressSanitizer(ASan)는 할당한 메모리 앞뒤에 "독이 든" 구역을 두고 모든 메모리 접근을 검사해, 그 구역을 건드리는 순간 프로그램을 멈추고 위치를 알려 줍니다. 상자를 켜면 파일 밖의 첫 바이트를 읽는 순간 멈춥니다. <strong>5만 번 퍼징으로 비교</strong>를 누르면, 새니타이저를 끈 커버리지 기반 퍼저는 범위 밖 읽기를 찾지 못하고, 그동안 파일 밖을 읽은 입력 131개가 아무 경고 없이 지나갔다는 것을 볼 수 있습니다. 새니타이저를 켜면 같은 입력들이 모두 충돌로 잡힙니다. 그래서 퍼징은 거의 언제나 새니타이저를 켠 빌드로 합니다. 정수 넘침, 초기화하지 않은 메모리 읽기, 스레드 경쟁을 잡는 새니타이저도 따로 있습니다.
      </p>
      <Code label="libFuzzer 방식의 퍼징 대상 함수">{`
// 퍼저가 만든 입력을 받아 해석기에 넣기만 하는 함수
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  parse_header(data, size);   // 충돌, 멈춤, 새니타이저 경고가 곧 발견
  return 0;
}
// 빌드: clang -g -fsanitize=fuzzer,address target.c parser.c`}</Code>
      <p>
        이렇게 작은 함수 하나만 써 두면, 퍼저가 몇 시간이고 입력을 만들어 넣습니다. 구글의 OSS-Fuzz는 2016년부터 오픈 소스 프로젝트 수백 개를 이렇게 쉬지 않고 퍼징해 왔고, 그동안 찾은 버그는 수만 개에 이릅니다. 메모리 버그를 막는 다른 길은 처음부터 경계를 검사하는 언어를 쓰는 것입니다. <a href={lessonHref('cs-operating-systems', 'protection')}>보호와 보안</a> 장의 방어 장치들이 공격을 어렵게 만든다면, 퍼징은 공격자보다 먼저 구멍을 찾는 방법입니다.
      </p>

      <Callout kind="key">
        퍼징은 프로그램에 기계가 만든 입력을 대량으로 넣어 충돌과 멈춤을 찾습니다. 무작위 입력은 첫 검사도 통과하기 어렵고, 올바른 파일을 조금씩 바꾸는 변이는 훨씬 깊이 들어갑니다. 커버리지 기반 퍼징은 새 분기를 연 입력을 씨앗으로 남겨 어려운 조건을 한 단계씩 풉니다. 찾은 입력은 델타 디버깅으로 줄여 원인을 드러내고, 충돌하지 않는 메모리 버그는 새니타이저를 켜야 보입니다.
      </Callout>
      <Quiz
        q="C로 쓴 PNG 해석기를 하룻밤 퍼징했는데 충돌이 하나도 없었다. 다음 중 가장 먼저 의심할 것은?"
        options={['해석기에 버그가 없다는 뜻이므로 배포해도 된다', '새니타이저 없이 빌드해서 범위 밖 읽기 같은 버그가 충돌 없이 지나갔을 수 있고, 씨앗이 없어 입력 대부분이 첫 검사에서 거절됐을 수 있다', '퍼저의 실행 속도가 너무 빨라서 버그를 지나쳤다', '하룻밤은 너무 길어서 결과를 믿을 수 없다']}
        answer={1}
        explain={<>충돌이 없다는 것은 "이 퍼저가 이 빌드에서 충돌을 만들지 못했다"는 뜻일 뿐입니다. 그림 4처럼 새니타이저가 없으면 범위 밖 읽기는 조용히 지나가고, 그림 2의 무작위 퍼저처럼 올바른 PNG 씨앗 없이 시작하면 입력 대부분이 매직 바이트 검사에서 거절되어 해석기의 깊은 곳에 닿지 못합니다. 커버리지 수치를 확인하고, 새니타이저를 켜고, 씨앗을 넣어 다시 돌려야 합니다.</>}
      />
    </>
  );
}

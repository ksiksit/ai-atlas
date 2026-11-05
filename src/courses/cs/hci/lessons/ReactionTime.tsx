import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button, Callout, Figure, Legend, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { CHOICE_KEYS, CHOICES, EXAMPLE_CHOICE, TOO_FAST_MS, TRIALS_PER_BLOCK, digits, hickFit, mean, median, waitMs, type Choice } from './measure';
import './hci.css';
import './reaction.css';

const PRIVACY = '측정한 시간은 이 페이지 안에서만 쓰고, 저장하거나 어디로 보내지 않습니다. 페이지를 떠나면 사라집니다.';
const ms = (v: number) => `${Math.round(v)}ms`;

/* ─────────────── Figure 1: simple reaction time ─────────────── */

type SimplePhase = 'idle' | 'wait' | 'go' | 'early' | 'done';
const SIMPLE_TRIALS = 5;

function SimpleReaction() {
  const [phase, setPhase] = useState<SimplePhase>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const [early, setEarly] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const shownAt = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // the stimulus is on screen from the frame after the colour change, so start the clock there
  useEffect(() => {
    if (phase !== 'go') return;
    shownAt.current = performance.now();
    const id = requestAnimationFrame(() => (shownAt.current = performance.now()));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const arm = () => {
    window.clearTimeout(timer.current);
    setPhase('wait');
    timer.current = window.setTimeout(() => setPhase('go'), waitMs(Math.random()));
  };

  const press = () => {
    if (phase === 'idle' || phase === 'early' || (phase === 'done' && times.length < SIMPLE_TRIALS)) return arm();
    if (phase === 'wait') {
      window.clearTimeout(timer.current);
      setEarly((e) => e + 1);
      setPhase('early');
      return;
    }
    if (phase === 'go') {
      const rt = performance.now() - shownAt.current;
      if (rt < TOO_FAST_MS) {
        setEarly((e) => e + 1);
        setPhase('early');
        return;
      }
      setTimes((t) => [...t, rt]);
      setPhase('done');
    }
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) press();
    }
  };
  const reset = () => {
    window.clearTimeout(timer.current);
    setTimes([]);
    setEarly(0);
    setPhase('idle');
  };

  const finished = times.length >= SIMPLE_TRIALS;
  const label = finished
    ? `다섯 번 끝. 평균 ${ms(mean(times))}입니다.`
    : phase === 'idle'
      ? '여기를 누르면 시작합니다'
      : phase === 'wait'
        ? '기다리세요… 색이 바뀌면 바로 누르세요'
        : phase === 'go'
          ? '지금 누르세요!'
          : phase === 'early'
            ? '너무 일렀습니다. 다시 누르면 그 회를 다시 합니다'
            : `${ms(times[times.length - 1])}. 다시 누르면 다음 회를 시작합니다`;

  return (
    <Figure
      no={1}
      title="단순 반응 시간"
      hint="상자를 누르거나 스페이스 바를 누르세요"
      caption={
        <>
          기다리는 시간은 매번 1.2초에서 3.5초 사이에서 무작위로 정해지므로 미리 짐작해서 누를 수 없습니다. 색이 바뀌기 전에 누르거나 0.1초보다 빨리 누르면 짐작한 것으로 보고 그 회를 다시 합니다. 화면과 마우스, 키보드는 저마다 수십 ms의 지연을 더하므로 여기서 잰 값은 대략적인 값입니다. {PRIVACY}
        </>
      }
    >
      <div
        className="rx-pad"
        data-phase={finished ? 'done' : phase}
        role="button"
        tabIndex={0}
        aria-label={`반응 시간 측정 상자. ${label}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (!finished) press();
        }}
        onKeyDown={(e) => !finished && onKey(e)}
      >
        <span aria-live="assertive">{label}</span>
      </div>
      <div className="controls row">
        <div className="rx-chips" aria-label="잰 반응 시간">
          <span className="lbl">기록</span>
          {Array.from({ length: SIMPLE_TRIALS }, (_, i) => (
            <span key={i} className="rx-chip" data-on={i < times.length || undefined}>
              {i < times.length ? ms(times[i]) : `${i + 1}회`}
            </span>
          ))}
        </div>
        <Button small onClick={reset} disabled={!times.length && !early}>
          처음부터
        </Button>
      </div>
      <div className="readouts">
        <Readout label="평균" value={times.length ? ms(mean(times)) : '–'} />
        <Readout label="중앙값" value={times.length ? ms(median(times)) : '–'} />
        <Readout label="너무 이른 누름" value={`${early}번`} color={early ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: choice reaction time ─────────────── */

type ChoicePhase = 'idle' | 'wait' | 'go';

function ChoiceReaction({ results, onBlock }: { results: Partial<Record<Choice, number[]>>; onBlock: (n: Choice, times: number[]) => void }) {
  const [n, setN] = useState<Choice>(2);
  const [phase, setPhase] = useState<ChoicePhase>('idle');
  const [target, setTarget] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [errors, setErrors] = useState(0);
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const shownAt = useRef(0);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (phase !== 'go') return;
    shownAt.current = performance.now();
    const id = requestAnimationFrame(() => (shownAt.current = performance.now()));
    return () => cancelAnimationFrame(id);
  }, [phase, target]);

  const next = () => {
    window.clearTimeout(timer.current);
    setPhase('wait');
    timer.current = window.setTimeout(() => {
      setTarget(Math.floor(Math.random() * n));
      setPhase('go');
    }, 700 + Math.random() * 1300);
  };
  const start = () => {
    setTimes([]);
    setErrors(0);
    setMsg('');
    stage.current?.focus();
    next();
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setPhase('idle');
  };
  const pick = (n2: Choice) => {
    stop();
    setN(n2);
    setTimes([]);
    setErrors(0);
    setMsg('');
  };

  const answer = (k: number) => {
    if (phase === 'wait') {
      setMsg('아직 아무것도 켜지지 않았습니다. 이번 회는 다시 합니다.');
      next();
      return;
    }
    if (phase !== 'go') return;
    const rt = performance.now() - shownAt.current;
    if (rt < TOO_FAST_MS) {
      setMsg('너무 빨랐습니다. 짐작으로 보고 다시 합니다.');
      next();
      return;
    }
    if (k !== target) {
      setErrors((e) => e + 1);
      setMsg(`틀렸습니다 (${target + 1}번이 켜졌습니다). 틀린 회는 평균에 넣지 않습니다.`);
      next();
      return;
    }
    const nt = [...times, rt];
    setTimes(nt);
    setMsg(`${ms(rt)}`);
    if (nt.length >= TRIALS_PER_BLOCK) {
      setPhase('idle');
      onBlock(n, nt);
      setMsg(`선택지 ${n}개 끝. 평균 ${ms(mean(nt))}. 다른 개수도 해 보세요.`);
    } else next();
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const k = CHOICE_KEYS.indexOf(e.key);
    if (k < 0 || k >= n || e.repeat) return;
    e.preventDefault();
    answer(k);
  };

  const running = phase !== 'idle';
  return (
    <Figure
      no={2}
      title="선택 반응 시간"
      hint="켜진 칸의 숫자 키를 누르거나 그 칸을 누르세요"
      caption={
        <>
          선택지 개수마다 맞힌 {TRIALS_PER_BLOCK}번의 시간을 모아 평균을 냅니다. 키보드로는 숫자 키 1부터 {n}까지, 휴대폰에서는 켜진 칸을 직접 누르세요. 칸이 켜지기 전에 누르거나 틀린 칸을 누른 회는 평균에 넣지 않고 다시 합니다. 결과는 그림 3에 바로 나타납니다. {PRIVACY}
        </>
      }
    >
      <div className="controls row">
        <Seg label="선택지 개수" value={n} onChange={pick} options={CHOICES.map((c) => ({ value: c, label: `${c}개${results[c] ? ' ✓' : ''}` }))} />
        <div className="btn-row">
          <Button small primary onClick={start} disabled={running}>
            {results[n] ? '다시 재기' : '시작'}
          </Button>
          <Button small onClick={stop} disabled={!running}>
            멈춤
          </Button>
        </div>
      </div>
      <div ref={stage} className="rx-stage" tabIndex={0} onKeyDown={onKey} aria-label={`선택 반응 시간 측정. 선택지 ${n}개. ${running ? (phase === 'go' ? `${target + 1}번이 켜졌습니다.` : '기다리는 중입니다.') : '시작을 누르세요.'}`} data-running={running || undefined}>
        <div className="rx-targets" style={{ ['--n' as string]: n }}>
          {Array.from({ length: n }, (_, k) => (
            <div
              key={k}
              className="rx-target"
              data-on={(phase === 'go' && k === target) || undefined}
              onPointerDown={(e) => {
                e.preventDefault();
                if (running) answer(k);
              }}
            >
              <span className="mono">{CHOICE_KEYS[k]}</span>
            </div>
          ))}
        </div>
        <div className="rx-fix" aria-hidden="true">
          {phase === 'wait' ? '+' : ''}
        </div>
      </div>
      <div className="hc-note" aria-live="polite">
        {msg || (running ? '켜질 칸을 기다리세요.' : '시작을 누른 뒤, 칸이 켜지면 그 칸의 숫자 키를 누르세요. 칸을 직접 눌러도 됩니다.')}
      </div>
      <div className="readouts">
        <Readout label="이번 묶음" value={`${times.length} / ${TRIALS_PER_BLOCK}`} />
        <Readout label="평균" value={times.length ? ms(mean(times)) : '–'} />
        <Readout label="틀림" value={`${errors}번`} color={errors ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Hick–Hyman plot ─────────────── */

function HickPlot({ results }: { results: Partial<Record<Choice, number[]>> }) {
  const P = usePalette();
  const mineBlocks = CHOICES.filter((c) => results[c]?.length).length;
  const [src, setSrc] = useState<'example' | 'mine'>('example');
  const prevBlocks = useRef(0);
  useEffect(() => {
    // switch to the reader's own data as soon as there is a line to fit
    if (mineBlocks >= 2 && prevBlocks.current < 2) setSrc('mine');
    prevBlocks.current = mineBlocks;
  }, [mineBlocks]);

  const useMine = src === 'mine' && mineBlocks >= 1;
  const data = useMine ? results : EXAMPLE_CHOICE;
  const { pts, fit } = hickFit(data);
  const all = CHOICES.flatMap((c) => (data[c] ?? []).map((rt) => ({ bits: Math.log2(c), rt })));
  const yMax = Math.max(800, ...all.map((p) => p.rt)) * 1.08;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: -0.25, xMax: 3.35, yMin: 0, yMax, pad: { l: 52, r: 16, t: 16, b: 40 } });
      pl.grid({ xStep: 1, yStep: yMax > 1600 ? 400 : 200, fmt: (v) => String(Math.round(v)) });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('선택지의 정보량 log₂N (비트)', pl.pad.l + pl.pw / 2, h - 4);
      ctx.save();
      ctx.translate(12, pl.pad.t + pl.ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('반응 시간 (ms)', 0, 0);
      ctx.restore();
      pl.clip();
      if (fit) pl.fn((x) => fit.a + fit.b * x, alpha(P.accent, 0.85), 2, { dash: [6, 4] });
      for (const p of all) pl.dot(p.bits, p.rt, 2.5, alpha(P.ink3, 0.45));
      for (const p of pts) pl.dot(p.bits, p.rt, 6, P.accent, P.surface, 2);
      pl.unclip();
      for (const p of pts) pl.text(`N=${p.n} · ${ms(p.rt)}`, p.bits, p.rt, P.ink2, { dy: -14, align: 'center', font: `600 11px ${P.fontBody}`, bg: P.surface });
      if (!useMine) pl.text('예시 데이터', 3.3, yMax * 0.06, P.ink3, { align: 'right', font: `600 12px ${P.fontBody}` });
    },
    [P, data, useMine, yMax],
    { height: 300 },
  );

  return (
    <Figure
      no={3}
      title="선택지가 두 배가 될 때마다 같은 만큼씩"
      hint={mineBlocks >= 2 ? '내 기록과 예시 데이터를 바꿔 보세요' : '그림 2에서 두 가지 이상 재면 내 기록으로 바뀝니다'}
      caption={
        <>
          큰 점은 선택지 개수마다의 평균, 작은 점은 한 번 한 번의 기록, 점선은 평균들에 맞춘 직선입니다. 가로축이 선택지 개수 N이 아니라 log₂N이라는 점을 보세요. 1, 2, 4, 8개가 0, 1, 2, 3비트로 같은 간격이 됩니다. 예시 데이터는 이 장을 위해 만든 한 사람의 그럴듯한 기록이며, 실제 측정값이 아닙니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="데이터"
          value={useMine ? 'mine' : 'example'}
          onChange={setSrc}
          options={[
            { value: 'example', label: '예시 데이터' },
            { value: 'mine', label: `내 기록 (${mineBlocks}/4)` },
          ]}
        />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${useMine ? '내 기록' : '예시 데이터'}의 선택지 개수별 평균 반응 시간: ${pts.map((p) => `${p.n}개 ${ms(p.rt)}`).join(', ')}.${fit ? ` 맞춘 직선은 반응 시간 = ${Math.round(fit.a)} + ${Math.round(fit.b)} × log₂N ms입니다.` : ''}`}>
        <canvas ref={canvasRef} />
      </div>
      {src === 'mine' && mineBlocks < 1 && <div className="hc-note">아직 내 기록이 없어 예시 데이터를 보여 줍니다.</div>}
      <div className="readouts">
        <Readout label="a (기본 시간)" value={fit ? ms(fit.a) : '–'} />
        <Readout label="b (비트당 시간)" value={fit ? `${Math.round(fit.b)}ms/비트` : '–'} color="var(--accent)" />
        <Readout label="직선이 설명하는 정도 r²" value={fit ? fit.r2.toFixed(3) : '–'} />
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '선택지별 평균', shape: 'dot' },
          { color: 'var(--ink-3)', label: '한 번의 기록', shape: 'dot' },
          { color: 'var(--accent)', label: '맞춘 직선 a + b·log₂N', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: digit span ─────────────── */

type SpanPhase = 'idle' | 'show' | 'answer' | 'end';
const START_LEN = 4;
const DIGIT_MS = 900;

function DigitSpan() {
  const [phase, setPhase] = useState<SpanPhase>('idle');
  const [len, setLen] = useState(START_LEN);
  const [seq, setSeq] = useState('');
  const [shown, setShown] = useState(-1);
  const [input, setInput] = useState('');
  const [fails, setFails] = useState(0);
  const [best, setBest] = useState(0);
  const [log, setLog] = useState<{ seq: string; ok: boolean }[]>([]);
  const [chunk, setChunk] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const play = (k: number) => {
    const s = digits(k, Math.random);
    setSeq(s);
    setInput('');
    setPhase('show');
    let i = 0;
    const tick = () => {
      setShown(i);
      i++;
      if (i <= s.length) timer.current = window.setTimeout(tick, DIGIT_MS);
      else {
        setShown(-1);
        setPhase('answer');
        window.setTimeout(() => field.current?.focus(), 0);
      }
    };
    tick();
  };
  const start = () => {
    window.clearTimeout(timer.current);
    setLen(START_LEN);
    setFails(0);
    setBest(0);
    setLog([]);
    play(START_LEN);
  };
  const submit = () => {
    if (phase !== 'answer') return;
    const ok = input.replace(/\D/g, '') === seq;
    setLog((l) => [...l, { seq, ok }]);
    if (ok) {
      setBest((b) => Math.max(b, len));
      setFails(0);
      setLen(len + 1);
      play(len + 1);
    } else if (fails + 1 >= 2) {
      setFails(fails + 1);
      setPhase('end');
    } else {
      setFails(fails + 1);
      play(len);
    }
  };

  const digitShown = phase === 'show' && shown >= 0 && shown < seq.length ? seq[shown] : '';
  // with chunking on, the digits are shown in groups of three or four, the way phone numbers are written
  const grouped = chunk && phase === 'show' && shown >= 0 ? seq.slice(0, Math.min(seq.length, shown + 1)).replace(/(\d{3})(?=\d)/g, '$1-') : '';

  return (
    <Figure
      no={4}
      title="숫자를 몇 개까지 붙잡아 둘 수 있나"
      hint="숫자가 하나씩 지나간 뒤 순서대로 입력하세요"
      caption={
        <>
          4자리에서 시작해, 맞히면 한 자리씩 늘어나고 같은 길이에서 두 번 틀리면 끝납니다. "묶어서 보기"를 켜면 숫자가 지나간 자리에 세 개씩 묶인 줄이 남습니다. 이것은 기억을 돕는 화면이므로 이때의 결과는 기억 폭이 아니라 화면 설계가 기억을 얼마나 덜어 주는지를 보여 줍니다. {PRIVACY}
        </>
      }
    >
      <div className="controls row">
        <div className="btn-row">
          <Button small primary onClick={start} disabled={phase === 'show'}>
            {phase === 'idle' ? '시작' : '처음부터'}
          </Button>
        </div>
        <label className="check">
          <input type="checkbox" checked={chunk} onChange={(e) => setChunk(e.target.checked)} disabled={phase === 'show'} />
          묶어서 보기 (화면이 기억을 돕기)
        </label>
      </div>
      <div className="rx-span" aria-live="off">
        <div className="rx-digit mono" aria-hidden="true">
          {digitShown}
        </div>
        <div className="rx-group mono" aria-hidden="true">
          {grouped}
        </div>
        <div className="visually-hidden" aria-live="polite">
          {phase === 'show' ? `${seq.length}자리 숫자를 보여 주는 중입니다.` : phase === 'answer' ? '이제 입력하세요.' : ''}
        </div>
      </div>
      <form
        className="rx-answer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="rx-span-in" className="hc-small">
          본 숫자 ({len}자리)
        </label>
        <input id="rx-span-in" ref={field} className="mono" inputMode="numeric" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} disabled={phase !== 'answer'} />
        <Button small primary onClick={submit} disabled={phase !== 'answer'}>
          확인
        </Button>
      </form>
      <div className="hc-note" data-good={phase === 'end' || undefined} aria-live="polite">
        {phase === 'idle'
          ? '시작을 누르면 숫자가 1초에 하나씩 나타났다 사라집니다. 다 지나가면 본 순서대로 입력하세요.'
          : phase === 'end'
            ? `끝. 맞힌 가장 긴 줄은 ${best || '없음'}${best ? '자리' : ''}입니다. 대부분의 사람은 7자리 안팎에서 틀리기 시작합니다.`
            : log.length
              ? log[log.length - 1].ok
                ? `맞았습니다. 이번에는 ${len}자리입니다.`
                : `틀렸습니다 (정답 ${log[log.length - 1].seq}). 같은 길이로 한 번 더 합니다.`
              : `${len}자리로 시작합니다.`}
      </div>
      <div className="readouts">
        <Readout label="지금 길이" value={`${len}자리`} />
        <Readout label="맞힌 가장 긴 줄" value={best ? `${best}자리` : '–'} color="var(--good)" />
        <Readout label="이 길이에서 틀림" value={`${fails} / 2`} color={fails ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ReactionTime() {
  const [results, setResults] = useState<Partial<Record<Choice, number[]>>>({});
  const ex = hickFit(EXAMPLE_CHOICE);
  const exA = Math.round(ex.fit!.a);
  const exB = Math.round(ex.fit!.b);
  return (
    <>
      <h2>사람도 재면 법칙이 보입니다</h2>
      <p>
        컴퓨터가 얼마나 빠른지는 클록 수와 명령어 수로 잽니다. 그런데 컴퓨터를 쓰는 일의 속도는 대개 사람 쪽에서 정해집니다. 화면에서 무언가를 알아보고, 무엇을 할지 고르고, 손을 움직여 누르는 데 걸리는 시간입니다. <T en="human-computer interaction, HCI">사람과 컴퓨터의 상호작용</T>은 이 시간과 실수를 재고, 그 결과로 인터페이스를 설계하고 평가하는 분야입니다.
      </p>
      <p>
        사람을 재는 데는 컴퓨터를 재는 것과 다른 어려움이 있습니다. 같은 사람도 매번 다르게 반응하고, 사람마다 다르고, 연습하면 빨라집니다. 그래서 한 번이 아니라 여러 번 재서 평균과 흩어짐을 보고, 조건을 하나만 바꿔 가며 비교합니다. 이 장에서는 여러분 자신이 실험 대상입니다. 먼저 가장 단순한 것부터 재 봅시다.
      </p>
      <SimpleReaction />
      <p>
        색이 바뀐 것을 보고 손가락을 움직이는 데 걸리는 이 시간을 <T en="simple reaction time">단순 반응 시간</T>이라고 합니다. 빛을 보고 누르는 반응은 건강한 성인이 대략 0.2초에서 0.25초 사이라고 알려져 있습니다. 여러분의 값이 이보다 크다면, 그중 수십 ms는 여러분이 아니라 기기 몫일 수 있습니다. 화면은 초당 60번 정도 새로 그리므로 색이 바뀐 것이 실제로 보이기까지 최대 16ms 남짓 늦을 수 있고, 무선 마우스나 터치 화면은 누른 순간을 브라우저에 알리는 데 다시 시간이 듭니다.
      </p>
      <p>
        다섯 번의 기록이 서로 조금씩 다른 것도 보세요. 그래서 평균과 함께 <a href={lessonHref('stats-basics', 'summary')}>중앙값</a>을 봅니다. 한 번 딴생각을 해서 크게 늦어진 기록이 있으면 평균은 끌려 올라가지만 중앙값은 거의 그대로입니다.
      </p>

      <h2>고를 것이 많으면 느려집니다</h2>
      <p>
        이번에는 무엇을 누를지 골라야 합니다. 칸 여러 개 중 하나가 켜지면 그 칸의 숫자 키를 누릅니다. 선택지가 하나면 단순 반응과 같고, 둘, 넷, 여덟이 되면 어떻게 달라질까요? 각 개수를 한 번씩 재 보세요.
      </p>
      <ChoiceReaction results={results} onBlock={(n, t) => setResults((r) => ({ ...r, [n]: t }))} />
      <p>
        선택지가 많을수록 느려진다는 것은 짐작할 수 있습니다. 놀라운 것은 그 늘어나는 모양입니다. 1952년 힉(William Hick)과 1953년 하이먼(Ray Hyman)은 선택 반응 시간이 선택지 개수가 아니라 그 <strong>로그</strong>에 비례해 늘어난다는 것을 보였습니다. 이것이 <T en="Hick–Hyman law">힉-하이먼 법칙</T>입니다.
      </p>
      <HickPlot results={results} />
      <p>
        그림 3의 예시 데이터에서 선택지별 평균은 1, 2, 4, 8개일 때 263, 385, 510, 646ms이고, 맞춘 직선은 다음과 같습니다.
      </p>
      <MB note="a는 선택과 상관없이 드는 시간(보고, 손을 움직이는 데), b는 정보 1비트를 처리하는 데 드는 시간입니다.">{`\\text{반응 시간} \\approx ${exA} + ${exB}\\,\\log_2 N \\quad (\\text{ms})`}</MB>
      <p>
        선택지가 두 배가 될 때마다 같은 시간, 이 예시에서는 약 {exB}ms가 더해집니다. log₂N은 <a href={lessonHref('ai-basics', 'entropy')}>정보량과 엔트로피</a> 장에서 본 비트 수와 같습니다. 똑같이 그럴듯한 N개 중 하나를 고르는 것은 N을 반으로 나누는 예/아니요 질문에 log₂N번 답하는 것과 같고, 사람은 그 질문 하나에 거의 일정한 시간을 쓰는 셈입니다. 그림 2를 직접 해 봤다면 여러분의 a와 b도 나왔을 것입니다. 사람마다, 연습 정도에 따라 꽤 다르지만, 대부분 직선에 가깝게 나옵니다.
      </p>
      <Callout kind="note">
        이 법칙은 선택지가 똑같이 그럴듯하고, 무엇을 고를지 아는 상태에서 기호를 보고 반응을 골라야 할 때 잘 맞습니다. 메뉴에서 이미 위치를 외운 항목을 누를 때는 거의 고민하지 않으므로 맞지 않고, 처음 보는 긴 메뉴를 훑어볼 때는 하나씩 읽어 내려가야 하므로 로그보다 빠르게, 대개 개수에 비례해서 늘어납니다. 법칙이 맞는 조건을 함께 기억해 두어야 합니다.
      </Callout>
      <p>
        설계에 주는 교훈은 두 가지입니다. 첫째, 선택지를 한 화면에 몰아 두는 것이 여러 단계로 나누는 것보다 나을 수 있습니다. 64개 중 하나를 한 번에 고르는 것은 6비트이고, 8개짜리 메뉴를 두 번 거치는 것도 3 + 3 = 6비트로 정보량은 같지만, 두 번 고르면 a를 두 번 냅니다. 둘째, 선택지를 무작정 늘리면 결정이 느려집니다. 자주 쓰는 것을 앞에 두고, 드물게 쓰는 것은 "더 보기"로 숨기는 이유입니다.
      </p>

      <h2>한꺼번에 붙잡아 둘 수 있는 양</h2>
      <p>
        반응 시간만큼 인터페이스를 제약하는 것이 기억입니다. 화면을 보며 생각할 때 잠시 붙잡아 두는 기억을 <T en="working memory">작업 기억</T>이라고 합니다. 인증 문자의 숫자를 다른 앱으로 옮겨 적을 때, 앞 화면에서 본 주문 번호를 다음 화면에 입력할 때 쓰는 기억입니다. 그 크기를 직접 재 봅시다.
      </p>
      <DigitSpan />
      <p>
        1956년 밀러(George Miller)는 사람이 한 번에 붙잡아 둘 수 있는 항목이 대략 일곱 개 안팎(7 ± 2)이라고 썼습니다. 이후 연구에서는 되뇌거나 묶지 못하게 하면 네 개 안팎(4 ± 1)으로 더 작다는 결과가 많습니다. 숫자는 대략적인 값이지만 결론은 같습니다. 작업 기억은 아주 작습니다.
      </p>
      <p>
        그런데 01012345678보다 010-1234-5678이 훨씬 외우기 쉽습니다. 숫자 열한 개가 세 덩어리가 되기 때문입니다. 이렇게 여러 항목을 의미 있는 덩어리로 묶는 것을 <T en="chunking">청킹</T>이라고 합니다. 인터페이스에서는 카드 번호를 네 자리씩 띄워 보여 주고, 긴 설정 화면을 몇 묶음으로 나누고, 메뉴 항목을 구분선으로 무리 짓는 것이 모두 청킹입니다.
      </p>
      <Callout kind="intuition">
        더 좋은 방법은 사람이 기억할 필요를 없애는 것입니다. 앞 화면의 주문 번호를 다음 화면에 미리 채워 두고, 인증 문자를 자동으로 붙여 넣고, 고를 수 있는 값은 직접 쓰게 하지 말고 목록에서 고르게 합니다. 사람이 머리에 붙잡아 두고 처리해야 하는 양을 <T en="cognitive load">인지 부하</T>라고 하는데, 좋은 인터페이스는 이것을 화면과 컴퓨터 쪽으로 옮깁니다. "기억하게 하지 말고 알아보게 하라"는 설계 원칙은 <a href={lessonHref('cs-hci', 'design-principles')}>인터페이스 설계 원칙</a> 장에서 이어집니다.
      </Callout>
      <p>
        주의도 마찬가지로 한정되어 있습니다. 사람은 화면 전체를 고르게 보지 않고, 지금 하던 일과 관련 있는 곳을 봅니다. 그래서 화면 구석에 뜬 경고는 쉽게 놓치고, 움직이거나 깜빡이는 것은 하던 일을 방해할 만큼 눈을 끕니다. 정말 중요한 알림만 주의를 끌게 하고, 나머지는 조용히 두어야 사람들이 중요한 알림을 믿고 봅니다.
      </p>

      <Callout kind="key">
        사람을 재는 것은 여러 번 재서 평균과 흩어짐을 보는 일입니다. 단순 반응 시간은 대략 0.2초 남짓이고, 고를 것이 있으면 선택지 수의 로그에 비례해 늘어납니다(힉-하이먼 법칙, RT = a + b·log₂N). 작업 기억은 몇 개의 덩어리만 붙잡을 수 있으므로, 좋은 인터페이스는 정보를 묶어서 보여 주고, 사람이 기억해야 할 것을 화면과 컴퓨터가 대신 붙잡습니다.
      </Callout>
      <Quiz
        q="그림 3의 예시 데이터(RT ≈ 260 + 127·log₂N ms)를 따르는 사람이 선택지 16개 중 하나를 고르는 데 걸릴 시간에 가장 가까운 것은?"
        options={['약 520ms', '약 770ms', '약 2,300ms', '약 4,100ms']}
        answer={1}
        explain={<>log₂16 = 4비트이므로 260 + 127 × 4 = 768ms입니다. 선택지가 8개(646ms)에서 16개로 두 배가 되어도 시간은 b만큼, 약 127ms만 늘어납니다. 개수에 비례한다고 보면 2배 가까이 늘 것 같지만, 힉-하이먼 법칙은 로그에 비례합니다.</>}
      />
    </>
  );
}

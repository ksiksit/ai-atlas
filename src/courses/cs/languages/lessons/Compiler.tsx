import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { OP_NOTE, compileSource, countNodes, fastVm, runVm, showInstr, toJs, type Instr, type OptFlags } from './compile';
import { Interp } from './interp';
import { TOKEN_KIND, lineCol, parseProgram, tokenize } from './lang';
import { SpanCode, TreeView, astTree } from './TreeView';
import '../../programming/lessons/programming.css';
import './languages.css';

const PRESETS: { id: string; label: string; src: string }[] = [
  { id: 'const', label: '상수 계산', src: 'let price = 1200 * 3;\nlet rate = 10 / 100;\nlet total = price - price * rate;\nprint(total);' },
  { id: 'dead', label: '죽은 코드', src: 'let debug = false;\nlet x = 7;\nif (debug) {\n  print("디버그: " + x);\n}\nprint(x * 2);' },
  { id: 'cond', label: '조건식', src: 'let score = 85;\nlet grade = score >= 90 ? "A" : score >= 80 ? "B" : "C";\nprint(grade);' },
  { id: 'loop', label: '반복문', src: 'let sum = 0;\nlet i = 1;\nwhile (i <= 4) {\n  sum = sum + i * i;\n  i = i + 1;\n}\nprint(sum);' },
];

/* ─────────────── Figure 1: the pipeline ─────────────── */

function CodeList({ code, pc, plain, label }: { code: Instr[]; pc?: number; plain?: boolean; label: string }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || pc === undefined) return;
    const li = el.children[pc] as HTMLElement | undefined;
    if (!li) return;
    // keep the current instruction visible inside the list without scrolling the page
    if (li.offsetTop < el.scrollTop) el.scrollTop = li.offsetTop - 4;
    else if (li.offsetTop + li.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = li.offsetTop + li.offsetHeight - el.clientHeight + 4;
  }, [pc]);
  return (
    <ol className="cp-code" ref={box} start={0} aria-label={label} data-plain={plain || undefined}>
      {code.map((ins, i) => (
        <li key={i} data-cur={pc === i || undefined} data-jump={ins.op === 'JMP' || ins.op === 'JZ' || ins.op === 'JNZ' || undefined} data-halt={ins.op === 'HALT' || undefined}>
          <span className="cp-addr">{i}</span>
          <span className="cp-op">{showInstr(ins)}</span>
        </li>
      ))}
    </ol>
  );
}

function PipelineFigure({ src, setSrc, flags, setFlags }: { src: string; setSrc: (s: string) => void; flags: OptFlags; setFlags: (f: OptFlags) => void }) {
  const [draft, setDraft] = useState(src);
  const [view, setView] = useState<'opt' | 'plain'>('opt');
  useEffect(() => setDraft(src), [src]);
  const edId = useId();
  const res = useMemo(() => compileSource(src, flags), [src, flags]);
  const toks = useMemo(() => {
    try {
      return tokenize(src).slice(0, -1);
    } catch {
      return [];
    }
  }, [src]);
  const preset = PRESETS.find((p) => p.src === src)?.id ?? 'custom';
  const any = flags.fold || flags.prop || flags.dce;

  return (
    <Figure
      no={1}
      title="소스에서 명령어까지"
      hint="최적화를 하나씩 켜 보세요"
      caption={<>컴파일러는 소스를 토큰으로 자르고, 구문 트리로 엮고, 트리를 고쳐 다듬은(최적화) 뒤, 트리를 돌며 스택 기계의 명령어를 내놓습니다. 최적화를 켜면 오른쪽 트리와 명령어 목록이 그 자리에서 다시 만들어집니다. 코드를 고쳐서 다시 컴파일할 수도 있습니다. 이 컴파일러는 함수를 다루지 않습니다.</>}
    >
      <Seg label="프로그램" value={preset} onChange={(id) => id !== 'custom' && setSrc(PRESETS.find((p) => p.id === id)!.src)} options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: '직접 쓴 코드' }] : [])]} />
      <div className="fig-split">
        <div className="pl-col">
          <span className="pl-label">① 소스 코드</span>
          <label className="visually-hidden" htmlFor={edId}>
            컴파일할 코드
          </label>
          <textarea id={edId} className="pl-editor" rows={Math.min(12, Math.max(4, draft.split('\n').length + 1))} value={draft} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={(e) => setDraft(e.target.value)} />
          {draft !== src && (
            <div className="btn-row">
              <Button small primary onClick={() => setSrc(draft)}>
                다시 컴파일
              </Button>
            </div>
          )}
        </div>
        <div className="controls">
          <span className="ctl-label">최적화</span>
          <Check label="상수 접기 (2 * 3 → 6)" checked={flags.fold} onChange={(v) => setFlags({ ...flags, fold: v })} />
          <Check label="상수 전파 (x가 늘 6이면 x → 6)" checked={flags.prop} onChange={(v) => setFlags({ ...flags, prop: v })} />
          <Check label="죽은 코드 제거" checked={flags.dce} onChange={(v) => setFlags({ ...flags, dce: v })} />
          {res.ok && (
            <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Readout label="트리의 노드" value={`${countNodes(res.c.prog)} → ${countNodes(res.c.opt)}`} />
              <Readout label="명령어" value={`${res.c.plain.length} → ${res.c.code.length}`} color={res.c.code.length < res.c.plain.length ? 'var(--good)' : undefined} />
            </div>
          )}
        </div>
      </div>
      {!res.ok ? (
        <div className="pl-err" role="alert">
          {lineCol(src, res.pos).line}번 줄: {res.msg}
        </div>
      ) : (
        <>
          <div className="pl-col">
            <span className="pl-label">② 토큰 {toks.length}개</span>
            <div className="pl-chips cp-toks" aria-label="토큰">
              {toks.slice(0, 48).map((t, i) => (
                <span key={i} className="pl-chip" data-t={t.type}>
                  {t.text}
                  <small>{TOKEN_KIND[t.type]}</small>
                </span>
              ))}
              {toks.length > 48 && <span className="pl-label">… {toks.length - 48}개 더</span>}
            </div>
          </div>
          <div className="cp-two">
            <div className="pl-col">
              <span className="pl-label">③ 구문 트리 {any ? '(최적화 후)' : ''}</span>
              <TreeView root={astTree(res.c.opt)} label={`구문 트리, 노드 ${countNodes(res.c.opt)}개`} shrink={0.6} />
              {any && res.c.report.notes.length > 0 && (
                <ul className="cp-notes" aria-label="최적화가 한 일">
                  {res.c.report.notes.slice(0, 8).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                  {res.c.report.propagated > 0 && <li>변수 읽기 {res.c.report.propagated}곳을 그 값으로 바꿈 (상수 전파)</li>}
                </ul>
              )}
            </div>
            <div className="pl-col">
              <span className="pl-label">④ 스택 기계 명령어</span>
              {any && <Seg value={view} onChange={setView} options={[{ value: 'opt', label: `최적화 후 ${res.c.code.length}개` }, { value: 'plain', label: `최적화 전 ${res.c.plain.length}개` }]} />}
              <CodeList code={view === 'plain' && any ? res.c.plain : res.c.code} plain={view === 'plain' && any} label="명령어 목록" />
            </div>
          </div>
        </>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: running the bytecode ─────────────── */

function VmFigure({ src, flags }: { src: string; flags: OptFlags }) {
  const res = useMemo(() => compileSource(src, flags), [src, flags]);
  const code = useMemo(() => (res.ok ? res.c.code : []), [res]);
  const run = useMemo(() => runVm(code, 500), [code]);
  const plainRun = useMemo(() => (res.ok ? runVm(res.c.plain, 1) : null), [res]);
  const s = useStepper(run.snaps.length, 3, run);
  const snap = run.snaps[s.i];
  const ins = s.i > 0 ? code[snap.pc] : null;
  const nextPc = s.i + 1 < run.snaps.length ? run.snaps[s.i + 1].pc : undefined;

  if (!res.ok) return <Figure no={2} title="스택 기계로 실행하기">{<div className="pl-err">그림 1의 코드를 컴파일할 수 없습니다: {res.msg}</div>}</Figure>;
  return (
    <Figure
      no={2}
      title="스택 기계로 실행하기"
      hint="한 명령어씩 넘기며 스택을 보세요"
      caption={<>그림 1에서 만든 명령어를 그대로 실행합니다. 스택 기계에는 레지스터가 없고, 모든 계산을 스택 맨 위에서 합니다. PUSH와 LOAD는 값을 올리고, ADD 같은 연산은 맨 위 두 값을 꺼내 결과 하나를 올립니다. JZ는 맨 위 값이 거짓이면 다른 번지로 건너뛰어 if와 while을 만듭니다. 그림 1에서 최적화를 바꾸면 이 그림도 바뀝니다.</>}
    >
      <div className="cp-vm">
        <div className="pl-col">
          <span className="pl-label">명령어 (노란 줄: 방금 실행)</span>
          <CodeList code={code} pc={s.i > 0 ? snap.pc : undefined} label="실행 중인 명령어 목록" />
        </div>
        <div className="pl-col">
          <span className="pl-label">스택 (위가 맨 위)</span>
          <div className="cp-stack" aria-label={`스택: ${snap.stack.length ? snap.stack.map(String).join(', ') : '비어 있음'}`}>
            {snap.stack.length === 0 && <div className="pl-label">(비어 있음)</div>}
            {[...snap.stack].reverse().map((v, i) => (
              <div key={snap.stack.length - i} className="cp-cell" data-top={i === 0 || undefined}>
                {typeof v === 'string' ? `"${v}"` : String(v)}
              </div>
            ))}
          </div>
        </div>
        <div className="pl-col">
          <span className="pl-label">변수</span>
          <div className="cp-vars">
            {snap.vars.length === 0 && <div className="pl-label">(없음)</div>}
            {snap.vars.map(([k, v]) => (
              <div key={k} className="ip-var" data-changed={snap.changed === k || undefined}>
                <span className="mono">{k}</span>
                <span className="mono ip-val">{typeof v === 'string' ? `"${v}"` : String(v)}</span>
              </div>
            ))}
          </div>
          <div className="tr-out" aria-label="출력">
            <div className="tr-out-head">출력</div>
            {snap.out.length === 0 ? <div className="tr-out-empty">없음</div> : snap.out.map((o, i) => <div key={i} className="tr-out-line">{o}</div>)}
          </div>
        </div>
      </div>
      <div className="pl-note" aria-live="polite">
        {ins ? (
          <>
            <strong className="mono">{showInstr(ins)}</strong> ({OP_NOTE[ins.op]}): {snap.note}
            {nextPc !== undefined && nextPc !== snap.pc + 1 && ins.op !== 'HALT' && <> 다음은 {nextPc}번지.</>}
          </>
        ) : (
          snap.note
        )}
      </div>
      <SpanCode src={src} span={ins ? ins.span : null} label="이 명령어를 만든 소스 코드" />
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 280px' }}>
          <StepControls s={s} id="cp-vm-speed" maxSpeed={20} />
        </div>
        <div className="readouts" style={{ flex: '1 1 260px', gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="실행한 명령어" value={`${run.executed}개`} />
          <Readout label="최적화 없이" value={plainRun ? `${plainRun.executed}개` : '—'} />
        </div>
      </div>
      {run.error && <div className="pl-err">{run.error}</div>}
    </Figure>
  );
}

/* ─────────────── Figure 3: interpreter, compiler, JIT (model) ─────────────── */

// nanoseconds per loop iteration and one-off costs, illustrative values
const MODEL = {
  tree: { per: 60, start: 0 },
  byte: { per: 15, start: 50_000 },
  aot: { per: 1, start: 30_000_000 },
  jitCompile: 2_000_000,
  jitPer: 1.2,
};
const STRATS = [
  { id: 'tree', label: '트리 인터프리터', color: 'var(--ink-3)' },
  { id: 'byte', label: '바이트코드 인터프리터', color: 'var(--neg)' },
  { id: 'aot', label: '미리 컴파일', color: 'var(--c-stats-2)' },
  { id: 'jit', label: 'JIT', color: 'var(--pos)' },
] as const;
type StratId = (typeof STRATS)[number]['id'];

function costOf(id: StratId, n: number, hot: number): number {
  if (id === 'tree') return MODEL.tree.start + n * MODEL.tree.per;
  if (id === 'byte') return MODEL.byte.start + n * MODEL.byte.per;
  if (id === 'aot') return MODEL.aot.start + n * MODEL.aot.per;
  if (n <= hot) return MODEL.byte.start + n * MODEL.byte.per;
  return MODEL.byte.start + hot * MODEL.byte.per + MODEL.jitCompile + (n - hot) * MODEL.jitPer;
}

function fmtNs(ns: number): string {
  if (ns < 1e3) return `${Math.round(ns)}ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(ns < 1e4 ? 1 : 0)}µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(ns < 1e7 ? 1 : 0)}ms`;
  return `${(ns / 1e9).toFixed(1)}초`;
}

function JitFigure() {
  const P = usePalette();
  const [logN, setLogN] = useState(5);
  const [logHot, setLogHot] = useState(3);
  const n = Math.round(10 ** logN);
  const hot = Math.round(10 ** logHot);
  const times = STRATS.map((st) => ({ ...st, t: costOf(st.id, n, hot) }));
  const best = times.reduce((a, b) => (b.t < a.t ? b : a));
  const colorOf = (id: StratId) => (id === 'tree' ? P.ink3 : id === 'byte' ? P.neg : id === 'aot' ? P.stats2 : P.pos);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 54, r: 14, t: 14, b: 34 };
      const x0 = 0;
      const x1 = 8;
      const y0 = 3; // 1µs
      const y1 = 10.5;
      const X = (lx: number) => pad.l + ((lx - x0) / (x1 - x0)) * (w - pad.l - pad.r);
      const Y = (ly: number) => pad.t + (1 - (ly - y0) / (y1 - y0)) * (h - pad.t - pad.b);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      for (let e = x0; e <= x1; e++) {
        ctx.beginPath();
        ctx.moveTo(X(e), Y(y0));
        ctx.lineTo(X(e), Y(y1));
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (e % 2 === 0 || w > 520) ctx.fillText(e === 0 ? '1' : `10${'⁰¹²³⁴⁵⁶⁷⁸'[e]}`, X(e), Y(y0) + 5);
      }
      const yl: [number, string][] = [
        [3, '1µs'],
        [6, '1ms'],
        [9, '1초'],
      ];
      for (const [e, s] of yl) {
        ctx.beginPath();
        ctx.moveTo(X(x0), Y(e));
        ctx.lineTo(X(x1), Y(e));
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(s, X(x0) - 6, Y(e));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.fillText('반복 횟수 (로그 눈금)', (X(x0) + X(x1)) / 2, h - 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
      ctx.clip();
      for (const st of STRATS) {
        ctx.strokeStyle = colorOf(st.id);
        ctx.lineWidth = st.id === best.id ? 3 : 2;
        ctx.beginPath();
        for (let k = 0; k <= 240; k++) {
          const lx = x0 + ((x1 - x0) * k) / 240;
          const t = Math.max(1, costOf(st.id, 10 ** lx, hot));
          const py = Y(Math.log10(t));
          if (k) ctx.lineTo(X(lx), py);
          else ctx.moveTo(X(lx), py);
        }
        ctx.stroke();
      }
      ctx.restore();
      // JIT threshold and the chosen n
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha(P.pos, 0.8);
      ctx.beginPath();
      ctx.moveTo(X(logHot), Y(y0));
      ctx.lineTo(X(logHot), Y(y1));
      ctx.stroke();
      ctx.strokeStyle = alpha(P.ink, 0.5);
      ctx.beginPath();
      ctx.moveTo(X(logN), Y(y0));
      ctx.lineTo(X(logN), Y(y1));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const st of times) {
        ctx.fillStyle = colorOf(st.id);
        ctx.beginPath();
        ctx.arc(X(logN), Y(Math.log10(Math.max(1, st.t))), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = P.pos;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('JIT 컴파일 시작', X(logHot) + 4, Y(y1) + 2);
    },
    [P, logN, logHot, best.id],
    { aspect: 1.7, maxHeight: 380, minHeight: 260 },
  );

  return (
    <Figure
      no={3}
      title="언제 컴파일할 가치가 있나"
      hint="반복 횟수와 JIT 기준을 바꿔 보세요"
      caption={<>반복문 하나를 n번 도는 프로그램의 전체 실행 시간을 네 방식으로 비교한 모형입니다(가로·세로 모두 로그 눈금). 트리 인터프리터는 준비 없이 바로 시작하지만 한 바퀴가 가장 느리고, 미리 컴파일은 시작 전에 큰 비용을 내지만 한 바퀴가 가장 빠릅니다. JIT는 바이트코드로 시작했다가 반복이 기준을 넘으면 그 부분만 기계어로 컴파일합니다. 숫자는 자릿수를 보여 주려고 고른 예시입니다(한 바퀴: 트리 {MODEL.tree.per}ns, 바이트코드 {MODEL.byte.per}ns, 기계어 {MODEL.aot.per}ns · 컴파일: 전체 {fmtNs(MODEL.aot.start)}, JIT {fmtNs(MODEL.jitCompile)}).</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`반복 ${n.toLocaleString('ko-KR')}번일 때 가장 빠른 방식은 ${best.label}, ${fmtNs(best.t)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="cp-n" label="반복 횟수 n" value={logN} min={0} max={8} step={0.25} onChange={setLogN} format={() => n.toLocaleString('ko-KR')} />
          <Slider id="cp-hot" label="JIT 기준 (이만큼 돌면 컴파일)" value={logHot} min={1} max={6} step={0.25} onChange={setLogHot} format={() => hot.toLocaleString('ko-KR')} color="var(--pos)" />
          <div className="cp-rows">
            {times.map((st) => (
              <div key={st.id} className="cp-row" data-best={st.id === best.id || undefined}>
                <i style={{ background: st.color }} />
                <span>{st.label}</span>
                <span className="mono">{fmtNs(st.t)}</span>
              </div>
            ))}
          </div>
          <Legend items={[{ color: 'var(--ink-2)', label: '굵은 선 = 지금 가장 빠른 방식', shape: 'ln' }]} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: measure it in this browser ─────────────── */

const benchSrc = (n: number) => `let s = 0;\nlet i = 0;\nwhile (i < ${n}) {\n  s = s + i % 7;\n  i = i + 1;\n}\nprint(s);`;

interface Bench {
  tree: number;
  vm: number;
  js: number;
  out: string[];
}

function measure(n: number): Bench {
  const src = benchSrc(n);
  const prog = parseProgram(src);
  const best = (f: () => void, reps: number) => {
    let b = Infinity;
    for (let k = 0; k < reps; k++) {
      const t0 = performance.now();
      f();
      b = Math.min(b, performance.now() - t0);
    }
    return b;
  };
  let out: string[] = [];
  const tree = best(() => {
    const it = new Interp({ fuel: 1e12 });
    it.run(prog);
    out = it.out;
  }, 2);
  const code = compileSource(src, { fold: true, prop: true, dce: true });
  const instrs = code.ok ? code.c.code : [];
  const vm = best(() => fastVm(instrs), 3);
  // translate to JavaScript and let the browser's engine (with its JIT) run it
  const fn = new Function('out', toJs(prog)) as (o: string[]) => void;
  const js = best(() => fn([]), 3);
  return { tree, vm, js, out };
}

function BenchFigure() {
  const [n, setN] = useState(200000);
  const [res, setRes] = useState<Bench | null>(null);
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    setRes(null);
    // let the "measuring" state paint before the page is busy for a moment
    setTimeout(() => {
      try {
        setRes(measure(n));
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const jsSrc = useMemo(() => toJs(parseProgram(benchSrc(n))), [n]);
  const maxT = res ? Math.max(res.tree, res.vm, res.js) : 1;
  const rows = res
    ? [
        { label: '트리 인터프리터 (인터프리터 장)', t: res.tree, color: 'var(--ink-3)' },
        { label: '스택 기계 (이 장의 바이트코드)', t: res.vm, color: 'var(--neg)' },
        { label: 'JavaScript로 옮겨 브라우저가 실행', t: res.js, color: 'var(--pos)' },
      ]
    : [];

  return (
    <Figure
      no={4}
      title="이 브라우저에서 직접 재 보기"
      hint="반복 횟수를 고르고 재기를 누르세요"
      caption={<>같은 프로그램을 세 가지로 실행해 실제 걸린 시간을 잽니다. 첫째는 앞 장에서 만든 트리 인터프리터, 둘째는 이 장의 컴파일러가 만든 명령어를 도는 스택 기계, 셋째는 구문 트리를 JavaScript 코드로 옮긴 뒤 브라우저의 엔진에 맡긴 것입니다. 셋째는 브라우저의 JIT 컴파일러가 기계어로 바꿔 실행합니다. 시간은 기기와 브라우저, 그때의 상태에 따라 달라지고, 각각 몇 번 재서 가장 빠른 값을 씁니다.</>}
    >
      <div className="fig-split">
        <div className="pl-col">
          <span className="pl-label">잴 프로그램 (꼬마 언어)</span>
          <Code label="잴 프로그램 (꼬마 언어)">{benchSrc(n)}</Code>
          <span className="pl-label">구문 트리에서 JavaScript로 옮긴 코드</span>
          <Code label="JavaScript로 옮긴 코드">{jsSrc}</Code>
        </div>
        <div className="controls">
          <Seg label="반복 횟수" value={n} onChange={(v) => (setN(v), setRes(null))} options={[50000, 200000, 1000000].map((v) => ({ value: v, label: v >= 1e6 ? `${v / 1e6}백만` : `${v / 1e4}만` }))} />
          <Button primary small onClick={go} disabled={busy}>
            {busy ? '재는 중…' : '재기'}
          </Button>
          <div className="cp-bench" aria-live="polite">
            {!res && !busy && <div className="pl-label">아직 재지 않았습니다. 반복 100만 번은 몇 초 걸릴 수 있습니다.</div>}
            {rows.map((r) => (
              <div key={r.label} className="cp-bar">
                <span className="cp-bar-label">{r.label}</span>
                <span className="cp-bar-track">
                  <span style={{ width: `${Math.max(0.6, (r.t / maxT) * 100)}%`, background: r.color }} />
                </span>
                <span className="mono">{r.t < 1 ? `${r.t.toFixed(2)}ms` : `${r.t.toFixed(r.t < 10 ? 1 : 0)}ms`}</span>
              </div>
            ))}
            {res && (
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="트리 ÷ 스택 기계" value={`${(res.tree / res.vm).toFixed(1)}배`} />
                <Readout label="트리 ÷ JavaScript" value={`${Math.round(res.tree / Math.max(res.js, 0.001)).toLocaleString('ko-KR')}배`} />
              </div>
            )}
            {res && <div className="pl-label">출력: {res.out.join(' ')} (세 방식 모두 같은 값)</div>}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Compiler() {
  const [src, setSrc] = useState(PRESETS[0].src);
  const [flags, setFlags] = useState<OptFlags>({ fold: false, prop: false, dce: false });
  return (
    <>
      <h2>통역사와 번역가</h2>
      <p>
        앞 장의 인터프리터는 통역사와 같습니다. 코드를 읽는 그 자리에서 뜻대로 실행합니다. <T en="compiler">컴파일러</T>는 번역가입니다. 프로그램 전체를 미리 다른 언어로 옮겨 두고, 실행은 옮긴 결과로 합니다. C 컴파일러는 C를 CPU의 기계어로, Java 컴파일러는 Java를 JVM이 실행하는 바이트코드로, TypeScript 컴파일러는 TypeScript를 JavaScript로 옮깁니다. 옮기는 데 시간이 들지만, 한 번 옮긴 결과는 여러 번 빠르게 실행할 수 있습니다.
      </p>

      <h2>컴파일 단계 한눈에 보기</h2>
      <p>컴파일러는 보통 여러 단계를 차례로 거칩니다.</p>
      <ol>
        <li>
          <strong>앞단</strong>(<T en="front end">프런트엔드</T>): 렉싱과 파싱으로 구문 트리를 만들고, 이름이 정의되어 있는지, 타입이 맞는지 검사합니다. <a href={lessonHref('cs-programming-languages', 'interpreter')}>인터프리터 장</a>과 <a href={lessonHref('cs-programming-languages', 'type-systems')}>타입 장</a>에서 한 일입니다.
        </li>
        <li>
          <strong>가운데</strong>(<T en="optimizer">최적화기</T>): 프로그램의 뜻은 그대로 두고 더 빠르고 작게 고칩니다.
        </li>
        <li>
          <strong>뒷단</strong>(<T en="back end">백엔드</T>, 코드 생성): 목표 기계의 명령어를 만들어 냅니다.
        </li>
      </ol>
      <p>
        여러 언어가 가운데와 뒷단을 함께 쓰기도 합니다. LLVM은 C, C++, Rust, Swift의 앞단이 만든 공통 중간 표현을 받아 최적화하고 x86, ARM 같은 여러 CPU의 기계어로 옮깁니다. 이 장의 컴파일러는 같은 꼬마 언어를 받아 스택 기계의 명령어로 옮깁니다.
      </p>
      <PipelineFigure src={src} setSrc={setSrc} flags={flags} setFlags={setFlags} />

      <h2>식을 명령어로 옮기기</h2>
      <p>
        이 장의 목표 기계는 <T en="stack machine">스택 기계</T>입니다. 명령어가 피연산자를 레지스터 이름으로 적지 않고, 모두 스택 맨 위에서 꺼내고 올립니다. Java의 JVM, .NET, WebAssembly, Python(CPython)의 바이트코드가 모두 스택 기계입니다. 코드 생성이 아주 단순해지기 때문입니다. 식 트리를 <strong>자식 먼저, 부모 나중</strong>(후위 순회)으로 돌며 명령어를 내놓기만 하면 됩니다. <code>a + b * c</code>는 a, b, c를 차례로 올리고 MUL, ADD를 하면 끝입니다.
      </p>
      <Code label="코드 생성기의 핵심">{`
function gen(node, out) {
  switch (node.kind) {
    case 'num': out.push(['PUSH', node.value]); break;
    case 'var': out.push(['LOAD', node.name]);  break;
    case 'bin':
      gen(node.left, out);                 // 왼쪽 값이 스택에 올라가고
      gen(node.right, out);                // 오른쪽 값이 그 위에 올라간다
      out.push([OPS[node.op]]);            // 두 값을 꺼내 계산, 결과를 올린다
      break;
    case 'while': {
      const top = out.length;              // 조건을 다시 볼 번지
      gen(node.test, out);
      const jz = out.push(['JZ', null]) - 1;  // 거짓이면 반복 밖으로
      gen(node.body, out);
      out.push(['JMP', top]);              // 조건으로 돌아간다
      out[jz][1] = out.length;             // 나갈 번지를 나중에 채운다
      break;
    }
  }
}`}</Code>
      <p>
        <code>if</code>와 <code>while</code>은 명령어 목록에 구조가 없으므로 <T en="jump">점프</T>로 만듭니다. 조건을 계산해 스택에 올리고, 거짓이면(JZ) 블록을 건너뛰는 번지로 갑니다. 건너뛸 번지는 블록을 다 만든 뒤에야 알 수 있어서, 일단 빈칸으로 두었다가 나중에 채웁니다. 실제 CPU의 명령어도 이렇게 조건 분기와 점프로 반복과 조건을 만듭니다(<a href={lessonHref('cs-architecture', 'cpu')}>CPU 장</a>).
      </p>
      <VmFigure src={src} flags={flags} />
      <p>
        "반복문"을 골라 끝까지 넘겨 보세요. 18번지의 <code>JMP 4</code>가 조건을 계산하는 4번지로 되돌아가고, 조건이 거짓이 되는 순간 <code>JZ</code>가 반복 밖으로 건너뜁니다. 스택은 문장 하나가 끝날 때마다 다시 비어 있습니다. 식의 중간값만 잠시 스택에 머물기 때문입니다.
      </p>
      <Callout kind="note">
        실제 CPU는 대부분 스택이 아니라 이름 붙은 <T en="register">레지스터</T> 몇십 개로 계산하는 레지스터 기계입니다. 그래서 기계어를 만드는 컴파일러는 어떤 값을 어느 레지스터에 둘지 정하는 <T en="register allocation">레지스터 할당</T>을 합니다. 변수가 레지스터보다 많으면 일부를 메모리로 내보내야 해서, 이 단계가 성능에 큰 영향을 줍니다.
      </Callout>

      <h2>최적화: 뜻은 그대로, 일은 적게</h2>
      <p>그림 1의 세 가지 최적화는 모두 실행하기 전에 알 수 있는 사실을 미리 계산해 둡니다.</p>
      <ul>
        <li>
          <T en="constant folding">상수 접기</T>: <code>1200 * 3</code>처럼 값이 이미 정해진 식은 컴파일할 때 계산해 3600으로 바꿉니다. 실행할 때마다 곱할 필요가 없습니다.
        </li>
        <li>
          <T en="constant propagation">상수 전파</T>: 한 번 정한 뒤 바뀌지 않는 변수는 쓰이는 곳마다 그 값으로 바꿉니다. 그러면 새로 접을 수 있는 식이 생깁니다.
        </li>
        <li>
          <T en="dead code elimination">죽은 코드 제거</T>: 결코 실행되지 않는 블록(<code>if (false)</code>)과 아무도 읽지 않는 변수를 지웁니다.
        </li>
      </ul>
      <p>
        "상수 계산"에서 셋을 차례로 켜 보세요. 상수 접기만 켜면 <code>1200 * 3</code>과 <code>10 / 100</code>이 접힙니다. 상수 전파를 켜면 price와 rate가 값으로 바뀌어 total까지 3240으로 접히고, 죽은 코드 제거까지 켜면 아무도 읽지 않게 된 let 세 개가 사라져 명령어가 <code>PUSH 3240</code>, <code>PRINT</code>, <code>HALT</code> 셋만 남습니다. 최적화 하나가 다른 최적화의 기회를 만드는 것입니다. 반면 "반복문"은 sum과 i가 계속 바뀌므로 컴파일할 때는 거의 아무것도 할 수 없습니다.
      </p>
      <Callout kind="warn">
        최적화는 프로그램의 뜻을 절대 바꾸면 안 됩니다. <code>x + 0</code>을 <code>x</code>로 바꾸는 것은 당연해 보이지만, 이 언어(와 JavaScript)에서 x가 문자열 "5"라면 <code>x + 0</code>은 "50"이므로 틀린 최적화입니다. 그래서 이 장의 컴파일러는 그런 변환을 하지 않습니다. 컴파일러가 타입을 알면 더 과감하게 최적화할 수 있고, 이것이 정적 타입 언어가 대체로 빠른 이유 중 하나입니다.
      </Callout>

      <h2>인터프리터, 컴파일러, 그리고 JIT</h2>
      <p>
        무엇이 더 빠를까요? 답은 "얼마나 오래 돌리느냐"에 달려 있습니다. 미리 컴파일하는 비용은 실행이 길 때만 본전을 뽑습니다. 그래서 브라우저의 JavaScript 엔진은 둘을 섞습니다. 처음에는 바이트코드 인터프리터로 바로 실행하면서 함수와 반복문이 몇 번 불리는지 셉니다. 자주 도는 <T en="hot path">뜨거운</T> 부분만 골라 실행 중에 기계어로 컴파일합니다. 이것이 <T en="just-in-time compiler">JIT 컴파일러</T>입니다.
      </p>
      <JitFigure />
      <p>
        반복이 수십 번이면 트리 인터프리터도 충분히 빠르고, 30ms의 컴파일 비용을 먼저 내는 쪽이 가장 느립니다. 반복이 늘어날수록 선의 기울기, 즉 한 바퀴의 비용이 승부를 가릅니다. 이 숫자로는 수만 번을 넘으면 JIT가 가장 빠르고, 미리 컴파일한 쪽은 약 2백만 번은 돌아야 30ms의 준비 비용을 갚고 바이트코드 인터프리터를 앞섭니다. JIT는 짧은 실행에서는 인터프리터처럼, 긴 실행에서는 컴파일러처럼 동작해 양쪽의 좋은 점을 대부분 가져옵니다.
      </p>
      <p>
        JIT에는 미리 컴파일하는 쪽이 갖지 못한 무기도 있습니다. 실행 중에 실제로 들어오는 값을 볼 수 있다는 점입니다. V8은 바이트코드 인터프리터(Ignition)로 실행하며 "이 덧셈에는 늘 정수만 들어왔다" 같은 정보를 모으고, 최적화 컴파일러(TurboFan 등)가 그 가정을 믿고 정수 덧셈 기계어 한 줄로 만듭니다. 나중에 문자열이 들어와 가정이 깨지면 기계어를 버리고 바이트코드로 돌아갑니다(<T en="deoptimization">역최적화</T>). 타입이 없는 JavaScript가 빠른 이유가 여기에 있습니다.
      </p>
      <BenchFigure />
      <p>
        직접 재 보면 이 과목에서 만든 두 실행기와 브라우저 엔진의 차이가 자릿수로 드러납니다. 트리 인터프리터는 노드마다 switch로 갈 곳을 고르고 환경의 Map에서 이름을 찾습니다. 스택 기계는 트리를 미리 평평한 명령어 배열로 펴 두고, 변수 이름도 실행 전에 번호로 바꿔 배열에서 바로 꺼내므로 훨씬 빠릅니다. 그래도 명령어마다 switch로 갈 곳을 고르고 스택에 값을 넣었다 뺍니다. 브라우저는 같은 반복문을 레지스터 몇 개와 기계어 몇 줄로 바꿉니다. 이 차이를 메우는 것이 수십 년간 언어 구현자들이 쌓아 온 기술입니다.
      </p>

      <Callout kind="key">
        컴파일러는 앞단(렉싱, 파싱, 검사), 가운데(최적화), 뒷단(코드 생성)을 거쳐 프로그램을 다른 언어로 옮깁니다. 스택 기계의 코드는 식 트리를 후위 순회하며 만들고, 조건과 반복은 점프로 만듭니다. 상수 접기, 상수 전파, 죽은 코드 제거는 뜻을 바꾸지 않고 실행 전에 할 수 있는 일을 미리 합니다. JIT는 인터프리터로 시작해 자주 도는 부분만 실행 중에 컴파일해, 빠른 시작과 빠른 실행을 함께 얻습니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>(2 + x) * 3</code>을 이 장의 스택 기계 명령어로 옮긴 것은? (x는 변수)
          </>
        }
        options={[<code key="a">PUSH 2, LOAD x, ADD, PUSH 3, MUL</code>, <code key="b">PUSH 2, PUSH 3, LOAD x, ADD, MUL</code>, <code key="c">MUL, ADD, PUSH 2, LOAD x, PUSH 3</code>, <code key="d">PUSH 6, LOAD x, ADD</code>]}
        answer={0}
        explain={
          <>
            트리의 뿌리는 <code>*</code>이고 왼쪽 자식이 <code>2 + x</code>, 오른쪽 자식이 3입니다. 후위 순회로 왼쪽 자식을 먼저 옮기면 PUSH 2, LOAD x, ADD가 되고, 그다음 오른쪽 PUSH 3, 마지막에 MUL입니다. ④는 2 * 3을 먼저 접은 것처럼 보이지만 괄호를 무시한 틀린 최적화입니다.
          </>
        }
      />
    </>
  );
}

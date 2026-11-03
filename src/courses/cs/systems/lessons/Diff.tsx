import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../shared';
import { DIFF_PRESETS, editedFiles, lcsDiff, lcsLength, myers, pathOps, splitLines, unifiedHunks, type MyersStep, type Pt } from './systems';
import '../../algorithms/lessons/algorithms.css';
import './systems.css';

/* ─────────────── Figure 1: a line diff of two editable files ─────────────── */

const MAX_LINES = 40;

function LineDiffFigure() {
  const [a, setA] = useState(DIFF_PRESETS[0].a);
  const [b, setB] = useState(DIFF_PRESETS[0].b);
  const [ctxLines, setCtxLines] = useState(3);
  const preset = DIFF_PRESETS.find((p) => p.a === a && p.b === b);
  const file = preset?.file ?? 'file.txt';

  const r = useMemo(() => {
    const A = splitLines(a, MAX_LINES);
    const B = splitLines(b, MAX_LINES);
    const ops = lcsDiff(A, B);
    return { A, B, ops, hunks: unifiedHunks(A, B, ops, ctxLines) };
  }, [a, b, ctxLines]);
  const ins = r.ops.filter((o) => o.t === 'ins').length;
  const del = r.ops.filter((o) => o.t === 'del').length;
  const lcs = r.ops.length - ins - del;
  const sign = { eq: ' ', del: '-', ins: '+' } as const;

  return (
    <Figure
      no={1}
      title="줄 단위 diff"
      hint="두 파일을 직접 고쳐 보세요"
      caption={<>두 파일을 줄 목록으로 보고 가장 긴 공통 부분 수열을 구한 뒤, 거기 들지 않은 원래 파일의 줄은 <code>-</code>(지움), 새 파일의 줄은 <code>+</code>(넣음)로 표시했습니다. 앞의 두 숫자 열은 원래 파일과 새 파일에서의 줄 번호입니다. 바뀐 곳 주변의 바뀌지 않은 줄을 "문맥"으로 몇 줄 보여 줄지 고를 수 있고, 떨어진 변경은 <code>@@</code> 머리줄이 붙은 덩어리(hunk)로 나뉩니다. 파일마다 {MAX_LINES}줄까지 비교합니다.</>}
    >
      <div className="controls row">
        <Seg
          label="예시"
          value={preset?.value ?? 'custom'}
          onChange={(v) => {
            const p = DIFF_PRESETS.find((x) => x.value === v);
            if (p) {
              setA(p.a);
              setB(p.b);
            }
          }}
          options={DIFF_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <Seg
          label="앞뒤 문맥"
          value={ctxLines}
          onChange={setCtxLines}
          options={[
            { value: 0, label: '0줄' },
            { value: 1, label: '1줄' },
            { value: 3, label: '3줄' },
          ]}
        />
      </div>
      <div className="df-inputs">
        <div className="ctl">
          <label className="ctl-label" htmlFor="df-a">
            <span>원래 파일 (A)</span>
            <span className="val">{r.A.length}줄</span>
          </label>
          <textarea id="df-a" className="text-input" rows={10} value={a} spellCheck={false} autoComplete="off" onChange={(e) => setA(e.target.value)} />
        </div>
        <div className="ctl">
          <label className="ctl-label" htmlFor="df-b">
            <span>새 파일 (B)</span>
            <span className="val">{r.B.length}줄</span>
          </label>
          <textarea id="df-b" className="text-input" rows={10} value={b} spellCheck={false} autoComplete="off" onChange={(e) => setB(e.target.value)} />
        </div>
      </div>
      <div className="df-summary" aria-live="polite">
        <span>
          <span className="add">+{ins}</span> <span className="del">−{del}</span>
        </span>
        <span>
          그대로 둔 줄(공통 부분 수열) <strong className="mono">{lcs}</strong>줄 · 편집 <strong className="mono">{ins + del}</strong>번 · 덩어리 <strong className="mono">{r.hunks.length}</strong>개
        </span>
      </div>
      <div className="df-out" role="region" aria-label="unified diff 결과" tabIndex={0}>
        <div className="df-hunk" style={{ color: 'var(--ink-2)' }}>{`--- a/${file}\n+++ b/${file}`}</div>
        {r.hunks.length === 0 && <div className="df-empty">두 파일이 같습니다.</div>}
        {r.hunks.map((h, k) => (
          <div key={k}>
            <div className="df-hunk">{h.header}</div>
            {h.lines.map((l, i) => (
              <div key={i} className="df-line" data-t={l.t}>
                <span className="df-no">{l.oldNo ?? ''}</span>
                <span className="df-no">{l.newNo ?? ''}</span>
                <span className="df-sign">{sign[l.t]}</span>
                <span className="df-text">{l.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Myers on the edit graph ─────────────── */

const SEQ_MAX = 12;
const GRAPH_PRESETS = [
  { value: 'myers', label: '논문 예', a: 'ABCABBA', b: 'CBABAC' },
  { value: 'kitten', label: 'kitten', a: 'kitten', b: 'sitting' },
  { value: 'near', label: '거의 같음', a: 'abcdefgh', b: 'abxdefgh' },
];
const clip = (s: string) => Array.from(s).slice(0, SEQ_MAX).join('');
const show = (c: string) => (c === ' ' ? '␣' : c);

function stepNote(st: MyersStep, a: string[], b: string[]): string {
  const [x, y] = st.end;
  const slide = st.end[0] - st.mid[0];
  let move: string;
  if (!st.from) move = '출발점 (0, 0)에서';
  else if (st.edit === 'ins') move = `대각선 ${st.k + 1}의 끝 (${st.from[0]}, ${st.from[1]})에서 오른쪽으로 한 칸(B의 '${show(b[st.mid[1] - 1])}' 넣기),`;
  else move = `대각선 ${st.k - 1}의 끝 (${st.from[0]}, ${st.from[1]})에서 아래로 한 칸(A의 '${show(a[st.mid[0] - 1])}' 지우기),`;
  const tail = slide ? `같은 글자를 따라 대각선으로 ${slide}칸 미끄러져 (${x}, ${y})에 닿습니다.` : `미끄러질 대각선이 없어 (${x}, ${y})에서 멈춥니다.`;
  return `D = ${st.d} · 대각선 k = ${st.k}: ${move} ${tail}`;
}

function EditGraphFigure() {
  const P = usePalette();
  const [as, setAs] = useState(GRAPH_PRESETS[0].a);
  const [bs, setBs] = useState(GRAPH_PRESETS[0].b);
  const a = useMemo(() => Array.from(as), [as]);
  const b = useMemo(() => Array.from(bs), [bs]);
  const res = useMemo(() => myers(a, b), [a, b]);
  const total = res.steps.length + 1;
  const s = useStepper(total, 2, `${as}|${bs}`);
  const final = s.i === total - 1;
  const cur = final ? null : res.steps[s.i];
  const shown = res.steps.slice(0, final ? res.steps.length : s.i + 1);
  const work = shown.reduce((acc, st) => acc + 1 + st.end[0] - st.mid[0], 0);
  const n = a.length;
  const m = b.length;
  const ops = useMemo(() => pathOps(res.path), [res]);
  const preset = GRAPH_PRESETS.find((p) => p.a === as && p.b === bs)?.value ?? 'custom';

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cell = Math.max(14, Math.min(48, Math.floor((w - 44) / Math.max(1, m)), Math.floor((h - 44) / Math.max(1, n))));
      const ox = Math.round((w - cell * m) / 2 + 12);
      const oy = Math.round((h - cell * n) / 2 + 12);
      const X = (p: Pt) => ox + p[1] * cell; // columns: lines of B
      const Y = (p: Pt) => oy + p[0] * cell; // rows: lines of A

      // the current diagonal k = x − y
      if (cur) {
        const k = cur.k;
        const p0: Pt = [Math.max(0, k), Math.max(0, -k)];
        const len = Math.min(n - p0[0], m - p0[1]);
        if (len >= 0) {
          ctx.strokeStyle = alpha(P.hl, 0.45);
          ctx.lineWidth = Math.max(8, cell * 0.38);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(X(p0), Y(p0));
          ctx.lineTo(X([p0[0] + len, p0[1] + len]), Y([p0[0] + len, p0[1] + len]));
          ctx.stroke();
        }
      }
      // grid
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      for (let x = 0; x <= n; x++) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + x * cell + 0.5);
        ctx.lineTo(ox + m * cell, oy + x * cell + 0.5);
        ctx.stroke();
      }
      for (let y = 0; y <= m; y++) {
        ctx.beginPath();
        ctx.moveTo(ox + y * cell + 0.5, oy);
        ctx.lineTo(ox + y * cell + 0.5, oy + n * cell);
        ctx.stroke();
      }
      // free diagonals where the characters match
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          if (a[i] !== b[j]) continue;
          ctx.beginPath();
          ctx.moveTo(ox + j * cell, oy + i * cell);
          ctx.lineTo(ox + (j + 1) * cell, oy + (i + 1) * cell);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      // headers
      ctx.font = `600 ${Math.round(Math.min(16, cell * 0.42))}px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink;
      b.forEach((c, j) => ctx.fillText(show(c), ox + (j + 0.5) * cell, oy - 13));
      a.forEach((c, i) => ctx.fillText(show(c), ox - 13, oy + (i + 0.5) * cell));
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'left';
      if (ox + m * cell + 30 < w) ctx.fillText('B →', ox + m * cell + 4, oy - 13);
      ctx.textAlign = 'center';
      ctx.fillText('A ↓', ox - 13, oy + n * cell + 12 > h - 6 ? h - 6 : oy + n * cell + 12);

      // explored D-paths: one edit edge then a slide along the diagonal
      const seg = (p: Pt, q: Pt) => {
        ctx.beginPath();
        ctx.moveTo(X(p), Y(p));
        ctx.lineTo(X(q), Y(q));
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      const curD = cur ? cur.d : res.d;
      for (const st of shown) {
        const isCur = st === cur;
        const col = isCur ? P.pos : st.d === curD && !final ? P.neg : alpha(P.neg, final ? 0.28 : 0.4);
        ctx.strokeStyle = col;
        ctx.lineWidth = isCur ? 3.4 : st.d === curD && !final ? 2.6 : 2;
        if (st.from) seg(st.from, st.mid);
        seg(st.mid, st.end);
      }
      for (const st of shown) {
        const isCur = st === cur;
        ctx.beginPath();
        ctx.arc(X(st.end), Y(st.end), isCur ? 5 : 3.2, 0, Math.PI * 2);
        ctx.fillStyle = isCur ? P.pos : final ? alpha(P.neg, 0.5) : P.neg;
        ctx.fill();
      }
      // the shortest path found, traced back
      if (final && res.path.length > 1) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        res.path.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
        ctx.stroke();
      }
      // start and goal
      for (const p of [[0, 0], [n, m]] as Pt[]) {
        ctx.beginPath();
        ctx.arc(X(p), Y(p), 6, 0, Math.PI * 2);
        ctx.fillStyle = P.surface;
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },
    [P, a, b, res, s.i],
    { aspect: (m + 2) / (n + 2), maxHeight: 420, minHeight: 200 },
  );

  return (
    <Figure
      no={2}
      title="편집 그래프에서 마이어스 알고리즘"
      hint="재생하거나 두 문자열을 바꿔 보세요"
      caption={<>행은 A의 글자, 열은 B의 글자이고, 격자점 (x, y)는 "A의 앞 x글자와 B의 앞 y글자를 처리한 상태"입니다. 아래로 한 칸은 A의 글자를 지우기, 오른쪽으로 한 칸은 B의 글자를 넣기로 비용이 1이고, 두 글자가 같은 곳의 점선 대각선은 비용 0입니다. 파란 선은 지금까지 찾은 "편집 D번으로 각 대각선에서 가장 멀리 간 길"이고, 주황색이 방금 계산한 대각선입니다. 노란 띠는 그 대각선 k = x − y입니다. 끝에 닿으면 주황 굵은 선으로 최단 경로를 거꾸로 따라갑니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`편집 그래프: ${as} → ${bs}, 최소 편집 ${res.d}번`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="df-note" aria-live="polite">
            {cur ? stepNote(cur, a, b) : `(${n}, ${m})에 닿았습니다. 최소 편집은 D = ${res.d}번(지우기 ${ops.filter((o) => o.t === 'del').length}번, 넣기 ${ops.filter((o) => o.t === 'ins').length}번)이고, 대각선으로 지난 ${ops.filter((o) => o.t === 'eq').length}글자가 공통 부분 수열입니다.`}
          </div>
          <div className="df-script" aria-label="편집 스크립트">
            <span className="lbl">편집 스크립트</span>
            {final ? (
              ops.length ? (
                ops.map((o, i) => (
                  <span key={i} className="df-tok" data-t={o.t}>
                    {o.t === 'eq' ? ' ' : o.t === 'del' ? '−' : '+'}
                    {show(o.t === 'ins' ? b[o.b] : a[o.a])}
                  </span>
                ))
              ) : (
                <span className="ds-empty">두 문자열이 모두 비어 있습니다</span>
              )
            ) : (
              <span className="ds-empty">끝까지 가면 나옵니다</span>
            )}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="예시"
            value={preset}
            onChange={(v) => {
              const p = GRAPH_PRESETS.find((x) => x.value === v);
              if (p) {
                setAs(p.a);
                setBs(p.b);
              }
            }}
            options={GRAPH_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <div className="df-pair-inputs">
            <div className="ctl">
              <label className="ctl-label" htmlFor="eg-a">
                <span>A</span>
              </label>
              <input id="eg-a" className="text-input mono" type="text" value={as} spellCheck={false} autoComplete="off" onChange={(e) => setAs(clip(e.target.value))} />
            </div>
            <div className="ctl">
              <label className="ctl-label" htmlFor="eg-b">
                <span>B</span>
              </label>
              <input id="eg-b" className="text-input mono" type="text" value={bs} spellCheck={false} autoComplete="off" onChange={(e) => setBs(clip(e.target.value))} />
            </div>
          </div>
          <StepControls s={s} id="eg-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="편집 수 D" value={cur ? String(cur.d) : String(res.d)} color="var(--pos)" />
            <Readout label="살펴본 점" value={String(work)} color="var(--neg)" />
            <Readout label="DP 표라면" value={`${(n + 1) * (m + 1)}칸`} />
            <Readout label="공통 부분 수열" value={final ? `${ops.filter((o) => o.t === 'eq').length}글자` : '—'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: 'D번 편집으로 간 가장 먼 길', shape: 'ln' },
          { color: 'var(--pos)', label: '방금 계산한 대각선 · 최종 경로', shape: 'ln' },
          { color: 'var(--ink-3)', label: '같은 글자 (비용 0)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: how much work, DP vs Myers ─────────────── */

function WorkFigure() {
  const [n, setN] = useState(1000);
  const [c, setC] = useState(5);
  const [seed, setSeed] = useState(1);
  const r = useMemo(() => {
    const { a, b } = editedFiles(n, c, rng(1000 * seed + n + 7 * c));
    const dp = lcsLength(a, b);
    const my = myers(a, b, false);
    return { m: b.length, dp, my, same: my.d === a.length + b.length - 2 * dp.len, bound: (a.length + b.length) * my.d };
  }, [n, c, seed]);
  const rows = [
    { name: 'DP 표의 칸', v: r.dp.cells, color: 'var(--c-cs-3)' },
    { name: '(N+M)·D 상한', v: r.bound, color: 'var(--ink-3)' },
    { name: '마이어스', v: r.my.work, color: 'var(--neg)' },
  ];
  const max = Math.max(...rows.map((x) => x.v));
  const fmt = (v: number) => v.toLocaleString('ko-KR');

  return (
    <Figure
      no={3}
      title="일의 양 비교: 표 전체 vs 가까운 대각선만"
      hint="파일 길이와 바꾼 곳의 수를 바꿔 보세요"
      caption={<>N줄짜리 가짜 소스 파일을 만들고(<code>{'}'}</code>와 빈 줄처럼 자주 반복되는 줄도 섞었습니다), 무작위로 고른 몇 곳에서 줄을 고치거나 지우거나 넣어 새 파일을 만들었습니다. 두 알고리즘을 이 브라우저에서 실제로 돌려 센 값입니다. DP는 공통 부분 수열 길이만 구하는 두 줄짜리 표로 돌렸고, 두 방법이 구한 D가 같은지도 확인합니다. 막대는 위에서부터 DP 표의 칸 수 (N+1)(M+1), 마이어스 알고리즘의 상한 (N+M)·D, 마이어스가 실제로 살펴본 점의 수이고, 가장 큰 값을 기준으로 그렸습니다.</>}
    >
      <div className="controls row">
        <Seg
          label="파일 길이 N"
          value={n}
          onChange={setN}
          options={[
            { value: 200, label: '200줄' },
            { value: 1000, label: '1,000줄' },
            { value: 5000, label: '5,000줄' },
          ]}
        />
        <Slider id="wk-c" label="바꾼 곳" value={c} min={1} max={50} step={1} onChange={setC} format={(v) => `${v}곳`} color="var(--c-cs-3)" />
        <div className="btn-row">
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 무작위 파일
          </Button>
        </div>
      </div>
      <div className="growth-rows df-rows">
        {rows.map((x) => (
          <div key={x.name} className="growth-row">
            <span className="growth-name">{x.name}</span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: `${Math.max(0.6, (x.v / max) * 100)}%`, background: x.color }} />
            </span>
            <span className="growth-time mono">{fmt(x.v)}</span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }} aria-live="polite">
        <Readout label="N · M" value={`${fmt(n)} · ${fmt(r.m)}줄`} />
        <Readout label="최소 편집 D" value={String(r.my.d)} color="var(--pos)" />
        <Readout label="DP ÷ 마이어스" value={`${fmt(Math.round(r.dp.cells / r.my.work))}배`} color="var(--neg)" />
        <Readout label="두 방법의 D" value={r.same ? '같음 ✓' : '다름'} color={r.same ? 'var(--good)' : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Diff() {
  return (
    <>
      <h2>diff가 답하는 질문</h2>
      <p>
        코드 리뷰에서 보는 초록 줄과 빨간 줄, <code>git diff</code>의 <code>+</code>와 <code>-</code>는 모두 같은 질문의 답입니다. <strong>원래 파일 A를 새 파일 B로 바꾸려면 어떤 줄을 지우고 어떤 줄을 넣어야 하는가.</strong> 답은 여러 가지일 수 있습니다. A를 통째로 지우고 B를 통째로 넣어도 맞는 답이지만 쓸모가 없습니다. 우리가 원하는 것은 가장 짧은 답, 곧 손대지 않고 남겨 두는 줄이 가장 많은 답입니다.
      </p>
      <p>
        남겨 둔 줄들은 A에서도 B에서도 같은 순서로 나타나야 합니다. 띄엄띄엄 골라도 되지만 순서는 바꿀 수 없는 이런 줄의 모음을 <T en="common subsequence">공통 부분 수열</T>이라고 합니다. 그러니 가장 짧은 diff를 찾는 일은 두 줄 목록의 <T en="longest common subsequence, LCS">가장 긴 공통 부분 수열</T>을 찾는 일과 같습니다. A가 N줄, B가 M줄, LCS가 L줄이면 A에서 N − L줄을 지우고 B의 M − L줄을 넣어야 하므로 편집 횟수 D는 다음과 같습니다.
      </p>
      <MB note="줄을 '고치는' 연산은 따로 없습니다. 내용이 바뀐 줄은 옛 줄을 지우고 새 줄을 넣은 것, 곧 편집 2번입니다.">{'D = (N - L) + (M - L) = N + M - 2L'}</MB>
      <p>
        <a href="#cs-algorithm-design/dynamic-programming">동적 계획법 장</a>의 편집 거리 표를 떠올려 보세요. 그 표는 삽입, 삭제, 교체를 허용했습니다. diff는 교체 없이 삽입과 삭제만 허용한 같은 문제이고, 비교하는 단위가 글자가 아니라 줄입니다. 칸 하나가 "A의 i번째 줄부터와 B의 j번째 줄부터의 LCS 길이"인 표를 채우면 됩니다.
      </p>
      <MB note="두 줄이 같으면 둘 다 남기고, 다르면 A의 줄을 버리거나 B의 줄을 버린 것 중 나은 쪽을 고릅니다.">{'L[i][j] = \\begin{cases} L[i+1][j+1] + 1 & a_i = b_j \\\\ \\max(L[i+1][j],\\ L[i][j+1]) & a_i \\ne b_j \\end{cases}'}</MB>
      <Code label="LCS로 줄 단위 diff 만들기">{`
function diffLines(a, b) {          // a, b: 줄의 배열
  const n = a.length, m = b.length;
  // L[i][j]: a[i..]와 b[j..]의 가장 긴 공통 부분 수열 길이
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

  // 표를 따라 앞에서부터 걸으며 편집 스크립트를 만든다
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push(' ' + a[i]); i++; j++; }
    else if (j === m || (i < n && L[i + 1][j] >= L[i][j + 1])) out.push('-' + a[i++]);
    else out.push('+' + b[j++]);
  }
  return out;
}`}</Code>
      <p>
        편집 거리 장의 표와 달리 뒤에서부터 채웠습니다. 그래야 표를 앞에서부터 따라 걸으며 줄을 파일 순서대로 내놓을 수 있고, 같은 자리에서 지울 줄과 넣을 줄이 둘 다 있을 때 지울 줄을 먼저 쓰는 관례도 지킬 수 있습니다.
      </p>
      <LineDiffFigure />
      <p>
        첫 예시에서 <code>let sum = 0;</code>, 닫는 중괄호 둘은 그대로 남고, 함수 머리줄, 반복문, 덧셈 줄, <code>return</code> 줄은 지우고 새로 넣은 것으로 나옵니다. 마지막 줄 근처에 새로 생긴 <code>const tax</code> 줄은 넣기만 합니다. "줄 옮기기" 예시를 보면 diff에는 "옮기기"라는 연산이 없다는 것도 알 수 있습니다. <code>c();</code>를 위로 옮긴 것은 한 곳에서 지우고 다른 곳에 넣은 것으로 나타납니다.
      </p>

      <h2>unified 형식 읽기</h2>
      <p>
        그림 1의 출력은 <code>diff -u</code>와 <code>git diff</code>가 쓰는 <T en="unified diff">unified 형식</T>을 따릅니다. 바뀐 줄 주변에 바뀌지 않은 줄을 앞뒤로 몇 줄씩(기본 3줄) 함께 보여 주고, 이렇게 묶인 덩어리마다 다음과 같은 머리줄을 붙입니다.
      </p>
      <MB note="원래 파일의 a번째 줄부터 b줄, 새 파일의 c번째 줄부터 d줄이 이 덩어리에 들어 있다는 뜻입니다.">{'\\texttt{@@ -a,b +c,d @@}'}</MB>
      <p>
        줄 수가 1이면 <code>,1</code>은 생략하고, 줄 수가 0이면(한쪽에 아무 줄도 없는 덩어리) 시작 번호 자리에 그 앞 줄의 번호를 씁니다. 그림 1에서 "설정" 예시를 고르고 문맥을 0줄로 바꿔 보면 덩어리가 셋으로 나뉩니다. 마지막 덩어리 <code>@@ -6,0 +6 @@</code>은 원래 파일의 6번째 줄 뒤에 아무것도 지우지 않고, 새 파일의 6번째 줄 하나를 넣는다는 뜻입니다. 두 변경 사이의 바뀌지 않은 줄이 문맥 줄 수의 두 배 이하이면 두 덩어리는 하나로 합쳐집니다. 패치를 적용하는 도구는 이 문맥 줄을 보고 줄 번호가 조금 어긋나도 맞는 자리를 찾아냅니다.
      </p>

      <h2>편집 그래프</h2>
      <p>
        LCS 표는 언제나 <M>{'(N+1)(M+1)'}</M>칸을 모두 채웁니다. 1만 줄짜리 파일 두 개면 1억 칸입니다. 그런데 실제로 diff를 뜨는 두 파일은 대부분 거의 같습니다. 몇 줄만 바뀌었는데 표 전체를 채우는 것은 낭비입니다. 1986년 Eugene Myers는 이 점을 파고든 알고리즘을 발표했습니다. 시간이 파일 길이의 곱이 아니라 <strong>(N + M) × D</strong>에 비례해서, 바뀐 곳이 적을수록 빠릅니다.
      </p>
      <p>
        마이어스는 문제를 격자 위의 최단 경로로 바꿔 봅니다. 격자점 (x, y)는 A의 앞 x줄과 B의 앞 y줄을 처리한 상태입니다. A의 줄을 하나 지우면 아래로, B의 줄을 하나 넣으면 오른쪽으로 한 칸 가고 각각 비용이 1입니다. A의 x+1번째 줄과 B의 y+1번째 줄이 같으면 대각선으로 공짜로 갈 수 있습니다. (0, 0)에서 (N, M)까지 가는 가장 싼 경로의 비용이 D이고, 경로가 지나는 대각선들이 LCS입니다. 이 격자를 <T en="edit graph">편집 그래프</T>라고 합니다.
      </p>
      <p>
        비용이 0과 1뿐인 그래프의 최단 경로이니 <a href="#cs-algorithms/graph-search">BFS</a>처럼 비용 0인 곳, 1인 곳, 2인 곳… 순으로 넓혀 가면 됩니다. 마이어스의 관찰은 여기서 기억할 것이 아주 적다는 것입니다. 격자점마다 <M>{'k = x - y'}</M>라는 대각선 번호를 붙이면, 편집을 D번 한 경로는 대각선 −D부터 D까지에만 있을 수 있습니다. 그리고 같은 대각선 위에서는 <strong>더 멀리 간 점 하나만</strong> 기억하면 충분합니다. 같은 대각선에서 더 앞에 있는 점은 뒤에 있는 점이 갈 수 있는 곳에 언제나 같은 비용 이하로 갈 수 있기 때문입니다.
      </p>
      <ol>
        <li>D = 0: 출발점에서 대각선으로 갈 수 있는 만큼 미끄러집니다.</li>
        <li>D = 1, 2, …: 대각선 k마다, 이웃 대각선 k+1의 끝점에서 오른쪽으로 한 칸 가는 것과 k−1의 끝점에서 아래로 한 칸 가는 것 중 더 멀리 가는 쪽을 고르고, 다시 대각선으로 갈 수 있는 만큼 미끄러집니다.</li>
        <li>어느 끝점이 (N, M)에 닿으면 그때의 D가 답입니다.</li>
      </ol>
      <EditGraphFigure />
      <p>
        논문에 실린 예인 ABCABBA → CBABAC를 끝까지 재생해 보세요. D = 5에서 끝점이 (7, 6)에 닿습니다. 7 + 6 − 2 × 4 = 5이므로 공통 부분 수열은 4글자이고, 이 경로가 고른 것은 C, A, B, A입니다. 그동안 살펴본 점은 27개로, DP 표의 56칸의 절반쯤입니다. 이렇게 짧은 문자열에서는 차이가 작지만, "거의 같음" 예시처럼 D가 작으면 탐색이 대각선 몇 줄 안에서 끝납니다.
      </p>
      <Code label="마이어스: 최소 편집 횟수 D">{`
function shortestEditLength(a, b) {
  const n = a.length, m = b.length, max = n + m;
  // V[k + max]: 대각선 k(= x − y)에서 지금까지 가장 멀리 간 x
  const V = new Array(2 * max + 2).fill(0);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && V[k - 1 + max] < V[k + 1 + max])) {
        x = V[k + 1 + max];       // 대각선 k+1에서 오른쪽으로: B의 줄 넣기
      } else {
        x = V[k - 1 + max] + 1;   // 대각선 k−1에서 아래로: A의 줄 지우기
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; } // 공짜 대각선
      V[k + max] = x;
      if (x >= n && y >= m) return d;
    }
  }
}`}</Code>
      <p>
        D번째 바퀴는 대각선을 D + 1개 보고, 대각선마다 미끄러지는 거리는 많아야 N + M이므로 전체 시간은 <M>{'O((N+M) \\cdot D)'}</M>입니다. 실제 diff, 곧 어떤 줄을 지우고 넣는지까지 얻으려면 바퀴마다 V를 복사해 두었다가 (N, M)에서부터 거꾸로 따라가면 됩니다. 그림 2의 주황 굵은 선이 그렇게 찾은 경로입니다.
      </p>

      <h2>얼마나 빠른가</h2>
      <WorkFigure />
      <p>
        처음 화면은 1,000줄 파일의 다섯 곳을 고친 경우입니다. D는 9이고, DP 표는 100만 칸을 넘게 채우는 반면 마이어스는 1,046개의 점만 살펴봅니다. 약 960배 차이입니다. 파일을 5,000줄로 늘리면 DP 표는 25배로 커지지만 마이어스의 일은 파일 길이를 따라 5배쯤 늘 뿐이라 차이가 5,000배 가까이로 벌어집니다. 실제 일의 양은 상한 <M>{'(N+M) \\cdot D'}</M>보다도 훨씬 적습니다. 마이어스의 논문은 두 파일이 무작위로 조금씩 다를 때 기대 시간이 <M>{'O(N + D^2)'}</M>이라는 것도 보였는데, 막대가 대략 파일 길이 근처에 머무는 것이 그 모습입니다.
      </p>
      <p>
        반대로 두 파일이 전혀 다르면 D가 N + M에 가까워져 마이어스도 <M>{'O((N+M)^2)'}</M>이 됩니다. 바꾼 곳을 50곳으로 늘리면 차이가 줄어드는 것이 보입니다. 그래도 diff를 뜨는 파일은 대개 조금씩만 다르므로, "바뀐 곳이 적을수록 빠르다"는 성질이 실제로 큰 차이를 만듭니다.
      </p>
      <Callout kind="note" label="메모리">
        위 코드는 D만 구해서 메모리가 <M>{'O(N+M)'}</M>이지만, 경로를 복원하려고 바퀴마다 V를 저장하면 <M>{'O((N+M) \\cdot D)'}</M>가 필요합니다. 마이어스 논문은 양쪽 끝에서 동시에 탐색해 가운데에서 만나는 대각선 구간을 찾고, 그 앞뒤를 재귀로 푸는 <a href="#cs-algorithm-design/divide-conquer">분할 정복</a> 변형으로 메모리를 다시 <M>{'O(N+M)'}</M>으로 줄이는 방법도 함께 제시합니다. 실제 diff 도구들은 이런 변형에 여러 경험적 장치를 더해 씁니다.
      </Callout>

      <h2>Git에서는</h2>
      <p>
        <code>git diff</code>는 기본으로 마이어스 알고리즘을 씁니다. GNU diff도 마이어스의 논문을 바탕으로 합니다. Git에는 다른 알고리즘도 들어 있어서 <code>--diff-algorithm</code> 옵션이나 <code>diff.algorithm</code> 설정으로 고를 수 있습니다.
      </p>
      <ul>
        <li>
          <code>--minimal</code>: 가장 짧은 diff를 보장하려고 시간을 더 씁니다. 기본 설정은 큰 입력에서 시간을 아끼려고 지름길을 쓰기도 합니다.
        </li>
        <li>
          <code>--patience</code>: 양쪽 파일에 딱 한 번씩만 나오는 줄을 먼저 짝지어 뼈대로 삼고, 그 사이를 다시 diff합니다. <code>{'}'}</code>나 빈 줄처럼 흔한 줄에 엉뚱하게 맞춰지는 일이 줄어 사람이 읽기 좋은 diff가 나오는 경우가 많습니다.
        </li>
        <li>
          <code>--histogram</code>: patience 방식을 넓혀, 한 번만 나오는 줄이 없을 때도 적게 나오는 줄을 기준으로 삼습니다.
        </li>
      </ul>
      <p>
        세 방법 모두 결과는 올바른 diff입니다. 다만 가장 짧은 diff가 여럿일 때 어느 것을 고르느냐, 혹은 조금 길어도 읽기 좋은 쪽을 고르느냐가 다릅니다. 함수 하나를 통째로 고쳤는데 diff가 엉뚱한 중괄호끼리 맞춰 놓아 읽기 어렵다면 <code>git diff --histogram</code>을 한번 써 볼 만합니다.
      </p>

      <Callout kind="key">
        가장 짧은 diff는 두 줄 목록의 가장 긴 공통 부분 수열을 남기고 나머지를 지우고 넣는 것이며, 편집 수는 <M>{'D = N + M - 2L'}</M>입니다. LCS 표는 언제나 <M>{'O(NM)'}</M>이 들지만, 마이어스 알고리즘은 편집 그래프에서 편집 D번으로 각 대각선에서 가장 멀리 가는 점만 기억해 <M>{'O((N+M) \\cdot D)'}</M>에 끝납니다. 바뀐 곳이 적은 실제 diff에서 이 차이가 큽니다. unified 형식의 <code>@@ -a,b +c,d @@</code>는 각 덩어리의 줄 범위입니다.
      </Callout>
      <Quiz
        q="10,000줄짜리 파일에서 세 줄의 내용만 고쳐 새 파일을 만들었다(고친 줄이 다른 줄과 우연히 같아지지는 않는다). 줄 단위 최소 편집 횟수 D는?"
        options={['3', '6', '9,997', '20,000']}
        answer={1}
        explain={<>diff에는 '고치기'가 없으므로 고친 줄 하나는 옛 줄 지우기와 새 줄 넣기, 편집 2번입니다. 그대로인 9,997줄이 가장 긴 공통 부분 수열이고 <M>{'D = 10000 + 10000 - 2 \\times 9997 = 6'}</M>입니다. 그래서 마이어스 알고리즘은 대각선 −6부터 6까지만 살피면 되고, 1억 칸짜리 DP 표를 채울 필요가 없습니다.</>}
      />
    </>
  );
}

import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { BENCHMARK, PRECISION_KO, PRECISION_PROGRAM, SINK_KO, analyze, analyzePrecision, confusion, handlerProgram, type IdHandling, type Precision, type TaintFrame } from './taint';
import './software.css';
import './static.css';

const KIND_SHORT = { sql: 'SQL', shell: '셸', html: 'HTML' } as const;

/* ─────────────── Figure 1: follow the taint through a handler ─────────────── */

/** Where each node of the handler's data-flow graph sits, as fractions of the canvas. */
const NODES: Record<string, { x: number; y: number; kind: 'src' | 'var' | 'sink'; label: string }> = {
  'req.query.name': { x: 0.11, y: 0.2, kind: 'src', label: 'req.query.name' },
  'req.query.id': { x: 0.11, y: 0.66, kind: 'src', label: 'req.query.id' },
  name: { x: 0.36, y: 0.2, kind: 'var', label: 'name' },
  id: { x: 0.36, y: 0.66, kind: 'var', label: 'id' },
  hello: { x: 0.6, y: 0.2, kind: 'var', label: 'hello' },
  file: { x: 0.6, y: 0.88, kind: 'var', label: 'file' },
  'res.send': { x: 0.88, y: 0.2, kind: 'sink', label: 'res.send' },
  'db.query': { x: 0.88, y: 0.5, kind: 'sink', label: 'db.query' },
  exec: { x: 0.88, y: 0.88, kind: 'sink', label: 'exec' },
};

interface Edge {
  from: string;
  to: string;
  /** Program line that creates the edge. */
  line: number;
  /** Sanitizer on the edge, if any. */
  fn?: string;
  /** A parameterized query: the value no longer flows into the SQL text. */
  safe?: boolean;
}

function edgesOf(escapeName: boolean, id: IdHandling, paramQuery: boolean): Edge[] {
  return [
    { from: 'req.query.name', to: 'name', line: 1 },
    { from: 'req.query.id', to: 'id', line: 2, fn: id === 'parse' ? 'parseInt' : id === 'escape' ? 'escapeHtml' : undefined },
    { from: 'name', to: 'hello', line: 3, fn: escapeName ? 'escapeHtml' : undefined },
    { from: 'id', to: 'db.query', line: 4, safe: paramQuery },
    { from: 'id', to: 'file', line: 5 },
    { from: 'file', to: 'exec', line: 6 },
    { from: 'hello', to: 'res.send', line: 7 },
  ];
}

function FlowGraph({ frame, edges }: { frame: TaintFrame; edges: Edge[] }) {
  const P = usePalette();
  const shown = edges.filter((e) => e.line <= frame.line);
  const found = new Set(frame.findings.map((f) => ['db.query', 'exec', 'res.send'][['sql', 'shell', 'html'].indexOf(f.kind)]));
  const reached = new Set(shown.map((e) => e.to).concat(shown.map((e) => e.from)));
  const tainted = (n: string) => (NODES[n].kind === 'src' ? true : NODES[n].kind === 'sink' ? found.has(n) : (frame.taint[n] ?? []).length > 0);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 22;
      const X = (f: number) => pad + f * (w - 2 * pad);
      const Y = (f: number) => 14 + f * (h - 34);
      ctx.font = `600 11px ${P.fontMono}`;
      const boxW = (s: string) => ctx.measureText(s).width + 16;
      // edges first, so nodes sit on top
      for (const e of shown) {
        const a = NODES[e.from], b = NODES[e.to];
        const x1 = X(a.x) + boxW(a.label) / 2, y1 = Y(a.y);
        const x2 = X(b.x) - boxW(b.label) / 2, y2 = Y(b.y);
        const bad = e.safe ? false : tainted(e.to);
        ctx.strokeStyle = e.safe ? P.ink3 : bad ? P.bad : P.good;
        ctx.lineWidth = bad ? 2.2 : 1.6;
        ctx.setLineDash(e.safe ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2 - 6, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 7, y2 - 4);
        ctx.lineTo(x2 - 7, y2 + 4);
        ctx.fill();
        if (e.fn || e.safe) {
          const label = e.safe ? '? 자리표시자' : e.fn!;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          ctx.font = `600 10px ${P.fontMono}`;
          const tw = ctx.measureText(label).width + 10;
          ctx.fillStyle = P.surface;
          ctx.strokeStyle = P.lineStrong;
          ctx.lineWidth = 1;
          ctx.fillRect(mx - tw / 2, my - 9, tw, 18);
          ctx.strokeRect(mx - tw / 2 + 0.5, my - 8.5, tw - 1, 17);
          ctx.fillStyle = P.ink2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mx, my + 0.5);
          ctx.font = `600 11px ${P.fontMono}`;
        }
      }
      for (const [id, n] of Object.entries(NODES)) {
        const on = reached.has(id);
        const bw = boxW(n.label);
        const x = X(n.x) - bw / 2, y = Y(n.y) - 12;
        const bad = on && tainted(id);
        const color = !on ? P.line : n.kind === 'src' ? P.bad : bad ? P.bad : P.good;
        ctx.fillStyle = !on ? P.surface : n.kind === 'sink' ? alpha(color, 0.16) : n.kind === 'src' ? alpha(P.bad, 0.1) : bad ? alpha(P.bad, 0.12) : alpha(P.good, 0.12);
        ctx.fillRect(x, y, bw, 24);
        ctx.strokeStyle = color;
        ctx.lineWidth = n.kind === 'sink' ? 2 : 1.2;
        ctx.setLineDash(n.kind === 'src' ? [3, 2] : []);
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 23);
        ctx.setLineDash([]);
        ctx.fillStyle = on ? P.ink : P.ink3;
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, X(n.x), Y(n.y) + 0.5);
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `500 10px ${P.fontBody}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      ctx.fillText('출발점', X(0.11), h - 4);
      ctx.fillText('변수', X(0.48), h - 4);
      ctx.fillText('도착점', X(0.88), h - 4);
    },
    [P, frame, shown],
    { height: 230, minHeight: 40 },
  );
  const desc = shown.length
    ? `데이터 흐름 그래프. ${shown.map((e) => `${e.from}에서 ${e.to}로${e.fn ? ` ${e.fn}를 거쳐` : ''}${e.safe ? ' 자리표시자로 따로' : ''}`).join(', ')} 흐릅니다. 경고가 난 도착점: ${[...found].join(', ') || '없음'}.`
    : '데이터 흐름 그래프. 아직 분석한 문장이 없어 비어 있습니다.';
  return (
    <div ref={wrapRef} className="canvas-box" role="img" aria-label={desc}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function TaintFigure() {
  const [escapeName, setEscapeName] = useState(false);
  const [id, setId] = useState<IdHandling>('raw');
  const [paramQuery, setParamQuery] = useState(false);
  const prog = useMemo(() => handlerProgram(escapeName, id, paramQuery), [escapeName, id, paramQuery]);
  const frames = useMemo(() => analyze(prog), [prog]);
  const edges = useMemo(() => edgesOf(escapeName, id, paramQuery), [escapeName, id, paramQuery]);
  const s = useStepper(frames.length, 2, `${escapeName}${id}${paramQuery}`, true);
  const f = frames[s.i];
  const vars = ['name', 'id', 'hello', 'file'];
  const findingLines = new Map(f.findings.map((x) => [x.line, x.kind]));

  return (
    <Figure
      no={1}
      title="사용자 입력이 어디까지 흘러가나"
      hint="정화 방법을 바꾸고 한 줄씩 따라가 보세요"
      caption={
        <>
          요청에서 온 값은 출발점이고, <code>db.query</code>, <code>exec</code>, <code>res.send</code>는 각각 SQL, 셸, HTML 도착점입니다. 오른쪽 표는 변수마다 아직 위험한 도착점 종류를 칩으로 보여 줍니다. 정화 함수는 자기가 막는 종류의 칩만 지웁니다. 아래 그래프에서 빨간 선은 오염된 값이 흐르는 길이고, 초록 선은 깨끗한 값의 길입니다.
        </>
      }
    >
      <div className="controls row">
        <Check label="name에 escapeHtml 쓰기" checked={escapeName} onChange={setEscapeName} />
        <Seg
          label="id 처리"
          value={id}
          onChange={setId}
          options={[
            { value: 'raw', label: '그대로' },
            { value: 'escape', label: 'escapeHtml' },
            { value: 'parse', label: 'parseInt' },
          ]}
        />
        <Check label="매개변수화된 쿼리" checked={paramQuery} onChange={setParamQuery} />
      </div>
      <div className="sa-split">
        <ol className="sa-code" aria-label="분석하는 프로그램">
          {prog.map((st, i) => (
            <li key={i} data-s={i === f.line ? 'now' : i > f.line ? 'todo' : undefined} data-flag={findingLines.has(i) ? 'real' : undefined}>
              <span>{st.code}</span>
              <span className="sa-mark" data-k="find">
                {findingLines.has(i) ? `경고: ${KIND_SHORT[findingLines.get(i)!]}` : ''}
              </span>
            </li>
          ))}
        </ol>
        <div className="ss-col">
          <div>
            <div className="sa-head">변수마다 아직 위험한 도착점</div>
            <div className="sa-taint">
              {vars.map((v) => {
                const t = f.taint[v];
                return (
                  <div key={v} className="sa-taint-row">
                    <span>{v}</span>
                    <span className="sa-chips">
                      {t === undefined ? (
                        <span className="ss-small">아직 없음</span>
                      ) : t.length ? (
                        t.map((k) => (
                          <span key={k} className="sa-chip">
                            {KIND_SHORT[k]}
                          </span>
                        ))
                      ) : (
                        <span className="sa-chip" data-clean="">
                          깨끗함
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="sa-head">경고 {f.findings.length}개</div>
            {f.findings.length ? (
              <ul className="sa-findings">
                {f.findings.map((x) => (
                  <li key={x.line}>
                    {x.line + 1}번 줄: {x.via.join(', ')} → {SINK_KO[x.kind]}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ss-small">없음</div>
            )}
          </div>
        </div>
      </div>
      <FlowGraph frame={f} edges={edges} />
      <div className="ss-note" aria-live="polite">
        {f.line >= 0 ? `${f.line + 1}번 줄. ` : ''}
        {f.note}
      </div>
      <div className="controls row">
        <StepControls s={s} id="sa-speed" maxSpeed={8} />
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '오염된 흐름, 경고', shape: 'ln' },
          { color: 'var(--good)', label: '깨끗한 흐름', shape: 'ln' },
          { color: 'var(--ink-3)', label: '자리표시자로 따로 전달', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: how precise should the analysis be? ─────────────── */

function PrecisionFigure() {
  const [p, setP] = useState<Precision>('insensitive');
  const r = useMemo(() => analyzePrecision(PRECISION_PROGRAM, p), [p]);
  const flags = new Map(r.findings.map((x) => [x.line, x]));
  const real = r.findings.filter((x) => x.real).length;
  // lines inside the infeasible `if (debug)` block, greyed out when the analysis skips them
  const dead = p === 'path' ? new Set([6]) : new Set<number>();
  return (
    <Figure
      no={2}
      title="흐름과 경로를 얼마나 따질까"
      hint="분석의 정밀도를 바꿔 보세요"
      caption={
        <>
          빨간 표시는 실제 취약점을 맞힌 경고, 보라색 표시는 거짓 경보입니다. "추적하는 사실 수"는 분석기가 기억해야 하는 오염 정보의 개수로, 흐름을 무시하면 변수마다 하나, 흐름을 따지면 변수마다 문장마다 하나, 경로까지 따지면 거기에 가능한 경로 수(조건문 2개라 4개)를 곱합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="분석 방식"
          value={p}
          onChange={setP}
          options={(['insensitive', 'flow', 'path'] as Precision[]).map((v) => ({ value: v, label: PRECISION_KO[v] }))}
        />
      </div>
      <ol className="sa-code" aria-label="정밀도를 비교하는 프로그램">
        {PRECISION_PROGRAM.map((st, i) => {
          const fl = flags.get(i);
          return (
            <li key={i} data-flag={fl ? (fl.real ? 'real' : 'false') : undefined} data-dead={dead.has(i) || undefined}>
              <span>{st.code}</span>
              <span className="sa-mark" data-k={fl ? (fl.real ? 'real' : 'false') : undefined}>
                {fl ? (fl.real ? `진짜 취약점 (${KIND_SHORT[fl.kind]})` : `거짓 경보 (${KIND_SHORT[fl.kind]})`) : dead.has(i) ? '실행되지 않음' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="readouts">
        <Readout label="경고" value={`${r.findings.length}개`} />
        <Readout label="진짜 취약점" value={`${real}개`} color="var(--bad)" />
        <Readout label="거짓 경보" value={`${r.findings.length - real}개`} color="var(--c-net-2)" />
        <Readout label="추적하는 사실 수" value={r.facts} />
      </div>
      <div className="ss-note" aria-live="polite">
        {p === 'insensitive'
          ? '흐름을 무시하면 q가 한 번이라도 오염된 적이 있으니 끝까지 오염된 것으로 봅니다. 3번 줄에서는 이미 "latest"로 덮어썼는데도 경고합니다.'
          : p === 'flow'
            ? '문장 순서를 따지니 2번 줄에서 q가 깨끗해진 것을 압니다. 그러나 debug가 언제나 false라는 것은 보지 않아서 7번 줄의 exec를 여전히 경고합니다.'
            : '조건이 상수 false인 분기는 실행되지 않으므로 건너뜁니다. 남은 경고는 10번 줄의 진짜 XSS 하나입니다. 길이 검사는 특수 문자를 막지 못하므로 경고가 옳습니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: precision vs recall on a benchmark ─────────────── */

function BenchmarkFigure() {
  const P = usePalette();
  const [th, setTh] = useState(50);
  const c = confusion(BENCHMARK, th);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const l = 54, r = 14;
      const X = (s: number) => l + (s / 100) * (w - l - r);
      const rows = [
        { y: h * 0.32, vuln: true, label: '실제 취약' },
        { y: h * 0.68, vuln: false, label: '실제 안전' },
      ];
      // the reported region
      ctx.fillStyle = alpha(P.hl, 0.35);
      ctx.fillRect(X(th), 6, X(100) - X(th), h - 40);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(th), 4);
      ctx.lineTo(X(th), h - 32);
      ctx.stroke();
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textBaseline = 'middle';
      for (const row of rows) {
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(l, row.y);
        ctx.lineTo(w - r, row.y);
        ctx.stroke();
        ctx.fillStyle = P.ink2;
        ctx.textAlign = 'right';
        ctx.fillText(row.label, l - 6, row.y);
        // stack candidates with the same score
        const seen: Record<number, number> = {};
        for (const cand of BENCHMARK.filter((b) => b.vuln === row.vuln)) {
          const k = seen[cand.score] ?? 0;
          seen[cand.score] = k + 1;
          const x = X(cand.score), y = row.y - k * 12;
          const rep = cand.score >= th;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          const col = row.vuln ? P.bad : P.stats2;
          if (rep) {
            ctx.fillStyle = col;
            ctx.fill();
          } else {
            ctx.fillStyle = P.surface;
            ctx.fill();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      for (let s = 0; s <= 100; s += 25) ctx.fillText(String(s), X(s), h - 20);
      ctx.textAlign = 'right';
      ctx.font = `500 10px ${P.fontBody}`;
      ctx.fillText('분석기의 확신 점수 →', w - r, h - 5);
    },
    [P, th],
    { height: 166, minHeight: 40 },
  );
  const verdict = (vuln: boolean, rep: boolean) => (rep ? (vuln ? 'tp' : 'fp') : vuln ? 'fn' : 'tn');
  const VERDICT_KO = { tp: '맞힌 경고', fp: '거짓 경보', fn: '놓침', tn: '조용히 넘어감' };
  return (
    <Figure
      no={3}
      title="경고 기준을 어디에 둘까"
      hint="기준을 움직여 정밀도와 재현율을 바꿔 보세요"
      caption={
        <>
          분석기가 찾은 후보 흐름 {BENCHMARK.length}개와, 사람이 확인한 실제 정답입니다. 분석기는 흐름마다 확신 점수를 매기고, 기준 이상인 것만 경고합니다. 채운 점은 경고한 것, 빈 점은 경고하지 않은 것입니다. <strong>정밀도</strong>는 경고 중 진짜의 비율, <strong>재현율</strong>은 진짜 취약점 중 경고한 비율입니다. 점수는 설명을 위해 정한 예시 값입니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`후보 흐름 ${BENCHMARK.length}개를 확신 점수에 따라 놓은 그림. 기준 ${th}점 이상을 경고하면 맞힌 경고 ${c.tp}개, 거짓 경보 ${c.fp}개, 놓친 취약점 ${c.fn}개입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="sa-th" label="경고 기준 (점수)" value={th} min={0} max={100} step={5} onChange={setTh} />
      </div>
      <div className="readouts">
        <Readout label="경고" value={`${c.tp + c.fp}개`} />
        <Readout label="맞힌 경고" value={c.tp} color="var(--bad)" />
        <Readout label="거짓 경보" value={c.fp} color="var(--c-net-2)" />
        <Readout label="놓친 취약점" value={c.fn} />
        <Readout label="정밀도" value={`${Math.round(c.precision * 100)}%`} />
        <Readout label="재현율" value={`${Math.round(c.recall * 100)}%`} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl sa-bench">
          <thead>
            <tr>
              <th>후보 흐름</th>
              <th>점수</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARK.map((b) => {
              const rep = b.score >= th;
              const v = verdict(b.vuln, rep);
              return (
                <tr key={b.flow} data-rep={rep || undefined}>
                  <td>
                    {b.flow}
                    <div className="ss-small">
                      {b.vuln ? '실제 취약' : '실제 안전'}. {b.why}
                    </div>
                  </td>
                  <td className="num">{b.score}</td>
                  <td className="sa-verdict" data-k={v}>
                    {VERDICT_KO[v]}
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

/* ─────────────── Lesson ─────────────── */

export default function StaticAnalysis() {
  const at = (t: number) => confusion(BENCHMARK, t);
  const c50 = at(50), c25 = at(25), c60 = at(60);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const vulnCount = BENCHMARK.filter((b) => b.vuln).length;
  return (
    <>
      <h2>실행하지 않고 읽어서 찾기</h2>
      <p>
        <a href={lessonHref('net-software-security', 'fuzzing')}>앞 장의 퍼징</a>은 프로그램을 실제로 돌려 보며 버그를 찾았습니다. 돌려 본 입력에 대해서는 확실하지만, 돌려 보지 않은 길은 알 수 없습니다. <T en="static analysis">정적 분석</T>은 반대로 코드를 실행하지 않고 읽기만 해서, 모든 길에 대해 무언가를 말하려고 합니다. 컴파일러의 경고, 린터, 타입 검사기가 모두 정적 분석입니다.
      </p>
      <p>
        보안에서 가장 많이 쓰는 정적 분석은 <T en="taint analysis">오염 추적</T>입니다. <a href={lessonHref('net-security', 'web-security')}>웹 보안</a> 장에서 본 SQL 삽입과 XSS, 그리고 셸 명령 삽입은 모양이 같습니다. 공격자가 보낸 값이 검사 없이 위험한 함수에 닿는 것입니다. 그래서 세 가지를 정해 두고 그 사이의 길을 찾습니다.
      </p>
      <ul>
        <li>
          <T en="source">출발점</T>: 공격자가 고를 수 있는 값이 들어오는 곳. 요청 매개변수, 헤더, 쿠키, 업로드한 파일.
        </li>
        <li>
          <T en="sink">도착점</T>: 값이 코드나 명령으로 해석될 수 있는 곳. SQL 쿼리, 셸 명령, HTML 출력.
        </li>
        <li>
          <T en="sanitizer">정화 함수</T>: 값을 특정 도착점에 안전하게 만드는 함수. HTML 이스케이프, 숫자 변환, 허용 목록 검사.
        </li>
      </ul>
      <p>그림 1은 주문 목록을 보여 주는 작은 요청 처리 함수를 분석합니다. 문장마다 어느 변수가 어떤 도착점에 위험한지 표로 갱신하고, 위험한 값이 도착점에 닿으면 경고를 냅니다.</p>
      <TaintFigure />
      <p>
        처음 설정에서는 경고가 3개 나옵니다. <code>id</code>는 SQL 쿼리와 파일 이름을 거쳐 셸 명령에 들어가고, <code>name</code>은 인사말을 거쳐 HTML에 들어갑니다. 문자열을 이어 붙이는 것은 오염을 지우지 않고 그대로 옮긴다는 점을 보세요.
      </p>
      <p>
        이제 <strong>id 처리</strong>를 escapeHtml로 바꿔 보세요. 정화 함수를 썼는데도 경고는 3개 그대로입니다. <code>escapeHtml</code>은 <code>&lt;</code>와 <code>&amp;</code> 같은 HTML 특수 문자를 바꿀 뿐, 작은따옴표나 세미콜론은 그대로 두기 때문입니다. 정화는 도착점의 종류마다 따로 있습니다. 이 분석기가 오염을 "위험한가 아닌가" 하나가 아니라 도착점 종류별 칩으로 기억하는 이유가 이것입니다. parseInt로 바꾸면 id는 숫자가 되어 어느 도착점에도 문법을 만들 수 없으므로, SQL과 셸 경고가 함께 사라집니다. name에 escapeHtml까지 쓰면 경고는 0개가 됩니다.
      </p>
      <Callout kind="note">
        SQL에는 정화보다 나은 방법이 있습니다. <strong>매개변수화된 쿼리</strong>를 켜면 SQL 문장에는 <code>?</code> 자리표시자만 남고, 값은 데이터베이스에 따로 전달됩니다. 값이 문장의 일부로 해석될 길이 아예 없으니, 분석기도 그 줄을 도착점으로 보지 않습니다. 정화는 어떤 문자를 막아야 하는지 사람이 맞혀야 하지만, 자리표시자는 그럴 필요가 없습니다.
      </Callout>

      <h2>얼마나 정밀하게 볼 것인가</h2>
      <p>
        분석기는 프로그램의 모든 실행을 다 따라갈 수 없으므로 어딘가에서 요약합니다. 요약을 거칠게 하면 빠르지만 거짓 경보가 늘고, 정밀하게 하면 느려집니다. 그림 2의 프로그램으로 세 단계를 비교해 보세요.
      </p>
      <PrecisionFigure />
      <p>
        <T en="flow-insensitive">흐름을 무시하는</T> 분석은 변수마다 "한 번이라도 오염된 적이 있는가"만 기억합니다. 경고 3개 중 진짜는 1개입니다. <T en="flow-sensitive">흐름을 따지는</T> 분석은 문장 순서대로 상태를 바꾸므로 덮어쓴 q를 깨끗하다고 보고, 경고가 2개로 줄어듭니다. <T en="path-sensitive">경로까지 따지는</T> 분석은 조건문의 어느 쪽이 실행될 수 있는지도 보므로 진짜 하나만 남습니다.
      </p>
      <p>
        대가는 추적해야 하는 정보의 양입니다. 이 작은 함수에서도 3개, 33개, 132개로 늘어납니다. 조건문이 하나 늘 때마다 경로 수가 두 배가 되고, 반복문이 있으면 경로는 끝이 없습니다. 그래서 실제 분석기는 대부분 흐름은 따지되, 두 갈래가 다시 만나는 곳에서 상태를 합쳐 경로 수가 늘지 않게 합니다. 그 대신 어떤 거짓 경보는 감수합니다.
      </p>

      <h2>완벽한 분석기는 없다</h2>
      <p>
        더 정밀하게 하면 언젠가 거짓 경보도 놓침도 없는 분석기를 만들 수 있을까요? 없습니다. <a href={lessonHref('cs-computation', 'undecidability')}>정지 문제</a>를 풀 수 없다는 사실에서, 프로그램이 "실행되면 이런 일을 하는가"를 묻는 의미 있는 질문은 모두 어떤 알고리즘으로도 항상 정확히 답할 수 없다는 <T en="Rice's theorem">라이스의 정리</T>가 나옵니다. "이 값이 이 도착점에 닿는가"도 그런 질문입니다. 그러므로 분석기는 둘 중 한쪽으로 틀리기로 정해야 합니다. 의심스러우면 경고하거나(거짓 경보를 감수), 확실할 때만 경고하거나(놓침을 감수).
      </p>
      <p>그림 3은 그 맞바꿈을 한 줄로 보여 줍니다. 분석기가 찾은 후보 흐름 {BENCHMARK.length}개 중 실제 취약점은 {vulnCount}개입니다.</p>
      <BenchmarkFigure />
      <p>
        기준이 50점이면 경고 {c50.tp + c50.fp}개 중 {c50.tp}개가 진짜이고(정밀도 {pct(c50.precision)}), 진짜 취약점 {vulnCount}개 중 {c50.fn}개를 놓칩니다(재현율 {pct(c50.recall)}). 기준을 25점까지 낮추면 하나도 놓치지 않지만 경고가 {c25.tp + c25.fp}개로 늘고 그중 {c25.fp}개가 거짓 경보입니다(정밀도 {pct(c25.precision)}). 60점으로 올리면 거짓 경보는 없어지지만 재현율이 {pct(c60.recall)}로 떨어집니다. 놓친 것들을 보세요. 로그를 거쳐 나중에 터지는 2차 XSS, 데이터베이스에 저장됐다가 나오는 저장형 XSS처럼 길이 길고 간접적인 흐름입니다.
      </p>
      <p>
        두 정규식 흐름은 점수가 35점으로 같습니다. 하나는 <code>^[a-z]+$</code>로 처음부터 끝까지 검사해서 안전하고, 다른 하나는 앵커가 없어 소문자가 하나만 있어도 통과하므로 취약합니다. 분석기가 정규식의 뜻까지 이해하지 못하면 둘을 구별할 수 없습니다. 이런 경고는 결국 사람이 읽고 판단해야 합니다.
      </p>
      <Callout kind="intuition">
        경고가 너무 많은 분석기는 아무도 읽지 않게 되고, 그러면 진짜 경고도 함께 묻힙니다. 그래서 팀이 분석기를 들일 때는 보통 확실한 규칙 몇 개만 켜고, 새로 바뀐 코드에서 나온 경고만 보여 주고, 거짓 경보로 판정한 것은 이유와 함께 기록해 다시 뜨지 않게 합니다. GitHub의 CodeQL이나 Semgrep 같은 도구를 풀 리퀘스트마다 돌리는 것이 흔한 방식입니다.
      </Callout>

      <h2>타입도 정적 분석입니다</h2>
      <p>
        <a href={lessonHref('cs-programming-languages', 'type-systems')}>타입 검사</a>는 가장 널리 쓰이는 정적 분석입니다. 타입 검사기는 "이 프로그램에서 숫자에 문자열 메서드를 부르는 일은 없다"를 실행하지 않고 증명합니다. 같은 방법으로 오염을 타입에 담을 수도 있습니다. 사용자 입력은 <code>Untrusted</code> 타입으로 받고, HTML 출력 함수는 <code>SafeHtml</code> 타입만 받게 하면, 이스케이프하지 않은 값을 넘기는 코드는 컴파일되지 않습니다.
      </p>
      <Code label="오염을 타입으로 막기 (TypeScript)">{`
type SafeHtml = string & { readonly __brand: 'SafeHtml' };

function escapeHtml(s: string): SafeHtml {
  return s.replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';') as SafeHtml;
}
function render(html: SafeHtml) { /* … */ }

render(escapeHtml(req.query.name));   // 통과
render(req.query.name);               // 컴파일 오류: string은 SafeHtml이 아니다`}</Code>
      <p>
        브라우저의 Trusted Types 기능도 같은 생각입니다. 이렇게 하면 경고를 찾아 읽는 대신, 위험한 코드를 처음부터 쓸 수 없게 만듭니다. <a href={lessonHref('cs-software-design', 'types')}>타입으로 실수 막기</a> 장에서 본 "불가능한 상태를 표현할 수 없게" 하는 설계를 보안에 적용한 것입니다.
      </p>

      <Callout kind="key">
        오염 추적은 공격자가 고른 값(출발점)이 정화 없이 위험한 함수(도착점)에 닿는 길을 코드를 읽어서 찾습니다. 정화는 도착점 종류마다 따로 있으므로 HTML 이스케이프로는 SQL을 막을 수 없고, SQL은 정화보다 매개변수화된 쿼리가 낫습니다. 분석을 정밀하게 할수록 거짓 경보가 줄지만 추적할 정보가 빠르게 늘고, 라이스의 정리 때문에 거짓 경보와 놓침이 모두 없는 분석기는 만들 수 없습니다. 그래서 경고 기준을 정밀도와 재현율 사이에서 고르고, 가능하면 타입으로 위험한 코드를 아예 쓸 수 없게 만듭니다.
      </Callout>
      <Quiz
        q={<>분석기가 <code>db.query("... WHERE id = '" + escapeHtml(req.query.id) + "'")</code> 줄에 SQL 삽입 경고를 냈다. 가장 알맞은 판단은?</>}
        options={['escapeHtml을 거쳤으므로 거짓 경보다. 이 규칙을 끈다', '진짜 경고다. 매개변수화된 쿼리로 바꿔 값을 문장과 따로 보낸다', '진짜 경고다. escapeHtml을 한 번 더 감싸면 된다', '경로까지 따지는 분석기로 바꾸면 경고가 사라질 것이다']}
        answer={1}
        explain={<>escapeHtml은 HTML 특수 문자만 바꾸고 작은따옴표는 그대로 두므로, 이 값은 여전히 SQL 문장을 깰 수 있습니다. 같은 함수를 두 번 감싸도 달라지지 않고, 조건문이 없으니 경로를 따져도 경고는 그대로입니다. 값을 자리표시자로 따로 보내면 문장의 일부로 해석될 길이 없어집니다.</>}
      />
    </>
  );
}


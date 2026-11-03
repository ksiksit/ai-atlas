import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { EVAL_SIZES, HANDBOOK, QUESTIONS, answerSpan, buildIndex, buildPrompt, dist2, evalAt, ivfJob, kmeans2d, makeClustered, rankOfAnswer, smallestK, type IvfCurve, type JobProgress, type Span, type Take, type Vectors } from './serve';
import '../../../cs/algorithms/lessons/algorithms.css';
import './serve.css';

/** Text with a surface-coloured backing so it stays legible over lines and fills. */
function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, opts: { align?: CanvasTextAlign; color?: string; bold?: boolean } = {}) {
  ctx.font = `${opts.bold ? 700 : 500} 11px ${P.fontMono}`;
  const tw = ctx.measureText(text).width;
  const align = opts.align ?? 'center';
  const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  ctx.fillStyle = P.surface;
  ctx.fillRect(left - 3, y - 7, tw + 6, 14);
  ctx.fillStyle = opts.color ?? P.ink2;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

/** Chunk text with the part that belongs to the answer marked. */
function ChunkText({ text, start, span }: { text: string; start: number; span: Span | null }) {
  if (!span) return <>{text}</>;
  const a = Math.max(0, span.start - start);
  const b = Math.min(text.length, span.end - start);
  if (b <= a) return <>{text}</>;
  return (
    <>
      {text.slice(0, a)}
      <mark className="sv-ans">{text.slice(a, b)}</mark>
      {text.slice(b)}
    </>
  );
}

/* ─────────────── Figure 1: from a question to a prompt ─────────────── */

const PRESETS = [
  { i: 0, label: '연차' },
  { i: 3, label: '영수증' },
  { i: 5, label: '노트북' },
  { i: 10, label: '바꿔 말하기' },
];

function PipelineFigure() {
  const P = usePalette();
  const [q, setQ] = useState(QUESTIONS[0].q);
  const [size, setSize] = useState(120);
  const [ov, setOv] = useState(20);
  const [k, setK] = useState(3);
  const overlap = Math.min(ov, Math.floor(size / 2));
  const ix = useMemo(() => buildIndex(size, overlap), [size, overlap]);
  const r = useMemo(() => ix.search(q), [ix, q]);
  const top = r.order.slice(0, k);
  const qa = QUESTIONS.find((x) => x.q === q.trim());
  const span = qa ? answerSpan(qa) : null;
  const res = span ? rankOfAnswer(r, span) : null;
  const prompt = buildPrompt(q.trim() || '(질문 없음)', r.chunks, top);
  const best = r.scores[r.order[0]] || 1e-9;
  const preset = PRESETS.find((p) => QUESTIONS[p.i].q === q.trim())?.i ?? -1;
  const maxLen = Math.max(...HANDBOOK.map((d) => d.text.length));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 480;
      const labW = narrow ? 62 : 84;
      const x0 = labW;
      const sc = (w - x0 - 8) / maxLen;
      const rowH = (h - 6) / HANDBOOK.length;
      const laneH = Math.min(10, rowH * 0.32);
      const rank = new Map(top.map((c, i) => [c, i]));
      HANDBOOK.forEach((d, di) => {
        const y = 4 + di * rowH;
        ctx.fillStyle = P.ink2;
        ctx.font = `${narrow ? 11 : 12}px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.title, 2, y + rowH * 0.42);
        ctx.fillStyle = P.surface2;
        ctx.fillRect(x0, y + 2, d.text.length * sc, laneH * 2 + 3);
        if (span && span.doc === di) {
          ctx.fillStyle = P.hl;
          ctx.fillRect(x0 + span.start * sc, y + laneH * 2 + 7, (span.end - span.start) * sc, 4);
        }
      });
      const seen = new Map<number, number>();
      r.chunks.forEach((c, ci) => {
        const n = seen.get(c.doc) ?? 0;
        seen.set(c.doc, n + 1);
        const y = 4 + c.doc * rowH + 2 + (n % 2) * (laneH + 1);
        const x = x0 + c.start * sc;
        const cw = Math.max(1.5, (c.end - c.start) * sc - 1);
        const s = Math.max(0, r.scores[ci]) / best;
        ctx.fillStyle = alpha(P.accent, 0.1 + 0.8 * s);
        ctx.fillRect(x, y, cw, laneH);
        const rk = rank.get(ci);
        if (rk !== undefined) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cw - 2, laneH - 2);
        }
      });
      // rank tags last so no bar covers them
      seen.clear();
      r.chunks.forEach((c, ci) => {
        const n = seen.get(c.doc) ?? 0;
        seen.set(c.doc, n + 1);
        const rk = rank.get(ci);
        if (rk === undefined) return;
        const y = 4 + c.doc * rowH + 2 + (n % 2) * (laneH + 1);
        tag(ctx, P, String(rk + 1), x0 + c.start * sc + 9, y + laneH / 2, { bold: true, color: P.ink });
      });
    },
    [P, r, top.join(), span, maxLen],
    { height: 7 * 34 + 6 },
  );

  return (
    <Figure
      no={1}
      title="질문에서 프롬프트까지"
      hint="질문을 고르거나 직접 쓰고, 청크 크기를 바꿔 보세요"
      caption={
        <>
          이 장을 위해 지어낸 가상 회사의 사내 안내서 7개 문서(모두 2,273자)입니다. 문서마다 막대 하나이고, 그 위의 칸이 청크입니다. 겹치는 청크가 보이도록 두 줄에 번갈아 놓았습니다. 칸이 진할수록 질문과의 코사인 유사도가 높고, 굵은 테두리와 번호가 프롬프트에 들어가는 상위 k개입니다. 노란 줄은 답이 적힌 자리입니다. 임베딩은 글자 두 개씩 묶은 조각의 TF-IDF를 512차원에 해시한 것으로, 의미가 아니라 겉으로 겹치는 글자를 봅니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="sv-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`청크 ${r.chunks.length}개 중 상위 ${k}개: ${top.map((c) => HANDBOOK[r.chunks[c].doc].title).join(', ')}`}>
            <canvas ref={canvasRef} />
          </div>
          <p className="sv-sub">검색 결과 (상위 {k}개)</p>
          <ol className="sv-hits" aria-live="polite">
            {top.map((ci, n) => (
              <li key={ci} className="sv-hit">
                <span className="rk">{n + 1}</span>
                <span className="meta">
                  <span>{HANDBOOK[r.chunks[ci].doc].title}</span>
                  <span className="mono">유사도 {r.scores[ci].toFixed(3)}</span>
                </span>
                <span className="txt">
                  <ChunkText text={r.chunks[ci].text} start={r.chunks[ci].start} span={span && span.doc === r.chunks[ci].doc ? span : null} />
                </span>
              </li>
            ))}
            {res && res.rank >= k && (
              <li className="sv-hit" data-out="">
                <span className="rk">{res.rank + 1}</span>
                <span className="meta">
                  <span>답이 든 청크 (k 밖이라 빠짐)</span>
                  <span className="mono">유사도 {r.scores[r.order[res.rank]].toFixed(3)}</span>
                </span>
                <span className="txt">
                  <ChunkText text={r.chunks[r.order[res.rank]].text} start={r.chunks[r.order[res.rank]].start} span={span} />
                </span>
              </li>
            )}
          </ol>
          <p className="sv-sub">모델에 보낼 프롬프트</p>
          <pre className="sv-prompt">{prompt}</pre>
        </div>
        <div className="controls">
          <Seg label="질문 예시" value={preset} onChange={(i) => i >= 0 && setQ(QUESTIONS[i].q)} options={PRESETS.map((p) => ({ value: p.i, label: p.label }))} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="rag-q">
              <span>질문 (직접 써도 됩니다)</span>
            </label>
            <input id="rag-q" className="text-input" type="text" value={q} maxLength={60} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </div>
          <Slider id="rag-size" label="청크 크기 (글자)" value={size} min={20} max={400} step={10} onChange={setSize} />
          <div className="btn-row" role="group" aria-label="청크 크기 바로 고르기">
            {[40, 120, 400].map((s) => (
              <Button key={s} small onClick={() => setSize(s)}>
                {s}자
              </Button>
            ))}
          </div>
          <Slider id="rag-ov" label="겹침 (글자)" value={overlap} min={0} max={Math.floor(size / 2)} step={5} onChange={setOv} />
          <Slider id="rag-k" label="가져올 청크 수 k" value={k} min={1} max={6} step={1} onChange={setK} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="청크 수" value={`${r.chunks.length}개`} />
            <Readout label="답이 든 청크" value={!res ? '—' : res.rank >= 0 ? `${res.rank + 1}위` : '없음 (잘림)'} color={!res ? undefined : res.rank >= 0 && res.rank < k ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="프롬프트 길이" value={`${prompt.length.toLocaleString('ko-KR')}자`} />
            <Readout label="답이 프롬프트에" value={!res ? '—' : res.rank >= 0 && res.rank < k ? '온전히 ✓' : '없음 ✗'} color={!res ? undefined : res.rank >= 0 && res.rank < k ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '청크 (진할수록 유사도 높음)', shape: 'sq' },
          { color: 'var(--ink)', label: '프롬프트에 넣는 상위 k개', shape: 'sq' },
          { color: 'var(--hl)', label: '답이 적힌 자리', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: measuring retrieval ─────────────── */

function QualityFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'k' | 'budget'>('k');
  const [k, setK] = useState(3);
  const [budget, setBudget] = useState(400);
  const [ovf, setOvf] = useState(0.2);
  const [size, setSize] = useState(120);
  const curve = useMemo(() => {
    const take: Take = mode === 'k' ? { k } : { budget };
    return EVAL_SIZES.map((s) => evalAt(s, ovf, take));
  }, [mode, k, budget, ovf]);
  const cur = curve.find((c) => c.size === size) ?? curve[0];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 600, yMin: 0, yMax: 1, pad: { l: 40, r: 12, t: 14, b: 42 } });
      pl.grid({ xStep: 100, yStep: 0.25, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= 600; x += 100) ctx.fillText(String(x), pl.X(x), pl.pad.t + pl.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = 0; v <= 1; v += 0.25) ctx.fillText(`${Math.round(v * 100)}%`, pl.pad.l - 5, pl.Y(v));
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('청크 크기 (글자)', pl.pad.l + pl.pw, h - 2);
      pl.line(size, 0, size, 1, P.lineStrong, 1.5, [4, 4]);
      const series: [keyof typeof cur, string][] = [
        ['recall', P.accent],
        ['precision', P.pos],
      ];
      for (const [key, color] of series) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        curve.forEach((c, i) => (i ? ctx.lineTo(pl.X(c.size), pl.Y(c[key] as number)) : ctx.moveTo(pl.X(c.size), pl.Y(c[key] as number))));
        ctx.stroke();
        for (const c of curve) pl.dot(c.size, c[key] as number, c.size === size ? 4.5 : 2.2, color, c.size === size ? P.surface : undefined, 1.5);
      }
    },
    [P, curve, size],
    { aspect: 1.9, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={2}
      title="검색 품질 재기"
      hint="청크 크기, 가져오는 양, 겹침을 바꿔 보세요"
      caption={
        <>
          답이 적힌 자리를 미리 표시해 둔 질문 11개로 그림 1의 검색을 채점합니다. 재현율은 답 전체가 한 청크 안에 온전히 담겨 프롬프트에 들어간 질문의 비율, 정밀도는 프롬프트에 넣은 자료 가운데 답 글자가 차지하는 비율(질문 평균)입니다. 점선은 아래 표가 보여 주는 청크 크기입니다. 질문이 11개뿐이라 곡선이 들쭉날쭉합니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="sv-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`청크 ${size}자에서 재현율 ${Math.round(cur.recall * 100)}%, 정밀도 ${Math.round(cur.precision * 100)}%`}>
            <canvas ref={canvasRef} />
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '재현율: 답이 온전히 들어간 질문 비율', shape: 'ln' },
              { color: 'var(--pos)', label: '정밀도: 넣은 자료 중 답의 비율', shape: 'ln' },
            ]}
          />
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl sv-qtbl">
              <thead>
                <tr>
                  <th>질문 (청크 {size}자)</th>
                  <th>답이 든 청크</th>
                  <th>들어감</th>
                </tr>
              </thead>
              <tbody>
                {QUESTIONS.map((qa, i) => (
                  <tr key={i} data-para={qa.paraphrase || undefined}>
                    <td>{qa.q}</td>
                    <td className="num">{cur.ranks[i] >= 0 ? `${cur.ranks[i] + 1}위` : '잘림'}</td>
                    <td className={cur.hits[i] ? 'ok' : 'miss'}>{cur.hits[i] ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="controls">
          <Seg
            label="프롬프트에 넣는 양"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'k', label: '청크 k개' },
              { value: 'budget', label: '글자 예산' },
            ]}
          />
          {mode === 'k' ? <Slider id="rq-k" label="k" value={k} min={1} max={6} step={1} onChange={setK} /> : <Slider id="rq-b" label="글자 예산 (최소 청크 1개)" value={budget} min={200} max={800} step={50} onChange={setBudget} format={(v) => `${v}자`} />}
          <Seg
            label="겹침"
            value={ovf}
            onChange={setOvf}
            options={[
              { value: 0, label: '없음' },
              { value: 0.2, label: '20%' },
              { value: 0.5, label: '50%' },
            ]}
          />
          <Slider id="rq-size" label="표에서 볼 청크 크기" value={size} min={20} max={580} step={20} onChange={setSize} format={(v) => `${v}자`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="재현율" value={`${Math.round(cur.recall * 100)}%`} color="var(--accent)" />
            <Readout label="정밀도" value={`${(cur.precision * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="넣은 청크 (평균)" value={`${cur.taken.toFixed(1)}개`} />
            <Readout label="넣은 자료 (평균)" value={`${Math.round(cur.contextChars)}자`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: approximate nearest neighbours ─────────────── */

const ANN_N = 20000;
const ANN_D = 32;
const ANN_Q = 100;
const NLISTS = [16, 64, 256];
const PT_N = 2400;
const PHASE_SHARE: Record<JobProgress['phase'], [number, number]> = { kmeans: [0, 0.7], assign: [0.7, 0.85], eval: [0.85, 1] };

function AnnFigure() {
  const P = usePalette();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [nlist, setNlist] = useState(64);
  const [pv, setPv] = useState(2);
  const nprobe = Math.min(nlist, 2 ** pv);
  const maxPv = Math.log2(nlist);

  // 20,000 × 32 vectors and an IVF index per nlist, built a few milliseconds per frame
  const data = useRef<{ base: Vectors; queries: Vectors } | null>(null);
  const jobs = useRef<Record<number, ReturnType<typeof ivfJob>>>({});
  const [curves, setCurves] = useState<Record<number, IvfCurve>>({});
  const [prog, setProg] = useState(0);
  const building = !curves[nlist];
  useAnimationFrame(() => {
    if (!data.current) data.current = makeClustered(ANN_N, ANN_D, ANN_Q, 5);
    if (!jobs.current[nlist]) jobs.current[nlist] = ivfJob(data.current.base, data.current.queries, nlist, 3);
    const g = jobs.current[nlist];
    const t0 = performance.now();
    let last: JobProgress | null = null;
    while (performance.now() - t0 < 7) {
      const s = g.next();
      if (s.done) {
        const curve = s.value.curve;
        setCurves((c) => ({ ...c, [nlist]: curve }));
        delete jobs.current[nlist];
        return;
      }
      last = s.value;
    }
    if (last) {
      const [a, b] = PHASE_SHARE[last.phase];
      setProg(a + (b - a) * (last.done / last.total));
    }
  }, building && inView);

  // the 2-D picture: same algorithm on points we can draw
  const pts = useMemo(() => makeClustered(PT_N, 2, 0, 21, 14, 1, 0.3).base, []);
  const km = useMemo(() => kmeans2d(pts.x, PT_N, nlist, 4), [pts, nlist]);
  const lists = useMemo(() => {
    const L: number[] = new Array(nlist).fill(0);
    km.assign.forEach((c) => L[c]++);
    return L;
  }, [km, nlist]);
  const [qp, setQp] = useState<[number, number]>([0.35, -0.2]);
  const view = useMemo(() => {
    const q = new Float32Array(qp);
    const cd = Array.from({ length: nlist }, (_, c) => dist2(q, 0, km.cents, c, 2));
    const order = Array.from({ length: nlist }, (_, c) => c).sort((a, b) => cd[a] - cd[b]);
    const probed = new Set(order.slice(0, nprobe));
    const ds = Array.from({ length: PT_N }, (_, i) => dist2(q, 0, pts.x, i, 2));
    const nn = smallestK(ds, 10);
    const found = nn.filter((i) => probed.has(km.assign[i]));
    const comps = nlist + order.slice(0, nprobe).reduce((s, c) => s + lists[c], 0);
    return { probed, nn, found: new Set(found), comps };
  }, [qp, km, nlist, nprobe, pts, lists]);

  const bounds = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < PT_N; i++) {
      x0 = Math.min(x0, pts.x[2 * i]);
      x1 = Math.max(x1, pts.x[2 * i]);
      y0 = Math.min(y0, pts.x[2 * i + 1]);
      y1 = Math.max(y1, pts.x[2 * i + 1]);
    }
    return { x0, x1, y0, y1 };
  }, [pts]);
  const plotRef = useRef<Plot | null>(null);
  const cellCache = useRef<{ key: string; owner: Int16Array; cols: number; rows: number } | null>(null);

  const pic = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: bounds.x0 - 0.1, xMax: bounds.x1 + 0.1, yMin: bounds.y0 - 0.1, yMax: bounds.y1 + 0.1, pad: { l: 6, r: 6, t: 6, b: 6 }, equal: true });
      plotRef.current = pl;
      const B = 4;
      const cols = Math.ceil(w / B);
      const rows = Math.ceil(h / B);
      const key = `${nlist}|${w}|${h}`;
      if (!cellCache.current || cellCache.current.key !== key) {
        const owner = new Int16Array(cols * rows);
        const p = new Float32Array(2);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            p[0] = pl.invX((c + 0.5) * B);
            p[1] = pl.invY((r + 0.5) * B);
            let best = 0;
            let bd = Infinity;
            for (let k = 0; k < nlist; k++) {
              const d = dist2(p, 0, km.cents, k, 2);
              if (d < bd) {
                bd = d;
                best = k;
              }
            }
            owner[r * cols + c] = best;
          }
        cellCache.current = { key, owner, cols, rows };
      }
      const { owner } = cellCache.current;
      ctx.fillStyle = alpha(P.accent, P.dark ? 0.3 : 0.16);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (view.probed.has(owner[r * cols + c])) ctx.fillRect(c * B, r * B, B, B);
      ctx.fillStyle = P.lineStrong;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const o = owner[r * cols + c];
          if ((c + 1 < cols && owner[r * cols + c + 1] !== o) || (r + 1 < rows && owner[(r + 1) * cols + c] !== o)) ctx.fillRect(c * B + B - 1, r * B + B - 1, 1.5, 1.5);
        }
      for (let i = 0; i < PT_N; i++) {
        const inP = view.probed.has(km.assign[i]);
        ctx.fillStyle = inP ? P.ink2 : alpha(P.ink3, 0.45);
        ctx.fillRect(pl.X(pts.x[2 * i]) - 1.2, pl.Y(pts.x[2 * i + 1]) - 1.2, 2.4, 2.4);
      }
      for (const i of view.nn) {
        const x = pl.X(pts.x[2 * i]);
        const y = pl.Y(pts.x[2 * i + 1]);
        const ok = view.found.has(i);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        if (ok) {
          ctx.fillStyle = P.good;
          ctx.fill();
        }
        ctx.strokeStyle = ok ? P.good : P.bad;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const qx = pl.X(qp[0]);
      const qy = pl.Y(qp[1]);
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(qx - 9, qy);
      ctx.lineTo(qx + 9, qy);
      ctx.moveTo(qx, qy - 9);
      ctx.lineTo(qx, qy + 9);
      ctx.stroke();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      tag(ctx, P, `찾은 이웃 ${view.found.size}/10 · 거리 계산 ${view.comps.toLocaleString('ko-KR')}번`, 8, 14, { align: 'left', color: P.ink });
    },
    [P, view, km, nlist, pts, bounds, qp],
    { aspect: 1.45, maxHeight: 380, minHeight: 230 },
  );

  useDrag(pic.wrapRef, {
    hit: (x, y) => {
      const pl = plotRef.current;
      return pl && Math.hypot(pl.X(qp[0]) - x, pl.Y(qp[1]) - y) < 22 ? 'q' : null;
    },
    onDrag: (_, x, y) => {
      const pl = plotRef.current;
      if (pl) setQp([pl.invX(x), pl.invY(y)]);
    },
    onEmpty: (x, y) => {
      const pl = plotRef.current;
      if (pl) setQp([pl.invX(x), pl.invY(y)]);
    },
  });

  const curve = curves[nlist];
  const LX0 = 2;
  const LX1 = Math.log10(30000);
  const chart = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: LX0, xMax: LX1, yMin: 0, yMax: 1, pad: { l: 40, r: 12, t: 14, b: 42 } });
      pl.grid({ xStep: 1, yStep: 0.25, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let e = 2; e <= 4; e++) ctx.fillText(e === 2 ? '100' : e === 3 ? '1,000' : '10,000', pl.X(e), pl.pad.t + pl.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = 0; v <= 1; v += 0.25) ctx.fillText(`${Math.round(v * 100)}%`, pl.pad.l - 5, pl.Y(v));
      const xb = Math.log10(ANN_N);
      pl.line(xb, 0, xb, 1, P.lineStrong, 1.5, [4, 4]);
      tag(ctx, P, '전수 검색', pl.X(xb), pl.Y(0.08), { align: 'right' });
      for (const nl of NLISTS) {
        const c = curves[nl];
        if (!c) continue;
        const on = nl === nlist;
        ctx.strokeStyle = on ? P.accent : alpha(P.ink3, 0.7);
        ctx.lineWidth = on ? 2.4 : 1.4;
        ctx.beginPath();
        c.comps.forEach((v, i) => (i ? ctx.lineTo(pl.X(Math.log10(v)), pl.Y(c.recall[i])) : ctx.moveTo(pl.X(Math.log10(v)), pl.Y(c.recall[i]))));
        ctx.stroke();
        for (let e = 0; 2 ** e <= nl; e++) pl.dot(Math.log10(c.comps[2 ** e - 1]), c.recall[2 ** e - 1], on ? 3 : 2, on ? P.accent : P.ink3);
        if (!on) {
          // left of the first point when it lies left of the highlighted curve, otherwise to its right
          const left = !curve || c.comps[0] < curve.comps[0];
          tag(ctx, P, `목록 ${nl}`, pl.X(Math.log10(c.comps[0])) + (left ? -8 : 8), pl.Y(c.recall[0]) + (left ? 0 : 4), { color: P.ink3, align: left ? 'right' : 'left' });
        }
      }
      if (curve) {
        const x = Math.log10(curve.comps[nprobe - 1]);
        const y = curve.recall[nprobe - 1];
        pl.dot(x, y, 6, P.surface, P.accent, 2.5);
        tag(ctx, P, `nprobe ${nprobe}`, pl.X(x), pl.Y(y) - 14, { color: P.ink, bold: true });
      } else {
        tag(ctx, P, `색인 만드는 중… ${Math.round(prog * 100)}%`, pl.X((LX0 + LX1) / 2), pl.Y(0.5), { color: P.ink, bold: true });
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('재현율@10', pl.pad.l + 6, pl.pad.t + 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('질의당 거리 계산 (로그 눈금)', pl.pad.l + pl.pw, h - 2);
    },
    [P, curves, nlist, nprobe, prog],
    { aspect: 1.9, maxHeight: 280, minHeight: 200 },
  );

  const randomQuery = () => {
    const i = Math.floor(Math.random() * PT_N);
    setQp([pts.x[2 * i] + 0.08, pts.x[2 * i + 1] - 0.05]);
  };

  return (
    <Figure
      no={3}
      title="근사 최근접 이웃: IVF"
      hint="질의(십자)를 끌거나 눌러 옮기고, nprobe를 바꿔 보세요"
      caption={
        <>
          첫 번째 그림은 점 2,400개를 k-평균으로 목록 여러 개로 나눈 모습입니다. 선은 목록 경계, 칠한 칸은 질의에서 중심이 가까운 순서로 nprobe개 골라 뒤지는 목록입니다. 진짜 가장 가까운 10개 가운데 초록은 찾은 것, 빨간 고리는 뒤지지 않은 목록에 있어 놓친 것입니다. 두 번째 그림은 같은 방법을 32차원 벡터 20,000개에 적용해 질의 100개로 잰 결과입니다. 점은 nprobe = 1, 2, 4, …이고, 거리 계산 수에는 중심과의 거리도 들어 있습니다. 재현율은 전수 검색으로 구한 진짜 이웃 10개 중 찾은 비율입니다.
        </>
      }
    >
      <div ref={figRef} className="fig-split">
        <div className="sv-col">
          <div ref={pic.wrapRef} className="canvas-box" role="img" aria-label={`2차원 예시: 목록 ${nlist}개 중 ${nprobe}개를 뒤져 가장 가까운 10개 중 ${view.found.size}개를 찾음`}>
            <canvas ref={pic.canvasRef} />
          </div>
          <div ref={chart.wrapRef} className="canvas-box" role="img" aria-label={curve ? `32차원 20,000개: nprobe ${nprobe}에서 재현율 ${Math.round(curve.recall[nprobe - 1] * 100)}%, 거리 계산 ${Math.round(curve.comps[nprobe - 1])}번` : '색인을 만드는 중'}>
            <canvas ref={chart.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg
            label="목록 수 (k-평균의 k)"
            value={nlist}
            onChange={(v) => {
              setNlist(v);
              setPv((x) => Math.min(x, Math.log2(v)));
            }}
            options={NLISTS.map((n) => ({ value: n, label: String(n) }))}
          />
          <Slider id="ann-probe" label="뒤질 목록 수 nprobe" value={pv} min={0} max={maxPv} step={1} onChange={setPv} format={(v) => String(Math.min(nlist, 2 ** v))} />
          <div className="btn-row">
            <Button small onClick={randomQuery}>
              질의 옮기기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }} aria-live="polite">
            <Readout label="재현율@10 (32차원)" value={curve ? `${(curve.recall[nprobe - 1] * 100).toFixed(1)}%` : '—'} color="var(--accent)" />
            <Readout label="질의당 거리 계산" value={curve ? Math.round(curve.comps[nprobe - 1]).toLocaleString('ko-KR') : '—'} />
            <Readout label="전수 검색보다" value={curve ? `${(ANN_N / curve.comps[nprobe - 1]).toFixed(1)}배 적음` : '—'} />
            <Readout label="색인" value={curve ? '완성' : `${Math.round(prog * 100)}%`} color={curve ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '찾은 진짜 이웃', shape: 'dot' },
          { color: 'var(--bad)', label: '놓친 진짜 이웃', shape: 'dot' },
          { color: 'color-mix(in srgb, var(--accent) 30%, transparent)', label: '뒤지는 목록', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Rag() {
  return (
    <>
      <h2>모델이 모르는 것을 묻는다면</h2>
      <p>
        언어 모델이 아는 것은 사전 학습 데이터에 있던 것뿐입니다(<a href="#ai-basics/language-model">언어 모델</a>). 그래서 세 가지 질문에 약합니다. 학습 데이터를 모은 시점 이후의 일, 우리 회사 사내 규정처럼 공개되지 않은 문서, 그리고 데이터에 드물게 나와 흐릿하게만 기억하는 사실입니다. 이런 질문에도 모델은 그럴듯한 다음 토큰을 이어 가므로, 모르는 것을 모른다고 하는 대신 지어낸 답, 곧 <T en="hallucination">환각</T>을 내놓기 쉽습니다.
      </p>
      <p>
        새 지식을 넣는 방법은 둘입니다. 문서로 모델을 더 학습시키거나(<a href="#ai-llm/lora">파인튜닝</a>), 질문할 때마다 관련 문서를 찾아 프롬프트에 함께 넣어 주는 것입니다. 뒤의 방법이 <T en="retrieval-augmented generation">검색 증강 생성</T>, 줄여서 <T en="RAG">RAG</T>입니다. 이름은 Lewis 등(2020)의 논문에서 왔고, 지금은 "찾아서 넣고 생성한다"는 방식 전체를 넓게 부르는 말로 씁니다. 문서가 바뀌면 다시 학습할 필요 없이 색인만 고치면 되고, 답에 근거로 쓴 문서를 함께 보여 줄 수 있다는 것이 큰 장점입니다.
      </p>
      <p>RAG 시스템은 두 단계로 움직입니다.</p>
      <ul>
        <li>
          <strong>미리 해 두는 일 (색인)</strong>: 문서를 적당한 길이의 <T en="chunk">청크</T>로 자르고, 청크마다 임베딩 벡터를 계산해 저장합니다.
        </li>
        <li>
          <strong>질문이 올 때마다 (검색과 생성)</strong>: 질문도 같은 방법으로 벡터로 바꾸고, 가장 가까운 청크 k개를 찾아 "아래 자료만 근거로 답하라"는 지시와 함께 프롬프트에 붙여 모델에 보냅니다.
        </li>
      </ul>

      <h2>청크로 자르고, 벡터로 바꾸고, 가장 가까운 것을 찾는다</h2>
      <p>
        그림 1은 이 과정을 브라우저 안에서 그대로 돌립니다. 다만 임베딩은 진짜가 아닙니다. 실제 시스템은 문장을 넣으면 의미가 비슷할수록 가까운 벡터를 내도록 학습한 신경망 <a href="#ai-basics/embeddings">임베딩</a> 모델을 씁니다. 여기서는 그런 모델 없이 정직하게 계산할 수 있는 방법을 썼습니다. 어절마다 글자 두 개씩 묶은 조각(바이그램)을 세고, 흔한 조각일수록 가중치를 낮추는 <T en="TF-IDF">TF-IDF</T>를 매긴 뒤, 조각을 해시해서 512차원 벡터의 칸에 더하고 길이를 1로 맞춥니다. 길이가 1이므로 코사인 유사도는 그냥 내적입니다.
      </p>
      <PipelineFigure />
      <p>
        "연차" 질문은 청크 120자에서 답이 든 청크를 1위로 찾습니다. "영수증"을 고르고 청크 크기를 <strong>40자</strong>로 줄여 보세요. 답은 32자인데 40자짜리 청크는 어절 경계에서 자르다 보니 답 전체를 담은 청크가 하나도 없고, 상위 3개에 들어간 것은 답 32자 중 8자뿐입니다. 쪼개진 조각만 받은 모델은 "14일 안에"라는 핵심을 볼 수 없습니다. 반대로 <strong>400자</strong>로 키우면 문서 하나가 통째로 청크 하나가 되어 답은 확실히 들어가지만, 30자 안팎의 답을 전하려고 프롬프트가 1,000자를 넘고 그 대부분은 질문과 상관없는 내용입니다. 비용이 늘 뿐 아니라, 긴 자료 속에 묻힌 한 줄을 모델이 놓치기도 쉬워집니다.
      </p>
      <p>
        <strong>겹침</strong>은 쪼개짐을 덜어 줍니다. 이웃한 청크가 경계 근처의 글을 함께 가지므로, 한 청크의 끝에서 잘린 문장이 다음 청크에는 온전히 들어 있을 가능성이 커집니다. 대신 같은 글이 두 번 저장되어 색인이 커집니다.
      </p>
      <Code label="겹침이 있는 청크 나누기 (어절 경계에서 자름)">{`
function chunkText(text, size, overlap) {
  const words = [...text.matchAll(/\\S+/g)]
    .map((m) => [m.index, m.index + m[0].length]); // 어절마다 [시작, 끝]
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    let j = i; // size 글자를 넘지 않을 때까지 어절을 붙인다
    while (j + 1 < words.length && words[j + 1][1] - words[i][0] <= size) j++;
    chunks.push(text.slice(words[i][0], words[j][1]));
    if (j === words.length - 1) break;
    // 다음 청크는 끝에서 overlap 글자 안쪽의 어절부터 다시 시작
    let k = j + 1;
    while (k - 1 > i && words[j][1] - words[k - 1][0] <= overlap) k--;
    i = k;
  }
  return chunks;
}`}</Code>
      <p>
        "노트북" 질문은 다른 식으로 실패합니다. 청크 120자에서 답이 든 청크는 8위이고, 1위는 휴가 문서입니다. 질문의 "몇 년마다"가 휴가 문서의 "2년마다"와 글자 조각("년마", "마다")을 나눠 갖기 때문입니다. 이제 "바꿔 말하기"를 눌러 보세요. "집에서 일하는 날은 일주일에 몇 번까지 돼요?"는 재택근무 문서의 "주 2일까지"를 묻지만, 문서에는 "집"도 "일주일"도 없고 "재택근무"라는 말을 씁니다. 겉글자만 보는 우리 임베딩은 엉뚱한 청크를 고르고, 정답 청크는 한참 아래로 밀립니다. 신경망 임베딩 모델은 바로 이런 경우를 잡으라고 학습합니다. "집에서 일하다"와 "재택근무"가 비슷한 문맥에 나온다는 것을 많은 데이터에서 배웠기 때문입니다. 반대로 제품 코드나 사람 이름처럼 글자가 정확히 맞아야 하는 검색은 겉글자를 보는 방법이 더 믿을 만합니다. 그래서 실무에서는 두 가지를 섞습니다(아래 하이브리드 검색).
      </p>
      <Code label="코사인 유사도로 상위 k개 고르기">{`
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}

function topK(queryVec, chunkVecs, k) {
  return chunkVecs
    .map((v, i) => ({ i, score: cosine(queryVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k); // 청크가 많으면 정렬 대신 크기 k인 힙을 쓴다
}`}</Code>
      <Callout kind="note">
        모델에게 "자료에 답이 없으면 모른다고 답하라"고 지시해도 환각이 사라지지는 않습니다. 검색이 엉뚱한 청크를 가져오면 모델은 그 청크를 근거로 그럴듯한 오답을 만들 수 있습니다. RAG의 답 품질은 대부분 검색 품질에서 정해지므로, 검색을 따로 재는 일이 중요합니다.
      </Callout>

      <h2>검색 품질 재기</h2>
      <p>
        청크 크기, 겹침, k를 감으로 정하지 않으려면 채점할 질문 묶음이 필요합니다. 실제 사용자 질문 수십~수백 개를 모으고, 각 질문의 답이 문서 어디에 있는지 표시해 두면, 설정을 바꿀 때마다 검색만 돌려 점수를 낼 수 있습니다. 모델이 답을 생성하는 비싼 단계는 거치지 않아도 됩니다. 대표적인 두 점수는 이렇습니다.
      </p>
      <ul>
        <li>
          <T en="recall@k">재현율@k</T>: 상위 k개 안에 정답 자료가 들어 있는 질문의 비율. 들어 있지 않으면 모델이 아무리 좋아도 답할 수 없습니다.
        </li>
        <li>
          <T en="precision">정밀도</T>: 가져온 자료 가운데 실제로 쓸모 있는 부분의 비율. 낮을수록 프롬프트가 군더더기로 차고 비용이 늘어납니다.
        </li>
      </ul>
      <QualityFigure />
      <p>
        청크 k = 3개, 겹침 20%로 두면 청크 20자에서는 재현율이 0%입니다. 어절 경계에서 20자 안쪽으로 자르면 11개 질문 중 어느 답도 한 청크에 온전히 담기지 않기 때문입니다. 청크가 커질수록 재현율은 오르다가, 청크가 문서 하나만큼 커지는 360자부터 91%에서 멈춥니다. 놓친 하나는 앞에서 본 "노트북" 질문입니다. 그동안 정밀도는 청크 20~40자의 14~16%에서 2.6%까지 떨어집니다. 그런데 k를 고정하면 청크를 키울수록 프롬프트도 함께 커지므로 공정한 비교가 아닙니다.
      </p>
      <p>
        "글자 예산"을 골라 400자로 두면 비교가 공정해집니다. 프롬프트에 넣을 수 있는 분량이 정해져 있을 때(실제로는 문맥 창과 비용이 정합니다), 청크가 작으면 여러 개를 넣을 수 있지만 답이 쪼개지고, 청크가 크면 한두 개밖에 못 넣어서 첫 번째 청크가 틀리면 끝입니다. 이 설정에서 재현율은 청크 20자에서 0%, 40자에서 36%로 낮다가 60~300자에서는 64~82%를 오가고, 320자 이상에서는 55~64%로 내려앉습니다. 너무 작아도, 너무 커도 손해이고 그 사이 어딘가가 낫다는 것, 그리고 그 "어딘가"는 문서와 질문에 따라 다르므로 재 봐야 안다는 것이 요점입니다.
      </p>
      <Callout kind="intuition">
        청크 크기는 "답이 될 만한 단위"에 맞추는 것이 출발점입니다. 규정집이라면 조항 하나, FAQ라면 질문과 답 한 쌍, 코드라면 함수 하나입니다. 글자 수로 기계적으로 자르는 대신 제목, 문단, 문장 같은 구조를 따라 자르면 답이 쪼개지는 일이 줄어듭니다.
      </Callout>

      <h2>검색을 더 낫게: 재순위화와 하이브리드 검색</h2>
      <p>
        임베딩 검색은 질문과 청크를 <strong>따로</strong> 벡터로 만든 뒤 비교합니다. 청크 벡터를 미리 계산해 둘 수 있어 빠르지만, 질문의 세부 조건("해외" 출장의 "숙박비")과 청크 내용을 꼼꼼히 맞춰 보지는 못합니다. 그래서 흔히 두 단계로 나눕니다. 먼저 벡터 검색으로 후보를 넉넉히(예를 들어 50개) 뽑고, 질문과 후보 청크를 <strong>함께</strong> 읽고 관련도 점수를 내는 더 무거운 모델로 다시 줄을 세웁니다. 이것을 <T en="re-ranking">재순위화</T>라고 합니다. 무거운 모델을 후보 50개에만 돌리므로 감당할 만합니다.
      </p>
      <p>
        <T en="hybrid search">하이브리드 검색</T>은 단어가 정확히 겹치는지를 보는 키워드 검색(BM25 같은 전통적인 점수)과 의미를 보는 벡터 검색을 함께 돌려 두 순위를 합칩니다. 그림 1에서 보았듯이 벡터 검색은 바꿔 말한 질문에 강하고, 키워드 검색은 오류 코드, 제품명, 사람 이름처럼 글자 그대로 맞아야 하는 질문에 강합니다. 두 순위를 합치는 간단한 방법으로는 각 목록에서의 순위 r마다 <M>{'1/(60 + r)'}</M> 같은 점수를 주고 더하는 <T en="reciprocal rank fusion">RRF</T>가 많이 쓰입니다.
      </p>

      <h2>수백만 개에서 빠르게: 근사 최근접 이웃</h2>
      <p>
        그림 1의 청크는 많아야 백여 개라 모든 청크와 유사도를 계산해도 순식간입니다. 하지만 문서가 많아지면 청크는 수백만 개가 됩니다. 768차원 벡터 100만 개를 전부 훑으면 질문 하나에 곱셈만 7억 6,800만 번입니다. 초당 질문 수백 개를 받아야 하는 서비스라면 감당하기 어렵습니다.
      </p>
      <p>
        다행히 RAG에는 "정확히" 가장 가까운 k개가 꼭 필요하지 않습니다. 진짜 상위 10개 중 9개만 찾아도 답의 품질은 거의 같습니다. 그래서 조금 놓치는 대신 훨씬 적게 계산하는 <T en="approximate nearest neighbor">근사 최근접 이웃</T>(ANN) 검색을 씁니다. 가장 이해하기 쉬운 것이 <T en="inverted file index">IVF</T>입니다.
      </p>
      <ol>
        <li>
          색인할 때 벡터들을 <a href="#ai-basics/k-means">k-평균</a>으로 nlist개 무리로 나누고, 무리마다 속한 벡터의 목록을 만듭니다.
        </li>
        <li>질문이 오면 먼저 nlist개 중심과만 거리를 재서 가까운 순서로 줄 세웁니다.</li>
        <li>가장 가까운 nprobe개 목록만 열어 그 안의 벡터들과 거리를 재고 상위 k개를 고릅니다.</li>
      </ol>
      <p>
        <a href="#cs-algorithms/search-hash">해시 테이블</a>이 키를 버킷으로 보내 버킷 하나만 뒤지는 것과 닮았습니다. 차이는 질문과 가장 가까운 벡터가 꼭 같은 무리에 있지는 않다는 점입니다. 질문이 무리의 경계 근처에 있으면 진짜 이웃이 옆 무리에 있어서, 목록을 하나만 열면 놓칩니다.
      </p>
      <AnnFigure />
      <p>
        그림 3의 첫 번째 그림에서 질의를 무리의 경계 쪽으로 끌어 보세요. nprobe가 1이면 빨간 고리가 생기고, nprobe를 늘리면 옆 무리까지 열어 놓친 이웃이 초록으로 바뀝니다. 두 번째 그림의 32차원 데이터에서 목록 64개일 때 nprobe = 1이면 거리 계산이 전수 검색의 약 1/48인 대신 재현율이 42%에 그치고, nprobe = 8이면 약 1/7의 계산으로 84%, nprobe = 32면 약 60%의 계산으로 99%입니다. 이 손잡이 하나로 속도와 정확도를 맞바꾸는 것이 ANN 색인의 핵심입니다. 목록 수를 바꾸면 곡선 자체가 움직입니다. 목록을 256개로 늘리면 목록 하나가 작아져서, 약 1/6의 계산(nprobe = 32)으로 재현율 96%를 얻습니다. 대신 색인을 만드는 k-평균이 그만큼 무거워집니다(그림에서도 색인이 늦게 완성됩니다).
      </p>
      <Code label="IVF 검색">{`
// 색인: centroids[c]는 무리 c의 중심, lists[c]는 그 무리에 속한 벡터 번호들
function ivfSearch(query, centroids, lists, vectors, nprobe, k) {
  const order = centroids
    .map((c, i) => ({ i, d: dist2(query, c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, nprobe);                    // 가까운 무리 nprobe개만
  const cand = [];
  for (const { i } of order)
    for (const id of lists[i]) cand.push({ id, d: dist2(query, vectors[id]) });
  return cand.sort((a, b) => a.d - b.d).slice(0, k).map((c) => c.id);
}

function dist2(a, b) {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
  return s; // 길이 1로 맞춘 벡터라면 거리 순서와 코사인 순서가 같다
}`}</Code>
      <p>
        IVF 말고도 널리 쓰는 방법이 있습니다. <T en="HNSW">HNSW</T>(Malkov와 Yashunin)는 가까운 벡터끼리 이은 그래프를 여러 층으로 만들어 두고, 질의에서 출발해 더 가까운 이웃으로 계속 건너가는 탐욕적 탐색으로 근사 이웃을 찾습니다. 빠르고 재현율이 높지만 그래프를 저장하느라 메모리를 더 씁니다. 벡터 자체를 작은 코드로 압축하는 <T en="product quantization">곱 양자화</T>(Jégou 등, 2011)를 IVF와 함께 쓰면 메모리에 훨씬 많은 벡터를 담을 수 있습니다. 압축은 다음 장의 양자화와 같은 생각입니다.
      </p>
      <p>
        <T en="vector database">벡터 데이터베이스</T>는 이런 색인에 데이터베이스가 해야 할 일을 더한 것입니다. 벡터와 원문, 메타데이터(문서 종류, 날짜, 접근 권한)를 함께 저장하고, "인사 문서 중에서만" 같은 조건을 걸어 검색하고, 문서가 추가되고 지워질 때 색인을 고칩니다. 어떤 제품을 쓰든 안에서 도는 것은 이 장에서 본 청크, 임베딩, 근사 최근접 이웃입니다.
      </p>

      <Callout kind="key">
        RAG는 질문과 비슷한 청크를 찾아 프롬프트에 넣어 주는 것입니다. 답 품질은 검색 품질이 정하므로, 답의 위치를 표시한 질문 묶음으로 재현율과 정밀도를 재며 청크 크기, 겹침, k를 정합니다. 청크가 너무 작으면 답이 쪼개지고, 너무 크면 군더더기에 묻힙니다. 청크가 많아지면 IVF나 HNSW 같은 근사 최근접 이웃 색인이 계산을 크게 줄이고, nprobe 같은 손잡이로 속도와 재현율을 맞바꿉니다.
      </Callout>
      <Quiz
        q="사내 문서 RAG 챗봇이 '보안팀 연락처'를 물으면 엉뚱하게 '보안 교육 일정' 문서로 답한다. 평가해 보니 정답 청크가 상위 20위 안에는 늘 있지만 1~3위에는 드물다. 가장 먼저 시도할 만한 것은?"
        options={['k를 1로 줄여 군더더기를 없앤다', '상위 20개를 질문과 함께 읽는 재순위화 모델로 다시 줄 세운 뒤 상위 3개를 넣는다', 'IVF의 nprobe를 늘린다', '언어 모델을 더 큰 것으로 바꾼다']}
        answer={1}
        explain={
          <>
            정답 청크가 후보 20개 안에는 들어 있으므로, 문제는 찾기가 아니라 줄 세우기입니다. 질문과 청크를 함께 읽는 재순위화 모델은 "연락처"라는 세부 조건까지 맞춰 보므로 정답을 위로 끌어올리기 좋습니다. k를 줄이면 정답이 더 자주 빠지고, nprobe는 근사 검색이 진짜 이웃을 놓칠 때의 처방이며, 더 큰 언어 모델도 프롬프트에 정답 청크가 없으면 소용없습니다.
          </>
        }
      />
    </>
  );
}

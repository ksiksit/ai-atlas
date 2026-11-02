import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView, prefersReducedMotion } from '../lib/canvas';
import { fmt } from '../lib/plot';
import { usePalette, lerpColor, rgbStr, alpha, type Palette } from '../lib/theme';

const N = 20; // input size
const K = 3; // kernel size
const O = N - K + 1; // output size (valid convolution) = 18
const PO = Math.floor(O / 2); // pooled size = 9

/* ─────────────── data ─────────────── */

type Grid = number[];

function blank(): Grid {
  return new Array(N * N).fill(0);
}

function stamp(g: Grid, r: number, c: number, v = 1) {
  if (r >= 0 && r < N && c >= 0 && c < N) g[r * N + c] = Math.max(g[r * N + c], v);
}

function line(g: Grid, r0: number, c0: number, r1: number, c1: number, thick = 2) {
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)) * 3 + 1;
  for (let i = 0; i <= steps; i++) {
    const r = Math.round(r0 + ((r1 - r0) * i) / steps);
    const c = Math.round(c0 + ((c1 - c0) * i) / steps);
    for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) stamp(g, r + a, c + b);
  }
}

const PRESETS: Record<string, () => Grid> = {
  seven: () => {
    const g = blank();
    line(g, 3, 4, 3, 15);
    line(g, 4, 15, 16, 8);
    line(g, 9, 8, 9, 14, 1);
    return g;
  },
  square: () => {
    const g = blank();
    for (let r = 5; r < 15; r++) for (let c = 5; c < 15; c++) g[r * N + c] = 1;
    return g;
  },
  circle: () => {
    const g = blank();
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const d = Math.hypot(r - 9.5, c - 9.5);
        if (d > 4.6 && d < 7.4) g[r * N + c] = 1;
      }
    return g;
  },
  cross: () => {
    const g = blank();
    line(g, 3, 3, 15, 15);
    line(g, 3, 15, 15, 3);
    return g;
  },
};

type KernelName = 'vertical' | 'horizontal' | 'blur' | 'sharpen' | 'custom';
const KERNELS: Record<Exclude<KernelName, 'custom'>, number[]> = {
  vertical: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  horizontal: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  blur: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9],
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
};
const KERNEL_LABEL: Record<KernelName, string> = {
  vertical: '세로 경계',
  horizontal: '가로 경계',
  blur: '흐림',
  sharpen: '선명하게',
  custom: '직접 만들기',
};
const KERNEL_NOTE: Record<KernelName, string> = {
  vertical: '왼쪽이 어둡고 오른쪽이 밝은 곳에서 양수, 반대면 음수가 됩니다. 세로로 뻗은 경계선을 찾는 필터입니다.',
  horizontal: '위가 어둡고 아래가 밝은 곳에서 양수가 됩니다. 가로로 누운 경계선을 찾습니다.',
  blur: '주변 9칸의 평균을 냅니다. 날카로운 경계가 부드럽게 퍼집니다.',
  sharpen: '가운데를 강조하고 주변을 빼서 경계를 더 또렷하게 만듭니다.',
  custom: '숫자를 직접 바꿔 보세요. 신경망은 이 9개의 숫자를 사람이 정하지 않고 데이터로부터 학습합니다.',
};

function convolve(input: Grid, k: number[]): number[] {
  const out = new Array(O * O).fill(0);
  for (let i = 0; i < O; i++)
    for (let j = 0; j < O; j++) {
      let s = 0;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) s += input[(i + a) * N + (j + b)] * k[a * K + b];
      out[i * O + j] = s;
    }
  return out;
}

function maxPool(m: number[]): { out: number[]; arg: number[] } {
  const out = new Array(PO * PO).fill(0);
  const arg = new Array(PO * PO).fill(0);
  for (let i = 0; i < PO; i++)
    for (let j = 0; j < PO; j++) {
      let best = -Infinity;
      let bi = 0;
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++) {
          const idx = (2 * i + a) * O + (2 * j + b);
          if (m[idx] > best) {
            best = m[idx];
            bi = idx;
          }
        }
      out[i * PO + j] = best;
      arg[i * PO + j] = bi;
    }
  return { out, arg };
}

/* ─────────────── grid canvas ─────────────── */

interface Rect {
  r: number;
  c: number;
  h: number;
  w: number;
  color: string;
}

function divergingColor(P: Palette, v: number, scale: number): string {
  const t = Math.max(-1, Math.min(1, v / (scale || 1)));
  if (t >= 0) return rgbStr(lerpColor(P.surface2, P.pos, Math.pow(t, 0.75)));
  return rgbStr(lerpColor(P.surface2, P.neg, Math.pow(-t, 0.75)));
}

function GridCanvas({
  rows,
  cols,
  color,
  rects = [],
  label,
  deps,
  onCell,
  onEnd,
  maxHeight = 340,
  ariaLabel,
}: {
  rows: number;
  cols: number;
  color: (r: number, c: number) => string;
  rects?: Rect[];
  label?: (r: number, c: number) => string | null;
  deps: unknown[];
  onCell?: (r: number, c: number, down: boolean) => void;
  onEnd?: () => void;
  maxHeight?: number;
  ariaLabel: string;
}) {
  const P = usePalette();
  const geo = useRef({ x0: 0, y0: 0, cs: 10 });
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cs = Math.floor(Math.min(w / cols, h / rows) * 100) / 100;
      const x0 = (w - cs * cols) / 2;
      const y0 = (h - cs * rows) / 2;
      geo.current = { x0, y0, cs };
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = color(r, c);
          ctx.fillRect(x0 + c * cs, y0 + r * cs, cs + 0.5, cs + 0.5);
        }
      // grid lines
      ctx.strokeStyle = alpha(P.ink, P.dark ? 0.08 : 0.07);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) {
        ctx.moveTo(x0, Math.round(y0 + r * cs) + 0.5);
        ctx.lineTo(x0 + cols * cs, Math.round(y0 + r * cs) + 0.5);
      }
      for (let c = 0; c <= cols; c++) {
        ctx.moveTo(Math.round(x0 + c * cs) + 0.5, y0);
        ctx.lineTo(Math.round(x0 + c * cs) + 0.5, y0 + rows * cs);
      }
      ctx.stroke();
      if (label && cs >= 13) {
        ctx.font = `600 ${Math.min(11, Math.floor(cs * 0.48))}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const s = label(r, c);
            if (s === null) continue;
            const x = x0 + (c + 0.5) * cs;
            const y = y0 + (r + 0.5) * cs;
            ctx.lineWidth = 3;
            ctx.strokeStyle = alpha(P.surface, 0.9);
            ctx.strokeText(s, x, y);
            ctx.fillStyle = P.ink;
            ctx.fillText(s, x, y);
          }
      }
      for (const rc of rects) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = rc.color;
        ctx.strokeRect(x0 + rc.c * cs + 1, y0 + rc.r * cs + 1, rc.w * cs - 2, rc.h * cs - 2);
      }
    },
    [P, rows, cols, rects, ...deps],
    { aspect: 1, maxHeight, minHeight: 200 },
  );

  const toCell = (x: number, y: number): [number, number] | null => {
    const { x0, y0, cs } = geo.current;
    const c = Math.floor((x - x0) / cs);
    const r = Math.floor((y - y0) / cs);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return [r, c];
  };

  useDrag(canvasRef, {
    hit: (x, y) => (onCell && toCell(x, y) ? 'g' : null),
    onDrag: (_id, x, y) => {
      const rc = toCell(x, y);
      if (rc) onCell?.(rc[0], rc[1], true);
    },
    onHover: (id, x, y) => {
      if (id === null) return;
      const rc = toCell(x, y);
      if (rc) onCell?.(rc[0], rc[1], false);
    },
    onEnd: () => onEnd?.(),
  });

  return (
    <div ref={wrapRef} className="canvas-box" style={{ background: 'transparent' }} role="img" aria-label={ariaLabel}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ─────────────── Figure 1: convolution lab ─────────────── */

const cellInputStyle = {
  width: '100%',
  minWidth: 0,
  font: 'inherit',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  textAlign: 'center' as const,
  padding: '6px 2px',
  borderRadius: 6,
  border: '1px solid var(--line-strong)',
  background: 'var(--surface)',
  color: 'var(--ink)',
};

function ConvLab({
  input,
  setInput,
  kernelName,
  setKernelName,
  custom,
  setCustom,
  kernel,
  feature,
}: {
  input: Grid;
  setInput: (f: (g: Grid) => Grid) => void;
  kernelName: KernelName;
  setKernelName: (k: KernelName) => void;
  custom: number[];
  setCustom: (k: number[]) => void;
  kernel: number[];
  feature: number[];
}) {
  const P = usePalette();
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');
  const [sel, setSel] = useState<[number, number]>([6, 11]);
  const [sliding, setSliding] = useState(false);
  const last = useRef<[number, number] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);
  const acc = useRef(0);

  useAnimationFrame(
    (dt) => {
      acc.current += dt;
      if (acc.current < 0.07) return;
      acc.current = 0;
      setSel(([r, c]) => {
        let nc = c + 1;
        let nr = r;
        if (nc >= O) {
          nc = 0;
          nr = r + 1;
        }
        if (nr >= O) {
          setSliding(false);
          return [O - 1, O - 1];
        }
        return [nr, nc];
      });
    },
    sliding && inView,
  );

  const scale = useMemo(() => Math.max(1e-6, ...feature.map(Math.abs)), [feature]);

  const paint = (r: number, c: number, down: boolean) => {
    if (!down) return;
    const v = mode === 'draw' ? 1 : 0;
    const from = last.current ?? [r, c];
    setInput((g) => {
      const n = g.slice();
      const steps = Math.max(Math.abs(r - from[0]), Math.abs(c - from[1]));
      for (let i = 0; i <= steps; i++) {
        const rr = Math.round(from[0] + ((r - from[0]) * i) / (steps || 1));
        const cc = Math.round(from[1] + ((c - from[1]) * i) / (steps || 1));
        n[rr * N + cc] = v;
      }
      return n;
    });
    last.current = [r, c];
  };

  const [sr, sc] = sel;
  const terms = [];
  for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) terms.push({ x: input[(sr + a) * N + (sc + b)], w: kernel[a * K + b] });
  const sum = terms.reduce((s, t) => s + t.x * t.w, 0);
  const kfmt = (v: number) => (Math.abs(v - 1 / 9) < 1e-9 ? '1/9' : fmt(v, Number.isInteger(v) ? 0 : 2));

  return (
    <Figure
      no={1}
      title="합성곱 실험실"
      hint="왼쪽 격자에 그리고, 오른쪽 결과 위에 마우스를 올려 보세요"
      caption={
        <>
          오른쪽 특징 맵의 한 칸은 왼쪽 입력의 3×3 영역(노란 테두리)과 필터를 칸끼리 곱해 더한 값입니다. 주황은 양수, 파랑은 음수로 강하게 반응한 곳입니다. 입력이 20×20인데 출력이 18×18인 이유는 필터가 가장자리 밖으로 나갈 수 없기 때문입니다.
        </>
      }
    >
      <div className="controls row" style={{ alignItems: 'center' }}>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'draw', label: '그리기' },
            { value: 'erase', label: '지우기' },
          ]}
        />
        <div className="btn-row">
          <Button small onClick={() => setInput(() => PRESETS.seven())}>
            숫자 7
          </Button>
          <Button small onClick={() => setInput(() => PRESETS.square())}>
            사각형
          </Button>
          <Button small onClick={() => setInput(() => PRESETS.circle())}>
            원
          </Button>
          <Button small onClick={() => setInput(() => PRESETS.cross())}>
            X자
          </Button>
          <Button small onClick={() => setInput(() => blank())}>
            모두 지우기
          </Button>
        </div>
      </div>
      <div ref={boxRef} className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">입력 이미지 · 20×20</div>
          <GridCanvas
            ariaLabel="그림을 그릴 수 있는 20×20 입력 격자"
            rows={N}
            cols={N}
            deps={[input, sel]}
            color={(r, c) => rgbStr(lerpColor(P.surface2, P.ink, input[r * N + c]))}
            rects={[{ r: sr, c: sc, h: K, w: K, color: P.hl }]}
            onCell={paint}
            onEnd={() => (last.current = null)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="figure-hint">필터 (3×3)</div>
          <Seg value={kernelName} onChange={setKernelName} options={(Object.keys(KERNEL_LABEL) as KernelName[]).map((k) => ({ value: k, label: KERNEL_LABEL[k] }))} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, maxWidth: 200 }}>
            {kernel.map((v, i) =>
              kernelName === 'custom' ? (
                <input
                  key={i}
                  id={`cnn-k-${i}`}
                  aria-label={`필터 ${Math.floor(i / 3) + 1}행 ${(i % 3) + 1}열`}
                  type="number"
                  step={1}
                  min={-9}
                  max={9}
                  value={custom[i]}
                  onChange={(e) => {
                    const n = custom.slice();
                    n[i] = Math.max(-9, Math.min(9, parseFloat(e.target.value) || 0));
                    setCustom(n);
                  }}
                  style={cellInputStyle}
                />
              ) : (
                <div
                  key={i}
                  style={{
                    ...cellInputStyle,
                    border: '1px solid var(--line)',
                    background: divergingColor(P, v, Math.max(...kernel.map(Math.abs))),
                  }}
                >
                  {kfmt(v)}
                </div>
              ),
            )}
          </div>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>{KERNEL_NOTE[kernelName]}</p>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
            선택한 칸 ({sr + 1}, {sc + 1})의 계산
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            {terms.map((t, i) => (
              <div key={i} style={{ padding: '3px 2px', textAlign: 'center', borderRadius: 4, background: t.x ? 'var(--surface-2)' : 'transparent', color: t.x ? 'var(--ink)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                {fmt(t.x, 0)}×{kfmt(t.w)}
              </div>
            ))}
          </div>
          <Readout label="9개 곱의 합 = 출력값" value={fmt(sum, 2)} color={sum > 1e-9 ? 'var(--pos)' : sum < -1e-9 ? 'var(--neg)' : undefined} />
          <Button small onClick={() => (sliding ? setSliding(false) : (setSel([0, 0]), setSliding(true)))} disabled={prefersReducedMotion() && !sliding}>
            {sliding ? '멈추기' : '필터 미끄러뜨리기 ▶'}
          </Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">특징 맵 · 18×18</div>
          <GridCanvas
            ariaLabel="합성곱 결과 특징 맵. 칸 위에 올리면 계산 과정을 보여 줍니다"
            rows={O}
            cols={O}
            deps={[feature, sel, scale]}
            color={(r, c) => divergingColor(P, feature[r * O + c], scale)}
            rects={[{ r: sr, c: sc, h: 1, w: 1, color: P.hl }]}
            onCell={(r, c) => {
              setSliding(false);
              setSel([r, c]);
            }}
          />
          <Legend
            items={[
              { color: 'var(--pos)', label: '양수 반응', shape: 'sq' },
              { color: 'var(--neg)', label: '음수 반응', shape: 'sq' },
              { color: 'var(--hl)', label: '현재 위치', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: ReLU + max pooling ─────────────── */

function PoolFigure({ feature }: { feature: number[] }) {
  const P = usePalette();
  const relu = useMemo(() => feature.map((v) => Math.max(0, v)), [feature]);
  const { out: pooled, arg } = useMemo(() => maxPool(relu), [relu]);
  const [sel, setSel] = useState<[number, number]>([2, 4]);
  const scale = useMemo(() => Math.max(1e-6, ...feature.map(Math.abs)), [feature]);
  const [pr, pc] = sel;
  const winner = arg[pr * PO + pc];
  const wr = Math.floor(winner / O);
  const wc = winner % O;
  const win = [0, 1].flatMap((a) => [0, 1].map((b) => relu[(2 * pr + a) * O + (2 * pc + b)]));

  return (
    <Figure
      no={2}
      title="ReLU와 최대 풀링"
      hint="오른쪽 9×9 칸 위에 올려 보세요"
      caption={<>그림 1에서 만든 특징 맵을 그대로 가져왔습니다. ReLU는 음수(파랑)를 모두 0으로 지우고, 최대 풀링은 2×2 묶음마다 가장 큰 값 하나만 남깁니다. 324칸이 81칸으로 줄었지만 "어디쯤에 무엇이 있다"는 정보는 남아 있습니다.</>}
    >
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">① 특징 맵 18×18 = 324칸</div>
          <GridCanvas ariaLabel="합성곱 결과 특징 맵" rows={O} cols={O} deps={[feature, scale]} color={(r, c) => divergingColor(P, feature[r * O + c], scale)} maxHeight={280} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">② ReLU 적용: max(0, x)</div>
          <GridCanvas
            ariaLabel="ReLU를 적용한 특징 맵"
            rows={O}
            cols={O}
            deps={[relu, sel, scale]}
            color={(r, c) => divergingColor(P, relu[r * O + c], scale)}
            rects={[
              { r: 2 * pr, c: 2 * pc, h: 2, w: 2, color: P.hl },
              { r: wr, c: wc, h: 1, w: 1, color: P.ink },
            ]}
            maxHeight={280}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="figure-hint">③ 2×2 최대 풀링 → 9×9 = 81칸</div>
          <GridCanvas ariaLabel="최대 풀링 결과" rows={PO} cols={PO} deps={[pooled, sel, scale]} color={(r, c) => divergingColor(P, pooled[r * PO + c], scale)} rects={[{ r: pr, c: pc, h: 1, w: 1, color: P.hl }]} onCell={(r, c) => setSel([r, c])} maxHeight={280} />
        </div>
      </div>
      <div className="readouts">
        <Readout label="2×2 묶음의 네 값" value={win.map((v) => fmt(v, 1)).join(' · ')} />
        <Readout label="남는 값 (최댓값)" value={fmt(pooled[pr * PO + pc], 2)} color="var(--pos)" />
        <Readout label="데이터 크기" value="324 → 81" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: architecture pipeline ─────────────── */

interface Stage {
  key: string;
  name: string;
  size: string;
  kind: 'maps' | 'flat' | 'fc' | 'out';
  side: number; // spatial size
  depth: number; // channels shown
  params: number;
  desc: string;
}

const STAGES: Stage[] = [
  { key: 'in', name: '입력', size: '28×28×1', kind: 'maps', side: 28, depth: 1, params: 0, desc: '손글씨 숫자 이미지 한 장. 흑백이라 채널이 1개이고, 컬러라면 빨강·초록·파랑 3채널이 됩니다.' },
  { key: 'c1', name: '합성곱 1', size: '26×26×8', kind: 'maps', side: 26, depth: 8, params: 80, desc: '3×3 필터 8개를 학습합니다. 각 필터가 하나의 특징 맵을 만들므로 출력은 8장입니다. 이 층의 필터들은 주로 짧은 선분과 경계 같은 단순한 무늬에 반응하게 됩니다.' },
  { key: 'p1', name: '풀링 1', size: '13×13×8', kind: 'maps', side: 13, depth: 8, params: 0, desc: '2×2 최대 풀링으로 가로세로를 절반으로 줄입니다. 학습할 가중치가 없는 고정된 연산입니다.' },
  { key: 'c2', name: '합성곱 2', size: '11×11×16', kind: 'maps', side: 11, depth: 16, params: 1168, desc: '이번 필터는 3×3×8 크기입니다. 앞 층의 특징 맵 8장을 한꺼번에 보고, 선분들을 조합해 모서리, 곡선, 고리 같은 더 복잡한 모양을 찾습니다.' },
  { key: 'p2', name: '풀링 2', size: '5×5×16', kind: 'maps', side: 5, depth: 16, params: 0, desc: '다시 절반으로 줄입니다. 이제 한 칸이 원래 이미지의 꽤 넓은 영역을 대표합니다.' },
  { key: 'fl', name: '펼치기', size: '400', kind: 'flat', side: 5, depth: 1, params: 0, desc: '5×5×16 = 400개의 숫자를 한 줄로 늘어놓습니다. 여기부터는 앞 장에서 본 보통의 신경망과 같습니다.' },
  { key: 'fc', name: '완전연결', size: '10', kind: 'fc', side: 10, depth: 1, params: 4010, desc: '400개 특징을 모두 보고 숫자 0~9 각각의 점수를 계산합니다. 400×10개의 가중치와 10개의 편향이 있습니다.' },
  { key: 'out', name: '소프트맥스', size: '확률 10개', kind: 'out', side: 10, depth: 1, params: 0, desc: '점수를 합이 1인 확률로 바꿉니다. 이 예에서는 "7"일 확률이 가장 높습니다.' },
];

const DIGIT_PROBS = [0.01, 0.04, 0.03, 0.02, 0.01, 0.01, 0.0, 0.81, 0.02, 0.05];

function ArchFigure() {
  const [sel, setSel] = useState('c1');
  const stage = STAGES.find((s) => s.key === sel)!;
  const total = STAGES.reduce((s, x) => s + x.params, 0);
  const W = 980;
  const H = 250;
  const xs = [20, 140, 270, 380, 505, 610, 700, 820];
  const cy = 120;
  const onKey = (k: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSel(k);
    }
  };

  return (
    <Figure
      no={3}
      title="손글씨 숫자를 읽는 작은 CNN"
      hint="단계를 눌러 설명을 보세요"
      caption={<>합성곱과 풀링을 거칠수록 가로세로는 줄고 채널(특징의 종류)은 늘어납니다. 전체 가중치는 {total.toLocaleString()}개뿐입니다. 같은 이미지를 완전연결 층 하나(뉴런 100개)로 처리하면 784×100 = 78,400개가 필요합니다.</>}
    >
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 680, display: 'block' }} role="group" aria-label="CNN 구조도">
          {STAGES.map((s, i) => {
            const x = xs[i];
            const active = s.key === sel;
            const strokeCol = active ? 'var(--part-color, var(--accent))' : 'var(--line-strong)';
            let body: JSX.Element;
            if (s.kind === 'maps') {
              const side = 26 + s.side * 2.6;
              const n = Math.min(s.depth, 6);
              body = (
                <g>
                  {Array.from({ length: n }).map((_, j) => {
                    const off = (n - 1 - j) * 7;
                    return <rect key={j} x={x + off} y={cy - side / 2 - off * 0.6} width={side} height={side} rx={3} style={{ fill: j === n - 1 ? 'var(--surface)' : 'var(--surface-2)', stroke: strokeCol, strokeWidth: active ? 2 : 1 }} />;
                  })}
                  {i === 0 && (
                    <path d={`M${x + 18} ${cy - 30} h40 l-22 62`} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
                  )}
                </g>
              );
            } else if (s.kind === 'flat') {
              body = <rect x={x + 10} y={cy - 75} width={14} height={150} rx={3} style={{ fill: 'var(--surface-2)', stroke: strokeCol, strokeWidth: active ? 2 : 1 }} />;
            } else if (s.kind === 'fc') {
              body = (
                <g>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <circle key={j} cx={x + 20} cy={cy - 70 + j * 15} r={6.5} style={{ fill: j === 7 ? 'var(--pos)' : 'var(--surface)', stroke: strokeCol, strokeWidth: active ? 2 : 1 }} />
                  ))}
                </g>
              );
            } else {
              body = (
                <g>
                  {DIGIT_PROBS.map((p, j) => (
                    <g key={j}>
                      <text x={x} y={cy - 72 + j * 15} style={{ fill: 'var(--ink-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }} dominantBaseline="middle">
                        {j}
                      </text>
                      <rect x={x + 14} y={cy - 78 + j * 15} width={Math.max(2, p * 120)} height={12} rx={2} style={{ fill: j === 7 ? 'var(--pos)' : 'var(--ink-3)' }} />
                    </g>
                  ))}
                </g>
              );
            }
            const labelX = s.kind === 'maps' ? x + (26 + s.side * 2.6) / 2 + Math.min(s.depth, 6) * 3 : x + (s.kind === 'out' ? 60 : 18);
            return (
              <g key={s.key} role="button" tabIndex={0} aria-pressed={active} aria-label={`${s.name} ${s.size}`} onClick={() => setSel(s.key)} onKeyDown={onKey(s.key)} style={{ cursor: 'pointer', outline: 'none' }}>
                <rect x={x - 10} y={10} width={(xs[i + 1] ?? W) - x - 4} height={H - 20} rx={8} style={{ fill: active ? 'var(--accent-soft)' : 'transparent', opacity: active ? 0.55 : 0 }} />
                {body}
                <text x={labelX} y={H - 42} textAnchor="middle" style={{ fill: active ? 'var(--ink)' : 'var(--ink-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                  {s.name}
                </text>
                <text x={labelX} y={H - 24} textAnchor="middle" style={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  {s.size}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'start' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--ink)' }}>
            {stage.name} · {stage.size}
          </strong>
          <br />
          {stage.desc}
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
          <Readout label="이 단계의 학습 가중치" value={stage.params.toLocaleString() + '개'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function CNN() {
  const [input, setInputRaw] = useState<Grid>(PRESETS.seven);
  const [kernelName, setKernelName] = useState<KernelName>('vertical');
  const [custom, setCustom] = useState<number[]>([0, 1, 0, 1, -4, 1, 0, 1, 0]);
  const kernel = kernelName === 'custom' ? custom : KERNELS[kernelName];
  const feature = useMemo(() => convolve(input, kernel), [input, kernel]);
  const setInput = (f: (g: Grid) => Grid) => setInputRaw((g) => f(g));

  return (
    <>
      <h2>이미지는 숫자의 격자다</h2>
      <p>
        컴퓨터에게 흑백 사진은 밝기 숫자가 빽빽하게 들어찬 표입니다. 손글씨 숫자 데이터셋으로 유명한 MNIST의 이미지는 28×28 = 784개의 숫자이고, 컬러 사진은 빨강·초록·파랑 세 장의 표가 겹쳐 있어서 같은 크기라도 숫자가 세 배입니다.
      </p>
      <p>
        이 숫자들을 일렬로 펴서 앞 장의 신경망에 그대로 넣을 수도 있습니다. 하지만 두 가지 문제가 생깁니다. 첫째, 가중치가 너무 많아집니다. 200×200 컬러 사진을 뉴런 1,000개짜리 층에 연결하면 가중치만 1억 2천만 개입니다. 둘째, 일렬로 펴는 순간 "이 픽셀과 저 픽셀이 바로 옆에 붙어 있다"는 정보가 사라집니다. 고양이가 사진 속에서 한 칸만 옆으로 움직여도 모델 입장에서는 완전히 다른 입력이 됩니다.
      </p>
      <p>
        <T en="Convolutional Neural Network, CNN">합성곱 신경망</T>은 이미지의 성질을 그대로 활용합니다. 의미 있는 무늬는 가까운 픽셀끼리 만들고, 같은 무늬는 사진의 어디에 있든 같은 무늬라는 점입니다.
      </p>

      <h2>합성곱: 작은 돋보기를 미끄러뜨리기</h2>
      <p>
        합성곱은 3×3 정도의 작은 숫자 표, 즉 <T en="filter / kernel">필터</T>를 이미지 위에 올려놓고 한 칸씩 옮기면서 계산합니다. 매 위치에서 겹친 9칸을 서로 곱해 더한 값이 결과 지도의 한 칸이 됩니다. 이렇게 만든 결과를 <T en="feature map">특징 맵</T>이라고 부릅니다. 아래에서 직접 그림을 그리고 필터를 바꿔 보세요.
      </p>
      <ConvLab input={input} setInput={setInput} kernelName={kernelName} setKernelName={setKernelName} custom={custom} setCustom={setCustom} kernel={kernel} feature={feature} />
      <MB note="I는 입력 이미지, K는 필터입니다. (i, j) 위치에서 겹친 칸끼리 곱해 모두 더합니다.">{'(I * K)(i, j) = \\sum_{m=0}^{2}\\sum_{n=0}^{2} I(i+m,\\, j+n)\\; K(m, n)'}</MB>
      <Callout kind="intuition">
        곱해서 더하기는 <a href="#vectors">벡터와 내적</a> 장에서 본 내적과 똑같은 계산입니다. 3×3 영역을 9차원 벡터로, 필터도 9차원 벡터로 보면 출력값은 두 벡터가 얼마나 닮았는지를 잰 값입니다. 그래서 필터는 자기와 닮은 무늬를 찾는 탐지기가 됩니다. 세로 경계 필터는 세로 경계와 닮은 곳에서 크게 반응합니다.
      </Callout>
      <p>
        중요한 점은 하나의 필터가 이미지 전체를 돌아다닌다는 것입니다. 왼쪽 위의 세로선을 찾는 데 쓴 9개의 숫자를 오른쪽 아래에서도 그대로 씁니다. 이것을 <T en="weight sharing">가중치 공유</T>라고 하며, 덕분에 필터 하나의 학습 가중치는 9개(편향을 더하면 10개)뿐입니다.
      </p>
      <h3>스트라이드와 패딩</h3>
      <p>
        필터를 한 번에 몇 칸씩 옮길지를 <T en="stride">스트라이드</T>라고 합니다. 2칸씩 옮기면 결과가 절반 크기가 됩니다. 또 그림 1처럼 가장자리에서 필터가 밖으로 나갈 수 없어 결과가 조금씩 작아지는데, 이를 막으려고 테두리에 0을 덧대는 것을 <T en="padding">패딩</T>이라고 합니다. 출력 크기는 다음 식으로 계산합니다.
      </p>
      <MB note="N: 입력 크기, F: 필터 크기, P: 패딩, S: 스트라이드. 그림 1은 (20 − 3 + 0)/1 + 1 = 18입니다.">{'\\text{출력 크기} = \\frac{N - F + 2P}{S} + 1'}</MB>

      <h2>ReLU와 풀링</h2>
      <p>
        합성곱 다음에는 보통 두 가지 처리를 합니다. 먼저 <a href="#neuron">인공 뉴런</a> 장에서 본 활성화 함수 ReLU로 음수를 0으로 바꿉니다. "이 무늬가 여기 있다"는 양의 신호만 남기는 셈입니다. 그다음 <T en="max pooling">최대 풀링</T>으로 2×2 묶음마다 가장 큰 값만 남겨 크기를 줄입니다.
      </p>
      <PoolFigure feature={feature} />
      <p>
        풀링에는 두 가지 이점이 있습니다. 계산량이 4분의 1로 줄고, 무늬가 한두 칸 움직여도 같은 묶음 안이라면 결과가 거의 같습니다. 정확한 위치보다 "대략 이 근처에 세로선이 있다"는 사실이 더 중요할 때가 많기 때문입니다.
      </p>

      <h2>층을 쌓으면 무늬가 모양이 된다</h2>
      <p>
        진짜 CNN은 합성곱과 풀링을 여러 번 반복합니다. 첫 층의 필터는 선분이나 색의 경계처럼 단순한 것에 반응합니다. 두 번째 층은 첫 층의 결과를 입력으로 받으므로 "가로선과 세로선이 만나는 곳", 즉 모서리나 곡선을 찾을 수 있습니다. 층이 깊어질수록 눈, 바퀴, 글자의 고리처럼 점점 더 의미 있는 부분을 찾게 되고, 마지막 완전연결 층이 이 부분들을 종합해 "고양이"나 "7"이라고 판단합니다.
      </p>
      <ArchFigure />
      <p>
        여기서 필터의 숫자는 사람이 정하지 않습니다. 그림 1의 세로 경계 필터처럼 그럴듯한 값을 손으로 넣는 대신, 처음에는 무작위 값으로 시작해서 <a href="#gradient-descent">경사하강법</a>과 <a href="#backprop">역전파</a>로 정답을 잘 맞히는 방향으로 조금씩 고칩니다. 놀랍게도 학습이 끝난 첫 층의 필터들을 들여다보면 사람이 설계한 경계 검출 필터와 꽤 비슷한 모양이 나타납니다.
      </p>
      <Callout kind="key">
        CNN은 작은 필터를 이미지 전체에 공유해서 가까운 픽셀끼리의 무늬를 찾습니다. 합성곱과 풀링을 쌓을수록 선분에서 모양으로, 모양에서 물체로 점점 추상적인 특징을 찾아냅니다.
      </Callout>
      <Callout kind="note">
        최근에는 이미지를 작은 조각으로 나눠 <a href="#attention">어텐션</a>으로 처리하는 비전 트랜스포머(ViT)도 널리 쓰입니다. 하지만 가까운 것끼리 묶어 본다는 합성곱의 아이디어는 여전히 많은 모델 안에 살아 있습니다.
      </Callout>
      <Quiz
        q={
          <>
            32×32 이미지에 5×5 필터를 패딩 없이(<M>{'P=0'}</M>) 스트라이드 1로 적용하면 특징 맵의 크기는?
          </>
        }
        options={['32×32', '28×28', '27×27', '16×16']}
        answer={1}
        explain={<>(32 − 5 + 0) / 1 + 1 = 28 입니다. 필터의 가운데가 가장자리 2칸까지는 갈 수 없어서 양쪽에서 2칸씩, 모두 4칸이 줄어듭니다.</>}
      />
    </>
  );
}

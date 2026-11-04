/* 선형대수: Gaussian elimination recorded step by step for the step-through figure. */

export interface ElimFrame {
  M: number[][];
  /** The row operation just done, e.g. "R₂ ← R₂ − 2·R₁". */
  op: string;
  note: string;
  pivot?: [number, number];
  pivotRow?: number;
  target?: number;
  swap?: [number, number];
  bad?: number;
  /** Values found so far by back substitution (by variable index). */
  solved?: (string | null)[];
  phase: 'start' | 'forward' | 'back' | 'done';
}

const SUB = ['₁', '₂', '₃', '₄'];
export const VARS = ['x', 'y', 'z', 'w'];
const R = (i: number) => `R${SUB[i]}`;
const near0 = (v: number) => Math.abs(v) < 1e-9;

/** A friendly string: integers, small fractions like 3/2, otherwise 3 decimals. Real minus sign. */
export function frac(v: number): string {
  if (near0(v)) return '0';
  const s = v < 0 ? '−' : '';
  const a = Math.abs(v);
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(a * d);
    if (Math.abs(a * d - n) < 1e-7) return d === 1 ? `${s}${n}` : `${s}${n}/${d}`;
  }
  return s + a.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Record forward elimination (optionally with partial pivoting) and back substitution on an n×(n+1) augmented matrix. */
export function eliminate(A0: number[][], pivoting: boolean): ElimFrame[] {
  const n = A0.length;
  const M = A0.map((r) => r.slice());
  const snap = () => M.map((r) => r.map((v) => (near0(v) ? 0 : v)));
  const frames: ElimFrame[] = [{ M: snap(), op: '', note: '연립방정식을 확대행렬로 적었습니다. 세로 점선 왼쪽이 계수, 오른쪽이 상수항입니다.', phase: 'start' }];
  const pivCols: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    // choose the pivot row
    let p = -1;
    if (pivoting) {
      let best = 1e-9;
      for (let i = r; i < n; i++) if (Math.abs(M[i][c]) > best) (best = Math.abs(M[i][c])), (p = i);
    } else {
      for (let i = r; i < n; i++)
        if (!near0(M[i][c])) {
          p = i;
          break;
        }
    }
    if (p < 0) {
      frames.push({ M: snap(), op: '', note: `${VARS[c]} 열에는 ${R(r)} 아래로 0이 아닌 수가 없어 피벗을 세울 수 없습니다. ${VARS[c]}는 자유 변수가 됩니다. 다음 열로 넘어갑니다.`, phase: 'forward', pivotRow: r });
      continue;
    }
    if (p !== r) {
      [M[p], M[r]] = [M[r], M[p]];
      const why = pivoting ? `${VARS[c]} 열에서 절댓값이 가장 큰 수가 ${R(p)}에 있으므로` : `${R(r)}의 ${VARS[c]} 계수가 0이라 나눌 수 없으므로`;
      frames.push({ M: snap(), op: `${R(r)} ↔ ${R(p)}`, note: `${why} 두 행을 바꿉니다. 방정식의 순서를 바꾸는 것뿐이라 해는 그대로입니다.`, swap: [r, p], pivot: [r, c], phase: 'forward' });
    } else {
      frames.push({ M: snap(), op: '', note: `${R(r)}의 ${frac(M[r][c])}을(를) 피벗으로 삼아 그 아래 ${VARS[c]} 계수를 모두 0으로 만듭니다.`, pivot: [r, c], pivotRow: r, phase: 'forward' });
    }
    for (let i = r + 1; i < n; i++) {
      if (near0(M[i][c])) continue;
      const m = M[i][c] / M[r][c];
      for (let k = c; k <= n; k++) M[i][k] -= m * M[r][k];
      M[i][c] = 0;
      const ms = frac(Math.abs(m));
      frames.push({ M: snap(), op: `${R(i)} ← ${R(i)} ${m < 0 ? '+' : '−'} ${ms === '1' ? '' : ms + '·'}${R(r)}`, note: `${R(i)}에서 ${R(r)}의 ${frac(m)}배를 뺍니다. 배수 ${frac(m)} = ${frac(M[i][c] + m * M[r][c])} ÷ ${frac(M[r][c])}는 ${VARS[c]} 계수를 정확히 0으로 만드는 값입니다.`, pivot: [r, c], pivotRow: r, target: i, phase: 'forward' });
    }
    pivCols.push(c);
    r++;
  }
  // consistency
  for (let i = r; i < n; i++) {
    if (!near0(M[i][n])) {
      frames.push({ M: snap(), op: `0 = ${frac(M[i][n])}`, note: `${R(i)}는 0x + 0y + 0z = ${frac(M[i][n])}, 즉 0 = ${frac(M[i][n])}라는 모순입니다. 이 연립방정식에는 해가 없습니다.`, bad: i, phase: 'done' });
      return frames;
    }
  }
  const free = Array.from({ length: n }, (_, c) => c).filter((c) => !pivCols.includes(c));
  if (free.length) {
    // express pivot variables in terms of the free ones (one free variable is enough for our presets)
    const t = VARS[free[0]];
    const val: { c0: number; c1: number }[] = Array.from({ length: n }, () => ({ c0: 0, c1: 0 }));
    val[free[0]] = { c0: 0, c1: 1 };
    for (let k = pivCols.length - 1; k >= 0; k--) {
      const c = pivCols[k];
      let c0 = M[k][n];
      let c1 = 0;
      for (let j = c + 1; j < n; j++) {
        c0 -= M[k][j] * val[j].c0;
        c1 -= M[k][j] * val[j].c1;
      }
      val[c] = { c0: c0 / M[k][c], c1: c1 / M[k][c] };
    }
    const show = (v: { c0: number; c1: number }) => (near0(v.c1) ? frac(v.c0) : `${near0(v.c0) ? '' : frac(v.c0) + ' '}${v.c1 < 0 ? '−' : near0(v.c0) ? '' : '+'} ${frac(Math.abs(v.c1)) === '1' ? '' : frac(Math.abs(v.c1))}${t}`.trim());
    const solved = val.map((v, c) => (c === free[0] ? `${t} (자유)` : show(v)));
    frames.push({ M: snap(), op: `${r < n ? `${R(r)}: 0 = 0` : ''}`, note: `${r < n ? '마지막 행이 0 = 0이 되어 아무 조건도 주지 않습니다. ' : ''}식이 하나 사라졌으니 ${t}는 아무 값이나 될 수 있고, 나머지 변수는 ${t}에 따라 정해집니다. 해가 무수히 많습니다.`, solved, phase: 'done' });
    return frames;
  }
  const x: number[] = new Array(n).fill(0);
  const solved: (string | null)[] = new Array(n).fill(null);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    const terms: string[] = [];
    for (let j = i + 1; j < n; j++) {
      s -= M[i][j] * x[j];
      if (!near0(M[i][j])) terms.push(`${frac(M[i][j])}·${frac(x[j])}`);
    }
    x[i] = s / M[i][i];
    solved[i] = frac(x[i]);
    frames.push({
      M: snap(),
      op: `${VARS[i]} = ${frac(x[i])}`,
      note: `뒤에서부터 풉니다(후진 대입). ${R(i)}: ${frac(M[i][i])}${VARS[i]}${terms.length ? ' + ' + terms.join(' + ') : ''} = ${frac(M[i][n])}에서 ${VARS[i]} = ${frac(x[i])}.`,
      pivotRow: i,
      solved: solved.slice(),
      phase: i === 0 ? 'done' : 'back',
    });
  }
  return frames;
}

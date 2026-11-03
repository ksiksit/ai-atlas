/* Step-by-step traces for the stack / queue / heap lesson. Pure functions so they can be checked outside the browser. */

/* ─────────────── Bracket matching with a stack ─────────────── */

export interface BracketStep {
  pos: number; // index of the character just read (-1 before the first)
  stack: string[];
  note: string;
  status: 'run' | 'ok' | 'fail';
}

const OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

export function bracketSteps(s: string): BracketStep[] {
  const out: BracketStep[] = [];
  const stack: string[] = [];
  const snap = (pos: number, note: string, status: BracketStep['status'] = 'run') => out.push({ pos, stack: [...stack], note, status });
  snap(-1, '왼쪽부터 한 글자씩 읽습니다. 괄호가 아닌 글자는 건너뜁니다.');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
      snap(i, `${ch} 여는 괄호 → 스택에 쌓음`);
    } else if (ch in OPEN) {
      if (!stack.length) {
        snap(i, `${ch} 닫는 괄호인데 스택이 비어 있음 → 짝이 없어서 틀림`, 'fail');
        return out;
      }
      const top = stack.pop()!;
      if (top !== OPEN[ch]) {
        stack.push(top);
        snap(i, `${ch} 닫는 괄호인데 맨 위가 ${top} → 짝이 달라서 틀림`, 'fail');
        return out;
      }
      snap(i, `${ch} 닫는 괄호, 맨 위 ${top} 꺼냄 → 짝이 맞음`);
    }
  }
  if (stack.length) snap(s.length, `끝까지 읽었는데 스택에 ${stack.join(' ')} 남음 → 닫히지 않은 괄호가 있어서 틀림`, 'fail');
  else snap(s.length, '끝까지 읽었고 스택이 비었음 → 올바름', 'ok');
  return out;
}

/* ─────────────── Binary min-heap ─────────────── */

export interface HeapFrame {
  a: number[];
  cmp?: [number, number]; // indices being compared
  swap?: [number, number]; // indices just swapped
  mark?: number; // index of a value that just arrived (new leaf, or last leaf moved to the root)
  out?: number; // value being removed from the root
  note: string;
}

export const parent = (i: number) => (i - 1) >> 1;

/** Frames for inserting `v` into min-heap `a` (a is not modified). Last frame holds the new heap. */
export function heapPush(a: readonly number[], v: number): { frames: HeapFrame[]; heap: number[]; cmps: number } {
  const h = [...a, v];
  const frames: HeapFrame[] = [{ a: [...h], mark: h.length - 1, note: `새 값 ${v} → 맨 끝 칸(인덱스 ${h.length - 1})에 둠` }];
  let i = h.length - 1;
  let cmps = 0;
  while (i > 0) {
    const p = parent(i);
    cmps++;
    if (h[i] < h[p]) {
      frames.push({ a: [...h], cmp: [p, i], note: `${h[i]} < 부모 ${h[p]} → 자리 바꿈` });
      [h[i], h[p]] = [h[p], h[i]];
      frames.push({ a: [...h], swap: [p, i], note: `바꿈 → 한 층 위 (인덱스 ${p})` });
      i = p;
    } else {
      frames.push({ a: [...h], cmp: [p, i], note: `${h[i]} ≥ 부모 ${h[p]} → 멈춤. 완료` });
      return { frames, heap: h, cmps };
    }
  }
  frames.push({ a: [...h], mark: 0, note: `루트까지 올라옴 → 새 최솟값. 완료` });
  return { frames, heap: h, cmps };
}

/** Frames for removing the minimum from min-heap `a` (a is not modified). */
export function heapPop(a: readonly number[]): { frames: HeapFrame[]; heap: number[]; min: number | null; cmps: number } {
  if (!a.length) return { frames: [{ a: [], note: '힙이 비어 있습니다' }], heap: [], min: null, cmps: 0 };
  const min = a[0];
  const frames: HeapFrame[] = [{ a: [...a], out: 0, note: `루트의 최솟값 ${min} 꺼냄` }];
  const h = [...a];
  const last = h.pop()!;
  if (!h.length) {
    frames.push({ a: [], note: '힙이 비었습니다. 완료' });
    return { frames, heap: h, min, cmps: 0 };
  }
  h[0] = last;
  frames.push({ a: [...h], mark: 0, note: `맨 끝 값 ${last} → 빈 루트로 옮김` });
  let i = 0;
  let cmps = 0;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    if (l >= h.length) {
      frames.push({ a: [...h], mark: i, note: '자식이 없음 → 멈춤. 완료' });
      break;
    }
    let c = l;
    if (r < h.length) {
      cmps++;
      if (h[r] < h[l]) c = r;
    }
    cmps++;
    if (h[c] < h[i]) {
      frames.push({ a: [...h], cmp: [i, c], note: `더 작은 자식 ${h[c]} < ${h[i]} → 자리 바꿈` });
      [h[i], h[c]] = [h[c], h[i]];
      frames.push({ a: [...h], swap: [i, c], note: `바꿈 → 한 층 아래 (인덱스 ${c})` });
      i = c;
    } else {
      frames.push({ a: [...h], cmp: [i, c], note: `더 작은 자식 ${h[c]} ≥ ${h[i]} → 멈춤. 완료` });
      break;
    }
  }
  return { frames, heap: h, min, cmps };
}

export function isMinHeap(a: readonly number[]): boolean {
  for (let i = 1; i < a.length; i++) if (a[parent(i)] > a[i]) return false;
  return true;
}

/* ─────────────── Three priority queues, counted ─────────────── */

export type PQKind = 'unsorted' | 'sorted' | 'heap';
export const PQ_NAMES: Record<PQKind, string> = { unsorted: '정렬 안 된 배열', sorted: '정렬된 배열', heap: '이진 힙' };

/**
 * A job queue that keeps growing: `rounds` times, two jobs arrive and the most urgent (smallest) one is handled.
 * Returns basic operations = comparisons + element writes, and the values taken out (to check all three agree).
 */
export function pqWork(kind: PQKind, rounds: number, r: () => number): { ops: number; taken: number[] } {
  let ops = 0;
  const taken: number[] = [];
  const a: number[] = [];
  const add = (v: number) => {
    if (kind === 'unsorted') {
      a.push(v);
      ops++;
    } else if (kind === 'sorted') {
      // kept in descending order so the minimum sits at the end and pop() is O(1)
      let lo = 0;
      let hi = a.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        ops++;
        if (a[mid] > v) lo = mid + 1;
        else hi = mid;
      }
      ops += a.length - lo + 1; // every later element moves one slot, then v is written
      a.splice(lo, 0, v);
    } else {
      a.push(v);
      ops++;
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        ops++;
        if (a[i] >= a[p]) break;
        [a[i], a[p]] = [a[p], a[i]];
        ops += 2;
        i = p;
      }
    }
  };
  const take = (): number => {
    if (kind === 'unsorted') {
      let m = 0;
      for (let i = 1; i < a.length; i++) {
        ops++;
        if (a[i] < a[m]) m = i;
      }
      const v = a[m];
      a[m] = a[a.length - 1]; // fill the hole with the last element
      a.pop();
      ops++;
      return v;
    }
    if (kind === 'sorted') {
      ops++;
      return a.pop()!;
    }
    const v = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      ops++;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        let c = l;
        if (l + 1 < a.length) {
          ops++;
          if (a[l + 1] < a[l]) c = l + 1;
        }
        ops++;
        if (a[c] >= a[i]) break;
        [a[i], a[c]] = [a[c], a[i]];
        ops += 2;
        i = c;
      }
    }
    return v;
  };
  for (let k = 0; k < rounds; k++) {
    add(Math.floor(r() * 1e6));
    add(Math.floor(r() * 1e6));
    taken.push(take());
  }
  return { ops, taken };
}

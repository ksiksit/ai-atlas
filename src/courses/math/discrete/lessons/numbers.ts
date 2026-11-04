/* Small integer helpers shared by the proof, induction and modular-arithmetic lessons.
   Everything stays below 2^53, so plain numbers are exact. */

/** Mathematical remainder: always in 0..m-1, unlike JavaScript's % for negative a. */
export const mod = (a: number, m: number) => ((a % m) + m) % m;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Extended Euclid: returns [g, x, y] with a·x + b·y = g = gcd(a, b). */
export function egcd(a: number, b: number): [number, number, number] {
  let [r0, r1] = [a, b];
  let [x0, x1] = [1, 0];
  let [y0, y1] = [0, 1];
  while (r1) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [x0, x1] = [x1, x0 - q * x1];
    [y0, y1] = [y1, y0 - q * y1];
  }
  return [r0, x0, y0];
}

/** Inverse of a modulo m, or null when gcd(a, m) ≠ 1. */
export function modInverse(a: number, m: number): number | null {
  const [g, x] = egcd(mod(a, m), m);
  return g === 1 ? mod(x, m) : null;
}

/** a^e mod m by repeated squaring (m below about 9·10^7 keeps every product exact). */
export function modPow(a: number, e: number, m: number): number {
  let result = 1 % m;
  let base = mod(a, m);
  while (e > 0) {
    if (e & 1) result = (result * base) % m;
    base = (base * base) % m;
    e = Math.floor(e / 2);
  }
  return result;
}

export function isPrime(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let d = 5; d * d <= n; d += 6) if (n % d === 0 || n % (d + 2) === 0) return false;
  return true;
}

/** Prime factors with repeats, smallest first (trial division). */
export function factor(n: number): number[] {
  const out: number[] = [];
  if (n < 2) return out;
  while (n % 2 === 0) {
    out.push(2);
    n /= 2;
  }
  for (let d = 3; d * d <= n; d += 2) {
    while (n % d === 0) {
      out.push(d);
      n /= d;
    }
  }
  if (n > 1) out.push(n);
  return out;
}

/** "2² × 3 × 7" */
export function showFactors(fs: number[]): string {
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (k: number) => String(k).split('').map((d) => SUP[+d]).join('');
  const groups: [number, number][] = [];
  for (const f of fs) {
    const last = groups[groups.length - 1];
    if (last && last[0] === f) last[1]++;
    else groups.push([f, 1]);
  }
  return groups.map(([p, k]) => (k > 1 ? `${p}${sup(k)}` : String(p))).join(' × ');
}

export const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

/** One step of Euclid's algorithm: a = q·b + r. */
export interface EuclidStep {
  a: number;
  b: number;
  q: number;
  r: number;
}

export function euclidSteps(a: number, b: number): EuclidStep[] {
  const out: EuclidStep[] = [];
  while (b > 0) {
    const q = Math.floor(a / b);
    const r = a % b;
    out.push({ a, b, q, r });
    [a, b] = [b, r];
  }
  return out;
}

/** Big numbers in Korean-friendly form: 12,345 or 1.2 × 10¹⁵. */
export function bigNum(x: number): string {
  if (!isFinite(x)) return '∞';
  if (x < 1e7) return Math.round(x).toLocaleString('ko-KR');
  return sci(Math.log10(x));
}

/** Format 10^l as "a.b × 10ⁿ". */
export function sci(l: number): string {
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  let e = Math.floor(l);
  let m = Math.round(Math.pow(10, l - e) * 10) / 10;
  if (m >= 10) {
    m = 1;
    e += 1;
  }
  return `${m} × 10${String(e).split('').map((d) => SUP[+d]).join('')}`;
}

export function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}

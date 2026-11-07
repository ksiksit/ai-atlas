/**
 * Small monitoring models for the 로그와 모니터링 lesson.
 *
 * 1. latencySample / summarize: seeded response times from a mixture (most requests fast,
 *    a fraction slow), with mean and percentiles computed the way a metrics system would.
 * 2. errorSeries / evaluateAlert: a seeded per-minute error rate with two real incidents and a few
 *    short blips, and an alert rule "rate > threshold for N minutes" scored against the incidents.
 * 3. budgetBurn: a month of hourly traffic with seeded incidents, and how fast it uses the error
 *    budget an SLO allows.
 */
import { gauss, quantileSorted, rng } from '../../../../lib/math';

/* ───────────────────────── 1. latency ───────────────────────── */

export const FAST_MEDIAN = 80; // ms
export const FAST_SIGMA = 0.35;
export const SLOW_SIGMA = 0.45;

/** n response times in ms: lognormal around FAST_MEDIAN, and with probability tail around slowMedian. */
export function latencySample(n: number, tail: number, slowMedian: number, seed: number): number[] {
  const r = rng(seed * 2654435761);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const slow = r() < tail;
    const z = gauss(r);
    out.push(slow ? slowMedian * Math.exp(SLOW_SIGMA * z) : FAST_MEDIAN * Math.exp(FAST_SIGMA * z));
  }
  return out;
}

export interface Summary {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export function summarize(xs: number[]): Summary {
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: quantileSorted(s, 0.5),
    p95: quantileSorted(s, 0.95),
    p99: quantileSorted(s, 0.99),
    max: s[s.length - 1],
  };
}

/** Histogram on a log scale: bins from lo to hi ms, `per` bins per factor of 10. */
export function logHistogram(xs: number[], lo: number, hi: number, per: number): { from: number; to: number; count: number }[] {
  const k = Math.round(Math.log10(hi / lo) * per);
  const bins = Array.from({ length: k }, (_, i) => ({ from: lo * 10 ** (i / per), to: lo * 10 ** ((i + 1) / per), count: 0 }));
  for (const x of xs) {
    const i = Math.floor(Math.log10(x / lo) * per);
    bins[Math.max(0, Math.min(k - 1, i))].count++;
  }
  return bins;
}

/** Chance that a page making `calls` independent requests sees at least one slower than the q-quantile. */
export const atLeastOneSlow = (calls: number, q: number) => 1 - q ** calls;

/* ───────────────────────── 2. alerts ───────────────────────── */

export const ALERT_MINUTES = 240;
export const ALERT_REQ = 500; // requests per minute
export const ALERT_BASE = 0.005;

export interface Incident {
  from: number;
  to: number; // exclusive
  rate: number;
  name: string;
}

/** The two real incidents of the afternoon: a slow leak and a short, sharp outage. */
export const INCIDENTS: Incident[] = [
  { from: 60, to: 120, rate: 0.025, name: '느린 장애' },
  { from: 175, to: 183, rate: 0.15, name: '짧고 큰 장애' },
];

export interface Series {
  rate: number[];
  /** short blips that heal by themselves within two minutes: not incidents */
  blips: number[];
}

export function errorSeries(seed: number): Series {
  const r = rng(seed * 40503 + 7);
  // three blips at seeded places outside the incidents
  const blips: number[] = [];
  while (blips.length < 3) {
    const t = 5 + Math.floor(r() * (ALERT_MINUTES - 10));
    const clear = INCIDENTS.every((i) => t + 2 < i.from - 3 || t > i.to + 3) && blips.every((b) => Math.abs(b - t) > 10);
    if (clear) blips.push(t);
  }
  blips.sort((a, b) => a - b);
  const rate: number[] = [];
  for (let t = 0; t < ALERT_MINUTES; t++) {
    let p = ALERT_BASE;
    for (const inc of INCIDENTS) if (t >= inc.from && t < inc.to) p = inc.rate;
    for (const b of blips) if (t >= b && t < b + 2) p = 0.07;
    let k = 0;
    for (let i = 0; i < ALERT_REQ; i++) if (r() < p) k++;
    rate.push(k / ALERT_REQ);
  }
  return { rate, blips };
}

export interface AlertEpisode {
  from: number; // first minute the alert is firing
  to: number; // exclusive
  incident: number | null; // index into INCIDENTS it overlaps, or null for a false alarm
}

export interface AlertResult {
  episodes: AlertEpisode[];
  caught: number;
  missed: number;
  falseAlarms: number;
  /** minutes from incident start to first firing, null if missed */
  delays: (number | null)[];
}

/** Prometheus-style rule: fire at minute t when the rate was above threshold for the last `forMin` minutes. */
export function evaluateAlert(rate: number[], threshold: number, forMin: number): AlertResult {
  const firing = rate.map((_, t) => {
    if (t + 1 < forMin) return false;
    for (let j = t - forMin + 1; j <= t; j++) if (!(rate[j] > threshold)) return false;
    return true;
  });
  const episodes: AlertEpisode[] = [];
  for (let t = 0; t < firing.length; t++) {
    if (!firing[t]) continue;
    let e = t;
    while (e < firing.length && firing[e]) e++;
    const idx = INCIDENTS.findIndex((i) => t < i.to + 1 && e > i.from); // a page one minute after the end still counts
    episodes.push({ from: t, to: e, incident: idx >= 0 ? idx : null });
    t = e;
  }
  const delays = INCIDENTS.map((_, i) => {
    const ep = episodes.find((x) => x.incident === i);
    return ep ? Math.max(0, ep.from - INCIDENTS[i].from) : null;
  });
  const caught = delays.filter((d) => d !== null).length;
  return { episodes, caught, missed: INCIDENTS.length - caught, falseAlarms: episodes.filter((x) => x.incident === null).length, delays };
}

/* ───────────────────────── 3. error budget ───────────────────────── */

export const DAYS = 30;
export const REQ_PER_HOUR = 36_000;
export const BUDGET_BASE = 0.0004;

export interface BurnResult {
  /** remaining budget at the end of each hour, as a fraction of the month's budget (can go below 0) */
  remaining: number[];
  /** hour at which the budget ran out, or null */
  outAt: number | null;
  budgetRequests: number;
  /** minutes of total outage the budget allows */
  budgetMinutes: number;
  failed: number;
  incidents: { hour: number; hours: number; rate: number }[];
}

export function budgetBurn(slo: number, seed: number): BurnResult {
  const r = rng(seed * 69069 + 3);
  const H = DAYS * 24;
  const incidents: { hour: number; hours: number; rate: number }[] = [];
  const count = 3 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) incidents.push({ hour: Math.floor(r() * (H - 6)), hours: 1 + Math.floor(r() * 4), rate: 0.005 + r() * r() * 0.08 });
  incidents.sort((a, b) => a.hour - b.hour);
  const budgetRequests = (1 - slo) * REQ_PER_HOUR * H;
  const remaining: number[] = [];
  let failed = 0;
  let outAt: number | null = null;
  for (let h = 0; h < H; h++) {
    let p = BUDGET_BASE * (0.6 + 0.8 * r());
    for (const inc of incidents) if (h >= inc.hour && h < inc.hour + inc.hours) p = Math.max(p, inc.rate);
    failed += REQ_PER_HOUR * p;
    const left = 1 - failed / budgetRequests;
    remaining.push(left);
    if (left <= 0 && outAt === null) outAt = h;
  }
  return { remaining, outAt, budgetRequests, budgetMinutes: (1 - slo) * H * 60, failed, incidents };
}

/** How many times faster than "exactly on budget" a given error rate burns. */
export const burnRate = (rate: number, slo: number) => rate / (1 - slo);

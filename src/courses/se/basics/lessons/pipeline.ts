/**
 * A small CI pipeline model and a flaky-test simulator.
 *
 * plan(): turns pipeline options (one job or many parallel jobs, caching, test shards,
 * whether this commit changed the lock file) into jobs made of timed steps, schedules
 * every job as soon as the jobs it needs have finished (unlimited runners), and finds
 * the critical path — the chain of jobs that decides the wall-clock time.
 *
 * simulateFlaky(): runs N commits through a test suite with some flaky tests and,
 * now and then, a real bug, using the seeded PRNG so the same settings give the same run.
 */
import { rng } from '../../../../lib/math';

/* ───────── pipeline ───────── */

export interface PipeOpts {
  /** Split the work into jobs that run side by side on separate machines. */
  parallel: boolean;
  /** Restore node_modules and the build cache from earlier runs. */
  cache: boolean;
  /** Split unit tests into this many jobs (only with parallel). */
  shards: number;
  /** This commit changed package-lock.json, so cache keys built from it miss. */
  lockChanged: boolean;
}

export type StepKind = 'setup' | 'work' | 'cache';

export interface PStep {
  label: string;
  secs: number;
  kind: StepKind;
}

export interface Job {
  id: string;
  label: string;
  needs: string[];
  steps: PStep[];
}

export interface Placed extends Job {
  start: number;
  end: number;
  dur: number;
  critical: boolean;
}

export interface Plan {
  jobs: Placed[];
  /** Wall-clock seconds from push to the last job finishing. */
  wall: number;
  /** Sum of all job durations: what a hosted CI bills you for. */
  runnerSecs: number;
  /** Job ids on the critical path, first to last. */
  critical: string[];
}

/** Seconds for each piece of work. */
export const SECS = {
  checkout: 10,
  setupNode: 10,
  install: 95,
  restoreDeps: 20,
  saveDeps: 15,
  lint: 35,
  typecheck: 45,
  build: 80,
  buildCached: 25,
  saveBuild: 10,
  unit: 300,
  e2e: 150,
  artifact: 10,
  image: 60,
};

function setup(o: PipeOpts): PStep[] {
  const s: PStep[] = [
    { label: 'checkout', secs: SECS.checkout, kind: 'setup' },
    { label: 'setup-node', secs: SECS.setupNode, kind: 'setup' },
  ];
  if (!o.cache) s.push({ label: 'npm ci', secs: SECS.install, kind: 'setup' });
  else if (o.lockChanged) s.push({ label: 'npm ci (캐시 없음)', secs: SECS.install, kind: 'setup' }, { label: '캐시 저장', secs: SECS.saveDeps, kind: 'cache' });
  else s.push({ label: 'npm ci (캐시)', secs: SECS.restoreDeps, kind: 'cache' });
  return s;
}

function buildSteps(o: PipeOpts): PStep[] {
  if (!o.cache) return [{ label: 'build', secs: SECS.build, kind: 'work' }];
  if (o.lockChanged)
    return [
      { label: 'build (캐시 없음)', secs: SECS.build, kind: 'work' },
      { label: '캐시 저장', secs: SECS.saveBuild, kind: 'cache' },
    ];
  return [{ label: 'build (캐시)', secs: SECS.buildCached, kind: 'cache' }];
}

export function jobsFor(o: PipeOpts): Job[] {
  const work = (label: string, secs: number): PStep => ({ label, secs, kind: 'work' });
  if (!o.parallel) {
    return [
      {
        id: 'ci',
        label: 'ci',
        needs: [],
        steps: [...setup(o), work('lint', SECS.lint), work('typecheck', SECS.typecheck), ...buildSteps(o), work('unit test', SECS.unit), work('e2e test', SECS.e2e), work('image', SECS.image)],
      },
    ];
  }
  const n = Math.max(1, Math.round(o.shards));
  const units: Job[] = Array.from({ length: n }, (_, i) => ({
    id: n === 1 ? 'unit' : `unit-${i + 1}`,
    label: n === 1 ? 'unit' : `unit ${i + 1}/${n}`,
    needs: [],
    steps: [...setup(o), work('unit test', Math.round(SECS.unit / n))],
  }));
  return [
    { id: 'lint', label: 'lint', needs: [], steps: [...setup(o), work('lint', SECS.lint)] },
    { id: 'typecheck', label: 'typecheck', needs: [], steps: [...setup(o), work('typecheck', SECS.typecheck)] },
    { id: 'build', label: 'build', needs: [], steps: [...setup(o), ...buildSteps(o), { label: '결과물 올리기', secs: SECS.artifact, kind: 'setup' }] },
    ...units,
    { id: 'e2e', label: 'e2e', needs: ['build'], steps: [...setup(o), { label: '결과물 받기', secs: SECS.artifact, kind: 'setup' }, work('e2e test', SECS.e2e)] },
    {
      id: 'image',
      label: 'image',
      needs: ['lint', 'typecheck', ...units.map((u) => u.id), 'e2e'],
      steps: [
        { label: 'checkout', secs: SECS.checkout, kind: 'setup' },
        { label: '결과물 받기', secs: SECS.artifact, kind: 'setup' },
        work('image', SECS.image),
      ],
    },
  ];
}

/** Schedule jobs as early as their needs allow (jobs are listed so that needs come first). */
export function schedule(jobs: Job[]): Plan {
  const placed = new Map<string, Placed>();
  for (const j of jobs) {
    const start = Math.max(0, ...j.needs.map((n) => placed.get(n)!.end));
    const dur = j.steps.reduce((a, s) => a + s.secs, 0);
    placed.set(j.id, { ...j, start, end: start + dur, dur, critical: false });
  }
  const all = [...placed.values()];
  const wall = Math.max(...all.map((j) => j.end));
  // walk back from the job that ends last through the need that ends last
  const critical: string[] = [];
  let cur: Placed | undefined = all.reduce((a, b) => (b.end > a.end ? b : a));
  while (cur) {
    cur.critical = true;
    critical.unshift(cur.id);
    const ins: Placed[] = cur.needs.map((n) => placed.get(n)!);
    cur = ins.length ? ins.reduce((a, b) => (b.end > a.end ? b : a)) : undefined;
  }
  return { jobs: all, wall, runnerSecs: all.reduce((a, j) => a + j.dur, 0), critical };
}

export const plan = (o: PipeOpts) => schedule(jobsFor(o));

export function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
}

/* ───────── GitHub Actions YAML for the same options ───────── */

export function workflowYaml(o: PipeOpts): string {
  const L: string[] = ['name: ci', 'on: [push, pull_request]', '', 'jobs:'];
  const setupLines = (ind: string) => {
    const out = [`${ind}- uses: actions/checkout@v4`, `${ind}- uses: actions/setup-node@v4`, `${ind}  with:`, `${ind}    node-version: 22`];
    if (o.cache) out.push(`${ind}    cache: npm                 # package-lock.json 해시가 키`);
    out.push(`${ind}- run: npm ci`);
    return out;
  };
  const buildCache = (ind: string) =>
    o.cache
      ? [
          `${ind}- uses: actions/cache@v4`,
          `${ind}  with:`,
          `${ind}    path: .cache/build`,
          `${ind}    key: build-\${{ hashFiles('package-lock.json') }}-\${{ github.sha }}`,
          `${ind}    restore-keys: build-\${{ hashFiles('package-lock.json') }}-`,
        ]
      : [];
  if (!o.parallel) {
    L.push('  ci:', '    runs-on: ubuntu-latest', '    steps:', ...setupLines('      '), '      - run: npm run lint', '      - run: npm run typecheck', ...buildCache('      '), '      - run: npm run build', '      - run: npm test', '      - run: npm run e2e', '      - run: docker build -t todo-web .');
    return L.join('\n');
  }
  const n = Math.max(1, Math.round(o.shards));
  const job = (name: string, body: string[], needs?: string) => {
    L.push(`  ${name}:`);
    if (needs) L.push(`    needs: ${needs}`);
    L.push('    runs-on: ubuntu-latest', ...body);
  };
  job('lint', ['    steps:', ...setupLines('      '), '      - run: npm run lint']);
  job('typecheck', ['    steps:', ...setupLines('      '), '      - run: npm run typecheck']);
  job('build', ['    steps:', ...setupLines('      '), ...buildCache('      '), '      - run: npm run build', '      - uses: actions/upload-artifact@v4', '        with: { name: dist, path: dist }']);
  if (n === 1) job('unit', ['    steps:', ...setupLines('      '), '      - run: npm test']);
  else
    job('unit', [
      '    strategy:',
      '      matrix:',
      `        shard: [${Array.from({ length: n }, (_, i) => i + 1).join(', ')}]`,
      '    steps:',
      ...setupLines('      '),
      `      - run: npx vitest run --shard=\${{ matrix.shard }}/${n}`,
    ]);
  job('e2e', ['    steps:', ...setupLines('      '), '      - uses: actions/download-artifact@v4', '        with: { name: dist, path: dist }', '      - run: npm run e2e'], 'build');
  job('image', ['    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/download-artifact@v4', '        with: { name: dist, path: dist }', '      - run: docker build -t todo-web .'], '[lint, typecheck, unit, e2e]');
  return L.join('\n');
}

/* ───────── flaky tests ───────── */

export interface FlakyOpts {
  commits: number;
  /** How many tests in the suite are flaky. */
  flaky: number;
  /** Chance that one flaky test fails on one run, for no reason in the code. */
  p: number;
  /** How many times a failing test is run again before it counts as failed. */
  retries: number;
  /** Chance that a commit really breaks something. */
  bugRate: number;
  /** Of the real bugs, the share that only fail sometimes (a race condition, say). */
  intermittentShare: number;
  /** Chance that an intermittent bug's test fails on one run. */
  intermittentP: number;
  seed: number;
}

export const FLAKY_DEFAULTS: FlakyOpts = { commits: 100, flaky: 5, p: 0.03, retries: 0, bugRate: 0.05, intermittentShare: 0.4, intermittentP: 0.5, seed: 1 };

export type Outcome = 'pass' | 'retried' | 'false-red' | 'caught' | 'missed';

export interface CommitRun {
  outcome: Outcome;
  bug: 'none' | 'solid' | 'intermittent';
  /** Flaky tests that failed at least once in this run, with whether a retry saved them. */
  flakyFails: { test: number; final: boolean }[];
  /** A real (intermittent) bug failed once and then passed on a retry. */
  bugRetried: boolean;
  /** Total test runs beyond the first, a cost in time. */
  extraRuns: number;
}

export interface FlakyResult {
  runs: CommitRun[];
  reds: number;
  falseReds: number;
  caught: number;
  missed: number;
  retried: number;
  bugs: number;
  /** Share of red pipelines that were a real bug. */
  redPrecision: number;
  /** Per flaky test: how many runs it failed and was saved by a retry. */
  savedByRetry: number[];
  /** Runs where a real bug's test failed and then passed on a retry. */
  bugSavedByRetry: number;
  /** Test runs beyond the first, summed over all commits. */
  extraRuns: number;
}

/** Run one test up to 1 + retries times; it fails for good only if every attempt fails. */
function attempts(r: () => number, failP: number, retries: number): { failedOnce: boolean; final: boolean; extra: number } {
  let extra = 0;
  for (let a = 0; a <= retries; a++) {
    if (r() >= failP) return { failedOnce: a > 0, final: false, extra };
    if (a < retries) extra++;
  }
  return { failedOnce: true, final: true, extra };
}

/** One independent stream per (seed, commit, test), so turning retries on only adds draws after a failure. */
const stream = (seed: number, commit: number, test: number) => rng((Math.imul(seed, 1000003) + Math.imul(commit, 1009) + test * 31 + 17) >>> 0);

export function simulateFlaky(o: FlakyOpts): FlakyResult {
  const runs: CommitRun[] = [];
  const savedByRetry = Array<number>(o.flaky).fill(0);
  for (let c = 0; c < o.commits; c++) {
    const rb = stream(o.seed, c, 999);
    const bug: CommitRun['bug'] = rb() < o.bugRate ? (rb() < o.intermittentShare ? 'intermittent' : 'solid') : 'none';
    const flakyFails: CommitRun['flakyFails'] = [];
    let extraRuns = 0;
    let anyRetried = false;
    for (let t = 0; t < o.flaky; t++) {
      const a = attempts(stream(o.seed, c, t), o.p, o.retries);
      extraRuns += a.extra;
      if (a.failedOnce) {
        flakyFails.push({ test: t, final: a.final });
        if (!a.final) {
          savedByRetry[t]++;
          anyRetried = true;
        }
      }
    }
    let bugFails = false;
    let bugRetried = false;
    if (bug !== 'none') {
      const a = attempts(stream(o.seed, c, 1000), bug === 'solid' ? 1 : o.intermittentP, o.retries);
      extraRuns += a.extra;
      bugFails = a.final;
      if (a.failedOnce && !a.final) anyRetried = bugRetried = true;
    }
    const flakyRed = flakyFails.some((f) => f.final);
    const outcome: Outcome = bugFails ? 'caught' : bug !== 'none' ? (flakyRed ? 'caught' : 'missed') : flakyRed ? 'false-red' : anyRetried ? 'retried' : 'pass';
    runs.push({ outcome, bug, flakyFails, bugRetried, extraRuns });
  }
  const count = (k: Outcome) => runs.filter((x) => x.outcome === k).length;
  const caught = count('caught');
  const falseReds = count('false-red');
  const reds = caught + falseReds;
  return {
    runs,
    reds,
    falseReds,
    caught,
    missed: count('missed'),
    retried: count('retried'),
    bugs: runs.filter((x) => x.bug !== 'none').length,
    redPrecision: reds ? caught / reds : NaN,
    savedByRetry,
    bugSavedByRetry: runs.filter((x) => x.bugRetried).length,
    extraRuns: runs.reduce((a, x) => a + x.extraRuns, 0),
  };
}

/** Chance that a commit with no bug still goes red: some flaky test fails all 1 + retries attempts. */
export function falseRedChance(flaky: number, p: number, retries: number): number {
  return 1 - Math.pow(1 - Math.pow(p, retries + 1), flaky);
}

/** Chance that an intermittent real bug slips through. */
export function missChance(q: number, retries: number): number {
  return 1 - Math.pow(q, retries + 1);
}

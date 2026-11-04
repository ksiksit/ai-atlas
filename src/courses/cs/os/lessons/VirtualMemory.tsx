import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { courseHref, lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { text } from './draw';
import { FRAMES, FRAME_BITS, OFF_BITS, PAGES, PAGE_BITS, PAGE_REGION, REGION_KO, REPL_NAMES, TLB_SIZE, bits, faultCount, hex, parseRefs, replace, vmAccess, vmInit, type Repl, type VmEvent, type VmKind, type VmState } from './memory';
import '../../algorithms/lessons/algorithms.css';
import './os.css';

/* ─────────────── Figure 1: one address, through the TLB and the page table ─────────────── */

const KIND_KO: Record<VmKind, string> = { 'tlb-hit': 'TLB 적중', 'tlb-miss': 'TLB 미스', fault: '페이지 폴트', segv: '세그멘테이션 폴트' };
const KIND_CSS: Record<VmKind, string> = { 'tlb-hit': 'var(--good)', 'tlb-miss': 'var(--hl)', fault: 'var(--bad)', segv: 'var(--bad)' };
const QUICK: { label: string; va: number }[] = [
  { label: '코드', va: 0x0a4 },
  { label: '데이터', va: 0x2c8 },
  { label: '힙', va: 0x5f0 },
  { label: '스택', va: 0xf80 },
  { label: '빈 곳', va: 0xb00 },
];

function explain(ev: VmEvent): string {
  const pg = `페이지 ${ev.page}`;
  if (ev.kind === 'segv') return `${pg}는 이 프로그램이 할당받은 적 없는 빈 곳입니다. 페이지 테이블에 항목이 없으니 운영체제는 프로세스를 멈춥니다(Segmentation fault).`;
  const pa = `물리 주소 ${hex(ev.pa, 3)} = 프레임 ${ev.frame} × 256 + 오프셋 ${ev.offset}`;
  if (ev.kind === 'tlb-hit') return `TLB에 ${pg} → 프레임 ${ev.frame}이 있어 페이지 테이블을 볼 필요가 없습니다. ${pa}.`;
  if (ev.kind === 'tlb-miss') return `TLB에 없어 메모리에 있는 페이지 테이블을 읽었습니다. ${pg}는 프레임 ${ev.frame}에 있으니 TLB에 적어 두고 주소를 만듭니다${ev.tlbEvicted !== null ? ` (TLB가 가득 차 가장 오래 안 쓴 페이지 ${ev.tlbEvicted}를 지움)` : ''}. ${pa}.`;
  return `${pg}가 물리 메모리에 없습니다. 운영체제가 디스크에서 읽어 ${ev.evicted !== null ? `가장 오래 안 쓴 페이지 ${ev.evicted}를 내보낸 ` : '비어 있던 '}프레임 ${ev.frame}에 올리고, 페이지 테이블을 고친 뒤 명령어를 다시 실행합니다. ${pa}.`;
}

function TranslateFigure() {
  // start with one access already made, so the path through the tables is visible
  const [hist, setHist] = useState<{ s: VmState; ev: VmEvent | null }[]>(() => [{ s: vmInit(), ev: null }, vmAccess(vmInit(), 0x0a4)]);
  const [typed, setTyped] = useState('5F0');
  const [scan, setScan] = useState(0x400);
  const [seed, setSeed] = useState(4);
  const cur = hist[hist.length - 1];
  const s = cur.s;
  const ev = cur.ev;
  const parsed = /^(0x)?[0-9a-f]{1,3}$/i.test(typed.trim()) ? parseInt(typed.trim().replace(/^0x/i, ''), 16) : null;

  const access = (va: number) => setHist((h) => [...h.slice(-30), vmAccess(h[h.length - 1].s, va)]);
  const scanNext = () => {
    access(scan);
    setScan((v) => (v + 0x40 > 0x9ff ? 0x400 : v + 0x40));
  };
  const random = () => {
    const r = rng(seed);
    setSeed((x) => x + 1);
    let va = Math.floor(r() * 4096);
    while (PAGE_REGION[va >> OFF_BITS] === 'none') va = Math.floor(r() * 4096);
    access(va);
  };

  const page = ev ? ev.page : null;
  const va = ev ? ev.va : 0;
  const prevTlb = hist.length > 1 ? hist[hist.length - 2].s.tlb : [];
  return (
    <Figure
      no={1}
      title="가상 주소 하나를 물리 주소로"
      hint="주소를 넣거나 버튼으로 접근해 보세요"
      caption={
        <>
          장난감 컴퓨터입니다. 가상 주소는 12비트(0x000~0xFFF, 4KB), 페이지는 256바이트이므로 위 4비트가 페이지 번호, 아래 8비트가 오프셋입니다. 물리 메모리는 프레임 {FRAMES}개(2KB)뿐이고, TLB는 항목 {TLB_SIZE}개를 가장 오래 안 쓴 것부터 지웁니다. 메모리가 가득 차면 가장 오래 안 쓴 페이지를 내보냅니다. 페이지 10~13은 프로그램이 할당받지 않은 빈 곳입니다. 노란 줄은 이번 접근에 쓰인 항목, 주황 줄은 새로 채운 항목, 빨간 줄은 미스나 폴트입니다.
        </>
      }
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 220px' }}>
          <label className="ctl-label" htmlFor="vm-addr">
            <span>가상 주소 (16진수 3자리)</span>
          </label>
          <div className="addr-form">
            <input id="vm-addr" className="text-input mono" value={typed} maxLength={5} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && parsed !== null && access(parsed)} />
            <Button small primary onClick={() => parsed !== null && access(parsed)} disabled={parsed === null}>
              접근
            </Button>
          </div>
        </div>
        <div className="btn-row">
          {QUICK.map((q) => (
            <Button key={q.label} small onClick={() => access(q.va)}>
              {q.label} {hex(q.va, 3)}
            </Button>
          ))}
          <Button small onClick={scanNext}>
            배열 훑기 {hex(scan, 3)}
          </Button>
          <Button small onClick={random}>
            무작위
          </Button>
          <Button small onClick={() => setHist([{ s: vmInit(), ev: null }])} disabled={hist.length <= 1}>
            처음 상태로
          </Button>
        </div>
      </div>

      <div className="va-bits" aria-live="polite">
        <div className="bitgrp" style={{ ['--c' as string]: 'var(--neg)' }}>
          <span className="lbl">
            페이지 번호 <strong>{ev ? ev.page : '?'}</strong>
          </span>
          <span className="bitrow">
            {bits(va >> OFF_BITS, PAGE_BITS)
              .split('')
              .map((b, i) => (
                <span key={i} className="bit">
                  {ev ? b : '·'}
                </span>
              ))}
          </span>
        </div>
        <div className="bitgrp" style={{ ['--c' as string]: 'var(--pos)' }}>
          <span className="lbl">
            오프셋 <strong>{ev ? ev.offset : '?'}</strong>
          </span>
          <span className="bitrow">
            {bits(va & 0xff, OFF_BITS)
              .split('')
              .map((b, i) => (
                <span key={i} className="bit">
                  {ev ? b : '·'}
                </span>
              ))}
          </span>
        </div>
        <div className="bitgrp" style={{ ['--c' as string]: 'var(--good)' }}>
          <span className="lbl">
            → 물리 주소 <strong>{ev && ev.pa >= 0 ? hex(ev.pa, 3) : '—'}</strong>
          </span>
          <span className="bitrow">
            {(ev && ev.pa >= 0 ? bits(ev.frame, FRAME_BITS) : '···').split('').map((b, i) => (
              <span key={'f' + i} className="bit" style={{ ['--c' as string]: 'var(--good)' }}>
                {b}
              </span>
            ))}
            {(ev && ev.pa >= 0 ? bits(ev.offset, OFF_BITS) : '········').split('').map((b, i) => (
              <span key={'o' + i} className="bit" style={{ ['--c' as string]: 'var(--pos)' }}>
                {b}
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className="vm-grid">
        <div className="vm-box">
          <div className="ttl">
            TLB ({TLB_SIZE}칸){ev && <span style={{ color: KIND_CSS[ev.kind === 'tlb-hit' ? 'tlb-hit' : 'fault'] }}>{ev.kind === 'segv' ? '' : ev.kind === 'tlb-hit' ? '적중' : '미스'}</span>}
          </div>
          <table className="vm-tbl">
            <thead>
              <tr>
                <th>페이지</th>
                <th>프레임</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TLB_SIZE }, (_, k) => {
                const e = s.tlb[k];
                const isNew = e && ev && ev.kind !== 'tlb-hit' && e.page === ev.page && !prevTlb.some((x) => x.page === e.page);
                return (
                  <tr key={k} data-hot={(e && ev && ev.kind === 'tlb-hit' && e.page === ev.page) || undefined} data-new={isNew || undefined} data-off={!e || undefined}>
                    <td>{e ? e.page : '·'}</td>
                    <td>{e ? e.frame : '·'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="os-small">
            접근 {s.acc}번 · TLB 적중 {s.tlbHits}번 · 폴트 {s.faults}번
          </div>
        </div>
        <div className="vm-box">
          <div className="ttl">페이지 테이블 ({PAGES}칸)</div>
          <div className="vm-two">
            {[0, 1].map((half) => (
              <table key={half} className="vm-tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>위치</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: PAGES / 2 }, (_, k) => {
                    const p = half * (PAGES / 2) + k;
                    const e = s.pt[p];
                    const none = PAGE_REGION[p] === 'none';
                    const on = page === p && ev !== null && ev.kind !== 'tlb-hit';
                    return (
                      <tr key={p} data-off={(!e.valid && !on) || undefined} data-hot={(on && ev?.kind === 'tlb-miss') || undefined} data-new={(on && ev?.kind === 'fault') || undefined} data-miss={(on && ev?.kind === 'segv') || undefined} title={REGION_KO[PAGE_REGION[p]]}>
                        <td>{p}</td>
                        <td>{none ? '없음' : e.valid ? `F${e.frame}` : '디스크'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
        <div className="vm-box">
          <div className="ttl">물리 메모리 ({FRAMES}프레임)</div>
          <table className="vm-tbl">
            <thead>
              <tr>
                <th>프레임</th>
                <th>담긴 페이지</th>
              </tr>
            </thead>
            <tbody>
              {s.frames.map((p, f) => (
                <tr key={f} data-hot={(ev && ev.frame === f && ev.kind !== 'fault') || undefined} data-new={(ev && ev.frame === f && ev.kind === 'fault') || undefined} data-off={p === null || undefined}>
                  <td>F{f}</td>
                  <td>{p === null ? '비어 있음' : `${p} (${REGION_KO[PAGE_REGION[p]]})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="os-note" data-bad={(ev && (ev.kind === 'fault' || ev.kind === 'segv')) || undefined}>
        {ev ? (
          <>
            <strong style={{ color: KIND_CSS[ev.kind] === 'var(--hl)' ? 'var(--ink)' : KIND_CSS[ev.kind] }}>
              {hex(ev.va, 3)} · {KIND_KO[ev.kind]}.
            </strong>{' '}
            {explain(ev)}
          </>
        ) : (
          '아직 아무 주소에도 접근하지 않았습니다. 페이지 0, 1(코드), 2(데이터), 14, 15(스택)가 이미 메모리에 올라와 있고, TLB는 비어 있습니다.'
        )}
      </div>
      <div className="os-chips" aria-label="최근 접근">
        <span className="lbl full">최근 접근</span>
        {hist.slice(1).slice(-12).map((h, i) => (
          <span key={i} className="os-chip" data-c="" style={{ ['--c' as string]: KIND_CSS[h.ev!.kind] }} title={KIND_KO[h.ev!.kind]}>
            {hex(h.ev!.va, 3)}
          </span>
        ))}
        {hist.length <= 1 && <span className="os-empty">없음</span>}
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: 'TLB 적중', shape: 'sq' },
          { color: 'var(--hl)', label: 'TLB 미스 (페이지 테이블 읽음)', shape: 'sq' },
          { color: 'var(--bad)', label: '페이지 폴트 · 세그폴트', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: effective access time ─────────────── */

const T_MEM = 100; // ns

function EatFigure() {
  const [hit, setHit] = useState(0.99);
  const [faultExp, setFaultExp] = useState(-6); // log10 of page-fault rate
  const [levels, setLevels] = useState(4);
  const [disk, setDisk] = useState<'ssd' | 'hdd'>('ssd');
  const tFault = disk === 'ssd' ? 100_000 : 10_000_000; // ns
  const pf = faultExp <= -8 ? 0 : 10 ** faultExp;
  const hitPart = (1 - pf) * hit * T_MEM;
  const walkPart = (1 - pf) * (1 - hit) * (levels + 1) * T_MEM;
  const faultPart = pf * tFault;
  const eat = hitPart + walkPart + faultPart;
  const parts = [
    { v: hitPart, c: 'var(--good)', l: 'TLB 적중 후 메모리 읽기' },
    { v: walkPart, c: 'var(--hl)', l: `TLB 미스: 페이지 테이블 ${levels}번 + 메모리 읽기` },
    { v: faultPart, c: 'var(--bad)', l: `페이지 폴트: 디스크에서 읽기 (${disk === 'ssd' ? '0.1ms' : '10ms'})` },
  ];
  const fmtNs = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}ms` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}µs` : `${v.toFixed(1)}ns`);
  const faultLabel = pf === 0 ? '0' : `1/${Math.round(1 / pf).toLocaleString('ko-KR')}`;
  return (
    <Figure
      no={2}
      title="평균 메모리 접근 시간"
      hint="TLB 적중률과 페이지 폴트 비율을 바꿔 보세요"
      caption={
        <>
          메모리 한 번 읽기는 {T_MEM}ns, TLB 확인은 그에 비해 무시할 만큼 빠르다고 두었습니다. TLB 미스가 나면 페이지 테이블을 단계 수만큼 읽은 뒤 데이터를 읽고, 페이지 폴트가 나면 디스크에서 페이지를 가져옵니다. 막대는 평균 접근 시간을 세 가지 원인으로 나눈 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="os-col">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균 접근 시간" value={fmtNs(eat)} color={eat > 2 * T_MEM ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="메모리 한 번보다" value={`${(eat / T_MEM).toFixed(eat / T_MEM < 10 ? 2 : 0)}배`} />
          </div>
          <div className="eat-bar" role="img" aria-label={`평균 접근 시간 ${fmtNs(eat)} 중 ${parts.map((p) => `${p.l} ${((p.v / eat) * 100).toFixed(0)}%`).join(', ')}`}>
            {parts.map((p, i) => (
              <span key={i} style={{ width: `${(p.v / eat) * 100}%`, background: p.c }} />
            ))}
          </div>
          <div className="os-bars">
            {parts.map((p, i) => (
              <div key={i} className="os-bar eat-row">
                <span className="os-bar-name">{p.l}</span>
                <span className="os-bar-track">
                  <span className="os-bar-fill" style={{ width: `${(p.v / eat) * 100}%`, background: p.c }} />
                </span>
                <span className="os-bar-val">{fmtNs(p.v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          <Slider id="eat-hit" label="TLB 적중률" value={hit} min={0.8} max={1} step={0.001} onChange={setHit} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider id="eat-pf" label="페이지 폴트 비율" value={faultExp} min={-8} max={-3} step={0.25} onChange={setFaultExp} format={() => faultLabel} />
          <Seg label="페이지 테이블 단계" value={levels} onChange={setLevels} options={[{ value: 1, label: '1단계' }, { value: 4, label: '4단계 (x86-64)' }]} />
          <Seg label="저장 장치" value={disk} onChange={setDisk} options={[{ value: 'ssd', label: 'SSD' }, { value: 'hdd', label: '하드 디스크' }]} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: page replacement, one reference at a time ─────────────── */

type RefPreset = 'text' | 'belady' | 'loop' | 'local';
const REF_PRESETS: Record<RefPreset, { label: string; refs: string }> = {
  text: { label: '교과서 예제', refs: '7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1' },
  belady: { label: '벨라디의 모순', refs: '1 2 3 4 1 2 5 1 2 3 4 5' },
  loop: { label: '반복 훑기', refs: '1 2 3 4 1 2 3 4 1 2 3 4' },
  local: { label: '지역성', refs: '1 2 1 3 1 2 4 1 2 5 1 2 3 1 2 6 1 2 4 1' },
};
const ALGOS: Repl[] = ['fifo', 'lru', 'clock', 'opt'];
const ALGO_CSS: Record<Repl, string> = { fifo: 'var(--neg)', lru: 'var(--pos)', clock: 'var(--c-stats-2)', opt: 'var(--ink)' };

function ReplaceFigure({ refsText, setRefsText, nFrames, setNFrames }: { refsText: string; setRefsText: (t: string) => void; nFrames: number; setNFrames: (n: number) => void }) {
  const [algo, setAlgo] = useState<Repl>('fifo');
  const refs = useMemo(() => parseRefs(refsText), [refsText]);
  const steps = useMemo(() => replace(refs, nFrames, algo), [refs, nFrames, algo]);
  const s = useStepper(refs.length + 1, 3, `${refsText}|${nFrames}|${algo}`, true);
  const shown = s.i; // references processed
  const faults = steps.slice(0, shown).filter((x) => x.fault).length;
  const cur = shown > 0 ? steps[shown - 1] : null;
  const preset = (Object.keys(REF_PRESETS) as RefPreset[]).find((k) => parseRefs(REF_PRESETS[k].refs).join() === refs.join());
  const all = Object.fromEntries(ALGOS.map((a) => [a, faultCount(refs, nFrames, a)])) as Record<Repl, number>;
  const maxF = Math.max(1, refs.length);

  let note = '처음 상태: 프레임이 모두 비어 있습니다. 재생하거나 한 단계씩 넘겨 보세요.';
  if (cur) {
    if (!cur.fault) note = `페이지 ${cur.page}: 이미 메모리에 있음 (적중).${algo === 'lru' ? ' 가장 최근에 쓴 것으로 기록합니다.' : algo === 'clock' ? ' 참조 비트를 1로 켭니다.' : algo === 'fifo' ? ' FIFO는 적중해도 아무것도 바꾸지 않습니다.' : ''}`;
    else if (cur.evicted === null) note = `페이지 ${cur.page}: 폴트. 빈 프레임 ${cur.slot}에 올립니다.`;
    else
      note = `페이지 ${cur.page}: 폴트. ${
        algo === 'fifo' ? `가장 먼저 들어온 페이지 ${cur.evicted}` : algo === 'lru' ? `가장 오래전에 쓴 페이지 ${cur.evicted}` : algo === 'opt' ? `앞으로 가장 늦게 쓰일(또는 다시 안 쓰일) 페이지 ${cur.evicted}` : `시곗바늘이 참조 비트가 0인 프레임을 찾아 페이지 ${cur.evicted}`
      }를 내보냅니다.`;
  }

  return (
    <Figure
      no={3}
      title="페이지 교체 알고리즘"
      hint="알고리즘과 프레임 수를 바꾸거나 참조열을 직접 고쳐 보세요"
      caption={
        <>
          맨 위 줄이 프로그램이 차례로 접근하는 페이지 번호(참조열)이고, 그 아래 줄이 각 순간 물리 프레임에 들어 있는 페이지입니다. 빨간 칸은 폴트가 나서 새로 올린 페이지, 초록 칸은 이미 있어서 적중한 페이지입니다. 시계 알고리즘에서 작은 숫자는 참조 비트, 보라 밑줄은 시곗바늘이 가리키는 프레임입니다. 참조열은 0~9의 숫자로 최대 24개까지 넣을 수 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="알고리즘" value={algo} onChange={setAlgo} options={ALGOS.map((a) => ({ value: a, label: REPL_NAMES[a] }))} />
        <Slider id="pr-frames" label="프레임 수" value={nFrames} min={1} max={7} step={1} onChange={setNFrames} />
      </div>
      <div className="controls row">
        <Seg label="예시 참조열" value={preset ?? ('' as RefPreset)} onChange={(k) => setRefsText(REF_PRESETS[k].refs)} options={(Object.keys(REF_PRESETS) as RefPreset[]).map((k) => ({ value: k, label: REF_PRESETS[k].label }))} />
        <div className="ctl">
          <label className="ctl-label" htmlFor="pr-refs">
            <span>참조열 직접 입력</span>
          </label>
          <input id="pr-refs" className="text-input mono" value={refsText} spellCheck={false} autoComplete="off" onChange={(e) => setRefsText(e.target.value)} />
        </div>
      </div>
      <div className="pr-wrap" role="img" aria-label={`${REPL_NAMES[algo]}, 프레임 ${nFrames}개, 참조열 ${refs.join(' ')}. 지금까지 ${shown}개 참조에 폴트 ${faults}번`}>
        <table className="pr-tbl">
          <thead>
            <tr>
              <th className="side">참조</th>
              {refs.map((p, i) => (
                <th key={i} data-future={i >= shown || undefined} data-cur={i === shown - 1 || undefined}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: nFrames }, (_, f) => (
              <tr key={f}>
                <td className="side">프레임 {f}</td>
                {steps.map((st, i) => {
                  const fut = i >= shown;
                  const v = st.frames[f];
                  const touched = st.slot === f;
                  return (
                    <td key={i} data-future={fut || undefined} data-new={(!fut && touched && st.fault) || undefined} data-hit={(!fut && touched && !st.fault) || undefined} data-hand={(!fut && algo === 'clock' && i === shown - 1 && st.hand === f) || undefined}>
                      {fut ? '' : v ?? ''}
                      {!fut && algo === 'clock' && v !== null && <sup>{st.refBits[f]}</sup>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="fault">
              <td className="side">폴트</td>
              {steps.map((st, i) => (
                <td key={i}>{i < shown && st.fault ? '✕' : ''}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="fig-split">
        <div className="os-col">
          <div className="os-note" aria-live="polite">
            {note}
          </div>
          <div className="os-bars">
            {ALGOS.map((a) => (
              <div key={a} className="os-bar" data-cur={a === algo || undefined}>
                <span className="os-bar-name">{REPL_NAMES[a]}</span>
                <span className="os-bar-track">
                  <span className="os-bar-fill" style={{ width: `${(all[a] / maxF) * 100}%`, background: ALGO_CSS[a] }} />
                </span>
                <span className="os-bar-val">폴트 {all[a]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="pr-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="지금까지 폴트" value={`${faults}번`} color="var(--bad)" />
            <Readout label="폴트 비율" value={shown ? `${Math.round((faults / shown) * 100)}%` : '—'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: faults against the number of frames ─────────────── */

function CurveFigure({ refsText, nFrames }: { refsText: string; nFrames: number }) {
  const P = usePalette();
  const refs = useMemo(() => parseRefs(refsText), [refsText]);
  const FMAX = 7;
  const curves = useMemo(() => Object.fromEntries(ALGOS.map((a) => [a, Array.from({ length: FMAX }, (_, k) => faultCount(refs, k + 1, a))])) as Record<Repl, number[]>, [refs]);
  const anomalies = ALGOS.flatMap((a) => curves[a].slice(1).map((v, k) => (v > curves[a][k] ? { a, from: k + 1, to: k + 2, f0: curves[a][k], f1: v } : null)).filter((x): x is { a: Repl; from: number; to: number; f0: number; f1: number } => x !== null));
  const colors: Record<Repl, string> = { fifo: P.neg, lru: P.pos, clock: P.stats2, opt: P.ink };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(4, refs.length);
      const plot = new Plot(ctx, w, h, P, { xMin: 0.6, xMax: FMAX + 0.4, yMin: 0, yMax: yMax * 1.05, pad: { l: 38, r: 12, t: 24, b: 30 } });
      plot.grid({ xStep: 1, yStep: yMax > 12 ? 5 : 2, labels: false });
      for (let k = 1; k <= FMAX; k++) text(ctx, String(k), plot.X(k), plot.Y(0) + 11, k === nFrames ? P.ink : P.ink3, `${k === nFrames ? 700 : 400} 11px ${P.fontMono}`, 'center');
      for (let y = 0; y <= yMax; y += yMax > 12 ? 5 : 2) text(ctx, String(y), plot.X(0.6) - 5, plot.Y(y), P.ink3, `10px ${P.fontMono}`, 'right');
      text(ctx, '프레임 수', plot.X(FMAX + 0.4), plot.Y(0) + 24, P.ink3, `10px ${P.fontBody}`, 'right');
      text(ctx, '폴트 횟수', 4, 9, P.ink3, `10px ${P.fontBody}`, 'left');
      plot.line(nFrames, 0, nFrames, yMax * 1.05, alpha(P.ink, 0.3), 1.2, [4, 4]);
      // small offsets so identical curves stay visible side by side
      const off: Record<Repl, number> = { fifo: -0.09, lru: -0.03, clock: 0.03, opt: 0.09 };
      for (const a of ALGOS) {
        ctx.strokeStyle = colors[a];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        curves[a].forEach((v, k) => (k ? ctx.lineTo(plot.X(k + 1 + off[a]), plot.Y(v)) : ctx.moveTo(plot.X(k + 1 + off[a]), plot.Y(v))));
        ctx.stroke();
        curves[a].forEach((v, k) => plot.dot(k + 1 + off[a], v, k + 1 === nFrames ? 4.5 : 3, colors[a], P.surface, 1.5));
      }
      for (const an of anomalies) {
        const x = plot.X(an.to + off[an.a]);
        const y = plot.Y(an.f1);
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    [P, curves, nFrames, refs, anomalies],
    { aspect: 1.9, maxHeight: 300, minHeight: 220 },
  );

  return (
    <Figure
      no={4}
      title="프레임을 늘리면 폴트가 줄어들까"
      hint="그림 3의 참조열이 그대로 쓰입니다"
      caption={<>그림 3의 참조열로 프레임을 1개부터 {FMAX}개까지 늘려 가며 네 알고리즘의 폴트 횟수를 셌습니다. 같은 값의 선이 겹치지 않도록 조금씩 옆으로 비켜 그렸습니다. 빨간 동그라미는 프레임을 하나 늘렸는데 폴트가 오히려 늘어난 곳입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`프레임 수에 따른 폴트 횟수. ${ALGOS.map((a) => `${REPL_NAMES[a]}: ${curves[a].join(', ')}`).join('; ')}`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={ALGOS.map((a) => ({ color: ALGO_CSS[a], label: REPL_NAMES[a], shape: 'ln' as const }))} />
      <div className="os-note" data-bad={anomalies.length > 0 || undefined}>
        {anomalies.length
          ? anomalies.map((an) => `${REPL_NAMES[an.a]}: 프레임 ${an.from}개일 때 폴트 ${an.f0}번, ${an.to}개일 때 ${an.f1}번`).join(' · ') + '. 메모리를 늘렸는데 더 느려졌습니다.'
          : '이 참조열에서는 어느 알고리즘도 프레임을 늘렸을 때 폴트가 늘지 않습니다. 예시를 "벨라디의 모순"으로 바꿔 보세요.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function VirtualMemory() {
  const [refsText, setRefsText] = useState(REF_PRESETS.text.refs);
  const [nFrames, setNFrames] = useState(3);
  return (
    <>
      <h2>모든 프로그램이 주소 0에서 시작한다</h2>
      <p>
        C 프로그램에서 변수의 주소를 찍어 보면 <code>0x7ffd5e8c</code> 같은 값이 나옵니다. 같은 프로그램을 두 개 띄워 같은 변수의 주소를 찍으면 똑같은 값이 나오기도 합니다. 그런데 두 프로세스의 값은 서로 다릅니다. 같은 주소에 다른 값이 들어 있을 수 있는 것은, 프로그램이 보는 주소가 메모리 칩의 실제 위치가 아니기 때문입니다. 프로그램이 쓰는 주소를 <T en="virtual address">가상 주소</T>, 메모리의 실제 위치를 <T en="physical address">물리 주소</T>라고 하고, 명령어가 메모리에 접근할 때마다 CPU 안의 <T en="memory management unit, MMU">MMU</T>가 가상 주소를 물리 주소로 바꿉니다.
      </p>
      <p>이렇게 한 단계를 끼워 넣으면 세 가지를 한꺼번에 얻습니다.</p>
      <ul>
        <li>
          <strong>격리</strong>: 프로세스마다 변환표가 따로 있으므로, 남의 메모리를 가리키는 가상 주소는 아예 만들 수 없습니다. 브라우저 탭 하나가 망가져도 다른 탭의 메모리를 건드리지 못합니다.
        </li>
        <li>
          <strong>단순함</strong>: 모든 프로그램이 0부터 시작하는 넓고 연속된 주소 공간을 혼자 쓴다고 믿고 작성됩니다. 실제로 어느 칸에 놓일지는 운영체제가 정합니다.
        </li>
        <li>
          <strong>실제보다 큰 메모리</strong>: 당장 쓰지 않는 부분은 디스크에 두고, 필요할 때 가져오면 됩니다. 1장에서 본 쓰기 시 복사도 이 변환 덕분에 가능합니다.
        </li>
      </ul>

      <h2>페이지와 페이지 테이블</h2>
      <p>
        바이트마다 변환 정보를 두면 변환표가 메모리보다 커지므로, 주소 공간을 같은 크기의 덩어리로 잘라서 덩어리 단위로 옮깁니다. 가상 주소 공간의 덩어리를 <T en="page">페이지</T>, 물리 메모리의 같은 크기 칸을 <T en="frame">프레임</T>이라고 합니다. 오늘날 대부분의 시스템에서 기본 페이지는 4KB(<M>{'2^{12}'}</M>바이트)입니다. 그러면 가상 주소의 아래 12비트는 페이지 안에서의 위치(<T en="offset">오프셋</T>)이고, 나머지 위쪽 비트가 페이지 번호입니다.
      </p>
      <MB note="오프셋은 바뀌지 않고, 페이지 번호만 프레임 번호로 바뀐다">{'\\underbrace{\\text{페이지 번호}}_{\\text{페이지 테이블로 변환}} \\;\\big|\\; \\underbrace{\\text{오프셋}}_{\\text{그대로}} \\;\\longrightarrow\\; \\text{프레임 번호} \\;\\big|\\; \\text{오프셋}'}</MB>
      <p>
        페이지 번호를 프레임 번호로 바꾸는 표가 <T en="page table">페이지 테이블</T>이고, 프로세스마다 하나씩 메모리에 있습니다. 각 항목에는 프레임 번호 말고도 이 페이지가 지금 메모리에 있는지(valid), 쓰기와 실행을 허락하는지, 최근에 읽혔는지(accessed), 고쳐졌는지(dirty)를 나타내는 비트들이 있습니다. 코드 영역을 읽기 전용으로 두는 것도, 쓰기 시 복사도 이 비트로 합니다. 그림 1에서 주소를 몇 개 넣어 변환을 직접 따라가 보세요.
      </p>
      <TranslateFigure />
      <p>
        <strong>힙 0x5F0</strong>을 누르면 0x5F0의 위 4비트 0101(페이지 5)과 아래 8비트 11110000(오프셋 240)으로 나뉩니다. 페이지 5는 아직 메모리에 없으므로 페이지 폴트가 나고, 운영체제가 빈 프레임에 올린 뒤 물리 주소를 만듭니다. 같은 버튼을 한 번 더 누르면 이번에는 TLB에서 바로 찾습니다. <strong>빈 곳 0xB00</strong>은 할당받은 적 없는 페이지라 세그멘테이션 폴트가 납니다. C에서 널 포인터나 해제한 메모리를 건드렸을 때 프로그램이 죽는 이유가 이것입니다.
      </p>
      <Code label="MMU가 하는 일 (4KB 페이지, 1단계 페이지 테이블)">{`
const OFFSET_BITS = 12;                   // 4KB = 2^12
function translate(va, pageTable, tlb) {
  const vpn = va >>> OFFSET_BITS;         // 가상 페이지 번호
  const offset = va & 0xfff;              // 페이지 안의 위치

  let frame = tlb.get(vpn);               // 1. TLB부터 (하드웨어, 1ns 안팎)
  if (frame === undefined) {
    const pte = pageTable[vpn];           // 2. 메모리의 페이지 테이블 (~100ns)
    if (!pte) throw new SegFault(va);     //    할당받지 않은 주소
    if (!pte.valid) throw new PageFault(vpn); // 3. 운영체제가 디스크에서 가져온 뒤 재시도
    frame = pte.frame;
    tlb.set(vpn, frame);
  }
  return (frame << OFFSET_BITS) | offset; // 오프셋은 그대로 붙인다
}`}</Code>
      <p>
        실제 페이지 테이블은 이보다 복잡합니다. 64비트 x86에서 가상 주소는 48비트이고, 페이지 테이블 하나에 <M>{'2^{36}'}</M>개 항목을 두면 프로세스마다 수백 GB가 듭니다. 그래서 페이지 번호 36비트를 9비트씩 넷으로 나눠 4단계의 나무로 만들고, 실제로 쓰는 부분의 표만 둡니다. 대신 TLB 미스가 날 때마다 메모리를 네 번 읽어야 합니다.
      </p>

      <h2>TLB와 페이지 폴트</h2>
      <p>
        명령어 하나가 메모리를 읽을 때마다 페이지 테이블부터 읽는다면 모든 메모리 접근이 두 배에서 다섯 배 느려집니다. 그래서 MMU 안에 최근에 쓴 변환 몇십에서 몇천 개를 기억하는 작은 캐시를 두는데, 이것이 <T en="translation lookaside buffer">TLB</T>입니다. 페이지 하나가 4KB이므로 배열을 차례로 읽으면 한 번 미스 뒤에 수백 번 적중합니다. 그림 1의 <strong>배열 훑기</strong>를 여러 번 눌러 보세요. 0x40씩 넘어가므로 페이지마다 처음 한 번만 미스입니다. 실제 프로그램의 TLB 적중률은 대개 99%를 넘습니다.
      </p>
      <p>
        TLB 미스보다 훨씬 비싼 것이 <T en="page fault">페이지 폴트</T>입니다. 페이지가 아예 메모리에 없으면 MMU가 예외를 일으키고, 운영체제가 디스크(스왑 영역이나 실행 파일)에서 그 페이지를 읽어 와야 합니다. SSD에서도 0.1ms 정도로 메모리 읽기의 천 배이고, 하드 디스크라면 십만 배입니다. 그림 2에서 이 차이가 평균에 얼마나 영향을 주는지 보세요.
      </p>
      <EatFigure />
      <p>
        TLB 적중률 99%, 4단계 페이지 테이블에서 평균 접근 시간은 약 104ns로 메모리 한 번보다 4% 느릴 뿐입니다. 그런데 SSD를 두고 페이지 폴트를 1만 번에 한 번으로 올리면 114ns, 하드 디스크라면 1.1µs로 열 배가 넘게 느려집니다. 폴트 비율이 1/1,000이면 하드 디스크에서는 메모리가 백 배 느려진 것과 같습니다. 그래서 페이지 폴트는 "드물게" 수준이 아니라 "거의 일어나지 않게" 만들어야 합니다.
      </p>
      <Callout kind="note">
        CPU 캐시, TLB, 메모리, 디스크로 이어지는 층마다 수십에서 수천 배씩 느려지는 구조는 <a href={courseHref('cs-architecture')}>컴퓨터 구조</a>의 메모리 계층에서 다룹니다. 가상 메모리는 그 맨 아래 두 층, 메모리와 디스크 사이의 캐시라고 볼 수 있습니다.
      </Callout>

      <h2>메모리가 모자랄 때: 페이지 교체</h2>
      <p>
        프레임이 모두 차 있는데 폴트가 나면, 페이지 하나를 골라 내보내고(고쳐진 페이지라면 디스크에 써 두고) 그 자리를 써야 합니다. 무엇을 내보낼지 정하는 것이 <T en="page replacement">페이지 교체</T> 알고리즘입니다. <a href={lessonHref('cs-system-algorithms', 'lru-cache')}>LRU 캐시</a>에서 본 교체 정책과 같은 문제지만, 운영체제는 메모리 접근마다 소프트웨어를 실행할 수 없다는 제약이 붙습니다.
      </p>
      <ul>
        <li>
          <strong>FIFO</strong>: 가장 먼저 들어온 페이지를 내보냅니다. 큐 하나면 되지만, 프로그램 시작부터 계속 쓰는 페이지도 오래되었다는 이유로 내보냅니다.
        </li>
        <li>
          <strong>LRU</strong>: 가장 오래전에 쓴 페이지를 내보냅니다. 성능은 좋지만, 정확히 하려면 메모리 접근마다 순서를 갱신해야 해서 하드웨어로 구현하기 어렵습니다.
        </li>
        <li>
          <strong>시계</strong>(<T en="clock / second chance">두 번째 기회</T>): 하드웨어가 페이지를 읽을 때 켜 주는 참조 비트 하나로 LRU를 흉내 냅니다. 프레임을 원으로 두고 시곗바늘을 돌리다가, 참조 비트가 1이면 0으로 끄고 한 번 봐주고, 0인 프레임을 만나면 그 페이지를 내보냅니다.
        </li>
        <li>
          <strong>최적(OPT)</strong>: 앞으로 가장 늦게 쓰일 페이지를 내보냅니다. 미래를 알아야 하므로 실제로는 쓸 수 없지만, 다른 알고리즘을 재는 잣대가 됩니다.
        </li>
      </ul>
      <ReplaceFigure refsText={refsText} setRefsText={setRefsText} nFrames={nFrames} setNFrames={setNFrames} />
      <p>
        교과서 예제(프레임 3개)에서 폴트는 FIFO {faultCount(parseRefs(REF_PRESETS.text.refs), 3, 'fifo')}번, 시계 {faultCount(parseRefs(REF_PRESETS.text.refs), 3, 'clock')}번, LRU {faultCount(parseRefs(REF_PRESETS.text.refs), 3, 'lru')}번, 최적 {faultCount(parseRefs(REF_PRESETS.text.refs), 3, 'opt')}번입니다. 시계는 비트 하나로 FIFO와 LRU 사이 어딘가에 자리 잡습니다. <strong>반복 훑기</strong>에서는 페이지 4개를 프레임 3개로 돌려 쓰는 탓에 FIFO, LRU, 시계가 모두 매번 폴트를 냅니다. 다음에 필요한 페이지가 언제나 방금 내보낸 페이지이기 때문입니다.
      </p>
      <CurveFigure refsText={refsText} nFrames={nFrames} />
      <p>
        상식으로는 메모리가 클수록 폴트가 줄어야 합니다. 그런데 <strong>벨라디의 모순</strong>을 고르면 FIFO는 프레임 3개에서 폴트 9번, 4개에서 10번입니다. 1969년 벨라디(László Bélády)가 발견한 이 현상을 <T en="Belady's anomaly">벨라디의 모순</T>이라고 합니다. LRU와 최적에서는 이런 일이 절대 일어나지 않습니다. 프레임 n개일 때 메모리에 있는 페이지들이 n+1개일 때에도 반드시 들어 있다는 성질(<T en="stack property">스택 성질</T>)이 있기 때문입니다. FIFO와 시계에는 그런 보장이 없습니다.
      </p>
      <Callout kind="warn">
        프로세스들이 한창 쓰는 페이지(<T en="working set">작업 집합</T>)를 합친 것이 물리 메모리보다 커지면, 페이지를 올리자마자 다른 프로세스가 그 페이지를 내보내는 일이 반복됩니다. CPU는 디스크를 기다리느라 놀고, 시스템은 거의 멈춘 것처럼 보입니다. 이것이 <T en="thrashing">스래싱</T>입니다. 브라우저 탭을 너무 많이 열었을 때 컴퓨터 전체가 버벅이는 것이 이 경우이고, 리눅스는 끝내 메모리가 모자라면 OOM 킬러로 프로세스 하나를 강제로 끝냅니다.
      </Callout>

      <Callout kind="key">
        가상 메모리는 프로세스마다 0부터 시작하는 자기만의 주소 공간을 주고, MMU가 접근마다 페이지 번호를 프레임 번호로 바꿉니다(오프셋은 그대로). 변환표는 페이지 테이블이고, 자주 쓰는 변환은 TLB에 캐시합니다. 페이지가 메모리에 없으면 페이지 폴트가 나서 운영체제가 디스크에서 가져오는데, 메모리보다 천 배 이상 느리므로 폴트 비율이 평균 속도를 좌우합니다. 메모리가 가득 차면 교체 알고리즘이 내보낼 페이지를 고르고, 실제 운영체제는 참조 비트로 LRU를 흉내 내는 시계 알고리즘 계열을 씁니다.
      </Callout>
      <Quiz
        q="1024×1024 크기의 int 2차원 배열(행 하나가 4KB, 행마다 한 페이지)을 a[i][j] 순서로 다 더하는 코드와 a[j][i] 순서로 다 더하는 코드가 있다. TLB 항목이 64개일 때 어느 쪽이 왜 느릴까?"
        options={['둘 다 같은 원소를 한 번씩 읽으므로 속도가 같다', 'a[i][j]가 느리다. 행 안에서 오프셋이 계속 바뀌기 때문이다', 'a[j][i]가 느리다. 원소마다 다른 행(페이지)으로 건너뛰어, 64개 TLB로는 1,024개 페이지를 기억하지 못하고 거의 매번 TLB 미스가 난다', 'a[j][i]가 느리다. 매번 페이지 폴트가 나기 때문이다']}
        answer={2}
        explain={<>a[i][j]는 한 행(한 페이지) 안을 차례로 읽으므로 페이지마다 처음 한 번만 TLB 미스이고 나머지 1,023번은 적중합니다. a[j][i]는 원소 하나마다 다음 행, 즉 다른 페이지로 건너뜁니다. 한 바퀴에 1,024개 페이지를 도는데 TLB는 64개만 기억하므로, 다시 돌아왔을 때는 이미 지워져 있습니다. 배열이 4MB로 메모리에 다 들어가므로 페이지 폴트는 처음 한 번씩뿐이고, 느려지는 주된 이유는 TLB 미스와 캐시 미스입니다.</>}
      />
    </>
  );
}

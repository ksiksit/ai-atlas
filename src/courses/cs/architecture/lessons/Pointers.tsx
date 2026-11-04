import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { courseHref, lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { ARR_BASE, ARR_DECL, ARR_N, BALANCE, P1_BASE, P1_LEN, P1_LINES, P1_VARS, SIZE, ad, arrayMemory, cChar, decode, fmtNum, garbage, hx, pointerFrames, printable, type ElemKind, type PVar } from './cmem';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';
import './cmem.css';

/* ─────────────── Figure 1: a pointer is a variable that holds an address ─────────────── */

const ROW_H = 34;
const TOP = 26;
const CELL_X = 64;
const CELL_W = 40;
const CELL_GAP = 4;
const CELLS_END = CELL_X + 4 * (CELL_W + CELL_GAP) - CELL_GAP;
const LABEL_X = 300;
const rowY = (r: number) => TOP + r * ROW_H;
const cellX = (k: number) => CELL_X + k * (CELL_W + CELL_GAP);

function varAt(addr: number): PVar | undefined {
  return P1_VARS.find((v) => addr >= v.addr && addr < v.addr + SIZE[v.kind]);
}
function valueText(v: PVar, mem: number[]) {
  const val = decode(v.kind, mem.slice(v.addr - P1_BASE, v.addr - P1_BASE + SIZE[v.kind]));
  if (v.kind === 'char') return cChar(val);
  if (v.kind === 'ptr') return ad(val);
  return String(val);
}
const TYPE_TXT: Record<string, string> = { int: 'int ', char: 'char ', ptr: 'int *', double: 'double ' };

function PointerFigure() {
  const frames = useMemo(pointerFrames, []);
  const s = useStepper(frames.length, 1);
  const f = frames[s.i];
  const p = P1_VARS[3];
  const pVal = f.declared.has('p') ? decode('ptr', f.mem.slice(p.addr - P1_BASE, p.addr - P1_BASE + 8)) : null;
  const target = pVal !== null ? varAt(pVal) : undefined;
  const rows = P1_LEN / 4;
  const H = rowY(rows) + 6;
  const tY = target ? rowY((target.addr - P1_BASE) >> 2) + ROW_H / 2 : 0;
  const desc = P1_VARS.filter((v) => f.declared.has(v.name))
    .map((v) => `${v.name}는 주소 ${ad(v.addr)}, 값 ${valueText(v, f.mem)}`)
    .join(', ');

  return (
    <Figure
      no={1}
      title="메모리 위의 변수와 포인터"
      hint="한 줄씩 넘겨 보세요"
      caption={<>한 줄이 4바이트, 칸 하나가 1바이트입니다. 왼쪽 수는 그 줄 첫 바이트의 주소, 칸 안의 두 글자는 바이트 값(16진수)입니다. 색 테두리는 변수 하나가 차지하는 바이트, 노란 칸은 방금 쓴 바이트, 파란 테두리는 방금 읽은 바이트, 주황 화살표는 p에 담긴 주소가 가리키는 곳입니다. 실제 기계가 하는 일을 흉내 낸 그림이고, 주소는 보기 좋게 줄인 값입니다.</>}
    >
      <div className="fig-split">
        <div className="cm-svg">
          <svg viewBox={`0 0 440 ${H}`} role="img" aria-label={`24바이트 메모리. ${desc || '아직 선언된 변수가 없습니다'}${target ? `. p는 ${target.name}를 가리킵니다` : ''}`}>
            <defs>
              <marker id="cm-p1-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 Z" className="cm-arrow-head" />
              </marker>
            </defs>
            <text x={56} y={14} textAnchor="end" fontSize={10.5} className="t-dim t-body">
              주소
            </text>
            {[0, 1, 2, 3].map((k) => (
              <text key={k} x={cellX(k) + CELL_W / 2} y={14} textAnchor="middle" fontSize={10.5} className="t-dim">
                +{k}
              </text>
            ))}
            <text x={LABEL_X} y={14} fontSize={10.5} className="t-dim t-body">
              변수 = 값
            </text>
            {Array.from({ length: rows }, (_, r) => (
              <text key={r} x={56} y={rowY(r) + ROW_H / 2 + 4} textAnchor="end" fontSize={11.5} className="t-dim">
                {ad(P1_BASE + r * 4)}
              </text>
            ))}
            {f.mem.map((b, o) => {
              const a = P1_BASE + o;
              const v = varAt(a);
              const live = !!v && f.declared.has(v.name);
              const r = o >> 2;
              const k = o & 3;
              return (
                <g key={o} className={v ? `cm-v-${v.name}` : undefined}>
                  <rect x={cellX(k)} y={rowY(r) + 3} width={CELL_W} height={ROW_H - 6} className="cm-cell" data-own={live || undefined} data-pad={!v || undefined} data-w={f.written.has(a) || undefined} data-r={f.read.has(a) || undefined} />
                  <text x={cellX(k) + CELL_W / 2} y={rowY(r) + ROW_H / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={live ? 700 : 400} className={live ? undefined : 't-dim'} opacity={live ? 1 : 0.6}>
                    {hx(b)}
                  </text>
                </g>
              );
            })}
            {P1_VARS.map((v) => {
              const o = v.addr - P1_BASE;
              const r = o >> 2;
              const span = SIZE[v.kind];
              const w = span >= 4 ? CELLS_END - CELL_X : CELL_W;
              const h = span > 4 ? 2 * ROW_H - 6 : ROW_H - 6;
              const on = f.declared.has(v.name);
              return (
                <g key={v.name} className={`cm-v-${v.name}`}>
                  {on && <rect x={cellX(o & 3) - 1.5} y={rowY(r) + 1.5} width={w + 3} height={h + 3} className="cm-box" />}
                  <text x={LABEL_X} y={rowY(r) + (span > 4 ? ROW_H : ROW_H / 2) + 4.5} fontSize={13.5} className={on ? 'cm-vlabel' : 't-dim'}>
                    {TYPE_TXT[v.kind]}
                    {v.name}
                    {on ? ` = ${valueText(v, f.mem)}` : ' (선언 전)'}
                  </text>
                </g>
              );
            })}
            <text x={LABEL_X} y={rowY(3) + ROW_H / 2 + 4} fontSize={11.5} className="t-dim t-body">
              빈칸 (정렬)
            </text>
            {target && <path d={`M${CELLS_END + 3},${rowY(5)} C${CELLS_END + 52},${rowY(5)} ${CELLS_END + 52},${tY} ${CELLS_END + 6},${tY}`} className="cm-arrow" markerEnd="url(#cm-p1-head)" />}
          </svg>
        </div>
        <div className="cm-side">
          <pre className="loop-code mono cm-code" aria-label="C 코드">
            {P1_LINES.map((l, k) => (
              <span key={k} className="loop-line" data-on={k === f.line || undefined}>
                <span className="ln">{k + 1}</span>
                {l}
                {'\n'}
              </span>
            ))}
          </pre>
          <StepControls s={s} id="p1-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="p (담긴 주소)" value={pVal === null ? '—' : ad(pVal)} color="var(--pos)" />
            <Readout label="*p (그 주소의 int)" value={target ? valueText(target, f.mem) : '—'} />
          </div>
        </div>
      </div>
      <div className="arch-note" aria-live="polite" style={{ minHeight: '3.4em' }}>
        {f.note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a[i] is *(a + i) ─────────────── */

const MAX_I = 7;
const KIND_NAME: Record<ElemKind, string> = { char: 'char (1바이트)', int: 'int (4바이트)', double: 'double (8바이트)' };

function elemText(kind: ElemKind, v: number) {
  if (kind === 'char') return `${cChar(v)} (${v})`;
  if (kind === 'int') return String(v);
  return fmtNum(v);
}

function ArrayRow({ r, mem, size, lo, hi }: { r: number; mem: ReturnType<typeof arrayMemory>; size: number; lo: number; hi: number }) {
  return (
    <>
      <span className="cm-addr">{ad(ARR_BASE + r * 8)}</span>
      {mem.bytes.slice(r * 8, r * 8 + 8).map((b, k) => {
        const o = r * 8 + k;
        const own = mem.owner[o];
        const isArr = typeof own === 'number';
        const first = own !== null && (o === 0 || mem.owner[o - 1] !== own);
        const label = first ? (own === 'bal' ? 'balance' : `a[${own}]`) : o === lo && !isArr ? `a[${lo / size}]` : null;
        return (
          <span key={k} className="cm-b" data-o={isArr ? ((own as number) % 2 ? 'e1' : 'e0') : own === 'bal' ? 'bal' : undefined} data-sel={(o >= lo && o < hi) || undefined}>
            {label && <span className="lbl">{label}</span>}
            {size === 1 && isArr ? <span className="ch">{printable(b)}</span> : null}
            <span className="hx">{hx(b)}</span>
          </span>
        );
      })}
    </>
  );
}

function ArrayFigure() {
  const [kind, setKind] = useState<ElemKind>('int');
  const [i, setI] = useState(2);
  const size = SIZE[kind];
  const mem = useMemo(() => arrayMemory(kind, MAX_I), [kind]);
  const lo = i * size;
  const hi = lo + size;
  const addr = ARR_BASE + lo;
  const val = decode(kind, mem.bytes.slice(lo, hi));
  const inside = i < ARR_N;
  const owners = new Set(mem.owner.slice(lo, hi));
  const where = inside ? null : owners.size === 1 && owners.has('bal') ? 'bal' : owners.has('bal') ? 'mix' : 'junk';
  const rows = mem.bytes.length / 8;

  return (
    <Figure
      no={2}
      title="배열은 시작 주소 + i × 크기"
      hint="타입을 바꾸고 i를 움직여 보세요"
      caption={<>배열 a는 주소 {ad(ARR_BASE)}에서 시작해 원소 다섯 개를 빈틈없이 붙여 놓았습니다(파란 칸, 원소마다 진하기를 번갈아 칠함). 바로 뒤의 초록 칸은 다음 변수 <code>int balance = {BALANCE};</code>, 흰 칸은 아무도 쓰지 않은 남은 바이트입니다. 주황 테두리가 a[i]로 읽는 바이트입니다. double의 바이트는 1장에서 본 IEEE 754 비트를 그대로 적은 것입니다.</>}
    >
      <div className="controls row">
        <Seg label="원소 타입" value={kind} onChange={setKind} options={(['char', 'int', 'double'] as const).map((k) => ({ value: k, label: KIND_NAME[k] }))} />
        <Slider id="arr-i" label="인덱스 i" value={i} min={0} max={MAX_I} step={1} onChange={setI} format={(v) => (v >= ARR_N ? `${v} (배열 밖)` : String(v))} color={inside ? undefined : 'var(--bad)'} />
      </div>
      <div className="arch-note mono">{ARR_DECL[kind]}</div>
      <div className="cm-grid" role="img" aria-label={`${kind} 배열의 바이트 ${mem.bytes.length}개. a[${i}]는 주소 ${ad(addr)}부터 ${size}바이트이고 값은 ${elemText(kind, val)}`}>
        <span />
        {Array.from({ length: 8 }, (_, k) => (
          <span key={k} className="cm-grid-h">
            +{k}
          </span>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <ArrayRow key={r} r={r} mem={mem} size={size} lo={lo} hi={hi} />
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Readout label="a + i (주소 계산)" value={<span style={{ fontSize: '0.9375rem' }}>{`${ad(ARR_BASE)} + ${i} × ${size} = ${ad(addr)}`}</span>} color="var(--pos)" />
        <Readout label={`a[${i}] = *(a + ${i})`} value={elemText(kind, val)} color={inside ? undefined : 'var(--bad)'} />
        <Readout label="p++ 한 번에 움직이는 거리" value={`${size}바이트`} />
      </div>
      <div className="arch-note" aria-live="polite" style={{ minHeight: '3.4em' }}>
        {inside ? (
          <>
            a[{i}]는 a에서 {i}칸, 즉 {i} × {size} = {lo}바이트 떨어진 곳의 {size}바이트를 {kind}로 읽은 값입니다.
          </>
        ) : (
          <span className="cm-warn">
            a[{i}]는 배열 밖입니다. C는 범위를 검사하지 않고 계산한 주소를 그대로 읽습니다.{' '}
            {where === 'bal' ? `마침 옆 변수 balance(${BALANCE})가 나왔습니다.` : where === 'mix' ? 'balance의 일부와 남은 바이트를 섞어 하나의 수로 읽었습니다.' : '그 자리에 남아 있던 아무 의미 없는 바이트를 읽었습니다.'}
          </span>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a C string ends at '\0' ─────────────── */

const STR_CAP = 16;
const STR_PRESETS = ['hello', 'C언어', 'a b', ''];
const enc = new TextEncoder();

function StringFigure() {
  const [text, setText] = useState('hello');
  const bytes = useMemo(() => {
    const out: number[] = [];
    // keep whole characters only, at most 15 bytes so the '\0' still fits
    for (const ch of text) {
      const b = Array.from(enc.encode(ch));
      if (out.length + b.length > STR_CAP - 1) break;
      out.push(...b);
    }
    return out;
  }, [text]);
  const mem = useMemo(() => {
    const m = garbage(STR_CAP, 31);
    bytes.forEach((b, k) => (m[k] = b));
    m[bytes.length] = 0;
    return m;
  }, [bytes]);
  const len = bytes.length;
  // frames: p at 0, 1, …, len (the last one finds '\0')
  const s = useStepper(len + 1, 3, mem.join(','));
  const at = s.i;
  const chars = [...new TextDecoder().decode(new Uint8Array(bytes))].length;
  const cut = [...text].length > chars;

  return (
    <Figure
      no={3}
      title="C 문자열과 strlen"
      hint="글자를 바꾸고 재생해 보세요"
      caption={<><code>char s[16]</code>에 문자열을 넣었습니다. 파란 칸이 글자의 바이트, 초록 <code>\0</code>이 끝 표시(값 0인 바이트), 흰 칸은 배열 안이지만 쓰지 않은 바이트입니다. 노란 테두리는 strlen의 포인터 p가 지금 보고 있는 바이트입니다. 한글은 UTF-8로 한 글자에 3바이트입니다.</>}
    >
      <div className="cm-input-row">
        <label className="ctl">
          <span className="ctl-label">
            <span>문자열 (최대 15바이트)</span>
          </span>
          <input className="text-input" value={text} maxLength={20} spellCheck={false} onChange={(e) => setText(e.target.value)} aria-label="문자열 입력" />
        </label>
        <div className="cm-chips" role="group" aria-label="예시">
          {STR_PRESETS.map((p) => (
            <button key={p} type="button" className="cm-chip" aria-pressed={p === text} onClick={() => setText(p)}>
              {p === '' ? '빈 문자열' : `"${p}"`}
            </button>
          ))}
        </div>
      </div>
      <div className="cm-grid" role="img" aria-label={`문자열 바이트 ${len}개와 끝 표시. strlen이 ${at}번째 바이트를 보고 있습니다`}>
        <span />
        {Array.from({ length: 8 }, (_, k) => (
          <span key={k} className="cm-grid-h">
            +{k}
          </span>
        ))}
        {[0, 1].map((r) => (
          <StrRow key={r} r={r} mem={mem} len={len} at={at} />
        ))}
      </div>
      <div className="fig-cols">
        <div className="controls">
          <StepControls s={s} id="str-speed" maxSpeed={12} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="p − s (지금까지 센 수)" value={at} color="var(--pos)" />
            <Readout label="*p" value={cChar(mem[at])} color={mem[at] === 0 ? 'var(--good)' : undefined} />
            <Readout label="strlen(s)" value={`${len}바이트`} />
            <Readout label="JavaScript의 .length" value={`${[...text].slice(0, chars).join('').length}`} />
          </div>
          <div className="arch-note" aria-live="polite">
            {mem[at] === 0 ? `*p가 0이므로 멈춥니다. 문자열의 길이는 ${len}입니다.` : `*p는 ${cChar(mem[at])}. 0이 아니므로 p++.`}
            {cut && <span className="cm-warn"> 16칸에 들어가지 않는 뒷부분은 잘랐습니다.</span>}
          </div>
        </div>
      </div>
    </Figure>
  );
}

function StrRow({ r, mem, len, at }: { r: number; mem: number[]; len: number; at: number }) {
  return (
    <>
      <span className="cm-addr">{ad(0x3000 + r * 8)}</span>
      {mem.slice(r * 8, r * 8 + 8).map((b, k) => {
        const o = r * 8 + k;
        const used = o < len;
        const nul = o === len;
        return (
          <span key={k} className="cm-b" data-o={used ? 'e0' : undefined} data-nul={nul || undefined} data-now={o === at || undefined}>
            {o === 0 && <span className="lbl">s</span>}
            <span className="ch">{nul ? '\\0' : used ? printable(b) ?? '·' : ''}</span>
            <span className="hx">{hx(b)}</span>
          </span>
        );
      })}
    </>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Pointers() {
  return (
    <>
      <h2>메모리는 번호가 붙은 바이트의 줄</h2>
      <p>
        <a href={lessonHref('cs-architecture', 'memory-circuits')}>기억하는 회로</a>에서 메모리는 주소로 칸을 고르는 회로라는 것을 봤고, <a href={lessonHref('cs-architecture', 'cpu')}>CPU</a>에서는 명령어가 그 칸을 주소로 읽고 쓰는 것을 봤습니다. 프로그래머의 눈으로 보면 메모리는 아주 긴 바이트의 줄이고, 바이트마다 0부터 시작하는 번호, 즉 <T en="address">주소</T>가 붙어 있습니다. 64비트 컴퓨터의 주소는 64비트 수라서 보통 <code>0x7ffd5e3c1a2c</code>처럼 16진수로 씁니다.
      </p>
      <p>
        JavaScript에서는 이 주소를 볼 일이 없습니다. 엔진이 알아서 메모리를 잡고 치우기 때문입니다. C는 다릅니다. 변수가 메모리 어디에 몇 바이트로 놓이는지 그대로 드러나고, 주소를 값으로 꺼내 계산할 수도 있습니다. MIT, 스탠퍼드, CMU, 버클리의 컴퓨터 구조 수업이 모두 C를 쓰는 이유가 이것입니다. C 코드 한 줄은 이 과목에서 본 기계어 몇 줄과 거의 그대로 대응합니다.
      </p>
      <Code label="JavaScript를 아는 사람이 보는 첫 C 프로그램">{`
#include <stdio.h>

int main(void) {
  int x = 42;        // 타입을 꼭 밝힌다. int는 4바이트 정수
  double d = 3.5;    // 8바이트 실수 (JavaScript의 number와 같은 형식)
  char c = 'A';      // 1바이트. 문자 하나는 사실 작은 정수(65)

  printf("%d %zu\\n", x, sizeof x);   // 42 4   sizeof는 바이트 수
  printf("%p\\n", (void *)&x);        // x의 주소, 예: 0x7ffd5e3c1a2c
  return 0;
}
`}</Code>
      <p>
        C의 변수는 "이름이 붙은 몇 바이트"입니다. 타입은 몇 바이트를 쓰는지, 그 비트를 어떻게 읽을지를 정합니다. <a href={lessonHref('cs-architecture', 'binary')}>비트와 수 표현</a>에서 같은 32비트가 정수도 되고 실수도 되는 것을 봤는데, C에서는 그 선택을 타입이 합니다. 64비트 리눅스와 macOS에서 흔한 크기는 이렇습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>타입</th>
              <th>크기</th>
              <th>담는 것</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">char</td>
              <td className="num">1</td>
              <td>문자 하나, 또는 −128~127의 작은 정수</td>
            </tr>
            <tr>
              <td className="mono">int</td>
              <td className="num">4</td>
              <td>약 ±21억까지의 정수 (2의 보수)</td>
            </tr>
            <tr>
              <td className="mono">long</td>
              <td className="num">8</td>
              <td>더 큰 정수</td>
            </tr>
            <tr>
              <td className="mono">double</td>
              <td className="num">8</td>
              <td>64비트 부동소수점</td>
            </tr>
            <tr>
              <td className="mono">int *, char *, …</td>
              <td className="num">8</td>
              <td>주소 (가리키는 타입과 상관없이 8바이트)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>주소와 포인터</h2>
      <p>
        C에는 연산자 두 개가 더 있습니다. <code>&amp;x</code>는 "x의 주소"이고, <code>*p</code>는 "p에 담긴 주소에 있는 것"입니다. 주소를 담는 변수를 <T en="pointer">포인터</T>라고 하며, <code>int *p</code>는 "int가 있는 곳의 주소를 담는 변수 p"라는 뜻입니다. 포인터를 따라가 그 자리의 값을 읽거나 쓰는 일을 <T en="dereference">역참조</T>라고 합니다.
      </p>
      <PointerFigure />
      <p>
        그림 1을 한 줄씩 넘겨 보세요. 세 가지가 눈에 띕니다. 첫째, 42는 <code>2A 00 00 00</code>으로 놓입니다. x86과 ARM은 작은 자리 바이트를 낮은 주소에 두는 <T en="little-endian">리틀 엔디언</T> 방식이기 때문입니다. 둘째, p에 담긴 것은 정말로 <code>0x1000</code>이라는 수입니다. p의 바이트를 읽으면 <code>00 10 00 …</code>이 보입니다. 포인터는 특별한 상자가 아니라 주소를 담은 평범한 8바이트 변수입니다. 셋째, 5행의 <code>*p = 7</code>은 x라는 이름을 쓰지 않고 x를 바꿉니다. 같은 메모리를 두 가지 이름으로 부를 수 있다는 것이 포인터의 힘이자 위험입니다.
      </p>
      <p>
        c 다음의 빈칸도 보세요. 8바이트 포인터는 8의 배수 주소에 두어야 CPU가 한 번에 읽을 수 있어서, 컴파일러가 7바이트를 비워 둡니다. 이것을 <T en="alignment">정렬</T>이라고 합니다. 실제 컴파일러는 변수를 이 그림과 다른 순서로 놓을 수도 있고, 어떤 변수는 메모리 대신 레지스터에만 두기도 합니다. 그림은 원리를 보이려고 단순하게 놓은 것입니다.
      </p>
      <Callout kind="intuition">
        주소는 집 번지, 변수는 그 번지의 집, 포인터는 번지를 적어 둔 쪽지입니다. 쪽지(p)를 고쳐 쓰면 다른 집을 가리키고, 쪽지에 적힌 집을 찾아가 가구를 바꾸면(<code>*p = 7</code>) 그 집이 바뀝니다. 쪽지 자체도 어딘가의 집에 놓인 물건이라 자기 번지가 있습니다(<code>&amp;p</code>).
      </Callout>

      <h2>배열은 주소 계산이다</h2>
      <p>
        C의 배열은 같은 타입의 값을 메모리에 빈틈없이 붙여 놓은 것입니다. <code>int a[5]</code>는 4바이트 int 다섯 개, 모두 20바이트입니다. 배열 이름 a는 대부분의 식에서 첫 원소의 주소로 바뀌고, <code>a[i]</code>는 정의상 <code>*(a + i)</code>와 똑같습니다. 여기서 중요한 규칙이 하나 있습니다. 포인터에 1을 더하면 주소가 1이 아니라 <strong>가리키는 타입의 크기만큼</strong> 커집니다. 이것을 <T en="pointer arithmetic">포인터 산술</T>이라고 합니다.
      </p>
      <ArrayFigure />
      <p>
        그림 2에서 타입을 int에서 char, double로 바꿔 보세요. 같은 <code>a + 2</code>가 int에서는 8바이트, char에서는 2바이트, double에서는 16바이트 떨어진 곳입니다. 컴파일러가 a의 타입을 보고 <code>i × sizeof(원소)</code>를 계산해 주기 때문에, 우리는 원소 번호만 쓰면 됩니다. 기계어로는 "시작 주소 + i × 4에서 읽기" 한 줄이며, 그래서 배열의 어느 원소든 같은 시간에 읽힙니다.
      </p>
      <p>
        이번에는 i를 5 이상으로 밀어 보세요. C는 <code>a[5]</code>가 배열 밖인지 검사하지 않습니다. 계산한 주소를 그대로 읽어서, int 배열이면 옆 변수 balance의 5000이 나오고, double이면 balance의 바이트와 남은 바이트를 섞은 이상한 실수가 나옵니다. 오류 메시지는 없습니다. JavaScript에서 같은 일을 하면 <code>undefined</code>가 나오고, 배열 밖에 쓰면 배열이 늘어날 뿐 옆 데이터가 망가지지는 않습니다.
      </p>
      <Callout kind="warn">
        배열 밖에 <strong>쓰는</strong> 것은 읽는 것보다 훨씬 나쁩니다. 옆에 있던 다른 변수가 조용히 바뀌어, 버그가 생긴 곳과 증상이 나타나는 곳이 멀리 떨어지게 됩니다. 이런 실수는 오랫동안 보안 취약점의 큰 원인이었습니다. 그래서 C 코드에서는 길이를 함께 받는 함수(<code>snprintf</code>, <code>strncpy</code> 등)를 쓰고, 컴파일러와 운영체제는 여러 겹의 보호 장치를 두며, JavaScript, Java, Rust 같은 언어는 모든 인덱스를 검사합니다.
      </Callout>

      <h2>문자열은 0으로 끝나는 char 배열</h2>
      <p>
        C에는 문자열 타입이 따로 없습니다. 문자열은 char 배열이고, 끝에 값이 0인 바이트 <code>'\0'</code>을 붙여 "여기서 끝"을 표시합니다. 그래서 <code>"hello"</code>는 다섯 글자지만 6바이트를 차지합니다. 길이를 따로 적어 두지 않으므로, 길이가 궁금하면 처음부터 0이 나올 때까지 세어야 합니다. 표준 함수 <code>strlen</code>이 하는 일이 정확히 이것입니다.
      </p>
      <Code label="strlen을 포인터로 직접 쓰기">{`
size_t my_strlen(const char *s) {
  const char *p = s;     // p는 첫 글자를 가리킨다
  while (*p != '\\0')     // 끝 표시가 나올 때까지
    p++;                 // 한 바이트씩 앞으로 (char는 1바이트)
  return p - s;          // 두 주소의 차이 = 바이트 수
}
`}</Code>
      <StringFigure />
      <p>
        그림 3에서 재생해 보면 p가 한 칸씩 나아가다 <code>\0</code>에서 멈춥니다. 문자열이 길수록 strlen도 오래 걸립니다. JavaScript의 <code>.length</code>는 길이를 미리 적어 두므로 바로 답하는 것과 다릅니다. "C언어"를 골라 보세요. strlen은 7인데 JavaScript의 <code>.length</code>는 3입니다. C의 strlen은 글자가 아니라 바이트를 세고, 한글 한 글자는 UTF-8로 3바이트이기 때문입니다.
      </p>
      <p>
        끝 표시가 없으면 어떻게 될까요? strlen은 0이 나올 때까지 배열 너머의 메모리를 계속 읽습니다. 문자열을 다루는 C 함수들은 모두 "끝에 0이 있다"는 약속을 믿고 움직이므로, 문자열을 만들 때는 그 0을 넣을 자리까지 꼭 챙겨야 합니다.
      </p>

      <h2>JavaScript의 참조와 무엇이 다른가</h2>
      <p>
        <a href={lessonHref('cs-programming', 'arrays-objects')}>배열과 객체</a>에서 JavaScript의 배열과 객체는 힙에 놓이고 변수에는 참조가 담긴다고 했습니다. 참조도 결국 기계 안에서는 주소입니다. 차이는 언어가 그 주소로 무엇을 허락하느냐에 있습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>C 포인터</th>
              <th>JavaScript 참조</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>주소를 볼 수 있나</td>
              <td>예, <code>printf("%p", p)</code></td>
              <td>아니요</td>
            </tr>
            <tr>
              <td>주소에 더하고 빼기</td>
              <td>예, <code>p + 1</code>, <code>p - s</code></td>
              <td>불가능</td>
            </tr>
            <tr>
              <td>아무 수나 주소로</td>
              <td>예, <code>(int *)0x1000</code></td>
              <td>불가능</td>
            </tr>
            <tr>
              <td>배열 범위 검사</td>
              <td>없음</td>
              <td>항상 (밖이면 undefined)</td>
            </tr>
            <tr>
              <td>다 쓴 메모리 치우기</td>
              <td>프로그래머가 직접</td>
              <td>가비지 컬렉터가 알아서</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        C가 주는 자유 덕분에 운영체제, 데이터베이스, JavaScript 엔진 자체처럼 메모리를 한 바이트까지 다뤄야 하는 프로그램을 쓸 수 있습니다. 대신 실수를 막아 줄 장치도 없습니다. 마지막 줄, 메모리를 누가 언제 치우느냐는 다음 장 <a href={lessonHref('cs-architecture', 'stack-heap')}>스택과 힙</a>의 주제입니다. 주소가 사실은 프로세스마다 따로 있는 가상의 번호라는 이야기는 <a href={courseHref('cs-operating-systems')}>운영체제</a>에서 이어집니다.
      </p>

      <Callout kind="key">
        메모리는 주소가 붙은 바이트의 줄이고, C의 변수는 이름이 붙은 몇 바이트입니다. <code>&amp;x</code>는 x의 주소, <code>*p</code>는 p가 가리키는 곳의 값이며, 포인터는 주소를 담은 평범한 변수입니다. 배열은 원소를 붙여 놓은 것이고 <code>a[i]</code>는 <code>*(a + i)</code>, 즉 시작 주소 + i × 원소 크기에서 읽는 일입니다. C는 범위를 검사하지 않으며, 문자열은 <code>'\0'</code>으로 끝나는 char 배열입니다.
      </Callout>
      <Quiz
        q={<><code>int a[4];</code>의 시작 주소가 0x1000일 때, <code>int *p = a + 3;</code>을 실행하면 p에 담기는 값은?</>}
        options={['0x1003', '0x100C', '0x1010', '0x1004']}
        answer={1}
        explain={<>포인터에 3을 더하면 주소는 3 × sizeof(int) = 12바이트 커집니다. 0x1000 + 12 = 0x100C이고, 이것은 a[3]의 주소입니다. 0x1003은 char 포인터였을 때의 답이고, 0x1010은 배열 바로 뒤(a + 4)입니다. 그림 2에서 int를 고르고 i = 3으로 확인해 보세요.</>}
      />
    </>
  );
}

/* 컴퓨터 구조: a toy accumulator CPU — instruction set, assembler and a phase-by-phase trace */

export const MEM = 32; // bytes of memory; an address fits in 5 bits
export const OPS = ['LOAD', 'STORE', 'ADD', 'SUB', 'JMP', 'JZ', 'OUT', 'HALT'] as const;
export type Op = (typeof OPS)[number];
export const NO_ARG: ReadonlySet<Op> = new Set<Op>(['OUT', 'HALT']);

export const OP_INFO: Record<Op, { says: string; rtl: string }> = {
  LOAD: { says: '메모리 값을 ACC로 읽기', rtl: 'ACC ← M[a]' },
  STORE: { says: 'ACC를 메모리에 쓰기', rtl: 'M[a] ← ACC' },
  ADD: { says: 'ACC에 메모리 값 더하기', rtl: 'ACC ← ACC + M[a]' },
  SUB: { says: 'ACC에서 메모리 값 빼기', rtl: 'ACC ← ACC − M[a]' },
  JMP: { says: '무조건 a로 점프', rtl: 'PC ← a' },
  JZ: { says: 'ACC가 0이면 a로 점프', rtl: 'ACC = 0이면 PC ← a' },
  OUT: { says: 'ACC를 출력 장치로 보내기', rtl: '출력 ← ACC' },
  HALT: { says: '실행 멈추기', rtl: '멈춤' },
};

export const encode = (op: number, addr: number) => ((op & 7) << 5) | (addr & 31);
export const decode = (byte: number) => ({ op: OPS[(byte >> 5) & 7], opIdx: (byte >> 5) & 7, addr: byte & 31 });
export const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');
export const bin8 = (v: number) => v.toString(2).padStart(8, '0');

/* ───────── assembler ───────── */

export interface AsmLine {
  no: number; // source line number, from 1
  src: string;
  addr: number | null; // memory address this line fills
  byte: number | null;
  kind: 'code' | 'data' | 'blank';
}
export interface Program {
  mem: number[];
  lines: AsmLine[];
  labels: Record<string, number>;
  /** address → label, for showing names next to bytes */
  names: Record<number, string>;
  /** addresses written by an instruction line */
  code: Set<number>;
  used: number;
  errors: { no: number; msg: string }[];
}

const LABEL = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Two passes: first give every label an address, then turn each line into a byte. */
export function assemble(src: string): Program {
  const raw = src.split('\n');
  const errors: { no: number; msg: string }[] = [];
  const labels: Record<string, number> = {};
  type Parsed = { no: number; src: string; label?: string; op?: Op; arg?: string; data?: string };
  const parsed: Parsed[] = [];
  let addr = 0;
  const addrOf: (number | null)[] = [];
  raw.forEach((line, i) => {
    const no = i + 1;
    let body = line.replace(/;.*$/, '').trim();
    const p: Parsed = { no, src: line };
    const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m) {
      p.label = m[1];
      body = m[2].trim();
      if (p.label in labels) errors.push({ no, msg: `이름 ${p.label}이(가) 두 번 정의되었습니다` });
      labels[p.label] = addr;
    }
    if (!body) {
      parsed.push(p);
      addrOf.push(null);
      return;
    }
    const [w, ...rest] = body.split(/\s+/);
    const up = w.toUpperCase();
    if ((OPS as readonly string[]).includes(up)) {
      p.op = up as Op;
      p.arg = rest.join(' ');
    } else if (up === 'DATA' || /^-?\d+$/.test(w)) {
      p.data = up === 'DATA' ? rest.join(' ') : body;
    } else {
      errors.push({ no, msg: `${w}: 모르는 명령어입니다` });
    }
    parsed.push(p);
    addrOf.push(addr);
    addr++;
  });

  const mem = new Array(MEM).fill(0);
  const code = new Set<number>();
  const names: Record<number, string> = {};
  for (const [k, v] of Object.entries(labels)) if (v < MEM) names[v] = k;
  if (addr > MEM) errors.push({ no: raw.length, msg: `프로그램이 ${addr}바이트라서 메모리 ${MEM}바이트에 들어가지 않습니다` });

  const resolve = (s: string, no: number): number | null => {
    if (/^\d+$/.test(s)) {
      const v = parseInt(s, 10);
      if (v >= MEM) {
        errors.push({ no, msg: `주소 ${v}는 0–${MEM - 1} 범위를 벗어납니다` });
        return null;
      }
      return v;
    }
    if (LABEL.test(s)) {
      if (s in labels) return labels[s];
      errors.push({ no, msg: `이름 ${s}을(를) 찾을 수 없습니다` });
      return null;
    }
    errors.push({ no, msg: `${s}: 주소나 이름이 아닙니다` });
    return null;
  };

  const lines: AsmLine[] = parsed.map((p, i) => {
    const a = addrOf[i];
    if (a === null) return { no: p.no, src: p.src, addr: null, byte: null, kind: 'blank' };
    let byte: number | null = null;
    let kind: AsmLine['kind'] = 'data';
    if (p.op) {
      kind = 'code';
      const opIdx = OPS.indexOf(p.op);
      if (NO_ARG.has(p.op)) {
        if (p.arg) errors.push({ no: p.no, msg: `${p.op}에는 주소를 쓰지 않습니다` });
        byte = encode(opIdx, 0);
      } else if (!p.arg) {
        errors.push({ no: p.no, msg: `${p.op} 뒤에 주소나 이름이 필요합니다` });
      } else {
        const t = resolve(p.arg, p.no);
        if (t !== null) byte = encode(opIdx, t);
      }
    } else if (p.data !== undefined) {
      const v = parseInt(p.data, 10);
      if (!/^-?\d+$/.test(p.data.trim()) || v < -128 || v > 255) errors.push({ no: p.no, msg: `값 ${p.data}은(는) 한 바이트(0–255)에 들어가지 않습니다` });
      else byte = (v + 256) % 256;
    }
    if (byte !== null && a < MEM) {
      mem[a] = byte;
      if (kind === 'code') code.add(a);
    }
    return { no: p.no, src: p.src, addr: a, byte, kind };
  });

  return { mem, lines, labels, names, code, used: Math.min(addr, MEM), errors };
}

/* ───────── execution trace ───────── */

export type Phase = 'start' | 'fetch' | 'decode' | 'execute' | 'halt' | 'limit';

export interface CpuFrame {
  phase: Phase;
  pc: number;
  ir: number;
  acc: number;
  mem: number[];
  out: number[];
  read: number | null; // memory address read in this phase
  write: number | null; // memory address written in this phase
  at: number; // address of the instruction being worked on
  n: number; // instructions finished so far
  jumped: boolean;
  note: string;
}

export const PHASE_NAME: Record<Phase, string> = { start: '시작', fetch: '인출', decode: '해독', execute: '실행', halt: '멈춤', limit: '중단' };

/** Run from address 0, one frame per phase. Stops at HALT or after `maxInstr` instructions. */
export function runTrace(mem0: number[], names: Record<number, string> = {}, maxInstr = 300): CpuFrame[] {
  const mem = mem0.slice();
  let pc = 0;
  let ir = 0;
  let acc = 0;
  const out: number[] = [];
  const nm = (a: number) => names[a] ?? String(a);
  const frames: CpuFrame[] = [];
  const push = (f: Partial<CpuFrame> & { phase: Phase; note: string; at: number; n: number }) =>
    frames.push({ pc, ir, acc, mem: mem.slice(), out: out.slice(), read: null, write: null, jumped: false, ...f });

  push({ phase: 'start', note: 'PC = 0에서 시작합니다. 재생하거나 한 단계씩 넘겨 보세요.', at: 0, n: 0 });
  for (let n = 0; n < maxInstr; n++) {
    const at = pc;
    ir = mem[pc];
    pc = (pc + 1) % MEM;
    push({ phase: 'fetch', read: at, at, n, note: `인출: 주소 ${at}의 바이트 ${hex2(ir)}를 IR로 읽고, PC를 ${pc}로 올립니다.` });
    const { op, addr } = decode(ir);
    const bits = bin8(ir);
    push({ phase: 'decode', at, n, note: `해독: 위 3비트 ${bits.slice(0, 3)} → ${op}${NO_ARG.has(op) ? '' : `, 아래 5비트 ${bits.slice(3)} → 주소 ${addr}`}.` });
    let note = '';
    let read: number | null = null;
    let write: number | null = null;
    let jumped = false;
    switch (op) {
      case 'LOAD':
        acc = mem[addr];
        read = addr;
        note = `실행: ACC ← M[${nm(addr)}] = ${acc}`;
        break;
      case 'STORE':
        mem[addr] = acc;
        write = addr;
        note = `실행: M[${nm(addr)}] ← ACC = ${acc}`;
        break;
      case 'ADD': {
        const v = mem[addr];
        const r = acc + v;
        note = `실행: ACC ← ACC + M[${nm(addr)}] = ${acc} + ${v} = ${r % 256}${r > 255 ? ' (256을 넘어 넘침)' : ''}`;
        acc = r % 256;
        read = addr;
        break;
      }
      case 'SUB': {
        const v = mem[addr];
        const r = acc - v;
        note = `실행: ACC ← ACC − M[${nm(addr)}] = ${acc} − ${v} = ${(r + 256) % 256}${r < 0 ? ' (0 아래로 내려가 256을 더한 값)' : ''}`;
        acc = (r + 256) % 256;
        read = addr;
        break;
      }
      case 'JMP':
        pc = addr;
        jumped = true;
        note = `실행: PC ← ${addr}${names[addr] ? ` (${names[addr]})` : ''}. 다음 명령어는 주소 ${addr}에서 읽습니다.`;
        break;
      case 'JZ':
        if (acc === 0) {
          pc = addr;
          jumped = true;
          note = `실행: ACC가 0이므로 PC ← ${addr}${names[addr] ? ` (${names[addr]})` : ''}로 점프합니다.`;
        } else note = `실행: ACC가 ${acc}(0이 아님)이므로 점프하지 않고 다음 줄로 갑니다.`;
        break;
      case 'OUT':
        out.push(acc);
        note = `실행: ACC 값 ${acc}을(를) 출력합니다.`;
        break;
      case 'HALT':
        push({ phase: 'halt', at, n: n + 1, note: '실행: HALT. CPU가 멈춥니다.' });
        return frames;
    }
    push({ phase: 'execute', at, n: n + 1, read, write, jumped, note });
  }
  push({ phase: 'limit', at: pc, n: maxInstr, note: `명령어 ${maxInstr}개를 실행하고 멈췄습니다. HALT에 닿지 않는 무한 반복일 수 있습니다.` });
  return frames;
}

/* ───────── preset programs ───────── */

export const PROGRAMS: Record<string, { name: string; src: string; about: string }> = {
  sum: {
    name: '1부터 n까지 합',
    about: 'n을 하나씩 줄이며 sum에 더합니다. n이 0이 되면 JZ로 반복을 빠져나와 sum을 출력합니다.',
    src: `loop:  LOAD n     ; ACC ← n
       JZ end     ; n이 0이면 끝으로
       ADD sum    ; ACC ← n + sum
       STORE sum
       LOAD n     ; n ← n − 1
       SUB one
       STORE n
       JMP loop   ; 처음으로 돌아가기
end:   LOAD sum
       OUT
       HALT
n:     5
sum:   0
one:   1`,
  },
  countdown: {
    name: '카운트다운',
    about: 'n부터 0까지 출력합니다. 출력한 다음 0인지 검사하므로 0도 출력됩니다.',
    src: `loop:  LOAD n
       OUT        ; 지금 값 출력
       JZ end     ; 0이면 끝
       SUB one
       STORE n
       JMP loop
end:   HALT
n:     5
one:   1`,
  },
  multiply: {
    name: '곱셈 (덧셈 반복)',
    about: '곱셈 명령어가 없으므로 a를 b번 더합니다. b를 하나씩 줄여 0이 되면 끝냅니다.',
    src: `loop:  LOAD b
       JZ end     ; b가 0이면 끝
       SUB one
       STORE b    ; b ← b − 1
       LOAD prod
       ADD a
       STORE prod ; prod ← prod + a
       JMP loop
end:   LOAD prod
       OUT
       HALT
a:     6
b:     7
prod:  0
one:   1`,
  },
};

/** The program for the for-loop figure: total += step, n times. */
export const FOR_SRC = `       LOAD zero
       STORE i      ; i = 0
cond:  LOAD n
       SUB i        ; ACC ← n − i
       JZ done      ; 0이면 i < n이 거짓: 반복 끝
       LOAD total
       ADD step
       STORE total  ; total += step
       LOAD i
       ADD one
       STORE i      ; i++
       JMP cond     ; 조건 검사로 돌아가기
done:  LOAD total
       OUT
       HALT
n:     4
step:  3
i:     0
total: 0
one:   1
zero:  0`;

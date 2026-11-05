/* 보호와 보안: pure models behind the lesson's figures. */

export type Mode = 'user' | 'kernel';

/* ── privileged instructions ── */

export interface Instr {
  id: string;
  asm: string;
  what: string;
  privileged: boolean;
  /** Why a user program must not be allowed to do this. */
  why: string;
}

export const INSTRS: Instr[] = [
  { id: 'add', asm: 'add rax, rbx', what: '레지스터 두 개 더하기', privileged: false, why: '자기 레지스터만 바꾸므로 누구에게도 해가 없습니다.' },
  { id: 'load', asm: 'mov rax, [rsp+8]', what: '자기 메모리 읽기', privileged: false, why: '페이지 테이블이 허락한 자기 주소 공간 안이라면 괜찮습니다.' },
  { id: 'cli', asm: 'cli', what: '인터럽트 끄기', privileged: true, why: '타이머 인터럽트가 꺼지면 운영체제가 CPU를 되찾을 수 없어, 이 프로그램이 CPU를 영원히 차지합니다.' },
  { id: 'cr3', asm: 'mov cr3, rax', what: '페이지 테이블 바꾸기', privileged: true, why: '페이지 테이블을 고칠 수 있으면 다른 프로세스나 커널의 메모리를 자기 주소 공간에 붙일 수 있습니다.' },
  { id: 'in', asm: 'in al, 0x60', what: '장치에서 직접 읽기 (키보드)', privileged: true, why: '장치를 직접 다루면 다른 프로그램에 가는 키 입력이나 디스크 내용을 가로챌 수 있습니다.' },
  { id: 'hlt', asm: 'hlt', what: 'CPU 멈추기', privileged: true, why: 'CPU를 세우는 것은 모든 프로그램을 멈추는 일입니다.' },
];

export interface InstrResult {
  ok: boolean;
  text: string;
}

export function runInstr(ins: Instr, mode: Mode): InstrResult {
  if (!ins.privileged || mode === 'kernel') return { ok: true, text: `실행됨. ${ins.what}.` };
  return { ok: false, text: `CPU가 실행을 거부하고 일반 보호 예외를 일으킵니다. 커널이 제어를 넘겨받아 이 프로그램을 종료합니다 (Segmentation fault).` };
}

/* ── the path of a system call ── */

export type Where = 'user' | 'entry' | 'kernel' | 'device';

export interface SysStep {
  mode: Mode;
  stack: 'user' | 'kernel';
  where: Where;
  code: string;
  note: string;
  bad?: boolean;
}

/** write(1, buf, 3): with `badPtr`, buf points into kernel memory and the kernel refuses. */
export function syscallSteps(badPtr: boolean): SysStep[] {
  const buf = badPtr ? '0xffff8000_00001000' : '0x00007ffc_1230';
  const steps: SysStep[] = [
    { mode: 'user', stack: 'user', where: 'user', code: `write(1, buf, 3);`, note: `프로그램이 화면(파일 번호 1)에 3바이트를 쓰려 합니다. 화면 장치는 커널만 다룰 수 있으므로 직접 쓰지 못하고 커널에 부탁해야 합니다. buf의 주소는 ${buf}입니다.` },
    { mode: 'user', stack: 'user', where: 'user', code: `mov rax, 1      ; 시스템 호출 번호 1 = write\nmov rdi, 1      ; 파일 번호\nmov rsi, buf    ; 데이터 주소\nmov rdx, 3      ; 길이`, note: 'C 라이브러리의 write 함수가 시스템 호출 번호와 인자를 정해진 레지스터에 넣습니다. 아직 사용자 모드이고 사용자 스택을 씁니다.' },
    { mode: 'kernel', stack: 'kernel', where: 'entry', code: `syscall`, note: 'syscall 명령어 하나로 CPU가 세 가지를 한꺼번에 합니다. 모드 비트를 커널 모드로 바꾸고, 커널이 미리 정해 둔 진입점 주소로 점프하고, 커널 스택으로 갈아탑니다. 프로그램은 진입점을 고를 수 없습니다.' },
    { mode: 'kernel', stack: 'kernel', where: 'kernel', code: `handler = syscall_table[rax]   // sys_write`, note: '커널은 rax의 번호로 시스템 호출 표에서 처리 함수를 찾습니다. 표에 없는 번호면 바로 오류를 돌려줍니다.' },
    badPtr
      ? { mode: 'kernel', stack: 'kernel', where: 'kernel', code: `if (!access_ok(buf, 3)) return -EFAULT;`, note: `커널이 buf가 사용자 주소 공간 안에 있는지 검사합니다. ${buf}는 커널 영역이므로 거부합니다. 이 검사가 없다면 프로그램이 커널에게 커널 자신의 비밀을 화면에 써 달라고 부탁할 수 있습니다.`, bad: true }
      : { mode: 'kernel', stack: 'kernel', where: 'kernel', code: `if (!access_ok(buf, 3)) return -EFAULT;\ncopy_from_user(kbuf, buf, 3);`, note: '커널이 buf가 사용자 주소 공간 안에 있는지 검사한 뒤, 데이터를 커널 쪽으로 복사합니다. 사용자가 넘긴 값은 하나도 믿지 않고 모두 확인합니다.' },
  ];
  if (!badPtr) steps.push({ mode: 'kernel', stack: 'kernel', where: 'device', code: `tty_write(kbuf, 3);`, note: '커널이 터미널 장치에 3바이트를 씁니다. 화면에 글자가 나타납니다.' });
  steps.push(
    { mode: 'user', stack: 'user', where: 'user', code: `sysret          ; rax = ${badPtr ? '-14 (EFAULT)' : '3'}`, note: `sysret으로 모드 비트를 사용자 모드로 되돌리고, 사용자 스택과 syscall 다음 명령어로 돌아갑니다. 반환값 rax는 ${badPtr ? '-14 (EFAULT, 잘못된 주소)이고, write는 -1을 돌려주며 errno를 설정합니다' : '쓴 바이트 수 3입니다'}.`, bad: badPtr },
  );
  return steps;
}

/* ── page permissions ── */

export type Access = 'read' | 'write' | 'exec';

export interface Page {
  id: string;
  name: string;
  r: boolean;
  w: boolean;
  x: boolean;
  /** Only kernel mode may touch it (the U/S bit is clear). */
  kernelOnly: boolean;
}

export const PAGES: Page[] = [
  { id: 'code', name: '코드', r: true, w: false, x: true, kernelOnly: false },
  { id: 'data', name: '전역 데이터', r: true, w: true, x: false, kernelOnly: false },
  { id: 'heap', name: '힙', r: true, w: true, x: false, kernelOnly: false },
  { id: 'stack', name: '스택', r: true, w: true, x: false, kernelOnly: false },
  { id: 'kernel', name: '커널', r: true, w: true, x: true, kernelOnly: true },
];

export const ACCESS_KO: Record<Access, string> = { read: '읽기', write: '쓰기', exec: '실행' };

export interface AccessResult {
  ok: boolean;
  text: string;
}

export function checkAccess(p: Page, a: Access, mode: Mode): AccessResult {
  if (p.kernelOnly && mode === 'user') return { ok: false, text: `${p.name} 페이지는 커널 전용입니다. 사용자 모드에서는 읽기조차 막혀 페이지 폴트가 나고, 커널은 이 프로그램에 SIGSEGV를 보냅니다.` };
  const allowed = a === 'read' ? p.r : a === 'write' ? p.w : p.x;
  if (allowed) return { ok: true, text: `허락됨. ${p.name} 페이지는 ${ACCESS_KO[a]}가 켜져 있습니다.` };
  const why =
    a === 'write' && p.id === 'code'
      ? '코드 페이지는 쓰기가 꺼져 있어서, 버그가 명령어를 덮어쓸 수 없습니다.'
      : a === 'exec'
        ? `${p.name} 페이지는 실행 금지(NX) 비트가 켜져 있어서, 이곳의 바이트를 명령어로 실행할 수 없습니다.`
        : `${p.name} 페이지는 ${ACCESS_KO[a]} 권한이 없습니다.`;
  return { ok: false, text: `거부됨. ${why} 페이지 폴트가 나고 프로그램이 종료됩니다.` };
}

/* ── least privilege: what a compromised part can reach ── */

export interface Part {
  id: string;
  name: string;
  /** Capabilities this part needs to do its job. */
  needs: string[];
}

export const CAPS: { id: string; name: string }[] = [
  { id: 'files', name: '내 파일 읽기·쓰기' },
  { id: 'net', name: '아무 서버에나 접속' },
  { id: 'cookies', name: '다른 사이트의 로그인 정보' },
  { id: 'camera', name: '카메라와 마이크' },
  { id: 'gpu', name: '화면에 그리기' },
];

export const BROWSER_PARTS: Part[] = [
  { id: 'main', name: '브라우저 본체', needs: ['files', 'net', 'cookies', 'camera', 'gpu'] },
  { id: 'tab', name: '탭 하나 (웹 페이지)', needs: ['gpu'] },
  { id: 'net', name: '네트워크 담당', needs: ['net', 'cookies'] },
  { id: 'worker', name: '이 사이트의 Web Worker', needs: [] },
];

/** Capabilities an attacker gains by taking over `part`. In one big process everything is shared. */
export function reach(part: Part, split: boolean): string[] {
  return split ? part.needs : CAPS.map((c) => c.id);
}

/* ── buffer overflow on a simulated stack ── */

/** char buf[8]; then saved frame pointer (8 bytes); then the return address (8 bytes).
    gets() copies `input` into buf with no bounds check: byte 0 lands at the bottom of buf and
    the copy runs upward through the saved rbp and into the return address. */
export const BUF = 8;
export const RBP = 8;
export const RET = 8;
export const FRAME = BUF + RBP + RET; // 24

export type Defense = 'canary' | 'nx' | 'aslr' | 'bounds';

export interface Overflow {
  /** Bytes written into each region. */
  buf: number;
  rbp: number;
  ret: number;
  canary: number;
  smashedRbp: boolean;
  smashedRet: boolean;
  smashedCanary: boolean;
  /** What happens, given the defenses that are on. */
  outcome: 'ok' | 'crash-overrun' | 'canary-abort' | 'nx-blocked' | 'aslr-miss' | 'hijacked';
  text: string;
}

export const ASLR_BITS = 28;

/** Simulate gets(buf) with `len` bytes typed, under the chosen defenses.
    `payloadExec` = the overwritten return address points at bytes the attacker also wrote
    (classic code injection); otherwise it is a guessed address of existing code. */
export function overflow(len: number, def: Record<Defense, boolean>, payloadExec: boolean): Overflow {
  const canaryLen = def.canary ? 4 : 0; // a 4-byte guard between buf and saved rbp
  const copied = def.bounds ? Math.min(len, BUF - 1) : len; // fgets/strncpy stop at the buffer
  const buf = Math.min(copied, BUF);
  const afterBuf = Math.max(copied - BUF, 0);
  const canary = Math.min(afterBuf, canaryLen);
  const afterCanary = Math.max(afterBuf - canaryLen, 0);
  const rbp = Math.min(afterCanary, RBP);
  const ret = Math.min(Math.max(afterCanary - RBP, 0), RET);
  const smashedCanary = canary > 0;
  const smashedRet = ret > 0;
  const o: Overflow = { buf, rbp, ret, canary, smashedRbp: rbp > 0, smashedRet, smashedCanary, outcome: 'ok', text: '' };

  if (def.bounds) {
    o.outcome = 'ok';
    o.text = `경계를 검사하는 복사(fgets)가 ${BUF - 1}바이트에서 멈춰 끝 표시를 붙입니다. 아무리 길게 넣어도 돌아갈 주소는 그대로입니다. 입력이 잘릴 뿐 프로그램은 안전합니다.`;
    return o;
  }
  if (!smashedRet && !smashedCanary) {
    o.outcome = buf < len ? 'crash-overrun' : 'ok';
    o.text = smashedCanary
      ? ''
      : o.smashedRbp
        ? '저장된 프레임 포인터까지만 덮었습니다. 돌아갈 주소는 아직 그대로라, 함수가 끝나면 엉뚱한 곳을 스택 바닥으로 삼아 나중에 이상하게 동작할 수 있습니다.'
        : len <= BUF
          ? '입력이 버퍼 안에 들어갑니다. 아직 아무것도 넘치지 않았습니다.'
          : '버퍼를 넘었지만 아직 돌아갈 주소에는 닿지 않았습니다.';
    return o;
  }
  if (def.canary && smashedCanary) {
    o.outcome = 'canary-abort';
    o.text = `돌아갈 주소 앞에 둔 스택 카나리아(무작위 4바이트)가 덮였습니다. 함수는 return하기 직전 카나리아가 그대로인지 확인하고, 값이 바뀐 것을 발견해 바로 프로그램을 끝냅니다 (*** stack smashing detected ***). 공격자는 카나리아 값을 모르므로 같은 값으로 복원할 수 없습니다.`;
    return o;
  }
  // return address was overwritten and no canary caught it
  if (payloadExec && def.nx) {
    o.outcome = 'nx-blocked';
    o.text = '돌아갈 주소를 버퍼 속 입력(공격 코드)으로 돌렸지만, 스택 페이지에는 실행 금지(NX) 비트가 켜져 있습니다. CPU가 스택의 바이트를 명령어로 실행하려는 순간 거부하고 프로그램이 죽습니다. 코드 주입은 막혔습니다.';
    return o;
  }
  if (def.aslr) {
    o.outcome = 'aslr-miss';
    o.text = `돌아갈 주소를 이미 있는 함수(예: system)로 돌리려 해도, ASLR이 주소를 실행마다 ${ASLR_BITS}비트만큼 무작위로 옮깁니다. 공격자가 주소를 찍어 맞힐 확률은 약 2^-${ASLR_BITS}, 2억 6843만 분의 1입니다. 거의 항상 빗나가 프로그램이 엉뚱한 주소로 뛰어 죽습니다.`;
    return o;
  }
  o.outcome = 'hijacked';
  o.text = payloadExec
    ? '돌아갈 주소가 버퍼 속 공격 코드의 주소로 덮였습니다. 함수가 return하는 순간 CPU는 공격자가 넣은 코드로 뛰어 실행합니다. 방어 장치가 없으면 이렇게 프로그램의 흐름을 통째로 빼앗깁니다.'
    : '돌아갈 주소가 이미 있는 함수의 주소로 덮였습니다. 함수가 return하면 공격자가 고른 코드로 뜁니다. NX 비트를 피하려고 주입한 코드 대신 원래 있던 코드 조각을 이어 붙이는 이런 방식을 return-to-libc, 더 일반적으로 ROP라고 합니다.';
  return o;
}

import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import {
  ASLR_BITS,
  BROWSER_PARTS,
  BUF,
  CAPS,
  FRAME,
  INSTRS,
  PAGES,
  RBP,
  ACCESS_KO,
  checkAccess,
  overflow,
  reach,
  runInstr,
  syscallSteps,
  type Access,
  type Defense,
  type Mode,
} from './protect';
import './os.css';
import './protect.css';

/* ─────────────── Figure 1: privileged instructions ─────────────── */

function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className="pt-mode">
      모드 비트
      <b style={{ ['--c' as string]: mode === 'kernel' ? 'var(--bad)' : 'var(--good)' }}>{mode === 'kernel' ? 'K' : 'U'}</b>
      {mode === 'kernel' ? '커널 모드' : '사용자 모드'}
    </span>
  );
}

function PrivilegeFigure() {
  const [mode, setMode] = useState<Mode>('user');
  const [sel, setSel] = useState('cli');
  const ins = INSTRS.find((i) => i.id === sel)!;
  const res = runInstr(ins, mode);

  return (
    <Figure
      no={1}
      title="두 가지 모드, 두 가지 권한"
      hint="모드를 바꾸고 명령어를 눌러 보세요"
      caption={<>CPU는 언제나 두 모드 중 하나로 돕니다. 사용자 모드에서는 보통의 계산과 자기 메모리 접근만 할 수 있고, 다른 프로그램이나 장치에 영향을 주는 명령어는 CPU가 거부합니다. 커널 모드에서는 모두 할 수 있습니다. 운영체제만 커널 모드로 돕니다.</>}
    >
      <div className="controls row">
        <Seg
          label="지금 CPU 모드"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'user', label: '사용자 모드' },
            { value: 'kernel', label: '커널 모드' },
          ]}
        />
        <ModeBadge mode={mode} />
      </div>
      <div className="pt-instrs">
        {INSTRS.map((i) => (
          <button key={i.id} type="button" className="pt-instr" aria-pressed={i.id === sel} onClick={() => setSel(i.id)}>
            <code>{i.asm}</code>
            <span className="what" style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-xs)' }}>
              {i.what}
            </span>
            <span className="tag" data-priv={i.privileged || undefined}>
              {i.privileged ? '특권' : '일반'}
            </span>
          </button>
        ))}
      </div>
      <div className="os-note" data-bad={!res.ok || undefined} aria-live="polite" style={{ marginTop: 10 }}>
        <strong>{res.ok ? '실행 가능. ' : '거부됨. '}</strong>
        {res.text} {ins.privileged && <span style={{ color: 'var(--ink-3)' }}>{ins.why}</span>}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the path of a system call ─────────────── */

function SyscallFigure() {
  const [badPtr, setBadPtr] = useState(false);
  const steps = useMemo(() => syscallSteps(badPtr), [badPtr]);
  const s = useStepper(steps.length, 1.3, badPtr);
  const st = steps[s.i];

  return (
    <Figure
      no={2}
      title="시스템 호출이 벽을 넘는 길"
      hint="한 단계씩 넘기며 모드와 스택을 보세요"
      caption={<>사용자 프로그램이 화면에 글자를 쓰려면 커널에 부탁해야 합니다. 그 유일한 통로가 시스템 호출입니다. 왼쪽이 사용자 쪽, 오른쪽이 커널 쪽이고, 지금 단계가 일어나는 쪽이 진하게 표시됩니다. 모드 비트와 어느 스택을 쓰는지도 함께 바뀝니다.</>}
    >
      <div className="controls row">
        <Check label="buf가 커널 주소를 가리키게 (나쁜 포인터)" checked={badPtr} onChange={setBadPtr} />
        <ModeBadge mode={st.mode} />
      </div>
      <div className="pt-lanes" style={{ marginBottom: 10 }}>
        {(['user', 'kernel'] as const).map((side) => {
          const here = (st.where === 'user' && side === 'user') || (side === 'kernel' && st.where !== 'user');
          return (
            <div key={side} className="pt-lane" data-on={here || undefined} style={{ ['--c' as string]: side === 'kernel' ? 'var(--bad)' : 'var(--good)' }}>
              <h4>
                {side === 'user' ? '사용자 공간' : '커널 공간'}
                <span>{side === 'user' ? '권한 낮음' : '권한 높음'}</span>
              </h4>
              <pre>{here ? st.code : side === 'user' ? '프로그램이 기다립니다' : '커널이 대기 중입니다'}</pre>
              <span className="stack" data-on={st.stack === side || undefined}>
                {st.stack === side ? '▸ 이 스택을 씁니다' : ''}
              </span>
            </div>
          );
        })}
      </div>
      <StepControls s={s} id="pt-sys-speed" maxSpeed={6} />
      <div className="os-note" data-bad={st.bad || undefined} aria-live="polite" style={{ marginTop: 8 }}>
        {`${s.i + 1}단계. `}
        {st.note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: page permissions ─────────────── */

function PageFigure() {
  const [mode, setMode] = useState<Mode>('user');
  const [sel, setSel] = useState('code');
  const [acc, setAcc] = useState<Access>('write');
  const page = PAGES.find((p) => p.id === sel)!;
  const res = checkAccess(page, acc, mode);

  return (
    <Figure
      no={3}
      title="페이지마다 붙은 권한 비트"
      hint="페이지와 하려는 일을 골라 보세요"
      caption={<>같은 프로그램의 메모리라도 구역마다 권한이 다릅니다. 페이지 테이블의 각 줄에는 읽기(R), 쓰기(W), 실행(X) 비트와 커널 전용 비트가 있고, CPU가 메모리에 닿을 때마다 이 비트를 확인합니다. 가상 메모리의 페이지 테이블은 <a href={lessonHref('cs-operating-systems', 'virtual-memory')}>가상 메모리와 페이징</a> 장에서 다뤘습니다.</>}
    >
      <div className="controls row">
        <Seg
          label="모드"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'user', label: '사용자' },
            { value: 'kernel', label: '커널' },
          ]}
        />
        <Seg
          label="하려는 일"
          value={acc}
          onChange={setAcc}
          options={(['read', 'write', 'exec'] as Access[]).map((a) => ({ value: a, label: ACCESS_KO[a] }))}
        />
      </div>
      <div className="pr-wrap" style={{ marginBottom: 10 }}>
        <table className="pt-pages">
          <thead>
            <tr>
              <th>페이지</th>
              <th>R</th>
              <th>W</th>
              <th>X</th>
              <th>커널 전용</th>
            </tr>
          </thead>
          <tbody>
            {PAGES.map((p) => (
              <tr key={p.id} data-sel={p.id === sel || undefined}>
                <td>
                  <button type="button" onClick={() => setSel(p.id)} aria-pressed={p.id === sel}>
                    {p.name}
                  </button>
                </td>
                <td className="bit" data-on={p.r || undefined}>
                  {p.r ? '1' : '0'}
                </td>
                <td className="bit" data-on={p.w || undefined}>
                  {p.w ? '1' : '0'}
                </td>
                <td className="bit" data-on={p.x || undefined}>
                  {p.x ? '1' : '0'}
                </td>
                <td className="bit" data-on={p.kernelOnly || undefined}>
                  {p.kernelOnly ? '1' : '0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="os-note" data-bad={!res.ok || undefined} aria-live="polite">
        <strong>
          {page.name}에 {ACCESS_KO[acc]}: {res.ok ? '허락 ' : '거부 '}
        </strong>
        {res.text}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: buffer overflow and defenses ─────────────── */

const PRESETS = [3, 8, 16, 20, 24];

function regionOf(i: number, canaryOn: boolean) {
  const cl = canaryOn ? 4 : 0;
  if (i < BUF) return 'buf';
  if (i < BUF + cl) return 'canary';
  if (i < BUF + cl + RBP) return 'rbp';
  return 'ret';
}

function OverflowFigure() {
  const [len, setLen] = useState(3);
  const [payloadExec, setPayloadExec] = useState(true);
  const [def, setDef] = useState<Record<Defense, boolean>>({ canary: false, nx: false, aslr: false, bounds: false });
  const o = useMemo(() => overflow(len, def, payloadExec), [len, def, payloadExec]);
  const canaryOn = def.canary;
  const total = FRAME + (canaryOn ? 4 : 0);
  const written = (i: number) => {
    const r = regionOf(i, canaryOn);
    if (r === 'buf') return i < o.buf;
    if (r === 'canary') return i - BUF < o.canary;
    if (r === 'rbp') return i - BUF - (canaryOn ? 4 : 0) < o.rbp;
    return i - BUF - (canaryOn ? 4 : 0) - RBP < o.ret;
  };
  const toggle = (k: Defense) => setDef((d) => ({ ...d, [k]: !d[k] }));

  const REGION_C: Record<string, string> = { buf: 'var(--c-cs-4)', canary: 'var(--hl)', rbp: 'var(--c-cs-2)', ret: 'var(--bad)' };
  const REGION_KO: Record<string, string> = { buf: 'char buf[8]', canary: '카나리아', rbp: '저장된 rbp', ret: '돌아갈 주소' };
  const bad = o.outcome === 'hijacked';
  const safe = o.outcome === 'ok' || o.outcome === 'canary-abort' || o.outcome === 'nx-blocked' || o.outcome === 'aslr-miss';

  return (
    <Figure
      no={4}
      title="버퍼를 넘어 돌아갈 주소까지"
      hint="입력 길이를 늘려 돌아갈 주소를 덮어 보세요"
      caption={<>C 함수 하나의 스택 프레임입니다. 아래에서 위로 <code>char buf[8]</code>, 저장된 프레임 포인터 8바이트, 함수가 끝나면 뛸 돌아갈 주소 8바이트가 놓입니다. 경계를 검사하지 않는 <code>gets(buf)</code>는 입력을 buf의 맨 아래부터 위로 그대로 복사하므로, 8바이트를 넘으면 위 칸을 덮기 시작합니다. 스택 프레임의 생김새는 <a href={lessonHref('cs-architecture', 'stack-heap')}>스택과 힙</a> 장에서 다뤘습니다. 여기 주소와 바이트는 원리를 보이기 위한 모형입니다.</>}
    >
      <div className="controls row">
        <Slider id="pt-len" label="입력 길이 (바이트)" value={len} min={0} max={28} step={1} onChange={setLen} format={(v) => `${v}B`} />
        <div className="btn-row">
          {PRESETS.map((p) => (
            <Button key={p} small onClick={() => setLen(p)}>
              {p}B
            </Button>
          ))}
        </div>
      </div>
      <div className="fig-split">
        <div className="os-col">
          <div className="pt-bo-grid" role="img" aria-label={`스택 프레임 ${total}바이트. 입력 ${len}바이트를 넣어 buf ${o.buf}, ${canaryOn ? `카나리아 ${o.canary}, ` : ''}저장된 rbp ${o.rbp}, 돌아갈 주소 ${o.ret}바이트가 덮였습니다`}>
            {Array.from({ length: Math.ceil(total / 8) }, (_, row) => {
              // draw high address (return) at top, low (buf) at bottom
              const base = (Math.ceil(total / 8) - 1 - row) * 8;
              return (
                <div key={row} style={{ display: 'contents' }}>
                  <span className="pt-bo-addr">{regionLabel(base, canaryOn, REGION_KO)}</span>
                  {Array.from({ length: 8 }, (_, col) => {
                    const i = base + col;
                    if (i >= total) return <span key={col} />;
                    const r = regionOf(i, canaryOn);
                    const w = written(i);
                    return (
                      <span
                        key={col}
                        className="pt-bo-b"
                        style={w ? { background: `color-mix(in srgb, ${REGION_C[r]} 32%, var(--surface))`, borderColor: REGION_C[r] } : undefined}
                      >
                        <span className="ch" style={w ? { color: 'var(--ink)' } : undefined}>
                          {w ? 'A' : '·'}
                        </span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="os-chips" aria-hidden="true">
            {(canaryOn ? ['buf', 'canary', 'rbp', 'ret'] : ['buf', 'rbp', 'ret']).map((r) => (
              <span key={r} className="os-chip" data-c style={{ ['--c' as string]: REGION_C[r] }}>
                {REGION_KO[r]}
              </span>
            ))}
          </div>
        </div>
        <div className="controls">
          <div className="os-small">방어 장치</div>
          <Check label="스택 카나리아 (돌아갈 주소 앞 무작위 값)" checked={def.canary} onChange={() => toggle('canary')} />
          <Check label="NX 비트 (스택을 실행 금지)" checked={def.nx} onChange={() => toggle('nx')} />
          <Check label={`ASLR (주소를 ${ASLR_BITS}비트 무작위로)`} checked={def.aslr} onChange={() => toggle('aslr')} />
          <Check label="경계 검사 복사 (gets 대신 fgets)" checked={def.bounds} onChange={() => toggle('bounds')} />
          <Seg
            label="돌아갈 주소를 어디로"
            value={payloadExec ? 'inject' : 'reuse'}
            onChange={(v) => setPayloadExec(v === 'inject')}
            options={[
              { value: 'inject', label: '넣은 코드로' },
              { value: 'reuse', label: '있는 코드로' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="돌아갈 주소" value={o.smashedRet ? '덮임' : '그대로'} color={o.smashedRet ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="결과" value={bad ? '흐름 탈취' : safe ? '막힘' : '진행'} color={bad ? 'var(--bad)' : safe && o.outcome !== 'ok' ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>
      <div className="os-note" data-bad={bad || undefined} data-good={safe && o.outcome !== 'ok' ? '' : undefined} aria-live="polite">
        {o.text || '입력을 늘려 보세요.'}
      </div>
    </Figure>
  );
}

function regionLabel(base: number, canaryOn: boolean, ko: Record<string, string>) {
  const r = regionOf(base, canaryOn);
  const top = regionOf(base + 7, canaryOn);
  return r === top ? ko[r] : ko[top];
}

/* ─────────────── Figure 5: least privilege ─────────────── */

function LeastPrivilegeFigure() {
  const [sel, setSel] = useState('tab');
  const [split, setSplit] = useState(true);
  const part = BROWSER_PARTS.find((p) => p.id === sel)!;
  const got = reach(part, split);

  return (
    <Figure
      no={5}
      title="최소 권한: 뚫려도 손이 닿는 곳만"
      hint="어느 부분이 뚫렸다고 보고, 나누기를 켜 보세요"
      caption={<>보안은 벽 하나로 끝나지 않습니다. 벽이 뚫릴 것을 가정하고, 각 부분에 꼭 필요한 권한만 주면 한 곳이 뚫려도 피해가 그 권한 안에 갇힙니다. 브라우저는 웹 페이지마다 권한이 거의 없는 별도 프로세스에 가두고, 파일과 네트워크는 본체에만 맡깁니다. 이 사이트의 코드 실행 상자도 같은 생각으로 권한 없는 Web Worker에서 돕니다.</>}
    >
      <div className="controls row">
        <Seg label="뚫린 부분" value={sel} onChange={setSel} options={BROWSER_PARTS.map((p) => ({ value: p.id, label: p.name }))} />
        <Check label="권한을 부분별로 나눔 (샌드박스)" checked={split} onChange={setSplit} />
      </div>
      <div className="pt-scroll">
        <table className="pt-matrix">
          <thead>
            <tr>
              <th>권한</th>
              {CAPS.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BROWSER_PARTS.map((p) => {
              const r = reach(p, split);
              return (
                <tr key={p.id} data-sel={p.id === sel || undefined}>
                  <td>{p.name}</td>
                  {CAPS.map((c) => {
                    const has = r.includes(c.id);
                    const lost = p.id === sel && has;
                    return (
                      <td key={c.id} className="cap" data-has={has || undefined} data-lost={lost || undefined}>
                        {has ? '●' : '·'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="os-note" data-bad={got.length > 1 || undefined} aria-live="polite" style={{ marginTop: 10 }}>
        <strong>{part.name}이 뚫리면: </strong>
        {split
          ? got.length === 0
            ? '아무 권한도 없어 공격자가 할 수 있는 일이 없습니다. 이 사이트의 Web Worker가 이 경우입니다.'
            : `공격자는 ${got.map((g) => CAPS.find((c) => c.id === g)!.name).join(', ')}만 손에 넣습니다. 나머지는 벽 너머라 닿지 못합니다.`
          : '권한을 나누지 않으면 한 곳만 뚫려도 공격자가 모든 권한을 가집니다. 내 파일, 로그인 정보, 카메라까지 전부 열립니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Protection() {
  return (
    <>
      <h2>버그 하나가 컴퓨터 전체를 망가뜨리지 않는 이유</h2>
      <p>
        지금 이 글을 읽는 동안에도 컴퓨터에서는 프로그램 수십 개가 함께 돌고 있습니다. 그중 하나에 버그가 있거나 악성 코드가 섞여 있어도, 보통은 그 프로그램만 죽고 나머지는 멀쩡합니다. 한 웹 페이지의 자바스크립트가 다른 탭의 은행 로그인 정보를 읽지 못하고, 내려받은 프로그램이 마음대로 디스크를 지우지 못합니다. 이것은 저절로 되는 일이 아니라, CPU와 운영체제가 함께 세운 벽 덕분입니다.
      </p>
      <p>
        그 벽의 뿌리는 CPU가 언제나 두 모드 중 하나로 돈다는 사실입니다. <T en="user mode">사용자 모드</T>에서는 보통의 계산과 자기 몫 메모리 접근만 할 수 있습니다. <T en="kernel mode">커널 모드</T>에서는 무엇이든 할 수 있습니다. 운영체제의 핵심인 <T en="kernel">커널</T>만 커널 모드로 돌고, 우리가 쓰는 모든 프로그램은 사용자 모드로 돕니다. 장치를 직접 다루거나 인터럽트를 끄는 것처럼 다른 프로그램에 영향을 주는 명령어는 <T en="privileged instruction">특권 명령</T>이라 하여, 사용자 모드에서 실행하려 하면 CPU가 거부합니다.
      </p>
      <PrivilegeFigure />
      <p>
        <code>add</code>나 자기 메모리를 읽는 <code>mov</code>은 사용자 모드에서도 됩니다. 하지만 인터럽트를 끄는 <code>cli</code>를 사용자 모드에서 실행하려 하면 CPU가 거부합니다. 만약 허락한다면, 그 프로그램은 타이머 인터럽트를 꺼서 운영체제가 CPU를 되찾지 못하게 하고 <a href={lessonHref('cs-operating-systems', 'scheduling')}>스케줄링</a>을 무력화할 수 있습니다. 모드 비트 하나가 이런 명령을 운영체제만의 것으로 지켜 줍니다.
      </p>

      <h2>그렇다면 화면에는 어떻게 글자를 쓸까</h2>
      <p>
        사용자 프로그램이 장치를 직접 다루지 못한다면, 파일을 저장하거나 화면에 글자를 쓰는 일은 어떻게 할까요? 커널에 <strong>부탁</strong>합니다. 이 부탁의 통로가 <T en="system call">시스템 호출</T>입니다. 프로그램은 하고 싶은 일의 번호와 인자를 정해진 레지스터에 넣고 <code>syscall</code> 명령을 실행합니다. 그 순간 CPU가 모드 비트를 커널 모드로 바꾸고, 커널이 미리 정해 둔 진입점으로 점프합니다. 프로그램은 진입점을 마음대로 고를 수 없으므로, 커널 코드의 아무 데로나 뛰어들 수 없습니다.
      </p>
      <SyscallFigure />
      <p>
        중요한 것은 커널이 사용자가 넘긴 값을 하나도 믿지 않는다는 점입니다. "buf가 커널 주소를 가리키게"를 켜 보세요. 프로그램이 커널 메모리 주소를 넘기며 그 내용을 화면에 써 달라고 하면, 커널은 그 주소가 사용자 주소 공간 안에 있는지 먼저 검사하고 아니면 거부합니다. 이 검사를 빠뜨리면 프로그램이 커널에게 커널 자신의 비밀번호 저장 공간을 읽어 달라고 부탁할 수 있습니다. 실제 커널 취약점의 상당수가 바로 이런 인자 검사의 빈틈에서 나옵니다.
      </p>
      <Callout kind="note">
        모드를 바꾸고 레지스터를 저장했다가 되돌리는 시스템 호출은 보통의 함수 호출보다 훨씬 비쌉니다. 그래서 운영체제는 한 번의 시스템 호출로 여러 일을 처리하게 하거나(한 번에 여러 바이트 쓰기), 자주 쓰는 정보는 커널이 사용자 쪽 메모리에 미리 올려 두어 호출 없이 읽게 합니다(리눅스의 vDSO로 읽는 현재 시각 등).
      </Callout>

      <h2>메모리에도 권한이 있다</h2>
      <p>
        모드가 명령어를 지킨다면, 메모리는 무엇이 지킬까요? <a href={lessonHref('cs-operating-systems', 'virtual-memory')}>가상 메모리</a>에서 각 프로그램은 자기만의 주소 공간을 가진다고 했습니다. 그 페이지 테이블의 각 줄에는 주소 변환뿐 아니라 권한 비트도 들어 있습니다. 읽기(R), 쓰기(W), 실행(X), 그리고 커널 전용 비트입니다. CPU는 메모리에 닿을 때마다 이 비트를 확인하고, 어긋나면 페이지 폴트를 일으킵니다.
      </p>
      <PageFigure />
      <p>
        코드 페이지는 읽기와 실행만 켜져 있고 쓰기는 꺼져 있습니다. 그래서 버그가 있어도 프로그램이 자기 명령어를 덮어쓸 수 없습니다. 스택과 힙은 읽기·쓰기는 되지만 실행은 꺼져 있습니다. 이 "쓸 수 있으면 실행할 수 없고, 실행할 수 있으면 쓸 수 없다"는 원칙이 다음에 볼 공격을 막는 중요한 장치가 됩니다. 커널 페이지는 사용자 모드에서 읽기조차 막혀 있습니다.
      </p>

      <h2>벽을 넘으려는 공격: 버퍼 오버플로</h2>
      <p>
        지금까지는 운영체제가 세운 벽을 봤습니다. 이제 그 벽을 넘으려는 가장 고전적인 공격을 보겠습니다. C에는 배열에 값을 넣을 때 크기를 넘는지 검사하지 않는 함수가 있습니다. <code>gets(buf)</code>는 입력을 <code>buf</code>에 그대로 복사하는데, 입력이 <code>buf</code>보다 길면 그 뒤의 메모리까지 덮어씁니다. <a href={lessonHref('cs-architecture', 'stack-heap')}>스택과 힙</a>에서 봤듯이 스택 프레임에는 지역 변수 바로 위에 함수가 끝나면 뛸 <T en="return address">돌아갈 주소</T>가 있습니다. 입력이 그 주소까지 닿으면, 공격자가 함수가 돌아갈 곳을 정할 수 있습니다.
      </p>
      <OverflowFigure />
      <p>
        방어 장치를 모두 끈 채 입력을 8바이트 넘게 넣어 보세요. 16바이트에서 저장된 프레임 포인터가, 20바이트부터 돌아갈 주소가 덮이기 시작합니다. 아무 방어도 없으면 돌아갈 주소를 버퍼에 넣어 둔 공격 코드로 돌려 흐름을 통째로 빼앗깁니다. 이제 방어 장치를 하나씩 켜 보면, 각각 다른 길목을 막는 것을 볼 수 있습니다.
      </p>
      <ul>
        <li>
          <T en="stack canary">스택 카나리아</T>: 돌아갈 주소 앞에 무작위 값을 두고, 함수가 끝나기 직전 그 값이 그대로인지 확인합니다. 오버플로가 주소를 덮으려면 반드시 카나리아를 먼저 지나므로, 값이 바뀐 것을 발견해 프로그램을 즉시 멈춥니다. 공격자는 무작위 값을 모릅니다.
        </li>
        <li>
          <T en="NX bit">실행 금지 비트</T>: 스택 페이지의 실행 비트를 꺼 둡니다. 돌아갈 주소를 버퍼 속 코드로 돌려도, CPU가 스택의 바이트를 명령어로 실행하려는 순간 거부합니다. "넣은 코드로" 공격을 막습니다.
        </li>
        <li>
          <T en="ASLR">주소 공간 배치 무작위화</T>: 실행할 때마다 스택과 라이브러리의 위치를 무작위로 옮깁니다. NX를 피하려고 이미 있는 함수로 돌아가려 해도, 그 주소가 매번 바뀌어 찍어 맞히기 어렵습니다. 이 모형에서는 약 {Math.pow(2, ASLR_BITS).toLocaleString('ko-KR')}분의 1 확률이라 거의 항상 빗나갑니다.
        </li>
        <li>
          <T en="bounds-checked copy">경계 검사 복사</T>: 처음부터 <code>gets</code> 대신 길이를 받는 <code>fgets</code>나 <code>strncpy</code>를 쓰면, 복사가 버퍼 끝에서 멈춰 돌아갈 주소에 아예 닿지 못합니다. 앞의 셋이 공격을 어렵게 만드는 방어라면, 이것은 구멍 자체를 없애는 방어입니다.
        </li>
      </ul>
      <p>
        "넣은 코드로"와 NX 비트를 켜 둔 상태에서 "있는 코드로"를 골라 보세요. 공격자는 새 코드를 넣는 대신 프로그램에 이미 있는 코드 조각으로 돌아갑니다. NX는 새 코드 실행만 막을 뿐, 원래 있던 코드로 뛰는 것은 막지 못하기 때문입니다. 이렇게 조각을 이어 붙이는 방식을 return-to-libc, 더 일반적으로 <T en="return-oriented programming">ROP</T>라고 합니다. 이때는 ASLR이 중요한 방어가 됩니다. 조각들의 주소를 알 수 없으면 이어 붙일 수 없기 때문입니다. 하나의 장치로 모든 공격을 막을 수 없어서, 실제 시스템은 이 방어들을 겹쳐 씁니다.
      </p>
      <Callout kind="warn">
        이 그림은 공격을 막는 원리를 보이기 위한 모형입니다. Rust 같은 언어는 아예 경계를 넘는 접근을 컴파일 때나 실행 때 막아, 이런 종류의 버그를 처음부터 없애려 합니다. <a href={lessonHref('cs-software-design', 'types')}>타입으로 실수 막기</a>와 같은 생각입니다.
      </Callout>

      <h2>벽이 뚫릴 것을 가정하기</h2>
      <p>
        방어를 아무리 겹쳐도 언젠가 하나는 뚫립니다. 그래서 현대 보안의 핵심 원칙은 <T en="least privilege">최소 권한</T>입니다. 각 부분에 제 일에 꼭 필요한 권한만 주면, 한 곳이 뚫려도 피해가 그 권한 안에 갇힙니다. 프로그램을 권한이 거의 없는 울타리 안에 가두는 것을 <T en="sandboxing">샌드박스</T>라고 합니다.
      </p>
      <LeastPrivilegeFigure />
      <p>
        브라우저가 좋은 예입니다. 웹 페이지의 코드는 파일이나 네트워크에 직접 손대지 못하는 별도 프로세스에 갇혀 돌고, 그런 일은 모두 본체에 부탁합니다. 그래서 한 페이지가 악성 코드에 뚫려도 공격자가 얻는 것은 그 탭을 그리는 권한뿐이고, 다른 탭의 로그인 정보나 디스크에는 닿지 못합니다. 이 사이트에서 여러분이 고쳐 실행하는 코드도 같은 생각으로, 페이지와 분리된 권한 없는 Web Worker에서 1초 제한으로 돕니다. 뚫려도 할 수 있는 일이 없습니다.
      </p>

      <Callout kind="key">
        운영체제의 보호는 CPU의 두 모드에서 시작합니다. 사용자 모드는 특권 명령을 쓸 수 없고, 커널에 일을 부탁하는 유일한 통로가 시스템 호출입니다. 커널은 넘겨받은 인자를 모두 검사합니다. 메모리는 페이지마다 읽기·쓰기·실행·커널 전용 비트로 지켜집니다. 버퍼 오버플로 같은 공격은 이 벽을 넘으려 하고, 스택 카나리아, NX 비트, ASLR, 경계 검사가 각각 다른 길목을 막습니다. 어떤 방어도 완벽하지 않으므로, 최소 권한과 샌드박스로 뚫렸을 때의 피해를 가둡니다.
      </Callout>
      <Quiz
        q="어떤 프로그램에 스택 버퍼 오버플로 버그가 있다. NX 비트와 스택 카나리아는 켜져 있지만 ASLR은 꺼져 있다. 공격자가 흐름을 빼앗을 가능성이 가장 높은 길은?"
        options={[
          '스택에 공격 코드를 넣고 그 주소로 돌아간다',
          '카나리아를 0으로 덮어쓴다',
          '이미 있는 라이브러리 코드 조각들을 이어 붙여(ROP) 돌아간다',
          '사용자 모드에서 cli 명령을 실행한다',
        ]}
        answer={2}
        explain={<>NX 비트가 켜져 있으면 스택에 넣은 코드는 실행되지 않으므로 코드 주입은 막힙니다. 하지만 ASLR이 꺼져 있어 라이브러리와 코드의 주소가 실행마다 같으므로, 공격자는 이미 있는 코드 조각들의 주소를 알아내 이어 붙이는 ROP로 흐름을 빼앗을 수 있습니다. 카나리아는 무작위 값이라 원하는 값으로 복원할 수 없고, 돌아갈 주소를 덮으려면 반드시 카나리아를 지나므로 먼저 걸립니다. cli는 이 공격과 관계가 없습니다. 그래서 NX와 ASLR은 함께 켜야 효과가 있습니다.</>}
      />
    </>
  );
}

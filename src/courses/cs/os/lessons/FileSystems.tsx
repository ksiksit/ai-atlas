import { useMemo, useState, type MouseEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { hatch, text } from './draw';
import { DATA_START, DIRECT, MAX_FILE, NBLOCKS, PART_KO, PER_IND, TREE, WRITES, WRITE_KO, blockMap, fileBlocks, fsAppend, fsCreate, fsDelete, fsStart, lookupSteps, verdictJournal, verdictNoJournal, type Fs, type JMode, type LookStep, type Part, type Verdict } from './fs';
import { PROC_CSS, procColor } from './procs';
import './os.css';

/* ─────────────── Figure 1: blocks, inodes and pointers ─────────────── */

const COLS = 8;
const NEW_NAMES = ['song.mp3', 'log.txt', 'a.out', 'data.csv', 'memo.md', 'img.png', 'b.zip', 'c.pdf'];
/** The k-th new file name; after one round the names get a number (log2.txt) so none repeats. */
const newName = (k: number) => {
  const base = NEW_NAMES[k % NEW_NAMES.length];
  const round = Math.floor(k / NEW_NAMES.length);
  if (!round) return base;
  const dot = base.lastIndexOf('.');
  return `${base.slice(0, dot)}${round + 1}${base.slice(dot)}`;
};

function DiskFigure() {
  const P = usePalette();
  const [fs, setFs] = useState<Fs>(fsStart);
  const [sel, setSel] = useState(2);
  const [size, setSize] = useState(3);
  const [nameIdx, setNameIdx] = useState(0);
  const [msg, setMsg] = useState('notes.txt(2블록), photo.jpg(6블록), todo.md(1블록)이 있는 디스크입니다. photo.jpg는 직접 포인터 4개로 모자라 간접 블록을 하나 씁니다.');
  const map = useMemo(() => blockMap(fs), [fs]);
  const file = fs.files.find((f) => f.ino === sel) ?? null;
  const free = fs.used.slice(DATA_START).filter((u) => !u).length;

  const create = () => {
    const name = newName(nameIdx);
    const r = fsCreate(fs, name, size);
    if (r.ino < 0) {
      setMsg('아이노드가 모두 찼습니다.');
      return;
    }
    setFs(r.fs);
    setSel(r.ino);
    setNameIdx((x) => x + 1);
    const f = r.fs.files.find((x) => x.ino === r.ino)!;
    const blocks = fileBlocks(f);
    setMsg(`${name}: 아이노드 ${r.ino}번을 받고 블록 ${blocks.join(', ')}에 썼습니다.${f.indirect >= 0 ? ` 직접 포인터 ${DIRECT}개로 모자라 간접 블록 ${f.indirect}을 할당했습니다.` : ''}${!r.ok ? ' 디스크나 파일 최대 크기가 모자라 일부만 썼습니다.' : ''}`);
  };
  const append = () => {
    if (!file) return;
    const before = fileBlocks(file).length;
    const hadInd = file.indirect >= 0;
    const r = fsAppend(fs, file.ino, 2);
    const f = r.fs.files.find((x) => x.ino === file.ino)!;
    const added = fileBlocks(f).slice(before);
    setFs(r.fs);
    if (!added.length) setMsg(`${file.name}: 더 늘릴 수 없습니다 (이 장난감 파일 시스템의 최대 파일 크기는 ${MAX_FILE}블록).`);
    else setMsg(`${file.name}: 블록 ${added.join(', ')}을 덧붙였습니다.${!hadInd && f.indirect >= 0 ? ` 직접 포인터가 바닥나 간접 블록 ${f.indirect}부터 할당했습니다.` : ''} 비어 있는 첫 블록을 고르므로 파일이 디스크 여기저기에 흩어질 수 있습니다.`);
  };
  const remove = () => {
    if (!file) return;
    setFs(fsDelete(fs, file.ino));
    setMsg(`${file.name}: 아이노드와 블록 ${fileBlocks(file).length + (file.indirect >= 0 ? 1 : 0)}개를 비트맵에서 비움으로 표시했습니다. 블록의 내용은 지우지 않으므로, 덮어쓰기 전까지는 디스크에 그대로 남아 있습니다.`);
    setSel(-1);
  };

  const geo = (w: number) => {
    const cs = Math.min(52, Math.floor((w - 4) / COLS));
    return { cs, ox: Math.floor((w - cs * COLS) / 2), oy: 2 };
  };
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const { cs, ox, oy } = geo(w);
      for (let b = 0; b < NBLOCKS; b++) {
        const x = ox + (b % COLS) * cs;
        const y = oy + Math.floor(b / COLS) * cs;
        const info = map[b];
        const f = info.ino >= 0 ? fs.files.find((z) => z.ino === info.ino)! : null;
        const mine = f !== null && f.ino === sel;
        const col = f ? procColor(P, f.color) : P.ink3;
        const g = 2;
        if (info.kind === 'free') {
          ctx.fillStyle = P.surface;
          ctx.fillRect(x + g, y + g, cs - 2 * g, cs - 2 * g);
          ctx.strokeStyle = P.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + g + 0.5, y + g + 0.5, cs - 2 * g - 1, cs - 2 * g - 1);
        } else if (info.kind === 'data') {
          ctx.fillStyle = mine ? col : alpha(col, sel >= 0 ? 0.35 : 0.75);
          ctx.fillRect(x + g, y + g, cs - 2 * g, cs - 2 * g);
        } else if (info.kind === 'ind') {
          ctx.fillStyle = P.surface;
          ctx.fillRect(x + g, y + g, cs - 2 * g, cs - 2 * g);
          hatch(ctx, x + g, y + g, cs - 2 * g, cs - 2 * g, mine ? col : alpha(col, 0.5), 4, 1.5);
          ctx.strokeStyle = mine ? col : alpha(col, 0.6);
          ctx.lineWidth = 2;
          ctx.strokeRect(x + g + 1, y + g + 1, cs - 2 * g - 2, cs - 2 * g - 2);
        } else {
          ctx.fillStyle = P.surface3;
          ctx.fillRect(x + g, y + g, cs - 2 * g, cs - 2 * g);
        }
        if (mine) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + g - 1, y + g - 1, cs - 2 * g + 2, cs - 2 * g + 2);
        }
        text(ctx, String(b), x + 4, y + 9, info.kind === 'data' && (mine || sel < 0) ? alpha(P.surface, 0.85) : P.ink3, `${cs < 40 ? 8 : 9}px ${P.fontMono}`);
        if (info.label) {
          const light = info.kind === 'data' && (mine || sel < 0);
          text(ctx, info.label, x + cs / 2, y + cs / 2 + 4, light ? P.surface : info.kind === 'ind' ? P.ink : P.ink2, `700 ${cs < 40 ? 11 : 13}px ${P.fontMono}`, 'center');
        }
      }
    },
    [P, fs, map, sel],
    { aspect: 1, maxHeight: 420, minHeight: 200 },
  );

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { cs: c, ox, oy } = geo(r.width);
    const col = Math.floor((e.clientX - r.left - ox) / c);
    const row = Math.floor((e.clientY - r.top - oy) / c);
    if (col < 0 || col >= COLS || row < 0) return;
    const b = row * COLS + col;
    if (b < NBLOCKS && map[b].ino >= 0) setSel(map[b].ino);
  };

  return (
    <Figure
      no={1}
      title="디스크 블록 64개 위의 파일 시스템"
      hint="파일을 만들고, 늘리고, 지워 보세요"
      caption={
        <>
          칸 하나가 블록 하나이고 왼쪽 위 작은 숫자가 블록 번호입니다. 0번은 슈퍼블록(S), 1·2번은 아이노드와 데이터 블록이 비었는지 적는 비트맵(iB, dB), 3·4번은 아이노드 테이블(I), 5번은 루트 디렉터리의 내용(/)입니다. 색칠한 칸은 파일의 데이터 블록으로, 안의 숫자는 파일에서 몇 번째 블록인지입니다. 빗금 친 칸(→)은 포인터만 담은 간접 블록입니다. 장난감답게 아이노드에는 직접 포인터 {DIRECT}개와 간접 포인터 1개가 있고, 간접 블록 하나에는 포인터가 {PER_IND}개 들어간다고 두었습니다. 칸을 누르면 그 파일을 고릅니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="os-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`디스크 블록 ${NBLOCKS}개. ${fs.files.map((f) => `${f.name}: 블록 ${fileBlocks(f).join(', ')}${f.indirect >= 0 ? `, 간접 블록 ${f.indirect}` : ''}`).join('; ')}. 빈 데이터 블록 ${free}개`}>
            <canvas ref={canvasRef} onClick={onClick} style={{ cursor: 'pointer' }} />
          </div>
          <div className="os-note" aria-live="polite">
            {msg}
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>파일 (아이노드)</span>
            </span>
            <div className="file-list" role="group" aria-label="파일 고르기">
              {fs.files.map((f) => (
                <button key={f.ino} type="button" className="file-btn" aria-pressed={f.ino === sel} style={{ ['--c' as string]: PROC_CSS[f.color] }} onClick={() => setSel(f.ino)}>
                  <i aria-hidden="true" />
                  {f.name}
                </button>
              ))}
              {!fs.files.length && <span className="os-empty">파일 없음</span>}
            </div>
          </div>
          {file ? (
            <div className="inode-view">
              <span className="ttl">
                아이노드 {file.ino} · {file.name}
              </span>
              <div className="row">
                <span>크기</span>
                <span className="mono">
                  {fileBlocks(file).length}블록 ({fileBlocks(file).length * 4}KB)
                </span>
              </div>
              <div className="row">
                <span>직접 포인터</span>
                <span className="mono">[{Array.from({ length: DIRECT }, (_, k) => file.direct[k] ?? '–').join(', ')}]</span>
              </div>
              <div className="row">
                <span>간접 포인터</span>
                <span className="mono">{file.indirect >= 0 ? `블록 ${file.indirect} → [${file.more.join(', ')}]` : '없음'}</span>
              </div>
            </div>
          ) : (
            <div className="os-small">파일을 고르면 아이노드의 내용이 여기에 보입니다.</div>
          )}
          <Slider id="fs-size" label="새 파일 크기 (블록)" value={size} min={1} max={MAX_FILE} step={1} onChange={setSize} />
          <div className="btn-row">
            <Button small primary onClick={create} disabled={free === 0}>
              새 파일 {newName(nameIdx)}
            </Button>
            <Button small onClick={append} disabled={!file || free === 0}>
              2블록 덧붙이기
            </Button>
            <Button small onClick={remove} disabled={!file}>
              지우기
            </Button>
            <Button
              small
              onClick={() => {
                setFs(fsStart());
                setSel(2);
                setNameIdx(0);
              }}
            >
              처음 상태로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="빈 데이터 블록" value={`${free} / ${NBLOCKS - DATA_START}`} />
            <Readout label="파일 수" value={`${fs.files.length}개`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--surface-3)', label: '메타데이터 (S, iB, dB, I, /)', shape: 'sq' },
          { color: 'var(--ink-3)', label: '빗금: 간접 블록', shape: 'ln' },
          { color: 'var(--line-strong)', label: '흰 칸: 빈 블록', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: finding /home/me/notes.txt ─────────────── */

const PATHS = ['/home/me/notes.txt', '/etc/hosts', '/home/me/photos/cat.jpg', '/home/you/todo.txt'];

function stepReads(st: LookStep) {
  return st.kind === 'data' ? st.blocks.length : st.kind === 'error' ? 0 : 1;
}

function stepNote(st: LookStep): string {
  if (st.kind === 'inode') {
    const n = TREE[st.ino];
    return `아이노드 ${st.ino}을 읽습니다. ${n.dir ? `디렉터리이고, 내용은 블록 ${n.blocks.join(', ')}에 있습니다.` : `일반 파일이고, 데이터는 블록 ${n.blocks.join(', ')}에 있습니다.`}`;
  }
  if (st.kind === 'dir') return st.found >= 0 ? `블록 ${st.block}(디렉터리 ${TREE[st.ino].name}의 내용)에서 이름 "${st.want}"를 찾았습니다. 아이노드 번호는 ${st.found}입니다.` : `블록 ${st.block}에 "${st.want}"라는 이름이 없습니다.`;
  if (st.kind === 'data') return `드디어 파일 내용입니다. 블록 ${st.blocks.join(', ')}을 읽습니다.`;
  return `ENOENT (No such file or directory): "${st.want}"가 없어 open()이 실패합니다.`;
}

function PathFigure() {
  const [path, setPath] = useState(PATHS[0]);
  const [cached, setCached] = useState(false);
  const steps = useMemo(() => lookupSteps(path, cached), [path, cached]);
  const s = useStepper(steps.length, 1.5, `${path}|${cached}`);
  const reads = steps.slice(0, s.i + 1).reduce((a, st) => a + stepReads(st), 0);
  const total = steps.reduce((a, st) => a + stepReads(st), 0);
  const cur = steps[s.i];
  const comps = path.split('/').filter(Boolean);
  const wanted = cur.kind === 'dir' || cur.kind === 'error' ? cur.want : null;

  return (
    <Figure
      no={2}
      title="경로 하나를 따라 디스크 읽기"
      hint="경로를 고르고 한 단계씩 넘겨 보세요"
      caption={
        <>
          카드 하나가 디스크 읽기 한 번(데이터는 블록 수만큼)입니다. 아이노드 카드는 그 파일의 정보, 블록 카드는 디렉터리의 내용인 "이름 → 아이노드 번호" 표입니다. 루트 디렉터리의 아이노드 번호(여기서는 리눅스 ext 계열처럼 2번)는 파일 시스템이 미리 알고 있습니다. 캐시를 켜면 운영체제가 최근에 찾은 경로를 메모리에 기억해 둔 경우입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="경로" value={path} onChange={setPath} options={PATHS.map((p) => ({ value: p, label: p }))} />
      </div>
      <div className="os-chips" aria-label="경로 구성 요소">
        <span className="lbl">경로</span>
        <span className="os-chip" data-c="" style={{ ['--c' as string]: 'var(--ink-3)' }}>
          /
        </span>
        {comps.map((c, k) => (
          <span key={k} className="os-chip" data-c="" data-on={c === wanted || undefined} style={{ ['--c' as string]: c === wanted ? 'var(--hl)' : 'var(--ink-3)', color: c === wanted ? '#1a1a1a' : undefined }}>
            {c}
          </span>
        ))}
      </div>
      <div className="fs-cards" aria-live="polite">
        {steps.map((st, k) => {
          const state = k > s.i ? 'future' : k === s.i ? 'cur' : 'done';
          if (st.kind === 'inode') {
            const n = TREE[st.ino];
            return (
              <div key={k} className="fs-card" data-s={state} style={{ ['--c' as string]: n.dir ? 'var(--accent)' : 'var(--pos)' }}>
                <span className="ttl">
                  <span>아이노드 {st.ino}</span>
                  <span className="kind">{n.dir ? '디렉터리' : '파일'}</span>
                </span>
                <span className="row">
                  <span>이름(참고)</span>
                  <span>{n.name}</span>
                </span>
                <span className="row">
                  <span>블록</span>
                  <span>[{n.blocks.join(', ')}]</span>
                </span>
              </div>
            );
          }
          if (st.kind === 'dir') {
            const n = TREE[st.ino];
            return (
              <div key={k} className="fs-card" data-s={state}>
                <span className="ttl">
                  <span>블록 {st.block}</span>
                  <span className="kind">{n.name}의 목록</span>
                </span>
                {n.entries!.map(([nm, ino]) => (
                  <span key={nm} className="row" data-hit={(state !== 'future' && nm === st.want) || undefined}>
                    <span>{nm}</span>
                    <span>{ino}</span>
                  </span>
                ))}
              </div>
            );
          }
          if (st.kind === 'data') {
            return (
              <div key={k} className="fs-card" data-s={state} style={{ ['--c' as string]: 'var(--good)' }}>
                <span className="ttl">
                  <span>블록 {st.blocks.join(', ')}</span>
                  <span className="kind">내용</span>
                </span>
                <span className="row">
                  <span>{TREE[st.ino].name}</span>
                  <span>{st.blocks.length * 4}KB</span>
                </span>
              </div>
            );
          }
          return (
            <div key={k} className="fs-card" data-s={state} style={{ ['--c' as string]: 'var(--bad)', borderColor: 'var(--bad)' }}>
              <span className="ttl">
                <span>오류</span>
                <span className="kind">ENOENT</span>
              </span>
              <span className="row">
                <span>{st.want}</span>
                <span>없음</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="fig-split">
        <div className="os-note" data-bad={cur.kind === 'error' || undefined}>
          {stepNote(cur)}
        </div>
        <div className="controls">
          <Check label="경로 캐시(dentry)에 이미 있음" checked={cached} onChange={setCached} />
          <StepControls s={s} id="path-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="지금까지 디스크 읽기" value={`${reads}번`} />
            <Readout label="전체" value={`${total}번`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a crash in the middle of an append ─────────────── */

const TONE: Record<Verdict['tone'], string> = { good: 'var(--good)', warn: 'var(--hl)', bad: 'var(--bad)' };
const NEW_VAL: Record<Part, string> = { bitmap: '블록 40 = 사용 중', inode: '블록 4개 [..., 40]', data: '새 내용' };
const OLD_VAL: Record<Part, string> = { bitmap: '블록 40 = 비어 있음', inode: '블록 3개', data: '지운 파일의 찌꺼기' };

function CrashFigure() {
  const [mode, setMode] = useState<JMode>('none');
  const [w, setW] = useState<Record<Part, boolean>>({ bitmap: false, inode: true, data: false });
  const [crash, setCrash] = useState(3);
  const seq = mode === 'none' ? [] : WRITES[mode];
  const done = mode === 'none' ? 0 : Math.min(crash, seq.length);
  const v = mode === 'none' ? verdictNoJournal(w) : verdictJournal(mode, done);
  const written = (op: string) => seq.indexOf(op) >= 0 && seq.indexOf(op) < done;
  const partState = (p: Part): 'new' | 'old' | 'junk' => {
    const isNew = mode === 'none' ? w[p] : written(p);
    if (isNew) return 'new';
    return p === 'data' ? 'junk' : 'old';
  };
  const jslots = mode === 'full' ? ['TxB', 'J:bitmap', 'J:inode', 'J:data', 'TxE'] : ['TxB', 'J:bitmap', 'J:inode', 'TxE'];

  return (
    <Figure
      no={3}
      title="파일에 블록 하나를 덧붙이다 전원이 꺼지면"
      hint="저널 방식과 전원이 꺼지는 시점을 바꿔 보세요"
      caption={
        <>
          파일 끝에 블록 하나(블록 40)를 덧붙이려면 디스크의 서로 다른 세 곳을 고쳐야 합니다. 비트맵에 블록 40을 사용 중으로 표시하고, 아이노드에 포인터를 더하고, 블록 40에 내용을 씁니다. 디스크는 쓰기를 한 번에 하나씩 하고 순서를 바꾸기도 하므로, 저널이 없으면 세 쓰기 중 어떤 조합이든 살아남을 수 있습니다. 초록은 새 값, 회색은 옛 값, 빨간 점선은 의미 없는 옛 찌꺼기입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="쓰는 방식"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'none', label: '저널 없음' },
            { value: 'full', label: '데이터 저널링' },
            { value: 'ordered', label: '메타데이터 저널링' },
          ]}
        />
      </div>
      {mode === 'none' ? (
        <div className="ctl">
          <span className="ctl-label">
            <span>전원이 꺼지기 전에 디스크에 도달한 쓰기</span>
          </span>
          <div className="btn-row">
            {(['bitmap', 'inode', 'data'] as Part[]).map((p) => (
              <Check key={p} label={PART_KO[p]} checked={w[p]} onChange={(x) => setW({ ...w, [p]: x })} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <Slider id="crash-at" label="전원이 꺼진 시점 (끝난 쓰기 수)" value={done} min={0} max={seq.length} step={1} onChange={setCrash} format={(x) => `${x} / ${seq.length}`} />
          <div className="write-steps" aria-label="쓰기 순서">
            {seq.map((op, k) => (
              <span key={k} className="write-step" data-s={k < done ? 'done' : k === done ? 'crash' : undefined}>
                {k + 1}. {WRITE_KO[op]}
                {k === done && ' ⚡'}
              </span>
            ))}
          </div>
        </>
      )}
      {mode !== 'none' && (
        <div className="os-col" style={{ gap: 4 }}>
          <span className="os-small">저널 영역</span>
          <div className="journal" style={{ gridTemplateColumns: `repeat(${jslots.length}, minmax(0, 1fr))` }}>
            {jslots.map((j) => (
              <span key={j} className="os-chip" data-s={written(j) ? (j === 'TxE' ? 'commit' : 'written') : 'empty'}>
                {j.replace('J:', '')}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="os-col" style={{ gap: 4 }}>
        <span className="os-small">제자리 (전원이 꺼진 순간)</span>
        <div className="crash-grid">
          {(['bitmap', 'inode', 'data'] as Part[]).map((p) => {
            const st = partState(p);
            return (
              <div key={p} className="crash-cell" data-s={st}>
                <span className="ttl">{PART_KO[p]}</span>
                <span className="v">{st === 'new' ? NEW_VAL[p] : OLD_VAL[p]}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="verdict" style={{ ['--c' as string]: TONE[v.tone] }} aria-live="polite">
        <strong>{v.title}.</strong> {v.body}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FileSystems() {
  return (
    <>
      <h2>디스크는 번호 붙은 블록의 긴 줄</h2>
      <p>
        SSD든 하드 디스크든 운영체제가 보는 저장 장치는 같은 크기의 칸이 일렬로 늘어선 배열입니다. "블록 1,234,567번을 읽어라", "블록 89번에 이 4KB를 써라"가 장치가 아는 전부입니다. 그 위에 <code>/home/me/notes.txt</code> 같은 이름, 폴더, 크기가 제각각인 파일, 권한과 수정 시각을 얹는 소프트웨어가 <T en="file system">파일 시스템</T>입니다. 리눅스의 ext4, macOS의 APFS, Windows의 NTFS가 모두 이 일을 합니다.
      </p>
      <p>
        이 장에서는 유닉스 계열 파일 시스템의 고전적인 구조를 봅니다. 디스크 앞부분에는 파일 시스템 전체의 정보(블록 크기, 블록 수)를 담은 <T en="superblock">슈퍼블록</T>, 어떤 블록이 비었는지 비트 하나씩으로 적은 <T en="bitmap">비트맵</T>, 파일마다 하나씩인 <T en="inode">아이노드</T>의 테이블이 있고, 나머지는 파일 내용을 담는 데이터 블록입니다.
      </p>

      <h2>아이노드: 파일의 모든 것, 이름만 빼고</h2>
      <p>
        아이노드에는 파일의 종류(일반 파일, 디렉터리), 크기, 주인과 권한, 만든 시각과 고친 시각, 그리고 내용이 담긴 데이터 블록들의 번호가 들어 있습니다. 이상하게도 <strong>파일의 이름은 없습니다</strong>. 이름은 디렉터리에 있습니다. 터미널에서 <code>ls -i</code>를 치면 파일마다 아이노드 번호가 보이고, <code>stat 파일</code>을 치면 아이노드의 내용을 볼 수 있습니다.
      </p>
      <p>
        블록 번호를 담는 방법이 핵심입니다. 아이노드는 크기가 고정(ext4는 256바이트)이라 블록 번호를 무한히 넣을 수 없습니다. 그래서 처음 몇 블록은 아이노드에 직접 적고(<T en="direct pointer">직접 포인터</T>), 파일이 더 크면 블록 번호만 가득 담은 블록을 하나 따로 두고 그 블록을 가리킵니다(<T en="indirect pointer">간접 포인터</T>). 작은 파일은 빠르게, 큰 파일도 담을 수 있게 하는 방법입니다. 그림 1에서 파일을 만들고 늘려 보세요.
      </p>
      <DiskFigure />
      <p>
        직접 포인터가 바닥나는 5번째 블록을 덧붙일 때, 데이터 블록보다 간접 블록이 먼저 할당되는 것을 보세요. 파일을 몇 개 지우고 새로 만들면 비어 있는 첫 블록부터 채우는 탓에 한 파일의 블록이 디스크 여기저기로 흩어집니다. 이를 <T en="fragmentation">단편화</T>라고 합니다. 하드 디스크는 헤드가 움직여야 해서 흩어진 파일을 읽기가 몹시 느렸고, 그래서 옛날 Windows에는 "디스크 조각 모음"이 있었습니다. SSD는 위치에 따른 차이가 거의 없어 단편화가 훨씬 덜 문제 됩니다.
      </p>
      <p>실제 크기로 계산해 봅시다. ext2와 ext3는 직접 포인터 12개와 단일, 이중, 삼중 간접 포인터를 하나씩 둡니다. 블록이 4KB이고 블록 번호가 4바이트라면 간접 블록 하나에 번호가 1,024개 들어갑니다.</p>
      <MB note="직접 12개 + 단일 간접 + 이중 간접 + 삼중 간접">{'(12 + 1024 + 1024^2 + 1024^3) \\times 4\\,\\text{KB} \\approx 4\\,\\text{TB}'}</MB>
      <p>
        파일 대부분은 작으므로 직접 포인터로 충분하고, 수 TB짜리 파일도 디스크를 최대 네 번 더 읽으면 원하는 블록을 찾습니다. ext4는 여기서 한 걸음 더 나아가 "블록 1000번부터 연속 500개" 같은 <T en="extent">익스텐트</T>로 블록을 적어, 큰 파일의 포인터를 크게 줄입니다.
      </p>

      <h2>디렉터리와 경로 찾기</h2>
      <p>
        디렉터리도 파일입니다. 다만 내용이 "이름 → 아이노드 번호" 목록일 뿐입니다. 그래서 <code>open("/home/me/notes.txt")</code>는 루트 디렉터리부터 이름 하나씩 따라 내려가야 합니다. 그림 2에서 경로를 한 단계씩 따라가며 디스크를 몇 번 읽는지 세어 보세요.
      </p>
      <PathFigure />
      <p>
        <code>/home/me/notes.txt</code>의 내용을 읽기까지 디스크 읽기가 9번(데이터 블록 2개 포함) 필요합니다. 디렉터리가 깊을수록, 큰 디렉터리일수록 더 늘어납니다. 그래서 운영체제는 최근에 찾은 경로와 아이노드를 메모리에 캐시해 두고(리눅스의 dentry 캐시와 inode 캐시), 두 번째 open()부터는 디스크를 거의 건드리지 않습니다. 같은 이유로 프로그램은 파일을 매번 경로로 다시 열기보다, 한 번 열어 받은 <T en="file descriptor">파일 디스크립터</T>로 계속 읽고 씁니다.
      </p>
      <Code label="경로를 아이노드로 바꾸기">{`
const ROOT_INO = 2;                          // 루트 디렉터리는 미리 정해진 번호

function namei(path) {
  let ino = ROOT_INO;
  for (const name of path.split('/').filter(Boolean)) {
    const dir = readInode(ino);              // 디스크 읽기 1
    if (dir.type !== 'dir') throw new Error('ENOTDIR');
    const entries = readDirBlocks(dir);      // 디스크 읽기 2: 이름 → 아이노드 번호
    if (!dir.canExecute(currentUser)) throw new Error('EACCES');
    ino = entries.get(name);
    if (ino === undefined) throw new Error('ENOENT');
  }
  return readInode(ino);                     // 찾은 파일의 아이노드
}`}</Code>
      <Callout kind="intuition">
        이름이 아이노드 밖에 있으니, 한 아이노드에 이름을 여러 개 붙일 수 있습니다. <code>ln a.txt b.txt</code>는 같은 아이노드를 가리키는 항목을 하나 더 만드는 <T en="hard link">하드 링크</T>입니다. 아이노드는 자기를 가리키는 이름의 수를 세고 있다가, 그 수가 0이 되고 아무도 파일을 열고 있지 않을 때 비로소 블록을 비웁니다. 파일을 지우는 시스템 콜의 이름이 delete가 아니라 <code>unlink</code>인 이유입니다.
      </Callout>

      <h2>전원이 꺼지면: 충돌 일관성과 저널링</h2>
      <p>
        파일에 블록 하나를 덧붙이는 간단한 일도, 디스크의 서로 다른 세 곳(비트맵, 아이노드, 데이터 블록)을 고쳐야 합니다. 디스크는 이 셋을 한꺼번에 쓰지 못하고, 성능을 위해 순서를 바꿔 쓰기도 합니다. 그 사이에 전원이 꺼지거나 커널이 멈추면, 파일 시스템의 자료 구조가 서로 맞지 않는 상태로 남을 수 있습니다. 그림 3에서 저널 없이 어떤 조합이 살아남았을 때 무슨 일이 생기는지 확인해 보세요.
      </p>
      <CrashFigure />
      <p>
        옛 파일 시스템은 부팅할 때 <code>fsck</code>로 디스크 전체를 훑어 비트맵과 아이노드가 서로 맞는지 확인하고 고쳤습니다. 디스크가 커지자 이 검사가 몇 시간씩 걸리게 되었고, 그나마 "아이노드와 비트맵은 맞지만 내용이 쓰레기"인 경우는 찾지도 못합니다. 그래서 등장한 것이 <T en="journaling">저널링</T>입니다. 데이터베이스의 로그 선행 기록과 같은 생각입니다.
      </p>
      <ol>
        <li>고칠 블록들을 제자리가 아니라 디스크의 저널 영역에 먼저 씁니다. 시작 표시(TxB)와 함께.</li>
        <li>저널 쓰기가 끝났음을 확인한 뒤 커밋 표시(TxE)를 씁니다. 이 한 블록이 쓰이는 순간 트랜잭션이 확정됩니다.</li>
        <li>그다음에 제자리에 씁니다(<T en="checkpoint">체크포인트</T>).</li>
        <li>부팅할 때는 저널만 보면 됩니다. 커밋 표시가 있는 트랜잭션은 다시 쓰고, 없는 것은 버립니다.</li>
      </ol>
      <p>
        <strong>데이터 저널링</strong>은 데이터 블록까지 저널에 쓰므로 모든 데이터를 두 번 씁니다. 그래서 ext4의 기본값은 <strong>메타데이터 저널링</strong>(ordered 모드)입니다. 데이터 블록을 먼저 제자리에 쓴 뒤, 비트맵과 아이노드만 저널에 씁니다. 데이터를 아직 아무도 가리키지 않는 빈 블록에 먼저 쓰므로, 중간에 꺼져도 "내용이 쓰레기"인 경우가 생기지 않습니다. 그림 3에서 두 저널 방식의 전원 시점을 끝까지 옮겨 보면, 어느 시점에 꺼져도 결과는 옛 상태 아니면 새 상태 둘 중 하나입니다.
      </p>
      <Callout kind="warn">
        저널링은 파일 시스템의 <strong>구조</strong>가 망가지지 않게 할 뿐, 여러분의 데이터가 디스크에 있다고 보장하지는 않습니다. <code>write()</code>는 대개 데이터를 메모리의 페이지 캐시에 넣고 바로 돌아오고, 실제 디스크 쓰기는 수 초 뒤에 몰아서 합니다. 확실히 디스크에 있어야 한다면 <code>fsync()</code>를 불러야 합니다. 데이터베이스가 트랜잭션을 커밋할 때마다 fsync를 부르는 이유이고, 그 이야기는 <a href={lessonHref('cs-databases', 'transactions')}>트랜잭션</a> 장에서 이어집니다.
      </Callout>

      <Callout kind="key">
        파일 시스템은 블록의 배열 위에 슈퍼블록, 비트맵, 아이노드 테이블, 데이터 블록을 놓습니다. 아이노드는 이름을 뺀 파일의 모든 정보와 데이터 블록 번호(직접, 간접 포인터)를 담고, 디렉터리는 이름을 아이노드 번호로 바꾸는 표를 내용으로 가진 파일입니다. 경로를 찾으려면 이름마다 아이노드와 디렉터리 블록을 읽어야 해서 캐시가 중요합니다. 한 번의 갱신이 여러 블록을 고치므로 전원이 꺼지면 구조가 어긋날 수 있고, 저널에 먼저 쓰고 커밋한 뒤 제자리에 쓰는 저널링이 이를 막습니다.
      </Callout>
      <Quiz
        q="10GB짜리 로그 파일을 rm으로 지우는 데는 눈 깜짝할 시간이 걸리는데, 같은 크기의 파일을 새로 쓰는 데는 몇 분이 걸린다. 가장 알맞은 설명은?"
        options={['rm은 실제로 아무것도 지우지 않고 휴지통으로 옮기기 때문이다', '지울 때는 디렉터리 항목과 아이노드, 비트맵만 고치고 데이터 블록 10GB는 건드리지 않기 때문이다', 'SSD는 지우기가 쓰기보다 원래 수천 배 빠르기 때문이다', '저널링 덕분에 지우기는 저널에만 기록하고 끝나기 때문이다']}
        answer={1}
        explain={<>그림 1에서 파일을 지울 때처럼, 파일 시스템은 디렉터리 항목을 없애고 아이노드와 블록을 비트맵에서 "비어 있음"으로 표시할 뿐 블록의 내용은 지우지 않습니다. 고치는 것은 메타데이터 블록 몇 개(큰 파일이면 간접 블록을 읽는 정도)입니다. 반면 쓰기는 10GB를 실제로 장치에 옮겨야 합니다. 같은 이유로 지운 파일은 덮어쓰기 전까지 복구 프로그램으로 되살릴 수 있고, 민감한 파일을 확실히 지우려면 따로 덮어써야 합니다.</>}
      />
    </>
  );
}

/* 운영체제: a toy file system on 64 blocks, path lookup, and crash consistency. */

/* ───────── layout ───────── */

export const NBLOCKS = 64;
export const DIRECT = 4; // direct pointers per inode
export const PER_IND = 8; // pointers that fit in one indirect block (toy numbers)
export const MAX_FILE = DIRECT + PER_IND;
export const DATA_START = 6;
export const INODES = 16;
export const ROOT_DIR_BLOCK = 5;

export type BlockKind = 'super' | 'ibitmap' | 'dbitmap' | 'itable' | 'dir' | 'data' | 'ind' | 'free';
export const META: { b: number; kind: BlockKind; label: string }[] = [
  { b: 0, kind: 'super', label: 'S' },
  { b: 1, kind: 'ibitmap', label: 'iB' },
  { b: 2, kind: 'dbitmap', label: 'dB' },
  { b: 3, kind: 'itable', label: 'I' },
  { b: 4, kind: 'itable', label: 'I' },
  { b: 5, kind: 'dir', label: '/' },
];

export interface FsFile {
  ino: number;
  name: string;
  color: number;
  direct: number[]; // up to DIRECT block numbers
  indirect: number; // block holding further pointers, -1 if none
  more: number[]; // pointers stored in the indirect block
}
export interface Fs {
  files: FsFile[];
  used: boolean[]; // data bitmap (all blocks, metadata always used)
  nextColor: number;
}

export const fileBlocks = (f: FsFile) => [...f.direct, ...f.more];

function alloc(used: boolean[]): number {
  for (let b = DATA_START; b < NBLOCKS; b++) if (!used[b]) return b;
  return -1;
}

export function fsEmpty(): Fs {
  const used = Array(NBLOCKS).fill(false);
  for (let b = 0; b < DATA_START; b++) used[b] = true;
  return { files: [], used, nextColor: 0 };
}

/** Add n data blocks to a file, allocating the indirect block when the direct pointers run out. */
function grow(fs: Fs, f: FsFile, n: number): boolean {
  for (let k = 0; k < n; k++) {
    if (fileBlocks(f).length >= MAX_FILE) return false;
    if (f.direct.length >= DIRECT && f.indirect < 0) {
      const ib = alloc(fs.used);
      if (ib < 0) return false;
      fs.used[ib] = true;
      f.indirect = ib;
    }
    const b = alloc(fs.used);
    if (b < 0) return false;
    fs.used[b] = true;
    if (f.direct.length < DIRECT) f.direct.push(b);
    else f.more.push(b);
  }
  return true;
}

const clone = (fs: Fs): Fs => ({ files: fs.files.map((f) => ({ ...f, direct: [...f.direct], more: [...f.more] })), used: [...fs.used], nextColor: fs.nextColor });

export function fsCreate(fs0: Fs, name: string, n: number): { fs: Fs; ino: number; ok: boolean } {
  const fs = clone(fs0);
  const taken = new Set(fs.files.map((f) => f.ino));
  let ino = 1;
  while (taken.has(ino) && ino < INODES) ino++;
  if (ino >= INODES) return { fs: fs0, ino: -1, ok: false };
  const f: FsFile = { ino, name, color: fs.nextColor++ % 6, direct: [], indirect: -1, more: [] };
  fs.files.push(f);
  const ok = grow(fs, f, n);
  return { fs, ino, ok };
}

export function fsAppend(fs0: Fs, ino: number, n: number): { fs: Fs; ok: boolean } {
  const fs = clone(fs0);
  const f = fs.files.find((x) => x.ino === ino);
  if (!f) return { fs: fs0, ok: false };
  const ok = grow(fs, f, n);
  return { fs, ok };
}

export function fsDelete(fs0: Fs, ino: number): Fs {
  const fs = clone(fs0);
  const f = fs.files.find((x) => x.ino === ino);
  if (!f) return fs0;
  for (const b of fileBlocks(f)) fs.used[b] = false;
  if (f.indirect >= 0) fs.used[f.indirect] = false;
  fs.files = fs.files.filter((x) => x !== f);
  return fs;
}

export interface BlockInfo {
  kind: BlockKind;
  label: string;
  ino: number; // owning file, -1 for none
  order: number; // position in the file (data blocks), -1 otherwise
}
export function blockMap(fs: Fs): BlockInfo[] {
  const m: BlockInfo[] = Array.from({ length: NBLOCKS }, () => ({ kind: 'free' as BlockKind, label: '', ino: -1, order: -1 }));
  for (const x of META) m[x.b] = { kind: x.kind, label: x.label, ino: -1, order: -1 };
  for (const f of fs.files) {
    fileBlocks(f).forEach((b, k) => (m[b] = { kind: 'data', label: String(k + 1), ino: f.ino, order: k }));
    if (f.indirect >= 0) m[f.indirect] = { kind: 'ind', label: '→', ino: f.ino, order: -1 };
  }
  return m;
}

export function fsStart(): Fs {
  let fs = fsEmpty();
  fs = fsCreate(fs, 'notes.txt', 2).fs;
  fs = fsCreate(fs, 'photo.jpg', 6).fs;
  fs = fsCreate(fs, 'todo.md', 1).fs;
  return fs;
}

/* ───────── path lookup over a fixed tree ───────── */

export interface Inode {
  ino: number;
  name: string;
  dir: boolean;
  blocks: number[];
  entries?: [string, number][];
}
export const TREE: Record<number, Inode> = {
  2: { ino: 2, name: '/', dir: true, blocks: [20], entries: [['.', 2], ['..', 2], ['bin', 3], ['etc', 4], ['home', 5]] },
  3: { ino: 3, name: 'bin', dir: true, blocks: [21], entries: [['.', 3], ['..', 2], ['ls', 9], ['sh', 10]] },
  4: { ino: 4, name: 'etc', dir: true, blocks: [22], entries: [['.', 4], ['..', 2], ['hosts', 8], ['passwd', 14]] },
  5: { ino: 5, name: 'home', dir: true, blocks: [23], entries: [['.', 5], ['..', 2], ['me', 6], ['you', 7]] },
  6: { ino: 6, name: 'me', dir: true, blocks: [24], entries: [['.', 6], ['..', 5], ['notes.txt', 11], ['photos', 12]] },
  7: { ino: 7, name: 'you', dir: true, blocks: [25], entries: [['.', 7], ['..', 5], ['song.mp3', 15]] },
  12: { ino: 12, name: 'photos', dir: true, blocks: [26], entries: [['.', 12], ['..', 6], ['cat.jpg', 13]] },
  8: { ino: 8, name: 'hosts', dir: false, blocks: [37] },
  11: { ino: 11, name: 'notes.txt', dir: false, blocks: [30, 31] },
  13: { ino: 13, name: 'cat.jpg', dir: false, blocks: [33, 34, 35, 41] },
};

export type LookStep = { kind: 'inode'; ino: number } | { kind: 'dir'; ino: number; block: number; want: string; found: number } | { kind: 'data'; ino: number; blocks: number[] } | { kind: 'error'; want: string };

export function lookupSteps(path: string, cached: boolean): LookStep[] {
  const names = path.split('/').filter(Boolean);
  const out: LookStep[] = [];
  let ino = 2;
  if (cached) {
    // the dentry cache already maps the whole path to its inode
    for (const nm of names) {
      const e = TREE[ino]?.entries?.find(([n]) => n === nm);
      if (!e) return [{ kind: 'error', want: nm }];
      ino = e[1];
    }
  } else {
    for (const nm of names) {
      out.push({ kind: 'inode', ino });
      const d = TREE[ino];
      const e = d.entries?.find(([n]) => n === nm);
      out.push({ kind: 'dir', ino, block: d.blocks[0], want: nm, found: e ? e[1] : -1 });
      if (!e) {
        out.push({ kind: 'error', want: nm });
        return out;
      }
      ino = e[1];
    }
  }
  out.push({ kind: 'inode', ino });
  out.push({ kind: 'data', ino, blocks: TREE[ino].blocks });
  return out;
}

/* ───────── crash consistency: appending one block to a file ───────── */

export type JMode = 'none' | 'full' | 'ordered';
export type Part = 'bitmap' | 'inode' | 'data';
export const PART_KO: Record<Part, string> = { bitmap: '데이터 비트맵', inode: '아이노드', data: '데이터 블록' };

/** The writes each mode issues, in order. J: = into the journal, otherwise to the final place. */
export const WRITES: Record<Exclude<JMode, 'none'>, string[]> = {
  full: ['TxB', 'J:bitmap', 'J:inode', 'J:data', 'TxE', 'bitmap', 'inode', 'data'],
  ordered: ['data', 'TxB', 'J:bitmap', 'J:inode', 'TxE', 'bitmap', 'inode'],
};
export const WRITE_KO: Record<string, string> = {
  TxB: '저널: 시작(TxB)',
  'J:bitmap': '저널: 비트맵',
  'J:inode': '저널: 아이노드',
  'J:data': '저널: 데이터',
  TxE: '저널: 커밋(TxE)',
  bitmap: '비트맵 제자리 쓰기',
  inode: '아이노드 제자리 쓰기',
  data: '데이터 제자리 쓰기',
};

export type Verdict = { tone: 'good' | 'warn' | 'bad'; title: string; body: string };

/** Without a journal: which of the three writes reached the disk before the power went out. */
export function verdictNoJournal(w: Record<Part, boolean>): Verdict {
  const { bitmap: b, inode: i, data: d } = w;
  if (b && i && d) return { tone: 'good', title: '일관됨 (새 상태)', body: '세 쓰기가 모두 끝났습니다. 파일에 블록이 하나 늘었습니다.' };
  if (!b && !i && !d) return { tone: 'good', title: '일관됨 (옛 상태)', body: '아무것도 쓰이지 않았습니다. 덧붙인 내용만 사라졌고 파일 시스템은 멀쩡합니다.' };
  if (d && !b && !i) return { tone: 'warn', title: '일관됨, 데이터만 사라짐', body: '데이터는 썼지만 아무도 그 블록을 가리키지 않고 비트맵도 비어 있다고 말합니다. 쓴 내용은 사라졌지만 구조에는 문제가 없습니다.' };
  if (i && b && !d) return { tone: 'bad', title: '메타데이터는 맞지만 내용이 쓰레기', body: '아이노드와 비트맵은 새 블록을 쓰는 중이라고 말하지만, 그 블록에는 예전에 지운 파일의 찌꺼기가 들어 있습니다. fsck도 찾지 못하고, 파일을 열면 엉뚱한 내용이 보입니다.' };
  if (i && !b) return { tone: 'bad', title: '불일치: 아이노드는 쓰는데 비트맵은 비어 있음', body: '아이노드는 새 블록을 가리키지만 비트맵은 그 블록이 비었다고 말합니다. 나중에 다른 파일이 같은 블록을 받으면 두 파일이 한 블록을 함께 쓰게 됩니다. fsck가 디스크 전체를 훑어 고쳐야 합니다.' };
  return { tone: 'bad', title: '불일치: 공간 누수', body: '비트맵은 블록이 쓰이는 중이라고 말하지만 어느 아이노드도 가리키지 않습니다. 그 블록은 영원히 할당되지 않습니다. fsck가 모든 아이노드를 훑어야 찾아냅니다.' };
}

/** With a journal: `done` writes finished before the crash; what does recovery find? */
export function verdictJournal(mode: Exclude<JMode, 'none'>, done: number): Verdict {
  const seq = WRITES[mode];
  const committed = seq.indexOf('TxE') < done;
  const allDone = done >= seq.length;
  if (allDone) return { tone: 'good', title: '일관됨 (새 상태)', body: '모든 쓰기가 끝났습니다. 저널의 이 트랜잭션은 이제 지워도 됩니다.' };
  if (committed)
    return { tone: 'good', title: '복구: 저널을 다시 실행 → 새 상태', body: '커밋 표시(TxE)가 저널에 있으므로, 부팅할 때 저널에 적힌 블록을 제자리에 다시 씁니다. 이미 쓴 것을 또 써도 결과가 같으니 안전합니다.' };
  if (done === 0) return { tone: 'good', title: '일관됨 (옛 상태)', body: '아무것도 쓰이지 않았습니다.' };
  return {
    tone: 'good',
    title: '복구: 커밋 없는 트랜잭션은 버림 → 옛 상태',
    body: mode === 'ordered' && done >= 1 ? '데이터 블록은 이미 썼지만 아무도 가리키지 않는 빈 블록에 쓴 것이라 해가 없습니다. 커밋 표시가 없는 저널 내용은 무시합니다.' : '저널에 커밋 표시가 없으므로 이 트랜잭션은 없던 일로 칩니다. 제자리에는 아직 아무것도 쓰지 않았으니 옛 상태 그대로입니다.',
  };
}

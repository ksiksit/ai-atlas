import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, lerpColor, rgbStr, usePalette, type Palette } from '../../../../lib/theme';
import { bitAt, hex, sha256, utf8 } from '../../shared';
import { IMG_H, IMG_W, asciiBytes, birthdayExpected, birthdaySearch, blocksOf, encryptPixels, hmacSha256, isLetter, picture, printable, seededBytes, toHex, toyCipher, xorBytes, type Mode, type Picture } from './crypto';
import '../../../cs/algorithms/lessons/algorithms.css';
import './crypto.css';

const n0 = (v: number) => Math.round(v).toLocaleString('ko-KR');
const MAX_LEN = 20;
const asciiOnly = (s: string) => s.replace(/[^\x20-\x7e]/g, '').slice(0, MAX_LEN);

/* ─────────────── Figure 1: XOR, the one-time pad, and reusing it ─────────────── */

function XorFigure() {
  const [a, setA] = useState('ATTACK AT DAWN');
  const [b, setB] = useState('RETREAT AT TEN');
  const [reuse, setReuse] = useState<'once' | 'twice'>('once');
  const [guess, setGuess] = useState('ATTACK');
  const key = useMemo(() => seededBytes(MAX_LEN, 7), []);
  const A = asciiBytes(a);
  const B = asciiBytes(b);
  const cA = xorBytes(A, key);
  const cB = xorBytes(B, key);
  const both = xorBytes(cA, cB);
  const G = asciiBytes(guess);
  const reveal = xorBytes(both, G); // c₁ ⊕ c₂ ⊕ (a guess for message 1) = message 2, where the guess is right
  const twice = reuse === 'twice';
  const n = twice ? Math.max(1, Math.min(A.length, B.length)) : Math.max(1, A.length);
  const zeros = [...both].filter((v) => v === 0).length;
  const letters = [...both].filter(isLetter).length;

  const row = (name: string, cells: { top: string; sub?: string; t?: string; k?: boolean }[]) => (
    <div className="xr-row" style={{ ['--n' as string]: n }}>
      <span className="xr-name">{name}</span>
      {Array.from({ length: n }, (_, i) => {
        const c = cells[i];
        return (
          <span key={i} className="xr-cell" data-t={c?.t} data-k={c?.k || undefined}>
            {c ? c.top : ''}
            {c?.sub !== undefined && <small>{c.sub}</small>}
          </span>
        );
      })}
    </div>
  );
  const chars = (bytes: Uint8Array) => [...bytes].map((v) => ({ top: printable(v) === ' ' ? '␣' : printable(v), sub: v.toString(16).padStart(2, '0') }));
  const hexes = (bytes: Uint8Array, k = false) => toHex(bytes).map((h, i) => ({ top: h, sub: printable(bytes[i]) === ' ' ? '␣' : printable(bytes[i]), k }));

  return (
    <Figure
      no={1}
      title="일회용 패드와 열쇠 재사용"
      hint="메시지를 바꾸고, 같은 열쇠로 두 번 보내 보세요"
      caption={<>위 칸은 글자, 아래 작은 글씨는 그 바이트의 16진수입니다. 열쇠는 그림이 미리 정해 둔 무작위 바이트이고 메시지는 영문과 숫자, 기호만 받습니다. "같은 열쇠 두 번"에서 초록 칸은 두 평문의 글자가 같은 자리(XOR이 0), 노란 칸은 XOR 값이 영문자 범위인 자리로, 대개 한쪽이 공백입니다. 맨 아래 줄은 첫 메시지를 추측해 넣었을 때 드러나는 둘째 메시지입니다.</>}
    >
      <div className="controls row">
        <Seg
          label="열쇠 쓰기"
          value={reuse}
          onChange={setReuse}
          options={[
            { value: 'once', label: '한 번만 쓰기' },
            { value: 'twice', label: '같은 열쇠 두 번' },
          ]}
        />
      </div>
      <div className="xr-form">
        <div className="ctl">
          <label className="ctl-label" htmlFor="xr-a">
            <span>메시지 1 (최대 {MAX_LEN}자)</span>
          </label>
          <input id="xr-a" className="text-input mono" value={a} maxLength={MAX_LEN} spellCheck={false} autoComplete="off" onChange={(e) => setA(asciiOnly(e.target.value))} />
        </div>
        {twice && (
          <div className="ctl">
            <label className="ctl-label" htmlFor="xr-b">
              <span>메시지 2</span>
            </label>
            <input id="xr-b" className="text-input mono" value={b} maxLength={MAX_LEN} spellCheck={false} autoComplete="off" onChange={(e) => setB(asciiOnly(e.target.value))} />
          </div>
        )}
      </div>
      <div className="xr-wrap" role="img" aria-label={twice ? `같은 열쇠로 암호화한 두 암호문의 XOR은 두 평문의 XOR과 같습니다. 0인 바이트 ${zeros}개, 영문자 범위인 바이트 ${letters}개.` : `메시지 1을 같은 길이의 무작위 열쇠와 XOR한 암호문.`}>
        <div className="xr-rows">
          {row('평문 1', chars(A))}
          {row('⊕ 열쇠', hexes(key.slice(0, n), true))}
          {row('= 암호문 1', hexes(cA))}
          {twice && (
            <>
              {row('평문 2', chars(B))}
              {row('암호문 2', hexes(cB))}
              {row('암호문 1 ⊕ 2', toHex(both).map((h, i) => ({ top: h, sub: printable(both[i]) === ' ' ? '␣' : printable(both[i]), t: both[i] === 0 ? 'zero' : isLetter(both[i]) ? 'letter' : undefined })))}
              {row('평문 1 추측', chars(G))}
              {row('→ 평문 2', [...reveal].map((v) => ({ top: printable(v) === ' ' ? '␣' : printable(v), t: 'reveal' })))}
            </>
          )}
        </div>
      </div>
      {twice && (
        <div className="ctl" style={{ maxWidth: 360 }}>
          <label className="ctl-label" htmlFor="xr-g">
            <span>엿듣는 사람의 추측: 메시지 1은 아마 …</span>
          </label>
          <input id="xr-g" className="text-input mono" value={guess} maxLength={MAX_LEN} spellCheck={false} autoComplete="off" onChange={(e) => setGuess(asciiOnly(e.target.value))} />
        </div>
      )}
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Readout label="열쇠 길이" value={`${n0(A.length)}바이트 (메시지와 같음)`} />
        {twice ? (
          <>
            <Readout label="열쇠 없이 얻은 정보" value="평문 1 ⊕ 평문 2" color="var(--bad)" />
            <Readout label="같은 글자 자리" value={`${zeros}곳`} color="var(--good)" />
            <Readout label="한쪽이 공백인 듯한 자리" value={`${letters}곳`} />
          </>
        ) : (
          <Readout label="열쇠 없이 얻은 정보" value="길이뿐" color="var(--good)" />
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: block-cipher modes on a picture ─────────────── */

const PIC_OPTS: { value: Picture; label: string }[] = [
  { value: 'lock', label: '자물쇠' },
  { value: 'face', label: '얼굴' },
  { value: 'blank', label: '빈 종이에 그리기' },
];
const MODE_OPTS: { value: Mode; label: string }[] = [
  { value: 'ecb', label: 'ECB' },
  { value: 'cbc', label: 'CBC' },
  { value: 'ctr', label: 'CTR' },
];
const shade = (P: Palette, v: number) => rgbStr(lerpColor(P.ink, P.surface, v / 15));

function PixelCanvas({ px, label, draw }: { px: number[]; label: string; draw?: (i: number) => void }) {
  const P = usePalette();
  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const cw = w / IMG_W;
      const ch = h / IMG_H;
      for (let i = 0; i < px.length; i++) {
        ctx.fillStyle = shade(P, px[i]);
        ctx.fillRect(Math.floor((i % IMG_W) * cw), Math.floor(Math.floor(i / IMG_W) * ch), Math.ceil(cw), Math.ceil(ch));
      }
      ctx.strokeStyle = P.line;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    },
    [P, px],
    { aspect: IMG_W / IMG_H, minHeight: 90, maxHeight: 320 },
  );
  const painting = useRef(false);
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * IMG_W);
    const y = Math.floor(((e.clientY - r.top) / Math.max(1, size.h)) * IMG_H);
    if (x >= 0 && x < IMG_W && y >= 0 && y < IMG_H) draw?.(y * IMG_W + x);
  };
  return (
    <div
      ref={wrapRef}
      className="canvas-box"
      role="img"
      aria-label={label}
      onPointerDown={
        draw
          ? (e) => {
              painting.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              at(e);
            }
          : undefined
      }
      onPointerMove={draw ? (e) => painting.current && at(e) : undefined}
      onPointerUp={draw ? () => (painting.current = false) : undefined}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function ModesFigure() {
  const [pic, setPic] = useState<Picture>('lock');
  const [px, setPx] = useState<number[]>(() => picture('lock'));
  const [mode, setMode] = useState<Mode>('ecb');
  const [keyNo, setKeyNo] = useState(0);
  const [brush, setBrush] = useState<'pen' | 'erase'>('pen');
  const [reuse, setReuse] = useState(false);
  const cipher = useMemo(() => toyCipher(`figure-key-${keyNo}`), [keyNo]);
  const iv = 1234 + keyNo * 7919; // a fresh IV / nonce per key in this figure
  const ct = useMemo(() => encryptPixels(px, mode, cipher, iv), [px, mode, cipher, iv]);
  const other = useMemo(() => picture(pic === 'face' ? 'lock' : 'face'), [pic]);
  const xored = useMemo(() => {
    if (!(mode === 'ctr' && reuse)) return null;
    const c2 = encryptPixels(other, 'ctr', cipher, iv);
    return ct.map((v, i) => 15 - (v ^ c2[i])); // 0 (identical) drawn light
  }, [mode, reuse, other, cipher, iv, ct]);

  const choose = (p: Picture) => {
    setPic(p);
    setPx(picture(p));
  };
  const draw = (i: number) =>
    setPx((cur) => {
      const v = brush === 'pen' ? 2 : 14;
      if (cur[i] === v) return cur;
      const next = cur.slice();
      next[i] = v;
      return next;
    });
  const pBlocks = blocksOf(px);
  const cBlocks = blocksOf(ct);
  const count = (bs: number[]) => {
    const m = new Map<number, number>();
    bs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
    return m;
  };
  const cCount = count(cBlocks);
  const topRepeat = Math.max(...cCount.values());

  return (
    <Figure
      no={2}
      title="같은 그림, 세 가지 운용 방식"
      hint="그림과 방식을 바꾸거나 직접 그려 보세요"
      caption={<>그림은 가로 {IMG_W}칸, 세로 {IMG_H}칸이고 칸마다 밝기가 16단계(4비트)입니다. 가로로 이웃한 4칸(16비트)이 블록 하나입니다. 암호는 SHA-256으로 만든 표를 쓰는 4단 페이스텔 구조의 <strong>장난감 16비트 블록 암호</strong>로, 블록이 65,536가지뿐이라 실제로는 표로 다 적어 둘 수 있습니다. 진짜 AES는 블록이 128비트이지만, ECB가 무늬를 드러내는 이유는 똑같습니다. 왼쪽 그림 위를 누르거나 끌면 칸을 칠할 수 있습니다.</>}
    >
      <div className="controls row">
        <Seg label="그림" value={pic} onChange={choose} options={PIC_OPTS} />
        <Seg label="운용 방식" value={mode} onChange={setMode} options={MODE_OPTS} />
        <Seg
          label="붓"
          value={brush}
          onChange={setBrush}
          options={[
            { value: 'pen', label: '칠하기' },
            { value: 'erase', label: '지우기' },
          ]}
        />
      </div>
      <div className="bm-pics">
        <div className="bm-pic bm-draw">
          <span className="ds-label">평문 (눌러서 그리기)</span>
          <PixelCanvas px={px} label="암호화할 그림" draw={draw} />
        </div>
        <div className="bm-pic">
          <span className="ds-label">암호문 ({mode.toUpperCase()})</span>
          <PixelCanvas px={ct} label={`${mode.toUpperCase()} 방식으로 암호화한 그림. 같은 평문 블록이 같은 암호문 블록이 되는 최대 횟수 ${topRepeat}번.`} />
        </div>
        {xored && (
          <div className="bm-pic">
            <span className="ds-label">같은 nonce로 암호화한 두 그림의 암호문 XOR</span>
            <PixelCanvas px={xored} label="같은 nonce를 재사용한 두 CTR 암호문의 XOR. 두 평문의 XOR이 그대로 드러납니다." />
          </div>
        )}
      </div>
      <div className="controls row">
        <div className="btn-row">
          <Button small onClick={() => setKeyNo((k) => k + 1)}>
            열쇠 바꾸기
          </Button>
          <Button small onClick={() => setPx(picture(pic))}>
            그림 되돌리기
          </Button>
        </div>
        {mode === 'ctr' && <Check label="같은 열쇠와 nonce로 다른 그림도 암호화하기" checked={reuse} onChange={setReuse} />}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Readout label="블록 수" value={`${n0(pBlocks.length)}개`} />
        <Readout label="서로 다른 평문 블록" value={`${n0(count(pBlocks).size)}가지`} />
        <Readout label="서로 다른 암호문 블록" value={`${n0(cCount.size)}가지`} color={mode === 'ecb' ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="가장 많이 반복된 암호문 블록" value={`${n0(topRepeat)}번`} color={topRepeat > 2 ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: hashes, and why a MAC needs a key ─────────────── */

const MAC_KEY = '우리끼리만-아는-열쇠';

function BitStrip({ a, b }: { a: Uint8Array; b: Uint8Array }) {
  const P = usePalette();
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cols = 64;
      const rows = 4;
      const g = 1.5;
      const cw = (w - g * (cols - 1)) / cols;
      const ch = (h - g * (rows - 1)) / rows;
      for (let i = 0; i < 256; i++) {
        const x = (i % cols) * (cw + g);
        const y = Math.floor(i / cols) * (ch + g);
        const diff = bitAt(a, i) !== bitAt(b, i);
        ctx.fillStyle = diff ? P.pos : bitAt(b, i) ? alpha(P.ink, 0.55) : alpha(P.ink, P.dark ? 0.12 : 0.08);
        ctx.fillRect(x, y, cw, ch);
      }
    },
    [P, a, b],
    { height: 46 },
  );
  return (
    <div ref={wrapRef} className="canvas-box" role="img" aria-label="두 해시값의 256비트 비교. 주황색이 서로 다른 비트입니다.">
      <canvas ref={canvasRef} />
    </div>
  );
}

function HashMacFigure() {
  const [a, setA] = useState('철수에게 10,000원을 보냅니다');
  const [b, setB] = useState('철수에게 90,000원을 보냅니다');
  const [prot, setProt] = useState<'hash' | 'hmac'>('hash');
  const [attack, setAttack] = useState(true);
  const ha = sha256(utf8(a));
  const hb = sha256(utf8(b));
  let diff = 0;
  for (let i = 0; i < 256; i++) if (bitAt(ha, i) !== bitAt(hb, i)) diff++;
  const key = utf8(MAC_KEY);
  const tagOf = (m: string) => (prot === 'hash' ? sha256(utf8(m)) : hmacSha256(key, utf8(m)));
  const sentTag = tagOf(a);
  // the attacker swaps the message; with a plain hash they can recompute the tag, without the key they cannot
  const gotMsg = attack ? b : a;
  const gotTag = attack && prot === 'hash' ? sha256(utf8(b)) : sentTag;
  const accepts = hex(tagOf(gotMsg)) === hex(gotTag);
  const changed = gotMsg !== a;
  const verdict = !changed ? 'ok' : accepts ? 'fooled' : 'bad';
  const short = (t: Uint8Array) => hex(t).slice(0, 16) + '…';

  return (
    <Figure
      no={3}
      title="해시의 눈사태 효과와 MAC"
      hint="두 메시지를 고치고, 보호 방식을 바꿔 보세요"
      caption={<>위는 두 메시지의 SHA-256 값 256비트를 비교한 것으로, 주황색이 서로 다른 비트입니다. 아래는 보내는 쪽이 메시지 1에 확인값을 붙여 보내는데, 중간에서 누군가 메시지 2로 바꿔치기하는 상황입니다. 받는 쪽은 받은 메시지로 확인값을 다시 계산해 붙어 온 값과 비교합니다. HMAC의 열쇠는 보내는 쪽과 받는 쪽만 압니다.</>}
    >
      <div className="hm-inputs">
        <div className="ctl">
          <label className="ctl-label" htmlFor="hm-a">
            <span>메시지 1</span>
          </label>
          <input id="hm-a" className="text-input" value={a} maxLength={60} onChange={(e) => setA(e.target.value)} />
          <div className="hm-hash">{hex(ha)}</div>
        </div>
        <div className="ctl">
          <label className="ctl-label" htmlFor="hm-b">
            <span>메시지 2</span>
          </label>
          <input id="hm-b" className="text-input" value={b} maxLength={60} onChange={(e) => setB(e.target.value)} />
          <div className="hm-hash">{hex(hb)}</div>
        </div>
      </div>
      <BitStrip a={ha} b={hb} />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="서로 다른 비트" value={`${diff} / 256 (${Math.round((diff / 256) * 100)}%)`} color="var(--pos)" />
        <Readout label="메시지 길이" value={`${utf8(a).length} · ${utf8(b).length}바이트`} />
        <Readout label="해시 길이" value="언제나 32바이트" />
      </div>
      <div className="controls row">
        <Seg
          label="붙이는 확인값"
          value={prot}
          onChange={setProt}
          options={[
            { value: 'hash', label: 'SHA-256 해시' },
            { value: 'hmac', label: 'HMAC-SHA256 (열쇠 필요)' },
          ]}
        />
        <Check label="중간에서 메시지를 2로 바꿔치기" checked={attack} onChange={setAttack} />
      </div>
      <div className="hm-flow" aria-live="polite">
        <div className="hm-party">
          <strong>보내는 쪽</strong>
          <span>메시지 1</span>
          <span>
            확인값 <span className="mono">{short(sentTag)}</span>
          </span>
        </div>
        <div className="hm-party" data-active={attack || undefined}>
          <strong>중간의 공격자</strong>
          {!attack ? (
            <span>그대로 전달합니다.</span>
          ) : prot === 'hash' ? (
            <span>메시지를 2로 바꾸고, 해시는 누구나 계산할 수 있으므로 확인값도 새로 계산해 붙입니다.</span>
          ) : (
            <span>메시지를 2로 바꿨지만 열쇠를 모르니 맞는 HMAC을 만들 수 없어, 원래 확인값을 그대로 둡니다.</span>
          )}
        </div>
        <div className="hm-party" data-v={verdict}>
          <strong>받는 쪽</strong>
          <span>받은 메시지 {changed ? 2 : 1}</span>
          <span>
            다시 계산 <span className="mono">{short(tagOf(gotMsg))}</span>
          </span>
          <span style={{ fontWeight: 700, color: verdict === 'ok' ? 'var(--good)' : 'var(--bad)' }}>
            {verdict === 'ok' ? '일치: 받아들임 (실제로 바뀌지 않음)' : verdict === 'fooled' ? '일치: 받아들임. 바뀐 줄 모름!' : '불일치: 버림. 변조를 알아챔'}
          </span>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: birthday collisions on a truncated hash ─────────────── */

const K_MIN = 8;
const K_MAX = 28;
const AUTO_MAX = 20; // computed right away; larger k waits for the button
const TRIALS = 5;

function BirthdayFigure() {
  const P = usePalette();
  const [k, setK] = useState(16);
  const [runs, setRuns] = useState<Record<number, { attempts: number; a: string; b: string; value: number }[]>>(() => {
    const out: Record<number, { attempts: number; a: string; b: string; value: number }[]> = {};
    for (let kk = K_MIN; kk <= AUTO_MAX; kk += 2) out[kk] = Array.from({ length: TRIALS }, (_, t) => birthdaySearch(kk, t));
    return out;
  });
  const [busy, setBusy] = useState(false);
  const cur = runs[k];

  const compute = () => {
    setBusy(true);
    // let the button repaint before the search blocks the page
    setTimeout(() => {
      const res = Array.from({ length: TRIALS }, (_, t) => birthdaySearch(k, t));
      setRuns((r) => ({ ...r, [k]: res }));
      setBusy(false);
    }, 30);
  };
  useEffect(() => {
    if (!runs[k] && k <= 22) compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: K_MIN - 1, xMax: K_MAX + 1, yMin: 0, yMax: K_MAX + 1, pad: { l: 42, r: 12, t: 14, b: 30 } });
      plot.grid({ xStep: 4, yStep: 4, labels: false, axes: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= K_MAX; y += 8) ctx.fillText(`2^${y}`, plot.X(K_MIN - 1) - 5, plot.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = K_MIN; x <= K_MAX; x += 4) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText('해시 앞부분 k비트 →', plot.X(K_MAX + 1), plot.Y(0) - 3);
      // 2^k: finding an input that hits one given value
      plot.fn((x) => x, P.neg, 2, { dash: [6, 4] });
      plot.fn((x) => Math.log2(birthdayExpected(x)), P.pos, 2);
      plot.line(k, 0, k, K_MAX + 1, alpha(P.ink, 0.3), 1, [3, 3]);
      for (const [kk, rs] of Object.entries(runs)) for (const r of rs) plot.dot(+kk, Math.log2(r.attempts), Number(kk) === k ? 4.2 : 3, Number(kk) === k ? P.ink : alpha(P.ink, 0.55));
      plot.text('특정 값 맞히기 2ᵏ', K_MAX - 6.5, K_MAX - 4.5, P.neg, { font: `12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      plot.text('충돌 찾기 ≈ 1.25·2^(k/2)', K_MAX - 8, K_MAX / 2 + 3, P.pos, { font: `12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, runs, k],
    { aspect: 1.7, maxHeight: 340, minHeight: 230 },
  );

  const avg = cur ? cur.reduce((s, r) => s + r.attempts, 0) / cur.length : null;
  const ex = cur?.[0];
  return (
    <Figure
      no={4}
      title="생일 문제: 충돌은 생각보다 빨리 나온다"
      hint="해시 길이 k를 바꿔 보세요"
      caption={<>SHA-256 값의 앞 k비트만 쓰는 짧은 해시를 만들고, "trial-0:0", "trial-0:1", …을 차례로 해시해 앞서 나온 값과 같아지는 순간 멈춥니다. 시도마다 입력의 앞부분을 바꿔 {TRIALS}번 되풀이했습니다(점). 파란 점선은 미리 정한 값 하나를 맞히는 입력을 찾는 데 평균적으로 드는 횟수 2ᵏ, 주황 선은 아무 두 입력이든 같아지는 충돌까지의 기댓값 <M>{'\\sqrt{\\pi/2 \\cdot 2^k}'}</M>입니다. 세로축은 로그 눈금입니다. k가 {AUTO_MAX + 2}비트를 넘으면 계산에 몇 초 걸려 버튼을 눌러야 시작합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`해시 앞 ${k}비트에서 충돌을 찾는 데 든 시도 횟수. 기댓값은 약 ${n0(birthdayExpected(k))}번, 특정 값 맞히기는 ${n0(2 ** k)}번.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="bd-k" label="해시 길이 k (비트)" value={k} min={K_MIN} max={K_MAX} step={2} onChange={setK} />
          <Button small primary onClick={compute} disabled={busy || !!cur}>
            {busy ? '찾는 중…' : cur ? `${TRIALS}번 찾음` : `충돌 찾기 (${TRIALS}번)`}
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실제 평균 시도" value={avg === null ? '—' : `${n0(avg)}번`} color="var(--pos)" />
            <Readout label="충돌 기댓값" value={`${n0(birthdayExpected(k))}번`} />
            <Readout label="특정 값 맞히기" value={`${n0(2 ** k)}번`} color="var(--neg)" />
            <Readout label="충돌이 쉬운 정도" value={`${n0(2 ** k / birthdayExpected(k))}배`} />
          </div>
          {ex && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-2)' }}>
              첫 시도의 충돌: <span className="mono">"{ex.a}"</span>와 <span className="mono">"{ex.b}"</span>의 앞 {k}비트가 모두 <span className="mono">{ex.value.toString(2).padStart(k, '0')}</span>
            </div>
          )}
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '특정 값 맞히기 2ᵏ', shape: 'ln' },
          { color: 'var(--pos)', label: '충돌 기댓값', shape: 'ln' },
          { color: 'var(--ink)', label: '실제 시도 (점)' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Symmetric() {
  return (
    <>
      <h2>보안이 지켜야 하는 세 가지</h2>
      <p>
        <a href="#net-basics/layers">기초 네트워크</a>에서 본 패킷은 여러 사람의 장비를 지나갑니다. 카페의 Wi-Fi 공유기, 통신사의 라우터, 해저 케이블 너머의 교환 장비 어디서든 누군가 패킷을 엿보거나, 바꾸거나, 남인 척 보낼 수 있습니다. 그래서 안전한 통신은 보통 세 가지를 지키려 합니다.
      </p>
      <ul>
        <li>
          <T en="confidentiality">기밀성</T>: 엿들어도 내용을 알 수 없다.
        </li>
        <li>
          <T en="integrity">무결성</T>: 중간에 바뀌면 받는 쪽이 알아챈다.
        </li>
        <li>
          <T en="authentication">인증</T>: 상대가 정말 그 사람(그 서버)이다.
        </li>
      </ul>
      <p>
        이 장에서는 앞의 두 가지를 맡는 도구, 즉 같은 열쇠를 나눠 가진 두 사람이 쓰는 <T en="symmetric cipher">대칭 암호</T>와 <T en="hash function">해시 함수</T>를 봅니다. 열쇠를 처음에 어떻게 나눠 갖고 상대가 누구인지 어떻게 확인하는지는 <a href="#net-security/public-key">다음 장</a>의 주제입니다.
      </p>
      <Callout kind="note" label="케르크호프스의 원칙">
        1883년 오귀스트 케르크호프스는 암호 장치가 적의 손에 넘어가도 안전해야 한다고 썼습니다. 오늘날의 말로 하면 <strong>알고리즘은 공개하고, 비밀은 열쇠에만 둔다</strong>입니다. AES나 SHA-256은 설계가 모두 공개되어 있고 전 세계 연구자가 수십 년 동안 공격해 보았기 때문에 믿을 수 있습니다. 방식을 숨겨서 지키는 암호는 그 방식이 새어 나가는 순간 끝납니다.
      </Callout>

      <h2>XOR과 일회용 패드</h2>
      <p>
        가장 단순한 암호는 비트마다 <T en="exclusive or">XOR</T>(⊕)을 하는 것입니다. XOR은 두 비트가 다르면 1, 같으면 0이고, 같은 값을 두 번 XOR하면 원래대로 돌아옵니다(<M>{'(m \\oplus k) \\oplus k = m'}</M>). 그래서 메시지 m에 열쇠 k를 XOR하면 암호문이 되고, 받는 쪽이 같은 k를 한 번 더 XOR하면 평문이 됩니다.
      </p>
      <p>
        열쇠가 메시지만큼 길고, 완전히 무작위이고, <strong>딱 한 번만</strong> 쓰인다면 이 방식을 <T en="one-time pad">일회용 패드</T>라고 합니다. 1949년 섀넌은 일회용 패드가 <T en="perfect secrecy">완전 비밀성</T>을 가진다는 것을 증명했습니다. 암호문 하나는 같은 길이의 어떤 평문으로도 풀릴 수 있어서, 계산 능력이 아무리 커도 길이 말고는 알아낼 것이 없습니다. 문제는 메시지만큼 긴 열쇠를 미리 안전하게 나눠 가져야 하고, 절대 다시 쓰면 안 된다는 것입니다.
      </p>
      <XorFigure />
      <p>
        "같은 열쇠 두 번"을 눌러 보세요. 두 암호문을 XOR하면 열쇠가 서로 지워져 <M>{'c_1 \\oplus c_2 = m_1 \\oplus m_2'}</M>가 남습니다. 열쇠는 하나도 모르는데 두 평문의 관계가 드러납니다. 기본 예에서는 두 메시지의 글자가 같은 자리 2곳이 0으로, 한쪽이 공백인 자리 4곳이 영문자로 보입니다(ASCII에서 공백과 대문자를 XOR하면 소문자가 됩니다). 여기에 첫 메시지를 "ATTACK"이라고 추측해 XOR하면 둘째 메시지의 앞부분 "RETREA"가 그대로 나옵니다. 추측이 틀리면 엉뚱한 글자가 나오므로, 그럴듯한 단어를 이리저리 대 보며 두 메시지를 함께 풀어 갈 수 있습니다. 실제로 2차 세계대전 뒤 미국은 소련이 일회용 패드를 다시 쓴 통신을 이런 식으로 일부 해독했습니다(베노나 프로젝트).
      </p>

      <h2>블록 암호: 짧은 열쇠로 긴 메시지를</h2>
      <p>
        현실의 암호는 128비트나 256비트짜리 짧은 열쇠로 기가바이트를 암호화해야 합니다. 그 중심에 있는 것이 <T en="block cipher">블록 암호</T>입니다. 열쇠가 정해지면 고정된 길이의 블록 하나를 같은 길이의 다른 블록으로 바꾸는, 되돌릴 수 있는 뒤섞기 함수입니다. 열쇠를 모르면 그 결과가 무작위와 구별되지 않아야 합니다. 오늘날의 표준은 2001년에 정해진 <T en="Advanced Encryption Standard">AES</T>로, 블록은 128비트이고 열쇠는 128, 192, 256비트 중 하나입니다. 요즘 CPU에는 AES 전용 명령어가 있어서 코어 하나로도 1초에 기가바이트 단위를 암호화합니다.
      </p>
      <p>
        블록 암호는 블록 하나만 다루므로, 긴 메시지에는 블록을 어떻게 이어 쓸지 정하는 <T en="mode of operation">운용 방식</T>이 필요합니다.
      </p>
      <ul>
        <li>
          <strong>ECB</strong>: 블록마다 따로 암호화합니다. 가장 단순하지만 <strong>같은 평문 블록은 언제나 같은 암호문 블록</strong>이 됩니다.
        </li>
        <li>
          <strong>CBC</strong>: 각 평문 블록을 바로 앞 암호문 블록과 XOR한 뒤 암호화합니다. 첫 블록은 매번 새로 고른 무작위 <T en="initialization vector">IV</T>와 XOR합니다.
        </li>
        <li>
          <strong>CTR</strong>: 블록 암호로 "nonce + 0", "nonce + 1", … 같은 카운터를 암호화해 긴 열쇠 흐름을 만들고, 그것을 평문과 XOR합니다. 일회용 패드를 블록 암호로 흉내 내는 셈입니다.
        </li>
      </ul>
      <ModesFigure />
      <p>
        ECB로 암호화한 자물쇠는 모양이 그대로 보입니다. 384개 블록 중 서로 다른 평문 블록은 15가지뿐이고, 배경처럼 한 가지 밝기로 칠한 블록은 248번이나 같은 암호문 블록이 됩니다. 각 블록의 내용은 알 수 없어도 어디가 같고 어디가 다른지가 고스란히 새어 나갑니다. CBC와 CTR에서는 384개 블록이 모두 다른 암호문이 되어 무늬가 사라집니다. 열쇠를 바꿔도 ECB의 무늬는 그대로입니다. 바뀌는 것은 각 무늬의 질감뿐입니다.
      </p>
      <p>
        CTR에서 "같은 열쇠와 nonce로 다른 그림도 암호화하기"를 켜 보세요. 두 암호문을 XOR하자 자물쇠와 얼굴이 겹친 그림이 나타납니다. 같은 nonce를 쓰면 같은 열쇠 흐름이 나오므로, 그림 1의 열쇠 재사용과 똑같은 일이 일어납니다. 그래서 CTR과 그 위에 만든 방식에서 nonce는 "한 번만 쓰는 수"라는 이름 그대로 같은 열쇠로 절대 되풀이하면 안 됩니다.
      </p>

      <h2>해시 함수: 데이터의 지문</h2>
      <p>
        <T en="cryptographic hash function">암호학적 해시 함수</T>는 길이가 얼마든 입력을 받아 고정된 길이의 값을 냅니다. SHA-256이라면 언제나 256비트(32바이트)입니다. <a href="#cs-algorithms/search-hash">해시 테이블</a>의 해시와 달리 공격자를 상대로 버텨야 하므로 세 가지 성질이 필요합니다.
      </p>
      <ul>
        <li>
          <T en="preimage resistance">역상 저항성</T>: 해시값 h만 보고 <M>{'H(x) = h'}</M>인 x를 찾을 수 없다.
        </li>
        <li>
          <T en="second-preimage resistance">제2 역상 저항성</T>: x가 주어졌을 때 해시값이 같은 다른 x′을 찾을 수 없다.
        </li>
        <li>
          <T en="collision resistance">충돌 저항성</T>: 해시값이 같은 아무 두 입력이라도 찾을 수 없다.
        </li>
      </ul>
      <p>
        좋은 해시에서는 입력이 조금만 바뀌어도 출력 비트가 절반쯤 뒤집힙니다(<T en="avalanche effect">눈사태 효과</T>). 그래서 해시값을 보고 입력이 "비슷한지"조차 알 수 없습니다. 내려받은 파일이 원본과 같은지 확인하거나, Git이 커밋과 파일을 구분하거나, 다음 장의 전자 서명이 긴 문서 대신 해시값에 서명할 수 있는 것이 모두 이 성질 덕분입니다.
      </p>
      <HashMacFigure />
      <p>
        두 메시지는 숫자 하나만 다른데, 해시값은 256비트 중 137비트(54%)가 다릅니다. 그런데 아래쪽에서 확인값으로 해시만 붙이면 바꿔치기를 막지 못합니다. 해시 함수는 공개되어 있어서 공격자도 바꾼 메시지의 해시를 새로 계산해 붙일 수 있기 때문입니다. 무결성을 지키려면 열쇠가 있어야만 계산할 수 있는 확인값, 곧 <T en="message authentication code">MAC</T>이 필요합니다. 대표적인 것이 해시 함수에 열쇠를 두 번 섞는 <T en="hash-based MAC">HMAC</T>입니다. 열쇠를 모르는 공격자는 바꾼 메시지에 맞는 HMAC을 만들 수 없고, 받는 쪽은 변조를 알아챕니다.
      </p>
      <Callout kind="warn">
        열쇠를 메시지 앞에 붙여 해시하는 <code>SHA-256(열쇠 ‖ 메시지)</code>는 MAC처럼 보이지만 안전하지 않습니다. SHA-256 같은 머클–담고르 구조의 해시는 해시값이 곧 내부 상태여서, 열쇠를 몰라도 메시지 뒤에 내용을 덧붙인 것의 해시를 계산할 수 있습니다(<T en="length extension attack">길이 확장 공격</T>). HMAC은 이 문제를 피하도록 설계되었습니다. 이렇게 그럴듯한 조합이 미묘하게 깨지는 일이 흔해서, 암호 전문가들은 "직접 만들지 말고 검증된 라이브러리를 쓰라"고 거듭 말합니다.
      </Callout>

      <h2>생일 문제와 해시의 길이</h2>
      <p>
        해시값은 입력보다 짧으므로 충돌은 반드시 존재합니다. 다만 찾기가 어려워야 합니다. 여기서 직관이 자주 틀립니다. 23명만 모여도 생일이 같은 두 사람이 있을 확률이 절반을 넘듯, k비트 해시에서 아무 두 입력이 같아지는 충돌은 <M>{'2^k'}</M>번이 아니라 대략 <M>{'2^{k/2}'}</M>번 만에 나옵니다. 하나하나가 앞서 나온 모든 값과 비교되기 때문입니다.
      </p>
      <BirthdayFigure />
      <p>
        16비트 해시에서 특정 값 하나를 맞히려면 평균 65,536번을 해시해야 하지만, 충돌은 다섯 번의 시도에서 평균 391번 만에 나왔습니다(기댓값 321번). 28비트에서는 맞히기가 약 2억 7천만 번인데 충돌은 평균 24,206번입니다(기댓값 20,534번). 그래서 해시가 충돌에 버티는 힘은 출력 길이의 절반으로 봅니다. SHA-256의 충돌을 무작정 찾으려면 약 <M>{'2^{128}'}</M>번을 해시해야 하는데, 1초에 <M>{'10^{18}'}</M>번씩 해도 약 10조 년, 우주 나이의 수백 배가 걸립니다.
      </p>
      <p>
        그런데 수학적인 약점이 발견되면 이야기가 달라집니다. 128비트 해시인 MD5는 2004년에 충돌을 찾는 방법이 발표되었고, 지금은 일반 컴퓨터로 금방 충돌을 만듭니다. 160비트 SHA-1은 2017년 구글과 네덜란드 CWI 연구진이 내용이 다른데 SHA-1 값이 같은 PDF 두 개를 실제로 만들어 보였습니다(SHAttered). 그 뒤 인증서와 Git 같은 곳에서 SHA-1을 걷어 내는 일이 빨라졌습니다. 지금 새로 쓰는 시스템은 SHA-256 같은 SHA-2 계열이나 SHA-3을 씁니다.
      </p>

      <h2>인증 암호: 숨기기와 지키기를 한 번에</h2>
      <p>
        암호화만 하고 MAC을 빼면 어떻게 될까요? CTR처럼 XOR로 만드는 암호에서는 공격자가 암호문의 비트 하나를 뒤집으면 평문의 같은 비트가 뒤집힙니다. 내용은 몰라도 "10,000원"의 1을 9로 바꾸는 일이 가능할 수 있습니다. 그래서 오늘날에는 암호화와 MAC을 하나로 묶은 <T en="authenticated encryption with associated data">인증 암호(AEAD)</T>를 씁니다. 대표적인 것이 CTR에 다항식 MAC을 결합한 <strong>AES-GCM</strong>과 <strong>ChaCha20-Poly1305</strong>이고, <a href="#net-security/tls">TLS 1.3</a>은 이런 인증 암호만 허용합니다. 받는 쪽은 확인값이 맞지 않으면 복호화한 내용을 아예 내놓지 않습니다.
      </p>
      <MB note="AEAD: 열쇠와 nonce로 암호화하고, 헤더처럼 숨기지 않을 데이터까지 함께 확인값에 묶는다">{'(c,\\ \\text{tag}) = \\text{Enc}_k(\\text{nonce},\\ m,\\ \\text{ad}) \\qquad \\text{Dec}_k(\\text{nonce},\\ c,\\ \\text{ad},\\ \\text{tag}) \\in \\{\\, m,\\ \\bot \\,\\}'}</MB>
      <p>
        AES-GCM에서도 nonce 재사용은 치명적입니다. 그림 2에서 본 평문 노출에 더해, 확인값을 위조하는 데 쓸 수 있는 정보까지 새어 나갑니다. 라이브러리가 nonce를 자동으로 관리하게 하거나, nonce가 겹쳐도 덜 위험한 방식(AES-GCM-SIV 등)을 고르는 이유입니다.
      </p>

      <Callout kind="key">
        대칭 암호는 같은 열쇠를 가진 두 사람 사이의 기밀성을 지킵니다. 일회용 패드는 완전하지만 열쇠를 한 번만 써야 하고, 다시 쓰면 <M>{'c_1 \\oplus c_2 = m_1 \\oplus m_2'}</M>가 새어 나갑니다. 실전에서는 AES 같은 블록 암호를 운용 방식과 함께 쓰는데, ECB는 같은 블록을 같은 암호문으로 만들어 무늬를 드러내므로 쓰지 않습니다. 해시는 데이터의 지문이지만 누구나 계산할 수 있으므로 무결성에는 열쇠가 들어간 MAC이 필요하고, 충돌에 버티는 힘은 출력 길이의 절반입니다. 오늘날에는 암호화와 MAC을 묶은 인증 암호(AES-GCM, ChaCha20-Poly1305)를 쓰고, nonce는 절대 되풀이하지 않습니다.
      </Callout>
      <Quiz
        q="한 개발자가 사용자 데이터를 AES로 암호화해 저장하면서, 같은 열쇠로 모든 레코드를 ECB 방식으로 암호화했다. 열쇠는 안전하게 보관된다. 무엇이 문제인가?"
        options={[
          '문제없다. AES는 깨지지 않았고 열쇠도 안전하므로 암호문에서 알 수 있는 것이 없다',
          '같은 내용의 레코드(예: 같은 비밀번호나 같은 주소)가 같은 암호문이 되어, 열쇠 없이도 어떤 레코드끼리 내용이 같은지 알 수 있다. 레코드마다 다른 nonce를 쓰는 인증 암호(예: AES-GCM)로 바꿔야 한다',
          'ECB는 복호화가 불가능해서 데이터를 다시 읽을 수 없다',
          '열쇠를 256비트로 늘리면 같은 평문이 서로 다른 암호문이 되므로 해결된다',
        ]}
        answer={1}
        explain={<>ECB는 결정적입니다. 열쇠가 같으면 같은 평문 블록은 언제나 같은 암호문 블록이 됩니다. 그래서 그림 2의 자물쇠처럼, 내용은 몰라도 "이 두 사용자의 비밀번호가 같다" 같은 정보가 새어 나갑니다. 열쇠를 늘려도 이 성질은 그대로입니다. 레코드마다 새 nonce를 쓰고 변조까지 막아 주는 인증 암호가 맞는 선택입니다(그리고 비밀번호는 애초에 암호화가 아니라 전용 해시로 저장해야 합니다. <a href="#net-security/web-security">웹 보안</a> 장에서 봅니다).</>}
      />
    </>
  );
}

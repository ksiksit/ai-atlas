import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import {
  CATS,
  CONTRAST_PRESETS,
  FIELDS,
  FIELDS_START,
  ISSUE_COUNT,
  KEEP,
  PR_DIFF,
  applicants,
  cleanRepo,
  commit,
  conflictRepo,
  contrast,
  initRepo,
  mergeCommit,
  other,
  planMerge,
  rates,
  type Branch,
  type Cat,
  type MergeRow,
  type Repo,
} from './collab';
import './software.css';

/* ─────────────── Figure 1: commits, branches and a three-way merge ─────────────── */

const LANE_Y: Record<Branch, number> = { main: 34, feature: 88 };
const X0 = 84;
const DX = 50;

function GraphSvg({ repo }: { repo: Repo }) {
  const n = repo.commits.length;
  const W = Math.max(420, X0 + n * DX + 30);
  const x = (id: number) => X0 + id * DX;
  return (
    <div className="sw-scroll sw-gitbox">
      <svg className="sw-svg" viewBox={`0 0 ${W} 124`} style={{ width: W, maxWidth: 'none' }} role="img" aria-label={`커밋 ${n}개. main은 c${repo.heads.main}, feature는 c${repo.heads.feature}를 가리키고, 지금 브랜치는 ${repo.cur}입니다.`}>
        {(['main', 'feature'] as Branch[]).map((b) => (
          <g key={b}>
            <line x1={X0 - 20} x2={W - 10} y1={LANE_Y[b]} y2={LANE_Y[b]} className="sw-lane" />
            <text x={8} y={LANE_Y[b] + 4} className="sw-lane-name mono">
              {b}
            </text>
          </g>
        ))}
        {repo.commits.flatMap((c) =>
          c.parents.map((p) => {
            const pc = repo.commits[p];
            const x1 = x(p);
            const y1 = LANE_Y[pc.lane];
            const x2 = x(c.id);
            const y2 = LANE_Y[c.lane];
            const d = y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1 + DX * 0.6},${y1} ${x2 - DX * 0.6},${y2} ${x2},${y2}`;
            return <path key={`${p}-${c.id}`} d={d} className="sw-gitedge" />;
          }),
        )}
        {repo.commits.map((c) => (
          <g key={c.id} className="sw-gitnode" data-lane={c.lane} data-merge={c.parents.length > 1 || undefined}>
            <title>{`c${c.id}: ${c.msg}`}</title>
            <circle cx={x(c.id)} cy={LANE_Y[c.lane]} r={10} />
            <text x={x(c.id)} y={LANE_Y[c.lane] + 4} textAnchor="middle" className="mono">
              {c.id}
            </text>
          </g>
        ))}
        {(['main', 'feature'] as Branch[]).map((b) => {
          const h = repo.commits[repo.heads[b]];
          // main's tag sits above its commit, feature's below, so they never cover each other
          const y = LANE_Y[h.lane] + (b === 'main' ? -27 : 14);
          const label = b + (repo.cur === b ? ' (HEAD)' : '');
          const w = label.length * 7 + 10;
          return (
            <g key={b} className="sw-headtag" data-cur={repo.cur === b || undefined}>
              <rect x={x(h.id) - w / 2} y={y - 1} width={w} height={15} rx={2} />
              <text x={x(h.id)} y={y + 10} textAnchor="middle" className="mono">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GitFigure() {
  const [repo, setRepo] = useState<Repo>(conflictRepo);
  const [work, setWork] = useState<string[]>(() => conflictRepo().commits[conflictRepo().heads.main].lines);
  const [pending, setPending] = useState<MergeRow[] | null>(null);
  const [last, setLast] = useState<{ rows: MergeRow[]; ours: Branch } | null>(null);
  const [note, setNote] = useState('main과 feature가 같은 커밋 0에서 갈라져 각자 커밋을 하나씩 했습니다. feature를 main으로 병합해 보세요.');
  const head = repo.commits[repo.heads[repo.cur]];
  const dirty = work.map((l, i) => l !== head.lines[i]);
  const nDirty = dirty.filter(Boolean).length;
  const unresolved = pending ? pending.filter((r) => r.result === null).length : 0;

  const load = (r: Repo, msg: string) => {
    setRepo(r);
    setWork(r.commits[r.heads[r.cur]].lines.slice());
    setPending(null);
    setLast(null);
    setNote(msg);
  };
  const switchTo = (b: Branch) => {
    if (b === repo.cur || pending) return;
    if (nDirty) {
      setNote('커밋하지 않은 변경이 있어 브랜치를 바꿀 수 없습니다. 먼저 커밋하거나 되돌리세요.');
      return;
    }
    const r = { ...repo, cur: b };
    setRepo(r);
    setWork(r.commits[r.heads[b]].lines.slice());
    setNote(`${b} 브랜치로 바꿨습니다. 작업 중인 파일이 ${b}가 가리키는 커밋 ${r.heads[b]}의 내용으로 바뀝니다.`);
  };
  const doCommit = () => {
    const r = commit(repo, work);
    setRepo(r);
    setLast(null);
    setNote(`커밋 ${r.heads[r.cur]}을 만들고 ${r.cur}가 그 커밋을 가리키게 했습니다.`);
  };
  const doMerge = () => {
    if (nDirty) {
      setNote('커밋하지 않은 변경이 있습니다. 병합하기 전에 커밋하세요.');
      return;
    }
    const plan = planMerge(repo);
    const o = other(repo.cur);
    if (plan.kind === 'uptodate') setNote(`${repo.cur}는 이미 ${o}의 모든 커밋을 갖고 있습니다. 병합할 것이 없습니다.`);
    else if (plan.kind === 'ff') {
      const r = { ...repo, heads: { ...repo.heads, [repo.cur]: plan.to } };
      setRepo(r);
      setWork(r.commits[plan.to].lines.slice());
      setNote(`빨리 감기(fast-forward): ${repo.cur}에는 ${o}에 없는 커밋이 없으므로, 새 커밋 없이 ${repo.cur}를 커밋 ${plan.to}로 옮기기만 했습니다.`);
    } else if (plan.rows.some((r) => r.state === 'conflict')) {
      setPending(plan.rows);
      setNote(`충돌: 공통 조상 커밋 ${plan.base} 이후 두 브랜치가 같은 줄을 서로 다르게 바꿨습니다. 아래 표에서 줄마다 어느 쪽을 남길지 고르세요.`);
    } else {
      const r = mergeCommit(repo, plan.rows.map((x) => x.result!));
      setRepo(r);
      setWork(r.commits[r.heads[r.cur]].lines.slice());
      setLast({ rows: plan.rows, ours: repo.cur });
      setNote(`공통 조상 커밋 ${plan.base}과 두 브랜치를 줄마다 비교해, 충돌 없이 병합 커밋 ${r.heads[r.cur]}을 만들었습니다.`);
    }
  };
  const finishMerge = () => {
    if (!pending || unresolved) return;
    const r = mergeCommit(repo, pending.map((x) => x.result!));
    setRepo(r);
    setWork(r.commits[r.heads[r.cur]].lines.slice());
    setLast({ rows: pending, ours: repo.cur });
    setPending(null);
    setNote(`충돌을 해결하고 병합 커밋 ${r.heads[r.cur]}을 만들었습니다. 이 커밋은 부모가 둘입니다.`);
  };
  const resolve = (i: number, v: string) => setPending(pending!.map((r, k) => (k === i ? { ...r, result: v } : r)));

  const table = pending ? { rows: pending, ours: repo.cur } : last;
  const theirs = table ? other(table.ours) : 'feature';

  return (
    <Figure
      no={1}
      title="커밋, 브랜치, 병합"
      hint="줄을 고쳐 커밋하고, 브랜치를 바꾸고, 병합해 보세요"
      caption={<>위는 커밋 그래프입니다. 동그라미 하나가 커밋(파일 전체의 스냅숏)이고, 선은 부모 커밋을 잇습니다. 이름표 main과 feature는 브랜치가 가리키는 커밋이고, (HEAD)가 붙은 쪽이 지금 작업 중인 브랜치입니다. 아래 다섯 줄은 작업 중인 파일로, 직접 고칠 수 있습니다. 노란 줄은 아직 커밋하지 않은 변경입니다.</>}
    >
      <GraphSvg repo={repo} />
      <div className="fig-split">
        <div className="sw-col">
          <div className="sw-label">
            작업 중인 파일 config.js · <strong>{repo.cur}</strong> 브랜치, 커밋 {head.id}에서 시작
          </div>
          <div className="sw-work">
            {work.map((l, i) => (
              <label key={i} className="sw-workline" data-dirty={dirty[i] || undefined}>
                <span className="sw-ln">{i + 1}</span>
                <input className="sw-input" value={l} spellCheck={false} disabled={!!pending} onChange={(e) => setWork(work.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`${i + 1}번 줄`} />
              </label>
            ))}
          </div>
          <div className="sw-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Seg label="브랜치 바꾸기 (checkout)" value={repo.cur} onChange={switchTo} options={(['main', 'feature'] as Branch[]).map((b) => ({ value: b, label: b }))} />
          <div className="btn-row">
            <Button small primary onClick={doCommit} disabled={!nDirty || !!pending}>
              커밋
            </Button>
            <Button small onClick={() => setWork(head.lines.slice())} disabled={!nDirty || !!pending}>
              변경 되돌리기
            </Button>
            <Button small onClick={doMerge} disabled={!!pending}>
              {other(repo.cur)}를 병합 (merge)
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="커밋" value={`${repo.commits.length}개`} />
            <Readout label={pending ? '남은 충돌' : '커밋 안 한 줄'} value={pending ? unresolved : nDirty} color={(pending ? unresolved : nDirty) ? 'var(--bad)' : undefined} />
          </div>
          <div className="btn-row">
            <Button small onClick={() => load(conflictRepo(), '충돌이 나는 상황입니다. main과 feature 모두 PRICE 줄을 바꿨습니다.')}>
              충돌 예시
            </Button>
            <Button small onClick={() => load(cleanRepo(), '두 브랜치가 서로 다른 줄을 바꿨습니다. 병합해 보세요.')}>
              충돌 없는 예시
            </Button>
            <Button small onClick={() => load(initRepo(), '커밋 하나에서 시작합니다. 줄을 고쳐 커밋하고, feature로 바꿔 다른 줄을 고쳐 보세요.')}>
              빈 저장소
            </Button>
          </div>
        </div>
      </div>
      {table && (
        <div className="tbl-wrap" style={{ margin: 0 }}>
          <table className="tbl sw-merge">
            <thead>
              <tr>
                <th>줄</th>
                <th>공통 조상</th>
                <th>{table.ours}</th>
                <th>{theirs}</th>
                <th>병합 결과</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} data-s={r.state}>
                  <td className="mono">{i + 1}</td>
                  <td className="mono">{r.base}</td>
                  <td className="mono" data-chg={r.ours !== r.base || undefined}>
                    {r.ours}
                  </td>
                  <td className="mono" data-chg={r.theirs !== r.base || undefined}>
                    {r.theirs}
                  </td>
                  <td>
                    {r.state === 'conflict' && pending ? (
                      <div className="sw-resolve">
                        <button type="button" className="sw-chip" aria-pressed={r.result === r.ours} onClick={() => resolve(i, r.ours)}>
                          {table.ours} 쪽
                        </button>
                        <button type="button" className="sw-chip" aria-pressed={r.result === r.theirs} onClick={() => resolve(i, r.theirs)}>
                          {theirs} 쪽
                        </button>
                        <input className="sw-input" value={r.result ?? ''} placeholder="직접 쓰기" onChange={(e) => resolve(i, e.target.value)} aria-label={`${i + 1}번 줄 직접 쓰기`} />
                      </div>
                    ) : (
                      <span className="mono">{r.result}</span>
                    )}
                    <span className="sw-why">
                      {r.state === 'same' ? '아무도 안 바꿈' : r.state === 'both' ? '양쪽이 똑같이 바꿈' : r.state === 'ours' ? `${table.ours}만 바꿈 → ${table.ours} 쪽` : r.state === 'theirs' ? `${theirs}만 바꿈 → ${theirs} 쪽` : '양쪽이 다르게 바꿈 → 충돌'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <Button small primary onClick={finishMerge} disabled={unresolved > 0}>
                병합 커밋 만들기
              </Button>
              <Button
                small
                onClick={() => {
                  setPending(null);
                  setNote('병합을 취소했습니다 (git merge --abort).');
                }}
              >
                병합 취소
              </Button>
            </div>
          )}
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: a code review ─────────────── */

function ReviewFigure() {
  const [open, setOpen] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, Cat>>({});
  const [reveal, setReveal] = useState(false);
  const found = PR_DIFF.filter((d, i) => d.issue && comments[i] === d.issue.cat).length;
  const noise = Object.keys(comments).filter((k) => !PR_DIFF[+k].issue).length;
  const foundCat = (c: Cat) => PR_DIFF.filter((d, i) => d.issue?.cat === c && comments[i] === c).length;
  const totalCat = (c: Cat) => PR_DIFF.filter((d) => d.issue?.cat === c).length;
  const key = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(open === i ? null : i);
    }
  };

  return (
    <Figure
      no={2}
      title="코드 리뷰 해 보기"
      hint="문제가 있어 보이는 줄을 누르고 종류를 골라 의견을 남기세요"
      caption={<>동료가 올린 풀 리퀘스트입니다. 초록 줄(+)은 더한 줄, 빨간 줄(−)은 지운 줄입니다. 줄을 누르면(또는 Tab으로 가서 Enter) 의견 칸이 열립니다. 이 PR에는 오른쪽 체크리스트의 다섯 종류에 걸친 문제가 {ISSUE_COUNT}개 숨어 있습니다.</>}
    >
      <div className="sw-pr">
        <strong>PR #42 쿠폰 할인 적용</strong>
        <span>쿠폰 코드를 입력하면 주문 금액의 10%를 할인합니다. 할인은 최대 5,000원입니다.</span>
      </div>
      <div className="fig-split">
        <div className="sw-diff">
          {PR_DIFF.map((d, i) => {
            if (d.kind === 'file')
              return (
                <div key={i} className="sw-diff-file mono">
                  {d.text}
                </div>
              );
            const c = comments[i];
            const verdict = c === undefined ? null : d.issue && d.issue.cat === c ? 'good' : d.issue ? 'near' : 'none';
            return (
              <div key={i} className="sw-diff-block">
                <div className="sw-diff-line mono" data-k={d.kind} data-open={open === i || undefined} data-c={verdict ?? undefined} data-reveal={reveal && d.issue ? true : undefined} role="button" tabIndex={0} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} onKeyDown={key(i)}>
                  <span className="sg">{d.kind === 'note' ? '' : d.kind}</span>
                  <span className="tx">{d.text || ' '}</span>
                  {c !== undefined && <span className="sw-badge" data-t={verdict === 'good' ? 'good' : verdict === 'near' ? 'hl' : 'dim'}>{CATS.find((k) => k.id === c)!.label}</span>}
                </div>
                {open === i && (
                  <div className="sw-diff-cmt">
                    <div className="sw-chips">
                      {CATS.map((k) => (
                        <button key={k.id} type="button" className="sw-chip" aria-pressed={c === k.id} onClick={() => setComments({ ...comments, [i]: k.id })}>
                          {k.label}
                        </button>
                      ))}
                      {c !== undefined && (
                        <button
                          type="button"
                          className="sw-chip"
                          onClick={() => {
                            const n = { ...comments };
                            delete n[i];
                            setComments(n);
                          }}
                        >
                          의견 지우기
                        </button>
                      )}
                    </div>
                    {verdict && <div className="sw-note">{verdict === 'good' ? d.issue!.why : verdict === 'near' ? '이 줄에 문제가 있는 것은 맞지만, 다른 종류의 문제입니다.' : '이 줄은 괜찮아 보입니다. 리뷰 의견이 많다고 좋은 리뷰는 아닙니다.'}</div>}
                  </div>
                )}
                {reveal && d.issue && open !== i && comments[i] !== d.issue.cat && (
                  <div className="sw-diff-reveal">
                    <strong>{CATS.find((k) => k.id === d.issue!.cat)!.label}</strong> {d.issue.why}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="찾은 문제" value={`${found} / ${ISSUE_COUNT}`} color={found === ISSUE_COUNT ? 'var(--good)' : undefined} />
            <Readout label="괜한 지적" value={noise} />
          </div>
          <div className="sw-checklist">
            {CATS.map((k) => (
              <div key={k.id} data-done={foundCat(k.id) === totalCat(k.id) || undefined}>
                <span className="mk">{foundCat(k.id) === totalCat(k.id) ? '☑' : '☐'}</span>
                <span>
                  <strong>{k.label}</strong> {k.ask}
                </span>
                <span className="mono">
                  {foundCat(k.id)}/{totalCat(k.id)}
                </span>
              </div>
            ))}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setReveal(!reveal)}>
              {reveal ? '답 숨기기' : '모든 문제 보기'}
            </Button>
            <Button
              small
              onClick={() => {
                setComments({});
                setOpen(null);
                setReveal(false);
              }}
            >
              처음부터
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: responsible software ─────────────── */

function PrivacyPanel() {
  const [on, setOn] = useState<Set<string>>(new Set(FIELDS_START));
  const [keep, setKeep] = useState('ever');
  const chosen = FIELDS.filter((f) => on.has(f.id));
  const extra = chosen.filter((f) => !f.need);
  const missing = FIELDS.filter((f) => f.need && !on.has(f.id));
  const factor = KEEP.find((k) => k.value === keep)!.factor;
  const risk = chosen.reduce((s, f) => s + f.risk, 0) * factor;
  const maxRisk = FIELDS.reduce((s, f) => s + f.risk, 0) * 3;

  return (
    <div className="fig-split">
      <div className="sw-col">
        <div className="sw-ask">
          <strong>기능:</strong> 회원의 생일에 할인 쿠폰을 이메일로 보낸다. 가입 양식에서 무엇을 받을까요?
        </div>
        <div className="sw-fields">
          {FIELDS.map((f) => (
            <Check
              key={f.id}
              label={
                <span className="sw-field">
                  {f.label} <span className="sw-risk" aria-label={`위험 ${f.risk}`}>{'●'.repeat(f.risk)}</span>
                </span>
              }
              checked={on.has(f.id)}
              onChange={(v) => {
                const n = new Set(on);
                if (v) n.add(f.id);
                else n.delete(f.id);
                setOn(n);
              }}
            />
          ))}
        </div>
        <Seg label="얼마나 오래 보관하나" value={keep} onChange={setKeep} options={KEEP.map((k) => ({ value: k.value, label: k.label }))} />
      </div>
      <div className="controls">
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="모으는 항목" value={chosen.length} />
          <Readout label="기능에 필요 없는 항목" value={extra.length} color={extra.length ? 'var(--bad)' : 'var(--good)'} />
        </div>
        <div className="ctl">
          <span className="ctl-label">
            <span>유출되면 생길 피해 (상대값)</span>
            <span className="val">{Math.round(risk)}</span>
          </span>
          <div className="sw-meter">
            <i style={{ width: `${Math.min(100, (risk / maxRisk) * 100)}%` }} />
          </div>
        </div>
        <div className="sw-note">
          {missing.length
            ? `${missing.map((f) => f.label).join(', ')} 없이는 이 기능을 만들 수 없습니다.`
            : extra.length
              ? `${extra.map((f) => f.label).join(', ')}은(는) 이 기능에 쓰이지 않습니다. 쓰지 않는 데이터도 유출되면 똑같이 피해가 됩니다.`
              : keep !== 'sent'
                ? '필요한 것만 모았습니다. 보관 기간도 줄여 보세요.'
                : '꼭 필요한 것만, 필요한 동안만 보관합니다. 데이터 최소화의 원칙입니다.'}
        </div>
      </div>
    </div>
  );
}

function BiasPanel() {
  const P = usePalette();
  const people = useMemo(applicants, []);
  const [split, setSplit] = useState(false);
  const [tA, setTA] = useState(52);
  const [tB, setTB] = useState(52);
  const t = { A: tA, B: split ? tB : tA };
  const rA = rates(people.filter((p) => p.group === 'A'), t.A);
  const rB = rates(people.filter((p) => p.group === 'B'), t.B);
  const jitter = useMemo(() => people.map((_, i) => ((i * 0.618034) % 1) * 0.8 + 0.1), [people]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 28;
      const padR = 10;
      const band = (h - 26) / 2;
      const X = (s: number) => padL + (s / 100) * (w - padL - padR);
      (['A', 'B'] as const).forEach((g, gi) => {
        const y0 = 4 + gi * band;
        ctx.fillStyle = P.surface2;
        ctx.fillRect(X(0), y0, X(100) - X(0), band - 6);
        ctx.fillStyle = alpha(P.ink, 0.08);
        ctx.fillRect(X(0), y0, X(t[g]) - X(0), band - 6);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 13px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(g, 8, y0 + (band - 6) / 2);
        people.forEach((p, i) => {
          if (p.group !== g) return;
          const cx = X(p.score);
          const cy = y0 + 4 + jitter[i] * (band - 14);
          ctx.beginPath();
          if (p.good) ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
          else ctx.rect(cx - 3, cy - 3, 6, 6);
          ctx.fillStyle = p.good ? P.good : P.bad;
          ctx.globalAlpha = p.score >= t[g] ? 0.95 : 0.45;
          ctx.fill();
          ctx.globalAlpha = 1;
        });
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(t[g]), y0 - 2);
        ctx.lineTo(X(t[g]), y0 + band - 4);
        ctx.stroke();
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const s of [0, 25, 50, 75, 100]) ctx.fillText(String(s), X(s), h - 2);
    },
    [P, people, t.A, t.B, jitter],
    { aspect: 2.4, maxHeight: 260, minHeight: 200 },
  );

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="fig-split">
      <div className="sw-col">
        <div className="sw-ask">
          <strong>기능:</strong> 신용 점수가 기준 이상이면 대출을 승인한다. 두 집단 A, B는 실제로 갚는 사람의 비율이 60%로 같지만, B는 금융 기록이 짧아 점수가 덜 정확합니다.
        </div>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`집단 A와 B의 신청자 점수 분포와 승인 기준선. A는 기준 ${t.A}, B는 기준 ${t.B}.`}>
          <canvas ref={canvasRef} />
        </div>
        <Legend
          items={[
            { color: 'var(--good)', label: '실제로 갚을 사람', shape: 'dot' },
            { color: 'var(--bad)', label: '못 갚을 사람', shape: 'sq' },
            { color: 'var(--ink)', label: '승인 기준 (오른쪽이 승인)', shape: 'ln' },
          ]}
        />
      </div>
      <div className="controls">
        <Slider id="bias-ta" label={split ? 'A의 기준 점수' : '기준 점수'} value={tA} min={20} max={80} step={1} onChange={setTA} />
        {split && <Slider id="bias-tb" label="B의 기준 점수" value={tB} min={20} max={80} step={1} onChange={setTB} />}
        <Check label="집단마다 다른 기준" checked={split} onChange={setSplit} />
        <table className="tbl sw-rates">
          <thead>
            <tr>
              <th />
              <th>승인율</th>
              <th>갚을 사람 거절</th>
              <th>못 갚을 사람 승인</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['A', rA],
                ['B', rB],
              ] as const
            ).map(([g, r]) => (
              <tr key={g}>
                <td>{g}</td>
                <td className="num">{pct(r.approve)}</td>
                <td className="num">{pct(r.fnr)}</td>
                <td className="num">{pct(r.fpr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sw-note">
          {split
            ? '기준을 따로 두면 한 가지 오류율은 맞출 수 있지만, 보통 다른 오류율이나 승인율이 벌어집니다. 무엇을 같게 맞출지는 기술이 아니라 가치의 문제입니다.'
            : `같은 기준인데도, 갚을 수 있는데 거절당하는 비율이 A는 ${pct(rA.fnr)}, B는 ${pct(rB.fnr)}입니다. 규칙은 공평해 보여도 오류는 고르게 나뉘지 않습니다.`}
        </div>
      </div>
    </div>
  );
}

const grade = (ratio: number, need: number) => (ratio >= need ? 'good' : 'bad');

function ContrastPanel() {
  const [fg, setFg] = useState(CONTRAST_PRESETS[0].fg);
  const [bg, setBg] = useState(CONTRAST_PRESETS[0].bg);
  const ratio = contrast(fg, bg);
  const checks = [
    { label: '본문 글자 AA (4.5:1)', need: 4.5 },
    { label: '큰 글자 AA (3:1)', need: 3 },
    { label: '본문 글자 AAA (7:1)', need: 7 },
  ];
  return (
    <div className="fig-split">
      <div className="sw-col">
        <div className="sw-preview" style={{ color: fg, background: bg }}>
          <span style={{ fontSize: '0.9375rem' }}>주문하신 상품이 내일 도착합니다. 배송 조회는 마이페이지에서 할 수 있습니다.</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>결제하기</span>
        </div>
        <div className="sw-chips">
          {CONTRAST_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="sw-chip"
              aria-pressed={fg === p.fg && bg === p.bg}
              onClick={() => {
                setFg(p.fg);
                setBg(p.bg);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="sw-colors">
          <label>
            글자 색
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
            <span className="mono">{fg}</span>
          </label>
          <label>
            배경 색
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            <span className="mono">{bg}</span>
          </label>
        </div>
      </div>
      <div className="controls">
        <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
          <Readout label="명도 대비" value={`${ratio.toFixed(2)} : 1`} color={ratio >= 4.5 ? 'var(--good)' : 'var(--bad)'} />
        </div>
        <div className="sw-tests">
          {checks.map((c) => (
            <div key={c.label} className="sw-test" data-pass={grade(ratio, c.need) === 'good' ? 'y' : 'n'}>
              <span className={ratio >= c.need ? 'sw-mark-ok' : 'sw-mark-bad'}>{ratio >= c.need ? '✓' : '✗'}</span>
              <span>{c.label}</span>
              <span className="sw-label">{ratio >= c.need ? '통과' : '미달'}</span>
            </div>
          ))}
        </div>
        <div className="sw-note">대비가 낮은 글자는 시력이 약한 사람, 햇빛 아래의 휴대전화, 오래된 모니터에서 읽기 어렵습니다. 사용자의 상당수가 이 중 하나에 해당합니다.</div>
      </div>
    </div>
  );
}

type Tab = 'privacy' | 'bias' | 'a11y';

function ResponsibleFigure() {
  const [tab, setTab] = useState<Tab>('privacy');
  return (
    <Figure
      no={3}
      title="소프트웨어가 사람에게 미치는 영향"
      hint="세 주제를 차례로 골라 보세요"
      caption={
        tab === 'privacy' ? (
          <>항목 옆의 점은 그 정보가 유출되었을 때의 피해 정도를 대략 나타낸 것입니다. 피해 막대는 모은 항목의 위험을 더하고 보관 기간을 곱한 상대값입니다. 실제 위험 평가는 훨씬 복잡하지만, 모으지 않은 데이터는 유출될 수 없다는 점은 같습니다.</>
        ) : tab === 'bias' ? (
          <>가상의 신청자 300명(집단마다 150명)입니다. 점 하나가 한 사람이고, 가로 위치가 점수, 동그라미는 실제로 갚을 사람, 네모는 못 갚을 사람입니다. 기준선 왼쪽의 흐린 점은 거절된 사람입니다. 데이터는 고정된 시드로 만들어 언제나 같습니다.</>
        ) : (
          <>WCAG(웹 콘텐츠 접근성 지침) 2.x의 명도 대비 공식으로 계산합니다. 큰 글자는 18pt(약 24px) 이상이거나 14pt 이상의 굵은 글자입니다. 색을 직접 골라 기준을 넘는 조합을 찾아보세요.</>
        )
      }
    >
      <div className="controls row">
        <Seg
          label="주제"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'privacy', label: '개인정보' },
            { value: 'bias', label: '편향' },
            { value: 'a11y', label: '접근성' },
          ]}
        />
      </div>
      {tab === 'privacy' ? <PrivacyPanel /> : tab === 'bias' ? <BiasPanel /> : <ContrastPanel />}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Collaboration() {
  return (
    <>
      <h2>여러 사람이 같은 파일을 고치면</h2>
      <p>
        혼자 짜는 코드라면 <code>최종.js</code>, <code>최종_진짜.js</code>로도 버틸 수 있습니다. 하지만 다섯 명이 같은 파일을 동시에 고치면, 누가 무엇을 언제 왜 바꿨는지, 두 사람의 수정을 어떻게 합칠지가 문제가 됩니다. 이것을 해결하는 도구가 <T en="version control">버전 관리</T> 시스템이고, 오늘날 사실상의 표준이 2005년 리누스 토르발스(Linus Torvalds)가 리눅스 커널 개발을 위해 만든 Git입니다.
      </p>
      <ul>
        <li>
          <T en="commit">커밋</T>: 어느 순간의 파일 전체를 찍은 스냅숏에, 직전 커밋(부모)을 가리키는 포인터와 설명 메시지를 붙인 것입니다. 커밋이 부모를 따라 이어지며 기록이 됩니다.
        </li>
        <li>
          <T en="branch">브랜치</T>: 특정 커밋을 가리키는 이름표입니다. 새 커밋을 만들면 지금 브랜치의 이름표가 그 커밋으로 옮겨 갑니다. 브랜치를 새로 만드는 것은 이름표 하나를 더 붙이는 것이라 거의 공짜입니다.
        </li>
        <li>
          <T en="merge">병합</T>: 갈라진 두 브랜치의 변경을 합쳐, 부모가 둘인 새 커밋을 만듭니다.
        </li>
      </ul>
      <Code label="Git으로 기능 하나를 만드는 흐름">{`
git switch -c feature        # feature 브랜치를 만들고 그쪽으로 옮긴다
# ... config.js를 고친다 ...
git add config.js            # 다음 커밋에 넣을 변경을 고른다
git commit -m "가격을 13000원으로"
git switch main              # main으로 돌아온다
git merge feature            # feature의 변경을 main에 합친다`}</Code>
      <GitFigure />
      <p>
        처음 상태에서 "feature를 병합"을 누르면 충돌이 납니다. 병합은 두 브랜치의 마지막 커밋만 보지 않고, 둘이 갈라진 <T en="merge base">공통 조상</T>까지 함께 봅니다. 그래서 <T en="three-way merge">3방향 병합</T>이라고 부릅니다. 줄마다 공통 조상과 비교해, 한쪽만 바꿨으면 바꾼 쪽을 따르고, 양쪽이 같게 바꿨으면 그대로 받아들이고, 양쪽이 다르게 바꿨을 때만 사람에게 묻습니다. 공통 조상이 없으면 이 판단을 할 수 없습니다. main의 COLOR가 'blue'이고 feature의 COLOR가 'green'일 때, 둘만 보고서는 누가 바꾼 것인지 알 수 없기 때문입니다.
      </p>
      <p>
        충돌 표에서 PRICE를 한쪽으로 고르고 병합 커밋을 만들어 보세요. COLOR 줄은 feature만 바꿨으므로 묻지 않고 'green'이 됩니다. "충돌 없는 예시"에서는 두 브랜치가 다른 줄을 고쳤으므로 병합이 저절로 끝나고, main을 병합한 뒤 feature로 가서 main을 병합하면 새 커밋 없이 이름표만 옮기는 <T en="fast-forward">빨리 감기</T>가 일어납니다.
      </p>
      <Code label="실제 Git이 파일에 남기는 충돌 표시">{`
const TITLE = '아틀라스 상점';
<<<<<<< HEAD
const PRICE = 15000;
=======
const PRICE = 13000;
>>>>>>> feature
const SHIPPING = 3000;
const COLOR = 'green';        // 한쪽만 바꾼 줄은 이미 합쳐져 있다`}</Code>
      <Callout kind="note">
        그림 1의 파일은 줄 수가 언제나 다섯이라 i번째 줄끼리 비교하면 되지만, 실제 파일은 줄이 끼어들고 빠집니다. Git은 먼저 공통 조상과 각 브랜치 사이의 diff를 구해 줄을 맞춘 다음 같은 판단을 합니다. 두 파일의 차이를 최소한의 편집으로 찾는 방법은 <a href={lessonHref('cs-system-algorithms', 'diff')}>diff 알고리즘</a>에서 볼 수 있습니다.
      </Callout>

      <h2>코드 리뷰</h2>
      <p>
        대부분의 팀은 main에 바로 커밋하지 않습니다. 브랜치에서 작업한 뒤 <T en="pull request">풀 리퀘스트</T>(PR)를 올려 "이 변경을 main에 병합해 주세요"라고 요청하고, 동료가 diff를 읽고 의견을 남기는 <T en="code review">코드 리뷰</T>를 거칩니다. 자동 테스트가 기계가 확인할 수 있는 것을 확인한다면, 리뷰는 사람만 볼 수 있는 것을 봅니다. 명세와 맞는지, 이름이 읽히는지, 다음 사람이 고치기 쉬운지, 위험한 것이 섞이지 않았는지를요. 그리고 리뷰를 통해 코드에 대한 지식이 한 사람에게만 머물지 않고 팀에 퍼집니다.
      </p>
      <ReviewFigure />
      <p>
        여섯 문제 중 몇 개를 찾았나요? 결제 키와 로그 속 개인정보는 한 번 병합되면 Git 기록에 영원히 남으므로 특히 리뷰에서 막아야 합니다. 커밋을 지워도 기록 어딘가에 남아 있고, 공개 저장소라면 자동으로 키를 훑는 봇이 몇 분 안에 찾아냅니다. 비어 있는 테스트 파일처럼 <strong>없는 것</strong>을 알아채는 것이 가장 어렵다는 점도 기억해 두세요. diff에는 바뀐 것만 보이기 때문입니다.
      </p>
      <Callout kind="intuition">
        리뷰하기 좋은 PR은 작습니다. 수천 줄짜리 PR에는 "좋아 보입니다"가 달리고, 열 줄짜리 PR에는 날카로운 질문이 달립니다. 하나의 PR에는 하나의 목적만 담고, 리팩터링과 기능 추가를 섞지 않고(<a href={lessonHref('cs-software-design', 'refactoring')}>두 개의 모자</a>), 설명에 무엇을 왜 바꿨는지 적습니다. 리뷰 의견은 사람이 아니라 코드를 향해야 합니다.
      </Callout>

      <h2>책임 있는 소프트웨어</h2>
      <p>
        소프트웨어는 수많은 사람의 생활에 닿습니다. 회원 가입 양식의 항목 하나, 승인 규칙의 숫자 하나, 버튼 색 하나가 개발자가 만날 일 없는 사람들에게 영향을 줍니다. 그래서 "맞게 동작하는가"와 "바꾸기 쉬운가"에 더해 "누구에게 어떤 영향을 주는가"를 물어야 합니다. 그림 3에서 세 가지를 살펴봅니다.
      </p>
      <ResponsibleFigure />
      <p>
        <strong>개인정보.</strong> 생일 쿠폰에 필요한 것은 이메일과 생일(월·일)뿐입니다. 그런데 처음 양식은 "혹시 쓸지도 몰라서" 주소와 실시간 위치까지 받고, 영구 보관합니다. 모으지 않은 데이터는 유출될 수도, 다른 목적으로 쓰일 수도 없습니다. 그래서 개인정보 보호법과 유럽의 GDPR은 목적에 필요한 최소한만 모으고(<T en="data minimization">데이터 최소화</T>), 목적을 다하면 지우라고 요구합니다.
      </p>
      <p>
        <strong>편향.</strong> 기준 점수 하나를 모두에게 똑같이 적용했는데도, 갚을 수 있는데 거절당하는 비율이 B 집단에서 훨씬 높습니다. 규칙이 B를 차별하도록 짜인 것이 아니라, B의 점수가 덜 정확하기 때문입니다. 2016년 미국의 재범 예측 프로그램 COMPAS를 분석한 보도도 비슷한 문제를 지적했습니다. 집단에 따라 오류의 종류와 비율이 달랐던 것입니다. 이후 연구들은 집단 간에 기본 비율이 다르면 여러 공정성 기준을 동시에 모두 만족하기가 수학적으로 불가능하다는 것을 보였습니다. 기준을 집단마다 나눠 보면 하나를 맞출 때 다른 것이 벌어지는 것을 볼 수 있습니다. 모델의 오류를 재는 방법은 <a href={lessonHref('ai-basics', 'evaluation')}>모델 평가</a>에서 더 자세히 다룹니다.
      </p>
      <p>
        <strong>접근성.</strong> 연회색 안내문은 흰 배경에서 대비가 2.6:1로, 본문 글자 기준인 4.5:1에 한참 못 미칩니다. 대비 외에도 접근성에는 화면 낭독기가 읽을 수 있는 대체 텍스트, 마우스 없이 키보드만으로 쓸 수 있는 조작, 색만으로 정보를 전달하지 않기(빨강·초록만으로 성공과 실패를 구분하지 않기) 같은 원칙이 있습니다. 이 사이트의 그림들이 ✓와 ✗를 색과 함께 쓰고, 캔버스마다 설명을 달아 둔 이유이기도 합니다. 한국을 포함한 많은 나라가 공공 웹사이트에 접근성 기준을 법으로 요구합니다.
      </p>
      <Callout kind="key">
        버전 관리는 커밋(스냅숏과 부모), 브랜치(커밋을 가리키는 이름표), 병합(공통 조상을 기준으로 한 3방향 비교)으로 여러 사람의 변경을 합칩니다. 코드 리뷰는 테스트가 보지 못하는 명세, 가독성, 보안, 빠진 테스트를 사람의 눈으로 확인합니다. 그리고 소프트웨어를 만드는 사람은 개인정보, 편향, 접근성처럼 코드가 사람에게 미치는 영향에도 책임이 있습니다.
      </Callout>
      <Quiz
        q="main과 feature가 커밋 C에서 갈라졌습니다. C에서 COLOR는 'blue'였고, 지금 main에서는 'blue', feature에서는 'green'입니다. feature를 main에 병합하면 COLOR는?"
        options={["충돌이 나서 사람이 골라야 한다", "'green'. main은 COLOR를 바꾸지 않았고 feature만 바꿨으므로 feature 쪽을 따른다", "'blue'. 병합하는 쪽(main)이 우선이다", '두 값을 이어 붙인다']}
        answer={1}
        explain={<>3방향 병합은 공통 조상 C와 비교합니다. main의 값은 C와 같으니 main은 이 줄을 바꾸지 않았고, feature만 바꿨습니다. 한쪽만 바꾼 줄은 바꾼 쪽을 따르므로 'green'이 되고, 충돌은 양쪽이 같은 줄을 서로 다르게 바꿨을 때만 납니다.</>}
      />
    </>
  );
}

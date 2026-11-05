import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { DFD, IMPACT_KO, LIKELIHOOD_KO, MITIGATIONS, RISKS, RISK_LEVEL_KO, STRIDE_BY_KIND, STRIDE_KO, ZONE, boundaryThreats, defaultCosts, evaluate, findElem, leaves, markPath, pathLeaves, riskLevel, riskScore, totalThreats, TREE, type DfdElem, type Evaluated, type MitId, type Risk, type Stride } from './threat';
import './software.css';
import './threat.css';

const KIND_KO = { entity: '외부 개체', process: '처리 과정', store: '데이터 저장소', flow: '데이터 흐름' } as const;
const ALL_STRIDE: Stride[] = ['S', 'T', 'R', 'I', 'D', 'E'];

/* ─────────────── Figure 1: the data-flow diagram and STRIDE ─────────────── */

/** Half-size of each box in diagram units. */
const BOX = { entity: [9, 5], process: [9, 6], store: [10, 4.5] } as const;

function edgePoint(from: DfdElem, to: DfdElem): [number, number] {
  // where the straight line from `from` toward `to` leaves `from`'s box
  const [hw, hh] = BOX[from.kind as 'entity' | 'process' | 'store'];
  const dx = to.x! - from.x!, dy = to.y! - from.y!;
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return [from.x! + dx * s, from.y! + dy * s];
}

function DfdFigure() {
  const [sel, setSel] = useState('web');
  const e = findElem(sel);
  const cats = STRIDE_BY_KIND[e.kind];
  const nodes = DFD.filter((d) => d.kind !== 'flow');
  const flows = DFD.filter((d) => d.kind === 'flow');
  const key = (id: string) => (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setSel(id);
    }
  };

  return (
    <Figure
      no={1}
      title="도서관 대출 서비스의 데이터 흐름도"
      hint="상자나 화살표를 눌러 STRIDE로 점검해 보세요"
      caption={
        <>
          가상의 동네 도서관 서비스입니다. 네모는 외부 개체(사람이나 다른 회사의 서비스), 둥근 상자는 처리 과정, 위아래 선만 있는 상자는 데이터 저장소, 화살표는 데이터 흐름입니다. 점선 상자는 도서관이 직접 운영하는 서버 구역으로, 점선을 가로지르는 화살표(굵은 선)가 <strong>신뢰 경계</strong>를 넘는 흐름입니다. 요소의 종류마다 따져 볼 STRIDE 항목이 정해져 있습니다.
        </>
      }
    >
      <div className="tm-dfd-wrap">
        <svg className="tm-dfd" viewBox="0 0 120 64" role="group" aria-label="데이터 흐름도. 요소를 고르면 아래에 위협 목록이 나옵니다.">
          <defs>
            <marker id="tm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="2.6" markerHeight="2.6" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)" />
            </marker>
            <marker id="tm-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="2.6" markerHeight="2.6" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>
          <rect x={ZONE.x} y={ZONE.y} width={ZONE.w} height={ZONE.h} rx="2" className="tm-zone" />
          <text x={ZONE.x + 1.5} y={ZONE.y + 3.6} className="tm-zone-label">
            도서관 서버 구역
          </text>
          {flows.map((f) => {
            const a = findElem(f.from!), b = findElem(f.to!);
            const [x1, y1] = edgePoint(a, b);
            const [x2, y2] = edgePoint(b, a);
            const on = f.id === sel;
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            return (
              <g key={f.id} className="tm-flow" data-on={on || undefined} data-cross={f.crosses || undefined} tabIndex={0} role="button" aria-pressed={on} aria-label={`흐름: ${f.name} (${a.name}에서 ${b.name}로)${f.crosses ? ', 신뢰 경계를 넘음' : ''}`} onClick={() => setSel(f.id)} onKeyDown={key(f.id)}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="tm-hit" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="tm-line" markerEnd={on ? 'url(#tm-arrow-sel)' : 'url(#tm-arrow)'} />
                <text x={mx} y={my - 1.4} className="tm-flow-label" textAnchor="middle">
                  {f.name}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const [hw, hh] = BOX[n.kind as 'entity' | 'process' | 'store'];
            const on = n.id === sel;
            return (
              <g key={n.id} className="tm-node" data-kind={n.kind} data-on={on || undefined} tabIndex={0} role="button" aria-pressed={on} aria-label={`${KIND_KO[n.kind]}: ${n.name}`} onClick={() => setSel(n.id)} onKeyDown={key(n.id)}>
                {n.kind === 'store' ? (
                  <>
                    <rect x={n.x! - hw} y={n.y! - hh} width={2 * hw} height={2 * hh} className="tm-box tm-store-bg" />
                    <line x1={n.x! - hw} y1={n.y! - hh} x2={n.x! + hw} y2={n.y! - hh} className="tm-store-line" />
                    <line x1={n.x! - hw} y1={n.y! + hh} x2={n.x! + hw} y2={n.y! + hh} className="tm-store-line" />
                  </>
                ) : (
                  <rect x={n.x! - hw} y={n.y! - hh} width={2 * hw} height={2 * hh} rx={n.kind === 'process' ? hh : 0.8} className="tm-box" />
                )}
                <text x={n.x} y={n.y! + 1.2} className="tm-node-label" textAnchor="middle">
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="tm-panel" aria-live="polite">
        <div className="tm-panel-head">
          <span className="tm-kind">{KIND_KO[e.kind]}</span>
          <strong>{e.name}</strong>
          {e.kind === 'flow' && <span className="ss-small">{e.crosses ? '신뢰 경계를 넘는 흐름' : '서버 구역 안의 흐름'}</span>}
        </div>
        <div className="tm-stride" aria-label="이 요소에 적용되는 STRIDE 항목">
          {ALL_STRIDE.map((c) => (
            <span key={c} className="tm-letter" data-on={cats.includes(c) || undefined} title={`${STRIDE_KO[c].name} (${STRIDE_KO[c].en})`}>
              {c}
              <small>{STRIDE_KO[c].name}</small>
            </span>
          ))}
        </div>
        <ul className="tm-threats">
          {e.threats.map((t, i) => (
            <li key={i}>
              <span className="tm-cat">
                {t.cat} {STRIDE_KO[t.cat].name}
              </span>
              <span>{t.text}</span>
              <span className="tm-fix">막는 법: {t.fix}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="요소" value={`${DFD.length}개`} />
        <Readout label="찾아 적은 위협" value={`${totalThreats()}개`} />
        <Readout label="경계를 넘는 흐름의 위협" value={`${boundaryThreats()}개`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the attack tree ─────────────── */

const fmtCost = (c: number) => (isFinite(c) ? `${c}시간` : '막힘');

function TreeRow({ n, depth, sel, onSel }: { n: Evaluated; depth: number; sel: string; onSel: (id: string) => void }) {
  const leaf = !n.children.length;
  return (
    <>
      <li className="tm-tnode" data-path={n.onPath || undefined} data-blocked={!isFinite(n.cost) || undefined} style={{ ['--d' as string]: depth }}>
        {leaf ? (
          <button type="button" className="tm-tleaf" aria-pressed={sel === n.node.id} onClick={() => onSel(n.node.id)}>
            {n.node.label}
          </button>
        ) : (
          <span className="tm-tinner">
            <span className="tm-op">{n.node.op === 'and' ? '모두 (AND)' : '하나만 (OR)'}</span>
            {n.node.label}
          </span>
        )}
        <span className="tm-cost mono">{fmtCost(n.cost)}</span>
      </li>
      {n.children.map((c) => (
        <TreeRow key={c.node.id} n={c} depth={depth + 1} sel={sel} onSel={onSel} />
      ))}
    </>
  );
}

function AttackTreeFigure() {
  const [costs, setCosts] = useState(defaultCosts);
  const [on, setOn] = useState<Set<MitId>>(new Set());
  const [sel, setSel] = useState('stuff');
  const tree = useMemo(() => markPath(evaluate(TREE, costs, on)), [costs, on]);
  const path = pathLeaves(tree);
  const leaf = leaves().find((l) => l.id === sel)!;
  const toggle = (id: MitId) => (v: boolean) => {
    const s = new Set(on);
    if (v) s.add(id);
    else s.delete(id);
    setOn(s);
  };

  return (
    <Figure
      no={2}
      title="공격 트리: 다른 회원의 대출 기록 보기"
      hint="대책을 하나씩 켜 보세요. 가장 싼 길이 바뀝니다"
      caption={
        <>
          맨 위가 공격자의 목표이고, 아래로 갈수록 구체적인 방법입니다. "하나만"은 아래 방법 중 하나만 성공하면 되고(가장 싼 것의 비용), "모두"는 아래 단계를 다 해야 합니다(비용의 합). 비용은 공격자가 들일 시간을 어림한 값입니다. 진하게 칠한 줄이 지금 가장 싼 공격 경로입니다. 맨 아래 단계를 누르면 비용을 바꿀 수 있습니다.
        </>
      }
    >
      <div className="fig-split">
        <ul className="tm-tree" aria-label="공격 트리">
          <TreeRow n={tree} depth={0} sel={sel} onSel={setSel} />
        </ul>
        <div className="controls">
          <div className="ss-small">대책</div>
          {MITIGATIONS.map((m) => (
            <Check
              key={m.id}
              label={
                <span>
                  {m.name}
                  <span className="tm-mit-blurb">{m.blurb}</span>
                </span>
              }
              checked={on.has(m.id)}
              onChange={toggle(m.id)}
            />
          ))}
          <Slider id="tm-cost" label={`비용: ${leaf.label}`} value={costs[sel]} min={0} max={300} step={1} onChange={(v) => setCosts({ ...costs, [sel]: v })} format={(v) => `${v}시간`} />
          <Button small onClick={() => setCosts(defaultCosts())}>
            비용 처음대로
          </Button>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Readout label="가장 싼 공격 비용" value={fmtCost(tree.cost)} color={tree.cost < 50 ? 'var(--bad)' : undefined} />
        <Readout label="켠 대책" value={`${on.size}개`} />
      </div>
      <div className="ss-note" aria-live="polite">
        {isFinite(tree.cost) ? `가장 싼 길: ${path.join(' → ')}.` : '모든 길이 막혔습니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the risk matrix ─────────────── */

function RiskFigure() {
  const [risks, setRisks] = useState<Risk[]>(() => RISKS.map((r) => ({ ...r })));
  const set = (id: string, k: 'likelihood' | 'impact', v: number) => setRisks(risks.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  const ranked = [...risks].sort((a, b) => riskScore(b) - riskScore(a));
  const num = (id: string) => RISKS.findIndex((r) => r.id === id) + 1;

  return (
    <Figure
      no={3}
      title="무엇부터 막을까: 가능성 × 영향"
      hint="각 위협의 가능성과 영향을 바꿔 보세요"
      caption={
        <>
          가로는 일어날 가능성, 세로는 일어났을 때의 영향입니다. 둘을 곱한 점수가 12 이상이면 높음, 6 이상이면 중간입니다. 점수 매기는 법은 조직마다 다르고, 이 그림의 값은 예시입니다. 중요한 것은 위협을 같은 잣대로 늘어놓고 순서를 정하는 일입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="tm-matrix-wrap">
          <div className="tm-matrix" role="img" aria-label={`위험 행렬. ${ranked.map((r) => `${r.name}: 가능성 ${r.likelihood}, 영향 ${r.impact}, 점수 ${riskScore(r)}`).join('; ')}`}>
            {[5, 4, 3, 2, 1].map((imp) => (
              <div key={imp} className="tm-mrow">
                <span className="tm-axis">{IMPACT_KO[imp]}</span>
                {[1, 2, 3, 4, 5].map((lik) => {
                  const here = risks.filter((r) => r.likelihood === lik && r.impact === imp);
                  return (
                    <span key={lik} className="tm-cell" data-level={riskLevel(lik * imp)}>
                      {here.map((r) => (
                        <b key={r.id} title={r.name}>
                          {num(r.id)}
                        </b>
                      ))}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className="tm-mrow tm-xaxis">
              <span className="tm-axis" />
              {[1, 2, 3, 4, 5].map((l) => (
                <span key={l} className="tm-axis">
                  {LIKELIHOOD_KO[l]}
                </span>
              ))}
            </div>
          </div>
          <div className="ss-small" style={{ textAlign: 'center' }}>
            가로: 가능성 · 세로: 영향
          </div>
        </div>
        <ol className="tm-risks">
          {risks.map((r) => (
            <li key={r.id}>
              <span className="tm-rname">
                <b>{num(r.id)}</b> {r.name}
              </span>
              <label>
                가능성
                <select value={r.likelihood} onChange={(e) => set(r.id, 'likelihood', +e.target.value)}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} {LIKELIHOOD_KO[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                영향
                <select value={r.impact} onChange={(e) => set(r.id, 'impact', +e.target.value)}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} {IMPACT_KO[v]}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tm-score" data-level={riskLevel(riskScore(r))}>
                {riskScore(r)} {RISK_LEVEL_KO[riskLevel(riskScore(r))]}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="tm-rank" aria-live="polite">
        <span className="ss-small">막을 순서</span>
        {ranked.map((r, i) => (
          <span key={r.id} className="tm-rank-item" data-level={riskLevel(riskScore(r))}>
            {i + 1}. {r.name} ({riskScore(r)})
          </span>
        ))}
      </div>
      <Button small onClick={() => setRisks(RISKS.map((r) => ({ ...r })))}>
        처음 값으로
      </Button>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ThreatModeling() {
  const base = defaultCosts();
  const at = (ids: MitId[]) => markPath(evaluate(TREE, base, new Set(ids))).cost;
  const c0 = at([]), c1 = at(['owner']), c2 = at(['owner', 'ratelimit']), c3 = at(['owner', 'ratelimit', 'mfa']), c4 = at(['owner', 'ratelimit', 'mfa', 'backup']), c5 = at(['owner', 'ratelimit', 'mfa', 'backup', 'passkey']), c6 = at(['owner', 'ratelimit', 'mfa', 'backup', 'passkey', 'training']);
  const top = [...RISKS].sort((a, b) => riskScore(b) - riskScore(a));
  return (
    <>
      <h2>무엇을, 누구로부터 지킬 것인가</h2>
      <p>
        보안은 "안전하게 만들어 주세요"라는 말로는 시작할 수 없습니다. 모든 공격을 다 막는 시스템은 없고, 막는 데는 돈과 시간과 불편이 듭니다. 그래서 코드를 쓰기 전에 세 가지를 먼저 묻습니다. 지킬 것(<T en="asset">자산</T>)이 무엇인가, 누가 그것을 노리는가(<T en="adversary">공격자</T>), 어디서부터 믿을 수 없는가(<T en="trust boundary">신뢰 경계</T>). 이 질문에 체계적으로 답하는 일을 <T en="threat modeling">위협 모델링</T>이라고 합니다.
      </p>
      <p>
        이 장에서는 가상의 동네 도서관 대출 서비스를 예로 듭니다. 회원은 웹에서 책을 빌리고 연장하며, 사서는 관리 화면에서 연체료를 처리하고, 반납일이 다가오면 외부 메일 서비스로 알림이 갑니다. 지킬 것은 회원의 개인 정보와 대출 기록, 그리고 서비스가 멈추지 않는 것입니다. 누가 어떤 책을 빌렸는지는 생각보다 민감한 정보입니다.
      </p>

      <h2>데이터 흐름도 그리기</h2>
      <p>
        먼저 시스템을 <T en="data-flow diagram">데이터 흐름도</T>로 그립니다. 사람과 외부 서비스, 데이터를 처리하는 프로그램, 데이터를 담는 저장소, 그 사이를 오가는 데이터의 흐름만 그리면 됩니다. 클래스나 함수 같은 코드의 구조는 그리지 않습니다. 공격은 데이터가 오가는 길을 따라 들어오기 때문입니다.
      </p>
      <p>
        그다음 각 요소에 <T en="STRIDE">STRIDE</T>의 여섯 질문을 던집니다. 마이크로소프트가 1999년 무렵 정리한 이 분류는 지켜야 할 성질 여섯 가지가 깨지는 방식을 하나씩 짚습니다. 위장(Spoofing)은 인증을, 변조(Tampering)는 무결성을, 부인(Repudiation)은 "내가 안 했다"는 말을 반박할 근거를, 정보 노출(Information disclosure)은 기밀성을, 서비스 거부(Denial of service)는 가용성을, 권한 상승(Elevation of privilege)은 인가를 깹니다. 요소의 종류마다 따질 항목이 다릅니다. 외부 개체는 위장과 부인만, 데이터 흐름은 변조, 노출, 서비스 거부만 따지면 되고, 처리 과정은 여섯 가지를 모두 따집니다.
      </p>
      <DfdFigure />
      <p>
        요소 {DFD.length}개를 다 짚으면 위협이 {totalThreats()}개 나옵니다. 처음 보면 많아 보이지만 하나하나는 구체적이어서, 옆에 적힌 대책도 바로 떠오릅니다. 특히 굵은 화살표처럼 신뢰 경계를 넘는 흐름이 중요합니다. 경계 밖에서 들어오는 데이터는 무엇이든 공격자가 만든 것일 수 있으므로, 경계를 넘는 그 자리에서 검증해야 합니다. 웹 서버가 관리 화면 요청을 받을 때 역할을 확인하지 않으면 회원이 주소만 바꿔 관리 화면을 열 수 있고(권한 상승), 요청에 담긴 회원 번호를 그대로 믿으면 남의 대출을 연장할 수 있습니다(변조). 이런 웹 공격의 원리는 <a href={lessonHref('net-security', 'web-security')}>웹 보안</a> 장에서, 운영체제가 프로그램 사이에 세운 경계는 <a href={lessonHref('cs-operating-systems', 'protection')}>보호와 보안</a> 장에서 다룹니다.
      </p>
      <Callout kind="note">
        STRIDE 말고도 방법은 많습니다. 공격자의 목표에서 출발하는 공격 트리, 개인정보에 초점을 맞춘 LINDDUN, 위험을 숫자로 매기는 방법들이 있습니다. 어떤 방법이든 핵심은 같습니다. 시스템을 그림으로 그리고, 체계적인 질문 목록으로 빠짐없이 훑고, 찾은 것을 기록해 두는 것입니다. 기록이 있어야 설계가 바뀔 때 다시 볼 수 있습니다.
      </Callout>

      <h2>공격자의 눈으로: 공격 트리</h2>
      <p>
        STRIDE가 시스템의 부품에서 출발한다면, <T en="attack tree">공격 트리</T>는 공격자의 목표에서 출발합니다. 맨 위에 "다른 회원의 대출 기록 보기" 같은 목표를 두고, 그것을 이루는 방법을 아래로 쪼개 갑니다. 방법 중 하나만 성공하면 되는 갈래(OR)와 여러 단계를 모두 해야 하는 갈래(AND)를 구분하고, 맨 아래 단계마다 비용을 매기면, 공격자가 고를 가장 싼 길을 계산할 수 있습니다.
      </p>
      <AttackTreeFigure />
      <p>
        대책이 하나도 없을 때 가장 싼 길은 겨우 {c0}시간입니다. 계정을 하나 만들고, 자기 대출 목록 주소의 회원 번호를 남의 번호로 바꾸면 끝입니다. 이런 <a href={lessonHref('net-software-security', 'access-control')}>권한 확인 누락</a>은 실제로 가장 흔한 취약점 중 하나입니다. 서버에서 소유자를 확인하면 이 길이 막히고, 다음으로 싼 길인 유출된 비밀번호 재사용이 {c1}시간으로 올라옵니다.
      </p>
      <p>
        여기서 로그인 속도 제한을 켜도 비용은 {c2}시간 그대로입니다. 속도 제한은 비밀번호 추측을 막지만, 다른 사이트에서 유출된 비밀번호는 계정마다 한 번만 넣어 보면 되기 때문입니다. 가장 싼 길이 아닌 곳을 막으면 공격자에게는 아무것도 바뀌지 않습니다. 다중 인증을 켜면 {c3}시간, 백업까지 암호화하면 {c4}시간, 패스키로 바꾸면 {c5}시간, 사서의 본인 확인 절차까지 더하면 {c6}시간이 됩니다. 대책이 하나씩 쌓일 때마다 바닥이 올라갑니다.
      </p>
      <Callout kind="intuition">
        공격자는 가장 약한 고리를 고릅니다. 현관문에 자물쇠를 세 개 달아도 창문이 열려 있으면 소용이 없습니다. 공격 트리는 어느 창문이 열려 있는지, 그리고 그것을 닫으면 다음에 어디가 가장 약해지는지 보여 줍니다.
      </Callout>

      <h2>무엇부터 막을까</h2>
      <p>
        찾은 위협을 한꺼번에 다 고칠 수는 없으니 순서를 정해야 합니다. 가장 간단한 방법은 일어날 <T en="likelihood">가능성</T>과 일어났을 때의 <T en="impact">영향</T>을 각각 다섯 단계로 매기고 곱하는 것입니다.
      </p>
      <RiskFigure />
      <p>
        처음 값으로는 "{top[0].name}"이 {riskScore(top[0])}점으로 가장 높고, "{top[1].name}"이 {riskScore(top[1])}점으로 그다음입니다. 관리 화면 노출과 백업 유출은 영향은 가장 크지만 가능성이 낮아 {riskScore(top[2])}점입니다. 이 점수는 정답이 아니라 토론의 출발점입니다. 백업이 실제로 공개 저장소에 올라간 적이 있다는 것을 알게 되면 가능성을 올려야 하고, 그러면 순서가 바뀝니다.
      </p>

      <h2>설계 원칙 세 가지</h2>
      <p>
        위협 모델링을 여러 번 하다 보면 같은 처방이 되풀이해서 나옵니다. 이것을 원칙으로 정리해 두면 설계할 때부터 쓸 수 있습니다.
      </p>
      <ul>
        <li>
          <T en="defense in depth">심층 방어</T>: 대책 하나가 뚫려도 다음 대책이 막도록 겹겹이 쌓습니다. 그림 2에서 다중 인증이 뚫려도(실시간 피싱) 백업 암호화와 소유자 확인은 여전히 그 자리에 있습니다.
        </li>
        <li>
          <T en="fail closed">실패하면 닫기</T>: 확인할 수 없으면 거부합니다. 권한 서버가 응답하지 않을 때 통과시키는 코드는, 공격자가 권한 서버를 느리게 만들기만 하면 모든 확인을 건너뛰게 해 줍니다.
        </li>
        <li>
          <T en="least privilege">최소 권한</T>: 각 부품에 꼭 필요한 권한만 줍니다. 알림 발송 프로그램은 회원 이름과 메일 주소, 반납일만 읽을 수 있으면 됩니다. 이 프로그램이 데이터베이스 전체를 쓸 수 있는 계정으로 돌면, 알림 쪽의 작은 버그 하나가 데이터베이스 전체의 위협이 됩니다.
        </li>
      </ul>
      <Code label="실패하면 열리는 코드와 닫히는 코드">{`
// 위험: 권한 서버가 응답하지 않으면 통과시킨다
async function canView(user, loan) {
  try {
    return await authz.check(user, 'view', loan);
  } catch {
    return true;            // 확인 못 했는데 허락
  }
}

// 안전: 확인할 수 없으면 거부하고 기록을 남긴다
async function canView(user, loan) {
  try {
    return await authz.check(user, 'view', loan);
  } catch (err) {
    log.warn('authz unavailable', err);
    return false;           // 확인 못 했으면 거부
  }
}`}</Code>

      <Callout kind="key">
        위협 모델링은 지킬 자산, 공격자, 신뢰 경계를 먼저 정하는 일입니다. 데이터 흐름도를 그리고 요소마다 STRIDE(위장, 변조, 부인, 정보 노출, 서비스 거부, 권한 상승)를 따지면 위협을 빠짐없이 찾을 수 있고, 특히 신뢰 경계를 넘는 흐름에서 검증해야 합니다. 공격 트리는 공격자의 가장 싼 길을 보여 주므로, 그 길을 막아야 바닥이 올라갑니다. 찾은 위협은 가능성과 영향으로 순서를 정하고, 심층 방어, 실패하면 닫기, 최소 권한을 설계 원칙으로 씁니다.
      </Callout>
      <Quiz
        q="그림 2에서 '서버에서 소유자 확인'을 켜자 가장 싼 공격 비용이 3시간에서 20시간이 되었다. 이어서 '로그인 속도 제한'을 켰는데 비용이 20시간 그대로다. 왜일까?"
        options={[
          '속도 제한은 서비스 거부 대책이라 로그인과는 상관이 없다',
          '지금 가장 싼 길은 유출된 비밀번호를 계정마다 한 번씩 넣어 보는 것이라, 시도 횟수를 제한해도 막히지 않는다',
          '속도 제한을 켜면 공격자가 비밀번호를 더 빨리 추측할 수 있다',
          '공격 트리는 AND로만 계산하므로 대책 하나로는 비용이 바뀌지 않는다',
        ]}
        answer={1}
        explain={<>속도 제한은 같은 계정에 수없이 넣어 보는 비밀번호 추측을 막습니다. 다른 사이트에서 유출된 비밀번호를 쓰는 크리덴셜 스터핑은 계정마다 한두 번만 시도하므로 제한에 걸리지 않습니다. 가장 싼 길이 아닌 곳을 막으면 공격자의 비용은 그대로입니다. 이 길은 다중 인증이나 패스키가 막습니다. 다음 장에서 직접 확인합니다.</>}
      />
    </>
  );
}

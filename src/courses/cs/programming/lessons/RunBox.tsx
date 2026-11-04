import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Seg } from '../../../../components/ui';
import { lit } from './trace';
import { MAX_LOGS, run, type Friendly, type RunState, type TestCase } from './runner';

export interface Task {
  id: string;
  label: string;
  prompt: ReactNode;
  starter: string;
  /** function the tests call; without it the code just runs and its output is checked */
  fnName?: string;
  tests?: TestCase[];
  /** expected console output, one entry per line */
  expectOut?: string[];
  solution?: string;
}

const IDLE: RunState = { status: 'idle', logs: [], logsCut: false, results: [] };

function ErrorBox({ e }: { e: Friendly }) {
  return (
    <div className="run-error" role="alert">
      <strong>{e.line ? `${e.line}번 줄 근처: ` : ''}</strong>
      {e.title}
      <div className="run-error-detail mono">{e.detail}</div>
    </div>
  );
}

/** An editable snippet that runs in a Web Worker with a 1-second limit and checks itself. */
export function RunBox({ tasks, id }: { tasks: Task[]; id: string }) {
  const [taskId, setTaskId] = useState(tasks[0].id);
  const task = tasks.find((t) => t.id === taskId) ?? tasks[0];
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(tasks.map((t) => [t.id, t.starter.trim()])));
  const [st, setSt] = useState<RunState>(IDLE);
  const cancel = useRef<() => void>(() => {});
  const edId = useId();
  const code = codes[task.id];

  useEffect(() => () => cancel.current(), []);

  const go = () => {
    cancel.current();
    cancel.current = run({ code, fnName: task.fnName, tests: task.tests }, setSt);
  };
  const setCode = (c: string) => setCodes((m) => ({ ...m, [task.id]: c }));
  const pick = (t: string) => {
    cancel.current();
    setSt(IDLE);
    setTaskId(t);
  };

  const tests = task.tests ?? [];
  const passed = st.results.filter((r) => r?.pass).length;
  const outMode = !!task.expectOut;
  const exp = task.expectOut ?? [];
  const outRows = outMode ? Array.from({ length: Math.max(exp.length, st.logs.length) }, (_, i) => ({ want: exp[i], got: st.logs[i] })) : [];
  const outOk = outMode && st.status === 'done' && !st.logsCut && st.logs.length === exp.length && st.logs.every((l, i) => l === exp[i]);
  const allPass = tests.length > 0 && st.status === 'done' && passed === tests.length;
  const rows = code.split('\n').length;

  let status: ReactNode = '실행을 누르면 코드가 브라우저 안의 별도 작업자(Web Worker)에서 돌아갑니다.';
  if (st.status === 'running') status = '실행 중…';
  else if (st.status === 'timeout') status = '시간 초과로 멈췄습니다.';
  else if (st.status === 'error') status = '오류로 멈췄습니다.';
  else if (st.status === 'done') {
    if (tests.length) status = allPass ? `테스트 ${tests.length}개를 모두 통과했습니다.` : `테스트 ${tests.length}개 중 ${passed}개 통과.`;
    else if (outMode) status = outOk ? '출력이 기대한 결과와 똑같습니다.' : '출력이 기대한 결과와 다릅니다. 빨간 줄을 확인하세요.';
    else status = `실행을 마쳤습니다 (${Math.max(1, Math.round(st.ms ?? 0))}ms).`;
  }
  const good = allPass || outOk;

  return (
    <div className="run">
      {tasks.length > 1 && <Seg label="과제" value={taskId} onChange={pick} options={tasks.map((t) => ({ value: t.id, label: t.label }))} />}
      <div className="run-prompt">{task.prompt}</div>
      <label className="visually-hidden" htmlFor={edId}>
        {task.label} 코드 편집기 (Ctrl+Enter로 실행)
      </label>
      <textarea
        id={edId}
        className="run-editor"
        value={code}
        rows={Math.min(22, Math.max(5, rows + 1))}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            go();
          }
        }}
      />
      <div className="btn-row">
        <Button primary small onClick={go}>
          ▶ 실행
        </Button>
        <Button
          small
          onClick={() => {
            cancel.current();
            setSt(IDLE);
            setCode(task.starter.trim());
          }}
        >
          처음 코드로
        </Button>
        {task.solution && (
          <Button
            small
            onClick={() => {
              cancel.current();
              setSt(IDLE);
              setCode(task.solution!.trim());
            }}
          >
            풀이 보기
          </Button>
        )}
        <span className="run-kbd">Ctrl+Enter로도 실행</span>
      </div>
      <div className="run-status" data-good={good || undefined} data-bad={st.status === 'error' || st.status === 'timeout' || undefined} aria-live="polite" id={id}>
        {status}
      </div>
      {st.error && <ErrorBox e={st.error} />}

      {tests.length > 0 && (
        <div className="tbl-wrap run-tests">
          <table className="tbl">
            <thead>
              <tr>
                <th>호출</th>
                <th>기대한 값</th>
                <th>돌려준 값</th>
                <th aria-label="결과" />
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => {
                const r = st.results[i];
                return (
                  <tr key={i} data-pass={r ? (r.pass ? 'y' : 'n') : undefined}>
                    <td className="mono">
                      {task.fnName}({t.args.map((a) => lit(a)).join(', ')}){t.note && <span className="run-note">{t.note}</span>}
                    </td>
                    <td className="mono">{lit(t.expect)}</td>
                    <td className="mono">{r ? (r.error ? <span className="run-err-cell">{r.error === st.error ? '시간 초과' : r.error.detail.split(':')[0]}</span> : r.got) : st.status === 'running' ? '…' : ''}</td>
                    <td className="run-mark">{r ? (r.pass ? '✓' : '✗') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {st.results.some((r) => r?.error && r.error !== st.error) && <ErrorBox e={st.results.find((r) => r?.error && r.error !== st.error)!.error!} />}
        </div>
      )}

      {outMode ? (
        <div className="tbl-wrap run-tests">
          <table className="tbl">
            <thead>
              <tr>
                <th>줄</th>
                <th>기대한 출력</th>
                <th>실제 출력</th>
                <th aria-label="결과" />
              </tr>
            </thead>
            <tbody>
              {(st.status === 'idle' ? exp.map((want) => ({ want, got: undefined })) : outRows).slice(0, 40).map((r, i) => {
                const ok = r.want === r.got;
                return (
                  <tr key={i} data-pass={st.status === 'idle' ? undefined : ok ? 'y' : 'n'}>
                    <td className="mono">{i + 1}</td>
                    <td className="mono">{r.want ?? <span className="run-note">(없음)</span>}</td>
                    <td className="mono">{r.got ?? (st.status === 'idle' ? '' : <span className="run-note">(없음)</span>)}</td>
                    <td className="run-mark">{st.status === 'idle' ? '' : ok ? '✓' : '✗'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {outRows.length > 40 && <div className="run-note">… {outRows.length - 40}줄 더</div>}
        </div>
      ) : (
        (st.logs.length > 0 || (!tests.length && st.status !== 'idle')) && (
          <div className="tr-out run-out" aria-label="콘솔 출력">
            <div className="tr-out-head">콘솔 출력</div>
            {st.logs.length === 0 && <div className="tr-out-empty">출력 없음</div>}
            {st.logs.slice(0, 60).map((l, i) => (
              <div key={i} className="tr-out-line">
                {l}
              </div>
            ))}
            {(st.logs.length > 60 || st.logsCut) && <div className="tr-out-empty">… 출력이 너무 많아 {st.logsCut ? `처음 ${MAX_LOGS}줄만 받았고 ` : ''}일부만 보여 줍니다 (받은 줄 {st.logs.length}개)</div>}
          </div>
        )
      )}
    </div>
  );
}

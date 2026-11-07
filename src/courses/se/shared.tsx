import type { ReactNode } from 'react';
import { Callout } from '../../components/ui';

/**
 * Placeholder body for a lesson that is planned but not written yet.
 * The lesson page already shows the title, lede and "what you'll learn" from course.ts;
 * this adds what the chapter will cover and which interactive figures it will have.
 * Replace the whole component with the real lesson when it is written.
 */
export function Planned({ sections, figures, note }: { sections: string[]; figures: string[]; note?: ReactNode }) {
  return (
    <>
      <Callout kind="note" label="준비 중">
        이 장은 아직 쓰는 중입니다. 아래는 이 장에서 다룰 내용과 직접 만져 볼 그림의 계획입니다.
      </Callout>
      <h2>다룰 내용</h2>
      <ol>
        {sections.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h2>들어갈 그림</h2>
      <ul>
        {figures.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {note && <p>{note}</p>}
    </>
  );
}

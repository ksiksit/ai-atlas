import { LEVELS, type Level } from '../courses';

/** "●○○ 기초": difficulty as filled dots plus its name. */
export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className="level-badge" title={`난이도: ${LEVELS[level].name}`}>
      <span className="level-dots" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} data-on={i <= level || undefined} />
        ))}
      </span>
      <span className="visually-hidden">난이도 </span>
      {LEVELS[level].name}
    </span>
  );
}

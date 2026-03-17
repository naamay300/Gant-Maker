import { Task } from '../../types';
import { dateToPixelOffset, ROW_HEIGHT, PIXELS_PER_DAY } from '../../utils/dateUtils';

interface Props {
  tasks: Task[];
  timelineStart: Date;
}

export function DependencyArrows({ tasks, timelineStart }: Props) {
  const taskIndex: Record<string, number> = {};
  tasks.forEach((t, i) => { taskIndex[t.id] = i; });

  const arrows: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];

  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      const depTask = tasks.find(t => t.id === depId);
      if (!depTask || !(depId in taskIndex) || !(task.id in taskIndex)) return;

      const fromIdx = taskIndex[depId];
      const toIdx = taskIndex[task.id];

      const x1 = dateToPixelOffset(depTask.startDate, timelineStart) + depTask.duration * PIXELS_PER_DAY;
      const y1 = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = dateToPixelOffset(task.startDate, timelineStart);
      const y2 = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      arrows.push({ id: `${depId}-${task.id}`, x1, y1, x2, y2 });
    });
  });

  if (!arrows.length) return null;

  const maxX = Math.max(...tasks.map(t =>
    dateToPixelOffset(t.startDate, timelineStart) + t.duration * PIXELS_PER_DAY
  )) + 200;
  const maxY = tasks.length * ROW_HEIGHT + 40;

  return (
    <svg
      style={{
        position: 'absolute', top: 0, left: 0,
        width: maxX, height: maxY,
        pointerEvents: 'none', zIndex: 3, overflow: 'visible',
      }}
    >
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.25)" />
        </marker>
      </defs>
      {arrows.map(({ id, x1, y1, x2, y2 }) => {
        const midX = x1 + Math.max(16, (x2 - x1) / 2);
        return (
          <path
            key={id}
            d={`M${x1} ${y1} L${midX} ${y1} L${midX} ${y2} L${x2} ${y2}`}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd="url(#arr)"
          />
        );
      })}
    </svg>
  );
}

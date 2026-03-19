import { Task } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';
import { ROW_HEIGHT } from '../../utils/dateUtils';
import { differenceInDays, startOfDay, parseISO } from 'date-fns';

interface Props {
  tasks: Task[];
  timelineStart: Date;
}

export function DependencyArrows({ tasks, timelineStart }: Props) {
  const { statuses, pixelsPerDay } = useProjectStore();
  function toPx(dateStr: string) {
    return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(timelineStart)) * pixelsPerDay;
  }

  const taskIndex: Record<string, number> = {};
  tasks.forEach((t, i) => { taskIndex[t.id] = i; });

  const arrows: { id: string; x1: number; y1: number; x2: number; y2: number; done: boolean }[] = [];

  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      const depTask = tasks.find(t => t.id === depId);
      if (!depTask || !(depId in taskIndex) || !(task.id in taskIndex)) return;

      const depIdx = taskIndex[depId];
      const taskIdx = taskIndex[task.id];

      // Arrow FROM the predecessor's right edge → TO the dependent task's left edge
      const x1 = toPx(depTask.startDate) + depTask.duration * pixelsPerDay;
      const y1 = depIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = toPx(task.startDate);
      const y2 = taskIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      const depStatus = statuses.find(s => s.id === depTask.statusId);
      const done = depStatus?.name === 'הושלם';

      arrows.push({ id: `${task.id}-${depId}`, x1, y1, x2, y2, done });
    });
  });

  if (!arrows.length) return null;

  const maxX = Math.max(...tasks.map(t =>
    toPx(t.startDate) + t.duration * pixelsPerDay
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
        <marker id="arr-blocked" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#f97316" />
        </marker>
        <marker id="arr-done" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#22c55e" />
        </marker>
      </defs>
      {arrows.map(({ id, x1, y1, x2, y2, done }) => {
        const color = done ? '#22c55e' : '#f97316';
        const markerId = done ? 'arr-done' : 'arr-blocked';
        // Build an L-shaped path: right from x1, down/up, then to x2
        // When x2 < x1 (tasks overlap), loop around with a detour
        let d: string;
        if (x2 >= x1 + 8) {
          const midX = x1 + (x2 - x1) / 2;
          d = `M${x1} ${y1} L${midX} ${y1} L${midX} ${y2} L${x2} ${y2}`;
        } else {
          // Loop: go right a bit, down/up, go left past x2, then arrive at x2
          const detour = x1 + 24;
          const detourTarget = Math.min(x2 - 8, x1 - 8);
          d = `M${x1} ${y1} L${detour} ${y1} L${detour} ${y2} L${detourTarget} ${y2} L${x2} ${y2}`;
        }
        return (
          <path
            key={id}
            d={d}
            fill="none"
            stroke={color}
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
    </svg>
  );
}

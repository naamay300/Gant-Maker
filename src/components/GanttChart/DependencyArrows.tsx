import { Task } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';
import { dateToPixelOffset, ROW_HEIGHT, PIXELS_PER_DAY } from '../../utils/dateUtils';

interface Props {
  tasks: Task[];
  timelineStart: Date;
}

export function DependencyArrows({ tasks, timelineStart }: Props) {
  const { statuses } = useProjectStore();

  const taskIndex: Record<string, number> = {};
  tasks.forEach((t, i) => { taskIndex[t.id] = i; });

  const arrows: { id: string; x1: number; y1: number; x2: number; y2: number; done: boolean }[] = [];

  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      const depTask = tasks.find(t => t.id === depId);
      if (!depTask || !(depId in taskIndex) || !(task.id in taskIndex)) return;

      const depIdx = taskIndex[depId];
      const taskIdx = taskIndex[task.id];

      // Arrow FROM the dependent task → TO the dependency task (arrowhead at dependency)
      const x1 = dateToPixelOffset(task.startDate, timelineStart);
      const y1 = taskIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = dateToPixelOffset(depTask.startDate, timelineStart) + depTask.duration * PIXELS_PER_DAY;
      const y2 = depIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      const depStatus = statuses.find(s => s.id === depTask.statusId);
      const done = depStatus?.name === 'הושלם';

      arrows.push({ id: `${task.id}-${depId}`, x1, y1, x2, y2, done });
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
        const midX = x2 + Math.max(16, (x1 - x2) / 2);
        return (
          <path
            key={id}
            d={`M${x1} ${y1} L${midX} ${y1} L${midX} ${y2} L${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
    </svg>
  );
}

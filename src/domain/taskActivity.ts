import type { Task } from "../types/api";
export interface TaskActivity {
  running: boolean;
  waiting: boolean;
  unread: boolean;
  updatedAt: string;
  optimistic?: boolean;
}
export function reconcileActivity(
  previous: TaskActivity | undefined,
  task: Task,
  active: boolean,
): TaskActivity {
  const running =
    !!task.is_running ||
    !!(
      previous?.optimistic &&
      !task.is_waiting &&
      previous.updatedAt === task.updated_at
    );
  const waiting = !!task.is_waiting;
  return {
    running,
    waiting,
    updatedAt: task.updated_at,
    optimistic: running && !task.is_running && previous?.optimistic,
    unread:
      !active &&
      !!(
        previous?.unread ||
        ((previous?.running || previous?.waiting) && !running && !waiting)
      ),
  };
}

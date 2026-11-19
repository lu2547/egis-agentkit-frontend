import type { Task } from "../types/api";
export interface TaskActivity {
  running: boolean;
  waiting: boolean;
  unread: boolean;
  updatedAt: string;
  optimistic?: boolean;
  replyEnded?: boolean;
}
export function reconcileActivity(
  previous: TaskActivity | undefined,
  task: Task,
  active: boolean,
): TaskActivity {
  const running = !!task.is_running;
  const waiting = !!task.is_waiting;
  // REPLY_END can arrive before the service releases the session lock.
  const replyEnded = active && !!previous?.replyEnded && running && !waiting;
  return {
    running: running && !replyEnded,
    waiting,
    updatedAt: task.updated_at,
    optimistic: false,
    replyEnded,
    unread:
      !active &&
      !!(
        previous?.unread ||
        ((previous?.running || previous?.waiting) && !running && !waiting)
      ),
  };
}

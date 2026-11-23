import type { Task } from "../types/api";
export interface TaskActivity {
  running: boolean;
  waiting: boolean;
  unread: boolean;
  updatedAt: string;
  latestScheduleRunId?: string;
  optimistic?: boolean;
  replyEnded?: boolean;
}
export function reconcileActivity(
  previous: TaskActivity | undefined,
  task: Task,
  active: boolean,
  observedRun?: { runId?: string },
): TaskActivity {
  const running = !!task.is_running;
  const waiting = !!task.is_waiting;
  // REPLY_END can arrive before the service releases the session lock.
  const replyEnded = active && !!previous?.replyEnded && running && !waiting;
  const latestScheduleRunId =
    observedRun && observedRun.runId !== previous?.latestScheduleRunId
      ? previous?.latestScheduleRunId
      : task.latest_schedule_run_id || undefined;
  return {
    running: running && !replyEnded,
    waiting,
    updatedAt: task.updated_at,
    latestScheduleRunId,
    optimistic: false,
    replyEnded,
    unread:
      !active &&
      !!(
        previous?.unread ||
        (latestScheduleRunId &&
          latestScheduleRunId !== previous?.latestScheduleRunId) ||
        (task.source !== "schedule" &&
          (previous?.running || previous?.waiting) && !running && !waiting)
      ),
  };
}

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
  // 服务端状态覆盖本地预估，失败不一定会改变任务的更新时间。
  const running = !!task.is_running;
  const waiting = !!task.is_waiting;
  return {
    running,
    waiting,
    updatedAt: task.updated_at,
    optimistic: false,
    unread:
      !active &&
      !!(
        previous?.unread ||
        ((previous?.running || previous?.waiting) && !running && !waiting)
      ),
  };
}

import { ref } from "vue";
import type { Task } from "../types/api";
import { reconcileActivity, type TaskActivity } from "../domain/taskActivity";
const activity = ref<Record<string, TaskActivity>>({});
let account = "",
  active = "";
function persist() {
  if (account)
    try {
      localStorage.setItem(
        `agentkit:task-activity:${account}`,
        JSON.stringify(activity.value),
      );
    } catch {
      /* Storage may be unavailable. */
    }
}
export function useTaskActivity() {
  return {
    activity,
    setUser(userId: string) {
      if (account === userId) return;
      account = userId;
      activity.value = {};
      try {
        const saved = JSON.parse(
          localStorage.getItem(`agentkit:task-activity:${account}`) || "{}",
        );
        for (const [key, value] of Object.entries(saved).slice(0, 200)) {
          const item = value as TaskActivity;
          if (
            item &&
            typeof item.running === "boolean" &&
            typeof item.waiting === "boolean" &&
            typeof item.unread === "boolean" &&
            typeof item.updatedAt === "string"
          )
            activity.value[key] = item;
        }
      } catch {
        /* Invalid local state does not affect tasks. */
      }
    },
    update(tasks: Task[]) {
      activity.value = Object.fromEntries(
        tasks.map((task) => [
          task.session_id,
          reconcileActivity(
            activity.value[task.session_id],
            task,
            active === task.session_id,
          ),
        ]),
      );
      persist();
    },
    activate(sessionId: string) {
      active = sessionId;
      const item = activity.value[sessionId];
      if (item) item.unread = false;
      persist();
    },
    mark(task: Task, phase: string) {
      const previous = activity.value[task.session_id];
      const running = phase === "streaming" || phase === "interrupting",
        waiting = phase === "waiting";
      activity.value[task.session_id] = {
        running,
        waiting,
        optimistic: running,
        updatedAt: task.updated_at,
        unread:
          active !== task.session_id &&
          !!(
            previous?.unread ||
            ((previous?.running || previous?.waiting) && !running && !waiting)
          ),
      };
      persist();
    },
    forget(sessionId: string) {
      delete activity.value[sessionId];
      persist();
    },
    reset() {
      account = "";
      active = "";
      activity.value = {};
    },
  };
}

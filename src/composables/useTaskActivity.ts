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
            activity.value[key] = {
              running: item.running,
              waiting: item.waiting,
              unread: item.unread,
              updatedAt: item.updatedAt,
              latestScheduleRunId:
                typeof item.latestScheduleRunId === "string"
                  ? item.latestScheduleRunId
                  : undefined,
            };
        }
      } catch {
        /* Invalid local state does not affect tasks. */
      }
    },
    update(tasks: Task[], observedRunIds?: ReadonlyMap<string, string | undefined>) {
      const next = Object.fromEntries(
        tasks.map((task) => [
          task.session_id,
          reconcileActivity(
            activity.value[task.session_id],
            task,
            active === task.session_id,
            observedRunIds ? { runId: observedRunIds.get(task.session_id) } : undefined,
          ),
        ]),
      );
      if (observedRunIds) {
        for (const [id, item] of Object.entries(activity.value)) {
          if (!(id in next) && item.latestScheduleRunId !== observedRunIds.get(id))
            next[id] = item;
        }
      }
      activity.value = next;
      persist();
    },
    activate(sessionId: string) {
      if (active !== sessionId) {
        const previous = activity.value[active];
        if (previous) previous.replyEnded = false;
      }
      active = sessionId;
      const item = activity.value[sessionId];
      if (item) item.unread = false;
      persist();
    },
    acknowledge(task: Task, observedRunId: string | undefined) {
      if (active !== task.session_id) return;
      const previous = activity.value[task.session_id] ??
        reconcileActivity(undefined, task, true);
      activity.value[task.session_id] = {
        ...previous,
        unread: false,
        latestScheduleRunId:
          previous.latestScheduleRunId === observedRunId
            ? task.latest_schedule_run_id || previous.latestScheduleRunId
            : previous.latestScheduleRunId,
      };
      persist();
    },
    mark(task: Task, phase: string, replyEnded = false) {
      const previous = activity.value[task.session_id];
      const running = phase === "streaming" || phase === "interrupting",
        waiting = phase === "waiting";
      activity.value[task.session_id] = {
        running,
        waiting,
        replyEnded:
          !running && !waiting && (replyEnded || !!previous?.replyEnded),
        optimistic: running,
        updatedAt: task.updated_at,
        latestScheduleRunId:
          previous?.latestScheduleRunId || task.latest_schedule_run_id || undefined,
        unread:
          active !== task.session_id &&
          !!(
            previous?.unread ||
            ((previous?.running || previous?.waiting) && !running && !waiting)
          ),
      };
      persist();
    },
    clearReplyEnd(sessionId: string) {
      const item = activity.value[sessionId];
      if (item) item.replyEnded = false;
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

import { describe, expect, it } from "vitest";
import {
  reconcileActivity,
  type TaskActivity,
} from "../src/domain/taskActivity";
import type { Task } from "../src/types/api";
import { useTaskActivity } from "../src/composables/useTaskActivity";
const task = (values: Partial<Task>): Task => ({
  session_id: "s1",
  project_id: "p1",
  plan: [],
  agent_id: "a1",
  definition_id: "personal",
  resource_version: "1",
  definition_display_name: "个人助理",
  name: "任务",
  updated_at: "old",
  ...values,
});
const running: TaskActivity = {
  running: true,
  waiting: false,
  unread: false,
  updatedAt: "old",
};
describe("task run and unread indicators", () => {
  it("marks a background completion unread, and reading it clears the dot", () => {
    const completed = reconcileActivity(
      running,
      task({ is_running: false, updated_at: "new" }),
      false,
    );
    expect(completed.unread).toBe(true);
    expect(completed.running).toBe(false);
    expect(reconcileActivity(completed, task({}), true).unread).toBe(false);
  });
  it("clears optimistic activity when the server reports no running task, even without a timestamp change", () => {
    expect(
      reconcileActivity(
        { ...running, optimistic: true },
        task({ is_running: false }),
        false,
      ).running,
    ).toBe(false);
    expect(
      reconcileActivity(
        { ...running, optimistic: true },
        task({ is_running: false, updated_at: "new" }),
        false,
      ).unread,
    ).toBe(true);
  });
  it("does not treat waiting for approval as completed", () => {
    const waiting = reconcileActivity(
      running,
      task({ is_waiting: true }),
      false,
    );
    expect(waiting.waiting).toBe(true);
    expect(waiting.unread).toBe(false);
  });
  it("keeps a finished reply idle while the server still holds the session lock", () => {
    const ended = { ...running, running: false, replyEnded: true };
    const locked = task({ is_running: true });
    const active = reconcileActivity(ended, locked, true);
    expect(active.running).toBe(false);
    expect(active.replyEnded).toBe(true);
    const released = reconcileActivity(active, task({}), true);
    expect(released.replyEnded).toBeFalsy();
    expect(reconcileActivity(released, locked, true).running).toBe(true);
    expect(reconcileActivity(ended, locked, false).running).toBe(true);
  });
  it("does not mark old history unread on initial load", () => {
    expect(
      reconcileActivity(undefined, task({ is_running: false }), false).unread,
    ).toBe(false);
  });
  it("marks a completed scheduled run unread even when polling never saw it running", () => {
    const completed = task({
      source: "schedule",
      latest_schedule_run_id: "run-1",
    });
    expect(reconcileActivity(undefined, completed, false).unread).toBe(true);
    expect(reconcileActivity(undefined, completed, true).unread).toBe(false);
  });
  it("keeps a read scheduled run read, then marks the next run in the same conversation unread", () => {
    const first = task({ source: "schedule", latest_schedule_run_id: "run-1" });
    const read = reconcileActivity(undefined, first, true);
    expect(reconcileActivity(read, first, false).unread).toBe(false);
    const next = task({ ...first, latest_schedule_run_id: "run-2" });
    expect(reconcileActivity(read, next, false).unread).toBe(true);
    expect(reconcileActivity(read, next, true).unread).toBe(false);
  });
  it("does not mark a scheduled conversation unread before its first run finishes", () => {
    expect(reconcileActivity(undefined, task({
      source: "schedule",
      latest_schedule_run_id: null,
    }), false).unread).toBe(false);
  });
  it("does not let an older list response overwrite a newer completion already read from detail", () => {
    const first = task({ source: "schedule", latest_schedule_run_id: "run-1" });
    const second = task({ ...first, latest_schedule_run_id: "run-2" });
    const read = reconcileActivity(undefined, second, true);
    const stale = reconcileActivity(read, first, false, { runId: "run-1" });
    expect(stale.latestScheduleRunId).toBe("run-2");
    expect(stale.unread).toBe(false);
    expect(reconcileActivity(stale, second, false).unread).toBe(false);
    expect(reconcileActivity(stale, task({ ...second, latest_schedule_run_id: "run-3" }), false).unread).toBe(true);
  });
  it("does not let an older detail response overwrite a newer completion already seen by polling", () => {
    const activity = useTaskActivity();
    activity.reset();
    try {
      const first = task({ source: "schedule", latest_schedule_run_id: "run-1" });
      const second = task({ ...first, latest_schedule_run_id: "run-2" });
      activity.update([first]);
      activity.activate("s1");
      const startedWith = activity.activity.value.s1?.latestScheduleRunId;
      activity.update([second]);
      activity.acknowledge(first, startedWith);
      activity.activate("");
      activity.update([second]);
      expect(activity.activity.value.s1?.unread).toBe(false);
      expect(activity.activity.value.s1?.latestScheduleRunId).toBe("run-2");
    } finally {
      activity.reset();
    }
  });
  it("keeps a just-read scheduled conversation when an older list response did not contain it", () => {
    const activity = useTaskActivity();
    activity.reset();
    try {
      const completed = task({ source: "schedule", latest_schedule_run_id: "run-1" });
      const beforeNewConversation = new Map<string, string | undefined>();
      activity.activate("s1");
      activity.acknowledge(completed, undefined);
      activity.activate("");
      activity.update([], beforeNewConversation);
      activity.update([completed]);
      expect(activity.activity.value.s1?.unread).toBe(false);
    } finally {
      activity.reset();
    }
  });
});

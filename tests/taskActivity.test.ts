import { describe, expect, it } from "vitest";
import {
  reconcileActivity,
  type TaskActivity,
} from "../src/domain/taskActivity";
import type { Task } from "../src/types/api";
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
  it("does not mark old history unread on initial load", () => {
    expect(
      reconcileActivity(undefined, task({ is_running: false }), false).unread,
    ).toBe(false);
  });
});

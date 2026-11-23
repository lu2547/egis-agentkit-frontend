import { expect, it } from "vitest";
import { UserMsg } from "@agentscope-ai/agentscope/message";
import { conversationTimeline } from "../src/domain/conversationTimeline";
import type { CollaboratorProgress } from "../src/types/api";

const worker = (
  id: string,
  start: string,
  finish?: string,
): CollaboratorProgress => ({
  worker_session_id: id,
  worker_agent_id: id,
  display_name: id,
  revision: 1,
  status: finish ? "completed" : "running",
  started_at: start,
  finished_at: finish,
  activities: [],
});
const message = (id: string, created_at: string) =>
  UserMsg({ id, created_at, content: id });

it("keeps both work records between the messages where they occurred, including experts finishing in reverse order", () => {
  const items = conversationTimeline(
    [
      message("before", "2026-11-23T01:00:00Z"),
      message("during", "2026-11-23T01:03:00Z"),
      message("after", "2026-11-23T01:06:00Z"),
    ],
    [
      worker("one", "2026-11-23T01:01:00Z", "2026-11-23T01:05:00Z"),
      worker("two", "2026-11-23T01:02:00Z", "2026-11-23T01:04:00Z"),
    ],
  );
  expect(items.map((item) => item.id)).toEqual([
    "before",
    "one:started",
    "two:started",
    "during",
    "two:finished",
    "one:finished",
    "after",
  ]);
});

it("does not reorder native messages when an earlier-written steering message was injected later", () => {
  const items = conversationTimeline(
    [
      message("reply", "2026-11-23T01:03:00Z"),
      message("steering", "2026-11-23T01:01:00Z"),
    ],
    [worker("one", "2026-11-23T01:04:00Z")],
  );
  expect(
    items.filter((item) => item.kind === "message").map((item) => item.id),
  ).toEqual(["reply", "steering"]);
  expect(items.at(-1)?.id).toBe("one:started");
});

it("adds an ending record for a failed or stopped expert but none for a waiting expert", () => {
  for (const status of ["failed", "interrupted", "waiting"] as const) {
    const progress = { ...worker("one", "2026-11-23T01:00:00Z"), status };
    expect(conversationTimeline([], [progress]).map((item) => item.id)).toEqual(
      status === "waiting" ? ["one:started"] : ["one:started", "one:finished"],
    );
  }
});

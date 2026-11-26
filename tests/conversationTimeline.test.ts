import { expect, it } from "vitest";
import { AssistantMsg, UserMsg } from "@agentscope-ai/agentscope/message";
import { conversationTimeline } from "../src/domain/conversationTimeline";
import type { CollaboratorProgress } from "../src/types/api";
import { STEERING_SOURCE, withSteeringState } from "../src/domain/steering";

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

it("keeps expert work above the reply that is still growing instead of below its streaming text", () => {
  const user = message("user", "2026-11-23T01:00:00Z");
  const reply = AssistantMsg({
    id: "reply",
    created_at: "2026-11-23T01:01:00Z",
    content: "正在整理需求",
  });
  const progress = worker("skills", "2026-11-23T01:02:00Z");
  expect(conversationTimeline([user, reply], [progress]).map(item => item.id))
    .toEqual(["user", "skills:started", "reply"]);
  reply.content.push({ id: "more", type: "text", text: "继续输出任务说明" });
  reply.finished_at = "2026-11-23T01:03:00Z";
  expect(conversationTimeline([user, reply], [progress]).map(item => item.id))
    .toEqual(["user", "skills:started", "reply"]);
});

it("groups overlapping expert updates above a live reply while keeping later completion after it", () => {
  const reply = AssistantMsg({
    id: "reply",
    created_at: "2026-11-23T01:01:00Z",
    content: "整理中",
  });
  const one = worker("one", "2026-11-23T01:02:00Z", "2026-11-23T01:04:00Z");
  const two = worker("two", "2026-11-23T01:03:00Z", "2026-11-23T01:05:00Z");
  expect(conversationTimeline([reply], [one, two]).map(item => item.id))
    .toEqual(["one:started", "two:started", "one:finished", "two:finished", "reply"]);
  reply.finished_at = "2026-11-23T01:04:30Z";
  expect(conversationTimeline([reply], [one, two]).map(item => item.id))
    .toEqual(["one:started", "two:started", "one:finished", "reply", "two:finished"]);
});

for (const received of [false, true]) {
  it(`keeps ${received ? "received guidance with its known reply" : "pending guidance after existing work"} without relying on finish time`, () => {
    const user = message("user", "2026-11-25T15:55:56Z");
    const reply = AssistantMsg({ id: "reply", content: "the response and its delivery" });
    const guidance = withSteeringState(UserMsg({
      id: "guidance", content: "不过是嫌长",
      metadata: { agentkit_delivery: { reply_id: "reply", hint_id: "queue:0" } },
    }), received ? "received" : "steering");
    const later = message("later", "2026-11-25T15:57:00Z");
    for (const finished of [false, true]) {
      reply.finished_at = finished ? "2026-11-25T15:56:39Z" : undefined;
      expect(conversationTimeline([user, reply, guidance, later]).map(item => item.id))
        .toEqual(received ? ["user", "guidance", "reply", "later"] : ["user", "reply", "guidance", "later"]);
    }
  });
}

it("restores multiple guidance messages above the containing persisted reply without relying on timestamps", () => {
  const reply = AssistantMsg({
    id: "reply", content: [
      { id: "one:0", type: "hint", source: STEERING_SOURCE, hint: "不过是嫌长" },
      { id: "two:0", type: "hint", source: STEERING_SOURCE, hint: "就是有点啰嗦" },
    ],
  });
  const one = withSteeringState(UserMsg({
    id: "original-one", content: "不过是嫌长",
    metadata: { agentkit_delivery: { hint_id: "one:0" } },
  }), "received");
  const two = withSteeringState(UserMsg({ id: "two:0", content: "就是有点啰嗦" }), "received");
  expect(conversationTimeline([reply, one, two]).map(item => item.id))
    .toEqual(["original-one", "two:0", "reply"]);
});

it("keeps existing work above a sent instruction until its real injection boundary arrives", () => {
  const reply = AssistantMsg({ id: "reply", content: [
    { id: "before", type: "thinking", thinking: "正在检查原始材料" },
  ] });
  const guidance = withSteeringState(UserMsg({ id: "guide", content: "改成蓝色",
    metadata: { agentkit_delivery: { reply_id: reply.id, hint_id: "queue:0" } },
  }), "steering");
  expect(conversationTimeline([reply, guidance]).map(item => item.id)).toEqual(["reply", "guide"]);
});

it("retains a visible status note before an instruction even without earlier text or tools", () => {
  const reply = AssistantMsg({ id: "reply", content: [
    { id: "status", type: "hint", source: "workspace", hint: "文件已保存" },
    { id: "guide:0", type: "hint", source: STEERING_SOURCE, hint: "再精简" },
    { id: "answer", type: "text", text: "已精简" },
  ] });
  const guide = withSteeringState(UserMsg({ id: "guide:0", content: "再精简" }), "received");
  const items = conversationTimeline([reply, guide]).filter(item => item.kind === "message");
  expect(items.map(item => item.message.role)).toEqual(["assistant", "user", "assistant"]);
  expect(items[0]!.message.content.some(block => block.id === "status")).toBe(true);
});

it("shows only the post-injection thinking below received guidance and preserves canonical reply identity", () => {
  const reply = AssistantMsg({ id: "reply", content: [
    { id: "before", type: "thinking", thinking: "检查原始材料" },
    { id: "queue:0", type: "hint", source: STEERING_SOURCE, hint: "改成蓝色" },
    { id: "after", type: "thinking", thinking: "按蓝色重新整理" },
    { id: "answer", type: "text", text: "蓝色版本完成" },
  ] });
  const guidance = withSteeringState(UserMsg({ id: "guide", content: "改成蓝色",
    metadata: { agentkit_delivery: { hint_id: "queue:0" } },
  }), "received");
  const original = structuredClone(reply);
  const items = conversationTimeline([reply, guidance]).filter(item => item.kind === "message");
  expect(items.map(item => item.message.role)).toEqual(["assistant", "user", "assistant"]);
  expect(items[0]!.message.content.map(block => block.id)).toEqual(["before"]);
  expect(items[2]!.message.content.map(block => block.id)).toEqual(["after", "answer"]);
  expect(items[0]!.message.finished_at).toBeTruthy();
  expect(items[2]!.message.finished_at).toBeUndefined();
  expect(items[0]!.message.id).toBe(reply.id);
  expect(items[2]!.message.id).toBe(reply.id);
  expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  expect(reply).toEqual(original);
});

it("retains a tool result across an injection boundary and separates several continuations after refresh", () => {
  const reply = AssistantMsg({ id: "reply", finished_at: "2026-11-26T02:00:00Z", content: [
    { id: "read", type: "tool_call", name: "Read", input: "{}", state: "finished" },
    { id: "one:0", type: "hint", source: STEERING_SOURCE, hint: "简短一些" },
    { id: "read", type: "tool_result", name: "Read", state: "success", output: "原始材料" },
    { id: "middle", type: "thinking", thinking: "先缩短内容" },
    { id: "two:0", type: "hint", source: STEERING_SOURCE, hint: "再保留数据" },
    { id: "last", type: "thinking", thinking: "保留数字并精简" },
    { id: "answer", type: "text", text: "最终版本" },
  ] });
  const one = withSteeringState(UserMsg({ id: "one:0", content: "简短一些" }), "received");
  const two = withSteeringState(UserMsg({ id: "two:0", content: "再保留数据" }), "received");
  const items = conversationTimeline([reply, one, two]).filter(item => item.kind === "message");
  expect(items.map(item => item.message.role)).toEqual(["assistant", "user", "assistant", "user", "assistant"]);
  expect(items[0]!.message.content.some(block => block.type === "tool_result" && block.state === "success")).toBe(true);
  expect(items[2]!.message.content.some(block => block.id === "middle")).toBe(true);
  expect(items[4]!.message.content.some(block => block.id === "last")).toBe(true);
  expect(items.filter(item => item.message.role === "assistant").every(item => item.message.id === "reply")).toBe(true);
});

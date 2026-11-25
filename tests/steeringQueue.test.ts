import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref, effectScope, nextTick } from "vue";
import { ApiError } from "../src/api/http";
import type { AgentEvent } from "@agentscope-ai/agentscope/event";
import type { ChatQueueItem } from "../src/api/runtime";
import {
  useSteeringQueue,
  clearSteeringQueues,
  observeChatQueue,
} from "../src/composables/useSteeringQueue";
const api = vi.hoisted(() => ({
  queue: vi.fn(),
  trigger: vi.fn(),
  updateQueued: vi.fn(),
  removeQueued: vi.fn(),
  reorderQueued: vi.fn(),
  steerQueued: vi.fn(),
}));
vi.mock("../src/api/runtime", () => ({ runtime: api }));
let remote: Record<string, ChatQueueItem[]>;
let scopes: ReturnType<typeof effectScope>[];
const copy = (sid: string) => ({ items: structuredClone(remote[sid] || []) });
function setup(
  sid = ref(crypto.randomUUID()),
  agentId = ref("agent"),
  presented = ref(new Set<string>()),
  replyId = ref("reply"),
) {
  const scope = effectScope();
  scopes.push(scope);
  const error = vi.fn();
  return {
    sid,
    error,
    replyId,
    queue: scope.run(() =>
      useSteeringQueue(sid, ref(20), agentId, replyId, error, presented),
    )!,
  };
}
beforeEach(() => {
  clearSteeringQueues();
  vi.resetAllMocks();
  remote = {};
  scopes = [];
  api.queue.mockImplementation(async (sid: string) => copy(sid));
  api.trigger.mockImplementation(async (sid, _aid, input) => {
    const id = crypto.randomUUID();
    (remote[sid] ||= []).push({
      id,
      created_at: new Date().toISOString(),
      state: "queued",
      input,
    });
    return { status: "queued", session_id: sid, queue_item_id: id };
  });
  api.updateQueued.mockImplementation(async (sid, _aid, id, input) => {
    Object.assign(
      remote[sid]!.find((i) => i.id === id)!,
      { input, state: "queued" },
    );
    return copy(sid);
  });
  api.removeQueued.mockImplementation(async (sid, _aid, id) => {
    remote[sid] = remote[sid]!.filter((i) => i.id !== id);
    return copy(sid);
  });
  api.reorderQueued.mockImplementation(async (sid, _aid, ids) => {
    remote[sid] = ids.map((id: string) =>
      remote[sid]!.find((i) => i.id === id)!,
    );
    return copy(sid);
  });
  api.steerQueued.mockImplementation(async (sid, _aid, id) => {
    remote[sid]!.find((i) => i.id === id)!.state = "steering";
    return copy(sid);
  });
});

it("ignores a queue error from the previous agent after the current session is ready", async () => {
  let rejectPrevious!: (reason: Error) => void;
  api.queue.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectPrevious = reject;
      }),
  );
  const agentId = ref("previous-agent");
  const { queue, error } = setup(ref("current-session"), agentId);
  agentId.value = "current-agent";
  await nextTick();
  await queue.refresh();
  rejectPrevious(new ApiError(403, "会话不存在或不可访问"));
  await nextTick();
  expect(error).not.toHaveBeenCalled();
});

it("ignores an older queue error after a newer refresh succeeds", async () => {
  let rejectPrevious!: (reason: Error) => void;
  api.queue.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectPrevious = reject;
      }),
  );
  const { queue, error } = setup();
  await queue.refresh();
  rejectPrevious(new ApiError(403, "会话不存在或不可访问"));
  await nextTick();
  expect(error).not.toHaveBeenCalled();
});

it("still reports a current queue authorization rejection", async () => {
  const { queue, error } = setup();
  await queue.refresh();
  api.queue.mockRejectedValueOnce(new ApiError(403, "会话不存在或不可访问"));
  await queue.refresh();
  expect(error).toHaveBeenCalledWith("会话不存在或不可访问");
});
afterEach(() => scopes.forEach((scope) => scope.stop()));
it("shows an ordinary pending send once while keeping supplements editable and ordered", async () => {
  const presented = ref(new Set<string>());
  const { sid, queue } = setup(undefined, undefined, presented);
  await queue.add("查知识库啊");
  const ordinary = remote[sid.value]![0]!;
  const input =
    ordinary.input as import("@agentscope-ai/agentscope/message").Msg;
  presented.value = new Set([input.id]);
  expect(queue.waitingForExecution.value).toBe(true);
  await queue.add("先看方案");
  await queue.add("再看清单");
  expect(queue.items.value.map((item) => item.text)).toEqual([
    "先看方案",
    "再看清单",
  ]);
  await queue.move(queue.items.value[1]!.id, 0);
  expect(remote[sid.value]!.map((item) => item.id)).toEqual([
    ordinary.id,
    queue.items.value[0]!.id,
    queue.items.value[1]!.id,
  ]);
  expect(queue.items.value.map((item) => item.text)).toEqual([
    "再看清单",
    "先看方案",
  ]);
  ordinary.state = "failed";
  ordinary.error = "暂时不可用";
  await queue.refresh();
  expect(queue.items.value[0]).toMatchObject({
    text: "查知识库啊",
    status: "failed",
  });
  expect(queue.waitingForExecution.value).toBe(false);
});

it("persists multiple messages and restores a fresh view with edit, reorder and delete", async () => {
  const { sid, queue } = setup();
  await queue.add("预算");
  await queue.add("配色");
  await queue.add("保留原文");
  const [first, second, third] = queue.items.value;
  await queue.edit(second!.id, "配色改为蓝色");
  await queue.move(third!.id, 0);
  await queue.remove(first!.id);
  const fresh = setup(sid).queue;
  await fresh.refresh();
  expect(fresh.items.value.map((item) => item.text)).toEqual([
    "保留原文",
    "配色改为蓝色",
  ]);
  expect(api.trigger).toHaveBeenCalledTimes(3);
  expect(api.steerQueued).not.toHaveBeenCalled();
});
it("retains reserved inputs until the native context injection is acknowledged", async () => {
  const { sid, queue } = setup();
  await queue.add("预算优先");
  const id = queue.items.value[0]!.id;
  expect(await queue.send([id])).toBe(true);
  expect(queue.items.value).toEqual([]);
  expect(queue.messages.value[0]?.metadata.agentkit_delivery).toMatchObject({ state: "steering" });
  expect(api.steerQueued.mock.calls[0]!.slice(0, 4)).toEqual([
    sid.value,
    "agent",
    id,
    "reply",
  ]);
  observeChatQueue(sid.value, {
    type: "CUSTOM",
    name: "chat_queue_changed",
    value: { items: [] },
  } as unknown as AgentEvent);
  expect(queue.items.value).toEqual([]);
});
it("keeps failures editable and retries the same server item", async () => {
  const { queue } = setup();
  await queue.add("预算优先");
  const id = queue.items.value[0]!.id;
  api.steerQueued.mockRejectedValueOnce(new Error("暂时不可用"));
  expect(await queue.send([id])).toBe(false);
  expect(queue.items.value[0]!.id).toBe(id);
  expect(queue.items.value[0]!.error).toContain("暂时不可用");
  await queue.edit(id, "先确认预算");
  expect(await queue.send([id])).toBe(true);
  expect(api.trigger).toHaveBeenCalledTimes(1);
});
it("does not let a stale queue GET overwrite a newer SSE snapshot", async () => {
  const { sid, queue } = setup();
  await queue.add("原始要求");
  let resolve!: (value: { items: ChatQueueItem[] }) => void;
  const old = copy(sid.value);
  api.queue.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const loading = queue.refresh();
  observeChatQueue(sid.value, {
    type: "CUSTOM",
    name: "chat_queue_changed",
    value: { items: [] },
  } as unknown as AgentEvent);
  resolve(old);
  await loading;
  expect(queue.items.value).toEqual([]);
});
it("keeps session changes and late logout responses isolated", async () => {
  const { sid, queue } = setup();
  const first = sid.value;
  await queue.add("私人项目");
  let resolve!: (value: { items: ChatQueueItem[] }) => void;
  const old = copy(first);
  api.queue.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const loading = queue.refresh();
  sid.value = "another-session";
  await queue.add("另一个项目");
  expect(queue.items.value.map((item) => item.text)).toEqual(["另一个项目"]);
  clearSteeringQueues();
  resolve(old);
  await loading;
  sid.value = first;
  expect(queue.items.value).toEqual([]);
});
it("queues an empty-body annotation and preserves it while editing", async () => {
  const { queue } = setup();
  const annotations = [
    {
      id: "note",
      messageId: "reply",
      start: 0,
      end: 2,
      text: "原文",
      comment: "解释",
    },
  ];
  await queue.add("", [], annotations);
  const id = queue.items.value[0]!.id;
  await queue.edit(id, "补充要求");
  expect(queue.items.value[0]!.annotations).toEqual(annotations);
  expect(queue.items.value[0]!.text).toBe("补充要求");
});

it("editing keeps raw attachments and existing preview excerpts intact", async () => {
  const { sid, queue } = setup();
  await queue.add("原要求");
  const message = remote[sid.value]![0]!
    .input as import("@agentscope-ai/agentscope/message").Msg;
  message.content.push({
    type: "data",
    id: "image",
    name: "attachment.png",
    source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
    created_at: new Date().toISOString(),
  });
  message.metadata.preview_prompt = "原要求";
  const text = message.content[0]!;
  if (text.type === "text") text.text += "\n既有预览摘录：保留这段证据";
  await queue.refresh();
  await queue.edit(queue.items.value[0]!.id, "新要求");
  const edited = remote[sid.value]![0]!
    .input as import("@agentscope-ai/agentscope/message").Msg[];
  expect(
    edited[0]!.content.some(
      (block) => block.type === "data" && block.id === "image",
    ),
  ).toBe(true);
  expect(edited[0]!.content[0]).toMatchObject({
    text: "新要求\n既有预览摘录：保留这段证据",
  });
});
it("editing a batch changes its first message without duplicating its tail", async () => {
  const { sid, queue } = setup();
  await queue.add("第一条");
  await queue.add("第二条");
  const [first, second] = remote[sid.value]!;
  first!.input = [
    first!.input as import("@agentscope-ai/agentscope/message").Msg,
    second!.input as import("@agentscope-ai/agentscope/message").Msg,
  ];
  remote[sid.value] = [first!];
  await queue.refresh();
  expect(queue.items.value[0]!.text).toBe("第一条");
  await queue.edit(first!.id, "修改第一条");
  const edited = remote[sid.value]![0]!
    .input as import("@agentscope-ai/agentscope/message").Msg[];
  expect(edited.map((m) => m.content[0])).toMatchObject([
    { text: "修改第一条" },
    { text: "第二条" },
  ]);
});

it("keeps an accepted draft only in the queue until steering is explicitly requested", async () => {
  const { queue } = setup();
  await queue.refresh();
  api.queue.mockImplementationOnce(() => new Promise(() => {}));
  const accepted = await queue.add("橙蓝配色");
  expect(accepted).toBeTruthy();
  expect(queue.messages.value).toEqual([]);
  expect(queue.items.value).toHaveLength(1);
  await queue.send([queue.items.value[0]!.id]);
  expect(queue.items.value).toEqual([]);
  expect(queue.messages.value).toHaveLength(1);
  expect(queue.messages.value[0]?.content[0]).toMatchObject({
    text: "橙蓝配色",
  });
  expect(queue.messages.value[0]?.metadata.agentkit_delivery).toMatchObject({
    state: "steering",
  });
});

it("keeps the steering bubble until HintBlock and never restores an acknowledged item from late readback", async () => {
  const { sid, queue } = setup();
  await queue.add("蓝色优先");
  const id = queue.items.value[0]!.id;
  await queue.send([id]);
  observeChatQueue(sid.value, {
    type: "CUSTOM",
    name: "chat_queue_changed",
    value: { items: [] },
  } as unknown as AgentEvent);
  expect(queue.messages.value[0]?.metadata.agentkit_delivery).toMatchObject({
    state: "steering",
  });
  observeChatQueue(sid.value, {
    type: "HINT_BLOCK",
    source: "chat_input_steering",
    block_id: `${id}:0`,
  } as unknown as AgentEvent);
  expect(queue.messages.value).toEqual([]);
  await queue.refresh();
  expect(queue.items.value).toEqual([]);
});

it("keeps accepted input in the draft queue when unrelated queue changes arrive during the POST", async () => {
  const { sid, queue } = setup();
  await queue.refresh();
  api.trigger.mockImplementationOnce(async (_sid, _aid, input) => {
    observeChatQueue(sid.value, {
      type: "CUSTOM",
      name: "chat_queue_changed",
      value: { items: [] },
    } as unknown as AgentEvent);
    return {
      status: "queued",
      session_id: sid.value,
      queue_item_id: "late-accepted",
    };
  });
  api.queue.mockImplementationOnce(() => new Promise(() => {}));
  await queue.add("橙蓝配色");
  expect(queue.messages.value).toEqual([]);
  expect(queue.items.value[0]?.id).toBe("late-accepted");
});

it("clears the next-round notice when execution starts instead of keeping it as a global error", async () => {
  const { queue, error, replyId } = setup(undefined, undefined, undefined, ref(""));
  await queue.add("不过是嫌长");
  await queue.send([queue.items.value[0]!.id]);
  expect(error).not.toHaveBeenCalled();
  expect(queue.notice.value).toContain("下一轮执行");
  replyId.value = "next-reply";
  await nextTick();
  expect(queue.notice.value).toBe("");
  replyId.value = "";
  await nextTick();
  expect(queue.notice.value).toBe("");
});

it("clears the next-round notice when the server queue becomes empty", async () => {
  const { queue, sid, error } = setup(undefined, undefined, undefined, ref(""));
  await queue.add("就是有点啰嗦");
  await queue.send([queue.items.value[0]!.id]);
  expect(error).not.toHaveBeenCalled();
  expect(queue.notice.value).toContain("下一轮执行");
  remote[sid.value] = [];
  await queue.refresh();
  expect(queue.notice.value).toBe("");
});

it("retains the target reply for an in-flight steering message when the reply ends", async () => {
  const { queue, replyId } = setup();
  await queue.add("不过是嫌长");
  await queue.send([queue.items.value[0]!.id]);
  replyId.value = "";
  await nextTick();
  expect(queue.messages.value[0]?.metadata.agentkit_delivery).toMatchObject({ reply_id: "reply" });
});

it("keeps the remaining messages of a batch visible until each native hint arrives", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const { sid, queue } = setup();
  await queue.refresh();
  remote[sid.value] = [
    {
      id: "batch",
      created_at: new Date().toISOString(),
      state: "steering",
      input: [
        UserMsg({ id: "first", content: "第一项" }),
        UserMsg({ id: "second", content: "第二项" }),
      ],
    },
  ];
  await queue.refresh();
  observeChatQueue(sid.value, {
    type: "CUSTOM",
    name: "chat_queue_changed",
    value: { items: [] },
  } as unknown as AgentEvent);
  observeChatQueue(sid.value, {
    type: "HINT_BLOCK",
    source: "chat_input_steering",
    block_id: "batch:0",
  } as unknown as AgentEvent);
  expect(queue.messages.value.map((message) => message.id)).toEqual(["second"]);
  observeChatQueue(sid.value, {
    type: "HINT_BLOCK",
    source: "chat_input_steering",
    block_id: "batch:1",
  } as unknown as AgentEvent);
  expect(queue.messages.value).toEqual([]);
});

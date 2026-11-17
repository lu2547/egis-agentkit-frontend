import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { EventType, type AgentEvent } from "@agentscope-ai/agentscope/event";
import { useConversation } from "../src/composables/useConversation";
const mocks = vi.hoisted(() => ({
  task: vi.fn(),
  settings: vi.fn(),
  history: vi.fn(),
  stream: vi.fn(),
  trigger: vi.fn(),
  stop: vi.fn(),
  steer: vi.fn(),
  feedback: vi.fn(),
}));
vi.mock("../src/api/manager", () => ({
  manager: {
    task: mocks.task,
    updateTaskSettings: mocks.settings,
    listReplyFeedback: mocks.feedback,
  },
}));
vi.mock("../src/api/runtime", () => ({
  runtime: {
    history: mocks.history,
    stream: mocks.stream,
    trigger: mocks.trigger,
    stop: mocks.stop,
    steer: mocks.steer,
  },
}));
let scope: ReturnType<typeof effectScope>;
let chat: ReturnType<typeof useConversation>;
let receive: (event: AgentEvent) => void;
const event = (type: string, fields = {}) =>
  ({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    type,
    reply_id: "reply",
    session_id: "s1",
    ...fields,
  }) as AgentEvent;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.feedback.mockResolvedValue({ items: [] });
  mocks.task.mockImplementation(async (sid: string) => ({
    session_id: sid,
    agent_id: "agent",
    name: sid,
  }));
  mocks.history.mockResolvedValue({
    messages: [],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  mocks.stream.mockImplementation(
    (_sid, _agent, _signal, _cursor, onEvent, onReady) => {
      receive = onEvent;
      onReady();
      return new Promise(() => {});
    },
  );
  mocks.trigger.mockResolvedValue({ status: "accepted" });
  scope = effectScope();
  scope.run(() => (chat = useConversation()));
});
afterEach(() => scope.stop());
it("sends an ordered steering batch without replacing the running reply", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  await chat.open("s1");
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  const inputs = [
    UserMsg({ name: "user", content: "一" }),
    UserMsg({ name: "user", content: "二" }),
  ];
  mocks.steer.mockResolvedValueOnce({
    status: "queued",
    message_ids: inputs.map((m) => m.id),
  });
  expect(await chat.steer(inputs)).toBe(true);
  expect(chat.state.value.phase).toBe("streaming");
  expect(
    chat.state.value.messages.filter((m) => m.role === "assistant"),
  ).toHaveLength(1);
  receive(
    event(EventType.HINT_BLOCK, {
      block_id: inputs[1]!.id,
      source: "user_steering",
      hint: "二",
    }),
  );
  expect(
    chat.state.value.messages.find((m) => m.id === inputs[1]!.id)?.metadata
      .agentkit_delivery,
  ).toEqual({ kind: "steer", state: "received" });
  expect(
    chat.state.value.messages.find((m) => m.id === inputs[0]!.id)?.metadata
      .agentkit_delivery,
  ).toEqual({ kind: "steer", state: "queued" });
});
it("allows permission changes while waiting without resuming or changing the model", async () => {
  await chat.open("s1");
  chat.state.value.phase = "waiting";
  mocks.settings.mockResolvedValueOnce({
    ...chat.task.value,
    permission_mode: "bypass",
  });
  await chat.updateSettings({ permission_mode: "bypass" });
  expect(chat.task.value?.permission_mode).toBe("bypass");
  expect(chat.state.value.phase).toBe("waiting");
  expect(mocks.trigger).not.toHaveBeenCalled();
  await chat.updateSettings({ model_key: "another-model" });
  expect(mocks.settings).toHaveBeenCalledTimes(1);
});
it("does not let a stale feedback response mark replies in another session", async () => {
  let finish!: (value: unknown) => void;
  mocks.feedback.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await chat.open("s1");
  await chat.open("s2");
  finish({ items: [{ reply_id: "old-reply", comment: "旧会话反馈" }] });
  await Promise.resolve();
  expect(chat.replyFeedback.value).toEqual({});
});
it("keeps chat connected when optional feedback status cannot be loaded", async () => {
  mocks.feedback.mockRejectedValueOnce(new Error("feedback unavailable"));
  await chat.open("s1");
  expect(chat.connection.value).toBe("connected");
  expect(chat.error.value).toBe("");
});
it("subscribes before triggering and retains a reply that completes before the POST response", async () => {
  await chat.open("s1");
  mocks.trigger.mockImplementation(async () => {
    expect(chat.connection.value).toBe("connected");
    receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
    receive(event(EventType.REPLY_END, { finished_reason: "completed" }));
    return {};
  });
  await chat.send("hello");
  expect(chat.state.value.phase).toBe("idle");
  expect(chat.state.value.messages.some((m) => m.id === "reply")).toBe(true);
  expect(chat.state.value.messages[0].role).toBe("user");
});
it("prevents a stale confirmation response from changing the new session", async () => {
  await chat.open("s1");
  let finish!: () => void;
  mocks.trigger.mockImplementation(
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  const pending = chat.confirm(
    "reply",
    {
      id: "t",
      type: "tool_call",
      name: "write",
      input: "{}",
      state: "asking",
      created_at: new Date().toISOString(),
    },
    true,
  );
  await chat.open("s2");
  finish();
  await pending;
  expect(chat.task.value?.session_id).toBe("s2");
  expect(chat.state.value.phase).toBe("idle");
});
it("preserves initial history checkpoint on reconnect so unseen native events can be replayed", async () => {
  await chat.open("s1");
  expect(mocks.stream.mock.calls[0][3]).toBe("checkpoint");
});

it("reconciles a lost terminal event from server history and releases the composer", async () => {
  await chat.open("s1");
  await chat.send("测试丢失结束事件");
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  const history = structuredClone(chat.state.value.messages);
  mocks.history.mockResolvedValueOnce({
    messages: history,
    is_running: false,
    has_more: false,
    event_cursor: "after-error",
  });
  await chat.refreshRunState();
  expect(chat.state.value.phase).toBe("idle");
  expect(chat.state.value.messages.at(-1)?.error?.message).toContain("中断");
  expect(mocks.stream.mock.calls.at(-1)?.[3]).toBe("after-error");
  expect(await chat.send("重新发送")).toBe(true);
});

it("ignores a stale status snapshot when a terminal event arrives during the request", async () => {
  await chat.open("s1");
  await chat.send("等待正常完成");
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  const messages = structuredClone(chat.state.value.messages);
  let finish!: (value: unknown) => void;
  mocks.history.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const checking = chat.refreshRunState();
  receive(event(EventType.REPLY_END, { finished_reason: "completed" }));
  finish({
    messages,
    is_running: false,
    has_more: false,
    event_cursor: "stale",
  });
  await checking;
  expect(chat.state.value.messages.at(-1)?.finished_reason).toBe("completed");
  expect(chat.state.value.messages.at(-1)?.error).toBeFalsy();
});

it("does not finish a queued request before its input reaches server history", async () => {
  await chat.open("s1");
  await chat.send("尚在排队");
  await chat.refreshRunState();
  expect(chat.state.value.phase).toBe("streaming");
});

it("explicitly declines a send while another run is active so callers retain their draft", async () => {
  await chat.open("s1");
  chat.state.value.phase = "streaming";
  expect(await chat.send("保留我的草稿")).toBe(false);
  expect(mocks.trigger).not.toHaveBeenCalled();
});

it("reconnects from the checkpoint and applies only unseen events after replay", async () => {
  vi.useFakeTimers();
  const start = event(EventType.REPLY_START, {
    name: "Egis",
    role: "assistant",
  });
  const block = event(EventType.TEXT_BLOCK_START, { block_id: "b" });
  const first = event(EventType.TEXT_BLOCK_DELTA, {
    block_id: "b",
    delta: "Hello",
  });
  const second = event(EventType.TEXT_BLOCK_DELTA, {
    block_id: "b",
    delta: " world",
  });
  let attempts = 0;
  mocks.stream.mockImplementation(
    (_sid, _agent, _signal, cursor, onEvent, onReady) => {
      expect(cursor).toBe("checkpoint");
      onReady();
      attempts++;
      for (const value of [start, block, first]) onEvent(value);
      if (attempts === 1) return Promise.reject(new Error("connection lost"));
      onEvent(second);
      return new Promise(() => {});
    },
  );
  await chat.open("s1");
  await Promise.resolve();
  expect(chat.connection.value).toBe("retrying");
  await vi.advanceTimersByTimeAsync(2000);
  expect(chat.connection.value).toBe("connected");
  expect(chat.state.value.messages).toHaveLength(1);
  expect(chat.state.value.messages[0].content[0]).toMatchObject({
    text: "Hello world",
  });
  vi.useRealTimers();
});

it("rejects sends while settings save and ignores metadata requested before that save", async () => {
  await chat.open("s1");
  let finishMetadata!: (value: unknown) => void,
    finishSettings!: (value: unknown) => void;
  mocks.task.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishMetadata = resolve;
      }),
  );
  const metadata = chat.refreshMetadata();
  mocks.settings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSettings = resolve;
      }),
  );
  const settings = chat.updateSettings({ permission_mode: "explore" });
  expect(chat.settingsPending.value).toBe(true);
  expect(await chat.send("等待配置保存")).toBe(false);
  finishSettings({
    session_id: "s1",
    agent_id: "agent",
    name: "s1",
    permission_mode: "explore",
  });
  await settings;
  finishMetadata({
    session_id: "s1",
    agent_id: "agent",
    name: "s1",
    permission_mode: "default",
  });
  await metadata;
  expect(chat.task.value?.permission_mode).toBe("explore");
  expect(chat.settingsPending.value).toBe(false);
  expect(mocks.trigger).not.toHaveBeenCalled();
});
it("does not apply a completed settings save to a newly opened conversation", async () => {
  await chat.open("s1");
  let finish!: (value: unknown) => void;
  mocks.settings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = chat.updateSettings({ permission_mode: "explore" });
  await chat.open("s2");
  finish({
    session_id: "s1",
    agent_id: "agent",
    name: "s1",
    permission_mode: "explore",
  });
  await pending;
  expect(chat.task.value?.session_id).toBe("s2");
  expect(chat.settingsPending.value).toBe(false);
});

it("shows preparation after a queued send and replaces it when the native reply starts", async () => {
  await chat.open("s1");
  expect(chat.state.value.isPreparing).toBe(false);
  await chat.send("等待沙箱准备");
  expect(chat.state.value.isPreparing).toBe(true);
  expect(
    chat.state.value.messages.filter((m) => m.role === "assistant"),
  ).toHaveLength(0);
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  expect(chat.state.value.isPreparing).toBe(false);
  expect(
    chat.state.value.messages.filter((m) => m.role === "assistant"),
  ).toHaveLength(1);
});

it("clears preparation on a failed send or a session switch", async () => {
  await chat.open("s1");
  mocks.trigger.mockRejectedValueOnce(new Error("发送失败"));
  expect(await chat.send("失败请求")).toBe(false);
  expect(chat.state.value.isPreparing).toBe(false);
  await chat.send("尚在准备");
  expect(chat.state.value.isPreparing).toBe(true);
  await chat.open("s2");
  expect(chat.state.value.isPreparing).toBe(false);
});

it("shows preparation when reopening a running session before its first reply event", async () => {
  mocks.history.mockResolvedValueOnce({
    messages: [],
    has_more: false,
    is_running: true,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  expect(chat.state.value.isPreparing).toBe(true);
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  expect(chat.state.value.isPreparing).toBe(false);
});

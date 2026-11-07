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
}));
vi.mock("../src/api/manager", () => ({
  manager: { task: mocks.task, updateTaskSettings: mocks.settings },
}));
vi.mock("../src/api/runtime", () => ({
  runtime: {
    history: mocks.history,
    stream: mocks.stream,
    trigger: mocks.trigger,
    stop: mocks.stop,
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

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
it("shows native steering after injection without replacing the running reply", async () => {
  await chat.open("s1");
  receive(event(EventType.REPLY_START, { name: "Egis", role: "assistant" }));
  receive(
    event(EventType.HINT_BLOCK, {
      block_id: "queued:0",
      source: "chat_input_steering",
      hint: "预算优先",
    }),
  );
  expect(chat.state.value.phase).toBe("streaming");
  expect(
    chat.state.value.messages.filter((m) => m.role === "assistant"),
  ).toHaveLength(1);
  expect(
    chat.state.value.messages.find((m) => m.id === "queued:0")?.metadata
      .agentkit_delivery,
  ).toEqual({ kind: "steer", state: "received" });
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

it("restores original steering IDs and metadata once from history and replay", async () => {
  const { ConversationEvents } =
    await import("../src/domain/agentEventReducer");
  const { AssistantMsg, UserMsg } =
    await import("@agentscope-ai/agentscope/message");
  const hintId = "queue:0";
  const original = UserMsg({
    id: "original-user",
    name: "user",
    content: "用户正文",
    metadata: {
      annotation_prompt: "",
      text_annotations: [
        {
          id: "note",
          messageId: "original",
          start: 0,
          end: 2,
          text: "原文",
          comment: "解释",
        },
      ],
      agentkit_delivery: { kind: "steer", state: "received", hint_id: hintId },
    },
  });
  const reply = AssistantMsg({
    id: "reply",
    name: "assistant",
    content: [
      {
        type: "hint",
        id: hintId,
        source: "chat_input_steering",
        hint: "用户正文",
        created_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
    ],
    finished_at: new Date().toISOString(),
  });
  const state = new ConversationEvents([reply, original], false);
  expect(state.messages.filter((m) => m.role === "user")).toHaveLength(1);
  state.apply(
    event(EventType.HINT_BLOCK, {
      block_id: hintId,
      source: "chat_input_steering",
      hint: "用户正文",
      user_message: original,
    }),
  );
  expect(state.messages.filter((m) => m.role === "user")).toHaveLength(1);
  expect(
    state.messages.find((m) => m.id === original.id)?.metadata.text_annotations,
  ).toEqual(original.metadata.text_annotations);
});

it("replaces from an edited user message and blocks replay of discarded replies", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const earlier = UserMsg({ id: "earlier", name: "user", content: "earlier" });
  const selected = UserMsg({
    id: "selected",
    name: "user",
    content: "original",
  });
  const discardedUser = UserMsg({
    id: "later-user",
    name: "user",
    content: "old later prompt",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [earlier, selected, discardedUser],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  const oldStart = event(EventType.REPLY_START, {
    reply_id: "discarded",
    name: "Egis",
    role: "assistant",
  });
  receive(oldStart);
  receive(
    event(EventType.REPLY_END, {
      reply_id: "discarded",
      finished_reason: "completed",
    }),
  );
  const oldState = event(EventType.CUSTOM, {
    name: "state_updated",
    value: {
      tasks_context: {
        tasks: [{ id: "old-task", subject: "旧计划", state: "completed" }],
      },
    },
  });
  receive(oldState);
  let accept!: (value: unknown) => void;
  mocks.trigger.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  const pending = chat.resend(selected, "edited");
  await vi.waitFor(() =>
    expect(chat.state.value.messages.map((m) => m.id)).toEqual([
      "earlier",
      "selected",
    ]),
  );
  expect(chat.state.value.isPreparing).toBe(true);
  expect(chat.state.value.messages.at(-1)?.content[0]).toMatchObject({
    text: "edited",
  });
  receive(oldStart);
  receive(
    event(EventType.REPLY_START, {
      reply_id: "discarded",
      name: "Egis",
      role: "assistant",
    }),
  );
  receive(oldState);
  expect(chat.state.value.plan).toBeUndefined();
  receive(
    event(EventType.CUSTOM, {
      name: "chat_input_started",
      value: { queue_item: { input: discardedUser } },
    }),
  );
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "earlier",
    "selected",
  ]);
  receive(
    event(EventType.REPLY_START, {
      reply_id: "new-reply",
      name: "Egis",
      role: "assistant",
    }),
  );
  receive(
    event(EventType.REPLY_END, {
      reply_id: "new-reply",
      finished_reason: "completed",
    }),
  );
  accept({ status: "queued" });
  expect(await pending).toBe(true);
  expect(chat.state.value.phase).toBe("idle");
  expect(chat.state.value.messages.at(-1)?.id).toBe("new-reply");
  expect(mocks.trigger.mock.calls.at(-1)?.[4]).toBe("selected");
});

it("restores the original conversation when replacement is rejected", async () => {
  const { UserMsg, AssistantMsg } =
    await import("@agentscope-ai/agentscope/message");
  const selected = UserMsg({
    id: "selected",
    name: "user",
    content: "original",
  });
  const later = AssistantMsg({
    id: "old-reply",
    name: "Egis",
    content: "old answer",
  });
  later.finished_at = new Date().toISOString();
  mocks.history.mockResolvedValueOnce({
    messages: [selected, later],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  mocks.trigger.mockRejectedValueOnce(new Error("busy"));
  expect(await chat.resend(selected, "edited")).toBe(false);
  expect(chat.state.value.messages).toEqual([selected, later]);
  expect(chat.state.value.phase).toBe("idle");
  expect(chat.error.value).toBe("busy");
});

it.each(["streaming", "waiting", "interrupting"] as const)(
  "refuses replacing a message during %s",
  async (phase) => {
    const { UserMsg } = await import("@agentscope-ai/agentscope/message");
    const selected = UserMsg({
      id: "selected",
      name: "user",
      content: "original",
    });
    mocks.history.mockResolvedValueOnce({
      messages: [selected],
      has_more: false,
      is_running: false,
      event_cursor: "checkpoint",
    });
    await chat.open("s1");
    chat.state.value.phase = phase;
    expect(await chat.resend(selected, "edited")).toBe(false);
    expect(chat.state.value.messages).toEqual([selected]);
    expect(mocks.trigger).not.toHaveBeenCalled();
  },
);

it("clears old collaborator windows on resend while retaining expert membership, and restores windows on rejection", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const selected = UserMsg({
    id: "selected",
    name: "user",
    content: "original",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [selected],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  const progress = {
    worker_session_id: "worker",
    worker_agent_id: "expert",
    display_name: "专家",
    revision: 1,
    status: "completed" as const,
    activities: [],
  };
  chat.collaboratorProgress.value = new Map([["worker", progress]]);
  const members = [
    {
      definition_id: "expert",
      resource_view_type: "system" as const,
      resource_version: "1",
      display_name: "专家",
      status: "joined" as const,
      worker_session_id: "worker",
    },
  ];
  chat.task.value = { ...chat.task.value!, collaborators: members };
  mocks.trigger.mockRejectedValueOnce(new Error("busy"));
  expect(await chat.resend(selected, "first try")).toBe(false);
  expect(chat.collaboratorProgress.value.get("worker")).toEqual(progress);
  expect(await chat.resend(selected, "second try")).toBe(true);
  expect(chat.collaboratorProgress.value.size).toBe(0);
  expect(chat.task.value?.collaborators).toEqual(members);
});

it.each(["running", "waiting"] as const)(
  "refuses replacing while an expert is %s",
  async (status) => {
    const { UserMsg } = await import("@agentscope-ai/agentscope/message");
    const selected = UserMsg({
      id: "selected",
      name: "user",
      content: "original",
    });
    mocks.history.mockResolvedValueOnce({
      messages: [selected],
      has_more: false,
      is_running: false,
      event_cursor: "checkpoint",
    });
    await chat.open("s1");
    chat.collaboratorProgress.value = new Map([
      [
        "worker",
        {
          worker_session_id: "worker",
          worker_agent_id: "expert",
          display_name: "专家",
          revision: 1,
          status,
          activities: [],
        },
      ],
    ]);
    expect(await chat.resend(selected, "edited")).toBe(false);
    expect(chat.state.value.messages).toEqual([selected]);
  },
);

it("permits replacing while an idle root has only old queued expert progress", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const selected = UserMsg({
    id: "selected",
    name: "user",
    content: "original",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [selected],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  chat.collaboratorProgress.value = new Map([
    [
      "worker",
      {
        worker_session_id: "worker",
        worker_agent_id: "expert",
        display_name: "专家",
        revision: 1,
        status: "queued",
        activities: [],
      },
    ],
  ]);
  expect(await chat.resend(selected, "edited")).toBe(true);
  expect(chat.collaboratorProgress.value.size).toBe(0);
});

it("editing a live steering input discards its containing assistant without recreating the old hint", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const initial = UserMsg({ id: "initial", name: "user", content: "初始问题" });
  const steering = UserMsg({
    id: "steered-user",
    name: "user",
    content: "旧引导",
    metadata: {
      agentkit_delivery: {
        kind: "steer",
        state: "received",
        hint_id: "steer-hint",
      },
    },
  });
  mocks.history.mockResolvedValueOnce({
    messages: [initial],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  receive(
    event(EventType.REPLY_START, {
      reply_id: "containing-reply",
      name: "Egis",
      role: "assistant",
    }),
  );
  receive(
    event(EventType.HINT_BLOCK, {
      reply_id: "containing-reply",
      block_id: "steer-hint",
      source: "chat_input_steering",
      hint: "旧引导",
      user_message: steering,
    }),
  );
  receive(
    event(EventType.REPLY_END, {
      reply_id: "containing-reply",
      finished_reason: "completed",
    }),
  );
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "initial",
    "containing-reply",
    "steered-user",
  ]);
  let finish!: (value: unknown) => void;
  mocks.trigger.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = chat.resend(steering, "新引导");
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "initial",
    "steered-user",
  ]);
  expect(chat.state.value.messages.at(-1)?.content[0]).toMatchObject({
    text: "新引导",
  });
  expect(chat.state.value.isPreparing).toBe(true);
  finish({ status: "queued" });
  expect(await pending).toBe(true);
});

it("applies a canonical rewrite marker to another tab and keeps unseen earlier history loadable", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const loadedPrefix = UserMsg({
    id: "loaded-prefix",
    name: "user",
    content: "前文",
  });
  const laterPrefix = UserMsg({
    id: "later-prefix",
    name: "user",
    content: "稍后的前文",
  });
  const wrongSuffix = UserMsg({
    id: "wrong-suffix",
    name: "user",
    content: "旧后文",
  });
  const edited = UserMsg({
    id: "unloaded-target",
    name: "user",
    content: "另一标签页修改的问题",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [wrongSuffix, laterPrefix, loadedPrefix],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  const oldPlan = event(EventType.CUSTOM, {
    name: "state_updated",
    value: {
      tasks_context: {
        tasks: [{ id: "old-plan", subject: "旧计划", state: "completed" }],
      },
    },
  });
  receive(oldPlan);
  receive(
    event(EventType.CUSTOM, {
      name: "subagent_require_user_confirm",
      value: {
        worker_session_id: "old-worker",
        worker_agent_id: "expert",
        worker_agent_name: "专家",
        reply_id: "old-worker-reply",
        event_type: "require_user_confirm",
        event: { tool_calls: [] },
        created_at: new Date().toISOString(),
      },
    }),
  );
  chat.collaboratorProgress.value = new Map([
    [
      "worker",
      {
        worker_session_id: "worker",
        worker_agent_id: "expert",
        display_name: "专家",
        revision: 1,
        status: "completed",
        activities: [],
      },
    ],
  ]);
  const marker = event(EventType.CUSTOM, {
    name: "chat_history_rewritten",
    value: {
      message_id: edited.id,
      input: edited,
      retained_message_ids: [
        "not-loaded-prefix",
        "loaded-prefix",
        "later-prefix",
      ],
    },
  });
  receive(marker);
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "loaded-prefix",
    "later-prefix",
    "unloaded-target",
  ]);
  expect(chat.state.value.messages.at(-1)?.content[0]).toMatchObject({
    text: "另一标签页修改的问题",
  });
  expect(chat.state.value.isPreparing).toBe(true);
  expect(chat.hasMore.value).toBe(true);
  expect(chat.collaboratorProgress.value.size).toBe(0);
  expect(chat.state.value.plan).toBeUndefined();
  expect(chat.state.value.subagentConfirmations).toEqual([]);
  receive(oldPlan);
  expect(chat.state.value.plan).toBeUndefined();
  expect(mocks.history).toHaveBeenCalledTimes(1);
  const original = UserMsg({ id: edited.id, name: "user", content: "原问题" });
  receive(
    event(EventType.CUSTOM, {
      name: "chat_input_started",
      value: { queue_item: { input: original } },
    }),
  );
  expect(chat.state.value.messages.at(-1)?.content[0]).toMatchObject({
    text: "另一标签页修改的问题",
  });
  receive(
    event(EventType.CUSTOM, {
      name: "chat_input_started",
      value: { queue_item: { input: wrongSuffix } },
    }),
  );
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "loaded-prefix",
    "later-prefix",
    "unloaded-target",
  ]);
  receive(
    event(EventType.REPLY_START, {
      reply_id: "new",
      name: "Egis",
      role: "assistant",
    }),
  );
  receive(
    event(EventType.REPLY_END, {
      reply_id: "new",
      finished_reason: "completed",
    }),
  );
  receive(marker);
  expect(chat.state.value.phase).toBe("idle");
  expect(chat.state.value.messages.at(-1)?.id).toBe("new");
});

it("keeps an acknowledged rewrite if its POST response is lost", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const original = UserMsg({
    id: "selected",
    name: "user",
    content: "old prompt",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [original],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  mocks.trigger.mockImplementationOnce(async (_sid, _aid, input) => {
    receive(
      event(EventType.CUSTOM, {
        name: "chat_history_rewritten",
        value: { message_id: input.id, input, retained_message_ids: [] },
      }),
    );
    throw new Error("connection lost after commit");
  });
  expect(await chat.resend(original, "new prompt")).toBe(true);
  expect(chat.state.value.messages[0].content[0]).toMatchObject({
    text: "new prompt",
  });
  expect(chat.state.value.isPreparing).toBe(true);
  expect(chat.error.value).toBe("");
});

it("restores an earlier live steering input retained by the canonical marker", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const initial = UserMsg({ id: "initial", name: "user", content: "初始问题" });
  const first = UserMsg({
    id: "first-steer",
    name: "user",
    content: "保留的前一个引导",
    metadata: {
      agentkit_delivery: {
        kind: "steer",
        state: "received",
        hint_id: "first-hint",
      },
    },
  });
  const target = UserMsg({
    id: "target-steer",
    name: "user",
    content: "修改的引导",
    metadata: {
      agentkit_delivery: {
        kind: "steer",
        state: "received",
        hint_id: "target-hint",
      },
    },
  });
  mocks.history.mockResolvedValueOnce({
    messages: [initial],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  receive(
    event(EventType.REPLY_START, {
      reply_id: "containing-reply",
      name: "Egis",
      role: "assistant",
    }),
  );
  for (const [hintId, message] of [
    ["first-hint", first],
    ["target-hint", target],
  ] as const)
    receive(
      event(EventType.HINT_BLOCK, {
        reply_id: "containing-reply",
        block_id: hintId,
        source: "chat_input_steering",
        hint: "引导",
        user_message: message,
      }),
    );
  receive(
    event(EventType.REPLY_END, {
      reply_id: "containing-reply",
      finished_reason: "completed",
    }),
  );
  mocks.trigger.mockImplementationOnce(async (_sid, _aid, input) => {
    receive(
      event(EventType.CUSTOM, {
        name: "chat_history_rewritten",
        value: {
          message_id: input.id,
          input,
          retained_message_ids: ["initial", "first-steer"],
        },
      }),
    );
    return { status: "queued" };
  });
  expect(await chat.resend(target, "新的引导")).toBe(true);
  expect(chat.state.value.messages.map((m) => m.id)).toEqual([
    "initial",
    "first-steer",
    "target-steer",
  ]);
  expect(chat.hasMore.value).toBe(false);
});

it("retains a conflicting remote rewrite when the local resend is rejected", async () => {
  const { UserMsg } = await import("@agentscope-ai/agentscope/message");
  const original = UserMsg({
    id: "selected",
    name: "user",
    content: "old prompt",
  });
  mocks.history.mockResolvedValueOnce({
    messages: [original],
    has_more: false,
    is_running: false,
    event_cursor: "checkpoint",
  });
  await chat.open("s1");
  mocks.trigger.mockImplementationOnce(async () => {
    const remote = UserMsg({
      id: original.id,
      name: "user",
      content: "remote prompt",
    });
    receive(
      event(EventType.CUSTOM, {
        name: "chat_history_rewritten",
        value: {
          message_id: remote.id,
          input: remote,
          retained_message_ids: [],
        },
      }),
    );
    throw new Error("another tab started this turn");
  });
  expect(await chat.resend(original, "local prompt")).toBe(false);
  expect(chat.state.value.messages[0].content[0]).toMatchObject({
    text: "remote prompt",
  });
  expect(chat.error.value).toBe("another tab started this turn");
});

it("preserves a real expert terminal status against later progress for the same reply", async () => {
  await chat.open("s1");
  const progress = {
    worker_session_id: "worker",
    worker_agent_id: "expert",
    display_name: "专家",
    reply_id: "worker-reply",
    status: "completed",
    revision: 2,
    activities: [],
  };
  receive(
    event(EventType.CUSTOM, { name: "collaborator_progress", value: progress }),
  );
  receive(
    event(EventType.CUSTOM, {
      name: "collaborator_progress",
      value: { ...progress, status: "running", revision: 3 },
    }),
  );
  expect(chat.collaboratorProgress.value.get("worker")?.status).toBe(
    "completed",
  );
  receive(
    event(EventType.CUSTOM, {
      name: "collaborator_progress",
      value: {
        ...progress,
        reply_id: "next-reply",
        status: "running",
        revision: 4,
      },
    }),
  );
  expect(chat.collaboratorProgress.value.get("worker")?.status).toBe("running");
});

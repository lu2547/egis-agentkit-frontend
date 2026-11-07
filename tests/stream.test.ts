import { describe, expect, it } from "vitest";
import { SseDecoder } from "../src/api/stream";
import {
  ConversationEvents,
  SessionScope,
} from "../src/domain/agentEventReducer";
import { EventType, type AgentEvent } from "@agentscope-ai/agentscope/event";
const ev = (type: string, fields = {}): AgentEvent =>
  ({
    type,
    id: crypto.randomUUID(),
    created_at: "2026-11-03T00:00:00Z",
    reply_id: "r1",
    ...fields,
  }) as AgentEvent;
describe("native event reduction", () => {
  it("resumes an existing reply and deduplicates replayed deltas by event id", () => {
    const state = new ConversationEvents();
    state.apply(
      ev(EventType.REPLY_START, {
        name: "Egis",
        role: "assistant",
        session_id: "s1",
      }),
    );
    state.apply(ev(EventType.TEXT_BLOCK_START, { block_id: "b1" }));
    const delta = ev(EventType.TEXT_BLOCK_DELTA, {
      block_id: "b1",
      delta: "你好",
    });
    state.apply(delta);
    state.apply(delta);
    state.apply(
      ev(EventType.REPLY_START, {
        name: "Egis",
        role: "assistant",
        session_id: "s1",
      }),
    );
    state.apply(
      ev(EventType.TEXT_BLOCK_DELTA, { block_id: "b1", delta: "世界" }),
    );
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content[0]).toMatchObject({ text: "你好世界" });
  });
  it("routes overlapping replies by reply_id instead of the most recent message", () => {
    const state = new ConversationEvents();
    for (const id of ["a", "b"]) {
      state.apply(
        ev(EventType.REPLY_START, {
          reply_id: id,
          name: "Egis",
          role: "assistant",
          session_id: "s1",
        }),
      );
      state.apply(
        ev(EventType.TEXT_BLOCK_START, { reply_id: id, block_id: id }),
      );
    }
    state.apply(
      ev(EventType.TEXT_BLOCK_DELTA, {
        reply_id: "a",
        block_id: "a",
        delta: "first",
      }),
    );
    expect(state.messages[0].content[0]).toMatchObject({ text: "first" });
    expect(state.messages[1].content[0]).toMatchObject({ text: "" });
  });
  it("keeps native confirmation pending after history load", () => {
    const state = new ConversationEvents();
    state.apply(
      ev(EventType.REPLY_START, {
        name: "Egis",
        role: "assistant",
        session_id: "s1",
      }),
    );
    state.apply(
      ev(EventType.TOOL_CALL_START, {
        tool_call_id: "t1",
        tool_call_name: "write",
      }),
    );
    state.apply(ev(EventType.TOOL_CALL_END, { tool_call_id: "t1" }));
    state.apply(
      ev(EventType.REQUIRE_USER_CONFIRM, {
        tool_calls: [
          {
            id: "t1",
            type: "tool_call",
            name: "write",
            input: "{}",
            state: "asking",
            created_at: "2026-11-03T00:00:00Z",
          },
        ],
      }),
    );
    const restored = new ConversationEvents(state.messages);
    expect(restored.phase).toBe("waiting");
    restored.apply(
      ev(EventType.REPLY_END, {
        finished_reason: "interrupted",
        session_id: "s1",
      }),
    );
    expect(restored.phase).toBe("idle");
  });
});
describe("SSE transport framing", () => {
  it("handles CRLF, split CRLF, multiline data, heartbeats and split UTF-8", () => {
    const decoder = new SseDecoder();
    const bytes = new TextEncoder().encode(
      ': ping\r\nid: cursor-1\r\ndata: {"text":\r\ndata: "你好"}\r\n\r\n',
    );
    const frames = [];
    for (const byte of bytes)
      frames.push(...decoder.push(new Uint8Array([byte])));
    expect(frames).toEqual([{ id: "cursor-1", data: '{"text":\n"你好"}' }]);
  });
  it("retains incomplete frames without dispatching early", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(new TextEncoder().encode('data: {"a":1}\n'))).toEqual(
      [],
    );
    expect(decoder.push(new TextEncoder().encode("\n"))).toEqual([
      { data: '{"a":1}' },
    ]);
  });
});
describe("session ownership", () => {
  it("aborts the old request and rejects stale history after switching sessions", () => {
    const scope = new SessionScope();
    const first = scope.enter("s1");
    const second = scope.enter("s2");
    expect(first.signal.aborted).toBe(true);
    expect(scope.owns(first)).toBe(false);
    expect(scope.owns(second)).toBe(true);
    scope.dispose();
    expect(second.signal.aborted).toBe(true);
  });
});

it("publishes a fresh reply identity after native SDK mutation so Vue recomputes its blocks", () => {
  const state = new ConversationEvents();
  state.apply(
    ev(EventType.REPLY_START, {
      name: "Egis",
      role: "assistant",
      session_id: "s1",
    }),
  );
  const original = state.messages[0];
  state.apply(ev(EventType.TEXT_BLOCK_START, { block_id: "b1" }));
  expect(state.messages[0]).not.toBe(original);
  expect(state.messages[0].content).toHaveLength(1);
});

it("projects and clears a team member confirmation without creating a duplicate assistant reply", () => {
  const state = new ConversationEvents();
  const value = {
    worker_session_id: "worker-session",
    worker_agent_id: "worker-agent",
    worker_agent_name: "研究专家",
    reply_id: "worker-reply",
    event_type: "require_user_confirm",
    event: {
      tool_calls: [
        {
          id: "worker-tool",
          type: "tool_call",
          name: "write",
          input: "{}",
          state: "asking",
          created_at: "2026-11-03T00:00:00Z",
        },
      ],
    },
    created_at: "2026-11-03T00:00:00Z",
  };
  state.apply(
    ev(EventType.CUSTOM, { name: "subagent_require_user_confirm", value }),
  );
  state.apply(
    ev(EventType.CUSTOM, { name: "subagent_require_user_confirm", value }),
  );
  expect(state.subagentConfirmations).toHaveLength(1);
  expect(state.phase).toBe("waiting");
  expect(state.messages).toHaveLength(0);
  state.apply(
    ev(EventType.CUSTOM, {
      name: "subagent_user_confirm_result",
      value: { worker_session_id: "worker-session", reply_id: "worker-reply" },
    }),
  );
  expect(state.subagentConfirmations).toHaveLength(0);
  expect(state.phase).toBe("idle");
});

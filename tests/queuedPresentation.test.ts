import { expect, it } from "vitest";
import { UserMsg } from "@agentscope-ai/agentscope/message";
import type { AgentEvent } from "@agentscope-ai/agentscope/event";
import { ConversationEvents } from "../src/domain/agentEventReducer";

const pending = () =>
  UserMsg({
    id: "original-user",
    content: "橙蓝配色",
    metadata: {
      agentkit_delivery: {
        kind: "steer",
        state: "steering",
        queue_item_id: "queue",
        hint_id: "queue:0",
      },
    },
  });
const hint = () =>
  ({
    type: "HINT_BLOCK",
    reply_id: "reply",
    block_id: "queue:0",
    source: "chat_input_steering",
    hint: "橙蓝配色",
    created_at: new Date().toISOString(),
  }) as AgentEvent;
for (const early of [true, false]) {
  it(`keeps the original user identity when HintBlock arrives ${early ? "before" : "after"} queue presentation`, () => {
    const state = new ConversationEvents();
    if (early) state.apply(hint());
    state.addSteeringMessages([pending()]);
    if (!early) state.apply(hint());
    expect(
      state.messages
        .filter((message) => message.role === "user")
        .map((message) => message.id),
    ).toEqual(["original-user"]);
    expect(state.messages[0]?.metadata.agentkit_delivery).toMatchObject({
      state: "received",
      hint_id: "queue:0",
    });
  });
}
it("keeps the native steering-in-progress status without claiming receipt", () => {
  const state = new ConversationEvents();
  state.addSteeringMessages([pending()]);
  expect(state.messages[0]?.metadata.agentkit_delivery).toMatchObject({
    state: "steering",
  });
});

it("keeps a normal submitted message out of supplement delivery state", () => {
  const original = UserMsg({ id: "ordinary", content: "开始任务" });
  const state = new ConversationEvents([original]);
  state.syncQueuedMessages([
    {
      ...original,
      metadata: {
        agentkit_delivery: {
          kind: "steer",
          state: "queued",
          queue_item_id: "ordinary-queue",
          hint_id: "ordinary-queue:0",
        },
      },
    },
  ]);
  expect(state.messages[0]?.metadata.agentkit_delivery).toBeUndefined();
});
it("removes deleted queued supplements without removing native received messages", () => {
  const state = new ConversationEvents();
  state.syncQueuedMessages([pending()]);
  state.syncQueuedMessages([]);
  expect(state.messages).toHaveLength(0);
  state.addSteeringMessages([pending()]);
  state.apply(hint());
  state.syncQueuedMessages([]);
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]?.metadata.agentkit_delivery).toMatchObject({
    state: "received",
  });
});

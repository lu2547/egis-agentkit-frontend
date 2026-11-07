import { expect, it } from "vitest";
import { EventType, type AgentEvent } from "@agentscope-ai/agentscope/event";
import { ConversationEvents } from "../src/domain/agentEventReducer";

it("uses canonical native state events for plans even when tool history is absent", () => {
  const state = new ConversationEvents();
  state.apply({ type: EventType.CUSTOM, id: "plan-event", name: "state_updated", value: {
    tasks_context: { tasks: [{ id: "t1", subject: "核对数据", state: "in_progress" }] },
  } } as AgentEvent);
  expect(state.plan).toEqual([{ id: "t1", subject: "核对数据", state: "in_progress" }]);
  state.apply({ type: EventType.CUSTOM, id: "clear-plan", name: "state_updated", value: { tasks_context: { tasks: [] } } } as AgentEvent);
  expect(state.plan).toEqual([]);
  expect(new ConversationEvents().plan).toBeUndefined();
});

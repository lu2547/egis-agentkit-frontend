import type { Msg } from "@agentscope-ai/agentscope/message";
import type {
  AgentEvent,
  UserConfirmResultEvent,
} from "@agentscope-ai/agentscope/event";
import { http, json, requestRaw } from "./http";
import { SseDecoder } from "./stream";
const path = (sid: string) => `/sessions/${encodeURIComponent(sid)}`;
export interface History {
  messages: Msg[];
  event_cursor: string | null;
  is_running: boolean;
  has_more: boolean;
}
export interface ChatQueueItem {
  id: string;
  created_at: string;
  input: Msg | Msg[];
  state: "queued" | "steering" | "failed";
  error?: string | null;
}
export interface ChatQueue {
  items: ChatQueueItem[];
}
export interface ChatTrigger {
  status: "queued" | "started";
  session_id: string;
  queue_item_id?: string | null;
}
export const runtime = {
  status: (sid: string, agentId: string, signal: AbortSignal) =>
    http<{ status: string }>(
      `${path(sid)}/status`,
      { signal },
      { agent_id: agentId },
    ),
  queue: (sid: string, agentId: string, signal?: AbortSignal) =>
    http<ChatQueue>(
      "/chat/queue",
      { signal },
      { session_id: sid, agent_id: agentId },
    ),
  updateQueued: (
    sid: string,
    agentId: string,
    id: string,
    input: Msg | Msg[],
    signal?: AbortSignal,
  ) =>
    http<ChatQueue>(`/chat/queue/${encodeURIComponent(id)}`, {
      ...json("PATCH", { session_id: sid, agent_id: agentId, input }),
      signal,
    }),
  removeQueued: (
    sid: string,
    agentId: string,
    id: string,
    signal?: AbortSignal,
  ) =>
    http<ChatQueue>(
      `/chat/queue/${encodeURIComponent(id)}`,
      { method: "DELETE", signal },
      { session_id: sid, agent_id: agentId },
    ),
  reorderQueued: (
    sid: string,
    agentId: string,
    ids: string[],
    signal?: AbortSignal,
  ) =>
    http<ChatQueue>("/chat/queue/order", {
      ...json("PATCH", { session_id: sid, agent_id: agentId, item_ids: ids }),
      signal,
    }),
  steerQueued: (
    sid: string,
    agentId: string,
    id: string,
    replyId: string,
    signal?: AbortSignal,
  ) =>
    http<ChatQueue>(`/chat/queue/${encodeURIComponent(id)}/steer`, {
      ...json("POST", {
        session_id: sid,
        agent_id: agentId,
        reply_id: replyId,
      }),
      signal,
    }),
  history: (
    sid: string,
    agentId: string,
    signal: AbortSignal,
    before?: string,
  ) =>
    http<History>(
      `${path(sid)}/messages`,
      { signal },
      { agent_id: agentId, limit: 50, before },
    ),
  trigger: (
    sid: string,
    agentId: string,
    input: Msg | Msg[] | UserConfirmResultEvent | null,
    signal?: AbortSignal,
    replaceMessageId?: string,
  ) =>
    http<ChatTrigger>("/chat/", {
      ...json("POST", {
        agent_id: agentId,
        session_id: sid,
        input,
        ...(replaceMessageId ? { replace_message_id: replaceMessageId } : {}),
      }),
      signal,
    }),
  stop: (sid: string, agentId: string) =>
    http<unknown>(`${path(sid)}/interrupt`, json("POST", null), {
      agent_id: agentId,
    }),
  async stream(
    sid: string,
    agentId: string,
    signal: AbortSignal,
    after: string | null,
    onEvent: (event: AgentEvent) => void,
    onReady: () => void,
  ) {
    const response = await requestRaw(
      `${path(sid)}/stream`,
      { signal, headers: { Accept: "text/event-stream" } },
      { agent_id: agentId, after },
    );
    if (!response.body) throw new Error("事件流响应为空");
    const reader = response.body.getReader();
    const decoder = new SseDecoder();
    onReady();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of decoder.push(value))
          onEvent(JSON.parse(frame.data) as AgentEvent);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (!signal.aborted) throw new Error("事件连接已断开");
  },
};

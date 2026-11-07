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
export const runtime = {
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
    input: Msg | UserConfirmResultEvent | null,
    signal?: AbortSignal,
  ) =>
    http<unknown>("/chat/", {
      ...json("POST", { agent_id: agentId, session_id: sid, input }),
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

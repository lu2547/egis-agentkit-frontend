import { ref } from "vue";
import type { AgentEvent } from "@agentscope-ai/agentscope/event";
import { runtime } from "../api/runtime";
import { ApiError, errorText } from "../api/http";
/** One transport owner; reconnects from the history checkpoint, leaving native reduction to its caller. */
export function useChatStream() {
  const connection = ref<"connecting" | "connected" | "retrying" | "failed">(
      "connecting",
    ),
    error = ref("");
  let controller: AbortController | null = null,
    attempt: AbortController | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    resolveReady: (() => void) | null = null;
  let ready: Promise<void> = Promise.resolve(),
    run: (() => Promise<void>) | null = null;
  function stop() {
    controller?.abort();
    attempt?.abort();
    if (timer) clearTimeout(timer);
    timer = null;
    resolveReady?.();
    resolveReady = null;
  }
  function start(
    sid: string,
    agentId: string,
    signal: AbortSignal,
    after: string | null,
    onEvent: (event: AgentEvent) => void,
  ) {
    stop();
    controller = new AbortController();
    const owner = controller;
    signal.addEventListener("abort", () => owner.abort(), { once: true });
    ready = new Promise((resolve) => (resolveReady = resolve));
    connection.value = "connecting";
    error.value = "";
    run = async () => {
      if (owner.signal.aborted || signal.aborted) return;
      attempt?.abort();
      attempt = new AbortController();
      const request = attempt;
      const abort = () => request.abort();
      owner.signal.addEventListener("abort", abort, { once: true });
      try {
        await runtime.stream(
          sid,
          agentId,
          request.signal,
          after,
          (event) => {
            if (!owner.signal.aborted && !request.signal.aborted)
              onEvent(event);
          },
          () => {
            if (!owner.signal.aborted && !request.signal.aborted) {
              connection.value = "connected";
              error.value = "";
              resolveReady?.();
              resolveReady = null;
            }
          },
        );
      } catch (e) {
        if (owner.signal.aborted || request.signal.aborted) return;
        error.value = errorText(e);
        connection.value =
          e instanceof ApiError && [401, 403, 404].includes(e.status)
            ? "failed"
            : "retrying";
        if (connection.value === "retrying")
          timer = setTimeout(() => void run?.(), 2000);
        else {
          resolveReady?.();
          resolveReady = null;
        }
      } finally {
        owner.signal.removeEventListener("abort", abort);
      }
    };
    void run();
    return ready;
  }
  function retry() {
    if (timer) clearTimeout(timer);
    timer = null;
    void run?.();
  }
  return { connection, error, start, stop, retry, waitReady: () => ready };
}

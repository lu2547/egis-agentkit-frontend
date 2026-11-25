/** 引导使用原生用户消息，HintBlock 的同名 ID 表示模型已接收。 */
import { UserMsg, type Msg } from "@agentscope-ai/agentscope/message";

export const STEERING_SOURCE = "chat_input_steering";
export type SteeringState = "queued" | "steering" | "received" | "failed";
export function steeringState(message: Msg): SteeringState | undefined {
  const value = message.metadata?.agentkit_delivery;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.kind !== "steer"
  )
    return;
  return ["received", "steering", "failed"].includes(String(value.state))
    ? (value.state as SteeringState)
    : "queued";
}
export function withSteeringState(message: Msg, state: SteeringState): Msg {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      agentkit_delivery: {
        ...(message.metadata?.agentkit_delivery &&
        typeof message.metadata.agentkit_delivery === "object" &&
        !Array.isArray(message.metadata.agentkit_delivery)
          ? message.metadata.agentkit_delivery
          : {}),
        kind: "steer",
        state,
      },
    },
  };
}

/** 原生 HintBlock 随回复持久化；刷新时按同一个块 ID 恢复已接收的引导。 */
export function messageFromSteeringHint(block: {
  id: string;
  hint: unknown;
  created_at?: string;
}): Msg {
  return withSteeringState(
    UserMsg({
      id: block.id,
      name: "user",
      created_at: block.created_at,
      content:
        typeof block.hint === "string"
          ? block.hint
          : (block.hint as Msg["content"]),
    }),
    "received",
  );
}

/** 引导使用原生用户消息，HintBlock 的同名 ID 表示模型已接收。 */
import type { Msg } from "@agentscope-ai/agentscope/message";

export const STEERING_SOURCE = "user_steering";
export type SteeringState = "queued" | "received";
export function steeringState(message: Msg): SteeringState | undefined {
  const value = message.metadata?.agentkit_delivery;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.kind !== "steer"
  )
    return;
  return value.state === "received" ? "received" : "queued";
}
export function withSteeringState(message: Msg, state: SteeringState): Msg {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      agentkit_delivery: { kind: "steer", state },
    },
  };
}

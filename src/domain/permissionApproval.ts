import type { ToolCallBlock } from "@agentscope-ai/agentscope/message";
import { PermissionBehavior } from "@agentscope-ai/agentscope/permission";

export function sessionApprovalRules(tool: ToolCallBlock) {
  return (tool.suggested_rules ?? [])
    .filter(
      (rule) =>
        rule.tool_name === tool.name && rule.behavior === PermissionBehavior.ALLOW,
    )
    .map((rule) => ({ ...rule, source: "session" }));
}

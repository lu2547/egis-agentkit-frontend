import type {
  ContentBlock,
  Msg,
  ToolCallBlock,
  ToolResultBlock,
} from "@agentscope-ai/agentscope/message";

export type ActivityStatus =
  | "pending"
  | "waiting"
  | "running"
  | "success"
  | "error"
  | "interrupted"
  | "denied"
  | "incomplete";
export interface ProcessActivity {
  id: string;
  kind: "tool" | "thinking";
  title: string;
  rawName: string;
  summary: string;
  status: ActivityStatus;
  statusLabel: string;
  input: string;
  output: string;
}
export interface ActivityGroup {
  type: "activities";
  id: string;
  toolCount: number;
  items: ProcessActivity[];
}
export type ProcessEntry =
  ActivityGroup | { type: "text" | "hint"; id: string; text: string };

const toolTitles: Record<string, string> = {
  Read: "读取文件",
  Write: "写入文件",
  Edit: "修改文件",
  Glob: "查找文件",
  Grep: "搜索内容",
  Bash: "执行命令",
  PowerShell: "执行命令",
  WebSearch: "搜索网页",
  WebFetch: "读取网页",
  Skill: "使用技能",
  TeamSay: "联系团队成员",
};
function excerpt(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}
function bounded(value: string) {
  const limit = 65536;
  return value.length > limit
    ? value.slice(0, limit) + "\n… 内容较长，详情仅显示前 65,536 个字符。"
    : value;
}
function formattedInput(input: string) {
  try {
    return bounded(JSON.stringify(JSON.parse(input), null, 2));
  } catch {
    return bounded(input);
  }
}
function toolSummary(call: ToolCallBlock) {
  try {
    const input = JSON.parse(call.input) as Record<string, unknown>;
    if (typeof input.file_path === "string") {
      const filename = input.file_path.split(/[\\/]/).pop() || input.file_path;
      return excerpt(
        filename +
          (typeof input.pages === "string" ? ` · 第 ${input.pages} 页` : ""),
      );
    }
    for (const key of [
      "command",
      "query",
      "pattern",
      "url",
      "skill",
      "path",
      "to",
    ]) {
      if (typeof input[key] === "string") return excerpt(input[key]);
    }
  } catch {
    /* Incomplete streaming arguments have no stable summary yet. */
  }
  return "";
}
function readableOutput(result?: ToolResultBlock) {
  if (!result) return "";
  if (typeof result.output === "string") return bounded(result.output);
  return bounded(
    result.output
      .map((block) =>
        block.type === "text"
          ? block.text
          : `[附件：${block.name || block.source.media_type}]`,
      )
      .join("\n"),
  );
}
function toolStatus(
  message: Msg,
  call: ToolCallBlock,
  result?: ToolResultBlock,
): Pick<ProcessActivity, "status" | "statusLabel"> {
  const terminal = result?.state;
  if (terminal && terminal !== "running")
    return {
      status: terminal,
      statusLabel: {
        success: "已完成",
        error: "执行失败",
        interrupted: "已停止",
        denied: "已拒绝",
      }[terminal],
    };
  if (message.finished_at) {
    if (message.finished_reason === "interrupted")
      return { status: "interrupted", statusLabel: "已停止" };
    if (message.finished_reason === "error")
      return { status: "error", statusLabel: "执行失败" };
    return { status: "incomplete", statusLabel: "未返回结果" };
  }
  if (call.state === "asking")
    return { status: "waiting", statusLabel: "等待确认" };
  if (call.state === "submitted")
    return { status: "waiting", statusLabel: "等待外部执行" };
  if (result?.state === "running")
    return { status: "running", statusLabel: "执行中" };
  return {
    status: "pending",
    statusLabel: call.finished_at ? "等待执行" : "准备调用",
  };
}
function hintText(block: Extract<ContentBlock, { type: "hint" }>) {
  const value =
    typeof block.hint === "string"
      ? block.hint
      : block.hint
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
  return /<system-reminder(?:\s|>)/i.test(value) ? "" : value;
}

/** Derive an immutable display view; native SDK events and message ordering stay intact. */
export function presentTurn(message: Msg) {
  const results = new Map(
    message.content
      .filter((b): b is ToolResultBlock => b.type === "tool_result")
      .map((b) => [b.id, b]),
  );
  const visible = message.content.filter(
    (block) =>
      block.type === "tool_call" ||
      block.type === "thinking" ||
      (block.type === "text" && block.text.trim()) ||
      (block.type === "hint" && hintText(block).trim()),
  );
  // Text before a later tool/thinking block is commentary, not the answer.
  // Status hints are separate notes; a trailing hint must not hide the answer.
  let answerStart = visible.length;
  while (
    answerStart > 0 &&
    (visible[answerStart - 1]?.type === "text" ||
      visible[answerStart - 1]?.type === "hint")
  )
    answerStart--;
  const answer = visible
    .slice(answerStart)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
  const entries: ProcessEntry[] = [];
  const seenCalls = new Set<string>();
  let toolCount = 0;
  function appendActivity(activity: ProcessActivity) {
    let group = entries.at(-1);
    if (!group || group.type !== "activities") {
      group = {
        type: "activities",
        id: `group:${activity.id}`,
        toolCount: 0,
        items: [],
      };
      entries.push(group);
    }
    group.items.push(activity);
    if (activity.kind === "tool") {
      group.toolCount++;
      toolCount++;
    }
  }
  for (const block of visible.filter(
    (block, index) => index < answerStart || block.type === "hint",
  )) {
    if (block.type === "text")
      entries.push({ type: "text", id: block.id, text: block.text });
    else if (block.type === "hint")
      entries.push({ type: "hint", id: block.id, text: hintText(block) });
    else if (block.type === "thinking") {
      const done = !!(block.finished_at || message.finished_at);
      appendActivity({
        id: `thinking:${block.id}`,
        kind: "thinking",
        rawName: "thinking",
        title: done ? "已思考" : "思考中",
        summary: excerpt(block.thinking),
        status: done ? "success" : "running",
        statusLabel: done ? "已思考" : "思考中",
        input: "",
        output: bounded(block.thinking),
      });
    } else if (block.type === "tool_call" && !seenCalls.has(block.id)) {
      seenCalls.add(block.id);
      appendActivity({
        id: `tool:${block.id}`,
        kind: "tool",
        rawName: block.name,
        title: toolTitles[block.name] || block.name,
        summary: toolSummary(block),
        ...toolStatus(message, block, results.get(block.id)),
        input: formattedInput(block.input),
        output: readableOutput(results.get(block.id)),
      });
    }
  }
  const confirmations = message.finished_at
    ? []
    : message.content.filter(
        (b): b is ToolCallBlock =>
          b.type === "tool_call" && b.state === "asking" && !results.has(b.id),
      );
  return { entries, answer, toolCount, confirmations };
}

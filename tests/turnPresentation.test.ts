import { describe, expect, it } from "vitest";
import {
  AssistantMsg,
  type ContentBlock,
  type Msg,
  type ToolCallBlock,
  type ToolResultBlock,
} from "@agentscope-ai/agentscope/message";
import { presentTurn } from "../src/domain/turnPresentation";
const stamp = "2026-11-05T01:00:00Z";
const text = (id: string, value: string): ContentBlock => ({
  type: "text",
  id,
  text: value,
  created_at: stamp,
});
const thinking = (id: string, value = "检查输入"): ContentBlock => ({
  type: "thinking",
  id,
  thinking: value,
  created_at: stamp,
  finished_at: stamp,
});
const call = (id: string, name = "Read"): ToolCallBlock => ({
  type: "tool_call",
  id,
  name,
  input: JSON.stringify({
    file_path: "/workspace/含空格 文件.pdf",
    pages: "1-3",
  }),
  state: "finished",
  created_at: stamp,
  finished_at: stamp,
});
const result = (
  id: string,
  state: ToolResultBlock["state"] = "success",
): ToolResultBlock => ({
  type: "tool_result",
  id,
  name: "Read",
  state,
  output: "读取完成",
  created_at: stamp,
  finished_at: state === "running" ? null : stamp,
});
const message = (content: ContentBlock[], finished = true): Msg => ({
  ...AssistantMsg({ id: "r", name: "agent", content, created_at: stamp }),
  finished_at: finished ? stamp : null,
});
describe("native reply presentation", () => {
  it("shows a skill's readable name while its native call is still running", () => {
    const alias = "skill-0123456789abcdef0123456789abcdef_0123456789ab";
    const skillCall = {
      ...call("skill", "Skill"),
      input: JSON.stringify({ skill: alias }),
    };
    const msg = message([skillCall], false);
    expect(
      presentTurn(msg, new Map([[alias, "ppt-master"]])).entries[0],
    ).toMatchObject({ items: [{ summary: "ppt-master" }] });
    expect(presentTurn(msg).entries[0]).toMatchObject({
      items: [{ title: "使用技能", summary: "" }],
    });
    expect(skillCall.input).toContain(alias);
  });
  it("keeps commentary in order and groups adjacent tool calls despite out-of-order results", () => {
    const view = presentTurn(
      message([
        text("a", "先看文件"),
        thinking("thought"),
        call("one"),
        call("two", "Glob"),
        result("two"),
        result("one"),
        text("b", "再作校验"),
        call("three", "Bash"),
        result("three"),
        text("answer", "交付结果"),
      ]),
    );
    expect(view.entries.map((e) => e.type)).toEqual([
      "text",
      "activities",
      "text",
      "activities",
    ]);
    expect(view.toolCount).toBe(3);
    expect(view.entries[1]).toMatchObject({
      toolCount: 2,
      items: [
        { kind: "thinking" },
        { id: "tool:one", status: "success" },
        { id: "tool:two", status: "success" },
      ],
    });
    expect(view.entries[2]).toMatchObject({ text: "再作校验" });
    expect(view.answer).toBe("交付结果");
  });
  it("keeps all adjacent answer blocks instead of hiding the first part", () => {
    expect(
      presentTurn(message([text("a", "第一段"), text("b", "第二段")])).answer,
    ).toBe("第一段\n\n第二段");
  });
  it("does not hide the final answer when a status hint follows it", () => {
    const view = presentTurn(
      message([
        call("one"),
        result("one"),
        text("answer", "这是最终回答"),
        { type: "hint", id: "status", hint: "文件已保存", created_at: stamp },
      ]),
    );
    expect(view.answer).toBe("这是最终回答");
    expect(view.entries).toHaveLength(2);
    expect(view.entries[1]).toMatchObject({ type: "hint", text: "文件已保存" });
  });
  it("does not promote commentary preceding an active tool into the final answer", () => {
    const view = presentTurn(
      message(
        [text("a", "先读取文件"), call("one"), result("one", "running")],
        false,
      ),
    );
    expect(view.answer).toBe("");
    expect(view.entries[0]).toMatchObject({ type: "text", text: "先读取文件" });
  });
  it("does not cache a stale running label when the SDK updates the same result object", () => {
    const output = result("one", "running");
    const msg = message([call("one"), output], false);
    const before = presentTurn(msg);
    output.state = "success";
    output.finished_at = stamp;
    const after = presentTurn({ ...msg, content: [...msg.content] });
    expect(before.entries[0]).toMatchObject({
      items: [{ status: "running", statusLabel: "执行中" }],
    });
    expect(after.entries[0]).toMatchObject({
      items: [{ status: "success", statusLabel: "已完成" }],
    });
  });
  it.each([
    ["error", "执行失败"],
    ["denied", "已拒绝"],
    ["interrupted", "已停止"],
  ] as const)("uses the native %s terminal state", (state, label) => {
    expect(
      presentTurn(message([call("one"), result("one", state)])).entries[0],
    ).toMatchObject({ items: [{ statusLabel: label }] });
  });
  it("marks unfinished calls as stopped after interruption, without inventing success", () => {
    const stopped = {
      ...message([call("one"), result("one", "running")]),
      finished_reason: "interrupted" as const,
    };
    expect(presentTurn(stopped).entries[0]).toMatchObject({
      items: [{ status: "interrupted", statusLabel: "已停止" }],
    });
    expect(presentTurn(message([call("missing")])).entries[0]).toMatchObject({
      items: [{ status: "incomplete", statusLabel: "未返回结果" }],
    });
  });
  it("keeps actionable confirmations outside the process and clears them when the reply stops", () => {
    const waiting = call("one");
    waiting.state = "asking";
    const msg = message([waiting], false);
    expect(presentTurn(msg).confirmations).toHaveLength(1);
    expect(
      presentTurn({
        ...msg,
        finished_at: stamp,
        finished_reason: "interrupted",
      }).confirmations,
    ).toHaveLength(0);
  });
  it("filters internal reminders and uses readable details instead of serializing attachment data", () => {
    const out = result("one");
    out.output = [
      {
        type: "data",
        id: "d",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "SECRET_BINARY",
        },
        created_at: stamp,
      },
    ];
    const view = presentTurn(
      message([
        {
          type: "hint",
          id: "h",
          hint: "<system-reminder>internal</system-reminder>",
          created_at: stamp,
        },
        call("one"),
        out,
      ]),
    );
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]).toMatchObject({
      items: [{ title: "读取文件", summary: "含空格 文件.pdf · 第 1-3 页" }],
    });
    const serialized = JSON.stringify(view);
    expect(serialized).toContain("image/png");
    expect(serialized).not.toContain("SECRET_BINARY");
  });
});

import { expect, it } from "vitest";
import { UserMsg } from "@agentscope-ai/agentscope/message";
import { createAnnotatedMessage } from "../src/domain/textAnnotations";
import {
  editedUserMessage,
  userMessageText,
  canSendUserMessage,
} from "../src/domain/userMessageEditing";

it("edits visible prompt while retaining injected reference and annotation context and attachment bytes", () => {
  const message = createAnnotatedMessage(
    "原要求",
    [
      {
        kind: "file",
        id: "file",
        projectId: "project-1",
        path: "行动计划.md",
        name: "行动计划.md",
      },
    ],
    [
      {
        id: "note",
        messageId: "earlier",
        start: 0,
        end: 2,
        text: "原文",
        comment: "请解释",
      },
    ],
  );
  message.metadata.agentkit_delivery = { kind: "steer", state: "received" };
  message.content.push({
    id: "upload",
    type: "data",
    name: "附件",
    source: { type: "base64", media_type: "text/plain", data: "YWJj" },
    created_at: message.created_at,
  });
  const snapshot = JSON.stringify(message);
  const edited = editedUserMessage(message, "新要求");
  expect(userMessageText(message)).toBe("原要求");
  expect(userMessageText(edited)).toBe("新要求");
  expect(edited.id).toBe(message.id);
  expect(edited.content[0]).toMatchObject({
    text: expect.stringContaining("新要求\n\n【项目文件：行动计划.md】"),
  });
  expect(edited.content[0]).toMatchObject({
    text: expect.stringContaining("用户评论：请解释"),
  });
  expect(edited.content.at(-1)).toEqual(message.content.at(-1));
  expect(edited.metadata.text_annotations).toEqual(
    message.metadata.text_annotations,
  );
  expect(edited.metadata.project_file_references).toEqual(
    message.metadata.project_file_references,
  );
  expect(edited.metadata.agentkit_delivery).toBeUndefined();
  expect(JSON.stringify(message)).toBe(snapshot);
});

it("adds editable text to an attachment-only message and permits sending it without text", () => {
  const message = UserMsg({
    name: "user",
    content: [
      {
        id: "upload",
        type: "data",
        name: "附件",
        source: { type: "base64", media_type: "text/plain", data: "YWJj" },
        created_at: new Date().toISOString(),
      },
    ],
  });
  expect(userMessageText(message)).toBe("");
  expect(canSendUserMessage(message, "")).toBe(true);
  const edited = editedUserMessage(message, "新要求");
  expect(edited.content[0]).toMatchObject({ type: "text", text: "新要求" });
  expect(edited.content[1]).toEqual(message.content[0]);
});

it("replaces all ordinary visible text blocks and rejects a blank ordinary message", () => {
  const message = UserMsg({ name: "user", content: "第一段" });
  message.content.push({
    id: "second",
    type: "text",
    text: "第二段",
    created_at: message.created_at,
  });
  expect(userMessageText(message)).toBe("第一段\n\n第二段");
  expect(canSendUserMessage(message, "  ")).toBe(false);
  const edited = editedUserMessage(message, "合并的要求");
  expect(userMessageText(edited)).toBe("合并的要求");
  expect(edited.content.filter((block) => block.type === "text")).toHaveLength(
    1,
  );
});

it("preserves a reference-only prompt's context when adding text", () => {
  const message = createAnnotatedMessage(
    "",
    [
      {
        kind: "file",
        id: "file",
        projectId: "project-1",
        path: "行动计划.md",
        name: "行动计划.md",
      },
    ],
    [],
  );
  const edited = editedUserMessage(message, "看看这里");
  expect(edited.content[0]).toMatchObject({
    text: "看看这里\n\n【项目文件：行动计划.md】",
  });
  expect(canSendUserMessage(message, "")).toBe(true);
});

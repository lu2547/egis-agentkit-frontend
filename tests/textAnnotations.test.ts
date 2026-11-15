import { describe, it, expect } from "vitest";
import { UserMsg, AssistantMsg } from "@agentscope-ai/agentscope/message";
import {
  createAnnotatedMessage,
  getTextAnnotations,
  annotationThreads,
} from "../src/domain/textAnnotations";
const quote = {
  id: "quote-1",
  messageId: "source-1",
  start: 2,
  end: 6,
  text: "原文片段",
  comment: "确认了么？",
};
describe("conversation text annotations", () => {
  it("serializes source, comment and response markers in the native message", () => {
    const message = createAnnotatedMessage("解释一下", [], [quote]);
    expect(getTextAnnotations(message)).toEqual([quote]);
    expect(message.metadata.annotation_prompt).toBe("解释一下");
    expect(message.content.find((b) => b.type === "text")?.text).toContain(
      "[[annotation:1]]",
    );
    expect(message.content.find((b) => b.type === "text")?.text).toContain(
      "确认了么？",
    );
  });
  it("answers remove pending source marks without changing submitted comments", () => {
    const user = createAnnotatedMessage("", [], [quote]);
    const reply = AssistantMsg({
      name: "personal",
      content: "确认了 [[annotation:1]]",
    });
    expect(annotationThreads([user, reply])[0]?.answered).toBe(false);
    reply.finished_at = new Date().toISOString();
    expect(annotationThreads([user, reply])[0]?.answered).toBe(true);
    expect(getTextAnnotations(user)[0]?.comment).toBe("确认了么？");
  });
  it("does not treat unrelated metadata as an editable annotation", () => {
    const message = UserMsg({
      name: "user",
      content: "text",
      metadata: { text_annotations: [{ ...quote, start: -1 }, null] },
    });
    expect(getTextAnnotations(message)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  AssistantMsg,
  type Msg,
  type ContentBlock,
} from "@agentscope-ai/agentscope/message";
import {
  knowledgeSources,
  groupKnowledgeDocuments,
  safeKnowledgeFileUrl,
} from "../src/domain/knowledgeSources";
const stamp = "2026-11-16T01:00:00Z";
const citationId = "a".repeat(32) + "-1";
function reply(id = "reply-1", state = "success"): Msg {
  return AssistantMsg({
    id,
    name: "assistant",
    content: [
      {
        type: "tool_call",
        id: "call-1",
        name: "SearchKnowledge",
        input: "{}",
        state: "finished",
        created_at: stamp,
      },
      {
        type: "tool_result",
        id: "call-1",
        name: "SearchKnowledge",
        state,
        created_at: stamp,
        output: JSON.stringify({
          kind: "agentkit.knowledge_search.v1",
          query: "检索问题",
          label: "企业知识库",
          sources: [
            {
              citation_id: citationId,
              index: 1,
              document_id: "doc_1",
              title: "接口说明",
              knowledge_base: "接入规范",
              section: "认证",
              excerpt: "使用 Cookie",
              version: null,
            },
          ],
        }),
      },
    ] as ContentBlock[],
    created_at: stamp,
  });
}
describe("knowledge evidence from native replies", () => {
  it("restores source identity and preserves unknown versions", () => {
    const source = knowledgeSources(reply())[0]!;
    expect(source).toMatchObject({
      replyId: "reply-1",
      callId: "call-1",
      citationId,
      documentId: "doc_1",
      index: 1,
      version: undefined,
    });
    expect(groupKnowledgeDocuments([source, source])).toHaveLength(1);
  });
  it("ignores user text, failed results and unrelated calls", () => {
    expect(knowledgeSources({ ...reply(), role: "user" })).toEqual([]);
    expect(knowledgeSources(reply("r", "error"))).toEqual([]);
    const forged = reply();
    (forged.content[0] as any).name = "Read";
    expect(knowledgeSources(forged)).toEqual([]);
  });
  it("rejects executable and unapproved original-document links", () => {
    expect(() =>
      safeKnowledgeFileUrl(
        "javascript:alert(1)",
        "https://kb.example/knowledge",
        [],
      ),
    ).toThrow();
    expect(() =>
      safeKnowledgeFileUrl(
        "https://evil.example/a.pdf",
        "https://kb.example/knowledge",
        [],
      ),
    ).toThrow();
    expect(
      safeKnowledgeFileUrl(
        "https://files.example/a.pdf",
        "https://kb.example/knowledge",
        ["https://files.example"],
      ),
    ).toBe("https://files.example/a.pdf");
  });
});

it("groups the same document across searches while preserving both citation identities", async () => {
  const { groupKnowledgeExcerpts } =
    await import("../src/domain/knowledgeSources");
  const first = knowledgeSources(reply())[0]!;
  const second = {
    ...first,
    key: "reply-1:call-2:1",
    callId: "call-2",
    citationId: "b".repeat(32) + "-1",
  };
  const documents = groupKnowledgeDocuments([first, second]);
  expect(documents).toHaveLength(1);
  const excerpts = groupKnowledgeExcerpts(documents[0]!.sources);
  expect(excerpts).toHaveLength(1);
  expect(excerpts[0]!.citationIds).toEqual([
    first.citationId,
    second.citationId,
  ]);
});

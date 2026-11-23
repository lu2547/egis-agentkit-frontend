import { expect, it } from "vitest";
import {
  AssistantMsg,
  type ContentBlock,
  type ToolResultBlock,
} from "@agentscope-ai/agentscope/message";
import { replyKnowledgeReferences } from "../src/domain/turnPresentation";

const reference = {
  index: 1,
  source: "doc",
  title: "缴费说明",
  snippet: "核对当期清单。",
  kb: "年金库",
  kb_id: "kb-1",
  doc_id: "doc-1",
  node_id: "node-1",
  chunk: "chunk-1",
  ver: "v1",
};
const result = (
  id: string,
  references: unknown[],
  state = "success",
): ToolResultBlock => ({
  type: "tool_result",
  id,
  name: "KnowledgeBaseSearch",
  output: "检索完成",
  state: state as ToolResultBlock["state"],
  created_at: "2026-11-23T00:00:00Z",
  metadata: { knowledge_search: { references } },
});
const completed = (content: ContentBlock[], answer = "核对清单[1]。") => ({
  ...AssistantMsg({
    name: "agent",
    content: [
      ...content,
      {
        type: "text",
        id: "answer",
        text: answer,
        created_at: "2026-11-23T00:00:00Z",
      },
    ],
  }),
  finished_at: "2026-11-23T00:00:01Z",
});

it("collects successful knowledge references without changing native message data", () => {
  const other = {
    ...reference,
    index: 3,
    node_id: "node-2",
    chunk: "chunk-2",
    snippet: "另一段原文。",
  };
  const message = completed(
    [
      result("search-1", [reference]),
      result("search-2", [{ ...reference, index: 2 }, other]),
      result("failed", [{ ...reference, title: "失败来源" }], "error"),
      { ...result("other-tool", [reference]), name: "Read" },
    ],
    "核对清单[1]，另见补充说明[3]。",
  );
  const snapshot = JSON.stringify(message);
  expect(replyKnowledgeReferences(message)).toEqual([reference, other]);
  expect(JSON.stringify(message)).toBe(snapshot);
});

it("keeps replies and source versions separate", () => {
  const first = completed(
    [result("one", [reference, { ...reference, index: 2, ver: "v2" }])],
    "两个版本[1][2]。",
  );
  const second = completed([
    result("two", [{ ...reference, title: "转移说明", doc_id: "doc-2" }]),
  ]);
  expect(replyKnowledgeReferences(first)).toHaveLength(2);
  expect(replyKnowledgeReferences(second).map((item) => item.title)).toEqual([
    "转移说明",
  ]);
});

it("uses the last result for each tool call and ignores malformed reference entries", () => {
  const message = completed([
    result("same", [reference]),
    result("same", [null, { title: "缺少定位" }, { ...reference, index: 0 }]),
  ]);
  expect(replyKnowledgeReferences(message)).toEqual([]);
});

it("waits for the completed answer and only returns its explicitly cited sources", () => {
  const unused = {
    ...reference,
    index: 2,
    doc_id: "unused",
    title: "未引用文档",
  };
  const message = completed([result("search", [reference, unused])]);
  expect(replyKnowledgeReferences({ ...message, finished_at: null })).toEqual(
    [],
  );
  expect(replyKnowledgeReferences(message)).toEqual([reference]);
  expect(
    replyKnowledgeReferences(
      completed([result("search", [reference])], "回答未引用任何来源。"),
    ),
  ).toEqual([]);
});

it("does not treat process commentary, code examples or ordinary links as answer citations", () => {
  const content: ContentBlock[] = [
    {
      type: "text",
      id: "commentary",
      text: "先看来源[1]。",
      created_at: "2026-11-23T00:00:00Z",
    },
    {
      type: "tool_call",
      id: "search",
      name: "KnowledgeBaseSearch",
      input: "{}",
      state: "finished",
      created_at: "2026-11-23T00:00:00Z",
    },
    result("search", [reference]),
  ];
  expect(
    replyKnowledgeReferences(completed(content, "最终回答没有引用。")),
  ).toEqual([]);
  expect(
    replyKnowledgeReferences(
      completed(
        content,
        "代码示例：`[1]`\n\n```text\n[1]\n```\n\n[普通链接](https://example.com)",
      ),
    ),
  ).toEqual([]);
});

it("does not publish sources from interrupted or failed partial answers", () => {
  const message = completed([result("search", [reference])]);
  expect(
    replyKnowledgeReferences({ ...message, finished_reason: "interrupted" }),
  ).toEqual([]);
  expect(
    replyKnowledgeReferences({ ...message, finished_reason: "error" }),
  ).toEqual([]);
});

it("does not guess when separate searches reuse a citation number", () => {
  const other = {
    ...reference,
    doc_id: "transfer",
    title: "转移说明",
    snippet: "转移原文。",
  };
  const content = [
    result("search-1", [reference]),
    result("search-2", [other]),
  ];
  expect(replyKnowledgeReferences(completed(content))).toEqual([]);
  expect(
    replyKnowledgeReferences(
      completed(content, "根据《转移说明》，处理转移申请。"),
    ),
  ).toEqual([other]);
});

it("accepts grouped, footnote and full-width citation markers in the answer", () => {
  const other = {
    ...reference,
    index: 2,
    doc_id: "doc-2",
    title: "另一份文档",
  };
  const content = [result("search", [reference, other])];
  for (const answer of [
    "说明[1, 2]。",
    "说明[^1]、【2】。",
    "参考[缴费说明](#doc-1)和【2】。",
  ])
    expect(replyKnowledgeReferences(completed(content, answer))).toEqual([
      reference,
      other,
    ]);
});

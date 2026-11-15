import { afterEach, describe, expect, it, vi } from "vitest";
import { knowledgeDocumentUrl } from "../src/api/knowledge";
import type { KnowledgeReference } from "../src/domain/knowledgeSources";
const source: KnowledgeReference = {
  key: "r:c:1",
  citationId: "a".repeat(32) + "-1",
  replyId: "r",
  callId: "c",
  index: 1,
  documentId: "d1",
  title: "文档",
  knowledgeBase: "库",
  section: "",
  excerpt: "证据",
  query: "问题",
  label: "知识库",
};
afterEach(() => vi.unstubAllGlobals());
describe("knowledge original-document authentication", () => {
  it("keeps platform login when Java requires its own Cookie and never forwards the Bearer", async () => {
    const removeItem = vi.fn();
    vi.stubGlobal("sessionStorage", {
      getItem: () => "platform-token",
      removeItem,
    });
    vi.stubGlobal("window", {
      location: { origin: "http://app.example" },
      dispatchEvent: vi.fn(),
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            resolver_url: "/knowledge/query/documents/d1/raw",
            allowed_file_origins: [],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      knowledgeDocumentUrl("session", source, new AbortController().signal),
    ).rejects.toThrow("请先登录知识库");
    expect(removeItem).not.toHaveBeenCalled();
    expect(fetch.mock.calls[1]![1]).toMatchObject({
      credentials: "include",
      redirect: "error",
    });
    expect(fetch.mock.calls[1]![1].headers).toBeUndefined();
  });
  it("turns invalid Java envelopes into a useful error", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => "platform-token" });
    vi.stubGlobal("window", { location: { origin: "http://app.example" } });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              resolver_url: "/knowledge/query/documents/d1/raw",
              allowed_file_origins: [],
            }),
          ),
        )
        .mockResolvedValueOnce(new Response("null")),
    );
    await expect(
      knowledgeDocumentUrl("session", source, new AbortController().signal),
    ).rejects.toThrow("原始文档不可访问");
  });
});

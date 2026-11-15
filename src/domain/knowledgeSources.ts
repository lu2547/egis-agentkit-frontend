import type {
  Msg,
  ToolCallBlock,
  ToolResultBlock,
} from "@agentscope-ai/agentscope/message";

/** 引用身份来自成功工具结果；用户文字、HTML 和任意链接不能生成知识库引用。 */
export interface KnowledgeReference {
  key: string;
  citationId: string;
  replyId: string;
  callId: string;
  index: number;
  documentId?: string;
  title: string;
  knowledgeBase: string;
  section: string;
  excerpt: string;
  version?: string;
  score?: number;
  query: string;
  label: string;
}
export interface KnowledgeDocument {
  key: string;
  title: string;
  knowledgeBase: string;
  query: string;
  sources: KnowledgeReference[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown) => (typeof value === "string" ? value : "");

export function knowledgeSources(message: Msg): KnowledgeReference[] {
  if (message.role !== "assistant") return [];
  const calls = new Set(
    message.content
      .filter(
        (value): value is ToolCallBlock =>
          value.type === "tool_call" && value.name === "SearchKnowledge",
      )
      .map((value) => value.id),
  );
  const results = new Map(
    message.content
      .filter((value): value is ToolResultBlock => value.type === "tool_result")
      .map((value) => [value.id, value]),
  );
  const sources: KnowledgeReference[] = [];
  for (const callId of calls) {
    const result = results.get(callId);
    if (!result || result.state !== "success") continue;
    const text =
      typeof result.output === "string"
        ? result.output
        : result.output
            .filter((value) => value.type === "text")
            .map((value) => value.text)
            .join("\n");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    if (
      !record(data) ||
      data.kind !== "agentkit.knowledge_search.v1" ||
      !Array.isArray(data.sources)
    )
      continue;
    const seen = new Set<string>();
    for (const item of data.sources) {
      if (
        !record(item) ||
        !/^[a-f0-9]{32}-[1-9][0-9]*$/.test(string(item.citation_id)) ||
        !Number.isSafeInteger(item.index) ||
        Number(item.index) < 1 ||
        typeof item.title !== "string" ||
        typeof item.excerpt !== "string"
      )
        continue;
      const key = `${message.id}:${callId}:${item.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        key,
        citationId: String(item.citation_id),
        replyId: message.id,
        callId,
        index: Number(item.index),
        documentId: string(item.document_id) || undefined,
        title: item.title,
        knowledgeBase: string(item.knowledge_base),
        section: string(item.section),
        excerpt: item.excerpt,
        version: string(item.version) || undefined,
        score:
          typeof item.score === "number" &&
          Number.isFinite(item.score) &&
          item.score >= 0 &&
          item.score <= 1
            ? item.score
            : undefined,
        query: string(data.query),
        label: string(data.label),
      });
    }
  }
  return sources;
}

export function groupKnowledgeDocuments(
  sources: KnowledgeReference[],
): KnowledgeDocument[] {
  const groups = new Map<string, KnowledgeDocument>();
  for (const source of sources) {
    const key = `${source.replyId}:${source.documentId || source.key}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: source.title,
        knowledgeBase: source.knowledgeBase,
        query: source.query,
        sources: [],
      };
      groups.set(key, group);
    }
    if (!group.sources.some((value) => value.key === source.key))
      group.sources.push(source);
  }
  return [...groups.values()];
}

/** 相同文档片段跨查询只展示一次；所有引用 ID 保留为别名以支持定位。 */
export function groupKnowledgeExcerpts(sources: KnowledgeReference[]) {
  const excerpts = new Map<
    string,
    { source: KnowledgeReference; citationIds: string[] }
  >();
  for (const source of sources) {
    const key = JSON.stringify([
      source.documentId,
      source.section,
      source.excerpt,
      source.version,
    ]);
    const existing = excerpts.get(key);
    if (existing) existing.citationIds.push(source.citationId);
    else excerpts.set(key, { source, citationIds: [source.citationId] });
  }
  return [...excerpts.values()];
}

export function safeKnowledgeFileUrl(
  value: string,
  resolver: string,
  origins: string[],
): string {
  const base = new URL(resolver);
  const url = new URL(value, base);
  const allowed = new Set([base.origin, ...origins]);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !allowed.has(url.origin)
  )
    throw new Error("知识库返回了未批准的原件地址");
  return url.href;
}

/** 只在已净化的正文 Text 节点中替换已验证来源，不改代码、链接或属性。 */
export function renderKnowledgeCitations(
  html: string,
  sources: KnowledgeReference[],
): string {
  if (!sources.length) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()))
    if (!current.parentElement?.closest("a,pre,code"))
      nodes.push(current as Text);
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of node.data.matchAll(
      /\[\[kb:([a-f0-9]{32}-[1-9][0-9]*)\]\]/g,
    )) {
      const source = sources.find((value) => value.citationId === match[1]);
      if (!source) continue;
      fragment.append(node.data.slice(offset, match.index));
      const anchor = document.createElement("a");
      anchor.href = "#kb-" + source.citationId;
      anchor.className = "knowledge-citation";
      const documentIndex = groupKnowledgeDocuments(sources).findIndex(
        (document) =>
          document.sources.some((value) => value.key === source.key),
      );
      anchor.textContent = `[${documentIndex + 1}]`;
      anchor.title = source.title;
      fragment.append(anchor);
      offset = match.index! + match[0].length;
    }
    if (offset) {
      fragment.append(node.data.slice(offset));
      node.replaceWith(fragment);
    }
  }
  return template.innerHTML;
}

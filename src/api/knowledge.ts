import { http } from "./http";
import {
  safeKnowledgeFileUrl,
  type KnowledgeReference,
} from "../domain/knowledgeSources";

export interface KnowledgeBaseCard {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
}

/** Java 应用范围与当前平台用户授权的交集；无权访问的库不会进入页面。 */
export function knowledgeBases() {
  return http<{ enabled: boolean; label: string; items: KnowledgeBaseCard[] }>(
    "/manager/knowledge/bases",
  );
}

/** 平台只鉴权已保存回复来源；原文解析请求使用知识库自己的 Cookie，不发送平台 Bearer。 */
export async function knowledgeDocumentUrl(
  sessionId: string,
  source: KnowledgeReference,
  signal: AbortSignal,
): Promise<string> {
  const path = `/manager/tasks/${encodeURIComponent(sessionId)}/replies/${encodeURIComponent(source.replyId)}/knowledge/${encodeURIComponent(source.callId)}/${source.index}/document`;
  const entry = await http<{
    resolver_url: string;
    allowed_file_origins: string[];
  }>(path, { signal });
  const resolver = new URL(entry.resolver_url, window.location.origin);
  const response = await fetch(resolver, {
    credentials: "include",
    signal,
    redirect: "error",
  });
  if (response.status === 401)
    throw new Error("请先登录知识库后重试；平台登录不受影响。");
  if (!response.ok) throw new Error("知识库暂时无法打开原始文档，请稍后重试。");
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("知识库原文入口响应无法解析。");
  }
  const result = envelope as { code?: number; data?: { url?: unknown } };
  if (
    !result ||
    typeof result !== "object" ||
    result.code !== 0 ||
    typeof result.data?.url !== "string"
  )
    throw new Error("原始文档不可访问或权限已变化。");
  return safeKnowledgeFileUrl(
    result.data.url,
    resolver.href,
    entry.allowed_file_origins,
  );
}

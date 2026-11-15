<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from "vue";
import {
  BookOpen,
  FileText,
  ExternalLink,
  Quote,
  ArrowLeft,
} from "lucide-vue-next";
import {
  groupKnowledgeDocuments,
  groupKnowledgeExcerpts,
  type KnowledgeReference,
} from "../../domain/knowledgeSources";
import { knowledgeDocumentUrl } from "../../api/knowledge";
import { errorText } from "../../api/http";

const props = defineProps<{
  sessionId?: string;
  sources: KnowledgeReference[];
  selectedCitation?: string;
}>();
const activeId = ref("");
const selected = computed(() =>
  props.sources.find((source) => source.citationId === activeId.value),
);
const documents = computed(() =>
  groupKnowledgeDocuments(
    props.sources.filter(
      (source) => source.replyId === selected.value?.replyId,
    ),
  ),
);
const activeDocument = computed(() =>
  documents.value.find((document) =>
    document.sources.some((source) => source.citationId === activeId.value),
  ),
);
const excerpts = computed(() =>
  groupKnowledgeExcerpts(activeDocument.value?.sources || []),
);
const rawUrl = ref(""),
  loading = ref(false),
  error = ref("");
let controller: AbortController | null = null;
watch(
  () => [
    props.sessionId,
    props.selectedCitation,
    props.sources.map((source) => source.key).join("|"),
  ],
  () => {
    const requested = props.sources.find(
      (source) => source.citationId === props.selectedCitation,
    );
    if (requested) activeId.value = requested.citationId;
    else if (
      !props.sources.some((source) => source.citationId === activeId.value)
    )
      activeId.value = props.sources.at(-1)?.citationId || "";
  },
  { immediate: true },
);
watch(
  () => [props.sessionId, activeId.value],
  () => {
    controller?.abort();
    rawUrl.value = "";
    error.value = "";
    loading.value = false;
  },
);
onScopeDispose(() => controller?.abort());
async function openDocument() {
  const source = selected.value,
    sessionId = props.sessionId;
  if (!source || !sessionId) return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  error.value = "";
  try {
    const url = await knowledgeDocumentUrl(sessionId, source, signal);
    if (!signal.aborted) rawUrl.value = url;
  } catch (value) {
    if (!signal.aborted) error.value = errorText(value);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}
</script>
<template>
  <section class="knowledge-panel" aria-label="知识库来源">
    <div v-if="!documents.length" class="knowledge-empty">
      <BookOpen :size="30" />
      <h3>回答的依据会显示在这里</h3>
      <p>助手检索知识库后，你可以查看相关文档、章节和命中原文。</p>
    </div>
    <template v-else>
      <div class="knowledge-heading">
        <BookOpen :size="17" />
        <h3>知识来源</h3>
        <span>{{ documents.length }} 份文档</span>
      </div>
      <p class="knowledge-query">{{ selected?.query }}</p>
      <div class="knowledge-document-list" aria-label="相关文档">
        <button
          v-for="(document, documentIndex) in documents"
          :key="document.key"
          type="button"
          :class="{ active: activeDocument?.key === document.key }"
          @click="activeId = document.sources[0]!.citationId"
        >
          <FileText :size="19" class="document-icon" />
          <span class="document-copy"
            ><strong>{{ document.title }}</strong
            ><small>{{ document.knowledgeBase || "知识库文档" }}</small></span
          >
          <span class="document-citations">[{{ documentIndex + 1 }}]</span>
        </button>
      </div>
      <article
        v-if="selected && activeDocument"
        class="knowledge-document"
        aria-label="引用文档内容"
      >
        <header>
          <div>
            <h3>{{ activeDocument.title }}</h3>
            <p>
              {{ selected.knowledgeBase
              }}<span v-if="selected.version"> · {{ selected.version }}</span>
            </p>
          </div>
          <button
            v-if="selected.documentId"
            class="knowledge-original"
            type="button"
            :disabled="loading"
            @click="openDocument"
          >
            <ExternalLink :size="14" />{{
              loading ? "正在打开" : "查看当前原文"
            }}
          </button>
        </header>
        <p v-if="error" class="knowledge-error" role="alert">{{ error }}</p>
        <template v-if="rawUrl"
          ><div class="knowledge-preview-toolbar">
            <button type="button" @click="rawUrl = ''">
              <ArrowLeft :size="14" />返回引用片段</button
            ><a :href="rawUrl" target="_blank" rel="noopener noreferrer"
              >新窗口打开<ExternalLink :size="13"
            /></a>
          </div>
          <iframe
            class="knowledge-original-frame"
            :src="rawUrl"
            :title="activeDocument.title + ' 原始文档'"
            sandbox="allow-same-origin"
            referrerpolicy="no-referrer"
        /></template>
        <template v-else>
          <p class="knowledge-excerpt-label">
            <Quote :size="14" />检索命中原文
          </p>
          <section
            v-for="(entry, excerptIndex) in excerpts"
            :key="entry.source.key"
            class="knowledge-excerpt"
            :class="{ 'is-selected': entry.citationIds.includes(activeId) }"
            :data-citation-id="entry.source.citationId"
            @click="activeId = entry.source.citationId"
          >
            <div class="knowledge-excerpt-heading">
              <span class="knowledge-index">{{ excerptIndex + 1 }}</span>
              <h4>{{ entry.source.section || "文档片段" }}</h4>
            </div>
            <p>
              {{
                entry.source.excerpt ||
                "此来源未返回片段正文，可尝试查看当前原文。"
              }}
            </p>
          </section>
          <p class="knowledge-source-note">
            引用片段来自本次检索。原文入口打开知识库当前文件，访问权限由知识库校验。
          </p>
        </template>
      </article>
    </template>
  </section>
</template>
<style scoped>
.knowledge-panel {
  padding: 22px 22px 32px;
  color: var(--text);
  overflow: auto;
  min-height: 0;
}
.knowledge-heading {
  display: flex;
  align-items: center;
  gap: 9px;
}
.knowledge-heading h3 {
  font-size: 15px;
  margin: 0;
  font-weight: 600;
}
.knowledge-heading > span {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.knowledge-query {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  margin: 12px 0 20px;
  overflow-wrap: anywhere;
}
.knowledge-document-list {
  display: grid;
  gap: 8px;
  margin-bottom: 24px;
}
.knowledge-document-list > button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--bg);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.knowledge-document-list > button:hover,
.knowledge-document-list > button.active {
  background: var(--surface);
  border-color: var(--border-hover);
}
.document-icon {
  color: var(--muted);
  flex: none;
}
.document-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.document-copy strong {
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  font-weight: 550;
}
.document-copy small {
  font-size: 12px;
  color: var(--muted);
}
.document-citations {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--muted);
}
.knowledge-document {
  border-top: 1px solid var(--border);
  padding-top: 20px;
}
.knowledge-document > header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 22px;
}
.knowledge-document > header > div {
  flex: 1;
  min-width: 0;
}
.knowledge-document h3 {
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  margin: 0 0 6px;
}
.knowledge-document header p {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}
.knowledge-original {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg);
  color: var(--text);
  padding: 7px 9px;
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.knowledge-original:disabled {
  opacity: 0.5;
}
.knowledge-excerpt-label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 14px;
}
.knowledge-excerpt {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}
.knowledge-excerpt-heading {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.knowledge-index {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 21px;
  height: 21px;
  font-size: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  flex: none;
}
.knowledge-excerpt h4 {
  font-size: 12px;
  line-height: 1.6;
  font-weight: 550;
  color: var(--muted);
  margin: 0;
}
.knowledge-excerpt > p {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 12px 0 0;
}
.knowledge-excerpt.is-selected .knowledge-index {
  color: var(--text);
  border-color: var(--border-hover);
}
.knowledge-source-note {
  font-size: 11px;
  line-height: 1.8;
  color: var(--muted);
  margin: 20px 0 0;
}
.knowledge-error {
  font-size: 12px;
  line-height: 1.7;
  color: var(--danger, #c04545);
  background: var(--surface);
  border-radius: 8px;
  padding: 12px;
}
.knowledge-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  gap: 12px;
  margin-bottom: 12px;
}
.knowledge-preview-toolbar button,
.knowledge-preview-toolbar a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: none;
  color: var(--muted);
  text-decoration: none;
  cursor: pointer;
}
.knowledge-original-frame {
  width: 100%;
  height: 65vh;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}
.knowledge-empty {
  padding: 80px 24px;
  text-align: center;
  color: var(--muted);
}
.knowledge-empty svg {
  margin-bottom: 18px;
}
.knowledge-empty h3 {
  font-size: 15px;
  font-weight: 550;
  color: var(--text);
}
.knowledge-empty p {
  font-size: 13px;
  line-height: 1.8;
  max-width: 280px;
  margin: 12px auto;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
</style>

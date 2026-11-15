<script setup lang="ts">
import { BookOpen, ChevronRight } from "lucide-vue-next";
import {
  groupKnowledgeDocuments,
  type KnowledgeReference,
} from "../../domain/knowledgeSources";
import { computed } from "vue";
const props = defineProps<{ sources: KnowledgeReference[] }>();
const documents = computed(() => groupKnowledgeDocuments(props.sources));
defineEmits<{ open: [source: KnowledgeReference] }>();
</script>
<template>
  <div
    v-if="documents.length"
    class="reply-knowledge-sources"
    aria-label="回答引用来源"
  >
    <span><BookOpen :size="13" />参考来源</span
    ><button
      v-for="(document, documentIndex) in documents"
      :key="document.key"
      type="button"
      @click="$emit('open', document.sources[0]!)"
    >
      <span class="source-number">[{{ documentIndex + 1 }}]</span
      >{{ document.title }}<ChevronRight :size="13" />
    </button>
  </div>
</template>
<style scoped>
.reply-knowledge-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 18px 0 8px;
  font-size: 12px;
}
.reply-knowledge-sources > span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--muted);
  margin-right: 2px;
}
.reply-knowledge-sources > button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 7px 10px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.reply-knowledge-sources > button:hover {
  border-color: var(--border-hover);
}
.reply-knowledge-sources > button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.source-number {
  color: var(--muted);
  font-size: 11px;
}
</style>

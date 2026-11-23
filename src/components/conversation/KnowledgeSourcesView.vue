<script setup lang="ts">
import { FileText, BookOpen } from "lucide-vue-next";
import type { KnowledgeReference } from "../../domain/turnPresentation";

defineProps<{ references: KnowledgeReference[] }>();
</script>

<template>
  <section
    class="knowledge-sources-view"
    aria-labelledby="knowledge-sources-title"
  >
    <header class="sources-header">
      <h2 id="knowledge-sources-title">
        引用来源 <span>({{ references.length }})</span>
      </h2>
    </header>
    <div
      v-if="references.length"
      class="sources-scroll"
      tabindex="0"
      aria-label="引用来源列表"
    >
      <article
        v-for="(reference, index) in references"
        :key="index"
        class="source-item"
      >
        <p class="source-origin">
          <component
            :is="reference.source === 'wiki' ? BookOpen : FileText"
            :size="14"
            aria-hidden="true"
          />
          <span>{{
            reference.kb || (reference.source === "wiki" ? "Wiki" : "文档")
          }}</span>
        </p>
        <h3>{{ reference.title }}</h3>
        <p v-if="reference.snippet" class="source-snippet">
          {{ reference.snippet }}
        </p>
      </article>
    </div>
    <p v-else class="sources-empty">该回答暂无引用来源。</p>
  </section>
</template>

<style scoped src="../../styles/components/knowledge-sources-view.css"></style>

<script setup lang="ts">
import { onMounted } from "vue";
import { knowledgeBases } from "../api/knowledge";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import AppIcon from "../components/common/AppIcon.vue";

const { data, loading, error, load } = useAsyncData(knowledgeBases);
onMounted(load);
</script>

<template>
  <section class="knowledge-page">
    <header>
      <div>
        <p class="eyebrow">{{ data?.label || "企业知识库" }}</p>
        <h1>知识库</h1>
        <p>直接向助手提问，回答旁会显示检索到的文档与依据。</p>
      </div>
      <RouterLink to="/" class="ask-link"
        >向助手提问 <span aria-hidden="true">↗</span></RouterLink
      >
    </header>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      :empty-title="
        data?.enabled ? '暂无获准访问的知识库' : '知识库接入尚未启用'
      "
      empty-text="获得知识库授权后，你可以在这里查看并让助手检索。"
      @retry="load"
    >
      <div class="knowledge-grid">
        <article v-for="base in data?.items" :key="base.id">
          <div class="book-icon"><AppIcon name="book" :size="24" /></div>
          <div>
            <h2>{{ base.name }}</h2>
            <p>{{ base.description || "在对话中检索这个知识库的文档。" }}</p>
            <small v-if="base.category">{{ base.category }}</small>
          </div>
        </article>
      </div>
    </AsyncState>
  </section>
</template>

<style scoped>
.knowledge-page {
  max-width: 1160px;
  margin: 0 auto;
  padding: 48px 36px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 36px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.04em;
}
h1 {
  font-size: 30px;
  margin: 8px 0 12px;
}
header p,
article p,
small {
  color: var(--muted);
}
.ask-link {
  flex-shrink: 0;
  padding: 12px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  color: var(--text);
}
.ask-link span {
  margin-left: 16px;
}
.knowledge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
article {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
}
.book-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  background: var(--hover);
  border-radius: 16px;
}
h2 {
  font-size: 18px;
  margin: 2px 0 10px;
}
article p {
  margin: 0;
  line-height: 1.65;
  font-size: 14px;
}
small {
  display: inline-block;
  margin-top: 14px;
  font-size: 12px;
}
@media (max-width: 600px) {
  .knowledge-page {
    padding: 28px 20px;
  }
  header {
    align-items: flex-start;
    flex-direction: column;
  }
  .knowledge-grid {
    grid-template-columns: 1fr;
  }
}
</style>

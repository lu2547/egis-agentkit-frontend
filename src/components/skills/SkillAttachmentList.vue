<script setup lang="ts">
import { computed, ref, watch } from "vue";
const props = defineProps<{
  files: { path: string; size: number }[];
  version: string;
}>();
const query = ref(""),
  page = ref(0);
const files = computed(() =>
  props.files.filter((file) => file.path !== "SKILL.md"),
);
const filtered = computed(() =>
  files.value.filter((file) =>
    file.path.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
  ),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / 50)),
);
const visible = computed(() =>
  filtered.value.slice(page.value * 50, (page.value + 1) * 50),
);
watch([query, () => props.files], () => {
  page.value = 0;
});
</script>
<template>
  <section class="skill-attachments" aria-label="技能附件">
    <h2>保留的附件 · {{ files.length }}</h2>
    <p class="skill-help">
      发布时保留 {{ version }} 的脚本、参考资料和其他附件。
    </p>
    <template v-if="files.length">
      <input
        v-model="query"
        type="search"
        class="attachment-search"
        aria-label="搜索技能附件"
        placeholder="搜索附件路径"
      />
      <ul>
        <li v-for="file in visible" :key="file.path">
          {{ file.path }} <span class="muted">{{ file.size }} B</span>
        </li>
      </ul>
      <p v-if="!filtered.length" class="skill-help">没有匹配的附件。</p>
      <nav
        v-if="filtered.length > 50"
        class="attachment-pages"
        aria-label="附件分页"
      >
        <button type="button" :disabled="!page" @click="page--">上一页</button>
        <span
          >{{ page + 1 }} / {{ pageCount }} · {{ filtered.length }} 个附件</span
        >
        <button type="button" :disabled="page + 1 >= pageCount" @click="page++">
          下一页
        </button>
      </nav>
    </template>
    <p v-else class="skill-help">这个版本没有附加文件。</p>
  </section>
</template>
<style scoped src="../../styles/components/skill-attachments.css"></style>

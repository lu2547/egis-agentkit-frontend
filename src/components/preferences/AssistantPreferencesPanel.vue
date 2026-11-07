<script setup lang="ts">
import { computed, reactive, watch, ref, useId } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{
  documents: { agent_md: string; soul_md: string; user_md: string };
}>();
type DocumentKey = keyof typeof props.documents;
const values = reactive({ ...props.documents }),
  tab = ref<DocumentKey>("agent_md"),
  pending = ref(false),
  error = ref(""),
  notice = ref("");
watch(
  () => props.documents,
  (v) => Object.assign(values, v),
);
const tabs = [
  {
    key: "agent_md",
    title: "工作范围",
    file: "agent.md",
    description: "约定助理负责的工作范围、工作流程和交付规范。",
  },
  {
    key: "soul_md",
    title: "决策风格",
    file: "soul.md",
    description: "约定助理的决策方式、语气风格和协作习惯。",
  },
  {
    key: "user_md",
    title: "业务背景",
    file: "user.md",
    description: "补充助理需要了解的业务背景和个人偏好。",
  },
] as const;
const panelId = useId();
const current = computed(() => tabs.find((item) => item.key === tab.value)!);
function navigateTabs(event: KeyboardEvent) {
  const index = tabs.findIndex((item) => item.key === tab.value);
  const next =
    event.key === "ArrowRight"
      ? (index + 1) % tabs.length
      : event.key === "ArrowLeft"
        ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
  if (next < 0) return;
  event.preventDefault();
  tab.value = tabs[next]!.key;
  (event.currentTarget as HTMLElement)
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [next]?.focus();
}
async function save() {
  if (pending.value) return;
  pending.value = true;
  error.value = "";
  notice.value = "";
  try {
    await manager.savePreferences({ ...values });
    notice.value = "个人助理设置已保存。";
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="preferences">
    <div
      class="document-tabs"
      role="tablist"
      aria-label="个人助理配置文件"
      @keydown="navigateTabs"
    >
      <button
        v-for="item in tabs"
        :key="item.key"
        :class="{ active: tab === item.key }"
        :id="`${panelId}-${item.key}`"
        type="button"
        role="tab"
        :aria-selected="tab === item.key"
        :aria-controls="panelId"
        :tabindex="tab === item.key ? 0 : -1"
        @click="tab = item.key"
      >
        <span>{{ item.file }}</span
        ><small>{{ item.title }}</small>
      </button>
    </div>
    <form class="document-panel" @submit.prevent="save">
      <div
        class="document-content"
        :id="panelId"
        role="tabpanel"
        :aria-labelledby="`${panelId}-${tab}`"
      >
        <p class="document-description">{{ current.description }}</p>
        <textarea
          class="document-editor"
          v-model="values[tab]"
          :aria-label="current.file"
          :placeholder="`编辑 ${current.file}，支持 Markdown`"
          spellcheck="false"
          :disabled="pending"
        ></textarea>
      </div>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <div v-if="notice" class="saved" role="status">{{ notice }}</div>
      <div class="form-actions">
        <t-button theme="primary" type="submit" :loading="pending"
          >保存设置</t-button
        >
      </div>
    </form>
  </div>
</template>
<style
  scoped
  src="../../styles/components/AssistantPreferencesPanel.css"
></style>

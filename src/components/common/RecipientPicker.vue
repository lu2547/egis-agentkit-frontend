<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { errorText } from "../../api/http";
import { manager, type AdminPage } from "../../api/manager";
import type {
  PrincipalType,
  ShareRecipient,
  ShareTarget,
} from "../../types/api";

withDefaults(defineProps<{ label?: string; disabled?: boolean }>(), {
  label: "接收对象",
});
const target = defineModel<ShareTarget | null>({ required: true });
const typeLabelId = useId();
const principalType = ref<PrincipalType>("user");
const expanded = ref(false);
const query = ref("");
const page = ref(1);
const result = ref<AdminPage<ShareRecipient>>();
const selectedLabel = ref("");
const loading = ref(false);
const error = ref("");
const typeLabel = computed(() =>
  principalType.value === "user" ? "用户" : "用户组",
);
const options = computed(() =>
  (result.value?.items ?? []).map(({ principal_id: value, display_name }) => ({
    value,
    label: display_name === value ? value : `${display_name} · ${value}`,
  })),
);

watch(principalType, () => {
  expanded.value = false;
  target.value = null;
  selectedLabel.value = "";
  query.value = "";
  page.value = 1;
  result.value = undefined;
});

watch(
  [expanded, principalType, query, page],
  ([visible, type, keyword, number], _, onCleanup) => {
    if (!visible) return;
    const controller = new AbortController();
    result.value = undefined;
    error.value = "";
    loading.value = true;
    const timer = setTimeout(async () => {
      try {
        const response = await manager.searchRecipients(
          type,
          keyword,
          number,
          controller.signal,
        );
        if (!controller.signal.aborted) result.value = response;
      } catch (failure) {
        if (!controller.signal.aborted) error.value = errorText(failure);
      } finally {
        if (!controller.signal.aborted) loading.value = false;
      }
    }, keyword ? 180 : 0);
    onCleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
  },
);

function openOptions(visible: boolean) {
  expanded.value = visible;
  if (visible) {
    query.value = "";
    page.value = 1;
  }
}

function search(value: string) {
  if (!expanded.value) return;
  query.value = value.trim().slice(0, 128);
  page.value = 1;
}

function select(value: unknown) {
  const option = options.value.find((entry) => entry.value === value);
  selectedLabel.value = option?.label ?? "";
  target.value = option
    ? {
        principal_type: principalType.value,
        principal_id: option.value,
      }
    : null;
}
</script>

<template>
  <div class="field">
    <label :id="typeLabelId">对象类型</label>
    <t-radio-group
      v-model="principalType"
      :aria-labelledby="typeLabelId"
      variant="default-filled"
      :disabled="disabled"
    >
      <t-radio-button value="user">用户</t-radio-button>
      <t-radio-button value="group">用户组</t-radio-button>
    </t-radio-group>
  </div>
  <div v-field-label class="field">
    <label>{{ label }}</label>
    <t-select
      :key="principalType"
      :value="target?.principal_id"
      :value-display="selectedLabel || undefined"
      :options="options"
      :disabled="disabled"
      :loading="loading"
      :empty="error || `没有匹配的${typeLabel}`"
      :placeholder="`搜索${typeLabel}名称或 ID`"
      :filter="() => true"
      filterable
      @change="select"
      @input-change="search"
      @popup-visible-change="openOptions"
    >
      <template #panelBottomContent>
        <div
          v-if="result && (page > 1 || result.has_next)"
          class="recipient-page"
          @mousedown.prevent
        >
          <t-button
            size="small"
            variant="outline"
            :disabled="page <= 1"
            @click="page--"
          >
            上一页
          </t-button>
          <span>第 {{ page }} 页</span>
          <t-button
            size="small"
            variant="outline"
            :disabled="!result.has_next"
            @click="page++"
          >
            下一页
          </t-button>
        </div>
      </template>
    </t-select>
  </div>
</template>

<style scoped>
.recipient-page {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--border);
  color: var(--muted);
}
</style>

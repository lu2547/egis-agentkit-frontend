<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { errorText } from "../../api/http";
import {
  MAX_SKILL_BATCH_SIZE,
  type BatchAccessResponse,
  type BatchAccessResult,
  type ShareTarget,
} from "../../types/api";
import BatchAccessNotice from "../common/BatchAccessNotice.vue";
import RecipientPicker from "../common/RecipientPicker.vue";

const props = defineProps<{
  visible: boolean;
  title: string;
  submitLabel: string;
  resources: { resource_id: string; display_name: string }[];
  resourcesLoading?: boolean;
  resourcesError?: string;
  submitBatch: (
    resourceIds: string[],
    target: ShareTarget,
  ) => Promise<BatchAccessResponse>;
}>();
const emit = defineEmits<{ close: []; changed: []; retryResources: [] }>();
const selectedResources = ref<string[]>([]);
const selectedRecipient = ref<ShareTarget | null>(null);
const pending = ref(false);
const submitError = ref("");
const results = ref<BatchAccessResult[]>([]);
const labels = ref<Record<string, string>>({});
const options = computed(() =>
  props.resources.map(({ resource_id, display_name }) => ({
    value: resource_id,
    label: display_name,
  })),
);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    selectedResources.value = [];
    selectedRecipient.value = null;
    submitError.value = "";
    results.value = [];
  },
);

async function submit() {
  const recipient = selectedRecipient.value;
  if (
    pending.value ||
    props.resourcesLoading ||
    props.resourcesError ||
    !selectedResources.value.length ||
    !recipient
  ) return;
  pending.value = true;
  submitError.value = "";
  results.value = [];
  labels.value = Object.fromEntries(
    options.value.map(({ value, label }) => [value, label]),
  );
  try {
    const response = await props.submitBatch(
      selectedResources.value,
      recipient,
    );
    results.value = response.items;
    selectedResources.value = response.items
      .filter((item) => !item.success)
      .map((item) => item.id);
    if (selectedResources.value.length < response.items.length) emit("changed");
  } catch (err) {
    submitError.value = errorText(err);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :header="title"
    :visible="visible"
    :footer="false"
    :close-on-overlay-click="!pending"
    :close-on-esc-keydown="!pending"
    @close="!pending && emit('close')"
  >
    <form class="form-stack" @submit.prevent="submit">
      <div v-field-label class="field">
        <label>技能</label>
        <t-select
          v-model="selectedResources"
          multiple
          filterable
          :max="MAX_SKILL_BATCH_SIZE"
          :disabled="pending || resourcesLoading || !!resourcesError"
          :loading="resourcesLoading"
          :options="options"
          :popup-props="{ placement: 'top-left' }"
          placeholder="选择技能"
        />
      </div>
      <div v-if="resourcesError" class="error" role="alert">
        {{ resourcesError }}
        <t-button variant="text" @click="emit('retryResources')">重新加载</t-button>
      </div>
      <RecipientPicker
        v-if="visible"
        v-model="selectedRecipient"
        :disabled="pending"
      />
      <BatchAccessNotice
        v-if="results.length"
        :results="results"
        :labels="labels"
      />
      <div v-if="submitError" class="error" role="alert">{{ submitError }}</div>
      <div class="form-actions">
        <t-button variant="outline" :disabled="pending" @click="emit('close')">
          {{ results.length && !selectedResources.length ? "关闭" : "取消" }}
        </t-button>
        <t-button
          theme="primary"
          type="submit"
          :disabled="resourcesLoading || !!resourcesError || !selectedResources.length || !selectedRecipient"
          :loading="pending"
          >{{ submitLabel }}</t-button
        >
      </div>
    </form>
  </t-dialog>
</template>

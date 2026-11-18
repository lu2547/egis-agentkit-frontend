<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import {
  MAX_SKILL_BATCH_SIZE,
  principalName,
  type BatchAccessResponse,
  type BatchAccessResult,
  type ShareTarget,
} from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import BatchAccessNotice from "../common/BatchAccessNotice.vue";

const props = defineProps<{
  visible: boolean;
  title: string;
  submitLabel: string;
  resources: { resource_id: string; display_name: string }[];
  submitBatch: (
    resourceIds: string[],
    target: ShareTarget,
  ) => Promise<BatchAccessResponse>;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const selectedResources = ref<string[]>([]);
const selectedRecipient = ref("");
const pending = ref(false);
const submitError = ref("");
const results = ref<BatchAccessResult[]>([]);
const labels = ref<Record<string, string>>({});
const { data, loading, error, load } = useAsyncData(manager.shareRecipients);
const recipients = computed(() =>
  (data.value?.items || []).map(
    ({ principal_type, principal_id, display_name }) => ({
      value: JSON.stringify([principal_type, principal_id]),
      label: `${display_name}（${principalName(principal_type, principal_id)}）`,
      target: { principal_type, principal_id },
    }),
  ),
);
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
    selectedRecipient.value = "";
    submitError.value = "";
    results.value = [];
    void load();
  },
);

async function submit() {
  const recipient = recipients.value.find(
    ({ value }) => value === selectedRecipient.value,
  );
  if (pending.value || !selectedResources.value.length || !recipient) return;
  pending.value = true;
  submitError.value = "";
  results.value = [];
  labels.value = Object.fromEntries(
    options.value.map(({ value, label }) => [value, label]),
  );
  try {
    const response = await props.submitBatch(
      selectedResources.value,
      recipient.target,
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
          :disabled="pending"
          :options="options"
          :popup-props="{ placement: 'top-left' }"
          placeholder="选择技能"
        />
      </div>
      <AsyncState :loading="loading" :error="error" @retry="load">
        <div v-field-label class="field">
          <label>接收对象</label>
          <t-select
            v-model="selectedRecipient"
            filterable
            :disabled="pending"
            :options="recipients"
            placeholder="选择用户或组织组"
          />
        </div>
      </AsyncState>
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
          :disabled="!selectedResources.length || !selectedRecipient"
          :loading="pending"
          >{{ submitLabel }}</t-button
        >
      </div>
    </form>
  </t-dialog>
</template>

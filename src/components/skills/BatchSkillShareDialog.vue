<script setup lang="ts">
import { ref, watch } from "vue";
import { errorText } from "../../api/http";
import {
  MAX_SKILL_BATCH_SIZE,
  type BatchAccessResponse,
  type BatchAccessResult,
  type ShareTarget,
  type Resource,
} from "../../types/api";
import BatchAccessNotice from "../common/BatchAccessNotice.vue";
import SkillPicker from "./SkillPicker.vue";
import RecipientPicker from "../common/RecipientPicker.vue";

const props = defineProps<{
  visible: boolean;
  title: string;
  submitLabel: string;
  purpose?: "share" | "grant";
  submitBatch: (
    resourceIds: string[],
    target: ShareTarget,
  ) => Promise<BatchAccessResponse>;
}>();
const emit = defineEmits<{ close: []; changed: []; resources: [resources: Resource[]] }>();
const selectedResources = ref<string[]>([]);
const selectedRecipient = ref<ShareTarget | null>(null);
const pending = ref(false);
const submitError = ref("");
const results = ref<BatchAccessResult[]>([]);
const labels = ref<Record<string, string>>({});
const availableResources = ref<Resource[]>([]);
function remember(resources: Resource[]) {
  availableResources.value = resources;
  emit("resources", resources);
}

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
    !selectedResources.value.length ||
    !recipient
  ) return;
  pending.value = true;
  submitError.value = "";
  results.value = [];
  labels.value = Object.fromEntries(
    availableResources.value.map((resource) => [resource.resource_id, resource.display_name]),
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
        <SkillPicker
          v-if="visible"
          v-model="selectedResources"
          :purpose="purpose || 'share'" key-mode="id"
          :max="MAX_SKILL_BATCH_SIZE" :disabled="pending"
          placeholder="选择技能"
          @resources="remember"
        />
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
          :disabled="!selectedResources.length || !selectedRecipient"
          :loading="pending"
          >{{ submitLabel }}</t-button
        >
      </div>
    </form>
  </t-dialog>
</template>

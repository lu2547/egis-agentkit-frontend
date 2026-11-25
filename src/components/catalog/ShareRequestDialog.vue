<script setup lang="ts">
import { ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { type ShareTarget, type ShareableKind } from "../../types/api";
import RecipientPicker from "../common/RecipientPicker.vue";

const props = defineProps<{
  visible: boolean;
  resourceType?: ShareableKind;
  resourceId: string;
  version: string;
  update?: boolean;
}>();
const emit = defineEmits<{ close: []; submitted: [] }>();
const selected = ref<ShareTarget | null>(null);
const pending = ref(false);
const submitError = ref("");
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    selected.value = null;
    submitError.value = "";
  },
);
async function submit() {
  if ((!props.update && !selected.value) || !props.resourceType || pending.value) return;
  pending.value = true;
  submitError.value = "";
  try {
    await manager.share(
      props.resourceType,
      props.resourceId,
      props.update ? undefined : selected.value || undefined,
    );
    emit("submitted");
  } catch (e) {
    submitError.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    :aria-label="update ? '共享新版本' : '申请共享'"
    :visible="visible"
    :header="update ? '共享新版本' : '申请共享'"
    :footer="false"
    @close="emit('close')"
  >
    <form class="form-stack" @submit.prevent="submit">
      <p class="muted">
        共享版本 {{ version }}。{{ update ? "审核通过后，现有受众将使用新版本。" : "审核通过后，所选对象即可使用此版本。" }}
      </p>
      <RecipientPicker v-if="visible && !update" v-model="selected" :disabled="pending" />
      <div v-if="submitError" class="error" role="alert">{{ submitError }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="emit('close')">取消</t-button>
        <t-button
          theme="primary"
          type="submit"
          :disabled="!update && !selected"
          :loading="pending"
        >
          提交共享申请
        </t-button>
      </div>
    </form>
  </t-dialog>
</template>

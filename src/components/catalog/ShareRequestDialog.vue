<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import { principalName, type ShareableKind } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";

const props = defineProps<{
  visible: boolean;
  resourceType?: ShareableKind;
  resourceId: string;
  version: string;
  update?: boolean;
}>();
const emit = defineEmits<{ close: []; submitted: [] }>();
const selected = ref("");
const pending = ref(false);
const submitError = ref("");
const { data, loading, error, load } = useAsyncData(manager.shareRecipients);
const recipients = computed(() =>
  (data.value?.items || []).map((recipient) => {
    const { principal_type, principal_id, display_name } = recipient;
    const name = principalName(principal_type, principal_id);
    return {
      value: JSON.stringify([principal_type, principal_id]),
      label: `${display_name}（${name}）`,
      target: { principal_type, principal_id },
    };
  }),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    selected.value = "";
    submitError.value = "";
    if (!props.update) void load();
  },
);
async function submit() {
  const choice = recipients.value.find(
    (entry) => entry.value === selected.value,
  );
  if ((!props.update && !choice) || !props.resourceType) return;
  pending.value = true;
  submitError.value = "";
  try {
    await manager.share(
      props.resourceType,
      props.resourceId,
      props.update ? undefined : choice?.target,
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
      <AsyncState v-if="!update" :loading="loading" :error="error" @retry="load">
        <div v-field-label class="field">
          <label>接收对象</label>
          <t-select
            v-model="selected"
            filterable
            placeholder="选择用户或组织组"
            :options="recipients"
          />
        </div>
      </AsyncState>
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

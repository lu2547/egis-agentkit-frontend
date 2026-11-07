<script setup lang="ts">
import { ref } from "vue";
import { http, errorText } from "../../api/http";
defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const version = ref("1.0.0");
const file = ref<File | null>(null),
  pending = ref(false),
  error = ref("");
function choose(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] || null;
}
async function upload() {
  if (!file.value) return;
  pending.value = true;
  error.value = "";
  const form = new FormData();
  form.append("file", file.value);
  try {
    await http(
      "/manager/skills/upload",
      { method: "POST", body: form },
      { version: version.value },
    );
    emit("saved");
    emit("close");
    file.value = null;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <t-dialog
    role="dialog"
    aria-modal="true"
    aria-label="上传技能"
    :visible="visible"
    header="上传技能"
    :footer="false"
    @close="$emit('close')"
    ><form class="form-stack" @submit.prevent="upload">
      <p class="muted upload-help">
        选择包含 SKILL.md 的技能包，内容由服务端校验后创建。
      </p>
      <div v-field-label class="field">
        <label for="skill-upload-version">技能版本</label
        ><t-input
          id="skill-upload-version"
          v-model="version"
          placeholder="1.0.0"
        />
      </div>
      <input
        type="file"
        accept=".zip"
        aria-label="选择技能文件"
        @change="choose"
      />
      <div v-if="error" class="error">{{ error }}</div>
      <div class="form-actions">
        <t-button variant="outline" @click="$emit('close')">取消</t-button
        ><t-button
          theme="primary"
          type="submit"
          :disabled="!file || !version.trim()"
          :loading="pending"
          >上传</t-button
        >
      </div>
    </form></t-dialog
  >
</template>
<style scoped src="../../styles/components/skill-upload.css"></style>

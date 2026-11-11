<script setup lang="ts">
import DialogShell from "../common/DialogShell.vue";
defineProps<{
  name: string;
  isDirectory: boolean;
  pending: boolean;
  error: string;
}>();
defineEmits<{ cancel: []; confirm: [] }>();
</script>
<template>
  <DialogShell
    open
    :label="`删除${isDirectory ? '文件夹' : '文件'}`"
    @close="!pending && $emit('cancel')"
  >
    <div class="delete-content">
      <h2>删除{{ isDirectory ? "文件夹" : "文件" }}？</h2>
      <p class="delete-description">
        “{{ name }}”{{
          isDirectory ? "及其全部内容" : ""
        }}将从当前项目删除，同项目的其他对话也会受到影响。
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form-actions">
        <t-button variant="outline" :disabled="pending" @click="$emit('cancel')"
          >取消</t-button
        >
        <t-button theme="primary" :loading="pending" @click="$emit('confirm')"
          >删除</t-button
        >
      </div>
    </div>
  </DialogShell>
</template>
<style scoped src="./WorkspaceDeleteDialog.css"></style>

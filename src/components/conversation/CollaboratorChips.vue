<script setup lang="ts">
import { LoaderCircle, X } from "lucide-vue-next";
import type { Collaborator } from "../../types/api";
defineProps<{
  members: Collaborator[];
  disabled?: boolean;
  removing?: ReadonlySet<string>;
}>();
defineEmits<{ remove: [member: Collaborator] }>();
</script>
<template>
  <div
    v-if="members.length"
    class="collaborator-chips"
    role="region"
    aria-label="协作专家"
  >
    <span class="collaborator-label">邀请：</span>
    <span
      v-for="member in members"
      :key="`${member.definition_id}:${member.resource_view_type}`"
      class="collaborator-chip"
      :data-status="member.status"
      :title="`${member.display_name} · ${member.status === 'pending' ? '待协作' : '已加入协作'}`"
    >
      <span class="collaborator-name">{{ member.display_name }}</span>
      <span
        v-if="removing?.has(member.worker_session_id || '')"
        class="collaborator-removing"
        role="status"
        >正在移除</span
      >
      <button
        v-if="member.status === 'pending' || member.worker_session_id"
        type="button"
        :disabled="disabled || removing?.has(member.worker_session_id || '')"
        :aria-label="`移除${member.status === 'pending' ? '待' : ''}协作专家 ${member.display_name}`"
        @click="$emit('remove', member)"
      >
        <LoaderCircle
          v-if="removing?.has(member.worker_session_id || '')"
          class="removing-spinner"
          :size="12"
          aria-hidden="true"
        />
        <X v-else :size="12" />
      </button>
    </span>
  </div>
</template>
<style scoped src="../../styles/components/collaborator-chips.css"></style>

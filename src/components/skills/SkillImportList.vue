<script setup lang="ts">
import { computed } from "vue";
import type { SkillImportJob } from "../../types/api";
const props = defineProps<{
  jobs: SkillImportJob[];
  error: string;
  success?: string;
  loading: boolean;
  retrying: string;
}>();
const visibleJobs = computed(() =>
  props.jobs.filter((job) => job.status !== "succeeded"),
);
defineEmits<{ refresh: []; retry: [jobId: string]; dismiss: [jobId: string] }>();
const statuses = {
  queued: "等待处理",
  running: "处理中",
  pending_approval: "待审核",
  succeeded: "已完成",
  failed: "导入失败",
  rejected: "审核未通过",
};
const stages: Record<string, string> = {
  queued: "等待处理",
  validating: "校验技能包",
  preparing: "准备技能包",
  registering: "登记技能",
  retrying: "等待重试",
  completed: "导入完成",
  failed: "导入失败",
};
function progress(job: SkillImportJob) {
  return Math.min(100, Math.max(0, job.progress));
}
</script>
<template>
  <section
    v-if="visibleJobs.length || error || success"
    class="skill-imports"
    aria-label="技能导入任务"
  >
    <div class="import-heading">
      <h2>导入任务</h2>
      <t-button
        theme="default"
        variant="text"
        size="small"
        :loading="loading"
        @click="$emit('refresh')"
        >刷新状态</t-button
      >
    </div>
    <div v-if="error" class="error" role="alert">
      {{ error }}
      <t-button variant="text" size="small" @click="$emit('refresh')"
        >重试获取状态</t-button
      >
    </div>
    <p v-if="success" class="notice" role="status">{{ success }}</p>
    <ol class="import-list">
      <li v-for="job in visibleJobs" :key="job.job_id" :data-status="job.status">
        <div class="import-identity">
          <strong>{{ job.filename }}</strong
          ><span role="status">{{ statuses[job.status] }}</span>
        </div>
        <template v-if="job.status === 'queued' || job.status === 'running'"
          ><p>
            {{ stages[job.stage] || statuses[job.status] }} ·
            {{ progress(job) }}%
          </p>
          <progress
            :value="progress(job)"
            max="100"
            :aria-label="`${job.filename} 导入进度`"
        /></template>
        <p v-else-if="job.status === 'pending_approval'">
          技能包已校验，等待管理员审核。
        </p>
        <p v-else-if="job.status === 'rejected'">{{ job.review_reason }}</p>
        <div v-else class="import-failure">
          <p role="alert">{{ job.error || "导入未完成，请重试。" }}</p>
          <t-button
            theme="default"
            variant="outline"
            size="small"
            :loading="retrying === job.job_id"
            :disabled="!!retrying"
            @click="$emit('retry', job.job_id)"
            >重试导入</t-button
          >
        </div>
        <t-button v-if="job.status === 'failed' || job.status === 'rejected'"
          variant="text" size="small" :aria-label="`关闭 ${job.filename} 导入任务`"
          @click="$emit('dismiss', job.job_id)">关闭任务</t-button>
      </li>
    </ol>
  </section>
</template>
<style scoped src="../../styles/components/skill-imports.css"></style>

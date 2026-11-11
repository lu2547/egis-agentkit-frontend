<script setup lang="ts">
import type { SkillImportJob } from "../../types/api";
defineProps<{
  jobs: SkillImportJob[];
  error: string;
  loading: boolean;
  retrying: string;
}>();
defineEmits<{ refresh: []; retry: [jobId: string] }>();
const statuses = {
  queued: "等待处理",
  running: "处理中",
  succeeded: "已完成",
  failed: "导入失败",
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
    v-if="jobs.length || error"
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
    <ol class="import-list">
      <li v-for="job in jobs" :key="job.job_id" :data-status="job.status">
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
        <p v-else-if="job.status === 'succeeded'">
          {{ job.resource_id }}
          <span v-if="job.resource_version">· {{ job.resource_version }}</span>
          · 已可在技能目录查看
        </p>
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
      </li>
    </ol>
  </section>
</template>
<style scoped src="../../styles/components/skill-imports.css"></style>

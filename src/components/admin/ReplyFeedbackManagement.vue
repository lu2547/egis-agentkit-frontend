<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import type { ReplyFeedback } from "../../types/api";
import { useAsyncData } from "../../composables/useAsyncData";
import AsyncState from "../common/AsyncState.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";
const cursor = ref<string>(),
  history = ref<(string | undefined)[]>([]),
  selected = ref<ReplyFeedback>();
const { data, loading, error, load } = useAsyncData(() =>
  manager.pageReplyFeedback(cursor.value),
);
onMounted(load);
async function next() {
  if (!data.value?.next_cursor || loading.value) return;
  const previous = cursor.value;
  cursor.value = data.value.next_cursor;
  await load();
  if (!error.value) history.value.push(previous);
  else cursor.value = previous;
}
async function previous() {
  if (!history.value.length || loading.value) return;
  const current = cursor.value;
  cursor.value = history.value.at(-1);
  await load();
  if (!error.value) history.value.pop();
  else cursor.value = current;
}
</script>
<template>
  <section class="feedback-management">
    <AdminSectionHeader title="回复反馈">
      <t-button variant="outline" :loading="loading" @click="load"
        >刷新</t-button
      >
    </AdminSectionHeader>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      empty-title="暂无回复反馈"
      @retry="load"
    >
      <t-table
        :data="data?.items || []"
        row-key="id"
        :columns="[
          { colKey: 'created_at', title: '提交时间', width: 175 },
          { colKey: 'username', title: '提交人', width: 110 },
          { colKey: 'project_name', title: '项目', width: 130 },
          { colKey: 'session_name', title: '会话', width: 180 },
          { colKey: 'comment', title: '吐槽内容' },
          { colKey: 'action', title: '操作', width: 100 },
        ]"
        hover
      >
        <template #created_at="{ row }">{{
          new Date(row.created_at).toLocaleString()
        }}</template>
        <template #action="{ row }"
          ><t-button variant="text" size="small" @click="selected = row"
            >查看详情</t-button
          ></template
        >
      </t-table>
    </AsyncState>
    <nav v-if="history.length || data?.next_cursor" aria-label="反馈分页">
      <t-button
        variant="outline"
        :disabled="!history.length || loading"
        @click="previous"
        >上一页</t-button
      ><t-button
        variant="outline"
        :disabled="!data?.next_cursor || loading"
        @click="next"
        >下一页</t-button
      >
    </nav>
    <t-dialog
      :visible="!!selected"
      header="反馈详情"
      role="dialog"
      aria-modal="true"
      aria-label="反馈详情"
      :footer="false"
      @update:visible="
        (value: boolean) => {
          if (!value) selected = undefined;
        }
      "
    >
      <div v-if="selected" class="feedback-detail">
        <dl>
          <dt>提交人</dt>
          <dd>{{ selected.username }}（{{ selected.user_id }}）</dd>
          <dt>提交时间</dt>
          <dd>{{ new Date(selected.created_at).toLocaleString() }}</dd>
          <dt>项目 / 会话</dt>
          <dd>{{ selected.project_name }} / {{ selected.session_name }}</dd>
          <dt>专家</dt>
          <dd>{{ selected.agent_display_name }}</dd>
          <dt>会话 / 回复 ID</dt>
          <dd>{{ selected.session_id }} / {{ selected.reply_id }}</dd>
        </dl>
        <h3>吐槽内容</h3>
        <p>{{ selected.comment }}</p>
        <h3>用户问题</h3>
        <p>{{ selected.question_text || "未记录文字问题" }}</p>
        <h3>原始回答</h3>
        <p>{{ selected.reply_text || "无文字回答" }}</p>
        <t-button variant="outline" @click="selected = undefined"
          >关闭</t-button
        >
      </div>
    </t-dialog>
  </section>
</template>
<style scoped>
.feedback-management nav {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.feedback-detail {
  max-height: 65vh;
  overflow: auto;
  overflow-wrap: anywhere;
}
.feedback-detail dt {
  font-size: 12px;
  color: var(--muted);
  margin-top: 10px;
}
.feedback-detail dd {
  margin: 4px 0 0;
}
.feedback-detail h3 {
  font-size: 14px;
  margin: 20px 0 8px;
}
.feedback-detail p {
  white-space: pre-wrap;
  line-height: 1.7;
}
</style>

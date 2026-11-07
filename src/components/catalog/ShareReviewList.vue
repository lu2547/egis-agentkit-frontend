<script setup lang="ts">
import { ref } from "vue";
import type { Review } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ reviews: Review[]; admin?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const selected = ref<Review | null>(null),
  reason = ref(""),
  pending = ref(false),
  error = ref("");
const names: Record<string, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已拒绝",
  cancelled: "已取消",
};
const types: Record<string, string> = {
  agent: "专家",
  team: "专家团",
  skill: "技能",
  mcp: "连接器",
};
async function decide(allowed: boolean) {
  if (!selected.value) return;
  pending.value = true;
  error.value = "";
  try {
    await manager.decide(selected.value.review_id, allowed, reason.value);
    selected.value = null;
    reason.value = "";
    emit("changed");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="reviews">
    <article
      v-for="review in reviews"
      :key="review.review_id"
      class="review-row"
    >
      <div>
        <span class="badge">{{
          types[review.resource_type] || review.resource_type
        }}</span
        ><strong>{{ review.resource_id }}</strong>
        <p>
          {{ review.review_reason || "审核通过后，将向全部用户共享此快照。" }}
        </p>
      </div>
      <span
        class="badge"
        :class="{ green: review.review_status_type === 'approved' }"
        >{{
          names[review.review_status_type] || review.review_status_type
        }}</span
      ><t-button
        variant="text"
        size="small"
        @click="
          selected = review;
          reason = '';
          error = '';
        "
        >{{
          admin && review.review_status_type === "pending"
            ? "审核快照"
            : "查看快照"
        }}</t-button
      >
    </article>
    <t-dialog
      role="dialog"
      aria-modal="true"
      aria-label="共享快照"
      :visible="!!selected"
      header="共享快照"
      :footer="false"
      width="760px"
      @close="selected = null"
      ><template v-if="selected"
        ><p class="snapshot-note">
          这是申请时冻结的内容。作者的私有修改不会改变此快照。
        </p>
        <h3 class="section-title">依赖版本</h3>
        <pre class="snapshot-code">{{
          JSON.stringify(selected.source_versions || {}, null, 2)
        }}</pre>
        <h3 class="section-title">共享内容</h3>
        <pre class="snapshot-code">{{
          JSON.stringify(selected.snapshot, null, 2)
        }}</pre>
        <template v-if="admin && selected.review_status_type === 'pending'"
          ><div v-field-label class="field">
            <label>审核意见</label
            ><t-textarea v-model="reason" placeholder="说明通过或拒绝的原因" />
          </div>
          <div v-if="error" class="error">{{ error }}</div>
          <div class="form-actions">
            <t-button
              variant="outline"
              :disabled="pending || !reason.trim()"
              @click="decide(false)"
              >拒绝共享</t-button
            ><t-button theme="primary" :loading="pending" @click="decide(true)"
              >通过并向全部用户共享</t-button
            >
          </div></template
        ></template
      ></t-dialog
    >
  </div>
</template>
<style scoped src="../../styles/components/ShareReviewList.css"></style>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useIdentity } from "../../composables/useIdentity";
import { useAsyncData } from "../../composables/useAsyncData";
import { principalName, type ShareableKind } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
const props = defineProps<{
  resourceType: ShareableKind;
  resourceId: string;
  ownerType: string;
  ownerId: string;
}>();
const emit = defineEmits<{ changed: [] }>();
const { user } = useIdentity();
const isOwner = computed(
  () => props.ownerType === "user" && props.ownerId === user.value?.user_id,
);
const pending = ref(""),
  actionError = ref(""),
  notice = ref("");
const { data, loading, error, load } = useAsyncData(async () => {
  if (!isOwner.value) return [];
  const { items } = await manager.reviews();
  const approvedWithdrawals = new Set(
    items
      .filter(
        (review) =>
          review.review_type === "revoke" &&
          review.review_status_type === "approved",
      )
      .map((review) => review.original_review_id),
  );
  return items
    .filter(
      (review) =>
        review.resource_type === props.resourceType &&
        review.resource_id === props.resourceId &&
        review.review_type === "share" &&
        (review.review_status_type === "pending" ||
          (review.review_status_type === "approved" &&
            (review.has_active_share ??
              !approvedWithdrawals.has(review.review_id)))),
    )
    .map((review) => ({
      ...review,
      pending_revoke_id: items.find(
        (request) =>
          request.review_type === "revoke" &&
          request.original_review_id === review.review_id &&
          request.review_status_type === "pending",
      )?.review_id,
    }));
});
watch(
  [isOwner, () => props.resourceId],
  () => {
    notice.value = "";
    actionError.value = "";
    void load();
  },
  { immediate: true },
);
async function withdraw(reviewId: string, approved: boolean) {
  if (!isOwner.value || pending.value) return;
  pending.value = reviewId;
  actionError.value = "";
  try {
    await manager.withdrawShare(reviewId);
    notice.value = approved
      ? "撤回申请已提交，管理员审核通过前共享继续生效。"
      : "申请已取消。当前共享状态不变。";
    await load();
    emit("changed");
  } catch (cause) {
    actionError.value = errorText(cause);
  } finally {
    pending.value = "";
  }
}
</script>
<template>
  <section v-if="isOwner" class="owner-shares" aria-label="共享管理">
    <h3>共享管理</h3>
    <AsyncState :loading="loading" :error="error" @retry="load">
      <ul v-if="data?.length">
        <li v-for="review in data" :key="review.review_id">
          <span
            >{{
              principalName(
                review.share_scope_type || "user",
                review.principal_id || "",
              )
            }}
            ·
            {{
              review.pending_revoke_id
                ? "撤回申请审核中，当前共享继续生效"
                : review.review_status_type === "approved"
                  ? "已共享"
                  : "待审核"
            }}</span
          >
          <t-popconfirm
            :content="
              review.pending_revoke_id
                ? '取消撤回申请？共享继续生效。'
                : review.review_status_type === 'approved'
                  ? '提交撤回申请？管理员审核通过前共享继续生效。'
                  : '取消此共享申请？'
            "
            @confirm="
              withdraw(
                review.pending_revoke_id || review.review_id,
                !review.pending_revoke_id &&
                  review.review_status_type === 'approved',
              )
            "
          >
            <t-button
              size="small"
              variant="outline"
              :disabled="!!pending"
              :loading="
                pending === review.review_id ||
                pending === review.pending_revoke_id
              "
            >
              {{
                review.pending_revoke_id
                  ? "取消撤回申请"
                  : review.review_status_type === "approved"
                    ? "申请撤回共享"
                    : "取消申请"
              }}
            </t-button>
          </t-popconfirm>
        </li>
      </ul>
      <p v-else class="muted">暂无待审核或已共享的对象。</p>
    </AsyncState>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <p v-if="actionError" role="alert" class="error">{{ actionError }}</p>
  </section>
</template>
<style scoped>
.owner-shares {
  margin-block-start: 24px;
}
.owner-shares ul {
  list-style: none;
  padding: 0;
}
.owner-shares li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-block: 8px;
  border-bottom: 1px solid var(--border);
}
</style>

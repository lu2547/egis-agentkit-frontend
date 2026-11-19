<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { useAdminPage } from "../../composables/useAdminPage";
import type { Review } from "../../types/api";
import ShareReviewList from "../catalog/ShareReviewList.vue";
import AsyncState from "../common/AsyncState.vue";
import AdminPagination from "./AdminPagination.vue";
import AdminSectionHeader from "./AdminSectionHeader.vue";

const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<Review>("share-reviews", page),
);
const reviewing = ref(false);
onMounted(load);
</script>

<template>
  <AdminSectionHeader title="共享审核" />
  <div v-if="data && error" class="error" role="alert">
    {{ error }}
    <t-button size="small" variant="outline" theme="default" @click="load">
      重新加载
    </t-button>
  </div>
  <AsyncState
    :loading="loading && !data"
    :error="data ? '' : error"
    :empty="!data?.items.length"
    empty-title="暂无共享审核"
    @retry="load"
  >
    <ShareReviewList
      :key="data?.page"
      :reviews="data?.items || []"
      :aria-busy="loading"
      :disabled="loading || !!error"
      admin
      @busy="reviewing = $event"
      @changed="load"
    />
  </AsyncState>
  <AdminPagination
    v-if="data?.items.length"
    label="共享审核"
    :page="data.page"
    :has-next="data.has_next"
    :disabled="loading || reviewing"
    @change="changePage"
  />
</template>

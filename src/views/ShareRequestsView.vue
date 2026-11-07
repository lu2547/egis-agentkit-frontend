<script setup lang="ts">
import { onMounted } from "vue";
import { manager } from "../api/manager";
import { useAsyncData } from "../composables/useAsyncData";
import AsyncState from "../components/common/AsyncState.vue";
import ShareReviewList from "../components/catalog/ShareReviewList.vue";
const { data, loading, error, load } = useAsyncData(() => manager.reviews());
onMounted(load);
</script>
<template>
  <section class="page">
    <header class="page-title">
      <div>
        <h1>我的共享申请</h1>
        <p>管理专家、团队与技能的共享快照和审核结果。</p>
      </div>
    </header>
    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!data?.items.length"
      empty-title="暂无共享申请"
      empty-text="在自己的资源详情中申请共享。私有资源保存后即可自用。"
      @retry="load"
      ><ShareReviewList :reviews="data?.items || []"
    /></AsyncState>
  </section>
</template>

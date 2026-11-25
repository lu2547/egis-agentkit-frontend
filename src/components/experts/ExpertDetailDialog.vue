<script setup lang="ts">
import { computed } from "vue";
import { Lightbulb, ListFilter, MessageCircleMore, X } from "lucide-vue-next";
import type { Definition } from "../../types/api";
import { useIdentity } from "../../composables/useIdentity";
import OwnerShareManagement from "../catalog/OwnerShareManagement.vue";
import { definitionName, sourceName } from "../../types/api";
import DialogShell from "../common/DialogShell.vue";
import IconButton from "../common/IconButton.vue";
import CatalogAvatar from "../common/CatalogAvatar.vue";

const props = defineProps<{
  definition: Definition | null;
  definitions: Definition[];
  pending: boolean;
  error: string;
}>();
const emit = defineEmits<{
  close: [];
  summon: [prompt?: string];
  edit: [];
  share: [update: boolean];
  delete: [];
  changed: [];
}>();

const { user } = useIdentity();
const canDelete = computed(() => props.definition?.is_deletable && props.definition.owner_type === "user" && props.definition.owner_id === user.value?.user_id);
const members = computed(() =>
  (props.definition?.payload.members || []).map((ref) => {
    const member = props.definitions.find(
      (d) =>
        d.id === ref.definition_id &&
        d.resource_version === ref.resource_version,
    );
    return {
      id: ref.definition_id,
      version: ref.resource_version,
      name: member ? definitionName(member) : ref.definition_id,
      avatar: member?.payload.avatar,
      description: member?.payload.description,
    };
  }),
);

</script>

<template>
  <DialogShell
    :open="!!definition"
    :label="definition ? definitionName(definition) : '目录详情'"
    :width="640"
    @close="$emit('close')"
  >
    <article v-if="definition" class="detail-dialog">
      <header class="detail-heading">
        <CatalogAvatar
          class="detail-avatar"
          :avatar="definition.payload.avatar"
          :name="definitionName(definition)"
        />
        <div class="detail-heading-body">
          <div class="detail-title-row">
            <h2>{{ definitionName(definition) }}</h2>
            <span class="detail-source">{{
              sourceName(definition.resource_view_type)
            }}</span>
          </div>
          <div class="detail-action-row">
            <t-button
              theme="primary"
              :disabled="!definition.is_usable || pending"
              @click="$emit('summon')"
            >
              {{ definition.is_usable ? "召唤" : "尚未获得使用授权" }}
            </t-button>
            <span class="detail-version">v{{ definition.version_label || definition.resource_version }}</span>
          </div>
        </div>
        <IconButton label="关闭详情" @click="$emit('close')"
          ><X :size="19"
        /></IconButton>
      </header>

      <p class="full-description">
        {{ definition.payload.description || "尚未填写简介" }}
      </p>
      <div v-if="definition.payload.tags?.length" class="tags">
        <span v-for="tag in definition.payload.tags" :key="tag">{{ tag }}</span>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section
        v-if="definition.definition_type === 'team' && members.length"
        class="detail-section"
      >
        <h3>协作成员</h3>
        <ul class="members">
          <li v-for="member in members" :key="`${member.id}@${member.version}`">
            <CatalogAvatar :avatar="member.avatar" :name="member.name" />
            <div>
              {{ member.name }} · {{ member.version }}
              <small v-if="member.description">{{ member.description }}</small>
            </div>
          </li>
        </ul>
      </section>

      <section
        v-if="definition.payload.starter_prompts?.length"
        class="detail-section"
      >
        <h3>
          <Lightbulb :size="17" aria-hidden="true" />
          {{
            definition.definition_type === "team"
              ? "专家团帮你做"
              : "专家帮你做"
          }}
        </h3>
        <ul class="detail-prompts">
          <li
            v-for="prompt in definition.payload.starter_prompts"
            :key="prompt"
          >
            <button
              type="button"
              :disabled="!definition.is_usable || pending"
              @click="$emit('summon', prompt)"
            >
              <span>“{{ prompt }}”</span>
              <MessageCircleMore :size="17" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <section class="detail-section">
        <h3><ListFilter :size="17" aria-hidden="true" />更多</h3>
        <div class="detail-more">
          <span class="detail-id">ID {{ definition.id }}</span>
          <div v-if="definition.is_editable || definition.can_share || definition.can_share_update || canDelete" class="detail-actions">
            <t-button
              v-if="definition.is_editable"
              variant="text"
              :disabled="pending"
              @click="$emit('edit')"
              >编辑</t-button
            >
            <t-button
              v-if="definition.can_share"
              variant="text"
              :disabled="pending"
              @click="$emit('share', false)"
              >申请共享</t-button
            >
            <t-button v-if="definition.can_share_update" variant="text" :disabled="pending" @click="$emit('share', true)">共享新版本</t-button>
            <t-popconfirm v-if="canDelete" content="删除此专家？" @confirm="$emit('delete')">
              <t-button variant="text" theme="danger" :disabled="pending">删除专家</t-button>
            </t-popconfirm>
          </div>
        </div>
      </section>
      <OwnerShareManagement
        :key="`${definition.id}:${definition.owner_id}`"
        :resource-type="definition.definition_type" :resource-id="definition.id"
        :owner-type="definition.owner_type" :owner-id="definition.owner_id"
        @changed="$emit('changed')"
      />
    </article>
  </DialogShell>
</template>
<style scoped src="../../styles/components/expert-detail.css"></style>

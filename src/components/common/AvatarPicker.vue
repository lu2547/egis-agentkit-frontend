<script setup lang="ts">
import { catalogIcons } from '../../domain/catalogIcons';
defineProps<{ modelValue: string; kind: 'expert' | 'skill' }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template><div class="avatar-picker" role="group" aria-label="选择头像"><button v-for="icon in catalogIcons[kind]" :key="icon.id" type="button" :class="{selected: modelValue === icon.id}" :aria-label="icon.label" :aria-pressed="modelValue === icon.id" @click="$emit('update:modelValue', icon.id)"><img :src="icon.url" alt="" /></button></div></template>
<style scoped src="../../styles/components/avatar-picker.css"></style>

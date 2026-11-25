<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'
const props = defineProps<{
  modelValue: string
  options: { id: string; label: string }[]
  placeholder?: string
  appearance?: 'text' | 'filter'
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const selected = computed(() => props.options.findIndex((o) => o.id === props.modelValue))
const label = computed(() => props.options[selected.value]?.label || props.placeholder || '请选择')
function change(e: { detail: { value: string | number } }) {
  const option = props.options[Number(e.detail.value)]
  if (option) emit('update:modelValue', option.id)
}
</script>
<template>
  <picker :range="options" range-key="label" :value="Math.max(0, selected)" :disabled="disabled" @change="change">
    <view v-if="appearance" :class="appearance === 'filter' ? 'browse-filter-label' : 'choice-text'" hover-class="choice-text-pressed">
      <text>{{ label }}</text>
      <UiIcon name="down" :size="12" />
    </view>
    <view v-else class="field">{{ label }} ﹀</view>
  </picker>
</template>

<style scoped>
.choice-text {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 4px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
}
.choice-text-pressed { opacity: .65; }
</style>

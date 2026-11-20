<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  modelValue: string
  options: { id: string; label: string }[]
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const selected = computed(() => props.options.findIndex((o) => o.id === props.modelValue))
function change(e: { detail: { value: string | number } }) {
  const option = props.options[Number(e.detail.value)]
  if (option) emit('update:modelValue', option.id)
}
</script>
<template>
  <picker :range="options" range-key="label" :value="Math.max(0, selected)" @change="change">
    <view class="field">{{ options[selected]?.label || placeholder || '请选择' }} ﹀</view>
  </picker>
</template>

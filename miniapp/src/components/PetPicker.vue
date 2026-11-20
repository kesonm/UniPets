<script setup lang="ts">
import { computed } from 'vue'
import type { Pet } from '../../../src/lib/types'
import { go } from '../lib/client'
import ChoiceField from './ChoiceField.vue'
const props = defineProps<{ pets: Pet[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
const options = computed(() => props.pets.map((p) => ({ id: p.id, label: p.name })))
</script>
<template>
  <view>
    <text class="label">选择宠物</text>
    <ChoiceField
      v-if="pets.length"
      :model-value="modelValue"
      :options="options"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <button v-else class="small" @tap="go('pet-edit')">先添加宠物档案</button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { go } from '../lib/client'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ modelValue?: string; placeholder?: string; title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; search: [] }>()
const input = computed({
  get: () => props.modelValue ?? '',
  set: value => emit('update:modelValue', value),
})

function back() {
  uni.navigateBack({ fail: () => go('home') })
}
</script>

<template>
  <view class="tab-leading browse-toolbar">
    <button class="browse-back" aria-label="返回" @tap="back">
      <view class="browse-back-arrow"><UiIcon name="right" :size="16" /></view>
    </button>
    <view v-if="placeholder" class="browse-search">
      <UiIcon name="search" :size="15" />
      <input v-model="input" :always-embed="true" maxlength="60" :placeholder="placeholder"
        :aria-label="placeholder" confirm-type="search" @confirm="emit('search')" />
      <button class="browse-search-submit" @tap="emit('search')">搜索</button>
    </view>
    <text v-else class="browse-title">{{ title }}</text>
  </view>
</template>

<style scoped>
.browse-toolbar { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.browse-back {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--paper);
}
.browse-back-arrow { transform: rotate(180deg); }
.browse-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 2px 3px 2px 9px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--paper);
}
.browse-search input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
}
.browse-search-submit {
  flex: none;
  min-height: 30px;
  padding: 3px 8px;
  border: 0;
  border-radius: 18px;
  background: var(--yellow);
  font-size: 12px;
}
.browse-title { flex: 1; min-width: 0; padding-right: 3px; text-align: center; font-weight: 650; }
</style>

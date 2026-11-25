<script setup lang="ts">
import { go } from '../lib/client'
import UiIcon from './UiIcon.vue'

defineProps<{ storeId: string; name?: string|null }>()
</script>

<template>
  <button class="text-button store-link" :aria-label="'查看门店 '+(name || '')" @tap.stop="go('storefront',{id:storeId})">
    <UiIcon name="entry-shop" :size="13" />
    <text>{{ name || '查看门店' }}</text>
    <UiIcon name="right" :size="10" />
  </button>
</template>

<style scoped>
button.store-link { max-width: 100%; min-width: 0; min-height: 27px; padding: 1px 0; justify-content: flex-start; font-size: 12px; }
.store-link text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

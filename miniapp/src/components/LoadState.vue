<script setup lang="ts">
defineProps<{ error: string; loading?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <view v-if="error" class="card">
    <text class="error">{{ error }}</text>
    <button class="small" @tap="$emit('retry')">重试</button>
  </view>
  <text v-else-if="loading" class="empty">正在加载…</text>
</template>

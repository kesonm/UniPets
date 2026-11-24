<script setup lang="ts">
import { ref, watch } from 'vue'
import { downloadAvatar, user } from '../lib/client'
import UiIcon from './UiIcon.vue'

withDefaults(defineProps<{ size?: number; preview?: string }>(), { size: 42 })
const avatar = ref('')
watch([() => user.value?.id, () => user.value?.avatarVersion], async ([id, version], _, onCleanup) => {
  avatar.value = ''
  if (!id || !version) return
  let current = true
  onCleanup(() => { current = false })
  try {
    const path = await downloadAvatar(version)
    if (current) avatar.value = path
  } catch {
    // The default icon remains visible if the avatar cannot be read.
  }
}, { immediate: true })
</script>

<template>
  <view class="avatar" :style="{ width: size + 'px', height: size + 'px' }">
    <image v-if="preview || avatar" class="avatar-image" :src="preview || avatar" mode="aspectFill" aria-label="用户头像" />
    <UiIcon v-else name="account-avatar" :size="Math.round(size * 0.55)" />
  </view>
</template>

<style scoped>
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
  border-radius: 50%;
  background: #fff8da;
}
.avatar-image { width: 100%; height: 100%; }
</style>

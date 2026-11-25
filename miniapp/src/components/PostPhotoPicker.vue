<script setup lang="ts">
import { onUnmounted } from 'vue'
import { message, toast, user } from '../lib/client'
import { choosePhotoPath, postPhotoLimitMb } from '../lib/photo'

const props = defineProps<{ label: string; disabled?: boolean; appearance?: 'plain' }>()
const photos = defineModel<string[]>({ required: true })
const choosing = defineModel<boolean>('choosing', { required: true })
let mounted = true
onUnmounted(() => { mounted = false })

async function addPhoto() {
  if (choosing.value || props.disabled || photos.value.length >= 3) return
  choosing.value = true
  const owner = user.value?.id
  try {
    const path = await choosePhotoPath(['album','camera'], postPhotoLimitMb)
    if (path && mounted && owner === user.value?.id) photos.value = [...photos.value, path]
  } catch (cause) {
    if (mounted) toast(message(cause))
  } finally {
    choosing.value = false
  }
}

function preview(path: string) {
  uni.previewImage({ urls: photos.value, current: path })
}

function remove(index: number) {
  photos.value = photos.value.filter((_, position) => position !== index)
}
</script>

<template>
  <view>
    <text class="label">{{ label }}（选填，最多 3 张）</text>
    <view class="post-photos">
      <view v-for="(path,index) in photos" :key="index" class="post-photo">
        <image :src="path" mode="aspectFill" @tap="preview(path)" />
        <button class="chip post-photo-remove" :disabled="disabled || choosing" :aria-label="'移除第 '+(index+1)+' 张'" @tap="remove(index)">×</button>
      </view>
      <button v-if="photos.length < 3" :class="appearance === 'plain' ? 'text-button post-photo-add-plain' : 'small post-photo-add'"
        :disabled="disabled || choosing" @tap="addPhoto">＋ 添加图片</button>
    </view>
  </view>
</template>

<style scoped>
.post-photos { display: flex; flex-wrap: wrap; gap: 8px; }
.post-photo { position: relative; width: 80px; height: 80px; }
.post-photo image { display: block; width: 100%; height: 100%; border-radius: 8px; }
.post-photo-remove { position: absolute; top: 4px; right: 4px; padding: 0; width: 26px; height: 26px; }
.post-photo-add { min-height: 80px; border-style: dashed; border-radius: 8px; }
button.post-photo-add-plain { min-height: 40px; padding: 0 8px 0 0; }
</style>

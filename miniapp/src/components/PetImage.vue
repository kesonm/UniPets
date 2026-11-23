<script setup lang="ts">
import { ref, watch } from 'vue'
import { downloadAsset, user } from '../lib/client'
const props = withDefaults(defineProps<{
  assetId?: string | null
  source?: string
  large?: boolean
  size?: number
  previewable?: boolean
}>(), { previewable: true })
const src = ref('')
watch(
  [() => props.assetId, () => user.value?.id],
  async ([id, owner], _, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    src.value = ''
    if (!id || !owner) return
    try {
      const path = await downloadAsset(id)
      if (active) src.value = path
    } catch {
      /* Show the local placeholder. */
    }
  },
  { immediate: true },
)
function preview() {
  const url = src.value || props.source
  if (props.previewable && url) uni.previewImage({ urls: [url] })
}
</script>
<template>
  <image
    :class="large ? 'photo' : 'thumb'"
    :style="size ? { width: size + 'px', height: size + 'px' } : undefined"
    mode="aspectFill"
    :src="src || source || '/static/brand-mark.png'"
    @tap="preview"
  />
</template>

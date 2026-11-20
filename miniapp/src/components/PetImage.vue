<script setup lang="ts">
import { ref, watch } from 'vue'
import { downloadAsset, user } from '../lib/client'
const props = defineProps<{ assetId?: string | null; large?: boolean }>()
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
  if (src.value) uni.previewImage({ urls: [src.value] })
}
</script>
<template>
  <image
    :class="large ? 'photo' : 'thumb'"
    mode="aspectFill"
    :src="src || '/static/brand-mark.png'"
    @tap="preview"
  />
</template>

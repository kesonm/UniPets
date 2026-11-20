<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import type { MotionPreviewAsset } from '../../../src/lib/types'
import { publicImage, downloadAsset, message } from '../lib/client'
const props = defineProps<{ clip: MotionPreviewAsset; movable?: boolean }>()
const frame = ref(0),
  source = ref(''),
  loaded = ref(false),
  err = ref('')
let timer: ReturnType<typeof setInterval> | undefined
function stop() {
  if (timer) clearInterval(timer)
  timer = undefined
}
function play() {
  stop()
  if (!loaded.value || props.clip.frames < 2) return
  timer = setInterval(
    () => {
      frame.value = (frame.value + 1) % props.clip.frames
    },
    1000 / Math.max(1, Math.min(30, props.clip.fps || 10)),
  )
}
watch(
  () => props.clip,
  async (clip, _, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    stop()
    loaded.value = false
    frame.value = 0
    source.value = ''
    err.value = ''
    try {
      const path = clip.imagePath ? publicImage(clip.imagePath) : await downloadAsset(clip.id)
      if (current) source.value = path
    } catch (e) {
      if (current) err.value = message(e)
    }
  },
  { immediate: true },
)
onUnmounted(stop)
onHide(stop)
onShow(play)
const size = 260
const spriteStyle = computed(() => ({
  width: props.clip.columns * size + 'rpx',
  height: props.clip.rows * size + 'rpx',
  left: -(frame.value % props.clip.columns) * size + 'rpx',
  top: -Math.floor(frame.value / props.clip.columns) * size + 'rpx',
}))
function ready() {
  loaded.value = true
  play()
}
</script>
<template>
  <view>
    <movable-area class="room">
      <movable-view :direction="movable ? 'all' : 'none'" class="actor">
        <image
          v-if="source"
          class="sheet-image"
          :style="spriteStyle"
          :src="source"
          mode="scaleToFill"
          @load="ready"
          @error="err = '动作素材读取失败'"
        />
      </movable-view>
    </movable-area>
    <text v-if="err" class="error">{{ err }}</text>
  </view>
</template>
<style scoped>
.room {
  width: 100%;
  height: 330rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eee8d5;
  border-radius: 22rpx;
  overflow: hidden;
}
.actor {
  width: 260rpx;
  height: 260rpx;
  position: relative;
  overflow: hidden;
}
.sheet-image {
  position: absolute;
  max-width: none;
}
</style>

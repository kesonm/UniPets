<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { catClips, catFrameAt, catTimeline, type CatSequenceItem } from '../../shared/cat-motion.mjs'
import { fixedSpriteLayout, frameGeometry, type SpriteLayout } from '../../shared/sprite-layout.mjs'
import { imageUrl, mediaObjectUrl } from '../lib/api'
import type { MotionPreviewAsset } from '../lib/types'

const props = defineProps<{ items: CatSequenceItem<MotionPreviewAsset>[]; connected: boolean }>()
const timeline = catTimeline(props.items,props.connected)
const stage = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const busy = ref(true)
const error = ref('')
const playing = ref(false)
const elapsed = ref(0)
const sample = computed(() => catFrameAt(timeline,elapsed.value))
const first = props.items[0]
const repeats = !props.connected && Boolean(first?.asset.motionJoinable && catClips[first.id].loop)
const images = new Map<string,{image: HTMLImageElement; layout: SpriteLayout}>()
let clock = 0
let animation = 0
let cancelled = false
let resize: ResizeObserver | undefined

function draw() {
  const area = stage.value
  const surface = canvas.value
  const state = sample.value
  const bitmap = state && images.get(state.entry.asset.id)
  if (!area || !surface || !state || !bitmap) return
  const width = area.clientWidth
  const height = area.clientHeight
  if (!width || !height) return
  const ratio = Math.min(window.devicePixelRatio || 1,2)
  const pixelWidth = Math.round(width*ratio), pixelHeight = Math.round(height*ratio)
  if (surface.width !== pixelWidth) surface.width = pixelWidth
  if (surface.height !== pixelHeight) surface.height = pixelHeight
  const ctx = surface.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio,0,0,ratio,0,0)
  ctx.clearRect(0,0,width,height)
  const rect = frameGeometry(bitmap.layout,state.frame,width,height,Math.min(44,width*0.16))
  const offset = props.connected ? Math.max(-rect.dx,Math.min(rect.dx,state.travel*24)) : 0
  ctx.drawImage(bitmap.image,rect.sx,rect.sy,rect.sw,rect.sh,rect.dx+offset,rect.dy,rect.dw,rect.dh)
}

function pause() {
  playing.value = false
  cancelAnimationFrame(animation)
}
function tick(now: number) {
  const position = now - clock
  elapsed.value = repeats ? position % timeline.duration : Math.min(position,timeline.duration)
  draw()
  if (!repeats && position >= timeline.duration) pause()
  else animation = requestAnimationFrame(tick)
}
function play() {
  if (playing.value || busy.value || error.value || !timeline.duration) return
  if (elapsed.value >= timeline.duration) elapsed.value = 0
  clock = performance.now() - elapsed.value
  playing.value = true
  animation = requestAnimationFrame(tick)
}
function seek(value: number) {
  pause()
  elapsed.value = value
  draw()
}

onMounted(async () => {
  resize = new ResizeObserver(draw)
  if (stage.value) resize.observe(stage.value)
  try {
    for (const {asset} of props.items) {
      if (images.has(asset.id)) continue
      const url = await (asset.imagePath ? mediaObjectUrl(asset.imagePath) : imageUrl(asset.id))
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        if (cancelled) return
        images.set(asset.id,{image,layout:fixedSpriteLayout(image,asset.frames,asset)})
      } finally { if (url.startsWith('blob:')) URL.revokeObjectURL(url) }
    }
    busy.value = false
    draw()
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play()
  } catch (err) {
    if (!cancelled) error.value = err instanceof Error ? err.message : '动作素材读取失败'
    busy.value = false
  }
})
onBeforeUnmount(() => { cancelled = true; pause(); resize?.disconnect(); images.clear() })
</script>

<template>
  <div ref="stage" class="motion-preview-stage" v-loading="busy">
    <canvas ref="canvas" role="img" :aria-label="sample ? catClips[sample.entry.id].label : '宠物动作预览'"></canvas>
  </div>
  <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon />
  <div v-else class="motion-preview-controls">
    <el-button size="small" :disabled="busy" @click="playing ? pause() : play()">{{ playing ? '暂停' : elapsed >= timeline.duration ? '重播' : '播放' }}</el-button>
    <input type="range" aria-label="动作播放进度" :disabled="busy" min="0" :max="timeline.duration" step="1" :value="elapsed" @input="seek(Number(($event.target as HTMLInputElement).value))" />
    <span>{{ (elapsed/1000).toFixed(1) }} / {{ (timeline.duration/1000).toFixed(1) }} 秒</span>
  </div>
  <p v-if="!busy && !error && sample" class="motion-preview-caption" data-testid="motion-preview-caption">{{ catClips[sample.entry.id].label }}</p>
</template>

<style scoped>
.motion-preview-stage { height: clamp(230px,46vh,398px); overflow: hidden; background: #f8f7f0; border: 1px solid #eeebd8; border-radius: 12px; }
canvas { display: block; width: 100%; height: 100%; }
.motion-preview-controls { display: flex; align-items: center; gap: 12px; margin-top: 14px; font-size: 12px; color: #626b76; }
.motion-preview-controls input { flex: 1; min-width: 40px; accent-color: #b48800; }
.motion-preview-caption { margin: 10px 0 0; font-weight: 600; color: #333b44; }
</style>

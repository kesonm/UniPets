<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted, nextTick, computed } from 'vue'
import { imageUrl, mediaObjectUrl } from '../lib/api'
import { createSpriteLayout, drawSpriteFrame, frameIndexAt, type SpriteLayout } from '../../shared/sprite-layout.mjs'
const props = withDefaults(defineProps<{ id?: string|null; alt?: string; frames?: number; columns?: number; rows?: number; fps?: number; width?: number; height?: number; animate?: boolean; playing?: boolean; frame?: number; fitContent?: boolean; imageVersion?: string; imagePath?: string; avoidClippedFrames?: boolean }>(), { frames: 1, animate: false, playing: true, frame: 0, fitContent: true, alt: '宠物照片' })
const emit = defineEmits<{ 'sprite-info': [SpriteLayout]; 'frame-change': [number]; 'load-error': [] }>()
const root = ref<HTMLElement>(), canvas = ref<HTMLCanvasElement>()
const url = ref(''), failed = ref(false), errorText = ref('')
const layout = ref<SpriteLayout|null>(null)
const isSprite = computed(()=>props.animate && props.frames > 1)
let version = 0, bitmap: HTMLImageElement|null = null, timer = 0, start = 0, cursor = 0
let observer: ResizeObserver|undefined
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
function stop() { cancelAnimationFrame(timer); timer=0 }
function release() { stop(); if(url.value.startsWith('blob:'))URL.revokeObjectURL(url.value);url.value='';bitmap=null;layout.value=null }
function draw() {
  if (!canvas.value || !bitmap || !layout.value || !root.value) return
  const width=root.value.clientWidth,height=root.value.clientHeight
  if(!width||!height)return
  const ratio=Math.min(window.devicePixelRatio||1,2)
  if(canvas.value.width!==Math.round(width*ratio))canvas.value.width=Math.round(width*ratio)
  if(canvas.value.height!==Math.round(height*ratio))canvas.value.height=Math.round(height*ratio)
  const context=canvas.value.getContext('2d');if(!context)return
  context.setTransform(ratio,0,0,ratio,0,0)
  const view=props.fitContent?layout.value:{...layout.value,cropTop:0,cropHeight:layout.value.frameHeight}
  drawSpriteFrame(context,bitmap,view,cursor,width,height)
  emit('frame-change',cursor)
}
function play() {
  stop()
  const order = layout.value?.loopFrames
  const count = order?.length ?? props.frames
  const first = order ? Math.max(0,order.indexOf(props.frame)) : props.frame
  cursor = order?.[first] ?? first
  start = 0
  draw()
  if(!isSprite.value||!props.playing||reducedMotion.matches)return
  const tick=(now:number)=>{
    if(!start)start=now
    const index=(first+frameIndexAt(now-start,count,props.fps))%count
    const next=order?.[index] ?? index
    if(next!==cursor&&!document.hidden){cursor=next;draw()}
    timer=requestAnimationFrame(tick)
  }
  timer=requestAnimationFrame(tick)
}
watch(()=>[props.id,props.frames,props.columns,props.rows,props.fps,props.animate,props.imageVersion,props.imagePath,props.avoidClippedFrames],async()=>{
  const current=++version;release();failed.value=false;errorText.value=''
  if(!props.id)return
  try {
    const src=await (props.imagePath ? mediaObjectUrl(props.imagePath) : imageUrl(props.id))
    if(current!==version){if(src.startsWith('blob:'))URL.revokeObjectURL(src);return}
    url.value=src
    if(isSprite.value){
      const image=new Image();image.src=src;await image.decode()
      if(current!==version)return
      const spriteLayout=createSpriteLayout(image,props.frames,{columns:props.columns,rows:props.rows,avoidClippedFrames:props.avoidClippedFrames})
      if (spriteLayout.loopFrames?.length===0) throw new Error('动作超出画面，完整帧不足')
      bitmap=image
      layout.value=spriteLayout
      emit('sprite-info',spriteLayout)
      await nextTick()
      if(current===version)play()
    }
  }catch(error){
    if(current===version){
      failed.value=true
      errorText.value=error instanceof Error?error.message:'图片不可用'
      emit('load-error')
    }
  }
},{immediate:true})
watch(()=>[props.playing,props.frame,props.fitContent],play)
onMounted(()=>{observer=new ResizeObserver(draw);if(root.value)observer.observe(root.value);reducedMotion.addEventListener('change',play)})
onBeforeUnmount(()=>{version++;release();observer?.disconnect();reducedMotion.removeEventListener('change',play)})
</script>
<template>
  <div ref="root" class="asset-image" :class="{ 'is-sprite': isSprite }" :data-crop-top="layout?.cropTop" :data-crop-height="layout?.cropHeight" :data-frame-width="layout?.frameWidth" :data-background="layout?.background">
    <span v-if="failed" role="status" :title="errorText">{{ errorText || '图片不可用' }}</span>
    <canvas v-else-if="url && isSprite" ref="canvas" role="img" :aria-label="alt" />
    <img v-else-if="url" :src="url" :alt="alt" />
    <span v-else>{{ id ? '加载中…' : '🐾' }}</span>
  </div>
</template>

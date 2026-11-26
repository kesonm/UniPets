<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onHide, onResize, onShow } from '@dcloudio/uni-app'
import { companionAction, companionBubble, tapCompanion } from '../lib/companion'
import { currentDeskPet, deskPetEnabled, deskPetPosition, saveDeskPetPosition } from '../lib/desk-pet'
import DeskPetStage from './DeskPetStage.vue'

const PET_SIZE = 84
const MARGIN_X = 8
const TAB_ROUTES = new Set([
  'pages/home/index',
  'pages/friends/index',
  'pages/orders/index',
  'pages/pets/index',
  'pages/account/index',
])

const active = ref(true)
const dragging = ref(false)
const stageRef = ref<InstanceType<typeof DeskPetStage> | null>(null)

function readBounds() {
  const info = uni.getWindowInfo?.()
  const width = info?.windowWidth || 375
  const height = info?.windowHeight || 667
  const statusBar = info?.statusBarHeight ?? 20
  const safeBottom = Math.max(0, height - (info?.safeArea?.bottom ?? height))
  const pages = getCurrentPages()
  const route = pages[pages.length - 1]?.route || ''
  const isTabPage = TAB_ROUTES.has(route)
  const minX = MARGIN_X
  const maxX = Math.max(minX, width - PET_SIZE - MARGIN_X)
  const minY = statusBar + 46
  const bottomReserve = (isTabPage ? 74 : 18) + safeBottom
  const maxY = Math.max(minY, height - PET_SIZE - bottomReserve)
  return { minX, maxX, minY, maxY }
}

function clamp(pos: { x: number; y: number }) {
  const b = readBounds()
  return {
    x: Math.min(b.maxX, Math.max(b.minX, pos.x)),
    y: Math.min(b.maxY, Math.max(b.minY, pos.y)),
  }
}

function defaultPos() {
  const b = readBounds()
  return { x: b.maxX - 4, y: Math.max(b.minY, b.maxY - 12) }
}

const pos = ref(clamp(deskPetPosition.value ?? defaultPos()))

const visible = computed(() => deskPetEnabled.value)
const bubbleBelow = computed(() => pos.value.y < 150)
const wrapStyle = computed(() => ({
  width: PET_SIZE + 'px',
  height: PET_SIZE + 'px',
  transform: `translate3d(${pos.value.x}px, ${pos.value.y}px, 0)`,
}))

let startTouchX = 0
let startTouchY = 0
let startPosX = 0
let startPosY = 0
let moved = false

function syncPosition() {
  pos.value = clamp(deskPetPosition.value ?? defaultPos())
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches?.[0]
  if (!touch) return
  dragging.value = true
  moved = false
  startTouchX = touch.clientX
  startTouchY = touch.clientY
  startPosX = pos.value.x
  startPosY = pos.value.y
}

function onTouchMove(event: TouchEvent) {
  if (!dragging.value) return
  const touch = event.touches?.[0]
  if (!touch) return
  const dx = touch.clientX - startTouchX
  const dy = touch.clientY - startTouchY
  if (!moved && Math.hypot(dx, dy) >= 6) moved = true
  pos.value = clamp({ x: startPosX + dx, y: startPosY + dy })
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  if (moved) {
    saveDeskPetPosition(pos.value)
  } else {
    tapCompanion()
  }
}

watch(deskPetPosition, (next) => {
  if (!dragging.value && next) pos.value = clamp(next)
})

onShow(() => {
  active.value = true
  syncPosition()
})
onHide(() => {
  active.value = false
  dragging.value = false
})
onResize(() => {
  syncPosition()
})
watch(
  () => companionAction.value?.nonce,
  () => {
    const action = companionAction.value?.key
    if (action) stageRef.value?.triggerAction(action)
  },
)
</script>

<template>
  <view
    v-if="visible"
    class="floating-desk-pet"
    :class="{ dragging }"
    :style="wrapStyle"
    aria-label="悬浮桌宠，可拖动"
    @touchstart="onTouchStart"
    @touchmove.stop.prevent="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <view v-if="companionBubble" class="desk-pet-bubble" :class="{ below: bubbleBelow }" role="status" aria-live="polite">{{ companionBubble }}</view>
    <view class="desk-pet-shadow" />
    <DeskPetStage ref="stageRef" :pet="currentDeskPet" :size="PET_SIZE" :paused="!active" />
  </view>
</template>

<style scoped>
.floating-desk-pet {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  will-change: transform;
}
.floating-desk-pet.dragging {
  opacity: 0.94;
}
.desk-pet-shadow {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 48px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(64, 46, 20, 0.22), rgba(64, 46, 20, 0) 72%);
  transform: translateX(-50%);
  pointer-events: none;
}
.desk-pet-bubble {
  position: absolute;
  bottom: calc(100% - 2px);
  left: 50%;
  max-width: 240px;
  padding: 5px 10px;
  border: 1px solid #f0d77d;
  border-radius: 13px;
  background: #fff8da;
  color: #5a4010;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  transform: translateX(-50%);
  box-shadow: 0 3px 10px rgba(56, 40, 12, 0.14);
  pointer-events: none;
}
.desk-pet-bubble.below {
  top: calc(100% - 2px);
  bottom: auto;
}
</style>

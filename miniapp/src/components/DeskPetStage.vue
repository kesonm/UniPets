<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { DeskPetActionSpec, SystemDeskPetSpec } from '../../../shared/desk-pets.mjs'

const props = withDefaults(
  defineProps<{
    pet: SystemDeskPetSpec
    size?: number
    paused?: boolean
  }>(),
  { size: 84, paused: false },
)

const emit = defineEmits<{
  actionChange: [action: DeskPetActionSpec]
}>()

const actionIndex = ref(0)
const repeatIndex = ref(0)
const frameIndex = ref(0)

const currentAction = computed(() => props.pet.actions[actionIndex.value] ?? props.pet.actions[0])

let timer: ReturnType<typeof setTimeout> | undefined

function stop() {
  if (timer) clearTimeout(timer)
  timer = undefined
}

function scheduleNext() {
  stop()
  if (props.paused) return
  const action = currentAction.value
  if (!action || action.frames < 1) return
  const interval = Math.round(1000 / Math.max(1, Math.min(24, action.fps || 4)))
  timer = setTimeout(() => {
    if (props.paused) return
    const nextFrame = frameIndex.value + 1
    if (nextFrame < action.frames) {
      frameIndex.value = nextFrame
    } else {
      frameIndex.value = 0
      const nextRepeat = repeatIndex.value + 1
      if (nextRepeat < Math.max(1, action.repeats || 1)) {
        repeatIndex.value = nextRepeat
      } else {
        repeatIndex.value = 0
        actionIndex.value = (actionIndex.value + 1) % props.pet.actions.length
        emit('actionChange', props.pet.actions[actionIndex.value] ?? props.pet.actions[0])
      }
    }
    scheduleNext()
  }, interval)
}

function triggerAction(key?: string) {
  const index = key ? props.pet.actions.findIndex((item) => item.key === key) : props.pet.actions.length > 1 ? 1 : 0
  const target = index >= 0 ? index : 0
  actionIndex.value = target
  repeatIndex.value = 0
  frameIndex.value = 0
  if (props.pet.actions[target]) emit('actionChange', props.pet.actions[target])
  scheduleNext()
}

defineExpose({ triggerAction })

watch(
  () => props.pet.id,
  () => {
    actionIndex.value = 0
    repeatIndex.value = 0
    frameIndex.value = 0
    if (currentAction.value) emit('actionChange', currentAction.value)
    scheduleNext()
  },
  { immediate: true },
)

watch(
  () => props.paused,
  (paused) => {
    if (paused) stop()
    else scheduleNext()
  },
)

onUnmounted(stop)

function sheetStyle(action: DeskPetActionSpec, index: number) {
  const active = index === actionIndex.value
  const f = active ? frameIndex.value : 0
  const col = f % action.columns
  const row = Math.floor(f / action.columns)
  return {
    width: action.columns * props.size + 'px',
    height: action.rows * props.size + 'px',
    transform: `translate3d(${-col * props.size}px, ${-row * props.size}px, 0)`,
    opacity: active ? 1 : 0,
  }
}
</script>

<template>
  <view class="desk-pet-stage" :style="{ width: size + 'px', height: size + 'px' }">
    <image
      v-for="(action, index) in pet.actions"
      :key="pet.id + ':' + action.key"
      class="desk-pet-sheet"
      :src="action.sheet"
      mode="scaleToFill"
      :style="sheetStyle(action, index)"
    />
  </view>
</template>

<style scoped>
.desk-pet-stage {
  position: relative;
  overflow: hidden;
  flex: none;
  pointer-events: none;
}
.desk-pet-sheet {
  position: absolute;
  left: 0;
  top: 0;
  max-width: none;
  will-change: transform;
}
</style>

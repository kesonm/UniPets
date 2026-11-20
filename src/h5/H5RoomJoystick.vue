<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { landscapeOffset, type ScreenPoint } from './pet-room-layout'

const props = defineProps<{enabled:boolean;rotated:boolean}>()
const emit = defineEmits<{move:[ScreenPoint]}>()
const stick = ref<HTMLButtonElement>()
const knob = ref<ScreenPoint>({x:0,y:0})
const held = ref(false)
let contact: number|undefined

function update(event:PointerEvent) {
  const button = stick.value
  if (!button || contact!==event.pointerId) return
  const {left,top,width,height} = button.getBoundingClientRect()
  const {x,y} = landscapeOffset(event.clientX-left-width/2,event.clientY-top-height/2,props.rotated)
  const distance = Math.hypot(x,y), radius = button.clientWidth*.29
  const fraction = Math.min(1,distance/Math.max(1,radius))
  const magnitude = Math.max(0,(fraction-.13)/.87)
  const dx = x/Math.max(1,distance), dy = y/Math.max(1,distance)
  knob.value={x:dx*fraction*radius,y:dy*fraction*radius}
  emit('move',{x:dx*magnitude,y:dy*magnitude})
}

function begin(event:PointerEvent) {
  if (!props.enabled || contact!==undefined || event.button!==0) return
  contact=event.pointerId
  held.value=true
  stick.value?.setPointerCapture(event.pointerId)
  update(event)
}

function reset() {
  if (contact===undefined) return
  const id = contact
  contact=undefined
  if (stick.value?.hasPointerCapture(id)) stick.value.releasePointerCapture(id)
  held.value=false
  knob.value={x:0,y:0}
  emit('move',knob.value)
}

function finish(event:PointerEvent) {if (event.pointerId===contact) reset()}
watch([()=>props.enabled,()=>props.rotated],reset)
onMounted(()=>{
  window.addEventListener('blur',reset)
  document.addEventListener('visibilitychange',reset)
})
onBeforeUnmount(()=>{
  window.removeEventListener('blur',reset)
  document.removeEventListener('visibilitychange',reset)
  reset()
})
</script>

<template>
  <button ref="stick" type="button" class="room-joystick" :class="{'is-held':held}" :disabled="!enabled"
    aria-label="移动摇杆，键盘可使用方向键或 WASD" @pointerdown="begin" @pointermove="update"
    @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish">
    <span class="room-joystick-guides" aria-hidden="true" />
    <span class="room-joystick-knob" aria-hidden="true"
      :style="{transform:`translate(calc(-50% + ${knob.x}px),calc(-50% + ${knob.y}px))`}" />
  </button>
</template>

<style scoped>
.room-joystick { display: block; width: clamp(92px,28vmin,134px); aspect-ratio: 1; border: 1px solid #fffefaac; border-radius: 50%; background: #fff8e86d; box-shadow: inset 0 0 0 1px #876d4660, 0 5px 21px #62482717; touch-action: none; cursor: grab; }
.room-joystick.is-held { background: #fff8e876; cursor: grabbing; }
.room-joystick-guides { position: absolute; inset: 8%; border: 1px solid #9d825834; border-radius: 50%; pointer-events: none; background: radial-gradient(circle at 50% 8%,#8c73479b 1.5px,transparent 2.5px),radial-gradient(circle at 50% 92%,#8c73479b 1.5px,transparent 2.5px),radial-gradient(circle at 8% 50%,#8c73479b 1.5px,transparent 2.5px),radial-gradient(circle at 92% 50%,#8c73479b 1.5px,transparent 2.5px); }
.room-joystick-knob { position: absolute; top: 50%; left: 50%; width: 43%; aspect-ratio: 1; border: 1px solid #fffdf2bd; border-radius: 50%; pointer-events: none; background: linear-gradient(145deg,#fff5e2e5,#d8be88b3); box-shadow: 0 3px 12px #5a47243d,inset 0 0 0 1px #b19b7352; transition: transform .14s ease-out; }
.room-joystick.is-held .room-joystick-knob { transition: none; }
@media (prefers-reduced-motion: reduce) { .room-joystick-knob { transition: none; } }
</style>

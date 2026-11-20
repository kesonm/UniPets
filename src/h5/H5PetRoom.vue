<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, MoonNight, RefreshLeft, Sunrise, Top } from '@element-plus/icons-vue'
import type { CatClipId } from '../../shared/cat-motion.mjs'
import { api } from '../lib/api'
import type { MotionPreviewAsset } from '../lib/types'
import H5RoomJoystick from './H5RoomJoystick.vue'
import { defaultRoomView, interpolatePoint, landscapeOffset, orbitRoom, roomCamera, roomDistance, startPoint, zoomRoom,
  type GroundPoint, type ScreenPoint } from './pet-room-layout'
import { createRoomPlayer, loadRoomSprite, roomActionClips, roomCapabilities, type RoomActivity, type RoomSprites } from './pet-room-motion'
import { createRoomRenderer } from './pet-room-renderer'

const props = defineProps<{petId:string;petName:string}>()
const emit = defineEmits<{exit:[]}>()
const scene = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const sceneReady = ref(false)
const sceneError = ref(false)
const contextLost = ref(false)
const loading = ref(true)
const viewChanged = ref(false)
const dragging = ref(false)
const capabilities = ref({walk:false,jump:false,rest:false})
const activity = ref<RoomActivity>('idle')
const sleeping = computed(()=>activity.value==='sleeping')
const performing = computed(()=>['jumping','settling','waking'].includes(activity.value))
const activityLabels:Record<RoomActivity,string> = {
  idle:'待机中',walking:'走动中',jumping:'跳跃中',settling:'趴下中',sleeping:'趴睡中',waking:'起身中',
}
const status = computed(() => {
  if (sceneError.value) return '当前浏览器无法显示 3D 空间'
  if (contextLost.value) return '正在恢复画面'
  if (loading.value && !capabilities.value.walk) return '正在加载动作'
  if (!capabilities.value.walk) return '走路素材暂不可用'
  return activityLabels[activity.value]
})

const portrait = window.matchMedia('(orientation: portrait)')
const rotated = ref(portrait.matches)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const view = {...defaultRoomView}
let focus = startPoint
let camera = roomCamera(view,1)
let renderer: ReturnType<typeof createRoomRenderer>|undefined
let resize: ResizeObserver|undefined
const sprites: RoomSprites = new Map()
const player = createRoomPlayer(sprites)
const {actor} = player
let revision = 0
let raf = 0, lastTick = 0
let dirty = true
let marker: {point:GroundPoint;elapsed:number}|undefined
let moveTarget: GroundPoint|undefined
const center = {x:0,y:0}
const still = {x:0,z:0}
let stick = center
const heldKeys = new Set<string>()
const movementKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'])

async function load() {
  const version = ++revision
  loading.value=true
  try {
    const {assets} = await api<{assets:(MotionPreviewAsset & {action:CatClipId})[]}>(`/h5/demo-pets/${props.petId}/room`)
    const available = new Map(assets.map(asset=>[asset.action,asset]))
    const pending = roomActionClips.flatMap(clip=>{
      const asset=available.get(clip)
      return asset && !sprites.has(clip) ? [asset] : []
    })
    for (let start=0;start<pending.length && version===revision;) {
      const batch = pending.slice(start,start+(start===0 ? 1 : 4))
      const results = await Promise.allSettled(batch.map(loadRoomSprite))
      if (revision!==version) return
      results.forEach((result,i)=>{
        if (result.status==='fulfilled') sprites.set(batch[i].action,result.value)
      })
      capabilities.value=roomCapabilities(sprites)
      start+=batch.length
    }
  } catch {
    // The room stays open so the user can retry the still-missing assets.
  } finally {
    if (revision===version) loading.value=false
  }
}

function updateCamera() {
  const element = canvas.value
  if (!element) return
  camera=roomCamera(view,element.width/element.height,focus)
  dirty=true
}

function resizeRoom() {
  const element = canvas.value
  if (!element) return
  const w = element.clientWidth, h = element.clientHeight
  if (!w || !h) return
  const ratio = Math.min(2,window.devicePixelRatio||1,Math.sqrt(2_200_000/(w*h)))
  const width = Math.round(w*ratio), height = Math.round(h*ratio)
  if (element.width!==width) element.width=width
  if (element.height!==height) element.height=height
  updateCamera()
}

function changeOrbit(dx:number,dy:number) {
  orbitRoom(view,dx,dy)
  viewChanged.value=true
  updateCamera()
}

function changeZoom(factor:number) {
  zoomRoom(view,factor)
  viewChanged.value=true
  updateCamera()
}

function resetView() {
  Object.assign(view,defaultRoomView)
  viewChanged.value=false
  updateCamera()
}

function setStick(next:ScreenPoint) {
  stick=next
  if (Math.hypot(next.x,next.y)>.02) moveTarget=undefined
}

function wantedDirection():GroundPoint {
  if (!capabilities.value.walk) return still
  const left = heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')
  const right = heldKeys.has('KeyD') || heldKeys.has('ArrowRight')
  const forward = heldKeys.has('KeyW') || heldKeys.has('ArrowUp')
  const back = heldKeys.has('KeyS') || heldKeys.has('ArrowDown')
  const keyboard = {x:Number(right)-Number(left),y:Number(back)-Number(forward)}
  const length = Math.hypot(keyboard.x,keyboard.y)
  if (length) return camera.groundDirection({x:keyboard.x/length,y:keyboard.y/length})
  if (Math.hypot(stick.x,stick.y)>.02) return camera.groundDirection(stick)
  if (!moveTarget) return still
  const dx = moveTarget.x-actor.point.x, dz = moveTarget.z-actor.point.z
  const distance = Math.hypot(dx,dz)
  if (distance<=.17) {moveTarget=undefined;return still}
  const scale = Math.min(1,distance*1.18)/distance
  return {x:dx*scale,z:dz*scale}
}

function command(intent:'jump'|'rest') {
  if (!sceneReady.value || !capabilities.value[intent] || performing.value) return
  const direction = wantedDirection()
  if (intent==='rest') moveTarget=undefined
  player.action(intent,direction,camera)
  dirty=true
}

function tick(now:number) {
  const delta = lastTick ? Math.min(48,now-lastTick) : 0
  lastTick=now
  if (renderer) {
    const {point,height,frame,sprite,flip} = actor
    activity.value=player.update(delta,wantedDirection(),camera,reducedMotion.matches)
    dirty ||= point!==actor.point || height!==actor.height || frame!==actor.frame || sprite!==actor.sprite || flip!==actor.flip
    if (roomDistance(focus,actor.point)>.012) {
      focus=interpolatePoint(focus,actor.point,1-Math.exp(-delta/120))
      updateCamera()
    }
    if (marker) {
      marker.elapsed+=delta
      if (marker.elapsed>=900) marker=undefined
      dirty=true
    }
    if (dirty) {renderer.draw(camera,actor,marker);dirty=false}
  }
  raf=requestAnimationFrame(tick)
}

type ViewContact = {start:ScreenPoint;point:ScreenPoint;orbit:boolean}
const contacts = new Map<number,ViewContact>()
let tapId: number|undefined
const distance = (a:ScreenPoint,b:ScreenPoint) => Math.hypot(a.x-b.x,a.y-b.y)

function logicalPoint(event:PointerEvent):ScreenPoint {
  const bounds = scene.value!.getBoundingClientRect()
  return landscapeOffset(event.clientX-(rotated.value?bounds.right:bounds.left),event.clientY-bounds.top,rotated.value)
}

function tiltSpan() {
  const [a,b] = [...contacts.values()].filter(contact=>contact.orbit)
  return a && b ? distance(a.point,b.point) : 0
}

function beginPointer(event:PointerEvent) {
  const element = canvas.value
  if (!sceneReady.value || !element || event.button!==0) return
  const point = logicalPoint(event)
  tapId=contacts.size ? undefined : event.pointerId
  contacts.set(event.pointerId,{start:point,point,orbit:point.x>=element.clientWidth/2})
  element.setPointerCapture(event.pointerId)
}

function movePointer(event:PointerEvent) {
  const contact = contacts.get(event.pointerId)
  if (!contact) return
  const point = logicalPoint(event), previous = contact.point, priorSpan = tiltSpan()
  contact.point=point
  if (priorSpan>0) {
    const span = tiltSpan()
    if (span>0) changeZoom(priorSpan/span)
    dragging.value=true
    return
  }
  const isTap = tapId===event.pointerId
  if (isTap && distance(contact.start,point)<6) return
  tapId=undefined
  if (!contact.orbit || contacts.size>1) return
  const from = isTap ? contact.start : previous
  dragging.value=true
  changeOrbit((point.x-from.x)*.008,(point.y-from.y)*.007)
}

function finishPointer(event:PointerEvent) {
  const contact = contacts.get(event.pointerId)
  if (!contact) return
  contacts.delete(event.pointerId)
  const steering = Math.hypot(stick.x,stick.y)>.02 || heldKeys.size>0
  if (event.type==='pointerup' && tapId===event.pointerId && !steering && capabilities.value.walk && canvas.value) {
    const point = logicalPoint(event), {clientWidth,clientHeight} = canvas.value
    if (distance(contact.start,point)<6) {
      const target = camera.groundAt(point.x/clientWidth*2-1,1-point.y/clientHeight*2)
      if (target) {moveTarget=target;marker={point:target,elapsed:0}}
    }
  }
  tapId=undefined
  if (!contacts.size) dragging.value=false
}

function wheel(event:WheelEvent) {
  if (!sceneReady.value) return
  event.preventDefault()
  const delta = event.deltaY*(event.deltaMode===1 ? 18 : event.deltaMode===2 ? 120 : 1)
  changeZoom(Math.exp(Math.max(-160,Math.min(160,delta))*.0017))
}

function keyDown(event:KeyboardEvent) {
  if (event.key==='Escape') {event.preventDefault();emit('exit');return}
  if (!sceneReady.value || event.metaKey || event.ctrlKey || event.altKey) return
  if (movementKeys.has(event.code)) {
    event.preventDefault()
    heldKeys.add(event.code)
    moveTarget=undefined
  } else if (event.code==='Space' && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault()
    if (!event.repeat) command('jump')
  } else if (event.key==='+' || event.key==='=') changeZoom(.89)
  else if (event.key==='-') changeZoom(1.12)
}

function keyUp(event:KeyboardEvent) {heldKeys.delete(event.code)}

function clearInput() {
  heldKeys.clear()
  contacts.clear()
  stick=center
  tapId=undefined
  moveTarget=undefined
  dragging.value=false
}

function orientationChanged() {
  rotated.value=portrait.matches
  clearInput()
}

function setupRenderer() {
  if (!canvas.value) return
  contextLost.value=false
  try {
    renderer=createRoomRenderer(canvas.value)
    resizeRoom()
    sceneReady.value=true
    sceneError.value=false
    if (!revision) void load()
  } catch {
    sceneReady.value=false
    sceneError.value=true
  }
}

function loseContext() {
  contextLost.value=true
  sceneReady.value=false
  renderer=undefined
  clearInput()
}

onMounted(()=>{
  if (!canvas.value) return
  resize=new ResizeObserver(resizeRoom)
  resize.observe(canvas.value)
  setupRenderer()
  raf=requestAnimationFrame(tick)
  portrait.addEventListener('change',orientationChanged)
  window.addEventListener('keydown',keyDown)
  window.addEventListener('keyup',keyUp)
  window.addEventListener('blur',clearInput)
  document.addEventListener('visibilitychange',clearInput)
})
onBeforeUnmount(()=>{
  revision++
  cancelAnimationFrame(raf)
  resize?.disconnect()
  renderer?.dispose()
  sprites.clear()
  portrait.removeEventListener('change',orientationChanged)
  window.removeEventListener('keydown',keyDown)
  window.removeEventListener('keyup',keyUp)
  window.removeEventListener('blur',clearInput)
  document.removeEventListener('visibilitychange',clearInput)
})
</script>

<template>
  <main class="h5-room" :aria-label="petName+'的横屏 3D 宠物空间'">
    <div ref="scene" class="h5-room-scene" :class="{'is-dragging':dragging}">
      <canvas ref="canvas" role="img" :aria-label="petName+'在超平坦场景中，拖动右侧转动视角'" :tabindex="sceneReady ? 0 : -1"
        @pointerdown="beginPointer" @pointermove="movePointer" @pointerup="finishPointer" @pointercancel="finishPointer"
        @lostpointercapture="finishPointer" @contextmenu.prevent @wheel="wheel"
        @webglcontextlost.prevent="loseContext" @webglcontextrestored="setupRenderer" />

      <div class="room-hud">
        <button type="button" class="room-back" aria-label="退出宠物空间" @click="emit('exit')"><el-icon aria-hidden="true"><ArrowLeft /></el-icon> 返回</button>
        <div class="room-pet"><h1>{{ petName }}</h1><span class="h5-room-status" role="status">{{ status }}</span></div>
      </div>
      <div v-if="sceneReady" class="room-view-tools">
        <span>拖动右半屏转动视角</span>
        <button type="button" class="h5-room-reset" aria-label="复位视角" :disabled="!viewChanged" @click="resetView">
          <el-icon aria-hidden="true"><RefreshLeft /></el-icon>
        </button>
      </div>

      <H5RoomJoystick class="h5-room-joystick" :enabled="sceneReady && capabilities.walk" :rotated="rotated" @move="setStick" />
      <div class="h5-room-actions" role="group" aria-label="宠物动作">
        <button type="button" class="room-action" :disabled="!sceneReady || !capabilities.rest || performing" @click="command('rest')">
          <el-icon aria-hidden="true"><component :is="sleeping ? Sunrise : MoonNight" /></el-icon>{{ sleeping?'起身':'趴睡' }}
        </button>
        <button type="button" class="room-action room-jump" :disabled="!sceneReady || !capabilities.jump || performing || sleeping" @click="command('jump')">
          <el-icon aria-hidden="true"><Top /></el-icon>跳跃
        </button>
      </div>
      <button v-if="sceneReady && !loading && (!capabilities.walk || !capabilities.rest || !capabilities.jump)"
        type="button" class="room-retry" @click="load">重新加载动作</button>
    </div>
  </main>
</template>

<style scoped>
.h5-room { position: fixed; z-index: 70; inset: 0; overflow: hidden; overscroll-behavior: none; color: #493b27; background: #f3e8d2; }
.h5-room-scene { --safe-top: env(safe-area-inset-top,0px); --safe-right: env(safe-area-inset-right,0px); --safe-bottom: env(safe-area-inset-bottom,0px); --safe-left: env(safe-area-inset-left,0px); --gap: clamp(12px,3.9vmin,28px); position: absolute; inset: 0; isolation: isolate; width: 100%; height: 100%; overflow: hidden; background: linear-gradient(180deg,#fff9eb 0%,#f1e5cc 59%,#e1cda7 100%); touch-action: none; }
.h5-room-scene canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
.h5-room-scene.is-dragging canvas { cursor: grabbing; }
.h5-room-scene canvas:focus-visible { outline: 2px solid #967230; outline-offset: -3px; }
.h5-room-scene button { touch-action: none; -webkit-tap-highlight-color: transparent; }
.room-hud,.room-view-tools { display: flex; align-items: center; gap: 9px; position: absolute; top: calc(var(--safe-top) + var(--gap)); }
.room-hud { left: calc(var(--safe-left) + var(--gap)); }
.room-back,.h5-room-reset,.room-pet,.room-view-tools > span,.room-retry { border: 1px solid #fffdf3bd; border-radius: 999px; background: #fffaf0bd; box-shadow: 0 3px 14px #5e472218; color: #533e23; }
.room-back,.h5-room-reset,.room-retry { cursor: pointer; }
.room-back,.h5-room-reset { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; padding: 0 13px; font-size: 13px; font-weight: 750; }
.room-back:active,.h5-room-reset:active,.room-retry:active { background: #fff6dd; }
.room-pet { display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 4px 13px 4px 14px; }
.room-pet h1 { margin: 0; max-width: 28vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; line-height: 1; }
.h5-room-status { display: inline-flex; align-items: center; gap: 4px; color: #655445; font-size: 11px; font-weight: 700; white-space: nowrap; }
.h5-room-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #69815b; }
.room-view-tools { right: calc(var(--safe-right) + var(--gap)); pointer-events: none; }
.room-view-tools > span { padding: 7px 10px; font-size: 11px; font-weight: 700; }
.h5-room-reset { width: 44px; padding: 0; pointer-events: auto; font-size: 17px; }
.h5-room-joystick { position: absolute; left: calc(var(--safe-left) + var(--gap) + 6px); bottom: calc(var(--safe-bottom) + var(--gap) + 4px); }
.h5-room-actions { position: absolute; right: calc(var(--safe-right) + var(--gap) + 6px); bottom: calc(var(--safe-bottom) + var(--gap) + 4px); display: flex; align-items: flex-end; gap: 11px; pointer-events: none; }
.room-action { display: grid; place-content: center; justify-items: center; gap: 3px; width: clamp(60px,16vmin,78px); aspect-ratio: 1; padding: 0; border: 1px solid #fffdf2bc; border-radius: 50%; background: #fffaeb9c; color: #514023; box-shadow: inset 0 0 0 1px #a1824e46,0 4px 16px #5a422225; font-size: 11px; font-weight: 750; pointer-events: auto; cursor: pointer; }
.room-action .el-icon { font-size: clamp(19px,5vmin,25px); }
.room-jump { width: clamp(68px,19vmin,89px); background: #ffe69fbf; }
.room-action:active:not(:disabled) { background: #ffedb0; transform: scale(.96); }
.room-retry { position: absolute; inset: auto auto calc(var(--safe-bottom) + var(--gap)) 50%; transform: translateX(-50%); min-height: 38px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
@media (orientation: portrait) {
  .h5-room-scene { --safe-top: env(safe-area-inset-right,0px); --safe-right: env(safe-area-inset-bottom,0px); --safe-bottom: env(safe-area-inset-left,0px); --safe-left: env(safe-area-inset-top,0px); inset: 50% auto auto 50%; width: 100vh; height: 100vw; width: 100dvh; height: 100dvw; transform: translate(-50%,-50%) rotate(90deg); }
}
</style>

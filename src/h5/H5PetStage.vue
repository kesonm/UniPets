<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { catClips, catDefaultAction, catIdleGroups, catSleepAction, type CatClipId } from '../../shared/cat-motion.mjs'
import AssetImage from '../components/AssetImage.vue'
import { api } from '../lib/api'
import type { Asset, MotionPreviewAsset } from '../lib/types'
import H5Avatar from './H5Avatar.vue'
import type { CloudPet } from './types'

const props = defineProps<{pet:CloudPet;assets:Asset[];loading:boolean}>()
const emit = defineEmits<{motions:[]}>()

const idleActions: readonly (CatClipId|'idle'|'sleep')[] = [
  ...catIdleGroups.map(group => group.base), catDefaultAction, 'stand_idle', 'idle',
  'front_sleep', catSleepAction, 'sleep_breathe', 'sleep',
]
const sharedAssets = ref<MotionPreviewAsset[]>([])
const loadingShared = ref(props.pet.shared)
const libraryFailed = ref(false)
const spriteFailed = ref(false)
const ready = ref(false)
const playing = ref(true)
const startFrame = ref(0)
let displayedFrame = 0

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(motionPreference.matches)
function updateMotionPreference(event: MediaQueryListEvent) { reducedMotion.value = event.matches }

const idle = computed(() => {
  const assets: MotionPreviewAsset[] = props.pet.shared ? sharedAssets.value : props.assets.filter(asset => asset.kind==='sprite')
  for (const action of idleActions) {
    const matches = assets.filter(asset => asset.action===action && asset.frames>1)
    const asset = matches.find(item => item.motionJoinable) ?? matches[0]
    if (asset) {
      const label = action==='idle' ? '待机呼吸' : action==='sleep' ? '趴睡呼吸' : catClips[action].label
      return {asset,label}
    }
  }
})

const status = computed(() => {
  if (ready.value) return reducedMotion.value ? '静态预览' : playing.value ? '待机中' : '已暂停'
  if (libraryFailed.value || spriteFailed.value) return '动作暂不可用'
  if (loadingShared.value || props.loading || idle.value) return '正在加载待机动作…'
  return '暂无待机动作'
})

watch([() => idle.value?.asset.id,() => idle.value?.asset.imageVersion], () => {
  ready.value = false
  spriteFailed.value = false
  startFrame.value = 0
  displayedFrame = 0
})

function onFrame(frame:number) {
  displayedFrame = frame
  ready.value = true
}

function togglePlayback() {
  startFrame.value = displayedFrame
  playing.value = !playing.value
}

onMounted(async () => {
  motionPreference.addEventListener('change',updateMotionPreference)
  if (!props.pet.shared) return
  try {
    const {assets} = await api<{assets:MotionPreviewAsset[]}>(`/h5/demo-pets/${props.pet.id}/motions`)
    sharedAssets.value = assets
  } catch {
    libraryFailed.value = true
  } finally {
    loadingShared.value = false
  }
})
onBeforeUnmount(() => motionPreference.removeEventListener('change',updateMotionPreference))
</script>

<template>
  <div class="h5-pet-stage">
    <div class="h5-stage-scene">
      <AssetImage v-if="idle && !spriteFailed" class="h5-stage-sprite" :class="{'is-ready':ready}"
        :id="idle.asset.id" :image-path="idle.asset.imagePath" :image-version="idle.asset.imageVersion"
        :alt="pet.name+' · '+idle.label" :frames="idle.asset.frames" :columns="idle.asset.columns" :rows="idle.asset.rows"
        :fps="idle.asset.fps" :playing="playing && !reducedMotion" :frame="startFrame"
        :avoid-clipped-frames="Boolean(idle.asset.backgroundRemoved)" animate
        @frame-change="onFrame" @load-error="spriteFailed=true" />
      <H5Avatar v-if="!ready" class="h5-stage-cover" :pet="pet" />
    </div>
    <div class="h5-stage-caption">
      <div class="h5-stage-status" role="status">
        <span v-if="ready && playing && !reducedMotion" class="h5-stage-indicator" aria-hidden="true"></span>
        <span>{{ status }}<template v-if="ready && idle"> · {{ idle.label }}</template></span>
      </div>
      <button v-if="ready && !reducedMotion" class="h5-stage-control" type="button"
        :aria-label="playing ? '暂停待机动作' : '播放待机动作'" @click="togglePlayback">
        <el-icon aria-hidden="true"><component :is="playing ? VideoPause : VideoPlay" /></el-icon>
        {{ playing ? '暂停' : '播放' }}
      </button>
      <button v-else-if="!pet.shared && !loading && assets.some(asset=>asset.kind==='sprite')" class="h5-stage-control" type="button"
        @click="emit('motions')">查看动作素材</button>
    </div>
  </div>
</template>

<style scoped>
.h5-pet-stage { grid-column: 1 / -1; min-width: 0; }
.h5-stage-scene {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  overflow: hidden;
  height: clamp(224px,40dvh,336px);
  border: 1px solid #f2e5b8;
  border-radius: 17px;
  background: linear-gradient(180deg,transparent 76%,#f6e2aa 76%,#faefcc 100%),
    radial-gradient(ellipse at 28% 2%,#fffdf3 6%,#f8ebbe 100%);
}
.h5-stage-scene::before {
  content: '';
  position: absolute;
  inset: 8% 18% 24%;
  z-index: -1;
  border: 1px solid #fff9e7;
  border-bottom: 0;
  border-radius: 50% 50% 0 0 / 52% 52% 0 0;
  background: linear-gradient(155deg,#fffdf5,#fff7db 70%,#f9ebbc);
  box-shadow: 0 0 28px #fffdf184;
}
.h5-stage-scene::after {
  content: '';
  position: absolute;
  bottom: 11%;
  width: 62%;
  height: 14%;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(ellipse,#9d773043,transparent 72%);
}
.h5-stage-sprite.asset-image {
  position: absolute;
  bottom: 10%;
  width: min(100%,355px);
  height: 86%;
  visibility: hidden;
  background: transparent;
}
.h5-stage-sprite.is-ready { visibility: visible; }
.h5-stage-cover.h5-avatar-picture {
  width: min(62%,158px);
  border: 4px solid #fffcf1;
  border-radius: 50%;
  background: #fffae8;
  color: #987535;
  font-size: 36px;
  box-shadow: 0 8px 22px #84672818;
}
.h5-stage-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  margin-top: 8px;
}
.h5-stage-status { display: flex; align-items: center; gap: 8px; color: #665833; font-size: 12px; font-weight: 650; }
.h5-stage-indicator { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #6e8a4c; }
.h5-stage-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid #ede3c8;
  border-radius: 12px;
  background: #fffaf0;
  color: #674b04;
  white-space: nowrap;
  cursor: pointer;
}
.h5-pet-stage .h5-stage-control { font-size: 12px; font-weight: 700; }
.h5-stage-control .el-icon { font-size: 16px; }
</style>

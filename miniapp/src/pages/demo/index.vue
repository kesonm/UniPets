<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DemoPet } from '../../../../src/h5/types'
import type { MotionPreviewAsset } from '../../../../src/lib/types'
import { api, publicImage, speciesNames } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
import MotionPlayer from '../../components/MotionPlayer.vue'
const pets = ref<DemoPet[]>([]),
  selected = ref(''),
  clips = ref<MotionPreviewAsset[]>([]),
  clipId = ref(''),
  room = ref(false)
const clip = computed(() => clips.value.find((c) => c.id === clipId.value) || clips.value[0])
const { loading, error, refresh } = pageLoad(async () => {
  pets.value = (await api<{ pets: DemoPet[] }>('/h5/demo-pets')).pets
})
const { run, busy, error: actionError } = submitAction()
function open(p: DemoPet, interactive: boolean) {
  return run(async () => {
    selected.value = p.id
    room.value = interactive
    clips.value = []
    clipId.value = ''
    clips.value = (
      await api<{ assets: MotionPreviewAsset[] }>(
        '/h5/demo-pets/' + p.id + (interactive ? '/room' : '/motions'),
      )
    ).assets
  })
}
</script>
<template>
  <view class="screen">
    <LoadState :error="error" :loading="loading" @retry="refresh" />
    <text v-if="!loading && !error && !pets.length" class="empty">还没有共享宠物</text>
    <view v-for="p in pets" :key="p.id" class="card">
      <image
        v-if="p.hasCover"
        class="photo"
        mode="aspectFill"
        :src="publicImage('/h5/demo-pets/' + p.id + '/cover')"
      />
      <text class="heading">{{ p.name }}</text>
      <text class="sub">{{ speciesNames[p.species] }} · {{ p.breed || '共享档案' }}</text>
      <view class="actions">
        <button :disabled="busy" @tap="open(p, false)">查看已有动作</button>
        <button v-if="p.interactiveRoom" :disabled="busy" @tap="open(p, true)">进入互动房间</button>
      </view>
      <view v-if="selected === p.id" class="stack">
        <text v-if="actionError" class="error">{{ actionError }}</text>
        <template v-if="clip">
          <text v-if="room" class="sub">拖动宠物可以移动位置，点下方动作切换。</text>
          <MotionPlayer :clip="clip" :movable="room" />
          <view class="chips">
            <button v-for="c in clips" :key="c.id" class="chip" @tap="clipId = c.id">
              {{ c.name }}
            </button>
          </view>
        </template>
        <text v-else-if="!busy && !actionError" class="empty">暂无可播放的动作</text>
      </view>
    </view>
  </view>
</template>

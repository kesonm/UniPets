<script setup lang="ts">
import { ref } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import type { ServiceCoordinates } from '../../../../shared/h5-discovery.mjs'
import type { District } from '../../../../shared/h5-districts.mjs'
import { api, go } from '../../lib/client'
import { deviceCoordinates, enableLocation } from '../../lib/district'
import { browseDistrict, mapPickerRequest, releaseMapPicker, saveBrowseLocation, selectedLocation, type MapLocation } from '../../lib/location'
import { submitAction } from '../../lib/page'
import UiIcon from '../../components/UiIcon.vue'

const request = mapPickerRequest()
const initial = request?.initial ?? selectedLocation.value
const center = ref<ServiceCoordinates>(initial?.point ?? {latitude:34.7,longitude:108.9})
const scale = ref(initial ? 15 : 5)
const clearable = request?.clearable ?? Boolean(browseDistrict.value)
const locating = ref(false)
const locationError = ref('')
const {run,busy,error} = submitAction()
const map = () => uni.createMapContext('location-picker-map')
let active = true

onUnload(() => {
  active = false
  releaseMapPicker(request)
})

async function locate() {
  if (locating.value || busy.value) return
  locating.value = true
  locationError.value = ''
  error.value = ''
  try {
    let position: ServiceCoordinates
    try {
      position = await deviceCoordinates('gcj02')
    } catch (cause) {
      if (!active || !await enableLocation('允许定位后，地图可以移动到你所在的位置。')) throw cause
      position = await deviceCoordinates('gcj02')
    }
    if (!active) return
    center.value = {latitude:position.latitude,longitude:position.longitude}
    scale.value = 16
    map().moveToLocation(center.value)
  } catch {
    if (active) locationError.value = '暂时无法定位，可以拖动地图选点。'
  } finally {
    locating.value = false
  }
}

function finish(location: MapLocation | null) {
  if (!active) return
  active = false
  const select = request?.select ?? saveBrowseLocation
  select(location)
  uni.navigateBack({fail:() => go('home')})
}

async function selectPoint({latitude,longitude}: ServiceCoordinates) {
  const point = {latitude:Number(latitude),longitude:Number(longitude)}
  const result = await api<{coordinates:ServiceCoordinates;district:District|null}>('/h5/catalog/map-location','POST',point)
  if (!result.district) throw new Error('暂未识别到这个位置的区县，请重新选点。')
  finish({point,coordinates:result.coordinates,district:result.district})
}

function selectCenter() {
  if (locating.value) return
  locationError.value = ''
  void run(async () => {
    const point = await new Promise<ServiceCoordinates>((resolve,reject) => map().getCenterLocation({
      success:resolve,fail:() => reject(new Error('地图正在加载，请稍后再试')),
    }))
    await selectPoint(point)
  })
}

function selectPoi(event: {detail:ServiceCoordinates}) {
  if (locating.value) return
  locationError.value = ''
  void run(() => selectPoint(event.detail))
}
</script>

<template>
  <view class="screen location-screen">
    <map id="location-picker-map" class="location-map" :latitude="center.latitude" :longitude="center.longitude"
      :scale="scale" aria-label="位置地图" @poitap="selectPoi">
      <cover-image class="location-pin" src="/static/icons/location.png" />
    </map>
    <view class="card location-controls">
      <text class="sub">拖动地图对准图钉，或直接点选地图上的地点。</text>
      <view class="location-actions">
        <button id="locate-map-position" class="small" :disabled="busy || locating" @tap="locate">
          <UiIcon name="location" :size="14" />{{ locating ? '定位中' : '定位到我' }}
        </button>
        <button id="confirm-map-position" class="small primary" :disabled="busy || locating" @tap="selectCenter">
          {{ busy ? '识别中' : '使用此位置' }}
        </button>
      </view>
      <button v-if="clearable" class="text-button" :disabled="busy || locating" @tap="finish(null)">清除所选位置</button>
      <text v-if="error || locationError" class="error" role="status">{{ error || locationError }}</text>
    </view>
  </view>
</template>

<style scoped>
.location-map { display: block; position: relative; width: 100%; height: calc(100vh - 172px); min-height: 240px; overflow: hidden; border-radius: 16px; background: #efeee8; }
.location-pin { position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; transform: translate(-50%, -100%); pointer-events: none; }
.location-controls { margin-top: 10px; margin-bottom: 0; }
.location-actions { display: flex; gap: 8px; margin-top: 10px; }
.location-actions button { display: flex; justify-content: center; align-items: center; flex: 1; min-height: 38px; gap: 5px; white-space: nowrap; }
.location-controls .text-button { margin-top: 6px; }
</style>

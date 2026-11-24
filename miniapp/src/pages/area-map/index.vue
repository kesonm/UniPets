<script setup lang="ts">
import { computed, ref } from 'vue'
import { areaDistance, h5Areas, type H5Area } from '../../../../shared/h5-areas.mjs'
import UiIcon from '../../components/UiIcon.vue'
import { selectArea, selectedArea } from '../../lib/area'
import { go, toast } from '../../lib/client'

type Coordinates = Pick<H5Area, 'latitude' | 'longitude'>

const focusedArea = ref(h5Areas.find((area) => area.id === selectedArea.value))
const mapCenter = ref<Coordinates>(focusedArea.value ?? { latitude: 31.5, longitude: 117.5 })
const scale = ref(focusedArea.value ? 13 : 4)
const position = ref<Coordinates>()
const locating = ref(false)
const locationError = ref('')
const locationDenied = ref(false)

const markers = computed(() => {
  const areas = h5Areas.map(({ id, label, latitude, longitude }, index) => {
    const active = focusedArea.value?.id === id
    return {
      id: index + 1,
      latitude,
      longitude,
      iconPath: '/static/icons/location.png',
      width: active ? 32 : 25,
      height: active ? 32 : 25,
      callout: {
        content: label,
        display: active ? 'ALWAYS' : 'BYCLICK',
        color: '#33290d',
        bgColor: '#fff8dc',
        borderRadius: 8,
        padding: 6,
      },
    }
  })
  if (position.value) {
    areas.push({
      id: 0,
      ...position.value,
      iconPath: '/static/icons/post-location.png',
      width: 27,
      height: 27,
      callout: {
        content: '我的位置',
        display: 'ALWAYS',
        color: '#164b83',
        bgColor: '#e8f2ff',
        borderRadius: 8,
        padding: 6,
      },
    })
  }
  return areas
})

const distanceLabel = computed(() => {
  if (!position.value || !focusedArea.value) return ''
  const distance = areaDistance(position.value, focusedArea.value)
  const label = distance < 1 ? `${Math.round(distance * 1000)} 米` : `${distance.toFixed(1)} 公里`
  return `距你约 ${label}（直线）`
})

function centerMap(point: Coordinates, zoom: number) {
  const { latitude, longitude } = point
  if (latitude === mapCenter.value.latitude && longitude === mapCenter.value.longitude) {
    uni.createMapContext('business-area-map').moveToLocation({ latitude, longitude })
  }
  mapCenter.value = { latitude, longitude }
  scale.value = zoom
}

function focus(area: H5Area) {
  focusedArea.value = area
  centerMap(area, 13)
}

function selectMarker(event: { detail?: { markerId?: number }; markerId?: number }) {
  const markerId = event.detail?.markerId ?? event.markerId
  if (!markerId) return
  const area = h5Areas[markerId - 1]
  if (area) focus(area)
}

function locate() {
  if (locating.value) return
  locating.value = true
  locationError.value = ''
  locationDenied.value = false
  uni.getLocation({
    type: 'gcj02',
    success({ latitude, longitude }) {
      const current = { latitude, longitude }
      position.value = current
      if (!focusedArea.value) {
        focusedArea.value = h5Areas.reduce((nearest, area) =>
          areaDistance(current, area) < areaDistance(current, nearest) ? area : nearest,
        )
      }
      centerMap(current, 13)
    },
    fail() {
      position.value = undefined
      locationError.value = '暂时无法定位，仍可手动选择商圈。'
      uni.getSetting({
        success({ authSetting }) {
          locationDenied.value = authSetting['scope.userLocation'] === false
        },
      })
    },
    complete() {
      locating.value = false
    },
  })
}

function openLocationSettings() {
  uni.openSetting({
    success({ authSetting }) {
      if (authSetting['scope.userLocation']) locate()
    },
  })
}

function openArea() {
  if (!focusedArea.value) return
  const { latitude, longitude, label } = focusedArea.value
  uni.openLocation({
    latitude,
    longitude,
    name: label,
    address: '商圈中心',
    scale: 16,
    fail: () => toast('暂时无法打开位置'),
  })
}

function useArea() {
  if (!focusedArea.value) return
  selectArea(focusedArea.value.id)
  uni.navigateBack({ fail: () => go('home') })
}
</script>

<template>
  <view class="screen map-screen">
    <map
      id="business-area-map"
      class="native-map"
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :scale="scale"
      :markers="markers"
      aria-label="商圈中心地图"
      @markertap="selectMarker"
    />
    <view class="card area-card">
      <view class="spread">
        <text class="heading area-heading">选择商圈</text>
        <button id="locate-on-map" class="small locate-button" :loading="locating" :disabled="locating" @tap="locate">
          <UiIcon name="location" :size="14" />{{ locating ? '定位中' : '定位到我' }}
        </button>
      </view>
      <view v-if="locationError" class="spread">
        <text class="error" role="status">{{ locationError }}</text>
        <button v-if="locationDenied" class="text-button" @tap="openLocationSettings">开启定位权限</button>
      </view>
      <view class="chips" aria-label="商圈列表">
        <button
          v-for="area in h5Areas"
          :id="'map-area-' + area.id"
          :key="area.id"
          :class="['chip', { active: focusedArea?.id === area.id }]"
          :aria-pressed="focusedArea?.id === area.id"
          @tap="focus(area)"
        >{{ area.label }}</button>
      </view>
      <text v-if="distanceLabel" class="sub distance-label">{{ distanceLabel }}</text>
      <view class="map-actions">
        <button id="open-map-area" :disabled="!focusedArea" @tap="openArea">查看商圈位置</button>
        <button id="use-map-area" class="primary" :disabled="!focusedArea" @tap="useArea">使用此商圈</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.map-screen { padding-top: 10px; }
.native-map {
  display: block;
  width: 100%;
  height: clamp(250px, 46vh, 380px);
  margin-bottom: 10px;
  border-radius: 16px;
  background: #e8eae2;
  overflow: hidden;
}
.area-card { margin-bottom: 0; }
.area-heading { margin-bottom: 0; }
.locate-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.distance-label { margin-bottom: 10px; }
.map-actions { display: flex; gap: 8px; }
.map-actions button { flex: 1; min-width: 0; }
</style>

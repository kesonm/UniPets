<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onReady, onUnload } from '@dcloudio/uni-app'
import type { MapPlace, MapPlaceSuggestion, ServiceCoordinates } from '../../../../shared/h5-discovery.mjs'
import type { District } from '../../../../shared/h5-districts.mjs'
import { areaLabel } from '../../../../src/h5/business'
import { api, go, message } from '../../lib/client'
import { deviceCoordinates, enableLocation } from '../../lib/district'
import { browseDistrict, mapPickerRequest, releaseMapPicker, saveBrowseLocation, selectedLocation, type MapLocation } from '../../lib/location'
import { submitAction } from '../../lib/page'
import UiIcon from '../../components/UiIcon.vue'

type MapLookup = { coordinates: ServiceCoordinates; district: District | null; place?: MapPlace | null }
type Preview = { point: ServiceCoordinates; result?: MapLookup; place?: MapPlace }
type RegionChange = { type: string; causedBy?: string; detail?: { type?: string; causedBy?: string; centerLocation?: ServiceCoordinates } }

const request = mapPickerRequest()
const initial = request?.initial ?? selectedLocation.value
const center = ref<ServiceCoordinates>(initial?.point ?? { latitude:34.7, longitude:108.9 })
const scale = ref(initial ? 15 : 5)
const clearable = request?.clearable ?? Boolean(browseDistrict.value)
const preview = ref<Preview | undefined>(initial ? { point:initial.point, result:initial, place:initial.place } : undefined)
const locating = ref(false)
const resolving = ref(false)
const locationError = ref('')
const { run, busy, error } = submitAction()
const query = ref('')
const searchOpen = ref(false)
const searching = ref(false)
const searchError = ref('')
const suggestions = ref<MapPlaceSuggestion[]>([])
const place = computed(() => preview.value?.place || preview.value?.result?.place)
const districtName = computed(() => areaLabel(null, preview.value?.result?.district))
const statusName = computed(() => place.value?.name || (resolving.value ? '正在识别位置' : districtName.value || '地图中心位置'))
const map = () => uni.createMapContext('location-picker-map')
let targetPoint: ServiceCoordinates | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let previewVersion = 0
let searchVersion = 0
let active = true

function readCenter() {
  return new Promise<ServiceCoordinates>((resolve,reject) => map().getCenterLocation({
    success:({ latitude,longitude }) => resolve({ latitude,longitude }),
    fail:() => reject(new Error('地图正在加载，请稍后再试')),
  }))
}

function readScale() {
  return new Promise<number>(resolve => map().getScale({
    success:result => resolve(result.scale),
    fail:() => resolve(scale.value),
  }))
}

function samePoint(a: ServiceCoordinates, b: ServiceCoordinates) {
  return Math.abs(a.latitude-b.latitude) < 0.00002 && Math.abs(a.longitude-b.longitude) < 0.00002
}

function previewAt(point: ServiceCoordinates) {
  const previous = preview.value
  return previous && samePoint(previous.point,point) ? previous : undefined
}

function cancelLookup() {
  clearTimeout(timer)
  previewVersion++
  resolving.value = false
}

function queueLookup(point?: ServiceCoordinates) {
  cancelLookup()
  const version = previewVersion
  resolving.value = true
  timer = setTimeout(async () => {
    try {
      const position = point ?? await readCenter()
      if (!active || version !== previewVersion) return
      const previous = previewAt(position)
      if (previous?.result?.place !== undefined) return
      preview.value = { point:position,place:previous?.place }
      const result = await api<MapLookup>('/h5/catalog/map-location','POST',{ ...position,address:true },6500)
      if (!active || version !== previewVersion) return
      const explicit = previous?.place && {
        name:previous.place.name,address:previous.place.address || result.place?.address || '',
      }
      preview.value = { point:position,result,place:explicit }
    } catch {
      // Confirmation can still resolve the district through the coordinate-only request.
    } finally {
      if (active && version === previewVersion) resolving.value = false
    }
  },350)
}

onReady(() => queueLookup(initial?.point))
onUnload(() => {
  active = false
  cancelLookup()
  searchVersion++
  releaseMapPicker(request)
})

function regionChanged(event: RegionChange) {
  if (!active || searchOpen.value || busy.value) return
  const cause = event.detail?.causedBy ?? event.causedBy
  if (cause === 'update') return
  const phase = event.detail?.type ?? event.type
  if (phase === 'begin') {
    if (targetPoint && cause !== 'gesture') return
    targetPoint = undefined
    cancelLookup()
  } else if (phase === 'end') {
    targetPoint = undefined
    locationError.value = ''
    error.value = ''
    queueLookup(event.detail?.centerLocation)
  }
}

async function moveTo(point: ServiceCoordinates, label?: MapPlace) {
  targetPoint = point
  center.value = { ...point }
  scale.value = 17
  preview.value = { point,place:label }
  await nextTick()
  if (!active) return
  map().moveToLocation(point)
  queueLookup(point)
}

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
    if (active) await moveTo({ latitude:position.latitude,longitude:position.longitude })
  } catch {
    if (active) locationError.value = '暂时无法定位，可以拖动地图选点。'
  } finally {
    locating.value = false
  }
}

function closeSearch() {
  searchVersion++
  searching.value = false
  if (!searchOpen.value) return
  searchOpen.value = false
  queueLookup(center.value)
}

async function searchPlaces() {
  const keyword = query.value.trim()
  if (!keyword || busy.value || locating.value) return
  const version = ++searchVersion
  searching.value = true
  searchError.value = ''
  suggestions.value = []
  try {
    if (!searchOpen.value) {
      const [point,zoom] = await Promise.all([
        readCenter().catch(() => preview.value?.point ?? center.value),
        readScale(),
      ])
      if (!active || version !== searchVersion) return
      searchOpen.value = true
      center.value = point
      scale.value = zoom
      cancelLookup()
    }
    const { places } = await api<{ places: MapPlaceSuggestion[] }>('/h5/catalog/map-search','POST',{
      keyword, center:center.value,
    },6500)
    if (active && version === searchVersion) suggestions.value = places
  } catch (cause) {
    if (active && version === searchVersion) searchError.value = message(cause)
  } finally {
    if (active && version === searchVersion) searching.value = false
  }
}

function selectResult({ point,name,address }: MapPlaceSuggestion) {
  closeSearch()
  query.value = name
  locationError.value = ''
  error.value = ''
  void moveTo(point,{ name,address })
}

function selectPoi({ detail }: { detail:ServiceCoordinates & { name?:string } }) {
  if (locating.value || busy.value || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return
  locationError.value = ''
  error.value = ''
  void moveTo({ latitude:detail.latitude,longitude:detail.longitude },detail.name ? { name:detail.name,address:'' } : undefined)
}

function finish(location: MapLocation | null) {
  if (!active) return
  const select = request?.select ?? saveBrowseLocation
  select(location)
  active = false
  uni.navigateBack({ fail:() => go('home') })
}

function selectCenter() {
  if (locating.value || searching.value || searchOpen.value) return
  locationError.value = ''
  void run(async () => {
    const point = targetPoint ?? await readCenter()
    const selected = previewAt(point)
    const result = selected?.result ?? await api<MapLookup>('/h5/catalog/map-location','POST',{ ...point })
    if (!result.district) throw new Error('暂未识别到这个位置的区县，请重新选点。')
    finish({ point,coordinates:result.coordinates,district:result.district,place:selected?.place || result.place || undefined })
  })
}
</script>

<template>
  <view class="screen location-screen">
    <view class="location-toolbar">
      <view class="location-search">
        <button class="search-trigger text-button" aria-label="搜索地点" :disabled="!query.trim() || busy || locating || searching" @tap="searchPlaces">
          <UiIcon name="search" :size="17" />
        </button>
        <input id="map-place-search" v-model="query" class="location-input" maxlength="32" placeholder="搜索店名、地址" aria-label="搜索店名或地址"
          confirm-type="search" @input="closeSearch" @confirm="searchPlaces" />
      </view>
      <button id="confirm-map-position" class="small primary location-confirm" :disabled="busy || locating || searching || searchOpen" @tap="selectCenter">
        {{ busy ? '确认中' : '使用此位置' }}
      </button>
    </view>

    <view class="location-canvas">
      <map v-if="!searchOpen" id="location-picker-map" class="location-map" :latitude="center.latitude" :longitude="center.longitude"
        :scale="scale" aria-label="位置地图" @regionchange="regionChanged" @poitap="selectPoi">
        <cover-image class="location-pin" src="/static/icons/location.png" />
        <cover-view id="locate-map-position" :class="['location-recenter', { locating }]" aria-label="定位到我" @tap="locate">
          <cover-image class="location-recenter-icon" src="/static/icons/post-location.png" />
        </cover-view>
      </map>
      <view v-else class="location-results">
        <view class="spread location-results-bar">
          <text class="sub">{{ searching ? '正在搜索' : '搜索结果' }}</text>
          <button class="text-button" @tap="closeSearch">返回地图</button>
        </view>
        <text v-if="searchError" class="error" role="status">{{ searchError }}</text>
        <text v-else-if="!searching && !suggestions.length" class="sub" role="status">没有找到匹配的地点</text>
        <scroll-view v-else scroll-y class="location-suggestions">
          <button v-for="item in suggestions" :key="item.id" class="location-result" @tap="selectResult(item)">
            <UiIcon name="location" :size="16" />
            <view class="grow">
              <text class="location-name">{{ item.name }}</text>
              <text v-if="item.address && item.address !== item.name" class="sub">{{ item.address }}</text>
            </view>
          </button>
        </scroll-view>
      </view>
    </view>

    <view v-if="!searchOpen" class="card location-summary">
      <view class="location-address" aria-live="polite">
        <UiIcon name="location" :size="18" />
        <view class="grow">
          <text class="location-name">{{ statusName }}</text>
          <text v-if="place?.address && place.address !== place.name" class="sub">{{ place.address }}</text>
          <text v-else-if="!resolving && !place && districtName" class="sub">仅识别到区县，可点选地图上的地点</text>
          <text v-if="error || locationError" class="error" role="status">{{ error || locationError }}</text>
        </view>
      </view>
      <button v-if="clearable" class="text-button location-reset" :disabled="busy || locating" @tap="finish(null)">清除位置</button>
    </view>
  </view>
</template>

<style scoped>
.location-screen { display: flex; flex-direction: column; gap: 10px; height: 100vh; padding: 10px 14px 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
.location-toolbar { display: flex; align-items: center; gap: 8px; }
.location-search { display: flex; align-items: center; flex: 1; min-width: 0; height: 40px; border: 1px solid var(--border); border-radius: 22px; background: #fff; }
.location-search .search-trigger { flex: none; width: 34px; height: 36px; border-radius: 50%; }
.location-input { flex: 1; min-width: 0; min-height: 36px; padding: 5px 8px 5px 0; border: 0; background: transparent; font-size: 13px; }
.location-confirm { flex: none; min-height: 38px; white-space: nowrap; }
.location-canvas { position: relative; flex: 1; min-height: 0; overflow: hidden; border-radius: 16px; background: #efeee8; }
.location-map { display: block; position: relative; width: 100%; height: 100%; }
.location-pin { position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; transform: translate(-50%, -100%); pointer-events: none; }
.location-recenter { position: absolute; right: 12px; bottom: 30px; width: 42px; height: 42px; border: 1px solid #e5dfcf; border-radius: 50%; background: #fff; }
.location-recenter.locating { opacity: .6; }
.location-recenter-icon { width: 20px; height: 20px; margin: 10px; }
.location-summary { display: flex; align-items: center; gap: 8px; margin: 0; padding: 11px 12px; }
.location-address { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0; }
.location-name { display: block; color: var(--ink); font-size: 14px; font-weight: 750; line-height: 1.35; white-space: normal; overflow-wrap: anywhere; }
.location-address .sub, .location-result .sub { margin-top: 3px; }
.location-reset { flex: none; white-space: nowrap; }
.location-results { display: flex; flex-direction: column; height: 100%; padding: 8px 12px 12px; border: 1px solid var(--border); border-radius: 16px; background: #fff; }
.location-results-bar { flex: none; }
.location-suggestions { flex: 1; height: 0; }
.location-result { display: flex; align-items: flex-start; gap: 8px; width: 100%; padding: 12px 3px; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; text-align: left; }
</style>

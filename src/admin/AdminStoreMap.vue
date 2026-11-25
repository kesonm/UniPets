<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Location } from '@element-plus/icons-vue'
import type { StoreOnMap } from './admin'
import { getTencentMapKey, loadTencentMap, storeMarkerUrl, type MapView, type MultiMarker, type TencentMap } from './tencent-map'

const props = defineProps<{stores:StoreOnMap[];focusId:string;loading:boolean}>()
const host = ref<HTMLElement>()
const selectedId = ref(props.focusId)
const selected = computed(() => props.stores.find(store => store.id === selectedId.value))
const located = computed(() => props.stores.filter(store => store.mapPoint))
const ready = ref(false)
const error = ref('')
let alive = true
let sdk: TencentMap | undefined
let map: MapView | undefined
let markers: MultiMarker | undefined

function showAll() {
  selectedId.value = ''
  updateMap()
}

function updateMap() {
  if (!sdk || !map || !markers) return
  const {LatLng,LatLngBounds} = sdk
  const points = located.value.flatMap(store => store.mapPoint ? [{id:store.id,
    position:new LatLng(store.mapPoint.latitude,store.mapPoint.longitude),
  }] : [])
  markers.setGeometries(points)
  const position = points.find(point => point.id === selectedId.value)?.position
  if (position) {
    map.setCenter(position)
    map.setZoom(16)
  } else if (points.length) {
    const [{position:first}] = points
    if (points.every(({position:point}) => point.getLat() === first.getLat() && point.getLng() === first.getLng())) {
      map.setCenter(first)
      map.setZoom(14)
    } else {
      const bounds = new LatLngBounds(first,first)
      for (const point of points.slice(1)) bounds.extend(point.position)
      map.fitBounds(bounds,{padding:48,maxZoom:16})
    }
  } else {
    map.setCenter(new LatLng(35,105))
    map.setZoom(4)
  }
}

function selectStore(id: string) {
  selectedId.value = id
  updateMap()
}

watch(() => props.stores,updateMap)
onMounted(async () => {
  try {
    const key = await getTencentMapKey()
    if (!alive) return
    if (!key) {
      error.value = '腾讯地图总览尚未配置。选择门店后可单独在腾讯地图打开。'
      return
    }
    sdk = await loadTencentMap(key)
    if (!alive || !host.value) return
    map = new sdk.Map(host.value,{center:new sdk.LatLng(35,105),zoom:4})
    markers = new sdk.MultiMarker({map,geometries:[]})
    markers.on('click',event => selectStore(event.geometry.id))
    updateMap()
    ready.value = true
  } catch (cause) {
    if (alive) error.value = cause instanceof Error ? cause.message : '腾讯地图加载失败'
  }
})
onBeforeUnmount(() => {
  alive = false
  markers?.setMap(null)
  map?.destroy()
})
</script>

<template>
  <section class="admin-store-map" aria-label="门店地图">
    <div class="admin-store-map-meta">
      <span>已定位 {{ located.length }} 家 <span aria-hidden="true">·</span> 待补位置 {{ stores.length-located.length }} 家</span>
      <button v-if="ready && located.length" class="admin-button" type="button" @click="showAll">查看全部点位</button>
    </div>
    <div class="admin-store-map-grid">
      <div class="admin-store-map-stage">
        <div ref="host" class="admin-store-map-canvas" aria-label="腾讯地图门店点位"></div>
        <div v-if="!ready" class="admin-store-map-message" role="status">
          <el-icon aria-hidden="true"><Location /></el-icon>
          <p>{{ error || '正在加载腾讯地图…' }}</p>
        </div>
      </div>
      <aside class="admin-store-map-list" aria-label="地图门店列表">
        <div v-if="selected" class="admin-store-map-selection" aria-live="polite">
          <strong>{{ selected.name }}</strong>
          <p>{{ selected.address || '待补充地址' }}</p>
          <a v-if="selected.phone" :href="'tel:'+selected.phone">{{ selected.phone }}</a>
          <a v-if="selected.mapPoint" :href="storeMarkerUrl(selected.mapPoint)" target="_blank" rel="noopener noreferrer">在腾讯地图打开</a>
          <p v-else>门店负责人可在小程序补录位置。</p>
        </div>
        <p v-if="loading && !stores.length" class="admin-muted" role="status">正在读取门店…</p>
        <p v-else-if="!stores.length" class="admin-muted">暂无符合条件的门店</p>
        <ul v-else>
          <li v-for="store in stores" :key="store.id">
            <button type="button" :aria-pressed="selectedId===store.id" @click="selectStore(store.id)">
              <strong><el-icon aria-hidden="true"><Location /></el-icon>{{ store.name }}</strong>
              <small>{{ store.mapPoint ? (store.address || '已定位') : '待补位置' }}</small>
              <span :class="['admin-status',store.bound ? 'admin-status-positive' : 'admin-status-muted']">{{ store.bound ? '已被绑定' : '暂未绑定' }}</span>
            </button>
          </li>
        </ul>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import { getTencentMapKey, locationPickerOrigin, locationPickerUrl } from './tencent-map'

const props = defineProps<{point?:ServiceCoordinates}>()
const emit = defineEmits<{select:[point:ServiceCoordinates,place:{name:string;address:string}]}>()
const frame = ref<HTMLIFrameElement>()
const source = ref('')
const error = ref('')

function receiveLocation(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow) return
  if (event.origin !== locationPickerOrigin && event.origin !== 'https://mapapi.qq.com') return
  const location = event.data
  if (location?.module !== 'locationPicker') return
  const {lat,lng} = location.latlng ?? {}
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng <= -180 || lng > 180) return
  const name = typeof location.poiname === 'string' ? location.poiname.trim().slice(0,120) : ''
  const address = typeof location.poiaddress === 'string' ? location.poiaddress.trim().slice(0,160) : ''
  emit('select',{latitude:lat,longitude:lng},{name,address})
}

onMounted(async () => {
  window.addEventListener('message',receiveLocation)
  try {
    const key = await getTencentMapKey()
    if (key) source.value = locationPickerUrl(key,props.point)
    else error.value = '腾讯地图尚未配置。可以使用当前位置或填写经纬度。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '腾讯地图设置读取失败'
  }
})
onBeforeUnmount(() => window.removeEventListener('message',receiveLocation))
</script>

<template>
  <div class="admin-store-picker">
    <template v-if="source">
      <p>搜索门店名称或详细地址，也可以拖动地图选点。</p>
      <iframe ref="frame" :src="source" title="腾讯地图选点" allow="geolocation" referrerpolicy="strict-origin-when-cross-origin" />
    </template>
    <p v-else-if="error" class="admin-error" role="status">{{ error }}</p>
    <p v-else role="status">正在读取腾讯地图设置…</p>
  </div>
</template>

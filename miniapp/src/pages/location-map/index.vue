<script setup lang="ts">
import { onReady, onUnload } from '@dcloudio/uni-app'
import type { ServiceCoordinates } from '../../../../shared/h5-discovery.mjs'
import type { District } from '../../../../shared/h5-districts.mjs'
import LoadState from '../../components/LoadState.vue'
import { api, go } from '../../lib/client'
import { chooseNativeLocation } from '../../lib/district'
import { mapPickerRequest, releaseMapPicker, saveBrowseLocation, selectedLocation, type MapLocation } from '../../lib/location'
import { submitAction } from '../../lib/page'

const request = mapPickerRequest()
const initial = request?.initial ?? selectedLocation.value
const clearable = request?.clearable ?? Boolean(initial)
const { run, busy, error } = submitAction()
let active = true

onReady(openPicker)
onUnload(() => {
  active = false
  releaseMapPicker(request)
})

function back() {
  uni.navigateBack({ fail:() => go('home') })
}

function finish(location: MapLocation | null) {
  const select = request?.select ?? saveBrowseLocation
  select(location)
  back()
}

function chooseAction() {
  if (!clearable) return Promise.resolve(0)
  return new Promise<number | undefined>(resolve => uni.showActionSheet({
    itemList: ['重新定位', '清除位置'],
    success: result => resolve(result.tapIndex),
    fail: () => resolve(undefined),
  }))
}

function openPicker() {
  void run(async () => {
    const action = await chooseAction()
    if (!active) return
    if (action === undefined) return back()
    if (action === 1) return finish(null)

    const place = await chooseNativeLocation(initial?.point, () => active)
    if (!active) return
    if (!place) return back()

    const point = { latitude:place.latitude, longitude:place.longitude }
    const { coordinates,district } = await api<{ coordinates: ServiceCoordinates; district: District | null }>(
      '/h5/catalog/map-location','POST',point,
    )
    if (!active) return
    if (!district) throw new Error('暂未识别所选位置的区县，请重新选择。')
    finish({ point,coordinates,district })
  })
}
</script>

<template>
  <view class="screen">
    <LoadState :loading="busy" :error="error" @retry="openPicker" />
  </view>
</template>

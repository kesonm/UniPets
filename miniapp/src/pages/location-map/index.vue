<script setup lang="ts">
import { onReady, onUnload } from '@dcloudio/uni-app'
import type { ServiceCoordinates } from '../../../../shared/h5-discovery.mjs'
import type { District } from '../../../../shared/h5-districts.mjs'
import LoadState from '../../components/LoadState.vue'
import { api, go } from '../../lib/client'
import { enableLocation } from '../../lib/district'
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
    itemList: ['重新选择位置', '清除位置'],
    success: result => resolve(result.tapIndex),
    fail: () => resolve(undefined),
  }))
}

function chooseNativeLocation() {
  return new Promise<ServiceCoordinates | undefined>((resolve,reject) => uni.chooseLocation({
    ...initial?.point,
    success: ({ latitude,longitude }) => resolve({ latitude,longitude }),
    fail: ({ errMsg }) => {
      if (/cancel/i.test(errMsg)) resolve(undefined)
      else reject(new Error(errMsg || '暂时无法打开微信地图'))
    },
  }))
}

function openPicker() {
  void run(async () => {
    const action = await chooseAction()
    if (!active) return
    if (action === undefined) return back()
    if (action === 1) return finish(null)

    let point: ServiceCoordinates | undefined
    try {
      point = await chooseNativeLocation()
    } catch (cause) {
      if (!active || !await enableLocation('允许定位后可使用微信地图选择位置。')) throw cause
      point = await chooseNativeLocation()
    }
    if (!active) return
    if (!point) return back()

    const { coordinates,district } = await api<{ coordinates: ServiceCoordinates; district: District | null }>(
      '/h5/catalog/map-location','POST',{ ...point },
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

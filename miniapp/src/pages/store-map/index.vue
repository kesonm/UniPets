<script setup lang="ts">
import { computed, ref } from 'vue'
import { onReady } from '@dcloudio/uni-app'
import type { ServiceCoordinates } from '../../../../shared/h5-discovery.mjs'
import { serviceRegions } from '../../../../shared/h5-service-regions.mjs'
import type { StoreMapCandidate, StoreMapPreview } from '../../../../src/h5/types'
import { api, toast, user } from '../../lib/client'
import { deviceCoordinates, enableLocation } from '../../lib/district'
import { submitAction } from '../../lib/page'
import ChoiceField from '../../components/ChoiceField.vue'
import LoginCard from '../../components/LoginCard.vue'
import UiIcon from '../../components/UiIcon.vue'

const endpoint = '/h5/catalog/stores/map'
const center = ref<ServiceCoordinates>({latitude:34.7,longitude:108.9})
const scale = ref(5)
const locating = ref(false)
const selectedPoint = ref<ServiceCoordinates>()
const preview = ref<StoreMapPreview>()
const candidate = ref<StoreMapCandidate>()
const registering = ref(false)
const name = ref('')
const address = ref('')
const phone = ref('')
const province = ref('')
const city = ref('')
const cities = computed(() => {
  const selected = serviceRegions.find(region => region.id === province.value)
  return selected?.cities.length ? [...selected.cities] : selected ? [selected] : []
})
const provinces = [...serviceRegions]
const needsCity = computed(() => registering.value && !preview.value?.cityCode)
const needsPhone = computed(() => registering.value || candidate.value?.needsPhone)
const status = {available:'可绑定',mine:'已绑定到我',bound:'已被绑定',disabled:'已停用'}
const {run,busy,error} = submitAction()

onReady(() => {
  if (!user.value) return
  uni.getSetting({
    success: result => { if (result.authSetting['scope.userLocation']) void locate(false) },
  })
})

async function locate(interactive = true) {
  if (locating.value) return
  locating.value = true
  try {
    try {
      center.value = await deviceCoordinates('gcj02')
    } catch (cause) {
      if (!interactive || !await enableLocation('允许定位后，可以把地图移动到你的位置。')) throw cause
      center.value = await deviceCoordinates('gcj02')
    }
    scale.value = 17
    uni.createMapContext('store-binding-map').moveToLocation(center.value)
  } catch {
    if (interactive) toast('暂时无法定位，可以拖动地图选点')
  } finally {
    locating.value = false
  }
}

async function previewAt(point: ServiceCoordinates, poiName = '') {
  const location = {latitude:Number(point.latitude),longitude:Number(point.longitude)}
  const result = await api<StoreMapPreview>(endpoint+'/preview','POST',{location})
  selectedPoint.value = location
  preview.value = result
  name.value = poiName.slice(0,120)
  address.value = ''
  city.value = ''
  province.value = ''
  phone.value = ''
  candidate.value = undefined
  registering.value = !result.stores.length
}

function chooseCenter() {
  return run(async () => {
    const point = await new Promise<ServiceCoordinates>((resolve,reject) => {
      uni.createMapContext('store-binding-map').getCenterLocation({
        success: resolve, fail: () => reject(new Error('地图还未就绪，请稍后再试')),
      })
    })
    await previewAt(point)
  })
}

function choosePoi(event: {detail:ServiceCoordinates & {name?:string}}) {
  return run(() => previewAt(event.detail,event.detail.name))
}

function pickAgain() {
  if (selectedPoint.value) {
    center.value = selectedPoint.value
    scale.value = 17
  }
  preview.value = undefined
  error.value = ''
}

function chooseStore(store: StoreMapCandidate) {
  if (store.state !== 'available') return
  candidate.value = store
  registering.value = false
  phone.value = ''
  error.value = ''
}

function chooseProvince(value: string) {
  province.value = value
  city.value = cities.value.length === 1 ? cities.value[0].id : ''
}

function bind() {
  if (!selectedPoint.value) return
  return run(async () => {
    const fields = candidate.value
      ? {storeId:candidate.value.id, ...(phone.value.trim() ? {phone:phone.value} : {})}
      : {name:name.value,address:address.value,phone:phone.value,...(city.value ? {cityCode:city.value} : {})}
    await api(endpoint+'/bind','POST',{location:selectedPoint.value,...fields})
    toast('门店已绑定')
    uni.navigateBack({fail:() => uni.redirectTo({url:'/pages/stores/index'})})
  })
}
</script>

<template>
  <view class="screen store-map-screen">
    <LoginCard v-if="!user" />
    <template v-else-if="!preview">
      <map id="store-binding-map" class="binding-map" :latitude="center.latitude" :longitude="center.longitude"
        :scale="scale" aria-label="门店选点地图" @poitap="choosePoi">
        <cover-image class="center-pin" src="/static/icons/location.png" />
      </map>
      <view class="card map-controls">
        <text class="sub">拖动地图，让图钉对准门店。也可直接点选地图上的店铺。</text>
        <view class="map-buttons">
          <button id="store-map-locate" class="small" :disabled="locating || busy" @tap="locate()">
            <UiIcon name="location" :size="15" />{{ locating ? '定位中…' : '定位到我' }}
          </button>
          <button id="store-map-use-point" class="primary" :disabled="locating || busy" @tap="chooseCenter">使用此位置</button>
        </view>
        <text v-if="error" class="error">{{ error }}</text>
      </view>
    </template>
    <template v-else>
      <view class="card selected-location">
        <UiIcon name="location" :size="18" />
        <text id="store-map-district" class="selected-location-text">{{ preview.district || '已选择门店位置' }}</text>
        <button class="text-button" :disabled="busy" @tap="pickAgain">重选</button>
      </view>
      <view v-if="!candidate && !registering" class="card nearby-stores">
        <text class="heading">选点附近的门店</text>
        <button v-for="store in preview.stores" :key="store.id" class="nearby-row"
          :disabled="store.state !== 'available'" @tap="chooseStore(store)">
          <view class="nearby-copy">
            <text class="nearby-name">{{ store.name }}</text>
            <text v-if="store.address" class="sub">{{ store.address }}</text>
          </view>
          <text class="nearby-status">{{ status[store.state] }}</text>
          <UiIcon v-if="store.state === 'available'" name="right" :size="12" />
        </button>
        <button id="register-other-store" class="text-button other-store" @tap="registering=true">登记其他门店</button>
      </view>
      <view v-else class="card binding-form">
        <view class="spread binding-form-heading">
          <text class="heading">{{ candidate ? candidate.name : '门店资料' }}</text>
          <button v-if="preview.stores.length" class="text-button" :disabled="busy"
            @tap="candidate=undefined; registering=false; error=''">选择附近门店</button>
        </view>
        <text v-if="candidate?.address" class="sub">{{ candidate.address }}</text>
        <template v-if="registering">
          <text class="label">门店名称</text>
          <input id="map-store-name" v-model="name" maxlength="120" placeholder="填写门店名称" />
          <text class="label">详细地址</text>
          <input id="map-store-address" v-model="address" maxlength="160" placeholder="街道、门牌号" />
          <template v-if="needsCity">
            <text class="label">门店所在城市</text>
            <ChoiceField :model-value="province" :options="provinces" placeholder="请选择省份" @update:model-value="chooseProvince" />
            <ChoiceField v-if="province && cities.length>1" v-model="city" :options="cities" placeholder="请选择城市" />
          </template>
        </template>
        <template v-if="needsPhone">
          <text class="label">联系电话</text>
          <input id="map-store-phone" v-model="phone" type="text" maxlength="40" placeholder="手机或座机号码" />
        </template>
        <text v-if="error" class="error">{{ error }}</text>
        <button id="confirm-map-binding" class="primary confirm-binding" :loading="busy"
          :disabled="busy || (needsPhone && !phone.trim()) || (needsCity && !city) || (registering && (!name.trim() || !address.trim()))"
          @tap="bind">确认绑定</button>
      </view>
    </template>
  </view>
</template>

<style scoped>
.store-map-screen { padding-top: 12px; }
.binding-map { position: relative; display: block; width: 100%; height: min(56vh,460px); min-height: 280px; margin-bottom: 11px; border-radius: 16px; overflow: hidden; }
.center-pin { position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; margin: -28px 0 0 -14px; }
.map-controls .sub { margin-bottom: 10px; }
.map-buttons { display: flex; align-items: stretch; gap: 8px; }
.map-buttons button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; }
.map-buttons .primary { flex: 1; }
.selected-location { display: flex; align-items: center; gap: 8px; padding-block: 8px; background: #fff7da; border-color: #efdea1; }
.selected-location-text { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
.selected-location button,.binding-form-heading button { flex: none; }
.binding-form-heading { gap: 7px; }
.nearby-row { display: flex; align-items: center; gap: 7px; width: 100%; padding: 10px 2px; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; text-align: left; background: transparent; }
.nearby-row:disabled { opacity: .65; }
.nearby-copy { flex: 1; min-width: 0; }
.nearby-name { display: block; font-size: 14px; font-weight: 700; }
.nearby-status { color: var(--muted); font-size: 11px; white-space: nowrap; }
.other-store { margin-top: 8px; }
.confirm-binding { width: 100%; margin-top: 13px; }
</style>

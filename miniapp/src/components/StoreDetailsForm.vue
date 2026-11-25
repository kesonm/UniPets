<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { servicePhone, type ServiceCoordinates } from '../../../shared/h5-discovery.mjs'
import { serviceRegions } from '../../../shared/h5-service-regions.mjs'
import type { BoundStore, District, MerchantStoreProfile } from '../../../src/h5/types'
import { api } from '../lib/client'
import { deviceCoordinates, enableLocation } from '../lib/district'
import { submitAction } from '../lib/page'
import ChoiceField from './ChoiceField.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{store?:BoundStore;busy:boolean;error:string}>()
const emit = defineEmits<{save:[profile:MerchantStoreProfile];cancel:[]}>()
const name = ref(props.store?.name ?? '')
const address = ref(props.store?.address ?? '')
const phone = ref(props.store?.phone ?? '')
const point = ref(props.store?.location ?? null)
const city = ref(props.store?.cityCode ?? '')
const detectedCity = ref(city.value)
const district = ref<District|null>(null)
const province = ref('')
const provinces = [...serviceRegions]
const cities = computed(() => {
  const region = provinces.find(item => item.id === province.value)
  return region?.cities.length ? [...region.cities] : region ? [region] : []
})
const placeLabel = computed(() => {
  if (district.value) return [...new Set([district.value.city,district.value.name].filter(Boolean))].join(' · ')
  return provinces.flatMap(region => [region,...region.cities]).find(item => item.id === city.value)?.label ?? ''
})
const canSave = computed(() => point.value && city.value && name.value.trim() && address.value.trim() && servicePhone(phone.value))

const picking = ref(false)
const center = ref<ServiceCoordinates>({latitude:34.7,longitude:108.9})
const scale = ref(5)
const locating = ref(false)
const locateError = ref('')
const {run,busy:choosing,error:mapError} = submitAction()
const page = getCurrentInstance()?.proxy
const mapContext = () => uni.createMapContext('merchant-store-map',page)

function openMap() {
  if (point.value) {
    center.value = point.value
    scale.value = 17
  }
  mapError.value = ''
  locateError.value = ''
  picking.value = true
  uni.pageScrollTo({scrollTop:0,duration:0})
}

async function locate() {
  if (locating.value || choosing.value) return
  locating.value = true
  locateError.value = ''
  try {
    let position: ServiceCoordinates
    try {
      position = await deviceCoordinates('gcj02')
    } catch (cause) {
      if (!await enableLocation('允许定位后，可以把地图移到你所在的位置。')) throw cause
      position = await deviceCoordinates('gcj02')
    }
    center.value = position
    scale.value = 17
    mapContext().moveToLocation(position)
  } catch {
    locateError.value = '暂时无法获取当前位置，可以拖动地图选点。'
  } finally {
    locating.value = false
  }
}

async function usePoint({latitude,longitude}: ServiceCoordinates, poiName = '') {
  const position = {latitude:Number(latitude),longitude:Number(longitude)}
  const result = await api<{district:District|null}>('/h5/catalog/stores/location','POST',position)
  point.value = position
  district.value = result.district
  detectedCity.value = result.district?.serviceCityCode ?? ''
  city.value = detectedCity.value
  province.value = ''
  if (!name.value.trim() && poiName) name.value = poiName.slice(0,120)
  picking.value = false
}

function chooseCenter() {
  void run(async () => {
    const location = await new Promise<ServiceCoordinates>((resolve,reject) => mapContext().getCenterLocation({
      success:resolve,fail:() => reject(new Error('地图正在加载，请稍后再试')),
    }))
    await usePoint(location)
  })
}

function choosePoi(event: {detail:ServiceCoordinates & {name?:string}}) {
  if (!locating.value) void run(() => usePoint(event.detail,event.detail.name))
}

function selectProvince(value: string) {
  province.value = value
  city.value = cities.value.length === 1 ? cities.value[0].id : ''
}

function save() {
  if (!canSave.value || !point.value || props.busy) return
  emit('save',{name:name.value,address:address.value,phone:phone.value,location:point.value,cityCode:city.value})
}
</script>

<template>
  <template v-if="picking">
    <map id="merchant-store-map" class="merchant-store-map" :latitude="center.latitude" :longitude="center.longitude"
      :scale="scale" aria-label="门店位置地图" @poitap="choosePoi">
      <cover-image class="merchant-map-pin" src="/static/icons/location.png" />
    </map>
    <view class="card merchant-map-actions">
      <text class="sub">拖动地图，让图钉对准门店。也可以点选地图上的地点。</text>
      <view class="merchant-form-actions">
        <button class="small" :disabled="choosing || locating" @tap="picking=false">返回</button>
        <button id="locate-merchant-store" class="small" :disabled="choosing || locating" @tap="locate">{{ locating ? '定位中…' : '定位到我' }}</button>
        <button id="use-merchant-store-point" class="primary merchant-primary-action" :disabled="choosing || locating" @tap="chooseCenter">使用此位置</button>
      </view>
      <text v-if="mapError || locateError" class="error">{{ mapError || locateError }}</text>
    </view>
  </template>
  <view v-else class="card merchant-store-form">
    <text class="heading">{{ store ? '编辑门店' : '填写门店资料' }}</text>
    <text class="label">门店名称</text>
    <input id="merchant-store-name" v-model="name" maxlength="120" placeholder="填写门店名称" />
    <text class="label">详细地址</text>
    <input id="merchant-store-address" v-model="address" maxlength="160" placeholder="街道、门牌号" />
    <text class="label">联系电话</text>
    <input id="merchant-store-phone" v-model="phone" maxlength="40" placeholder="填写手机号或座机" />
    <text class="label">门店位置</text>
    <button id="open-merchant-store-map" class="small merchant-location-button" :disabled="busy" @tap="openMap">
      <UiIcon name="location" :size="16" />{{ point ? '重新选点' : '打开地图选点' }}
    </button>
    <text v-if="point" id="merchant-store-place" class="sub">{{ placeLabel || '已选择地图位置' }}</text>
    <template v-if="point && !detectedCity">
      <text class="label">门店所在城市</text>
      <ChoiceField :model-value="province" :options="provinces" placeholder="请选择省份" @update:model-value="selectProvince" />
      <ChoiceField v-if="cities.length > 1" v-model="city" :options="cities" placeholder="请选择城市" />
    </template>
    <text v-if="error" class="error">{{ error }}</text>
    <view class="merchant-form-actions">
      <button class="small" :disabled="busy" @tap="emit('cancel')">取消</button>
      <button id="save-merchant-store" class="primary merchant-primary-action" :loading="busy" :disabled="busy || !canSave" @tap="save">
        {{ store ? '保存门店' : '确认绑定' }}
      </button>
    </view>
  </view>
</template>

<style scoped>
.merchant-store-map { position: relative; width: 100%; height: min(55vh, 450px); min-height: 268px; border-radius: 16px; overflow: hidden; margin-bottom: 10px; }
.merchant-map-pin { position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin: -28px 0 0 -14px; }
.merchant-store-form .heading { margin-bottom: 12px; }
.merchant-location-button { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 5px; }
.merchant-form-actions { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; }
.merchant-primary-action { flex: 1; }
</style>

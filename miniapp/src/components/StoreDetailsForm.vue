<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { servicePhone } from '../../../shared/h5-discovery.mjs'
import { serviceRegions } from '../../../shared/h5-service-regions.mjs'
import type { BoundStore, District, MerchantStoreProfile } from '../../../src/h5/types'
import { api } from '../lib/client'
import { chooseNativeLocation } from '../lib/district'
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

const {run,busy:choosing,error:mapError} = submitAction()
let active = true
onBeforeUnmount(() => { active = false })

function openMap() {
  if (props.busy) return
  void run(async () => {
    const place = await chooseNativeLocation(point.value, () => active)
    if (!active || !place) return

    const position = {latitude:place.latitude,longitude:place.longitude}
    const result = await api<{district:District|null}>('/h5/catalog/stores/location','POST',position)
    if (!active) return

    point.value = position
    district.value = result.district
    detectedCity.value = result.district?.serviceCityCode ?? ''
    city.value = detectedCity.value
    province.value = ''
    if (!name.value.trim() && place.name) name.value = place.name.trim().slice(0,120)
    if (!address.value.trim() && place.address) address.value = place.address.trim().slice(0,160)
  })
}

function selectProvince(value: string) {
  province.value = value
  city.value = cities.value.length === 1 ? cities.value[0].id : ''
}

function save() {
  if (!canSave.value || !point.value || props.busy || choosing.value) return
  emit('save',{name:name.value,address:address.value,phone:phone.value,location:point.value,cityCode:city.value})
}
</script>

<template>
  <view class="card merchant-store-form">
    <text class="heading">{{ store ? '编辑门店' : '填写门店资料' }}</text>
    <text class="label">门店名称</text>
    <input id="merchant-store-name" v-model="name" maxlength="120" placeholder="填写门店名称" />
    <text class="label">详细地址</text>
    <input id="merchant-store-address" v-model="address" maxlength="160" placeholder="街道、门牌号" />
    <text class="label">联系电话</text>
    <input id="merchant-store-phone" v-model="phone" maxlength="40" placeholder="填写手机号或座机" />
    <text class="label">门店位置</text>
    <button id="open-merchant-store-map" class="small merchant-location-button" :disabled="busy || choosing" :loading="choosing" @tap="openMap">
      <UiIcon name="location" :size="16" />{{ point ? '重新定位' : '定位门店' }}
    </button>
    <text v-if="point" id="merchant-store-place" class="sub">{{ placeLabel || '已选择地图位置' }}</text>
    <template v-if="point && !detectedCity">
      <text class="label">门店所在城市</text>
      <ChoiceField :model-value="province" :options="provinces" placeholder="请选择省份" @update:model-value="selectProvince" />
      <ChoiceField v-if="cities.length > 1" v-model="city" :options="cities" placeholder="请选择城市" />
    </template>
    <text v-if="mapError || error" class="error">{{ mapError || error }}</text>
    <view class="merchant-form-actions">
      <button class="small" :disabled="busy" @tap="emit('cancel')">取消</button>
      <button id="save-merchant-store" class="primary merchant-primary-action" :loading="busy" :disabled="busy || choosing || !canSave" @tap="save">
        {{ store ? '保存门店' : '确认绑定' }}
      </button>
    </view>
  </view>
</template>

<style scoped>
.merchant-store-form .heading { margin-bottom: 12px; }
.merchant-location-button { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 5px; }
.merchant-form-actions { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; }
.merchant-primary-action { flex: 1; }
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { areaDistance } from '../../../shared/h5-areas.mjs'
import { areaLabel, type Listing } from '../../../src/h5/business'
import { amount, categories, productFromListing, type Product } from '../../../src/h5/catalog'
import { changeBrowseLocation, openMapPicker, saveBrowseLocation, selectedLocation, selectedLocationLabel } from '../lib/location'
import { go, productCover } from '../lib/client'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ listings: Listing[]; query?: string; filter?: boolean }>(), { query: '' })
const category = ref('all')
const nearby = ref(false)
const order = ref('recommended')
const listings = computed(() => {
  const published = props.listings.flatMap(item => {
    const product = productFromListing(item)
    return product ? [product] : []
  })
  const query = props.query.trim().toLowerCase()
  const filtered = published.filter(product => {
    const name = categories.find(item => item.id === product.category)?.label || ''
    return (category.value === 'all' || product.category === category.value) &&
      (!nearby.value || sameCity(product)) &&
      (!query || [product.name, product.merchant, name].join(' ').toLowerCase().includes(query))
  })
  if (order.value === 'lowest') filtered.sort((a, b) => a.variants[0].cents - b.variants[0].cents)
  if (order.value === 'nearest') filtered.sort((a, b) => distance(a) - distance(b))
  return filtered
})
function sameCity(product: Product) {
  const district = selectedLocation.value?.district
  if (!district) return false
  const city = product.cityCode ?? product.district?.serviceCityCode
  return product.district?.id === district.id || Boolean(city && city === district.serviceCityCode)
}
function distance(product: Product) {
  const from = selectedLocation.value?.coordinates
  const to = product.coordinates
  return from && to ? areaDistance(from, to) : Infinity
}
function show(product: Product) {
  go('directory', { module: 'shop', id: product.id })
}
function toggleNearby() {
  if (nearby.value) nearby.value = false
  else withShopLocation(() => { nearby.value = true })
}
function withShopLocation(action: () => void) {
  if (selectedLocation.value) action()
  else openMapPicker(location => {
    if (!location) return
    saveBrowseLocation(location)
    action()
  })
}
watch(selectedLocation, location => {
  if (location) return
  nearby.value = false
  if (order.value === 'nearest') order.value = 'recommended'
})
</script>

<template>
  <view v-if="filter" class="card market-filters">
    <view class="spread">
      <button class="text-button" @tap="changeBrowseLocation"><UiIcon name="location" />{{ selectedLocationLabel }}</button>
      <button :class="['chip', { active: nearby }]" :aria-pressed="nearby" @tap="toggleNearby">仅看同城</button>
    </view>
    <view class="chips">
      <button v-for="item in categories" :key="item.id" :class="['chip', { active: category === item.id }]" @tap="category = item.id">{{ item.label }}</button>
    </view>
    <view class="chips">
      <button :class="['chip', { active: order === 'recommended' }]" @tap="order = 'recommended'">综合推荐</button>
      <button :class="['chip', { active: order === 'lowest' }]" @tap="order = 'lowest'">价格最低</button>
      <button :class="['chip', { active: order === 'nearest' }]" @tap="withShopLocation(() => { order = 'nearest' })">距离最近</button>
    </view>
  </view>
  <view v-if="listings.length" class="product-grid">
    <view v-for="product in listings" :key="product.id" class="product-card">
      <button class="product-open" :aria-label="'查看' + product.name" @tap="show(product)">
        <image v-if="product.hasCover" class="product-art" :src="productCover(product.id)" mode="aspectFill" lazy-load />
        <view v-else class="product-art product-art-platform"><UiIcon name="entry-shop" :size="30" /></view>
        <text class="product-title">{{ product.name }}</text>
        <text class="product-merchant">{{ product.merchant }}</text>
        <text class="product-area">{{ areaLabel(product.area, product.district) || (product.stock === 0 ? '暂无库存' : '') }}</text>
      </button>
      <view class="product-foot">
        <text>¥<text class="product-price">{{ amount(product.variants[0].cents) }}</text></text>
        <button class="text-button product-plus" :aria-label="'选购' + product.name" @tap="show(product)"><UiIcon name="plus" /></button>
      </view>
    </view>
  </view>
  <view v-else class="card empty-card">
    <UiIcon name="empty-cart" :size="24" />
    <text>{{ query ? '没有匹配的商品' : '当前范围暂无商品' }}</text>
    <button v-if="nearby && !query" class="text-button" @tap="nearby = false">查看全部商品</button>
  </view>
</template>

<style scoped>
.market-filters { padding: 9px 11px 5px; }
.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.product-card { min-width: 0; overflow: hidden; border: 1px solid #ebe8e1; border-radius: 13px; background: #fff; }
.product-open { display: block; width: 100%; padding: 0; border: 0; border-radius: 0; text-align: left; color: #262422; }
.product-art { display: block; width: 100%; aspect-ratio: 1; height: auto; background: #faf0d7; }
.product-art-platform { display: flex; align-items: center; justify-content: center; aspect-ratio: 1.45; }
.product-title, .product-merchant, .product-area { display: block; padding: 1px 9px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.product-title { padding-top: 8px; font-size: 14px; }
.product-merchant, .product-area { color: #66625a; font-size: 12px; font-weight: 400; }
.product-area { font-size: 10px; }
.product-foot { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px 8px; color: #b34323; }
.product-price { color: #b34323; font-size: 20px; font-weight: 800; }
.product-plus { width: 32px; border-radius: 50%; background: #fff2bf; }
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { areaDistance } from '../../../shared/h5-areas.mjs'
import { areaLabel, type Listing } from '../../../src/h5/business'
import { amount, categories, productFromListing, type Product } from '../../../src/h5/catalog'
import { openMapPicker, saveBrowseLocation, selectedLocation } from '../lib/location'
import { go, productCover } from '../lib/client'
import BrowseLocation from './BrowseLocation.vue'
import LoadState from './LoadState.vue'
import ChoiceField from './ChoiceField.vue'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ listings: Listing[]; query?: string; filter?: boolean; loading?: boolean; error?: string }>(), { query: '' })
const emit = defineEmits<{ 'location-change': []; retry: [] }>()
const sortOptions = [
  {id:'recommended',label:'推荐'}, {id:'sales',label:'按销量'},
  {id:'price-asc',label:'按价格 ↑'}, {id:'price-desc',label:'按价格 ↓'},
  {id:'distance-asc',label:'按距离 ↑'}, {id:'distance-desc',label:'按距离 ↓'},
]
const categoryOptions = categories.map(item => ({...item,label:item.id === 'all' ? '全部商品' : item.label}))
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
  if (order.value === 'sales') filtered.sort((a,b) => (b.salesCount ?? 0) - (a.salesCount ?? 0))
  if (order.value.startsWith('price-')) {
    const direction = order.value === 'price-asc' ? 1 : -1
    filtered.sort((a,b) => direction * (a.variants[0].cents - b.variants[0].cents))
  }
  if (order.value.startsWith('distance-')) {
    const direction = order.value === 'distance-asc' ? 1 : -1
    const distances = new Map(filtered.map(product => [product.id, distance(product)]))
    filtered.sort((a,b) => {
      const first = distances.get(a.id) ?? Infinity
      const second = distances.get(b.id) ?? Infinity
      if (first === second) return 0
      if (first === Infinity) return 1
      if (second === Infinity) return -1
      return direction * (first - second)
    })
  }
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
function chooseOrder(value: string) {
  if (!value.startsWith('distance-') || selectedLocation.value) {
    order.value = value
    return
  }
  void openMapPicker(location => {
    if (!location) return
    saveBrowseLocation(location)
    order.value = value
    emit('location-change')
  })
}
watch(selectedLocation, location => {
  if (location) return
  nearby.value = false
  if (order.value.startsWith('distance-')) order.value = 'recommended'
})
</script>

<template>
  <view v-if="filter" class="browse-filters market-filters">
    <ChoiceField id="shop-sort-filter" :model-value="order" :options="sortOptions" appearance="filter" @update:model-value="chooseOrder" />
    <ChoiceField v-model="category" :options="categoryOptions" appearance="filter" />
    <BrowseLocation v-model:nearby="nearby" @change="emit('location-change')" />
    <button class="text-button market-cart" @tap="go('orders')">
      <UiIcon name="nav-cart" :size="14" />购物车
    </button>
  </view>
  <LoadState v-if="loading || error" :loading="!!loading" :error="error || ''" @retry="emit('retry')" />
  <view v-else-if="listings.length" class="product-grid" :class="{ 'market-grid': filter }">
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
    <UiIcon v-if="!filter" name="empty-cart" :size="24" />
    <text>{{ query ? '没有匹配的商品' : '当前范围暂无商品' }}</text>
    <button v-if="nearby && !query" class="text-button" @tap="nearby = false">查看全部商品</button>
  </view>
</template>

<style scoped>
.market-filters { gap: 7px; }
.market-cart { flex: none; margin-left: auto; padding: 0 2px; white-space: nowrap; font-size: 12px; }
.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.product-card { min-width: 0; overflow: hidden; border: 1px solid #ebe8e1; border-radius: 13px; background: #fff; }
.product-open { display: block; width: 100%; padding: 0; border: 0; border-radius: 0; text-align: left; color: #262422; }
.product-art { display: block; width: 100%; aspect-ratio: 1; height: auto; background: #faf0d7; }
.market-grid .product-art { aspect-ratio: 1.28; }
.product-art-platform { display: flex; align-items: center; justify-content: center; aspect-ratio: 1.45; }
.product-title, .product-merchant, .product-area { display: block; padding: 1px 9px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.product-title { padding-top: 8px; font-size: 14px; }
.product-merchant, .product-area { color: #66625a; font-size: 12px; font-weight: 400; }
.product-area { font-size: 10px; }
.product-foot { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px 8px; color: #b34323; }
.product-price { color: #b34323; font-size: 20px; font-weight: 800; }
.product-plus { width: 32px; border-radius: 50%; background: #fff2bf; }
</style>

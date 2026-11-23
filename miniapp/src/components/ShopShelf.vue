<script setup lang="ts">
import { computed, ref } from 'vue'
import { areaDistance, h5Areas } from '../../../shared/h5-areas.mjs'
import { areaLabel, type Listing } from '../../../src/h5/business'
import { amount, categories, products, productFromListing, type Product } from '../../../src/h5/catalog'
import { selectedArea } from '../lib/area'
import { go } from '../lib/client'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ listings: Listing[]; query?: string; filter?: boolean }>(), { query: '' })
const emit = defineEmits<{ area: [] }>()
const category = ref('all')
const nearby = ref(false)
const order = ref('recommended')
const detail = ref<Product>()
const variant = ref(0)
const listings = computed(() => {
  const published = props.listings.flatMap(item => {
    const product = productFromListing(item)
    return product ? [product] : []
  })
  const query = props.query.trim().toLowerCase()
  const available = published.length ? published : products
  const filtered = available.filter(product => {
    const name = categories.find(item => item.id === product.category)?.label || ''
    return (category.value === 'all' || product.category === category.value) &&
      (!nearby.value || product.area === selectedArea.value) &&
      (!query || [product.name, product.merchant, name].join(' ').toLowerCase().includes(query))
  })
  if (order.value === 'lowest') filtered.sort((a, b) => a.variants[0].cents - b.variants[0].cents)
  if (order.value === 'nearest') filtered.sort((a, b) => distance(a.area) - distance(b.area))
  return filtered
})
function distance(area: string) {
  const from = h5Areas.find(item => item.id === selectedArea.value)
  const to = h5Areas.find(item => item.id === area)
  return from && to ? areaDistance(from, to) : Infinity
}
function show(product: Product) {
  if (product.platform) {
    const item = props.listings.find(item => item.id === product.id)
    if (item) go('directory', { module: item.module, id: item.id })
  } else {
    variant.value = 0
    detail.value = product
  }
}
function toggleNearby() {
  nearby.value = !nearby.value
  if (nearby.value && !selectedArea.value) emit('area')
}
</script>

<template>
  <view v-if="filter" class="card market-filters">
    <view class="spread">
      <button class="text-button" @tap="emit('area')"><UiIcon name="location" />{{ areaLabel(selectedArea) || '选择商圈' }}</button>
      <button :class="['chip', { active: nearby }]" :aria-pressed="nearby" @tap="toggleNearby">同城优先</button>
    </view>
    <view class="chips">
      <button v-for="item in categories" :key="item.id" :class="['chip', { active: category === item.id }]" @tap="category = item.id">{{ item.label }}</button>
    </view>
    <view class="chips">
      <button :class="['chip', { active: order === 'recommended' }]" @tap="order = 'recommended'">综合推荐</button>
      <button :class="['chip', { active: order === 'lowest' }]" @tap="order = 'lowest'">价格最低</button>
      <button :class="['chip', { active: order === 'nearest' }]" @tap="order = 'nearest'">离我最近</button>
    </view>
  </view>
  <view v-if="listings.length" class="product-grid">
    <view v-for="product in listings" :key="product.id" class="product-card">
      <button class="product-open" :aria-label="'查看' + product.name" @tap="show(product)">
        <view v-if="product.platform" class="product-art product-art-platform"><UiIcon name="entry-shop" :size="30" /></view>
        <image v-else class="product-art" :src="'/static/products/' + product.id + '.webp'" mode="aspectFill" />
        <text class="product-title">{{ product.name }}</text>
        <text class="product-merchant">{{ product.merchant }}</text>
        <text class="product-area">{{ areaLabel(product.area) || (product.platform && !product.stock ? '已售罄' : '') }}</text>
      </button>
      <view class="product-foot">
        <text>¥<text class="product-price">{{ amount(product.variants[0].cents) }}</text></text>
        <button class="text-button product-plus" :aria-label="'选购' + product.name" @tap="show(product)"><UiIcon name="plus" /></button>
      </view>
    </view>
  </view>
  <view v-else class="card empty-card">
    <UiIcon name="empty-cart" :size="24" />
    <text>{{ query ? '没有匹配的商品' : nearby && !selectedArea ? '先选择商圈' : '当前范围暂无商品' }}</text>
    <button v-if="nearby && !query" class="text-button" @tap="nearby = false">查看全部商圈</button>
  </view>
  <view v-if="detail" class="modal-scrim" @tap="detail = undefined">
    <view class="modal-panel" role="dialog" :aria-label="detail.name" @tap.stop>
      <view class="spread">
        <text class="heading">{{ detail.name }}</text>
        <button class="text-button" @tap="detail = undefined">关闭</button>
      </view>
      <image class="example-product" :src="'/static/products/' + detail.id + '.webp'" mode="aspectFill" />
      <text class="product-price">¥{{ amount(detail.variants[variant].cents) }}</text>
      <text class="body">{{ detail.description }}</text>
      <view class="chips">
        <button v-for="(item, i) in detail.variants" :key="item.name" :class="['chip', { active: i === variant }]" @tap="variant = i">{{ item.name }}</button>
      </view>
      <text class="sub">示例商品，暂未接入库存、配送和购买页。</text>
    </view>
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
.example-product { display: block; width: 100%; max-width: 200px; height: 175px; margin: 6px auto; border-radius: 12px; }
</style>

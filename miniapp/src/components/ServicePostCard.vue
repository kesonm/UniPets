<script setup lang="ts">
import { computed } from 'vue'
import type { ServicePost } from '../../../src/h5/types'
import { serviceCategories } from '../../../shared/h5-discovery.mjs'
import { money } from '../lib/cart'
import { servicePostImage } from '../lib/client'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ post: ServicePost; detail?: boolean }>()
const emit = defineEmits<{ open: []; like: []; comment: [] }>()
const images = computed(() => Array.from({length:props.post.imageCount || 0}, (_,index) =>
  servicePostImage(props.post.id,index+1)))
const categoryName = computed(() => props.post.categoryLabel ||
  serviceCategories.find(item => item.id === props.post.category)?.label || '其他服务')
const distance = computed(() => {
  const value = props.post.distanceMeters
  if (value === undefined) return ''
  if (value === null) return '距离未知'
  if (value < 100) return '约 100 米内'
  if (value < 1000) return '约 ' + Math.round(value / 100) * 100 + ' 米'
  return '约 ' + (value / 1000).toFixed(value < 10_000 ? 1 : 0) + ' 公里'
})

function preview(current: string) {
  uni.previewImage({ urls: images.value, current })
}
</script>

<template>
  <view class="card service-card">
    <view class="spread service-meta">
      <text class="service-category">{{ categoryName }}</text>
      <text class="sub">{{ post.provider }}</text>
    </view>
    <text class="heading service-title">{{ post.title }}</text>
    <view v-if="detail && images.length" class="service-gallery" :class="{ single:images.length===1 }">
      <image v-for="(url,index) in images" :key="url" :src="url" mode="aspectFill" :aria-label="'查看第 '+(index+1)+' 张服务配图'" @tap="preview(url)" />
    </view>
    <image v-else-if="images.length" class="service-cover" :src="images[0]" mode="aspectFill" lazy-load @tap="emit('open')" />
    <text :class="['body', { excerpt: !detail }]">{{ post.description }}</text>
    <view v-if="post.venue || post.priceCents || distance" class="spread service-location">
      <view v-if="post.venue" class="service-address">
        <UiIcon name="location" :size="12" /><text>{{ post.venue }}</text>
      </view>
      <text v-if="distance" class="service-distance">{{ distance }}</text>
      <text v-if="post.priceCents" class="service-price">{{ money(post.priceCents) }}</text>
    </view>
    <view class="spread service-footer">
      <view class="row">
        <button class="text-button" :aria-pressed="Boolean(post.liked)" @tap="emit('like')">
          <UiIcon :name="post.liked ? 'star-active' : 'star'" :size="15" />{{ post.liked ? '已赞' : '点赞' }} {{ post.likes }}
        </button>
        <button class="text-button" @tap="emit('comment')">
          <UiIcon name="post-author" :size="14" />评论 {{ post.commentCount }}
        </button>
      </view>
      <button v-if="!detail" class="small" @tap="emit('open')">查看详情</button>
    </view>
  </view>
</template>

<style scoped>
.service-card { overflow: hidden; }
.service-meta { justify-content: flex-start; gap: 7px; }
.service-category {
  display: block;
  padding: 3px 7px;
  border-radius: 6px;
  color: #6b4e14;
  background: #fff3cb;
  font-size: 11px;
  font-weight: 700;
}
.service-title { margin: 9px 0 0; }
.service-cover,.service-gallery { margin-top: 9px; }
.service-cover,.service-gallery image { display: block; width: 100%; border-radius: 9px; background: var(--canvas); }
.service-cover { height: 140px; }
.service-gallery { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }
.service-gallery image { height: 100px; }
.service-gallery.single { grid-template-columns: 1fr; }
.service-gallery.single image { height: min(72vw, 320px); }
.excerpt { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.service-location { margin-top: 9px; gap: 8px; flex-wrap: wrap; }
.service-address { display: flex; align-items: baseline; gap: 5px; flex: 1; min-width: 0; font-size: 12px; color: var(--muted); }
.service-price { color: #674c0c; font-size: 15px; font-weight: 800; }
.service-distance { color: var(--muted); font-size: 12px; }
.service-footer { padding-top: 7px; margin-top: 8px; border-top: 1px solid var(--border); }
</style>

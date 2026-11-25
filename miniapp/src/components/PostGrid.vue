<script setup lang="ts">
import type { H5Post } from '../../../src/h5/types'
import { areaLabel } from '../../../src/h5/business'
import { postPetTypeLabels } from '../../../shared/h5-discovery.mjs'
import { publicImage } from '../lib/client'
import UiIcon from './UiIcon.vue'

withDefaults(defineProps<{ posts: readonly H5Post[]; liked?: string[]; showArea?: boolean; showPetType?: boolean; reactions?: boolean }>(), {
  liked: () => [],
})
const emit = defineEmits<{ view: [post: H5Post]; like: [post: H5Post] }>()

function when(value: string) {
  const date = new Date(value)
  const elapsed = Date.now() - date.getTime()
  if (!Number.isFinite(elapsed)) return ''
  if (elapsed < 3_600_000) return ' · 刚刚'
  if (elapsed < 86_400_000) return ' · ' + Math.floor(elapsed / 3_600_000) + ' 小时前'
  const chinaDate = new Date(date.getTime() + 8 * 3_600_000)
  return ' · ' + (chinaDate.getUTCMonth() + 1) + '月' + chinaDate.getUTCDate() + '日'
}
</script>

<template>
  <view class="post-grid">
    <view v-for="post in posts" :key="post.id" class="post">
      <button class="post-open" :aria-label="'查看动态 ' + post.title" @tap="emit('view', post)">
        <view class="post-cover">
          <image v-if="post.exampleImage" :src="'/static/' + post.id + '.webp'" mode="aspectFill" />
          <image v-else-if="post.hasImage" :src="publicImage('/h5/posts/' + post.id + '/image')" mode="aspectFill" lazy-load />
          <UiIcon v-else name="picture" :size="26" />
          <text v-if="post.exampleImage" class="post-example">示例动态</text>
          <text v-else-if="post.hidden" class="post-example">已隐藏</text>
        </view>
        <text class="post-title">{{ post.title }}</text>
      </button>
      <view class="post-footer">
        <view class="post-author">
          <UiIcon name="post-author" :size="11" />
          <text>{{ post.petName }}<text v-if="!post.exampleImage" class="post-date">{{ when(post.createdAt) }}</text></text>
        </view>
        <button
          v-if="reactions && !post.exampleImage"
          class="post-like"
          :aria-label="'点赞 ' + post.title"
          :aria-pressed="liked.includes(post.id)"
          @tap="emit('like', post)"
        >
          <UiIcon :name="liked.includes(post.id) ? 'star-active' : 'star'" :size="12" />
          <text>{{ post.likes }}</text>
        </button>
      </view>
      <text v-if="showPetType" class="post-type">{{ postPetTypeLabels[post.petType || post.species] }}{{ post.breed ? ' · ' + post.breed : '' }}</text>
      <view v-if="showArea && post.area" class="post-area">
        <UiIcon name="post-location" :size="11" />
        <text>{{ areaLabel(post.area, post.district) }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.post-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.post { min-width: 0; overflow: hidden; border: 1px solid #ebe8e1; border-radius: 13px; background: #fff; }
.post-open {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  text-align: left;
  background: transparent;
  color: #262422;
}
.post-cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1.28;
  overflow: hidden;
  background: #fbf2d7;
}
.post-cover > image { position: absolute; inset: 0; width: 100%; height: 100%; }
.post-example {
  position: absolute;
  left: 7px;
  top: 7px;
  padding: 3px 6px;
  border-radius: 6px;
  background: #fff9df;
  color: #594926;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
}
.post-title { display: block; padding: 8px 9px 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; }
.post-footer { display: flex; justify-content: space-between; align-items: center; min-height: 28px; padding: 1px 8px 7px; color: #66625a; font-size: 11px; }
.post-author { display: flex; align-items: center; gap: 4px; min-width: 0; }
.post-author > text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.post-date { color: #776d59; font-size: 10px; }
.post-type { display: block; margin: -1px 8px 7px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #776d59; font-size: 11px; }
.post-like { display: flex; align-items: center; gap: 3px; min-height: 25px; padding: 0 2px; border: 0; background: transparent; color: #66625a; font-size: 11px; }
.post-area { display: flex; align-items: center; gap: 3px; padding: 0 8px 7px; color: #66625a; font-size: 10px; }
</style>

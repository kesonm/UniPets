<script setup lang="ts">
import { computed } from 'vue'
import type { H5Post, Recommendation } from '../../../src/h5/types'
import { areaLabel } from '../../../src/h5/business'
import { postPetTypeLabels, serviceCategories } from '../../../shared/h5-discovery.mjs'
import { jobCategories } from '../../../shared/h5-jobs.mjs'
import { defaultRecommendationLabels, type RecommendationLabels } from '../../../shared/h5-recommendation-labels.mjs'
import { money } from '../lib/cart'
import { go, publicImage, servicePostImage } from '../lib/client'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ posts?: readonly H5Post[]; recommendations?: readonly Recommendation[]; labels?: RecommendationLabels; showBreed?: boolean; liked?: string[]; showArea?: boolean; showPetType?: boolean; reactions?: boolean }>(), {
  posts: () => [],
  labels: () => defaultRecommendationLabels,
  liked: () => [],
  showBreed: true,
})
const emit = defineEmits<{ view: [post: H5Post]; like: [post: H5Post] }>()

type OtherRecommendation = Exclude<Recommendation,{kind:'post'}>
const kindInfo = {
  service:{icon:'entry-services',page:'services'},
  product:{icon:'entry-shop',page:'directory'},
  job:{icon:'entry-jobs',page:'jobs'},
  story:{icon:'entry-stories',page:'stories'},
}

function recommendationTile(item: OtherRecommendation) {
  switch (item.kind) {
    case 'service': {
      const post = item.post
      return {image:post.imageCount ? servicePostImage(post.id) : '', name:post.provider,
        amount:post.priceCents ? money(post.priceCents) : '',
        detail:post.categoryLabel || serviceCategories.find(category => category.id === post.category)?.label || '其他服务'}
    }
    case 'product':
      return {image:'', name:item.post.provider, amount:money(item.post.priceCents), detail:''}
    case 'job':
      return {image:item.post.imageCount ? publicImage('/h5/jobs/'+item.post.id+'/images/1') : '',
        name:item.post.storeName, amount:item.post.salary, detail:jobCategories[item.post.category]}
    case 'story':
      return {image:item.post.hasCover ? publicImage('/h5/stories/'+item.post.id+'/cover') : '',
        name:item.post.author, amount:'', detail:item.post.sceneCount+' 幕'}
  }
}

const entries = computed(() => {
  const content = props.recommendations ?? props.posts.map(post => ({kind:'post' as const, post}))
  return content.map(item => item.kind === 'post' ? item : {...item, tile:recommendationTile(item), badge:props.labels[item.kind]})
})

function openRecommendation(item: OtherRecommendation) {
  const args = { id:item.post.id, ...(item.kind === 'product' ? {module:'shop'} : {}) }
  go(kindInfo[item.kind].page,args)
}

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
    <template v-for="entry in entries" :key="entry.kind + '-' + entry.post.id">
      <view v-if="entry.kind!=='post'" class="post">
        <button class="post-open" :aria-label="'查看' + defaultRecommendationLabels[entry.kind].text + ' ' + entry.post.title" @tap="openRecommendation(entry)">
          <view class="post-cover" :class="entry.kind+'-cover'">
            <image v-if="entry.tile.image" :src="entry.tile.image" mode="aspectFill" lazy-load />
            <UiIcon v-else :name="kindInfo[entry.kind].icon" :size="30" />
            <text class="recommendation-label" :style="{color:entry.badge.textColor,backgroundColor:entry.badge.backgroundColor}">{{ entry.badge.text }}</text>
          </view>
          <text class="post-title">{{ entry.post.title }}</text>
        </button>
        <view class="post-footer">
          <view v-if="entry.tile.name" class="post-author">
            <UiIcon :name="entry.kind==='story' ? 'post-author' : 'location'" :size="11" />
            <text>{{ entry.tile.name }}</text>
          </view>
          <text v-if="entry.tile.amount" class="post-amount">{{ entry.tile.amount }}</text>
        </view>
        <text v-if="entry.tile.detail" class="post-type">{{ entry.tile.detail }}</text>
      </view>
      <view v-else class="post">
        <button class="post-open" :aria-label="'查看动态 ' + entry.post.title" @tap="emit('view', entry.post)">
          <view class="post-cover">
            <image v-if="entry.post.exampleImage" :src="'/static/' + entry.post.id + '.webp'" mode="aspectFill" />
            <image v-else-if="entry.post.hasImage" :src="publicImage('/h5/posts/' + entry.post.id + '/image')" mode="aspectFill" lazy-load />
            <UiIcon v-else name="picture" :size="26" />
            <text v-if="entry.post.exampleImage" class="post-example">示例动态</text>
            <text v-else-if="entry.post.hidden" class="post-example">已隐藏</text>
          </view>
          <text class="post-title">{{ entry.post.title }}</text>
        </button>
        <view class="post-footer">
          <view class="post-author">
            <UiIcon name="post-author" :size="11" />
            <text>{{ entry.post.petName }}<text v-if="!entry.post.exampleImage" class="post-date">{{ when(entry.post.createdAt) }}</text></text>
          </view>
          <button
            v-if="reactions && !entry.post.exampleImage"
            class="post-like"
            :aria-label="'点赞 ' + entry.post.title"
            :aria-pressed="liked.includes(entry.post.id)"
            @tap="emit('like', entry.post)"
          >
            <UiIcon :name="liked.includes(entry.post.id) ? 'star-active' : 'star'" :size="12" />
            <text>{{ entry.post.likes }}</text>
          </button>
        </view>
        <text v-if="showPetType" class="post-type">{{ postPetTypeLabels[entry.post.petType || entry.post.species] }}{{ showBreed && entry.post.breed ? ' · ' + entry.post.breed : '' }}</text>
        <view v-if="showArea && entry.post.area" class="post-area">
          <UiIcon name="post-location" :size="11" />
          <text>{{ areaLabel(entry.post.area, entry.post.district) }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<style src="../../../shared/recommendation-label.css"></style>
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
.service-cover { background: #edf6e9; }
.product-cover { background: #fff3e8; }
.job-cover { background: #edf4fc; }
.story-cover { background: #f4effb; }
.post-amount { flex: 0 1 auto; min-width: 0; margin-left: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--gold-ink); font-weight: 700; }
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

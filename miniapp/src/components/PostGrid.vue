<script setup lang="ts">
import { computed } from 'vue'
import type { StoreJob } from '../../../shared/h5-jobs.mjs'
import type { H5Post } from '../../../src/h5/types'
import { areaLabel } from '../../../src/h5/business'
import { postPetTypeLabels } from '../../../shared/h5-discovery.mjs'
import { publicImage } from '../lib/client'
import UiIcon from './UiIcon.vue'
import JobCard from './JobCard.vue'

const props = withDefaults(defineProps<{ posts: readonly H5Post[]; jobs?: readonly StoreJob[]; showBreed?: boolean; liked?: string[]; showArea?: boolean; showPetType?: boolean; reactions?: boolean }>(), {
  liked: () => [],
  jobs: () => [],
  showBreed: true,
})
const emit = defineEmits<{ view: [post: H5Post]; like: [post: H5Post] }>()

const entries = computed(() => {
  const posts = props.posts.map(post => ({kind:'post' as const, id:post.id, date:post.createdAt, post}))
  const jobs = props.jobs.map(job => ({kind:'job' as const, id:job.id, date:job.publishedAt ?? '', job}))
  if (!jobs.length) return posts
  return [...posts,...jobs].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
})

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
    <template v-for="entry in entries" :key="entry.kind + '-' + entry.id">
      <JobCard v-if="entry.kind==='job'" :job="entry.job" compact />
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

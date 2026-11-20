<script setup lang="ts">
import { ChatDotRound, Location, Picture, Star } from '@element-plus/icons-vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { apiUrl } from '../lib/api'
import type { H5Post } from './types'

defineProps<{posts:H5Post[]; liked?:string[]; areaVisible?:boolean}>()
const emit=defineEmits<{view:[H5Post]; like:[H5Post]}>()
const dates=new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',timeZone:'Asia/Shanghai'})
function when(date: string) {
  const elapsed=Date.now()-new Date(date).getTime()
  if (elapsed<3_600_000) return '刚刚'
  return elapsed<86_400_000 ? `${Math.floor(elapsed/3_600_000)} 小时前` : dates.format(new Date(date))
}
</script>

<template>
  <div class="h5-feed-grid">
    <article v-for="post in posts" :key="post.id" class="h5-post h5-card">
      <button class="h5-post-main" type="button" :aria-label="'查看动态 '+post.title" @click="emit('view',post)">
        <div class="h5-post-cover" :class="{'h5-post-cover--example':post.exampleImage}">
          <img v-if="post.hasImage || post.exampleImage" :src="post.exampleImage || apiUrl('/h5/posts/'+post.id+'/image')" alt="" loading="lazy">
          <el-icon v-else aria-hidden="true"><Picture /></el-icon>
          <span v-if="post.exampleImage">示例动态</span>
        </div>
        <strong>{{ post.title }}</strong>
      </button>
      <div class="h5-post-footer"><div class="h5-post-author"><el-icon><ChatDotRound /></el-icon><span>{{ post.petName }} <small v-if="!post.exampleImage">· {{ when(post.createdAt) }}</small></span></div>
        <button v-if="!post.exampleImage" type="button" class="h5-like" :aria-pressed="liked?.includes(post.id) ?? false" :aria-label="'点赞 '+post.title" @click="emit('like',post)"><el-icon><Star /></el-icon> {{ post.likes }}</button>
      </div>
      <div v-if="areaVisible && post.area" class="h5-post-area"><el-icon><Location /></el-icon>{{ h5Areas.find(item=>item.id===post.area)?.label }}</div>
    </article>
  </div>
</template>

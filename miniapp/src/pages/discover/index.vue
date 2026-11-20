<script setup lang="ts">
import { go } from '../../lib/client'
const sections = [
  {
    title: '宠友与创作',
    links: [
      { name: '社区动态', page: 'feed' },
      { name: '宠友匹配', page: 'social' },
      { name: '宠物故事', page: 'stories' },
      { name: '云上宠物', page: 'demo' },
    ],
  },
  {
    title: '活动与学习',
    links: [
      { name: '宠物赛事', page: 'directory', module: 'events' },
      { name: '培训课程', page: 'directory', module: 'training' },
      { name: '升学教育', page: 'directory', module: 'education' },
      { name: '宠友社群', page: 'directory', module: 'friends' },
    ],
  },
  {
    title: '服务与好物',
    links: [
      { name: '宠物好物', page: 'directory', module: 'shop' },
      { name: '周边服务', page: 'directory', module: 'services' },
      { name: '医疗护理', page: 'directory', module: 'medical' },
      { name: '带宠出行', page: 'directory', module: 'travel' },
      { name: '公益领养', page: 'directory', module: 'charity' },
      { name: '生命纪念', page: 'directory', module: 'immortality' },
    ],
  },
]
function open(link: { page: string; module?: string }) {
  go(link.page, link.module ? { module: link.module } : {})
}
</script>
<template>
  <view class="screen">
    <image src="/static/h5-products.webp" class="hero" mode="aspectFill" />
    <view v-for="section in sections" :key="section.title" class="stack">
      <text class="heading">{{ section.title }}</text>
      <view class="tile-grid">
        <button v-for="link in section.links" :key="link.name" class="tile" @tap="open(link)">
          {{ link.name }}
        </button>
      </view>
    </view>
  </view>
</template>

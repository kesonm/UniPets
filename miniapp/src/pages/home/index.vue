<script setup lang="ts">
import { ref } from 'vue'
import type { H5Post } from '../../../../src/h5/types'
import { api, go, petsTab, publicImage, user } from '../../lib/client'
import { pageLoad } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
const posts = ref<H5Post[]>([])
const { error, loading, refresh } = pageLoad(async () => {
  posts.value = (await api<{ posts: H5Post[] }>('/h5/posts')).posts.slice(0, 4)
})
</script>
<template>
  <view class="screen">
    <view class="welcome">
      <image class="banner" src="/static/h5-hero.webp" mode="aspectFill" />
      <view class="intro">
        <text class="title">宠物的云上空间</text>
        <text class="sub">把档案、照片和成长记忆收在一起。</text>
        <button class="primary hero-action" @tap="petsTab">
          {{ user ? '打开我的宠物档案' : '创建我的宠物档案' }}
        </button>
      </view>
    </view>
    <view class="tile-grid stack">
      <button class="tile" @tap="go('social')">认识宠友</button>
      <button class="tile" @tap="go('stories')">读宠物故事</button>
    </view>
    <view class="spread">
      <text class="heading">社区新鲜事</text>
      <button class="small" @tap="go('feed')">全部动态</button>
    </view>
    <LoadState :error="error" :loading="loading" @retry="refresh" />
    <view v-for="post in posts" :key="post.id" class="card" @tap="go('feed', { id: post.id })">
      <image
        v-if="post.hasImage"
        class="photo"
        mode="aspectFill"
        :src="publicImage('/h5/posts/' + post.id + '/image')"
      />
      <text class="heading">{{ post.title }}</text>
      <text class="sub">{{ post.petName }} · {{ post.author }}</text>
    </view>
    <view v-if="!error && !loading && !posts.length" class="card">
      <text class="empty">社区还没有动态。</text>
      <button class="small" @tap="go('feed', { mode: 'write' })">记录第一条动态</button>
    </view>
  </view>
</template>
<style scoped>
.welcome {
  background: #f6e0a3;
  border-radius: 32rpx;
  overflow: hidden;
}
.banner {
  height: 300rpx;
  width: 100%;
  display: block;
}
.intro {
  padding: 28rpx 30rpx 32rpx;
}
.intro .sub {
  margin-top: 12rpx;
}
.hero-action {
  display: inline-block;
  margin-top: 22rpx;
}
</style>

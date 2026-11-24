<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { PersonalContentItem, PersonalContentTab } from '../../../../src/h5/types'
import { api, go, user } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import UiIcon from '../../components/UiIcon.vue'

const labels = {
  published:{title:'我的发布',empty:'暂无发布'},
  likes:{title:'我的点赞',empty:'暂无点赞'},
  favorites:{title:'我的收藏',empty:'暂无收藏'},
}
const kindLabels = {post:'动态',service:'服务帖',story:'宠物故事'}
const tab = ref<PersonalContentTab>('published')
const items = ref<PersonalContentItem[]>([])
const page = ref(1)
const more = ref(false)
let version = 0

onLoad(options => {
  if (options?.tab === 'likes' || options?.tab === 'favorites') tab.value = options.tab
  uni.setNavigationBarTitle({title:labels[tab.value].title})
})

async function fetchPage(number: number) {
  const current = ++version
  if (!user.value) return
  const result = await api<{items:PersonalContentItem[];hasMore:boolean}>('/h5/posts/mine?tab='+tab.value+'&page='+number)
  if (current !== version) return
  const existing = new Set(items.value.map(item => item.kind+'/'+item.id))
  items.value = number === 1 ? result.items : items.value.concat(result.items.filter(item => !existing.has(item.kind+'/'+item.id)))
  more.value = result.hasMore
  page.value = number
}
const {loading,error,refresh} = pageLoad(() => fetchPage(1), () => {
  items.value = []
  more.value = false
  page.value = 1
  version++
})
const {run,busy,error:actionError} = submitAction()

function open(item: PersonalContentItem) {
  if (item.kind === 'post') return go('feed',{id:item.id,mode:item.visible ? 'detail' : 'private'})
  if (item.visible) go(item.kind === 'story' ? 'stories' : 'services',{id:item.id})
}
</script>

<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <button v-for="item in items" :key="item.kind+'/'+item.id" class="card personal-item"
        :disabled="!item.visible && item.kind !== 'post'" @tap="open(item)">
        <view class="personal-copy">
          <text class="sub">{{ kindLabels[item.kind] }}{{ item.visible ? '' : item.kind === 'service' ? ' · 已下架' : ' · 已隐藏' }}</text>
          <text class="personal-title">{{ item.title }}</text>
        </view>
        <UiIcon v-if="item.visible || item.kind === 'post'" name="right" :size="13" />
      </button>
      <view v-if="!loading && !error && !items.length" class="card empty-card">{{ labels[tab].empty }}</view>
      <text v-if="actionError" class="error">{{ actionError }}</text>
      <button v-if="more" class="personal-more" :disabled="loading || busy" @tap="run(() => fetchPage(page+1))">加载更多</button>
    </template>
  </view>
</template>

<style scoped>
.personal-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; }
.personal-copy { flex: 1; min-width: 0; }
.personal-title { display: block; margin-top: 4px; overflow-wrap: anywhere; font-size: 15px; font-weight: 700; }
.personal-more { width: 100%; }
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onHide, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import FeedSection from '../../components/FeedSection.vue'
import JobList from '../../components/JobList.vue'
import UiIcon from '../../components/UiIcon.vue'
import { go } from '../../lib/client'
import { showFriendsFeed } from '../../lib/home'
import { browseDistrict } from '../../lib/location'
import { useTabPage } from '../../lib/tab-page'

const types = [{id:'social',label:'社交帖'},{id:'jobs',label:'招聘帖'}] as const
type PostType = (typeof types)[number]['id']

const tabLayout = useTabPage('pages/friends/index')
const active = ref(false)
const type = ref<PostType>('social')
const searches = reactive({
  social: {input:'',query:''},
  jobs: {input:'',query:''},
})
const currentSearch = computed(() => searches[type.value])
const reload = ref(0)
const searchLabel = computed(() => type.value === 'social' ? '搜索帖子或宠物' : '搜索岗位或门店')
const jobFilters = computed(() => ({q:searches.jobs.query,district:browseDistrict.value?.id}))

onShow(() => {
  if (showFriendsFeed.value) {
    type.value = 'social'
    showFriendsFeed.value = false
  }
  active.value = true
})
onHide(() => { active.value = false; endRefresh() })
onPullDownRefresh(() => { reload.value++ })

function endRefresh() {
  uni.stopPullDownRefresh()
}

function selectType(next: PostType) {
  if (type.value === next) return
  endRefresh()
  type.value = next
}

function search() {
  const field = currentSearch.value
  const keyword = field.input.trim()
  if (field.query === keyword) reload.value++
  else field.query = keyword
}
</script>

<template>
  <view class="screen tab-screen" :style="tabLayout">
    <view class="tab-leading friends-search">
      <UiIcon name="search" :size="15" />
      <input id="friends-search" v-model="currentSearch.input" :always-embed="true" maxlength="60" :placeholder="searchLabel" :aria-label="searchLabel"
        confirm-type="search" @confirm="search" />
      <button id="friends-submit-search" class="friends-search-button" @tap="search">搜索</button>
    </view>
    <view class="friends-toolbar">
      <view class="friends-tabs" aria-label="帖子分类">
        <button v-for="item in types" :key="item.id" :id="'friends-'+item.id" :class="{active:type===item.id}"
          :aria-pressed="type===item.id" @tap="selectType(item.id)">{{ item.label }}</button>
      </view>
      <button v-if="type==='social'" id="friends-publish" class="text-button friends-publish" @tap="go('feed',{mode:'write'})">
        <UiIcon name="circle-plus" :size="14" />发布帖子
      </button>
    </view>
    <FeedSection v-show="type==='social'" :active="active && type==='social'" :query="searches.social.query" :reload="reload" filterable @loaded="endRefresh" />
    <JobList v-show="type==='jobs'" :active="active && type==='jobs'" :filters="jobFilters" :reload="reload" @loaded="endRefresh" />
  </view>
</template>

<style scoped>
.friends-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--paper);
}
.friends-search input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
}
.friends-search-button {
  flex: none;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: 18px;
  background: var(--yellow);
  font-size: 12px;
}
.friends-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}
.friends-tabs {
  display: flex;
  flex: none;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--paper);
}
.friends-tabs button {
  min-width: 74px;
  min-height: 34px;
  padding: 5px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
}
.friends-tabs button.active { background: #ffed9a; color: #4f3709; }
.friends-publish { flex: none; min-height: 36px; white-space: nowrap; }
</style>

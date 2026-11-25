<script setup lang="ts">
import { ref } from 'vue'
import { onHide, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import type { H5Creator, H5Match } from '../../../../src/h5/types'
import { areaLabel, type Engagement, type Listing } from '../../../../src/h5/business'
import { changeBrowseLocation, selectedLocation, selectedLocationLabel } from '../../lib/location'
import { api, go, speciesNames, user } from '../../lib/client'
import { pageLoad } from '../../lib/page'
import { showFriendsFeed } from '../../lib/home'
import { useTabPage } from '../../lib/tab-page'
import FeedSection from '../../components/FeedSection.vue'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import UiIcon from '../../components/UiIcon.vue'

const sections = [
  { id: 'feed', title: '动态' }, { id: 'matches', title: '同城匹配' }, { id: 'creators', title: '达人专区' },
  { id: 'groups', title: '社群' }, { id: 'tasks', title: '互动任务' },
] as const
type Section = (typeof sections)[number]['id']
type Progress = { posts: number; comments: number; groups: number }
const section = ref<Section>('feed')
const tabLayout = useTabPage('pages/friends/index')
const active = ref(false)
const matches = ref<H5Match[]>([])
const creators = ref<H5Creator[]>([])
const groups = ref<Listing[]>([])
const joined = ref<string[]>([])
const progress = ref<Progress>()
const feedReload = ref(0)
let revision = 0

const { loading, error, refresh } = pageLoad(async () => {
  const version = ++revision
  const current = section.value
  const district = selectedLocation.value?.district.id
  if (current === 'matches') {
    const result = await api<{ matches: H5Match[] }>('/h5/matches' + (district ? '?district=' + encodeURIComponent(district) : ''))
    if (revision === version) matches.value = result.matches
  } else if (current === 'creators') {
    const result = await api<{ creators: H5Creator[] }>('/h5/creators')
    if (revision === version) creators.value = result.creators
  } else if (current === 'groups') {
    const [catalog, participation] = await Promise.all([
      api<{ listings: Listing[] }>('/h5/catalog?module=friends&kind=group'),
      user.value ? api<{ engagements: Engagement[] }>('/h5/engagements') : undefined,
    ])
    if (revision !== version) return
    groups.value = catalog.listings
    joined.value = (participation?.engagements || []).filter(item => item.kind === 'group' && item.status === 'joined').map(item => item.itemId)
  } else if (current === 'tasks' && user.value) {
    const result = await api<{ progress: Progress }>('/h5/community-progress')
    if (revision === version) progress.value = result.progress
  }
}, () => { progress.value = undefined; joined.value = [] })

onShow(() => {
  if (showFriendsFeed.value) {
    section.value = 'feed'
    showFriendsFeed.value = false
  }
  active.value = true
})
onHide(() => { active.value = false; endRefresh() })
onPullDownRefresh(() => {
  if (section.value === 'feed') feedReload.value++
  else void refresh().finally(endRefresh)
})
function endRefresh() {
  uni.stopPullDownRefresh()
}

function select(next: Section) {
  section.value = next
  void refresh()
}
function openMatches(panel: string) {
  go('social', { panel })
}
function openGroup(id: string) {
  if (joined.value.includes(id)) go('social', { group: id })
  else go('directory', { module: 'friends', id })
}
</script>

<template>
  <view class="screen tab-screen" :style="tabLayout">
    <view class="card tab-leading friend-tabs" aria-label="交友栏目">
      <button
        v-for="item in sections"
        :key="item.id"
        :id="'friends-' + item.id"
        :class="{ active: section === item.id }"
        :aria-pressed="section === item.id"
        @tap="select(item.id)"
      >{{ item.title }}</button>
    </view>
    <FeedSection v-if="section === 'feed'" :active="active" :reload="feedReload" filterable @loaded="endRefresh" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <template v-if="section === 'matches'">
        <view class="spread match-toolbar">
          <button class="text-button" @tap="changeBrowseLocation"><UiIcon name="entry-travel" />{{ selectedLocationLabel }}</button>
          <button class="small primary" @tap="openMatches('我的名片')">管理交友档案</button>
        </view>
        <view v-for="pet in matches" :key="pet.petId" class="card">
          <text class="heading">{{ pet.petName }}</text>
          <text class="sub">{{ [pet.breed || speciesNames[pet.species], areaLabel(pet.area, pet.district)].filter(Boolean).join(' · ') }}</text>
          <text v-if="pet.introduction" class="body">{{ pet.introduction }}</text>
          <button class="text-button" @tap="openMatches('匹配')">发出邀请</button>
        </view>
        <view v-if="!loading && !error && !matches.length" class="card empty-card">
          <UiIcon name="account-avatar" :size="24" /><text>暂无符合条件的宠物</text>
        </view>
        <button v-if="user" class="text-button" @tap="openMatches('邀请')">我的邀请</button>
      </template>
      <template v-else-if="section === 'creators'">
        <button v-for="person in creators" :key="person.id" class="card friend-link" @tap="go('social', { creator: person.id })">
          <text class="heading">{{ person.name }}</text>
          <text v-if="person.bio" class="body">{{ person.bio }}</text>
          <text class="sub">{{ person.postCount }} 条动态</text>
        </button>
        <view v-if="!loading && !error && !creators.length" class="card empty-card">
          <UiIcon name="account-avatar" :size="24" /><text>暂无已发布的达人主页</text>
        </view>
      </template>
      <template v-else-if="section === 'groups'">
        <view v-for="item in groups" :key="item.id" class="card">
          <text class="heading">{{ item.title }}</text>
          <text class="body">{{ item.description }}</text>
          <button class="small primary" @tap="openGroup(item.id)">{{ joined.includes(item.id) ? '打开聊天' : '加入社群' }}</button>
        </view>
        <view v-if="!loading && !error && !groups.length" class="card empty-card">
          <UiIcon name="entry-friends" :size="24" /><text>暂无开放社群</text>
        </view>
      </template>
      <template v-else>
        <LoginCard v-if="!user" />
        <view v-else-if="progress" class="card">
          <view class="line">
            <view class="spread"><text>发布一条动态</text><text class="sub">{{ progress.posts ? '已完成' : '待完成' }}</text></view>
            <button class="text-button" @tap="go('feed', { mode: 'write' })">发布动态</button>
          </view>
          <view class="line">
            <view class="spread"><text>参与一次评论</text><text class="sub">{{ progress.comments ? '已完成' : '待完成' }}</text></view>
            <button class="text-button" @tap="select('feed')">查看动态</button>
          </view>
          <view class="line">
            <view class="spread"><text>加入一个社群</text><text class="sub">{{ progress.groups ? '已完成' : '待完成' }}</text></view>
            <button class="text-button" @tap="select('groups')">查看社群</button>
          </view>
        </view>
      </template>
    </template>
  </view>
</template>

<style scoped>
.friend-tabs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; padding: 3px; border-radius: 13px; }
.friend-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  min-width: 0;
  padding: 2px 1px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #645743;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
}
.friend-tabs button.active { background: #ffed9a; color: #4f3709; }
.match-toolbar { margin: 0 0 9px; }
.friend-link { width: 100%; text-align: left; }
@media (max-width: 350px) { .friend-tabs button { font-size: 10px; white-space: normal; } }
</style>

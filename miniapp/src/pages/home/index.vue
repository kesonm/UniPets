<script setup lang="ts">
import { ref, watch } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import type { Listing, StorySummary } from '../../../../src/h5/business'
import type { ServicePost } from '../../../../src/h5/types'
import { homeEntries, homeSearchKinds, homeSlides } from '../../../../src/h5/home'
import { api, go, message } from '../../lib/client'
import { homeImage, showFriendsFeed } from '../../lib/home'
import { locateIfAuthorized, locatingDistrict } from '../../lib/district'
import { browseDistrict, openMapPicker, refreshBrowseDistrict, saveBrowseLocation, selectedLocation } from '../../lib/location'
import { useTabPage } from '../../lib/tab-page'
import FeedSection from '../../components/FeedSection.vue'
import HomeRecommendations from '../../components/HomeRecommendations.vue'
import ShopShelf from '../../components/ShopShelf.vue'
import UiIcon from '../../components/UiIcon.vue'

const entries = homeEntries.map(entry => entry.id === 'stories'
  ? { id: 'jobs', label: '宠物人才就业', tone: entry.tone } as const
  : entry)
type Destination = (typeof entries)[number]['id'] | (typeof homeSlides)[number]['action']
type SearchKind = (typeof homeSearchKinds)[number]['id']

const tabLayout = useTabPage('pages/home/index')
const active = ref(false)
const slide = ref(0)
const queryInput = ref('')
const query = ref('')
const kind = ref<SearchKind>('shop')
const listings = ref<Listing[]>([])
const services = ref<ServicePost[]>([])
const stories = ref<StorySummary[]>([])
const loading = ref(false)
const error = ref('')
const retry = ref(0)

let checkedLocation = false
onShow(() => {
  active.value = true
  if (checkedLocation) return
  checkedLocation = true
  if (selectedLocation.value === undefined) void locateIfAuthorized()
  else void refreshBrowseDistrict()
})
onHide(() => { active.value = false })

function openEntry(id: Destination) {
  if (id === 'friends') showFriendsFeed.value = true
  if (id === 'friends' || id === 'jobs' || id === 'immortality' || id === 'services') go(id)
  else go('directory', { module: id })
}

function chooseHomeLocation() {
  return openMapPicker(saveBrowseLocation, selectedLocation.value)
}

function search() {
  query.value = queryInput.value.trim()
  kind.value = 'shop'
}

function clearSearch() {
  queryInput.value = ''
  query.value = ''
}

watch([query, kind, () => browseDistrict.value?.id, retry], async ([term, target, area], _, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  listings.value = []
  stories.value = []
  services.value = []
  error.value = ''
  loading.value = false
  if (!term || target === 'feed') return
  loading.value = true
  const q = '?q=' + encodeURIComponent(term)
  try {
    if (target === 'stories') {
      const result = await api<{ stories: StorySummary[] }>('/h5/stories' + q)
      if (current) stories.value = result.stories
    } else if (target === 'services') {
      const result = await api<{ posts: ServicePost[] }>('/h5/catalog/service-posts' + q + (area ? '&district=' + encodeURIComponent(area) : ''))
      if (current) services.value = result.posts
    } else {
      const result = await api<{ listings: Listing[] }>('/h5/catalog?kind=product' + (area ? '&district=' + encodeURIComponent(area) : ''))
      if (current) listings.value = result.listings
    }
  } catch (cause) {
    if (current) error.value = message(cause)
  } finally {
    if (current) loading.value = false
  }
})
</script>

<template>
  <view class="market-home tab-screen" :style="tabLayout">
    <view class="market-top">
      <view class="tab-leading market-controls">
        <button id="home-location" class="market-location" :aria-label="'地图选位置 ' + (browseDistrict?.name || '')" @tap="chooseHomeLocation">
          <UiIcon name="location" :size="13" />
          <text>{{ locatingDistrict ? '定位中' : browseDistrict?.name || '定位' }}</text>
        </button>
        <view class="market-search">
          <UiIcon name="search" :size="15" />
          <input v-model="queryInput" :always-embed="true" maxlength="60" placeholder="服务、商品、动态" confirm-type="search" aria-label="搜索服务、商品或动态" @confirm="search" />
          <button @tap="search">搜索</button>
        </view>
      </view>
    </view>

    <template v-if="!query">
      <view class="market-entrances-wrap">
        <view class="market-entrances" aria-label="宠物服务入口">
          <button v-for="entry in entries" :key="entry.id" :id="'entry-' + entry.id" class="market-entry" @tap="openEntry(entry.id)">
            <view :class="['market-entry-icon', entry.tone]"><UiIcon :name="'entry-' + entry.id" :size="21" /></view>
            <text>{{ entry.label }}</text>
          </button>
        </view>
      </view>
      <view class="market-promo" aria-label="轮播图">
        <swiper class="market-swiper" :current="slide" circular @change="slide = $event.detail.current">
          <swiper-item v-for="item in homeSlides" :key="item.action">
            <view :class="['market-hero', 'hero-' + item.action]">
              <image class="market-hero-image" mode="aspectFill" :src="homeImage(item.image)" />
              <view class="market-hero-shade" />
              <view class="market-hero-copy">
                <text class="market-hero-label">宠物数字永生•云上空间</text>
                <text class="market-hero-title">{{ item.title }}</text>
                <text class="market-hero-line">{{ item.line }}</text>
                <button class="market-hero-link" @tap="openEntry(item.action)">
                  {{ item.cta }}<UiIcon :name="item.action === 'events' ? 'right' : 'right-light'" :size="11" />
                </button>
              </view>
            </view>
          </swiper-item>
        </swiper>
        <view class="market-dots">
          <button
            v-for="(item, index) in homeSlides"
            :key="item.action"
            :id="'slide-' + item.action"
            :aria-label="item.title"
            :aria-pressed="slide === index"
            @tap="slide = index"
          ><view :class="{ active: slide === index }" /></button>
        </view>
      </view>
    </template>
    <view v-else class="market-search-tabs">
      <view class="chips">
        <button v-for="item in homeSearchKinds" :key="item.id" :class="['chip', { active: kind === item.id }]" @tap="kind = item.id">
          {{ item.name }}
        </button>
      </view>
      <button class="text-button" @tap="clearSearch">返回首页</button>
    </view>

    <view v-if="!query" class="market-content">
      <HomeRecommendations :active="active" />
      <button id="entry-stories" class="stories-link" @tap="go('stories')">
        <view class="stories-link-icon"><UiIcon name="entry-stories" :size="18" /></view>
        <text>宠物短剧漫剧</text>
        <UiIcon name="right" :size="12" />
      </button>
    </view>
    <view v-else-if="kind === 'feed'" class="market-content">
      <FeedSection :active="active" :query="query" />
    </view>
    <view v-else class="market-content">
      <view v-if="error || loading" class="card empty-card" role="status">
        <text>{{ error || '正在搜索…' }}</text>
        <button v-if="error" class="text-button" @tap="retry++">重试</button>
      </view>
      <template v-else-if="kind === 'stories'">
        <button v-for="story in stories" :key="story.id" class="card market-result" @tap="go('stories', { id: story.id })">
          <text class="heading">{{ story.title }}</text>
          <text class="sub">{{ story.author }} · {{ story.sceneCount }} 幕</text>
        </button>
        <view v-if="!stories.length" class="card empty-card">没有匹配的短剧</view>
      </template>
      <ShopShelf v-else-if="kind === 'shop'" :listings="listings" :query="query" />
      <template v-else>
        <button
          v-for="item in services"
          :key="item.id"
          class="card market-result"
          @tap="go('services', { id: item.id })"
        >
          <text class="heading">{{ item.title }}</text>
          <text class="sub">{{ item.provider }}</text>
        </button>
        <view v-if="!services.length" class="card empty-card">没有匹配的服务帖</view>
      </template>
    </view>
  </view>
</template>

<style scoped>
.market-home { max-width: 500px; margin: auto; }
.stories-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 12px 0 4px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--paper);
  text-align: left;
}
.stories-link text { flex: 1; }
.stories-link-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #e9ddfc;
}
.market-top {
  padding: var(--tab-start, 8px) 14px 5px;
  background: #ffe34e;
}
.market-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.market-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 5px;
  min-width: 0;
  min-height: 37px;
  padding: 3px 4px 3px 9px;
  border-radius: 30px;
  background: #fff;
}
.market-search input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 12px;
}
.market-search button {
  flex: none;
  padding: 5px 8px;
  border: 0;
  border-radius: 20px;
  background: #ffde3f;
  color: #262422;
  font-size: 12px;
}
.market-location {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  min-height: 36px;
  max-width: 92px;
  padding: 5px 7px;
  border: 0;
  border-radius: 22px;
  background: #fff0a0;
  color: #3f350d;
  font-size: 12px;
  font-weight: 600;
}
.market-location text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 350px) {
  .market-controls { gap: 4px; }
  .market-search { gap: 4px; padding-left: 7px; }
  .market-search input { font-size: 11px; }
  .market-search button { padding-inline: 6px; }
}
.market-entrances-wrap { padding: 8px 14px 0; background: linear-gradient(#ffe34e, #fff2ad 39px, #f5f4f1 115px); }
.market-entrances {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 2px;
  padding: 13px 6px 12px;
  border: 1px solid #ebe8e1;
  border-radius: 17px;
  background: #fff;
}
.market-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #292620;
  font-size: 12px;
  font-weight: 680;
  line-height: 1.5;
}
.market-entry-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 14px; }
.market-entry-icon.gold { background: #ffd85a; }
.market-entry-icon.cyan { background: #d7f1f1; }
.market-entry-icon.pink { background: #ffe2ed; }
.market-entry-icon.violet { background: #e9dfff; }
.market-entry-icon.coral { background: #ffe4d6; }
.market-entry-icon.orange { background: #ffead5; }
.market-entry-icon.green { background: #dff2df; }
.market-entry-icon.blue { background: #e1edff; }
.market-entry-icon.yellow { background: #fff0a8; }
.market-promo { position: relative; margin: 12px 14px 0; }
.market-swiper { height: 163px; border-radius: 19px; }
.market-hero {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  overflow: hidden;
  border: 1px solid #f6d56a;
  border-radius: 19px;
  background: #ffe79d;
}
.market-hero-image, .market-hero-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.market-hero-shade { background: linear-gradient(90deg, #ffe6a6 0%, #ffe6a6c9 41%, #ffe6a600 64%); }
.hero-training .market-hero-shade { background: linear-gradient(90deg, #ffedbce8 0%, #ffedbca8 42%, #ffedbc00 66%); }
.hero-events { color: #fff7e8; }
.hero-events .market-hero-shade { background: linear-gradient(90deg, #251607ee, #25160761 65%, transparent); }
.market-hero-copy { position: relative; max-width: 63%; padding: 11px 0 10px 15px; }
.market-hero-label, .market-hero-title, .market-hero-line { display: block; }
.market-hero-label { font-size: 10px; font-weight: 650; letter-spacing: .035em; }
.market-hero-title { margin: 6px 0 4px; font-size: 6vw; font-weight: 850; letter-spacing: -.04em; line-height: 1.15; }
.market-hero-line { margin-bottom: 11px; font-size: 11px; line-height: 1.35; }
.market-hero-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: #32290f;
  color: #fff2aa;
  font-size: 11px;
  font-weight: 720;
}
.hero-events .market-hero-link { background: #ffe468; color: #302313; }
.market-dots {
  position: absolute;
  right: 9px;
  bottom: 8px;
  display: flex;
  gap: 1px;
  padding: 1px 4px;
  border-radius: 20px;
  background: #3b2a1e65;
}
.market-dots button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
}
.market-dots button view { width: 4px; height: 4px; border-radius: 5px; background: #ffffffaa; }
.market-dots button view.active { width: 12px; border-radius: 0; background: #fff; }
.market-content { padding: 14px 14px 0; }
.market-search-tabs { display: flex; align-items: center; justify-content: space-between; padding: 2px 14px 0; }
.market-result { display: block; width: 100%; text-align: left; }
@media (min-width: 517px) { .market-hero-title { font-size: 31px; } }
@media (max-width: 350px) { .market-hero-title { font-size: 21px; } }
</style>

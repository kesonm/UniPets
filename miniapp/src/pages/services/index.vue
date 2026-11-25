<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { servicePhone, sortsByDistance, type ServiceCategory, type ServiceSort } from '../../../../shared/h5-discovery.mjs'
import { serviceRegions } from '../../../../shared/h5-service-regions.mjs'
import type { H5Comment, ServicePost } from '../../../../src/h5/types'
import { api, go, message, toast, user } from '../../lib/client'
import { changeBrowseLocation, openMapPicker, saveBrowseLocation, selectedLocation, selectedLocationLabel } from '../../lib/location'
import { pageLoad, submitAction } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import ServicePostCard from '../../components/ServicePostCard.vue'

const endpoint = '/h5/catalog/service-posts'
const categories = ref<ServiceCategory[]>([])
const categoryOptions = computed(() => [{id:'',label:'全部'}, ...categories.value])
const categoryError = ref('')
const sortOptions: {id:ServiceSort;label:string}[] = [
  {id:'recommended',label:'推荐'},
  {id:'likes-desc',label:'点赞最多'},
  {id:'likes-asc',label:'点赞最少'},
  {id:'distance-asc',label:'距离最近'},
  {id:'distance-desc',label:'距离最远'},
]
const provinces = [{id:'',label:'全国',cities:[]}, ...serviceRegions]
const regionIds = ref<[number,number]>([0,0])
const regionDraft = ref<[number,number]>([0,0])
const cityOptions = (province: typeof provinces[number]) =>
  province.cities.length ? [{id:province.id,label:'全省'}, ...province.cities] : [{id:province.id,label:province.label}]
const regionColumns = computed(() => [provinces,cityOptions(provinces[regionDraft.value[0]])])
const region = computed(() => {
  const [first, second] = regionIds.value
  const province = provinces[first]
  return second ? cityOptions(province)[second] : province
})
const id = ref('')
const category = ref('')
const sort = ref<ServiceSort>('recommended')
const categoryIndex = computed(() => Math.max(0, categoryOptions.value.findIndex(item => item.id === category.value)))
const sortIndex = computed(() => sortOptions.findIndex(item => item.id === sort.value))
const input = ref('')
const query = ref('')
const posts = ref<ServicePost[]>([])
const post = ref<ServicePost>()
const comments = ref<H5Comment[]>([])
const reply = ref('')
const loginDialog = ref(false)
const nextPage = ref(2)
const hasMore = ref(false)
const paging = ref(false)
const phone = computed(() => servicePhone(post.value?.phone || ''))
let scrollToComments = false
let version = 0

onLoad(options => {
  id.value = options?.id || ''
  input.value = query.value = (options?.q || '').slice(0, 60)
  scrollToComments = options?.panel === 'comments'
})
onShow(() => { if (!id.value) void loadCategories() })

async function loadCategories() {
  categoryError.value = ''
  try {
    const result = await api<{items:ServiceCategory[]}>('/h5/catalog/service-categories')
    categories.value = result.items
  } catch (cause) {
    categoryError.value = message(cause)
  }
}

async function loadList(page: number) {
  const current = ++version
  const position = selectedLocation.value?.coordinates
  if (!position && sortsByDistance(sort.value)) sort.value = 'recommended'
  const filters = {
    page, sort:sort.value, q:query.value,
    ...(category.value ? {category:category.value} : {}),
    ...(region.value.id ? {region:region.value.id} : {}),
  }
  type Result = {posts:ServicePost[];hasMore:boolean}
  const params = Object.entries(filters).map(([key,value]) => key+'='+encodeURIComponent(value)).join('&')
  const result = position && sortsByDistance(sort.value)
    ? await api<Result>(endpoint+'/search','POST',{...filters,location:{
        latitude:Number(position.latitude.toFixed(3)),longitude:Number(position.longitude.toFixed(3)),
      }})
    : await api<Result>(endpoint+'?'+params)
  if (current !== version) return
  const seen = new Set(posts.value.map(item => item.id))
  posts.value = page === 1 ? result.posts : [...posts.value, ...result.posts.filter(item => !seen.has(item.id))]
  hasMore.value = result.hasMore
  nextPage.value = page + 1
}

const { loading, error, refresh } = pageLoad(async () => {
  if (!id.value) return loadList(1)
  const [entry, discussion] = await Promise.all([
    api<{ post: ServicePost }>(endpoint + '/' + id.value),
    api<{ comments: H5Comment[] }>(endpoint + '/' + id.value + '/comments'),
  ])
  post.value = entry.post
  comments.value = discussion.comments
  if (scrollToComments) {
    scrollToComments = false
    await nextTick()
    viewComments()
  }
})

function search() {
  query.value = input.value.trim()
  void refresh()
}
type PickerChange = {detail:{value:number|string}}
function chooseCategory(event: PickerChange) {
  const option = categoryOptions.value[Number(event.detail.value)]
  if (!option || option.id === category.value) return
  category.value = option.id
  void refresh()
}

function chooseSort(event: PickerChange) {
  const option = sortOptions[Number(event.detail.value)]
  if (!option || option.id === sort.value) return
  if (sortsByDistance(option.id) && !selectedLocation.value) {
    openMapPicker(location => {
      if (!location) return
      saveBrowseLocation(location)
      sort.value = option.id
    })
    return
  }
  sort.value = option.id
  void refresh()
}

function changeRegionColumn(event: {detail:{column:number;value:number|string}}) {
  const index = Number(event.detail.value)
  if (event.detail.column === 0 && provinces[index]) regionDraft.value = [index,0]
  if (event.detail.column === 1) regionDraft.value = [regionDraft.value[0],index]
}
function chooseRegion(event: {detail:{value:Array<number|string>}}) {
  const [first,second] = event.detail.value.map(Number)
  const province = provinces[first]
  if (!province) return
  regionIds.value = [first,cityOptions(province)[second] ? second : 0]
  regionDraft.value = [...regionIds.value]
  void refresh()
}
async function more() {
  if (paging.value || loading.value) return
  paging.value = true
  try {
    await loadList(nextPage.value)
  } catch (cause) {
    toast(message(cause))
  } finally {
    paging.value = false
  }
}
function open(item: ServicePost, discussion = false) {
  go('services', { id: item.id, ...(discussion ? { panel: 'comments' } : {}) })
}
function viewComments() {
  uni.pageScrollTo({selector: '#service-comments', duration: 230})
}
function call() {
  if (phone.value) uni.makePhoneCall({ phoneNumber: phone.value })
}

const reacting = new Set<string>()
async function like(item: ServicePost) {
  const owner = user.value?.id
  if (!owner) {
    loginDialog.value = true
    return
  }
  if (reacting.has(item.id)) return
  reacting.add(item.id)
  try {
    const result = await api<{ active: boolean; likes: number }>(endpoint + '/' + item.id + '/like', 'PUT', { active: !item.liked })
    if (user.value?.id !== owner) return
    const update = (entry: ServicePost) => entry.id === item.id ? { ...entry, liked: result.active, likes: result.likes } : entry
    posts.value = posts.value.map(update)
    if (post.value) post.value = update(post.value)
    if (!id.value && (sort.value === 'likes-desc' || sort.value === 'likes-asc')) void refresh()
  } catch (cause) {
    toast(message(cause))
  } finally {
    reacting.delete(item.id)
  }
}
const { run, busy, error: replyError } = submitAction()
function comment() {
  return run(async () => {
    const result = await api<{ comment: H5Comment }>(endpoint + '/' + id.value + '/comments', 'POST', { body: reply.value })
    comments.value = [result.comment, ...comments.value]
    if (post.value) post.value = { ...post.value, commentCount: post.value.commentCount + 1 }
    reply.value = ''
  })
}
</script>

<template>
  <view class="screen service-screen">
    <template v-if="!id">
      <view class="card service-search">
        <input v-model="input" :always-embed="true" maxlength="60" placeholder="搜索服务或商家" confirm-type="search" @confirm="search" />
        <button class="small primary" @tap="search">搜索</button>
      </view>
      <view class="card service-filters" aria-label="服务筛选">
        <picker id="service-category-filter" mode="selector" :range="categoryOptions" range-key="label" :value="categoryIndex"
          :disabled="!categories.length" @change="chooseCategory">
          <view class="service-filter">
            <text class="service-filter-label">分类</text>
            <view class="service-filter-selection"><text>{{ categoryOptions[categoryIndex].label }}</text><text class="service-filter-arrow" aria-hidden="true" /></view>
          </view>
        </picker>
        <picker id="service-sort-filter" mode="selector" :range="sortOptions" range-key="label" :value="sortIndex" @change="chooseSort">
          <view class="service-filter">
            <text class="service-filter-label">排序</text>
            <view class="service-filter-selection"><text>{{ sortOptions[sortIndex].label }}</text><text class="service-filter-arrow" aria-hidden="true" /></view>
          </view>
        </picker>
        <picker id="service-region-filter" mode="multiSelector" :range="regionColumns" range-key="label" :value="regionDraft"
          @columnchange="changeRegionColumn" @change="chooseRegion" @cancel="regionDraft = [...regionIds]">
          <view class="service-filter">
            <text class="service-filter-label">地区</text>
            <view class="service-filter-selection"><text>{{ region.label }}</text><text class="service-filter-arrow" aria-hidden="true" /></view>
          </view>
        </picker>
      </view>
      <button v-if="sortsByDistance(sort)" class="text-button" @tap="changeBrowseLocation">距离起点 · {{ selectedLocationLabel }}</button>
      <button v-if="categoryError" class="text-button service-filter-retry" @tap="loadCategories">分类读取失败，点此重试</button>
      <LoadState :error="error" :loading="loading" @retry="refresh" />
      <template v-if="!error">
        <ServicePostCard v-for="item in posts" :key="item.id" :post="item" @open="open(item)" @like="like(item)" @comment="open(item,true)" />
        <view v-if="!loading && !posts.length" class="card empty-card">暂无符合条件的服务帖</view>
        <button v-if="hasMore" class="more-services" :disabled="loading || paging" @tap="more">加载更多</button>
      </template>
    </template>
    <template v-else>
      <LoadState :error="error" :loading="loading" @retry="refresh" />
      <template v-if="post && !error">
        <ServicePostCard :post="post" detail @like="like(post)" @comment="viewComments" />
        <view class="card service-contact">
          <button v-if="phone" id="call-service" class="primary" @tap="call">联系电话 {{ post.phone }}</button>
          <text v-else class="sub">商家暂未填写联系电话</text>
        </view>
        <view id="service-comments" class="card">
          <text class="heading">评论 {{ post.commentCount }}</text>
          <template v-if="user">
            <textarea v-model="reply" class="service-reply" maxlength="500" placeholder="写评论…" />
            <text v-if="replyError" class="error">{{ replyError }}</text>
            <button class="small primary" :disabled="busy || !reply.trim()" @tap="comment">发表评论</button>
          </template>
          <text v-else class="sub">登录后发表评论</text>
          <view v-for="item in comments" :key="item.id" class="line">
            <text class="sub">{{ item.author }} · {{ item.createdAt.slice(0, 10) }}</text>
            <text class="body">{{ item.body }}</text>
          </view>
          <text v-if="!comments.length" class="empty">暂无评论</text>
        </view>
        <LoginCard v-if="!user" />
      </template>
    </template>
    <LoginDialog v-if="loginDialog" @close="loginDialog = false" />
  </view>
</template>

<style scoped>
.service-screen { padding-top: 10px; }
.service-search { display: flex; align-items: center; gap: 8px; padding: 8px; }
.service-search input { flex: 1; min-width: 0; background: #fff; }
.service-search button { flex: none; }
.service-filters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 5px 0; }
.service-filters > picker + picker { border-left: 1px solid var(--border); }
.service-filter { display: grid; gap: 4px; padding: 6px 11px; }
.service-filter-label { color: var(--muted); font-size: 11px; }
.service-filter-selection { display: flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0; font-size: 13px; font-weight: 700; }
.service-filter-selection > text:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.service-filter-arrow { flex: none; width: 5px; height: 5px; border: solid #896b27; border-width: 0 1px 1px 0; transform: translateY(-1px) rotate(45deg); }
.service-filter-retry { margin-bottom: 9px; }
.service-contact button,.more-services { width: 100%; }
.service-reply { height: 67px; margin: 8px 0; }
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { serviceCategories, servicePhone } from '../../../../shared/h5-discovery.mjs'
import type { H5Comment, ServicePost } from '../../../../src/h5/types'
import { api, go, message, toast, user } from '../../lib/client'
import { district } from '../../lib/district'
import { pageLoad, submitAction } from '../../lib/page'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import LoginDialog from '../../components/LoginDialog.vue'
import ServicePostCard from '../../components/ServicePostCard.vue'

const endpoint = '/h5/catalog/service-posts'
const categories = [{ id: '', label: '全部' }, ...serviceCategories]
const id = ref('')
const category = ref('')
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

async function loadList(page: number) {
  const current = ++version
  const params = [
    'page=' + page,
    category.value && 'category=' + encodeURIComponent(category.value),
    district.value?.id && 'district=' + encodeURIComponent(district.value.id),
    query.value && 'q=' + encodeURIComponent(query.value),
  ].filter(Boolean).join('&')
  const result = await api<{ posts: ServicePost[]; hasMore: boolean }>(endpoint + '?' + params)
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

watch(() => district.value?.id, () => { if (!id.value) void refresh() })
function search() {
  query.value = input.value.trim()
  void refresh()
}
function filter(value: string) {
  category.value = value
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
        <input v-model="input" maxlength="60" placeholder="搜索服务或商家" confirm-type="search" @confirm="search" />
        <button class="small primary" @tap="search">搜索</button>
      </view>
      <view class="chips service-categories" aria-label="服务分类">
        <button
          v-for="item in categories"
          :key="item.id"
          :class="['chip', { active: category === item.id }]"
          :aria-pressed="category === item.id"
          @tap="filter(item.id)"
        >{{ item.label }}</button>
      </view>
      <LoadState :error="error" :loading="loading" @retry="refresh" />
      <template v-if="!error">
        <ServicePostCard v-for="item in posts" :key="item.id" :post="item" @open="open(item)" @like="like(item)" @comment="open(item,true)" />
        <view v-if="!loading && !posts.length" class="card empty-card">{{ district ? '当前区县暂无符合条件的服务帖' : '暂无符合条件的服务帖' }}</view>
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
.service-categories { margin: 0 0 12px; }
.service-contact button,.more-services { width: 100%; }
.service-reply { height: 67px; margin: 8px 0; }
</style>

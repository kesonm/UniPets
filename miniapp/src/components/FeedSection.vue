<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { H5Post, H5Social } from '../../../src/h5/types'
import type { StoreJob } from '../../../shared/h5-jobs.mjs'
import { api, go, message, toast, user } from '../lib/client'
import PostGrid from './PostGrid.vue'

const props = withDefaults(defineProps<{
  active: boolean; query?: string; petType?: string; includeJobs?: boolean; reload?: number
}>(), { query: '' })
const emit = defineEmits<{ loaded: [] }>()
const showJobs = computed(() => props.includeJobs && !props.petType)
const filters = computed(() => [
  '&q=' + encodeURIComponent(props.query),
  props.petType && '&petType=' + encodeURIComponent(props.petType),
].join(''))
const posts = ref<H5Post[]>([])
const jobs = ref<StoreJob[]>([])
const liked = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const morePosts = ref(false)
const moreJobs = ref(false)
const more = computed(() => morePosts.value || moreJobs.value)
// Wait for both pages to cover a timestamp before showing it in the combined feed.
const cutoff = computed(() => {
  if (!showJobs.value) return -Infinity
  const postTime = morePosts.value ? Date.parse(posts.value[posts.value.length - 1].createdAt) : -Infinity
  const jobTime = moreJobs.value ? Date.parse(jobs.value[jobs.value.length - 1].publishedAt ?? '') : -Infinity
  return Math.max(postTime, jobTime)
})
const visiblePosts = computed(() => cutoff.value === -Infinity
  ? posts.value
  : posts.value.filter(post => Date.parse(post.createdAt) >= cutoff.value))
const visibleJobs = computed(() => showJobs.value
  ? jobs.value.filter(job => job.publishedAt && Date.parse(job.publishedAt) >= cutoff.value)
  : [])
let revision = 0
let loadedFilters: string | undefined

function appendItems<T extends {id:string}>(current: T[], next: T[]) {
  const ids = new Set(current.map(item => item.id))
  return [...current, ...next.filter(item => !ids.has(item.id))]
}

async function load(append = false) {
  const version = ++revision
  error.value = ''
  loading.value = true
  const nextPage = append ? page.value + 1 : 1
  const query = filters.value
  try {
    const [social, recruiting] = await Promise.all([
      !append || morePosts.value
        ? api<{ posts: H5Post[]; hasMore: boolean }>('/h5/posts?sort=latest&page=' + nextPage + query)
        : undefined,
      showJobs.value && (!append || moreJobs.value)
        ? api<{ items: StoreJob[]; hasMore: boolean }>('/h5/jobs?page=' + nextPage + query)
        : undefined,
    ])
    if (version !== revision) return
    if (social) {
      posts.value = append ? appendItems(posts.value,social.posts) : social.posts
      morePosts.value = social.hasMore
    }
    if (recruiting) {
      jobs.value = append ? appendItems(jobs.value,recruiting.items) : recruiting.items
      moreJobs.value = recruiting.hasMore
    }
    page.value = nextPage
    loadedFilters = query
  } catch (cause) {
    if (version === revision) error.value = message(cause)
  } finally {
    if (version === revision) {
      loading.value = false
      emit('loaded')
    }
  }
}
watch([() => props.active, filters, () => props.reload], ([active,query]) => {
  if (!active) {
    revision++
    loading.value = false
    return
  }
  if (query !== loadedFilters) {
    posts.value = []
    jobs.value = []
    morePosts.value = false
    moreJobs.value = false
  }
  void load()
}, { immediate: true })
onUnmounted(() => { revision++ })

watch(() => props.active, (active, _, onCleanup) => {
  if (!active || !props.includeJobs) return
  const timer = setInterval(() => { if (!loading.value) void load() }, 5 * 60 * 1000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

watch([() => props.active, () => user.value?.id], async ([active, owner], _, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  liked.value = []
  if (!active || !owner) return
  try {
    const result = await api<H5Social>('/h5/me')
    if (current) liked.value = result.likedIds
  } catch { /* Feed reading does not require reactions. */ }
}, { immediate: true })

function view(post: H5Post) {
  go('feed', { id: post.id })
}
const reacting = new Set<string>()
async function like(post: H5Post) {
  if (!user.value) return view(post)
  if (reacting.has(post.id)) return
  const owner = user.value.id
  const active = !liked.value.includes(post.id)
  reacting.add(post.id)
  try {
    const result = await api<{ likes: number }>('/h5/posts/' + post.id + '/reaction', 'PUT', { kind: 'like', active })
    if (user.value?.id !== owner) return
    liked.value = active ? liked.value.concat(post.id) : liked.value.filter(id => id !== post.id)
    posts.value = posts.value.map(item => item.id === post.id ? { ...item, likes: result.likes } : item)
  } catch (cause) {
    toast(message(cause))
  } finally {
    reacting.delete(post.id)
  }
}
</script>

<template>
  <view class="feed-section">
    <view v-if="error" class="card empty-card" role="status">
      <text>{{ error }}</text>
      <button class="text-button" @tap="load()">重新加载</button>
    </view>
    <PostGrid v-else-if="visiblePosts.length || visibleJobs.length" :posts="visiblePosts" :jobs="visibleJobs"
      :liked="liked" :show-breed="!includeJobs" show-pet-type reactions @view="view" @like="like" />
    <view v-else class="card empty-card" role="status">
      <text>{{ loading ? '正在加载帖子…' : query || petType ? '没有匹配的帖子' : '还没有发布的帖子' }}</text>
    </view>
    <button v-if="more && !error" class="more-posts" :disabled="loading" @tap="load(true)">
      {{ loading ? '加载中…' : '加载更多帖子' }}
    </button>
  </view>
</template>

<style scoped>
.more-posts { width: 100%; margin-top: 12px; }
</style>

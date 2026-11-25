<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { H5Post } from '../../../src/h5/types'
import { api, go, message } from '../lib/client'
import { usePostLikes } from '../lib/post-likes'
import PostGrid from './PostGrid.vue'

const props = withDefaults(defineProps<{
  active: boolean; query?: string; petType?: string; autoRefresh?: boolean; showBreed?: boolean; reload?: number
}>(), { query: '', showBreed: true })
const emit = defineEmits<{ loaded: [] }>()
const filters = computed(() => [
  '&q=' + encodeURIComponent(props.query),
  props.petType && '&petType=' + encodeURIComponent(props.petType),
].join(''))
const posts = ref<H5Post[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const more = ref(false)
let revision = 0
let loadedFilters: string | undefined

async function load(append = false) {
  const version = ++revision
  error.value = ''
  loading.value = true
  const nextPage = append ? page.value + 1 : 1
  const query = filters.value
  try {
    const result = await api<{ posts: H5Post[]; hasMore: boolean }>('/h5/posts?sort=latest&page=' + nextPage + query)
    if (version !== revision) return
    const seen = new Set(posts.value.map(item => item.id))
    posts.value = append ? [...posts.value, ...result.posts.filter(item => !seen.has(item.id))] : result.posts
    more.value = result.hasMore
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
    more.value = false
  }
  void load()
}, { immediate: true })
onUnmounted(() => { revision++ })

watch(() => props.active, (active, _, onCleanup) => {
  if (!active || !props.autoRefresh) return
  const timer = setInterval(() => { if (!loading.value) void load() }, 5 * 60 * 1000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

const { liked, like } = usePostLikes(() => props.active, (id, likes) => {
  posts.value = posts.value.map(item => item.id === id ? { ...item, likes } : item)
})

function view(post: H5Post) {
  go('feed', { id: post.id })
}
</script>

<template>
  <view class="feed-section">
    <view v-if="error" class="card empty-card" role="status">
      <text>{{ error }}</text>
      <button class="text-button" @tap="load()">重新加载</button>
    </view>
    <PostGrid v-else-if="posts.length" :posts="posts" :liked="liked" :show-breed="showBreed"
      show-pet-type reactions @view="view" @like="like" />
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

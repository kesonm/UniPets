<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { FeedOrder, H5Post, H5Social } from '../../../src/h5/types'
import { examplePosts, feedSorting } from '../../../src/h5/home'
import { api, go, message, toast, user } from '../lib/client'
import { selectedArea } from '../lib/area'
import PostGrid from './PostGrid.vue'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ active: boolean; query?: string }>(), { query: '' })
const emit = defineEmits<{ area: [] }>()
const sort = ref<FeedOrder>('recommended')
const posts = ref<H5Post[]>([])
const liked = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const more = ref(false)
let revision = 0
const missingArea = computed(() => sort.value === 'near' && !selectedArea.value)
const displayed = computed(() => posts.value.length || props.query || sort.value === 'near' || error.value
  ? posts.value : examplePosts)

async function load(append = false) {
  const version = ++revision
  if (!append) posts.value = []
  error.value = ''
  if (missingArea.value) {
    loading.value = false
    more.value = false
    return
  }
  loading.value = true
  const nextPage = append ? page.value + 1 : 1
  const query = '&q=' + encodeURIComponent(props.query)
  const area = selectedArea.value ? '&area=' + selectedArea.value : ''
  try {
    const result = await api<{ posts: H5Post[]; hasMore: boolean }>(
      '/h5/posts?sort=' + sort.value + '&page=' + nextPage + query + area,
    )
    if (version !== revision) return
    posts.value = append ? posts.value.concat(result.posts.filter(post => !posts.value.some(item => item.id === post.id)))
      : result.posts
    more.value = result.hasMore
    page.value = nextPage
  } catch (cause) {
    if (version === revision) error.value = message(cause)
  } finally {
    if (version === revision) loading.value = false
  }
}
watch([() => props.active, () => props.query, sort, selectedArea], ([active]) => {
  if (active) void load()
}, { immediate: true })
onUnmounted(() => { revision++ })

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

function changeSort(id: FeedOrder) {
  sort.value = id
  if (missingArea.value) emit('area')
}
function view(post: H5Post) {
  go('feed', { id: post.id })
}
function publish() {
  go('feed', { mode: 'write', area: selectedArea.value })
}
const reacting = new Set<string>()
async function like(post: H5Post) {
  if (!user.value) return view(post)
  if (reacting.has(post.id)) return
  const owner = user.value.id
  const active = !liked.value.includes(post.id)
  reacting.add(post.id)
  try {
    await api('/h5/posts/' + post.id + '/reaction', 'PUT', { kind: 'like', active })
    if (user.value?.id !== owner) return
    liked.value = active ? liked.value.concat(post.id) : liked.value.filter(id => id !== post.id)
    posts.value = posts.value.map(item => item.id === post.id ? { ...item, likes: Math.max(0, item.likes + (active ? 1 : -1)) } : item)
  } catch (cause) {
    toast(message(cause))
  } finally {
    reacting.delete(post.id)
  }
}
</script>

<template>
  <view class="feed-section">
    <view class="feed-heading">
      <text>{{ query ? '动态搜索结果' : '宠物动态' }}</text>
      <button class="text-button" @tap="publish"><UiIcon name="circle-plus" :size="14" />发布</button>
    </view>
    <view class="feed-sort" aria-label="宠物动态排序">
      <button
        v-for="item in feedSorting"
        :key="item.id"
        :class="{ active: sort === item.id }"
        :aria-pressed="sort === item.id"
        @tap="changeSort(item.id)"
      >{{ item.name }}</button>
    </view>
    <view v-if="error" class="card empty-card" role="status">
      <text>{{ error }}</text>
      <button class="text-button" @tap="load()">重新加载</button>
    </view>
    <PostGrid v-else-if="displayed.length" :posts="displayed" :liked="liked" :show-area="sort === 'near'" reactions @view="view" @like="like" />
    <view v-else class="card empty-card" role="status">
      <text>{{ loading ? '正在加载动态…' : missingArea ? '选择商圈后查看附近动态' : query ? '没有匹配的动态' : '还没有动态' }}</text>
      <button v-if="missingArea" class="text-button" @tap="emit('area')">选择商圈</button>
    </view>
    <button v-if="more && !error" class="more-posts" :disabled="loading" @tap="load(true)">
      {{ loading ? '加载中…' : '加载更多动态' }}
    </button>
  </view>
</template>

<style scoped>
.feed-heading { display: flex; justify-content: space-between; align-items: center; min-height: 25px; gap: 12px; }
.feed-heading > text { font-size: 19px; line-height: 1.3; font-weight: 800; letter-spacing: -.015em; }
.feed-heading button { min-height: 25px; padding: 2px 4px; }
.feed-sort { display: flex; align-items: center; gap: 21px; margin: 3px 0 8px; }
.feed-sort button {
  position: relative;
  min-width: 36px;
  padding: 8px 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #66625a;
  font-size: 13px;
  font-weight: 400;
}
.feed-sort button.active { color: #262422; font-weight: 800; }
.feed-sort button.active::after { content: ''; position: absolute; top: auto; bottom: 1px; left: 35%; right: 35%; width: auto; height: 3px; border-radius: 5px; background: #efbb00; transform: none; }
.more-posts { width: 100%; margin-top: 12px; }
</style>

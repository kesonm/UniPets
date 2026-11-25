<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { H5Post, H5Social } from '../../../src/h5/types'
import { postPetTypeLabels, postPetTypes } from '../../../shared/h5-discovery.mjs'
import { api, go, message, toast, user } from '../lib/client'
import ChoiceField from './ChoiceField.vue'
import PostGrid from './PostGrid.vue'

const props = withDefaults(defineProps<{ active: boolean; query?: string; filterable?: boolean; reload?: number }>(), { query: '' })
const emit = defineEmits<{ loaded: [] }>()
const petType = ref('')
const breed = ref('')
const breeds = ref<string[]>([])
const types = [{ id: '', label: '全部宠物' }, ...postPetTypes.map(id => ({id, label: postPetTypeLabels[id]}))]
const breedOptions = computed(() => [
  {id: '', label: '全部品种'}, ...[...new Set([breed.value, ...breeds.value])].filter(Boolean).map(id => ({id,label:id})),
])
const filters = computed(() => [
  '&q=' + encodeURIComponent(props.query),
  petType.value && '&petType=' + encodeURIComponent(petType.value),
  breed.value && '&breed=' + encodeURIComponent(breed.value),
].join(''))
const posts = ref<H5Post[]>([])
const liked = ref<string[]>([])
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
    const result = await api<{ posts: H5Post[]; hasMore: boolean }>(
      '/h5/posts?sort=latest&page=' + nextPage + query,
    )
    if (version !== revision) return
    posts.value = append ? posts.value.concat(result.posts.filter(post => !posts.value.some(item => item.id === post.id)))
      : result.posts
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
  if (!active || !props.filterable) return
  const timer = setInterval(() => { if (!loading.value) void load() }, 5 * 60 * 1000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

watch([() => props.active, petType, () => props.reload], async ([active, type], _, onCleanup) => {
  if (!active || !props.filterable) return
  let current = true
  onCleanup(() => { current = false })
  try {
    const result = await api<{ breeds: string[] }>('/h5/posts/breeds' + (type ? '?petType=' + encodeURIComponent(type) : ''))
    if (current) breeds.value = result.breeds
  } catch { /* Text search remains available. */ }
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

function changeType(value: string) {
  petType.value = value
  breed.value = ''
  breeds.value = []
}
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
    <view v-if="filterable" class="feed-choices">
      <ChoiceField :model-value="petType" :options="types" @update:model-value="changeType" />
      <ChoiceField v-model="breed" :options="breedOptions" />
    </view>
    <view v-if="error" class="card empty-card" role="status">
      <text>{{ error }}</text>
      <button class="text-button" @tap="load()">重新加载</button>
    </view>
    <PostGrid v-else-if="posts.length" :posts="posts" :liked="liked" show-pet-type reactions @view="view" @like="like" />
    <view v-else class="card empty-card" role="status">
      <text>{{ loading ? '正在加载帖子…' : query || petType || breed ? '没有匹配的帖子' : '还没有发布的帖子' }}</text>
    </view>
    <button v-if="more && !error" class="more-posts" :disabled="loading" @tap="load(true)">
      {{ loading ? '加载中…' : '加载更多动态' }}
    </button>
  </view>
</template>

<style scoped>
.feed-choices { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-bottom: 10px; }
.more-posts { width: 100%; margin-top: 12px; }
</style>

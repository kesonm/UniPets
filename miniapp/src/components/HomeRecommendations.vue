<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Recommendation } from '../../../src/h5/types'
import { api, go, message, user } from '../lib/client'
import { browseDistrict } from '../lib/location'
import { recommendationSeed } from '../lib/home'
import { usePostLikes } from '../lib/post-likes'
import PostGrid from './PostGrid.vue'

const props = defineProps<{ active: boolean }>()
const items = ref<Recommendation[]>([])
const loading = ref(false)
const error = ref('')
const retry = ref(0)
const { liked, like } = usePostLikes(() => props.active, (id, likes) => {
  items.value = items.value.map(item => item.kind === 'post' && item.post.id === id
    ? { ...item, post: { ...item.post, likes } }
    : item)
})

watch([() => props.active, () => user.value?.id, () => browseDistrict.value?.id, retry], async ([active, , area], _, onCleanup) => {
  if (!active) return
  let current = true
  onCleanup(() => { current = false })
  items.value = []
  error.value = ''
  loading.value = true
  try {
    const query = '?seed=' + recommendationSeed + (area ? '&district=' + encodeURIComponent(area) : '')
    const result = await api<{items: Recommendation[]}>('/h5/posts/recommendations' + query)
    if (current) items.value = result.items
  } catch (cause) {
    if (current) error.value = message(cause)
  } finally {
    if (current) loading.value = false
  }
}, { immediate: true })

</script>

<template>
  <view class="recommendations">
    <text class="heading">为你推荐</text>
    <PostGrid v-if="items.length" :recommendations="items" :liked="liked" :show-breed="false" show-pet-type reactions
      @view="go('feed', { id: $event.id })" @view-service="go('services', { id: $event.id })" @like="like" />
    <view v-else class="card empty-card" role="status">
      <text>{{ error || (loading ? '正在加载推荐…' : '暂无推荐内容') }}</text>
      <button v-if="error" class="text-button" @tap="retry++">重试</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { postPetTypeLabels, serviceCategories } from '../../../shared/h5-discovery.mjs'
import type { Recommendation } from '../../../src/h5/types'
import { api, go, message, publicImage, user } from '../lib/client'
import { district } from '../lib/district'
import { recommendationSeed } from '../lib/home'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ active: boolean }>()
const items = ref<Recommendation[]>([])
const loading = ref(false)
const error = ref('')
const retry = ref(0)

watch([() => props.active, () => user.value?.id, () => district.value?.id, retry], async ([active, , area], _, onCleanup) => {
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

function label(item: Recommendation) {
  if (item.kind === 'service') return serviceCategories.find(category => category.id === item.post.category)?.label || '其他服务'
  return postPetTypeLabels[item.post.petType || item.post.species] + ' · 动态'
}
function open(item: Recommendation) {
  go(item.kind === 'service' ? 'services' : 'feed', { id: item.post.id })
}
</script>

<template>
  <view class="recommendations">
    <text class="heading">为你推荐</text>
    <button v-for="item in items" :key="item.kind + '-' + item.post.id" class="card recommended-card" @tap="open(item)">
      <view class="recommended-copy">
        <view class="recommended-meta">
          <text :class="['recommended-type', { merchant: item.kind === 'service' }]">{{ label(item) }}</text>
          <text class="recommended-author">{{ item.kind === 'service' ? item.post.provider : item.post.author }}</text>
        </view>
        <text class="recommended-title">{{ item.post.title }}</text>
        <text class="recommended-excerpt">{{ item.kind === 'service' ? item.post.description : item.post.body }}</text>
      </view>
      <image
        v-if="item.kind === 'post' && item.post.hasImage"
        class="recommended-image"
        :src="publicImage('/h5/posts/' + item.post.id + '/image')"
        mode="aspectFill"
        lazy-load
      />
      <UiIcon v-else name="right" :size="12" />
    </button>
    <view v-if="!items.length" class="card empty-card" role="status">
      <text>{{ error || (loading ? '正在加载推荐…' : '暂无推荐内容') }}</text>
      <button v-if="error" class="text-button" @tap="retry++">重试</button>
    </view>
  </view>
</template>

<style scoped>
.recommended-card { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; }
.recommended-copy { flex: 1; min-width: 0; }
.recommended-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; }
.recommended-type { flex: none; padding: 2px 6px; border-radius: 5px; background: #f3eee1; color: #624d21; }
.recommended-type.merchant { background: #fdf1c4; }
.recommended-author { min-width: 0; overflow: hidden; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.recommended-title,.recommended-excerpt { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.recommended-title { margin: 5px 0 2px; color: var(--ink); font-size: 15px; }
.recommended-excerpt { color: var(--muted); font-size: 12px; font-weight: 400; }
.recommended-image { flex: none; width: 62px; height: 62px; border-radius: 9px; }
</style>

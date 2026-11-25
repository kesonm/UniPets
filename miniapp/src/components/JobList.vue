<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { StoreJob } from '../../../shared/h5-jobs.mjs'
import { api, message } from '../lib/client'
import LoadState from './LoadState.vue'
import JobCard from './JobCard.vue'

const props = defineProps<{
  active: boolean
  filters: { city?:string; category?:string; type?:string; q?:string }
}>()
const filterQuery = computed(() => Object.entries(props.filters).filter((entry): entry is [string,string] => Boolean(entry[1]))
  .map(([key,value]) => '&'+key+'='+encodeURIComponent(value)).join(''))
const jobs = ref<StoreJob[]>([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
let revision = 0
let loadedQuery: string | undefined

async function load(append = false) {
  const current = ++revision
  const next = append ? page.value + 1 : 1
  const query = filterQuery.value
  loading.value = true
  error.value = ''
  try {
    const result = await api<{items:StoreJob[];hasMore:boolean}>('/h5/jobs?page='+next+query)
    if (current !== revision) return
    const existing = new Set(jobs.value.map(job => job.id))
    jobs.value = append ? [...jobs.value,...result.items.filter(job => !existing.has(job.id))] : result.items
    page.value = next
    hasMore.value = result.hasMore
    loadedQuery = query
  } catch (cause) {
    if (current === revision) error.value = message(cause)
  } finally {
    if (current === revision) {
      loading.value = false
    }
  }
}

watch([() => props.active, filterQuery], ([active,query]) => {
  if (!active) {
    revision++
    loading.value = false
    return
  }
  if (query !== loadedQuery) {
    jobs.value = []
    hasMore.value = false
  }
  void load()
}, {immediate:true})
onUnmounted(() => { revision++ })
</script>

<template>
  <view class="job-list">
    <LoadState v-if="error || (loading && !jobs.length)" :loading="loading" :error="error" @retry="load()" />
    <template v-else>
      <view v-if="jobs.length" class="browse-grid">
        <JobCard v-for="job in jobs" :key="job.id" :job="job" />
      </view>
      <view v-else class="card empty-card">
        {{ props.filters.city || props.filters.category || props.filters.type || props.filters.q ? '没有匹配的招聘岗位' : '暂无招聘岗位' }}
      </view>
      <button v-if="hasMore" class="small jobs-more" :disabled="loading" :loading="loading" @tap="load(true)">加载更多岗位</button>
    </template>
  </view>
</template>

<style scoped>
.jobs-more { width: 100%; margin-top: 10px; }
</style>

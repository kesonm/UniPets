<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { employmentTypes, jobCategories, jobCityLabel, type StoreJob } from '../../../shared/h5-jobs.mjs'
import { api, go, message } from '../lib/client'
import LoadState from './LoadState.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  active: boolean
  filters: { city?:string; category?:string; type?:string; q?:string; district?:string }
  reload?: number
}>()
const emit = defineEmits<{loaded:[]}>()
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
      emit('loaded')
    }
  }
}

watch([() => props.active, filterQuery, () => props.reload], ([active,query]) => {
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
      <button v-for="job in jobs" :key="job.id" :id="'job-'+job.id" class="card job-card" @tap="go('jobs',{id:job.id})">
        <view class="job-card-heading">
          <text class="heading job-title">{{ job.title }}</text>
          <text class="job-salary">{{ job.salary }}</text>
        </view>
        <view class="job-store-line">
          <text>{{ job.storeName }}</text>
          <UiIcon name="right" :size="12" />
        </view>
        <view class="job-meta">
          <text v-if="job.cityCode">{{ jobCityLabel(job.cityCode) }}</text>
          <text>{{ jobCategories[job.category] }}</text>
          <text>{{ employmentTypes[job.employmentType] }}</text>
        </view>
        <text class="sub job-address">{{ job.address }}</text>
      </button>
      <view v-if="!jobs.length" class="card empty-card">
        {{ props.filters.q || props.filters.city || props.filters.category || props.filters.type ? '没有匹配的招聘岗位' : '暂无招聘岗位' }}
      </view>
      <button v-if="hasMore" class="small jobs-more" :disabled="loading" :loading="loading" @tap="load(true)">加载更多岗位</button>
    </template>
  </view>
</template>

<style scoped>
.job-card { width: 100%; margin: 0 0 10px; text-align: left; }
.job-card-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 12px; }
.job-title { min-width: 0; overflow-wrap: anywhere; }
.job-salary { color: var(--gold-ink); font-weight: 750; font-size: 14px; overflow-wrap: anywhere; }
.job-store-line { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin: 6px 0 0; }
.job-store-line text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-meta { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 0; }
.job-meta text { padding: 2px 7px; border-radius: 5px; background: #f5f0e4; color: #675328; font-size: 11px; }
.job-address { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jobs-more { width: 100%; }
</style>

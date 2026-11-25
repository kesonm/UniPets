<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, jobCityLabel, type StoreJob } from '../../../../shared/h5-jobs.mjs'
import { serviceRegions } from '../../../../shared/h5-service-regions.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
import LoadState from '../../components/LoadState.vue'
import UiIcon from '../../components/UiIcon.vue'
import { api, go, message, toast } from '../../lib/client'
import { pageLoad } from '../../lib/page'

const endpoint = '/h5/jobs'
const provinces = [{id:'',label:'全国',cities:[]}, ...serviceRegions]
const categoryOptions = [{id:'',label:'全部岗位'}, ...Object.entries(jobCategories).map(([id,label]) => ({id,label}))]
const typeOptions = [{id:'',label:'用工类型'}, ...Object.entries(employmentTypes).map(([id,label]) => ({id,label}))]
const cityOptions = (province: number) => provinces[province].cities.length ? provinces[province].cities : [provinces[province]]
const cityIndex = ref<[number,number]>([0,0])
const cityDraft = ref<[number,number]>([0,0])
const cityColumns = computed(() => [provinces,cityOptions(cityDraft.value[0])])
const city = computed(() => cityOptions(cityIndex.value[0])[cityIndex.value[1]])
const category = ref('')
const type = ref('')
const id = ref('')
const posts = ref<StoreJob[]>([])
const job = ref<StoreJob>()
const page = ref(1)
const hasMore = ref(false)
const paging = ref(false)
let revision = 0

onLoad(options => {
  id.value = options?.id || ''
  if (id.value) uni.setNavigationBarTitle({title:'岗位详情'})
})

async function loadList(next: number) {
  const current = ++revision
  const filters = {page:next,city:city.value.id,category:category.value,type:type.value}
  const params = Object.entries(filters).filter(([,value]) => value !== '')
    .map(([key,value]) => key+'='+encodeURIComponent(value)).join('&')
  const result = await api<{items:StoreJob[];hasMore:boolean}>(endpoint+'?'+params)
  if (current !== revision) return
  const existing = new Set(posts.value.map(item => item.id))
  posts.value = next === 1 ? result.items : [...posts.value,...result.items.filter(item => !existing.has(item.id))]
  page.value = next
  hasMore.value = result.hasMore
}

const {refresh,loading,error} = pageLoad(async () => {
  if (!id.value) return loadList(1)
  job.value = (await api<{job:StoreJob}>(endpoint+'/'+id.value)).job
})

watch([city,category,type], () => {
  posts.value = []
  hasMore.value = false
  void refresh()
})

function selectCity(event: {detail:{value:number[]}}) {
  const [province,municipality] = event.detail.value.map(Number)
  if (!provinces[province]) return
  cityIndex.value = [province,cityOptions(province)[municipality] ? municipality : 0]
  resetCityDraft()
}

function updateCityColumn(event: {detail:{column:number;value:number}}) {
  const {column,value} = event.detail
  cityDraft.value = column === 0 ? [Number(value),0] : [cityDraft.value[0],Number(value)]
}

function resetCityDraft() {
  cityDraft.value = [...cityIndex.value]
}

async function more() {
  if (loading.value || paging.value || !hasMore.value) return
  paging.value = true
  try {
    await loadList(page.value+1)
  } catch (cause) {
    toast(message(cause))
  } finally {
    paging.value = false
  }
}

function callStore() {
  const phone = servicePhone(job.value?.phone || '')
  if (phone) uni.makePhoneCall({phoneNumber:phone})
}
</script>

<template>
  <view class="screen jobs-screen">
    <view v-if="!id" class="card job-filters">
      <picker mode="multiSelector" :range="cityColumns" range-key="label" :value="cityDraft" aria-label="按城市筛选"
        @columnchange="updateCityColumn" @change="selectCity" @cancel="resetCityDraft">
        <view class="field job-city-choice">{{ city.label }} ﹀</view>
      </picker>
      <ChoiceField v-model="category" :options="categoryOptions" />
      <ChoiceField v-model="type" :options="typeOptions" />
    </view>
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <template v-if="!id">
      <button v-for="item in posts" :key="item.id" :id="'job-'+item.id" class="card job-card" @tap="go('jobs',{id:item.id})">
        <view class="job-card-heading">
          <text class="heading job-title">{{ item.title }}</text>
          <text class="job-salary">{{ item.salary }}</text>
        </view>
        <view class="job-store-line">
          <text>{{ item.storeName }}</text>
          <UiIcon name="right" :size="12" />
        </view>
        <view class="job-meta">
          <text v-if="item.cityCode">{{ jobCityLabel(item.cityCode) }}</text>
          <text>{{ jobCategories[item.category] }}</text>
          <text>{{ employmentTypes[item.employmentType] }}</text>
        </view>
        <text class="sub job-address">{{ item.address }}</text>
      </button>
      <view v-if="!loading && !error && !posts.length" class="card empty-card">当前筛选下暂无招聘岗位</view>
      <button v-if="hasMore" class="small jobs-more" :loading="paging" :disabled="loading || paging" @tap="more">加载更多岗位</button>
    </template>
    <template v-else-if="job && !error">
      <view class="card job-detail">
        <view class="job-card-heading">
          <text class="title job-title">{{ job.title }}</text>
          <text class="job-salary">{{ job.salary }}</text>
        </view>
        <view class="job-meta">
          <text>{{ jobCategories[job.category] }}</text><text>{{ employmentTypes[job.employmentType] }}</text>
        </view>
        <text class="label">岗位职责与要求</text>
        <text class="job-description">{{ job.description }}</text>
      </view>
      <view class="card job-detail">
        <text class="heading">{{ job.storeName }}</text>
        <view class="job-detail-address">
          <UiIcon name="location" :size="15" />
          <text>{{ [jobCityLabel(job.cityCode),job.address].filter(Boolean).join(' · ') }}</text>
        </view>
        <button id="contact-job-store" class="primary job-contact" :disabled="!servicePhone(job.phone)" @tap="callStore">联系电话 {{ job.phone }}</button>
      </view>
    </template>
  </view>
</template>

<style scoped>
.jobs-screen { padding-top: 10px; }
.job-filters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; padding: 8px; }
.job-city-choice { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.job-card { width: 100%; margin: 0 0 10px; text-align: left; }
.job-card-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 12px; }
.job-title { min-width: 0; overflow-wrap: anywhere; }
.job-salary { color: var(--gold-ink); font-weight: 750; font-size: 14px; overflow-wrap: anywhere; }
.job-store-line { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin: 6px 0 0; }
.job-store-line text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-meta { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 0; }
.job-meta text { padding: 2px 7px; border-radius: 5px; background: #f5f0e4; color: #675328; font-size: 11px; }
.job-address { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-description { display: block; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.job-detail-address { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; }
.job-detail-address .ui-icon { margin-top: 2px; }
.job-contact { width: 100%; margin-top: 14px; }
.jobs-more { width: 100%; }
</style>

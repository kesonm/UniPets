<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onLoad, onShow } from '@dcloudio/uni-app'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, jobCityLabel, type StoreJob } from '../../../../shared/h5-jobs.mjs'
import { serviceRegions } from '../../../../shared/h5-service-regions.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
import JobList from '../../components/JobList.vue'
import LoadState from '../../components/LoadState.vue'
import UiIcon from '../../components/UiIcon.vue'
import { api, publicImage } from '../../lib/client'
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
const active = ref(false)
const filters = computed(() => ({city:city.value.id,category:category.value,type:type.value}))
const job = ref<StoreJob>()
const images = computed(() => Array.from({length:job.value?.imageCount || 0}, (_,index) =>
  publicImage(`/h5/jobs/${id.value}/images/${index+1}`)))

onLoad(options => {
  id.value = options?.id || ''
  if (id.value) uni.setNavigationBarTitle({title:'岗位详情'})
})
onShow(() => { active.value = true })
onHide(() => { active.value = false })

const {refresh,loading,error} = pageLoad(async () => {
  if (id.value) job.value = (await api<{job:StoreJob}>(endpoint+'/'+id.value)).job
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

function callStore() {
  const phone = servicePhone(job.value?.phone || '')
  if (phone) uni.makePhoneCall({phoneNumber:phone})
}

function previewImage(current: string) {
  uni.previewImage({urls:images.value,current})
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
    <JobList v-if="!id" :active="active" :filters="filters" />
    <LoadState v-else-if="loading || error" :loading="loading" :error="error" @retry="refresh" />
    <template v-else-if="job">
      <view class="card job-detail">
        <view class="job-card-heading">
          <text class="title job-title">{{ job.title }}</text>
          <text class="job-salary">{{ job.salary }}</text>
        </view>
        <view class="job-meta">
          <text>{{ jobCategories[job.category] }}</text><text>{{ employmentTypes[job.employmentType] }}</text>
        </view>
        <view v-if="images.length" class="job-detail-images">
          <image v-for="url in images" :key="url" :src="url" mode="aspectFill" @tap="previewImage(url)" />
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
.job-card-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 12px; }
.job-title { min-width: 0; overflow-wrap: anywhere; }
.job-salary { color: var(--gold-ink); font-weight: 750; font-size: 14px; overflow-wrap: anywhere; }
.job-meta { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 0; }
.job-meta text { padding: 2px 7px; border-radius: 5px; background: #f5f0e4; color: #675328; font-size: 11px; }
.job-detail-images { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-top: 12px; }
.job-detail-images image { display: block; width: 100%; height: 102px; border-radius: 8px; background: var(--canvas); }
.job-detail-images image:only-child { grid-column: 1 / -1; height: 180px; }
.job-description { display: block; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.job-detail-address { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; }
.job-detail-address .ui-icon { margin-top: 2px; }
.job-contact { width: 100%; margin-top: 14px; }
</style>

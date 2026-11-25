<script setup lang="ts">
import { employmentTypes, jobCategories, jobCityLabel, type StoreJob } from '../../../shared/h5-jobs.mjs'
import { go, publicImage } from '../lib/client'
import UiIcon from './UiIcon.vue'

defineProps<{job:StoreJob}>()
</script>

<template>
<button :id="'job-'+job.id" class="card job-card" @tap="go('jobs',{id:job.id})">
  <image v-if="job.imageCount" class="job-cover" :src="publicImage('/h5/jobs/'+job.id+'/images/1')" mode="aspectFill" lazy-load />
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
</template>

<style scoped>
.job-card { width: 100%; margin: 0 0 10px; text-align: left; }
.job-cover { display: block; width: 100%; height: 132px; margin-bottom: 9px; border-radius: 8px; background: var(--canvas); }
.job-card-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 12px; }
.job-title { min-width: 0; overflow-wrap: anywhere; }
.job-salary { color: var(--gold-ink); font-weight: 750; font-size: 14px; overflow-wrap: anywhere; }
.job-store-line { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin: 6px 0 0; }
.job-store-line text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-meta { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 0; }
.job-meta text { padding: 2px 7px; border-radius: 5px; background: #f5f0e4; color: #675328; font-size: 11px; }
.job-address { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

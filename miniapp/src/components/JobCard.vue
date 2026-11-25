<script setup lang="ts">
import { employmentTypes, jobCategoryLabel, jobCityLabel, type StoreJob } from '../../../shared/h5-jobs.mjs'
import { go, publicImage } from '../lib/client'
import UiIcon from './UiIcon.vue'

defineProps<{job:StoreJob}>()
</script>

<template>
  <button :id="'job-'+job.id" class="browse-card job-card" @tap="go('jobs',{id:job.id})">
    <image v-if="job.imageCount" class="browse-card-cover" :src="publicImage('/h5/jobs/'+job.id+'/images/1')" mode="aspectFill" lazy-load />
    <view v-else class="browse-card-cover job-cover"><UiIcon name="entry-jobs" :size="32" /></view>
    <view class="browse-card-copy">
      <text class="browse-card-title">{{ job.title }}</text>
      <text class="job-salary">{{ job.salary }}</text>
      <text class="browse-card-meta">{{ [job.storeName, jobCityLabel(job.cityCode)].filter(Boolean).join(' · ') }}</text>
      <text class="browse-card-meta">{{ [jobCategoryLabel(job), employmentTypes[job.employmentType]].filter(Boolean).join(' · ') }}</text>
    </view>
  </button>
</template>

<style scoped>
.job-card { display: block; width: 100%; padding: 0; text-align: left; }
.job-cover { background: #f0e9fa; }
.job-salary { color: var(--gold-ink); font-size: 13px; font-weight: 750; }
</style>

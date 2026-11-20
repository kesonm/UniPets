<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowLeft, Reading } from '@element-plus/icons-vue'
import { api } from '../lib/api'
import { formatProgramTime } from './programs'
import type { H5TrainingCourse } from './types'

const emit = defineEmits<{ back: [] }>()
const courses = ref<H5TrainingCourse[]>([])
const loading = ref(true)
const error = ref('')

async function loadCourses() {
  loading.value = true
  error.value = ''
  try {
    const result = await api<{ courses: H5TrainingCourse[] }>('/h5/training')
    courses.value = result.courses
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '课程读取失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadCourses)
</script>

<template>
  <header class="h5-page-head h5-page-head--yellow h5-program-head">
    <button class="h5-program-back" type="button" aria-label="返回首页" @click="emit('back')"><el-icon><ArrowLeft /></el-icon></button>
    <h1>宠物培训与考证</h1>
  </header>
  <div class="h5-page-content h5-program-stack">
    <div v-if="loading" class="h5-card h5-empty" role="status">正在读取课程…</div>
    <div v-else-if="error" class="h5-card h5-empty" role="status">
      <strong>{{ error }}</strong>
      <button class="h5-secondary" type="button" @click="loadCourses">重新加载</button>
    </div>
    <template v-else-if="courses.length">
      <article v-for="course in courses" :key="course.id" class="h5-card h5-program-card">
        <h2>{{ course.title }}</h2>
        <dl class="h5-program-details">
          <dt>学习方式</dt><dd>{{ course.learningFormat }}</dd>
          <dt>开课时间</dt><dd>{{ formatProgramTime(course.startsAt) }}</dd>
          <dt>考试时间</dt><dd>{{ formatProgramTime(course.examAt) }}</dd>
          <dt>考点</dt><dd>{{ course.examLocation || '待公布' }}</dd>
          <dt>报考条件</dt><dd>{{ course.eligibility }}</dd>
          <dt>证书名称</dt><dd>{{ course.credential }}</dd>
          <dt>发证机构</dt><dd>{{ course.issuer }}</dd>
        </dl>
      </article>
    </template>
    <div v-else class="h5-card h5-empty">
      <el-icon aria-hidden="true"><Reading /></el-icon>
      <strong>暂无已发布的课程和考期</strong>
    </div>
  </div>
</template>

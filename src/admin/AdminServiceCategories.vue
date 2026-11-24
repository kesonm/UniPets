<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ServiceCategory } from '../../shared/h5-discovery.mjs'
import { api } from '../lib/api'

const emit = defineEmits<{saved:[]}>()
const categories = ref<ServiceCategory[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const selected = ref('')
const label = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    categories.value = (await api<{items:ServiceCategory[]}>('/admin/service-categories')).items
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : '读取分类失败'
  } finally {
    loading.value = false
  }
}

function edit(category?: ServiceCategory) {
  selected.value = category?.id ?? ''
  label.value = category?.label ?? ''
  saveError.value = ''
}

async function save() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const id = selected.value
    const entry = await api<ServiceCategory>('/admin/service-categories' + (id ? '/' + id : ''), {
      method:id ? 'PUT' : 'POST', body:{label:label.value},
    })
    categories.value = id ? categories.value.map(category => category.id === id ? entry : category)
      : [...categories.value, entry]
    edit()
    emit('saved')
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : '保存分类失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="category-manager">
    <form class="admin-editor category-form" @submit.prevent="save">
      <label for="service-category-name">分类名称
        <input id="service-category-name" v-model.trim="label" maxlength="4" placeholder="输入 2～4 个字" required>
      </label>
      <button class="admin-button admin-primary" type="submit" :disabled="saving || loading">
        {{ saving ? '正在保存…' : selected ? '保存名称' : '新增分类' }}
      </button>
      <button v-if="selected" class="admin-button" type="button" :disabled="saving" @click="edit()">取消</button>
    </form>
    <p v-if="saveError" class="admin-error" role="alert">{{ saveError }}</p>
    <p v-if="loading" role="status">正在读取分类…</p>
    <p v-else-if="loadError" class="admin-error" role="alert">{{ loadError }} <button class="admin-text-button" type="button" @click="load">重试</button></p>
    <ul v-else class="category-names">
      <li v-for="category in categories" :key="category.id">
        <span>{{ category.label }}</span>
        <button class="admin-text-button" type="button" :disabled="saving" :aria-label="'修改'+category.label" @click="edit(category)">改名</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.category-form { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.category-form label { flex: 1 0 135px; }
.category-names { max-height: 360px; overflow-y: auto; margin: 14px 0 0; padding: 0; list-style: none; }
.category-names li { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid #ece9df; }
</style>

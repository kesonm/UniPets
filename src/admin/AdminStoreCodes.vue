<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../lib/api'

interface BindingCode { slot: number; code: string }
const emit = defineEmits<{redeemed:[]}>()
const endpoint = '/admin/stores/binding-codes'
const codes = ref<BindingCode[]>([])
const loading = ref(false)
const error = ref('')
const qr = ref<(BindingCode & {qrCode:string})|null>(null)
const qrLoading = ref(false)
let active = true
let timer = 0

async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    const {codes:current} = await api<{codes:BindingCode[]}>(endpoint)
    if (!active) return
    if (codes.value.some((item,index) => item.code !== current[index]?.code)) emit('redeemed')
    codes.value = current
    error.value = ''
    if (qr.value && !current.some(item => item.code === qr.value?.code)) {
      qr.value = null
      ElMessage.info('这个绑定码已被使用，已补发新码')
    }
  } catch (cause) {
    if (active) error.value = cause instanceof Error ? cause.message : '绑定码读取失败'
  } finally {
    loading.value = false
  }
}

function refreshWhenVisible() {
  if (!document.hidden) void refresh()
}

async function copy(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    if (active) ElMessage.success('已复制绑定码')
  } catch {
    if (active) ElMessage.error('请选择绑定码手动复制')
  }
}

async function showQr(slot: number) {
  if (qrLoading.value) return
  qrLoading.value = true
  try {
    const result = await api<BindingCode & {qrCode:string}>(endpoint+'/'+slot+'/qr')
    if (!active) return
    qr.value = result
    if (!codes.value.some(item => item.code === result.code)) void refresh()
  } catch (cause) {
    if (active) ElMessage.error(cause instanceof Error ? cause.message : '二维码读取失败')
  } finally {
    qrLoading.value = false
  }
}

onMounted(() => {
  void refresh()
  timer = window.setInterval(refreshWhenVisible,5000)
  document.addEventListener('visibilitychange',refreshWhenVisible)
})
onBeforeUnmount(() => {
  active = false
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange',refreshWhenVisible)
})
</script>

<template>
  <section class="admin-panel admin-store-codes" aria-labelledby="store-codes-title">
    <header class="admin-store-codes-header">
      <div>
        <h2 id="store-codes-title">门店绑定码</h2>
        <p v-if="codes.length" class="admin-muted">{{ codes.length }} 个可用 · 使用后自动补发</p>
      </div>
      <button class="admin-button" type="button" :disabled="loading" @click="refresh">刷新绑定码</button>
    </header>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <p v-else-if="!codes.length" class="admin-muted" role="status">{{ loading ? '正在读取绑定码…' : '暂无可用绑定码' }}</p>
    <ul v-else class="admin-store-codes-grid">
      <li v-for="item in codes" :key="item.slot" class="admin-store-code">
        <code class="admin-binding-code">{{ item.code }}</code>
        <div>
          <button class="admin-text-button" type="button" :disabled="!!error" @click="copy(item.code)">复制</button>
          <button class="admin-text-button" type="button" :disabled="qrLoading || !!error" @click="showQr(item.slot)">二维码</button>
        </div>
      </li>
    </ul>
  </section>
  <el-dialog :model-value="Boolean(qr)" title="门店绑定二维码" width="min(440px, 94vw)"
    @update:model-value="(open:boolean) => { if (!open) qr=null }">
    <div v-if="qr" class="admin-editor">
      <img class="admin-binding-qr" :src="qr.qrCode" alt="门店绑定二维码">
      <label>绑定码
        <input class="admin-binding-code" :value="qr.code" readonly @focus="($event.target as HTMLInputElement).select()">
      </label>
      <button class="admin-button admin-primary" type="button" @click="copy(qr.code)">复制绑定码</button>
    </div>
  </el-dialog>
</template>

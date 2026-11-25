<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { DocumentCopy, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../lib/api'

interface BindingCode { slot: number; code: string; qrCode: string }
const emit = defineEmits<{updated:[]}>()
const endpoint = '/admin/stores/binding-codes'
const codes = ref<BindingCode[]>([])
const loading = ref(false)
const error = ref('')
const qr = ref<BindingCode|null>(null)
const refreshingSlot = ref<number|null>(null)
let active = true
let timer = 0
let revision = 0

async function refresh() {
  if (loading.value || refreshingSlot.value !== null) return
  const currentRevision = revision
  loading.value = true
  try {
    const {codes:current} = await api<{codes:BindingCode[]}>(endpoint)
    if (!active || currentRevision !== revision) return
    const changed = codes.value.length !== current.length || codes.value.some((item,index) => item.code !== current[index]?.code)
    codes.value = current
    if (changed) emit('updated')
    error.value = ''
    if (qr.value && !current.some(item => item.code === qr.value?.code)) {
      qr.value = null
      ElMessage.info('该绑定码已更新，请使用新码')
    }
  } catch (cause) {
    if (active && currentRevision === revision) error.value = cause instanceof Error ? cause.message : '绑定码读取失败'
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

async function refreshCode(item: BindingCode) {
  if (refreshingSlot.value !== null) return
  // Ignore any polling response that started before this replacement.
  revision++
  refreshingSlot.value = item.slot
  try {
    const result = await api<BindingCode>(`${endpoint}/${item.slot}/refresh`,{method:'POST',body:{code:item.code}})
    if (!active) return
    codes.value = codes.value.map(code => code.slot === item.slot ? result : code)
    ElMessage.success('已刷新，旧码已失效')
  } catch (cause) {
    if (active) ElMessage.error(cause instanceof Error ? cause.message : '绑定码刷新失败')
  } finally {
    refreshingSlot.value = null
    if (active) void refresh()
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
      <div class="admin-store-codes-title">
        <h2 id="store-codes-title">门店绑定码</h2>
        <span v-if="codes.length" class="admin-status admin-status-positive">{{ codes.length }} 个可用</span>
      </div>
      <p class="admin-muted">使用后自动补发。刷新会作废本行旧码。</p>
    </header>
    <div v-if="error" class="admin-store-codes-error">
      <p class="admin-error" role="alert">{{ error }}</p>
      <button class="admin-button" type="button" :disabled="loading" @click="refresh">重试</button>
    </div>
    <p v-else-if="!codes.length" class="admin-muted" role="status">{{ loading ? '正在读取绑定码…' : '暂无可用绑定码' }}</p>
    <ul v-else class="admin-store-codes-grid">
      <li v-for="item in codes" :key="item.slot" class="admin-store-code">
        <button class="admin-store-code-qr" type="button" :aria-label="`放大第 ${item.slot} 个绑定码的二维码`"
          :disabled="refreshingSlot === item.slot" @click="qr=item">
          <img :src="item.qrCode" alt="" width="72" height="72">
        </button>
        <div class="admin-store-code-details">
          <code class="admin-binding-code">{{ item.code }}</code>
          <div class="admin-store-code-actions">
            <button class="admin-button" type="button" :disabled="refreshingSlot === item.slot" @click="copy(item.code)">
              <el-icon aria-hidden="true"><DocumentCopy /></el-icon>复制
            </button>
            <button class="admin-button" type="button" title="刷新并作废本行旧码" :disabled="refreshingSlot !== null"
              @click="refreshCode(item)">
              <el-icon aria-hidden="true"><Refresh /></el-icon>{{ refreshingSlot === item.slot ? '刷新中…' : '刷新' }}
            </button>
          </div>
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

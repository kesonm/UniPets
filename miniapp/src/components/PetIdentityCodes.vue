<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { downloadIdentityCode, message, user } from '../lib/client'
import LoadState from './LoadState.vue'

const props = defineProps<{ petId: string; number: string }>()
const codes = ref<{ barcode: string; qrcode: string }>()
const loading = ref(false)
const error = ref('')
let revision = 0

async function load() {
  const current = ++revision
  codes.value = undefined
  error.value = ''
  loading.value = false
  if (!user.value || !props.number) return
  loading.value = true
  try {
    const [barcode, qrcode] = await Promise.all([
      downloadIdentityCode(props.petId, 'barcode'),
      downloadIdentityCode(props.petId, 'qrcode'),
    ])
    if (current === revision) codes.value = { barcode, qrcode }
  } catch (e) {
    if (current === revision) error.value = message(e)
  } finally {
    if (current === revision) loading.value = false
  }
}
watch([() => props.petId, () => props.number, () => user.value?.id], load, { immediate: true })
onBeforeUnmount(() => { revision++ })

function preview(kind: 'barcode'|'qrcode') {
  if (codes.value) uni.previewImage({ urls: [codes.value.barcode, codes.value.qrcode], current: codes.value[kind] })
}
</script>

<template>
  <view class="pet-codes">
    <LoadState :loading="loading" :error="error" @retry="load" />
    <view v-if="codes" class="pet-codes-content">
      <view class="pet-code">
        <text>条形码</text>
        <image class="pet-code-barcode" :src="codes.barcode" mode="aspectFit" aria-label="查看条形码大图" @tap="preview('barcode')" />
      </view>
      <view class="pet-code">
        <text>二维码</text>
        <image class="pet-code-qr" :src="codes.qrcode" mode="aspectFit" aria-label="查看二维码大图" @tap="preview('qrcode')" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.pet-codes { margin-top: 12px; }
.pet-codes-content { display: grid; gap: 12px; padding: 12px; border: 1px solid #eee6d4; border-radius: 12px; background: #fff; }
.pet-code { display: flex; flex-direction: column; align-items: center; color: #5f512f; font-size: 12px; }
.pet-code-barcode { width: 100%; max-width: 286px; height: 76px; }
.pet-code-qr { width: 146px; height: 146px; }
</style>

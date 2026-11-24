<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { parseStoreBindingCode, type ServiceCategory } from '../../../../shared/h5-discovery.mjs'
import type { BoundStore } from '../../../../src/h5/types'
import { api, go, toast, user } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import ChoiceField from '../../components/ChoiceField.vue'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'
import UiIcon from '../../components/UiIcon.vue'

const stores = ref<BoundStore[]>([])
const storeId = ref('')
const selected = computed(() => stores.value.find(store => store.id === storeId.value))
const categories = ref<ServiceCategory[]>([])
const category = ref('')
const title = ref('')
const description = ref('')
const price = ref('')
const code = ref('')
const scanning = ref(false)
const usableCode = computed(() => parseStoreBindingCode(code.value))
const {run,busy,error:actionError} = submitAction()
let revision = 0
const {loading,error,refresh} = pageLoad(async () => {
  const current = ++revision
  if (!user.value) return
  const {stores:owned} = await api<{stores:BoundStore[]}>('/h5/catalog/stores/mine')
  if (current !== revision) return
  stores.value = owned
  if (storeId.value && selected.value?.ready && selected.value.enabled) {
    const result = await api<{items:ServiceCategory[]}>('/h5/catalog/service-categories')
    if (current !== revision) return
    categories.value = result.items
    if (!categories.value.some(item => item.id === category.value)) category.value = categories.value[0]?.id ?? ''
  }
}, () => { revision++; stores.value = []; categories.value = []; category.value = ''; title.value = ''; description.value = ''; price.value = ''; code.value = '' })

onLoad(options => {
  storeId.value = options?.storeId ?? ''
  if (storeId.value) uni.setNavigationBarTitle({title:'发布服务帖'})
})

function bindStore(value = code.value) {
  return run(async () => {
    const bindingCode = parseStoreBindingCode(value)
    if (!bindingCode) throw new Error('请使用后台生成的门店二维码或门店码')
    await api('/h5/catalog/stores/bind','POST',{code:bindingCode})
    code.value = ''
    await refresh()
    toast('门店已绑定')
  })
}

function scanStore() {
  if (busy.value || scanning.value) return
  scanning.value = true
  actionError.value = ''
  uni.scanCode({
    scanType:['qrCode'],
    success: result => { void bindStore(result.result) },
    fail: result => { if (!result.errMsg?.includes('cancel')) toast('暂时无法扫码，请重试') },
    complete: () => { scanning.value = false },
  })
}

function publish() {
  return run(async () => {
    const amount = price.value.trim()
    if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 100000)) {
      throw new Error('请填写正确的服务价格')
    }
    const {id} = await api<{id:string}>('/h5/catalog/service-posts','POST',{
      storeId:storeId.value,category:category.value,title:title.value,description:description.value,
      priceCents:amount ? Math.round(Number(amount)*100) : null,
    })
    toast('服务帖已发布')
    uni.redirectTo({url:'/pages/services/index?id='+id})
  })
}
</script>

<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <template v-if="!storeId">
        <view class="card store-binding-card">
          <view class="store-binding-intro">
            <view class="store-binding-icon" aria-hidden="true">
              <view class="store-qr-mark"><view /><view /><view /><view /></view>
            </view>
            <view>
              <text class="heading">绑定门店</text>
              <text class="sub">扫码或输入后台生成的门店码</text>
            </view>
          </view>
          <button id="scan-store-binding" class="primary store-scan-button" :disabled="busy || scanning" @tap="scanStore">
            {{ scanning ? '打开扫码…' : '扫码绑定' }}
          </button>
          <text class="label store-code-label">门店码</text>
          <view class="store-code-row">
            <input id="store-binding-code" v-model="code" maxlength="12" :disabled="busy || scanning"
              aria-label="门店码" placeholder="输入 12 位门店码" confirm-type="done" @confirm="usableCode && bindStore()" />
            <button id="bind-store" class="small" :disabled="busy || scanning || !usableCode" @tap="bindStore()">绑定</button>
          </view>
          <text v-if="actionError" class="error">{{ actionError }}</text>
        </view>
        <view class="spread store-list-heading">
          <text class="heading">已绑定门店</text>
          <text class="sub">{{ stores.length }} 家</text>
        </view>
        <view v-for="store in stores" :key="store.id" class="card store-list-card">
          <view class="spread store-heading">
            <text class="store-name">{{ store.name }}</text>
            <text :class="['store-badge',{paused:!store.enabled}]">{{ store.enabled ? '营业中' : '已停用' }}</text>
          </view>
          <view v-if="store.address" class="store-address"><UiIcon name="location" :size="13" /><text>{{ store.address }}</text></view>
          <text v-if="store.enabled && !store.ready" class="sub">完善地区和联系电话后可以发布服务帖</text>
          <view class="store-card-actions">
            <button class="small" :disabled="!store.enabled || !store.ready" @tap="go('stores',{storeId:store.id})">发服务帖</button>
          </view>
        </view>
        <view v-if="!loading && !error && !stores.length" class="card store-empty">
          <UiIcon name="entry-services" :size="28" />
          <text>还没有绑定门店</text>
        </view>
      </template>
      <template v-else-if="selected?.enabled && selected.ready && !error">
        <view class="card">
          <text class="heading">{{ selected.name }}</text>
          <text class="label">分类</text>
          <ChoiceField v-model="category" :options="categories" placeholder="选择服务分类" />
          <text class="label">服务名称</text>
          <input id="service-publish-title" v-model="title" maxlength="120" placeholder="例如宠物洗护" />
          <text class="label">服务详情</text>
          <textarea id="service-publish-description" v-model="description" maxlength="5000" placeholder="填写服务内容" />
          <text class="label">价格（元，选填）</text>
          <input v-model="price" type="digit" maxlength="9" placeholder="填写价格" />
          <text v-if="actionError" class="error">{{ actionError }}</text>
          <view class="actions">
            <button id="publish-service-post" class="primary" :disabled="busy || loading || !category || !title.trim() || !description.trim()" @tap="publish">发布服务帖</button>
          </view>
        </view>
      </template>
      <view v-else-if="!loading && !error" class="card empty-card">请选择已绑定、营业且资料完整的门店</view>
    </template>
  </view>
</template>

<style scoped>
.store-binding-card { padding: 15px; background: linear-gradient(135deg, #fff0b7, #fffcf0); border-color: #f0e0aa; }
.store-binding-intro { display: flex; align-items: center; gap: 12px; margin-bottom: 13px; }
.store-binding-intro .heading { margin: 0 0 4px; }
.store-binding-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: none; border-radius: 13px; background: #ffe187; }
.store-qr-mark { display: grid; grid-template-columns: repeat(2,7px); gap: 3px; }
.store-qr-mark view { width: 7px; height: 7px; box-sizing: border-box; border: 1.5px solid #6a4a0a; border-radius: 1px; }
.store-qr-mark view:last-child { background: #6a4a0a; }
.store-scan-button { width: 100%; }
.store-code-label { margin-top: 13px; }
.store-code-row { display: flex; align-items: stretch; gap: 8px; }
.store-code-row input { flex: 1; min-width: 0; background: #fffefa; text-transform: uppercase; }
.store-code-row button { flex: none; min-width: 55px; }
.store-list-heading { margin: 18px 0 9px; }
.store-list-heading .heading { margin: 0; }
.store-heading { gap: 8px; }
.store-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 750; overflow-wrap: anywhere; }
.store-badge { flex: none; padding: 3px 7px; border-radius: 6px; background: #eef5e9; color: #386436; font-size: 11px; }
.store-badge.paused { background: #f1eeea; color: #75695c; }
.store-address { display: flex; align-items: center; gap: 5px; margin-top: 6px; color: var(--muted); font-size: 12px; }
.store-card-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.store-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 27px 12px; color: var(--muted); font-size: 13px; }
</style>

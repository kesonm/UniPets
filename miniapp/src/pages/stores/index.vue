<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { ServiceCategory } from '../../../../shared/h5-discovery.mjs'
import type { BoundStore } from '../../../../src/h5/types'
import { api, go, toast, user } from '../../lib/client'
import { pageLoad, submitAction } from '../../lib/page'
import ChoiceField from '../../components/ChoiceField.vue'
import LoadState from '../../components/LoadState.vue'
import LoginCard from '../../components/LoginCard.vue'

const stores = ref<BoundStore[]>([])
const storeId = ref('')
const selected = computed(() => stores.value.find(store => store.id === storeId.value))
const code = ref('')
const categories = ref<ServiceCategory[]>([])
const category = ref('')
const title = ref('')
const description = ref('')
const price = ref('')
const {run,busy,error:actionError} = submitAction()
const {loading,error,refresh} = pageLoad(async () => {
  if (!user.value) return
  const {stores:owned} = await api<{stores:BoundStore[]}>('/h5/catalog/stores/mine')
  stores.value = owned
  if (storeId.value && selected.value?.ready && selected.value.enabled) {
    categories.value = (await api<{items:ServiceCategory[]}>('/h5/catalog/service-categories')).items
    if (!categories.value.some(item => item.id === category.value)) category.value = categories.value[0]?.id ?? ''
  }
}, () => { stores.value = []; categories.value = []; code.value = ''; category.value = ''; title.value = ''; description.value = ''; price.value = '' })

onLoad(options => {
  storeId.value = options?.storeId ?? ''
  if (storeId.value) uni.setNavigationBarTitle({title:'发布服务帖'})
})

function bindStore() {
  return run(async () => {
    await api('/h5/catalog/stores/bind','POST',{code:code.value.trim()})
    code.value = ''
    await refresh()
    toast('门店已绑定')
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
        <view class="card">
          <text class="heading">绑定门店</text>
          <view class="bind-controls">
            <input id="store-binding-code" v-model="code" maxlength="12" placeholder="输入管理员提供的 12 位绑定码" aria-label="门店绑定码" />
            <button id="bind-store" class="small primary" :disabled="busy || code.trim().length !== 12" @tap="bindStore">绑定</button>
          </view>
          <text v-if="actionError" class="error">{{ actionError }}</text>
        </view>
        <view v-for="store in stores" :key="store.id" class="card">
          <view class="spread store-heading">
            <text class="heading">{{ store.name }}</text>
            <button class="small" :disabled="!store.enabled || !store.ready" @tap="go('stores',{storeId:store.id})">发服务帖</button>
          </view>
          <text v-if="store.address" class="sub">{{ store.address }}</text>
          <text v-if="!store.enabled" class="sub">门店已停用</text>
          <text v-else-if="!store.ready" class="sub">请让管理员补齐地区和联系电话</text>
        </view>
        <view v-if="!loading && !error && !stores.length" class="card empty-card">暂无绑定门店</view>
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
.bind-controls { display: flex; align-items: center; gap: 7px; margin-top: 8px; }
.bind-controls input { flex: 1; min-width: 0; }
.bind-controls button,.store-heading button { flex: none; }
.store-heading { gap: 6px; }
</style>

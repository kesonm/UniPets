<script setup lang="ts">
import { ref, computed } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import type { H5Order } from '../../../../src/h5/business'
import { api, user, go, confirm, toast } from '../../lib/client'
import { cart, orderPanel, quantity, checkout, money, statusName } from '../../lib/cart'
import { pageLoad, submitAction } from '../../lib/page'
import { useTabPage } from '../../lib/tab-page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import UiIcon from '../../components/UiIcon.vue'
const tabLayout = useTabPage('pages/orders/index')
const orders = ref<H5Order[]>([]),
  support = ref(''),
  text = ref('')
const total = computed(() => cart.value.items.reduce((t, i) => t + i.unitCents * i.quantity, 0))
async function load() {
  if (user.value) orders.value = (await api<{ orders: H5Order[] }>('/h5/orders')).orders
}
const { error, loading, refresh } = pageLoad(load, () => {
  orders.value = []
  support.value = ''
  text.value = ''
})
const { run, busy, error: actionError } = submitAction()
onHide(() => { orderPanel.value = 'cart' })
function shop() { go('directory', { module: 'shop' }) }
function openSupport(order: H5Order) {
  support.value = order.id
  text.value = order.supportMessage || ''
}
function order() {
  return run(async () => {
    if (!(await confirm('提交订单', '合计 ' + money(total.value) + '，提交后等待商家确认。'))) return
    await checkout()
    await load()
    orderPanel.value = 'orders'
    toast('订单已提交')
  })
}
function cancel(id: string) {
  return run(async () => {
    if (!(await confirm('取消订单', '确认取消这笔订单？'))) return
    await api('/h5/orders/' + id + '/cancel', 'POST')
    await load()
  })
}
function help(id: string) {
  return run(async () => {
    await api('/h5/orders/' + id + '/support', 'PUT', { message: text.value })
    support.value = ''
    text.value = ''
    await load()
    toast('已提交售后')
  })
}
</script>
<template>
  <view class="screen tab-screen" :style="tabLayout">
    <view class="tab-leading cart-toolbar">
      <button v-if="orderPanel === 'cart'" class="text-button cart-action" @tap="shop"><UiIcon name="entry-shop" :size="14" />继续选购</button>
      <button v-else class="text-button cart-action" @tap="orderPanel = 'cart'"><UiIcon name="nav-cart" :size="14" />返回购物车</button>
      <button v-if="orderPanel === 'cart'" class="text-button cart-action" @tap="orderPanel = 'orders'"><UiIcon name="account-orders" :size="14" />订单与售后</button>
    </view>
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <template v-if="orderPanel === 'cart'">
      <view v-if="!cart.items.length" class="card empty-card">
        <UiIcon name="empty-cart" :size="25" />
        <text class="cart-empty-title">购物车还是空的</text>
        <button class="primary" @tap="shop">去商城</button>
      </view>
      <view v-else class="card">
        <view v-for="i in cart.items" :key="i.itemId" class="line">
          <text>{{ i.title }} · {{ money(i.unitCents) }}</text>
          <view class="actions">
            <button class="small" :disabled="busy" @tap="quantity(i.itemId, i.quantity - 1)">−</button>
            <text>{{ i.quantity }}</text>
            <button
              class="small"
              :disabled="busy || i.quantity >= 99"
              @tap="quantity(i.itemId, i.quantity + 1)"
            >
              ＋
            </button>
          </view>
        </view>
        <view class="spread cart-summary">
          <text>平台商品合计 <text class="cart-total">{{ money(total) }}</text></text>
          <button class="primary" :disabled="busy" @tap="order">
            合并提交订单
          </button>
        </view>
      </view>
    </template>
    <LoginCard v-else-if="!user" />
    <template v-else>
      <text class="heading">订单与售后</text>
      <LoadState :loading="loading" :error="error" @retry="refresh" />
      <text v-if="!loading && !error && !orders.length" class="empty">暂无订单</text>
      <view v-for="o in orders" :key="o.id" class="card">
        <view class="spread">
          <text>{{ statusName[o.status] }}</text>
          <text>{{ money(o.totalCents) }}</text>
        </view>
        <text v-for="i in o.items" :key="i.itemId" class="line">{{ i.title }} × {{ i.quantity }}</text>
        <text v-if="o.supportMessage" class="sub">
          售后{{ o.supportResolved ? '已处理' : '处理中' }} · {{ o.supportMessage }}
        </text>
        <view class="actions">
          <button v-if="o.status === 'submitted'" class="small" :disabled="busy" @tap="cancel(o.id)">
            取消订单
          </button>
          <button v-if="o.status !== 'cancelled'" class="small" @tap="openSupport(o)">售后</button>
        </view>
        <template v-if="support === o.id">
          <text class="label">售后诉求</text>
          <textarea v-model="text" maxlength="500" />
          <button :disabled="busy || !text.trim()" @tap="help(o.id)">提交</button>
        </template>
      </view>
    </template>
  </view>
</template>
<style scoped>
.cart-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; margin-bottom: 9px; }
.cart-toolbar .cart-action { min-height: 34px; padding: 5px 9px; border: 1px solid #f0e7ca; border-radius: 18px; background: #fffdf5; font-size: 12px; }
.cart-empty-title { color: #262422; font-weight: 800; }
.cart-summary { margin-top: 10px; }
.cart-total { color: #9a531d; font-size: 18px; font-weight: 850; }
</style>

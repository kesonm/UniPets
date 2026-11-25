<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import type { H5Order } from '../../../../src/h5/business'
import { api, user, go, confirm, toast, productCover } from '../../lib/client'
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
const selected = ref(new Set<string>())
const coverErrors = ref(new Set<string>())
const selectedItems = computed(() => cart.value.items.filter(item => selected.value.has(item.itemId)))
const allSelected = computed(() => cart.value.items.length > 0 && selectedItems.value.length === cart.value.items.length)
const total = computed(() => selectedItems.value.reduce((sum, item) => sum + item.unitCents * item.quantity, 0))

watch(() => cart.value.items.map(item => item.itemId), ids => {
  selected.value = new Set(ids.filter(id => selected.value.has(id)))
})

async function load() {
  const owner = user.value?.id
  if (!owner) return
  const result = await api<{ orders: H5Order[] }>('/h5/orders')
  if (user.value?.id === owner) orders.value = result.orders
}
const { error, loading, refresh } = pageLoad(load, () => {
  orders.value = []
  support.value = ''
  text.value = ''
  selected.value = new Set()
  coverErrors.value = new Set()
})
const { run, busy, error: actionError } = submitAction()
onHide(() => { orderPanel.value = 'cart' })
function shop() { go('directory', { module: 'shop' }) }
function product(id: string) { go('directory', { module: 'shop', id }) }
function toggleSelected(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}
function toggleAll() {
  selected.value = new Set(allSelected.value ? [] : cart.value.items.map(item => item.itemId))
}
function openSupport(order: H5Order) {
  support.value = order.id
  text.value = order.supportMessage || ''
}
function order() {
  return run(async () => {
    const items = selectedItems.value.map(({ itemId, quantity, unitCents }) => ({ itemId, quantity, unitCents }))
    const state = cart.value
    const owner = user.value?.id
    if (!items.length || !owner) return
    if (!(await confirm('确认结算', '已选 ' + items.length + ' 种商品，合计 ' + money(total.value) + '。提交后等待商家确认。'))) return
    if (cart.value !== state || user.value?.id !== owner) return
    await checkout(items)
    if (cart.value !== state || user.value?.id !== owner) return
    orderPanel.value = 'orders'
    toast('订单已提交')
    await refresh()
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
  <view class="screen tab-screen" :class="{ 'cart-with-checkout': orderPanel === 'cart' && cart.items.length }" :style="tabLayout">
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
      <view v-else class="cart-list">
        <view v-for="i in cart.items" :key="i.itemId" class="cart-item">
          <button class="cart-checkbox" :aria-label="'勾选' + i.title" :aria-pressed="selected.has(i.itemId)" :disabled="busy"
            @tap="toggleSelected(i.itemId)">
            <text :class="['cart-checkmark', { checked: selected.has(i.itemId) }]">{{ selected.has(i.itemId) ? '✓' : '' }}</text>
          </button>
          <button class="cart-photo" :aria-label="'查看' + i.title" @tap="product(i.itemId)">
            <image v-if="i.hasCover !== false && i.hasCover !== 0 && !coverErrors.has(i.itemId)"
              :src="productCover(i.itemId)" mode="aspectFill" lazy-load @error="coverErrors.add(i.itemId)" />
            <UiIcon v-else name="entry-shop" :size="23" />
          </button>
          <view class="cart-item-details">
            <text class="cart-item-title" @tap="product(i.itemId)">{{ i.title }}</text>
            <view class="cart-item-meta">
              <text class="cart-price">{{ money(i.unitCents) }}</text>
              <view class="cart-stepper" role="group" :aria-label="i.title + '数量'">
                <button class="cart-minus" :aria-label="i.quantity === 1 ? '移除' + i.title : '减少数量'" :disabled="busy"
                  @tap="quantity(i.itemId, i.quantity - 1)">−</button>
                <text class="cart-quantity">{{ i.quantity }}</text>
                <button class="cart-plus" aria-label="增加数量" :disabled="busy || i.quantity >= 99"
                  @tap="quantity(i.itemId, i.quantity + 1)">＋</button>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view v-if="cart.items.length" class="cart-summary">
        <button class="cart-checkbox cart-select-all" :aria-pressed="allSelected" :disabled="busy" @tap="toggleAll">
          <text :class="['cart-checkmark', { checked: allSelected }]">{{ allSelected ? '✓' : '' }}</text>
          <text>全选</text>
        </button>
        <view class="cart-totals"><text>合计</text><text class="cart-total">{{ money(total) }}</text></view>
        <button id="cart-checkout" class="primary cart-checkout" :disabled="busy || !selectedItems.length" @tap="order">
          {{ selectedItems.length ? '结算（' + selectedItems.length + '）' : '结算' }}
        </button>
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
.cart-toolbar .cart-action { min-height: 34px; padding: 5px 7px; font-size: 12px; }
.cart-empty-title { color: #262422; font-weight: 800; }
.screen.tab-screen.cart-with-checkout { padding-bottom: calc(144px + env(safe-area-inset-bottom, 0px)); }
.cart-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--paper);
}
.cart-item {
  display: grid;
  grid-template-columns: 36px 72px minmax(0,1fr);
  align-items: center;
  gap: 7px;
  padding: 12px 10px 12px 3px;
}
.cart-item + .cart-item { border-top: 1px solid var(--border); }
.cart-checkbox, .cart-photo, .cart-stepper button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
}
.cart-checkbox { min-width: 36px; height: 44px; color: var(--muted); font-size: 12px; }
.cart-checkmark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid #bcb5a6;
  border-radius: 7px;
  color: #322706;
  font-size: 13px;
}
.cart-checkmark.checked { border-color: var(--yellow); background: var(--yellow); }
.cart-photo {
  width: 72px;
  height: 72px;
  overflow: hidden;
  border-radius: 8px;
  background: #faf1d8;
}
.cart-photo image { display: block; width: 100%; height: 100%; }
.cart-item-details { align-self: stretch; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; padding: 1px 0; }
.cart-item-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ink);
  font-size: 14px;
  font-weight: 750;
}
.cart-item-meta { display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
.cart-price, .cart-total { white-space: nowrap; color: #a94b20; font-weight: 850; font-variant-numeric: tabular-nums; }
.cart-price { font-size: 16px; }
.cart-stepper {
  display: flex;
  flex: none;
  align-items: center;
  min-height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--ink);
}
.cart-stepper button { width: 29px; height: 32px; font-size: 14px; }
.cart-quantity { min-width: 24px; padding: 0 2px; border-inline: 1px solid var(--border); text-align: center; font-variant-numeric: tabular-nums; }
.cart-summary {
  position: fixed;
  z-index: 29;
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  left: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 500px;
  min-height: 62px;
  margin: auto;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  background: var(--paper);
  box-shadow: 0 -4px 12px rgba(64, 47, 14, .04);
}
.cart-select-all { flex: none; gap: 5px; }
.cart-totals { display: flex; flex: 1; align-items: baseline; justify-content: flex-end; flex-wrap: wrap; gap: 0 5px; color: var(--muted); font-size: 12px; }
.cart-total { font-size: 18px; }
.cart-summary .cart-checkout { flex: none; min-width: 78px; min-height: 42px; padding: 7px 10px; border-radius: 21px; }
</style>

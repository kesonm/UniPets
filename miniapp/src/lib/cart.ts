import { ref, watch } from 'vue'
import type { Listing } from '../../../src/h5/business'
import { api, user } from './client'
type CheckoutLine = { itemId: string; unitCents: number; quantity: number }
type Line = CheckoutLine & { title: string; hasCover?: Listing['hasCover'] }
type Cart = { items: Line[]; requestKey: string; checkoutKeys?: Record<string, string> }
const fresh = (): Cart => ({ items: [], requestKey: '' })
export const cart = ref<Cart>(fresh())
export const orderPanel = ref<'cart' | 'orders'>('cart')
let storage = ''
let checkoutInProgress = false
function refreshBadge() {
  // #ifdef MP-WEIXIN
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as { getTabBar?: () => { setData(data: { cartCount: number }): void } } | undefined
  page?.getTabBar?.()?.setData({ cartCount: cart.value.items.reduce((sum, line) => sum + line.quantity, 0) })
  // #endif
}
watch(
  () => user.value?.id,
  (id) => {
    storage = id ? 'petcloud.cart.' + id : ''
    cart.value = (storage && uni.getStorageSync(storage)) || fresh()
    refreshBadge()
  },
  { immediate: true, flush: 'sync' },
)
function save() {
  if (storage) uni.setStorageSync(storage, cart.value)
  refreshBadge()
}
export function quantity(id: string, n: number) {
  const line = cart.value.items.find((i) => i.itemId === id)
  if (!line || !Number.isInteger(n) || n > 99) return
  if (n > 0) line.quantity = n
  else cart.value.items = cart.value.items.filter((i) => i.itemId !== id)
  cart.value.requestKey = ''
  save()
}
export function addProduct(p: Listing) {
  if (!user.value) throw new Error('请先微信登录')
  if (!p.priceCents || !p.stock) throw new Error('商品暂不可购买')
  const prior = cart.value.items.find((i) => i.itemId === p.id)
  if (prior) {
    if (prior.quantity >= Math.min(99, p.stock)) throw new Error('已达到可购买数量')
    prior.unitCents = p.priceCents
    prior.title = p.title
    prior.hasCover = p.hasCover
    prior.quantity++
  } else cart.value.items.push({ itemId: p.id, title: p.title, unitCents: p.priceCents, quantity: 1, hasCover: p.hasCover })
  cart.value.requestKey = ''
  save()
}
function checkoutSnapshot(items: readonly CheckoutLine[]) {
  return JSON.stringify(items.map(item => [item.itemId, item.quantity, item.unitCents]).sort())
}

export async function checkout(items: readonly CheckoutLine[]) {
  if (!user.value) throw new Error('请先微信登录')
  if (checkoutInProgress) throw new Error('订单正在提交')
  if (!items.length) throw new Error('请选择要结算的商品')
  if (items.length > 40) throw new Error('每次最多结算 40 种商品，请分批结算')
  const state = cart.value
  const current = new Map(state.items.map(item => [item.itemId, item]))
  const selected = new Map(items.map(item => [item.itemId, item]))
  if (selected.size !== items.length || items.some(item => {
    const line = current.get(item.itemId)
    return line?.quantity !== item.quantity || line.unitCents !== item.unitCents
  })) throw new Error('购物车已更新，请重新确认')

  // Keep the same key for an exact set of lines if the user retries after a lost response.
  const snapshot = checkoutSnapshot(items)
  const keys = state.checkoutKeys ?? (state.checkoutKeys = {})
  if (state.requestKey) {
    const legacySnapshot = checkoutSnapshot(state.items)
    keys[legacySnapshot] ||= state.requestKey
    state.requestKey = ''
  }
  const requestKey = keys[snapshot] || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16)
    return (c === 'x' ? n : (n & 3) | 8).toString(16)
  })
  keys[snapshot] = requestKey
  save()
  checkoutInProgress = true
  try {
    await api('/h5/orders', 'POST', { requestKey, items })
    if (cart.value === state) {
      state.items = state.items.filter(line => {
        const ordered = selected.get(line.itemId)
        if (!ordered) return true
        line.quantity -= ordered.quantity
        return line.quantity > 0
      })
      delete keys[snapshot]
      save()
    }
  } finally {
    checkoutInProgress = false
  }
}
export const money = (cents: number) => '¥' + (cents / 100).toFixed(2)
export const statusName: Record<string, string> = {
  submitted: '待确认',
  requested: '待确认',
  confirmed: '已确认',
  joined: '已参加',
  completed: '已完成',
  cancelled: '已取消',
}

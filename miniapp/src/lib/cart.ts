import { ref, watch } from 'vue'
import type { Listing } from '../../../src/h5/business'
import { api, user } from './client'
type Line = { itemId: string; title: string; unitCents: number; quantity: number }
type Cart = { items: Line[]; requestKey: string }
const fresh = (): Cart => ({ items: [], requestKey: '' })
export const cart = ref<Cart>(fresh())
export const orderPanel = ref<'cart' | 'orders'>('cart')
let storage = ''
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
    prior.quantity++
  } else cart.value.items.push({ itemId: p.id, title: p.title, unitCents: p.priceCents, quantity: 1 })
  cart.value.requestKey = ''
  save()
}
export async function checkout() {
  const state = cart.value
  if (!state.items.length) throw new Error('购物袋为空')
  if (!state.requestKey) {
    // The server scopes this idempotency key to the account and verifies the order contents.
    state.requestKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const n = Math.floor(Math.random() * 16)
      return (c === 'x' ? n : (n & 3) | 8).toString(16)
    })
    save()
  }
  await api('/h5/orders', 'POST', {
    requestKey: state.requestKey,
    items: state.items.map(({ itemId, quantity, unitCents }) => ({ itemId, quantity, unitCents })),
  })
  if (cart.value === state) {
    cart.value = fresh()
    save()
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

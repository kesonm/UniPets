import { computed, reactive, ref, watch, type Ref } from 'vue'
import { productFor, type Product } from './catalog'

export interface CartLine { id: string; sku: number; quantity: number; selected: boolean }
interface Visit { id: string; at: string }
interface ShoppingData { cart: CartLine[]; favorites: string[]; visits: Visit[] }

const isCatalogId = (id:string) => typeof id==='string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)

function readShopping(key: string): ShoppingData {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<ShoppingData>
    return {
      cart: (data.cart ?? []).filter(item=>(productFor(item.id)?.variants[item.sku] || (isCatalogId(item.id)&&item.sku===0)) &&
        Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=99),
      favorites: (data.favorites ?? []).filter(id=>productFor(id) || isCatalogId(id)),
      visits: (data.visits ?? []).filter(item=>productFor(item.id) && !isNaN(new Date(item.at).getTime())),
    }
  } catch { return {cart:[],favorites:[],visits:[]} }
}

export function useShopping(owner: Ref<string|undefined>) {
  let key = 'petcloud-h5-shop-' + (owner.value ?? 'device')
  const state = ref(readShopping(key))
  const count = computed(()=>state.value.cart.reduce((total,line)=>total+line.quantity,0))
  watch(owner,id=>{
    key = 'petcloud-h5-shop-' + (id ?? 'device')
    state.value = readShopping(key)
  },{flush:'sync'})
  watch(state,value=>{
    try { localStorage.setItem(key,JSON.stringify(value)) } catch { /* Storage can be disabled. */ }
  },{deep:true,flush:'sync'})

  function add(product: Product,sku: number,quantity = 1) {
    if (!product.variants[sku] || product.stock===0) return false
    const max = Math.min(99,product.stock ?? 99)
    const line = state.value.cart.find(item=>item.id===product.id && item.sku===sku)
    if (line) { line.quantity = Math.min(max,line.quantity+quantity); line.selected=true }
    else state.value.cart.push({id:product.id,sku,quantity:Math.min(max,quantity),selected:true})
    return true
  }

  function remove(line: CartLine) {
    state.value.cart = state.value.cart.filter(item=>item.id!==line.id || item.sku!==line.sku)
  }

  function favorite(id: string) {
    const favorites = state.value.favorites
    const index = favorites.indexOf(id)
    if (index===-1) favorites.push(id)
    else favorites.splice(index,1)
  }

  function purchase(product: Product, destination = product.purchaseUrl) {
    if (!destination || product.example) return false
    let url: URL
    try { url = new URL(destination) } catch { return false }
    if (url.protocol!=='https:') return false
    window.open(url.href,'_blank','noopener,noreferrer')
    state.value.visits = [{id:product.id,at:new Date().toISOString()},...state.value.visits].slice(0,30)
    return true
  }

  return reactive({ state, count, add, remove, favorite, purchase })
}

export type Shopping = ReturnType<typeof useShopping>

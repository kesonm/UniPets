<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, Delete, Minus, Plus, ShoppingBag, ShoppingCart, Star, StarFilled } from '@element-plus/icons-vue'
import { areaDistance, h5Areas } from '../../shared/h5-areas.mjs'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { amount, categories, productFor, products, type CatalogCategory, type Product } from './catalog'
import type { Shopping } from './shopping'

const props = defineProps<{ page:'shop'|'cart'; shopping:Shopping; area:string; category:CatalogCategory; nearby:boolean; search?:string;
  catalog:readonly Product[]; catalogReady:boolean; user:User|null }>()
const emit = defineEmits<{ category:[CatalogCategory]; nearby:[boolean]; shop:[]; cart:[]; login:[]; orders:[]; ordered:[] }>()
const sort = ref<'recommend'|'lowest'|'nearest'>('recommend')
const detail = ref<Product|null>(null)
const open = ref(false)
const sku = ref(0)
const ordering = ref(false)
let pendingCheckout: {owner:string;snapshot:string;id:string}|null = null
const currentArea = computed(()=>h5Areas.find(item=>item.id===props.area))
const exampleSheet = `${import.meta.env.BASE_URL}assets/h5-products.webp`

function distance(area: string) {
  const other = h5Areas.find(item=>item.id===area)
  return currentArea.value && other ? areaDistance(currentArea.value,other) : Infinity
}

function location(area: string) {
  if (area && area===props.area) return '同商圈'
  const km = distance(area)
  if (Number.isFinite(km)) return '约 '+Math.round(km)+' km'
  return h5Areas.find(item=>item.id===area)?.label ?? ''
}

const listing = computed(()=>{
  const query = props.search?.trim().toLowerCase() ?? ''
  const available = [...props.catalog,...products.filter(product=>!product.example||!props.catalog.length)]
  const items = available.filter(product=>
    (props.category==='all' || product.category===props.category) &&
    (!props.nearby || product.area===props.area) &&
    (!query || (product.name+' '+product.merchant+' '+categories.find(item=>item.id===product.category)?.label).toLowerCase().includes(query)))
  if (sort.value==='lowest') items.sort((a,b)=>a.variants[0].cents-b.variants[0].cents)
  else if (sort.value==='nearest') items.sort((a,b)=>distance(a.area)-distance(b.area))
  return items
})

const groups = computed(()=>{
  const merchants = new Map<string, {line:Shopping['state']['cart'][number]; product:Product}[]>()
  for (const line of props.shopping.state.cart) {
    const product = productFor(line.id,props.catalog)
    if (!product?.variants[line.sku]) continue
    const items = merchants.get(product.merchant) ?? []
    items.push({line,product})
    merchants.set(product.merchant,items)
  }
  return [...merchants].map(([merchant,items])=>({merchant,items,selected:items.filter(({line})=>line.selected)}))
})
const total = computed(()=>groups.value.reduce((sum,group)=>sum+group.selected.reduce((subtotal,{line,product})=>subtotal+line.quantity*product.variants[line.sku].cents,0),0))
const pending = computed(()=>groups.value.flatMap(group=>group.selected).filter(({product})=>product.platform))
const platformTotal = computed(()=>pending.value.reduce((sum,{line,product})=>sum+line.quantity*product.variants[line.sku].cents,0))
const unlisted = computed(()=>props.catalogReady ? props.shopping.state.cart.filter(line=>!productFor(line.id,props.catalog)) : [])

function preview(product: Product) { detail.value=product; sku.value=0; open.value=true }
function tile(index: number) {
  return {backgroundImage:'url('+exampleSheet+')',backgroundPosition:`${(index%3)*50}% ${index<3?0:100}%`}
}
function add(product: Product, variant = 0) {
  if (product.platform && !props.user) {emit('login');return}
  if (props.shopping.add(product,variant)) ElMessage.success('已加入购物车')
}
function purchase(product: Product) {
  if (!props.shopping.purchase(product)) ElMessage.info('该商品暂未接入商家购买页')
}
function purchaseGroup(group: (typeof groups.value)[number]) {
  const items = [...new Map(group.selected.filter(({product})=>!product.platform).map(({product})=>[product.id,product])).values()]
  const first=items[0]
  if (!first) return
  const destination=first.merchantUrl ?? (items.length===1 ? first.purchaseUrl : undefined)
  if(!destination||!props.shopping.purchase(first,destination)) ElMessage.info('该商家暂未接入购买页')
}
function allSelected(group: (typeof groups.value)[number], event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  for (const {line} of group.items) line.selected=checked
}

function requestKey(owner:string, snapshot:string) {
  if (pendingCheckout?.owner===owner && pendingCheckout.snapshot===snapshot) return pendingCheckout.id
  const key='petcloud-h5-checkout-'+owner
  try {
    const current=JSON.parse(sessionStorage.getItem(key) ?? 'null') as {snapshot:string;id:string}|null
    if(current?.snapshot===snapshot) return current.id
  } catch { /* A new checkout can still be made when storage is unavailable. */ }
  const bytes=crypto.getRandomValues(new Uint8Array(16))
  bytes[6]=(bytes[6]&15)|64
  bytes[8]=(bytes[8]&63)|128
  const hex=Array.from(bytes,item=>item.toString(16).padStart(2,'0')).join('')
  const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
  pendingCheckout={owner,snapshot,id}
  try {sessionStorage.setItem(key,JSON.stringify({snapshot,id}))} catch { /* Storage is optional. */ }
  return id
}
async function submitOrder() {
  if (!props.user) {emit('login');return}
  if(!pending.value.length||ordering.value) return
  const owner=props.user.id
  const items=pending.value.map(({line,product})=>({itemId:line.id,quantity:line.quantity,unitCents:product.variants[line.sku].cents}))
    .sort((a,b)=>a.itemId.localeCompare(b.itemId))
  ordering.value=true
  try {
    await api('/h5/orders',{method:'POST',body:{requestKey:requestKey(owner,JSON.stringify(items)),items}})
    if(props.user?.id!==owner) return
    for (const item of items) {
      const line=props.shopping.state.cart.find(current=>current.id===item.itemId && current.quantity===item.quantity)
      if(line) props.shopping.remove(line)
    }
    try {sessionStorage.removeItem('petcloud-h5-checkout-'+owner)} catch { /* Storage is optional. */ }
    pendingCheckout=null
    ElMessage.success('订单已提交，等待确认')
    emit('ordered')
  } catch(error) {ElMessage.error(error instanceof Error?error.message:'结算失败')}
  finally {ordering.value=false}
}
</script>

<template>
  <div v-if="page==='shop'" class="h5-market">
    <div v-if="!search" class="h5-market-controls h5-card">
      <div class="h5-chips" aria-label="商品分类">
        <button v-for="item in categories" :key="item.id" type="button" :class="{active:category===item.id}" :aria-pressed="category===item.id" @click="emit('category',item.id)">{{ item.label }}</button>
      </div>
      <div class="h5-filter-row">
        <button type="button" class="h5-near-toggle" :aria-pressed="nearby" @click="emit('nearby',!nearby)">{{ nearby ? '只看本商圈' : '全部商圈' }}</button>
        <select v-model="sort" aria-label="商品排序"><option value="recommend">推荐排序</option><option value="nearest">距离优先</option><option value="lowest">价格从低到高</option></select>
      </div>
    </div>
    <div v-if="listing.length" class="h5-market-label"><span>{{ search ? '商品搜索结果' : '商家商品' }}</span><small v-if="listing.every(item=>item.example)">示例商品</small></div>
    <div v-if="listing.length" class="h5-product-grid">
      <article v-for="product in listing" :key="product.id" class="h5-product h5-card">
        <button type="button" class="h5-product-open" @click="preview(product)">
          <div class="h5-product-art" :class="{'h5-product-art--catalog':product.platform}" :style="product.platform?undefined:tile(product.illustration)"><el-icon v-if="product.platform"><ShoppingBag /></el-icon></div>
          <strong>{{ product.name }}</strong>
          <span>{{ product.merchant }}</span>
          <small>{{ location(product.area) || (product.platform && !product.stock ? '已售罄' : '') }}</small>
        </button>
        <div class="h5-product-foot"><span>¥<b>{{ amount(product.variants[0].cents) }}</b></span>
          <button class="h5-icon-action" type="button" :aria-label="'选购'+product.name" @click="preview(product)"><el-icon><Plus /></el-icon></button>
        </div>
      </article>
    </div>
    <div v-else class="h5-empty h5-card"><el-icon><ShoppingCart /></el-icon><strong>{{ search ? '没有匹配的商品' : nearby&&!area ? '先选择商圈' : '当前范围暂无商品' }}</strong><button v-if="!search && nearby" class="h5-text-button" type="button" @click="emit('nearby',false)">查看全部商圈</button></div>
  </div>

  <div v-else class="h5-cart">
    <div class="h5-business-toolbar"><button type="button" class="h5-text-button" @click="emit('shop')">继续选购</button><button type="button" class="h5-text-button" @click="emit('orders')">订单与售后</button></div>
    <div v-if="!groups.length&&!unlisted.length" class="h5-empty h5-card"><el-icon><ShoppingCart /></el-icon><strong>{{ !catalogReady&&shopping.count?'正在读取已选商品':'购物车还是空的' }}</strong><button class="h5-primary" type="button" @click="emit('shop')">去商城</button></div>
    <div v-if="unlisted.length" class="h5-card h5-program-card"><p>有 {{ unlisted.length }} 种商品已下架</p><button type="button" class="h5-text-button" @click="unlisted.forEach(shopping.remove)">移除下架商品</button></div>
    <section v-for="group in groups" :key="group.merchant" class="h5-card h5-cart-group">
      <label class="h5-cart-shop"><input type="checkbox" :checked="group.selected.length===group.items.length" :indeterminate.prop="group.selected.length>0 && group.selected.length<group.items.length" :disabled="ordering" @change="allSelected(group,$event)"> {{ group.merchant }}</label>
      <div v-for="{line,product} in group.items" :key="line.id+'-'+line.sku" class="h5-cart-line">
        <input v-model="line.selected" type="checkbox" :aria-label="'勾选'+product.name" :disabled="ordering">
        <button type="button" class="h5-cart-thumb h5-product-art" :class="{'h5-product-art--catalog':product.platform}" :style="product.platform?undefined:tile(product.illustration)" :aria-label="'查看'+product.name" @click="preview(product)"><el-icon v-if="product.platform"><ShoppingBag /></el-icon></button>
        <div class="h5-cart-copy">
          <strong>{{ product.name }}</strong><small>{{ product.variants[line.sku].name }}</small><b>¥{{ amount(product.variants[line.sku].cents) }}</b>
        </div>
        <div class="h5-cart-controls"><button type="button" :aria-label="'移除'+product.name" :disabled="ordering" @click="shopping.remove(line)"><el-icon><Delete /></el-icon></button>
          <div><button type="button" aria-label="减少数量" :disabled="ordering||line.quantity<=1" @click="line.quantity--"><el-icon><Minus /></el-icon></button><span>{{ line.quantity }}</span><button type="button" aria-label="增加数量" :disabled="ordering||line.quantity>=Math.min(product.stock??99,99)" @click="line.quantity++"><el-icon><Plus /></el-icon></button></div>
        </div>
      </div>
      <div v-if="group.items.some(({product})=>!product.platform)" class="h5-cart-group-foot">
        <small v-if="group.items.every(({product})=>product.example)">示例商品</small>
        <button class="h5-text-button" type="button" :disabled="!group.selected.length" @click="purchaseGroup(group)">前往此商家 <el-icon><ArrowRight /></el-icon></button>
      </div>
    </section>
    <div v-if="groups.length" class="h5-cart-summary">
      <span>{{ pending.length?'平台商品合计':'已选合计' }} <strong>¥{{ amount(pending.length?platformTotal:total) }}</strong></span>
      <button v-if="pending.length" class="h5-primary" type="button" :disabled="ordering" @click="submitOrder">{{ ordering?'正在提交…':'合并提交订单' }}</button><span v-else>按商家购买</span>
    </div>
  </div>

  <el-dialog v-model="open" :title="detail?.name" class="h5-dialog" width="min(460px, 92vw)" append-to-body>
    <div v-if="detail" class="h5-product-detail">
      <div class="h5-product-art" :class="{'h5-product-art--catalog':detail.platform}" :style="detail.platform?undefined:tile(detail.illustration)"><el-icon v-if="detail.platform"><ShoppingBag /></el-icon></div>
      <div class="h5-detail-head"><strong>¥{{ amount(detail.variants[sku].cents) }}</strong><button type="button" class="h5-action" :aria-pressed="shopping.state.favorites.includes(detail.id)" @click="shopping.favorite(detail.id)"><el-icon><component :is="shopping.state.favorites.includes(detail.id)?StarFilled:Star" /></el-icon> 收藏</button></div>
      <p>{{ detail.merchant }} · {{ location(detail.area) }}</p><p>{{ detail.description }}</p>
      <div class="h5-chips" aria-label="商品规格"><button v-for="(variant,index) in detail.variants" :key="variant.name" type="button" :class="{active:sku===index}" :aria-pressed="sku===index" @click="sku=index">{{ variant.name }}</button></div>
      <p v-if="detail.example" class="h5-muted">示例商品，暂未接入库存、配送和购买页。</p>
      <p v-if="detail.platform" class="h5-muted">{{ detail.stock ? '库存 '+detail.stock : '已售罄' }}</p>
      <div class="h5-button-row"><button class="h5-secondary" type="button" :disabled="detail.stock===0" @click="add(detail,sku)">加入购物车</button><button v-if="detail.purchaseUrl" class="h5-primary" type="button" @click="purchase(detail)">去购买</button><button v-else class="h5-primary" type="button" @click="open=false;emit('cart')">查看购物车</button></div>
    </div>
  </el-dialog>
</template>

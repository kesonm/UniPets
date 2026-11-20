<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../lib/api'
import { currencyNames, engagementNames, localDateTime, orderNames,
  type Engagement, type H5Order, type PersonalStory, type RecordsPanel, type WalletSummary } from './business'
import { amount, productFor, type Product } from './catalog'
import type { Shopping } from './shopping'
import type { H5Creator } from './types'

const props = defineProps<{panel:RecordsPanel; shopping:Shopping; catalog:readonly Product[]}>()
const emit = defineEmits<{story:[string|null]; refreshCatalog:[]; creator:[string]} >()
const orders = ref<H5Order[]>([])
const engagements = ref<Engagement[]>([])
const wallet = ref<WalletSummary|null>(null)
const stories = ref<PersonalStory[]>([])
const creator = ref<H5Creator|null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const supportOpen = ref(false)
const supportId = ref('')
const support = ref('')
let revision = 0
const visits = computed(()=>props.shopping.state.visits.flatMap(item=>{
  const product=productFor(item.id,props.catalog)
  return product?[{...item,product}]:[]
}))
const records = computed(()=>engagements.value.filter(item=>{
  if (props.panel==='charity') return item.module==='charity'
  if (props.panel==='learning') return item.module==='education'
  return item.module!=='charity'&&item.module!=='education'
}))

async function load() {
  const version=++revision
  loading.value=true;error.value=''
  try {
    if (props.panel==='orders') {
      const result=await api<{orders:H5Order[]}>('/h5/orders')
      if (version===revision) orders.value=result.orders
    } else if(props.panel==='assets') {
      const result=await api<WalletSummary>('/h5/wallet')
      if (version===revision) wallet.value=result
    } else if(props.panel==='ip') {
      const result=await api<{stories:PersonalStory[]}>('/h5/my-stories')
      if (version===revision) stories.value=result.stories
    } else if(props.panel==='creator') {
      const result=await api<{creator:H5Creator|null}>('/h5/creator-account')
      if (version===revision) creator.value=result.creator
    } else {
      const result=await api<{engagements:Engagement[]}>('/h5/engagements')
      if (version===revision) engagements.value=result.engagements
    }
  } catch(cause) {if (version===revision) error.value=cause instanceof Error?cause.message:'记录读取失败'}
  finally {if (version===revision) loading.value=false}
}
watch(()=>props.panel,()=>{void load()},{immediate:true})

async function cancelOrder(order:H5Order) {
  if(busy.value) return
  try {await ElMessageBox.confirm('取消后，预留的商品会释放给其他用户。','取消订单',{confirmButtonText:'确认取消',cancelButtonText:'返回'})}
  catch {return}
  busy.value=true
  try {
    await api('/h5/orders/'+order.id+'/cancel',{method:'POST',body:{}})
    await load();emit('refreshCatalog')
    ElMessage.success('订单已取消')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'取消失败')}
  finally {busy.value=false}
}
function openSupport(order:H5Order) {
  supportId.value=order.id;support.value=order.supportMessage ?? '';supportOpen.value=true
}
async function sendSupport() {
  if (busy.value||!support.value.trim()) return
  busy.value=true
  try {
    await api('/h5/orders/'+supportId.value+'/support',{method:'PUT',body:{message:support.value}})
    supportOpen.value=false;await load();ElMessage.success('已登记售后诉求')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'售后诉求未保存')}
  finally {busy.value=false}
}
async function updateRecord(item:Engagement,action:'cancel'|'check-in') {
  if (busy.value) return
  busy.value=true
  try {
    await api('/h5/engagements/'+item.id,{method:'PATCH',body:{action}});await load()
    ElMessage.success(action==='cancel'?'参与记录已取消':'学习打卡已保存')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'记录更新失败')}
  finally {busy.value=false}
}
</script>

<template>
  <div v-if="error" class="h5-empty" role="status">{{ error }}<button type="button" class="h5-text-button" @click="load">重新加载</button></div>
  <p v-else-if="loading" class="h5-dialog-empty" role="status">正在读取记录…</p>
  <div v-else class="h5-program-stack">
    <template v-if="panel==='orders'">
      <article v-for="order in orders" :key="order.id" class="h5-card h5-program-card h5-order">
        <div class="h5-event-heading"><strong>订单 {{ order.id.slice(0,8).toUpperCase() }}</strong><span class="h5-pill">{{ orderNames[order.status] }}</span></div>
        <p class="h5-muted">{{ localDateTime(order.createdAt) }}</p>
        <div v-for="item in order.items" :key="item.itemId" class="h5-order-line">
          <div><strong>{{ item.title }}</strong><small>{{ item.provider }} · ×{{ item.quantity }}</small></div><span>¥{{ amount(item.unitCents*item.quantity) }}</span>
        </div>
        <div class="h5-business-toolbar"><strong>合计 ¥{{ amount(order.totalCents) }}</strong><span v-if="order.status==='submitted'" class="h5-muted">尚未收款</span></div>
        <p v-if="order.supportMessage" class="h5-listing-description">{{ order.supportResolved?'已处理':'待处理' }} · {{ order.supportMessage }}</p>
        <div v-if="order.status!=='cancelled'" class="h5-business-actions">
          <button type="button" class="h5-text-button" @click="openSupport(order)">售后申请</button>
          <button v-if="order.status==='submitted'" type="button" class="h5-text-button" :disabled="busy" @click="cancelOrder(order)">取消订单</button>
        </div>
      </article>
      <p v-if="!orders.length" class="h5-dialog-empty">还没有平台订单</p>
      <div v-if="visits.length">
        <h3 class="h5-small-heading">商家访问记录</h3>
        <div class="h5-simple-list"><button v-for="item in visits" :key="item.id+item.at" type="button" @click="shopping.purchase(item.product)"><span><strong>{{ item.product.name }}</strong><small>{{ item.product.merchant }} · {{ localDateTime(item.at) }}</small></span></button></div>
      </div>
    </template>
    <template v-else-if="panel==='assets'">
      <div v-if="wallet" class="h5-wallet-summary">
        <div v-for="(balance,id) in wallet.balances" :key="id"><span>{{ currencyNames[id] }}</span><strong>{{ balance }}</strong></div>
      </div>
      <div v-if="wallet?.entries.length" class="h5-record-list">
        <article v-for="entry in wallet.entries" :key="entry.id" class="h5-record">
          <div><strong>{{ entry.label }}</strong><span>{{ entry.quantity>0?'+':'' }}{{ entry.quantity }} {{ currencyNames[entry.currency] }}</span></div>
          <small>{{ localDateTime(entry.createdAt) }}</small>
        </article>
      </div>
      <p v-else class="h5-dialog-empty">暂无资产流水</p>
    </template>
    <template v-else-if="panel==='ip'">
      <div v-if="stories.length" class="h5-simple-list"><button v-for="story in stories" :key="story.id" type="button" @click="emit('story',story.publishedAt?story.id:null)"><span><strong>{{ story.title }}</strong><small>{{ story.petName }} · {{ story.publishedAt?'平台发布记录':'私密剧本' }}</small></span></button></div>
      <p v-else class="h5-dialog-empty">还没有名下作品</p>
      <button type="button" class="h5-small-primary" @click="emit('story',null)">管理剧本</button>
    </template>
    <template v-else-if="panel==='creator'">
      <article v-if="creator" class="h5-card h5-program-card">
        <div class="h5-event-heading"><strong>{{ creator.name }}</strong><span class="h5-pill">已开放达人主页</span></div>
        <p class="h5-listing-description">{{ creator.bio }}</p>
        <button type="button" class="h5-text-button" @click="emit('creator',creator.id)">前往达人专区</button>
      </article>
      <p v-else class="h5-dialog-empty">当前账号尚未开通达人主页</p>
    </template>
    <template v-else>
      <article v-for="item in records" :key="item.id" class="h5-card h5-program-card">
        <div class="h5-event-heading"><strong>{{ item.title }}</strong><span class="h5-pill">{{ engagementNames[item.status] }}</span></div>
        <p class="h5-muted">{{ [item.petName,item.provider,item.venue].filter(Boolean).join(' · ') }}</p>
        <p v-if="item.startsAt" class="h5-muted">{{ localDateTime(item.startsAt) }}</p>
        <p v-if="item.checkedInAt" class="h5-muted">已打卡 {{ localDateTime(item.checkedInAt) }}</p>
        <p v-if="item.status==='confirmed'&&item.kind==='appointment'" class="h5-muted">到店预约编号 {{ item.id }}</p>
        <div class="h5-business-actions">
          <button v-if="panel==='learning'&&item.kind==='enrollment'&&item.status==='joined'&&!item.checkedInAt" type="button" class="h5-small-primary" :disabled="busy" @click="updateRecord(item,'check-in')">学习打卡</button>
          <button v-if="item.status!=='cancelled'&&item.status!=='completed'&&!item.checkedInAt" type="button" class="h5-text-button" :disabled="busy" @click="updateRecord(item,'cancel')">{{ item.kind==='group'?'退出社群':'取消参加' }}</button>
        </div>
      </article>
      <p v-if="!records.length" class="h5-dialog-empty">{{ panel==='learning'?'还没有课程记录':panel==='charity'?'还没有公益记录':'还没有预约记录' }}</p>
    </template>
  </div>

  <el-dialog v-model="supportOpen" title="售后申请" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
    <form class="h5-form" @submit.prevent="sendSupport"><label>遇到的问题<textarea v-model.trim="support" rows="3" maxlength="500" required /></label><button class="h5-primary" type="submit" :disabled="busy">登记售后诉求</button></form>
  </el-dialog>
</template>

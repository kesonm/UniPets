<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { api } from '../lib/api'
import { amount, categories } from './catalog'
import { businessModules, engagementNames, localDateTime, orderNames,
  type Engagement, type H5Order, type Listing, type ListingModule } from './business'

const emit=defineEmits<{changed:[]}>()
const sections=[{id:'catalog',label:'项目发布'},{id:'engagements',label:'预约与核销'},{id:'orders',label:'订单与售后'}] as const
type Section=(typeof sections)[number]['id']
const section=ref<Section>('catalog')
const modules={...businessModules,friends:{title:'宠物相亲交友',categories:[{id:'community',label:'社群'}]},
  shop:{title:'宠物品牌超市',categories:categories.filter(item=>item.id!=='all')}}
const kinds=[
  {id:'article',label:'资讯'}, {id:'appointment',label:'可预约服务'}, {id:'enrollment',label:'可报名项目'},
  {id:'product',label:'可下单商品'}, {id:'group',label:'社群'}, {id:'link',label:'官方链接'},
] as const
const form=reactive({module:'services' as ListingModule,category:'grooming',kind:'appointment' as Listing['kind'],
  title:'',provider:'',description:'',area:'',venue:'',startsAt:'',closesAt:'',
  price:'',stock:'',externalUrl:'',published:false})
const listings=ref<(Listing&{published:boolean|number})[]>([])
const engagements=ref<Engagement[]>([])
const orders=ref<H5Order[]>([])
const loading=ref(false)
const busy=ref(false)
const error=ref('')
const editing=ref(false)
const code=reactive({id:'',value:''})
const choices=computed(()=>modules[form.module].categories)
watch(()=>form.module,()=>{
  form.category=choices.value[0].id
  form.kind=form.module==='friends'?'group':form.module==='shop'?'product':'appointment'
})
let revision=0

async function load() {
  const version=++revision
  loading.value=true;error.value=''
  try {
    if (section.value==='catalog') {
      const result=await api<{listings:typeof listings.value}>('/h5/operations/catalog')
      if (version===revision) listings.value=result.listings
    } else if(section.value==='engagements') {
      const result=await api<{engagements:Engagement[]}>('/h5/operations/engagements')
      if (version===revision) engagements.value=result.engagements
    } else {
      const result=await api<{orders:typeof orders.value}>('/h5/operations/orders')
      if (version===revision) orders.value=result.orders
    }
  } catch(cause) {if (version===revision) error.value=cause instanceof Error?cause.message:'操作记录读取失败'}
  finally {if (version===revision) loading.value=false}
}
watch(section,()=>{void load()},{immediate:true})

async function save() {
  if (busy.value) return
  busy.value=true
  try {
    const {price,stock,startsAt,closesAt,...fields}=form
    await api('/h5/operations/catalog',{method:'POST',body:{...fields,area:fields.area||null,venue:fields.venue||null,
      startsAt:startsAt?new Date(startsAt+'+08:00').toISOString():null,
      closesAt:closesAt?new Date(closesAt+'+08:00').toISOString():null,
      externalUrl:fields.externalUrl||null,priceCents:price===''?null:Math.round(Number(price)*100),stock:stock===''?null:Number(stock)}})
    Object.assign(form,{title:'',provider:'',description:'',venue:'',startsAt:'',closesAt:'',price:'',stock:'',externalUrl:'',published:false})
    editing.value=false;await load();emit('changed');ElMessage.success('项目已保存')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'保存失败')}
  finally {busy.value=false}
}
async function change(path:string,body:unknown) {
  if (busy.value) return
  busy.value=true
  try {
    await api('/h5/operations/'+path,{method:'PATCH',body})
    code.id='';code.value='';await load();emit('changed');ElMessage.success('记录已更新')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'更新失败')}
  finally {busy.value=false}
}
</script>

<template>
  <div class="h5-program-stack">
    <div class="h5-chips" role="group" aria-label="业务管理栏目"><button v-for="item in sections" :key="item.id" type="button" :class="{active:section===item.id}" :aria-pressed="section===item.id" @click="section=item.id">{{ item.label }}</button></div>
    <p v-if="error" class="h5-muted" role="status">{{ error }} <button type="button" class="h5-text-button" @click="load">重试</button></p>
    <p v-else-if="loading" class="h5-muted" role="status">正在读取…</p>
    <template v-else-if="section==='catalog'">
      <button type="button" class="h5-small-primary" @click="editing=!editing">{{ editing?'收起新建表单':'新建项目' }}</button>
      <form v-if="editing" class="h5-form" @submit.prevent="save">
        <div class="h5-form-pair">
          <label>模块<select v-model="form.module"><option v-for="(item,id) in modules" :key="id" :value="id">{{ item.title }}</option></select></label>
          <label>分类<select v-model="form.category"><option v-for="item in choices" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        </div>
        <label>项目类型<select v-model="form.kind"><option v-for="item in kinds" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        <label>标题<input v-model.trim="form.title" maxlength="120" required></label>
        <label>提供方<input v-model.trim="form.provider" maxlength="120"></label>
        <label>详情<textarea v-model.trim="form.description" rows="3" maxlength="5000" required /></label>
        <div class="h5-form-pair">
          <label>商圈<select v-model="form.area"><option value="">不限</option><option v-for="area in h5Areas" :key="area.id" :value="area.id">{{ area.label }}</option></select></label>
          <label>地点<input v-model.trim="form.venue" maxlength="160"></label>
          <label>开始时间（北京时间）<input v-model="form.startsAt" type="datetime-local" :required="form.kind==='appointment'"></label>
          <label>报名截止（北京时间）<input v-model="form.closesAt" type="datetime-local"></label>
          <label>价格（元）<input v-model="form.price" type="number" min="0.01" step="0.01" max="100000" :required="form.kind==='product'"></label>
          <label>{{ form.kind==='product'?'库存':'限额' }}<input v-model="form.stock" type="number" min="0" max="100000" step="1" :required="form.kind==='product'"></label>
        </div>
        <label>官方链接<input v-model.trim="form.externalUrl" type="url" maxlength="500" :required="form.kind==='link'"></label>
        <label class="h5-check"><input v-model="form.published" type="checkbox"> 保存后公开展示</label>
        <button class="h5-primary" type="submit" :disabled="busy">保存项目</button>
      </form>
      <article v-for="item in listings" :key="item.id" class="h5-record">
        <div><strong>{{ item.title }}</strong><span class="h5-pill">{{ item.published?'已发布':'未发布' }}</span></div>
        <small>{{ modules[item.module].title }} · {{ item.provider || '平台项目' }}</small>
        <button type="button" class="h5-text-button" :disabled="busy" @click="change('catalog/'+item.id,{published:!item.published})">{{ item.published?'下架':'发布' }}</button>
      </article>
    </template>
    <template v-else-if="section==='engagements'">
      <article v-for="item in engagements" :key="item.id" class="h5-record">
        <div><strong>{{ item.title }}</strong><span class="h5-pill">{{ engagementNames[item.status] }}</span></div>
        <small>{{ [item.petName,item.provider,item.startsAt?localDateTime(item.startsAt):''].filter(Boolean).join(' · ') }}</small>
        <p v-if="item.note">{{ item.note }}</p>
        <div class="h5-business-actions">
          <button v-if="item.status==='requested'" class="h5-small-primary" :disabled="busy" type="button" @click="change('engagements/'+item.id,{action:'confirm'})">确认预约</button>
          <button v-if="item.kind==='appointment'&&item.status==='confirmed'" class="h5-small-primary" type="button" @click="code.id=item.id;code.value=''">核销预约</button>
          <button v-if="item.kind==='appointment'" class="h5-text-button" :disabled="busy" type="button" @click="change('engagements/'+item.id,{action:'cancel'})">取消预约</button>
          <button v-if="item.kind==='enrollment'" class="h5-small-primary" :disabled="busy" type="button" @click="change('engagements/'+item.id,{action:'complete'})">标记完成</button>
        </div>
        <form v-if="code.id===item.id" class="h5-form" @submit.prevent="change('engagements/'+item.id,{action:'redeem',code:code.value})">
          <label>用户出示的预约编号<input v-model.trim="code.value" maxlength="36" required></label><button class="h5-secondary" type="submit" :disabled="busy">确认到店核销</button>
        </form>
      </article>
      <p v-if="!engagements.length" class="h5-dialog-empty">暂无待处理预约或报名</p>
    </template>
    <template v-else>
      <article v-for="order in orders" :key="order.id" class="h5-record">
        <div><strong>{{ order.id.slice(0,8).toUpperCase() }} · ¥{{ amount(order.totalCents) }}</strong><span class="h5-pill">{{ orderNames[order.status] }}</span></div>
        <div v-for="item in order.items" :key="item.itemId" class="h5-order-line"><strong>{{ item.title }}</strong><small>{{ item.provider }} · ×{{ item.quantity }}</small></div>
        <p v-if="order.supportMessage">{{ order.supportMessage }}</p>
        <div class="h5-business-actions">
          <button v-if="order.status==='submitted'" type="button" class="h5-small-primary" :disabled="busy" @click="change('orders/'+order.id,{action:'confirm'})">确认接单</button>
          <button v-if="order.status==='confirmed'" type="button" class="h5-small-primary" :disabled="busy" @click="change('orders/'+order.id,{action:'complete'})">标记履约完成</button>
          <button v-if="order.supportMessage&&!order.supportResolved" type="button" class="h5-text-button" :disabled="busy" @click="change('orders/'+order.id,{action:'resolve-support'})">售后已处理</button>
        </div>
      </article>
      <p v-if="!orders.length" class="h5-dialog-empty">暂无待处理订单</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Calendar, LocationFilled } from '@element-plus/icons-vue'
import { api } from '../lib/api'
import type { Pet, User } from '../lib/types'
import { amount } from './catalog'
import { areaLabel, businessModules, engagementNames, listingKindNames, localDateTime,
  type BusinessModule, type Engagement, type Listing } from './business'
import H5Memorial from './H5Memorial.vue'
import H5Feed from './H5Feed.vue'
import type { H5Post, PostTopic } from './types'

const props = defineProps<{module:BusinessModule; area:string; user:User|null; pets:Pet[]; preferredPetId:string; itemId:string|null; postRevision:number; liked:string[]}>()
const emit = defineEmits<{back:[]; chooseArea:[]; login:[]; create:[]; shop:[]; cart:[Listing];
  records:['appointments'|'learning'|'charity']; health:[]; changed:[]; publish:[PostTopic]; post:[H5Post]; like:[H5Post]}>()
const category = ref('')
const onlyNearby = ref(false)
const listings = ref<Listing[]>([])
const detail = ref<Listing|null>(null)
const open = ref(false)
const memorialOpen = ref(false)
const loading = ref(false)
const listError = ref('')
const petId = ref('')
const note = ref('')
const busy = ref(false)
const saved = ref<Engagement|null>(null)
const publicPosts = ref<H5Post[]>([])
const postLoading = ref(false)
const postError = ref('')
let revision = 0
let detailRevision = 0
let topicRevision = 0

const definition = computed(()=>businessModules[props.module])
const isLocal = computed(()=>['services','medical','travel'].includes(props.module))
const visibleListings = computed(()=>listings.value.filter(item=>
  (!category.value || item.category===category.value) && (!onlyNearby.value || item.area===props.area)))
const requiresPet = computed(()=>props.module!=='charity')
const topic = computed(()=>props.module==='travel'&&(!category.value||category.value==='guides')?'travel':
  props.module==='charity'&&(!category.value||category.value==='rescue')?'rescue':null)
const joinable = computed(()=>detail.value?.kind==='appointment' || detail.value?.kind==='enrollment')
const closed = computed(()=>{
  const deadline = detail.value?.closesAt ?? detail.value?.startsAt
  return Boolean(deadline && new Date(deadline).getTime() <= Date.now())
})

async function load() {
  const version = ++revision
  const params = new URLSearchParams({module:props.module})
  if (props.area) params.set('area',props.area)
  loading.value=true;listError.value=''
  try {
    const result = await api<{listings:Listing[]}>('/h5/catalog?'+params)
    if (version===revision) listings.value=result.listings
  } catch(error) {
    if (version===revision) listError.value=error instanceof Error?error.message:'项目读取失败'
  } finally {if (version===revision) loading.value=false}
}

function show(item:Listing) {
  detail.value=item;note.value='';saved.value=null
  petId.value=props.pets.find(pet=>pet.id===props.preferredPetId)?.id ?? props.pets[0]?.id ?? ''
  open.value=true
}
watch(()=>[props.module,props.area],()=>{void load()},{immediate:true})
watch([topic,()=>props.postRevision],()=>{void loadTopic()},{immediate:true})
watch(()=>props.module,()=>{category.value='';onlyNearby.value=false;open.value=false;memorialOpen.value=false})
watch(()=>props.user?.id,()=>{saved.value=null;note.value=''})
watch(()=>props.itemId, async id=>{
  const version=++detailRevision
  if (!id) return
  try {
    const {listing}=await api<{listing:Listing}>('/h5/catalog/'+id)
    if (version===detailRevision && listing.module===props.module) show(listing)
  } catch(error) {if (version===detailRevision) ElMessage.error(error instanceof Error?error.message:'项目详情读取失败')}
},{immediate:true})

function toggleNearby() {
  if (!props.area && !onlyNearby.value) emit('chooseArea')
  onlyNearby.value=!onlyNearby.value
}
async function loadTopic() {
  const version=++topicRevision
  publicPosts.value=[];postError.value=''
  postLoading.value=Boolean(topic.value)
  if (!topic.value) return
  try {
    const {posts}=await api<{posts:H5Post[]}>('/h5/posts?sort=latest&topic='+topic.value)
    if (version===topicRevision) publicPosts.value=posts
  } catch(cause) {if (version===topicRevision) postError.value=cause instanceof Error?cause.message:'内容读取失败'}
  finally {if (version===topicRevision) postLoading.value=false}
}
function records() {
  emit('records',props.module==='education'?'learning':props.module==='charity'?'charity':'appointments')
}

async function participate() {
  const item=detail.value
  if (!item || !joinable.value || busy.value) return
  if (!props.user) {emit('login');return}
  const owner=props.user.id
  busy.value=true
  try {
    const result=await api<{engagement:Engagement}>('/h5/catalog/'+item.id+'/participation',{
      method:'POST',body:{petId:requiresPet.value?petId.value:null,note:note.value},
    })
    if (props.user?.id===owner && detail.value?.id===item.id) {
      saved.value=result.engagement
      emit('changed')
    }
  } catch(error) {ElMessage.error(error instanceof Error?error.message:'提交失败')}
  finally {busy.value=false}
}
</script>

<template>
  <div>
    <div class="h5-page-head h5-page-head--yellow h5-program-head">
      <button type="button" class="h5-program-back" aria-label="返回首页" @click="emit('back')"><el-icon><ArrowLeft /></el-icon></button>
      <h1>{{ definition.title }}</h1>
    </div>
    <div class="h5-page-content h5-program-stack">
      <div class="h5-business-actions">
        <button v-if="module==='immortality'" type="button" class="h5-small-primary" @click="memorialOpen=true">我的纪念馆</button>
        <button v-if="module==='services'" type="button" class="h5-secondary" @click="emit('shop')">门店商品</button>
        <button v-if="module==='medical'" type="button" class="h5-secondary" @click="emit('health')">健康档案</button>
        <button type="button" class="h5-secondary" @click="records">{{ module==='education'?'我的课程':module==='charity'?'我的公益':'我的预约' }}</button>
        <button v-if="isLocal" type="button" class="h5-text-button" @click="emit('chooseArea')"><el-icon><LocationFilled /></el-icon> {{ areaLabel(area) || '选择商圈' }}</button>
      </div>
      <div class="h5-card h5-program-card h5-business-filters">
        <div class="h5-chips" role="group" aria-label="项目分类">
          <button type="button" :class="{active:!category}" :aria-pressed="!category" @click="category=''">全部</button>
          <button v-for="item in definition.categories" :key="item.id" type="button"
            :class="{active:category===item.id}" :aria-pressed="category===item.id" @click="category=item.id">{{ item.label }}</button>
        </div>
        <button v-if="isLocal" type="button" class="h5-near-toggle" :aria-pressed="onlyNearby" @click="toggleNearby">{{ onlyNearby?'只看本商圈':'全部商圈' }}</button>
      </div>
      <div v-if="listError" class="h5-empty h5-card" role="status">{{ listError }}<button class="h5-text-button" type="button" @click="load">重新加载</button></div>
      <div v-else-if="loading" class="h5-empty h5-card" role="status">正在读取项目…</div>
      <button v-for="item in visibleListings" v-else :key="item.id" type="button" class="h5-card h5-program-card h5-event-link" @click="show(item)">
        <span class="h5-event-heading"><strong>{{ item.title }}</strong><span class="h5-pill">{{ listingKindNames[item.kind] }}</span></span>
        <span v-if="item.provider || item.area" class="h5-muted">{{ [item.provider,areaLabel(item.area)].filter(Boolean).join(' · ') }}</span>
        <span v-if="item.startsAt" class="h5-event-when">{{ localDateTime(item.startsAt) }}</span>
        <span class="h5-listing-summary">{{ item.description }}</span>
        <span class="h5-event-link-text">查看详情 <el-icon><ArrowRight /></el-icon></span>
      </button>
      <div v-if="!loading && !listError && !visibleListings.length" class="h5-empty h5-card">
        <el-icon><Calendar /></el-icon><strong>{{ onlyNearby&&!area?'请先选择商圈':'当前分类暂无已发布的项目' }}</strong>
        <button v-if="onlyNearby" type="button" class="h5-text-button" @click="onlyNearby=false">查看全部商圈</button>
      </div>
      <section v-if="topic" class="h5-program-stack">
        <div class="h5-section-title"><h2>{{ topic==='travel'?'用户出行攻略':'救助动态' }}</h2><button type="button" class="h5-text-button" @click="emit('publish',topic)">{{ topic==='travel'?'分享攻略':'发布救助信息' }}</button></div>
        <div v-if="postError" class="h5-card h5-empty" role="status">{{ postError }}<button type="button" class="h5-text-button" @click="loadTopic">重试</button></div>
        <H5Feed v-else-if="publicPosts.length" :posts="publicPosts" :liked="liked" @view="emit('post',$event)" @like="emit('like',$event)" />
        <p v-else class="h5-muted">{{ postLoading?'正在读取…':'还没有用户发布内容' }}</p>
      </section>
    </div>

    <el-dialog v-model="open" :title="detail?.title" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <template v-if="detail">
        <p class="h5-listing-description">{{ detail.description }}</p>
        <dl v-if="detail.provider || detail.venue || detail.startsAt || detail.priceCents!==null || detail.stock!==null" class="h5-program-details">
          <template v-if="detail.provider"><dt>提供方</dt><dd>{{ detail.provider }}</dd></template>
          <template v-if="detail.venue"><dt>地点</dt><dd>{{ detail.venue }}</dd></template>
          <template v-if="detail.startsAt"><dt>开始时间</dt><dd>{{ localDateTime(detail.startsAt) }}</dd></template>
          <template v-if="detail.closesAt"><dt>报名截止</dt><dd>{{ localDateTime(detail.closesAt) }}</dd></template>
          <template v-if="detail.priceCents!==null"><dt>参考费用</dt><dd>¥{{ amount(detail.priceCents) }}</dd></template>
          <template v-if="detail.stock!==null&&detail.kind==='product'"><dt>库存</dt><dd>{{ detail.stock }}</dd></template>
        </dl>
        <div v-if="saved" class="h5-business-actions" role="status">
          <span class="h5-pill">{{ engagementNames[saved.status] }}</span>
          <button class="h5-text-button" type="button" @click="open=false;records()">查看记录</button>
        </div>
        <form v-else-if="joinable" class="h5-form h5-business-form" @submit.prevent="participate">
          <p v-if="closed" class="h5-muted">已截止</p>
          <button v-else-if="!user" type="button" class="h5-primary" @click="emit('login')">登录后{{ listingKindNames[detail.kind] }}</button>
          <button v-else-if="requiresPet&&!pets.length" type="button" class="h5-primary" @click="emit('create')">先创建宠物档案</button>
          <template v-else>
            <label v-if="requiresPet">选择宠物<select v-model="petId" required><option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label>
            <label v-if="detail.kind==='appointment'">补充说明（选填）<textarea v-model.trim="note" maxlength="500" rows="2" /></label>
            <button class="h5-primary" type="submit" :disabled="busy || (requiresPet&&!petId)">{{ busy?'正在提交…':detail.kind==='appointment'?'提交预约申请':'确认报名' }}</button>
          </template>
        </form>
        <div v-if="detail.kind==='product' || detail.externalUrl" class="h5-business-actions">
          <button v-if="detail.kind==='product'" type="button" class="h5-primary" :disabled="!detail.stock" @click="emit('cart',detail);open=false">加入购物车</button>
          <a v-else-if="detail.externalUrl" class="h5-secondary" :href="detail.externalUrl" target="_blank" rel="noopener noreferrer">{{ module==='education'?'打开课程链接':'打开官方入口' }}</a>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="memorialOpen" title="我的纪念馆" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <H5Memorial :user="user" :pets="pets" :preferred-pet-id="preferredPetId" @login="emit('login')" @create="emit('create')" @changed="emit('changed')" />
    </el-dialog>
  </div>
</template>

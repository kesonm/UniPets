<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotRound, Compass, Trophy, UserFilled } from '@element-plus/icons-vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { api } from '../lib/api'
import type { Pet, User } from '../lib/types'
import { areaLabel, localDateTime, type Engagement, type Listing } from './business'
import type { H5Comment, H5Creator, H5FriendRequest, H5Match } from './types'

const props = defineProps<{modelValue:string; user:User|null; pets:Pet[]; preferredPetId:string; area:string}>()
const emit = defineEmits<{ 'update:modelValue':[string]; chooseArea:[]; login:[]; create:[]; post:[string]; publish:[] }>()
const sections = [
  {id:'feed',title:'动态'},
  {id:'matches',title:'同城匹配'},
  {id:'creators',title:'达人专区'},
  {id:'groups',title:'社群'},
  {id:'tasks',title:'互动任务'},
] as const
const speciesNames = {cat:'猫咪',dog:'狗狗',other:'其他'} as const
const intentNames = {friends:'找玩伴',dating:'宠物相亲',both:'玩伴与相亲'} as const
const requestNames = {pending:'待回应',accepted:'已接受',declined:'已拒绝'} as const
const filters = reactive({species:'',breed:'',gender:'',intent:'',stage:''})
const matches = ref<H5Match[]>([])
const myProfiles = ref<H5Match[]>([])
const requests = ref<H5FriendRequest[]>([])
const creators = ref<H5Creator[]>([])
const creator = ref<{creator:H5Creator;posts:{id:string;title:string}[]}|null>(null)
const creatorOpen = ref(false)
const groups = ref<Listing[]>([])
const joined = ref<string[]>([])
const group = ref<Listing|null>(null)
const groupOpen = ref(false)
const messages = ref<H5Comment[]>([])
const message = ref('')
const chatError = ref('')
const progress = ref({posts:0,comments:0,groups:0})
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const profileOpen = ref(false)
const profile = reactive({petId:'',area:'',intent:'friends' as H5Match['intent'],introduction:'',consent:false})
const target = ref<H5Match|null>(null)
const inviteOpen = ref(false)
const sourcePet = ref('')
const myPetIds = computed(()=>new Set(props.pets.map(pet=>pet.id)))
const activeProfile = computed(()=>myProfiles.value.find(item=>item.petId===profile.petId))
let revision = 0

async function load() {
  const section = props.modelValue
  const version=++revision
  loading.value=section!=='feed';error.value=''
  try {
    if (section==='matches') {
      const params=new URLSearchParams(Object.entries({...filters,area:props.area}).filter(([,value])=>Boolean(value)))
      const result=await api<{matches:H5Match[]}>('/h5/matches?'+params)
      if (version===revision) matches.value=result.matches
      if (props.user) {
        const [own,invites]=await Promise.all([
          api<{matches:H5Match[]}>('/h5/my-matches'), api<{requests:H5FriendRequest[]}>('/h5/friend-requests'),
        ])
        if (version===revision) {myProfiles.value=own.matches;requests.value=invites.requests}
      }
    } else if(section==='creators') {
      const result=await api<{creators:H5Creator[]}>('/h5/creators')
      if (version===revision) creators.value=result.creators
    } else if(section==='groups') {
      const [directory,membership]=await Promise.all([
        api<{listings:Listing[]}>('/h5/catalog?module=friends&kind=group'),
        props.user?api<{engagements:Engagement[]}>('/h5/engagements'):Promise.resolve({engagements:[]}),
      ])
      if (version===revision) {
        groups.value=directory.listings
        joined.value=membership.engagements.filter(item=>item.kind==='group'&&item.status==='joined').map(item=>item.itemId)
      }
    } else if(section==='tasks' && props.user) {
      const result=await api<{progress:typeof progress.value}>('/h5/community-progress')
      if (version===revision) progress.value=result.progress
    }
  } catch(cause) {if (version===revision) error.value=cause instanceof Error?cause.message:'交友信息读取失败'}
  finally {if(version===revision) loading.value=false}
}
watch(()=>[props.modelValue,props.area,props.user?.id],()=>{void load()},{immediate:true})
watch(()=>props.user?.id,()=>{
  myProfiles.value=[];requests.value=[];joined.value=[];progress.value={posts:0,comments:0,groups:0}
  profileOpen.value=false;inviteOpen.value=false;groupOpen.value=false
})
const preferred = () => props.pets.find(pet=>pet.id===props.preferredPetId)?.id ?? props.pets[0]?.id ?? ''
function gate() {
  if (!props.user) {emit('login');return false}
  if (!props.pets.length) {emit('create');return false}
  return true
}
function fillProfile() {
  const current=activeProfile.value
  profile.area=current?.area ?? props.area
  profile.intent=current?.intent ?? 'friends'
  profile.introduction=current?.introduction ?? ''
  profile.consent=Boolean(current)
}
function editProfile() {
  if(!gate()) return
  profile.petId=preferred();fillProfile();profileOpen.value=true
}
async function saveProfile(remove=false) {
  if (!props.user || !profile.petId || busy.value || (!remove&&!profile.consent)) return
  const {petId,area,intent,introduction}=profile
  busy.value=true
  try {
    await api('/h5/my-matches/'+petId,{method:remove?'DELETE':'PUT',body:remove?{}:{area,intent,introduction}})
    profileOpen.value=false
    await load()
    ElMessage.success(remove?'交友档案已撤下':'交友档案已公开')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'交友档案保存失败')}
  finally {busy.value=false}
}
function openInvite(match:H5Match) {
  if(!gate()) return
  sourcePet.value=preferred();target.value=match;inviteOpen.value=true
}
async function invite() {
  if (!props.user||!target.value||!sourcePet.value||busy.value) return
  busy.value=true
  try {
    const {request}=await api<{request:H5FriendRequest}>('/h5/friend-requests',{method:'POST',
      body:{sourcePetId:sourcePet.value,targetPetId:target.value.petId}})
    inviteOpen.value=false;await load();ElMessage.success('邀请状态 '+requestNames[request.status])
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'邀请发送失败')}
  finally {busy.value=false}
}
async function respond(id:string,status:'accepted'|'declined') {
  if (busy.value) return
  busy.value=true
  try {await api('/h5/friend-requests/'+id,{method:'PATCH',body:{status}});await load()}
  catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'邀请处理失败')}
  finally {busy.value=false}
}
async function seeCreator(id:string) {
  try {creator.value=await api<NonNullable<typeof creator.value>>('/h5/creators/'+id);creatorOpen.value=true}
  catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'达人主页读取失败')}
}
async function refreshChat(item:Listing) {
  try {
    const result=await api<{messages:H5Comment[]}>('/h5/groups/'+item.id+'/messages')
    if (group.value?.id===item.id && groupOpen.value) {messages.value=result.messages;chatError.value=''}
  } catch(cause) {
    if (group.value?.id===item.id && groupOpen.value) chatError.value=cause instanceof Error?cause.message:'聊天读取失败'
  }
}
async function enterGroup(item:Listing) {
  if (!props.user) {emit('login');return}
  if (busy.value) return
  busy.value=true
  try {
    if(!joined.value.includes(item.id)) {
      await api('/h5/catalog/'+item.id+'/participation',{method:'POST',body:{}})
      joined.value=[...joined.value,item.id]
    }
    group.value=item;groupOpen.value=true;messages.value=[];message.value='';chatError.value=''
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'社群加入失败')}
  finally {busy.value=false}
}
watch(groupOpen,(open,_previous,cleanup)=>{
  const item=group.value
  if(!open||!item) return
  void refreshChat(item)
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!busy.value) void refreshChat(item)},6500)
  cleanup(()=>clearInterval(timer))
})
async function send() {
  const item=group.value
  if (!item||!props.user||!message.value.trim()||busy.value) return
  busy.value=true
  try {
    await api('/h5/groups/'+item.id+'/messages',{method:'POST',body:{body:message.value}})
    if (group.value?.id===item.id) message.value=''
    await refreshChat(item)
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'发言未送达')}
  finally {busy.value=false}
}
</script>

<template>
  <div class="h5-page-content h5-page-content--top h5-program-stack h5-friends">
    <nav class="h5-card h5-friend-tabs" aria-label="交友栏目">
      <button v-for="section in sections" :key="section.id" type="button" :aria-pressed="modelValue===section.id"
        @click="emit('update:modelValue',section.id)">{{ section.title }}</button>
    </nav>
    <div v-if="error" class="h5-empty h5-card" role="status">{{ error }}<button class="h5-text-button" type="button" @click="load">重新加载</button></div>
    <div v-else-if="loading" class="h5-empty h5-card" role="status">正在读取…</div>
    <template v-else-if="modelValue==='matches'">
      <div class="h5-business-toolbar"><button type="button" class="h5-text-button" @click="emit('chooseArea')"><el-icon><Compass /></el-icon>{{ areaLabel(area)||'筛选商圈' }}</button><button type="button" class="h5-small-primary" @click="editProfile">管理交友档案</button></div>
      <form class="h5-card h5-program-card h5-form" @submit.prevent="load">
        <div class="h5-form-grid">
          <label>交友类型<select v-model="filters.intent"><option value="">全部</option><option value="friends">找玩伴</option><option value="dating">宠物相亲</option></select></label>
          <label>种类<select v-model="filters.species"><option value="">全部</option><option v-for="(label,id) in speciesNames" :key="id" :value="id">{{ label }}</option></select></label>
          <label>品种<input v-model="filters.breed" maxlength="60" placeholder="例如 布偶猫"></label>
          <label>年龄<select v-model="filters.stage"><option value="">不限</option><option value="juvenile">1 岁以内</option><option value="adult">1 到 6 岁</option><option value="senior">7 岁及以上</option></select></label>
          <label>性别<select v-model="filters.gender"><option value="">不限</option><option value="female">母</option><option value="male">公</option></select></label>
          <button class="h5-primary" type="submit">筛选</button>
        </div>
      </form>
      <article v-for="pet in matches" :key="pet.petId" class="h5-card h5-program-card">
        <div class="h5-event-heading"><strong>{{ pet.petName }}</strong><span class="h5-pill">{{ intentNames[pet.intent] }}</span></div>
        <p class="h5-muted">{{ [pet.breed||speciesNames[pet.species],areaLabel(pet.area),pet.ageMonths===null?'':pet.ageMonths+' 个月',pet.gender==='female'?'母':pet.gender==='male'?'公':''].filter(Boolean).join(' · ') }}</p>
        <p v-if="pet.introduction" class="h5-listing-description">{{ pet.introduction }}</p>
        <button v-if="!myPetIds.has(pet.petId)" class="h5-text-button" type="button" @click="openInvite(pet)">发出邀请</button>
      </article>
      <div v-if="!matches.length" class="h5-empty h5-card"><el-icon><UserFilled /></el-icon><strong>暂无符合条件的宠物</strong></div>
      <section v-if="user" class="h5-card h5-program-card">
        <h2>我的邀请</h2>
        <p v-if="!requests.length" class="h5-muted">还没有邀请</p>
        <div v-else class="h5-record-list">
          <article v-for="item in requests" :key="item.id" class="h5-record">
            <div><strong>{{ item.sourceName }} → {{ item.targetName }}</strong><span class="h5-pill">{{ requestNames[item.status] }}</span></div>
            <div v-if="item.incoming&&item.status==='pending'" class="h5-business-actions">
              <button class="h5-small-primary" type="button" :disabled="busy" @click="respond(item.id,'accepted')">接受</button>
              <button class="h5-text-button" type="button" :disabled="busy" @click="respond(item.id,'declined')">拒绝</button>
            </div>
          </article>
        </div>
      </section>
    </template>
    <template v-else-if="modelValue==='creators'">
      <button v-for="person in creators" :key="person.id" type="button" class="h5-event-link h5-card h5-program-card" @click="seeCreator(person.id)">
        <span class="h5-event-heading"><strong>{{ person.name }}</strong><span v-if="person.featured" class="h5-pill">推荐达人</span></span>
        <span v-if="person.bio" class="h5-listing-summary">{{ person.bio }}</span><span class="h5-muted">{{ person.postCount }} 条动态</span>
      </button>
      <div v-if="!creators.length" class="h5-card h5-empty"><el-icon><UserFilled /></el-icon><strong>暂无已发布的达人主页</strong></div>
    </template>
    <template v-else-if="modelValue==='groups'">
      <article v-for="item in groups" :key="item.id" class="h5-card h5-program-card">
        <h2>{{ item.title }}</h2><p class="h5-listing-description">{{ item.description }}</p>
        <button type="button" class="h5-small-primary" :disabled="busy" @click="enterGroup(item)">{{ joined.includes(item.id)?'打开聊天':'加入社群' }}</button>
      </article>
      <div v-if="!groups.length" class="h5-card h5-empty"><el-icon><ChatDotRound /></el-icon><strong>暂无开放社群</strong></div>
    </template>
    <template v-else-if="modelValue==='tasks'">
      <div v-if="!user" class="h5-card h5-empty"><el-icon><Trophy /></el-icon><strong>登录后查看互动进度</strong><button class="h5-primary" type="button" @click="emit('login')">登录</button></div>
      <div v-else class="h5-card h5-program-card h5-record-list">
        <div class="h5-record"><div><strong>发布一条动态</strong><span class="h5-pill">{{ progress.posts?'已完成':'待完成' }}</span></div><button class="h5-text-button" type="button" @click="emit('publish')">发布动态</button></div>
        <div class="h5-record"><div><strong>参与一次评论</strong><span class="h5-pill">{{ progress.comments?'已完成':'待完成' }}</span></div><button class="h5-text-button" type="button" @click="emit('update:modelValue','feed')">查看动态</button></div>
        <div class="h5-record"><div><strong>加入一个社群</strong><span class="h5-pill">{{ progress.groups?'已完成':'待完成' }}</span></div><button class="h5-text-button" type="button" @click="emit('update:modelValue','groups')">查看社群</button></div>
      </div>
    </template>

    <el-dialog v-model="profileOpen" title="交友档案" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <form class="h5-form" @submit.prevent="saveProfile()">
        <label>宠物<select v-model="profile.petId" required @change="fillProfile"><option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label>
        <label>公开商圈<select v-model="profile.area" required><option value="" disabled>请选择商圈</option><option v-for="item in h5Areas" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        <label>交友意向<select v-model="profile.intent"><option v-for="(label,id) in intentNames" :key="id" :value="id">{{ label }}</option></select></label>
        <label>介绍<textarea v-model.trim="profile.introduction" rows="3" maxlength="300" /></label>
        <label class="h5-check"><input v-model="profile.consent" type="checkbox" required> 同意公开宠物资料、交友介绍和所选商圈</label>
        <button class="h5-primary" type="submit" :disabled="busy">公开档案</button>
        <button v-if="activeProfile" class="h5-text-button" type="button" :disabled="busy" @click="saveProfile(true)">撤下匹配资料</button>
      </form>
    </el-dialog>
    <el-dialog v-model="inviteOpen" :title="'邀请 '+(target?.petName??'')" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <form class="h5-form" @submit.prevent="invite"><label>代表哪只宠物<select v-model="sourcePet" required><option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label><button class="h5-primary" type="submit" :disabled="busy">发送邀请</button></form>
    </el-dialog>
    <el-dialog v-model="creatorOpen" :title="creator?.creator.name" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <div v-if="creator" class="h5-program-stack">
        <p v-if="creator.creator.bio" class="h5-listing-description">{{ creator.creator.bio }}</p>
        <div v-if="creator.posts.length" class="h5-simple-list"><button v-for="post in creator.posts" :key="post.id" type="button" @click="creatorOpen=false;emit('post',post.id)">{{ post.title }}</button></div>
        <p v-else class="h5-muted">暂无公开动态</p>
      </div>
    </el-dialog>
    <el-dialog v-model="groupOpen" :title="group?.title" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <div class="h5-program-stack">
        <p v-if="chatError" role="status" class="h5-muted">{{ chatError }}</p>
        <div class="h5-record-list h5-chat" aria-label="社群消息">
          <p v-if="!messages.length&&!chatError" class="h5-muted">还没有消息</p>
          <article v-for="entry in messages" :key="entry.id" class="h5-record"><div><strong>{{ entry.author }}</strong><small>{{ localDateTime(entry.createdAt) }}</small></div><p>{{ entry.body }}</p></article>
        </div>
        <form class="h5-form" @submit.prevent="send"><label>消息<textarea v-model.trim="message" rows="2" maxlength="500" required /></label><button class="h5-primary" type="submit" :disabled="busy||!message.trim()">发送</button></form>
      </div>
    </el-dialog>
  </div>
</template>

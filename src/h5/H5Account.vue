<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, Calendar, ChatDotRound, Collection, Film, Headset, List, Plus, Reading, Setting, Star, Sunny, Trophy, UserFilled, Wallet } from '@element-plus/icons-vue'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { productFor, type Product } from './catalog'
import type { AccountPanel, RecordsPanel, StorySummary } from './business'
import H5AccountRecords from './H5AccountRecords.vue'
import H5Operations from './H5Operations.vue'
import type { Shopping } from './shopping'
import type { H5Post, H5Social } from './types'

const props=defineProps<{user:User|null; petCount:number; shopping:Shopping; social:H5Social; catalog:readonly Product[];
  request:{panel:AccountPanel}|null}>()
const emit=defineEmits<{login:[];cloud:[];create:[];post:[H5Post];product:[string];story:[string|null];creator:[string];
  refreshCatalog:[];operationChanged:[];updated:[User];logout:[]}>()
const entries=[{id:'published',title:'我的发布',icon:ChatDotRound},{id:'favorites',title:'收藏',icon:Star},
  {id:'orders',title:'订单与售后',icon:List},{id:'appointments',title:'预约记录',icon:Calendar},
  {id:'assets',title:'资产中心',icon:Wallet},{id:'ip',title:'我的 IP',icon:Film},
  {id:'learning',title:'我的课程',icon:Reading},{id:'creator',title:'达人权益',icon:Trophy},
  {id:'charity',title:'公益记录',icon:Sunny},{id:'help',title:'帮助与客服',icon:Headset},{id:'settings',title:'账号与隐私',icon:Setting}] as const
const panel=ref<AccountPanel>('published')
const open=ref(false)
const displayName=ref('')
const currentPassword=ref('')
const newPassword=ref('')
const saving=ref(false)
const favorites=computed(()=>props.shopping.state.favorites.flatMap(id=>{const product=productFor(id,props.catalog);return product?[product]:[]}))
const storyFavorites=ref<StorySummary[]>([])
const recordsPanels=new Set<AccountPanel>(['orders','appointments','learning','charity','assets','ip','creator'])
const recordsPanel=computed(()=>recordsPanels.has(panel.value)?panel.value as RecordsPanel:null)
const operator=ref(false)
const operationsOpen=ref(false)

function show(id:AccountPanel) {
  if (!props.user && id!=='help' && id!=='favorites') {emit('login');return}
  panel.value=id;displayName.value=props.user?.displayName??'';currentPassword.value='';newPassword.value='';open.value=true
  if (id==='favorites'&&props.user) {
    const owner=props.user.id
    void api<{favorites:StorySummary[]}>('/h5/my-story-reactions').then(result=>{
      if (props.user?.id===owner) storyFavorites.value=result.favorites
    }).catch(error=>ElMessage.error(error instanceof Error?error.message:'剧本收藏读取失败'))
  }
}
watch(()=>props.user?.id,owner=>{
  open.value=false;storyFavorites.value=[];operator.value=false;operationsOpen.value=false
  if (!owner) return
  void api<{allowed:boolean}>('/h5/operations/access').then(result=>{
    if(props.user?.id===owner) operator.value=result.allowed
  }).catch(()=>{})
},{immediate:true})
watch(()=>props.request,request=>{if(request) show(request.panel)},{immediate:true})

async function updateName() {
  if(saving.value)return
  saving.value=true
  try {
    const {user}=await api<{user:User}>('/auth/profile',{method:'PATCH',body:{displayName:displayName.value}})
    emit('updated',user);ElMessage.success('昵称已更新')
  } catch(error){ElMessage.error(error instanceof Error?error.message:'保存失败')}
  finally{saving.value=false}
}

async function updatePassword() {
  if(saving.value)return
  saving.value=true
  try {
    await api('/auth/password',{method:'POST',body:{currentPassword:currentPassword.value,newPassword:newPassword.value}})
    open.value=false;emit('logout');ElMessage.success('密码已更新，请重新登录')
  } catch(error){ElMessage.error(error instanceof Error?error.message:'更新失败')}
  finally{saving.value=false;currentPassword.value='';newPassword.value=''}
}

async function logout() {
  if(saving.value)return
  saving.value=true
  try {await api('/auth/logout',{method:'POST',body:{}});open.value=false;emit('logout')}
  catch(error){ElMessage.error(error instanceof Error?error.message:'退出失败')}
  finally{saving.value=false}
}
</script>

<template>
  <div class="h5-account">
    <section class="h5-account-head">
      <span class="h5-account-avatar"><el-icon><UserFilled /></el-icon></span><div><h1>{{ user?.displayName || '欢迎来到云上空间' }}</h1><p>{{ user ? user.username : '登录后创建自己的宠物档案' }}</p></div>
      <button v-if="!user" class="h5-primary" type="button" @click="emit('login')">登录 / 注册</button><button v-else class="h5-text-button" type="button" @click="show('settings')">账号设置</button>
    </section>
    <div class="h5-account-archives h5-card">
      <button class="h5-account-pets" type="button" @click="emit('cloud')">
        <el-icon aria-hidden="true"><Collection /></el-icon><span>我的宠物档案 <strong>{{ petCount }}</strong> 只</span>
        <el-icon aria-hidden="true"><ArrowRight /></el-icon>
      </button>
      <button class="h5-text-button h5-account-pets-add" type="button" aria-label="新建宠物档案" @click="emit('create')">
        <el-icon aria-hidden="true"><Plus /></el-icon>新建
      </button>
    </div>
    <section class="h5-account-links h5-card">
      <button v-for="item in entries" :key="item.id" type="button" @click="show(item.id)"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span><el-icon><ArrowRight /></el-icon></button>
      <button v-if="operator" type="button" @click="operationsOpen=true"><el-icon><Setting /></el-icon><span>业务管理</span><el-icon><ArrowRight /></el-icon></button>
    </section>

    <el-dialog v-model="open" :title="entries.find(item=>item.id===panel)?.title" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <section v-if="panel==='published' || panel==='favorites'" class="h5-account-lists">
        <div v-if="(panel==='published'?social.published:social.favorites).length" class="h5-simple-list">
          <button v-for="post in panel==='published'?social.published:social.favorites" :key="post.id" type="button" @click="open=false;emit('post',post)"><span><strong>{{ post.title }}</strong><small>{{ post.petName }} · {{ post.hidden?'已隐藏':'宠物动态' }}</small></span><el-icon><ArrowRight /></el-icon></button>
        </div>
        <div v-if="panel==='favorites' && favorites.length" class="h5-simple-list"><button v-for="product in favorites" :key="product.id" type="button" @click="open=false;emit('product',product.name)"><span><strong>{{ product.name }}</strong><small>{{ product.merchant }}</small></span><el-icon><ArrowRight /></el-icon></button></div>
        <div v-if="panel==='favorites' && storyFavorites.length" class="h5-simple-list"><button v-for="story in storyFavorites" :key="story.id" type="button" @click="open=false;emit('story',story.id)"><span><strong>{{ story.title }}</strong><small>{{ story.petName }} · 短剧作品</small></span><el-icon><ArrowRight /></el-icon></button></div>
        <p v-if="panel==='published' ? !social.published.length : !social.favorites.length && !favorites.length && !storyFavorites.length" class="h5-dialog-empty">{{ panel==='published'?'还没有发布动态':'还没有收藏' }}</p>
      </section>
      <H5AccountRecords v-else-if="recordsPanel&&user" :key="user.id+recordsPanel" :panel="recordsPanel" :shopping="shopping" :catalog="catalog"
        @refresh-catalog="emit('refreshCatalog')" @story="open=false;emit('story',$event)" @creator="open=false;emit('creator',$event)" />
      <div v-else-if="panel==='help'" class="h5-help"><h3>购物和售后</h3><p>平台订单可在「订单与售后」查询，商家外链的订单由商家处理。</p><h3>宠物资料</h3><p>上传的照片、健康记录和纪念馆默认仅账号内可见。公开动态、交友档案和短剧由你确认发布。</p></div>
      <div v-else class="h5-settings">
        <form class="h5-form" @submit.prevent="updateName"><label>显示昵称<input v-model.trim="displayName" maxlength="40" required></label><button class="h5-primary" type="submit" :disabled="saving">保存昵称</button></form>
        <form class="h5-form" @submit.prevent="updatePassword"><label>当前密码<input v-model="currentPassword" type="password" autocomplete="current-password" required></label><label>新密码<input v-model="newPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><button class="h5-secondary" type="submit" :disabled="saving">更新密码</button></form>
        <button class="h5-text-button" type="button" :disabled="saving" @click="logout">退出登录</button>
      </div>
    </el-dialog>
    <el-dialog v-model="operationsOpen" title="业务管理" class="h5-dialog" width="min(490px,92vw)" append-to-body destroy-on-close>
      <H5Operations v-if="operator" @changed="emit('operationChanged')" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Sunny } from '@element-plus/icons-vue'
import AssetImage from '../components/AssetImage.vue'
import { api } from '../lib/api'
import type { Asset, Pet, User } from '../lib/types'
import { localDateTime, type PetRecords, type Tribute } from './business'

const props = defineProps<{user:User|null; pets:Pet[]; preferredPetId:string}>()
const emit = defineEmits<{login:[]; create:[]; changed:[]}>()
const petId = ref('')
const records = ref<PetRecords|null>(null)
const photos = ref<Asset[]>([])
const form = reactive({title:'',remembrance:'',coverAssetId:null as string|null})
const writing = ref(false)
const message = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let revision = 0
const memorial = computed(()=>records.value?.memorial)
const activityNames: Record<Tribute['kind'],string> = {candle:'点亮了一盏烛光',tribute:'留下了一次纪念',message:'写下了一条留言'}

watch(()=>[props.user?.id,props.pets,props.preferredPetId] as const,()=>{
  if (!props.user) {petId.value='';return}
  if (props.pets.some(pet=>pet.id===petId.value)) return
  petId.value=props.pets.find(pet=>pet.id===props.preferredPetId)?.id ?? props.pets[0]?.id ?? ''
},{immediate:true})
watch(petId,()=>{
  writing.value=false;message.value='';records.value=null;photos.value=[]
  void load()
},{immediate:true})

async function load() {
  const version=++revision
  const id=petId.value
  error.value='';loading.value=!!id
  if (!id || !props.user) return
  try {
    const [archive,media]=await Promise.all([
      api<PetRecords>('/h5/pet-records/'+id), api<{assets:Asset[]}>('/assets?kind=photo&petId='+id),
    ])
    if (version!==revision) return
    records.value=archive;photos.value=media.assets
  } catch(cause) {if (version===revision) error.value=cause instanceof Error?cause.message:'纪念馆读取失败'}
  finally {if (version===revision) loading.value=false}
}
function edit() {
  form.title=memorial.value?.title ?? (props.pets.find(pet=>pet.id===petId.value)?.name ?? '')+'的纪念馆'
  form.remembrance=memorial.value?.remembrance ?? ''
  form.coverAssetId=memorial.value?.coverAssetId ?? null
  writing.value=true
}
async function save() {
  const id=petId.value
  if (!id || busy.value) return
  busy.value=true
  try {
    await api('/h5/pet-records/'+id+'/memorial',{method:'PUT',body:{...form}})
    if (petId.value===id) {writing.value=false;await load();emit('changed')}
    ElMessage.success('纪念馆已保存')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'保存失败')}
  finally {busy.value=false}
}
async function remember(kind:Tribute['kind']) {
  const id=petId.value
  if (!id || busy.value || (kind==='message'&&!message.value.trim())) return
  busy.value=true
  try {
    await api('/h5/pet-records/'+id+'/memorial/tributes',{method:'POST',body:{kind,body:kind==='message'?message.value:''}})
    if (petId.value===id) {message.value='';await load();emit('changed')}
    ElMessage.success('已留下纪念')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'纪念记录保存失败')}
  finally {busy.value=false}
}
</script>

<template>
  <div class="h5-program-stack">
    <div v-if="!user" class="h5-empty">
      <strong>登录后管理自己的纪念馆</strong><button class="h5-primary" type="button" @click="emit('login')">登录</button>
    </div>
    <div v-else-if="!pets.length" class="h5-empty">
      <strong>先为爱宠建立专属档案</strong><button class="h5-primary" type="button" @click="emit('create')">创建宠物档案</button>
    </div>
    <template v-else>
      <div class="h5-form"><label>选择宠物<select v-model="petId" :disabled="busy"><option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label></div>
      <p v-if="error" class="h5-muted" role="status">{{ error }} <button class="h5-text-button" type="button" @click="load">重新加载</button></p>
      <p v-else-if="loading" class="h5-muted" role="status">正在读取纪念馆…</p>
      <form v-else-if="writing" class="h5-form" @submit.prevent="save">
        <label>名称<input v-model.trim="form.title" maxlength="100" required></label>
        <label>回忆<textarea v-model="form.remembrance" rows="4" maxlength="3000" /></label>
        <label>纪念封面<select v-model="form.coverAssetId"><option :value="null">使用纯色封面</option><option v-for="photo in photos" :key="photo.id" :value="photo.id">{{ photo.name }}</option></select></label>
        <div class="h5-button-row"><button class="h5-secondary" type="button" @click="writing=false">取消</button><button class="h5-primary" type="submit" :disabled="busy">保存纪念馆</button></div>
      </form>
      <div v-else-if="!memorial" class="h5-empty">
        <el-icon><Sunny /></el-icon><strong>为爱宠留一份回忆</strong><button class="h5-primary" type="button" @click="edit">创建私密纪念馆</button>
      </div>
      <template v-else>
        <div class="h5-memorial-cover">
          <AssetImage v-if="memorial.coverAssetId" :id="memorial.coverAssetId" :alt="memorial.title" />
          <div><strong>{{ memorial.title }}</strong><span class="h5-pill">仅自己可见</span></div>
        </div>
        <p v-if="memorial.remembrance" class="h5-listing-description">{{ memorial.remembrance }}</p>
        <div class="h5-business-actions">
          <button class="h5-small-primary" type="button" :disabled="busy" @click="remember('candle')">点烛</button>
          <button class="h5-secondary" type="button" :disabled="busy" @click="remember('tribute')">线上纪念</button>
          <button class="h5-text-button" type="button" @click="edit">编辑纪念馆</button>
        </div>
        <div v-if="photos.length"><h3 class="h5-small-heading">纪念相册</h3><div class="h5-memorial-photos"><AssetImage v-for="photo in photos.slice(0,9)" :key="photo.id" :id="photo.id" :alt="photo.name" /></div></div>
        <form class="h5-form" @submit.prevent="remember('message')">
          <label>纪念留言<textarea v-model.trim="message" rows="2" maxlength="500" required /></label>
          <button class="h5-secondary" type="submit" :disabled="busy || !message.trim()">保存留言</button>
        </form>
        <div v-if="records?.tributes.length" class="h5-record-list">
          <div v-for="entry in records.tributes" :key="entry.id" class="h5-record">
            <div><strong>{{ activityNames[entry.kind] }}</strong><small>{{ localDateTime(entry.createdAt) }}</small></div>
            <p v-if="entry.body">{{ entry.body }}</p>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

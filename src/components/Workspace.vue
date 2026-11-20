<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { House, CollectionTag, Picture, MagicStick, Setting, FolderOpened, Plus, UploadFilled, ArrowRight } from '@element-plus/icons-vue'
import { api, fileData, imageUrl } from '../lib/api'
import { catClips, catKeyActions, type CatClipId, type CatKeyAction } from '../../shared/cat-motion.mjs'
import type { User, Pet, Asset, Memory, Dashboard, Action } from '../lib/types'
import AssetImage from './AssetImage.vue'
import CatMotionStudio from './CatMotionStudio.vue'
const props = defineProps<{ user: User; initialSection?: string }>()
const emit = defineEmits<{ 'user-update': [User]; logout: [] }>()
const section = ref(props.initialSection || 'overview'), busy = ref(false), loading = ref(true), error = ref('')
const pets = ref<Pet[]>([]), assets = ref<Asset[]>([]), memories = ref<Memory[]>([])
const selectedPet = ref(''), search = ref(''), assetKind = ref('all')
const dashboard = ref<Dashboard>({ stats: { pets:0,assets:0,sprites:0,storageBytes:0,memories:0 }, generationEnabled:false, model:'' })
const nav = [
  {id:'overview',label:'工作台首页',icon:House}, {id:'pets',label:'宠物档案',icon:CollectionTag},
  {id:'assets',label:'宠物资产',icon:FolderOpened}, {id:'creation',label:'动作素材',icon:MagicStick},
  {id:'memories',label:'成长记忆',icon:Picture}, {id:'settings',label:'账号设置',icon:Setting},
]
const usesPetSelector = computed(()=>['assets','creation','memories'].includes(section.value))
const actionLabels: Partial<Record<Action,string>> = { idle:'站立呼吸', happy:'开心互动', walk:'轻快行走', sleep:'安心睡觉' }
function assetLabel(asset: Asset) {
  return asset.action ? actionLabels[asset.action] ?? catClips[asset.action as CatClipId]?.label ?? asset.name : '宠物照片'
}
function isTransition(asset: Asset) {
  return !!asset.action && Object.prototype.hasOwnProperty.call(catClips,asset.action) && !catKeyActions.includes(asset.action as CatKeyAction)
}
const currentPet = computed(()=>pets.value.find(p=>p.id===selectedPet.value))
const petAssets = computed(()=>assets.value.filter(a=>a.petId===selectedPet.value))
const photos = computed(()=>petAssets.value.filter(a=>a.kind==='photo'))
const visibleAssets = computed(()=>petAssets.value.filter(a=>!isTransition(a)&&(assetKind.value==='all'||a.kind===assetKind.value)&&a.name.toLowerCase().includes(search.value.toLowerCase())))
const petMemories = computed(()=>memories.value.filter(m=>m.petId===selectedPet.value))
/* AI 队列暂停，保留工作台获取和轮询任务的逻辑。
import type { Job } from '../lib/types'
const jobs = ref<Job[]>([])
const currentJobs = computed(()=>jobs.value.filter(j=>j.petId===selectedPet.value))
const activeJob = computed(()=>jobs.value.find(j=>j.status==='queued'||j.status==='running'))
let interval: ReturnType<typeof setInterval> | undefined
let polling = false
onMounted(()=>{
  interval=setInterval(async()=>{
    if(polling||!activeJob.value)return
    polling=true
    try {
      const {jobs:next}=await api<{jobs:Job[]}>('/jobs')
      const old=activeJob.value;jobs.value=next
      if(old&&next.find(j=>j.id===old.id)?.status!==old.status&&!next.some(j=>j.id===old.id&&['queued','running'].includes(j.status)))await load()
      else if(old&&next.find(j=>j.id===old.id)?.completed!==old.completed)assets.value=(await api<{assets:Asset[]}>('/assets')).assets
    }catch(e){error.value=message(e)}finally{polling=false}
  },4000)
})
onBeforeUnmount(()=>clearInterval(interval))
*/
const uploadInput = ref<HTMLInputElement>(), uploading = ref(false)
const petDialog = ref(false), editingPet = ref('')
const blankPet = () => ({name:'',species:'dog' as Pet['species'],breed:'',birthday:null as string|null,gender:'unknown' as Pet['gender'],notes:'',avatarAssetId:null as string|null})
const petForm = reactive(blankPet())
const memoryDialog = ref(false)
const memoryForm = reactive({title:'',content:'',happenedOn:new Date().toLocaleDateString('en-CA'),assetId:null as string|null})
const displayName = ref(props.user.displayName), currentPassword = ref(''), newPassword = ref(''), confirmPassword = ref('')
let destroyed = false
const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请稍后重试'
function petLabel(id: string) { return pets.value.find(p=>p.id===id)?.name || '宠物' }
function bytes(value: number) { return value >= 1048576 ? `${(value/1048576).toFixed(1)} MB` : `${Math.ceil(value/1024)} KB` }
async function load() {
  const [p,a,m,summary] = await Promise.all([
    api<{pets:Pet[]}>('/pets'),api<{assets:Asset[]}>('/assets'),
    api<{memories:Memory[]}>('/memories'),api<Dashboard>('/dashboard'),
  ])
  // const activity=summary.generationEnabled ? (await api<{jobs:Job[]}>('/jobs')).jobs : []
  if(destroyed)return
  // jobs.value=activity
  pets.value=p.pets;assets.value=a.assets;memories.value=m.memories;dashboard.value=summary
  if(!pets.value.some(p=>p.id===selectedPet.value))selectedPet.value=pets.value[0]?.id||''
  error.value=''
}
async function refresh() { loading.value=true;try{await load()}catch(e){error.value=message(e)}finally{loading.value=false} }
async function run(work:()=>Promise<void>) {
  if(busy.value)return;busy.value=true;error.value=''
  try{await work()}catch(e){error.value=message(e);ElMessage.error(error.value)}finally{busy.value=false}
}
async function confirmDelete(label: string, work:()=>Promise<void>) {
  try{await ElMessageBox.confirm(label,'确认删除',{confirmButtonText:'删除',cancelButtonText:'取消',type:'warning'})}catch{return}
  await run(work)
}
function openPet(pet?:Pet) { editingPet.value=pet?.id||'';Object.assign(petForm,pet||blankPet());petDialog.value=true }
async function savePet() {
  await run(async()=>{
    const result = await api<{pet:Pet}>(editingPet.value?`/pets/${editingPet.value}`:'/pets',{method:editingPet.value?'PATCH':'POST',body:petForm})
    selectedPet.value=result.pet.id;await load();petDialog.value=false;ElMessage.success('宠物档案已保存')
  })
}
async function deletePet(pet:Pet) { await confirmDelete(`删除「${pet.name}」及其全部素材、生成记录和成长记忆？`,async()=>{await api(`/pets/${pet.id}`,{method:'DELETE',body:{}});await load()}) }
async function upload(event:Event) {
  const input=event.target as HTMLInputElement,file=input.files?.[0],petId=selectedPet.value;if(!file||!petId)return
  uploading.value=true
  try {
    const image=await fileData(file)
    await api('/assets',{method:'POST',body:{petId,name:file.name.slice(0,150),image}})
    await load();ElMessage.success('照片已保存到宠物资产')
  } catch(e){ElMessage.error(message(e))}finally{uploading.value=false;input.value=''}
}
async function deleteAsset(asset:Asset) { await confirmDelete(`删除「${asset.name}」？关联的记忆图片会解除绑定。`,async()=>{await api(`/assets/${asset.id}`,{method:'DELETE',body:{}});await load()}) }
async function renameAsset(asset:Asset) {
  let value:string
  try{value=(await ElMessageBox.prompt('请输入素材名称','重命名',{inputValue:asset.name,inputValidator:v=>Boolean(v?.trim())&&v.length<=150,confirmButtonText:'保存',cancelButtonText:'取消'})).value}catch{return}
  await run(async()=>{await api(`/assets/${asset.id}`,{method:'PATCH',body:{name:value}});await load()})
}
async function setCover(asset:Asset) {
  const pet=pets.value.find(p=>p.id===asset.petId);if(!pet)return
  await run(async()=>{await api(`/pets/${pet.id}`,{method:'PATCH',body:{...pet,avatarAssetId:asset.id}});await load();ElMessage.success('已设置宠物封面')})
}
async function download(asset:Asset) {
  try{const url=await imageUrl(asset.id);const link=document.createElement('a');link.href=url;link.download=`${asset.name}.png`;link.click();if(url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){ElMessage.error(message(e))}
}
function openMemory() { Object.assign(memoryForm,{title:'',content:'',happenedOn:new Date().toLocaleDateString('en-CA'),assetId:null});memoryDialog.value=true }
async function saveMemory() {
  await run(async()=>{await api('/memories',{method:'POST',body:{...memoryForm,petId:selectedPet.value}});await load();memoryDialog.value=false;ElMessage.success('记忆已珍藏')})
}
async function updateName() { await run(async()=>{const {user}=await api<{user:User}>('/auth/profile',{method:'PATCH',body:{displayName:displayName.value}});emit('user-update',user);ElMessage.success('昵称已更新')}) }
async function updatePassword() {
  if(newPassword.value!==confirmPassword.value){ElMessage.error('两次输入的新密码不一致');return}
  await run(async()=>{await api('/auth/password',{method:'POST',body:{currentPassword:currentPassword.value,newPassword:newPassword.value}});ElMessage.success('密码已修改，请重新登录');emit('logout')})
}
watch(selectedPet,()=>{search.value='';assetKind.value='all'})
onMounted(refresh)
onBeforeUnmount(()=>{destroyed=true})
</script>

<template>
  <section class="workspace" v-loading="loading">
    <aside class="workspace-sidebar">
      <div class="workspace-profile"><span class="workspace-avatar">{{ user.displayName.slice(0,1).toUpperCase() }}</span><span><strong>{{ user.displayName }}</strong><small>{{ user.username }} · 个人云空间</small></span></div>
      <nav class="workspace-nav" aria-label="工作台导航"><button v-for="item in nav" :key="item.id" :class="{active:section===item.id}" @click="section=item.id"><el-icon><component :is="item.icon" /></el-icon>{{ item.label }}</button></nav>
      <div class="workspace-sidebar-note"><span>每一份陪伴<br />都有专属的记忆空间</span></div>
    </aside>
    <div class="workspace-main">
      <input ref="uploadInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="upload" />
      <h1 class="visually-hidden">{{ nav.find(item=>item.id===section)?.label }}</h1>
      <el-alert v-if="error" :title="error" type="error" show-icon class="workspace-alert" @close="error=''" />
      <div class="workspace-toolbar">
        <div v-if="usesPetSelector && pets.length" class="workspace-pet-selection">
          <label for="pet-select">当前宠物</label>
          <el-select id="pet-select" v-model="selectedPet" aria-label="当前宠物" style="width:180px">
            <el-option v-for="pet in pets" :key="pet.id" :label="pet.name" :value="pet.id" />
          </el-select>
          <span v-if="currentPet?.breed">{{ currentPet.breed }}</span>
        </div>
        <div class="workspace-toolbar-actions">
          <el-button v-if="pets.length && section==='assets'" class="workspace-add-button" :loading="uploading" @click="uploadInput?.click()"><el-icon><UploadFilled /></el-icon>上传照片</el-button>
          <el-button v-if="pets.length && section==='memories'" class="workspace-add-button" @click="openMemory">记录新记忆</el-button>
          <el-button class="workspace-add-button" @click="openPet()"><el-icon><Plus /></el-icon>添加宠物</el-button>
        </div>
      </div>
      <div v-if="!loading && !pets.length && !['settings','overview'].includes(section)" class="workspace-box empty-state"><span>🐾</span><h2>先为爱宠创建一个档案</h2><p>照片、动作和成长记忆，都会收进它的专属空间。</p><el-button class="workspace-add-button" @click="openPet()">创建宠物档案</el-button></div>
      <template v-else>
        <template v-if="section==='overview'">
          <div class="workspace-stats">
            <article class="workspace-stat-card"><span class="workspace-stat-icon"><el-icon><CollectionTag /></el-icon></span><span><small>我的宠物</small><strong>{{ dashboard.stats.pets }} <i>只</i></strong></span><span class="stat-foot">每一位都是家人</span></article>
            <article class="workspace-stat-card"><span class="workspace-stat-icon"><el-icon><FolderOpened /></el-icon></span><span><small>专属资产</small><strong>{{ dashboard.stats.assets }} <i>份</i></strong></span><span class="stat-foot">照片与动作素材</span></article>
            <article class="workspace-stat-card"><span class="workspace-stat-icon"><el-icon><MagicStick /></el-icon></span><span><small>动作素材</small><strong>{{ dashboard.stats.sprites }} <i>组</i></strong></span><span class="stat-foot">可在线预览和下载</span></article>
          </div>
          <div class="workspace-content-grid">
            <section class="workspace-box"><div class="workspace-box-heading"><div><h2>我的宠物</h2><p>选择一位伙伴，继续它的故事</p></div><button @click="section='pets'">管理档案 <el-icon><ArrowRight /></el-icon></button></div>
              <div v-if="!pets.length" class="empty-state compact"><span>🐾</span><p>还没有宠物档案</p><el-button @click="openPet()">添加第一只宠物</el-button></div>
              <div class="pet-list"><button v-for="pet in pets.slice(0,4)" :key="pet.id" class="pet-row" @click="selectedPet=pet.id;section='assets'"><AssetImage class="pet-avatar" :id="pet.avatarAssetId" :alt="pet.name" /><span class="pet-info"><strong>{{ pet.name }}</strong><small>{{ pet.breed || {dog:'狗狗',cat:'猫咪',other:'其他宠物'}[pet.species] }}</small></span><span class="pet-memory-count">{{ pet.assetCount }} 份素材</span><el-icon><ArrowRight /></el-icon></button></div>
            </section>
            <section class="workspace-box"><div class="workspace-box-heading"><div><h2>开始一段新的陪伴</h2><p>从一张真实照片开始</p></div></div>
              <button v-for="item in [{id:'assets',title:'上传宠物照片',desc:'保留真实的毛色与花纹',icon:UploadFilled},{id:'creation',title:'预览动作素材',desc:'坐姿、行走和日常小动作',icon:MagicStick}]" :key="item.id" class="quick-action" @click="section=item.id"><span class="quick-action-icon"><el-icon><component :is="item.icon" /></el-icon></span><span><strong>{{ item.title }}</strong><small>{{ item.desc }}</small></span><el-icon><ArrowRight /></el-icon></button>
            </section>
          </div>
          <section class="workspace-box"><div class="workspace-box-heading"><div><h2>成长记忆</h2><p>已珍藏 {{ dashboard.stats.memories }} 个时刻 · 已使用 {{ bytes(dashboard.stats.storageBytes) }} / 512 MB</p></div><button @click="section='memories'">查看记忆 <el-icon><ArrowRight /></el-icon></button></div><div v-if="!memories.length" class="empty-state compact"><p>记下一次散步、一个生日，或今天的小开心。</p></div><div v-for="memory in memories.slice(0,3)" :key="memory.id" class="memory-summary"><strong>{{ memory.title }}</strong><span>{{ petLabel(memory.petId) }} · {{ memory.happenedOn }}</span></div></section>
        </template>
        <section v-else-if="section==='pets'" class="workspace-box">
          <div class="workspace-box-heading"><div><h2>宠物档案</h2><p>档案、照片与动作素材按宠物分别保存</p></div></div>
          <div class="managed-pet-grid"><article v-for="pet in pets" :key="pet.id" class="managed-pet"><AssetImage :id="pet.avatarAssetId" :alt="pet.name" /><div class="managed-pet-copy"><h3>{{ pet.name }}</h3><p>{{ pet.breed || {dog:'狗狗',cat:'猫咪',other:'其他宠物'}[pet.species] }} · {{ pet.birthday || '生日待补充' }}</p><p>{{ pet.assetCount }} 份素材 · {{ pet.memoryCount }} 条记忆</p><div class="card-actions"><el-button size="small" @click="selectedPet=pet.id;section='assets'">管理资产</el-button><el-button size="small" @click="openPet(pet)">编辑</el-button><el-button size="small" text type="danger" @click="deletePet(pet)">删除</el-button></div></div></article></div>
        </section>
        <template v-else-if="usesPetSelector">
          <section v-if="section==='assets'" class="workspace-box">
            <div class="asset-filters"><el-radio-group v-model="assetKind"><el-radio-button value="all">全部</el-radio-button><el-radio-button value="photo">宠物照片</el-radio-button><el-radio-button value="sprite">动作素材</el-radio-button></el-radio-group><el-input v-model="search" placeholder="搜索素材名称" clearable style="max-width:240px" /></div>
            <div v-if="!visibleAssets.length" class="empty-state"><span>🖼️</span><h2>这里还没有素材</h2><p>上传 {{ currentPet?.name }} 的照片。</p><el-button @click="uploadInput?.click()" :loading="uploading">上传照片</el-button></div>
            <div class="asset-grid"><article v-for="asset in visibleAssets" :key="asset.id" class="asset-card"><div class="asset-thumbnail"><AssetImage :id="asset.id" :alt="asset.name" :frames="asset.frames" :columns="asset.columns" :rows="asset.rows" :fps="asset.fps" :image-version="asset.imageVersion" :width="asset.width" :height="asset.height" :animate="asset.kind==='sprite'" :playing="!asset.motionFromAssetId" :fit-content="!asset.motionFromAssetId" /><span class="asset-kind">{{ assetLabel(asset) }}</span></div><div class="asset-card-copy"><h3 :title="asset.name">{{ asset.name }}</h3><p>{{ asset.width }} × {{ asset.height }} · {{ bytes(asset.byteSize) }}</p><div class="card-actions"><button @click="download(asset)">下载</button><button @click="renameAsset(asset)">重命名</button><button v-if="asset.kind==='photo'" @click="setCover(asset)">设为封面</button><button class="danger" @click="deleteAsset(asset)">删除</button></div></div></article></div>
          </section>
          <template v-else-if="section==='creation'">
            <!-- AI 生成暂停，保留原工作台绑定。
            <CatMotionStudio v-if="selectedPet" :key="selectedPet" :pet-id="selectedPet"
              :generation-enabled="dashboard.generationEnabled" allow-download
              :photos="photos" :jobs="currentJobs" :active-job="Boolean(activeJob)"
              :include-jump="currentPet?.species==='cat'" :uploading="uploading"
              @upload-photo="uploadInput?.click()" @changed="refresh()" />
            -->
            <CatMotionStudio v-if="selectedPet" :key="selectedPet" :pet-id="selectedPet"
              :include-jump="currentPet?.species==='cat'" allow-download />
          </template>
          <section v-else class="workspace-box"><div v-if="!petMemories.length" class="empty-state"><span>✦</span><h2>给今天留一份记忆</h2><p>记录 {{ currentPet?.name }} 的成长，收藏每一个平凡又特别的日子。</p><el-button @click="openMemory">记录第一份记忆</el-button></div><div class="memory-grid"><article v-for="memory in petMemories" :key="memory.id" class="memory-card"><AssetImage v-if="memory.assetId" :id="memory.assetId" :alt="memory.title" /><div><time>{{ memory.happenedOn }}</time><h3>{{ memory.title }}</h3><p>{{ memory.content }}</p><el-button text type="danger" @click="confirmDelete('删除这条成长记忆？',async()=>{await api(`/memories/${memory.id}`,{method:'DELETE',body:{}});await load()})">删除记忆</el-button></div></article></div></section>
        </template>
        <section v-else-if="section==='settings'" class="workspace-box account-settings"><div class="workspace-box-heading"><div><h2>账号与安全</h2><p>当前账号：{{ user.username }}</p></div></div><el-form label-position="top" @submit.prevent="updateName"><el-form-item label="显示昵称"><el-input v-model="displayName" maxlength="40" /></el-form-item><el-button class="workspace-add-button" :loading="busy" native-type="submit">保存昵称</el-button></el-form><el-divider /><el-form label-position="top" @submit.prevent="updatePassword"><h3>修改密码</h3><el-form-item label="当前密码"><el-input v-model="currentPassword" type="password" show-password autocomplete="current-password" maxlength="128" /></el-form-item><el-form-item label="新密码（8–128 位）"><el-input v-model="newPassword" type="password" show-password autocomplete="new-password" maxlength="128" /></el-form-item><el-form-item label="确认新密码"><el-input v-model="confirmPassword" type="password" show-password autocomplete="new-password" maxlength="128" /></el-form-item><el-button class="workspace-add-button" :loading="busy" native-type="submit">更新密码</el-button><p class="form-help">修改后，所有设备上的登录会话都将退出。</p></el-form></section>
      </template>
    </div>
    <el-dialog v-model="petDialog" :title="editingPet?'编辑宠物档案':'创建宠物档案'" width="min(520px,92vw)" destroy-on-close><el-form label-position="top" @submit.prevent="savePet"><el-form-item label="宠物名字"><el-input v-model="petForm.name" maxlength="40" placeholder="给它一个熟悉的称呼" /></el-form-item><div class="form-two-columns"><el-form-item label="宠物类型"><el-select v-model="petForm.species"><el-option label="狗狗" value="dog" /><el-option label="猫咪" value="cat" /><el-option label="其他宠物" value="other" /></el-select></el-form-item><el-form-item label="品种"><el-input v-model="petForm.breed" maxlength="80" placeholder="如：金毛犬" /></el-form-item><el-form-item label="生日"><el-date-picker v-model="petForm.birthday" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" /></el-form-item><el-form-item label="性别"><el-select v-model="petForm.gender"><el-option label="暂不填写" value="unknown" /><el-option label="男孩子" value="male" /><el-option label="女孩子" value="female" /></el-select></el-form-item></div><el-form-item label="关于它"><el-input v-model="petForm.notes" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="性格、喜好，或需要记住的事情" /></el-form-item><div class="dialog-actions"><el-button @click="petDialog=false">取消</el-button><el-button native-type="submit" class="workspace-add-button" :loading="busy">保存档案</el-button></div></el-form></el-dialog>
    <el-dialog v-model="memoryDialog" title="记录成长记忆" width="min(520px,92vw)" destroy-on-close><el-form label-position="top" @submit.prevent="saveMemory"><el-form-item label="标题"><el-input v-model="memoryForm.title" maxlength="100" placeholder="今天发生了什么？" /></el-form-item><el-form-item label="日期"><el-date-picker v-model="memoryForm.happenedOn" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="故事"><el-input v-model="memoryForm.content" type="textarea" :rows="4" maxlength="5000" /></el-form-item><el-form-item label="关联照片（可选）"><el-select v-model="memoryForm.assetId" clearable :empty-values="['',undefined,null]" :value-on-clear="null"><el-option v-for="photo in photos" :key="photo.id" :label="photo.name" :value="photo.id" /></el-select></el-form-item><div class="dialog-actions"><el-button @click="memoryDialog=false">取消</el-button><el-button native-type="submit" class="workspace-add-button" :loading="busy">珍藏记忆</el-button></div></el-form></el-dialog>
  </section>
</template>

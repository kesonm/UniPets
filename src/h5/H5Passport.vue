<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CollectionTag, Wallet } from '@element-plus/icons-vue'
import AssetImage from '../components/AssetImage.vue'
import { api } from '../lib/api'
import type { Asset, Memory, User } from '../lib/types'
import { currencyNames, engagementNames, healthNames, type HealthRecord, type PetRecords, type WalletSummary } from './business'
import H5Memorial from './H5Memorial.vue'
import type { CloudPet, CloudSection, PetArchiveSection } from './types'

const props = defineProps<{pet:CloudPet; user:User|null; assets:Asset[]; memories:Memory[]; panel:PetArchiveSection; revision:number}>()
const emit=defineEmits<{section:[CloudSection];story:[string|null];post:[string]}>()
const privatePet=computed(()=>props.pet.shared===false && props.user ? props.pet : undefined)
const archive=ref<PetRecords|null>(null)
const ledger=ref<WalletSummary|null>(null)
const loading=ref(false)
const error=ref('')
const saving=ref(false)
const healthOpen=ref(false)
const memorialOpen=ref(false)
const walletAddress=ref('')
const health=reactive({kind:'exam' as HealthRecord['kind'],happenedOn:'',title:'',note:''})
const lessons=computed(()=>archive.value?.engagements.filter(item=>item.module==='education') ?? [])
let version=0

async function load() {
  const current=++version
  const id=privatePet.value?.id
  const panel=props.panel
  error.value=''
  loading.value=Boolean(id && panel!=='digital')
  if (!id || panel==='digital') return
  try {
    if (panel==='assets') {
      const wallet=await api<WalletSummary>('/h5/wallet?petId='+id)
      if (current===version) ledger.value=wallet
    } else {
      const records=await api<PetRecords>('/h5/pet-records/'+id)
      if (current===version) archive.value=records
    }
  } catch(cause) {if (current===version) error.value=cause instanceof Error?cause.message:'档案读取失败'}
  finally {if (current===version) loading.value=false}
}
watch([()=>privatePet.value?.id,()=>props.user?.id,()=>props.panel],()=>{
  archive.value=null;ledger.value=null;healthOpen.value=false;memorialOpen.value=false;walletAddress.value=''
  void load()
},{immediate:true})
watch(()=>props.revision,()=>{void load()})

function addHealth() {
  health.kind='exam';health.title='';health.note=''
  health.happenedOn=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})
  healthOpen.value=true
}
async function saveHealth() {
  const id=privatePet.value?.id
  if (!id||saving.value) return
  saving.value=true
  try {
    await api('/h5/pet-records/'+id+'/health',{method:'POST',body:{...health}})
    if(privatePet.value?.id===id) {healthOpen.value=false;await load()}
    ElMessage.success('健康记录已保存')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'记录保存失败')}
  finally {saving.value=false}
}
async function connectWallet() {
  const provider=(window as Window & {ethereum?:{request:(input:{method:string})=>Promise<unknown>}}).ethereum
  if (!provider) {ElMessage.info('请在带有钱包的浏览器打开');return}
  try {
    const result=await provider.request({method:'eth_requestAccounts'})
    const address=Array.isArray(result)?result[0]:undefined
    if(typeof address!=='string'||!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error('钱包未返回可用地址')
    walletAddress.value=address
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'钱包连接未完成')}
}
</script>

<template>
  <div class="h5-program-stack h5-passport">
    <p v-if="error" role="status" class="h5-muted">{{ error }} <button type="button" class="h5-text-button" @click="load">重试</button></p>
    <section v-if="panel==='health' && privatePet" class="h5-identity h5-card">
      <div class="h5-section-title"><h2>健康记录</h2><button type="button" class="h5-small-primary" @click="addHealth">新增记录</button></div>
      <article v-for="entry in archive?.health" :key="entry.id" class="h5-record">
        <div><strong>{{ entry.title }}</strong><span class="h5-pill">{{ healthNames[entry.kind] }}</span></div>
        <small>{{ entry.happenedOn }}</small><p v-if="entry.note">{{ entry.note }}</p>
      </article>
      <p v-if="!archive?.health.length&&!error" class="h5-muted">{{ loading?'正在读取健康记录…':'暂无个人健康记录' }}</p>
      <div v-if="privatePet.notes" class="h5-passport-section h5-record"><strong>饲养备注</strong><p>{{ privatePet.notes }}</p></div>
    </section>
    <section v-else-if="panel==='digital'" class="h5-identity h5-card">
      <div class="h5-section-title"><h2><el-icon><CollectionTag /></el-icon>数字身份</h2><span class="h5-pill">平台档案凭证</span></div>
      <dl><dt>身份证号</dt><dd><code>{{ pet.identityNumber ?? '待登记' }}</code></dd><dt>持有者</dt><dd>{{ pet.shared?'keson':user?.displayName }}</dd><dt>链上凭证</dt><dd>暂未签发</dd></dl>
      <div class="h5-business-actions"><button class="h5-small-primary" type="button" @click="emit('section','space')">宠物空间</button><button class="h5-secondary" type="button" @click="emit('section','motions')">动作素材</button></div>
      <div v-if="privatePet" class="h5-wallet"><button v-if="!walletAddress" class="h5-text-button" type="button" @click="connectWallet"><el-icon><Wallet /></el-icon> 查看钱包地址</button><template v-else><code>{{ walletAddress }}</code><button type="button" class="h5-text-button" @click="walletAddress=''">关闭地址显示</button></template></div>
    </section>
    <section v-else-if="panel==='assets'" class="h5-identity h5-card">
      <h2 class="h5-small-heading">数字资产</h2>
      <template v-if="privatePet">
        <div v-if="ledger" class="h5-wallet-summary"><div v-for="(balance,id) in ledger.balances" :key="id"><span>{{ currencyNames[id] }}</span><strong>{{ balance }}</strong></div></div>
        <div v-if="ledger?.entries.length" class="h5-record-list"><div v-for="entry in ledger.entries" :key="entry.id" class="h5-record"><div><strong>{{ entry.label }}</strong><span>{{ entry.quantity>0?'+':'' }}{{ entry.quantity }} {{ currencyNames[entry.currency] }}</span></div></div></div>
        <p v-else-if="!error" class="h5-muted">{{ loading?'正在读取资产…':'暂无关联本宠物的资产流水' }}</p>
        <p class="h5-muted">{{ assets.filter(asset=>asset.kind==='photo').length }} 张照片 · {{ assets.filter(asset=>asset.kind==='sprite').length }} 组动作素材</p>
      </template>
      <p v-else class="h5-muted">共享模式可预览已开放的动作素材。</p>
      <button class="h5-text-button" type="button" @click="emit('section','motions')">查看动作素材</button>
    </section>
    <section v-else-if="panel==='content'" class="h5-identity h5-card">
      <h2 class="h5-small-heading">内容档案</h2>
      <div v-if="archive?.posts.length || archive?.stories.length" class="h5-simple-list">
        <button v-for="post in archive?.posts" :key="post.id" type="button" @click="emit('post',post.id)"><span><strong>{{ post.title }}</strong><small>宠物动态</small></span></button>
        <button v-for="story in archive?.stories" :key="story.id" type="button" @click="emit('story',story.publishedAt?story.id:null)"><span><strong>{{ story.title }}</strong><small>{{ story.publishedAt?'已发布作品':'私密剧本' }}</small></span></button>
      </div>
      <p v-else-if="!error" class="h5-muted">{{ loading?'正在读取内容…':privatePet?'暂无关联的短剧或动态':'共享档案仅提供公开素材预览' }}</p>
      <button class="h5-text-button" type="button" @click="emit('section','memories')">打开成长记忆</button>
    </section>
    <section v-else-if="panel==='growth'" class="h5-identity h5-card">
      <div class="h5-section-title"><h2>成长档案</h2><button class="h5-text-button" type="button" @click="emit('section','memories')">查看成长记忆</button></div>
      <div v-for="record in memories.slice(0,3)" :key="record.id" class="h5-record"><div><strong>{{ record.title }}</strong><small>{{ record.happenedOn }}</small></div></div>
      <div v-for="lesson in lessons" :key="lesson.id" class="h5-record"><div><strong>{{ lesson.title }}</strong><span class="h5-pill">{{ lesson.checkedInAt && lesson.status!=='completed'?'已打卡':engagementNames[lesson.status] }}</span></div></div>
      <p v-if="!memories.length&&!lessons.length&&!error" class="h5-muted">{{ loading?'正在读取成长记录…':'暂无可查看的成长或学习记录' }}</p>
    </section>
    <section v-else-if="panel==='memorial'" class="h5-identity h5-card">
      <h2 class="h5-small-heading">永生档案</h2>
      <div v-if="privatePet">
        <AssetImage v-if="archive?.memorial?.coverAssetId" class="h5-passport-cover" :id="archive.memorial.coverAssetId" :alt="archive.memorial.title" />
        <p v-if="archive?.memorial"><strong>{{ archive.memorial.title }}</strong></p>
        <p v-else-if="!error" class="h5-muted">{{ loading?'正在读取纪念馆…':'还没有创建纪念馆' }}</p>
        <button class="h5-small-primary" type="button" @click="memorialOpen=true">{{ archive?.memorial?'打开纪念馆':'创建私密纪念馆' }}</button>
      </div>
      <p v-else class="h5-muted">纪念馆仅对宠物档案的持有人开放。</p>
    </section>
  </div>

  <el-dialog v-model="healthOpen" title="新增健康记录" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
    <form class="h5-form" @submit.prevent="saveHealth">
      <label>类型<select v-model="health.kind"><option v-for="(label,id) in healthNames" :key="id" :value="id">{{ label }}</option></select></label>
      <label>日期<input v-model="health.happenedOn" type="date" required></label>
      <label>标题<input v-model.trim="health.title" maxlength="100" required></label>
      <label>记录内容<textarea v-model.trim="health.note" maxlength="1500" rows="3" /></label>
      <button class="h5-primary" type="submit" :disabled="saving">保存记录</button>
    </form>
  </el-dialog>
  <el-dialog v-model="memorialOpen" title="纪念馆" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
    <H5Memorial v-if="privatePet" :user="user" :pets="[privatePet]" :preferred-pet-id="pet.id" @changed="load" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowLeft, ArrowRight, Camera, House, Picture, Plus } from '@element-plus/icons-vue'
import AssetImage from '../components/AssetImage.vue'
import CatMotionStudio from '../components/CatMotionStudio.vue'
import { api, downloadAsset, fileData } from '../lib/api'
import type { Asset, Memory, Pet, User } from '../lib/types'
import H5Avatar from './H5Avatar.vue'
import H5PetStage from './H5PetStage.vue'
import H5Passport from './H5Passport.vue'
import type { CloudPet, CloudSection } from './types'

const props = defineProps<{ pets:CloudPet[]; selectedId:string; section:CloudSection; user:User|null; loading:boolean; recordsRevision:number }>()
const emit = defineEmits<{select:[string]; section:[CloudSection]; back:[]; identity:[]; create:[]; edit:[Pet]; changed:[]; story:[string|null]; post:[string]}>()
const selected = computed(()=>props.pets.find(pet=>pet.id===props.selectedId))
const owned = computed(()=>selected.value?.shared===false ? selected.value : undefined)
const sectionTitles: Record<CloudSection,string> = {
  detail:'宠物详情', space:'宠物空间', photos:'宠物照片', motions:'动作素材', memories:'成长记忆',
  digital:'数字凭证', health:'健康档案', assets:'资产台账', content:'内容档案', growth:'成长档案', memorial:'永生档案',
}
const publicArchiveLinks = ['motions','digital'] as const
const ownerArchiveLinks = [...publicArchiveLinks,'health','assets','content','growth','memorial'] as const
const archiveLinks = computed(()=>owned.value ? ownerArchiveLinks : publicArchiveLinks)
const names = {cat:'猫咪',dog:'狗狗',other:'其他宠物'}
const age = computed(()=>{
  if (!selected.value?.birthday) return ''
  const [year,month,day] = selected.value.birthday.split('-').map(Number)
  const today = new Date()
  const months = (today.getFullYear()-year)*12+today.getMonth()+1-month-Number(today.getDate()<day)
  if (months<=0) return ''
  if (months<12) return `${months} 个月`
  const remainder = months%12
  return `${Math.floor(months/12)} 岁${remainder ? ` ${remainder} 个月` : ''}`
})
const assets = ref<Asset[]>([])
const memories = ref<Memory[]>([])
const photos = computed(()=>assets.value.filter(asset=>asset.kind==='photo'))
const visiblePhotos = computed(()=>props.section==='detail' ? photos.value.slice(0,3) : photos.value)
const visibleMemories = computed(()=>props.section==='detail' ? memories.value.slice(0,1) : memories.value)
const uploadInput = ref<HTMLInputElement>()
const uploading = ref(false)
const loadingAssets = ref(false)
const loadError = ref('')
const viewedPhoto = ref<Asset|null>(null)
const showPhoto = ref(false)
const showMemory = ref(false)
const memoryTitle = ref('')
const memoryText = ref('')
const memoryPhoto = ref<string|null>(null)
const memoryDate = ref('')
const saving = ref(false)
let revision = 0

async function refresh() {
  const version = ++revision
  const petId = owned.value?.id
  if (!petId) return
  loadError.value = ''
  try {
    const [media, records] = await Promise.all([
      api<{assets:Asset[]}>(`/assets?petId=${petId}`), api<{memories:Memory[]}>('/memories'),
    ])
    if (version!==revision) return
    assets.value=media.assets
    memories.value=records.memories.filter(item=>item.petId===petId)
  } catch (error) {
    if (version===revision) loadError.value=error instanceof Error ? error.message : '资产读取失败'
  } finally { if (version===revision) loadingAssets.value=false }
}

watch([()=>selected.value?.id,()=>owned.value?.id],([,petId])=>{
  revision++
  assets.value=[]; memories.value=[]; loadError.value=''
  viewedPhoto.value=null; showPhoto.value=false; showMemory.value=false
  loadingAssets.value=Boolean(petId)
  if (!petId) return
  void refresh()
},{immediate:true})
onBeforeUnmount(()=>{ revision++ })

async function upload(event: Event) {
  const input=event.target as HTMLInputElement
  const photo=input.files?.[0]
  const petId=owned.value?.id
  input.value=''
  if (!photo || !petId || uploading.value) return
  uploading.value=true
  try {
    await api('/assets',{method:'POST',body:{petId,name:photo.name.slice(0,150),image:await fileData(photo)}})
    ElMessage.success('照片已保存')
    emit('changed')
    if (owned.value?.id===petId) await refresh()
  } catch(error) { ElMessage.error(error instanceof Error?error.message:'上传失败') }
  finally { uploading.value=false }
}

function selectPet(event: Event) { emit('select',(event.target as HTMLSelectElement).value) }
function viewPhoto(photo: Asset|null) { viewedPhoto.value=photo;showPhoto.value=true }

async function download(photo: Asset) {
  try {
    await downloadAsset(photo.id,photo.name.replace(/\.[^.]+$/,'')+'.png')
  } catch(error) { ElMessage.error(error instanceof Error?error.message:'素材下载失败') }
}

async function setCover(photo: Asset) {
  const pet=owned.value
  if (!pet || pet.id!==photo.petId || saving.value) return
  saving.value=true
  try {
    await api(`/pets/${pet.id}`,{method:'PATCH',body:{...pet,avatarAssetId:photo.id}})
    emit('changed');ElMessage.success('封面已更新')
  } catch(error) { ElMessage.error(error instanceof Error?error.message:'封面保存失败') }
  finally { saving.value=false }
}

function writeMemory() {
  memoryTitle.value=''; memoryText.value=''; memoryPhoto.value=null
  memoryDate.value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})
  showMemory.value=true
}

async function saveMemory() {
  const petId=owned.value?.id
  if (!petId || saving.value) return
  saving.value=true
  try {
    await api('/memories',{method:'POST',body:{petId,title:memoryTitle.value,content:memoryText.value,happenedOn:memoryDate.value,assetId:memoryPhoto.value}})
    if (owned.value?.id===petId) {showMemory.value=false; await refresh()}
    ElMessage.success('记忆已保存')
  } catch(error) { ElMessage.error(error instanceof Error?error.message:'记忆保存失败') }
  finally { saving.value=false }
}

</script>

<template>
  <div class="h5-cloud">
    <input v-if="owned" ref="uploadInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="upload">
    <header class="h5-detail-header">
      <button type="button" class="h5-text-button" @click="emit('back')"><el-icon aria-hidden="true"><ArrowLeft /></el-icon>返回</button>
      <h1>{{ sectionTitles[section] }}</h1>
      <button v-if="section==='detail' && owned" type="button" class="h5-text-button" @click="emit('edit',owned)">编辑</button>
    </header>

    <div v-if="selected" class="h5-cloud-content">
      <template v-if="section==='detail'">
        <section class="h5-detail-profile h5-card" aria-labelledby="h5-detail-pet-name">
          <div class="h5-detail-personal">
            <H5Avatar :pet="selected" class="h5-detail-avatar" />
            <div>
              <div class="h5-detail-name">
                <h2 id="h5-detail-pet-name">{{ selected.name }}</h2>
                <div v-if="pets.length>1" class="h5-detail-switch" title="切换宠物">
                  <el-icon aria-hidden="true"><ArrowDown /></el-icon>
                  <select aria-label="切换宠物" :value="selected.id" @change="selectPet">
                    <option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}{{ pet.shared?'（共享）':'' }}</option>
                  </select>
                </div>
              </div>
              <span v-if="selected.shared" class="h5-pill">共享档案</span>
              <dl>
                <dt>种类</dt><dd>{{ names[selected.species] }}</dd>
                <template v-if="selected.breed"><dt>品种</dt><dd>{{ selected.breed }}</dd></template>
                <template v-if="selected.gender!=='unknown'"><dt>性别</dt><dd>{{ selected.gender==='female'?'母':'公' }}</dd></template>
                <template v-if="selected.birthday"><dt>生日</dt><dd><time :datetime="selected.birthday">{{ selected.birthday }}</time></dd></template>
                <template v-if="age"><dt>年龄</dt><dd>{{ age }}</dd></template>
              </dl>
            </div>
          </div>
          <footer class="h5-detail-number"><span>身份证号</span><strong>{{ selected.identityNumber ?? '待登记' }}</strong></footer>
        </section>
        <div class="h5-detail-actions">
          <button type="button" class="h5-primary" @click="emit('section','space')"><el-icon aria-hidden="true"><House /></el-icon>进入宠物空间</button>
          <button type="button" class="h5-text-button" @click="emit('identity')">查看宠物身份证<el-icon aria-hidden="true"><ArrowRight /></el-icon></button>
        </div>
      </template>

      <p v-if="loadError" class="h5-muted" role="status">{{ loadError }} <button type="button" class="h5-text-button" @click="refresh">重试</button></p>

      <template v-if="section==='detail' || section==='photos' || section==='memories'">
        <section v-if="section!=='memories'" class="h5-card h5-cloud-panel" aria-labelledby="h5-detail-photos">
          <div class="h5-section-title">
            <h2 id="h5-detail-photos">{{ section==='detail'?'宠物照片':selected.name+'的照片' }}</h2>
            <button v-if="section==='detail' && photos.length>3" type="button" class="h5-text-button" aria-label="查看全部宠物照片" @click="emit('section','photos')">查看全部<el-icon aria-hidden="true"><ArrowRight /></el-icon></button>
            <button v-else-if="owned" type="button" class="h5-text-button" :disabled="uploading" @click="uploadInput?.click()"><el-icon aria-hidden="true"><Camera /></el-icon>{{ uploading?'正在上传':'上传照片' }}</button>
          </div>
          <div v-if="visiblePhotos.length || (selected.shared && selected.hasCover)" class="h5-photo-grid">
            <button v-for="photo in visiblePhotos" :key="photo.id" type="button" :aria-label="'查看'+photo.name" @click="viewPhoto(photo)">
              <AssetImage :id="photo.id" :alt="photo.name" :image-version="photo.imageVersion" />
              <span v-if="section==='photos'">{{ photo.name }}</span>
            </button>
            <button v-if="selected.shared && selected.hasCover" type="button" :aria-label="'查看'+selected.name+'的照片'" @click="viewPhoto(null)">
              <H5Avatar :pet="selected" class="h5-detail-thumbnail" />
            </button>
          </div>
          <p v-else-if="!loadError" class="h5-detail-empty" role="status">{{ loadingAssets?'正在读取照片…':selected.shared?'暂无公开照片':'还没有照片' }}</p>
        </section>

        <section v-if="section!=='photos'" class="h5-card h5-cloud-panel" aria-labelledby="h5-detail-memories">
          <div class="h5-section-title">
            <h2 id="h5-detail-memories">{{ section==='detail'?'成长记忆':selected.name+'的成长记忆' }}</h2>
            <button v-if="section==='detail' && memories.length" type="button" class="h5-text-button" aria-label="查看全部成长记忆" @click="emit('section','memories')">查看全部<el-icon aria-hidden="true"><ArrowRight /></el-icon></button>
            <button v-else-if="owned" type="button" class="h5-text-button" @click="writeMemory"><el-icon aria-hidden="true"><Plus /></el-icon>写记忆</button>
          </div>
          <article v-for="record in visibleMemories" :key="record.id" class="h5-memory" :class="{'h5-detail-memory-preview':section==='detail'}">
            <time :datetime="record.happenedOn">{{ record.happenedOn }}</time><strong>{{ record.title }}</strong>
            <p v-if="record.content">{{ record.content }}</p>
            <AssetImage v-if="record.assetId" :id="record.assetId" :alt="record.title" />
          </article>
          <p v-if="!visibleMemories.length && !loadError" class="h5-detail-empty" role="status">{{ loadingAssets?'正在读取成长记忆…':selected.shared?'暂无公开成长记忆':'还没有成长记忆' }}</p>
        </section>

        <section v-if="section==='detail'" class="h5-card h5-cloud-panel" aria-labelledby="h5-detail-more">
          <div class="h5-section-title"><h2 id="h5-detail-more">更多档案</h2></div>
          <div class="h5-simple-list">
            <button v-for="item in archiveLinks" :key="item" type="button" @click="emit('section',item)">
              <span>{{ sectionTitles[item] }}</span><el-icon aria-hidden="true"><ArrowRight /></el-icon>
            </button>
          </div>
        </section>
      </template>
      <section v-else-if="section==='space'" class="h5-card h5-cloud-panel" :aria-label="selected.name+'的宠物空间'">
        <div class="h5-section-title"><h2>{{ selected.name }}</h2></div>
        <H5PetStage :key="selected.id+':'+selected.shared" :pet="selected"
          :assets="assets" :loading="loadingAssets" @motions="emit('section','motions')" />
      </section>
      <template v-else-if="section==='motions'">
        <div v-if="loadingAssets" class="h5-empty h5-card" role="status">正在读取动作素材…</div>
        <CatMotionStudio v-else :key="selected.id+':'+selected.shared" :pet-id="selected.id"
          :include-jump="selected.species==='cat'" :read-only="selected.shared" :allow-download="!!owned" />
      </template>
      <H5Passport v-else :key="selected.id+':'+selected.shared+':'+section" :pet="selected" :user="user"
        :assets="assets" :memories="memories" :panel="section" :revision="recordsRevision"
        @section="emit('section',$event)" @story="emit('story',$event)" @post="emit('post',$event)" />
    </div>
    <div v-else class="h5-card h5-empty h5-cloud-empty" role="status">
      <template v-if="loading">正在读取宠物档案…</template>
      <template v-else>
        <el-icon aria-hidden="true"><Picture /></el-icon><strong>还没有宠物档案</strong>
        <button class="h5-primary" type="button" @click="emit('create')">新建宠物档案</button>
      </template>
    </div>

    <el-dialog v-model="showPhoto" :title="viewedPhoto?.name ?? (selected ? selected.name+'的照片' : '宠物照片')" class="h5-dialog" width="min(460px, 92vw)" append-to-body destroy-on-close>
      <template v-if="viewedPhoto">
        <AssetImage class="h5-photo-detail" :id="viewedPhoto.id" :alt="viewedPhoto.name" :image-version="viewedPhoto.imageVersion" />
        <div v-if="owned" class="h5-button-row">
          <button class="h5-secondary" type="button" @click="download(viewedPhoto)">下载照片</button>
          <button class="h5-primary" type="button" :disabled="saving" @click="setCover(viewedPhoto)">设为封面</button>
        </div>
      </template>
      <H5Avatar v-else-if="selected?.shared && selected.hasCover" :pet="selected" class="h5-detail-shared-photo" />
    </el-dialog>
    <el-dialog v-model="showMemory" title="记录成长记忆" class="h5-dialog" width="min(460px, 92vw)" append-to-body destroy-on-close>
      <form class="h5-form" @submit.prevent="saveMemory">
        <label>标题<input v-model.trim="memoryTitle" required maxlength="100"></label>
        <label>日期<input v-model="memoryDate" type="date" required></label>
        <label>发生了什么<textarea v-model="memoryText" rows="3" maxlength="5000" /></label>
        <label>关联照片<select v-model="memoryPhoto"><option :value="null">暂不添加</option><option v-for="photo in photos" :key="photo.id" :value="photo.id">{{ photo.name }}</option></select></label>
        <button class="h5-primary" type="submit" :disabled="saving">保存记忆</button>
      </form>
    </el-dialog>
  </div>
</template>

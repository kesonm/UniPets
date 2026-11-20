<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api, ApiError, fileData } from '../lib/api'
import type { Pet } from '../lib/types'

const open=defineModel<boolean>({required:true})
const props=defineProps<{pet:Pet|null;issueIdentity:boolean}>()
const emit=defineEmits<{saved:[Pet]}>()
const initial=()=>({name:'',species:'cat' as Pet['species'],breed:'',birthday:'',gender:'unknown' as Pet['gender'],notes:''})
const form=reactive(initial())
const saving=ref(false)
const error=ref('')
const noseFile=ref<File>()
const nosePreview=ref('')
const needsNewPhoto=ref(false)
const models=ref<Pet['species'][]|null>(null)
const includeNosePrint=ref(false)
const enrollingExisting=computed(()=>props.issueIdentity && Boolean(props.pet))
const enrolling=computed(()=>enrollingExisting.value || (props.issueIdentity && includeNosePrint.value && form.species!=='other'))
const canScan=computed(()=>models.value?.includes(form.species)===true)
let revision=0

function clearPhoto() {
  if (nosePreview.value) URL.revokeObjectURL(nosePreview.value)
  nosePreview.value='';noseFile.value=undefined;needsNewPhoto.value=false
}
function choosePhoto(event:Event) {
  const input=event.target as HTMLInputElement
  const file=input.files?.[0]
  input.value=''
  if (!file) return
  clearPhoto()
  error.value=''
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024) {
    error.value='请选择 8MB 以内的 JPG、PNG 或 WebP 照片'
    return
  }
  noseFile.value=file
  nosePreview.value=URL.createObjectURL(file)
}
watch(open,value=>{
  revision++
  clearPhoto()
  saving.value=false;error.value='';includeNosePrint.value=false
  if(!value)return
  const pet=props.pet
  Object.assign(form,pet?{name:pet.name,species:pet.species,breed:pet.breed,birthday:pet.birthday??'',gender:pet.gender,notes:pet.notes}:initial())
})
watch([open,enrolling],([visible,scan],_,onCleanup)=>{
  clearPhoto()
  error.value='';models.value=null
  if (!visible || !scan) return
  let active=true
  onCleanup(()=>{active=false})
  void api<{species:Pet['species'][]}>('/pets/identity').then(result=>{
    if (active) models.value=result.species
  }).catch(problem=>{
    if (!active) return
    models.value=[]
    error.value=problem instanceof Error?problem.message:'无法读取识别服务状态'
  })
})
watch(()=>form.species,clearPhoto)
onBeforeUnmount(()=>{revision++;clearPhoto()})

async function submit() {
  const image=noseFile.value
  if (saving.value || (enrolling.value && (!image || !canScan.value || needsNewPhoto.value))) return
  const current=revision
  saving.value=true;error.value=''
  const existing=props.pet
  const issuing=enrolling.value
  try {
    const record={...form,birthday:form.birthday||null,avatarAssetId:existing?.avatarAssetId??null}
    const endpoint=existing?`/pets/${existing.id}`:'/pets'
    const payload=issuing && image?{nosePrintImage:await fileData(image)}:null
    const {pet}=await api<{pet:Pet}>(issuing?`${endpoint}/identity`:endpoint,{
      method:!issuing && existing?'PATCH':'POST',
      body:issuing && existing?payload:{...record,...payload},
    })
    if (current!==revision) return
    open.value=false
    emit('saved',pet)
    ElMessage.success({message:issuing?`宠物身份证已签发 · ${pet.identityNumber}`:'宠物档案已保存',placement:'bottom',offset:80,grouping:true,customClass:'h5-pet-save-notice'})
  } catch(problem) {
    if (current===revision) {
      error.value=problem instanceof Error?problem.message:'保存档案失败'
      needsNewPhoto.value=issuing && problem instanceof ApiError && problem.status===422
    }
  } finally {if (current===revision) saving.value=false}
}
</script>

<template>
  <el-dialog v-model="open" :title="enrollingExisting?'登记宠物鼻纹':pet?'编辑宠物档案':'新建宠物档案'"
    class="h5-dialog" width="min(460px, 92vw)" append-to-body destroy-on-close
    :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <form class="h5-form" @submit.prevent="submit">
      <template v-if="!enrollingExisting">
        <label>宠物名字<input v-model.trim="form.name" maxlength="40" required placeholder="例如 冬瓜" :disabled="saving"></label>
        <div class="h5-form-pair">
          <label>类型<select v-model="form.species" :disabled="saving || Boolean(pet?.identityNumber)">
            <option value="cat">猫咪</option>
            <option value="dog">狗狗</option>
            <option value="other">其他宠物</option>
          </select></label>
          <label>品种<input v-model.trim="form.breed" maxlength="80" placeholder="选填" :disabled="saving"></label>
        </div>
        <div class="h5-form-pair"><label>生日<input v-model="form.birthday" type="date" :disabled="saving"></label><label>性别<select v-model="form.gender" :disabled="saving"><option value="unknown">暂未填写</option><option value="male">男孩</option><option value="female">女孩</option></select></label></div>
        <label>备注<textarea v-model="form.notes" rows="2" maxlength="2000" placeholder="仅自己可见" :disabled="saving" /></label>
      </template>
      <p v-else-if="pet" class="h5-muted">{{ pet.name }}</p>
      <label v-if="issueIdentity && !pet && form.species!=='other'" class="h5-check"><input v-model="includeNosePrint" type="checkbox" :disabled="saving"> 同时登记鼻纹并签发身份证</label>
      <template v-if="enrolling">
        <p v-if="models===null" class="h5-muted" role="status">正在检查鼻纹识别服务…</p>
        <p v-else-if="!canScan" class="h5-muted" role="status">当前宠物类型的鼻纹模型待启用</p>
        <label class="h5-nose-field">
          {{ noseFile?'重新上传鼻纹照片':'上传鼻纹照片' }}
          <small id="h5-nose-guide">{{ form.species==='cat'?'正面近拍，让双眼和鼻子都入镜。请对准鼻尖对焦，避开反光。':'正面近拍，完整拍到鼻尖和两侧鼻孔。请对焦，避开强光和反光。' }}</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="h5-nose-guide" :disabled="saving || !canScan" @change="choosePhoto">
          <img v-if="nosePreview" :src="nosePreview" alt="待识别的鼻纹照片" class="h5-nose-preview">
        </label>
      </template>
      <p v-if="error" class="h5-form-error" role="alert">{{ error }}</p>
      <button class="h5-primary" type="submit" :disabled="saving || (enrolling && (!noseFile || !canScan || needsNewPhoto))">
        {{ enrolling?(saving?'正在识别鼻纹…':'识别并签发身份证'):(saving?'正在保存…':'保存宠物档案') }}
      </button>
    </form>
  </el-dialog>
</template>

<style scoped>
.h5-nose-field { padding: 10px; border: 1px solid #ebdfbc; border-radius: 10px; background: #fffaf0; }
.h5-nose-field small { color: var(--h5-muted); font-size: 12px; line-height: 1.55; }
.h5-nose-field input { max-width: 100%; }
.h5-nose-preview { display: block; width: 100%; height: 120px; border-radius: 7px; object-fit: contain; }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoCamera } from '@element-plus/icons-vue'
import { availableCatClip, catClips, catIdleGroups, catInteractiveActions, catJumpAction, catKeyActions, catSleepAction, legacyPetGenerationClips, type CatKeyAction, type CatManifest, type CatSequenceItem } from '../../shared/cat-motion.mjs'
import { api, downloadAsset } from '../lib/api'
import type { Asset, Job, MotionPreviewAsset, MotionStep } from '../lib/types'
import AssetImage from './AssetImage.vue'
import MotionPreview from './MotionPreview.vue'

const props = defineProps<{ petId: string; includeJump: boolean; generationEnabled?: boolean; photos?: Asset[];
  jobs?: Job[]; activeJob?: boolean; uploading?: boolean; allowDownload?: boolean; readOnly?: boolean }>()
const manifest = ref<CatManifest<MotionPreviewAsset> & {steps?: MotionStep[]}>({poses:{},assets:[]})
const loading = ref(true)
const error = ref('')
const preview = ref<{title:string; items:CatSequenceItem<MotionPreviewAsset>[]} | null>(null)
const previewOpen = ref(false)
let manifestRevision = 0
const route = computed(() => props.readOnly ? `/h5/demo-pets/${props.petId}/motions` : `/motions/${props.petId}`)

const latestBatch = computed(() => props.jobs?.find(job=>job.mode==='motion_batch'))
const batchActive = computed(() => latestBatch.value?.status==='queued' || latestBatch.value?.status==='running')

function isWorking(step?: MotionStep) {
  return Boolean(step && ['submitting','generating','processing'].includes(step.status))
}

function stepLabel(step: MotionStep) {
  if (step.action===catJumpAction) return '正在合成跳跃'
  if (step.retrying) return '正在重试'
  if (step.status==='submitting') return '正在提交'
  if (step.status==='processing') return '正在抽帧'
  return '视频生成中'
}

interface MotionCard {
  id: CatKeyAction
  name: string
  step?: MotionStep
  asset?: MotionPreviewAsset
  working: boolean
  label: string
  progress: number|null
}

const cards = computed(() => {
  const {steps, assets} = manifest.value
  const byAction = new Map((steps ?? []).map(step=>[step.action,step]))
  return new Map(catKeyActions.map((id): [CatKeyAction,MotionCard]=>{
    const step = byAction.get(id)
    const working = batchActive.value && isWorking(step)
    const asset = availableCatClip(id,manifest.value) ?? assets.find(item=>item.id===step?.assetId) ??
      (id===catSleepAction ? availableCatClip('sleep_breathe',manifest.value) : undefined) ?? assets.find(item=>item.action===id)
    const label = working && step ? stepLabel(step)
      : step?.status==='queued' && batchActive.value ? '排队中'
      : asset ? (asset.motionJoinable ? '已生成' : '可预览')
      : step?.status==='failed' ? '生成失败' : '未生成'
    const progress = working && step?.status==='generating' ? step.progress : null
    return [id,{id, name:id===catSleepAction ? '趴着睡觉' : catClips[id].label, step, asset, working, label, progress}]
  }))
})
const groups = computed(() => {
  if (!props.includeJump) {
    const legacy = [...cards.value.values()].filter(card=>legacyPetGenerationClips.includes(card.id))
    return [{heading:'',lists:[{label:'动作列表',cards:legacy}]}]
  }
  return [
    {heading:'待机动作',lists:catIdleGroups.map(group=>({label:group.label,cards:group.actions.map(id=>cards.value.get(id)!)}))},
    {heading:'互动动作',lists:[{label:'互动动作',cards:catInteractiveActions.map(id=>cards.value.get(id)!)}]},
  ]
})
const visibleGroups = computed(() => groups.value.map(group => ({
  ...group,
  lists:group.lists.map(list => ({...list,cards:list.cards.filter(card => card.asset)})).filter(list => list.cards.length),
})).filter(group => group.lists.length))

async function refreshManifest() {
  const version = ++manifestRevision
  try {
    const result = await api<typeof manifest.value>(route.value)
    if (version === manifestRevision) { manifest.value = result; error.value = '' }
  } catch (err) {
    if (version === manifestRevision) error.value = err instanceof Error ? err.message : '动作素材读取失败'
  } finally {
    if (version === manifestRevision) loading.value = false
  }
}

watch([route,() => props.jobs],() => { void refreshManifest() },{immediate:true})
onBeforeUnmount(() => { manifestRevision++ })

/* 暂停 AI 动作生成。保留批次预估、提交及对应控件，供恢复该功能时使用。
import { ApiError } from '../lib/api'
import type { MotionBatchPlan } from '../lib/types'
const emit = defineEmits<{ uploadPhoto: []; changed: [] }>()
const plan = ref<MotionBatchPlan|null>(null)
const pending = ref(false)
const planError = ref('')
let planRevision = 0
let disposed = false

const canGenerate = computed(() => props.generationEnabled && !props.readOnly)
const referenceCount = computed(() => plan.value?.references.length ?? 0)
const generationSummary = computed(() => {
  if (!plan.value || !referenceCount.value) return ''
  const {poses,clips,local} = plan.value
  const parts = [poses ? poses+' 张姿势锚图' : '',clips ? clips+' 段视频' : ''].filter(Boolean)
  if (local) return (parts.length ? '本次生成 '+parts.join('、')+'，' : '')+'本地合成 '+local+' 段动作'
  return parts.length ? '本次新生成 '+parts.join('、')+'，按实际生成计费' : '本次可复用已有素材'
})

async function refreshPlan() {
  const version = ++planRevision
  plan.value = null
  planError.value = ''
  try {
    const result = await api<MotionBatchPlan>(route.value+'/batch-plan')
    if (version === planRevision) plan.value = result
  } catch (err) {
    if (version === planRevision) planError.value = err instanceof Error ? err.message : '参考照片读取失败'
  }
}

watch(
  [canGenerate,() => props.photos?.filter(photo=>!photo.jobId).map(photo=>photo.id+photo.name).join(','),() => latestBatch.value?.id,() => latestBatch.value?.status],
  () => { if (canGenerate.value && !batchActive.value) void refreshPlan() },
  {immediate:true},
)
onBeforeUnmount(() => { disposed = true; planRevision++ })

async function generateAll() {
  const selected = plan.value
  if (!canGenerate.value || !selected?.references.length || pending.value || props.activeJob || batchActive.value) return
  pending.value = true
  try {
    await api(route.value+'/generate',{
      method:'POST',
      body:{kind:'batch',referenceAssetIds:selected.references.map(photo=>photo.id),approved:{poses:selected.poses,clips:selected.clips}},
    })
    if (disposed) return
    emit('changed')
    await refreshManifest()
    if (!disposed) ElMessage.success('已加入生成队列')
  } catch (err) {
    if (disposed) return
    ElMessage.error(err instanceof Error ? err.message : '提交生成失败')
    if (err instanceof ApiError && err.status===409) void refreshPlan()
  } finally { pending.value = false }
}
*/

function showPreview(card: MotionCard) {
  if (!card.asset) return
  preview.value = {items:[{id:card.id,asset:card.asset}],title:card.name}
  previewOpen.value = true
}

async function downloadPreview() {
  const asset=preview.value?.items[0]?.asset
  if(props.readOnly || !asset)return
  try {await downloadAsset(asset.id,asset.name+'.png')}
  catch(error) {ElMessage.error(error instanceof Error?error.message:'下载动作失败')}
}
</script>

<template>
  <section class="workspace-box cat-motion" v-loading="loading" aria-label="宠物动作">
    <!-- AI 生成入口暂停。
    <div v-if="canGenerate" class="motion-actions">
      <el-button v-if="planError" link :title="planError" @click="refreshPlan">重新读取</el-button>
      <el-button v-else-if="!batchActive" :loading="uploading" link @click="emit('uploadPhoto')">上传参考照片</el-button>
      <el-button class="workspace-add-button" :loading="pending" :disabled="!referenceCount || uploading || activeJob || batchActive"
        :title="batchActive ? latestBatch?.phase : generationSummary" @click="generateAll">
        {{ batchActive ? '正在生成动作' : '一键生成所有动作' }}
      </el-button>
    </div>
    -->
    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon />
    <div v-else-if="!loading && !visibleGroups.length" class="h5-empty" role="status">暂无可预览的动作</div>

    <section v-for="group in visibleGroups" :key="group.heading" class="motion-group">
      <h2 v-if="group.heading">{{ group.heading }}</h2>
      <div v-for="list in group.lists" :key="list.label" class="motion-list">
        <h3 v-if="group.heading === '待机动作'">{{ list.label }}</h3>
        <ul class="motion-card-grid" :class="{ 'seated-grid': group.heading === '待机动作', 'interactive-grid': group.heading === '互动动作' }" :aria-label="list.label">
          <li v-for="card in list.cards" :key="card.id" class="motion-card" :data-action="card.id" :title="card.step?.error || undefined">
            <div v-if="card.working" class="motion-card-stage motion-card-progress">
              <span>{{ card.label }}<template v-if="card.progress != null"> · {{ card.progress }}%</template></span>
              <progress :value="card.progress ?? undefined" max="100" :aria-label="card.name+'生成进度'" />
            </div>
            <button v-else-if="card.asset" class="motion-card-stage motion-card-preview" type="button" :aria-label="'预览'+card.name"
              @click="showPreview(card)">
              <AssetImage :id="card.asset.id" :alt="card.name" :image-version="card.asset.imageVersion" :image-path="card.asset.imagePath"
                :frames="card.asset.frames" :columns="card.asset.columns" :rows="card.asset.rows"
                :fps="card.asset.fps" :fit-content="false" animate />
            </button>
            <div v-else class="motion-card-stage motion-card-empty"><el-icon aria-hidden="true"><VideoCamera /></el-icon></div>
            <div class="motion-card-label">
              <strong>{{ card.name }}</strong>
              <small v-if="!card.working">{{ card.label }}</small>
            </div>
          </li>
        </ul>
      </div>
    </section>
  </section>
  <el-dialog v-model="previewOpen" :title="preview?.title" width="min(730px,94vw)" append-to-body destroy-on-close @closed="preview=null">
    <MotionPreview v-if="preview" :items="preview.items" :connected="false" />
    <template v-if="allowDownload && !readOnly && preview" #footer><el-button @click="downloadPreview">下载动作帧图</el-button></template>
  </el-dialog>
</template>

<style scoped>
.motion-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}
.motion-actions .workspace-add-button.is-disabled { color: #6e6340; background: #f2edd6; box-shadow: none; }
.motion-group + .motion-group { margin-top: 26px; padding-top: 22px; border-top: 1px solid #eee9db; }
.motion-group h2 { margin: 0 0 14px; color: #252e38; font-size: 17px; }
.motion-list h3 { margin: 0 0 10px; color: #5e5745; font-size: 13px; font-weight: 600; }
.motion-list + .motion-list { margin-top: 20px; }
.motion-card-grid {
  display: grid;
  grid-template-columns: repeat(8,minmax(0,1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.seated-grid { grid-template-columns: repeat(9,minmax(0,1fr)); }
.interactive-grid { grid-template-columns: repeat(3,minmax(0,166px)); }
.motion-card { overflow: hidden; border: 1px solid #eae6d9; border-radius: 10px; background: #fff; }
.motion-card-stage { width: 100%; aspect-ratio: 1; display: grid; place-items: center; }
.motion-card-preview { padding: 0; border: 0; color: inherit; background: #faf8f0; cursor: pointer; }
.motion-card-preview:hover { background: #fff3c5; }
.motion-card-preview:focus-visible { outline: 2px solid #967600; outline-offset: -2px; }
.motion-card-preview :deep(.asset-image) { width: 100%; height: 100%; background: transparent; font-size: 11px; }
.motion-card-empty { background: #faf9f5; color: #9c906f; font-size: 22px; }
.motion-card-progress { align-content: center; gap: 8px; padding: 8px; background: #fff9e1; color: #6f5600; text-align: center; font-size: 11px; }
.motion-card-progress progress { width: min(100%,78px); height: 7px; accent-color: #b68c00; }
.motion-card-label { display: grid; grid-template-rows: minmax(18px,auto) 15px; justify-items: center; gap: 3px; padding: 8px 4px; text-align: center; }
.motion-card-label strong { color: #2d3742; font-size: 12px; font-weight: 600; }
.motion-card-label small { color: #69727b; font-size: 10px; }
@media (max-width: 1250px) { .seated-grid { grid-template-columns: repeat(5,minmax(0,1fr)); } }
@media (max-width: 1100px) { .motion-card-grid:not(.interactive-grid) { grid-template-columns: repeat(4,minmax(0,1fr)); } }
@media (max-width: 540px) { .motion-card-grid:not(.interactive-grid) { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Film, VideoPlay } from '@element-plus/icons-vue'
import AssetImage from '../components/AssetImage.vue'
import { api, apiUrl } from '../lib/api'
import type { Asset, Pet, User } from '../lib/types'
import type { PersonalStory, StoryDetail, StorySummary } from './business'

const props = defineProps<{user:User|null; pets:Pet[]; preferredPetId:string; focusId:string|null; showMine:boolean}>()
const emit = defineEmits<{back:[]; login:[]; create:[]; changed:[]}>()
const mine = ref(props.showMine)
const stories = ref<StorySummary[]>([])
const personal = ref<PersonalStory[]>([])
const liked = ref<string[]>([])
const saved = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const viewer = ref(false)
const viewed = ref<StoryDetail|null>(null)
const viewedPrivateCover = ref<string|null>(null)
const scene = ref(0)
const playing = ref(false)
const editor = ref(false)
const draftId = ref('')
const form = reactive({petId:'',title:'',scenes:'',coverAssetId:null as string|null,publish:false})
const photos = ref<Asset[]>([])
const busy = ref(false)
const copiedLink = ref('')
const sceneTotal = computed(()=>viewed.value?.scenes.length ?? 0)
let timer: ReturnType<typeof setInterval>|undefined
let viewRevision = 0
let loadRevision = 0
let photoRevision = 0

async function load() {
  const version=++loadRevision
  loading.value=true;error.value=''
  try {
    const gallery=await api<{stories:StorySummary[]}>('/h5/stories')
    if (version!==loadRevision) return
    stories.value=gallery.stories
    if (props.user) {
      const [drafts,reactions]=await Promise.all([
        api<{stories:PersonalStory[]}>('/h5/my-stories'),
        api<{likedIds:string[];favorites:StorySummary[]}>('/h5/my-story-reactions'),
      ])
      if (version!==loadRevision) return
      personal.value=drafts.stories;liked.value=reactions.likedIds;saved.value=reactions.favorites.map(item=>item.id)
    }
  } catch(cause) {if (version===loadRevision) error.value=cause instanceof Error?cause.message:'作品读取失败'}
  finally {if (version===loadRevision) loading.value=false}
}
watch(()=>props.user?.id,()=>{
  personal.value=[];liked.value=[];saved.value=[];editor.value=false
  viewedPrivateCover.value=null
  if (viewed.value && (!viewed.value.publishedAt || viewed.value.hidden)) viewer.value=false
  void load()
},{immediate:true})
watch(()=>props.showMine,value=>{mine.value=value})
watch(()=>props.focusId,id=>{if(id) void readStory(id)},{immediate:true})

function view(story:StoryDetail, privateCover:string|null=null) {
  scene.value=0;playing.value=false;copiedLink.value=''
  viewed.value=story;viewedPrivateCover.value=privateCover;viewer.value=true
}
async function readStory(id:string) {
  const version=++viewRevision
  try {
    const {story}=await api<{story:StoryDetail}>('/h5/stories/'+id)
    if (version===viewRevision) view(story)
  } catch(cause) {if (version===viewRevision) ElMessage.error(cause instanceof Error?cause.message:'作品读取失败')}
}
function advance(step:number) {
  scene.value=Math.min(sceneTotal.value-1,Math.max(0,scene.value+step))
  if (scene.value===sceneTotal.value-1) playing.value=false
}
function play() {
  if (playing.value) {playing.value=false;return}
  if (scene.value===sceneTotal.value-1) scene.value=0
  playing.value=true
}
watch(playing,enabled=>{
  clearInterval(timer)
  if (enabled) timer=setInterval(()=>advance(1),3500)
})
watch(viewer,open=>{if (!open) playing.value=false})
onBeforeUnmount(()=>{clearInterval(timer);viewRevision++;loadRevision++;photoRevision++})

function edit(story?:PersonalStory) {
  if (!props.user) {emit('login');return}
  if (!props.pets.length) {emit('create');return}
  draftId.value=story?.id ?? ''
  form.petId=story?.petId ?? props.pets.find(pet=>pet.id===props.preferredPetId)?.id ?? props.pets[0].id
  form.title=story?.title ?? ''
  form.scenes=story?.scenes.join('\n') ?? ''
  form.coverAssetId=story?.coverAssetId ?? null
  form.publish=Boolean(story?.publishedAt)
  editor.value=true
}
watch(()=>[editor.value,form.petId] as const,async ([open,id])=>{
  const version=++photoRevision
  photos.value=[]
  if (!open||!id) return
  try {
    const result=await api<{assets:Asset[]}>('/assets?kind=photo&petId='+id)
    if (version===photoRevision) photos.value=result.assets
  } catch(cause) {if (version===photoRevision) ElMessage.error(cause instanceof Error?cause.message:'照片读取失败')}
})
function useTemplate() {
  const name=props.pets.find(pet=>pet.id===form.petId)?.name ?? '爱宠'
  form.scenes=[name+'发现了一个新地方。','那里发生了什么？写下这次冒险。','最后，'+name+'又回到了熟悉的家。'].join('\n')
}
async function submit() {
  if (!props.user||busy.value) return
  const scenes=form.scenes.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  if (!scenes.length||scenes.length>8||scenes.some(line=>line.length>500)) {
    ElMessage.warning('请填写 1 到 8 幕，每幕最多 500 字');return
  }
  const body={title:form.title,scenes,coverAssetId:form.coverAssetId,publish:form.publish}
  const id=draftId.value
  const owner=props.user.id
  busy.value=true
  try {
    const result = await api<{hidden?:boolean}>(id?'/h5/stories/'+id:'/h5/stories',{method:id?'PUT':'POST',body:id?body:{...body,petId:form.petId}})
    if (props.user?.id!==owner) return
    editor.value=false;mine.value=true
    await load();emit('changed')
    ElMessage.success(result.hidden?'作品已保存，目前仍处于隐藏状态':body.publish?'作品已发布':'私密剧本已保存')
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'作品保存失败')}
  finally {busy.value=false}
}
async function react(kind:'like'|'favorite') {
  if (!props.user) {emit('login');return}
  const story=viewed.value
  if (!story?.publishedAt||busy.value) return
  const selected=kind==='like'?liked:saved
  const active=!selected.value.includes(story.id)
  const owner=props.user.id
  busy.value=true
  try {
    const {likes}=await api<{likes:number}>('/h5/stories/'+story.id+'/reaction',{method:'PUT',body:{kind,active}})
    if (props.user?.id!==owner) return
    selected.value=active?[...selected.value,story.id]:selected.value.filter(id=>id!==story.id)
    story.likes=likes
    const inGallery=stories.value.find(item=>item.id===story.id)
    if (inGallery) inGallery.likes=likes
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'操作失败')}
  finally {busy.value=false}
}
async function share() {
  if (!viewed.value?.publishedAt) return
  const url=new URL(location.href)
  url.searchParams.set('view','h5');url.searchParams.delete('post')
  url.searchParams.set('story',viewed.value.id);url.hash='stories'
  try {
    await navigator.clipboard.writeText(url.href)
    ElMessage.success('作品链接已复制')
  } catch {copiedLink.value=url.href}
}
</script>

<template>
  <div>
    <div class="h5-page-head h5-page-head--yellow h5-program-head">
      <button type="button" class="h5-program-back" aria-label="返回首页" @click="emit('back')"><el-icon><ArrowLeft /></el-icon></button>
      <h1>宠物创作</h1>
    </div>
    <div class="h5-page-content h5-program-stack">
      <div class="h5-business-toolbar">
        <div class="h5-chips" role="group" aria-label="作品分类"><button type="button" :class="{active:!mine}" :aria-pressed="!mine" @click="mine=false">作品广场</button><button type="button" :class="{active:mine}" :aria-pressed="mine" @click="mine=true">我的剧本</button></div>
        <button type="button" class="h5-small-primary" @click="edit()">创作分镜</button>
      </div>
      <div v-if="error" class="h5-empty h5-card" role="status">{{ error }}<button class="h5-text-button" type="button" @click="load">重新加载</button></div>
      <div v-else-if="loading" class="h5-empty h5-card" role="status">正在读取作品…</div>
      <template v-else-if="mine">
        <div v-if="!user" class="h5-empty h5-card"><strong>登录后查看自己的剧本</strong><button class="h5-primary" type="button" @click="emit('login')">登录</button></div>
        <article v-for="story in personal" :key="story.id" class="h5-card h5-program-card">
          <div class="h5-event-heading"><strong>{{ story.title }}</strong><span class="h5-pill">{{ story.hidden?'已隐藏':story.publishedAt?'已发布':'私密草稿' }}</span></div>
          <p class="h5-muted">{{ story.petName }} · {{ story.sceneCount }} 幕</p>
          <div class="h5-business-actions"><button class="h5-text-button" type="button" @click="view(story,story.coverAssetId)">预览分镜</button><button class="h5-text-button" type="button" @click="edit(story)">编辑</button></div>
        </article>
        <div v-if="user&&!personal.length" class="h5-empty h5-card"><strong>还没有创作剧本</strong></div>
      </template>
      <template v-else>
        <div v-if="!stories.length" class="h5-empty h5-card"><el-icon><Film /></el-icon><strong>暂无已发布的作品</strong></div>
        <div v-else class="h5-feed-grid">
          <button v-for="story in stories" :key="story.id" class="h5-card h5-story-tile" type="button" @click="readStory(story.id)">
            <div class="h5-story-art"><img v-if="story.hasCover" :src="apiUrl('/h5/stories/'+story.id+'/cover')" alt="" loading="lazy"><el-icon v-else><Film /></el-icon></div>
            <strong>{{ story.title }}</strong><small>{{ story.author }} · {{ story.sceneCount }} 幕</small>
          </button>
        </div>
      </template>
    </div>

    <el-dialog v-model="editor" :title="draftId?'编辑剧本':'创作宠物剧本'" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <form class="h5-form" @submit.prevent="submit">
        <label>角色宠物<select v-model="form.petId" :disabled="!!draftId" required @change="form.coverAssetId=null"><option v-for="pet in pets" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label>
        <label>标题<input v-model.trim="form.title" maxlength="100" required></label>
        <label>故事分镜<textarea v-model="form.scenes" rows="6" maxlength="4008" placeholder="每行一幕，最多 8 幕" required /></label>
        <button v-if="!form.scenes" type="button" class="h5-text-button" @click="useTemplate">使用三幕模板</button>
        <label>作品封面<select v-model="form.coverAssetId"><option :value="null">纯文字分镜</option><option v-for="photo in photos" :key="photo.id" :value="photo.id">{{ photo.name }}</option></select></label>
        <label class="h5-check"><input v-model="form.publish" type="checkbox"> 公开作品、宠物昵称及所选封面</label>
        <button class="h5-primary" type="submit" :disabled="busy">{{ form.publish?'发布作品':'保存为私密剧本' }}</button>
      </form>
    </el-dialog>
    <el-dialog v-model="viewer" :title="viewed?.title" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <article v-if="viewed" class="h5-program-stack">
        <div class="h5-story-frame">
          <AssetImage v-if="viewedPrivateCover" :id="viewedPrivateCover" alt="" />
          <img v-else-if="viewed.publishedAt&&viewed.hasCover&&!viewed.hidden" :src="apiUrl('/h5/stories/'+viewed.id+'/cover')" alt="">
          <p aria-live="polite">{{ viewed.scenes[scene] }}</p>
        </div>
        <div class="h5-business-toolbar">
          <button class="h5-secondary" type="button" :disabled="!scene" @click="advance(-1)">上一幕</button>
          <small class="h5-muted">{{ scene+1 }} / {{ sceneTotal }}</small>
          <button class="h5-secondary" type="button" :disabled="scene+1>=sceneTotal" @click="advance(1)">下一幕</button>
        </div>
        <div class="h5-business-actions">
          <button v-if="sceneTotal>1" type="button" class="h5-action" @click="play"><el-icon><VideoPlay /></el-icon>{{ playing?'暂停':'连播分镜' }}</button>
          <template v-if="viewed.publishedAt&&!viewed.hidden">
            <button type="button" class="h5-action" :aria-pressed="liked.includes(viewed.id)" @click="react('like')">点赞 {{ viewed.likes }}</button>
            <button type="button" class="h5-action" :aria-pressed="saved.includes(viewed.id)" @click="react('favorite')">收藏</button>
            <button type="button" class="h5-text-button" @click="share">分享</button>
          </template>
        </div>
        <input v-if="copiedLink" class="h5-share-link" aria-label="作品分享链接" :value="copiedLink" readonly>
      </article>
    </el-dialog>
  </div>
</template>

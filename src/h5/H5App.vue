<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowRight, ChatDotRound, CirclePlus, Collection, Compass, Film, FirstAidKit, House, LocationFilled, Postcard, Reading, Search, Share, ShoppingBag, ShoppingCart, Star, StarFilled, Sunny, User as UserIcon } from '@element-plus/icons-vue'
import { areaDistance, h5Areas } from '../../shared/h5-areas.mjs'
import { api, ApiError, apiUrl } from '../lib/api'
import type { Asset, Pet, User } from '../lib/types'
import H5Account from './H5Account.vue'
import H5Auth from './H5Auth.vue'
import H5Cloud from './H5Cloud.vue'
import H5Commerce from './H5Commerce.vue'
import H5Comments from './H5Comments.vue'
import H5Directory from './H5Directory.vue'
import H5Events from './H5Events.vue'
import H5Feed from './H5Feed.vue'
import H5Friends from './H5Friends.vue'
import H5Identity from './H5Identity.vue'
import H5PetEditor from './H5PetEditor.vue'
import H5PetRoom from './H5PetRoom.vue'
import H5Stories from './H5Stories.vue'
import H5Training from './H5Training.vue'
import { productFromListing, type CatalogCategory, type Product } from './catalog'
import { areaLabel, isBusinessModule, type AccountPanel, type Listing, type StorySummary } from './business'
import { examplePosts, feedSorting as sorting, homeEntries, homeSearchKinds as searchKinds, homeSlides } from './home'
import { useShopping } from './shopping'
import type { CloudPet, CloudSection, DemoPet, FeedOrder, H5Post, H5Social, H5Tab, PostTopic } from './types'
import './h5.css'

const asset=(image:string)=>`${import.meta.env.BASE_URL}assets/${image}`
const tabs=[
  {id:'home',label:'首页',icon:House},
  {id:'friends',label:'交友',icon:ChatDotRound},
  {id:'cart',label:'购物车',icon:ShoppingCart},
  {id:'identity',label:'宠物身份证',icon:Postcard},
  {id:'me',label:'我的',icon:UserIcon},
] as const
const entryIcons={Sunny,LocationFilled,ChatDotRound,Film,Star,ShoppingBag,FirstAidKit,Compass,Reading}
const entrances=homeEntries.map(item=>({...item,icon:entryIcons[item.icon]}))
const slides=homeSlides.map(item=>({...item,image:asset(item.image)}))
const examples=examplePosts.map(post=>({...post,exampleImage:asset(post.exampleImage)}))
const emptySocial=():H5Social=>({published:[],favorites:[],likedIds:[],savedIds:[]})

function tabFromHash(): H5Tab {
  const route=location.hash.slice(1)
  if (route==='shop'||route==='cloud'||route==='events'||route==='training'||route==='stories'||isBusinessModule(route)) return route
  return tabs.find(item=>item.id===route)?.id ?? 'home'
}
function storedArea() {
  try { const value=localStorage.getItem('petcloud-h5-area');return h5Areas.some(item=>item.id===value)?value!:'' } catch {return ''}
}

const tab=ref<H5Tab>(tabFromHash())
const cloudReturn=ref<H5Tab>('me')
const currentBusiness=computed(()=>isBusinessModule(tab.value)?tab.value:null)
const navigationTab=computed(()=>{
  const page=tab.value==='cloud' ? cloudReturn.value : tab.value
  return tabs.some(item=>item.id===page) ? page : 'home'
})
const user=ref<User|null>(null)
const demo=ref<DemoPet[]>([])
const personal=ref<Pet[]>([])
const selectedId=ref('')
const cloudSection=ref<CloudSection>('detail')
const booting=ref(true)
const status=ref('')
const authOpen=ref(false)
const editOpen=ref(false)
const editing=ref<Pet|null>(null)
const issuingIdentity=ref(false)
const area=ref(storedArea())
const areaPicker=ref(false)
const locating=ref(false)
const areaError=ref('')
const category=ref<CatalogCategory>('all')
const nearby=ref(false)
const friendsPanel=ref('feed')
const accountRequest=ref<{panel:AccountPanel}|null>(null)
const listingFocus=ref<string|null>(null)
const storyFocus=ref(new URL(location.href).searchParams.get('story'))
const storyMine=ref(false)
const recordsRevision=ref(0)
const postRevision=ref(0)
const catalog=ref<Product[]>([])
const catalogReady=ref(false)
const searchResults=ref<Listing[]>([])
const storyResults=ref<StorySummary[]>([])
const searchLoading=ref(false)
const searchError=ref('')
const shopSearch=ref('')
const venueShopArea=ref('')
const queryInput=ref('')
const query=ref('')
const feedQuery=computed(()=>tab.value==='friends'?'':query.value)
const searchTab=ref<(typeof searchKinds)[number]['id']>('shop')
const slide=ref(0)
const activeSlide=computed(()=>slides[slide.value])
const sortingMode=ref<FeedOrder>('recommended')
const feed=ref<H5Post[]>([])
const feedLoading=ref(false)
const feedError=ref('')
const feedPage=ref(1)
const hasMore=ref(false)
const social=ref<H5Social>(emptySocial())
const detail=ref<H5Post|null>(null)
const detailOpen=ref(false)
const publishing=ref(false)
const postAssets=ref<Asset[]>([])
const publishForm=reactive({petId:'',title:'',body:'',assetId:null as string|null,area:null as string|null,topic:'daily' as PostTopic,consent:false})
const posting=ref(false)
const reactionBusy=ref(false)
let resumeAfterLogin: (()=>void)|undefined
let feedRevision=0
let composeRevision=0
let catalogRevision=0
let searchRevision=0
let touchStart=0
let roomReturn: {tab:H5Tab;section:CloudSection}|undefined

const shopping=useShopping(computed(()=>user.value?.id))
const cloudPets=computed<CloudPet[]>(()=>{
  const owned=new Map(personal.value.map(pet=>[pet.id,pet]))
  const guides=demo.value.map((pet):CloudPet=>{
    const match=owned.get(pet.id)
    owned.delete(pet.id)
    return match ? {...match,shared:false,interactiveRoom:pet.interactiveRoom} : {...pet,shared:true}
  })
  return [...guides,...[...owned.values()].map(pet=>({...pet,shared:false as const}))]
})
const currentPet=computed(()=>cloudPets.value.find(pet=>pet.id===selectedId.value))
const landscapePet=computed(()=>tab.value==='cloud' && cloudSection.value==='space' && currentPet.value?.interactiveRoom ? currentPet.value : undefined)
const areaName=computed(()=>h5Areas.find(item=>item.id===area.value)?.label??'选择商圈')
const shopArea=computed(()=>venueShopArea.value||area.value)
const shopAreaName=computed(()=>h5Areas.find(item=>item.id===shopArea.value)?.label??'选择商圈')
const displayedPosts=computed(()=>feed.value.length || feedQuery.value || sortingMode.value==='near' || feedLoading.value || feedError.value ? feed.value : examples)

function ensureSelection() {
  if (!cloudPets.value.some(pet=>pet.id===selectedId.value)) selectedId.value=personal.value[0]?.id??demo.value[0]?.id??''
}

function navigate(next:H5Tab) {
  if (next!=='me') accountRequest.value=null
  tab.value=next
  if (location.hash!=='#'+next) location.hash=next
  window.scrollTo(0,0)
}
function onHash() {
  tab.value=tabFromHash()
  if (tab.value!=='me') accountRequest.value=null
  window.scrollTo(0,0)
}
function goHome() {clearSearch();navigate('home')}
function requireUser(work?:()=>void) {
  if (user.value) { work?.(); return }
  resumeAfterLogin=work
  authOpen.value=true
}
function login() { requireUser() }
function openAccount(panel:AccountPanel) {
  requireUser(()=>{accountRequest.value={panel};navigate('me')})
}

async function loadDemo() {
  try { const {pets}=await api<{pets:DemoPet[]}>('/h5/demo-pets');demo.value=pets;ensureSelection() }
  catch(error) { status.value=error instanceof Error?error.message:'共享档案暂不可用' }
}
async function refreshPets() {
  const owner=user.value?.id
  if (!owner) return
  try {
    const {pets}=await api<{pets:Pet[]}>('/pets')
    if(user.value?.id===owner) {personal.value=pets;ensureSelection()}
  } catch(error) { if(user.value?.id===owner) status.value=error instanceof Error?error.message:'宠物档案读取失败' }
}
async function refreshSocial() {
  const owner=user.value?.id
  if (!owner) return
  try { const state=await api<H5Social>('/h5/me');if(user.value?.id===owner)social.value=state }
  catch(error) { if(user.value?.id===owner) status.value=error instanceof Error?error.message:'动态记录读取失败' }
}
function clearSession() {
  if(!user.value)return
  user.value=null;personal.value=[];social.value=emptySocial();selectedId.value=''
  accountRequest.value=null
  editOpen.value=false;publishing.value=false;ensureSelection()
}
async function signed(next:User) {
  user.value=next;status.value=''
  const intent=resumeAfterLogin;resumeAfterLogin=undefined
  await Promise.all([refreshPets(),refreshSocial()])
  if (user.value?.id===next.id) {
    if (personal.value.length && currentPet.value?.shared!==false) selectedId.value=personal.value[0].id
    intent?.()
  }
}

function openShop(next:CatalogCategory='all',closeBy=false,search='',venueArea='') {
  category.value=next;nearby.value=closeBy;shopSearch.value=search;venueShopArea.value=venueArea
  navigate('shop')
}
function nearbyFilter(value:boolean) {
  nearby.value=value
  if(value&&!shopArea.value)areaPicker.value=true
}
function openCloud(section:CloudSection,petId?:string) {
  const pet = petId ? cloudPets.value.find(item=>item.id===petId) : currentPet.value
  if (tab.value!=='cloud') cloudReturn.value=tab.value
  if (section==='space' && pet?.interactiveRoom && !landscapePet.value) roomReturn={tab:tab.value,section:cloudSection.value}
  if (petId) selectedId.value=petId
  cloudSection.value=section
  navigate('cloud')
}
function openPetRecords() {
  requireUser(()=>{
    const pet=personal.value.find(item=>item.id===selectedId.value)??personal.value[0]
    if (pet) openCloud('detail',pet.id)
    else addPet()
  })
}
function openPetHealth() {
  const pet=currentPet.value?.shared===false ? currentPet.value : personal.value[0]
  if (pet) openCloud('health',pet.id)
  else openPetRecords()
}
function closeCloudSection() {
  if (cloudSection.value==='detail') navigate(cloudReturn.value)
  else openCloud('detail')
}
function closeRoom() {
  const back = roomReturn
  roomReturn=undefined
  if (!back) {goHome();return}
  if (back.tab==='cloud') cloudSection.value=back.section==='space' ? 'detail' : back.section
  navigate(back.tab)
}
function addPet() {
  requireUser(()=>{
    if (personal.value.length>=3) {ElMessage.info('每个账号最多保留 3 个宠物档案');return}
    issuingIdentity.value=false;editing.value=null;editOpen.value=true
  })
}
function editPet(pet:Pet) { issuingIdentity.value=false;editing.value=pet;editOpen.value=true }
function registerIdentity(pet?:CloudPet) {
  requireUser(()=>{
    if (pet?.shared || pet?.identityNumber) return
    if (!pet && personal.value.length>=3) {ElMessage.info('每个账号最多保留 3 个宠物档案');return}
    issuingIdentity.value=true
    editing.value=pet??null
    editOpen.value=true
  })
}
function savedPet(pet:Pet) {
  personal.value=[pet,...personal.value.filter(item=>item.id!==pet.id)]
  selectedId.value=pet.id
  if (issuingIdentity.value) navigate('identity')
  else if (tab.value==='me') openPetRecords()
  else if (tab.value==='home') navigate('identity')
}

function handleEntry(id:(typeof entrances)[number]['id']|(typeof slides)[number]['action']) {
  listingFocus.value=null
  if (id==='shop') openShop()
  else if (id==='stories') openStories()
  else {
    if(id==='friends') friendsPanel.value='feed'
    navigate(id)
  }
}
function openListing(item:Listing) {
  if (item.module==='shop') {openShop('all',false,item.title);return}
  if (item.module==='friends') {friendsPanel.value='groups';navigate('friends');return}
  listingFocus.value=item.id;navigate(item.module)
}
function openStories(id:string|null=null,mine=false) {
  storyFocus.value=id;storyMine.value=mine;navigate('stories')
}
function addCatalogProduct(item:Listing) {
  const product=productFromListing(item)
  if(!product) return
  requireUser(()=>{
    if (!catalog.value.some(existing=>existing.id===product.id)) catalog.value=[product,...catalog.value]
    if (shopping.add(product,0)) ElMessage.success('已加入购物车')
    else ElMessage.info('该商品暂时没有库存')
  })
}
function openCreator() {friendsPanel.value='creators';navigate('friends')}
function recordChanged() {recordsRevision.value++}
function operationsChanged() {recordChanged();void loadCatalog()}
function orderPlaced() {void loadCatalog();openAccount('orders')}

async function loadCatalog() {
  const version=++catalogRevision
  try {
    const {listings}=await api<{listings:Listing[]}>('/h5/catalog?kind=product')
    if (version!==catalogRevision) return
    catalog.value=listings.flatMap(item=>{const product=productFromListing(item);return product?[product]:[]})
    catalogReady.value=true
  } catch {
    if (version===catalogRevision) catalogReady.value=false
  }
}
async function searchPrograms() {
  const version=++searchRevision
  searchError.value='';searchLoading.value=false;searchResults.value=[];storyResults.value=[]
  if (!query.value || !['services','stories'].includes(searchTab.value)) return
  const params=new URLSearchParams({q:query.value})
  searchLoading.value=true
  try {
    if (searchTab.value==='services') {
      if (area.value) params.set('area',area.value)
      const {listings}=await api<{listings:Listing[]}>('/h5/catalog?'+params)
      if (version===searchRevision) searchResults.value=listings.filter(item=>item.kind!=='product')
    } else {
      const {stories}=await api<{stories:StorySummary[]}>('/h5/stories?'+params)
      if (version===searchRevision) storyResults.value=stories
    }
  } catch(cause) {if (version===searchRevision) searchError.value=cause instanceof Error?cause.message:'搜索失败'}
  finally {if (version===searchRevision) searchLoading.value=false}
}
function applyArea(id:string) {
  venueShopArea.value=''
  area.value=id;areaPicker.value=false;areaError.value=''
  if(!id)nearby.value=false
  try { localStorage.setItem('petcloud-h5-area',id) } catch { /* Storage is optional. */ }
}
function locate() {
  if(!navigator.geolocation) {areaError.value='请手动选择商圈';return}
  areaError.value='';locating.value=true
  navigator.geolocation.getCurrentPosition(({coords})=>{
    const nearest=[...h5Areas].sort((a,b)=>areaDistance(coords,a)-areaDistance(coords,b))[0]
    if(areaDistance(coords,nearest)<40) applyArea(nearest.id)
    else areaError.value='附近暂未配置商圈，请手动选择'
    locating.value=false
  },()=>{areaError.value='定位未完成，可手动选择商圈';locating.value=false},{timeout:8000})
}
function slideSwipe(event:TouchEvent) {
  const movement=event.changedTouches[0].clientX-touchStart
  if(Math.abs(movement)>36)slide.value=(slide.value+(movement<0?1:-1)+slides.length)%slides.length
}
function search() { query.value=queryInput.value.trim().slice(0,60);searchTab.value='shop' }
function clearSearch() { queryInput.value='';query.value='' }
function order(next:FeedOrder) {
  sortingMode.value=next
  if(next==='near'&&!area.value)areaPicker.value=true
}

async function loadFeed(append=false) {
  const version=++feedRevision
  if(sortingMode.value==='near'&&!area.value) {
    feed.value=[];feedLoading.value=false;feedError.value='';hasMore.value=false;return
  }
  const page=append?feedPage.value+1:1
  feedLoading.value=true;feedError.value=''
  if(!append)feed.value=[]
  try {
    const params=new URLSearchParams({sort:sortingMode.value,page:String(page)})
    if(area.value)params.set('area',area.value)
    if(feedQuery.value)params.set('q',feedQuery.value)
    if(currentPet.value)params.set('species',currentPet.value.species)
    const result=await api<{posts:H5Post[];hasMore:boolean}>(`/h5/posts?${params}`)
    if(version!==feedRevision)return
    feed.value=append?[...feed.value,...result.posts.filter(post=>!feed.value.some(item=>item.id===post.id))]:result.posts
    hasMore.value=result.hasMore;feedPage.value=page
  } catch(error) {
    if(version===feedRevision)feedError.value=error instanceof Error?error.message:'动态读取失败'
  } finally {if(version===feedRevision)feedLoading.value=false}
}

watch([sortingMode,area,feedQuery,()=>currentPet.value?.species],()=>{void loadFeed()})
watch([searchTab,query,area],()=>{void searchPrograms()})
watch(()=>publishForm.petId,async id=>{
  const version=++composeRevision
  postAssets.value=[];publishForm.assetId=null
  if(!id||!publishing.value)return
  try {
    const {assets}=await api<{assets:Asset[]}>(`/assets?petId=${id}&kind=photo`)
    if(version===composeRevision)postAssets.value=assets
  } catch(error) { if(version===composeRevision)ElMessage.error(error instanceof Error?error.message:'照片读取失败') }
})
watch(publishing,open=>{if(!open){composeRevision++;publishForm.petId='';postAssets.value=[]}})

function beginPost(topic:PostTopic='daily') {
  requireUser(()=>{
    if(!personal.value.length) {addPet();return}
    publishing.value=true
    Object.assign(publishForm,{petId:currentPet.value?.shared===false?currentPet.value.id:personal.value[0].id,title:'',body:'',assetId:null,area:null,topic,consent:false})
  })
}
function openPost(post:H5Post) { detail.value={...post};detailOpen.value=true }
async function openPostId(id:string) {
  try {const {post}=await api<{post:H5Post}>('/h5/posts/'+id);openPost(post)}
  catch(error) {ElMessage.info(error instanceof Error?error.message:'动态不存在')}
}
const ownsDetail=computed(()=>Boolean(detail.value && social.value.published.some(post=>post.id===detail.value?.id)))

async function publishPost() {
  if(!user.value||posting.value||!publishForm.consent)return
  posting.value=true
  const destination=publishForm.topic==='travel'?'travel':publishForm.topic==='rescue'?'charity':tab.value==='friends'?'friends':'home'
  try {
    const {consent:_,...input}=publishForm
    const {post}=await api<{post:H5Post}>('/h5/posts',{method:'POST',body:input})
    if (destination==='home') clearSearch()
    publishing.value=false;sortingMode.value='latest';navigate(destination);openPost(post)
    postRevision.value++
    await Promise.all([refreshSocial(),loadFeed()]);ElMessage.success('动态已发布')
  } catch(error) {ElMessage.error(error instanceof Error?error.message:'发布失败')}
  finally{posting.value=false}
}

function reactTo(post:H5Post,kind:'like'|'favorite') {
  requireUser(()=>{void setReaction(post,kind)})
}
async function setReaction(post:H5Post,kind:'like'|'favorite') {
  if(!user.value||post.exampleImage||reactionBusy.value)return
  const owner=user.value.id
  reactionBusy.value=true
  try {
    const ids=kind==='like'?social.value.likedIds:social.value.savedIds
    const {likes}=await api<{likes:number}>(`/h5/posts/${post.id}/reaction`,{method:'PUT',body:{kind,active:!ids.includes(post.id)}})
    if(user.value?.id!==owner)return
    for(const item of feed.value) if(item.id===post.id)item.likes=likes
    if(detail.value?.id===post.id)detail.value.likes=likes
    if (post.topic==='travel' || post.topic==='rescue') postRevision.value++
    await refreshSocial()
  } catch(error) {ElMessage.error(error instanceof Error?error.message:'操作失败')}
  finally{reactionBusy.value=false}
}

async function deletePost() {
  const post=detail.value
  if(!post||!ownsDetail.value)return
  try {await ElMessageBox.confirm('删除这条公开动态？','删除动态',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})} catch{return}
  try {
    await api(`/h5/posts/${post.id}`,{method:'DELETE',body:{}})
    detailOpen.value=false;postRevision.value++;await Promise.all([refreshSocial(),loadFeed()]);ElMessage.success('动态已删除')
  } catch(error) {ElMessage.error(error instanceof Error?error.message:'删除失败')}
}

const shareLink=ref('')
async function sharePost(post:H5Post) {
  const url=new URL(location.href)
  url.searchParams.set('view','h5');url.searchParams.set('post',post.id);url.hash='home'
  try {
    if(navigator.share) await navigator.share({title:post.title,url:url.href})
    else if(navigator.clipboard) {await navigator.clipboard.writeText(url.href);ElMessage.success('链接已复制')}
    else shareLink.value=url.href
  } catch(error) {if(!(error instanceof Error && error.name==='AbortError'))shareLink.value=url.href}
}
watch(detailOpen,open=>{if(!open)shareLink.value=''})

onMounted(async()=>{
  window.addEventListener('hashchange',onHash)
  window.addEventListener('petcloud:unauthorized',clearSession)
  const demoTask=loadDemo()
  void loadFeed()
  void loadCatalog()
  try {const session=await api<{user:User}>('/auth/me');await signed(session.user)}
  catch(error){if(!(error instanceof ApiError&&error.status===401))status.value=error instanceof Error?error.message:'登录状态读取失败'}
  await demoTask
  ensureSelection()
  booting.value=false
  const postId=new URL(location.href).searchParams.get('post')
  if(postId && /^[a-f0-9-]{36}$/i.test(postId)) {
    await openPostId(postId)
  }
})
onBeforeUnmount(()=>{
  window.removeEventListener('hashchange',onHash);window.removeEventListener('petcloud:unauthorized',clearSession)
  feedRevision++;composeRevision++;catalogRevision++;searchRevision++
})
</script>

<template>
  <H5PetRoom v-if="landscapePet" :key="landscapePet.id" :pet-id="landscapePet.id" :pet-name="landscapePet.name" @exit="closeRoom" />
  <div v-else class="h5-frame">
    <main class="h5-main">
      <el-alert v-if="status" class="h5-status" type="error" :title="status" show-icon @close="status=''" />
      <template v-if="tab==='home'||tab==='friends'">
        <template v-if="tab==='home'">
          <div class="h5-top">
            <form class="h5-search" role="search" @submit.prevent="search"><el-icon><Search /></el-icon><input v-model="queryInput" aria-label="搜索" maxlength="60" type="search" placeholder="搜服务、商品或动态" @search="!queryInput && clearSearch()"><button type="submit">搜索</button></form>
            <button type="button" class="h5-location" :aria-label="'切换商圈，'+areaName" @click="areaPicker=true"><el-icon><LocationFilled /></el-icon><span>{{ areaName }}</span><el-icon><ArrowDown /></el-icon></button>
          </div>
          <template v-if="!query">
            <div class="h5-entrances-wrap">
              <nav class="h5-entrances h5-card" aria-label="九大业务入口">
                <button v-for="item in entrances" :key="item.id" type="button" @click="handleEntry(item.id)">
                  <span class="h5-entry-icon" :data-tone="item.tone"><el-icon><component :is="item.icon" /></el-icon></span>
                  <span>{{ item.label }}</span>
                </button>
              </nav>
            </div>
            <section class="h5-hero-wrap" aria-label="轮播图">
              <div class="h5-hero" :class="{'h5-hero--training':activeSlide.action==='training','h5-hero--community':activeSlide.action==='events'}" :style="{backgroundImage:'url('+activeSlide.image+')'}" @touchstart.passive="touchStart=$event.touches[0].clientX" @touchend.passive="slideSwipe">
                <div class="h5-hero-copy"><span>宠物数字永生•云上空间</span><h1>{{ activeSlide.title }}</h1><p>{{ activeSlide.line }}</p><button type="button" @click="handleEntry(activeSlide.action)">{{ activeSlide.cta }} <el-icon><ArrowRight /></el-icon></button></div>
                <div class="h5-carousel-dots"><button v-for="(item,index) in slides" :key="item.title" type="button" :aria-pressed="slide===index" :aria-label="item.title" @click="slide=index"></button></div>
              </div>
            </section>
          </template>
          <div v-else class="h5-search-tabs"><div class="h5-chips" role="group" aria-label="搜索分类"><button v-for="kind in searchKinds" :key="kind.id" type="button" :class="{active:searchTab===kind.id}" :aria-pressed="searchTab===kind.id" @click="searchTab=kind.id">{{ kind.name }}</button></div><button class="h5-text-button" type="button" @click="clearSearch">返回首页</button></div>
        </template>
        <template v-else>
          <h1 class="visually-hidden">交友</h1>
          <H5Friends v-model="friendsPanel" :user="user" :pets="personal" :preferred-pet-id="selectedId" :area="area"
            @choose-area="areaPicker=true" @login="login" @create="addPet" @post="openPostId" @publish="beginPost()" />
        </template>
        <div v-if="tab==='home' && query && searchTab==='shop'" class="h5-page-content"><H5Commerce page="shop" :shopping="shopping" :area="area" category="all" :nearby="false" :search="query"
          :catalog="catalog" :catalog-ready="catalogReady" :user="user" @cart="navigate('cart')" @login="login" /></div>
        <div v-else-if="tab==='home' && query && (searchTab==='services'||searchTab==='stories')" class="h5-page-content h5-program-stack">
          <div v-if="searchError" class="h5-card h5-empty" role="status">{{ searchError }}<button type="button" class="h5-text-button" @click="searchPrograms">重试</button></div>
          <div v-else-if="searchLoading" class="h5-card h5-empty" role="status">正在搜索…</div>
          <template v-else-if="searchTab==='services'">
            <button v-for="item in searchResults" :key="item.id" type="button" class="h5-card h5-program-card h5-event-link" @click="openListing(item)">
              <strong>{{ item.title }}</strong><span class="h5-muted">{{ [item.provider,areaLabel(item.area)].filter(Boolean).join(' · ') }}</span>
            </button>
            <div v-if="!searchResults.length" class="h5-card h5-empty">没有匹配的项目</div>
          </template>
          <template v-else>
            <button v-for="item in storyResults" :key="item.id" type="button" class="h5-card h5-program-card h5-event-link" @click="openStories(item.id)">
              <strong>{{ item.title }}</strong><span class="h5-muted">{{ item.author }} · {{ item.sceneCount }} 幕</span>
            </button>
            <div v-if="!storyResults.length" class="h5-card h5-empty">没有匹配的短剧</div>
          </template>
        </div>
        <section v-else-if="tab==='home'||friendsPanel==='feed'" class="h5-feed h5-page-content">
          <div class="h5-section-title"><h2>{{ feedQuery?'动态搜索结果':'宠物动态' }}</h2><button class="h5-text-button" type="button" @click="beginPost()"><el-icon><CirclePlus /></el-icon> 发布</button></div>
          <div class="h5-sort" aria-label="宠物动态排序"><button v-for="item in sorting" :key="item.id" type="button" :aria-pressed="sortingMode===item.id" @click="order(item.id)">{{ item.name }}</button></div>
          <div v-if="feedError" class="h5-card h5-empty"><p>{{ feedError }}</p><button type="button" class="h5-text-button" @click="loadFeed()">重新加载</button></div>
          <H5Feed v-else-if="displayedPosts.length" :posts="displayedPosts" :liked="social.likedIds" :area-visible="sortingMode==='near'" @view="openPost" @like="reactTo($event,'like')" />
          <div v-else class="h5-card h5-empty" role="status"><strong>{{ feedLoading?'正在加载动态…':sortingMode==='near'&&!area?'选择商圈后查看附近动态':feedQuery?'没有匹配的动态':'还没有动态' }}</strong><button v-if="sortingMode==='near'&&!area" class="h5-text-button" type="button" @click="areaPicker=true">选择商圈</button></div>
          <button v-if="hasMore && !feedError" class="h5-more h5-secondary" type="button" :disabled="feedLoading" @click="loadFeed(true)">{{ feedLoading?'加载中…':'加载更多动态' }}</button>
        </section>
      </template>
      <template v-else-if="tab==='shop'||tab==='cart'">
        <div v-if="tab==='shop'" class="h5-page-head h5-page-head--yellow">
          <h1>宠物品牌超市</h1>
          <button type="button" class="h5-location" @click="areaPicker=true"><el-icon><LocationFilled /></el-icon>{{ shopAreaName }}<el-icon><ArrowDown /></el-icon></button>
        </div>
        <h1 v-else class="visually-hidden">购物车</h1>
        <div class="h5-page-content" :class="{'h5-page-content--top':tab==='cart'}">
          <div v-if="tab==='shop'&&shopSearch" class="h5-market-label"><span>{{ shopSearch }}</span><button class="h5-text-button" type="button" @click="shopSearch=''">查看全部</button></div>
          <H5Commerce :key="tab" :page="tab" :shopping="shopping" :area="tab==='shop'?shopArea:area" :category="category" :nearby="nearby" :search="tab==='shop'?shopSearch:''"
            :catalog="catalog" :catalog-ready="catalogReady" :user="user" @category="category=$event" @nearby="nearbyFilter" @shop="openShop()" @cart="navigate('cart')"
            @login="login" @orders="openAccount('orders')" @ordered="orderPlaced" />
        </div>
      </template>
      <H5Events v-else-if="tab==='events'" :user="user" :pets="personal" :preferred-pet-id="selectedId"
        :account-loading="booting" @back="goHome" @identity="navigate('identity')" @login="login"
        @create="addPet" @market="openShop('all',true,'',$event)" />
      <H5Training v-else-if="tab==='training'" @back="goHome" />
      <H5Directory v-else-if="currentBusiness" :key="currentBusiness" :module="currentBusiness" :area="area" :user="user"
        :pets="personal" :preferred-pet-id="selectedId" :item-id="listingFocus" :post-revision="postRevision" :liked="social.likedIds"
        @back="goHome" @choose-area="areaPicker=true" @login="login" @create="addPet"
        @shop="openShop('all',Boolean(area))" @cart="addCatalogProduct" @records="openAccount" @health="openPetHealth" @changed="recordChanged"
        @publish="beginPost" @post="openPost" @like="reactTo($event,'like')" />
      <H5Stories v-else-if="tab==='stories'" :user="user" :pets="personal" :preferred-pet-id="selectedId"
        :focus-id="storyFocus" :show-mine="storyMine" @back="goHome" @login="login" @create="addPet"
        @changed="recordChanged" />
      <H5Identity v-else-if="tab==='identity'" :pets="cloudPets" :pet="currentPet" :loading="booting"
        @select="selectedId=$event" @detail="openCloud('detail',$event)" @create="registerIdentity()" @enroll="registerIdentity" />
      <H5Cloud v-else-if="tab==='cloud'" :pets="cloudPets" :selected-id="selectedId" :user="user"
        :section="cloudSection" :loading="booting" :records-revision="recordsRevision"
        @select="selectedId=$event" @section="openCloud" @back="closeCloudSection" @identity="navigate('identity')"
        @create="addPet" @edit="editPet" @changed="refreshPets"
        @story="openStories($event,!$event)" @post="openPostId" />
      <H5Account v-else :user="user" :pet-count="personal.length" :social="social" :shopping="shopping" :catalog="catalog" :request="accountRequest"
        @login="login" @cloud="openPetRecords" @create="addPet" @post="openPost" @product="openShop('all',false,$event)"
        @story="openStories($event,!$event)" @creator="openCreator" @refresh-catalog="loadCatalog" @operation-changed="operationsChanged" @updated="user=$event" @logout="clearSession" />
    </main>

    <nav class="h5-navbar" aria-label="底部导航">
      <button v-for="item in tabs" :key="item.id" type="button"
        :class="{active:navigationTab===item.id,'h5-nav-identity':item.id==='identity'}"
        :aria-current="navigationTab===item.id?'page':undefined" @click="item.id==='home'?goHome():navigate(item.id)">
        <span><el-icon><component :is="item.icon" /></el-icon><small v-if="item.id==='cart' && shopping.count" class="h5-cart-badge">{{ Math.min(shopping.count,99) }}<template v-if="shopping.count>99">+</template></small></span>{{ item.label }}
      </button>
    </nav>

    <H5Auth v-model="authOpen" @signed="signed" />
    <H5PetEditor v-model="editOpen" :pet="editing" :issue-identity="issuingIdentity" @saved="savedPet" />

    <el-dialog v-model="areaPicker" title="选择商圈" class="h5-dialog" width="min(460px,92vw)" append-to-body>
      <button type="button" class="h5-secondary h5-locate" :disabled="locating" @click="locate"><el-icon><LocationFilled /></el-icon> {{ locating?'正在定位…':'使用当前位置' }}</button>
      <p v-if="areaError" class="h5-muted" role="status">{{ areaError }}</p>
      <div class="h5-simple-list"><button type="button" @click="applyArea('')">全部商圈</button><button v-for="item in h5Areas" :key="item.id" type="button" @click="applyArea(item.id)">{{ item.label }}<span v-if="item.id===(tab==='shop'?shopArea:area)">当前</span></button></div>
    </el-dialog>

    <el-dialog v-model="publishing" :title="publishForm.topic==='travel'?'分享带宠攻略':publishForm.topic==='rescue'?'发布救助信息':'发布宠物动态'" class="h5-dialog" width="min(460px,92vw)" append-to-body destroy-on-close>
      <form class="h5-form" @submit.prevent="publishPost">
        <label>发布宠物<select v-model="publishForm.petId" required><option v-for="pet in personal" :key="pet.id" :value="pet.id">{{ pet.name }}</option></select></label>
        <label>标题<input v-model.trim="publishForm.title" required maxlength="100" placeholder="今天想分享什么？"></label>
        <label>正文<textarea v-model="publishForm.body" rows="3" maxlength="3000" /></label>
        <label>公开照片<select v-model="publishForm.assetId"><option :value="null">仅分享文字</option><option v-for="asset in postAssets" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select></label>
        <label>公开商圈<select v-model="publishForm.area"><option :value="null">不显示商圈</option><option v-for="item in h5Areas" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        <label class="h5-check"><input v-model="publishForm.consent" required type="checkbox"> 确认公开这条动态</label>
        <button class="h5-primary" type="submit" :disabled="posting">{{ posting?'正在发布…':'发布动态' }}</button>
      </form>
    </el-dialog>

    <el-dialog v-model="detailOpen" :title="detail?.title" class="h5-dialog" width="min(480px,92vw)" append-to-body destroy-on-close>
      <article v-if="detail" class="h5-post-detail">
        <img v-if="detail.hasImage||detail.exampleImage" :src="detail.exampleImage || apiUrl('/h5/posts/'+detail.id+'/image')" alt="宠物动态照片">
        <div class="h5-post-meta"><b>{{ detail.petName }}</b><span>{{ detail.author }}</span><span v-if="detail.area">{{ h5Areas.find(area=>area.id===detail?.area)?.label }}</span></div>
        <p v-if="detail.hidden" class="h5-muted">这条动态已隐藏</p>
        <p v-if="detail.body">{{ detail.body }}</p>
        <div v-if="!detail.exampleImage" class="h5-post-actions">
          <template v-if="!detail.hidden">
            <button type="button" class="h5-action" :aria-pressed="social.likedIds.includes(detail.id)" @click="reactTo(detail,'like')"><el-icon><component :is="social.likedIds.includes(detail.id)?StarFilled:Star" /></el-icon> 点赞 {{ detail.likes }}</button>
            <button type="button" class="h5-action" :aria-pressed="social.savedIds.includes(detail.id)" @click="reactTo(detail,'favorite')"><el-icon><Collection /></el-icon> 收藏</button>
            <button type="button" class="h5-action" @click="sharePost(detail)"><el-icon><Share /></el-icon> 分享</button>
          </template>
          <button v-if="ownsDetail" type="button" class="h5-text-button" @click="deletePost">删除</button>
        </div>
        <input v-if="shareLink" class="h5-share-link" aria-label="要分享的动态链接" :value="shareLink" readonly @focus="($event.target as HTMLInputElement).select()">
        <H5Comments v-if="!detail.exampleImage&&!detail.hidden" :key="detail.id" :post-id="detail.id" :user="user" @login="login" />
      </article>
    </el-dialog>
  </div>
</template>

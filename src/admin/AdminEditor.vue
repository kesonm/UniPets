<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { api, ApiError, apiUrl } from '../lib/api'
import { detailTitle, genderNames, kinds, listingGroups, speciesNames, type AdminRecord, type Section, type Store } from './admin'

const props = defineProps<{section:Section;record?:AdminRecord}>()
const emit = defineEmits<{saved:[];close:[];stale:[]}>()
const record = props.record
const account = record && 'username' in record ? record : undefined
const store = record && 'phone' in record ? record : undefined
const pet = record && 'owner' in record ? record : undefined
const item = record && 'storeId' in record ? record : undefined
const content = record && 'hidden' in record ? record : undefined
const product = props.section === 'products'
const busy = ref(false)
const error = ref('')
const detail = ref<{body?:string;scenes?:string[];hasImage:boolean|number}>()
const name = ref(account?.displayName ?? '')
const storeForm = reactive({name:store?.name ?? '',area:store?.area ?? '',address:store?.address ?? '',phone:store?.phone ?? ''})
const petForm = reactive({name:pet?.name ?? '',species:pet?.species ?? 'other',breed:pet?.breed ?? '',
  gender:pet?.gender ?? 'unknown',birthday:pet?.birthday ?? '',notes:pet?.notes ?? ''})

function shanghaiInput(value?: string|null) {
  return value ? new Date(new Date(value).getTime()+8*3600_000).toISOString().slice(0,16) : ''
}
function scheduledAt(value: string, previous?: string|null) {
  if (!value) return null
  return previous && shanghaiInput(previous) === value ? previous : new Date(value+'+08:00').toISOString()
}
const module = item?.module ?? (product ? 'shop' : 'services')
const listing = reactive({
  module,category:item?.category ?? listingGroups[module].categories[0].id,
  kind:item?.kind ?? (product ? 'product' : 'appointment'),
  title:item?.title ?? '',provider:item?.provider ?? '',description:item?.description ?? '',
  area:item?.area ?? '',venue:item?.venue ?? '',storeId:item?.storeId ?? '',
  startsAt:shanghaiInput(item?.startsAt),closesAt:shanghaiInput(item?.closesAt),externalUrl:item?.externalUrl ?? '',
  price:item?.priceCents != null ? (item.priceCents/100).toFixed(2) : '',
  stock:item?.stock != null ? String(item.stock) : '',published:Boolean(item?.published),
})
const moduleOptions = (Object.keys(listingGroups) as (keyof typeof listingGroups)[])
  .filter(group => group!=='friends' && (product || group!=='shop'))
const listingCategories = computed(() => {
  const choices = [...listingGroups[listing.module].categories]
  return choices.some(choice => choice.id===listing.category) ? choices : [...choices,{id:listing.category,label:listing.category}]
})
const serviceKinds = ['appointment','enrollment','article','link'] as const
type StoreChoice = Pick<Store,'id'|'name'|'enabled'>
const stores = ref<StoreChoice[]>([])
const selectedStore = ref<StoreChoice|null>(item?.storeId ? {id:item.storeId,name:item.storeName ?? '已关联门店',enabled:item.storeEnabled ?? true} : null)
const storeOptions = computed(() => selectedStore.value && !stores.value.some(option => option.id===selectedStore.value?.id)
  ? [selectedStore.value,...stores.value] : stores.value)
const storeBusy = ref(false)
const storeError = ref('')
let storeRevision = 0

async function findStores(q = '') {
  const current = ++storeRevision
  storeBusy.value = true
  storeError.value = ''
  try {
    const result = await api<{items:StoreChoice[]}>('/admin/stores?'+new URLSearchParams({q}))
    if (current === storeRevision) stores.value = result.items
  } catch (cause) {
    if (current === storeRevision) storeError.value = cause instanceof Error ? cause.message : '门店读取失败'
  } finally {
    if (current === storeRevision) storeBusy.value = false
  }
}

function selectStore(id: string) {
  selectedStore.value = storeOptions.value.find(option => option.id===id) ?? null
}

async function readContent() {
  if (!content) return
  error.value = ''
  try {
    detail.value = (await api<{record:NonNullable<typeof detail.value>}>('/admin/'+props.section+'/'+content.id)).record
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '内容读取失败'
  }
}
const media = computed(() => content && apiUrl('/admin/'+props.section+'/'+content.id+(props.section==='posts' ? '/image' : '/cover')))

function formValues() {
  if (account) return {displayName:name.value}
  if (pet) return {...petForm,birthday:petForm.birthday || null}
  if (props.section === 'stores') return {...storeForm,area:storeForm.area || null}
  const {price,stock,startsAt,closesAt,...fields} = listing
  return {...fields,area:fields.area || null,venue:fields.venue || null,storeId:fields.storeId || null,
    startsAt:scheduledAt(startsAt,item?.startsAt),closesAt:scheduledAt(closesAt,item?.closesAt),
    priceCents:price==='' ? null : Math.round(Number(price)*100),stock:stock==='' ? null : Number(stock),
    externalUrl:fields.externalUrl || null,...(item ? {updatedAt:item.updatedAt,expectedStock:item.stock} : {})}
}

async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const method = account ? 'PATCH' : record ? 'PUT' : 'POST'
  try {
    await api('/admin/'+props.section+(record ? '/'+record.id : ''),{method,body:formValues()})
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
    if (cause instanceof ApiError && cause.status===409) emit('stale')
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  if (content) void readContent()
  if (props.section === 'products' || props.section === 'services') void findStores()
})
</script>

<template>
  <section v-if="content" class="admin-content-details">
    <div class="admin-content-meta"><span>{{ content.author }}</span><span>{{ content.petName }}</span><span v-if="content.hidden">已隐藏</span></div>
    <h2>{{ detailTitle(content) }}</h2>
    <div v-if="error" role="alert"><p class="admin-error">{{ error }}</p><button class="admin-button" type="button" @click="readContent">重试</button></div>
    <p v-else-if="!detail" role="status">正在读取内容…</p>
    <template v-else>
      <img v-if="detail.hasImage" :src="media" :alt="section==='posts' ? '动态配图' : '作品封面'" class="admin-content-image">
      <p v-if="detail.body">{{ detail.body }}</p>
      <ol v-if="detail.scenes"><li v-for="(scene,index) in detail.scenes" :key="index">{{ scene }}</li></ol>
    </template>
  </section>
  <form v-else class="admin-editor" @submit.prevent="save">
    <template v-if="account">
      <div class="admin-record-identifier">{{ account.username }}</div>
      <label>昵称<input v-model.trim="name" maxlength="40" required></label>
    </template>
    <template v-else-if="section==='stores'">
      <label>门店名称<input v-model.trim="storeForm.name" maxlength="120" required></label>
      <label>所在商圈
        <select v-model="storeForm.area"><option value="">未指定</option><option v-for="area in h5Areas" :key="area.id" :value="area.id">{{ area.label }}</option></select>
      </label>
      <label>门店地址<input v-model.trim="storeForm.address" maxlength="160" autocomplete="street-address"></label>
      <label>联系电话<input v-model.trim="storeForm.phone" type="tel" maxlength="40" autocomplete="tel"></label>
    </template>
    <template v-else-if="pet">
      <div class="admin-record-identifier">{{ pet.owner }} · {{ pet.identityNumber ?? '未登记宠物编号' }}</div>
      <label>宠物名字<input v-model.trim="petForm.name" maxlength="40" required></label>
      <div class="admin-editor-pair">
        <label>种类<select v-model="petForm.species" :disabled="Boolean(pet.identityNumber)">
          <option v-for="(label,id) in speciesNames" :key="id" :value="id">{{ label }}</option>
        </select></label>
        <label>品种<input v-model.trim="petForm.breed" maxlength="80"></label>
        <label>生日<input v-model="petForm.birthday" type="date"></label>
        <label>性别<select v-model="petForm.gender"><option v-for="(label,id) in genderNames" :key="id" :value="id">{{ label }}</option></select></label>
      </div>
      <label>备注<textarea v-model="petForm.notes" rows="4" maxlength="2000"></textarea></label>
    </template>
    <template v-else>
      <label>{{ product ? '商品名称' : '服务名称' }}<input v-model.trim="listing.title" maxlength="120" required></label>
      <div class="admin-editor-pair">
        <label>目录<select v-model="listing.module" @change="listing.category=listingGroups[listing.module].categories[0].id">
          <option v-for="group in moduleOptions" :key="group" :value="group">{{ listingGroups[group].title }}</option>
        </select></label>
        <label>分类<select v-model="listing.category">
          <option v-for="choice in listingCategories" :key="choice.id" :value="choice.id">{{ choice.label }}</option>
        </select></label>
      </div>
      <label v-if="!product">项目类型<select v-model="listing.kind">
        <option v-for="kind in serviceKinds" :key="kind" :value="kind">{{ kinds[kind] }}</option>
      </select></label>
      <label>关联门店
        <el-select v-model="listing.storeId" aria-label="关联门店" filterable remote clearable :value-on-clear="''"
          placeholder="搜索门店名称" :loading="storeBusy" :remote-method="findStores" @change="selectStore">
          <el-option v-for="entry in storeOptions" :key="entry.id" :value="entry.id" :label="entry.name+(entry.enabled ? '' : '（已停用）')" />
        </el-select>
      </label>
      <p v-if="storeError" class="admin-error" role="alert">{{ storeError }} <button class="admin-text-button" type="button" @click="findStores()">重试</button></p>
      <label v-if="!listing.storeId">提供方<input v-model.trim="listing.provider" maxlength="120"></label>
      <label>详情<textarea v-model.trim="listing.description" rows="4" maxlength="5000" required></textarea></label>
      <div class="admin-editor-pair">
        <label>价格（元）<input v-model="listing.price" type="number" min="0.01" max="100000" step="0.01" :required="product"></label>
        <label>{{ product ? '库存' : '名额' }}<input v-model="listing.stock" type="number" min="0" max="100000" step="1" :required="product"></label>
        <label>商圈<select v-model="listing.area">
          <option value="">{{ listing.storeId ? '使用门店商圈' : '未指定' }}</option>
          <option v-for="area in h5Areas" :key="area.id" :value="area.id">{{ area.label }}</option>
        </select></label>
        <label>地点<input v-model.trim="listing.venue" maxlength="160" :placeholder="listing.storeId ? '使用门店地址' : ''"></label>
        <template v-if="!product || listing.startsAt || listing.closesAt">
          <label>服务时间（北京时间）<input v-model="listing.startsAt" type="datetime-local" :required="listing.kind==='appointment'"></label>
          <label>截止时间（北京时间）<input v-model="listing.closesAt" type="datetime-local"></label>
        </template>
      </div>
      <label>官方链接<input v-model.trim="listing.externalUrl" type="url" maxlength="500" placeholder="https://" :required="listing.kind==='link'"></label>
      <label v-if="!item" class="admin-check"><input v-model="listing.published" type="checkbox"> 保存后上架</label>
    </template>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <footer class="admin-editor-actions">
      <button class="admin-button" type="button" :disabled="busy" @click="emit('close')">取消</button>
      <button class="admin-button admin-primary" type="submit" :disabled="busy">{{ busy ? '正在保存…' : '保存' }}</button>
    </footer>
  </form>
</template>

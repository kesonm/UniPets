<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { h5Areas } from '../../shared/h5-areas.mjs'
import type { ServiceCategory } from '../../shared/h5-discovery.mjs'
import { legacyDistricts, type District } from '../../shared/h5-districts.mjs'
import { serviceRegions } from '../../shared/h5-service-regions.mjs'
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
const storeForm = reactive({name:store?.name ?? '',area:store?.area ?? '',districtCode:store?.districtCode ?? '',
  cityCode:store?.cityCode ?? '',address:store?.address ?? '',phone:store?.phone ?? '',
  latitude:store?.latitude?.toString() ?? '', longitude:store?.longitude?.toString() ?? ''})
const cityOptions = serviceRegions.map(province => ({
  value:province.id,label:province.label,
  children:province.cities.length ? province.cities.map(city => ({value:city.id,label:city.label})) : undefined,
}))
const cityPickerProps = {emitPath:false}
const districts = ref<District[]>([])
const selectedDistrict = ref<District>()
const districtBusy = ref(false)
const districtError = ref('')
const locatingStore = ref(false)
const locationStatus = ref('')
const locationError = ref('')
let districtRevision = 0
const districtOptions = computed(() => selectedDistrict.value && !districts.value.some(item => item.id === selectedDistrict.value?.id)
  ? [selectedDistrict.value, ...districts.value] : districts.value)

function districtLabel(district: District) {
  return [...new Set([district.province,district.city,district.name].filter(Boolean))].join(' · ')
}
async function findDistricts(q = '', id = '') {
  const revision = ++districtRevision
  districtBusy.value = true
  districtError.value = ''
  try {
    const params = new URLSearchParams(id ? {id} : {q})
    const {items} = await api<{items:District[]}>('/admin/districts?' + params)
    if (revision !== districtRevision) return
    districts.value = items
    if (id) {
      selectedDistrict.value = items[0]
      if (!storeForm.cityCode && items[0]?.serviceCityCode) storeForm.cityCode = items[0].serviceCityCode
    }
  } catch (cause) {
    if (revision === districtRevision) districtError.value = cause instanceof Error ? cause.message : '区县读取失败'
  } finally {
    if (revision === districtRevision) districtBusy.value = false
  }
}
function chooseDistrict(id: string) {
  selectedDistrict.value = districtOptions.value.find(item => item.id === id)
  if (selectedDistrict.value?.serviceCityCode) storeForm.cityCode = selectedDistrict.value.serviceCityCode
}

async function locateStore() {
  if (locatingStore.value || busy.value) return
  locatingStore.value = true
  locationError.value = ''
  locationStatus.value = ''
  try {
    if (!navigator.geolocation) throw new Error('当前浏览器无法使用定位')
    const coords = await new Promise<GeolocationCoordinates>((resolve,reject) => {
      navigator.geolocation.getCurrentPosition(
        position => resolve(position.coords),
        failure => reject(new Error(failure.code === 1 ? '请允许此网站使用定位' : '暂时无法获取当前位置')),
        {enableHighAccuracy:true,timeout:12000,maximumAge:0},
      )
    })
    storeForm.latitude = coords.latitude.toFixed(6)
    storeForm.longitude = coords.longitude.toFixed(6)
    const result = await api<{district:District|null}>('/admin/stores/location',{
      method:'POST',body:{latitude:coords.latitude,longitude:coords.longitude},
    })
    const district = result.district
    if (district) {
      selectedDistrict.value = district
      storeForm.districtCode = district.id
      if (district.serviceCityCode) storeForm.cityCode = district.serviceCityCode
      if (!storeForm.address) storeForm.address = [...new Set([district.province,district.city,district.name].filter(Boolean))].join('')
      locationStatus.value = districtLabel(district)
    } else {
      locationStatus.value = '经纬度已填写，请选择服务城市'
    }
  } catch (cause) {
    locationError.value = cause instanceof Error ? cause.message : '定位失败'
  } finally {
    locatingStore.value = false
  }
}
const petForm = reactive({name:pet?.name ?? '',species:pet?.species ?? 'other',breed:pet?.breed ?? '',
  gender:pet?.gender ?? 'unknown',birthday:pet?.birthday ?? '',notes:pet?.notes ?? ''})

function shanghaiInput(value?: string|null) {
  return value ? new Date(new Date(value).getTime()+8*3600_000).toISOString().slice(0,16) : ''
}
function scheduledAt(value: string, previous?: string|null) {
  if (!value) return null
  return previous && shanghaiInput(previous) === value ? previous : new Date(value+'+08:00').toISOString()
}
const module = item?.module ?? (product ? 'shop' : 'medical')
const listing = reactive({
  module,category:item?.category ?? listingGroups[module].categories[0].id,
  kind:item?.kind ?? (product ? 'product' : 'article'),
  title:item?.title ?? '',provider:item?.provider ?? '',description:item?.description ?? '',
  area:item?.area ?? '',venue:item?.venue ?? '',storeId:item?.storeId ?? '',
  startsAt:shanghaiInput(item?.startsAt),closesAt:shanghaiInput(item?.closesAt),externalUrl:item?.externalUrl ?? '',
  price:item?.priceCents != null ? (item.priceCents/100).toFixed(2) : '',
  stock:item?.stock != null ? String(item.stock) : '',published:Boolean(item?.published),
})
const moduleOptions = (Object.keys(listingGroups) as (keyof typeof listingGroups)[])
  .filter(group => group!=='friends' && (product || group!=='shop') && (product || group!=='services' || item?.module==='services'))
const localCategories = ref<ServiceCategory[]>([])
const categoryError = ref('')
const usesServiceCategories = computed(() => !product && listing.module === 'services')
const listingCategories = computed(() => {
  if (usesServiceCategories.value) return localCategories.value
  const choices = [...listingGroups[listing.module].categories]
  return choices.some(choice => choice.id===listing.category) ? choices : [...choices,{id:listing.category,label:listing.category}]
})
function resetCategory() {
  listing.category = listingCategories.value[0]?.id ?? ''
}
async function readServiceCategories() {
  categoryError.value = ''
  try {
    localCategories.value = (await api<{items:ServiceCategory[]}>('/admin/service-categories')).items
    if (!usesServiceCategories.value) return
    if (listing.category === 'self-service') listing.category = 'grooming'
    if (!localCategories.value.some(category => category.id === listing.category)) {
      listing.category = item ? 'other' : localCategories.value[0]?.id ?? ''
    }
  } catch (cause) {
    categoryError.value = cause instanceof Error ? cause.message : '分类读取失败'
  }
}
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
  if (props.section === 'stores') {
    const {latitude, longitude, ...fields} = storeForm
    if ((latitude === '') !== (longitude === '')) throw new Error('请同时填写门店的经度和纬度')
    return {...fields,area:fields.area || null,districtCode:fields.districtCode || null,cityCode:fields.cityCode || null,
      coordinates:latitude === '' ? null : {latitude:Number(latitude),longitude:Number(longitude)}}
  }
  const {price,stock,startsAt,closesAt,...fields} = listing
  return {...fields,area:fields.area || null,venue:fields.venue || null,storeId:fields.storeId || null,
    startsAt:scheduledAt(startsAt,item?.startsAt),closesAt:scheduledAt(closesAt,item?.closesAt),
    priceCents:price==='' ? null : Math.round(Number(price)*100),stock:stock==='' ? null : Number(stock),
    externalUrl:fields.externalUrl || null,...(item ? {updatedAt:item.updatedAt,expectedStock:item.stock} : {})}
}

async function save() {
  if (busy.value || locatingStore.value) return
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
  if (props.section === 'stores' && storeForm.districtCode) void findDistricts('', storeForm.districtCode)
  if (props.section === 'products' || props.section === 'services') void findStores()
  if (props.section === 'services') void readServiceCategories()
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
      <div class="admin-store-locate">
        <button id="admin-locate-store" class="admin-button" type="button" :disabled="locatingStore || busy" @click="locateStore">
          {{ locatingStore ? '正在定位…' : '使用当前位置' }}
        </button>
        <span v-if="locationStatus" class="admin-muted" role="status">{{ locationStatus }}</span>
      </div>
      <p v-if="locationError" class="admin-error" role="alert">{{ locationError }}</p>
      <label>所在商圈
        <select v-model="storeForm.area"><option value="">未指定</option><option v-for="area in h5Areas" :key="area.id" :value="area.id">{{ area.label }}</option></select>
      </label>
      <label>服务区县
        <el-select v-model="storeForm.districtCode" aria-label="服务区县" filterable remote clearable :value-on-clear="''"
          :placeholder="legacyDistricts[storeForm.area] ? '沿用商圈对应区县，或搜索区县' : '输入区县名或城市与区县'"
          :loading="districtBusy" :remote-method="findDistricts" @change="chooseDistrict">
          <el-option v-for="entry in districtOptions" :key="entry.id" :value="entry.id" :label="districtLabel(entry)" />
        </el-select>
      </label>
      <p v-if="districtError" class="admin-error" role="alert">{{ districtError }}</p>
      <label>服务城市
        <el-cascader v-model="storeForm.cityCode" class="admin-city-picker" aria-label="服务城市" :options="cityOptions"
          :props="cityPickerProps" filterable clearable placeholder="选择省份和城市" />
      </label>
      <label>门店地址<input v-model.trim="storeForm.address" maxlength="160" autocomplete="street-address" placeholder="填写街道和门牌号"></label>
      <label>联系电话<input v-model.trim="storeForm.phone" type="tel" maxlength="40" autocomplete="tel"></label>
      <div class="admin-editor-pair">
        <label>门店经度<input v-model="storeForm.longitude" type="number" min="-179.999999" max="180" step="any" placeholder="WGS84"></label>
        <label>门店纬度<input v-model="storeForm.latitude" type="number" min="-90" max="90" step="any" placeholder="WGS84"></label>
      </div>
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
      <p v-if="section==='services' && !item" class="admin-muted">周边服务帖由绑定门店的小程序用户发布。</p>
      <label>{{ product ? '商品名称' : '服务名称' }}<input v-model.trim="listing.title" maxlength="120" required></label>
      <div class="admin-editor-pair">
        <label>目录<select v-model="listing.module" :disabled="!product && item?.module==='services'" @change="resetCategory">
          <option v-for="group in moduleOptions" :key="group" :value="group">{{ listingGroups[group].title }}</option>
        </select></label>
        <label>分类<select v-model="listing.category" :disabled="usesServiceCategories && !localCategories.length">
          <option v-for="choice in listingCategories" :key="choice.id" :value="choice.id">{{ choice.label }}</option>
        </select></label>
      </div>
      <p v-if="usesServiceCategories && categoryError" class="admin-error" role="alert">
        {{ categoryError }} <button class="admin-text-button" type="button" @click="readServiceCategories">重试</button>
      </p>
      <label v-if="!product">项目类型<select v-model="listing.kind">
        <option v-for="kind in serviceKinds" :key="kind" :value="kind">{{ kinds[kind] }}</option>
      </select></label>
      <label>关联门店
        <el-select v-model="listing.storeId" aria-label="关联门店" filterable remote clearable :value-on-clear="''"
          placeholder="搜索门店名称" :disabled="!product && item?.module==='services'" :loading="storeBusy" :remote-method="findStores" @change="selectStore">
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
      <button class="admin-button admin-primary" type="submit" :disabled="busy || locatingStore || (usesServiceCategories && !localCategories.length)">{{ busy ? '正在保存…' : '保存' }}</button>
    </footer>
  </form>
</template>

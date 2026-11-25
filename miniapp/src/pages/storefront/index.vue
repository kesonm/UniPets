<script setup lang="ts">
import { ref, watch } from 'vue'
import { onLoad, onReachBottom, onShareAppMessage } from '@dcloudio/uni-app'
import type { PublicStore, StoreContent, StoreContentKind } from '../../../../src/h5/types'
import { servicePhone } from '../../../../shared/h5-discovery.mjs'
import { jobCityLabel } from '../../../../shared/h5-jobs.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
import LoadState from '../../components/LoadState.vue'
import UiIcon from '../../components/UiIcon.vue'
import { money } from '../../lib/cart'
import { api, go, message, productCover, publicImage, servicePostImage } from '../../lib/client'
import { pageLoad } from '../../lib/page'

const id = ref('')
const kind = ref('')
const store = ref<PublicStore>()
const entries = ref<StoreContent[]>([])
const nextPage = ref(2)
const hasMore = ref(false)
const paging = ref(false)
const pagingError = ref('')
let version = 0

const kinds = {
  product: {label:'商品',icon:'entry-shop',page:'directory'},
  service: {label:'服务',icon:'entry-services',page:'services'},
  job: {label:'招聘',icon:'entry-jobs',page:'jobs'},
  post: {label:'动态',icon:'entry-friends',page:'feed'},
  story: {label:'短剧',icon:'entry-stories',page:'stories'},
  catalog: {label:'项目',icon:'entry-education',page:'directory'},
}
const filters = [{id:'',label:'全部内容'}, ...Object.entries(kinds).map(([id,item])=>({id,label:item.label}))]

onLoad(options => { id.value = options?.id || '' })
onShareAppMessage(() => ({title:store.value?.name || '宠云门店',path:'/pages/storefront/index?id='+encodeURIComponent(id.value)}))

async function fetchPage(page: number) {
  if (!id.value) throw new Error('门店不存在')
  const current = ++version
  const scope = kind.value ? '&kind='+encodeURIComponent(kind.value) : ''
  const result = await api<{store:PublicStore;items:StoreContent[];hasMore:boolean}>(
    '/h5/catalog/storefront/'+encodeURIComponent(id.value)+'?page='+page+scope,
  )
  if (current !== version) return
  store.value = result.store
  const seen = new Set(entries.value.map(entry => entry.kind+':'+entry.id))
  entries.value = page === 1 ? result.items : [...entries.value,...result.items.filter(entry => !seen.has(entry.kind+':'+entry.id))]
  nextPage.value = page + 1
  hasMore.value = result.hasMore
}
const { loading, error, refresh } = pageLoad(() => fetchPage(1))
watch(kind, () => { entries.value = []; pagingError.value = ''; void refresh() })
onReachBottom(more)

async function more() {
  if (!hasMore.value || loading.value || paging.value) return
  paging.value = true
  pagingError.value = ''
  try {
    await fetchPage(nextPage.value)
  } catch (cause) {
    pagingError.value = message(cause)
  } finally {
    paging.value = false
  }
}

function cover(entry: StoreContent) {
  if (entry.kind === 'product') return productCover(entry.id)
  if (entry.kind === 'service') return servicePostImage(entry.id)
  const paths: Partial<Record<StoreContentKind,string>> = {job:'jobs',post:'posts',story:'stories'}
  const suffix = entry.kind === 'job' ? '/images/1' : entry.kind === 'post' ? '/image' : '/cover'
  return paths[entry.kind] ? publicImage('/h5/'+paths[entry.kind]+'/'+entry.id+suffix) : ''
}
function open(entry: StoreContent) {
  const module = entry.kind === 'product' ? 'shop' : entry.module
  go(kinds[entry.kind].page,{id:entry.id,...(module ? {module} : {})})
}
function call() {
  const phoneNumber = servicePhone(store.value?.phone || '')
  if (phoneNumber) uni.makePhoneCall({phoneNumber})
}
</script>

<template>
  <view class="screen storefront">
    <view v-if="store" class="storefront-header">
      <view class="storefront-icon"><UiIcon name="entry-shop" :size="25" /></view>
      <view class="grow">
        <text class="storefront-name">{{ store.name }}</text>
        <text v-if="store.cityCode || store.address" class="sub">{{ [jobCityLabel(store.cityCode),store.address].filter(Boolean).join(' · ') }}</text>
      </view>
      <button v-if="servicePhone(store.phone)" class="small storefront-contact" @tap="call">联系门店</button>
    </view>
    <view v-if="store" class="browse-filters storefront-filters">
      <ChoiceField v-model="kind" :options="filters" appearance="filter" />
    </view>
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <template v-if="!loading && !error">
      <view v-if="entries.length" class="browse-grid">
        <button v-for="entry in entries" :key="entry.kind+':'+entry.id" class="browse-card storefront-card" @tap="open(entry)">
          <image v-if="entry.hasCover" class="browse-card-cover" :src="cover(entry)" mode="aspectFill" lazy-load />
          <view v-else class="browse-card-cover storefront-placeholder" :class="'storefront-'+entry.kind">
            <UiIcon :name="kinds[entry.kind].icon" :size="29" />
          </view>
          <view class="browse-card-copy">
            <text class="browse-card-title">{{ entry.title }}</text>
            <text v-if="entry.excerpt" class="browse-card-meta">{{ entry.excerpt }}</text>
            <view class="storefront-card-foot">
              <text>{{ kinds[entry.kind].label }}</text>
              <text v-if="entry.priceCents !== null" class="storefront-price">{{ money(entry.priceCents) }}</text>
            </view>
          </view>
        </button>
      </view>
      <view v-else class="card empty-card">暂无已发布内容</view>
      <text v-if="pagingError" class="error">{{ pagingError }}</text>
      <button v-if="hasMore" class="text-button storefront-more" :disabled="paging" :loading="paging" @tap="more">加载更多</button>
    </template>
  </view>
</template>

<style scoped>
.storefront-header { display:flex; align-items:center; gap:10px; padding:5px 0 16px; border-bottom:1px solid var(--border); }
.storefront-icon { display:grid; place-items:center; flex:none; width:45px; height:45px; border-radius:13px; background:#fff1c6; }
.storefront-name { display:block; overflow-wrap:anywhere; font-size:19px; font-weight:800; }
.storefront-header .sub { margin-top:4px; overflow-wrap:anywhere; }
.storefront-contact { flex:none; padding:4px 8px; font-size:12px; }
.storefront-filters { margin:4px 0 8px; }
.storefront-card { display:block; width:100%; padding:0; text-align:left; }
.storefront-service { background:#eaf4e8; }
.storefront-job { background:#f0eafb; }
.storefront-post { background:#feeaf1; }
.storefront-story { background:#e9effb; }
.storefront-card-foot { display:flex; align-items:baseline; justify-content:space-between; gap:4px; color:var(--muted); font-size:11px; }
.storefront-price { color:#a94b20; white-space:nowrap; font-size:13px; font-weight:750; }
.storefront-more { display:flex; margin:8px auto 0; }
</style>

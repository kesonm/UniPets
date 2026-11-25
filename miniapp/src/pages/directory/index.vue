<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { businessModules, isBusinessModule, type Listing } from '../../../../src/h5/business'
import type { H5Event, H5EventRegistration, H5TrainingCourse } from '../../../../src/h5/types'
import type { Pet } from '../../../../src/lib/types'
import { api, user, go, toast } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { addProduct, money } from '../../lib/cart'
import { searchListings } from '../../lib/directory'
import { pageLoad, submitAction } from '../../lib/page'
import { changeBrowseLocation, selectedLocation, selectedLocationLabel } from '../../lib/location'
import DirectoryListing from '../../components/DirectoryListing.vue'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetPicker from '../../components/PetPicker.vue'
import ShopShelf from '../../components/ShopShelf.vue'
import UiIcon from '../../components/UiIcon.vue'
const names: Record<string, string> = {
  events: '宠物赛事',
  training: '宠物培训与考证',
  friends: '宠友社群',
  shop: '宠物品牌超市',
  ...Object.fromEntries(Object.entries(businessModules).map(([id, module]) => [id, module.title])),
}
const eventStatus = { open: '报名中', closed: '报名结束', upcoming: '即将开放' }
const section = ref('services'),
  id = ref(''),
  q = ref(''),
  shopQuery = ref(''),
  note = ref(''),
  items = ref<Listing[]>([]),
  item = ref<Listing>()
const events = ref<H5Event[]>([]),
  event = ref<H5Event & { rules: string }>(),
  courses = ref<H5TrainingCourse[]>([]),
  registrations = ref<H5EventRegistration[]>([])
const pets = ref<Pet[]>([]),
  petId = ref('')
const category = ref('')
const forwarding = ref(false)
const categories = computed(() => isBusinessModule(section.value) ? businessModules[section.value].categories : [])
const displayed = computed(() => category.value ? items.value.filter(item => item.category === category.value) : items.value)
const needsPet = computed(
  () => !!event.value || (item.value?.kind !== 'group' && item.value?.module !== 'charity'),
)
const participate = computed(
  () => !!item.value && ['appointment', 'enrollment', 'group'].includes(item.value.kind),
)
const date = (s?: string | null) => (s ? s.slice(0, 10) : '待公布')
onLoad((o) => {
  section.value = o?.module && names[o.module] ? o.module : 'services'
  id.value = o?.id || ''
  if (o?.module === 'services' || (section.value === 'services' && !id.value)) {
    forwarding.value = true
    uni.redirectTo({ url: '/pages/services/index' + (id.value ? '?id=' + encodeURIComponent(id.value) : '') })
    return
  }
  if (section.value === 'immortality' && !id.value) {
    forwarding.value = true
    uni.redirectTo({
      url: '/pages/immortality/index',
      fail() {
        forwarding.value = false
        uni.setNavigationBarTitle({ title: names[section.value] })
        void refresh()
      },
    })
    return
  }
  uni.setNavigationBarTitle({ title: names[section.value] })
})
async function load() {
  if (forwarding.value) return
  if (section.value === 'events') {
    if (id.value) {
      event.value = (await api<{ event: H5Event & { rules: string } }>('/h5/events/' + id.value)).event
      if (user.value)
        registrations.value = (
          await api<{ registrations: H5EventRegistration[] }>('/h5/events/' + id.value + '/registrations')
        ).registrations
    } else events.value = (await api<{ events: H5Event[] }>('/h5/events')).events
  } else if (section.value === 'training')
    courses.value = (await api<{ courses: H5TrainingCourse[] }>('/h5/training')).courses
  else if (id.value) {
    const result = await api<{ listing: Listing }>('/h5/catalog/' + id.value)
    if (result.listing.module === 'services') {
      forwarding.value = true
      uni.redirectTo({ url: '/pages/services/index?id=' + encodeURIComponent(id.value) })
      return
    }
    item.value = result.listing
  }
  else if (section.value === 'shop') {
    const district = selectedLocation.value?.district.id
    items.value = (await api<{ listings: Listing[] }>('/h5/catalog?kind=product' + (district ? '&district=' + encodeURIComponent(district) : ''))).listings
  }
  else items.value = await searchListings(section.value, q.value, selectedLocation.value?.district.id)
  if (user.value && id.value && needsPet.value) {
    pets.value = await listPets()
    if (!pets.value.some((p) => p.id === petId.value)) petId.value = pets.value[0]?.id || ''
  }
}
const { error, loading, refresh } = pageLoad(load, () => {
  pets.value = []
  registrations.value = []
  petId.value = ''
})
const { run, busy, error: actionError } = submitAction()
function open(key: string) {
  go('directory', { module: section.value, id: key })
}
function search() {
  if (section.value === 'shop') shopQuery.value = q.value.trim()
  else void refresh()
}
function join() {
  return run(async () => {
    if (event.value) await api('/h5/events/' + id.value + '/registrations', 'POST', { petId: petId.value })
    else
      await api('/h5/catalog/' + id.value + '/participation', 'POST', {
        petId: needsPet.value ? petId.value : null,
        note: note.value,
      })
    await load()
    toast(event.value ? '报名成功' : '参与记录已保存')
  })
}
function add() {
  return run(async () => {
    if (item.value) {
      addProduct(item.value)
      toast('已加入购物车')
    }
  })
}
function copyLink() {
  if (item.value?.externalUrl) uni.setClipboardData({ data: item.value.externalUrl })
}
</script>
<template>
  <view v-if="!forwarding" class="screen">
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <template v-if="!id">
      <template v-if="section === 'events'">
        <view v-for="e in events" :key="e.id" class="card" @tap="open(e.id)">
          <text class="heading">{{ e.title }}</text>
          <text class="sub">
            {{ e.city }} · {{ date(e.startsAt) }} · {{ eventStatus[e.registrationStatus] }}
          </text>
        </view>
      </template>
      <template v-else-if="section === 'training'">
        <view v-for="c in courses" :key="c.id" class="card">
          <text class="heading">{{ c.title }}</text>
          <text class="line">{{ c.learningFormat }} · {{ date(c.startsAt) }}</text>
          <text class="body">{{ c.eligibility }}</text>
          <text class="sub">考期 {{ date(c.examAt) }}　{{ c.examLocation }}</text>
          <text class="sub">{{ c.credential }}　{{ c.issuer }}</text>
        </view>
      </template>
      <template v-else>
        <view class="card program-search">
          <input
            :always-embed="true"
            v-model="q"
            maxlength="60"
            :placeholder="section === 'shop' ? '搜索商品或商家' : '搜索名称、机构或地点'"
            confirm-type="search"
            @confirm="search"
          />
          <button class="small primary" @tap="search">搜索</button>
          <button v-if="section === 'shop'" class="text-button" @tap="go('orders')">
            <UiIcon name="nav-cart" :size="14" />购物车
          </button>
        </view>
        <view v-if="section === 'shop'" v-show="!loading && !error">
          <ShopShelf :listings="items" :query="shopQuery" filter />
        </view>
        <template v-else>
          <view v-if="categories.length" class="card">
            <view class="spread">
              <button class="text-button" @tap="changeBrowseLocation"><UiIcon name="location" />{{ selectedLocationLabel }}</button>
            </view>
            <view class="chips">
              <button :class="['chip', { active: !category }]" @tap="category = ''">全部</button>
              <button
                v-for="option in categories" :key="option.id"
                :class="['chip', { active: category === option.id }]"
                @tap="category = option.id"
              >{{ option.label }}</button>
            </view>
          </view>
          <DirectoryListing v-for="item in displayed" :key="item.id" :listing="item" />
        </template>
      </template>
      <view v-if="section !== 'shop' && !loading && !error && !displayed.length && !events.length && !courses.length" class="card empty-card">
        当前分类暂无已发布的项目
      </view>
    </template>
    <template v-if="event || item">
      <view class="card">
        <text class="title">{{ event?.title || item?.title }}</text>
        <text class="sub">{{ event?.organizer || item?.provider }}</text>
        <text v-if="event" class="line">
          {{ event.city }} · {{ event.venue }} · {{ date(event.startsAt) }}
        </text>
        <text v-if="item?.venue" class="line">{{ item.venue }}</text>
        <text class="body">{{ event?.rules || item?.description }}</text>
        <text v-if="item?.priceCents" class="heading">{{ money(item.priceCents) }}</text>
        <button v-if="item?.externalUrl" class="small" @tap="copyLink">复制官方链接</button>
      </view>
      <LoginCard v-if="!user && (event || participate || item?.kind === 'product')" />
      <view v-if="user && (event || participate)" class="card">
        <PetPicker v-if="needsPet" v-model="petId" :pets="pets" />
        <template v-if="item">
          <text class="label">备注（选填）</text>
          <input v-model="note" :always-embed="true" maxlength="500" />
        </template>
        <view class="actions">
          <button
            class="primary"
            :disabled="busy || (needsPet && !petId) || (!!event && event.registrationStatus !== 'open')"
            @tap="join"
          >
            {{
              event
                ? eventStatus[event.registrationStatus]
                : item?.kind === 'group'
                  ? '加入社群'
                  : '提交预约或报名'
            }}
          </button>
          <button v-if="!event" class="small" @tap="go('activity')">我的参与</button>
        </view>
        <text v-for="r in registrations" :key="r.petId" class="line">{{ r.petName }} 已报名</text>
      </view>
      <view v-if="user && item?.kind === 'product'" class="actions">
        <button class="primary" :disabled="busy || !item.stock" @tap="add">加入购物车</button>
        <button @tap="go('orders')">查看购物车</button>
      </view>
    </template>
  </view>
</template>
<style scoped>
.program-search { display: flex; align-items: center; gap: 8px; }
.program-search input { flex: 1; min-width: 0; }
.program-search button { flex: none; min-height: 34px; }
</style>

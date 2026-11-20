<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { Listing } from '../../../../src/h5/business'
import type { H5Event, H5EventRegistration, H5TrainingCourse } from '../../../../src/h5/types'
import type { Pet } from '../../../../src/lib/types'
import { api, user, go, toast } from '../../lib/client'
import { listPets } from '../../lib/pets'
import { addProduct, money } from '../../lib/cart'
import { pageLoad, submitAction } from '../../lib/page'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
import PetPicker from '../../components/PetPicker.vue'
const names: Record<string, string> = {
  events: '宠物赛事',
  training: '培训课程',
  education: '升学教育',
  friends: '宠友社群',
  services: '周边服务',
  shop: '宠物好物',
  medical: '医疗护理',
  travel: '带宠出行',
  charity: '公益领养',
  immortality: '生命纪念',
}
const kindNames: Record<string, string> = {
  article: '文章',
  appointment: '预约',
  enrollment: '报名',
  group: '社群',
  product: '商品',
  link: '官方入口',
}
const eventStatus = { open: '报名中', closed: '报名结束', upcoming: '即将开放' }
const section = ref('services'),
  id = ref(''),
  q = ref(''),
  note = ref(''),
  items = ref<Listing[]>([]),
  item = ref<Listing>()
const events = ref<H5Event[]>([]),
  event = ref<H5Event & { rules: string }>(),
  courses = ref<H5TrainingCourse[]>([]),
  registrations = ref<H5EventRegistration[]>([])
const pets = ref<Pet[]>([]),
  petId = ref('')
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
  uni.setNavigationBarTitle({ title: names[section.value] })
})
async function load() {
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
  else if (id.value) item.value = (await api<{ listing: Listing }>('/h5/catalog/' + id.value)).listing
  else
    items.value = (
      await api<{ listings: Listing[] }>(
        '/h5/catalog?module=' + section.value + '&q=' + encodeURIComponent(q.value),
      )
    ).listings
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
      toast('已加入购物袋')
    }
  })
}
function copyLink() {
  if (item.value?.externalUrl) uni.setClipboardData({ data: item.value.externalUrl })
}
</script>
<template>
  <view class="screen">
    <LoadState :loading="loading" :error="error" @retry="refresh" />
    <text v-if="actionError" class="error">{{ actionError }}</text>
    <template v-if="!id">
      <view class="sheet">
        <text class="title">{{ names[section] }}</text>
        <view v-if="section === 'shop'" class="actions">
          <button class="small" @tap="go('orders')">打开购物袋</button>
        </view>
      </view>
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
        <view class="card">
          <input
            v-model="q"
            maxlength="60"
            placeholder="搜索名称、机构或地点"
            confirm-type="search"
            @confirm="refresh"
          />
          <view class="actions"><button class="small" @tap="refresh">搜索</button></view>
        </view>
        <view v-for="i in items" :key="i.id" class="card" @tap="open(i.id)">
          <text class="sub">{{ kindNames[i.kind] }} · {{ i.provider }}</text>
          <text class="heading">{{ i.title }}</text>
          <text v-if="i.priceCents" class="body">{{ money(i.priceCents) }}</text>
        </view>
      </template>
      <text v-if="!loading && !error && !items.length && !events.length && !courses.length" class="empty">
        暂时没有已发布的内容
      </text>
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
          <input v-model="note" maxlength="500" />
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
        <button class="primary" :disabled="busy || !item.stock" @tap="add">加入购物袋</button>
        <button @tap="go('orders')">查看购物袋</button>
      </view>
    </template>
  </view>
</template>

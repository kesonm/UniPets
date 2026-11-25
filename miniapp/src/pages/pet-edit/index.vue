<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import type { Pet } from '../../../../src/lib/types'
import { api, user, speciesNames, genderNames, toast, petsTab, today } from '../../lib/client'
import { getPet, petFields } from '../../lib/pets'
import { pageLoad, submitAction } from '../../lib/page'
import ChoiceField from '../../components/ChoiceField.vue'
import LoginCard from '../../components/LoginCard.vue'
import LoadState from '../../components/LoadState.vue'
const id = ref(''),
  ready = ref(false)
const form = reactive({
  name: '',
  species: 'cat',
  breed: '',
  gender: 'unknown',
  birthday: '',
  notes: '',
  avatarAssetId: null as string | null,
})
const species = Object.entries(speciesNames).map(([id, label]) => ({ id, label }))
const genders = Object.entries(genderNames).map(([id, label]) => ({ id, label }))
const speciesLocked = ref(false)
const canSave = computed(() => ready.value && !!form.name.trim())
onLoad((q) => {
  id.value = q?.id || ''
  uni.setNavigationBarTitle({ title: id.value ? '编辑宠物档案' : '添加宠物' })
})
const { error, loading, refresh } = pageLoad(
  async () => {
    if (!user.value) return
    if (ready.value) return
    if (id.value) {
      const pet = await getPet(id.value)
      Object.assign(form, petFields(pet), { birthday: pet.birthday || '' })
      speciesLocked.value = !!pet.identityNumber
    }
    ready.value = true
  },
  () => {
    ready.value = false
  },
)
const action = submitAction()
const { busy, error: saveError } = action
function save() {
  return action.run(async () => {
    const result = await api<{ pet: Pet }>(
      id.value ? '/pets/' + id.value : '/pets',
      id.value ? 'PUT' : 'POST',
      { ...form, name: form.name.trim(), birthday: form.birthday || null },
    )
    toast('档案已保存')
    if (id.value && getCurrentPages().length > 1) uni.navigateBack()
    else uni.redirectTo({ url: '/pages/pet/index?id=' + result.pet.id, fail: petsTab })
  })
}
</script>
<template>
  <view class="screen">
    <LoginCard v-if="!user" />
    <template v-else>
      <LoadState :error="error" :loading="loading" @retry="refresh" />
      <view v-if="ready" class="card">
        <text class="label">宠物名字 *</text>
        <input v-model="form.name" :always-embed="true" maxlength="40" placeholder="它叫什么名字？" />
        <text class="label">种类 *</text>
        <text v-if="speciesLocked" class="field">
          {{ species.find((o) => o.id === form.species)?.label }}
        </text>
        <ChoiceField v-else v-model="form.species" :options="species" />
        <text class="label">品种</text>
        <input v-model="form.breed" :always-embed="true" maxlength="80" placeholder="选填" />
        <text class="label">性别</text>
        <ChoiceField v-model="form.gender" :options="genders" />
        <text class="label">生日</text>
        <picker
          mode="date"
          :value="form.birthday || today()"
          :end="today()"
          @change="form.birthday = String($event.detail.value)"
        >
          <view class="field">{{ form.birthday || '选择日期（选填）' }}</view>
        </picker>
        <button v-if="form.birthday" class="chip" @tap="form.birthday = ''">清除生日</button>
        <text class="label">备注</text>
        <textarea v-model="form.notes" maxlength="2000" placeholder="记录它的习惯或喜好" />
        <text v-if="saveError" class="error">{{ saveError }}</text>
        <view class="actions">
          <button class="primary" :loading="busy" :disabled="busy || !canSave" @tap="save">保存档案</button>
        </view>
      </view>
    </template>
  </view>
</template>

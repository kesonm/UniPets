<script setup lang="ts">
import { ref } from 'vue'
import { onHide, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { postPetTypeLabels, postPetTypes } from '../../../../shared/h5-discovery.mjs'
import ChoiceField from '../../components/ChoiceField.vue'
import FeedSection from '../../components/FeedSection.vue'
import UiIcon from '../../components/UiIcon.vue'
import { go } from '../../lib/client'
import { useTabPage } from '../../lib/tab-page'

const tabLayout = useTabPage('pages/friends/index')
const active = ref(false)
const input = ref('')
const query = ref('')
const petType = ref('')
const petTypes = [{id:'',label:'全部宠物'}, ...postPetTypes.map(id => ({id,label:postPetTypeLabels[id]}))]
const reload = ref(0)

onShow(() => { active.value = true })
onHide(() => { active.value = false; endRefresh() })
onPullDownRefresh(() => { reload.value++ })

function endRefresh() {
  uni.stopPullDownRefresh()
}

function search() {
  const keyword = input.value.trim()
  if (query.value === keyword) reload.value++
  else query.value = keyword
}
</script>

<template>
  <view class="screen tab-screen" :style="tabLayout">
    <view class="tab-leading friends-search">
      <UiIcon name="search" :size="15" />
      <input id="friends-search" v-model="input" :always-embed="true" maxlength="60" placeholder="搜索帖子、宠物或岗位" aria-label="搜索帖子、宠物或岗位"
        confirm-type="search" @confirm="search" />
      <button id="friends-submit-search" class="friends-search-button" @tap="search">搜索</button>
    </view>
    <view class="friends-toolbar">
      <ChoiceField v-model="petType" :options="petTypes" appearance="text" />
      <button id="friends-publish" class="text-button friends-publish" @tap="go('feed',{mode:'write'})">
        <UiIcon name="circle-plus" :size="14" />发布帖子
      </button>
    </view>
    <FeedSection :active="active" :query="query" :pet-type="petType" :reload="reload" include-jobs @loaded="endRefresh" />
  </view>
</template>

<style scoped>
.friends-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--paper);
}
.friends-search input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
}
.friends-search-button {
  flex: none;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: 18px;
  background: var(--yellow);
  font-size: 12px;
}
.friends-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin: 3px 0 5px;
}
.friends-publish { flex: none; min-height: 36px; white-space: nowrap; }
</style>

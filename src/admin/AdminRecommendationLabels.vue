<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Briefcase, Goods, Location, VideoCamera } from '@element-plus/icons-vue'
import { defaultRecommendationLabels, recommendationLabelColor, recommendationLabelKinds, recommendationLabelTextLimit,
  type RecommendationLabelKind, type RecommendationLabels, type RecommendationLabelSettings } from '../../shared/h5-recommendation-labels.mjs'
import { api, ApiError } from '../lib/api'

const endpoint = '/admin/recommendation-labels'
const assets = import.meta.env.BASE_URL + 'assets/'
const samples = {
  product: { title:'宠物日常护理套装', provider:'宠物品牌超市', amount:'¥39.00', image:'', icon:Goods },
  service: { title:'小型犬基础洗护', provider:'宠物门店', amount:'¥69.00', image:assets+'h5-training.webp', icon:Location },
  job: { title:'宠物洗护助理', provider:'宠物门店', amount:'面议', image:'', icon:Briefcase },
  story: { title:'猫咪的窗边日记', provider:'宠友', amount:'', image:assets+'pet-hero.png', icon:VideoCamera },
}
const clone = (labels: RecommendationLabels): RecommendationLabels => structuredClone(labels)
const saved = ref<RecommendationLabelSettings>()
const draft = ref(clone(defaultRecommendationLabels))
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const conflict = ref(false)
const colorFields = [{key:'textColor',name:'文字颜色'},{key:'backgroundColor',name:'背景颜色'}] as const
const colorValue = (value: string, fallback: string) => recommendationLabelColor.test(value.trim()) ? value.trim() : fallback
const textIsValid = (value: string) => value.trim().length <= recommendationLabelTextLimit && /^[^\p{Cc}\p{Zl}\p{Zp}]+$/u.test(value.trim())
const valid = computed(() => recommendationLabelKinds.every(kind => {
  const {text,textColor,backgroundColor} = draft.value[kind]
  return textIsValid(text) && recommendationLabelColor.test(textColor.trim()) && recommendationLabelColor.test(backgroundColor.trim())
}))
const dirty = computed(() => !!saved.value && recommendationLabelKinds.some(kind => {
  const baseline = saved.value!.labels[kind]
  const next = draft.value[kind]
  return next.text.trim() !== baseline.text || colorFields.some(({key}) => next[key].trim().toUpperCase() !== baseline[key])
}))

function apply(settings: RecommendationLabelSettings) {
  saved.value = settings
  draft.value = clone(settings.labels)
}

async function load() {
  loading.value = true
  error.value = ''
  notice.value = ''
  conflict.value = false
  try {
    apply(await api<RecommendationLabelSettings>(endpoint))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取配置失败'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!saved.value || !dirty.value || !valid.value || saving.value || conflict.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    apply(await api<RecommendationLabelSettings>(endpoint,{method:'PUT',body:{labels:draft.value,revision:saved.value.revision}}))
    notice.value = '已保存。小程序重新进入首页时会读取新配置。'
  } catch (cause) {
    conflict.value = cause instanceof ApiError && cause.status === 409
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function resetDefaults() {
  draft.value = clone(defaultRecommendationLabels)
  notice.value = ''
}

function previewStyle(kind: RecommendationLabelKind) {
  const value = draft.value[kind]
  const fallback = defaultRecommendationLabels[kind]
  return {color:colorValue(value.textColor,fallback.textColor),backgroundColor:colorValue(value.backgroundColor,fallback.backgroundColor)}
}

onMounted(load)
</script>

<template>
  <div class="label-settings-layout">
    <form class="admin-panel label-settings" aria-label="推荐标签配置" @submit.prevent="save">
      <header class="label-settings-header">
        <h2>推荐标签配置</h2>
        <span v-if="loading" role="status">正在读取…</span>
        <span v-else-if="dirty" class="label-pending">有未保存的修改</span>
      </header>
      <div v-for="kind in recommendationLabelKinds" :key="kind" class="label-settings-row">
        <fieldset :disabled="loading || saving || !saved">
          <legend>{{ defaultRecommendationLabels[kind].text }}</legend>
          <div class="label-fields">
            <label class="label-text-field" :for="kind+'-label-text'">
              <span>标签文字</span>
              <input :id="kind+'-label-text'" v-model="draft[kind].text" :maxlength="recommendationLabelTextLimit" required>
            </label>
            <div v-for="field in colorFields" :key="field.key" class="label-color-field">
              <label :for="kind+'-'+field.key">{{ field.name }}</label>
              <div class="label-color-input">
                <input type="color" :aria-label="defaultRecommendationLabels[kind].text+field.name+'取色器'"
                  :value="colorValue(draft[kind][field.key],defaultRecommendationLabels[kind][field.key])"
                  @input="draft[kind][field.key]=($event.target as HTMLInputElement).value.toUpperCase()">
                <input :id="kind+'-'+field.key" v-model="draft[kind][field.key]" maxlength="7" required spellcheck="false"
                  placeholder="#RRGGBB" :aria-invalid="!recommendationLabelColor.test(draft[kind][field.key].trim())">
              </div>
            </div>
          </div>
        </fieldset>
      </div>
      <footer class="label-settings-footer">
        <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
        <p v-else-if="!valid" class="admin-error" role="status">请填写标签文字，并使用 #RRGGBB 格式的颜色。</p>
        <p v-else-if="notice && !dirty" class="label-success" role="status">{{ notice }}</p>
        <div class="label-settings-actions">
          <button v-if="conflict || (error && !saved)" class="admin-button" type="button" :disabled="loading || saving" @click="load">重新读取</button>
          <button class="admin-button" type="button" :disabled="loading || saving || !saved" @click="resetDefaults">恢复默认</button>
          <button class="admin-button admin-primary" type="submit" :disabled="loading || saving || !dirty || !valid || conflict">{{ saving ? '正在保存…' : '保存配置' }}</button>
        </div>
      </footer>
    </form>
    <section class="admin-panel label-preview" aria-label="标签实时预览">
      <header class="label-settings-header"><h2>小程序实时预览</h2></header>
      <div class="label-preview-screen">
        <h3>为你推荐</h3>
        <div class="label-preview-grid">
          <article v-for="kind in recommendationLabelKinds" :key="kind" class="label-preview-card">
            <div :class="['label-preview-cover',kind]">
              <img v-if="samples[kind].image" :src="samples[kind].image" alt="">
              <el-icon v-else :size="24" aria-hidden="true"><component :is="samples[kind].icon" /></el-icon>
              <span v-if="draft[kind].text.trim()" class="recommendation-label" :style="previewStyle(kind)">{{ draft[kind].text.trim() }}</span>
            </div>
            <h4>{{ samples[kind].title }}</h4>
            <div class="label-preview-meta"><span>{{ samples[kind].provider }}</span><strong v-if="samples[kind].amount">{{ samples[kind].amount }}</strong></div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style src="../../shared/recommendation-label.css"></style>
<style scoped>
.label-settings-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(268px,348px); gap: 16px; align-items: start; }
.label-settings,.label-preview { min-width: 0; }
.label-settings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 59px; padding: 14px 18px; border-bottom: 1px solid var(--admin-line); }
.label-settings-header h2 { margin: 0; color: var(--admin-ink); font-size: 16px; }
.label-settings-header span { color: var(--admin-muted); font-size: 12px; }
.label-settings-header .label-pending { color: #85651e; }
.label-settings-row { padding: 15px 18px; border-bottom: 1px solid var(--admin-line); }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
legend { padding: 0; margin: 0 0 8px; color: var(--admin-ink); font-size: 14px; font-weight: 750; }
.label-fields { display: grid; grid-template-columns: minmax(80px,.8fr) repeat(2,minmax(106px,1fr)); gap: 12px; }
.label-text-field,.label-color-field { display: grid; gap: 6px; min-width: 0; font-size: 12px; color: var(--admin-muted); }
.label-fields input:not([type=color]) { width: 100%; height: 36px; padding: 0 9px; border: 1px solid var(--admin-line); border-radius: 7px; color: var(--admin-ink); }
.label-fields input[aria-invalid=true] { border-color: #bc685c; }
.label-color-input { display: flex; align-items: center; gap: 6px; }
.label-color-input input[type=color] { width: 33px; height: 36px; flex: none; padding: 4px; border: 1px solid var(--admin-line); border-radius: 7px; background: #fff; cursor: pointer; }
.label-color-input input:not([type=color]) { min-width: 0; font-family: ui-monospace, monospace; }
.label-settings-footer { padding: 14px 18px; }
.label-settings-footer p { margin: 0 0 10px; font-size: 13px; }
.label-success { color: #356b47; }
.label-settings-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.label-preview-screen { max-width: 365px; margin: 0 auto; padding: 14px; background: #f5f4f1; }
.label-preview-screen h3 { margin: 0 0 8px; color: #262422; font-size: 17px; }
.label-preview-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.label-preview-card { overflow: hidden; min-width: 0; border: 1px solid #ebe8e1; border-radius: 13px; background: #fff; }
.label-preview-cover { position: relative; display: grid; place-items: center; aspect-ratio: 1.28; }
.label-preview-cover.product { color: #a76632; background: #fff3e8; }
.label-preview-cover.service { color: #376f4a; background: #edf6e9; }
.label-preview-cover.job { color: #47648d; background: #edf4fc; }
.label-preview-cover.story { color: #725199; background: #f4effb; }
.label-preview-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.label-preview-card h4,.label-preview-meta span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.label-preview-card h4 { margin: 7px 8px 3px; color: #262422; font-size: 13px; }
.label-preview-meta { display: flex; justify-content: space-between; gap: 4px; padding: 0 8px 9px; color: #66625a; font-size: 11px; }
.label-preview-meta strong { flex: none; color: #775412; }
@media (max-width: 1070px) { .label-settings-layout { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 510px) { .label-fields { grid-template-columns: 1fr 1fr; gap: 8px; } .label-text-field { grid-column: 1 / -1; } }
</style>

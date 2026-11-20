<script setup lang="ts">
import { ArrowRight, Plus, Postcard } from '@element-plus/icons-vue'
import H5Avatar from './H5Avatar.vue'
import type { CloudPet } from './types'

defineProps<{pets:CloudPet[];pet?:CloudPet;loading:boolean}>()
const emit=defineEmits<{select:[id:string];detail:[id:string];create:[];enroll:[pet:CloudPet]}>()
const species={cat:'猫咪',dog:'狗狗',other:'其他宠物'}
</script>

<template>
  <div class="h5-id-page">
    <div class="h5-id-tools">
      <div v-if="pets.length" class="h5-pet-scroll h5-id-avatars" role="group" aria-label="切换宠物">
        <button v-for="item in pets" :key="item.id" class="h5-pet-choice" type="button"
          :aria-label="'切换到'+item.name" :aria-pressed="item.id===pet?.id" @click="emit('select',item.id)">
          <span class="h5-pet-ring" aria-hidden="true"><H5Avatar :pet="item" /></span>
          <span class="h5-pet-choice-label">{{ item.name }}</span>
        </button>
      </div>
      <button type="button" class="h5-small-primary h5-id-create" @click="emit('create')">
        <el-icon aria-hidden="true"><Plus /></el-icon>新建档案
      </button>
    </div>

    <section v-if="pet" class="h5-id-card h5-card" aria-labelledby="h5-id-title">
      <header class="h5-id-header">
        <h1 id="h5-id-title"><el-icon aria-hidden="true"><Postcard /></el-icon>宠物身份证</h1>
        <span v-if="pet.shared" class="h5-id-shared">共享档案</span>
        <button v-else-if="!pet.identityNumber && pet.species!=='other'" type="button" class="h5-text-button h5-id-enroll" @click="emit('enroll',pet)">登记鼻纹</button>
      </header>
      <div class="h5-id-body">
        <H5Avatar :key="pet.id" :pet="pet" class="h5-id-photo" />
        <div class="h5-id-personal">
          <h2 id="h5-id-pet-name">{{ pet.name }}</h2>
          <dl>
            <dt>种类</dt><dd>{{ species[pet.species] }}</dd>
            <template v-if="pet.breed"><dt>品种</dt><dd>{{ pet.breed }}</dd></template>
            <template v-if="pet.gender!=='unknown'"><dt>性别</dt><dd>{{ pet.gender==='female'?'母':'公' }}</dd></template>
            <template v-if="pet.birthday"><dt>生日</dt><dd><time :datetime="pet.birthday">{{ pet.birthday }}</time></dd></template>
          </dl>
        </div>
      </div>
      <footer class="h5-id-number">
        <span>身份证号</span><strong>{{ pet.identityNumber ?? '待登记' }}</strong>
        <button class="h5-text-button h5-id-open" type="button" aria-describedby="h5-id-pet-name" @click="emit('detail',pet.id)">
          查看详情<el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </button>
      </footer>
    </section>
    <div v-else class="h5-card h5-empty" role="status">{{ loading?'正在读取宠物档案…':'暂无宠物档案' }}</div>
  </div>
</template>

<style scoped>
.h5-id-page { padding: calc(14px + env(safe-area-inset-top,0px)) 14px 0; }
.h5-id-tools { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 12px -3px; }
.h5-id-avatars { margin: 0; }
.h5-id-create { flex: none; margin-left: auto; white-space: nowrap; }
.h5-id-card { position: relative; padding: 15px 16px 13px; border-color: #ebdfbc; border-radius: 19px; background: linear-gradient(135deg,#fffdf7 55%,#fff3c6); }
.h5-id-header { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding-bottom: 12px; }
.h5-id-header h1 { display: flex; align-items: center; gap: 6px; color: #584317; font-size: 15px; font-weight: 800; }
.h5-id-header .el-icon { font-size: 19px; }
.h5-id-shared { color: #77591c; font-size: 11px; }
.h5-id-enroll { position: relative; z-index: 1; white-space: nowrap; }
.h5-id-body { display: grid; grid-template-columns: clamp(76px,25vw,112px) minmax(0,1fr); align-items: center; gap: 14px; }
.h5-id-photo { width: 100%; align-self: start; border: 1px solid #ebdfc2; border-radius: 12px; }
.h5-id-personal h2 { overflow-wrap: anywhere; font-size: 23px; line-height: 1.2; font-weight: 850; }
.h5-id-personal dl { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: baseline; gap: 4px 10px; margin: 9px 0 0; font-size: 12px; }
.h5-id-personal dt { color: #746654; }
.h5-id-personal dd { margin: 0; overflow-wrap: anywhere; }
.h5-id-number { display: flex; align-items: center; gap: 9px; margin-top: 13px; padding-top: 5px; border-top: 1px solid #e9ddb9; color: #705c35; font-size: 11px; }
.h5-id-number strong { color: #4a3511; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .07em; }
.h5-id-open { margin-left: auto; padding-right: 0; font-size: 12px; white-space: nowrap; }
.h5-id-open::after { position: absolute; inset: 0; content: ''; border-radius: 19px; }
</style>

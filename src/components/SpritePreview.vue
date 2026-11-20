<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import type { Asset } from '../lib/types'
import type { SpriteLayout } from '../../shared/sprite-layout.mjs'
import { imageUrl } from '../lib/api'
import AssetImage from './AssetImage.vue'
const props=defineProps<{asset:Asset;label:string}>()
const emit=defineEmits<{download:[]}>()
const playing=ref(!window.matchMedia('(prefers-reduced-motion: reduce)').matches),frame=ref(0),displayedFrame=ref(0),fitContent=ref(true)
const original=ref(false),videoOpen=ref(false),videoLoading=ref(false),videoUrl=ref(''),info=ref<SpriteLayout|null>(null)
let videoRequest=0
function pickFrame(index:number){playing.value=false;frame.value=index}
function togglePlayback(){if(playing.value)frame.value=displayedFrame.value;playing.value=!playing.value}
function releaseVideo(){videoRequest++;if(videoUrl.value.startsWith('blob:'))URL.revokeObjectURL(videoUrl.value);videoUrl.value=''}
async function openVideo(){
  videoOpen.value=true;videoLoading.value=true
  const request=++videoRequest
  try {
    const url=await imageUrl(props.asset.id,'video')
    if(request===videoRequest)videoUrl.value=url
    else if(url.startsWith('blob:'))URL.revokeObjectURL(url)
  }catch(e){ElMessage.error(e instanceof Error?e.message:'视频无法读取')}
  finally{if(request===videoRequest)videoLoading.value=false}
}
function downloadVideo(){if(!videoUrl.value)return;const link=document.createElement('a');link.href=videoUrl.value;link.download=`${props.asset.name}.mp4`;link.click()}
onBeforeUnmount(releaseVideo)
</script>
<template>
  <article class="sprite-action-card">
    <div class="action-preview"><AssetImage :id="asset.id" :alt="asset.name" :frames="asset.frames" :columns="asset.columns" :rows="asset.rows" :fps="asset.fps" :image-version="asset.imageVersion" animate :playing="playing" :frame="frame" :fit-content="fitContent" @sprite-info="info=$event" @frame-change="displayedFrame=$event" /></div>
    <div class="sprite-action-caption"><strong>{{ label }}</strong><div><el-button v-if="asset.hasVideo" text size="small" @click="openVideo">原视频</el-button><el-button text size="small" @click="original=true">帧图</el-button><el-button text size="small" @click="emit('download')">下载</el-button></div></div>
    <div class="sprite-playback">
      <button :aria-label="`${label}${playing?'暂停':'播放'}`" @click="togglePlayback">{{ playing?'暂停':'播放' }}</button>
      <div v-if="asset.frames<=8" class="sprite-frame-buttons" aria-label="逐帧查看"><button v-for="index in asset.frames" :key="index" :class="{selected:!playing&&frame===index-1}" :aria-label="`${label}第 ${index} 帧`" @click="pickFrame(index-1)">{{ index }}</button></div>
      <label v-else class="sprite-frame-slider"><input type="range" :aria-label="`${label}逐帧查看`" :min="0" :max="asset.frames-1" :value="displayedFrame" @input="pickFrame(Number(($event.target as HTMLInputElement).value))" /><span>{{ displayedFrame+1 }}/{{ asset.frames }}</span></label>
      <button :aria-pressed="fitContent" @click="fitContent=!fitContent">{{ fitContent?'显示整帧':'适配宠物' }}</button>
    </div>
    <p v-if="asset.hasVideo" class="sprite-frame-detail">{{ asset.duration?.toFixed(1) }} 秒 · {{ asset.frames }} 帧 · {{ asset.fps }} 帧/秒<span v-if="asset.sleepLoop"> · 趴睡呼吸循环</span></p>
    <p v-if="asset.backgroundRemoved" class="sprite-frame-detail">已去背景 · 透明帧图</p>
    <p v-else-if="asset.hasVideo||info?.background==='opaque'" class="sprite-background-note">动作素材含背景，桌面显示时也会带背景。</p>
    <el-dialog v-model="original" :title="`${label} · 完整帧图`" width="min(1000px,94vw)" append-to-body destroy-on-close><div class="sprite-original"><AssetImage :id="asset.id" :alt="`${asset.name}帧图`" :image-version="asset.imageVersion" /></div><p class="form-help">共 {{ asset.frames }} 帧，按从左到右、从上到下的顺序播放。下载文件保持原样。</p></el-dialog>
    <el-dialog v-model="videoOpen" :title="`${label} · 原视频`" width="min(760px,94vw)" append-to-body destroy-on-close @closed="releaseVideo">
      <div v-loading="videoLoading" class="sprite-video-preview"><video v-if="videoUrl" :src="videoUrl" controls muted playsinline preload="metadata" /></div>
      <template #footer><el-button :disabled="!videoUrl" @click="downloadVideo">下载原视频</el-button></template>
    </el-dialog>
  </article>
</template>

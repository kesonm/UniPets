<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { localDateTime } from './business'
import type { H5Comment } from './types'

const props = defineProps<{postId:string; user:User|null}>()
const emit = defineEmits<{login:[]}>()
const comments = ref<H5Comment[]>([])
const ownIds = ref<string[]>([])
const input = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let revision = 0

async function load() {
  const version=++revision
  loading.value=true;error.value=''
  try {
    const [feed,own]=await Promise.all([
      api<{comments:H5Comment[]}>('/h5/posts/'+props.postId+'/comments'),
      props.user?api<{ids:string[]}>('/h5/my-comments/'+props.postId):Promise.resolve({ids:[]}),
    ])
    if (version!==revision) return
    comments.value=feed.comments;ownIds.value=own.ids
  } catch(cause) {if (version===revision) error.value=cause instanceof Error?cause.message:'评论读取失败'}
  finally {if(version===revision) loading.value=false}
}
watch(()=>[props.postId,props.user?.id],()=>{
  comments.value=[];ownIds.value=[];input.value=''
  void load()
},{immediate:true})

async function send() {
  if (!props.user) {emit('login');return}
  if (busy.value||!input.value.trim()) return
  const id=props.postId
  const owner=props.user.id
  busy.value=true
  try {
    await api('/h5/posts/'+id+'/comments',{method:'POST',body:{body:input.value}})
    if (props.postId===id&&props.user?.id===owner) {input.value='';await load()}
  } catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'评论未发布')}
  finally {busy.value=false}
}
async function remove(id:string) {
  if (busy.value||!ownIds.value.includes(id)) return
  busy.value=true
  try {await api('/h5/posts/'+props.postId+'/comments/'+id,{method:'DELETE',body:{}});await load()}
  catch(cause) {ElMessage.error(cause instanceof Error?cause.message:'评论删除失败')}
  finally {busy.value=false}
}
</script>

<template>
  <section class="h5-comments" aria-label="动态评论">
    <h3 class="h5-small-heading">评论</h3>
    <p v-if="error" class="h5-muted" role="status">{{ error }} <button type="button" class="h5-text-button" @click="load">重试</button></p>
    <p v-else-if="loading" class="h5-muted">正在读取评论…</p>
    <p v-else-if="!comments.length" class="h5-muted">还没有评论</p>
    <div v-else class="h5-record-list">
      <article v-for="comment in comments" :key="comment.id" class="h5-record">
        <div><strong>{{ comment.author }}</strong><small>{{ localDateTime(comment.createdAt) }}</small><button v-if="ownIds.includes(comment.id)" type="button" class="h5-text-button" :disabled="busy" @click="remove(comment.id)">删除</button></div>
        <p>{{ comment.body }}</p>
      </article>
    </div>
    <form v-if="user" class="h5-form" @submit.prevent="send">
      <label class="visually-hidden" for="h5-comment">写评论</label>
      <textarea id="h5-comment" v-model.trim="input" maxlength="500" rows="2" placeholder="写评论" required />
      <button class="h5-secondary" type="submit" :disabled="busy || !input.trim()">发布评论</button>
    </form>
    <button v-else type="button" class="h5-text-button" @click="emit('login')">登录后评论</button>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '../lib/api'
import type { User } from '../lib/types'

const open=defineModel<boolean>({required:true})
const emit=defineEmits<{ signed:[User] }>()
const mode=ref<'login'|'register'>('login')
const username=ref('')
const password=ref('')
const repeat=ref('')
const busy=ref(false)
const error=ref('')
watch(open,visible=>{if(visible){mode.value='login';password.value='';repeat.value='';error.value=''}})

async function submit() {
  if (busy.value) return
  error.value=''
  if (mode.value==='register' && repeat.value!==password.value) {error.value='两次输入的密码不一致';return}
  busy.value=true
  try {
    const {user}=await api<{user:User}>(`/auth/${mode.value}`,{method:'POST',body:{username:username.value,password:password.value}})
    password.value='';repeat.value='';open.value=false;emit('signed',user)
  } catch(problem) { error.value=problem instanceof Error?problem.message:'暂时无法登录' }
  finally {busy.value=false}
}
</script>

<template>
  <el-dialog v-model="open" title="登录云上空间" class="h5-dialog" width="min(435px, 92vw)" append-to-body destroy-on-close>
    <div class="h5-chips h5-auth-switch" aria-label="登录或注册"><button type="button" :class="{active:mode==='login'}" @click="mode='login';error=''">登录</button><button type="button" :class="{active:mode==='register'}" @click="mode='register';error=''">注册</button></div>
    <form class="h5-form" @submit.prevent="submit">
      <label>账号<input v-model.trim="username" name="username" autocomplete="username" required maxlength="32" placeholder="字母、数字或下划线"></label>
      <label>密码<input v-model="password" name="password" required :minlength="mode==='register'?8:undefined" maxlength="128" type="password" :autocomplete="mode==='register'?'new-password':'current-password'"></label>
      <label v-if="mode==='register'">确认密码<input v-model="repeat" required type="password" autocomplete="new-password"></label>
      <p v-if="error" class="h5-form-error" role="alert">{{ error }}</p>
      <button class="h5-primary" type="submit" :disabled="busy">{{ busy ? '处理中…' : mode==='login' ? '登录账号' : '创建账号' }}</button>
    </form>
  </el-dialog>
</template>

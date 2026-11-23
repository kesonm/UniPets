import { ref } from 'vue'
import type { User } from '../../../src/lib/types'

const sessionKey = 'petcloud.wx.session.v1'
type Session = { token: string; user: User }
const stored: Session | undefined = uni.getStorageSync(sessionKey) || undefined
let token = stored?.token || ''
export const user = ref<User | null>(stored?.user || null)
export const loggingIn = ref(false)
export const loginError = ref('')
let pending: Promise<void> | undefined

function apiOrigin() {
  const origin = (import.meta.env.VITE_PETCLOUD_API_ORIGIN || '').trim().replace(/\/+$/, '')
  const development = uni.getAccountInfoSync().miniProgram.envVersion === 'develop'
  if (/^https:\/\/[a-z\d.-]+(?::\d+)?$/i.test(origin)) return origin
  if (development && !origin) return 'http://127.0.0.1:3008'
  if (development && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return origin
  throw new Error('请配置小程序的 HTTPS 服务域名')
}
export function apiUrl(path: string) {
  const prefix = (import.meta.env.VITE_PETCLOUD_API_PREFIX || '').trim().replace(/\/+$/, '')
  if (!/^(?:\/[a-z\d_-]+)*$/i.test(prefix)) throw new Error('小程序 API 路径配置无效')
  return apiOrigin() + prefix + '/api' + path
}
export function publicImage(path: string) {
  try {
    return apiUrl(path)
  } catch {
    return ''
  }
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试'
}
export function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}
const tabPages = new Set(['home', 'friends', 'orders', 'pets', 'account'])
export function go(page: string, args: Record<string, string> = {}) {
  if (tabPages.has(page)) {
    uni.switchTab({ url: '/pages/' + page + '/index' })
    return
  }
  const query = Object.entries(args)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&')
  uni.navigateTo({ url: '/pages/' + page + '/index' + (query ? '?' + query : '') })
}
export function petsTab() {
  go('pets')
}
export function confirm(title: string, content: string) {
  return new Promise<boolean>((resolve) =>
    uni.showModal({ title, content, success: (r) => resolve(r.confirm), fail: () => resolve(false) }),
  )
}
function forget() {
  token = ''
  user.value = null
  uni.removeStorageSync(sessionKey)
}
export function updateUser(value: User) {
  user.value = value
  uni.setStorageSync(sessionKey, { user: value, token })
}
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
export function api<T>(path: string, method: Method = 'GET', data?: Record<string, unknown>, timeout = 18000): Promise<T> {
  const usedToken = token
  return new Promise((resolve, reject) =>
    uni.request({
      url: apiUrl(path),
      method,
      data: method === 'GET' ? undefined : data || {},
      timeout,
      header: {
        'Content-Type': 'application/json',
        'X-PetCloud-Client': 'miniprogram',
        ...(usedToken ? { Authorization: 'Bearer ' + usedToken } : {}),
      },
      success(r) {
        if (usedToken !== token) return reject(new Error('账号已切换，请重新打开页面'))
        if (r.statusCode >= 200 && r.statusCode < 300) return resolve(r.data as T)
        if (r.statusCode === 401 && usedToken) forget()
        reject(new Error((r.data as { error?: string })?.error || '请求失败（' + r.statusCode + '）'))
      },
      fail: () => reject(new Error('无法连接宠云，请检查网络或服务域名')),
    }),
  )
}
export async function restoreSession() {
  if (!token) return
  try {
    const r = await api<{ user: User }>('/auth/me')
    updateUser(r.user)
  } catch {
    /* Offline users can retry in the page. */
  }
}
export function login() {
  if (pending) return pending
  loggingIn.value = true
  loginError.value = ''
  pending = (async () => {
    try {
      const code = await new Promise<string>((resolve, reject) =>
        uni.login({
          provider: 'weixin',
          success: (r) => (r.code ? resolve(r.code) : reject(new Error('微信未返回登录凭证'))),
          fail: () => reject(new Error('微信登录未完成，请重试')),
        }),
      )
      const result = await api<Session>('/auth/wechat', 'POST', { code })
      token = result.token
      updateUser(result.user)
    } catch (err) {
      loginError.value = message(err)
    } finally {
      loggingIn.value = false
      pending = undefined
    }
  })()
  return pending
}
export async function logout() {
  await api('/auth/logout', 'POST')
  forget()
}
function downloadImage(path: string, label: string): Promise<string> {
  const usedToken = token
  return new Promise((resolve, reject) =>
    uni.downloadFile({
      url: apiUrl(path),
      header: { Authorization: 'Bearer ' + usedToken },
      success: (r) =>
        r.statusCode === 200 && token === usedToken
          ? resolve(r.tempFilePath)
          : reject(new Error(label + '暂时无法读取')),
      fail: () => reject(new Error(label + '下载失败')),
    }),
  )
}
export function downloadAsset(id: string) {
  return downloadImage('/assets/' + id + '/file', '照片')
}
export function downloadIdentityCode(id: string, kind: 'barcode'|'qrcode') {
  return downloadImage('/pets/' + id + '/identity/codes/' + kind, '身份证识别码')
}
export function today() {
  const d = new Date()
  return [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
export const speciesNames = { cat: '猫', dog: '狗', other: '其他' }
export const genderNames = { unknown: '未填写', female: '母', male: '公' }

export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const base = import.meta.env.BASE_URL === '/pet/'
  ? '/pet'
  : (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
export const apiUrl = (path: string) => `${base}/api${path}`
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method || 'GET'
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-PetCloud-Client': 'web' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch { throw new ApiError(0, '无法连接服务，请确认后端已启动') }
  const { status } = response
  const data = await response.json().catch(() => ({ error: '服务暂时不可用，请确认后端已启动' }))
  if (status >= 400) {
    if (status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('petcloud:unauthorized'))
    throw new ApiError(status, data.error || '请求失败，请稍后再试')
  }
  return data as T
}
export async function mediaObjectUrl(path: string): Promise<string> {
  const response = await fetch(apiUrl(path), { credentials: 'include' })
  if (!response.ok) throw new Error('素材暂时无法读取')
  return URL.createObjectURL(await response.blob())
}
export function imageUrl(id: string, variant: 'image'|'video' = 'image'): Promise<string> {
  return mediaObjectUrl(`/assets/${encodeURIComponent(id)}/${variant==='video'?'video':'file'}`)
}
export async function downloadAsset(id: string, name: string, variant: 'image'|'video' = 'image') {
  const url = await imageUrl(id,variant)
  const link = document.createElement('a')
  link.href=url;link.download=name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function fileData(file: File): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return Promise.reject(new Error('请选择 JPG、PNG 或 WebP 图片'))
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('图片不能超过 8MB'))
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error('图片读取失败')); reader.readAsDataURL(file) })
}

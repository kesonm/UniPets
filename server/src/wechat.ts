import { config } from './config.js'
import { HttpError } from './errors.js'

export async function exchangeWeChatCode(code: string) {
  if (!config.wechatAppId || !config.wechatAppSecret) throw new HttpError(503, '微信登录尚未配置')
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.search = new URLSearchParams({
    appid: config.wechatAppId,
    secret: config.wechatAppSecret,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString()
  let data: { openid?: unknown; session_key?: unknown; errcode?: unknown }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    if (!response.ok) throw new Error()
    data = await response.json()
    if (!data || typeof data !== 'object') throw new Error()
  } catch {
    throw new HttpError(502, '暂时无法连接微信登录服务，请稍后重试')
  }
  if (data.errcode === 40029 || data.errcode === 40163)
    throw new HttpError(401, '微信登录凭证已失效，请重新登录')
  if (data.errcode === 45011) throw new HttpError(429, '微信登录过于频繁，请稍后再试')
  if (data.errcode === 40226) throw new HttpError(403, '微信暂时限制了此账号登录')
  if (
    data.errcode ||
    typeof data.openid !== 'string' ||
    !/^[\w-]{1,128}$/.test(data.openid) ||
    typeof data.session_key !== 'string' ||
    !data.session_key
  ) {
    throw new HttpError(502, '微信登录未成功，请稍后重试')
  }
  return data.openid
}

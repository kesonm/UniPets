import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import sharp from 'sharp'
import { z } from 'zod'
import { db, rows, transaction } from './db.js'
import { config } from './config.js'
import { HttpError } from './errors.js'
import { exchangeWeChatCode } from './wechat.js'
const scrypt = promisify(scryptCallback)
export interface User { id: string; username: string; displayName: string; createdAt: string; avatarVersion: string | null; publicId: string }
type AccountRow = Omit<User, 'publicId'> & { publicNumber: number }
declare global { namespace Express { interface Request { user: User; tokenHash: string; isAdmin: boolean } } }
const userSelect = 'id, username, display_name AS displayName, created_at AS createdAt, avatar_version AS avatarVersion, public_number AS publicNumber'
const cookieName = 'petcloud_session'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function accountUser({ publicNumber, ...account }: AccountRow): User {
  // MEDIUMINT UNSIGNED fits in three base-26 letters and three decimal digits.
  const group = Math.floor(publicNumber / 1000)
  const prefix = String.fromCharCode(65 + Math.floor(group / 676), 65 + Math.floor(group / 26) % 26, 65 + group % 26)
  return { ...account, publicId: prefix + String(publicNumber % 1000).padStart(3, '0') }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64) as Buffer
  return `scrypt:${salt}:${key.toString('hex')}`
}
async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, hash] = encoded.split(':')
  if (scheme !== 'scrypt' || !salt || hash?.length !== 128) return false
  const key = await scrypt(password, salt, 64) as Buffer
  return timingSafeEqual(key, Buffer.from(hash, 'hex'))
}
const dummyPassword = hashPassword(randomBytes(24).toString('hex'))
const sessionCookie = (req: Request) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: req.secure || (config.production && !config.allowHttpAuth),
  path: '/',
})
function tokenFor(req: Request) {
  const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (bearer) return bearer
  return req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || ''
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = tokenFor(req)
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, '请先登录')
  const tokenHash = digest(token)
  const [session] = await rows<AccountRow & {isAdmin: number}>(`SELECT u.id,u.username,u.display_name AS displayName,
    u.created_at AS createdAt,u.avatar_version AS avatarVersion,u.public_number AS publicNumber,u.is_admin AS isAdmin FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND u.disabled_at IS NULL`, [tokenHash])
  if (!session) throw new HttpError(401, '登录已过期，请重新登录')
  const {isAdmin,...user} = session
  req.user = accountUser(user)
  req.isAdmin = Boolean(isAdmin)
  req.tokenHash = tokenHash
  next()
}
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  return tokenFor(req) ? requireAuth(req, res, next) : next()
}
async function storeSession(conn: PoolConnection, userId: string, token: string, admin = false) {
  const [[account]] = await conn.execute<RowDataPacket[]>(
    'SELECT is_admin AS isAdmin,disabled_at AS disabledAt FROM users WHERE id=? FOR UPDATE', [userId])
  if (!account || account.disabledAt) throw new HttpError(403, '账号已停用')
  if (admin && !account.isAdmin) throw new HttpError(403, '当前账号没有管理员权限')
  await conn.execute('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY))', [digest(token), userId])
}
async function issueSession(req: Request, res: Response, user: User, client: 'user'|'admin' = 'user') {
  const token = randomBytes(32).toString('hex')
  await transaction(conn => storeSession(conn, user.id, token, client === 'admin'))
  if (client === 'user' && req.get('X-PetCloud-Client') === 'desktop') res.json({ user, token })
  else { res.cookie(cookieName, token, { ...sessionCookie(req), maxAge: 7 * 86400_000 }); res.json({ user }) }
}
const username = z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/, '账号需为 3–32 位字母、数字或下划线')
const password = z.string().min(8, '密码至少 8 位').max(128, '密码不能超过 128 位')
const profileName = z.string().trim().min(1, '请填写昵称').max(40, '昵称最多 40 个字符')
const maxAvatarBytes = 8 * 1024 * 1024
const avatarImage = z.string().max(4 * Math.ceil(maxAvatarBytes / 3) + 32, '请选择 8 MB 以内的头像')
export const authRouter = Router()
authRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '操作过于频繁，请 15 分钟后重试' } })
authRouter.post('/wechat', authLimiter, async (req, res) => {
  const data = z.object({
    code: z.string().trim().min(1).max(256),
    displayName: profileName.optional(),
    avatarImage: avatarImage.optional(),
  }).strict().parse(req.body)
  const openid = await exchangeWeChatCode(data.code)
  const image = data.avatarImage === undefined ? undefined : await resizeAvatar(data.avatarImage)
  const token = randomBytes(32).toString('hex')
  const findAccount = async () => (await rows<{id: string}>(
    'SELECT id FROM users WHERE wechat_appid=? AND wechat_openid=?', [config.wechatAppId, openid],
  ))[0]
  const signIn = (id: string, create = false) => transaction(async conn => {
    if (create) {
      // A reserved username and a non-scrypt marker keep this identity exclusively on WeChat login.
      await conn.execute(
        'INSERT INTO users (id,username,display_name,password_hash,wechat_appid,wechat_openid) VALUES (?,?,?,?,?,?)',
        [id, 'wx-' + randomBytes(14).toString('hex'), '微信用户', 'wechat', config.wechatAppId, openid],
      )
      await conn.execute('INSERT INTO desktop_profiles (user_id) VALUES (?)', [id])
    }
    await storeSession(conn, id, token)
    if (image) await storeAvatar(conn, id, image, data.displayName)
    else if (data.displayName) await conn.execute('UPDATE users SET display_name=? WHERE id=?', [data.displayName, id])
    const [[account]] = await conn.execute<(RowDataPacket & AccountRow)[]>(`SELECT ${userSelect} FROM users WHERE id=?`, [id])
    return accountUser(account)
  })
  let existing = await findAccount()
  if (!existing) {
    try {
      const user = await signIn(randomUUID(), true)
      res.status(201).json({ user, token })
      return
    } catch (error) {
      if ((error as {code?: string}).code !== 'ER_DUP_ENTRY') throw error
      existing = await findAccount()
      if (!existing) throw new HttpError(503, '暂时无法创建账号，请重新登录')
    }
  }
  res.json({ user: await signIn(existing.id), token })
})
authRouter.post('/register', authLimiter, async (req, res) => {
  const data = z.object({ username, password, displayName: z.string().trim().max(40).optional() }).parse(req.body)
  const id = randomUUID(), hash = await hashPassword(data.password)
  try {
    await transaction(async conn => {
      await conn.execute('INSERT INTO users (id,username,display_name,password_hash) VALUES (?,?,?,?)', [id, data.username, data.displayName || data.username, hash])
      await conn.execute('INSERT INTO desktop_profiles (user_id) VALUES (?)', [id])
    })
  } catch (error: any) { if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, '这个账号已被注册'); throw error }
  const [user] = await rows<AccountRow>(`SELECT ${userSelect} FROM users WHERE id=?`, [id])
  res.status(201); await issueSession(req, res, accountUser(user))
})
async function verifyLogin(body: unknown): Promise<User> {
  const data = z.object({ username: z.string().trim().min(1).max(64), password: z.string().max(128) }).parse(body)
  const [user] = await rows<AccountRow & { passwordHash: string }>(`SELECT ${userSelect}, password_hash AS passwordHash FROM users WHERE username=?`, [data.username])
  const valid = await verifyPassword(data.password, user?.passwordHash || await dummyPassword)
  if (!user || !valid) throw new HttpError(401, '账号或密码错误')
  const { passwordHash: _, ...publicUser } = user
  return accountUser(publicUser)
}
authRouter.post('/login', authLimiter, async (req, res) => {
  await issueSession(req, res, await verifyLogin(req.body))
})
export async function adminLogin(req: Request, res: Response) {
  await issueSession(req, res, await verifyLogin(req.body), 'admin')
}
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))
authRouter.post('/logout', requireAuth, async (req, res) => {
  await db.execute('DELETE FROM sessions WHERE token_hash=?', [req.tokenHash])
  res.clearCookie(cookieName, sessionCookie(req)); res.json({ ok: true })
})
authRouter.route('/profile').all(requireAuth).patch(updateProfile).put(updateProfile)

async function resizeAvatar(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new HttpError(400, '请选择 JPG、PNG 或 WebP 头像')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > maxAvatarBytes) throw new HttpError(413, '请选择 8 MB 以内的头像')
  try {
    const source = sharp(bytes, { limitInputPixels: 25_000_000 })
    const { format, pages } = await source.metadata()
    if (format !== match[1] || (pages ?? 1) !== 1) throw new Error('Invalid avatar image')
    return await source.rotate().resize(256, 256, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  } catch {
    throw new HttpError(400, '头像图片无法读取，请重新选择')
  }
}

async function sendProfile(req: Request, res: Response) {
  const [user] = await rows<AccountRow>(`SELECT ${userSelect} FROM users WHERE id=? AND disabled_at IS NULL`, [req.user.id])
  if (!user) throw new HttpError(401, '登录已过期，请重新登录')
  res.json({ user: accountUser(user) })
}
async function updateProfile(req: Request, res: Response) {
  const data = z.object({ displayName: profileName }).parse(req.body)
  await db.execute('UPDATE users SET display_name=? WHERE id=? AND disabled_at IS NULL', [data.displayName, req.user.id])
  await sendProfile(req, res)
}

authRouter.get('/profile/avatar', requireAuth, async (req, res) => {
  const [user] = await rows<{ image: Buffer | null }>(
    'SELECT avatar_image AS image FROM users WHERE id=? AND disabled_at IS NULL', [req.user.id])
  if (!user?.image) throw new HttpError(404, '尚未设置头像')
  res.type('webp').send(user.image)
})
authRouter.put('/profile/avatar', requireAuth, async (req, res) => {
  const data = z.object({
    displayName: profileName.optional(),
    avatarImage,
  }).parse(req.body)
  await storeAvatar(db, req.user.id, await resizeAvatar(data.avatarImage), data.displayName)
  await sendProfile(req, res)
})

async function storeAvatar(executor: Pick<PoolConnection, 'execute'>, userId: string, image: Buffer, displayName?: string) {
  const version = createHash('sha256').update(image).digest('hex').slice(0, 16)
  await executor.execute(`UPDATE users SET display_name=COALESCE(?,display_name), avatar_version=?, avatar_image=?
    WHERE id=? AND disabled_at IS NULL`, [displayName ?? null, version, image, userId])
}

authRouter.post('/password', requireAuth, authLimiter, async (req, res) => {
  const data = z.object({ currentPassword: z.string().max(128), newPassword: password }).parse(req.body)
  const [user] = await rows<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=?', [req.user.id])
  if (!await verifyPassword(data.currentPassword, user.password_hash)) throw new HttpError(400, '当前密码不正确')
  const hash = await hashPassword(data.newPassword)
  await transaction(async conn => {
    await conn.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id])
    await conn.execute('DELETE FROM sessions WHERE user_id=?', [req.user.id])
  })
  res.clearCookie(cookieName, sessionCookie(req)); res.json({ ok: true })
})

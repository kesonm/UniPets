import express, { type ErrorRequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { authRouter, requireAuth } from './auth.js'
import { adminRouter } from './admin.js'
import { apiRouter } from './routes.js'
import { h5Router } from './h5.js'
import { config } from './config.js'
import { db } from './db.js'
import { HttpError } from './errors.js'
export function createApp(privateRoutes = apiRouter) {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', 1)
  app.use((req,res,next) => {
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Cache-Control','no-store')
    const origin = req.get('Origin')
    if (origin) {
      if (!config.origins.includes(origin)) return res.status(403).json({ error: '不允许的请求来源' })
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin')
      res.setHeader('Access-Control-Allow-Credentials','true')
      res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-PetCloud-Client')
      res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    if (!['GET','HEAD'].includes(req.method)) {
      if (!req.is('application/json')) return res.status(415).json({ error: '请求必须使用 JSON' })
      const wechatLogin = req.method === 'POST' && req.path === '/api/auth/wechat' && req.get('X-PetCloud-Client') === 'miniprogram'
      const serviceSearch = req.method === 'POST' && req.path === '/api/h5/catalog/service-posts/search' && req.get('X-PetCloud-Client') === 'miniprogram'
      if (!origin && !req.headers.authorization && req.get('X-PetCloud-Client') !== 'desktop' && !wechatLogin && !serviceSearch) return res.status(403).json({ error: '请求来源校验失败' })
    }
    next()
  })
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '请求过于频繁，请稍后再试' } }))
  app.use(express.json({ limit: '12mb' }))
  app.get('/api/health', async (_req,res) => { await db.query('SELECT 1'); res.json({ ok: true, database: 'mysql' }) })
  app.use('/api/auth',authRouter)
  app.use('/api/admin',adminRouter)
  app.use('/api/h5',h5Router)
  app.use('/api',requireAuth,privateRoutes)
  app.use((_req,res) => res.status(404).json({ error: '接口不存在' }))
  const handler: ErrorRequestHandler = (error,_req,res,next) => {
    if (res.headersSent) return next(error)
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || '参数不正确' })
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
    if (error.type === 'entity.too.large') return res.status(413).json({ error: '上传内容过大，请选择 8MB 以内的图片' })
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON 格式不正确' })
    console.error('API error:', error.code || error.message)
    res.status(500).json({ error: '服务暂时不可用，请稍后重试' })
  }
  app.use(handler)
  return app
}

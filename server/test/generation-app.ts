import { Router } from 'express'
import { createApp } from '../src/app.js'
import { generationRouter } from '../src/generation-routes.js'
import { apiRouter } from '../src/routes.js'

// 仅旧流程的集成测试在独立 HTTP 服务中挂载生成接口。
export function createGenerationTestApp() {
  return createApp(Router().use(generationRouter, apiRouter))
}

import { createApp } from './app.js'
import { db } from './db.js'
import { config } from './config.js'
import { initializeDeskPetGeneration } from './desk-pet-generation.js'
// import { startWorker, stopWorker } from './jobs.js'
try {
  await db.query('SELECT 1')
  // AI 生成暂停期间保留队列，不恢复或提交任务。
  // await startWorker()
  await initializeDeskPetGeneration()
  const server = createApp().listen(config.port,config.host,() => console.log(`PetCloud API: http://${config.host}:${config.port}`))
  server.on('error', error => { console.error(error.message); process.exit(1) })
  let stopping = false
  const stop = async () => {
    if (stopping) return; stopping = true
    server.close()
    // await stopWorker()
    await db.end(); process.exit(0)
  }
  process.on('SIGTERM',stop); process.on('SIGINT',stop)
} catch (error: any) {
  console.error('后端启动失败，请检查 MySQL 配置并执行 pnpm db:migrate：', error.code || error.message)
  await db.end(); process.exitCode = 1
}

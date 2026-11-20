import { z } from 'zod'
import { saveTransparentReplacement, storagePath, type Action } from './assets.js'
import { db, rows } from './db.js'
import { extractVideo } from './video.js'

async function main() {
  const jobId = z.string().uuid().safeParse(process.argv[2])
  if (!jobId.success) throw new Error('用法：pnpm --dir server video:cutout <视频任务 ID>')
  const assets = await rows<{id:string;userId:string;videoKey:string;action:Action;duration:number;fps:number;backgroundRemoved:number}>(`
    SELECT a.id,a.user_id AS userId,a.source_video_key AS videoKey,a.action,
      j.duration_seconds AS duration,a.fps,a.background_removed AS backgroundRemoved
    FROM assets a JOIN generation_jobs j ON j.id=a.job_id AND j.user_id=a.user_id
    WHERE j.id=? AND j.mode='video' AND j.motion_key IS NULL AND a.kind='sprite' AND a.source_video_key IS NOT NULL
    ORDER BY FIELD(a.action,'idle','happy','walk','sleep')
  `,[jobId.data])
  if (!assets.length) throw new Error('该任务没有已保存的原视频')
  for (const asset of assets) {
    if (asset.backgroundRemoved) {
      console.log(`${asset.action}: 已是透明动作`)
      continue
    }
    const sheet = await extractVideo(storagePath(asset.videoKey),asset.duration,asset.fps,'require-transparent',asset.action)
    const replaced = await saveTransparentReplacement(asset.userId,asset.id,sheet)
    console.log(`${asset.action}: ${replaced?'已更新为透明动作':'已是透明动作'} · ${sheet.frames} 帧`)
  }
}

try { await main() }
catch(error) { console.error(error instanceof Error ? error.message : '处理失败');process.exitCode=1 }
finally { await db.end() }

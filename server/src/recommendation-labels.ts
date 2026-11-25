import type { ResultSetHeader } from 'mysql2/promise'
import { z } from 'zod'
import { defaultRecommendationLabels, recommendationLabelColor, recommendationLabelTextLimit,
  type RecommendationLabels, type RecommendationLabelSettings } from '../../shared/h5-recommendation-labels.mjs'
import { db, rows } from './db.js'
import { HttpError } from './errors.js'

const color = z.string().trim().regex(recommendationLabelColor, '请输入 #RRGGBB 格式的颜色').transform(value => value.toUpperCase())
const label = z.object({
  text: z.string().trim().min(1,'请填写标签文字').max(recommendationLabelTextLimit,'标签文字最多 8 个字符')
    .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u,'标签文字需为单行'),
  textColor: color,
  backgroundColor: color,
}).strict()
const labels = z.object({ product:label, service:label, job:label, story:label }).strict()
const updateInput = z.object({ labels, revision:z.number().int().nonnegative().max(4_294_967_294) }).strict()

export async function getRecommendationLabelSettings(): Promise<RecommendationLabelSettings> {
  const [saved] = await rows<{labels:RecommendationLabels;revision:number}>(
    'SELECT labels,revision FROM h5_recommendation_label_settings WHERE id=1')
  return saved ?? { labels:defaultRecommendationLabels, revision:0 }
}

export async function updateRecommendationLabelSettings(value: unknown): Promise<RecommendationLabelSettings> {
  const next = updateInput.parse(value)
  const json = JSON.stringify(next.labels)
  const conflict = new HttpError(409,'有人更新了标签配置，请重新读取后再保存')
  if (next.revision === 0) {
    try {
      await db.execute('INSERT INTO h5_recommendation_label_settings (id,labels,revision) VALUES (1,?,1)',[json])
    } catch (cause) {
      if ((cause as {code?:string}).code === 'ER_DUP_ENTRY') throw conflict
      throw cause
    }
  } else {
    const [result] = await db.execute<ResultSetHeader>(`UPDATE h5_recommendation_label_settings SET labels=?,revision=revision+1
      WHERE id=1 AND revision=?`,[json,next.revision])
    if (!result.affectedRows) throw conflict
  }
  return { labels:next.labels, revision:next.revision+1 }
}

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { catalogStore, servicePostScope, servicePostVisible } from './catalog.js'
import { rows } from './db.js'

export const h5MyContentRouter = Router()
const tabs = z.enum(['published','likes','favorites','receivedLikes'])
type Tab = z.infer<typeof tabs>
const pageSize = 20
const publicStory = 's.published_at IS NOT NULL AND s.hidden_at IS NULL'
const postFields = `'post' AS kind,p.id,p.title,p.hidden_at IS NULL AS visible`
const storyFields = `'story' AS kind,s.id,s.title,s.hidden_at IS NULL AS visible`
const serviceFields = `'service' AS kind,i.id,i.title,COALESCE((${servicePostVisible}),FALSE) AS visible`

function activity(tab: Tab, owner: string) {
  if (tab === 'published') return {
    sql:`SELECT ${postFields},p.created_at AS activityAt FROM h5_posts p WHERE p.user_id=?
      UNION ALL SELECT ${storyFields},s.published_at AS activityAt FROM h5_stories s
        WHERE s.user_id=? AND s.published_at IS NOT NULL
      UNION ALL SELECT ${serviceFields},i.updated_at AS activityAt FROM h5_catalog_items i ${catalogStore}
        WHERE i.publisher_user_id=? AND ${servicePostScope}`,
    values:[owner,owner,owner],
  }
  if (tab === 'receivedLikes') return {
    sql:`SELECT 'post' AS kind,p.id,p.title,TRUE AS visible,p.created_at AS activityAt,COUNT(*) AS receivedLikes
      FROM h5_posts p JOIN h5_reactions r ON r.post_id=p.id AND r.kind='like' AND r.user_id<>p.user_id
      WHERE p.user_id=? AND p.hidden_at IS NULL GROUP BY p.id
      UNION ALL SELECT 'story',s.id,s.title,TRUE,s.published_at,COUNT(*)
      FROM h5_stories s JOIN h5_story_reactions r ON r.story_id=s.id AND r.kind='like' AND r.user_id<>s.user_id
      WHERE s.user_id=? AND ${publicStory} GROUP BY s.id
      UNION ALL SELECT 'service',i.id,i.title,TRUE,i.updated_at,COUNT(*)
      FROM h5_catalog_items i ${catalogStore} JOIN h5_service_likes r ON r.item_id=i.id AND r.user_id<>i.publisher_user_id
      WHERE i.publisher_user_id=? AND ${servicePostVisible} GROUP BY i.id`,
    values:[owner,owner,owner],
  }
  const kind = tab === 'likes' ? 'like' : 'favorite'
  const reactions = `SELECT ${postFields},r.created_at AS activityAt
    FROM h5_reactions r JOIN h5_posts p ON p.id=r.post_id WHERE r.user_id=? AND r.kind=? AND p.hidden_at IS NULL
    UNION ALL SELECT ${storyFields},s.published_at AS activityAt FROM h5_story_reactions r
      JOIN h5_stories s ON s.id=r.story_id WHERE r.user_id=? AND r.kind=? AND ${publicStory}`
  const values = [owner,kind,owner,kind]
  return tab === 'likes' ? {
    sql:`${reactions} UNION ALL SELECT ${serviceFields},i.updated_at AS activityAt
      FROM h5_service_likes r JOIN h5_catalog_items i ON i.id=r.item_id ${catalogStore}
      WHERE r.user_id=? AND ${servicePostVisible}`,
    values:[...values,owner],
  } : {sql:reactions,values}
}

h5MyContentRouter.get('/posts/mine/counts', requireAuth, async (req,res) => {
  const counts = await Promise.all(tabs.options.map(async tab => {
    const {sql,values} = activity(tab,req.user.id)
    const total = tab === 'receivedLikes' ? 'COALESCE(SUM(receivedLikes),0)' : 'COUNT(*)'
    const [result] = await rows<{count:number|string}>(`SELECT ${total} AS count FROM (${sql}) AS entries`, values)
    return [tab,Number(result.count)] as const
  }))
  res.json({counts:Object.fromEntries(counts)})
})

h5MyContentRouter.get('/posts/mine', requireAuth, async (req,res) => {
  const {tab,page} = z.object({
    tab:tabs.default('published'),page:z.coerce.number().int().min(1).max(10_000).default(1),
  }).parse(req.query)
  const {sql,values} = activity(tab,req.user.id)
  const order = tab === 'receivedLikes' ? 'receivedLikes DESC,activityAt DESC,kind,id DESC' : 'activityAt DESC,kind,id DESC'
  const items = await rows(`${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...values,pageSize+1,(page-1)*pageSize])
  res.json({items:items.slice(0,pageSize),hasMore:page < 10_000 && items.length > pageSize})
})

import { createHash } from 'node:crypto'
import { serviceCategories, type PostPetType } from '../../shared/h5-discovery.mjs'
import { rows } from './db.js'
import type { ServiceRecord } from './h5-service-posts.js'
import { serviceCategoryColumn, serviceCategoryLabel } from './service-categories.js'

export interface PublicPost {
  id: string
  title: string
  body: string
  petType: PostPetType
  breed: string
  createdAt: Date
}

type Candidate = { kind: 'post'; post: PublicPost } | { kind: 'service'; post: ServiceRecord }
type PetSignal = { petType: PostPetType; breed: string }
type Text = { title: string; body: string }

const petWords: Record<PostPetType, readonly string[]> = {
  cat: ['猫', '喵', 'cat', '布偶', '英短'],
  dog: ['狗', '犬', 'dog', '金毛', '拉布拉多', '柯基'],
  rabbit: ['兔', 'rabbit'],
  other: [],
}

async function recommendationSignals(owner?: string): Promise<[PetSignal[], Text[]]> {
  if (!owner) return [[], []]
  return Promise.all([
    rows<PetSignal>(`SELECT breed,CASE WHEN species='other' AND (LOCATE('兔',breed)>0 OR LOCATE('rabbit',LOWER(breed))>0)
      THEN 'rabbit' ELSE species END AS petType FROM pets WHERE user_id=?`, [owner]),
    rows<Text>(`SELECT title,LEFT(body,1200) AS body FROM h5_posts WHERE user_id=? AND hidden_at IS NULL
      AND created_at>=UTC_TIMESTAMP(3)-INTERVAL 30 DAY
      AND (topic IN ('help','rescue') OR LOCATE('求助',CONCAT_WS(' ',title,body))>0)
      ORDER BY created_at DESC,id LIMIT 6`, [owner]),
  ])
}

function tokens(text: string) {
  const result = new Set<string>()
  for (const word of text.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? []) {
    if (/^[a-z0-9]+$/.test(word)) result.add(word)
    else for (let index = 0; index < word.length - 1; index++) result.add(word.slice(index, index + 2))
  }
  return result
}

function similarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0
  let same = 0
  for (const word of left) if (right.has(word)) same++
  return same / Math.sqrt(left.size * right.size)
}

function matchServiceCategories(help: string[]) {
  return serviceCategories.filter(category => category.terms.some(term => help.some(text => text.includes(term))))
    .map(category => category.id)
}

function rankFor(seed: string, pets: PetSignal[], requests: Text[]) {
  const help = requests.map(({title, body}) => (title + ' ' + body).toLowerCase())
  const helpTokens = help.map(tokens)
  const interests = new Set(matchServiceCategories(help))
  const types = new Set(pets.map(pet => pet.petType))
  const breeds = pets.map(pet => pet.breed.trim()).filter(Boolean)

  return (item: Candidate) => {
    const { post } = item
    const text = (item.kind === 'post' ? post.title + ' ' + item.post.body : post.title + ' ' + item.post.description).toLowerCase()
    const date = item.kind === 'post' ? item.post.createdAt : item.post.updatedAt
    const age = Math.max(0, (Date.now() - date.getTime()) / 86_400_000)
    const fresh = 1 / (1 + age / 7)
    const match = item.kind === 'post' ? types.has(item.post.petType)
      : [...types].some(type => petWords[type].some(term => text.includes(term)))
    const breed = breeds.some(name => text.includes(name.toLowerCase())) ||
      (item.kind === 'post' && breeds.includes(item.post.breed))
    const contentTokens = tokens(text)
    const related = Math.max(0, ...helpTokens.map(request => similarity(request, contentTokens)))
    const helpCategory = item.kind === 'service' &&
      (interests.has(item.post.category) || help.some(request => request.includes(item.post.categoryLabel)))
    const random = createHash('sha256').update(seed + ':' + item.kind + ':' + post.id).digest().readUInt32BE(0) / 2 ** 32
    return 4 * Number(match) + 2 * Number(breed) + 5 * Number(helpCategory) + 6 * related + fresh + 2.8 * random
  }
}

export async function recommendedPosts(posts: PublicPost[], services: ServiceRecord[], owner: string | undefined, seed: string) {
  const [pets, help] = await recommendationSignals(owner)
  const score = rankFor((owner ?? seed) + ':' + new Date().toISOString().slice(0, 10), pets, help)
  const content: Candidate[] = [
    ...posts.map(post => ({ kind: 'post' as const, post })),
    ...services.map(post => ({ kind: 'service' as const, post })),
  ]
  const ranked = content.map(item => ({ item, score: score(item) })).sort((a, b) => b.score - a.score)
  const max = 12
  const reserved = new Set([
    ...ranked.filter(row => row.item.kind === 'service').slice(0, max / 2),
    ...ranked.filter(row => row.item.kind === 'post').slice(0, max / 2),
  ])
  for (const row of ranked) {
    if (reserved.size >= max) break
    reserved.add(row)
  }
  return ranked.filter(row => reserved.has(row)).map(row => row.item)
}

// Sort the entire filtered service list before pagination using the same pet and help signals as the home feed.
export async function serviceRecommendation(owner?: string) {
  const [pets, requests] = await recommendationSignals(owner)
  if (!pets.length && !requests.length) return {sql:'likes DESC',values:[]}
  const help = requests.map(({title, body}) => (title + ' ' + body).toLowerCase())
  const types = [...new Set(pets.flatMap(pet => petWords[pet.petType]))]
  const breeds = [...new Set(pets.map(pet => pet.breed.trim().toLowerCase()).filter(Boolean))]
  const categoryHints = matchServiceCategories(help)
  const helpTokens = [...new Set(help.flatMap(text => [...tokens(text)]))].slice(0, 60)
  const text = `LOWER(CONCAT_WS(' ', i.title, i.description, ${serviceCategoryLabel}))`
  const termsMatch = `EXISTS(SELECT 1 FROM JSON_TABLE(?, '$[*]' COLUMNS(term VARCHAR(200) PATH '$'))
    AS terms WHERE LOCATE(terms.term COLLATE utf8mb4_0900_ai_ci, ${text})>0)`
  return {
    sql: `(4*${termsMatch} + 2*${termsMatch} + 2*${termsMatch} +
      5*(JSON_CONTAINS(?, JSON_QUOTE(${serviceCategoryColumn}))
        OR EXISTS(SELECT 1 FROM JSON_TABLE(?, '$[*]' COLUMNS(body TEXT PATH '$')) AS request
          WHERE LOCATE(${serviceCategoryLabel}, request.body COLLATE utf8mb4_0900_ai_ci)>0))) DESC, likes DESC`,
    values: [types, breeds, helpTokens, categoryHints, help].map(value => JSON.stringify(value)),
  }
}

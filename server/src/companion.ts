import { Router } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { pickCompanionMessage, shanghaiDate, shanghaiHour, timeOfDay } from '../../shared/companion.mjs'
import { getSystemDeskPet, isSystemDeskPetId, parseCustomDeskPetId } from '../../shared/desk-pets.mjs'
import { ownedPet } from './assets.js'
import { rows } from './db.js'
import { HttpError } from './errors.js'
import { getCompanionWeather } from './weather.js'

export const companionRouter = Router()

const nextInput = z.object({
  petId: z.string().trim().min(1).max(64),
  scene: z.enum(['open', 'interval']),
  recent: z.array(z.string().trim().min(1).max(64)).max(12).default([]),
  cityCode: z.string().trim().max(12).optional(),
}).strict()

interface CompanionPet {
  name: string
  species: 'cat' | 'dog'
  days: number | null
  birthday: boolean
}

async function companionPet(userId: string, deskPetId: string): Promise<CompanionPet> {
  if (isSystemDeskPetId(deskPetId)) {
    const pet = getSystemDeskPet(deskPetId)
    return { name: pet.name, species: pet.species === 'dog' ? 'dog' : 'cat', days: null, birthday: false }
  }
  const petId = parseCustomDeskPetId(deskPetId)
  if (!petId) throw new HttpError(400, '请选择有效的桌宠')
  const pet = await ownedPet(userId, petId)
  const [record] = await rows<RowDataPacket & { species: string; birthday: string | null; createdAt: Date }>(
    "SELECT species,DATE_FORMAT(birthday,'%Y-%m-%d') AS birthday,created_at AS createdAt FROM pets WHERE id=? AND user_id=?",
    [petId, userId],
  )
  if (!record) throw new HttpError(404, '宠物不存在')
  const days = Math.max(1, Math.floor((Date.now() - new Date(record.createdAt).getTime()) / 86_400_000) + 1)
  const birthday = Boolean(record.birthday && record.birthday.slice(5) === shanghaiDate().slice(5))
  return { name: pet.name, species: record.species === 'dog' ? 'dog' : 'cat', days, birthday }
}

companionRouter.post('/next', async (req, res) => {
  const input = nextInput.parse(req.body)
  const pet = await companionPet(req.user.id, input.petId)
  const when = timeOfDay(shanghaiHour())
  const weather = await getCompanionWeather(input.cityCode)
  const message = pickCompanionMessage({
    species: pet.species,
    scene: input.scene,
    when,
    recentIds: input.recent,
    weather,
    birthday: pet.birthday,
    days: pet.days,
  })
  res.json({
    message,
    weather,
    nextIntervalMs: 180_000 + Math.floor(Math.random() * 120_000),
  })
})

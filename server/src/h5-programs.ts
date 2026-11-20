import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { rows, transaction } from './db.js'
import { HttpError } from './errors.js'

export const h5ProgramsRouter = Router()
const uuid = z.string().uuid()
const eventFields = `id, title, organizer, city, venue, area, species, starts_at AS startsAt,
  registration_opens_at AS registrationOpensAt, registration_closes_at AS registrationClosesAt,
  CASE
    WHEN UTC_TIMESTAMP(3) < registration_opens_at THEN 'upcoming'
    WHEN UTC_TIMESTAMP(3) < registration_closes_at THEN 'open'
    ELSE 'closed'
  END AS registrationStatus`

const registrationSelect = `SELECT r.pet_id AS petId, p.name AS petName, r.submitted_at AS submittedAt
  FROM h5_event_registrations r JOIN pets p ON p.id=r.pet_id AND p.user_id=r.user_id`

type Species = 'cat' | 'dog' | 'other'
interface EventEligibility extends RowDataPacket { species: Species | null }

h5ProgramsRouter.get('/events', async (_req, res) => {
  const events = await rows(`SELECT ${eventFields} FROM h5_events WHERE published=TRUE
    ORDER BY (starts_at < UTC_TIMESTAMP(3)), CASE WHEN starts_at >= UTC_TIMESTAMP(3) THEN starts_at END,
      starts_at DESC, id LIMIT 100`)
  res.json({ events })
})

h5ProgramsRouter.get('/events/:id', async (req, res) => {
  const id = uuid.parse(req.params.id)
  const [event] = await rows(`SELECT ${eventFields}, rules FROM h5_events WHERE id=? AND published=TRUE`, [id])
  if (!event) throw new HttpError(404, '赛事未发布或已下架')
  res.json({ event })
})

h5ProgramsRouter.get('/events/:id/registrations', requireAuth, async (req, res) => {
  const eventId = uuid.parse(req.params.id)
  const registrations = await rows(`${registrationSelect}
    JOIN h5_events e ON e.id=r.event_id AND e.published=TRUE
    WHERE r.event_id=? AND r.user_id=? ORDER BY r.submitted_at DESC, r.pet_id`, [eventId, req.user.id])
  res.json({ registrations })
})

h5ProgramsRouter.post('/events/:id/registrations', requireAuth, async (req, res) => {
  const eventId = uuid.parse(req.params.id)
  const { petId } = z.object({ petId: uuid }).strict().parse(req.body)
  const userId = req.user.id

  const result = await transaction(async conn => {
    const [[event]] = await conn.execute<EventEligibility[]>(
      'SELECT species FROM h5_events WHERE id=? AND published=TRUE FOR SHARE', [eventId])
    if (!event) throw new HttpError(404, '赛事未发布或已下架')

    const [[pet]] = await conn.execute<(RowDataPacket & { species: Species })[]>(
      'SELECT species FROM pets WHERE id=? AND user_id=? FOR UPDATE', [petId, userId])
    if (!pet) throw new HttpError(404, '请选择账号下的宠物档案')

    const lookup = `${registrationSelect} WHERE r.event_id=? AND r.pet_id=? AND r.user_id=?`
    const keys = [eventId, petId, userId]
    const [[existing]] = await conn.execute<RowDataPacket[]>(lookup, keys)
    if (existing) return { registration: existing, created: false }
    if (event.species && pet.species !== event.species) throw new HttpError(400, '这只宠物不符合赛事的参赛种类要求')

    const [write] = await conn.execute<ResultSetHeader>(`INSERT INTO h5_event_registrations
      (event_id, pet_id, user_id, submitted_at)
      SELECT id, ?, ?, UTC_TIMESTAMP(3) FROM h5_events
      WHERE id=? AND UTC_TIMESTAMP(3) >= registration_opens_at AND UTC_TIMESTAMP(3) < registration_closes_at`,
    [petId, userId, eventId])
    if (!write.affectedRows) throw new HttpError(409, '赛事当前不在报名时间内')
    const [[registration]] = await conn.execute<RowDataPacket[]>(lookup, keys)
    return { registration, created: true }
  })

  res.status(result.created ? 201 : 200).json({ registration: result.registration })
})

h5ProgramsRouter.get('/training', async (_req, res) => {
  const courses = await rows(`SELECT id, title, learning_format AS learningFormat, starts_at AS startsAt,
    exam_at AS examAt, exam_location AS examLocation, eligibility, credential, issuer
    FROM h5_training_courses WHERE published=TRUE
    ORDER BY (starts_at IS NULL), (starts_at < UTC_TIMESTAMP(3)),
      CASE WHEN starts_at >= UTC_TIMESTAMP(3) THEN starts_at END, starts_at DESC, id LIMIT 100`)
  res.json({ courses })
})

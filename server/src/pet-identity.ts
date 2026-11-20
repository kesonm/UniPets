import { randomInt } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { HttpError } from './errors.js'

const sixDigitCapacity = 1_000_000
const totalCapacity = 10_000_000

export type NoseSpecies = 'cat' | 'dog'
export type NosePrint = { species:NoseSpecies; digest:Buffer; version:string; template:Buffer }
const nosePrintTables = { cat:'pet_cat_noseprints', dog:'pet_dog_noseprints' } as const

async function takePetNumber(connection:PoolConnection) {
  const [[pool]] = await connection.execute<(RowDataPacket & {issued:number})[]>(
    'SELECT issued FROM pet_identity_number_pool WHERE id=1 FOR UPDATE',
  )
  if (pool.issued>=totalCapacity) throw new HttpError(503,'宠物身份证号码已用完')
  const sixDigits=pool.issued<sixDigitCapacity
  const first=sixDigits?0:sixDigitCapacity
  const last=(sixDigits?sixDigitCapacity:totalCapacity)-1-(pool.issued-first)
  const slot=randomInt(first,last+1)

  // Draw without replacement by swapping with the last available slot. Only moved slots need rows.
  const [swaps] = await connection.execute<(RowDataPacket & {slot:number;numberValue:number})[]>(
    'SELECT slot,number_value AS numberValue FROM pet_identity_number_swaps WHERE slot IN (?,?)',[slot,last],
  )
  const selected=swaps.find(move=>move.slot===slot)?.numberValue??slot
  if (slot!==last) {
    const replacement=swaps.find(move=>move.slot===last)?.numberValue??last
    await connection.execute('INSERT INTO pet_identity_number_swaps (slot,number_value) VALUES (?,?) ON DUPLICATE KEY UPDATE number_value=?',
      [slot,replacement,replacement])
  }
  await connection.execute('DELETE FROM pet_identity_number_swaps WHERE slot=?',[last])
  await connection.execute('UPDATE pet_identity_number_pool SET issued=issued+1 WHERE id=1')
  return String(selected).padStart(sixDigits?6:7,'0')
}

export async function issuePetIdentity(connection:PoolConnection,petId:string,nose:NosePrint) {
  const number=await takePetNumber(connection)
  await connection.execute('INSERT INTO pet_identities (pet_id,identity_number) VALUES (?,?)',[petId,number])
  try {
    await connection.execute(`INSERT INTO ${nosePrintTables[nose.species]} (pet_id,capture_digest,feature_version,nose_template) VALUES (?,?,?,?)`,
      [petId,nose.digest,nose.version,nose.template])
  } catch (error) {
    if ((error as {code?:string}).code==='ER_DUP_ENTRY' && String(error).includes('capture_digest')) {
      throw new HttpError(409,'这张鼻纹照片已登记，请重新拍摄并确认宠物档案')
    }
    throw error
  }
  return number
}

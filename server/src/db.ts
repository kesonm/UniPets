import mysql, { type RowDataPacket, type PoolConnection } from 'mysql2/promise'
import { config } from './config.js'
export const db = mysql.createPool(config.database)
export async function rows<T = RowDataPacket>(sql: string, values: Array<string | number | boolean | Date | null> = []): Promise<T[]> {
  const [result] = await db.execute(sql, values)
  return result as T[]
}
export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db.getConnection()
  try { await connection.beginTransaction(); const result = await fn(connection); await connection.commit(); return result }
  catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

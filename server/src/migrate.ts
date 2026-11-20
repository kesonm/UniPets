import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { serverRoot } from './config.js'
export async function migrate() {
  const connection = await db.getConnection()
  try {
    await connection.query("SELECT GET_LOCK('petcloud_schema', 30)")
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
    const [applied] = await connection.query('SELECT name FROM schema_migrations')
    const known = new Set((applied as { name: string }[]).map(row => row.name))
    for (const name of (await readdir(path.join(serverRoot, 'migrations'))).filter(n => n.endsWith('.sql')).sort()) {
      if (known.has(name)) continue
      const sql = await readFile(path.join(serverRoot, 'migrations', name), 'utf8')
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement)
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name])
      console.log(`Applied ${name}`)
    }
  } finally { await connection.query("SELECT RELEASE_LOCK('petcloud_schema')"); connection.release() }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().then(() => db.end()).catch(error => { console.error('数据库迁移失败：', error.code || error.message); process.exitCode = 1; return db.end() })
}

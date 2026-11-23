import type { ResultSetHeader } from 'mysql2/promise'
import { db } from './db.js'

async function main() {
  const [action,username,...rest] = process.argv.slice(2)
  if (!username || rest.length || (action !== 'grant' && action !== 'revoke')) {
    throw new Error('用法：admin-account grant|revoke <网页账号>')
  }
  const [result] = await db.execute<ResultSetHeader>(`UPDATE users SET is_admin=? WHERE username=?
    AND (?=FALSE OR (wechat_appid IS NULL AND disabled_at IS NULL))`, [action==='grant',username,action==='grant'])
  if (!result.affectedRows) throw new Error('找不到符合条件的账号，请使用已注册且启用的网页账号')
  console.log(action==='grant' ? '管理员权限已授予' : '管理员权限已撤销')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
}).finally(() => db.end())

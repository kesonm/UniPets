import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, chmod, open } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
const root = fileURLToPath(new URL('../',import.meta.url))
const local = path.join(root,'.local'), data = path.join(local,'mysql-data'), socket = path.join(local,'mysql.sock')
const port = 3307
const mysql = process.env.MYSQL_BIN || '/opt/homebrew/bin/mysql'
const mysqld = process.env.MYSQLD_BIN || '/opt/homebrew/bin/mysqld'
const credentialsPath = path.join(local,'mysql-credentials.json')
const defaults = path.join(local,'mysql-client.cnf')
await mkdir(local,{recursive:true,mode:0o700})
const canConnect = () => new Promise(resolve=>{ const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false)) })
if (process.argv.includes('stop')) {
  if(!existsSync(defaults))throw new Error('尚未初始化 PetCloud MySQL')
  const result=spawnSync(mysql,[`--defaults-extra-file=${defaults}`,'-e','SHUTDOWN'],{encoding:'utf8'})
  if(result.status!==0)throw new Error(result.stderr)
  console.log('PetCloud MySQL 已停止');process.exit(0)
}
if(!existsSync(mysqld))throw new Error('未找到 mysqld；请通过 MYSQLD_BIN/MYSQL_BIN 指定路径，或使用 compose.yaml')
let creds
if(existsSync(credentialsPath))creds=JSON.parse(await readFile(credentialsPath,'utf8'))
else { creds={root:randomBytes(24).toString('hex'),app:randomBytes(24).toString('hex')};await writeFile(credentialsPath,JSON.stringify(creds),{mode:0o600}) }
if(!existsSync(path.join(data,'mysql'))) {
  await mkdir(data,{recursive:true,mode:0o700})
  const init=spawnSync(mysqld,['--no-defaults','--initialize-insecure',`--datadir=${data}`],{encoding:'utf8'})
  if(init.status!==0)throw new Error(init.stderr)
}
if(!await canConnect()) {
  const log=await open(path.join(local,'mysql.log'),'a')
  const child=spawn(mysqld,['--no-defaults',`--datadir=${data}`,`--socket=${socket}`,`--port=${port}`,'--bind-address=127.0.0.1','--mysqlx=OFF',`--pid-file=${path.join(local,'mysql.pid')}`],{detached:true,stdio:['ignore',log.fd,log.fd]})
  child.unref();await log.close()
  let ready=false
  for(let i=0;i<60;i++){if(await canConnect()){ready=true;break}await new Promise(r=>setTimeout(r,500))}
  if(!ready)throw new Error('MySQL 启动失败，请查看 .local/mysql.log')
}
// Connect through this instance's socket so a conflicting port cannot initialize an unrelated server.
const configured=spawnSync(mysql,[`--defaults-extra-file=${defaults}`,'-N','-e','SELECT 1'],{encoding:'utf8'})
if(configured.status!==0) {
  const sql=`CREATE DATABASE IF NOT EXISTS petcloud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'petcloud'@'127.0.0.1' IDENTIFIED BY '${creds.app}';
GRANT ALL PRIVILEGES ON petcloud.* TO 'petcloud'@'127.0.0.1';
ALTER USER 'root'@'localhost' IDENTIFIED BY '${creds.root}';`
  const setup=spawnSync(mysql,['--no-defaults',`--socket=${socket}`,'-u','root'],{input:sql,encoding:'utf8'})
  if(setup.status!==0)throw new Error('无法初始化项目数据库：'+setup.stderr)
  await writeFile(defaults,`[client]\nuser=root\npassword=${creds.root}\nsocket=${socket}\n`,{mode:0o600})
}
const envPath=path.join(root,'.env.local')
let env=existsSync(envPath)?await readFile(envPath,'utf8'):''
for(const [key,value] of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'petcloud',DB_PASSWORD:creds.app,DB_NAME:'petcloud'})) {
  const re=new RegExp(`^${key}=.*$`,'m');env=re.test(env)?env.replace(re,`${key}=${value}`):env.trimEnd()+`\n${key}=${value}\n`
}
await writeFile(envPath,env,{mode:0o600});await chmod(envPath,0o600)
console.log('PetCloud MySQL 已就绪：127.0.0.1:3307 / petcloud；连接信息已写入 .env.local')

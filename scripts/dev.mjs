import { spawn } from 'node:child_process'
const frontend = process.argv.includes('--web') ? 'dev:web' : 'dev:mp-weixin'
const children = [['--dir','server','dev'],[frontend]].map(args => spawn('pnpm',args,{ stdio:'inherit',shell:process.platform==='win32' }))
let stopping = false
function stop(code=0) { if(stopping)return; stopping=true; for(const child of children)child.kill('SIGTERM'); process.exitCode=code }
for (const child of children) child.on('exit',code=>stop(code||0))
process.on('SIGINT',()=>stop()); process.on('SIGTERM',()=>stop())

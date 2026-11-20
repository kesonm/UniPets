import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { release, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config, serverRoot } from './config.js'

const execute = promisify(execFile)
let build: Promise<string> | undefined

export function supportsForegroundRemoval() {
  return config.videoMatting && process.platform === 'darwin' && parseInt(release(),10) >= 23
}

function foregroundExecutable() {
  return build ??= (async () => {
    const dir = await mkdtemp(path.join(tmpdir(),'petcloud-foreground-'))
    const binary = path.join(dir,'foreground')
    try {
      await execute('/usr/bin/swiftc', ['-O','-module-cache-path',path.join(dir,'modules'),'-o',binary,path.join(serverRoot,'native/foreground.swift')], { timeout:120_000, maxBuffer:128*1024 })
      process.once('exit', () => { try { rmSync(dir,{recursive:true,force:true}) } catch {} })
      return binary
    } catch {
      await rm(dir,{recursive:true,force:true})
      throw new Error('前景识别工具无法构建，请检查 macOS Command Line Tools')
    }
  })()
}

export async function removeFrameBackgrounds(input: string, output: string) {
  if (!supportsForegroundRemoval()) throw new Error('当前后端未启用 macOS 前景识别')
  const binary = await foregroundExecutable()
  await mkdir(output)
  try {
    await execute(binary,[input,output], { timeout:120_000, maxBuffer:64*1024 })
  } catch {
    throw new Error('未能稳定识别所有帧中的宠物')
  }
}

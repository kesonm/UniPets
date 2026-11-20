import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { buildJumpMesh, jumpFps, jumpPoseAt, jumpStageFrames, jumpTriangles, type JumpStage } from '../../shared/jump-motion.mjs'
import { supportsForegroundRemoval } from './foreground.js'
import { assembleVideoSprite, FRAME_SIZE, motionAnchorTile, normalizeMotionPhoto } from './video.js'

async function jumpTexture(bytes: Buffer) {
  const texture = await sharp(bytes).rotate().resize(FRAME_SIZE,FRAME_SIZE,{fit:'contain',background:'#00000000'}).ensureAlpha().png().toBuffer()
  const pixels = await sharp(texture).raw().toBuffer()
  const mesh = buildJumpMesh(pixels,FRAME_SIZE,FRAME_SIZE)
  return mesh && {texture,mesh}
}

export async function renderJumpSprite(pose: Buffer, standing?: Buffer) {
  let source = standing && await jumpTexture(standing)
  source ??= await jumpTexture(pose)
  if (!source && supportsForegroundRemoval()) {
    const scratch = await mkdtemp(path.join(tmpdir(),'petcloud-jump-'))
    try {
      const tile = await motionAnchorTile(await normalizeMotionPhoto(pose),path.join(scratch,'stand'),true)
      source = await jumpTexture(tile)
    } finally { await rm(scratch,{recursive:true,force:true}) }
  }
  if (!source) throw new Error('站姿素材无法识别前后爪，请更换能看清四肢的全身参考照片后重试')

  const {texture,mesh} = source
  const textureUrl = `data:image/png;base64,${texture.toString('base64')}`
  const rect = {dx:0,dy:0,dw:FRAME_SIZE,dh:FRAME_SIZE}
  const frames: Buffer[] = []
  const format = (value:number)=>value.toFixed(4)
  for (const [stage,count] of Object.entries(jumpStageFrames) as [JumpStage,number][]) {
    for (let i=0;i<count;i++) {
      if (i===0) { frames.push(frames.at(-1) ?? texture); continue }
      if (stage==='land' && i===count-1) { frames.push(texture); continue }
      const pose = jumpPoseAt(stage,i/(count-1))
      const triangles = [...jumpTriangles(mesh,pose,rect)]
      const masks = triangles.map(({points},index)=>`<clipPath id="p${index}"><polygon points="${points.map(({x,y})=>format(x)+','+format(y)).join(' ')}"/></clipPath>`).join('')
      const polygons = triangles.map(({matrix},index)=>`<g clip-path="url(#p${index})"><use xlink:href="#cat" transform="matrix(${matrix.map(format).join(' ')})"/></g>`).join('')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${FRAME_SIZE}" height="${FRAME_SIZE}"><defs><image id="cat" width="${FRAME_SIZE}" height="${FRAME_SIZE}" xlink:href="${textureUrl}"/>${masks}</defs>${polygons}</svg>`
      frames.push(await sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer())
    }
  }
  return {...await assembleVideoSprite(frames,jumpFps,true),motionJoinable:true}
}

import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'
import { config, serverRoot } from './config.js'
import { HttpError } from './errors.js'
import type { NosePrint, NoseSpecies } from './pet-identity.js'

const speciesWithNoseModels = ['dog','cat'] as const
type NoseModel = { file:string; detector:'boxes'|'cat-landmarks' }
const workerPath = path.join(serverRoot,'noseprint','scan.py')
const captureFeedback = {
  nose: '未找到清晰的宠物鼻部，请正面近拍，让鼻子位于画面中央',
  cat_face: '未找到猫的正脸，请正面近拍，让双眼和鼻子都入镜',
  multiple: '请只拍一只宠物的鼻子',
  crop: '鼻子区域过小或不完整，请靠近并完整拍到鼻尖和两侧鼻孔',
  exposure: '鼻部太暗或反光明显，请在均匀光线下重拍',
  focus: '鼻纹不够清晰，请对准鼻尖对焦后重拍',
} as const
const workerResponse = z.discriminatedUnion('status',[
  z.object({status:z.literal('retake'),reason:z.enum(['nose','cat_face','multiple','crop','exposure','focus'])}),
  z.object({status:z.literal('ok'),digest:z.string().regex(/^[0-9a-f]{64}$/),template:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(50_000)}),
])
let recognizing=false

async function installedModel(name:string,detector:NoseModel['detector']):Promise<NoseModel|null> {
  const file=path.resolve(config.nosePrintModelDir,name)
  try {
    const info=await stat(file)
    return info.isFile() && info.size>0?{file,detector}:null
  } catch { return null }
}

async function modelFor(species:NoseSpecies) {
  if (!config.nosePrintModelDir) return null
  const boxes=await installedModel(`${species}-nose.onnx`,'boxes')
  if (boxes || species==='dog') return boxes
  const [landmarks,faceDetector]=await Promise.all([
    installedModel('cat-face-landmarks.onnx','cat-landmarks'),
    stat(path.resolve(config.nosePrintModelDir,'cat-face-cascade.xml')).catch(()=>null),
  ])
  return faceDetector?.isFile() && faceDetector.size>0?landmarks:null
}

export async function availableNosePrintSpecies() {
  const models=await Promise.all(speciesWithNoseModels.map(modelFor))
  return speciesWithNoseModels.filter((_,index)=>models[index]!==null)
}

async function preparePhoto(image:string,detector:NoseModel['detector']) {
  const separator=image.indexOf(',')
  const header=image.slice(0,separator)
  if (separator<0 || !/^data:image\/(jpeg|png|webp);base64$/.test(header)) throw new HttpError(422,'请上传 JPG、PNG 或 WebP 鼻纹照片')
  const bytes=Buffer.from(image.slice(separator+1),'base64')
  if (bytes.length>8*1024*1024) throw new HttpError(413,'鼻纹照片不能超过 8MB')
  try {
    const photo=sharp(bytes,{limitInputPixels:25_000_000})
    const metadata=await photo.metadata()
    if (!['jpeg','png','webp'].includes(metadata.format??'') || (metadata.pages??1)>1) throw new Error('unsupported image')
    if (Math.min(metadata.width??0,metadata.height??0)<180) throw new HttpError(422,'鼻纹照片尺寸过小，请重新拍摄清晰近照')
    const oriented=photo.rotate().flatten({background:'#fff'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
    // The smaller cat nose crop can lose detail if the upload is compressed again.
    return await (detector==='cat-landmarks'?oriented.png():oriented.jpeg({quality:94})).toBuffer()
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(422,'鼻纹照片无法读取，请重新上传')
  }
}

function scan(model:NoseModel,photo:Buffer) {
  return new Promise<string>((resolve,reject)=>{
    const child=execFile(config.nosePrintPython,['-B',workerPath,model.file,model.detector],{timeout:20_000,maxBuffer:96*1024},(error,stdout)=>{
      if (error) reject(error)
      else resolve(stdout)
    })
    child.stdin?.on('error',()=>{})
    child.stdin?.end(photo)
  })
}

export async function readNosePrint(species:string,image:string):Promise<NosePrint> {
  if (species!=='dog' && species!=='cat') throw new HttpError(422,'这个宠物种类暂未开放鼻纹登记')
  const model=await modelFor(species)
  if (!model) throw new HttpError(503,'这个宠物种类的鼻纹识别模型暂未启用')
  if (recognizing) throw new HttpError(503,'鼻纹识别正在处理另一张照片，请稍后重试')
  recognizing=true
  try {
    const photo=await preparePhoto(image,model.detector)
    let result:z.infer<typeof workerResponse>
    try { result=workerResponse.parse(JSON.parse(await scan(model,photo))) }
    catch { throw new HttpError(503,'鼻纹识别服务暂不可用，请稍后重试') }
    if (result.status==='retake') throw new HttpError(422,captureFeedback[result.reason])
    const template=Buffer.from(result.template,'base64')
    if (template.length<40*32 || template.length>384*32 || template.length%32!==0) throw new HttpError(503,'鼻纹特征提取暂不可用')
    return {species,digest:Buffer.from(result.digest,'hex'),version:'opencv-orb-v1',template}
  } finally { recognizing=false }
}

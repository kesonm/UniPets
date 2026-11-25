import sharp from 'sharp'
import { z } from 'zod'
import { HttpError } from './errors.js'

const imageLimit = 2 * 1024 * 1024
export const postImagePosition = z.coerce.number().int().min(1).max(3)
export const postImagesInput = z.array(z.string().max(4 * Math.ceil(imageLimit / 3) + 24)).max(3).default([])

export async function readPostImage(value: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new HttpError(400,'请选择 JPG、PNG 或 WebP 图片')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > imageLimit) throw new HttpError(413,'每张图片须在 2 MB 以内')
  try {
    const input = sharp(bytes,{limitInputPixels:25_000_000})
    const metadata = await input.metadata()
    if (metadata.format !== match[1] || (metadata.pages ?? 1) > 1) throw new Error('format')
    return await input.rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer()
  } catch {
    throw new HttpError(400,'无法读取配图')
  }
}

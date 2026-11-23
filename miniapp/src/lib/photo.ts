export async function choosePhoto(sourceType: ('album'|'camera')[] = ['album', 'camera']): Promise<string | null> {
  const chosen = await new Promise<string | null>((resolve, reject) =>
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType,
      success: (r) => {
        const file = Array.isArray(r.tempFiles) ? r.tempFiles[0] : r.tempFiles
        if (file && file.size > 8 * 1024 * 1024) return reject(new Error('请选择 8 MB 以内的照片'))
        resolve(Array.isArray(r.tempFilePaths) ? r.tempFilePaths[0] : r.tempFilePaths)
      },
      fail: (e) =>
        e.errMsg.includes('cancel') ? resolve(null) : reject(new Error(
          sourceType.length === 1 && sourceType[0] === 'camera' ? '无法打开相机，请检查相机权限' : '无法读取照片，请检查相册权限',
        )),
    }),
  )
  if (!chosen) return null
  return new Promise((resolve, reject) =>
    uni.getFileSystemManager().readFile({
      filePath: chosen,
      encoding: 'base64',
      success: (r) => {
        const b64 = String(r.data)
        const mime = b64.startsWith('/9j/')
          ? 'jpeg'
          : b64.startsWith('iVBOR')
            ? 'png'
            : b64.startsWith('UklGR')
              ? 'webp'
              : ''
        if (!mime) return reject(new Error('请选择 JPG、PNG 或 WebP 照片'))
        resolve('data:image/' + mime + ';base64,' + b64)
      },
      fail: () => reject(new Error('无法读取所选照片')),
    }),
  )
}

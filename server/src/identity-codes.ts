import bwipjs from '@bwip-js/node'

export function renderQrCode(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({bcid:'qrcode',text,scale:8,padding:4,backgroundcolor:'ffffff'})
}

export function renderIdentityCode(number: string, kind: 'barcode'|'qrcode'): Promise<Buffer> {
  if (kind === 'qrcode') {
    return renderQrCode(number)
  }
  return bwipjs.toBuffer({
    bcid:'code128',text:number,scale:4,height:14,paddingwidth:10,paddingheight:4,backgroundcolor:'ffffff',
  })
}

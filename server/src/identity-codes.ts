import bwipjs from '@bwip-js/node'

export function renderIdentityCode(number: string, kind: 'barcode'|'qrcode'): Promise<Buffer> {
  if (kind === 'qrcode') {
    return bwipjs.toBuffer({bcid:'qrcode',text:number,scale:8,padding:4,backgroundcolor:'ffffff'})
  }
  return bwipjs.toBuffer({
    bcid:'code128',text:number,scale:4,height:14,paddingwidth:10,paddingheight:4,backgroundcolor:'ffffff',
  })
}

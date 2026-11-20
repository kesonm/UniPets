"""Compare original reference pixels with native renders. Requires Pillow."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).resolve().parents[1];R=P/'renders'
def font(size):
    for f in ['/System/Library/Fonts/Hiragino Sans GB.ttc','/System/Library/Fonts/STHeiti Medium.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
        if Path(f).exists():return ImageFont.truetype(f,size)
    return ImageFont.load_default(size=size)
def fit(im,size,margin=0,bg='#efece5'):
    canv=Image.new('RGB',size,bg);im=im.convert('RGBA');im.thumbnail((size[0]-2*margin,size[1]-2*margin),Image.Resampling.LANCZOS)
    canv.paste(im,((size[0]-im.width)//2,(size[1]-im.height)//2),im);return canv
def turntable():
    w,h=480,338;border=22;head=74;row=h+46;sheet=Image.new('RGB',(3*w+border*4,head+row*2+border),'#f1eee7');d=ImageDraw.Draw(sheet)
    d.text((border,16),'麦穗   /   站姿转台',font=font(32),fill='#272822')
    for i,(v,label) in enumerate([('front','正面'),('front_45','斜前方 45°'),('left','左侧'),('back','背面'),('rear_45','斜后方 45°'),('right','右侧')]):
        x=border+(i%3)*(w+border);y=head+(i//3)*row
        sheet.paste(Image.open(R/(v+'.png')).resize((w,h),Image.Resampling.LANCZOS),(x,y))
        d.text((x+1,y+h+6),label,font=font(20),fill='#383a32')
    sheet.save(R/'turntable.jpg',quality=92,subsampling=0)
def compare():
    cols=['正面','侧面','背面'];w,h=390,223;side=118;g=9;head=76
    sheet=Image.new('RGB',(side+3*(w+g)+10,head+4*(h+g)+10),'#f1eee7');draw=ImageDraw.Draw(sheet)
    draw.text((16,16),'三视图对照',font=font(25),fill='#242720')
    for i,label in enumerate(cols):draw.text((side+i*(w+g)+w//2-23,32),label,font=font(21),fill='#32342c')
    for pose,kind in enumerate(['standing','sitting']):
        ref=Image.open(P/'references'/('cat_'+kind+'_views.png'))
        boxes=[(479,0,775,ref.height),(779,0,1341,ref.height),(1355,0,1681,ref.height)]
        for i,(box,v) in enumerate(zip(boxes,['front','left','back'])):
            x=side+i*(w+g);y=head+2*pose*(h+g)
            sheet.paste(fit(ref.crop(box),(w,h),4),(x,y))
            f=R/((v if pose==0 else 'sitting_'+v)+'.png');im=Image.open(f)
            sheet.paste(fit(im,(w,h),0,'#585955'),(x,y+h+g))
        for j,label in enumerate(['参考','模型']):
            y=head+(2*pose+j)*(h+g)+h*.40
            draw.text((16,y),('站姿' if pose==0 else '坐姿')+'\n'+label,font=font(19),spacing=4,fill='#4d4f44')
    sheet.save(R/'reference_check.jpg',quality=93,subsampling=0)
if __name__=='__main__':turntable();compare()

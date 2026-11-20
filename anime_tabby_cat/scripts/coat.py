"""Registered coat projections, independent PBR atlases and tapered strand-card opacity."""
import math,struct,zlib,os
import numpy as np
import bpy
import anatomy,face
from core import *

def png(path,pixels):
    path=Path(path);p=np.ascontiguousarray(pixels,dtype=np.uint8)
    if p.ndim==2:p=p[:,:,None]
    h,w,c=p.shape
    def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
    raw=b''.join(b'\0'+row.tobytes() for row in p)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,{1:0,3:2,4:6}[c],0,0,0))+chunk(b'IDAT',zlib.compress(raw,4))+chunk(b'IEND',b'')
    tmp=path.with_suffix('.writing');tmp.write_bytes(data);os.replace(tmp,path)
def blend(a,b,t):return a*(1-t[...,None])+b*t[...,None]
class Palette:
    def __init__(self):
        imp=bpy.data.images.get('cat_standing_views.png') or bpy.data.images.load(str(REF/'cat_standing_views.png'))
        w,h=imp.size;data=np.empty(w*h*4,'f');imp.pixels.foreach_get(data)
        self.img=np.clip(data.reshape(h,w,4)[::-1],0,1)
    def pic(self,u,v,alt=(.54,.45,.39)):
        im=self.img;h,w=im.shape[:2];u=np.clip(u,0,w-1.001);v=np.clip(v,0,h-1.001)
        a=u.astype(int);b=v.astype(int);x=(u-a)[:,None];y=(v-b)[:,None]
        rgb=(im[b,a]*(1-x)+im[b,a+1]*x)*(1-y)+(im[b+1,a]*(1-x)+im[b+1,a+1]*x)*y
        return blend(np.broadcast_to(alt,(len(u),3)),rgb[:,:3],smooth(.72,.98,rgb[:,3]))
    def color(self,pts,kind,back=None):
        x,y,z=pts.T;ay=np.abs(y)
        if kind=='Head':
            u=570.3+98.*y;v=353.-98.2*z
            c=self.pic(u,v)
            for cy in [-.254,.254]:
                dx=(y-cy)/.15;dy=(z-2.676-.13*np.sign(cy)*(y-cy))/.132
                rr=np.hypot(dx,dy)
                src=np.where(dy>0,v-13.5,v+13.5)
                clean=self.pic(u+2.5*np.sin(dx*1.40),src)
                c=blend(c,clean,1-smooth(.88,1.11,rr))
                rx=(y-cy)/.138;rz=(z-2.676-.13*np.sign(cy)*(y-cy))/.109
                lid=np.exp(-((np.hypot(rx,rz)-1.015)/.151)**2)
                c=blend(c,np.array([.242,.166,.127]),lid*(.59+.33*smooth(-.13,.29,rz)))
            w,f,rear=face.bounds(z);fr=(x-(f+rear)/2)/np.maximum((f-rear)/2,.06)
            # Near the temples the side plate carries the backward eyelid streak towards the ear.
            su=np.clip(1034.-98*x,802,900);sv=np.clip(352.-98*z,47,151)
            side=self.pic(su,sv,alt=(.53,.435,.364))
            nape=self.pic(1457+76*y,45+(3.22-z)*91)
            side=blend(nape,side,smooth(1.45,1.75,x))
            return np.clip((.953*blend(side,c,smooth(-.01,.49,fr)))**1.17,0,1)
        if kind=='Ear':
            inside=self.pic(570.3+98*y,353.-98.2*z,alt=(.71,.49,.43))
            reverse=self.pic(1458+90*y,352.-98*z+2,alt=(.46,.35,.29))
            return .96*blend(inside,reverse,np.clip(back,0,1))**1.08
        if kind=='Tail':
            axis=np.array(anatomy.TAIL);d=np.diff(axis,axis=0)
            q=np.clip(np.einsum('nsi,si->ns',pts[:,None]-axis[:-1],d)/np.sum(d*d,axis=1),0,1)
            delta=pts[:,None]-axis[:-1]-q[:,:,None]*d
            k=np.linalg.norm(delta,axis=2).argmin(axis=1);ii=np.arange(len(x));t=(k+q[ii,k])/8.
            b=np.clip(delta[ii,k,1]/.195,-1,1)
            tu=np.interp(t,[0,.14,.26,.40,.55,.70,.83,1],[1175,1192,1212,1231,1250,1270,1294,1314])
            tv=np.interp(t,[0,.14,.26,.40,.55,.70,.83,1],[142,132,113,91,66,44,30,30])
            photo=self.pic(tu+b*11,tv+b*6)
            phase=math.tau*(t*5.18+.055*np.sin(t*8)+.057*b)
            band=smooth(-.15,.58,np.cos(phase))
            base=blend(np.tile([.64,.553,.474],(len(x),1)),np.tile([.309,.255,.234],(len(x),1)),band)
            base=blend(base,np.tile([.267,.219,.201],(len(x),1)),smooth(.87,.99,t))
            return np.clip(.37*photo+.63*base,0,1)
        # Flank, dorsal saddle, ventral coat and pectoral bib use different parts of the views.
        u=np.interp(x,[-1.9,-1.65,-1.32,-.85,-.4,0,.45,.89,1.20,1.50,1.79,2.05],
                       [1207,1189,1161,1118,1077,1040,997,957,925,900,870,849])
        u+=3*smooth(.02,.52,y)*np.sin(x*4+z)
        top=np.interp(u,[842,870,900,930,955,975,1000,1043,1090,1130,1165,1190,1210],[76,67,87,105,116,122,121,117,114,113,117,125,143])
        bottom=np.interp(u,[842,875,902,930,962,991,1043,1105,1145,1180,1210],[145,178,205,239,250,250,249,251,259,260,251])
        v=351.-98*z;flank=self.pic(u,np.clip(v,top+4,bottom-4))
        du=np.clip(u+8*np.sin(5*y+x),922,1187)
        dorsal=self.pic(du,np.interp(du,[922,952,980,1050,1138,1187],[109,119,122,116,113,124])+12+16*(1-np.minimum(1,ay/.61)))
        dorsal*=1-.083*np.exp(-(y/.16)**2)[:,None]
        c=blend(flank,dorsal,1-smooth(top+4,top+28,v))
        ventral=smooth(bottom-23,bottom+11,v)*(1-smooth(.06,.49,ay))
        c=blend(c,np.tile([.77,.675,.567],(len(x),1)),ventral*.60)
        # The frontal bib follows the throat as it descends to the sternum.
        front=smooth(.63,1.36,x)*(1-smooth(.23,.59,ay))*smooth(1.12,1.53,z)
        chest=self.pic(570.3+93*y,np.clip(350.-91*z,146,263))
        c=blend(c,chest,front)
        bibwidth=.115+.245*smooth(1.25,2.03,z)
        bib=smooth(.97,1.38,x)*(1-smooth(bibwidth*.54,bibwidth*1.24,ay))*smooth(1.26,1.62,z)*(1-smooth(2.45,2.72,z))
        c=blend(c,np.array([.887,.809,.705]),.48*bib)
        for fore in [True,False]:
            if fore:
                zz=[0,.1,.22,.45,.7,.98,1.18,1.45,1.80,2.10]
                cc=[937,939,946,946,949,947,944,940,934,942]
                ww=[16,16,12,11,12,15,21,25,27,26]
                base=np.interp(z,[0,.18,.61,1.085,1.67],[1.19,1.03,.96,.90,1.09])
                r=np.interp(z,[0,.13,.30,.80,1.10,1.65],[.20,.19,.12,.15,.22,.31])
            else:
                zz=[0,.10,.21,.40,.55,.76,.98,1.13,1.48,1.86]
                cc=[1223,1221,1220,1216,1205,1192,1184,1171,1161,1160]
                ww=[14,17,12,12,12,15,21,26,32,32]
                base=np.interp(z,[0,.18,.51,.80,1.12,1.74],[-1.21,-1.34,-1.456,-1.24,-.967,-1.31])
                r=np.interp(z,[0,.14,.3,.51,.85,1.1,1.7],[.19,.18,.11,.14,.21,.30,.41])
            rel=np.clip((x-base-(.075 if fore else -.235)*np.sign(y))/r,-1,1)
            leg=self.pic(np.interp(z,zz,cc)-rel*np.interp(z,zz,ww)*.71,np.clip(350-97*z,170,347))
            loc=smooth(.46,.78,x) if fore else 1-smooth(-.90,-.63,x)
            legmix=loc*(1-smooth(1.08,1.63,z))*(.55+.45*smooth(.09,.30,ay))
            c=blend(c,leg,np.maximum(legmix,loc*(1-smooth(.81,1.02,z))))
            toe=(1-smooth(.085,.22,z))*loc
            c=blend(c,np.array([.86,.787,.707]),toe*.68)
        return np.clip(.96*c**1.07,0,1)
def atlas(ob,pal,kind,size):
    m=ob.data;m.calc_loop_triangles()
    tri=array(m.loop_triangles,'vertices',3,np.int32);ls=array(m.loop_triangles,'loops',3,np.int32)
    uv=array(m.uv_layers['CoatUV'].uv,'vector',2)[ls]*size-.5
    vs=local(array(m.vertices,'co',3));pos=np.zeros((size,size,3),np.float32);valid=np.zeros((size,size),bool)
    aux=np.zeros_like(valid,dtype=np.float32);ea=m.attributes.get('pinna_back')
    if ea:back=array(ea.data,'value',1)[:,0]
    for p,ids in zip(uv,tri):
        lo=np.maximum(0,np.ceil(p.min(axis=0)).astype(int));hi=np.minimum(size-1,np.floor(p.max(axis=0)).astype(int))
        if (lo>hi).any():continue
        a,b,c=p;ab=b-a;ac=c-a;den=ab[0]*ac[1]-ac[0]*ab[1]
        if abs(den)<1e-9:continue
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];dx=xx-a[0];dy=yy-a[1]
        t=(dx*ac[1]-dy*ac[0])/den;r=(dy*ab[0]-dx*ab[1])/den
        ok=(t>=-.00001)&(r>=-.00001)&((t+r)<=1.00001);yy=yy[ok];xx=xx[ok];ww=np.column_stack((1-t[ok]-r[ok],t[ok],r[ok]))
        pos[yy,xx]=np.einsum('ij,jk->ik',ww,vs[ids]);valid[yy,xx]=True
        if ea:aux[yy,xx]=np.einsum('ij,j->i',ww,back[ids])
    sampled=pos[valid];ex=aux[valid];rgb=np.zeros((size,size,3),np.uint8)
    colors=np.empty_like(sampled)
    for i in range(0,len(sampled),60000):colors[i:i+60000]=pal.color(sampled[i:i+60000],kind,ex[i:i+60000])
    rgb[valid]=np.round(255*np.clip(colors,0,1)).astype(np.uint8)
    gray=np.mean(rgb,axis=2)/255.
    for i in range(13):
        old=valid.copy()
        for axis,d in [(0,1),(0,-1),(1,1),(1,-1)]:
            fill=~valid & np.roll(old,d,axis);rgb[fill]=np.roll(rgb,d,axis)[fill];valid|=fill
    stem=ob.name.lower().replace('.','_')
    png(TEX/(stem+'_color.png'),rgb[::-1])
    lum=rgb.astype('f').mean(axis=2)/255.
    ny,nx=np.gradient(lum);normals=unit(np.stack((-nx*.63,-ny*.63,np.ones_like(nx)),axis=2))
    png(TEX/(stem+'_normal.png'),np.round(255*(.5+.5*normals[::-1])).astype('B'))
    material=mat('Coat | '+ob.name,rough=.84);old=m.materials[0] if len(m.materials) else None
    if old:m.materials[0]=material
    else:m.materials.append(material)
    textured(material,TEX/(stem+'_color.png'));n=material.node_tree.nodes;im=bpy.data.images.load(str(TEX/(stem+'_normal.png')));im.colorspace_settings.name='Non-Color';im.pack()
    tex=n.new('ShaderNodeTexImage');tex.image=im;tex.location=(-550,-130)
    normal=n.new('ShaderNodeNormalMap');normal.location=(-275,-95);normal.inputs['Strength'].default_value=.48
    material.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);material.node_tree.links.new(normal.outputs[0],bsdf(material).inputs['Normal'])
    material['rt_normal']=im.name;material['rt_normal_scale']=.48
def iris():
    size=512;yy,xx=np.mgrid[:size,:size];x=(xx+.5-size/2)/(size*.5);z=(size/2-yy-.5)/(size*.5)
    r=np.hypot(x,z);a=np.arctan2(z,x);edge=.767
    fine=.55*np.sin(115*a+8*r+1.8*np.sin(29*a))+.27*np.sin(227*a-13*r)+.18*np.sin(61*a+19*r)
    val=(.109*fine+.060*np.cos(r*55+2*np.sin(18*a))-.17*z)*np.clip(r/.25,0,1)
    c=np.tile([.574,.548,.271],(size,size,1))+val[:,:,None]*[.82,.98,.45]
    c=blend(c,np.array([.785,.683,.373]),np.exp(-((r-.485)/.082)**2)*.46)
    c=blend(c,np.array([.126,.123,.076]),smooth(edge-.099,edge+.019,r))
    c=blend(c,np.array([.456,.370,.253]),smooth(edge+.023,edge+.075,r))
    # Dilated feline pupil, with a slightly longer vertical axis.
    c*=((.96-.33*smooth(-.10,.77,z))[:,:,None])
    pr=np.hypot(x/.415,z/.550)
    c=blend(c,np.array([.027,.033,.028]),1-smooth(.962,1.026,pr))
    for cx,cz,rx,rz,v in [(-.207,.345,.103,.084,.88),(.082,.222,.040,.032,.69)]:
        gl=1-smooth(.72,1.08,np.hypot((x-cx)/rx,(z-cz)/rz));c=blend(c,np.array([1.,.983,.914]),gl*v)
    png(TEX/'olive_iris.png',np.round(255*np.clip(c,0,1)).astype('B'))
    material=bpy.data.materials.get('Eye | olive iris');textured(material,TEX/'olive_iris.png')
    p=bsdf(material);p.inputs['Coat Weight'].default_value=.20;p.inputs['Coat Roughness'].default_value=.095

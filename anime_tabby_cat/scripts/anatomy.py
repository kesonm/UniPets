"""Continuous quadruped skin lattice with separate loops through each leg joint."""
import bpy,math
import numpy as np
from core import Builder,unwrap,activate,smooth,unit,ring_weights
def mix_weights(a,b,u):
    return {k:a.get(k,0)*(1-u)+b.get(k,0)*u for k in a.keys()|b.keys()}
def samples(x,breaks,names):
    i=int(np.clip(np.searchsorted(breaks,x)-1,0,len(breaks)-2))
    t=float(smooth(breaks[i],breaks[i+1],x))
    return {names[i]:1-t,names[i+1]:t}
TAIL=[(-1.51,0,2.04),(-1.76,.105,2.19),(-1.96,.259,2.42),(-2.12,.461,2.70),(-2.28,.702,2.995),(-2.48,.958,3.235),(-2.71,1.225,3.335),(-2.94,1.453,3.32),(-3.085,1.578,3.255)]
RIG_SPINE={
    "Pelvis":((-1.38,0,1.72),(-.65,0,1.75)),
    "Spine":((-.65,0,1.75),(.39,0,1.76)),
    "Chest":((.39,0,1.76),(1.09,0,1.90)),
    "Neck":((1.09,0,1.90),(1.70,0,2.53)),
    "Head":((1.70,0,2.53),(2.34,0,2.53)),
    "Jaw":((1.79,0,2.46),(2.35,0,2.30)),
}
LEGS={}
for side,sign in [('L',1),('R',-1)]:
    stagger=.075*sign
    LEGS['Fore.'+side]={
        'scapula':(.63,.34*sign,2.29),'upper':(1.09+stagger,.398*sign,1.67),
        'knee':(.90+stagger,.414*sign,1.085),'ankle':(1.035+stagger,.417*sign,.180),
        'toe':(1.27+stagger,.421*sign,.092)}
    stagger=.235*sign
    LEGS['Hind.'+side]={
        'upper':(-1.31-stagger,.37*sign,1.73),'knee':(-.967-stagger,.423*sign,1.12),
        'hock':(-1.456-stagger,.431*sign,.51),'ankle':(-1.339-stagger,.426*sign,.177),
        'toe':(-1.10-stagger,.43*sign,.088)}
EAR={s:((1.72,.41*i,2.975),(1.64,.592*i,3.53)) for s,i in [('L',1),('R',-1)]}

PROFILE=np.array([
(-1.86,1.67,.075,.12,0),(-1.80,1.68,.26,.36,0),
(-1.70,1.70,.415,.535,0),(-1.57,1.71,.52,.635,0),
(-1.43,1.72,.59,.696,0),(-1.28,1.72,.625,.73,0),
(-1.13,1.72,.639,.738,0),(-.98,1.73,.634,.73,0),
(-.82,1.73,.602,.71,0),(-.66,1.735,.565,.695,0),
(-.46,1.73,.539,.674,0),(-.24,1.73,.532,.661,0),
(.0,1.737,.541,.67,0),(.23,1.75,.563,.69,0),
(.43,1.765,.59,.711,1),(.57,1.781,.602,.72,3),
(.69,1.805,.60,.718,7),(.82,1.835,.587,.712,11),
(.94,1.87,.57,.70,16),(1.06,1.92,.536,.67,23),
(1.17,1.98,.502,.625,31),(1.27,2.055,.467,.564,41),
(1.36,2.13,.439,.52,49),(1.445,2.225,.424,.482,59),
(1.51,2.32,.40,.434,65),(1.57,2.41,.371,.39,69),
(1.64,2.49,.318,.32,72),(1.70,2.55,.22,.23,72),(1.74,2.58,.08,.10,74)])
def spineweight(x,z):
    q=x+max(0,z-1.92)*float(smooth(.6,1.45,x))*.58
    return samples(q,[-1.18,-.30,.69,1.44,1.97],["Pelvis","Spine","Chest","Neck","Head"])
def legweight(name,z):
    if name.startswith('Fore'):
        v=samples(z,[.13,.32,.83,1.30,1.50,1.90],["Paw.","Lower.","Lower.","Upper.","Upper.","Scapula."])
    else:
        v=samples(z,[.12,.29,.401,.65,.90,1.33],["Paw.","Hock.","Hock.","Lower.","Lower.","Upper."])
    # samples whose endpoints select the same segment carry full weight.
    if len(v)==1: return {next(iter(v))+name:1.0}
    return {k+name:x for k,x in v.items()}
def bodymesh():
    b=Builder();n=48; grid={}
    for i,(x,z,w,h,phi) in enumerate(PROFILE):
        phi=math.radians(phi)
        for j in range(n):
            a=j*math.tau/n;c=math.cos(a);s=math.sin(a)
            height=h*c; width=1.055*w*s*(1-.065*max(0,-c))
            rise=np.interp(x,[.80,1.0,1.20,1.35,1.50,1.65,1.74],[0,0,.07,.15,.23,.23,.17])*max(c,0)**1.7
            p=(x-math.sin(phi)*height,width,z+math.cos(phi)*height+rise)
            base=spineweight(p[0],p[2])
            for fore,cx,sz in [(False,-1.26,.57),(True,.96,.49)]:
                strength=math.exp(-((x-cx)/sz)**4)*float(smooth(.19,.54,abs(width)))*(1-float(smooth(1.68,2.39,p[2])))*.78
                if strength>.001:
                    name=('Fore.' if fore else 'Hind.')+('L' if width>0 else 'R')
                    base=mix_weights(base,legweight(name,p[2]),strength)
            grid[i,j]=b.pt(p,base)
    holes=[]
    for side,sign in [('L',1),('R',-1)]:
        a0,a1=(8,21) if sign==1 else (27,40)
        for front,i0,i1 in [(False,2,9),(True,15,22)]:
            holes.append((front,side,sign,i0,i1,a0,a1))
    for i in range(len(PROFILE)-1):
        for j in range(n):
            if any(i0<=i<i1 and a0<=j<a1 for _,_,_,i0,i1,a0,a1 in holes):continue
            b.face((grid[i,j],grid[i,(j+1)%n],grid[i+1,(j+1)%n],grid[i+1,j]))
    b.face([grid[0,j] for j in range(n)]);b.face([grid[len(PROFILE)-1,j] for j in range(n)])
    for front,side,sg,i0,i1,a0,a1 in holes:
        name=('Fore.' if front else 'Hind.')+side
        marks=LEGS[name];ang=[]
        border=[(i,a0) for i in range(i0,i1)]+[(i1,j) for j in range(a0,a1)]+[(i,a1) for i in range(i1,i0,-1)]+[(i0,j) for j in range(a1,a0,-1)]
        top=[grid[q] for q in border]
        for i,j in border:
            u=2*(i-i0)/(i1-i0)-1; v=1-2*(j-a0)/(a1-a0)
            # Both flank holes start on their negative-to-positive perimeter order.
            ang.append(math.atan2(v,u))
        knee=np.array(marks['knee']);ankle=np.array(marks['ankle'])
        prev=top
        for t in [.24,.49,.74,1.0]:
            row=[]
            for idx,phi in enumerate(ang):
                rx,ry=(.233,.167) if front else (.307,.211)
                goal=knee+np.array([rx*math.cos(phi),ry*math.sin(phi),.03])
                p=np.array(b.v[top[idx]])*(1-t)+goal*t
                p[0]+=(.012 if front else .054)*math.sin(math.pi*t)
                p[1]+=.044*sg*math.sin(math.pi*t)
                w=mix_weights(b.weights[top[idx]],legweight(name,p[2]),float(smooth(0,.9,t)))
                row.append(b.pt(p,w))
            b.bridge(prev,row);prev=row
        if front:
            rows=[(1.043,.215,.160),(.955,.187,.145),(.84,.155,.132),(.68,.14,.121),(.49,.124,.109),(.335,.114,.106),(.253,.116,.108),(.197,.122,.112)]
            path=[ankle,knee]
        else:
            rows=[(1.075,.296,.20),(.989,.269,.18),(.874,.229,.153),(.72,.181,.135),(.60,.145,.121),(.526,.131,.112),(.462,.116,.105),(.382,.104,.10),(.288,.101,.098),(.208,.109,.107)]
            path=[ankle,np.array(marks['hock']),knee]
        for z,rx,ry in rows:
            cen=np.array([np.interp(z,[p[2] for p in path],[p[k] for p in path]) for k in (0,1)])
            row=[b.pt((cen[0]+rx*math.cos(a),cen[1]+ry*math.sin(a),z),legweight(name,z)) for a in ang]
            b.bridge(prev,row);prev=row
        for z,off,rx,ry,lobe in [(.161,.045,.153,.128,.008),(.129,.088,.190,.145,.014),(.089,.105,.207,.152,.022),(.05,.113,.204,.15,.023),(.022,.105,.188,.14,.014),(.010,.097,.148,.114,.003)]:
            row=[]
            for a in ang:
                u=math.sin(a);c=math.cos(a)
                wave=(.5+.5*math.cos((u*1.6+.5)*math.tau))*max(c,0)**1.6
                row.append(b.pt((ankle[0]+off+rx*c+lobe*wave,ankle[1]+ry*u,z+.006*wave),{'Paw.'+name:1}))
            b.bridge(prev,row);prev=row
        b.face(prev)
    obj=b.make("Coat.Body")
    # The interior cage vertices under the four openings do not belong to the surface.
    activate(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.delete_loose(use_verts=True,use_edges=True,use_faces=False);bpy.ops.object.mode_set(mode='OBJECT')
    relax=obj.modifiers.new("肩胯过渡","SMOOTH");relax.factor=.68;relax.iterations=4
    bpy.ops.object.modifier_apply(modifier=relax.name)
    return unwrap(obj,1)


def tail_sample(t):
    axis=np.asarray(TAIL);i=int(min(len(axis)-2,max(0,math.floor(t))));v=t-i
    a,b,c,d=axis[max(0,i-1)],axis[i],axis[i+1],axis[min(len(axis)-1,i+2)]
    return .5*(2*b+(-a+c)*v+(2*a-5*b+4*c-d)*v*v+(-a+3*b-3*c+d)*v**3)
def tailmesh():
    b=Builder();prev=None;names=[f'Tail.{i:02}' for i in range(1,len(TAIL))]
    steps=np.r_[np.linspace(0,7,29),7.25,7.48,7.68,7.84,7.95,8]
    for t in steps:
        c=tail_sample(t);d=unit(tail_sample(min(8,t+.06))-tail_sample(max(0,t-.06)))
        side=unit(np.array((0,1,0))-d*d[1]);up=unit(np.cross(d,side))
        r=np.interp(t,[0,1,2,3,4,5,6,7,7.5,7.8,7.95,8],[.208,.219,.214,.205,.196,.193,.188,.177,.151,.106,.060,.014])
        w=ring_weights(t-.50,names)
        row=[b.pt(c+r*(side*math.cos(a)+up*math.sin(a)),w) for a in np.arange(28)*math.tau/28]
        if prev:b.bridge(prev,row)
        else:b.face(row[::-1])
        prev=row
    b.face(prev);return unwrap(b.make('Coat.Tail'),1)

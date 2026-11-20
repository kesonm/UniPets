"""Cranium, continuous orbital rings, pinnae, lenses and oral anatomy."""
import math
import numpy as np
import bpy
from mathutils import Vector
from core import Builder,world,local,unwrap,mat,oval,unit,smooth,bsdf

HP=np.array([[2.035,.025,2.065,1.89],[2.068,.18,2.20,1.68],[2.115,.31,2.244,1.54],
[2.18,.444,2.276,1.45],[2.24,.523,2.300,1.395],[2.30,.587,2.319,1.35],
[2.39,.641,2.351,1.312],[2.48,.672,2.36,1.293],[2.57,.681,2.299,1.298],
[2.67,.678,2.246,1.307],[2.78,.657,2.209,1.334],[2.89,.627,2.168,1.361],
[3.0,.576,2.102,1.407],[3.09,.516,2.026,1.459],[3.15,.439,1.962,1.51],
[3.185,.325,1.893,1.57],[3.209,.19,1.84,1.62],[3.22,.022,1.764,1.692]])
EYES={'L':(2.111,.254,2.676),'R':(2.111,-.254,2.676)}
RADIUS=.164
def bounds(z):return [np.interp(z,HP[:,0],HP[:,i]) for i in (1,2,3)]
def depth(y,z):
    w,f,r=bounds(z);c=np.sqrt(np.clip(1-(y/np.maximum(.001,w))**2,0,1))
    x=(f+r)/2+(f-r)*.5*c**.94;ay=np.abs(y)
    x+=.092*np.exp(-((ay-.142)/.122)**2-((z-2.351)/.09)**2)
    x-=.063*np.exp(-((z-2.46)/.108)**2)*(1-np.exp(-(y/.14)**2))
    x+=.038*np.exp(-((ay-.396)/.138)**2-((z-2.547)/.138)**2)
    x+=.026*np.exp(-((ay-.244)/.16)**2-((z-2.875)/.071)**2)
    return x
def cap_depth(y,z,side):
    x,cy,cz=EYES[side];r2=RADIUS**2-(y-cy)**2-(z-cz)**2
    return x+math.sqrt(max(0,r2))+.0034
def add_shape(ob,name,deltas):
    if not ob.data.shape_keys:ob.shape_key_add(name='Basis')
    sh=ob.shape_key_add(name=name)
    for idx,d in deltas.items():sh.data[idx].co=ob.data.vertices[idx].co+Vector(world(d))
    return sh
def head():
    b=Builder();n=96;grid={};changes={s:{} for s in ['Blink.L','Blink.R','BrowLift.L','BrowLift.R','CheekSmile']}
    zs=sorted(set(np.arange(2.048,3.214,.022).tolist()+[2.035,2.271,2.275,2.457,2.887,3.22]))
    low=zs.index(2.457);hi=zs.index(2.887);holes=[(1,13,'L',1),(-13,-1,'R',-1)]
    for i,z in enumerate(zs):
        w,f,r=bounds(z)
        for j in range(n):
            jj=j if j<n//2 else j-n
            if low<i<hi and any(lo<jj<up for lo,up,_,_ in holes):continue
            a=math.tau*j/n;y=w*math.sin(a);c=math.cos(a)
            x=float(depth(y,z)) if c>=0 else (f+r)*.5-(f-r)*.5*abs(c)**.94
            z1=z+(.030+.012*min(1,abs(y)/.25))*max(c,0)**4*math.exp(-((z-2.275)/.085)**2)
            jaw=float(smooth(.26,.84,c))*(1-float(smooth(.24,.51,abs(y)))) if z<=2.27101 else 0
            position=(x,y,z1)
            if z==2.275 and c>.82 and abs(y)<.234:
                position=b.v[grid[zs.index(2.271),j]]
            idx=b.pt(position,{'Head':1-jaw,'Jaw':jaw});grid[i,j]=idx
            if c>.40 and 2.23<z<2.57:
                m=math.exp(-((abs(y)-.23)/.135)**2-((z-2.31)/.102)**2)
                changes['CheekSmile'][idx]=(.008*m,.031*np.sign(y)*m,.042*m)
            if c>.45 and 2.75<z<3.04:
                m=math.exp(-((abs(y)-.25)/.17)**2-((z-2.84)/.11)**2)
                changes['BrowLift.'+('L' if y>0 else 'R')][idx]=(.009*m,0,.059*m)
    for i in range(len(zs)-1):
        for j in range(n):
            jj=j if j<n//2 else j-n
            if low<=i<hi and any(a<=jj<c for a,c,_,_ in holes):continue
            if zs[i]==2.271 and math.cos(math.tau*(j+.5)/n)>.82 and abs(b.v[grid[i,j]][1])<.226:continue
            k=(j+1)%n;b.face((grid[i,j],grid[i,k],grid[i+1,k],grid[i+1,j]))
    b.face([grid[0,j] for j in range(n)]);b.face([grid[len(zs)-1,j] for j in range(n)])
    for lo,up,side,sg in holes:
        perimeter=[(low,j) for j in range(lo,up)]+[(i,up) for i in range(low,hi)]+[(hi,j) for j in range(up,lo,-1)]+[(i,lo) for i in range(hi,low,-1)]
        outer=[grid[i,j%n] for i,j in perimeter];prev=outer;_,cy,cz=EYES[side]
        for influence in [.19,.40,.63,.82,.92,.968,.986,1.]:
            row=[]
            for k,(i,j) in enumerate(perimeter):
                theta=math.atan2(2*(zs[i]-zs[low])/(zs[hi]-zs[low])-1,2*(j-lo)/(up-lo)-1)
                ca,si=math.cos(theta),math.sin(theta)
                dy=.137*ca;dz=(.109 if si>=0 else .101)*si*(.55+.45*abs(si))+.13*sg*dy
                ey,ez=cy+dy,cz+dz;op=np.array(b.v[outer[k]]);y,z=op[1:]*(1-influence)+np.array([ey,ez])*influence
                x=max(float(depth(y,z)),cap_depth(y,z,side))+.0065*math.sin(influence*math.pi)
                if influence==1:x=cap_depth(y,z,side)+.003
                idx=b.pt((x,y,z),{'Head':1});row.append(idx)
                closure=cz+.13*sg*dy-.023*(1-ca*ca)+(-.0013 if si>=0 else .0013)
                zc=z+(closure-ez)*influence**1.60
                xc=max(float(depth(y,zc)),cap_depth(y,zc,side))+.003+.0065*math.sin(influence*math.pi)
                changes['Blink.'+side][idx]=(xc-x,0,zc-z)
                if si>0:
                    m=si*(1-.86*influence)
                    changes['BrowLift.'+side][idx]=(.004*m,0,.055*m)
            for k in range(len(row)):
                j=(k+1)%len(row)
                upper=(b.v[row[k]][2]+b.v[row[j]][2])*.5>cz
                b.face((prev[k],prev[j],row[j],row[k]),1 if influence==1 or (influence==.986 and upper) else 0)
            prev=row
    ob=b.make('Coat.Head');unwrap(ob)
    ob.data.materials.append(mat('Orbital skin base'));ob.data.materials.append(mat('Lid | cocoa lashline',(.199,.129,.10),.50))
    for p,r in zip(ob.data.polygons,b.regions):p.material_index=r
    for key,v in changes.items():add_shape(ob,key,v)
    return ob
def ears(side):
    sg=1 if side=='L' else -1;b=Builder()
    # Outline follows the pink pinna of the plate; nested surfaces form a shallow concha and rim.
    raw=np.array([[.220,3.055],[.267,3.13],[.353,3.253],[.476,3.42],[.555,3.515],
           [.600,3.528],[.630,3.484],[.652,3.375],[.653,3.245],[.632,3.085],
           [.603,2.98],[.530,2.925],[.403,2.944],[.277,2.985]])
    outline=[]
    for i in range(len(raw)):
        a,bb,c,d=raw[(i-1)%len(raw)],raw[i],raw[(i+1)%len(raw)],raw[(i+2)%len(raw)]
        for t in [0,.333,.667]:outline.append(.5*(2*bb+(-a+c)*t+(2*a-5*bb+4*c-d)*t*t+(-a+3*bb-3*c+d)*t**3))
    outline=np.array(outline);center=np.array([.484,3.178]);ends=[]
    for back in (False,True):
        prev=None
        for t in [.008,.24,.47,.68,.80,.90,.965,1.]:
            row=[]
            for w in outline:
                y,z=center+t*(w-center);h=np.clip((z-2.93)/.61,0,1)
                x=1.94-.214*h-.088*(y-.23)/.43
                x+=(-.039-.17*(1-t*t)) if back else .038*np.exp(-((t-.86)/.145)**2)-.102*(1-t*t)
                ew=.64+.36*float(smooth(2.94,3.09,z));row.append(b.pt((x,sg*y,z),{'Ear.'+side:ew,'Head':1-ew}))
            if prev:b.bridge(prev,row)
            else:b.face(row)
            prev=row
        ends.append(prev)
    b.bridge(*ends);ob=b.make('Coat.Ear.'+side)
    attr=ob.data.attributes.new('pinna_back','FLOAT','POINT');vals=np.zeros(len(b.v),np.float32);vals[len(b.v)//2:]=1;attr.data.foreach_set('value',vals)
    return unwrap(ob,1)
def eyes(side):
    ce=np.array(EYES[side]);sg=1 if side=='L' else -1
    b=Builder();prev=None;uvby=[];num=56
    # Spherical globe, with equal-radius surface directions to support independent eye aim.
    normal=unit([1,-.105*sg,.018]);across=unit(np.cross([0,0,1],normal));up=unit(np.cross(normal,across))
    for polar in np.linspace(.002,math.pi-.002,36):
        row=[]
        for a in np.arange(num)*math.tau/num:
            h=math.sin(polar)*math.cos(a);v=math.sin(polar)*math.sin(a)
            pos=ce+RADIUS*(math.cos(polar)*normal+h*across+v*up)
            idx=b.pt(pos,{'Eye.'+side:1});row.append(idx);uvby.append((.5+.49*h,.5+.49*v))
        if prev:b.bridge(prev,row,0 if polar<math.pi*.53 else 1)
        else:b.face(row,0)
        prev=row
    b.face(prev,1);ob=b.make('Eye.'+side)
    uv=ob.data.uv_layers.new(name='IrisUV')
    for l in ob.data.loops:uv.data[l.index].uv=uvby[l.vertex_index]
    ob.data.materials.append(mat('Eye | olive iris',(.5,.42,.2),.21))
    ob.data.materials.append(mat('Eye | peripheral coat',(.325,.257,.158),.38))
    for p,m in zip(ob.data.polygons,b.regions):p.material_index=m
    return ob
def nose():
    b=Builder()
    outline=np.array([[-.087,2.464],[-.073,2.481],[-.039,2.489],[0,2.483],[.041,2.488],[.077,2.477],[.088,2.464],[.072,2.448],[.050,2.441],[.026,2.411],[0,2.393],[-.028,2.412],[-.048,2.438],[-.072,2.446]])
    cen=np.array([0,2.451]);prev=None
    for t in [.013,.28,.53,.75,.90,1.]:
        row=[]
        for point in outline:
            y,z=cen+t*(point-cen);x=float(depth(y,z))+.014+.033*(1-t*t)
            row.append(b.pt((x,y,z),{'Head':1}))
        if prev:b.bridge(prev,row)
        else:b.face(row)
        prev=row
    o=b.make('Nose | rose planum');unwrap(o,1);o.data.materials.append(mat('Nose | rose',(.79,.465,.429),.43))
    for sg in [-1,1]:
        y=.060*sg;z=2.451;x=float(depth(y,z))+.035
        oval('Nostril.'+('L' if sg>0 else 'R'),(x,y,z),(.006,.016,.0075),'Head',mat('Nostril | umber',(.21,.114,.102)),16,9)
    return o
def mouth():
    dark=mat('Mouth | velvet',(.235,.088,.104),.79);pink=mat('Tongue | rose',(.795,.399,.444),.40)
    oval('Palate',(2.100,0,2.290),(.18,.216,.050),'Head',dark)
    oval('Mandible interior',(2.125,0,2.256),(.142,.203,.037),'Jaw',dark)
    b=Builder();prev=None
    for a,w,z in [(1.97,.042,2.277),(2.036,.103,2.279),(2.116,.105,2.279),(2.196,.096,2.280),(2.254,.074,2.282),(2.287,.042,2.282),(2.30,.008,2.285)]:
        row=[]
        for phi in np.arange(32)*math.tau/32:
            y=w*math.cos(phi);h=math.sin(phi)
            zz=z+.023*h-.006*math.exp(-(y/.015)**2)*max(h,0)
            wgt=float(smooth(2.0,2.254,a));row.append(b.pt((a,y,zz),{'Jaw':1-wgt,'Tongue':wgt}))
        if prev:b.bridge(prev,row)
        else:b.face(row)
        prev=row
    b.face(prev);o=b.make('Tongue | central groove');o.data.materials.append(pink)
    for sg in [-1,1]:
        b=Builder();prev=None
        for z,r in [(2.314,.017),(2.299,.021),(2.279,.016),(2.252,.009),(2.234,.002)]:
            row=[b.pt((2.233+(2.30-z)*.19+r*math.cos(a),sg*.169+r*math.sin(a),z),{'Head':1}) for a in np.arange(14)*math.tau/14]
            if prev:b.bridge(prev,row)
            else:b.face(row)
            prev=row
        b.face(prev);o=b.make('Canine.'+('L' if sg>0 else 'R'));o.data.materials.append(mat('Teeth | ivory',(.94,.89,.77),.36))

def muzzle_lines():
    b=Builder()
    def line(path,widths):
        prev=None
        for (y,z),r in zip(path,widths):
            x=float(depth(y,z))+.003
            row=[b.pt((x+r*math.cos(a),y,z+r*math.sin(a)),{'Head':1}) for a in np.arange(8)*math.tau/8]
            if prev:b.bridge(prev,row)
            prev=row
    for sg in (-1,1):
        points=[(0,2.397),(.002*sg,2.368),(.004*sg,2.337),(.016*sg,2.322),(.042*sg,2.312),(.079*sg,2.302),(.122*sg,2.300),(.166*sg,2.310),(.207*sg,2.325)]
        line(points,[.003,.0046,.0054,.0052,.0049,.0043,.0037,.0024,.0006])
    o=b.make('Muzzle | philtrum and lip crease');o.data.materials.append(mat('Lips | walnut',(.275,.172,.149),.72))
    for sg in (-1,1):
        for j,(y,z) in enumerate([(.111,2.411),(.146,2.419),(.182,2.409),(.117,2.375),(.164,2.38)]):
            y*=sg;x=float(depth(y,z))+.002
            oval('Follicle.'+str(sg)+'.'+str(j),(x,y,z),(.003,.0065,.0045),'Head',mat('Follicles | fawn',(.438,.346,.282)),10,6)

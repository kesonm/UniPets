"""Editable guide strands and a separate weighted, alpha-cut realtime coat."""
import math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from core import *
import coat,anatomy,face
RNG=np.random.default_rng(41379)
def triangles(ob):
    m=ob.data;m.calc_loop_triangles()
    tri=array(m.loop_triangles,'vertices',3,np.int32);loops=array(m.loop_triangles,'loops',3,np.int32)
    xyz=array(m.vertices,'co',3);no=array(m.vertex_normals,'vector',3);uv=array(m.uv_layers['CoatUV'].uv,'vector',2)
    return tri,xyz,no,uv[loops]
def roots(ob,count):
    tri,xyz,no,uv=triangles(ob);positions=xyz[tri]
    areas=np.linalg.norm(np.cross(positions[:,1]-positions[:,0],positions[:,2]-positions[:,0]),axis=1)
    if ob.name=='Coat.Head':
        material=array(ob.data.loop_triangles,'material_index',1,np.int32)[:,0];areas[material!=0]=0
    ids=RNG.choice(len(tri),count,p=(areas.astype(float)/areas.astype(float).sum()))
    a=RNG.random((count,2));over=a.sum(axis=1)>1;a[over]=1-a[over]
    bary=np.column_stack((1-a.sum(axis=1),a))
    def sample(v):return np.einsum('ni,nij->nj',bary,v)
    extra=None
    if 'pinna_back' in ob.data.attributes:extra=sample(array(ob.data.attributes['pinna_back'].data,'value',1)[tri[ids]])[:,0]
    return dict(p=sample(positions[ids]),n=unit(sample(no[tri[ids]])),uv=sample(uv[ids]),ids=tri[ids],bary=bary,tri=positions[ids],extra=extra)
def comb(ob,dat,guard):
    p=local(dat['p']);n=local(dat['n'])*UNIT;x,y,z=p.T;k=ob['coat_region'];N=len(x);keep=np.ones(N,bool)
    if k=='Body':
        bib=smooth(.68,1.29,x)*smooth(1.27,1.86,z);leg=1-smooth(.73,1.43,z)
        length=(.094+.086*bib-.054*leg)*(.57+.43*smooth(.13,.32,z))
        d=np.column_stack((-.86+.64*bib+.70*leg,.13*y,-.44-.52*bib-.46*leg))
        keep&=z>.035
    elif k=='Tail':
        axis=np.array(anatomy.TAIL);mid=(axis[:-1]+axis[1:])*.5
        idx=((p[:,None]-mid[None])**2).sum(axis=2).argmin(axis=1)
        d=unit(np.diff(axis,axis=0))[idx];length=.131+.035*smooth(-1.7,-2.6,x)
    elif k=='Head':
        front=smooth(1.79,2.23,x);cheek=smooth(.19,.44,abs(y))*(1-smooth(2.66,2.95,z))
        length=.051+.040*cheek-.030*front*(1-smooth(.16,.30,abs(y)))
        d=np.column_stack((-.70*np.ones(N),np.sign(y)*(.40+.69*cheek),-.26-.43*cheek+.89*smooth(2.68,2.94,z)*front))
        for ce in face.EYES.values():
            rr=np.hypot((y-ce[1])/.151,(z-ce[2]-.13*np.sign(ce[1])*(y-ce[1]))/.142)
            keep&=~((rr<1.025)&(x>2.015))
            length*=1-(1-smooth(1.,1.39,rr))*.73*(x>2.02)
        keep&=~((abs(y)<.095)&(abs(z-2.45)<.063)&(x>2.27))
    else:
        bk=np.clip(dat['extra'],0,1);tip=smooth(3.40,3.54,z)
        length=.021+.017*tip+.019*(1-bk)
        d=np.column_stack((-.19*np.ones(N),np.sign(y)*(.29-.66*(1-bk)),np.ones(N)))
        keep&=(bk>.5)|(RNG.random(N)>(.46 if guard else .52))
    length*=RNG.uniform(.67,1.29,N)*(1.41 if guard else .76)
    d-=np.einsum('ij,ij->i',d,n)[:,None]*n;d=unit(d+.077*RNG.normal(size=d.shape))
    return world(d)/UNIT,length*UNIT,keep
def deformation():
    ng=bpy.data.node_groups.get('Fur | indexed barycentric attachment')
    if ng:return ng
    ng=bpy.data.node_groups.new('Fur | indexed barycentric attachment','GeometryNodeTree')
    ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Surface',in_out='INPUT',socket_type='NodeSocketObject')
    ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    ns=ng.nodes;ln=ng.links
    def node(name,label,x,y):
        q=ns.new(name);q.label=label;q.location=(x,y);return q
    start=node('NodeGroupInput','Rest guides',-1130,470);end=node('NodeGroupOutput','Deformed guides',1470,400)
    ob=node('GeometryNodeObjectInfo','Evaluated skin',-1140,195);ob.transform_space='RELATIVE';ln.new(start.outputs['Surface'],ob.inputs['Object'])
    pos=node('GeometryNodeInputPosition','Position',-900,-100)
    def attr(name,x,y):
        q=node('GeometryNodeInputNamedAttribute',name,x,y);q.data_type='FLOAT_VECTOR';q.inputs['Name'].default_value=name
        return q.outputs['Attribute']
    def split(a,x,y):
        q=node('ShaderNodeSeparateXYZ','',x,y);ln.new(a,q.inputs[0]);return list(q.outputs)
    def vec(op,a,b,x,y):
        q=node('ShaderNodeVectorMath',op,x,y);q.operation=op;ln.new(a,q.inputs[0])
        if b is not None:ln.new(b,q.inputs['Scale'] if op=='SCALE' else q.inputs[1])
        return q.outputs['Value' if op=='DOT_PRODUCT' else 'Vector']
    ids=split(attr('bind_vertices',-1140,-130),-900,-270);w=split(attr('bind_weights',-710,-610),-485,-640);v=[]
    for i in range(3):
        q=node('GeometryNodeSampleIndex','Skin vertex '+str(i),-625,350-i*170);q.data_type='FLOAT_VECTOR';q.domain='POINT'
        ln.new(ob.outputs['Geometry'],q.inputs['Geometry']);ln.new(pos.outputs[0],q.inputs['Value']);ln.new(ids[i],q.inputs['Index']);v.append(q.outputs['Value'])
    e1=vec('SUBTRACT',v[1],v[0],-410,360);e2=vec('SUBTRACT',v[2],v[0],-410,165)
    ta=vec('NORMALIZE',e1,None,-210,380);nn=vec('NORMALIZE',vec('CROSS_PRODUCT',e1,e2,-210,180),None,-12,170);bt=vec('CROSS_PRODUCT',nn,ta,170,255)
    scaled=[vec('SCALE',v[i],w[i],-170,-45-i*150) for i in range(3)]
    root=vec('ADD',vec('ADD',scaled[0],scaled[1],40,-100),scaled[2],245,-100)
    offset=vec('SUBTRACT',pos.outputs[0],attr('bind_origin',-930,-510),-520,-820)
    rt=attr('bind_tangent',-910,-780);rn=attr('bind_normal',-910,-1010);rb=vec('CROSS_PRODUCT',rn,rt,-540,-1030)
    terms=[vec('SCALE',ax,vec('DOT_PRODUCT',offset,orig,-160,-680-i*159),470,280-i*160) for i,(ax,orig) in enumerate([(ta,rt),(bt,rb),(nn,rn)])]
    new=vec('ADD',root,vec('ADD',vec('ADD',terms[0],terms[1],660,320),terms[2],840,240),1020,260)
    setp=node('GeometryNodeSetPosition','Skin-relative groom',1230,410);ln.new(start.outputs['Geometry'],setp.inputs['Geometry']);ln.new(new,setp.inputs['Position']);ln.new(setp.outputs[0],end.inputs[0])
    return ng
def material():
    m=bpy.data.materials.get('Groom | agouti fibres')
    if m:return m
    m=bpy.data.materials.new('Groom | agouti fibres');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
    a=n.new('ShaderNodeAttribute');a.attribute_name='fiber_color';a.location=(-520,90)
    hair=n.new('ShaderNodeBsdfHairPrincipled');hair.parametrization='COLOR';hair.inputs['Roughness'].default_value=.49;hair.inputs['IOR'].default_value=1.39
    diff=n.new('ShaderNodeBsdfDiffuse');diff.inputs['Roughness'].default_value=.68;diff.location=(-115,220)
    for sh in [diff,hair]:l.new(a.outputs['Color'],sh.inputs['Color'])
    mix=n.new('ShaderNodeMixShader');mix.location=(130,130);mix.inputs[0].default_value=.21;l.new(diff.outputs[0],mix.inputs[1]);l.new(hair.outputs[0],mix.inputs[2])
    out=n.new('ShaderNodeOutputMaterial');out.target='CYCLES';out.location=(390,160);l.new(mix.outputs[0],out.inputs[0])
    ee=n.new('ShaderNodeBsdfPrincipled');ee.location=(-120,-265);ee.inputs['Roughness'].default_value=.83;ee.inputs['Specular IOR Level'].default_value=.12
    l.new(a.outputs[0],ee.inputs['Base Color']);out=n.new('ShaderNodeOutputMaterial');out.target='EEVEE';out.location=(280,-215);l.new(ee.outputs[0],out.inputs[0])
    return m
def guide_data(ob,name,data,path,radius,color):
    count,steps,_=path.shape;cv=bpy.data.hair_curves.new(name);cv.add_curves([steps]*count)
    cv.position_data.foreach_set('vector',path.astype('f').ravel())
    def att(key,typ,domain,prop,val):
        cv.attributes.new(key,typ,domain).data.foreach_set(prop,np.ascontiguousarray(val,dtype='f').ravel())
    att('radius','FLOAT','POINT','value',radius)
    att('surface_uv_coordinate','FLOAT2','CURVE','vector',data['uv'])
    for key,value in [('bind_vertices',data['ids']),('bind_weights',data['bary']),('bind_origin',data['p']),('bind_tangent',unit(data['tri'][:,1]-data['tri'][:,0])),('bind_normal',unit(np.cross(data['tri'][:,1]-data['tri'][:,0],data['tri'][:,2]-data['tri'][:,0])))]:
        att(key,'FLOAT_VECTOR','CURVE','vector',value)
    att('fiber_color','FLOAT_COLOR','CURVE','color',np.column_stack((lin(color),np.ones(count))))
    cv.surface=ob;cv.surface_uv_map='CoatUV';cv.materials.append(material())
    hairs=bpy.data.objects.new(name,cv);col(FUR).objects.link(hairs)
    mod=hairs.modifiers.new('Follow skin triangles','NODES');mod.node_group=deformation()
    sock=next(it for it in mod.node_group.interface.items_tree if getattr(it,'name',None)=='Surface')
    mod[sock.identifier]=ob
    return hairs
def hair(ob,pal,n,guard):
    dat=roots(ob,n);d,length,ok=comb(ob,dat,guard)
    no=dat['n'];t=np.linspace(0,1,5)[None,:,None]
    curl=unit(np.cross(no,d))*RNG.uniform(-.13,.13,(n,1));elev=.51 if ob['coat_region']=='Tail' else .36
    path=dat['p'][:,None]+length[:,None,None]*(no[:,None]*(t*elev-.10*t*t)+d[:,None]*t**1.16+curl[:,None]*t*t)
    ok&=path[:,:,2].min(axis=1)>.0006;cc=pal.color(local(dat['p']),ob['coat_region'],dat['extra'])
    cc=np.clip(cc*RNG.normal(1.015 if guard else .996,.06,(n,1)),.008,.995)
    rw=RNG.uniform(.00084,.00162,(n,1))*UNIT*np.array([.93,1,.78,.45,.045])
    sub={k:v[ok] for k,v in dat.items() if v is not None}
    return guide_data(ob,ob.name+('.Guard' if guard else '.Undercoat'),sub,path[ok],rw[ok],cc[ok])
def weightlist(ob):
    names={g.index:g.name for g in ob.vertex_groups}
    return [{names[g.group]:g.weight for g in v.groups if g.weight>1e-6} for v in ob.data.vertices]
def card_material():
    m=mat('Realtime | cutout fur',(1,1,1),.86);size=256;yy,xx=np.mgrid[0:size,0:size];t=1-(yy+.5)/size
    alpha=np.zeros_like(t,dtype=float);rng=np.random.default_rng(391)
    for j in range(4):
        x=(xx-j*64+.5)/64
        for k in range(17):
            base=rng.uniform(.22,.78);tip=np.clip(base+rng.normal(0,.17),.07,.93)
            top=rng.uniform(.66,.98);curve=(1-t)*base+t*tip+.025*np.sin(t*np.pi*1.5+rng.uniform(-2,2))
            half=(.023+.025*rng.random())*(1-.79*t)
            v=(1-smooth(half*.34,half+.009,abs(x-curve)))*(1-smooth(top-.10,top,t))*smooth(.006,.15,t)
            alpha=np.maximum(alpha,v)
    rgba=np.full((size,size,4),255,'B');rgba[:,:,3]=(np.clip(alpha,0,1)*255).astype('B');coat.png(TEX/'fur_tufts_rgba.png',rgba)
    tex=textured(m,TEX/'fur_tufts_rgba.png');p=bsdf(m);n=m.node_tree.nodes;links=m.node_tree.links
    vc=n.new('ShaderNodeVertexColor');vc.layer_name='TuftColor'
    mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;links.new(tex.outputs[0],mul.inputs[1]);links.new(vc.outputs[0],mul.inputs[2]);links.new(mul.outputs[0],p.inputs['Base Color']);links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
    m['rt_alpha']='MASK';m['rt_cutoff']=.33;m['rt_double']=True
    return m
def cards(surfaces,pal):
    b=Builder();rgb=[];uvs=[];normals=[]
    for ob,num in zip(surfaces,[1150,430,420,110,110]):
        dat=roots(ob,num);direction,le,keep=comb(ob,dat,True);weights=weightlist(ob);cc=pal.color(local(dat['p']),ob['coat_region'],dat['extra'])
        for i in np.flatnonzero(keep):
            base=dat['p'][i];d=direction[i];n=dat['n'][i];side=unit(np.cross(n,d));base=base-n*.00016;w={}
            for vv,f in zip(dat['ids'][i],dat['bary'][i]):
                for bone,wt in weights[vv].items():w[bone]=w.get(bone,0)+f*wt
            w=normalized(dict(sorted(w.items(),key=lambda kv:-kv[1])[:4]));width=UNIT*RNG.uniform(.008,.017);length=le[i]*.82;variant=RNG.integers(0,4)
            start=len(b.v)
            for t,wf in [(0,.81),(.39,1.),(.73,.83),(1.,.32)]:
                center=base+d*length*t+n*length*(.50*t-.18*t*t)
                for k in [-1,1]:
                    point=center+k*side*width*wf
                    b.pt(local(point),w);uvs.append(((variant+(.015 if k<0 else .985))/4,.01+.98*t))
                    normals.append(unit(n+.07*d));rgb.append(np.clip(cc[i]*(1+.055*t),.008,.99))
            for k in range(3):
                a=start+2*k;b.face((a,a+2,a+3,a+1))
    obj=b.make('RT | fur cards',RT,False);obj.data.materials.append(card_material())
    uv=obj.data.uv_layers.new(name='CardUV')
    for l in obj.data.loops:uv.data[l.index].uv=uvs[l.vertex_index]
    att=obj.data.color_attributes.new(name='TuftColor',type='FLOAT_COLOR',domain='POINT');att.data.foreach_set('color',np.column_stack((lin(rgb),np.ones(len(rgb)))).astype('f').ravel())
    obj.data.attributes.new('groom_normal','FLOAT_VECTOR','POINT').data.foreach_set('vector',np.asarray(normals,'f').ravel())
    obj.data.normals_split_custom_set_from_vertices(normals)
    from card_attachment import install
    install(obj)
def whiskers(head):
    tri,vs,no,uv=triangles(head);tree=BVHTree.FromPolygons(vs.tolist(),tri.tolist(),all_triangles=True)
    dat={k:[] for k in ['p','uv','ids','bary','tri']};paths=[];radius=[];colors=[]
    b=Builder()
    for sg in [-1,1]:
        for j in range(21):
            brow=j>=17;i=j-17 if brow else j
            y=sg*(.20+.033*i if brow else .112+.032*(i%5)+RNG.uniform(-.008,.008));z=(2.875+.016*i if brow else 2.343+.031*(i//5)+RNG.uniform(-.009,.009))
            pos,_no,idx,_=tree.find_nearest(Vector(world((face.depth(y,z),y,z))));abc=vs[tri[idx]];root=np.array(pos);aa,bb,ce=abc
            w=np.linalg.lstsq(np.stack((bb-aa,ce-aa)).T,root-aa,rcond=None)[0];bw=np.r_[1-w.sum(),w]
            for k,v in [('p',root),('uv',bw@uv[idx]),('ids',tri[idx]),('bary',bw),('tri',abc)]:dat[k].append(v)
            t=np.linspace(0,1,11)[:,None]
            delta=[.12,sg*RNG.uniform(.48,.82),RNG.uniform(-.18,.18)] if not brow else [.06,sg*RNG.uniform(.20,.37),RNG.uniform(.23,.37)]
            bend=[RNG.uniform(-.24,-.10),-sg*.041,-.12] if not brow else [-.08,sg*.03,-.04]
            coords=root+world(t*delta+t*t*bend);paths.append(coords);rr=RNG.uniform(.00125,.0020)*UNIT*(.045+.955*(1-t[:,0])**.70);radius.append(rr)
            colors.append((.87,.814,.722) if j%6 else (.52,.456,.385))
            prev=None
            for k in range(0,len(coords),2):
                tang=unit(coords[min(k+1,10)]-coords[max(k-1,0)]);lat=unit(np.cross(tang,[0,0,1]));up=unit(np.cross(tang,lat))
                row=[b.pt(local(coords[k]+rr[k]*1.10*(lat*math.cos(v)+up*math.sin(v))),{'Head':1}) for v in np.arange(4)*math.tau/4]
                if prev:b.bridge(prev,row)
                prev=row
    guide_data(head,'Groom | tactile whiskers',{k:np.array(v) for k,v in dat.items()},np.asarray(paths),np.asarray(radius),np.asarray(colors))
    ob=b.make('RT | whisker filaments',RT);ob.data.materials.append(mat('Whiskers | ivory',(.82,.76,.66),.47))
def build():
    load('cat_master.blend')
    if bpy.context.scene.get('groom_built') and '--rebuild' not in sys.argv:return
    for c in [col(FUR),col(RT)]:
        for o in list(c.objects):bpy.data.objects.remove(o,do_unlink=True)
    pal=coat.Palette();obs=[bpy.data.objects[s] for s in ['Coat.Body','Coat.Tail','Coat.Head','Coat.Ear.L','Coat.Ear.R']]
    for ob,n,m in zip(obs,[56000,11700,20500,3200,3200],[28500,7600,9700,1600,1600]):
        hair(ob,pal,n,False);hair(ob,pal,m,True)
    cards(obs,pal);whiskers(obs[2]);col(RT).hide_render=True;col(RT).hide_viewport=True
    bpy.context.scene['groom_built']=True;save(BLENDS/'cat_master.blend')
if __name__=='__main__':build()

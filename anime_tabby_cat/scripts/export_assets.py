"""Serialize actual skinned surfaces and sample Blender's evaluated IK into portable glTF 2.0."""
import sys,json,struct,copy,base64,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
from create_expressions import SLIDERS
import realtime_correctives as correct
from mathutils import Matrix
YUP=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
def basis(m):return YUP@m@YUP.transposed()
def xyz(v):
    a=np.asarray(v);return np.stack((a[...,0],a[...,2],-a[...,1]),axis=-1)
def trs(m):
    t,r,s=m.decompose();return ([*t],[r.x,r.y,r.z,r.w],[*s])
def atomic(path,d):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name('.'+path.name+'.writing')
    tmp.write_bytes(d);os.replace(tmp,path)
def compact(j):return json.dumps(j,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf8')
def append_view(j,b,data,buffer=0,target=None):
    b.extend(b'\0'*((-len(b))%4));v=dict(buffer=buffer,byteOffset=len(b),byteLength=len(data))
    if target:v['target']=target
    n=len(j['bufferViews']);j['bufferViews'].append(v);b.extend(data);return n
def acc(j,b,a,typ,ctype=5126,buffer=0,target=None,bounds=False):
    dt={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[ctype]
    a=np.ascontiguousarray(a,dtype=dt);view=append_view(j,b,a.tobytes(),buffer,target)
    d=dict(bufferView=view,componentType=ctype,count=len(a),type=typ)
    if bounds:d.update(min=a.reshape(len(a),-1).min(axis=0).tolist(),max=a.reshape(len(a),-1).max(axis=0).tolist())
    n=len(j['accessors']);j['accessors'].append(d);return n
def material(j,b,m,cache,images):
    if m.name in cache:return cache[m.name]
    def texture(name):
        if name in images:return images[name]
        path=TEX/name
        if not path.is_file():raise FileNotFoundError(path)
        i=len(j['images']);view=append_view(j,b,path.read_bytes())
        j['images'].append(dict(name=path.stem,mimeType='image/png',bufferView=view));j['textures'].append(dict(source=i,sampler=0));images[name]=i;return i
    p=dict(baseColorFactor=list(m.get('rt_color',[.5,.5,.5]))+[1.],metallicFactor=0.,roughnessFactor=float(m.get('rt_roughness',.7)))
    out=dict(name=m.name,pbrMetallicRoughness=p,doubleSided=bool(m.get('rt_double',False)))
    if m.get('rt_base'):p['baseColorTexture']={'index':texture(m['rt_base'])}
    if m.get('rt_normal'):out['normalTexture']={'index':texture(m['rt_normal']),'scale':m['rt_normal_scale']}
    if m.get('rt_alpha'):out.update(alphaMode=m['rt_alpha'],alphaCutoff=m['rt_cutoff'])
    idx=len(j['materials']);j['materials'].append(out);cache[m.name]=idx;return idx
def mesh_parts(o,by_joint,keys,correctives=None):
    me=o.data;me.calc_loop_triangles()
    tri=array(me.loop_triangles,'loops',3,np.int32);mi=array(me.loop_triangles,'material_index',1,np.int32)[:,0]
    loopv=array(me.loops,'vertex_index',1,np.int32)[:,0];p=array(me.vertices,'co',3)
    normal=xyz(array(me.vertex_normals,'vector',3));uvlayer=me.uv_layers.active
    uvs=array(uvlayer.uv,'vector',2) if uvlayer else None
    if uvs is not None:uvs[:,1]=1-uvs[:,1]
    if 'groom_normal' in me.attributes:normal=xyz(array(me.attributes['groom_normal'].data,'vector',3))
    color=array(me.color_attributes['TuftColor'].data,'color',4) if 'TuftColor' in me.color_attributes else None
    joints=np.zeros((len(p),4),np.uint8);weights=np.zeros((len(p),4),np.float32);grp={g.index:by_joint[g.name] for g in o.vertex_groups}
    for v in me.vertices:
        vals=sorted([(g.weight,grp[g.group]) for g in v.groups if g.weight>1e-8],reverse=True)[:4]
        if not vals:raise ValueError(f'Unweighted vertex {o.name}:{v.index}')
        total=sum(x for x,i in vals)
        for j,(w,idx) in enumerate(vals):joints[v.index,j]=idx;weights[v.index,j]=w/total
    morph=[xyz(array(me.shape_keys.key_blocks[k].data,'co',3)-p) for k in keys] if keys else []
    if correctives:morph=[xyz(d) for d in correctives]
    positions=xyz(p)
    for matid in sorted(set(mi)):
        m=me.materials[matid];ii=tri[mi==matid].ravel();vi=loopv[ii]
        arr=vi[:,None].astype(np.int32)
        useuv=uvs is not None and bool(m.get('rt_base'))
        if useuv:arr=np.column_stack((arr,np.rint(uvs[ii]*1e7).astype('i')))
        if m.get('rt_normal'):
            faceuv=uvs[ii].reshape(-1,3,2);a=faceuv[:,1]-faceuv[:,0];c=faceuv[:,2]-faceuv[:,0]
            det=a[:,0]*c[:,1]-a[:,1]*c[:,0];arr=np.column_stack((arr,np.repeat(np.sign(det).astype('i'),3)))
        _,first,inv=np.unique(arr,axis=0,return_index=True,return_inverse=True);ids=vi[first];loops=ii[first]
        fields=dict(POSITION=positions[ids],NORMAL=normal[ids],JOINTS_0=joints[ids],WEIGHTS_0=weights[ids])
        if useuv:fields['TEXCOORD_0']=uvs[loops]
        if m.get('rt_normal'):
            vid=inv.reshape(-1,3);pv=fields['POSITION'][vid];e1=pv[:,1]-pv[:,0];e2=pv[:,2]-pv[:,0]
            scale=np.zeros_like(det);valid=np.abs(det)>1e-10;scale[valid]=1/det[valid]
            tg=(e1*c[:,1,None]-e2*a[:,1,None])*scale[:,None];bt=(e2*a[:,0,None]-e1*c[:,0,None])*scale[:,None]
            tang=np.zeros_like(fields['NORMAL']);bit=np.zeros_like(tang)
            for ix in vid.T:np.add.at(tang,ix,tg);np.add.at(bit,ix,bt)
            n=fields['NORMAL'];tang-=n*np.sum(n*tang,axis=1)[:,None];short=np.linalg.norm(tang,axis=1)<1e-10
            safe=np.where((abs(n[:,2])>.9)[:,None],[0,1,0],[0,0,1]);tang[short]=np.cross(safe[short],n[short]);tang=unit(tang)
            sign=np.where(np.sum(np.cross(n,tang)*bit,axis=1)<0,-1.,1.);fields['TANGENT']=np.column_stack((tang,sign))
        if color is not None:fields['COLOR_0']=color[ids]
        yield m,fields,inv.ravel(),[d[ids] for d in morph]
def static(rig):
    j=dict(asset={'version':'2.0','generator':'Mugi feline character · Blender evaluated skin export'},scene=0,scenes=[{'name':'Mugi','nodes':[0]}],nodes=[dict(name='Mugi',children=[])],skins=[],meshes=[],images=[],materials=[],textures=[],samplers=[dict(magFilter=9729,minFilter=9987,wrapS=10497,wrapT=10497)],accessors=[],bufferViews=[],animations=[])
    b=bytearray();bones=[q for q in rig.data.bones if q.use_deform or q.name=='Root'];by={q.name:i for i,q in enumerate(bones)};parents=[];rest=[];inv=[]
    for q in bones:
        p=q.parent
        while p and p.name not in by:p=p.parent
        par=-1 if not p else by[p.name];parents.append(par)
        rel=q.matrix_local if p is None else p.matrix_local.inverted()@q.matrix_local
        v=trs(basis(rel));rest.append(v);inv.append(np.asarray(basis(q.matrix_local).inverted()).T.ravel())
        j['nodes'].append(dict(name=q.name,translation=v[0],rotation=v[1],scale=v[2]))
    for i,par in enumerate(parents):j['nodes'][par+1].setdefault('children',[]).append(i+1)
    j['skins']=[dict(name='Feline skeleton',joints=list(range(1,len(bones)+1)),skeleton=by['Root']+1,inverseBindMatrices=acc(j,b,inv,'MAT4'))]
    keys=list(SLIDERS.values());groups={};mats={};ims={};delta=correct.capture(rig,bones,by)
    for o in sorted(list(col(SKIN).objects)+list(col(RT).objects),key=lambda q:q.name):
        if o.type!='MESH':continue
        morph=keys if o.data.shape_keys else []
        group='Face' if morph else 'Fur cards' if o.name=='RT | fur cards' else 'Body' if o.name=='Coat.Body' else 'Coat and anatomy';g=groups.setdefault(group,{})
        for m,fields,idx,ds in mesh_parts(o,by,morph,delta.get(o.name)):
            mid=material(j,b,m,mats,ims);g.setdefault(mid,[]).append((fields,idx,ds))
    morph_node={}
    for name,by_mat in groups.items():
        mesh=dict(name=name,primitives=[]);mi=len(j['meshes']);ni=len(j['nodes'])
        j['nodes'][0]['children'].append(ni);j['nodes'].append(dict(name=name,mesh=mi,skin=0))
        if name in ('Face','Body','Fur cards'):
            targets=keys if name=='Face' else [desc[0] for desc in correct.SAMPLES]
            mesh.update(weights=[0.]*len(targets),extras={'targetNames':targets})
            morph_node[{'Face':-1,'Body':-2,'Fur cards':-3}[name]]=ni
        for material_id,parts in by_mat.items():
            idx=[];offset=0
            for f,ii,targets in parts:idx.append(ii+offset);offset+=len(f['POSITION'])
            primitive=dict(mode=4,material=material_id,attributes={})
            for field in parts[0][0]:
                data=np.concatenate([p[0][field] for p in parts])
                typ={2:'VEC2',3:'VEC3',4:'VEC4'}[data.shape[1]]
                primitive['attributes'][field]=acc(j,b,data,typ,5121 if field=='JOINTS_0' else 5126,target=34962,bounds=field=='POSITION')
            primitive['indices']=acc(j,b,np.concatenate(idx),'SCALAR',5123 if offset<=65535 else 5125,target=34963)
            if parts[0][2]:
                primitive['targets']=[{'POSITION':acc(j,b,np.concatenate([p[2][k] for p in parts]),'VEC3',target=34962,bounds=True)} for k in range(len(parts[0][2]))]
            mesh['primitives'].append(primitive)
        j['meshes'].append(mesh)
    return j,b,[q.name for q in bones],parents,rest,morph_node,keys
def evaluated(rig,d,names,parents,rest,head,keys):
    scene=bpy.context.scene;ad=rig.animation_data
    for track in ad.nla_tracks:track.mute=True
    ad.action=bpy.data.actions[d['name']];ad.action_slot=ad.action.slots[0];last=d['frames'][1];fs=range(1,last+1)
    qprev={};values=[[] for _ in names];shape=[]
    for f in fs:
        scene.frame_set(f);gd=bpy.context.evaluated_depsgraph_get();rr=rig.evaluated_get(gd)
        mats=[rr.pose.bones[k].matrix.copy() for k in names]
        for i,m in enumerate(mats):
            rel=m if parents[i]<0 else mats[parents[i]].inverted()@m
            v=list(trs(basis(rel)));r=np.array(v[1]);before=qprev.get(i)
            if before is not None and np.dot(before,r)<0:r=-r
            qprev[i]=r;v[1]=r.tolist();values[i].append(v)
        hk=head.evaluated_get(gd).data.shape_keys.key_blocks;shape.append([float(hk[k].value) for k in keys])
    out=[];time=np.arange(len(fs),dtype='f')/24.
    for i,series in enumerate(values):
        for n,k,default in zip(range(3),('translation','rotation','scale'),rest[i]):
            v=np.asarray([r[n] for r in series])
            if k=='rotation' and np.dot(v[0],default)<0:v=-v
            if np.max(np.abs(v-default))<(1e-6 if k=='translation' else 2e-5):continue
            out.append((i+1,k,v))
    sh=np.array(shape)
    if sh.max()>1e-5:out.append((-1,'weights',sh))
    fold=np.array([correct.weights(d['name'],i/(len(fs)-1)) for i in range(len(fs))])
    if fold.max()>0:out.extend([(-2,'weights',fold),(-3,'weights',fold)])
    return time,out
def clip_into(j,b,d,time,ch,morph_node,buffer=0):
    a=dict(name=d['name'],samplers=[],channels=[],extras={k:d[k] for k in ['label','loop','entry','exit','strideMeters']})
    time_ids={}
    for node,k,y in ch:
        constant=np.max(np.ptp(y,axis=0))<1e-7
        if constant:y=y[[0,-1]]
        if constant not in time_ids:time_ids[constant]=acc(j,b,time[[0,-1]] if constant else time,'SCALAR',buffer=buffer,bounds=True)
        if k=='weights':y=y.reshape(-1);node=morph_node[node]
        ty={'translation':'VEC3','scale':'VEC3','rotation':'VEC4','weights':'SCALAR'}[k]
        v=acc(j,b,y,ty,buffer=buffer);idx=len(a['samplers'])
        a['samplers'].append(dict(input=time_ids[constant],output=v,interpolation='LINEAR'))
        a['channels'].append(dict(sampler=idx,target={'node':node,'path':k}))
    if not a['channels']:raise ValueError(d['name'])
    j['animations'].append(a)
def glb(j,b):
    b.extend(b'\0'*((-len(b))%4));j['buffers']=[{'byteLength':len(b)}];spec=compact(j);spec+=b' '*((-len(spec))%4)
    return b'glTF'+struct.pack('<II',2,28+len(spec)+len(b))+struct.pack('<I4s',len(spec),b'JSON')+spec+struct.pack('<I4s',len(b),b'BIN\0')+b
def build():
    load('cat_animated.blend');rig=bpy.data.objects['Mugi | feline rig'];col(FUR).hide_viewport=True
    head=bpy.data.objects['Coat.Head'];base,skin,names,parents,rest,face_node,keys=static(rig);skin.extend(b'\0'*((-len(skin))%4))
    clips=json.loads((REPORT/'animation_manifest.json').read_text())['clips'];out=OUT/'animations';atomic(out/'cat_skin.bin',skin)
    main=copy.deepcopy(base);total=bytearray(skin)
    for d in clips:
        time,ch=evaluated(rig,d,names,parents,rest,head,keys)
        clip_into(main,total,d,time,ch,face_node)
        single=copy.deepcopy(base);little=bytearray();clip_into(single,little,d,time,ch,face_node,1)
        single['buffers']=[dict(byteLength=len(skin),uri='cat_skin.bin'),dict(byteLength=len(little),uri='data:application/octet-stream;base64,'+base64.b64encode(little).decode())]
        atomic(out/(d['name']+'.gltf'),compact(single));print('BAKED',d['name'],len(ch),flush=True)
    atomic(OUT/'cat_realtime.glb',glb(main,total))
    print('GLB',len(main['meshes']),len(names),len(clips),len(total),flush=True)
if __name__=='__main__':build()

"""Native contact, deformation and groom evaluation; independent GLB layout and Blender reimport."""
import sys,json,struct,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
from create_animations import WALK_PHASE,TROT_PHASE
from render_review import setclip
import anatomy

def dump(name,results):
    (REPORT/name).write_text(json.dumps(results,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def inventory():
    stages={}
    for name in ['cat_master.blend','cat_rigged.blend','cat_animated.blend']:
        load(name);sc=bpy.context.scene;dg=bpy.context.evaluated_depsgraph_get()
        skin=list(col(SKIN).objects);hair=list(col(FUR).objects);rt=list(col(RT).objects)
        meshes=[o for o in skin if o.type=='MESH'];verts=np.concatenate([array(o.data.vertices,'co',3) for o in meshes])
        inv={k:int(len(bpy.data.objects[k].data.vertices)) for k in ('Coat.Body','Coat.Head','Coat.Tail')}
        weights=[sum(g.weight for g in v.groups) for o in meshes for v in o.data.vertices];assert min(weights)>.999 and max(weights)<1.001
        images=[im for im in bpy.data.images if im.source=='FILE' and im.size[0]]
        assert all(im.packed_file for im in images)
        stages[name]=dict(bytes=(BLENDS/name).stat().st_size,anatomicalMeshes=len(meshes),surfaceVertices=inv,
            nativeCurves=len([o for o in hair if o.type=='CURVES']),realtimeMeshes=len(rt),
            armatures=sum(o.type=='ARMATURE' for o in sc.objects),clips=sum(a.get('title_zh') is not None for a in bpy.data.actions),
            packedImageCount=len(images),restWidthLengthHeightMm=((verts.max(axis=0)-verts.min(axis=0))*1000).round(2).tolist(),
            nativeWeightError=round(max(abs(1-min(weights)),abs(1-max(weights))),8))
    rig=bpy.data.objects['Mugi | feline rig'];col(FUR).hide_viewport=True;setclip(rig,'idle_stand',1)
    scene=bpy.context.scene;dg=bpy.context.evaluated_depsgraph_get();surfaces={}
    for z in np.arange(2.21,2.315,.002):
        hit,xyz,normal,index,obj,matrix=scene.ray_cast(dg,Vector((0,-1,z*UNIT)),Vector((0,1,0)))
        assert hit
        surfaces[obj.name]=surfaces.get(obj.name,0)+1
    assert 'Palate' not in surfaces and 'Mandible interior' not in surfaces
    dump('asset_inventory.json',dict(stages=stages,closedMouthCentralRays=surfaces))
def native():
    load('cat_animated.blend');s=bpy.context.scene;rig=bpy.data.objects['Mugi | feline rig'];groom=col(FUR)
    clips=json.loads((REPORT/'animation_manifest.json').read_text())['clips']
    ds={'blender':bpy.app.version_string,'bones':len(rig.data.bones),'deformBones':sum(b.use_deform for b in rig.data.bones),'traces':{},'loopEndErrors':{},'nla':{},'pawTests':{},'hairRootMaxMm':{}}
    dg=bpy.context.evaluated_depsgraph_get()
    for f in [1,200,295,430,495]:
        s.frame_set(f);ds['nla'][f]=round(float(rig.pose.bones['Pelvis'].head.z),6)
    hair=[o for o in groom.objects if o.type=='CURVES'];ds['curves']={o.name:len(o.data.curves) for o in hair};ds['curveCount']=sum(ds['curves'].values())
    ds['cardCount']=len(bpy.data.objects['RT | fur cards'].data.vertices)//8
    ds['packedImages']=[im.name for im in bpy.data.images if im.packed_file]
    for k,f in [('idle_stand',1),('idle_sit',32),('walk',20),('sleep',40),('look_around',24),('yawn',40),('lick_paw',42)]:
        setclip(rig,k,f);dg=bpy.context.evaluated_depsgraph_get();worst=0
        for o in hair:
            cv=o.data;ids=array(cv.attributes['bind_vertices'].data,'vector',3).astype(int);w=array(cv.attributes['bind_weights'].data,'vector',3)
            skin=cv.surface.evaluated_get(dg);verts=array(skin.data.vertices,'co',3);calc=np.einsum('ni,nij->nj',w,verts[ids])
            ev=o.evaluated_get(dg);path=array(ev.data.position_data,'vector',3);steps=len(path)//len(w)
            worst=max(worst,float(np.linalg.norm(calc-path[::steps],axis=1).max()))
        ds['hairRootMaxMm'][k]=round(worst*1000,7)
    groom.hide_viewport=True
    body=bpy.data.objects['Coat.Body'];rest=local(array(body.data.vertices,'co',3));markers=[]
    for name,part in anatomy.LEGS.items():
        x,y,z=part['knee'];mask=(abs(rest[:,2]-z)<.070)&(abs(rest[:,0]-x)<.31)&(abs(rest[:,1]-y)<.235)
        ix=np.where(mask)[0];order=ix[np.argsort(rest[ix,1])]
        markers.append((name,order[:4],order[-4:]))
    rg=[b.name for b in rig.data.bones if b.use_deform]
    witness={}
    for name in ['Coat.Body','Coat.Tail','Coat.Head','RT | fur cards']:
        o=bpy.data.objects[name];v=array(o.data.vertices,'co',3);idx=np.linspace(0,len(v)-1,48,dtype=int)
        witness[name]=idx
    def yup(coords):
        a=np.asarray(coords);return np.stack((a[...,0],a[...,2],-a[...,1]),axis=-1).round(7).tolist()
    ds['landmarksRest']={k:yup(array(bpy.data.objects[k].data.vertices,'co',3)[ids]) for k,ids in witness.items() if k!='RT | fur cards'}
    def bones():return np.array([np.array(rig.pose.bones[k].matrix) for k in rg])
    for d in clips:
        name=d['name'];lo,hi=d['frames'];setclip(rig,name,lo);start=bones();f0=np.array([rig[k] for k in ['blink_L','blink_R','smile','brow_L','brow_R']])
        setclip(rig,name,hi)
        if d['loop']:ds['loopEndErrors'][name]=round(max(float(abs(bones()-start).max()),float(abs(np.array([rig[k] for k in ['blink_L','blink_R','smile','brow_L','brow_R']])-f0).max())),7)
    for name,frames in [('idle_stand',[1]),('idle_sit',[1,49]),('idle_lie',[1]),('sleep',[1,41,81]),('stand_to_sit',[12,25,38,47]),('stand_to_lie',[14,29,40,54]),('walk',[4,10,19,27]),('stretch',[44]),('jump',[20]),('lick_paw',[27,40,53]),('groom_chest',[27,40,53]),('head_tilt',[25]),('yawn',[40])]:
        ds['traces'][name]=[]
        for frame in frames:
            setclip(rig,name,frame);dg=bpy.context.evaluated_depsgraph_get()
            vs=array(body.evaluated_get(dg).data.vertices,'co',3)
            tail=array(bpy.data.objects['Coat.Tail'].evaluated_get(dg).data.vertices,'co',3)
            widths={k:round(float(np.linalg.norm(vs[i].mean(axis=0)-vs[j].mean(axis=0))/(UNIT*np.linalg.norm(rest[i].mean(axis=0)-rest[j].mean(axis=0)))),3) for k,i,j in markers}
            dist={k:round((rig.pose.bones['Paw.'+k].head-rig.pose.bones['FootIK.'+k].head).length*1000,3) for k in anatomy.LEGS}
            row=dict(frame=frame,bodyMinMm=round(float(vs[:,2].min())*1000,3),tailMinMm=round(float(tail[:,2].min())*1000,3),pelvisMm=round(rig.pose.bones['Pelvis'].head.z*1000,2),pawErrorMm=dist,kneeWidthRatio=widths,blink=round(rig['blink_L'],3))
            if name.startswith(('lick','groom')):
                tb=rig.pose.bones['Tongue'];tip=tb.matrix@tb.bone.matrix_local.inverted()@Vector(world((2.30,0,2.285)))
                paw=rig.pose.bones['Paw.Fore.R'];row['tongueToPawCenterMm']=round((tip-paw.tail).length*1000,3)
                idx=np.where((rest[:,0]>.36)&(rest[:,0]<1.4)&(rest[:,2]>1.3))[0]
                row['tongueToChestSurfaceMm']=round(float(np.linalg.norm(vs[idx]-np.asarray(tip),axis=1).min())*1000,3)
            if name in ['idle_stand','idle_sit','sleep','walk','head_tilt','yawn','lick_paw']:
                row['jointGLTF']={k:yup(rig.pose.bones[k].head) for k in ['Pelvis','Head','Jaw','Tongue','Tail.08','Paw.Fore.L','Paw.Hind.R']}
                row['surfaceGLTF']={k:yup(array(bpy.data.objects[k].evaluated_get(dg).data.vertices,'co',3)[ids]) for k,ids in witness.items() if k!='RT | fur cards'}
            ds['traces'][name].append(row)
    for name,span,phase,stance,stride in [('walk',32,WALK_PHASE,.64,1.),('trot',22,TROT_PHASE,.52,1.3)]:
        drift={}
        for leg,lag in phase.items():
            streak=[];worst=0;contact=0
            for j in range(span+1):
                t=j/span;u=(t+stance-lag)%1;setclip(rig,name,1+j)
                if u<stance-1e-7:
                    p=np.array(rig.pose.bones['Paw.'+leg].head)+world((stride*t,0,0))
                    contact+=1
                    if streak:worst=max(worst,float(np.linalg.norm(p-streak[0])))
                    streak.append(p)
                else:streak=[]
            drift[leg]=dict(stanceSamples=contact,maxDriftMm=round(worst*1000,4))
        ds['pawTests'][name]=drift
    dump('native_checks.json',ds)
def gltf_checks():
    path=OUT/'cat_realtime.glb';data=path.read_bytes();magic,ver,ln=struct.unpack_from('<4sII',data)
    assert (magic,ver,ln)==(b'glTF',2,len(data));jl,jt=struct.unpack_from('<I4s',data,12);assert jt==b'JSON'
    j=json.loads(data[20:20+jl]);bl,bt=struct.unpack_from('<I4s',data,20+jl);buf=data[28+jl:];assert bt==b'BIN\0' and len(buf)==bl
    dtypes={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'};dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    def read(acc):
        a=j['accessors'][acc];v=j['bufferViews'][a['bufferView']];dt=dtypes[a['componentType']];n=a['count']*dim[a['type']]
        assert v['byteOffset']%4==0 and v['byteLength']>=n*np.dtype(dt).itemsize and v['byteOffset']+v['byteLength']<=len(buf)
        val=np.frombuffer(buf,dtype=dt,count=n,offset=v['byteOffset']+a.get('byteOffset',0)).reshape(a['count'],-1);assert np.isfinite(val).all()
        return val
    for i in range(len(j['accessors'])):read(i)
    tris=verts=draws=0;err=0;keys=[];tangerr=0
    for m in j['meshes']:
        keys+=m.get('extras',{}).get('targetNames',[])
        for p in m['primitives']:
            at=p['attributes'];v=read(at['POSITION']);w=read(at['WEIGHTS_0']);skin=read(at['JOINTS_0']);ix=read(p['indices'])
            assert ix.max()<len(v) and skin.max()<len(j['skins'][0]['joints'])
            assert np.all(w>=0);err=max(err,float(abs(w.sum(axis=1)-1).max()));verts+=len(v);tris+=len(ix)//3;draws+=1
            if 'TANGENT' in at:
                tg=read(at['TANGENT']);tangerr=max(tangerr,float(abs(np.linalg.norm(tg[:,:3],axis=1)-1).max()))
    assert err<1e-5 and all(len(read(j['skins'][0]['inverseBindMatrices']))==len(s['joints']) for s in j['skins'])
    clips=json.loads((REPORT/'animation_manifest.json').read_text())['clips'];info={}
    for a,d in zip(j['animations'],clips,strict=True):
        assert a['name']==d['name'];peaks=[]
        for q in a['channels']:
            sam=a['samplers'][q['sampler']];time=read(sam['input']).ravel();target=read(sam['output'])
            assert len(time)>1 and (np.diff(time)>0).all() and abs(float(time[-1])-d['seconds'])<1e-5
            target_count=len(j['meshes'][j['nodes'][q['target']['node']]['mesh']]['weights']) if q['target']['path']=='weights' else 1
            assert len(target)==len(time)*target_count
            if q['target']['path']=='rotation':assert abs(np.linalg.norm(target,axis=1)-1).max()<.0001
            if d['loop']:peaks.append(float(np.max(abs(target.reshape(len(time),-1)[0]-target.reshape(len(time),-1)[-1]))))
        one=json.loads((OUT/'animations'/(d['name']+'.gltf')).read_text());assert one['animations'][0]['name']==d['name'] and (OUT/'animations'/one['buffers'][0]['uri']).exists()
        info[d['name']]=dict(channels=len(a['channels']),loopMax=round(max(peaks,default=0),7))
    for im in j['images']:
        v=j['bufferViews'][im['bufferView']];assert buf[v['byteOffset']:v['byteOffset']+8]==b'\x89PNG\r\n\x1a\n'
    ds=dict(bytes=len(data),meshes=len(j['meshes']),primitives=draws,vertices=verts,triangles=tris,joints=len(j['skins'][0]['joints']),largestWeightError=err,largestTangentLengthError=tangerr,materials=len(j['materials']),embeddedImages=len(j['images']),morphs=list(dict.fromkeys(keys)),clips=info)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path))
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    ds['blenderReimport']={'armatures':len(rigs),'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),'actions':len(bpy.data.actions),'bones':len(rigs[0].data.bones) if rigs else 0}
    assert rigs and len(bpy.data.actions)>=len(clips);dump('gltf_checks.json',ds)
if __name__=='__main__':
    from check_contacts import build as contacts
    if '--contacts-only' in sys.argv:contacts();sys.exit(0)
    if '--inventory-only' in sys.argv:inventory();sys.exit(0)
    if '--gltf-only' not in sys.argv:inventory();native();contacts()
    if '--native-only' not in sys.argv:gltf_checks()

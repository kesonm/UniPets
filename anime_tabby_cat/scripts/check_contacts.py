"""Probe orbital occlusion and hair-card attachment against actual deformed surfaces."""
import json
import numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from core import *
from render_review import setclip
from face import EYES
def yup(v):
    v=np.asarray(v);return np.stack((v[...,0],v[...,2],-v[...,1]),axis=-1).round(8).tolist()
def build():
    load('cat_rigged.blend');col(FUR).hide_viewport=True;rig=bpy.data.objects['Mugi | feline rig'];s=bpy.context.scene;eyes={}
    for label,l,r in [('open',0,0),('left_half',.5,0),('left_wink',1,0),('closed',1,1)]:
        rig['blink_L']=float(l);rig['blink_R']=float(r);rig.update_tag();bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get();seen={}
        for side,ce in EYES.items():
            hits=0;total=0
            for v in np.linspace(-.87,.87,19):
                for u in np.linspace(-.87,.87,21):
                    if u*u+v*v>.80:continue
                    total+=1;y=ce[1]+.128*u;z=ce[2]+.100*v+.13*np.sign(ce[1])*.128*u
                    ok,pt,no,ix,ob,m=s.ray_cast(dg,Vector((y*UNIT,-1,z*UNIT)),Vector((0,1,0)))
                    hits+=int(ok and ob.name=='Eye.'+side)
            seen[side]=dict(visibleGlobeSamples=hits,tested=total)
        eyes[label]=seen
    load('cat_animated.blend');rig=bpy.data.objects['Mugi | feline rig'];col(FUR).hide_viewport=True;col(RT).hide_viewport=False
    cover=bpy.data.objects['RT | fur cards'];v=array(cover.data.vertices,'co',3);ids=np.linspace(0,len(v)//8-1,84,dtype=int)*8
    probes=(v[ids]+v[ids+1])*.5;trees={};triangles={};positions={};bind=[]
    for k in ['Coat.Body','Coat.Tail','Coat.Head','Coat.Ear.L','Coat.Ear.R']:
        mesh=bpy.data.objects[k].data;mesh.calc_loop_triangles();abc=array(mesh.loop_triangles,'vertices',3,np.int32);pos=array(mesh.vertices,'co',3)
        trees[k]=BVHTree.FromPolygons(pos.tolist(),abc.tolist(),all_triangles=True);triangles[k]=abc;positions[k]=pos
    for point in probes:
        dists=[(tree.find_nearest(Vector(point)),k) for k,tree in trees.items()];(near,n,ix,dist),k=min(dists,key=lambda e:e[0][3]);ii=triangles[k][ix]
        a,b,c=positions[k][ii];xy=np.linalg.lstsq(np.stack((b-a,c-a)).T,np.array(near)-a,rcond=None)[0]
        bind.append((k,ii,np.r_[1-xy.sum(),xy]))
    frames={};native={}
    for k,f in [('idle_stand',1),('idle_sit',14),('sleep',42),('walk',11),('trot',16),('lick_paw',41),('head_tilt',25),('shake_body',26)]:
        setclip(rig,k,f);dg=bpy.context.evaluated_depsgraph_get();skin={name:array(bpy.data.objects[name].evaluated_get(dg).data.vertices,'co',3) for name in trees}
        target=np.array([np.sum(skin[name][ii]*w[:,None],axis=0) for name,ii,w in bind]);cards=array(cover.evaluated_get(dg).data.vertices,'co',3)
        dist=np.linalg.norm((cards[ids]+cards[ids+1])*.5-target,axis=1)*1000
        frames[k]={'frame':f,'surface':yup(target)};native[k]={'p95Mm':float(np.quantile(dist,.95)),'maxMm':float(dist.max())}
    (REPORT/'contact_checks.json').write_text(json.dumps(dict(eyes=eyes,restCardEdges=yup(np.stack((v[ids],v[ids+1]),axis=1)),poses=frames,nativeCards=native),ensure_ascii=False,indent=2)+'\n')

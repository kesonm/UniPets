"""Shared coordinates, mesh construction and portable stage files. Blender 4.5 LTS."""
from pathlib import Path
import math, os
import bpy, bmesh
import numpy as np
from mathutils import Vector
PROJECT=Path(__file__).resolve().parents[1]
BLENDS=PROJECT/'blender'
TEX=PROJECT/'textures'
REF=PROJECT/'references'
RENDERS=PROJECT/'renders'
REPORT=PROJECT/'reports'
OUT=PROJECT/'exports'
UNIT=.104
# Sculpting coordinates are (anterior, anatomical left, height). The saved vertex data is in metres.
C=np.array([[0.,1.,0.],[-1.,0.,0.],[0.,0.,1.]])
def world(v):
    v=np.asarray(v,dtype=float);return np.stack((v[...,1],-v[...,0],v[...,2]),axis=-1)*UNIT
def local(v):
    v=np.asarray(v,dtype=float);return np.stack((-v[...,1],v[...,0],v[...,2]),axis=-1)/UNIT
def unit(v): return np.asarray(v)/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-12)
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)
def lin(c):
    c=np.clip(np.asarray(c),0,1)
    return np.where(c<.04045,c/12.92,((c+.055)/1.055)**2.4)
def array(items,prop,width,dtype=np.float32):
    result=np.empty(len(items)*width,dtype=dtype);items.foreach_get(prop,result)
    return result.reshape(-1,width)
def col(name):
    c=bpy.data.collections.get(name)
    if c is None:
        c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c)
    return c
SKIN='Cat | Anatomy';FUR='Cat | Groom';RT='Cat | Realtime coat';RIG='Cat | Controls';STUDIO='Studio';REFS='Reference plates'
def activate(obj):
    for o in list(bpy.context.selected_objects):o.select_set(False)
    obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj
class Builder:
    def __init__(self):self.v=[];self.f=[];self.weights=[];self.regions=[]
    def pt(self,pos,weights=None):
        self.v.append(tuple(pos));self.weights.append(weights or {})
        return len(self.v)-1
    def face(self,verts,region=0):self.f.append(tuple(verts));self.regions.append(region)
    def bridge(self,a,b,region=0):
        for j in range(len(a)):
            k=(j+1)%len(a);self.face((a[j],a[k],b[k],b[j]),region)
    def make(self,name,dest=SKIN,orient=True):
        me=bpy.data.meshes.new(name);me.from_pydata(world(self.v).tolist(),[],self.f);me.update()
        ob=bpy.data.objects.new(name,me);col(dest).objects.link(ob)
        if orient:
            bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        for p in me.polygons:p.use_smooth=True
        groups={}
        for i,w in enumerate(self.weights):
            total=sum(x for x in w.values() if x>1e-7)
            for key,x in w.items():
                if x<=1e-7:continue
                if key not in groups:groups[key]=ob.vertex_groups.new(name=key)
                groups[key].add([i],float(x/total),'REPLACE')
        return ob
def unwrap(obj,subdiv=0):
    activate(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(63),island_margin=.014,area_weight=.25)
    bpy.ops.object.mode_set(mode='OBJECT');obj.data.uv_layers.active.name='CoatUV'
    if subdiv:
        m=obj.modifiers.new('Surface smoothing','SUBSURF');m.levels=subdiv
        bpy.ops.object.modifier_apply(modifier=m.name)
    obj.add_rest_position_attribute=True
    return obj
def mat(name,rgb=(.5,.4,.32),rough=.65,metal=0):
    m=bpy.data.materials.get(name)
    if m:return m
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=bsdf(m);m.diffuse_color=(*lin(rgb),1);p.inputs['Base Color'].default_value=m.diffuse_color
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Specular IOR Level'].default_value=.23
    m['rt_color']=[float(v) for v in lin(rgb)];m['rt_roughness']=float(rough)
    return m
def bsdf(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
def textured(m,path):
    im=bpy.data.images.get(path.name) or bpy.data.images.load(str(path))
    im.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;tex.location=(-540,210)
    m.node_tree.links.new(tex.outputs['Color'],bsdf(m).inputs['Base Color']);m.node_tree.nodes.active=tex
    m['rt_base']=path.name;m['rt_color']=[1.,1.,1.]
    return tex
def normalized(w):
    w={k:v for k,v in w.items() if v>1e-8};total=sum(w.values())
    return {k:v/total for k,v in w.items()}
def save(path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    temporary=path.with_name('.'+path.stem+'.building.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(temporary),compress=True,relative_remap=False)
    os.replace(temporary,path)
    print('SAVED',path.name,flush=True)
def load(name):
    bpy.ops.wm.open_mainfile(filepath=str(BLENDS/name))
def ring_weights(t,names):
    t=float(np.clip(t,0,len(names)-1));i=min(int(t),len(names)-2);v=float(smooth(0,1,t-i))
    return {names[i]:1-v,names[i+1]:v}
def oval(name,center,radii,bone,material,segments=24,rings=13):
    b=Builder();prev=None
    for latitude in np.linspace(.02,math.pi-.02,rings):
        row=[b.pt(np.asarray(center)+np.asarray(radii)*[math.sin(latitude)*math.cos(a),math.sin(latitude)*math.sin(a),math.cos(latitude)],{bone:1}) for a in np.arange(segments)*math.tau/segments]
        if prev:b.bridge(prev,row)
        else:b.face(row[::-1])
        prev=row
    b.face(prev);o=b.make(name);o.data.materials.append(material);return o

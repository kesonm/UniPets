"""Attach the native representation of realtime tufts to the same posed surfaces as the groom.
glTF retains skin weights and samples this attachment for extreme-pose morph corrections.
"""
import numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from core import array,unit
SURFACES=['Coat.Body','Coat.Tail','Coat.Head','Coat.Ear.L','Coat.Ear.R']
def install(cards):
    if cards.get('triangle_bound_cards'):return
    from create_fur import deformation
    mesh=cards.data;xyz=array(mesh.vertices,'co',3);centers=(xyz[::8]+xyz[1::8])*.5;surfaces=[bpy.data.objects[k] for k in SURFACES]
    trees=[];coords=[];tri=[]
    for skin in surfaces:
        m=skin.data;m.calc_loop_triangles();pts=array(m.vertices,'co',3);abc=array(m.loop_triangles,'vertices',3,np.int32)
        trees.append(BVHTree.FromPolygons(pts.tolist(),abc.tolist(),all_triangles=True));coords.append(pts);tri.append(abc)
    attrs={k:[] for k in ('bind_vertices','bind_weights','bind_origin','bind_tangent','bind_normal')};region=[]
    for p in centers:
        nearest,i=min(((tree.find_nearest(Vector(p)),i) for i,tree in enumerate(trees)),key=lambda x:x[0][3])
        target,_,face,_=nearest;ids=tri[i][face];a,b,c=coords[i][ids]
        xy=np.linalg.lstsq(np.stack((b-a,c-a)).T,np.asarray(target)-a,rcond=None)[0]
        vals=[ids,np.r_[1-xy.sum(),xy],target,unit(b-a),unit(np.cross(b-a,c-a))]
        for key,value in zip(attrs,vals):attrs[key].append(value)
        region.append(i)
    for name,vals in attrs.items():
        mesh.attributes.new(name,'FLOAT_VECTOR','POINT').data.foreach_set('vector',np.repeat(np.asarray(vals,'f'),8,axis=0).ravel())
    mesh.attributes.new('card_surface','INT','POINT').data.foreach_set('value',np.repeat(np.asarray(region,'i'),8))
    ng=bpy.data.node_groups.new('Fur cards | five surface attachments','GeometryNodeTree')
    ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    def node(kind,x,y):
        n=ng.nodes.new(kind);n.location=(x,y);return n
    link=ng.links.new;inp=node('NodeGroupInput',-860,210);out=node('NodeGroupOutput',510,200)
    pos=node('GeometryNodeInputPosition',-560,-650);idx=node('GeometryNodeInputIndex',-560,-765)
    attr=node('GeometryNodeInputNamedAttribute',-290,-700);attr.data_type='INT';attr.inputs['Name'].default_value='card_surface'
    switch=node('GeometryNodeIndexSwitch',40,50);switch.data_type='VECTOR'
    while len(switch.index_switch_items)<len(surfaces):switch.index_switch_items.new()
    link(attr.outputs['Attribute'],switch.inputs['Index'])
    for i,skin in enumerate(surfaces):
        follow=node('GeometryNodeGroup',-590,430-200*i);follow.node_tree=deformation();follow.label=skin.name
        follow.inputs['Surface'].default_value=skin;link(inp.outputs[0],follow.inputs['Geometry'])
        sample=node('GeometryNodeSampleIndex',-265,410-i*202);sample.data_type='FLOAT_VECTOR';sample.domain='POINT'
        link(follow.outputs[0],sample.inputs['Geometry']);link(pos.outputs[0],sample.inputs['Value']);link(idx.outputs[0],sample.inputs['Index'])
        link(sample.outputs['Value'],switch.inputs[str(i)])
    setter=node('GeometryNodeSetPosition',265,200);link(inp.outputs[0],setter.inputs['Geometry']);link(switch.outputs[0],setter.inputs['Position']);link(setter.outputs[0],out.inputs[0])
    for mod in list(cards.modifiers):
        if mod.type=='ARMATURE':cards.modifiers.remove(mod)
    mod=cards.modifiers.new('Anchor tufts to skin','NODES');mod.node_group=ng;cards['triangle_bound_cards']=True

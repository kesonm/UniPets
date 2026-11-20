"""Articulated feline skeleton, four planted IK targets and animator handles."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import math
import bpy
import numpy as np
from mathutils import Matrix, Vector

import anatomy as body
import face
from core import *
import create_expressions


def edit_bone(data,name,head,tail,parent=None,deform=True):
    bone=data.edit_bones.new(name)
    bone.head=world(head)
    bone.tail=world(tail)
    bone.use_deform=deform
    if parent:
        bone.parent=data.edit_bones[parent]
        bone.use_connect=name.startswith(("Upper.","Lower.","Hock.","Paw.","Tail.")) and deform and (bone.parent.tail-bone.head).length<.00001
    return bone


def make_rig():
    data=bpy.data.armatures.new("Mugi | feline skeleton")
    rig=bpy.data.objects.new("Mugi | feline rig",data)
    col(RIG).objects.link(rig)
    activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bone(data,"Root",(0,0,.026),(.55,0,.026),deform=False)
    parents=dict(zip(body.RIG_SPINE,("Root","Pelvis","Spine","Chest","Neck","Head")))
    for name,(start,end) in body.RIG_SPINE.items():
        edit_bone(data,name,start,end,parents[name])
    for side,(start,end) in body.EAR.items():
        edit_bone(data,"Ear."+side,start,end,"Head")
    edit_bone(data,"Tongue",(2.09,0,2.282),(2.30,0,2.285),"Jaw")
    edit_bone(data,"Ribcage",(.39,0,1.76),(1.09,0,1.90),"Chest")
    for side,center in face.EYES.items():
        edit_bone(data,"Eye."+side,center,np.asarray(center)+[.18,0,0],"Head")
    for i,(start,end) in enumerate(zip(body.TAIL,body.TAIL[1:])):
        parent=f"Tail.{i:02d}" if i>0 else "Pelvis"
        edit_bone(data,f"Tail.{i+1:02d}",start,end,parent)

    for name,marks in body.LEGS.items():
        front=name.startswith("Fore")
        part="Chest" if front else "Pelvis"
        if front:
            edit_bone(data,"Scapula."+name,marks["scapula"],marks["upper"],part)
            part="Scapula."+name
        ankle=marks["ankle"]
        endpoint=ankle if front else marks["hock"]
        edit_bone(data,"Upper."+name,marks["upper"],marks["knee"],part)
        edit_bone(data,"Lower."+name,marks["knee"],endpoint,"Upper."+name)
        parent="Lower."+name
        if not front:
            edit_bone(data,"Hock."+name,endpoint,ankle,parent)
            parent="Hock."+name
        edit_bone(data,"Paw."+name,ankle,marks["toe"],parent)
        edit_bone(data,"FootIK."+name,ankle,marks["toe"],"Root",False)
        if not front:
            target=Vector(endpoint)
            edit_bone(data,"HockIK."+name,target,target+Vector((.21,0,0)),"FootIK."+name,False)
        start, stop=Vector(marks["upper"]),Vector(endpoint)
        axis=(stop-start).normalized()
        middle=Vector(marks["knee"])-start
        offset=(middle-axis*middle.dot(axis)).normalized()
        target=start+axis*middle.dot(axis)+1.60*offset
        edit_bone(data,"Pole."+name,target,target+Vector((.24,0,0)),"Root",False)
    bpy.ops.object.mode_set(mode='OBJECT')

    controls=data.collections.new("可编辑控制器")
    deform=data.collections.new("变形关节")
    solvers=data.collections.new("弯曲方向与后踝目标")
    control_names=set(body.RIG_SPINE) | {"Root","Tongue","Ribcage","Eye.L","Eye.R"}
    for bone in data.bones:
        label=bone.name
        if label.startswith(("Pole.","HockIK.")):
            solvers.assign(bone)
        elif label.startswith(("FootIK.","Tail.","Ear.","Scapula.")) or label in control_names:
            controls.assign(bone)
            bone.color.palette="THEME04" if label.endswith(".L") else "THEME03" if label.endswith(".R") else "THEME09"
        else:
            deform.assign(bone)
        rig.pose.bones[label].rotation_mode='QUATERNION'
    solvers.is_visible=False
    deform.is_visible=False
    rig.show_in_front=True
    rig.data.display_type='STICK'

    for name,marks in body.LEGS.items():
        front=name.startswith("Fore")
        chain=rig.pose.bones["Lower."+name]
        constraint=chain.constraints.new('IK')
        constraint.name="两段腿部逆向运动"
        constraint.target=rig
        constraint.subtarget=("FootIK." if front else "HockIK.")+name
        constraint.pole_target=rig
        constraint.pole_subtarget="Pole."+name
        constraint.chain_count=2
        constraint.iterations=72
        constraint.use_stretch=False
        constraint.use_rotation=False
        # Calibrate against the actual modeled elbow/knee before adding other constraints.
        reference=Vector(world(marks["knee"]))
        angle=0.0
        step=math.tau/16
        for iterations in (16,7,7):
            start=angle if iterations==16 else angle-3*step
            best=None
            for j in range(iterations):
                candidate=(start+j*step+math.pi)%math.tau-math.pi
                constraint.pole_angle=candidate
                bpy.context.view_layer.update()
                error=(chain.head-reference).length
                if best is None or error<best[0]:
                    best=(error,candidate)
            angle=best[1]
            step/=4
        constraint.pole_angle=angle
        if not front:
            constraint=rig.pose.bones["Hock."+name].constraints.new('DAMPED_TRACK')
            constraint.name="后踝对准爪掌"
            constraint.target=rig
            constraint.subtarget="FootIK."+name
            constraint.track_axis='TRACK_Y'
        foot=rig.pose.bones["Paw."+name].constraints.new('COPY_ROTATION')
        foot.name="脚掌朝向"
        foot.target=rig
        foot.subtarget="FootIK."+name
        foot.owner_space='POSE'
        foot.target_space='POSE'
    bpy.context.view_layer.update()
    print("IK REST ERROR",[(name,round((rig.pose.bones["Paw."+name].head-Vector(world(marks["ankle"]))).length,5)) for name,marks in body.LEGS.items()])
    return rig



def handles(rig):
    widgets=col('Control shapes');widgets.hide_render=True;widgets.hide_viewport=True
    def shape(name,verts,edges):
        me=bpy.data.meshes.new(name);me.from_pydata(verts,edges,[])
        ob=bpy.data.objects.new(name,me);widgets.objects.link(ob);return ob
    n=32
    loop=shape('Handle | orbit',[(math.cos(i*math.tau/n),0,math.sin(i*math.tau/n)) for i in range(n)],[(i,(i+1)%n) for i in range(n)])
    pts=[(-.64,0,-.28),(-.76,0,.39),(-.54,0,.73),(0,0,1.03),(.54,0,.73),(.76,0,.39),(.64,0,-.28),(0,0,-.48)]
    paw=shape('Handle | paw',pts,[(i,(i+1)%len(pts)) for i in range(len(pts))])
    for p in rig.pose.bones:
        if p.name.startswith('FootIK.'):
            p.custom_shape=paw;p.custom_shape_scale_xyz=(1.22,1.22,1.22);p.custom_shape_rotation_euler=(math.pi/2,0,0)
        elif p.name in ('Root','Pelvis','Chest','Head','Ribcage') or p.name.startswith(('Eye.','Ear.','Tail.')):
            p.custom_shape=loop;p.custom_shape_scale_xyz=(.52,.52,.52) if not p.name.startswith('Tail.') else (.46,.46,.46)
            if p.name=='Root':p.custom_shape_rotation_euler=(math.pi/2,0,0);p.custom_shape_scale_xyz=(2.5,2.5,2.5)

def chest_weights(o):
    chest=o.vertex_groups.get('Chest')
    if not chest:return
    ribs=o.vertex_groups.new(name='Ribcage')
    for v in o.data.vertices:
        wt=next((g.weight for g in v.groups if g.group==chest.index),0)
        if wt<.0001:continue
        a,b,h=local(v.co);fac=.81*float(smooth(.95,1.5,h))*(1-.43*float(smooth(1.88,2.48,h)))
        if fac>.001:
            ribs.add([v.index],wt*fac,'REPLACE');chest.add([v.index],wt*(1-fac),'REPLACE')

def build():
    dest=BLENDS/'cat_rigged.blend'
    if dest.exists() and '--rebuild' not in sys.argv:return
    load('cat_master.blend')
    if not bpy.context.scene.get('groom_built'):raise ValueError('Run create_fur.py first')
    groom=col(FUR);groom.hide_viewport=True
    rig=make_rig()
    for c in (col(SKIN),col(RT),groom):
        for ob in c.objects:
            ob.parent=rig
            if ob.type=='MESH':
                if ob.name in ('Coat.Body','RT | fur cards'):chest_weights(ob)
                unknown=[vg.name for vg in ob.vertex_groups if vg.name not in rig.pose.bones]
                if unknown:raise ValueError((ob.name,unknown))
                if ob.get('triangle_bound_cards'):continue
                m=ob.modifiers.new('Feline skin | volume preserving','ARMATURE');m.object=rig;m.use_deform_preserve_volume=True
    handles(rig);create_expressions.install(rig);groom.hide_viewport=False
    activate(rig);save(dest)
if __name__=='__main__':build()

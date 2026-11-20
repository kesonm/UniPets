"""Construct the model from the two packaged model sheets. Run inside Blender."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np
from core import *
import anatomy,face,coat,studio

def feet():
    tipmat=mat('Toes | pale mushroom',(.802,.721,.641),.85);pad=mat('Pads | rosewood',(.39,.272,.264),.72)
    for name,marks in anatomy.LEGS.items():
        x,y,_=marks['ankle'];bone='Paw.'+name
        oval('Pad.'+name,(x+.075,y,.027),(.094,.077,.022),bone,pad,18,10)
        for digit in range(4):
            dy=(digit-1.5)*.064
            oval(f'Digit.{name}.{digit}',(x+.231-abs(dy)*.46,y+dy,.075),(.091,.043,.069),bone,tipmat,18,10)
            oval(f'ToePad.{name}.{digit}',(x+.224-abs(dy)*.40,y+dy,.028),(.043,.027,.018),bone,pad,14,8)
def reference():
    for name in ['standing','sitting']:
        path=REF/f'cat_{name}_views.png'
        im=bpy.data.images.get(path.name) or bpy.data.images.load(str(path));im.pack()
        ob=bpy.data.objects.new('Sheet | '+name,None);col(REFS).objects.link(ob);ob.empty_display_type='IMAGE';ob.data=im
        ob.empty_display_size=.8;ob.location=(-.8 if name=='standing' else .8,.55,.25);ob.rotation_euler=(math.pi/2,0,0)
        ob.hide_render=True;ob.hide_set(True)
    col(REFS).hide_render=True
def build():
    if (BLENDS/'cat_master.blend').exists() and '--rebuild' not in sys.argv:
        print('Using existing cat_master.blend');return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    skin=anatomy.bodymesh();tail=anatomy.tailmesh();skull=face.head();ears=[face.ears(side) for side in ['L','R']]
    for Side in ['L','R']:face.eyes(Side)
    face.nose();face.mouth();face.muzzle_lines();feet();reference()
    pal=coat.Palette()
    for ob,kind,size in [(skin,'Body',1536),(tail,'Tail',768),(skull,'Head',1024)]+[(ob,'Ear',512) for ob in ears]:
        ob['coat_region']=kind;coat.atlas(ob,pal,kind,size)
    coat.iris();studio.setup();activate(skin)
    # The control cage, weights and editable shapes are preserved in the model stage.
    bpy.context.scene['oral_clearance_v2']=True;bpy.context.scene['forward']='-Y';bpy.context.scene['physical_unit']='metre';bpy.context.scene['character']='Mugi · 麦穗'
    save(BLENDS/'cat_master.blend')
    if '--draft' in sys.argv:
        for view in ('front','left','front_45','back'):
            studio.cameraset(view);studio.shot(RENDERS/('model_'+view+'.png'),640,450,6)
if __name__=='__main__':build()

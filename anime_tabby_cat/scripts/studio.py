import math,bpy
from mathutils import Vector
from core import *
DIRECTIONS={'front':(0,-1,.033),'left':(1,0,.038),'right':(-1,0,.038),'back':(0,1,.033),
            'front_45':(1,-1,.13),'rear_45':(-1,1,.13),'hero':(.56,-1,.105)}
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def cameraset(label,center=(.045,.036,.186),width=.705):
    s=bpy.context.scene;cam=bpy.data.objects['Camera | character'];s.camera=cam
    d=Vector(DIRECTIONS[label]);cam.location=Vector(center)+d.normalized()*7.5;aim(cam,center);cam.data.ortho_scale=width
    return cam
def setup():
    s=bpy.context.scene;s.name='Mugi | character';s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=36;s.cycles.use_denoising=True
    s.cycles.max_bounces=5;s.cycles.diffuse_bounces=3;s.render.fps=24;s.render.threads_mode='FIXED';s.render.threads=8
    s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
    s.render.resolution_x=1240;s.render.resolution_y=880;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
    s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
    s.view_settings.exposure=.08
    w=bpy.data.worlds.new('Softbox environment');w.use_nodes=True;s.world=w
    bg=next(n for n in w.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.81,.84,.90,1);bg.inputs[1].default_value=.36
    b=Builder()
    for p in [(-140,-140,.005),(140,-140,.005),(140,140,.005),(-140,140,.005)]:b.pt(p)
    b.face((0,1,2,3));ground=b.make('Cyclorama',STUDIO);ground.data.materials.append(mat('Studio | warm limestone',(.61,.607,.57),.87))
    def light(name,xyz,power,size,color):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        o=bpy.data.objects.new(name,data);col(STUDIO).objects.link(o);o.location=xyz;aim(o,(0,-.01,.185))
    light('Key | linen diffusion',(.34,-.50,.75),8.1,.50,(1,.953,.899))
    light('Fill | window',(-.44,-.34,.50),4.9,.48,(.865,.93,1))
    light('Rim | afternoon',(.10,.44,.58),7.0,.38,(1,.93,.82))
    light('Eye light',(-.08,-.55,.33),.95,.22,(1,1,1))
    ce=bpy.data.cameras.new('Character portrait');ce.type='ORTHO';ce.clip_start=.008
    cam=bpy.data.objects.new('Camera | character',ce);col(STUDIO).objects.link(cam);cameraset('front_45')
    for ws in bpy.data.workspaces:
        for screen in ws.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    v=area.spaces.active;v.clip_start=.001;v.clip_end=50;v.region_3d.view_rotation=cam.matrix_world.to_quaternion()
                    v.region_3d.view_location=(0,.015,.18);v.region_3d.view_distance=.84
                    v.region_3d.view_perspective='CAMERA';v.region_3d.view_camera_zoom=14
                    v.overlay.show_overlays=False;v.shading.type='MATERIAL'
                    v.shading.use_scene_lights=True;v.shading.use_scene_world=True
def shot(path,w=840,h=596,samples=10):
    s=bpy.context.scene;s.render.resolution_x=w;s.render.resolution_y=h;s.render.resolution_percentage=100;s.cycles.samples=samples
    s.render.filepath=str(path);bpy.ops.render.render(write_still=True)

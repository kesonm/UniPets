"""A complete native NLA playback, preceded by a groomed 360-degree turntable."""
import sys,tempfile,subprocess,shutil,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
import studio
from render_review import fit
def build():
    load('cat_animated.blend');sc=bpy.context.scene;sc.frame_set(1);cam=fit('hero')
    center=Vector((.046,.022,.188));width=.720;sc.render.resolution_x=624;sc.render.resolution_y=440
    sc.render.resolution_percentage=100;sc.render.threads=7;sc.render.use_persistent_data=True;sc.cycles.samples=4;sc.cycles.use_denoising=True;sc.cycles.use_animated_seed=False
    sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB'
    if not shutil.which('ffmpeg'):raise RuntimeError('ffmpeg must be on PATH')
    with tempfile.TemporaryDirectory(prefix='mugi-playback-') as path:
        idx=0
        def capture():
            nonlocal idx
            sc.render.filepath=str(Path(path)/f'{idx:04}.png');bpy.ops.render.render(write_still=True);idx+=1
        for frame in range(42):
            angle=.51+math.tau*frame/42
            cam.location=center+Vector((math.sin(angle),-math.cos(angle),.109)).normalized()*7.5
            studio.aim(cam,center);cam.data.ortho_scale=width;capture()
        fit('hero')
        for frame in range(1,sc.frame_end+1,2):
            sc.frame_set(frame);capture()
        temp=RENDERS/('.motion_preview.'+str(os.getpid())+'.encoding.mp4')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','12','-i',str(Path(path)/'%04d.png'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(temp)],check=True)
        temp.replace(RENDERS/'motion_preview.mp4');print('VIDEO',idx,'frames at 12 fps',flush=True)
if __name__=='__main__':build()

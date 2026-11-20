"""Native six-view turntable, expression close-ups and rooted state coverage."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
import studio
def setclip(rig,name,f):
    ad=rig.animation_data
    for tr in ad.nla_tracks:tr.mute=True
    ad.action=bpy.data.actions[name];ad.action_slot=ad.action.slots[0];bpy.context.scene.frame_set(f)
def fit(view,pose='idle_stand'):
    cam=studio.cameraset(view);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    os=[bpy.data.objects[name].evaluated_get(dg) for name in ('Coat.Body','Coat.Head','Coat.Tail','Coat.Ear.L','Coat.Ear.R')]
    pts=np.concatenate([array(o.data.vertices,'co',3) for o in os]);rot=cam.rotation_euler.to_matrix()
    sx=np.asarray(rot.col[0]);sy=np.asarray(rot.col[1]);front=np.asarray(rot.col[2])
    pp=np.stack((np.einsum("ij,j->i",pts,sx),np.einsum("ij,j->i",pts,sy)),axis=1);lo=pp.min(axis=0)-[.019,.004];hi=pp.max(axis=0)+[.019,.013]
    center=sx*(hi[0]+lo[0])/2+sy*(hi[1]+lo[1])/2+front*float(np.mean(np.einsum("ij,j->i",pts,front)))
    width=max((hi[0]-lo[0])*1.14,(hi[1]-lo[1])*1.16*1.42)
    return studio.cameraset(view,center,width)
def render(draft):
    load('cat_animated.blend');rig=bpy.data.objects['Mugi | feline rig']
    if draft:
        plans=[('idle_sit',1,'left'),('idle_sit',1,'front_45'),('sleep',1,'left'),('yawn',38,'front_45'),('lick_paw',45,'left'),('stretch',45,'left'),('jump',23,'left')]
        for k,f,v in plans:
            setclip(rig,k,f);fit(v,k);studio.shot(Path('/private/tmp')/f'mugi_pose_{k}_{v}.png',550,388,5)
        return
    for v in studio.DIRECTIONS:
        setclip(rig,'idle_stand',1);fit(v);studio.shot(RENDERS/(v+'.png'),1120,790,26)
    for v in ['front','left','back']:
        setclip(rig,'idle_sit',1);fit(v);studio.shot(RENDERS/('sitting_'+v+'.png'),900,635,18)
    for k,f,v in [('sleep',32,'front_45'),('lick_paw',44,'front_45'),('jump',22,'left'),('stretch',46,'left')]:
        setclip(rig,k,f);fit(v,k);studio.shot(RENDERS/(k+'.png'),830,585,16)
    setclip(rig,'idle_stand',1);cam=studio.cameraset('front',(0,-.183,.281),.235)
    studio.shot(RENDERS/'face.png',900,730,38)
    for k,f in [('yawn',40),('head_tilt',26)]:
        setclip(rig,k,f);h=rig.pose.bones['Head'].head;studio.cameraset('front',(h.x,h.y,h.z+.011),.238)
        studio.shot(RENDERS/('face_'+k+'.png'),760,610,20)
if __name__=='__main__':render('--draft' in sys.argv)

"""Bake portable pose-space offsets for the volume lost with four-weight linear skinning."""
import numpy as np
from core import *
SAMPLES=[('Seat volume','idle_sit',1),('Folded elbow volume','idle_lie',1),
         ('Raised paw volume','lick_paw',41),('Shoulder turn volume','groom_chest',41)]
def weights(name,t):
    def ease(x):
        a=min(1.,max(0.,x));return a*a*(3-2*a)
    sit=1. if name=='idle_sit' else 0.;lie=1. if name in ('idle_lie','fall_asleep','sleep','wake_up') else 0.
    if name=='stand_to_sit':sit=ease(t)
    if name=='sit_to_stand':sit=ease(1-t)
    if name=='stand_to_lie':lie=ease(t)
    if name=='lie_to_stand':lie=ease(1-t)
    groom=(ease(t/.24)*ease((1-t)/.23))**2
    return [sit**2,lie**2,groom if name=='lick_paw' else 0.,groom if name=='groom_chest' else 0.]
def capture(rig,bones,joints):
    from render_review import setclip
    objs=[bpy.data.objects[name] for name in ('Coat.Body','RT | fur cards')]
    rest={};deltas={o.name:[] for o in objs};old=col(RT).hide_viewport;col(RT).hide_viewport=False
    for o in objs:
        p=array(o.data.vertices,'co',3);ids=np.zeros((len(p),4),int);w=np.zeros((len(p),4))
        lookup={g.index:joints[g.name] for g in o.vertex_groups}
        for v in o.data.vertices:
            parts=sorted([(group.weight,lookup[group.group]) for group in v.groups if group.weight>1e-8],reverse=True)[:4]
            total=sum(x for x,i in parts)
            for n,(x,i) in enumerate(parts):ids[v.index,n]=i;w[v.index,n]=x/total
        rest[o.name]=p,ids,w
    for label,name,frame in SAMPLES:
        setclip(rig,name,frame);dg=bpy.context.evaluated_depsgraph_get();ev=rig.evaluated_get(dg)
        transforms=np.array([np.array(ev.pose.bones[b.name].matrix@b.matrix_local.inverted()) for b in bones])
        for o in objs:
            p,ids,w=rest[o.name];m=np.einsum('ij,ijkl->ikl',w,transforms[ids]);a=m[:,:3,:3]
            linear=np.einsum('ijk,ik->ij',a,p)+m[:,:3,3]
            target=array(o.evaluated_get(dg).data.vertices,'co',3)
            delta=np.einsum('ijk,ik->ij',np.linalg.pinv(a,rcond=.025),target-linear)
            delta*=np.minimum(1.,.045/np.maximum(1e-10,np.linalg.norm(delta,axis=1)))[:,None]
            deltas[o.name].append(delta.astype('f'))
    col(RT).hide_viewport=old
    return deltas

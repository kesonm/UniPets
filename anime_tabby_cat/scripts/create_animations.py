"""Author local-space FK, four independent IK contacts and facial performance clips at 24 fps."""
import math,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
import anatomy
from create_expressions import SLIDERS
from mathutils import Quaternion,Matrix
TAU=math.tau;FPS=24;AX=[Vector(world(v)/UNIT) for v in np.eye(3)]
LEGS=anatomy.LEGS
WALK_PHASE={'Hind.R':.03,'Fore.R':.21,'Hind.L':.53,'Fore.L':.71}
TROT_PHASE={'Hind.R':.05,'Fore.L':.07,'Hind.L':.55,'Fore.R':.57}
def clamp(x):return min(1.,max(0.,x))
def ease(x):
    t=clamp(x);return t*t*(3-2*t)
def envelope(x,a=.22,b=.22):return ease(x/a)*ease((1-x)/b)
def pulse(t,center,width):return 1-ease(abs(t-center)/width)
def breath(t):return .5-.5*math.cos(TAU*t)
class Cat:
    def __init__(self,rig):
        self.rig=rig;self.pb=rig.pose.bones
        self.controls=[b for b in self.pb if not b.name.startswith(('Upper.','Lower.','Hock.','Paw.'))]
        self.ori={b.name:b.bone.matrix_local.to_3x3().inverted() for b in self.controls}
    def reset(self):
        for b in self.controls:
            b.location=(0,0,0);b.rotation_quaternion=(1,0,0,0);b.scale=(1,1,1)
        for k in SLIDERS:self.rig[k]=0.
    def pos(self,k,x=0,y=0,z=0):self.pb[k].location=self.ori[k]@Vector(world((x,y,z)))
    def rot(self,k,roll=0,pitch=0,yaw=0):
        o=self.ori[k];self.pb[k].rotation_quaternion=Quaternion(o@AX[2],yaw)@Quaternion(o@AX[1],pitch)@Quaternion(o@AX[0],roll)
    def blink(self,v,left=None):
        self.rig['blink_R']=clamp(v);self.rig['blink_L']=clamp(v if left is None else left)
    def air(self,t,amp=1):
        v=breath(t)*amp;self.pb['Ribcage'].scale=(1+.024*v,1+.006*v,1+.034*v);self.pos('Neck',.002*v,0,.009*v)
    def gaze(self,yaw,pitch=0):
        for side in 'LR':self.rot('Eye.'+side,pitch=pitch,yaw=yaw)
    def wag(self,t,strength=1):
        for i in range(1,9):
            lag=(i-1)*.39;v=(math.sin(TAU*t-lag)-math.sin(-lag))*(.03+.0038*i)*strength
            self.rot(f'Tail.{i:02}',pitch=.27*v,yaw=v)
    def hock(self,name,angle,paw=0):
        marks=LEGS[name];d=Vector(np.subtract(marks['hock'],marks['ankle']))
        self.pos('HockIK.'+name,*(Quaternion(Vector((0,1,0)),angle-paw)@d-d))
    def fk(self,k):
        b=self.pb[k];rest=b.bone.matrix_local
        if b.parent:return self.fk(b.parent.name)@b.parent.bone.matrix_local.inverted()@rest@b.matrix_basis
        return rest@b.matrix_basis
    def folded_tail(self,t,kind):
        if t<1e-7:return
        pr=self.pb['Pelvis'];parent=self.fk('Pelvis');rest=pr.bone.matrix_local
        axis=np.array(anatomy.TAIL);segs=np.diff(axis,axis=0)
        desired_z=([.50,.36,.265,.235,.233,.23,.23,.24] if kind=='sit' else [.76,.54,.34,.245,.231,.228,.23,.25])
        prev_z=.745 if kind=='sit' else 1.086
        dirs=[(-.85,.46),(-.71,.78),(-.29,.97),(.22,1),(.78,.63),(1,.19),(.90,-.39),(.68,-.72)]
        for i,(dz,horiz) in enumerate(zip(desired_z,dirs)):
            b=self.pb[f'Tail.{i+1:02}'];base=parent@rest.inverted()@b.bone.matrix_local
            baseq=base.to_quaternion();length=np.linalg.norm(segs[i]);height=np.clip((dz-prev_z)/length,-.91,.91);prev_z+=height*length
            direction=np.r_[unit(horiz)*math.sqrt(1-height*height),height]
            target=Vector(world(direction)/UNIT);standing=Vector(world(unit(segs[i]))/UNIT)
            target=standing.slerp(target,t);forward=baseq@Vector((0,1,0))
            b.rotation_quaternion=baseq.inverted()@forward.rotation_difference(target)@baseq
            parent=base@b.matrix_basis;rest=b.bone.matrix_local
    def settle(self,t,kind,head=None):
        h=t if head is None else head
        if kind=='sit':
            self.pos('Pelvis',.47*t,0,-1.120*t);self.rot('Pelvis',pitch=-.80*t)
            self.rot('Spine',pitch=.22*t);self.rot('Chest',pitch=.17*t);self.rot('Neck',pitch=.13*h);self.rot('Head',pitch=.28*h)
            for side in 'LR':
                self.pos('Scapula.Fore.'+side,0,0,-.155*t);self.rot('Scapula.Fore.'+side,pitch=.18*t)
        else:
            self.pos('Pelvis',-.105*t,0,-.955*t);self.rot('Pelvis',pitch=-.038*t);self.rot('Spine',pitch=.035*t);self.rot('Chest',pitch=.098*t)
            self.pos('Neck',-.04*h,0,-.144*h);self.rot('Neck',pitch=.77*h,yaw=-.13*h);self.rot('Head',pitch=-.45*h,yaw=-.17*h,roll=.028*h)
        for name in LEGS:
            front=name.startswith('Fore');sg=1 if name.endswith('L') else -1
            begin={'Fore.L':.12,'Fore.R':.28,'Hind.L':.01,'Hind.R':.18}[name]
            f=clamp((t-begin)/.63);step=ease(f);lift=math.sin(math.pi*f)**1.6
            off=(-.025 if front else 1.15) if kind=='sit' else ((.45 if sg<0 else .39) if front else .31)
            self.pos('FootIK.'+name,off*step,sg*(.06 if front else .085)*step,(.045 if kind=='sit' and front else .11)*lift)
            if not front:self.hock(name,(-1.14 if kind=='sit' else -1.10)*t)
        self.folded_tail(t,kind)
        for side,sg in [('L',1),('R',-1)]:self.rot('Ear.'+side,roll=-.046*sg*h,pitch=-.035*h)
    def pose(self,name,t):
        self.reset();q=breath(t);w=math.sin(TAU*t);a=envelope(t)
        if name in ('idle_sit','idle_lie','sleep'):
            posture='sit' if name=='idle_sit' else 'lie';self.settle(1,posture)
            self.pb['Ribcage'].scale=(1+.023*q,1+.006*q,1+.034*q)
            if name=='sleep':self.blink(1)
            else:self.blink(.95*pulse(t,.64,.061))
            return
        if name in ('stand_to_sit','sit_to_stand','stand_to_lie','lie_to_stand','fall_asleep','wake_up'):
            if name in ('fall_asleep','wake_up'):
                self.settle(1,'lie');self.blink(ease(t) if name=='fall_asleep' else 1-ease(t))
            else:
                kind='sit' if 'sit' in name else 'lie';f=t if name.startswith('stand_to') else 1-t
                self.settle(ease(f),kind,ease((f-.13)/.87))
            return
        if name in ('walk','trot'):return self.gait(t,name=='trot')
        if name in ('lick_paw','groom_chest'):return self.groom(t,name=='lick_paw')
        if name=='jump':return self.jump(t)
        self.air(t,.72 if name!='breathe' else 1)
        if name=='idle_stand':
            self.wag(t,.34);self.blink(.98*pulse(t,.605,.052));self.rot('Ear.R',yaw=.052*pulse(t,.79,.12))
        elif name=='tail_sway':self.wag(t,1.3)
        elif name=='look_around':
            gaze=math.sin(TAU*t)*a;lead=math.sin(TAU*t+.38)*a
            self.rot('Neck',yaw=.24*gaze);self.rot('Head',pitch=-.094*math.sin(TAU*t*2)*a,yaw=.43*gaze)
            self.gaze(.23*lead,-.075*a);self.rot('Ear.L',yaw=.23*lead);self.rot('Ear.R',yaw=.15*gaze)
            self.rig['brow_L']=.32*a;self.blink(.60*pulse(t,.50,.045))
        elif name=='head_tilt':
            v=envelope(t,.35,.38);self.rot('Neck',roll=.09*v,yaw=.15*v);self.rot('Head',roll=.365*v,pitch=-.10*v)
            self.rot('Ear.L',roll=-.12*v,yaw=.20*v);self.rot('Ear.R',yaw=-.12*v);self.gaze(-.10*v);self.rig['brow_R']=.58*v
        elif name=='yawn':
            v=ease(t/.40)*ease((1-t)/.30);peak=v*(.83+.17*q)
            self.rot('Neck',pitch=-.12*v);self.rot('Head',pitch=-.20*v)
            self.rot('Jaw',pitch=.72*peak);self.pos('Tongue',.14*peak,0,-.015*v);self.rot('Tongue',pitch=-.22*v)
            self.blink(.89*v);self.rig['smile']=.40*v;self.rot('Ear.L',roll=-.13*v);self.rot('Ear.R',roll=.13*v)
        elif name=='shake_body':
            osc=lambda lag: a*math.sin(t*TAU*3.25-lag)
            self.pos('Pelvis',0,.035*osc(1.05),-.055*a);self.rot('Pelvis',roll=.10*osc(.94))
            self.rot('Spine',roll=.16*osc(.70),yaw=.048*osc(.64));self.rot('Chest',roll=.20*osc(.45),yaw=.05*osc(.4))
            self.rot('Neck',roll=.12*osc(.15));self.rot('Head',roll=.22*osc(0),yaw=.10*osc(.1))
            self.rot('Ear.L',roll=.23*osc(.60));self.rot('Ear.R',roll=.24*osc(.68));self.blink(.70*a)
            for i in range(1,9):self.rot(f'Tail.{i:02}',yaw=.06*osc(.80+i*.23))
        elif name=='stretch':
            v=ease(t/.45)*ease((1-t)/.37);self.pos('Pelvis',-.14*v,0,-.10*v);self.rot('Pelvis',pitch=.16*v)
            self.rot('Spine',pitch=.14*v);self.rot('Chest',pitch=.13*v);self.rot('Neck',pitch=-.05*v);self.rot('Head',pitch=-.25*v)
            for i,side in enumerate('LR'):
                phase=clamp((t-.035*i)/.32);out=ease(phase);end=clamp((t-.69-.04*i)/(.26-.015*i));back=ease(end)
                self.pos('FootIK.Fore.'+side,.66*(out-back),0,.105*(math.sin(math.pi*phase)**2+math.sin(math.pi*end)**2))
            self.blink(.58*v);self.rig['smile']=.46*v
            for i in range(1,9):self.rot(f'Tail.{i:02}',pitch=-.025*v,yaw=.075*v*math.cos(i*.46))
        elif name=='ear_twitch':
            l=pulse(t,.36,.13)-.50*pulse(t,.51,.095);r=pulse(t,.70,.14)
            self.rot('Ear.L',yaw=.55*l,roll=-.14*l);self.rot('Ear.R',yaw=-.41*r,roll=.12*r)
    def gait(self,t,trot):
        phase=TROT_PHASE if trot else WALK_PHASE;stride=1.30 if trot else 1.00;stance=.52 if trot else .64;w=TAU*t
        self.pos('Pelvis',0,.029*math.sin(w),-.14+(.056 if trot else .031)*math.cos(2*w))
        self.rot('Pelvis',roll=.041*math.sin(w),yaw=.035*math.sin(w+.5));self.rot('Chest',roll=-.041*math.sin(w),pitch=.034*math.sin(2*w))
        self.rot('Neck',pitch=.041*math.sin(2*w-.3));self.rot('Head',pitch=.029*math.cos(2*w))
        for name,lag in phase.items():
            s=(t+stance-lag)%1
            if s<stance:dx=stride*(stance*.5-s);h=pi=0
            else:
                u=(s-stance)/(1-stance);dx=-stride*stance*.5+stride*ease(u)-stride*(1-stance)*u
                h=(.34 if trot else .215)*math.sin(math.pi*u)**1.5;pi=.18*math.sin(TAU*u)*math.sin(math.pi*u)
            self.pos('FootIK.'+name,dx,0,h);self.rot('FootIK.'+name,pitch=pi)
            if name.startswith('Hind'):self.hock(name,-.11-.72*h,pi)
        for i in range(1,9):self.rot(f'Tail.{i:02}',yaw=.037*math.sin(w-i*.38),pitch=.018*math.sin(2*w-i*.35))
    def groom(self,t,paw):
        a=envelope(t,.24,.23);v=breath(clamp((t-.19)/.63)*3)
        self.pos('Pelvis',-.095*a,.077*a,-.235*a);self.rot('Chest',pitch=.078*a)
        self.rot('Neck',pitch=(.63 if paw else .60)*a,yaw=(-.36 if paw else -1.06)*a)
        self.rot('Head',pitch=(.51+.13*v if paw else .74+.09*v)*a,yaw=(-.22 if paw else -.93)*a)
        self.rot('Jaw',pitch=(.13+.26*v)*a);self.pos('Tongue',(.075+.20*v)*a,0,-.012*a);self.rot('Tongue',pitch=(.08+.18*v)*a)
        self.blink((.18+.35*v)*a)
        if not paw:self.pos('Neck',(-.114-.115*v)*a,.016*v*a,.025*a)
        if paw:
            self.rot('FootIK.Fore.R',pitch=-.47*a,roll=-.14*a)
            tb=self.pb['Tongue'];tip=self.fk('Tongue')@tb.bone.matrix_local.inverted()@Vector(world((2.30,0,2.285)))
            off=local(tip)-[.21,-.012,.09+.054*(1-v)]-LEGS['Fore.R']['ankle']
            self.pos('FootIK.Fore.R',*tuple(off*a))
    def jump(self,t):
        prep=ease(t/.20)*(1-ease((t-.20)/.14));land=ease((t-.65)/.10)*(1-ease((t-.75)/.25))
        v=clamp((t-.27)/.42);arch=4*v*(1-v);self.pos('Pelvis',-.08*prep,0,.87*arch-.32*prep-.31*land)
        self.rot('Spine',pitch=-.09*prep+.06*land);self.rot('Chest',pitch=-.16*math.sin(TAU*v)-.07*prep)
        for name in LEGS:
            fore=name.startswith('Fore');lo,hi=(.22,.675) if fore else (.28,.72);w=clamp((t-lo)/(hi-lo));lift=4*w*(1-w)
            self.pos('FootIK.'+name,(.18 if fore else -.16)*lift,0,(1.08 if fore else .95)*lift)
            self.rot('FootIK.'+name,pitch=(-.19 if fore else .35)*lift)
            if not fore:self.hock(name,-.35*lift)
        for i in range(1,9):self.rot(f'Tail.{i:02}',pitch=(.08 if i<4 else .035)*(prep+land)+.035*math.sin(TAU*v)*arch)
# name, Chinese label, frame intervals, source and destination state, loop
PLANS=[
 ('idle_stand','站立待机',96,'stand','stand',1),('idle_sit','坐姿待机',96,'sit','sit',1),('idle_lie','趴卧待机',96,'lie','lie',1),
 ('breathe','站立呼吸',72,'stand','stand',1),('look_around','左右观察',96,'stand','stand',0),('head_tilt','歪头',48,'stand','stand',0),
 ('stretch','伸懒腰',96,'stand','stand',0),('yawn','打哈欠',72,'stand','stand',0),('shake_body','抖毛',48,'stand','stand',0),
 ('walk','四拍步行',32,'stand','stand',1),('trot','对角小跑',22,'stand','stand',1),('tail_sway','轻摆尾',72,'stand','stand',1),('ear_twitch','双耳听声',48,'stand','stand',0),
 ('stand_to_sit','坐下',46,'stand','sit',0),('sit_to_stand','从坐姿站起',40,'sit','stand',0),
 ('stand_to_lie','屈腿趴下',53,'stand','lie',0),('lie_to_stand','从卧姿起身',49,'lie','stand',0),
 ('fall_asleep','合眼入睡',32,'lie','sleep',0),('sleep','趴睡呼吸',80,'sleep','sleep',1),('wake_up','睁眼醒来',32,'sleep','lie',0),
 ('lick_paw','舔右前爪',80,'stand','stand',0),('groom_chest','舔胸侧毛',80,'stand','stand',0),('jump','原地跃起落地',42,'stand','stand',0)]
def author(rig,cat,desc):
    name,label,span,src,dst,loop=desc;ac=bpy.data.actions.new(name);ac.use_fake_user=True;ac.slots.new('OBJECT',rig.name)
    ac.use_frame_range=True;ac.frame_start=1;ac.frame_end=1+span;ac['source_state']=src;ac['destination_state']=dst
    ac['loop']=bool(loop);ac['title_zh']=label;ac.asset_mark();ac.asset_data.description=label
    step=1 if name in ('walk','trot','jump','shake_body','lick_paw','groom_chest') else 2
    frames=sorted(set(range(0,span+1,step))|{span});data={};prev={}
    def append(path,group,vals):data.setdefault((path,group),[]).append(tuple(vals))
    for f in frames:
        cat.pose(name,f/span)
        for b in cat.controls:
            q=b.rotation_quaternion.copy()
            if b.name in prev and prev[b.name].dot(q)<0:q.negate()
            prev[b.name]=q;path=b.path_from_id()
            for prop,value in [('location',b.location),('rotation_quaternion',q),('scale',b.scale)]:append(path+'.'+prop,b.name,value)
        for k in SLIDERS:append('["'+k+'"]','Face controls',[rig[k]])
    for (path,group),samples in data.items():
        values=np.array(samples)
        for i,y in enumerate(values.T):
            const=float(np.ptp(y))<1e-7;xx=[frames[0]+1,frames[-1]+1] if const else np.array(frames)+1
            yy=[y[0],y[-1]] if const else y
            fc=ac.fcurves.new(path,index=i,action_group=group);pts=fc.keyframe_points;pts.add(len(xx))
            pts.foreach_set('co',np.column_stack((xx,yy)).astype('f').ravel())
            for pt in pts:pt.interpolation='LINEAR'
            fc.update()
    return ac
def build():
    dest=BLENDS/'cat_animated.blend'
    if dest.exists() and '--rebuild' not in sys.argv:return
    load('cat_rigged.blend');col(FUR).hide_viewport=True;rig=bpy.data.objects['Mugi | feline rig'];cat=Cat(rig);acts={};manifest=[]
    for d in PLANS:
        act=author(rig,cat,d);acts[d[0]]=act
        stride={'walk':1.,'trot':1.30}.get(d[0],0)*UNIT
        manifest.append(dict(name=d[0],label=d[1],frames=[1,d[2]+1],seconds=d[2]/FPS,entry=d[3],exit=d[4],loop=bool(d[5]),strideMeters=stride))
    cat.reset();ad=rig.animation_data_create();ad.action=None
    s=bpy.context.scene;s.timeline_markers.clear()
    demo=['idle_stand','head_tilt','walk','walk','idle_stand','stand_to_sit','idle_sit','sit_to_stand','stand_to_lie','fall_asleep','sleep','wake_up','lie_to_stand','idle_stand']
    tracks=[ad.nla_tracks.new(),ad.nla_tracks.new()];tracks[0].name='Performance | A';tracks[1].name='Performance | B'
    frame=1;walk_at=[]
    for i,k in enumerate(demo):
        ac=acts[k];duration=int(ac.frame_end-ac.frame_start);strip=tracks[i%2].strips.new(k,frame,ac);strip.action_slot=ac.slots[0];strip.extrapolation='NOTHING';strip.blend_type='REPLACE'
        # The upper strip fades across the lower one on both entry and exit.
        if i%2:strip.blend_in=5;strip.blend_out=5
        if k=='walk':walk_at.append((frame,frame+duration))
        s.timeline_markers.new(ac['title_zh'],frame=frame);frame+=duration-5
    s.frame_start=1;s.frame_end=frame+5;s.render.fps=FPS;col(FUR).hide_viewport=False
    loc=bpy.data.actions.new('Preview | walk displacement');loc.slots.new('OBJECT',rig.name)
    travel=ad.nla_tracks.new();travel.name='Preview | floor travel'
    start,end=walk_at[0][0],walk_at[-1][1];r=rig.pose.bones['Root']
    delta=cat.ori['Root']@Vector(world((1,0,0)))
    for ax,vel in enumerate(delta):
        if abs(vel)<1e-8:continue
        fc=loc.fcurves.new(r.path_from_id()+'.location',index=ax,action_group='Root')
        for fr,dist in [(1,0),(start,0),(start+5,2.5/32),(end-5,(end-start-7.5)/32),(end,(end-start-5)/32),(s.frame_end,(end-start-5)/32)]:
            pt=fc.keyframe_points.insert(fr,vel*dist);pt.interpolation='LINEAR'
    tr=travel.strips.new('Walk displacement',1,loc);tr.action_slot=loc.slots[0];tr.blend_type='ADD';tr.extrapolation='NOTHING'
    from render_review import fit
    s.frame_set(1);fit('hero')
    camera=s.camera;follow=camera.constraints.new('COPY_LOCATION');follow.name='Follow floor travel'
    follow.target=rig;follow.subtarget='Root';follow.use_offset=True;follow.use_z=False
    rig['runtime_gait']='In-place: advance the actor -Y by strideMeters per cycle'
    s.frame_set(1);activate(rig);save(dest)
    (REPORT/'animation_manifest.json').write_text(json.dumps({'fps':FPS,'rest':'stand','forwardBlender':'-Y','forwardGLTF':'+Z','clips':manifest,'demo':demo},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':build()

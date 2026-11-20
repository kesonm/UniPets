/** Run in the preview document. native contains native_checks.json from the same build. */
export async function checkRuntime(m, native) {
  m.setPaused(true);
  const c=m.controller, mixer=c.mixer, actor=m.actor;
  const bones=new Map(), meshes=new Map(), morphNodes=[];
  actor.traverse(o=>{
    if(o.isBone)bones.set(o.userData.name,o);
    if(o.isSkinnedMesh){meshes.set(o.material.name,o);if(o.morphTargetDictionary&&"Blink.L" in o.morphTargetDictionary)morphNodes.push(o);}
  });
  const materials={"Coat.Body":"Coat | Coat.Body","Coat.Head":"Coat | Coat.Head","Coat.Tail":"Coat | Coat.Tail"};
  const vec=actor.position.clone();
  function sampleClip(name,time) {
    mixer.stopAllAction();c.retire.clear();c.queue.length=0;actor.position.set(0,0,0);
    const a=c.actions.get(name);a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=time;mixer.update(0);
    actor.updateMatrixWorld(true);
  }
  const markers={};
  for(const [name,rest] of Object.entries(native.landmarksRest)){
    const o=meshes.get(materials[name]),pos=o.geometry.attributes.position;
    markers[name]=rest.map(v=>{
      let best=-1,dist=Infinity;
      for(let i=0;i<pos.count;i++){
        const d=(v[0]-pos.getX(i))**2+(v[1]-pos.getY(i))**2+(v[2]-pos.getZ(i))**2;
        if(d<dist){best=i;dist=d;}
      }
      return dist<1e-9?best:-1;
    });
  }
  const errors={},all=[];
  for(const [name,rows] of Object.entries(native.traces)){
    if(!rows[0].jointGLTF)continue;
    const skin=[],joints=[];
    for(const row of rows){
      sampleClip(name,(row.frame-1)/24);
      for(const [id,p] of Object.entries(row.jointGLTF)){const v=bones.get(id).getWorldPosition(vec);joints.push(Math.hypot(v.x-p[0],v.y-p[1],v.z-p[2])*1000);}
      for(const [id,points] of Object.entries(row.surfaceGLTF)){
        const target=meshes.get(materials[id]);points.forEach((p,i)=>{
          const k=markers[id][i];if(k<0)return;target.getVertexPosition(k,vec);target.localToWorld(vec);
          skin.push(Math.hypot(vec.x-p[0],vec.y-p[1],vec.z-p[2])*1000);
        });
      }
    }
    all.push(...skin);skin.sort((a,b)=>a-b);
    errors[name]={jointMaxMm:Math.max(...joints),sampleCount:skin.length,skinP95Mm:skin[Math.floor(skin.length*.95)],skinMaxMm:skin.at(-1)};
  }
  // Play each clip through Three's actual bindings and reject non-finite skeleton or morph values.
  const clips={};
  for(const clip of m.clips){
    for(const t of [0,clip.duration*.31,clip.duration*.69]){
      sampleClip(clip.name,t);
      for(const b of bones.values())if(!b.matrixWorld.elements.every(Number.isFinite))throw Error("Invalid bone in "+clip.name);
      for(const o of morphNodes)if(!o.morphTargetInfluences.every(Number.isFinite))throw Error("Invalid facial control in "+clip.name);
    }
    clips[clip.name]={tracks:clip.tracks.length,seconds:clip.duration};
  }
  sampleClip("sleep",1);
  const blink=morphNodes[0].morphTargetInfluences[morphNodes[0].morphTargetDictionary["Blink.L"]];
  mixer.stopAllAction();c.current=null;c.play("idle_stand");c.request("sleep");
  const history=[c.name];let crossfadeSeen=false;
  for(let i=0;i<320;i++){
    c.update(1/60);
    if(history.at(-1)!==c.name)history.push(c.name);
    if([...c.actions.values()].filter(a=>a.isRunning()&&a.getEffectiveWeight()>.02).length>1)crossfadeSeen=true;
  }
  c.request("idle_sit");
  for(let i=0;i<460;i++){c.update(1/60);if(history.at(-1)!==c.name)history.push(c.name);}
  if(c.name!=="idle_sit"||!crossfadeSeen||blink<.99)throw Error("State or facial test failed: "+history);
  c.request("walk");for(let i=0;i<240&&c.name!=="walk";i++)c.update(1/60);
  for(let i=0;i<20;i++)c.update(1/60);const before=actor.position.z;
  for(let i=0;i<80;i++)c.update(1/60);
  const walkMeters=actor.position.z-before;
  all.sort((a,b)=>a-b);
  m.draw();const gl=m.renderer.getContext(),result={runtime:"Three.js r180",webgl:gl.getParameter(gl.VERSION),clips,joints:bones.size,posedGPUFacePrimitives:morphNodes.length,blink,transitions:history,crossfadeSeen,walkMetersPerCycle:walkMeters,comparisons:errors,skinP95Mm:all[Math.floor(all.length*.95)],skinMaxMm:all.at(-1),drawCallsIncludingFloor:m.renderer.info.render.calls,trianglesIncludingFloor:m.renderer.info.render.triangles};
  mixer.stopAllAction();c.retire.clear();c.queue=[];actor.position.set(0,0,0);c.current=null;c.play("idle_stand");c.update(.01);m.draw();m.setPaused(false);
  return result;
}

/** Compare skinned tuft root pairs with their attachment triangles as sampled in native Blender. */
export function checkCardContacts(m, data) {
  const actor=m.actor,c=m.controller;let mesh;
  actor.traverse(o=>{if(o.isSkinnedMesh&&o.material.name==="Realtime | cutout fur")mesh=o;});
  const pos=mesh.geometry.attributes.position,v=actor.position.clone(),u=v.clone(),lookup=new Map();
  const hash=(x,y,z)=>[x,y,z].map(n=>Math.round(n*1e7)).join(",");
  for(let i=0;i<pos.count;i++)lookup.set(hash(pos.getX(i),pos.getY(i),pos.getZ(i)),i);
  function vertex(point){
    const i=lookup.get(hash(...point));if(i!==undefined)return i;
    let pick=-1,dist=Infinity;
    for(let j=0;j<pos.count;j++){const d=(pos.getX(j)-point[0])**2+(pos.getY(j)-point[1])**2+(pos.getZ(j)-point[2])**2;if(d<dist){dist=d;pick=j;}}
    if(dist>1e-12)throw Error("Unmatched tuft root");return pick;
  }
  const pairs=data.restCardEdges.map(edge=>edge.map(vertex)),out={};
  m.setPaused(true);
  for(const [name,p] of Object.entries(data.poses)){
    c.mixer.stopAllAction();actor.position.set(0,0,0);
    const a=c.actions.get(name);a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=(p.frame-1)/24;c.mixer.update(0);actor.updateMatrixWorld(true);
    const distances=pairs.map(([i,j],n)=>{
      mesh.getVertexPosition(i,v);mesh.getVertexPosition(j,u);v.add(u).multiplyScalar(.5);mesh.localToWorld(v);
      return Math.hypot(v.x-p.surface[n][0],v.y-p.surface[n][1],v.z-p.surface[n][2])*1000;
    }).sort((a,b)=>a-b);
    out[name]={frame:p.frame,samples:distances.length,p95Mm:distances[Math.floor(distances.length*.95)],maxMm:distances.at(-1)};
  }
  c.mixer.stopAllAction();c.retire.clear();c.queue=[];c.current=null;c.play("idle_stand");c.update(.01);m.draw();m.setPaused(false);
  return out;
}

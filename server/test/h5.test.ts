import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { removeFile, saveSprite } from '../src/assets.js'
import { config } from '../src/config.js'
import { db, rows } from '../src/db.js'
import { assembleVideoSprite } from '../src/video.js'

test('H5 shares only configured profiles, approved motion previews and explicitly published photos', {timeout:20_000}, async () => {
  const service=createApp().listen(0,'127.0.0.1')
  await once(service,'listening')
  const address=service.address()
  assert.ok(address && typeof address==='object')
  const base=`http://127.0.0.1:${address.port}/api`
  const users: string[]=[]
  const previous=config.h5DemoOwnerId
  const previousMotionPet=config.h5DemoMotionPetId
  async function request(path:string,method='GET',body?:unknown,cookie='') {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:config.origins[0],...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)})
    const data=response.headers.get('content-type')?.includes('json') ? await response.json() as any : Buffer.from(await response.arrayBuffer())
    return {status:response.status, data, headers:response.headers}
  }
  async function account() {
    const output=await request('/auth/register','POST',{username:'h5_'+randomUUID().replaceAll('-','').slice(0,10),password:'H5_Isolated_Test_2026!'})
    assert.equal(output.status,201)
    users.push(output.data.user.id)
    return {id:output.data.user.id as string,cookie:output.headers.get('set-cookie')!.split(';',1)[0]}
  }
  async function createPet(cookie:string,name:string) {
    const output=await request('/pets','POST',{name,species:'cat',notes:'Private note'},cookie)
    assert.equal(output.status,201)
    return output.data.pet.id as string
  }
  async function upload(cookie:string,petId:string) {
    const pixels=await sharp({create:{width:900,height:700,channels:3,background:'#ffe48b'}}).png().toBuffer()
    const output=await request('/assets','POST',{petId,name:'photo.png',image:'data:image/png;base64,'+pixels.toString('base64')},cookie)
    assert.equal(output.status,201)
    return output.data.asset.id as string
  }

  try {
    const seed=await account(), member=await account()
    config.h5DemoOwnerId=seed.id
    const demo=await createPet(seed.cookie,'Shared cat'), privatePet=await createPet(member.cookie,'Private cat')
    config.h5DemoMotionPetId=demo
    const secondPet=await createPet(member.cookie,'Second private cat')
    const demoCover=await upload(seed.cookie,demo), privatePhoto=await upload(member.cookie,privatePet)
    const demoResponse=await request('/h5/demo-pets')
    assert.equal(demoResponse.status,200)
    assert.deepEqual(demoResponse.data.pets,[{id:demo,name:'Shared cat',species:'cat',breed:'',gender:'unknown',birthday:null,hasCover:1,identityNumber:null,interactiveRoom:true}])
    assert.deepEqual((await request('/h5/demo-pets','GET',undefined,member.cookie)).data,demoResponse.data)
    assert.equal((await request('/pets','GET',undefined,member.cookie)).data.pets.length,2)
    const cover=await request(`/h5/demo-pets/${demo}/cover`)
    assert.equal(cover.status,200)
    const info=await sharp(cover.data).metadata()
    assert.equal(info.format,'webp')
    assert.equal(info.width,600)
    assert.equal((await request(`/h5/demo-pets/${privatePet}/cover`)).status,404)
    assert.equal((await request(`/assets/${demoCover}/file`)).status,401)
    assert.equal((await request(`/assets/${demoCover}/file`,'GET',undefined,member.cookie)).status,404)
    assert.equal((await request(`/pets/${demo}`,'PATCH',{name:'Overwrite',species:'cat'},member.cookie)).status,404)

    const anotherDemo=await createPet(seed.cookie,'Another shared cat')
    assert.equal((await request('/h5/demo-pets')).data.pets[0].id,demo)
    const frame=await sharp({create:{width:256,height:256,channels:4,background:{r:145,g:95,b:75,alpha:0.8}}}).png().toBuffer()
    const sheet=await assembleVideoSprite(Array<Buffer>(9).fill(frame),12,true)
    async function motion(petId:string,photoId:string,action:'front_tail_wag'|'side_sit_to_front'|'lower_to_crouch') {
      const jobId=randomUUID()
      await db.execute(`INSERT INTO generation_jobs (id,user_id,pet_id,mode,model,total,completed,status,motion_key)
        VALUES (?,?,?,'motion_render','local-test',1,1,'completed',?)`,[jobId,seed.id,petId,action])
      return saveSprite({userId:seed.id,petId,name:'Private motion name',bytes:sheet.bytes,action,jobId,
        motion:{fromAssetId:photoId,toAssetId:photoId}}, {...sheet,motionJoinable:true})
    }
    const anotherPhoto=await upload(seed.cookie,anotherDemo)
    for (const [petId,photoId,pose] of [[demo,demoCover,'sit_front'],[demo,demoCover,'sit_left'],[demo,demoCover,'stand_left'],
      [demo,demoCover,'crouch_left'],[anotherDemo,anotherPhoto,'sit_front']]) {
      await db.execute('INSERT INTO motion_poses (pet_id,pose_key,asset_id) VALUES (?,?,?)',[petId,pose,photoId])
    }
    const keyMotion=await motion(demo,demoCover,'front_tail_wag')
    const transition=await motion(demo,demoCover,'side_sit_to_front')
    const roomTransition=await motion(demo,demoCover,'lower_to_crouch')
    const unpublished=await motion(anotherDemo,anotherPhoto,'front_tail_wag')
    const motionRoute=`/h5/demo-pets/${demo}/motions`
    const motionList=await request(motionRoute)
    assert.equal(motionList.status,200)
    const imagePath=`${motionRoute}/${keyMotion.id}/image?v=${keyMotion.imageVersion}`
    assert.deepEqual(motionList.data,{poses:{},assets:[{id:keyMotion.id,action:'front_tail_wag',name:'摇尾巴',
      imageVersion:keyMotion.imageVersion,frames:9,columns:8,rows:2,fps:12,motionJoinable:1,backgroundRemoved:1,imagePath}]})
    assert.deepEqual((await request(motionRoute,'GET',undefined,member.cookie)).data,motionList.data)
    const sprite=await request(imagePath)
    assert.equal(sprite.status,200)
    const spriteInfo=await sharp(sprite.data).metadata()
    assert.deepEqual([spriteInfo.format,spriteInfo.hasAlpha,spriteInfo.width,spriteInfo.height],['webp',true,1280,320])
    for (const id of [transition.id,roomTransition.id,unpublished.id,demoCover]) {
      assert.equal((await request(`${motionRoute}/${id}/image`)).status,404)
    }
    const roomRoute=`/h5/demo-pets/${demo}/room`
    const roomList=await request(roomRoute)
    assert.equal(roomList.status,200)
    assert.deepEqual(roomList.data.assets.map((asset:{action:string})=>asset.action),['lower_to_crouch'])
    const roomImage=await request(roomList.data.assets[0].imagePath)
    assert.equal(roomImage.status,200)
    const roomInfo=await sharp(roomImage.data).metadata()
    assert.deepEqual([roomInfo.format,roomInfo.hasAlpha,roomInfo.width,roomInfo.height],['webp',true,1152,288])
    for (const id of [transition.id,keyMotion.id,unpublished.id,demoCover]) {
      assert.equal((await request(`${roomRoute}/${id}/image`)).status,404)
    }
    assert.equal((await request(`/h5/demo-pets/${anotherDemo}/room`)).status,404)
    assert.equal((await request(`/h5/demo-pets/${privatePet}/room`)).status,404)
    const unsharedRoute=`/h5/demo-pets/${anotherDemo}/motions`
    assert.deepEqual((await request(unsharedRoute)).data.assets,[])
    assert.equal((await request(`${unsharedRoute}/${unpublished.id}/image`)).status,404)
    assert.equal((await request(`/h5/demo-pets/${privatePet}/motions`)).status,404)
    assert.equal((await request(`/assets/${keyMotion.id}/file`)).status,401)
    assert.equal((await request(`/assets/${keyMotion.id}/file`,'GET',undefined,member.cookie)).status,404)
    assert.equal((await request(`/motions/${demo}/batch-plan`,'GET',undefined,member.cookie)).status,404)
    assert.equal((await request(`/motions/${demo}/batch-plan`,'GET',undefined,seed.cookie)).status,404)
    const batch={kind:'batch',referenceAssetIds:[demoCover],approved:{poses:0,clips:0}}
    assert.equal((await request(`/motions/${demo}/generate`,'POST',batch)).status,401)
    assert.equal((await request(`/motions/${demo}/generate`,'POST',batch,member.cookie)).status,404)

    const postBody={petId:privatePet,assetId:privatePhoto,title:'City pets',body:'A sunny afternoon',area:'shenzhen-nanshan'}
    assert.equal((await request('/h5/posts','POST',postBody)).status,401)
    assert.equal((await request('/h5/posts','POST',{...postBody,petId:demo},member.cookie)).status,404)
    assert.equal((await request('/h5/posts','POST',{...postBody,assetId:demoCover},member.cookie)).status,404)
    assert.equal((await request('/h5/posts','POST',{...postBody,petId:secondPet},member.cookie)).status,400)
    const published=await request('/h5/posts','POST',postBody,member.cookie)
    assert.equal(published.status,201)
    const post=published.data.post
    assert.equal(post.hasImage,1)
    assert.equal('assetId' in post,false)
    assert.equal('userId' in post,false)
    assert.equal((await request(`/h5/posts/${post.id}/image`)).status,200)
    assert.equal((await request(`/assets/${privatePhoto}/file`)).status,401)
    assert.equal((await request('/h5/posts?sort=recommended&q=City+pets&species=cat')).data.posts[0].id,post.id)
    assert.equal((await request('/h5/posts?sort=near&area=shenzhen-nanshan&q=City+pets')).data.posts[0].id,post.id)

    const reaction=`/h5/posts/${post.id}/reaction`
    for (let attempt=0;attempt<2;attempt++) {
      const like=await request(reaction,'PUT',{kind:'like',active:true},seed.cookie)
      assert.equal(like.status,200)
      assert.equal(Number(like.data.likes),1)
    }
    assert.equal((await request(reaction,'PUT',{kind:'favorite',active:true},seed.cookie)).status,200)
    const saved=(await request('/h5/me','GET',undefined,seed.cookie)).data
    assert.deepEqual(saved.likedIds,[post.id]);assert.deepEqual(saved.savedIds,[post.id]);assert.equal(saved.favorites[0].id,post.id)
    assert.equal((await request('/h5/posts?sort=hot&q=City+pets')).data.posts[0].likes,1)
    assert.equal((await request(`/h5/posts/${post.id}`,'DELETE',{},seed.cookie)).status,404)
    assert.equal((await request(`/h5/posts/${post.id}`,'DELETE',{},member.cookie)).status,200)
    assert.equal((await request(`/h5/posts/${post.id}/image`)).status,404)
    assert.deepEqual((await request('/h5/me','GET',undefined,seed.cookie)).data.savedIds,[])
  } finally {
    config.h5DemoOwnerId=previous
    config.h5DemoMotionPetId=previousMotionPet
    await new Promise<void>(resolve=>service.close(()=>resolve()))
    for(const user of users) {
      const files=await rows('SELECT file_key,source_video_key FROM assets WHERE user_id=?',[user])
      await db.execute('DELETE FROM users WHERE id=?',[user])
      await Promise.all(files.map(file=>removeFile(file.file_key,file.source_video_key)))
    }
    await db.end()
  }
})

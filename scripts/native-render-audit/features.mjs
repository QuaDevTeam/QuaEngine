import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { backgroundAuditAssets, png } from './background-assets.mjs'
import { spriteLayerStyle } from '../../packages/render/web/dist/plugins/sprite.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/features')
mkdirSync(output, { recursive: true })
const colors = [[255,70,50],[50,210,90],[50,100,240],[240,200,30],[100,70,180],[30,190,210],[210,70,170],[150,220,120],[220,150,90]]
const skin = png(48, 48, (x,y) => [...colors[Math.floor(y/16)*3+Math.floor(x/16)].map(c => (x+y)%8 < 4 ? c : Math.floor(c*.7)),255])
const base = png(48,48,(x,y) => [220,130,30, Math.hypot(x-24,y-24) < 22 ? 255 : 0])
const atlas = png(96,48,(x,y) => [x < 48 ? 255 : 30, x < 48 ? 30 : 210, 220, (x+y)%16 < 8 ? 220 : 0])
const manifest = { version:1, family:'fixture', base:{asset:'base.png'}, atlas:{asset:'atlas.png',frames:{smile:{x:48,y:0,width:48,height:48}}}, expressions:{smile:{layers:[{asset:'atlas.png',frame:'smile',offsetX:40,rotation:20,scale:.5}]}} }
manifest.expressions.masked = {layers:[{...manifest.expressions.smile.layers[0],mask:'mask.png',blendMode:'screen'}]}
const index = JSON.parse(readFileSync(resolve(root,'demo/dist/assets/index.json')))
const { qpk, urls } = await backgroundAuditAssets(resolve(root,'demo/dist/assets',index.targets['native-macos'].filename), output, 'characters', new Map([
  ['skin.png',skin], ['fixture/mask.png',png(240,240,(x,y)=>[255,255,255,x%60<30?255:0])], ['fixture/base.png',base], ['fixture/atlas.png',atlas], ['fixture/sprite.manifest.json',Buffer.from(JSON.stringify(manifest))],
]))
const node = (id,x,y,width,height,style) => ({id,kind:'Box',visible:true,opacity:1,zIndex:0,bounds:{x,y,width,height},style})
const insets = n => ({top:n,right:n,bottom:n,left:n})
const panels = [
  {id:'stretch',x:100,y:80,width:440,height:280,edge:32,repeat:'stretch',fill:true},
  {id:'repeat',x:700,y:80,width:455,height:287,edge:24,repeat:'repeat',fill:true},
  {id:'hollow',x:100,y:500,width:440,height:280,edge:32,repeat:'repeat',fill:false},
  {id:'overlap',x:700,y:550,width:100,height:70,edge:60,repeat:'stretch',fill:true},
]
const borderView = { ui:{visible:true,overlays:[{elementId:'audit',visible:true,renderMode:'render-only',surface:{key:'ui/audit.qui',root:{...node('root',0,0,1920,1080,{}),children:panels.map(p => node(p.id,p.x,p.y,p.width,p.height,{borderImage:{source:{assetType:'characters',assetName:'skin.png'},slice:insets(16),width:insets(p.edge),repeat:p.repeat,fill:p.fill}}))}}}]} }
const spriteView = { characters:[{id:'mira',name:'Mira',sprite:'fixture/base.png',expression:'smile',visible:true,opacity:.7,position:{x:960,y:600,width:240,height:240,scale:-1.2,rotation:25,anchor:'center'}}] }
const cases = [
  {id:'border-image',view:borderView},
  {id:'border-letterbox',view:borderView,height:1200},
  {id:'sprite-manifest-transform',view:spriteView},
  {id:'sprite-mask-transform',view:{characters:spriteView.characters.map(c=>({...c,expression:'masked'}))}},
  {id:'stage-camera',view:{...spriteView,stage:{x:100,y:20,scale:.9,rotation:8,opacity:.6},camera:{x:30,y:10,scale:1.1,rotation:3}}},
]
const binary = process.env.QUA_NATIVE_AUDIT_APP || resolve(root,'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) execFileSync('cargo',['build','--locked','--manifest-path','packages/native/Cargo.toml','-p','quajs_native_app','--features','native-window'],{cwd:root,stdio:'inherit'})
const env = {...process.env}; for (const key of Object.keys(env)) if(key.startsWith('QUA_NATIVE_')) delete env[key]
const browser = await chromium.launch({channel:'chrome'})
const report = { date:new Date().toISOString(), binarySha256:createHash('sha256').update(readFileSync(binary)).digest('hex'), dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(), limits:{mae:3,fractionOver32:.015}, revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),browser:browser.version(),method:'Real Metal/Chrome, same Quack QPK. Native resolves manifest/atlas; CSS reference draws border-image and composed sprite transforms.',cases:[] }
try {
  const page = await browser.newPage({deviceScaleFactor:1})
  for (const item of cases) {
    const height = item.height || 1080
    const frame = {layout:{preset:'landscape'},container:{width:960,height:height/2,devicePixelRatio:2},view:item.view}
    const file = resolve(output,`${item.id}.json`), capture = resolve(output,`${item.id}-native.png`)
    writeFileSync(file,JSON.stringify(frame))
    const native = spawnSync(binary,[],{cwd:root,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,env:{...env,QUA_NATIVE_LOG:'warn',QUA_NATIVE_RENDERER_WINDOW_SMOKE:'1',QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME:file,QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES:'2',QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE:`1920x${height}`,QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH:capture,QUA_NATIVE_RENDERER_WINDOW_DEV_QPK:qpk}})
    writeFileSync(resolve(output,`${item.id}.log`),`${native.stdout}\n${native.stderr}`)
    if (native.status !== 0) throw new Error(`${item.id}: ${native.error || native.stderr}`)
    const summary = JSON.parse(native.stdout.split('\n').find(l=>l.startsWith('Qua native window smoke json: ')).slice('Qua native window smoke json: '.length))
    if(summary.frameCaptureWidth !== 1920 || summary.frameCaptureHeight !== height || summary.textureUploadErrorCount || summary.fontAtlasErrorCount || summary.textureShutdownCleanupErrorCount || summary.textureShutdownReleasedCount !== summary.textureUploadUploadedCount) throw new Error(`Resource failure: ${JSON.stringify(summary)}`)
    await page.setViewportSize({width:1920,height})
    await page.setContent(`<style>html,body{margin:0;background:black;overflow:hidden}#stage{position:absolute;top:${(height-1080)/2}px;width:1920px;height:1080px}</style><div id=stage></div>`)
    await page.evaluate(async ({id,panels,urls,stage,camera,layerStyle}) => {
      const root = document.getElementById('stage')
      if (id.startsWith('border')) {
        for(const p of panels) {
          const el = document.createElement('div')
          Object.assign(el.style,{position:'absolute',boxSizing:'border-box',left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`,height:`${p.height}px`,borderStyle:'solid',borderWidth:'0px',borderImageSource:`url(${urls['skin.png']})`,borderImageSlice:`16${p.fill?' fill':''}`,borderImageWidth:`${p.edge}px`,borderImageRepeat:p.repeat})
          root.append(el)
        }
        const image = new Image(); image.src=urls['skin.png']; await image.decode()
      } else {
        const scene=document.createElement('div');Object.assign(scene.style,{position:'absolute',inset:0,transformOrigin:'0 0'})
        if(stage) Object.assign(scene.style,{transform:`translate(${stage.x}px,${stage.y}px) scale(${stage.scale}) rotate(${stage.rotation}deg) translate(${-camera.x}px,${-camera.y}px) scale(${camera.scale}) rotate(${-camera.rotation}deg)`,opacity:stage.opacity})
        root.append(scene)
        const sprite=document.createElement('div');Object.assign(sprite.style,{position:'absolute',left:'840px',top:'480px',width:'240px',height:'240px',opacity:'.7',transform:'rotate(25deg) scale(-1.2)'})
        const base=document.createElement('img');base.src=urls['fixture/base.png'];Object.assign(base.style,{display:'block',width:'240px',height:'240px'});sprite.append(base)
        const layer=document.createElement('div');Object.assign(layer.style,{position:'absolute',inset:0,backgroundImage:`url(${urls['fixture/atlas.png']})`,backgroundSize:'480px 240px',backgroundPosition:'-240px 0',transform:'translate(40px,0) scale(.5) rotate(20deg)'})
        Object.assign(layer.style,layerStyle)
        sprite.append(layer);scene.append(sprite);await base.decode();const image=new Image();image.src=urls['fixture/atlas.png'];await image.decode()
      }
    },{id:item.id,panels,urls,stage:item.view.stage,camera:item.view.camera,layerStyle:spriteLayerStyle({...manifest.expressions[item.id==='sprite-mask-transform'?'masked':'smile'].layers[0]},false,item.id==='sprite-mask-transform'?urls['fixture/mask.png']:undefined)})
    const webPath=resolve(output,`${item.id}-web.png`);await page.screenshot({path:webPath})
    const metrics=await page.evaluate(async ({n,w})=>{
      const read=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data}
      const a=await read(n),b=await read(w);let sum=0,painted=0,over=0
      for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++){sum+=Math.abs(a[i+c]-b[i+c]);d=Math.max(d,Math.abs(a[i+c]-b[i+c]))}if(Math.max(a[i],a[i+1],a[i+2],b[i],b[i+1],b[i+2])>0)painted++;if(d>32)over++}
      return {mae:sum/(3*Math.max(1,painted)),fractionOver32:over/Math.max(1,painted)}
    },{n:`data:image/png;base64,${readFileSync(capture).toString('base64')}`,w:`data:image/png;base64,${readFileSync(webPath).toString('base64')}`})
    report.cases.push({id:item.id,...metrics,summary});console.log(JSON.stringify({id:item.id,...metrics}))
    writeFileSync(resolve(output,'measurements.json'),JSON.stringify(report,null,2))
  }
  writeFileSync(resolve(output,'review.html'),`<!doctype html><meta charset=utf-8><style>body{background:#15191f;color:white;font:16px system-ui}img{width:49%}</style>${report.cases.map(c=>`<h2>${c.id}: ${c.mae.toFixed(3)}</h2><img src="${c.id}-native.png"><img src="${c.id}-web.png">`).join('')}`)
  if(report.cases.some(c=>c.mae>3 || c.fractionOver32>.015)) throw new Error('Feature raster comparison exceeded bounds; inspect review.html')
} finally { await browser.close() }

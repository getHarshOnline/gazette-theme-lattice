import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createRelationRenderer } from '../scripts/relation-renderer.js';
import { perspective, lookAtOrigin, sampleField, mipSizes } from '../scripts/relation-math.js';
import * as post from '../scripts/relation-post.js';

const ground=[.01,.02,.03];
const lighting={bloomIntensity:1.5,bloomThreshold:.06,bloomSmoothing:.45,bloomRadius:.82,exposure:1,vignetteOffset:.2,vignetteDarkness:.85,noiseOpacity:.26};
const preset={spread:1,camZ:10,stream:.2,mouseForce:.5,deep:[.1,.2,.3],mid:[.2,.4,.6],hot:[.8,.9,1]};
const model={field:{presets:[preset,{...preset,spread:3,deep:[.3,.4,.5]}],keys:['spread','camZ','stream','mouseForce'],cameraFov:45,cameraNear:.1,cameraFar:200,bloomLevels:8,pointSize:{reference:900,minimum:.66,maximum:1.5}},pickCounts:()=>({points:3,lines:2,steps:3}),buildPoints:()=>({count:3,seeds:new Float32Array(9),rand:new Float32Array(9),tone:new Float32Array(3),scale:new Float32Array(3)}),buildStreamlines:()=>({positions:new Float32Array(24),along:new Float32Array(8),seed:new Float32Array(8),tone:new Float32Array(8),vertexCount:8}),fieldVertexShader:'void main(){gl_Position=vec4(0.);}',fieldFragmentShader:'void main(){gl_FragColor=vec4(1.);}',streamVertexShader:'void main(){gl_Position=vec4(position,1.);}',streamFragmentShader:'void main(){gl_FragColor=vec4(1.);}'};
const frame={time:2,index:0,blend:.3,intro:1,pointerX:.4,pointerY:-.2,velocity:.2,cameraX:.2,cameraY:-.1,cameraZ:10,pointerCameraZ:10.2,streamOpacity:.15,parallaxX:.22,parallaxY:-.07,size:{width:800,height:600,pixelRatio:1.5}};
function harness({failCompile=false,failLink=false,float=true,failFramebuffer=false,parallel=true,ready=true}={}){
 const live=new Set(), calls=[], listeners=new Map();let lost=false, shaderSource=[], frameStatus='CONDITION_SATISFIED';
 const gl={};for(const key of ['ARRAY_BUFFER','STATIC_DRAW','FLOAT','VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','FRAMEBUFFER','COLOR_ATTACHMENT0','RGBA16F','RGBA','HALF_FLOAT','FRAMEBUFFER_COMPLETE','DEPTH_TEST','CULL_FACE','DITHER','MAX_TEXTURE_SIZE','BLEND','COLOR_BUFFER_BIT','FUNC_ADD','SRC_ALPHA','ONE','LINES','POINTS','TRIANGLES'])gl[key]=key;
 gl.TEXTURE0=100;
 for(const key of ['SYNC_GPU_COMMANDS_COMPLETE','TIMEOUT_EXPIRED','CONDITION_SATISFIED','WAIT_FAILED'])gl[key]=key;
 for(const kind of ['Shader','Program','Buffer','Texture','Framebuffer']){gl['create'+kind]=()=>{const r={kind};live.add(r);calls.push(['create',kind]);return r;};gl['delete'+kind]=r=>{live.delete(r);calls.push(['delete',kind]);};}
 gl.fenceSync=(...args)=>{const fence={kind:'Sync'};live.add(fence);calls.push(['fenceSync',...args]);return fence;};
 gl.clientWaitSync=(_,flags,timeout)=>{calls.push(['clientWaitSync',flags,timeout]);return frameStatus;};
 gl.deleteSync=fence=>{live.delete(fence);calls.push(['deleteSync']);};
 gl.flush=()=>calls.push(['flush']);
 for(const key of ['attachShader','detachShader','linkProgram','compileShader','bindBuffer','bufferData','useProgram','enableVertexAttribArray','vertexAttribPointer','disableVertexAttribArray','bindTexture','texParameteri','bindFramebuffer','framebufferTexture2D','texImage2D','disable','enable','viewport','clearColor','clear','blendEquation','blendFuncSeparate','activeTexture','drawArrays'])gl[key]=(...args)=>calls.push([key,...args]);
 gl.shaderSource=(s,value)=>shaderSource.push(value);
 gl.getShaderInfoLog=()=>failCompile?'forced compile failure':'';
 gl.getProgramParameter=(_,key)=>{calls.push(['status',key]);return key==='completion'?ready:!(failLink||failCompile);};
 gl.getProgramInfoLog=()=>failLink?'forced link failure':'';
 gl.getUniformLocation=(p,n)=>n;gl.getAttribLocation=()=>0;
 for(const key of ['uniform1f','uniform1i','uniform2fv','uniform3fv','uniformMatrix4fv'])gl[key]=(name,...args)=>calls.push([key,name,...args.map(v=>ArrayBuffer.isView(v)?Array.from(v):v)]);
 gl.getParameter=()=>8192;gl.checkFramebufferStatus=()=>failFramebuffer?'BAD':gl.FRAMEBUFFER_COMPLETE;gl.isContextLost=()=>lost;
 gl.getExtension=name=>name==='EXT_color_buffer_float'?(float?{}:null):
   name==='KHR_parallel_shader_compile'?(parallel?{COMPLETION_STATUS_KHR:'completion'}:null):
   name==='WEBGL_lose_context'?{loseContext(){lost=true;live.clear();}}:null;
 const canvas={getContext:()=>gl,addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};
 globalThis.document={createElement:()=>canvas};
 return{canvas,gl,calls,listeners,live,shaderSource,finish(){ready=true;},setFrameStatus(status){frameStatus=status;},lose(){lost=true;live.clear();listeners.get('webglcontextlost')({preventDefault(){}});},restore(){lost=false;listeners.get('webglcontextrestored')();}};
}

function start(renderer) {
 assert.equal(renderer.render(frame),null);
 return renderer.render(frame);
}

test('seven-state sampler obeys explicit index/blend, including final hold',()=>{
 const out={deep:new Float32Array(3),mid:new Float32Array(3),hot:new Float32Array(3)};
 sampleField(model,0,.5,out);assert.equal(out.spread,2);assert.ok(Math.abs(out.deep[0]-.2)<1e-6);
 sampleField(model,1,.9,out);assert.equal(out.spread,3);
});
test('mip pyramid follows rounded source dimensions and never allocates zero',()=>{
 assert.deepEqual(mipSizes(801,601,3),[[401,301],[201,151],[101,76]]);
 assert.deepEqual(mipSizes(1,1,8),Array.from({length:8},()=>[1,1]));
});
test('renderer draws source light batches and complete HDR chain without layout reads',()=>{
 const h=harness(),r=createRelationRenderer(model,{lighting,ground});assert.equal(r.canvas,h.canvas);assert.equal(start(r),true);
 assert.deepEqual(h.calls.filter(c=>c[0]==='drawArrays').map(c=>c[1]),['LINES','POINTS',...Array(17).fill('TRIANGLES')]);
 assert.ok(h.calls.some(c=>c[0]==='blendFuncSeparate'&&c.slice(1).join(',')==='SRC_ALPHA,ONE,ONE,ONE'));
 assert.equal(h.canvas.width,1200);assert.equal(h.canvas.height,900);
 assert.equal(h.calls.filter(c=>c[0]==='uniform1f'&&c[1]==='uTime').length,2);
 assert.ok(h.calls.some(c=>c[0]==='uniform1f'&&c[1]==='uTime'&&c[2]===2));
 assert.ok(h.calls.some(c=>c[0]==='uniform1f'&&c[1]==='uVelocity'&&c[2]===.2));
 const before=h.calls.filter(c=>c[0]==='create'||c[0]==='texImage2D'||c[0]==='bufferData').length;
 r.render({...frame,time:3});assert.equal(h.calls.filter(c=>c[0]==='create'||c[0]==='texImage2D'||c[0]==='bufferData').length,before);
 assert.ok(h.shaderSource.every(s=>s.startsWith('#version 300 es')));
 r.dispose();assert.equal(h.live.size,0);assert.equal(h.listeners.size,0);r.dispose();assert.equal(r.render(frame),false);
});
test('resize reuses geometry and framebuffer identities',()=>{
 const h=harness(),r=createRelationRenderer(model,{lighting,ground});start(r);
 const before=h.calls.filter(c=>c[0]==='create').length;r.render({...frame,size:{width:390,height:700,pixelRatio:1}});
 assert.equal(h.calls.filter(c=>c[0]==='create').length,before);assert.equal(h.canvas.width,390);r.dispose();
});
test('loss restores complete GPU resources and the latest explicit frame',()=>{
 const h=harness();let losses=0,restores=0;
 const r=createRelationRenderer(model,{lighting,ground,onLost:()=>losses++,onRestored:()=>restores++});start(r);h.lose();assert.equal(losses,1);assert.equal(r.render(frame),false);
 h.restore();assert.equal(restores,1);assert.equal(r.render(frame),true);assert.ok(h.live.size>0);assert.equal(h.canvas.width,1200);r.dispose();assert.equal(h.live.size,0);
});
test('all programs are queued before polling and draw resources wait for completion',()=>{
 const h=harness({ready:false}),r=createRelationRenderer(model,{lighting,ground});
 assert.equal(r.render(frame),null);
 assert.equal(h.calls.filter(call=>call[0]==='linkProgram').length,6);
 assert.equal(r.render(frame),null);
 assert.ok(h.calls.some(call=>call[0]==='status'&&call[1]==='completion'));
 assert.ok(!h.calls.some(call=>call[1]==='LINK_STATUS'||call[0]==='bufferData'));
 h.finish();
 assert.equal(r.render(frame),true);
 r.dispose();
});
test('without parallel polling the renderer validates all submitted links and draws directly',()=>{
 const h=harness({parallel:false}),r=createRelationRenderer(model,{lighting,ground});
 assert.equal(r.render(frame),true);
 const statuses=h.calls.filter(call=>call[0]==='status');
 assert.equal(statuses.length,6);
 assert.ok(statuses.every(call=>call[1]==='LINK_STATUS'));
 assert.ok(h.calls.lastIndexOf(statuses[0])>h.calls.findLastIndex(call=>call[0]==='linkProgram'));
 r.dispose();
});
test('a busy renderer keeps its visible frame and submits only the latest state when ready',()=>{
 const h=harness(),r=createRelationRenderer(model,{lighting,ground});
 assert.equal(start(r),true);
 assert.deepEqual(h.calls.slice(-2),[['fenceSync','SYNC_GPU_COMMANDS_COMPLETE',0],['flush']]);
 const draws=()=>h.calls.filter(call=>call[0]==='drawArrays').length;
 const before=draws();
 h.setFrameStatus('TIMEOUT_EXPIRED');
 assert.equal(r.render({...frame,time:3}),true);
 assert.equal(draws(),before);
 assert.deepEqual(h.calls.at(-1),['clientWaitSync',0,0]);
 h.setFrameStatus('CONDITION_SATISFIED');
 assert.equal(r.render({...frame,time:4}),true);
 assert.equal(draws(),before*2);
 assert.ok(h.calls.some(call=>call[0]==='uniform1f'&&call[1]==='uTime'&&call[2]===4));
 r.dispose();
 assert.equal(h.live.size,0);
});
for(const setting of [{failCompile:true},{failLink:true},{float:false},{failFramebuffer:true}])test('partial initialization failure releases GPU resources '+JSON.stringify(setting),()=>{
 const h=harness(setting);let errors=0;const r=createRelationRenderer(model,{lighting,ground,onError:()=>errors++});assert.throws(()=>start(r));assert.equal(errors,1);assert.equal(h.live.size,0);r.dispose();assert.equal(h.listeners.size,0);
});
test('invalid frame and incomplete lighting cannot enter GL draw work',()=>{
 const h=harness();assert.throws(()=>createRelationRenderer(model,{}));const r=createRelationRenderer(model,{lighting,ground});assert.throws(()=>r.render({...frame,time:NaN}));assert.equal(h.calls.filter(c=>c[0]==='drawArrays').length,0);r.dispose();
});

const sourceRoot=process.env.FIELD_REFERENCE_ROOT, modelPath=process.env.FIELD_MODEL_PATH;
test('retained source golden: matrices, full presets, geometry draw order and shader kernels',{skip:!(sourceRoot&&modelPath)},async()=>{
 const require=createRequire(pathToFileURL(sourceRoot+'/package.json'));
 const ts=require('typescript');
 const loadTS=async(path,substitutions={})=>{let code=ts.transpileModule(await readFile(sourceRoot+'/'+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;for(const[a,b]of Object.entries(substitutions))code=code.replace(a,b);code+='\n//# sourceURL=reference-'+path;const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');return{module:await import(url),url};};
 const {module:noise,url:noiseUrl}=await loadTS('lib/noise.ts');
 const {module:flow}=await loadTS('lib/flow.ts',{'"./noise"':JSON.stringify(noiseUrl)});
 const {module:field}=await loadTS('lib/field.ts');
 const actual=await import(pathToFileURL(modelPath));
 assert.equal(actual.field.presets.length,7);assert.deepEqual(actual.field.presets,field.PRESETS);
 for(let index=0;index<7;index++)for(const blend of [0,.1,.5,.99,1]){
  const reference=field.makeBlendedField(),sample={deep:new Float32Array(3),mid:new Float32Array(3),hot:new Float32Array(3)};
  field.blendField(reference,field.PRESETS[index],field.PRESETS[Math.min(6,index+1)],blend);sampleField(actual,index,blend,sample);
  for(const key of actual.field.keys)assert.equal(sample[key],reference[key]);
  for(const key of ['deep','mid','hot'])reference[key].forEach((v,i)=>assert.ok(Math.abs(sample[key][i]-v)<1e-7));
 }
 for(const [w,q]of [[699,34000],[700,66000],[1099,66000],[1100,112000],[1699,112000],[1700,138000]])assert.equal(actual.pickCounts(w).points,q);
 assert.deepEqual(actual.pickCounts(1900,true),{points:30000,lines:320,steps:60});assert.equal(actual.pickPixelRatio(3),1.35);assert.equal(actual.pickPixelRatio(2),1.75);
 const count=256,rnd=noise.mulberry32(0x428a2f98),gold={seeds:new Float32Array(count*3),rand:new Float32Array(count*3),tone:new Float32Array(count),scale:new Float32Array(count)};
 for(let i=0;i<count;i++){for(let a=0;a<3;a++)gold.seeds[i*3+a]=(rnd()-.5)*2*[11,8,5][a];for(let a=0;a<3;a++)gold.rand[i*3+a]=rnd();gold.tone[i]=rnd();gold.scale[i]=.42+Math.pow(rnd(),3.1)*2.2+Math.abs(noise.gaussian(rnd))*.1;}
 const got=actual.buildPoints(count);for(const key of Object.keys(gold))assert.deepEqual(got[key],gold[key],key);
 assert.deepEqual(actual.buildStreamlines(32,60),flow.buildStreamlines(32,60));
 const three=await import(pathToFileURL(sourceRoot+'/node_modules/three/build/three.module.js'));
 for(const xyz of [[0,0,10.2],[.24,-.12,9.1],[-.5,.34,10.6]]){
  const camera=new three.PerspectiveCamera(45,1.6,.1,200);camera.position.set(...xyz);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const p=perspective(45,1.6,.1,200),v=lookAtOrigin(...xyz);
  camera.projectionMatrix.elements.forEach((n,i)=>assert.ok(Math.abs(n-p[i])<1e-6));camera.matrixWorldInverse.elements.forEach((n,i)=>assert.ok(Math.abs(n-v[i])<1e-6));
 }
 const pp=await readFile(sourceRoot+'/node_modules/postprocessing/build/index.js','utf8');
 for(const [name,key]of Object.entries({downVertex:'convolution_downsampling_default2',downFragment:'convolution_downsampling_default',upVertex:'convolution_upsampling_default2',upFragment:'convolution_upsampling_default',luminanceFragment:'luminance_default',screenBlend:'screen_default',softLightBlend:'soft_light_default',vignetteFragment:'vignette_default',noiseFragment:'noise_default'}))assert.equal(post[name],new RegExp('var '+key+' = `([\\s\\S]*?)`;').exec(pp)[1],name);
 const {module:shaderModule}=await loadTS('components/field/shaders.ts');for(const key of ['fieldVertexShader','fieldFragmentShader','streamVertexShader','streamFragmentShader'])assert.equal(actual[key],shaderModule[key]);
});

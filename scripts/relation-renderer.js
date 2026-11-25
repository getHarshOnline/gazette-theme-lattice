// World drawing only: Base owns clocks, damping, input, navigation and preferences.
import { perspective, lookAtOrigin, sampleField, srgbToLinear, mipSizes } from './relation-math.js';
import { downVertex, downFragment, upVertex, upFragment, luminanceFragment,
  screenBlend, softLightBlend, vignetteFragment, noiseFragment, colourFunctions } from './relation-post.js';

const lightingKeys = ['bloomIntensity', 'bloomThreshold', 'bloomSmoothing', 'bloomRadius',
  'exposure', 'vignetteOffset', 'vignetteDarkness', 'noiseOpacity'];
const fullscreenVertex = 'in vec3 position;out vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}';
const canvasPixelBudget = 1280 * 720;
const luminance = 'float luminance(vec3 rgb){return dot(rgb,vec3(0.2126,0.7152,0.0722));}\n';
function shaderSource(source, fragment, prefix = '') {
  source = source.replace(/#include <(?:common|colorspace_fragment)>/g, '')
    .replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, fragment ? 'in' : 'out')
    .replace(/\btexture2D\b/g, 'texture').replace(/\bgl_FragColor\b/g, 'outColor');
  if (!fragment && /\bposition\b/.test(source) && !/\bin\s+vec3\s+position\b/.test(source)) prefix += 'in vec3 position;\n';
  return '#version 300 es\nprecision highp float;\n' + (fragment ? 'out vec4 outColor;\n' : '') + prefix + source;
}
const compositeFragment = `in vec2 vUv;uniform sampler2D sceneBuffer;uniform sampler2D bloomBuffer;
uniform float intensity;uniform float offset;uniform float darkness;uniform float noiseOpacity;uniform float time;
${colourFunctions}
${screenBlend.replace(/\bblend\b/g, 'screenBlend')}
${softLightBlend.replace(/\bblend\b/g, 'softLightBlend')}
${vignetteFragment.replace('uniform float offset;uniform float darkness;', '').replace(/\bmainImage\b/g, 'vignette')}
${noiseFragment.replace(/\bmainImage\b/g, 'grain')}
void main(){
 vec4 colour=screenBlend(texture(sceneBuffer,vUv),texture(bloomBuffer,vUv)*intensity,1.);
 colour.rgb=ACESFilmicToneMapping(colour.rgb);
 vec4 next;vignette(colour,vUv,next);colour=next;
 grain(colour,vUv,next);colour=softLightBlend(colour,next,noiseOpacity);
 colour.a=clamp(colour.a,0.,1.);outColor=sRGBTransferOETF(colour);
}`;

/**
 * render(frame): explicit size in CSS px + resolved DPR; elapsed time; index/blend;
 * intro, smoothed pointerX/Y, decayed velocity, damped cameraX/Y/Z and streamOpacity;
 * pointerCameraZ preserves the source's pre-camera-update pointer projection;
 * parallaxX/Y are Base-resolved streamline offsets. No layout reads or owned RAF.
 * Returns null during shader startup, true while a drawn frame is available, and false if unavailable.
 */
export function createRelationRenderer(model, options = {}) {
  const lighting = options.lighting;
  if (!lighting || lightingKeys.some(key => !Number.isFinite(lighting[key]))) throw new Error('Complete field lighting tokens required');
  if (!Array.isArray(options.ground) || options.ground.length !== 3
      || !options.ground.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
    throw new Error('Resolved field ground required');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false,
    stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 field renderer unavailable');
  let disposed = false, lost = false, initialized = false, lastFrame = null, population = null;
  let submittedFrame = null;
  let programs = [], buffers = [], textures = [], framebuffers = [];
  const shaders = new Map();
  let parallelCompile;
  let points, streams, down, up, threshold, composite, triangle, scene, bright, downMips, upMips;
  let width = 0, height = 0, density = 1;
  const field = model.field;
  const background = options.ground.map(srgbToLinear);
  const state = { deep: new Float32Array(3), mid: new Float32Array(3), hot: new Float32Array(3) };
  const projection = new Float32Array(16), view = new Float32Array(16);
  const pointer = new Float32Array(3), parallax = new Float32Array(2), texel = new Float32Array(2);

  function release() {
    if (!gl.isContextLost()) {
      if (submittedFrame) gl.deleteSync(submittedFrame);
      for (const value of shaders.values()) gl.deleteShader(value);
      for (const value of programs) gl.deleteProgram(value.handle);
      for (const value of buffers) gl.deleteBuffer(value);
      for (const value of textures) gl.deleteTexture(value);
      for (const value of framebuffers) gl.deleteFramebuffer(value);
    }
    submittedFrame = null;
    shaders.clear(); programs = []; buffers = []; textures = []; framebuffers = [];
    parallelCompile = null;
    initialized = false; width = height = 0;
  }
  function compile(type, source) {
    const key = type + ':' + source;
    const retained = shaders.get(key);
    if (retained) return retained;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Cannot allocate field shader');
    shaders.set(key, shader); gl.shaderSource(shader, source); gl.compileShader(shader);
    return shader;
  }
  function program(vertex, fragment, vertexPrefix = '', fragmentPrefix = vertexPrefix) {
    const handle = gl.createProgram();
    if (!handle) throw new Error('Cannot allocate field program');
    const p = { handle, uniforms: new Map(), attributes: [] }; programs.push(p);
    const vs = compile(gl.VERTEX_SHADER, shaderSource(vertex, false, vertexPrefix));
    const fs = compile(gl.FRAGMENT_SHADER, shaderSource(fragment, true, fragmentPrefix));
    p.shaders = [vs, fs];
    gl.attachShader(handle, vs); gl.attachShader(handle, fs); gl.linkProgram(handle);
    return p;
  }
  function validateProgram(p) {
    if (!gl.getProgramParameter(p.handle, gl.LINK_STATUS)) {
      const shaderErrors = p.shaders.map(shader => gl.getShaderInfoLog(shader)).filter(Boolean);
      throw new Error([gl.getProgramInfoLog(p.handle), ...shaderErrors].filter(Boolean).join('\n') || 'Field program link failed');
    }
    for (const shader of p.shaders) gl.detachShader(p.handle, shader);
    p.shaders = [];
  }
  function buffer(data) {
    const value = gl.createBuffer();
    if (!value) throw new Error('Cannot allocate field geometry');
    buffers.push(value); gl.bindBuffer(gl.ARRAY_BUFFER, value); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return value;
  }
  function attribute(p, name, value, size) {
    p.attributes.push({ location: gl.getAttribLocation(p.handle, name), buffer: value, size });
  }
  function use(p) {
    gl.useProgram(p.handle);
    for (const a of p.attributes) if (a.location >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer); gl.enableVertexAttribArray(a.location);
      gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, 0, 0);
    }
  }
  function uniform(p, name, value, integer = false) {
    if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.handle, name));
    const location = p.uniforms.get(name); if (location === null) return;
    if (integer) gl.uniform1i(location, value);
    else if (typeof value === 'number') gl.uniform1f(location, value);
    else if (value.length === 16) gl.uniformMatrix4fv(location, false, value);
    else if (value.length === 3) gl.uniform3fv(location, value);
    else gl.uniform2fv(location, value);
  }
  function draw(p, kind, count) {
    gl.drawArrays(kind, 0, count);
    for (const a of p.attributes) if (a.location >= 0) gl.disableVertexAttribArray(a.location);
  }
  function target() {
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    if (texture) textures.push(texture); if (framebuffer) framebuffers.push(framebuffer);
    if (!texture || !framebuffer) throw new Error('Cannot allocate field render target');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer, width: 0, height: 0 };
  }
  function allocate(t, w, h) {
    if (t.width === w && t.height === h) return;
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Half-float field framebuffer incomplete');
    t.width = w; t.height = h;
  }
  function preparePrograms() {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Half-float field rendering unavailable');
    parallelCompile = gl.getExtension('KHR_parallel_shader_compile');
    points = program(model.fieldVertexShader, model.fieldFragmentShader, 'uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;\n');
    streams = program('attribute vec3 position;\n'+model.streamVertexShader,model.streamFragmentShader,'uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;\n');
    down = program(downVertex,downFragment,'#define FRAMEBUFFER_PRECISION_HIGH\n');
    up = program(upVertex,upFragment,'#define FRAMEBUFFER_PRECISION_HIGH\n');
    threshold = program(fullscreenVertex,luminanceFragment,'','#define FRAMEBUFFER_PRECISION_HIGH\n#define THRESHOLD\n#define COLOR\n'+luminance);
    composite = program(fullscreenVertex,compositeFragment,'','#define VIGNETTE_TECHNIQUE 0\n#define PREMULTIPLY\n');
  }
  function programsReady() {
    if (parallelCompile && !programs.every(p => gl.getProgramParameter(p.handle, parallelCompile.COMPLETION_STATUS_KHR))) return false;
    for (const p of programs) validateProgram(p);
    for (const shader of shaders.values()) gl.deleteShader(shader);
    shaders.clear();
    return true;
  }
  function initialize(frame) {
    if (!population) population = model.pickCounts(frame.size.width, frame.reduced === true);
    const pointData = model.buildPoints(population.points);
    for (const [name, data, size] of [['aSeed',pointData.seeds,3],['aRand',pointData.rand,3],['aTone',pointData.tone,1],['aScale',pointData.scale,1]]) attribute(points,name,buffer(data),size);
    points.count = pointData.count;
    const paths = model.buildStreamlines(population.lines,population.steps);
    for (const [name,data,size] of [['position',paths.positions,3],['aAlong',paths.along,1],['aSeed',paths.seed,1],['aTone',paths.tone,1]]) attribute(streams,name,buffer(data),size);
    streams.count = paths.vertexCount;
    triangle = buffer(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]));
    for (const p of [down,up,threshold,composite]) attribute(p,'position',triangle,3);
    scene = target(); bright = target();
    downMips = Array.from({length:field.bloomLevels},target);
    upMips = Array.from({length:field.bloomLevels-1},target);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.DITHER);
    initialized = true;
  }
  function resize(frame) {
    // Keep touch scrolling responsive. The field is a background and its reading layers are HTML.
    const requestedDensity = frame.pointerEnabled === false ? Math.min(1, frame.size.pixelRatio) : frame.size.pixelRatio;
    density = Math.min(requestedDensity, Math.sqrt(canvasPixelBudget / (frame.size.width * frame.size.height)));
    const w = Math.max(1, Math.floor(frame.size.width * density));
    const h = Math.max(1, Math.floor(frame.size.height * density));
    if (w === width && h === height) return;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (w > limit || h > limit) throw new Error('Field render size exceeds GPU limit');
    canvas.width = w; canvas.height = h;
    allocate(scene,w,h); allocate(bright,w,h);
    const sizes = mipSizes(w,h,field.bloomLevels);
    sizes.forEach(([mw,mh],i) => {allocate(downMips[i],mw,mh);if(upMips[i])allocate(upMips[i],mw,mh);});
    width=w;height=h;
  }
  function bind(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER,t?.framebuffer ?? null);
    gl.viewport(0,0,t?.width ?? width,t?.height ?? height);
  }
  function texture(p,name,t,unit) {
    gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t.texture); uniform(p,name,unit,true);
  }
  function common(p,frame) {
    use(p); uniform(p,'projectionMatrix',projection);uniform(p,'modelViewMatrix',view);
    uniform(p,'uTime',frame.time);uniform(p,'uIntro',frame.intro);
    uniform(p,'uDeep',state.deep);uniform(p,'uMid',state.mid);uniform(p,'uHot',state.hot);
  }
  function render(frame) {
    if(disposed || lost || gl.isContextLost())return false;
    const numeric=['time','index','blend','intro','pointerX','pointerY','velocity','cameraX','cameraY','cameraZ','pointerCameraZ','streamOpacity','parallaxX','parallaxY'];
    if (!frame?.size || numeric.some(key=>!Number.isFinite(frame[key])) || !['width','height','pixelRatio'].every(key=>Number.isFinite(frame.size[key])&&frame.size[key]>0)) throw new Error('Complete finite field frame required');
    lastFrame={...frame,size:{...frame.size}};
    try {
      // Keep the last image while the renderer finishes its previous submission.
      if (submittedFrame) {
        const status = gl.clientWaitSync(submittedFrame, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return true;
        gl.deleteSync(submittedFrame);
        submittedFrame = null;
        if (status === gl.WAIT_FAILED) throw new Error('Field frame completion check failed');
      }
      if (!initialized) {
        if (!programs.length) {
          preparePrograms();
          // Keep the direct startup on drivers without asynchronous completion.
          if (parallelCompile) return null;
        }
        if (!programsReady()) return null;
        initialize(frame);
      }
      resize(frame);
      sampleField(model,frame.index,frame.blend,state);
      perspective(field.cameraFov,width/height,field.cameraNear,field.cameraFar,projection);
      lookAtOrigin(frame.cameraX,frame.cameraY,frame.cameraZ,view);
      const halfH=Math.tan(field.cameraFov*Math.PI/360)*frame.pointerCameraZ;
      pointer[0]=frame.pointerX*halfH*width/height;pointer[1]=frame.pointerY*halfH;pointer[2]=0;
      parallax[0]=frame.parallaxX;parallax[1]=frame.parallaxY;
      bind(scene);gl.clearColor(...background,1);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE);
      common(streams,frame);uniform(streams,'uOpacity',frame.streamOpacity);uniform(streams,'uParallax',parallax);draw(streams,gl.LINES,streams.count);
      common(points,frame);
      for(const key of field.keys)uniform(points,'u'+key[0].toUpperCase()+key.slice(1),state[key]);
      uniform(points,'uSize',Math.max(field.pointSize.minimum,Math.min(field.pointSize.maximum,frame.size.height/field.pointSize.reference)));
      uniform(points,'uPixelRatio',Math.min(density,2));uniform(points,'uVelocity',frame.velocity);uniform(points,'uMouse',pointer);
      uniform(points,'uMouseForce',frame.pointerEnabled===false ? 0 : state.mouseForce);draw(points,gl.POINTS,points.count);
      gl.disable(gl.BLEND);
      bind(bright);use(threshold);texture(threshold,'inputBuffer',scene,0);
      uniform(threshold,'threshold',lighting.bloomThreshold);uniform(threshold,'smoothing',lighting.bloomSmoothing);draw(threshold,gl.TRIANGLES,3);
      let previous=bright;
      for(const mip of downMips){bind(mip);use(down);texture(down,'inputBuffer',previous,0);texel[0]=1/previous.width;texel[1]=1/previous.height;uniform(down,'texelSize',texel);draw(down,gl.TRIANGLES,3);previous=mip;}
      for(let i=upMips.length-1;i>=0;i--){const mip=upMips[i];bind(mip);use(up);texture(up,'inputBuffer',previous,0);texture(up,'supportBuffer',downMips[i],1);texel[0]=1/previous.width;texel[1]=1/previous.height;uniform(up,'texelSize',texel);uniform(up,'radius',lighting.bloomRadius);draw(up,gl.TRIANGLES,3);previous=mip;}
      bind(null);use(composite);texture(composite,'sceneBuffer',scene,0);texture(composite,'bloomBuffer',previous,1);
      uniform(composite,'intensity',lighting.bloomIntensity);uniform(composite,'toneMappingExposure',lighting.exposure);
      uniform(composite,'offset',lighting.vignetteOffset);uniform(composite,'darkness',lighting.vignetteDarkness);
      uniform(composite,'noiseOpacity',lighting.noiseOpacity);uniform(composite,'time',frame.time);draw(composite,gl.TRIANGLES,3);
      submittedFrame = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!submittedFrame) throw new Error('Cannot track field frame completion');
      gl.flush();
      return true;
    } catch(error) {release();options.onError?.(error);throw error;}
  }
  function contextLost(event){event.preventDefault();lost=true;release();options.onLost?.();}
  function contextRestored(){if(disposed)return;lost=false;try{if(lastFrame)render(lastFrame);options.onRestored?.();}catch(error){/* render reports failure and keeps the fallback visible. */}}
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  return {canvas,render,dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);release();lastFrame=null;gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}

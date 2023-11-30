import { GUI } from 'lil-gui';
import SwissGL from '@/swissgl';
import type { glsl, GL, Params, Target, TargetResult } from '@/swissgl';
import demos from './index.js';
import glsl_include from './include.glsl';

export type Demos = typeof demos;
export type DemoName = keyof Demos;
export type Demo = Demos[DemoName];

export const $ = (s: string) => document.querySelector(s) as HTMLElement;
function setDisplay(el: string, val: string) {
  if ($(el)) $(el).style.display = val;
}

const keys = Object.keys(demos) as DemoName[];
const singleMode = keys.length == 1;
const defaultDemo = singleMode ? keys[0] : 'ParticleLife3d';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: true,
  xrCompatible: true,
})!;
const glsl = SwissGL(gl);
let demo: InstanceType<Demo> | null = null;
let gui: GUI | null = null;

let xrDemos = Object.values(demos).filter(f => 'Tags' in f && f.Tags.includes('3d'));
let xrSession: XRSession | null = null;
let xrRefSpace: XRReferenceSpace | null = null;
let xrPose: XRViewerPose | null = null;
let lookUpStartTime = 0;
let haveAR = false;
let haveVR = false;
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    haveVR = supported;
    updateVRButtons();
  });
  navigator.xr.isSessionSupported('immersive-ar').then(supported => {
    haveAR = supported;
    updateVRButtons();
  });
}

let viewParams = {
  DPR: window.devicePixelRatio,
  canvasSize: new Float32Array(2),
  pointer: new Float32Array(3),
  cameraYPD: new Float32Array(3),
  xrRay: new Float32Array(16 * 2),
  xrRayInv: new Float32Array(16 * 2),
  xrButton: new Float32Array(4 * 2),
};
resetCamera();

function withCamera(params: Params, target?: Target | null): TargetResult | undefined {
  params = { ...params, Inc: [glsl_include].concat(params.Inc || []) };
  if (target || !params.xrMode) {
    return glsl(params, target);
  }
  delete params.Aspect;
  let glLayer = xrSession!.renderState.baseLayer!;
  target = {
    bindTarget: (gl: GL) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      return [glLayer.framebufferWidth, glLayer.framebufferHeight];
    },
  };
  for (let view of xrPose!.views) {
    const vp = glLayer.getViewport(view)!;
    params.View = [vp.x, vp.y, vp.width, vp.height];
    params.xrProjectionMatrix = view.projectionMatrix;
    params.xrViewMatrix = view.transform.inverse.matrix;
    let { x, y, z } = view.transform.position;
    params.xrPosition = [x, y, z];
    glsl(params, target);
  }
}

function setPointer(e: PointerEvent, buttons: number) {
  const [w, h] = viewParams.canvasSize;
  const [x, y] = [e.offsetX - w / 2, h / 2 - e.offsetY];
  viewParams.pointer.set([x, y, buttons]);
  return [x, y];
}
canvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary) return;
  setPointer(e, e.buttons);
});
canvas.addEventListener('pointerout', e => setPointer(e, 0));
canvas.addEventListener('pointerup', e => setPointer(e, 0));
canvas.addEventListener('pointermove', e => {
  const [px, py, _] = viewParams.pointer;
  const [x, y] = setPointer(e, e.buttons);
  if (!e.isPrimary || e.buttons != 1) return;
  let [yaw, pitch, dist] = viewParams.cameraYPD;
  yaw -= (x - px) * 0.01;
  pitch += (y - py) * 0.01;
  pitch = Math.min(Math.max(pitch, 0), Math.PI);
  viewParams.cameraYPD.set([yaw, pitch, dist]);
});

let name = location.hash.slice(1);
if (!(name in demos)) {
  name = defaultDemo;
}
runDemo(name as DemoName);
populatePreviews();

requestAnimationFrame(frame);

function resetCamera() {
  viewParams.cameraYPD.set([(Math.PI * 3) / 4, Math.PI / 4, 1.8]);
}

function frame(t: number) {
  requestAnimationFrame(frame);
  if (xrSession) return; // skip canvas frames when XR is running
  glsl.adjustCanvas();
  viewParams.canvasSize.set([canvas.clientWidth, canvas.clientHeight]);
  viewParams.DPR = window.devicePixelRatio;

  demo!.frame(withCamera, {
    time: t / 1000.0,
    xrMode: false,
    ...viewParams,
  });
}

function xrFrameCallback(t: number, xrFrame: XRFrame) {
  xrSession!.requestAnimationFrame(xrFrameCallback);
  xrPose = xrFrame.getViewerPose(xrRefSpace!)!;
  if (!xrPose) return;
  viewParams.xrRay.fill(0.0);
  viewParams.xrRayInv.fill(0.0);
  viewParams.xrButton.fill(0.0);
  const params = { time: t / 1000.0, xrMode: true, ...viewParams };
  for (let i = 0; i < 2; ++i) {
    const inputSource = xrSession!.inputSources[i];
    if (inputSource && inputSource.gamepad && inputSource.gamepad.buttons) {
      inputSource.gamepad.buttons.forEach((btn, btnIdx) => {
        // if (btnIdx < 4) viewParams.xrButton[i * 4 + btnIdx] = btn.value || btn.pressed;
        if (btnIdx < 4) viewParams.xrButton[i * 4 + btnIdx] = btn.value || btn.pressed ? 1 : 0;
      });
    }
    if (!inputSource || !inputSource.targetRaySpace) continue;
    const pose = xrFrame.getPose(inputSource.targetRaySpace, xrRefSpace!);
    if (!pose) continue;
    viewParams.xrRay.set(pose.transform.matrix, i * 16);
    viewParams.xrRayInv.set(pose.transform.inverse.matrix, i * 16);
  }

  demo!.frame(withCamera, params);
  withCamera({
    ...params,
    Mesh: [20, 20],
    Grid: [2],
    DepthTest: 1,
    VP: `
varying vec3 p = uv2sphere(UV);
varying vec4 buttons = xrButton[ID.x];
VPos = wld2proj(xrRay[ID.x]*vec4(p*vec3(0.02, 0.02, 0.1),1));`,
    FP: `
vec3 c = p*0.5+0.5;
FOut = vec4(c*0.5,1);
float b = c.z*4.0;
if (b<4.0 && buttons[int(b)]>fract(b)) FOut += 0.5;`,
  });

  const lookUpCoef = -xrPose.transform.matrix[10];
  if (!singleMode && lookUpCoef > 0.5) {
    const dt = (t - lookUpStartTime) / 1000;
    if (dt > 1) {
      lookUpStartTime = t;
      let i = xrDemos.indexOf(demo!.constructor as Demo);
      i = (i + 1) % xrDemos.length;
      runDemo(xrDemos[i].name as DemoName);
    } else {
      withCamera({
        ...params,
        Mesh: [20, 20],
        dt,
        DepthTest: 1,
        VP: `
vec3 p = uv2sphere(UV)*0.6*clamp(1.0-dt, 0.0, 0.8) + vec3(-2.0, 0.0, 3.0);
VPos = wld2proj(vec4(p,1));`,
        FP: `UV,0.5,1`,
      });
    }
  } else {
    lookUpStartTime = t;
  }
}

function toggleXR(xr: 'ar' | 'vr') {
  if (!xrSession) {
    navigator.xr!.requestSession(`immersive-${xr}`).then(session => {
      xrSession = session;
      session.addEventListener('end', () => {
        xrSession = null;
      });
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, glsl.gl) });
      session.requestReferenceSpace('local').then(refSpace => {
        xrRefSpace = refSpace.getOffsetReferenceSpace(
          new XRRigidTransform(
            { x: 0, y: -0.25, z: -1.0, w: 1 }, // position offset
            { x: 0.5, y: 0.5, z: 0.5, w: -0.5 },
          ), // rotate z up
        );
        session.requestAnimationFrame(xrFrameCallback);
      });
    });
  } else {
    xrSession.end();
  }
}

function runDemo(name: DemoName) {
  if (demo) {
    if (gui) gui.destroy();
    if ('free' in demo) demo.free();
    glsl.reset();
    demo = gui = null;
  }
  if (!singleMode) location.hash = name;
  gui = new GUI({ container: $('#gui') });
  gui.hide();
  demo = new demos[name](withCamera, gui);
  if (gui && gui.controllers.length == 0) {
    gui.destroy();
    gui = null;
  }
  setDisplay('#settingButton', gui ? 'block' : 'none');
  if ($('#sourceLink')) {
    ($('#sourceLink') as HTMLAnchorElement).href =
      `https://github.com/pluvial/swissgl/blob/main/demo/${name}.js`;
  }
  updateVRButtons();
  resetCamera();
}

function updateVRButtons() {
  setDisplay('#vrButton', 'none');
  setDisplay('#arButton', 'none');
  const tags = demo && (demo.constructor as any).Tags;
  if (tags && tags.includes('3d')) {
    if (haveVR) setDisplay('#vrButton', 'block');
    if (haveAR) setDisplay('#arButton', 'block');
  }
}

function populatePreviews() {
  const panel = document.getElementById('cards');
  if (!panel) return;
  keys.forEach(name => {
    const el = document.createElement('div');
    el.classList.add('card');
    el.innerHTML = `<img src="/demo/preview/${name}.jpg">${name}`;
    el.addEventListener('click', () => runDemo(name));
    panel.appendChild(el);
  });
}

// helper function to render demo preview images
export function genPreviews() {
  const panel = document.getElementById('cards') as HTMLDivElement;
  panel.innerHTML = '';
  const canvas = document.createElement('canvas') as HTMLCanvasElement;
  canvas.width = 400;
  canvas.height = 300;
  const glsl = SwissGL(canvas);
  const withCamera: glsl = (params, target) =>
    glsl({ ...params, Inc: [glsl_include].concat(params.Inc || []) }, target);
  keys.forEach(name => {
    if (name == 'Spectrogram') return;
    const dummyGui = new GUI();
    const demo = new demos[name](withCamera, dummyGui) as InstanceType<Demo>;
    dummyGui.destroy();
    resetCamera();
    for (let i = 0; i < 60 * 5; ++i) {
      withCamera({ Clear: 0 }, '');
      demo.frame(withCamera, { time: i / 60.0, ...viewParams });
    }
    const el = document.createElement('div');
    const data = canvas.toDataURL('image/jpeg', 0.95);
    el.innerHTML = `
<a href="${data}" download="${name}.jpg"><img src="${data}"></a>
${name}`;
    panel.appendChild(el);
    if ('free' in demo) demo.free();
    glsl.reset();
  });
}

function toggleGui() {
  if (!gui) return;
  const style = gui.domElement.style;
  style.display = style.display == 'none' ? '' : 'none';
}

function fullscreen() {
  const f =
    canvas.requestFullscreen ||
    ((canvas as any).webkitRequestFullscreen as typeof canvas.requestFullscreen);
  if (f) f.apply(canvas);
}

function toggleVR() {
  toggleXR('vr');
}
function toggleAR() {
  toggleXR('ar');
}
const showAbout = () => {
  $('#about').style.display = 'block';
};
const hideAbout = () => {
  $('#about').style.display = 'none';
};

Object.assign(window, {
  fullscreen,
  toggleGui,
  toggleVR,
  toggleAR,
  showAbout,
  hideAbout,
});

//hideAbout();
$('#demo').addEventListener('pointerdown', () => {
  hideAbout();
  if (window.innerWidth < 500) {
    // close menu on small screens
    $('#panel').removeAttribute('open');
  }
});
$('#panel').addEventListener('click', hideAbout);

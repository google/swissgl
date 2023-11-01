<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import SwissGL, { type GL, type WrappedSwissGL } from '$lib/index.js';
	import demos from '../demos/index.js';
	import glsl_include from '../demos/include.glsl?raw';

	export let defaultDemo = 'ParticleLife3d';

	let GUI: (typeof import('lil-gui'))['GUI'];

	let canvas: HTMLCanvasElement;
	let panel: HTMLDetailsElement;
	let cards: HTMLDivElement;
	let vrButton: HTMLButtonElement;
	let arButton: HTMLButtonElement;
	let settingButton: HTMLButtonElement;
	let sourceLink: HTMLAnchorElement;
	let guiContainer: HTMLDivElement;
	let about: HTMLDivElement;

	const keys = Object.keys(demos);
	const singleMode = keys.length == 1;
	if (singleMode) {
		defaultDemo = keys[0];
	}

	type Demos = typeof demos;
	type DemoClass = Demos[keyof Demos];
	type Demo = InstanceType<DemoClass>;

	let glsl: SwissGL;
	let demo: Demo | null = null;
	let gui: InstanceType<(typeof import('lil-gui'))['GUI']> | null = null;

	let xrDemos = Object.values(demos).filter((f) => 'Tags' in f && f.Tags.includes('3d'));
	let xrSession: XRSession | null = null;
	let xrRefSpace: XRReferenceSpace | null = null;
	let xrPose: any = null;
	let lookUpStartTime = 0;
	let haveVR = false;
	let haveAR = false;
	let viewParams = {
		canvasSize: new Float32Array(2),
		pointer: new Float32Array(3),
		cameraYPD: new Float32Array(3),
		xrRay: new Float32Array(16 * 2),
		xrRayInv: new Float32Array(16 * 2),
		xrButton: new Float32Array(4 * 2)
	};
	let withCamera: WrappedSwissGL;

	let raf: ReturnType<typeof requestAnimationFrame>;
	onMount(async () => {
		({ GUI } = await import('lil-gui'));
		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: true,
			xrCompatible: true
		}) as WebGL2RenderingContext;
		glsl = SwissGL(gl);
		if (navigator.xr) {
			navigator.xr.isSessionSupported('immersive-vr').then((supported: boolean) => {
				haveVR = supported;
				updateVRButtons();
			});
			navigator.xr.isSessionSupported('immersive-ar').then((supported: boolean) => {
				haveAR = supported;
				updateVRButtons();
			});
		}

		resetCamera();

		withCamera = glsl.hook((glsl, params, target) => {
			params = { ...params, Inc: glsl_include + (params.Inc || '') };
			if (target || !params.xrMode) {
				return glsl(params, target);
			}
			delete params.Aspect;
			let glLayer = xrSession!.renderState.baseLayer!;
			target = {
				bindTarget: (gl: GL) => {
					gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
					return [glLayer.framebufferWidth, glLayer.framebufferHeight];
				}
			};
			for (let view of xrPose.views) {
				const vp = glLayer.getViewport(view)!;
				params.View = [vp.x, vp.y, vp.width, vp.height];
				params.xrProjectionMatrix = view.projectionMatrix;
				params.xrViewMatrix = view.transform.inverse.matrix;
				let { x, y, z } = view.transform.position;
				params.xrPosition = [x, y, z];
				glsl(params, target);
			}
		});

		let name = location.hash.slice(1);
		if (!(name in demos)) {
			name = defaultDemo;
		}
		runDemo(name);

		raf = requestAnimationFrame(frame);
	});

	onDestroy(() => raf && cancelAnimationFrame(raf));

	function setDisplay(el: HTMLElement, val: string) {
		el.style.display = val;
	}

	function resetCamera() {
		viewParams.cameraYPD.set([(Math.PI * 3) / 4, Math.PI / 4, 1.8]);
	}

	function frame(t: number) {
		raf = requestAnimationFrame(frame);
		if (xrSession) return; // skip canvas frames when XR is running
		glsl.adjustCanvas(1); // fix devicePixelRatio to 1
		viewParams.canvasSize.set([canvas.clientWidth, canvas.clientHeight]);

		demo!.frame(withCamera, {
			time: t / 1000.0,
			xrMode: false,
			...viewParams
		});
	}

	function xrFrameCallback(t: number, xrFrame: XRFrame) {
		xrSession!.requestAnimationFrame(xrFrameCallback);
		xrPose = xrFrame.getViewerPose(xrRefSpace!);
		if (!xrPose) return;
		viewParams.xrRay.fill(0.0);
		viewParams.xrRayInv.fill(0.0);
		viewParams.xrButton.fill(0.0);
		const params = { time: t / 1000.0, xrMode: true, ...viewParams };
		for (let i = 0; i < 2; ++i) {
			const inputSource = xrSession!.inputSources[i];
			if (inputSource && inputSource.gamepad && inputSource.gamepad.buttons) {
				inputSource.gamepad.buttons.forEach((btn, btnIdx) => {
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
if (b<4.0 && buttons[int(b)]>fract(b)) FOut += 0.5;`
		});

		const lookUpCoef = -xrPose.transform.matrix[10];
		if (!singleMode && lookUpCoef > 0.5) {
			const dt = (t - lookUpStartTime) / 1000;
			if (dt > 1) {
				lookUpStartTime = t;
				let i = xrDemos.indexOf(demo!.constructor as DemoClass);
				i = (i + 1) % xrDemos.length;
				runDemo(xrDemos[i].name);
			} else {
				withCamera({
					...params,
					Mesh: [20, 20],
					dt,
					DepthTest: 1,
					VP: `
vec3 p = uv2sphere(UV)*0.6*clamp(1.0-dt, 0.0, 0.8) + vec3(-2.0, 0.0, 3.0);
VPos = wld2proj(vec4(p,1));`,
					FP: `UV,0.5,1`
				});
			}
		} else {
			lookUpStartTime = t;
		}
	}

	function toggleXR(xr: 'vr' | 'ar') {
		if (!xrSession) {
			navigator.xr!.requestSession(`immersive-${xr}`).then((session) => {
				xrSession = session;
				session.addEventListener('end', () => {
					xrSession = null;
				});
				session.updateRenderState({ baseLayer: new XRWebGLLayer(session, glsl.gl) });
				session.requestReferenceSpace('local').then((refSpace) => {
					xrRefSpace = refSpace.getOffsetReferenceSpace(
						new XRRigidTransform(
							{ x: 0, y: -0.25, z: -1.0, w: 1 }, // position offset
							{ x: 0.5, y: 0.5, z: 0.5, w: -0.5 }
						) // rotate z up
					);
					session.requestAnimationFrame(xrFrameCallback);
				});
			});
		} else {
			xrSession.end();
		}
	}

	function toggleVR() {
		toggleXR('vr');
	}
	function toggleAR() {
		toggleXR('ar');
	}

	const showAbout = () => {
		about.style.display = 'block';
	};
	const hideAbout = () => {
		about.style.display = 'none';
	};

	function runDemo(name: string) {
		if (demo) {
			if (gui) gui.destroy();
			if ('free' in demo) demo.free();
			glsl.reset();
			demo = gui = null;
		}
		if (!singleMode) location.hash = name;
		gui = new GUI({ container: guiContainer });
		gui.domElement.id = 'gui';
		gui.hide();
		demo = new demos[name as keyof Demos](withCamera, gui);
		if (gui && gui.controllers.length == 0) {
			gui.destroy();
			gui = null;
		}
		setDisplay(settingButton, gui ? 'block' : 'none');
		if (sourceLink) {
			sourceLink.href = `https://github.com/jpaquim/swissgl/blob/main/src/demos/${name}.js`;
		}
		updateVRButtons();
		resetCamera();
	}

	function updateVRButtons() {
		setDisplay(vrButton, 'none');
		setDisplay(arButton, 'none');
		const constructor = demo!.constructor as DemoClass;
		const tags = demo && 'Tags' in constructor && constructor.Tags;
		if (tags && tags.includes('3d')) {
			if (haveVR) setDisplay(vrButton, 'block');
			if (haveAR) setDisplay(arButton, 'block');
		}
	}

	// helper function to render demo preview images
	function genPreviews() {
		cards.innerHTML = '';
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 300;
		const glsl = SwissGL(canvas);
		const withCamera = glsl.hook((glsl, p, t) =>
			glsl({ ...p, Inc: glsl_include + (p.Inc || '') }, t)
		);
		Object.keys(demos).forEach((name) => {
			if (name == 'Spectrogram') return;
			const dummyGui = new GUI();
			const demo = new demos[name as keyof Demos](withCamera, dummyGui);
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
			cards.appendChild(el);
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
		canvas.requestFullscreen();
	}

	function setPointer(e: PointerEvent, buttons: number) {
		const [w, h] = viewParams.canvasSize;
		const [x, y] = [e.offsetX - w / 2, h / 2 - e.offsetY];
		viewParams.pointer.set([x, y, buttons]);
		return [x, y];
	}
</script>

<details bind:this={panel} on:click={hideAbout} open>
	<summary><a href="https://github.com/jpaquim/swissgl">SwissGL</a> demos</summary>
	<div class="cards" bind:this={cards}>
		{#each Object.keys(demos) as name}
			<div class="card" on:click={() => runDemo(name)}><img src="/preview/{name}.jpg" />{name}</div>
		{/each}
	</div>
	});
</details>
<div
	class="demo"
	on:pointerdown={() => {
		hideAbout();
		if (window.innerWidth < 500) {
			// close menu on small screens
			panel.removeAttribute('open');
		}
	}}
>
	<canvas
		width="640"
		height="360"
		bind:this={canvas}
		on:pointerdown={(e) => {
			if (!e.isPrimary) return;
			setPointer(e, e.buttons);
		}}
		on:pointerout={(e) => setPointer(e, 0)}
		on:pointerup={(e) => setPointer(e, 0)}
		on:pointermove={(e) => {
			const [px, py, _] = viewParams.pointer;
			const [x, y] = setPointer(e, e.buttons);
			if (!e.isPrimary || e.buttons != 1) return;
			let [yaw, pitch, dist] = viewParams.cameraYPD;
			yaw -= (x - px) * 0.01;
			pitch += (y - py) * 0.01;
			pitch = Math.min(Math.max(pitch, 0), Math.PI);
			viewParams.cameraYPD.set([yaw, pitch, dist]);
		}}
	>
	</canvas>
	<div class="buttons">
		<button bind:this={vrButton} on:click={toggleVR} class="vrButton" title="VR">VR</button>
		<button bind:this={arButton} on:click={toggleAR} class="arButton" title="AR">AR</button>
		<button
			bind:this={settingButton}
			on:click={toggleGui}
			class="settingButton"
			style:display="block"
			style:font-size="180%"
			title="settings">⛯</button
		>
		<a bind:this={sourceLink} class="sourceLink" href="" target="_blank"
			><button title="source code">&lt;&gt;</button></a
		>
		<button title="fullscreen" on:click={fullscreen}>⛶</button>
	</div>
</div>
<button class="aboutButton" on:click={showAbout} title="about">?</button>
<div bind:this={about} class="about">
	<p>
		<a href="https://github.com/google/swissgl"><b>SwissGL</b></a>
		is a prototype of a minimal yet expressive GPU library built on WebGL2. A single
		<nobr>"glsl()"</nobr> function runs GLSL code snippets on the GPU and manages the resulting texture
		buffers.
	</p>
	<p>
		This page contains a few demos built using the library. Click the <nobr>"&lt;&gt;"</nobr> button
		to see the source of the current example.
	</p>
	<button style="font-size: 20px; margin: auto;" on:click={hideAbout}>hide</button>
</div>
<div bind:this={guiContainer} class="gui"></div>

<style>
	:global(body) {
		box-sizing: border-box;
		background: black;
		margin: 0px;
		color: white;
		overflow: hidden;
		font-family: 'Roboto Mono', monospace;
		user-select: none;
	}

	details {
		width: 200px;
		position: fixed;
		background: rgba(0, 0, 0, 0.5);
	}

	details summary {
		padding: 8px;
	}

	.cards {
		overflow: auto;
		height: 95vh;
	}

	:global(.card) {
		padding: 4px;
		margin: 8px;
		border: 1px solid grey;
		border-radius: 5px;
		font-size: 14px;
	}

	details :global(img) {
		max-width: 100%;
	}

	.demo {
		width: 100%;
		height: 100vh;
	}

	canvas {
		width: 100%;
		height: 100%;
		background: black;
		touch-action: none;
	}

	.gui {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 0;
		z-index: 0;
	}

	:global(#gui) {
		position: fixed;
		bottom: 0px;
		right: 70px;
	}

	.buttons {
		position: fixed;
		bottom: 10px;
		right: 10px;
	}

	button {
		appearance: none;
		min-width: 48px;
		height: 40px;
		height: 40px;
		margin: 8px;
		font-size: 24px;
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		border: none;
		text-align: center;
		text-decoration: none;
		display: block;
		cursor: pointer;
	}

	button:hover {
		background-color: rgba(80, 80, 80, 0.8);
	}

	.buttons a {
		text-decoration: none;
		color: white;
	}

	.aboutButton {
		position: fixed;
		top: 10px;
		right: 10px;
	}

	a {
		color: aquamarine;
	}

	.about {
		width: 90%;
		max-width: 400px;
		background-color: rgba(80, 80, 80, 0.9);
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 8px;
		border-radius: 8px;
		user-select: text;
	}
</style>

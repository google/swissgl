/** @license
 * Copyright 2023 Google LLC.
 * SPDX-License-Identifier: Apache-2.0
 */

// Example of streaming spectrogram data from WebAudio to WebGL2
class Spectrogram {
	static Tags = ['3d', 'data'];

	constructor(glsl, gui) {
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((stream) => {
				this.audioCtx = new AudioContext();
				this.input = this.audioCtx.createMediaStreamSource(stream);
				this.analyser = this.audioCtx.createAnalyser();
				this.analyser.smoothingTimeConstant = 0.5;
				this.input.connect(this.analyser);
				this.frequencyArray = new Uint8Array(this.analyser.frequencyBinCount);
				console.log('mic activated, frequencyBinCount:', this.analyser.frequencyBinCount);
			})
			.catch((e) => console.error('Error getting microphone:', e));
	}

	frame(glsl, params) {
		if (!this.analyser) return;
		this.analyser.getByteFrequencyData(this.frequencyArray);
		const n = this.frequencyArray.length;
		const histLen = 256;
		const spectro = glsl(
			{},
			{ size: [n, 1], format: 'r8', data: this.frequencyArray, tag: 'spectro' }
		);
		const history = glsl(
			{ spectro, FP: 'I.y>0 ? Src(I-ivec2(0,1)) : spectro(ivec2(I.x,0))' },
			{ size: [n, histLen], story: 2, wrap: 'edge', tag: 'history' }
		);
		glsl({
			...params,
			history: history[0],
			Mesh: [n - 1, histLen - 1],
			DepthTest: 1,
			Aspect: 'fit',
			VP: `
        varying float z = history(UV).r;
        float x = 1.0-log(0.005+UV.x)/log(0.005);
        VPos = wld2proj(vec4(-XY.y, (x-0.5)*1.8, z*0.5, 1.0));`,
			FP: `
        mix(vec3(0.0, 0.0, 0.1), vec3(0.9, 0.8, 0.5), z*2.0),1`
		});
	}

	free() {
		if (!this.input) return;
		this.input.mediaStream.getTracks().forEach((tr) => tr.stop());
		this.audioCtx.close();
	}
}

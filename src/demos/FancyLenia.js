/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

import AudioStream from './audio.js';
import ParticleLenia from './ParticleLenia.js';

// Visualization of Particle Lenia fields as 3d landscape
export default class FancyLenia extends ParticleLenia {
	static Tags = ['3d', 'simulation', 'audio'];

	constructor(glsl, gui) {
		super(glsl, gui);
		this.meanEnergy = 0.0;
		gui.add(this, 'meanEnergy', 0.0, 1.0, 0.001).listen();
		this.volume = 0.5;
		gui.add(this, 'volume', 0.0, 1.0);
		gui.add(this, 'toggleAudio');
	}
	reset() {
		super.reset();
		this.trails = this.glsl(
			{ Clear: 0 },
			{ size: [1024, 1024], format: 'r8', filter: 'linear', tag: 'trails' }
		);
	}

	step() {
		super.step();
		const { glsl, trails } = this;
		glsl({ Blend: 'd-s', FP: `2./255.` }, trails);
		this.renderSpots(trails, 0.2);
	}

	frame(_, cameraParams) {
		for (let i = 0; i < this.step_n; ++i) {
			this.step();
		}

		const { params, viewR, state, trails, glsl } = this;
		const fieldU = glsl(
			{
				...params,
				viewR,
				state: state[0],
				Grid: state[0].size,
				Clear: 0.0,
				Blend: 's+d',
				VP: `
        varying vec2 p = (UV*2.0-1.0)*(mu_k+3.0*sigma_k);
        VPos.xy = (state(ID.xy).xy + p)/viewR;`,
				FP: `
        peak_f(length(p), mu_k, sigma_k).x*w_k`
			},
			{ size: [256, 256], format: 'rgba16f', filter: 'linear', tag: 'fieldU' }
		);

		const viewParams = { viewR, ...cameraParams, scaleU: 0.25, DepthTest: 1, Aspect: 'mean' };
		glsl({
			fieldU,
			trails,
			...params,
			...viewParams,
			Mesh: [100, 100],
			VP: `
        float z = fieldU(UV).x*scaleU-0.25;
        VPos = wld2proj(vec4(XY, z, 1));`,
			FP: `
        float U = fieldU(UV).x;
        if (U>0.1) {
            vec2 m = 20.0*mat2(1,0.5,0,sin(TAU/6.))*UV;
            float iso = isoline(m.x)+isoline(m.y)+isoline(m.x-m.y);
            iso += isoline(fieldU(UV).x*10.0);
            iso = min(iso/3.0, 0.5)*smoothstep(0.1, 0.5, U);
            FOut.rgb += iso;
        }
        float G = peak_f(U, mu_g, sigma_g).x;
        FOut.rgb = mix(FOut.rgb, vec3(0.6, 0.8, 0.3), G);
        FOut = mix(FOut, vec4(1), trails(UV).x);`
		});

		glsl({
			state: state[0],
			Grid: state[0].size,
			Mesh: [32, 8],
			fieldU,
			...viewParams,
			VP: `
        vec4 pos = vec4(state(ID.xy).xy, 0.0, 1.0);
        pos.xy /= viewR;
        pos.z = fieldU(pos.xy*0.5+0.5).x*scaleU-0.25;
        varying vec3 normal = uv2sphere(UV);
        pos.xyz += normal*0.015;
        VPos = wld2proj(pos);`,
			FP: `
        float a = normal.z*0.7+0.3;
        FOut = vec4(vec3(1.0-a*a*0.75), 1.0);`
		});

		glsl(
			{
				state: state[0],
				FP: `
        ivec2 sz = state_size();
        float E = 0.0;
        for (int y=0; y<sz.y; ++y)
        for (int x=0; x<sz.x; ++x) {
            E += state(ivec2(x,y)).w;
        }
        FOut.x = E / float(sz.x*sz.y);`
			},
			{ size: [1, 1], format: 'r32f', tag: 'meanE' }
		).read((d) => (this.meanEnergy = d[0]));

		if (this.audio) {
			glsl({
				T: this.audio,
				Grid: this.audio.size,
				Blend: 's+d',
				VP: `
            vec2 p = vec2(float(ID.x)/float(Grid.x-1)*2.-1., T(ID.xy).x*2.+0.5);
            p = (ViewSize.x>ViewSize.y) ? p : p.yx; 
            VPos.xy = p+XY*0.008;
            `,
				FP: 'vec4(0.8,0.1,0.7,0)*exp(-dot(XY,XY)*3.0)'
			});
		}
	}

	toggleAudio() {
		if (!this.audioStream) {
			this.audioStream = new AudioStream();
			this.audioStream.start((...a) => this.audioFrame(...a));
		} else {
			this.audioStream.stop();
			delete this.audioStream;
			delete this.audio;
		}
	}
	free() {
		if (this.audioStream) {
			this.audioStream.stop();
		}
	}
	audioFrame(e, submit) {
		const n = e.buf.length / 2;
		const dt = n / e.sampleRate;
		const [s1, s0] = this.state;
		this.phase_vol = this.glsl(
			{
				s0,
				s1,
				dt,
				FP: `
            vec4 d0=s0(I), d1=s1(I);
            FOut.x = fract(Src(I).x + dt*exp2(4.0*d1.w));
            FOut.y = length(d1.xyz-d0.xyz);
        `
			},
			{ size: s0.size, story: 2, format: 'rg32f', tag: 'phase_vol' }
		);
		const [p1, p0] = this.phase_vol;
		this.audio = this.glsl(
			{
				dt,
				p0,
				p1,
				volume: this.volume,
				FP: `
            ivec2 i, sz = p0_size();
            float acc = 0.0;
            for (i.y=0; i.y<sz.y; ++i.y)
            for (i.x=0; i.x<sz.x; ++i.x) {
                vec2 d0 = p0(i).xy, d1 = p1(i).xy;
                float t = TAU*mix(d0.x, d1.x+step(d1.x,d0.x), UV.x);
                float vel = mix(d0.y,d1.y,UV.x);
                acc += vel;
                FOut.xy += vel*(rot2(50.*t)[0]+rot2(300.*t)[0]) * exp(-abs(fract(5.0*t/TAU)-0.5)*20.0);
            }
            FOut.xy *= volume/acc;
        `
			},
			{ size: [n, 1], format: 'rg32f', tag: 'audio' }
		);
		this.audio.read(submit, [], e.buf);
	}
}

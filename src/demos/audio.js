/** @license
 * Copyright 2023 Google LLC.
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioWorkletProcessor {}
class AudioStream extends AudioWorkletProcessor {
	constructor() {
		super();
		this.chunkSize = 1024;
		if (typeof registerProcessor === 'undefined') {
			return; // main thread
		}
		this.queue = [];
		this.pos = -1; // queue is empty, need fade-in
		this.frame = 0;
		this.port.onmessage = (e) => this.queue.push(e.data);
		for (let i = 0; i < 2; ++i) {
			this.queue.push(new Float32Array(this.chunkSize * 2));
			this._requestChunk();
		}
	}
	_requestChunk() {
		const buf = this.queue.shift();
		this.port.postMessage({ frame: this.frame, sampleRate, buf }, [buf.buffer]);
		this.frame += this.chunkSize;
		this.pos = this.queue.length ? 0 : -1;
	}
	process(inputs, outputs, parameters) {
		if (!this.queue.length) return true;
		const src = this.queue[0];
		const [c0, c1] = outputs[0],
			n = c0.length;
		let v = 1.0,
			dv = 0.0;
		if (this.pos == -1) {
			this.pos = 0;
			v = 0.0;
			dv = 1.0 / n; // fade-in
		} else if (src.length - this.pos <= n * 2 && this.queue.length == 1) {
			v = 1.0;
			dv = -1.0 / n; // fade-out
		}
		for (let i = 0; i < n; ++i, this.pos += 2, v += dv) {
			c0[i] = src[this.pos] * v;
			c1[i] = src[this.pos + 1] * v;
		}
		if (this.pos >= src.length) {
			this._requestChunk();
		}
		return true;
	}
	async start(callback) {
		this.audioContext = new AudioContext();
		const audioWorkletJS =
			AudioStream.toString() + '\nregisterProcessor("worklet-processor", AudioStream);';
		const workletURL = URL.createObjectURL(
			new Blob([audioWorkletJS], { type: 'application/javascript' })
		);
		await this.audioContext.audioWorklet.addModule(workletURL);
		this.workletNode = new AudioWorkletNode(this.audioContext, 'worklet-processor', {
			outputChannelCount: [2]
		});
		const submit = (buf) => this.workletNode.port.postMessage(buf, [buf.buffer]);
		this.workletNode.port.onmessage = (msg) => callback(msg.data, submit);
		this.workletNode.connect(this.audioContext.destination);
		console.log('audio stream started');
	}
	stop() {
		this.audioContext.close();
	}
}

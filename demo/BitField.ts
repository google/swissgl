/** @license
 * Copyright 2023 Google LLC.
 * Copyright 2023 João Paquim
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GUI } from 'lil-gui';
import type { Params, glsl } from '@/swissgl';

// Bit Field texture, inspired by the tweet thread:
// https://twitter.com/aemkei/status/1378106731386040322
export default class BitField {
  static Tags = ['2d'];

  k: number;

  constructor(_glsl: glsl, gui: GUI) {
    this.k = 9;
    gui.add(this, 'k', 2, 50, 1);
  }

  frame(glsl: glsl, { time, DPR }: Params & { time: number; DPR: number }) {
    const { k } = this;
    glsl({
      t: time,
      k,
      DPR,
      FP: `
ivec2 i = (I+int(t*40.))/4/int(DPR);
FOut = vec4(1 - (i.x^i.y)%int(k));`,
    });
  }
}

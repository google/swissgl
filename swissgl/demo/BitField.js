/** @license 
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

// Bit Field texture, inspired by the tweet thread:
// https://twitter.com/aemkei/status/1378106731386040322
class BitField {
    static Tags = ['2d'];
    constructor(glsl, gui) {
        this.k = 9;
        gui.add(this, 'k', 2, 50, 1);
    }
    frame(glsl, {time, DPR}) {
        const {k} = this;
        glsl({t:time, k, DPR, FP:`
            ivec2 i = (I+int(t*40.))/4/int(DPR);
            FOut = vec4(1 - (i.x^i.y)%int(k));
        `});
    }
}

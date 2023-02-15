// Copyright 2023 Google LLC.
// SPDX-License-Identifier: Apache-2.0

// https://twitter.com/aemkei/status/1378106731386040322
class BitField {
    constructor(glsl, gui) {
        this.k = 9;
        gui.add(this, 'k', 2, 50, 1);
    }
    frame(glsl, t) {
        const {k} = this;
        glsl({t, k}, `1-((I.x+int(t*40.))/4^(I.y+int(t*20.))/4)%int(k)`);
    }
}

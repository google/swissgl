'use strict';

const $ = s=>document.querySelector(s);

class DemoApp {
    constructor(demos) {
        this.demos = Object.fromEntries(demos.map(c=>[c.name, c]));
        this.canvas = document.getElementById('c');
        this.glsl = SwissGL(this.canvas);
        this.demo = null;
        this.gui = null;

        this.viewParams = {
            cameraYPD: new Float32Array(3),
        };
        this.resetCamera();

        this.glsl_include = `
            uniform vec3 cameraYPD;
            vec3 cameraPos() {
                vec3 p = vec3(0, 0, cameraYPD.z);
                p.yz *= rot2(-cameraYPD.y);
                p.xy *= rot2(-cameraYPD.x);
                return p;
            }
            vec4 wld2view(vec4 p) {
                p.xy *= rot2(cameraYPD.x);
                p.yz *= rot2(cameraYPD.y);
                p.z -= cameraYPD.z;
                return p;
            }
            vec4 view2proj(vec4 p) {
                const float near = 0.1, far = 10.0, fov = 1.0;
                return vec4(p.xy/tan(fov/2.0),
                    (p.z*(near+far)+2.0*near*far)/(near-far), -p.z);
            }
            vec4 wld2proj(vec4 p) {
                return view2proj(wld2view(p));
            }
        `;

        this.prevPos = [0,0];
        this.canvas.addEventListener('pointerdown', e=>{
            if (!e.isPrimary) return;
            this.prevPos = [e.offsetX, e.offsetY];
        });
        this.canvas.addEventListener('pointermove', e=>{
            if (!e.isPrimary || e.buttons != 1) return;
            const [px, py] = this.prevPos;
            const [x, y] = [e.offsetX, e.offsetY];
            this.prevPos = [x, y];
            
            let [yaw, pitch, dist] = this.viewParams.cameraYPD;
            yaw -= (x-px)*0.01;
            pitch -= (y-py)*0.01;
            pitch = Math.min(Math.max(pitch, 0), Math.PI);
            this.viewParams.cameraYPD.set([yaw, pitch, dist]);
        });

        let name = location.hash.slice(1);
        if (!(name in this.demos)) {
            name = 'FancyLenia';
        }
        this.runDemo(name);
        this.populatePreviews();
    }

    resetCamera() {
        this.viewParams.cameraYPD.set([3*Math.PI/4, Math.PI/4, 1.8]);
    }

    frame(t) {
        this.adjustCanvas();
        this.demo.frame(this.glsl, {
            time:t/1000.0,
            ...this.viewParams,
        });
    }

    runDemo(name) {
        if (this.demo) {
            if (this.gui) this.gui.destroy();
            if (this.demo.free) this.demo.free();
            this.glsl.reset();
            this.demo = this.gui = null;
            if (window.innerWidth < 500) {
                // close menu on small screens
                $('#panel').removeAttribute("open");
            }
        }
        location.hash = name;
        this.gui = new dat.GUI();
        this.gui.domElement.id = 'gui'
        this.gui.hide();
        this.glsl.includes.push(this.glsl_include);
        this.demo = new this.demos[name](this.glsl, this.gui);
        if (this.gui.__controllers.length == 0) {
            if (this.gui) this.gui.destroy();
            this.gui = null;
        }
        $('#settingButton').style.display = this.gui?'block':'none';
        $('#sourceLink').href = `https://github.com/google/swissgl/blob/main/demo/${name}.js`;
        this.resetCamera();
    }

    populatePreviews() {
        const panel = document.getElementById('cards');
        Object.keys(this.demos).forEach(name=>{
            const el = document.createElement('div');
            el.classList.add('card');
            el.innerHTML = `<img src="demo/preview/${name}.jpg">${name}`;
            el.addEventListener('click', ()=>this.runDemo(name));
            panel.appendChild(el);
        });
    }

    adjustCanvas() {
        const {canvas} = this;
        const dpr = 1;//devicePixelRatio;
        const w = canvas.clientWidth*dpr, h=canvas.clientHeight*dpr;
        if (canvas.width != w || canvas.height != h) {
            canvas.width = w; canvas.height = h;
        }
    }

    // helper function to render demo preview images
    genPreviews() {
        const panel = document.getElementById('cards');
        panel.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 300;
        const glsl = SwissGL(canvas);
        Object.keys(this.demos).forEach(name=>{
            if (name == 'Spectrogram') return;
            const dummyGui = new dat.GUI();
            glsl.includes.push(this.glsl_include);
            const demo = new this.demos[name](glsl, dummyGui);
            dummyGui.destroy();
            this.resetCamera();
            for (let i=0; i<60*5; ++i) {
                glsl({Clear:0}, '')
                demo.frame(glsl, {time:i/60.0, ...this.viewParams});
            }
            const el = document.createElement('div')
            const data = canvas.toDataURL('image/jpeg', 0.95);
            el.innerHTML = `
             <a href="${data}" download="${name}.jpg"><img src="${data}"></a>
             ${name}`;
            panel.appendChild(el)
            if (demo.free) demo.free();
            glsl.reset();
        })
    }

    toggleGui() {
        if (!this.gui) return;
        const style = this.gui.domElement.style;
        style.display = (style.display == 'none')?'':'none'
    }

    fullscreen() {
        const {canvas} = this;
        const f = canvas.requestFullscreen || canvas.webkitRequestFullscreen;
        if (f) f.apply(canvas);
    }

}

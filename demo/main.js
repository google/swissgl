'use strict';

const $ = s=>document.querySelector(s)

class DemoApp {
    constructor(demos) {
        this.demos = Object.fromEntries(demos.map(c=>[c.name, c]));
        this.canvas = document.getElementById('c');
        this.glsl = SwissGL(this.canvas);
        this.demo = null;
        this.gui = null;

        let name = location.hash.slice(1);
        if (!(name in this.demos)) {
            name = 'NeuralCA';
        }
        this.runDemo(name);
        this.populatePreviews();
    }

    frame(t) {
        this.adjustCanvas();
        this.demo.frame(this.glsl, t/1000.0);
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
        this.demo = new this.demos[name](this.glsl, this.gui);
        if (this.gui.__controllers.length == 0) {
            if (this.gui) this.gui.destroy();
            this.gui = null;
        }
        $('#settingButton').style.display = this.gui?'block':'none';
        $('#sourceLink').href = `https://github.com/google/swissgl/blob/main/demo/${name}.js`;
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
            glsl.reset();
            const dummyGui = new dat.GUI();
            demo = new this.demos[name](glsl, dummyGui);
            dummyGui.destroy();
            for (let i=0; i<60*5; ++i) {
                glsl({Clear:0}, '')
                demo.frame(glsl, i/60.0)
            }
            const el = document.createElement('div')
            const data = canvas.toDataURL('image/jpeg', 0.95);
            el.innerHTML = `
             <a href="${data}" download="${name}.jpg"><img src="${data}"></a>
             ${name}
            `
            panel.appendChild(el)
            el.addEventListener('click', ()=>{
                runDemo(name);
            })
        })
        runDemo(params.demo);
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
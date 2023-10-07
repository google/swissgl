import NeuralCA from './NeuralCA.svelte';
import DotCamera from './DotCamera.svelte';
import MeshGrid from './MeshGrid.svelte';
import ParticleLife from './ParticleLife.svelte';
// import ParticleLife3d from './ParticleLife3d.svelte';
import BitField from './BitField.svelte';
import TextureSamplers from './TextureSamplers.svelte';
import GameOfLife from './GameOfLife.svelte';
import ParticleLenia from './ParticleLenia.svelte';
// import FancyLenia from './FancyLenia.svelte';
// import Spectrogram from './Spectrogram.svelte';
// import Physarum from './Physarum.svelte';
// import Physarum3d from './Physarum3d.svelte';
import SurfaceNormals from './SurfaceNormals.svelte';
import CubeDeform from './CubeDeform.svelte';
import ColorCube from './ColorCube.svelte';
// import Shadowmap from './Shadowmap.svelte';
import Torus4d from './Torus4d.svelte';
// import DeferredShading from './DeferredShading.svelte';
// import Springs from './Springs.svelte';
// import ReactionDiffusion from './ReactionDiffusion.svelte';

import Criticality from './Criticality.svelte';
import Tiny from './Tiny.svelte';
import TinyCanvas from './TinyCanvas.svelte';
import TinyLoop from './TinyLoop.svelte';
import Gradient from './Gradient.svelte';

const demos = {
	NeuralCA,
	DotCamera,
	MeshGrid,
	ParticleLife,
	// ParticleLife3d,
	BitField,
	TextureSamplers,
	GameOfLife,
	ParticleLenia,
	// FancyLenia,
	// Spectrogram,
	// Physarum,
	// Physarum3d,
	SurfaceNormals,
	CubeDeform,
	ColorCube,
	// Shadowmap,
	Torus4d,
	// DeferredShading,
	// Springs,
	// ReactionDiffusion
	Criticality,
	Tiny,
	TinyCanvas,
	TinyLoop,
	Gradient
};

export default demos;

export const names = Object.keys(demos);

const camelToKebab = (str: string) =>
	str
		.replace(/[A-Z]/, (letter) => letter.toLowerCase())
		.replace(/[A-Z]/g, (letter: string) => `-${letter.toLowerCase()}`);

export const nameToPath = Object.fromEntries(names.map((name) => [name, camelToKebab(name)]));
export const pathToName = Object.fromEntries(names.map((name) => [camelToKebab(name), name]));

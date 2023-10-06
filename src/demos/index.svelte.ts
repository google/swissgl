import Criticality from './Criticality.svelte';
import Tiny from './Tiny.svelte';

const demos = {
	Criticality,
	Tiny
};

export default demos;

export const names = Object.keys(demos);

const camelToKebab = (str: string) =>
	str
		.replace(/[A-Z]/, (letter) => letter.toLowerCase())
		.replace(/[A-Z]/g, (letter: string) => `-${letter.toLowerCase()}`);

export const nameToPath = Object.fromEntries(names.map((name) => [name, camelToKebab(name)]));
export const pathToName = Object.fromEntries(names.map((name) => [camelToKebab(name), name]));

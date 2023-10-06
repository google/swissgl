<script lang="ts">
	import { nameToPath } from '../../demos/index.svelte.js';
	import './style.css';
</script>

<ul>
	{#each Object.entries(nameToPath) as [name, path]}
		<li>
			<a href="/{path}">{name}</a>
		</li>
	{/each}
</ul>

<slot />

<style>
	ul {
		position: absolute;
		list-style: none;
		font-family: sans-serif;
		font-size: 1.2em;
		opacity: 0;
		transition: opacity 0.3s;

		&:hover {
			opacity: 1;
		}
	}

	a {
		color: #fff;
	}
</style>

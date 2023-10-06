<script lang="ts">
	import { page } from '$app/stores';
	import demos, { pathToName } from '../../demos/index.svelte.js';

	$: Demo = demos[pathToName[$page.params.name]];
</script>

<svelte:component this={Demo} />

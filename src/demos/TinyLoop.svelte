<script lang="ts">
	import { Loop } from '$lib/index.js';
</script>

<Loop
	f={({ glsl, time }) => {
		glsl.adjustCanvas();
		glsl({
			time,
			Aspect: 'cover',
			FP: `
sin(length(XY)*vec3(30,30.5,31)
-time+atan(XY.x,XY.y)*3.),1`
		});
	}}
></Loop>

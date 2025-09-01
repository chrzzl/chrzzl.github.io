import {
	Vector2,
	Vector3
} from 'three';

/**
 * Shaders to render 3D volumes using raycasting.
 * The applied techniques are based on similar implementations in the Visvis and Vispy projects.
 * This is not the only approach, therefore it's marked 1.
 */

const SandboxShader = {

	uniforms: {
      'u_radius': { value: 1.0 },
      'u_height': { value: 1.0 },
      'u_segments': { value: 1.0 }
    },

	vertexShader: /* glsl */`
		varying vec3 v_position;
		varying vec4 v_cam_origin;

		void main() {
				// Prepare transforms to map to "camera view". See also:
				// https://threejs.org/docs/#api/renderers/webgl/WebGLProgram
				mat4 viewtransformf = modelViewMatrix;
				mat4 viewtransformi = inverse(modelViewMatrix);

				vec4 position4 = vec4(position, 1.0);
				v_cam_origin = viewtransformi * vec4(0.0, 0.0, 0.0, 1.0);
				v_position = position;
				gl_Position = projectionMatrix * viewMatrix * modelMatrix * position4;
		}`,

	fragmentShader: /* glsl */`
		precision highp float;

		uniform float u_radius;
		uniform float u_height;
		uniform float u_segments;

		varying vec3 v_position;
		varying vec4 v_cam_origin;

		const float PI = 3.141592653589793;

		vec3 basic_coloring();
		vec3 polar_coloring();

		void main() {
				vec3 color = polar_coloring();
				gl_FragColor = vec4(color, 1.0);
		}

		vec3 polar_coloring() {
			float radius = length(v_position.xz);
			float angle = atan(v_position.z, v_position.x);
			float r = radius / u_radius;
			float g = angle / 2.0 /PI;
			float b = (v_position.y / u_height + 0.5);
			return vec3(r, g, b);
		}

		vec3 basic_coloring() {
			float r = 1.0 - length(v_position.x / u_radius);
			float g = 1.0 -length(v_position.y / u_height *2.0);
			return vec3(r, g, r);
		}
		`
};

export { SandboxShader };

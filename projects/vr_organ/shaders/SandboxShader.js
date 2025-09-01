import { Vector2, Vector3 } from 'three';

/**
 * SandboxShader for ray-based cylinder shading with generalized anti-aliasing via supersampling.
 */

const SandboxShader = {
  uniforms: {
    'u_radius': { value: 1.0 },
    'u_height': { value: 1.0 },
    'u_segments': { value: 1 },
    'u_resolution': { value: new Vector2(1.0, 1.0) } // screen resolution for AA offset
  },

  vertexShader: /* glsl */`
    varying vec3 v_position;
    varying vec4 v_cam_origin;
    void main() {
      mat4 viewtransformf = modelViewMatrix;
      mat4 viewtransformi = inverse(modelViewMatrix);
      vec4 position4 = vec4(position, 1.0);
      v_cam_origin = viewtransformi * vec4(0.0, 0.0, 0.0, 1.0);
      v_position = position;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * position4;
    }
  `,

  fragmentShader: /* glsl */`
    precision highp float;

    uniform float u_radius;
    uniform float u_height;
    uniform float u_segments;
    uniform vec2 u_resolution;

    varying vec3 v_position;
    varying vec4 v_cam_origin;

    const float PI = 3.141592653589793;
    const int AA_SAMPLES = 8;

    vec3 basic_coloring();
    vec3 polar_coloring();
    vec3 grid_coloring();
    vec2 rotate(vec2 v, float a);

    void main() {
      vec3 color = vec3(0.0);
      for (int i = 0; i < AA_SAMPLES; i++) {
        float dx = float(i % 2) * 0.5;
        float dy = float(i / 2) * 0.5;
        vec2 offset = vec2(dx, dy) / u_resolution;
        vec3 offsetPos = v_position + vec3(offset, 0.0);
        color += grid_coloring();
      }
      color /= float(AA_SAMPLES);
      gl_FragColor = vec4(color, 1.0);
    }

    vec3 grid_coloring() {
      float radius = length(v_position.xz) / u_radius; // 0.0 to 1.0 
      float angle = atan(v_position.z, v_position.x) / PI + 0.5; // 0.0 to 1.0
      float thickness = 0.01;
      
      // Circular lines
      float num_rings = 5.0;
      float grid = 0.0;
      for (float i = 1.0; i < num_rings+1.0; i++) {
        float circle = step(i / num_rings - thickness, radius) * (1.0 - step(i / num_rings, radius));
        grid = max(grid, circle);
      }
      
      // Ray lines
      float num_rays = 5.0;
      float ray = step(-thickness * 0.5, v_position.x / u_radius) * (1.0 - step(thickness * 0.5, v_position.x / u_radius));
      grid = max(grid, ray);
      for (float i = 1.0; i < num_rays+1.0; i++) {
        vec2 direction = rotate(v_position.xz, i * PI / num_rays);
        float ray = step(-thickness * 0.5, direction.x / u_radius) * (1.0 - step(thickness * 0.5, direction.x / u_radius));
        grid = max(grid, ray);
      }

      vec3 grid_color = vec3(0.8, 1.0, 1.0);
      return grid * grid_color;
    }

    vec3 polar_coloring() {
      float N = 10.0;
      float radius = length(v_position.xz);
      float angle = atan(v_position.z, v_position.x);
      float r = radius / u_radius;
      float g = angle / PI + 0.5;
      float b = (v_position.y / u_height + 0.5);

      g = sin(angle * N) * 0.5 + 0.5;
      float thickness = 0.1;
      float rays = step(1.0 - thickness, g);
      float rim = step(0.95, r);
      float dot = 1.0 - step(0.1, r);
      float gitter = rim + rays + dot;
      gitter = clamp(gitter, 0.0, 1.0);
      vec3 gitter_color = vec3(0.5);

      float faces = 1.0 - gitter;
      faces = smoothstep(0.0, 0.5, faces);
      faces *= smoothstep(0.0, 0.3, r) * (1.0 - smoothstep(0.7, 1.0, r));
      faces *= (1.0 - smoothstep(0.0, 1.0 - thickness, g));
      vec3 faces_color = vec3(1.0, 1.0, 0.0);

      return gitter * gitter_color + faces * faces_color;
    }

    vec3 basic_coloring() {
      float r = 1.0 - length(v_position.x / u_radius);
      float g = 1.0 - length(v_position.y / u_height * 2.0);
      return vec3(r, g, r);
    }

    vec2 rotate(vec2 v, float a) {
      float s = sin(a);
      float c = cos(a);
      mat2 m = mat2(c, -s, s, c);
      return m * v;
    }
  `
};

export { SandboxShader };
import { Geometry, Mesh, Shader, type Texture, UniformGroup } from 'pixi.js';

// A unit quad; the fragment shader turns it into a lit sphere and discards the corners.
const QUAD = new Geometry({
  attributes: {
    aPosition: [-1, -1, 1, -1, 1, 1, -1, 1],
    aUV: [0, 0, 1, 0, 1, 1, 0, 1],
  },
  indexBuffer: [0, 1, 2, 0, 2, 3],
});

// PixiJS only compiles for WebGL 2 when the source itself declares the version.
const VERTEX = `#version 300 es
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
  }
`;

// Orthographic sphere: the quad position is the visible hemisphere's normal. The normal is
// taken into the ball's own frame to look up the equirectangular map, then lit in view space.
const FRAGMENT = `#version 300 es
  precision highp float;

  in vec2 vUV;
  out vec4 finalColor;
  uniform sampler2D uTexture;
  uniform mat3 uOrientation;
  uniform vec3 uLight;
  uniform float uEdge;

  const float PI = 3.14159265;

  void main() {
    vec2 p = vUV * 2.0 - 1.0;
    float r = length(p);

    if (r > 1.0) {
      discard;
    }

    vec3 normal = vec3(p.x, -p.y, sqrt(max(0.0, 1.0 - r * r)));
    vec3 body = uOrientation * normal;
    vec2 uv = vec2(atan(body.x, body.z) / (2.0 * PI) + 0.5, 0.5 - asin(clamp(body.y, -1.0, 1.0)) / PI);

    // Derivatives jump at the seam; take the smaller of the two wrapped candidates.
    vec2 wrapped = fract(uv + 0.5);
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    vec2 dxw = dFdx(wrapped);
    vec2 dyw = dFdy(wrapped);
    vec2 gx = dot(dx, dx) < dot(dxw, dxw) ? dx : dxw;
    vec2 gy = dot(dy, dy) < dot(dyw, dyw) ? dy : dyw;
    vec3 albedo = textureGrad(uTexture, uv, gx, gy).rgb;

    float diffuse = max(dot(normal, uLight), 0.0);
    vec3 halfway = normalize(uLight + vec3(0.0, 0.0, 1.0));
    float specular = pow(max(dot(normal, halfway), 0.0), 48.0);
    float occlusion = 0.82 + 0.18 * normal.z;
    vec3 color = albedo * (0.34 + 0.72 * diffuse) * occlusion + specular * 0.55;
    float alpha = 1.0 - smoothstep(1.0 - uEdge, 1.0, r);

    finalColor = vec4(color * alpha, alpha);
  }
`;

const LIGHT = normalized([-0.45, 0.6, 0.7]);

export interface BallMesh {
  readonly mesh: Mesh<Geometry, Shader>;
  readonly uniforms: UniformGroup;
  // Takes a view-space normal into the ball's frame; updated as the ball rolls.
  readonly orientation: Float32Array;
}

export function createBallMesh(texture: Texture, radius: number): BallMesh {
  const orientation = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const uniforms = new UniformGroup({
    uOrientation: { value: orientation, type: 'mat3x3<f32>' },
    uLight: { value: LIGHT, type: 'vec3<f32>' },
    uEdge: { value: Math.min(0.5, 1.5 / radius), type: 'f32' },
  });
  const shader = Shader.from({
    gl: { vertex: VERTEX, fragment: FRAGMENT },
    resources: { uTexture: texture.source, uSampler: texture.source.style, ballUniforms: uniforms },
  });
  const mesh = new Mesh({ geometry: QUAD, shader });

  mesh.scale.set(radius);

  return { mesh, uniforms, orientation };
}

// Rolls the ball by a table-plane displacement (metres, y down) without slipping. The view
// frame is right-handed with x right, y up and z towards the viewer; the contact point is below.
export function rollOrientation(ball: BallMesh, dx: number, dy: number, radius: number): void {
  const travelled = Math.sqrt(dx * dx + dy * dy);

  if (travelled === 0) {
    return;
  }

  // Angular velocity axis for rolling: (vy, vx, 0) in this frame, see the derivation in README.
  const ax = dy / travelled;
  const ay = dx / travelled;
  const angle = -travelled / radius;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const k = 1 - cos;
  // Rodrigues rotation about (ax, ay, 0), column-major.
  const rotation = [
    cos + ax * ax * k,
    ax * ay * k,
    -ay * sin,
    ax * ay * k,
    cos + ay * ay * k,
    ax * sin,
    ay * sin,
    -ax * sin,
    cos,
  ];
  const current = Array.from(ball.orientation);

  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      let sum = 0;

      for (let i = 0; i < 3; i += 1) {
        sum += (current[i * 3 + row] ?? 0) * (rotation[column * 3 + i] ?? 0);
      }

      ball.orientation[column * 3 + row] = sum;
    }
  }

  ball.uniforms.update();
}

function normalized(vector: readonly [number, number, number]): Float32Array {
  const length = Math.hypot(...vector);

  return new Float32Array(vector.map((component) => component / length));
}

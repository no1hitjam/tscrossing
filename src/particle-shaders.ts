export const INSTANCE_AGE_VERTEX_PARS = `
  attribute float instanceAge;
  attribute float instanceLifetime;

  varying float vAge;
  varying float vLifetime;
`;

export const INSTANCE_AGE_VERTEX_INIT = `
  vAge = instanceAge;
  vLifetime = instanceLifetime;
`;

export const INSTANCE_AGE_VERTEX_TRANSFORM = `
  vec3 transformed = vec3(position);
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
`;

export const LIFECYCLE_OPACITY = `
  float lifeT = clamp(vAge / max(vLifetime, 0.001), 0.0, 1.0);
  float fadeInAlpha = smoothstep(0.0, fadeIn / max(vLifetime, 0.001), vAge);
  float fadeOutAlpha =
    1.0 - smoothstep(1.0 - fadeOut / max(vLifetime, 0.001), 1.0, lifeT);
`;

export const PAPPUS_CHROMA_KEY = `
  float rbAvg = (color.r + color.b) * 0.5;
  float magentaScore = rbAvg - color.g;
  float keyFromHue = smoothstep(0.04, 0.38, magentaScore);

  float keyDist = distance(color, vec3(1.0, 0.0, 1.0));
  float keyFromDist = 1.0 - smoothstep(0.18, 0.72, keyDist);

  float keyAmount = max(keyFromHue, keyFromDist);

  float spill = max(0.0, min(color.r, color.b) - color.g);
  color.g += spill * 0.75;
  color.r -= spill * 0.4;
  color.b -= spill * 0.4;
  color = clamp(color, 0.0, 1.0);
`;

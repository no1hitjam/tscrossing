import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const BRIGHTNESS_SCALE = 1.18;
const BRIGHTNESS_LIFT = 0.035;

const BRIGHTEN_SHADER = {
  name: "BrightenShader",
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: BRIGHTNESS_SCALE },
    uLift: { value: BRIGHTNESS_LIFT },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uBrightness;
    uniform float uLift;

    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb * uBrightness + uLift;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
    }
  `,
};

const VHS_SHADER = {
  name: "VhsShader",
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;

    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 px = 1.0 / uResolution;

      vec3 color = vec3(0.0);
      float weightSum = 0.0;

      for (int i = -4; i <= 4; i++) {
        float fi = float(i);
        float weight = 1.0 - abs(fi) / 4.0;
        vec2 offset = vec2(fi * 1.75 * px.x, 0.0);

        color.r += texture2D(tDiffuse, vUv + offset - vec2(3.0 * px.x, 0.0)).r * weight;
        color.g += texture2D(tDiffuse, vUv + offset).g * weight;
        color.b += texture2D(tDiffuse, vUv + offset + vec2(3.0 * px.x, 0.0)).b * weight;
        weightSum += weight;
      }

      color /= weightSum;

      vec3 vertical = vec3(0.0);
      float verticalWeight = 0.0;
      for (int j = -1; j <= 1; j++) {
        float fj = float(j);
        float weight = 1.0 - abs(fj);
        vertical += texture2D(tDiffuse, vUv + vec2(0.0, fj * px.y)).rgb * weight;
        verticalWeight += weight;
      }
      color = mix(color, vertical / verticalWeight, 0.22);

      float scanline = 0.98 + 0.02 * sin(vUv.y * uResolution.y * 3.14159);
      color *= scanline;

      float noise = (hash(vUv * uResolution + fract(uTime * 24.0)) - 0.5) * 0.03;
      color += noise;

      color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, 1.04);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export class VhsFilter {
  private readonly oComposer: EffectComposer;
  private readonly oVhsPass: ShaderPass;

  constructor(
    oRenderer: THREE.WebGLRenderer,
    oScene: THREE.Scene,
    oCamera: THREE.Camera,
  ) {
    this.oComposer = new EffectComposer(oRenderer);
    this.oComposer.addPass(new RenderPass(oScene, oCamera));
    this.oComposer.addPass(new ShaderPass(BRIGHTEN_SHADER));

    this.oVhsPass = new ShaderPass(VHS_SHADER);
    this.oVhsPass.renderToScreen = true;
    this.oComposer.addPass(this.oVhsPass);

    this.setSize(oRenderer, oRenderer.domElement.clientWidth, oRenderer.domElement.clientHeight);
  }

  setSize(
    oRenderer: THREE.WebGLRenderer,
    nWidth: number,
    nHeight: number,
  ): void {
    const fPixelRatio = oRenderer.getPixelRatio();
    this.oComposer.setPixelRatio(fPixelRatio);
    this.oComposer.setSize(nWidth, nHeight);
    (this.oVhsPass.uniforms.uResolution.value as THREE.Vector2).set(
      nWidth * fPixelRatio,
      nHeight * fPixelRatio,
    );
  }

  render(fDt: number): void {
    this.oVhsPass.uniforms.uTime.value += fDt;
    this.oComposer.render(fDt);
  }
}

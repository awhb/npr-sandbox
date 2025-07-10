import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import vertGaussianBlurWgsl from "../shaders/vert_gaussian_blur.wgsl";
import horizGaussianBlurWgsl from "../shaders/horiz_gaussian_blur.wgsl";

const renderScene = async (webGpuContext: WebGPUContext) => {
    const transformationMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), 
      glMatrix.vec3.fromValues(0, 0, 10), 
      glMatrix.vec3.fromValues(0,0,0), 
      glMatrix.vec3.fromValues(0.0, 1.0, 0.0));
    const orthProjMatrix = glMatrix.mat4.ortho(glMatrix.mat4.create(), -320.0, 320.0, 240.0, -240.0, -1000.0, 1000.0);
    const positions = new Float32Array([
      100.0, -100.0, 0.0,
      100.0, 100.0, 0.0,
      -100.0, -100.0, 0.0,
      -100.0, 100.0, 0.0
    ]);
    const texCoords = new Float32Array([
      1.0, 0.0,
      1.0, 1.0,
      0.0, 0.0,
      0.0, 1.0
    ]);
    webGpuContext.render_gaussian_blur(vertGaussianBlurWgsl, horizGaussianBlurWgsl, 4, 1, positions, texCoords, Float32Array.from(transformationMatrix), Float32Array.from(orthProjMatrix), "baboon.png");
};

export default renderScene;

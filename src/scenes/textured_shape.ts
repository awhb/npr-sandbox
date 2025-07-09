import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import textureWgsl from "./shaders/textured_shape.wgsl?raw";

const renderObjModelScene = async (webGpuContext: WebGPUContext) => {
    const transformationMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), 
      glMatrix.vec3.fromValues(100, 100, 100), 
      glMatrix.vec3.fromValues(0,0,0), 
      glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
    const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
    const positions = new Float32Array([
      100.0, -100.0, 0.0,
      0.0, 100.0, 0.0,
      -100.0, -100.0, 0.0
    ]);
    const texCoords = new Float32Array([
      1.0, 0.0,
      0.0, 0.0,
      0.5, 1.0
    ]);
    const primitiveState: GPUPrimitiveState = {
        topology: 'triangle-strip' as GPUPrimitiveTopology,
        frontFace: 'ccw' as GPUFrontFace,
        cullMode: 'none' as GPUCullMode,
    }
    webGpuContext.render_textured_shape(textureWgsl, 3, 1, positions, texCoords, Float32Array.from(transformationMatrix), Float32Array.from(projectionMatrix), "baboon.png", primitiveState);
};

export default renderObjModelScene;
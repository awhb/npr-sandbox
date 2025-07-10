import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import objModelWgsl from "../shaders/obj_model.wgsl?raw"; 

const renderScene = async (webGpuContext: WebGPUContext) => {
    const modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), glMatrix.vec3.fromValues(3, 3, 3), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
    const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
    const modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);
    const normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse);

    const primitiveState: GPUPrimitiveState = {
        topology: 'triangle-list' as GPUPrimitiveTopology,
        frontFace: 'ccw' as GPUFrontFace,
        cullMode: 'none' as GPUCullMode,
    }
    const depthStencilState: GPUDepthStencilState = {
        depthWriteEnabled: true,
        depthCompare: 'less' as GPUCompareFunction,
        format: 'depth24plus-stencil8' as GPUTextureFormat,
    }
    webGpuContext.render_obj_model(objModelWgsl, "teapot.obj", Float32Array.from(modelViewMatrix), Float32Array.from(projectionMatrix), Float32Array.from(normalMatrix), primitiveState, depthStencilState);
};

export default renderScene;

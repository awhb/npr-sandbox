import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import depthTestingWgsl from "../shaders/depth_testing.wgsl?raw";

const renderDepthTestingScene = async (webGpuContext: WebGPUContext) => {
    // DEPTH TESTING
    const transformationMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), glMatrix.vec3.fromValues(300, 300, 300), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
    const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
    const positions = new Float32Array([
        -100.0, 100.0, 0.0,
        -100.0, 100.0, 200.0,
        100.0, 100.0, 0.0,
        100.0, 100.0, 200.0,

        100.0, -100.0, 0.0,
        100.0, -100.0, 200.0,

        -100.0, -100.0, 0.0,
        -100.0, -100.0, 200.0,

        -100.0, 100.0, 0.0,
        -100.0, 100.0, 200.0
    ]);
    const primitiveState: GPUPrimitiveState = {
        topology: 'triangle-strip' as GPUPrimitiveTopology,
        frontFace: 'ccw' as GPUFrontFace,
        cullMode: 'none' as GPUCullMode,
    }
    const depthStencilState: GPUDepthStencilState = {
        depthWriteEnabled: true,
        depthCompare: 'less' as GPUCompareFunction,
        format: 'depth24plus-stencil8' as GPUTextureFormat,
    }
    webGpuContext.render_depth_testing(depthTestingWgsl, 10, 1, positions, Float32Array.from(transformationMatrix), Float32Array.from(projectionMatrix), primitiveState, depthStencilState);
};

export default renderDepthTestingScene;

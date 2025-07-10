import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import objModelSurfaceNormals from "../shaders/obj_model_surface_normals.wgsl?raw";

const renderScene = async (webGpuContext: WebGPUContext) => {
    let modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), glMatrix.vec3.fromValues(Math.cos(0.0) * 5.0, Math.sin(0.0) * 5.0, 5), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 0.0, 1.0));

    const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
    const modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);
    const normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse);

    webGpuContext.render_video_image_render_obj(objModelSurfaceNormals, "teapot.obj", Float32Array.from(modelViewMatrix), Float32Array.from(projectionMatrix), Float32Array.from(normalMatrix));
};

export default renderScene;

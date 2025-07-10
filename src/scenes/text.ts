import * as glMatrix from "gl-matrix";
import type { WebGPUContext } from "../core/webgpu-context";
import textureWgsl from "../shaders/textured_shape.wgsl?raw";

const renderScene = async (webGpuContext: WebGPUContext) => {
    const translateMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
            glMatrix.vec3.fromValues(0, 0, 500), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 1.0, 0.0));

    const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(),
        1.4, 640.0 / 480.0, 0.1, 1000.0);

    webGpuContext.render_text(textureWgsl, Float32Array.from(translateMatrix), Float32Array.from(projectionMatrix), "Hello, World!", 320, 240, 0.5, "bold", "Arial", "white", 32, 28);

};

export default renderScene;

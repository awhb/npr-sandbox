import type { WebGPUContext } from "../core/webgpu-context";
import triangleWgsl from "../shaders/triangle.wgsl?raw";

const renderScene = async (webGpuContext: WebGPUContext) => {
    const offset = new Float32Array([
    	0.1, 0.1, 0.1
    ]);
    const positions = new Float32Array([
    	1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0
    ]);
    const colors = new Float32Array([
    	1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0
    ]);
    webGpuContext.render_vertex_color_offset(triangleWgsl, 3, 1, positions, colors, offset);
};

export default renderScene;
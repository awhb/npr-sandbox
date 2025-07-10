import type { WebGPUContext } from "../core/webgpu-context";
import sceneWgsl from '../shaders/watercolor/scene.wgsl?raw';
import surfaceWgsl from '../shaders/watercolor/surface.wgsl?raw';
import mrtBlurHWgsl from '../shaders/watercolor/mrt_blur_h.wgsl?raw';
import mrtBlurVWgsl from '../shaders/watercolor/mrt_blur_v.wgsl?raw';
import stylizeWgsl from '../shaders/watercolor/stylize.wgsl?raw';

const renderScene = async (webGpuContext: WebGPUContext) => {
    webGpuContext.render_watercolor(
        {
            scene: sceneWgsl,
            surface: surfaceWgsl,
            mrtBlurH: mrtBlurHWgsl,
            mrtBlurV: mrtBlurVWgsl,
            stylize: stylizeWgsl
        },
        "teapot.obj",
        "paper.png",
        "marble.png"
    );
};

export default renderScene;
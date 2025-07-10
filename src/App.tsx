import { useEffect, useRef, useState } from "react";
import { WebGPUContext } from "./core/webgpu-context";
import renderScene from "./scenes/obj_model";

export const App: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
	const [webGpuSupported, setWebGpuSupported] = useState(true);

  	const render = async () => {
        const primitiveState: GPUPrimitiveState = {
            topology: 'triangle-list' as GPUPrimitiveTopology,
            frontFace: 'ccw' as GPUFrontFace,
            cullMode: 'none' as GPUCullMode,
        }
        const webGpuContext = await WebGPUContext.create({
            canvas: canvasRef.current!,
            primitiveState,
            depthStencilState: {
                depthWriteEnabled: true,
                depthCompare: 'less' as GPUCompareFunction,
                format: 'depth24plus-stencil8' as GPUTextureFormat,
            }
        });

		if (webGpuContext.error) {
			console.error(webGpuContext.error);
			setWebGpuSupported(false);
			return;
		}

		// call specific scene renderer
		if (webGpuContext.instance) {
			await renderScene(webGpuContext.instance);
		}

  }

	useEffect(() => {
		if (!navigator.gpu) {
			setWebGpuSupported(false);
			return;
		}
		if (canvasRef.current) {
			render();
		}
	}, []);

	return (
        <div style={{display: "flex", flexDirection: "column", height: "100%", position: "relative"}}>
            <canvas ref={canvasRef} width={640} height={480} style={{flexGrow: 1, flexShrink: 0}}></canvas>
			{!webGpuSupported && (
				<div style={{ color: "red", marginTop: "1rem" }}>
					Your browser does not support WebGPU. Please download a browser from
					<a href="https://caniuse.com/webgpu" target="_blank" rel="noopener noreferrer"> this site</a>.
				</div>
			)}
		</div>
	)
};


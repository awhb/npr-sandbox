import { useEffect, useRef, useState } from "react";
import * as glMatrix from "gl-matrix";
import { WebGPUContext } from "./core/webgpu-context";

// import shaders
// import triangleWgsl from "./shaders/triangle.wgsl?raw";
// import textureWgsl from "./shaders/textured_shape.wgsl?raw";
// import depthTestingWgsl from "./shaders/depth_testing.wgsl?raw";
import objModelWgsl from "./shaders/obj_model.wgsl?raw"; 

const App = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
	const [webGpuSupported, setWebGpuSupported] = useState(true);

  	const render = async () => {
		const webGpuContext = await WebGPUContext.create(canvasRef.current!);
		if (webGpuContext.error) {
			console.error(webGpuContext.error);
			setWebGpuSupported(false);
			return;
		}

		// BASIC TRIANGLE
		// const offset = new Float32Array([
		// 	0.1, 0.1, 0.1
		// ]);
		// const positions = new Float32Array([
		// 	1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0
		// ]);
		// const colors = new Float32Array([
		// 	1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0
		// ]);
		// webGpuContext.instance!.render_vertex_color_offset(triangleWgsl, 3, 1, positions, colors, offset);

		//TEXTURED SHAPE
		// const transformationMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), 
		//   glMatrix.vec3.fromValues(100, 100, 100), 
		//   glMatrix.vec3.fromValues(0,0,0), 
		//   glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
		// const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
		// const positions = new Float32Array([
		//   100.0, -100.0, 0.0,
		//   0.0, 100.0, 0.0,
		//   -100.0, -100.0, 0.0
		// ]);
		// const texCoords = new Float32Array([
		//   1.0, 0.0,
		//   0.0, 0.0,
		//   0.5, 1.0
		// ]);
		// webGpuContext.instance!.render_textured_shape(textureWgsl, 3, 1, positions, texCoords, Float32Array.from(transformationMatrix), Float32Array.from(projectionMatrix), "baboon.png");

		//DEPTH TESTING
		// const transformationMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(), glMatrix.vec3.fromValues(300, 300, 300), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
		// const projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, 640.0 / 480.0, 0.1, 1000.0);
		// const positions = new Float32Array([
		// 	-100.0, 100.0, 0.0,
		// 	-100.0, 100.0, 200.0,
		// 	100.0, 100.0, 0.0,
		// 	100.0, 100.0, 200.0,

		// 	100.0, -100.0, 0.0,
		// 	100.0, -100.0, 200.0,

		// 	-100.0, -100.0, 0.0,
		// 	-100.0, -100.0, 200.0,

		// 	-100.0, 100.0, 0.0,
		// 	-100.0, 100.0, 200.0
		// ]);
		// const primitiveState: GPUPrimitiveState = {
		// 	topology: 'triangle-strip' as GPUPrimitiveTopology,
		// 	frontFace: 'ccw' as GPUFrontFace,
		// 	cullMode: 'none' as GPUCullMode,
		// }
		// const depthStencilState: GPUDepthStencilState = {
		// 	depthWriteEnabled: true,
		// 	depthCompare: 'less' as GPUCompareFunction,
		// 	format: 'depth24plus-stencil8' as GPUTextureFormat,
		// }
		// webGpuContext.instance!.render_depth_testing(depthTestingWgsl, 10, 1, positions, Float32Array.from(transformationMatrix), Float32Array.from(projectionMatrix), primitiveState, depthStencilState);

		//MODEL LOADING
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
		webGpuContext.instance!.render_obj_model(objModelWgsl, "teapot.obj", Float32Array.from(modelViewMatrix), Float32Array.from(projectionMatrix), Float32Array.from(normalMatrix), primitiveState, depthStencilState);

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
		<div>
			<canvas ref={canvasRef} width={640} height={480}></canvas>
			{!webGpuSupported && (
				<div style={{ color: "red", marginTop: "1rem" }}>
					Your browser does not support WebGPU. Please download a browser from
					<a href="https://caniuse.com/webgpu" target="_blank" rel="noopener noreferrer"> this site</a>.
				</div>
			)}
		</div>
	)
};

export default App;

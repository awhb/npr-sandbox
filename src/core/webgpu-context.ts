import { ObjDataExtractor } from "../utils/objDataExtractor";

interface WebGpuContextInitResult {
	instance?: WebGPUContext;
	error?: string;
}

interface IBindGroupInput {
	type: "buffer" | "texture" | "sampler";
	buffer?: GPUBuffer;
	texture?: GPUTexture;
	sampler?: GPUSampler;
}

interface IGPUVertexBuffer {
	buffer: GPUBuffer;
	layout: GPUVertexBufferLayout;
}

interface IUniformBindGroup {
	bindGroupLayout: GPUBindGroupLayout;
	bindGroup: GPUBindGroup;
}

interface IWebGPUContextOptions {
    canvas: HTMLCanvasElement;
    primitiveState: GPUPrimitiveState;
    depthStencilState?: GPUDepthStencilState;
    msaa?: number;
}

export class WebGPUContext {
	private static VERTEX_ENTRY_POINT = "vs_main";
	private static FRAGMENT_ENTRY_POINT = "fs_main";
	private static _instance: WebGPUContext;
	private _context: GPUCanvasContext;
	private _device: GPUDevice;
	private _canvas: HTMLCanvasElement;
    private _primitiveState: GPUPrimitiveState;
    private _depthStencilState?: GPUDepthStencilState;
    private _msaa?: number;

	public static async create(options: IWebGPUContextOptions): Promise<WebGpuContextInitResult> {
		if (WebGPUContext._instance) {
			return { instance: WebGPUContext._instance };
		}

		// make sure gpu is supported
		if (!navigator.gpu) {
			return { error: "WebGPU not supported" };
		}

		//grab the adapter
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			return { error: "Failed to get WebGPU adapter" };
		}

		//create the device (should be done immediately after adapter in case adapter is lost)
		const device = await adapter.requestDevice();
		if (!device) {
			return { error: "Failed to get WebGPU device" };
		}

		//create the context
		const context = options.canvas.getContext("webgpu");
		if (!context) {
			return { error: "Failed to get WebGPU context" };
		}

		const canvasConfig: GPUCanvasConfiguration = {
			device: device,
			format: navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
			alphaMode: "opaque",
		}

		context.configure(canvasConfig);
    
        WebGPUContext._instance = new WebGPUContext(context, device, options.canvas, options.primitiveState, options.depthStencilState, options.msaa);
		return { instance: WebGPUContext._instance };
  	}

    private constructor(context: GPUCanvasContext, device: GPUDevice, canvas: HTMLCanvasElement, primitiveState: GPUPrimitiveState, depthStencilState?: GPUDepthStencilState, msaa?: number) {
        this._context = context;
        this._device = device;
        this._canvas = canvas;
        this._primitiveState = primitiveState;
        this._depthStencilState = depthStencilState;
        this._msaa = msaa;
    }

    private _createRenderTarget(depthTexture?: GPUTexture): GPURenderPassDescriptor {
        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        let colorAttachment: GPURenderPassColorAttachment;
        if (this._msaa) {
            const msaaTexture = this._device.createTexture({
                size: { width: this._canvas.width, height: this._canvas.height },
                sampleCount: this._msaa,
                format: navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });

            colorAttachment = {
                view: msaaTexture.createView(),
                resolveTarget: colorTextureView,
                clearValue: { r: 1, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
            }
        } else {
            colorAttachment = {
                view: colorTextureView,
                clearValue: { r: 1, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
            }
        }

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [colorAttachment]
        }

        if (depthTexture) {
            renderPassDescriptor.depthStencilAttachment = {
                view: depthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
                stencilClearValue: 0,
                stencilLoadOp: 'clear',
                stencilStoreOp: 'store'
            }
        }

        return renderPassDescriptor;
    }


    private _createGPUBuffer(data: Float32Array | Uint16Array, usage: GPUBufferUsageFlags): GPUBuffer {
		const bufferDesc: GPUBufferDescriptor = {
			size: data.byteLength,
			usage: usage,
			mappedAtCreation: true
		}

		const buffer = this._device.createBuffer(bufferDesc);
		if (data instanceof Float32Array) {
			const writeArray = new Float32Array(buffer.getMappedRange());
			writeArray.set(data);
		} else if (data instanceof Uint16Array) {
			const writeArray = new Uint16Array(buffer.getMappedRange());
			writeArray.set(data);
		}

		buffer.unmap();
		return buffer;
    }

    private _createSingleAttributeVertexBuffer(vertexAttributeData: Float32Array, attributeDesc: GPUVertexAttribute, arrayStride: number): IGPUVertexBuffer {
		const layout: GPUVertexBufferLayout = {
			arrayStride,
			stepMode: "vertex",
			attributes: [attributeDesc],
		}

		const buffer = this._createGPUBuffer(vertexAttributeData, GPUBufferUsage.VERTEX);

		return { buffer, layout };
    }

	private _createUniformBindGroup(bindGroupInputs: IBindGroupInput[]): IUniformBindGroup {
		const layoutEntries = [];
		const bindGroupEntries = [];
		for (let i = 0; i < bindGroupInputs.length; i++) {
			const input = bindGroupInputs[i];
			switch (input.type) {
				case "buffer":
					layoutEntries.push({ binding: i, visibility: GPUShaderStage.VERTEX, buffer: {} });
					bindGroupEntries.push({ binding: i, resource: { buffer: input.buffer! } });
					break;
				case "texture":
					layoutEntries.push({ binding: i, visibility: GPUShaderStage.FRAGMENT, texture: {} });
					bindGroupEntries.push({ binding: i, resource: input.texture!.createView() });
					break;
				case "sampler":
					layoutEntries.push({ binding: i, visibility: GPUShaderStage.FRAGMENT, sampler: {} });
					bindGroupEntries.push({ binding: i, resource: input.sampler! });
					break;
			}
		}
		const uniformBindGroupLayout = this._device.createBindGroupLayout({
			entries: layoutEntries
		});

		const uniformBindGroup = this._device.createBindGroup({
			layout: uniformBindGroupLayout,
			entries: bindGroupEntries
		});

		return { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup };
	}

	private _createShaderModule(source: string) {
		const shaderModule = this._device.createShaderModule({ code: source });
		return shaderModule;
	}

    private _createPipeline(shaderModule: GPUShaderModule, vertexBuffers: GPUVertexBufferLayout[], uniformBindGroups: GPUBindGroupLayout[]): GPURenderPipeline {
		// layout
		const pipelineLayoutDescriptor: GPUPipelineLayoutDescriptor = {bindGroupLayouts: uniformBindGroups};
		const layout = this._device.createPipelineLayout(pipelineLayoutDescriptor);

		const colorState = {
			format: 'bgra8unorm' as GPUTextureFormat,
		}

		const pipelineDescriptor: GPURenderPipelineDescriptor = {
			layout: layout,
			vertex: {
				module: shaderModule,
				entryPoint: WebGPUContext.VERTEX_ENTRY_POINT,
				buffers: vertexBuffers,
			},
			fragment: {
				module: shaderModule,
				entryPoint: WebGPUContext.FRAGMENT_ENTRY_POINT,
				targets: [colorState],
			},
            primitive: this._primitiveState,
            depthStencil: this._depthStencilState,
            multisample: this._msaa ? { count: this._msaa} : undefined
		}

		const pipeline = this._device.createRenderPipeline(pipelineDescriptor);
		return pipeline;
	}

	private _createTexture(imageBitmap: ImageBitmap): GPUTexture {
		const textureDescriptor: GPUTextureDescriptor = {
			size: { width: imageBitmap.width, height: imageBitmap.height },
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		}

		const texture = this._device.createTexture(textureDescriptor);

		this._device.queue.copyExternalImageToTexture({ source: imageBitmap }, {texture}, textureDescriptor.size);

		return texture;
	}

    private _createDepthTexture(): GPUTexture {
        const depthTextureDesc: GPUTextureDescriptor = {
            size: { width: this._canvas.width, height: this._canvas.height },
            dimension: '2d',
            sampleCount: this._msaa,
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT 
        };

        const depthTexture = this._device.createTexture(depthTextureDesc);
        return depthTexture;
    }

	private _createSampler(): GPUSampler {
		const samplerDescriptor: GPUSamplerDescriptor = {
			addressModeU: "repeat",
			addressModeV: "repeat",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
		}

		const sampler = this._device.createSampler(samplerDescriptor);
		return sampler;
	}

	public render_vertex_color_offset(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, colors: Float32Array, offset: Float32Array, primitiveState: GPUPrimitiveState) {

		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
		const { buffer: colorBuffer, layout: colorBufferLayout } = this._createSingleAttributeVertexBuffer(colors, { format: "float32x3", offset: 0, shaderLocation: 1 }, 3 * Float32Array.BYTES_PER_ELEMENT);

		const offsetBindGroupInput: IBindGroupInput = {
			type: "buffer",
			buffer: this._createGPUBuffer(offset, GPUBufferUsage.UNIFORM),
		}
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([offsetBindGroupInput]);

		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget());
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, colorBufferLayout], [uniformBindGroupLayout], primitiveState));
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setVertexBuffer(1, colorBuffer);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.draw(vertexCount, instanceCount);
		passEncoder.end();

		this._device.queue.submit([commandEncoder.finish()]);
	}

	public async render_textured_shape(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, texCoords: Float32Array,
		transformationMatrix: Float32Array, projectionMatrix: Float32Array, imgUri: string, primitiveState: GPUPrimitiveState) {
		const response = await fetch(imgUri);
		const blob = await response.blob();
		const imageBitmap = await createImageBitmap(blob);

		// CREATE UNIFORMS
		const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
		const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
		const texture = this._createTexture(imageBitmap);
		const sampler = this._createSampler();

		const transformationMatrixBindGroupInput: IBindGroupInput = {
			type: "buffer",
			buffer: transformationMatrixBuffer,
		}
		const projectionMatrixBindGroupInput: IBindGroupInput = {
			type: "buffer",
			buffer: projectionMatrixBuffer,
		}
		const textureBindGroupInput: IBindGroupInput = {
			type: "texture",
			texture: texture,
		}
		const samplerBindGroupInput: IBindGroupInput = {
			type: "sampler",
			sampler: sampler,
		}
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, textureBindGroupInput, samplerBindGroupInput]);

		// CREATE VERTEX BUFFERS
		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
		const { buffer: texCoordBuffer, layout: texCoordBufferLayout } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 1 }, 2 * Float32Array.BYTES_PER_ELEMENT);

		// CREATE COMMAND ENCODER
		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget());
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, texCoordBufferLayout], [uniformBindGroupLayout], primitiveState));
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setVertexBuffer(1, texCoordBuffer);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.draw(vertexCount, instanceCount);
		passEncoder.end();

		this._device.queue.submit([commandEncoder.finish()]);
	}


	public render_depth_testing(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, transformationMatrix: Float32Array, projectionMatrix: Float32Array, primitiveState: GPUPrimitiveState, depthStencilState: GPUDepthStencilState) {
		const depthTexture = this._createDepthTexture();

		const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
		const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);

		const transformationMatrixBindGroupInput: IBindGroupInput = {
			type: "buffer",
			buffer: transformationMatrixBuffer,
		}
		const projectionMatrixBindGroupInput: IBindGroupInput = {
			type: "buffer",
			buffer: projectionMatrixBuffer,
		}
	
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput]);

		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);

		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(depthTexture));
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout], [uniformBindGroupLayout], primitiveState, depthStencilState));
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.draw(vertexCount, instanceCount);
		passEncoder.end();

		this._device.queue.submit([commandEncoder.finish()]);
	}

    public async render_obj_model(shaderCode: string, objFilePath: string, transformationMatrix: Float32Array, projectionMatrix: Float32Array, normalMatrix: Float32Array, 
        lightDirection: Float32Array, viewDirection: Float32Array) {
        const objResponse = await fetch(objFilePath);
        const objBlob = await objResponse.blob();
        const objText = await objBlob.text();
        const objDataExtractor = new ObjDataExtractor(objText);

        const depthTexture = this._createDepthTexture();

        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
        const normalMatrixBuffer = this._createGPUBuffer(normalMatrix, GPUBufferUsage.UNIFORM);
        const lightDirectionBuffer = this._createGPUBuffer(lightDirection, GPUBufferUsage.UNIFORM);
        const viewDirectionBuffer = this._createGPUBuffer(viewDirection, GPUBufferUsage.UNIFORM);

        const transformationMatrixBindGroupInput: IBindGroupInput = {
        type: "buffer",
        buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
        type: "buffer",
        buffer: projectionMatrixBuffer,
        }
        const normalMatrixBindGroupInput: IBindGroupInput = {
        type: "buffer",
        buffer: normalMatrixBuffer,
        }
        const lightDirectionBindGroupInput: IBindGroupInput = { 
        type: "buffer",
        buffer: lightDirectionBuffer,
        }
        const viewDirectionBindGroupInput: IBindGroupInput = {
        type: "buffer",
        buffer: viewDirectionBuffer,
        }
    
        const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, normalMatrixBindGroupInput, lightDirectionBindGroupInput, viewDirectionBindGroupInput]);

        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.vertexPositions, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: normalBuffer, layout: normalBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.normals, { format: "float32x3", offset: 0, shaderLocation: 1 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const indexBuffer = this._createGPUBuffer(objDataExtractor.indices, GPUBufferUsage.INDEX);
    
        const commandEncoder = this._device.createCommandEncoder();

        const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(depthTexture));
        passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
        passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, normalBufferLayout], [uniformBindGroupLayout]));
        passEncoder.setVertexBuffer(0, positionBuffer);
        passEncoder.setVertexBuffer(1, normalBuffer);
        passEncoder.setIndexBuffer(indexBuffer, "uint16");
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.drawIndexed(objDataExtractor.indices.length, 1, 0, 0, 0);
        passEncoder.end();

        this._device.queue.submit([commandEncoder.finish()]);
    }
}

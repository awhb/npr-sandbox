import * as glMatrix from "gl-matrix";
import { ObjDataExtractor } from "../utils/objDataExtractor";
import { VideoLoader } from "../utils/videoLoader";
import { Arcball } from "../utils/arcball";
import { Controls } from "../utils/controls";

interface WebGpuContextInitResult {
	instance?: WebGPUContext;
	error?: string;
}

interface IBindGroupInput {
  type: "buffer" | "texture" | "sampler";
  visibility: number;
  readonly?: boolean;
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
    private _takeScreenshot: boolean;

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

    private constructor(context: GPUCanvasContext, device: GPUDevice, canvas: HTMLCanvasElement, 
        primitiveState: GPUPrimitiveState, depthStencilState?: GPUDepthStencilState, msaa?: number) {
        this._context = context;
        this._device = device;
        this._canvas = canvas;
        this._primitiveState = primitiveState;
        this._depthStencilState = depthStencilState;
        this._msaa = msaa;
        this._takeScreenshot = false; 
    }

    public set takeScreenshot(value: boolean) {
        this._takeScreenshot = value;
    }

    private _createRenderTarget(colorAttachmentTexture: GPUTexture, clearValue: {r: number, g: number, b: number, a: number}, 
        msaa?: number, depthTexture?: GPUTexture): GPURenderPassDescriptor { 
        const textureView = colorAttachmentTexture.createView();
        let colorAttachment: GPURenderPassColorAttachment;
        if (msaa) {
            const msaaTexture = this._device.createTexture({
                size: { width: this._canvas.width, height: this._canvas.height },
                sampleCount: msaa,
                format: navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });

            colorAttachment = {
                view: msaaTexture.createView(),
                resolveTarget: textureView,
                clearValue: clearValue,
                loadOp: "clear",
                storeOp: "store",
            }
        } else {
            colorAttachment = {
                view: textureView,
                clearValue: clearValue,
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

    private _createSingleAttributeVertexBuffer(vertexAttributeData: Float32Array, attributeDesc: GPUVertexAttribute, 
        arrayStride: number): IGPUVertexBuffer {
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
                    const layoutEntry = { binding: i, visibility: input.visibility, buffer: {} }
                    if (input.readonly) {
                        layoutEntry.buffer = {type: "read-only-storage"};
                    }
                    layoutEntries.push(layoutEntry);
                    bindGroupEntries.push({ binding: i, resource: { buffer: input.buffer! } });
                    break;
				case "texture":
					layoutEntries.push({ binding: i, visibility: input.visibility, texture: {} });
					bindGroupEntries.push({ binding: i, resource: input.texture!.createView() });
					break;
				case "sampler":
					layoutEntries.push({ binding: i, visibility: input.visibility, sampler: {} });
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

    private _createPipeline(shaderModule: GPUShaderModule, vertexBuffers: GPUVertexBufferLayout[], 
        uniformBindGroups: GPUBindGroupLayout[], colorFormat: GPUTextureFormat, blend?: GPUBlendState): GPURenderPipeline {
        // layout
        const pipelineLayoutDescriptor: GPUPipelineLayoutDescriptor = {bindGroupLayouts: uniformBindGroups};
        const layout = this._device.createPipelineLayout(pipelineLayoutDescriptor);

        const colorState: GPUColorTargetState = {
            format: colorFormat,
        }
        if (blend) {
            colorState.blend = blend;
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


    private _createTexture(width: number, height: number): GPUTexture { 
        const textureDescriptor: GPUTextureDescriptor = {
            size: { width, height },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        }

        const texture = this._device.createTexture(textureDescriptor);
        return texture;
    }


    private _createTextureFromImage(imageBitmap: ImageBitmap): GPUTexture {
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

	public render_vertex_color_offset(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, colors: Float32Array, offset: Float32Array) {

		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
		const { buffer: colorBuffer, layout: colorBufferLayout } = this._createSingleAttributeVertexBuffer(colors, { format: "float32x3", offset: 0, shaderLocation: 1 }, 3 * Float32Array.BYTES_PER_ELEMENT);

		const offsetBindGroupInput: IBindGroupInput = {
			type: "buffer",
            visibility: GPUShaderStage.VERTEX,
			buffer: this._createGPUBuffer(offset, GPUBufferUsage.UNIFORM),
		}
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([offsetBindGroupInput]);

		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa));
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, colorBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setVertexBuffer(1, colorBuffer);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.draw(vertexCount, instanceCount);
		passEncoder.end();

		this._device.queue.submit([commandEncoder.finish()]);
	}

	public async render_textured_shape(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, texCoords: Float32Array,
		transformationMatrix: Float32Array, projectionMatrix: Float32Array, imgUri: string) {
		const response = await fetch(imgUri);
		const blob = await response.blob();
		const imageBitmap = await createImageBitmap(blob);

		// CREATE UNIFORMS
		const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
		const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
		const texture = this._createTextureFromImage(imageBitmap);
		const sampler = this._createSampler();

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const textureBindGroupInput: IBindGroupInput = {
            type: "texture",
            visibility: GPUShaderStage.FRAGMENT,
            texture: texture,
        }
        const samplerBindGroupInput: IBindGroupInput = {
            type: "sampler",
            visibility: GPUShaderStage.FRAGMENT,
            sampler: sampler,
        }
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, textureBindGroupInput, samplerBindGroupInput]);

		// CREATE VERTEX BUFFERS
		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
		const { buffer: texCoordBuffer, layout: texCoordBufferLayout } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 1 }, 2 * Float32Array.BYTES_PER_ELEMENT);

		// CREATE COMMAND ENCODER
		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa));
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, texCoordBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
		passEncoder.setVertexBuffer(0, positionBuffer);
		passEncoder.setVertexBuffer(1, texCoordBuffer);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.draw(vertexCount, instanceCount);
		passEncoder.end();

		this._device.queue.submit([commandEncoder.finish()]);
	}


	public render_depth_testing(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, transformationMatrix: Float32Array, projectionMatrix: Float32Array) {
		const depthTexture = this._createDepthTexture();

		const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
		const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
	
		const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput]);

		const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);

		const commandEncoder = this._device.createCommandEncoder();

		const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa, depthTexture));
		passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
		passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
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

        let depthTexture = this._createDepthTexture();

        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const normalMatrixBuffer = this._createGPUBuffer(normalMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const lightDirectionBuffer = this._createGPUBuffer(lightDirection, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const viewDirectionBuffer = this._createGPUBuffer(viewDirection, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const normalMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: normalMatrixBuffer,
        }
        const lightDirectionBindGroupInput: IBindGroupInput = { 
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: lightDirectionBuffer,
        }
        const viewDirectionBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: viewDirectionBuffer,
        }
    
        const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, normalMatrixBindGroupInput, lightDirectionBindGroupInput, viewDirectionBindGroupInput]);

        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.vertexPositions, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: normalBuffer, layout: normalBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.normals, { format: "float32x3", offset: 0, shaderLocation: 1 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const indexBuffer = this._createGPUBuffer(objDataExtractor.indices, GPUBufferUsage.INDEX);

        const arcBall = new Arcball(5.0);

        const render = () => {
            const devicePixelRatio = window.devicePixelRatio || 1;
            const currentCanvasWidth = this._canvas.clientWidth * devicePixelRatio;
            const currentCanvasHeight = this._canvas.clientHeight * devicePixelRatio;

            let projectionMatrixUpdateBuffer = null;
            if (currentCanvasWidth != this._canvas.width || currentCanvasHeight != this._canvas.height) { 
                this._canvas.width = currentCanvasWidth;
                this._canvas.height = currentCanvasHeight;

                // Re-configure the context to match the new canvas size. This is CRITICAL to canvas resize working
                this._context.configure({
                    device: this._device,
                    format: navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                    alphaMode: "opaque",
                });

                depthTexture.destroy();
                depthTexture = this._createDepthTexture();

                const updateProjectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(), 1.4, this._canvas.width / this._canvas.height, 0.1, 1000.0);
                projectionMatrixUpdateBuffer = this._createGPUBuffer(Float32Array.from(updateProjectionMatrix), GPUBufferUsage.COPY_SRC);
            }

            const modelViewMatrix = arcBall.getMatrices();
            const modelViewMatrixUpdateBuffer = this._createGPUBuffer(Float32Array.from(modelViewMatrix), GPUBufferUsage.COPY_SRC);

            const modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);
            const normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse);
            const normalMatrixUpdateBuffer = this._createGPUBuffer(Float32Array.from(normalMatrix), GPUBufferUsage.COPY_SRC);

            const viewDirection = glMatrix.vec3.fromValues(-arcBall.forward[0], -arcBall.forward[1], -arcBall.forward[2]);
            const viewDirectionUpdateBuffer = this._createGPUBuffer(Float32Array.from(viewDirection), GPUBufferUsage.COPY_SRC);

            const commandEncoder = this._device.createCommandEncoder();
            if (projectionMatrixUpdateBuffer != null) {
                commandEncoder.copyBufferToBuffer(projectionMatrixUpdateBuffer, 0, projectionMatrixBuffer, 0, 16 * Float32Array.BYTES_PER_ELEMENT);
            }

            commandEncoder.copyBufferToBuffer(modelViewMatrixUpdateBuffer, 0, transformationMatrixBuffer, 0, 16 * Float32Array.BYTES_PER_ELEMENT);
            commandEncoder.copyBufferToBuffer(normalMatrixUpdateBuffer, 0, normalMatrixBuffer, 0, 16 * Float32Array.BYTES_PER_ELEMENT);
            commandEncoder.copyBufferToBuffer(viewDirectionUpdateBuffer, 0, viewDirectionBuffer, 0, 3 * Float32Array.BYTES_PER_ELEMENT);
            commandEncoder.copyBufferToBuffer(viewDirectionUpdateBuffer, 0, lightDirectionBuffer, 0, 3 * Float32Array.BYTES_PER_ELEMENT);

            const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa, depthTexture));
            passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
            passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, normalBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
            passEncoder.setVertexBuffer(0, positionBuffer);
            passEncoder.setVertexBuffer(1, normalBuffer);
            passEncoder.setIndexBuffer(indexBuffer, "uint16");
            passEncoder.setBindGroup(0, uniformBindGroup);
            passEncoder.drawIndexed(objDataExtractor.indices.length, 1, 0, 0, 0);
            passEncoder.end();
        
            this._device.queue.submit([commandEncoder.finish()]);

            requestAnimationFrame(render);
        }
    
        new Controls(this._canvas, arcBall, render);
        requestAnimationFrame(render);
    }

    public async render_gaussian_blur(shaderCodeOne: string, shaderCodeTwo: string, vertexCount: number, instanceCount: number, vertices: Float32Array, texCoords: Float32Array,
        transformationMatrix: Float32Array, projectionMatrix: Float32Array, imgUri: string) {
        const response = await fetch(imgUri);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        // CREATE UNIFORMS
        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
        const texture = this._createTextureFromImage(imageBitmap);
        const sampler = this._createSampler();
        const passOneTexture = this._createTexture(texture.width, texture.height);

        const imgSizeBuffer = this._createGPUBuffer(new Float32Array([imageBitmap.width, imageBitmap.height]), GPUBufferUsage.UNIFORM);
        let kValues = [];
    
        const kernelSize = 8.0;
        const sigma = 8.0;
        let intensity = 0.0;
        
        for (let y = - kernelSize; y <= kernelSize; y += 1.0) {
            let gaussian_value = 1.0 / Math.sqrt(2.0 * Math.PI * sigma * sigma) * Math.exp(-y * y / (2.0 * sigma * sigma));
            intensity += gaussian_value;
            kValues.push(gaussian_value);
        }
        const kernelBuffer = this._createGPUBuffer(new Float32Array(kValues), GPUBufferUsage.STORAGE);
        const kernelSizeBuffer = this._createGPUBuffer(new Float32Array([kernelSize]), GPUBufferUsage.UNIFORM);

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const imageSizeBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.FRAGMENT,
            buffer: imgSizeBuffer,
        }
        const textureBindGroupInput: IBindGroupInput = {
            type: "texture",
            visibility: GPUShaderStage.FRAGMENT,
            texture: texture,
        }
        const samplerBindGroupInput: IBindGroupInput = {
            type: "sampler",
            visibility: GPUShaderStage.FRAGMENT,
            sampler: sampler,
        }
        const kernelBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.FRAGMENT,
            readonly: true,
            buffer: kernelBuffer,
        }
        const kernelSizeBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.FRAGMENT,
            buffer: kernelSizeBuffer,
        }
        const passOneTextureBindGroupInput: IBindGroupInput = {
            type: "texture",
            visibility: GPUShaderStage.FRAGMENT,
            texture: passOneTexture,
        }


        const { bindGroupLayout: uniformBindGroupLayoutPassOne, bindGroup: uniformBindGroupPassOne } = this._createUniformBindGroup([imageSizeBindGroupInput, textureBindGroupInput, samplerBindGroupInput, kernelBindGroupInput, kernelSizeBindGroupInput]);
        const { bindGroupLayout: uniformBindGroupLayoutPassTwo, bindGroup: uniformBindGroupPassTwo } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, imageSizeBindGroupInput, passOneTextureBindGroupInput, samplerBindGroupInput, kernelBindGroupInput, kernelSizeBindGroupInput]);

        // CREATE VERTEX BUFFERS
        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: texCoordBufferOne, layout: texCoordBufferLayoutOne } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 0 }, 2 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: texCoordBufferTwo, layout: texCoordBufferLayoutTwo } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 1 }, 2 * Float32Array.BYTES_PER_ELEMENT);

        // CREATE COMMAND ENCODER
        const commandEncoder = this._device.createCommandEncoder();

        const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(passOneTexture, {r: 0.0, g: 0.0, b: 0.0, a: 0.0}));
        passEncoder.setViewport(0, 0, texture.width, texture.height, 0, 1);
        passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCodeOne), [texCoordBufferLayoutOne], [uniformBindGroupLayoutPassOne], "rgba8unorm"));
        passEncoder.setVertexBuffer(0, texCoordBufferOne);
        passEncoder.setBindGroup(0, uniformBindGroupPassOne);
        passEncoder.draw(vertexCount, instanceCount);
        passEncoder.end();

        const passEncoderTwo = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}));
        passEncoderTwo.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
        passEncoderTwo.setPipeline(this._createPipeline(this._createShaderModule(shaderCodeTwo), [positionBufferLayout, texCoordBufferLayoutTwo], [uniformBindGroupLayoutPassTwo], "bgra8unorm"));
        passEncoderTwo.setVertexBuffer(0, positionBuffer);
        passEncoderTwo.setVertexBuffer(1, texCoordBufferTwo);
        passEncoderTwo.setBindGroup(0, uniformBindGroupPassTwo);
        passEncoderTwo.draw(vertexCount, instanceCount);
        passEncoderTwo.end();
    
        this._device.queue.submit([commandEncoder.finish()]);
    }

    public async render_video_texture(shaderCode: string, vertexCount: number, instanceCount: number, vertices: Float32Array, texCoords: Float32Array,
        transformationMatrix: Float32Array, projectionMatrix: Float32Array, videoUrl: string) 
    {
        const videoLoader = await VideoLoader.create(videoUrl);
        const videoTexture = this._createTexture(videoLoader.videoElement.videoWidth, videoLoader.videoElement.videoHeight);
        videoLoader.videoElement.ontimeupdate = async (_event) => {
            const imagedData = await createImageBitmap(videoLoader.videoElement);
            this._device.queue.copyExternalImageToTexture({ source: imagedData }, {texture: videoTexture}, {width: imagedData.width, height: imagedData.height});
        }

        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
        const sampler = this._createSampler();

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const textureBindGroupInput: IBindGroupInput = {
            type: "texture",
            visibility: GPUShaderStage.FRAGMENT,
            texture: videoTexture,
        }
        const samplerBindGroupInput: IBindGroupInput = {
            type: "sampler",
            visibility: GPUShaderStage.FRAGMENT,
            sampler: sampler,
        }
        const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, textureBindGroupInput, samplerBindGroupInput]);

        // CREATE VERTEX BUFFERS
        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(vertices, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: texCoordBuffer, layout: texCoordBufferLayout } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 1 }, 2 * Float32Array.BYTES_PER_ELEMENT);

        // CREATE COMMAND ENCODER
        const render = () => {
            const commandEncoder = this._device.createCommandEncoder();

            const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa));
            passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
            passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, texCoordBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
            passEncoder.setVertexBuffer(0, positionBuffer);
            passEncoder.setVertexBuffer(1, texCoordBuffer);
            passEncoder.setBindGroup(0, uniformBindGroup);
            passEncoder.draw(vertexCount, instanceCount);
            passEncoder.end();

            this._device.queue.submit([commandEncoder.finish()]);

            requestAnimationFrame(render);
        }
        
        requestAnimationFrame(render);
    }

    public async render_text(shaderCode: string, transformationMatrix: Float32Array, projectionMatrix: Float32Array,
        text: string, width: number, height: number, alpha: number, fontWeight: string, fontFamily: string, 
        fillStyle: string, fontSize: number, textLength: number) 
    {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0,0, width, height);
        ctx.globalAlpha = alpha;
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = fillStyle;
        const textMeasure = ctx.measureText(text);

        ctx.fillText(text, 0, textLength);

        const nearestPowerof2 = 1 << (32 - Math.clz32(Math.ceil(textMeasure.width)));
        const texture = this._createTexture(nearestPowerof2, fontSize);
        this._device.queue.copyExternalImageToTexture({ source: canvas, origin: {x: 0, y:0}}, {texture: texture}, {width: nearestPowerof2, height: fontSize});

        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM);
        const sampler = this._createSampler();

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const textureBindGroupInput: IBindGroupInput = {
            type: "texture",
            visibility: GPUShaderStage.FRAGMENT,
            texture: texture,
        }
        const samplerBindGroupInput: IBindGroupInput = {
            type: "sampler",
            visibility: GPUShaderStage.FRAGMENT,
            sampler: sampler,
        }
        const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, textureBindGroupInput, samplerBindGroupInput]);

        const positions = new Float32Array([
            textMeasure.width *0.5, -16.0, 0.0,
            textMeasure.width*0.5, 16.0, 0.0,
            -textMeasure.width*0.5, -16.0, 0.0,
            -textMeasure.width*0.5, 16.0, 0.0
        ]);

        const w = textMeasure.width / nearestPowerof2;
        const texCoords = new Float32Array([
            w,
            1.0,
            
            w,
            0.0,

            0.0,
            1.0,

            0.0,
            0.0
        ]);

        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(positions, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: texCoordBuffer, layout: texCoordBufferLayout } = this._createSingleAttributeVertexBuffer(texCoords, { format: "float32x2", offset: 0, shaderLocation: 1 }, 2 * Float32Array.BYTES_PER_ELEMENT);

        const blend: GPUBlendState = {
            color: {
                srcFactor: "one",
                dstFactor: "one-minus-src",
                operation: "add",
            },
            alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src",
                operation: "add",
            }
        }

        const commandEncoder = this._device.createCommandEncoder();

        const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa));
        passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
        passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, texCoordBufferLayout], [uniformBindGroupLayout], "bgra8unorm", blend));
        passEncoder.setVertexBuffer(0, positionBuffer);
        passEncoder.setVertexBuffer(1, texCoordBuffer);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(4, 1);
        passEncoder.end();

        this._device.queue.submit([commandEncoder.finish()]);
    }

    public async render_video_image_render_obj(shaderCode: string, objFilePath: string, transformationMatrix: Float32Array, projectionMatrix: Float32Array, normalMatrix: Float32Array) {
        const objResponse = await fetch(objFilePath);
        const objBlob = await objResponse.blob();
        const objText = await objBlob.text();
        const objDataExtractor = new ObjDataExtractor(objText);

        let depthTexture = this._createDepthTexture();

        const transformationMatrixBuffer = this._createGPUBuffer(transformationMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const projectionMatrixBuffer = this._createGPUBuffer(projectionMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        const normalMatrixBuffer = this._createGPUBuffer(normalMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        const transformationMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: transformationMatrixBuffer,
        }
        const projectionMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: projectionMatrixBuffer,
        }
        const normalMatrixBindGroupInput: IBindGroupInput = {
            type: "buffer",
            visibility: GPUShaderStage.VERTEX,
            buffer: normalMatrixBuffer,
        }
    
    
        const { bindGroupLayout: uniformBindGroupLayout, bindGroup: uniformBindGroup } = this._createUniformBindGroup([transformationMatrixBindGroupInput, projectionMatrixBindGroupInput, normalMatrixBindGroupInput]);

        const { buffer: positionBuffer, layout: positionBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.vertexPositions, { format: "float32x3", offset: 0, shaderLocation: 0 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const { buffer: normalBuffer, layout: normalBufferLayout } = this._createSingleAttributeVertexBuffer(objDataExtractor.normals, { format: "float32x3", offset: 0, shaderLocation: 1 }, 3 * Float32Array.BYTES_PER_ELEMENT);
        const indexBuffer = this._createGPUBuffer(objDataExtractor.indices, GPUBufferUsage.INDEX);

        let angle = 0.0;
        const render = async () => {
            angle += 0.1;
            const modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
                glMatrix.vec3.fromValues(Math.cos(angle) * 5.0, Math.sin(angle) * 5.0, 5), glMatrix.vec3.fromValues(0, 0, 0), glMatrix.vec3.fromValues(0.0, 0.0, 1.0));
            const modelViewMatrixUniformBufferUpdate = this._createGPUBuffer(new Float32Array(modelViewMatrix), GPUBufferUsage.COPY_SRC);
            const modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);
            const normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse);
            const normalMatrixUniformBufferUpdate = this._createGPUBuffer(new Float32Array(normalMatrix), GPUBufferUsage.COPY_SRC);

            const commandEncoder = this._device.createCommandEncoder();

            commandEncoder.copyBufferToBuffer(modelViewMatrixUniformBufferUpdate, 0, transformationMatrixBuffer, 0, 16 * Float32Array.BYTES_PER_ELEMENT);
            commandEncoder.copyBufferToBuffer(normalMatrixUniformBufferUpdate, 0, normalMatrixBuffer, 0, 16 * Float32Array.BYTES_PER_ELEMENT);

            const passEncoder = commandEncoder.beginRenderPass(this._createRenderTarget(this._context.getCurrentTexture(), {r: 1.0, g: 0.0, b: 0.0, a: 1.0}, this._msaa, depthTexture));
            passEncoder.setViewport(0, 0, this._canvas.width, this._canvas.height, 0, 1);
            passEncoder.setPipeline(this._createPipeline(this._createShaderModule(shaderCode), [positionBufferLayout, normalBufferLayout], [uniformBindGroupLayout], "bgra8unorm"));
            passEncoder.setVertexBuffer(0, positionBuffer);
            passEncoder.setVertexBuffer(1, normalBuffer);
            passEncoder.setBindGroup(0, uniformBindGroup);
            passEncoder.setIndexBuffer(indexBuffer, "uint16");
            passEncoder.drawIndexed(objDataExtractor.indices.length, 1, 0, 0, 0);
            passEncoder.end();

            this._device.queue.submit([commandEncoder.finish()]);

            await this._device.queue.onSubmittedWorkDone();

            if (this._takeScreenshot) {
                this._takeScreenshot = false;
                this._canvas.toBlob((blob) => {
                if (blob === null) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "screenshot.png";
                a.click();
                });
            }

            requestAnimationFrame(render);
        }
        
        requestAnimationFrame(render);
    }
}

import { useEffect, useRef, useState } from "react";
import { WebGPUContext } from "./core/webgpu-context";
import renderScene from "./scenes/videos_and_images";

export const App: React.FC = () => {
    const [recording, setRecording] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const webGPUContextRef = useRef<WebGPUContext | null | undefined>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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

        webGPUContextRef.current = webGpuContext.instance;

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

    const toggleRecording = async () => {
        if (!recording) {
            const stream = canvasRef.current!.captureStream(30);
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "video/webm" });

            const recordedChunks: BlobPart[] = [];

            mediaRecorderRef.current!.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            }

            mediaRecorderRef.current!.onstop = () => {
                const blob = new Blob(recordedChunks, { type: "video/webm" });
                const url = URL.createObjectURL(blob);

                // Create a downloadable link
                const a = document.createElement("a");
                a.href = url;
                a.download = "recorded-video.webm";
                a.click();

                // Clean up
                URL.revokeObjectURL(url);
            }

            mediaRecorderRef.current!.start();
        } else {
            mediaRecorderRef.current!.stop();
        }

        setRecording(prev => !prev);
    }

	return (
        <div style={{display: "flex", flexDirection: "column", height: "100%", position: "relative"}}>
            <canvas ref={canvasRef} width={640} height={480} style={{flexGrow: 1, flexShrink: 0}}></canvas>
            <button onClick={() => webGPUContextRef.current!.takeScreenshot = true}>Screenshot</button>
            <button onClick={toggleRecording}>{recording ? "Stop" : "Start"}</button>
			{!webGpuSupported && (
				<div style={{ color: "red", marginTop: "1rem" }}>
					Your browser does not support WebGPU. Please download a browser from
					<a href="https://caniuse.com/webgpu" target="_blank" rel="noopener noreferrer"> this site</a>.
				</div>
			)}
		</div>
	)
};


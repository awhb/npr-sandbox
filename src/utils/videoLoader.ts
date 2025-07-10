export class VideoLoader {
    private _videoElement: HTMLVideoElement;
    public static async create(videoUrl: string): Promise<VideoLoader> { 
        const videoElement = document.createElement("video");
        videoElement.playsInline = true;
        videoElement.muted = true;
        videoElement.loop = true;
        const videoReadyPromise = new Promise<void>((resolve) => {
            let playing = false;
            let timeUpdated = false;
            videoElement.addEventListener("playing", () => {
                playing = true;
                if (playing && timeUpdated) {
                    resolve();
                }
            });
            videoElement.addEventListener("timeupdate", () => {
                timeUpdated = true;
                if (playing && timeUpdated) {
                    resolve();
                }
            });
        });
        videoElement.src = videoUrl;
        videoElement.play();
        await videoReadyPromise;
        return new VideoLoader(videoElement);
    }
    constructor(videoElement: HTMLVideoElement) {
        this._videoElement = videoElement;
    }
    get videoElement(): HTMLVideoElement {
        return this._videoElement;
    }
}
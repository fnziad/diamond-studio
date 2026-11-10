import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

export async function exportMotion(canvas, { frame, cancelled, progress }) {
  const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
  const capture = document.createElement("canvas");
  capture.width = Math.max(2, Math.floor((canvas.width * scale) / 2) * 2);
  capture.height = Math.max(2, Math.floor((canvas.height * scale) / 2) * 2);
  const context = capture.getContext("2d", { alpha: false });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(capture, {
    codec: "avc",
    quality: new Quality({ bitrate: 6000000 }),
  });
  const fps = 24,
    count = fps * 8;
  output.addVideoTrack(source, { frameRate: fps });
  try {
    await output.start();
    for (let i = 0; i < count; i++) {
      if (cancelled()) {
        await output.cancel();
        return null;
      }
      frame((i / count) * 2 * Math.PI);
      context.drawImage(canvas, 0, 0, capture.width, capture.height);
      await source.add(i / fps, 1 / fps);
      if (i % 6 === 0) progress((i + 1) / count);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await output.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled")
      await output.cancel();
    throw error;
  }
}

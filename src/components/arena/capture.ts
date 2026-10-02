/**
 * In-app capture helpers.
 *
 * OS screenshot / screen-recording tools often produce a black frame over a
 * hardware-accelerated WebGL canvas (the GPU surface never lands in the
 * composited copy). Grabbing the pixels straight from the canvas — which is
 * created with `preserveDrawingBuffer: true` — always yields a real image.
 */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Saves the current rendered frame as a PNG. */
export function captureScreenshot(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        download(blob, `ironhowl-${stamp()}.png`);
        resolve(true);
      }, "image/png");
    } catch {
      resolve(false);
    }
  });
}

export type ArenaRecorder = {
  stop: () => void;
};

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/** Records the canvas straight from its frame stream. Returns null if unsupported. */
export function startRecording(
  canvas: HTMLCanvasElement,
  onStopped: (ok: boolean) => void,
): ArenaRecorder | null {
  const canvasWithStream = canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (typeof MediaRecorder === "undefined" || !canvasWithStream.captureStream) return null;

  let stream: MediaStream;
  try {
    stream = canvasWithStream.captureStream(60);
  } catch {
    return null;
  }

  const mimeType = pickMime();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
  } catch {
    return null;
  }

  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (!chunks.length) return onStopped(false);
    const type = rec.mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    download(new Blob(chunks, { type }), `ironhowl-${stamp()}.${ext}`);
    onStopped(true);
  };

  rec.start(1000);
  return {
    stop: () => {
      if (rec.state !== "inactive") rec.stop();
    },
  };
}

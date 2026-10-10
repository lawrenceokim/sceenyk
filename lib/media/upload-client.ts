"use client";

export function uploadFileDirectly(
  file: File,
  authorization: { url: string; headers: Record<string, string> },
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("PUT", authorization.url);
    request.timeout = 30 * 60 * 1000;
    for (const [name, value] of Object.entries(authorization.headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      cleanup();
      // A lost successful PUT may be retried; conditional-write refusal means
      // the server must inspect the existing object before declaring success.
      if (
        (request.status >= 200 && request.status < 300) ||
        request.status === 412
      )
        resolve();
      else
        reject(
          new Error(
            `Storage refused the upload (HTTP ${request.status}). Retry the upload.`,
          ),
        );
    };
    request.onerror = () => {
      cleanup();
      reject(
        new Error(
          "The file couldn’t reach storage. Retry the upload. If this continues, contact support.",
        ),
      );
    };
    request.ontimeout = () => {
      cleanup();
      reject(
        new Error("The upload timed out. Check your connection and retry."),
      );
    };
    request.onabort = () => {
      cleanup();
      reject(
        new Error("Upload interrupted. Retry when you return to this project."),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(new Error("Upload interrupted."));
      return;
    }
    // Browser computes Content-Length from File; JavaScript must not set it.
    request.send(file);
  });
}
export type UploadState = {
  status: "selected" | "preparing" | "uploading" | "verifying" | "failed";
  progress?: number;
  message?: string;
};

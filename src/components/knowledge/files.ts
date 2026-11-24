// Fetch originals without navigating away from an installed PWA.
const prepared = new Map<string, File>();
export async function savePrivateFile(url: string, filename: string) {
  let file = prepared.get(url);
  if (!file) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Unable to retrieve this file. Please retry.");
    }
    file = new File([await response.blob()], filename, {
      type: response.headers.get("Content-Type") || "application/octet-stream",
    });
  }
  if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    prepared.clear();
    prepared.set(url, file);
    try {
      await navigator.share({ files: [file], title: filename });
      prepared.delete(url);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        prepared.delete(url);
        return;
      }
      throw new Error("Your file is ready. Tap Save original again to open the share sheet.");
    }
  } else {
    const objectUrl = URL.createObjectURL(file),
      anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    prepared.delete(url);
  }
}

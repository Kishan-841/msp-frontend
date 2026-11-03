import api from "@/lib/axios";
import { notify } from "@/lib/notify";

/**
 * Authenticated file download (CSV exports etc.) — fetch as blob, then save.
 * Shows a loading → done / failed toast; never throws (the toast already says what went wrong).
 */
export async function downloadFile(url: string, filename: string, params?: Record<string, string | undefined>) {
  await notify
    .promise(
      async () => {
        const { data } = await api.get(url, { params, responseType: "blob" });
        const href = URL.createObjectURL(data as Blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(href);
      },
      { loading: `Preparing ${filename}…`, success: `Downloaded ${filename}`, error: "Couldn't download" }
    )
    .catch(() => undefined);
}

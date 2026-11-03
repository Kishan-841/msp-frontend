"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { useAuthStore } from "@/stores/auth-store";
import type { Attachment, AttachmentEntityType } from "@/types";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.eml,.msg,.txt";

export async function uploadAttachment(
  file: File,
  entityType: AttachmentEntityType,
  entityId: string
) {
  const form = new FormData();
  form.append("entityType", entityType);
  form.append("entityId", entityId);
  form.append("file", file);
  // Override the client's JSON default, or axios serializes the FormData to JSON;
  // the browser then fills in the multipart boundary itself
  const { data } = await api.post("/attachments", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data as Attachment;
}

// Files need the auth header, so fetch as a blob instead of a plain link
async function downloadAttachment(a: Attachment) {
  const { data } = await api.get(`/attachments/${a.id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = a.originalName;
  link.click();
  URL.revokeObjectURL(url);
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface AttachmentListProps {
  entityType: AttachmentEntityType;
  entityId: string;
  canUpload?: boolean;
  emptyText?: string;
}

export function AttachmentList({
  entityType,
  entityId,
  canUpload = false,
  emptyText = "No files attached.",
}: AttachmentListProps) {
  const user = useAuthStore((s) => s.user);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const { data } = await api.get("/attachments", { params: { entityType, entityId } });
      setFiles(data.data ?? []);
    } catch {
      /* the list is secondary on the page — an empty list is fine if it can't load */
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      await notify.promise(uploadAttachment(file, entityType, entityId), {
        loading: `Uploading ${file.name}…`,
        success: `${file.name} attached`,
        error: "Couldn't upload the file",
      });
      await fetchFiles();
    } catch {
      /* the toast already shows the reason (size / file type) */
    } finally {
      setUploading(false);
    }
  };

  const remove = async (a: Attachment) => {
    try {
      await api.delete(`/attachments/${a.id}`);
      notify.success("File removed", a.originalName);
      fetchFiles();
    } catch (err) {
      notify.apiError(err, "Couldn't remove the file");
    }
  };

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(a.size)}
                  {a.uploadedBy ? ` · ${a.uploadedBy.name}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${a.originalName}`}
                onClick={() => downloadAttachment(a).catch((err) => notify.apiError(err, "Couldn't download the file"))}
              >
                <Download className="size-4" />
              </Button>
              {(a.uploadedBy?.id === user?.id || user?.role === "ADMIN") && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${a.originalName}`}
                  onClick={() => remove(a)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <>
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            Attach file
          </Button>
        </>
      )}
    </div>
  );
}

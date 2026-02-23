"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const MAX_CHARS = 240;
const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface PresignResponse {
  data: { uploadUrl: string; publicUrl: string };
}

export function PostComposer() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_CHARS - content.length;
  const canSubmit = (content.trim().length > 0 || files.length > 0) && remaining >= 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so same file can be re-added

    const slots = MAX_IMAGES - files.length;
    const toAdd: File[] = [];
    let validationError: string | null = null;
    const truncationMsg =
      incoming.length > slots && slots > 0
        ? `Up to ${MAX_IMAGES} images allowed — ${incoming.length - slots} extra file(s) ignored`
        : null;

    for (const f of incoming.slice(0, slots)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        validationError = "Only jpg, png, gif, and webp are supported";
        break;
      }
      if (f.size > MAX_BYTES) {
        validationError = "Each image must be under 5 MB";
        break;
      }
      toAdd.push(f);
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(truncationMsg);
    const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
    setFiles((prev) => [...prev, ...toAdd]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(previews[index]!);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || uploading || posting) return;

    setError(null);

    try {
      // 1. Upload images in parallel via presigned PUT URLs
      let mediaUrls: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        mediaUrls = await Promise.all(
          files.map(async (file) => {
            const presign = await api.post<PresignResponse>("/api/uploads/presign", {
              filename: file.name,
              contentType: file.type,
              size: file.size,
            });
            const putRes = await fetch(presign.data.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!putRes.ok) throw new Error("Image upload failed");
            return presign.data.publicUrl;
          })
        );
        setUploading(false);
      }

      // 2. Create post
      setPosting(true);
      await api.post("/api/posts", {
        content: content.trim(),
        ...(mediaUrls.length > 0 && { mediaUrls }),
      });

      // 3. Reset
      previews.forEach(URL.revokeObjectURL);
      setContent("");
      setFiles([]);
      setPreviews([]);
      router.refresh();
    } catch (err) {
      setUploading(false);
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  const isLoading = uploading || posting;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-800 border border-surface-700 rounded-xl p-4 mb-6"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        maxLength={MAX_CHARS}
        className="w-full resize-none text-sm text-slate-200 placeholder-slate-500 focus:outline-none bg-transparent"
      />

      {/* Image previews */}
      {previews.length > 0 && (
        <div
          className={`mt-2 grid gap-1 ${
            previews.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {previews.map((src, i) => (
            <div key={i} className="relative group">
              <img
                src={src}
                alt=""
                className={`w-full object-cover rounded-lg ${
                  previews.length === 1 ? "max-h-60" : "h-32"
                }`}
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-700">
        <div className="flex items-center gap-3">
          {/* Image upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_IMAGES || isLoading}
            className="text-brand-400 hover:text-brand-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
            title={files.length >= MAX_IMAGES ? "Maximum 4 images" : "Add image"}
          >
            ⊞
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <span
            className={`text-xs tabular-nums ${
              remaining < 20 ? "text-red-400 font-medium" : "text-slate-400"
            }`}
          >
            {remaining}
          </span>
        </div>

        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="bg-brand-500 hover:bg-brand-600 disabled:bg-brand-500/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors"
        >
          {uploading ? "Uploading…" : posting ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}

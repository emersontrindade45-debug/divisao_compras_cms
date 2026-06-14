import path from "path";
import { writeFile, mkdir, unlink } from "fs/promises";
import type { StorageAdapter, UploadedFile } from "./index";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const localAdapter: StorageAdapter = {
  async upload(file: File, folder = "evidencias"): Promise<UploadedFile> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const destDir = path.join(UPLOAD_DIR, folder);
    await mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, safeName);
    await writeFile(destPath, buffer);
    return {
      path: path.join(folder, safeName),
      url: `/uploads/${folder}/${safeName}`,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    };
  },

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(UPLOAD_DIR, filePath);
    await unlink(fullPath);
  },
};

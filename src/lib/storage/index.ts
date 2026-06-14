export interface UploadedFile {
  path: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface StorageAdapter {
  upload(file: File, folder?: string): Promise<UploadedFile>;
  delete(path: string): Promise<void>;
}

export { localAdapter as storageAdapter } from "./local";

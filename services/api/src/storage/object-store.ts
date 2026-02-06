import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StoredFile {
  id: string;
  filename: string;
  ext?: string;
  sha256: string;
  size: number;
  cached: boolean;
  storage_path: string;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(moduleDir, "../../storage/objects");

function getStorageDir() {
  return process.env.OBJECT_STORAGE_DIR
    ? path.resolve(process.env.OBJECT_STORAGE_DIR)
    : DEFAULT_STORAGE_DIR;
}

function sanitizeId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe.includes("..")) {
    throw new Error("Invalid file id");
  }
  return safe;
}

function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function ensureDir() {
  const dir = getStorageDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function computeFileHash(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return {
    sha256: sha256Hex(buffer),
    size: buffer.length
  };
}

export async function storeRemoteFile(
  url: string,
  buffer: Buffer,
  ext?: string
): Promise<StoredFile> {
  const dir = await ensureDir();
  const urlHash = sha256Hex(url);
  const normalizedExt = ext ? ext.replace(/^\./, "").toLowerCase() : "";
  const filename = normalizedExt ? `${urlHash}.${normalizedExt}` : urlHash;
  const safeName = sanitizeId(filename);
  const filePath = path.join(dir, safeName);

  let cached = false;
  let sha256: string;
  let size: number;

  try {
    const stats = await fs.stat(filePath);
    if (stats.isFile()) {
      cached = true;
      const hashInfo = await computeFileHash(filePath);
      sha256 = hashInfo.sha256;
      size = hashInfo.size;
      return {
        id: safeName,
        filename: safeName,
        ext: normalizedExt || undefined,
        sha256,
        size,
        cached,
        storage_path: filePath
      };
    }
  } catch {
    // file does not exist; continue to write
  }

  await fs.writeFile(filePath, buffer);
  sha256 = sha256Hex(buffer);
  size = buffer.length;

  return {
    id: safeName,
    filename: safeName,
    ext: normalizedExt || undefined,
    sha256,
    size,
    cached,
    storage_path: filePath
  };
}

export async function getStoredFilePath(fileId: string): Promise<string> {
  const dir = getStorageDir();
  const safeName = sanitizeId(fileId);
  const filePath = path.join(dir, safeName);
  await fs.access(filePath);
  return filePath;
}

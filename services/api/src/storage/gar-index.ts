import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GarIndexRecord {
  stored_id?: string;
  sha256?: string;
  size?: number;
  ext?: string;
  download_url?: string;
  status: "cached" | "failed";
  last_seen?: string;
  last_attempt?: string;
  error?: string;
}

interface GarIndexFile {
  version: number;
  updated_at: string;
  records: Record<string, GarIndexRecord>;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INDEX_PATH = path.resolve(moduleDir, "../../storage/gar-download-index.json");
let cachedIndex: GarIndexFile | null = null;

function getIndexPath() {
  return process.env.GAR_INDEX_PATH
    ? path.resolve(process.env.GAR_INDEX_PATH)
    : DEFAULT_INDEX_PATH;
}

async function ensureIndexDir() {
  const dir = path.dirname(getIndexPath());
  await fs.mkdir(dir, { recursive: true });
}

async function loadIndex(): Promise<GarIndexFile> {
  if (cachedIndex) return cachedIndex;
  await ensureIndexDir();
  const indexPath = getIndexPath();
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    cachedIndex = JSON.parse(raw) as GarIndexFile;
  } catch {
    cachedIndex = {
      version: 1,
      updated_at: new Date().toISOString(),
      records: {}
    };
  }
  return cachedIndex;
}

async function saveIndex(index: GarIndexFile) {
  await ensureIndexDir();
  index.updated_at = new Date().toISOString();
  const indexPath = getIndexPath();
  const tmpPath = `${indexPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), "utf-8");
  await fs.rename(tmpPath, indexPath);
}

export async function getGarRecord(url: string): Promise<GarIndexRecord | undefined> {
  const index = await loadIndex();
  return index.records[url];
}

export async function setGarRecord(url: string, record: GarIndexRecord): Promise<void> {
  const index = await loadIndex();
  index.records[url] = record;
  await saveIndex(index);
}

import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import { initDb, query } from "../db";
import {
  ALLOWED_DOMAINS,
  JURISDICTIONS,
  SOURCE_TYPES,
  ITEM_STATUSES,
  TOPICS,
  IMPACTED_AREAS,
  PRIORITIES,
  EVIDENCE_STATUS,
  TRUST_TIERS,
  MONITORING_STAGES
} from "@regpulse/ontology";

async function seedTerms(termType: string, values: readonly string[]) {
  for (const value of values) {
    await query(
      "INSERT INTO ontology_terms (term_type, value) VALUES ($1, $2) ON CONFLICT (value) DO NOTHING",
      [termType, value]
    );
  }
}

async function ensureLocalVectorStore() {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM vector_stores WHERE provider = 'local' LIMIT 1"
  );
  if (rows.length === 0) {
    await query(
      "INSERT INTO vector_stores (id, name, provider, status) VALUES ($1, $2, $3, $4)",
      [uuidv4(), "Local Vector Store", "local", "active"]
    );
  }
}

async function main() {
  await initDb();

  await seedTerms("allowed_domain", ALLOWED_DOMAINS);
  await seedTerms("jurisdiction", JURISDICTIONS);
  await seedTerms("source_type", SOURCE_TYPES);
  await seedTerms("item_status", ITEM_STATUSES);
  await seedTerms("topic", TOPICS);
  await seedTerms("impacted_area", IMPACTED_AREAS);
  await seedTerms("priority", PRIORITIES);
  await seedTerms("evidence_status", EVIDENCE_STATUS);
  await seedTerms("trust_tier", TRUST_TIERS);
  await seedTerms("monitoring_stage", MONITORING_STAGES);

  await ensureLocalVectorStore();

  console.log("Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

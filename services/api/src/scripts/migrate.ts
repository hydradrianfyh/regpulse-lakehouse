import "dotenv/config";
import { initDb } from "../db";

async function main() {
  await initDb();
  console.log("Migrations complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

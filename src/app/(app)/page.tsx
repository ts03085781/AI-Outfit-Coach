import { HomeContent } from "@/features/home/components/HomeContent";
import { readLatestTrendManifest } from "@/features/trends/blob-storage";

export default async function HomePage() {
  let trendManifest = null;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      trendManifest = await readLatestTrendManifest();
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "trend_read_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
  }

  return <HomeContent trendManifest={trendManifest} />;
}

import { OutfitFlowPage } from "@/features/outfit/components/OutfitFlowPage";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

type AnalyzePageProps = {
  searchParams: Promise<{ login?: string | string[] }>;
};

export default async function AnalyzePage({ searchParams }: AnalyzePageProps) {
  const params = await searchParams;
  return <LocaleProvider><OutfitFlowPage loginSucceeded={params.login === "success"} /></LocaleProvider>;
}

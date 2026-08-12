import { OutfitFlowPage } from "@/features/outfit/components/OutfitFlowPage";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

export default function AnalyzePage() {
  return <LocaleProvider><OutfitFlowPage /></LocaleProvider>;
}

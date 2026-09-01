import type { ReactNode } from "react";

import { AppNavigation } from "@/features/home/components/AppNavigation";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>
    <AppNavigation />
    {children}
  </>;
}

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import AppLayout from "@/app/(app)/layout";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

it("renders one shared application navigation around route content", () => {
  render(
    <LocaleProvider initialLocale="zh-TW">
      <AppLayout><div>route content</div></AppLayout>
    </LocaleProvider>,
  );

  expect(screen.getAllByTestId("app-navigation")).toHaveLength(1);
  expect(screen.getByText("route content")).toBeVisible();
});

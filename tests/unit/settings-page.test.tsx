import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import SettingsPage from "@/app/settings/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  localStorage.clear();
});

it("immediately applies and persists the selected language preference", () => {
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

  fireEvent.change(screen.getByLabelText("選擇語言"), { target: { value: "en" } });

  expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  expect(localStorage.getItem("NEXT_LOCALE")).toBe("en");
  expect(document.cookie).toContain("NEXT_LOCALE=en");
});

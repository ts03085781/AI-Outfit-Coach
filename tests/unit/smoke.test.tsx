import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

it("shows the occasion question", () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-TW" });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] });

  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
});

it("uses the server-selected locale before client effects run", () => {
  render(
    <LocaleProvider initialLocale="ja">
      <HomePage />
    </LocaleProvider>,
  );

  expect(screen.getByRole("heading", { name: "今日はどこへ行きますか？" })).toBeVisible();
});

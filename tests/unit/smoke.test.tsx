import { fireEvent, render, screen } from "@testing-library/react";
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

it("shows the brand icon above the existing step header", () => {
  render(<HomePage />);

  expect(screen.getByRole("img", { name: "衣櫥指南圖示" })).toHaveAttribute("src", "/icon-512.png");
  expect(screen.getByRole("button", { name: "開啟選單" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByLabelText("步驟 1／3")).toBeVisible();
});

it("opens and closes the drawer through the hamburger", () => {
  render(<HomePage />);
  const menuButton = screen.getByRole("button", { name: "開啟選單" });

  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "關閉選單" })).toBeVisible();
  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "關閉選單" })).not.toBeInTheDocument();
});

it("closes the drawer when its backdrop is clicked", () => {
  render(<HomePage />);
  fireEvent.click(screen.getByRole("button", { name: "開啟選單" }));
  fireEvent.click(screen.getByRole("button", { name: "關閉選單" }));

  expect(screen.getByRole("button", { name: "開啟選單" })).toHaveAttribute("aria-expanded", "false");
});

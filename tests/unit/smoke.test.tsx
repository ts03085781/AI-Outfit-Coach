import { fireEvent, render, screen } from "@testing-library/react";
import AnalyzePage from "@/app/analyze/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

it("shows the occasion question", () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-TW" });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] });

  render(<AnalyzePage />);
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
});

it("uses the server-selected locale before client effects run", () => {
  render(
    <LocaleProvider initialLocale="ja">
      <AnalyzePage />
    </LocaleProvider>,
  );

  expect(screen.getByRole("heading", { name: "今日はどこへ行きますか？" })).toBeVisible();
});

it("shows the brand icon above the existing step header", () => {
  render(<AnalyzePage />);

  const brandIcon = screen.getByRole("img", { name: "衣櫥指南圖示" });
  const stepHeader = screen.getByLabelText("步驟 1／3");

  expect(brandIcon.getAttribute("src")).toContain("icon-512.png");
  expect(brandIcon.compareDocumentPosition(stepHeader)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByRole("button", { name: "開啟選單" })).toHaveAttribute("aria-expanded", "false");
  expect(stepHeader.querySelectorAll("span")).toHaveLength(2);
  expect(stepHeader.querySelectorAll("span")[0]).toHaveTextContent("衣櫥指南");
  expect(stepHeader.querySelectorAll("span")[1]).toHaveTextContent("1/3");
  expect(stepHeader).toHaveTextContent("1/3");
  expect(stepHeader).toBeVisible();
});

it("opens an identified drawer while making the flow controls inert", () => {
  render(<AnalyzePage />);
  const menuButton = screen.getByRole("button", { name: "開啟選單" });

  fireEvent.click(menuButton);
  const drawer = screen.getByRole("complementary", { name: "選單" });

  expect(menuButton).toHaveAttribute("aria-expanded", "true");
  expect(menuButton).toHaveAttribute("aria-label", "關閉選單");
  expect(menuButton).toHaveAttribute("aria-controls", "menu-drawer");
  expect(menuButton).toHaveClass("is-menu-open");
  expect(drawer).toHaveAttribute("id", "menu-drawer");
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" }).closest("[inert]")).not.toBeNull();
  expect(screen.getByRole("button", { name: "關閉選單背景" })).toBeVisible();

  fireEvent.keyDown(drawer, { key: "Escape" });
  expect(drawer).toBeInTheDocument();

  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  expect(menuButton).toHaveAttribute("aria-label", "開啟選單");
  expect(menuButton).not.toHaveClass("is-menu-open");
  expect(screen.queryByRole("button", { name: "關閉選單背景" })).not.toBeInTheDocument();
});

it("returns focus to the hamburger when its backdrop is clicked", () => {
  render(<AnalyzePage />);
  const menuButton = screen.getByRole("button", { name: "開啟選單" });

  fireEvent.click(menuButton);
  const backdrop = screen.getByRole("button", { name: "關閉選單背景" });
  backdrop.focus();
  fireEvent.click(backdrop);

  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  expect(menuButton).toHaveFocus();
});

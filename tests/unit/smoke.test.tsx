import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

it("shows the occasion question", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
});

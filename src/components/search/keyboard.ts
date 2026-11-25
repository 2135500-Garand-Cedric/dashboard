import type { KeyboardEvent } from "react";

export function searchKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
  const target = event.target as HTMLElement;
  if (target.closest("select") || target.matches("input[type=checkbox]")) return;
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("[data-search-link]")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const index =
      event.key === "ArrowDown"
        ? (current + 1) % links.length
        : current <= 0
          ? links.length - 1
          : current - 1;
    links[index]?.focus();
  } else if (event.key === "Enter" && target.matches("[data-search-input]")) {
    event.preventDefault();
    links[0]?.click();
  }
}

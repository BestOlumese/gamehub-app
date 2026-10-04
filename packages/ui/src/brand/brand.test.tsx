import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LogoMark } from "./logo-mark";
import { Wordmark } from "./wordmark";

describe("brand", () => {
  it("logo mark is decorative unless given a title", () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<LogoMark title="GameHub" />);
    expect(named).toContain('role="img"');
    expect(named).toContain("<title>GameHub</title>");
  });

  it("wordmark reads as one word", () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html.replace(/<[^>]+>/g, "")).toBe("GameHub");
  });
});

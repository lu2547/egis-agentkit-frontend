import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";

// Exercise the shipped TDesign defaults and app overrides together. Theme-mode
// selectors have greater specificity than :root, even in an earlier stylesheet.
const styles = [
  "node_modules/tdesign-vue-next/es/style/index.css",
  "src/styles/tokens.css",
  "src/styles/tdesign.css",
].map((path) =>
  postcss.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")),
);

function themeVariables(theme: "light" | "dark") {
  const variables = new Map<string, { value: string; specificity: number }>();
  for (const style of styles) {
    style.walkRules((rule) => {
      const matching = rule.selectors.filter((selector) => {
        if (!selector.startsWith(":root") || /\s/.test(selector)) return false;
        if (selector.includes("dark")) return theme === "dark";
        if (selector.includes("light")) return theme === "light";
        return true;
      });
      if (!matching.length) return;
      const specificity = Math.max(
        ...matching.map(
          (selector) =>
            (selector.match(/:[\w-]+|\[[^\]]+\]|\.[\w-]+/g) || []).length,
        ),
      );
      rule.walkDecls(/^--/, (declaration) => {
        if (specificity >= (variables.get(declaration.prop)?.specificity ?? -1))
          variables.set(declaration.prop, {
            value: declaration.value,
            specificity,
          });
      });
    });
  }
  function resolve(name: string): string {
    const value = variables.get(name)?.value;
    if (!value) throw new Error(`Missing theme variable ${name}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_, dependency: string) =>
      resolve(dependency),
    );
  }
  return resolve;
}

function channels(color: string) {
  const hex = color.replace("#", "");
  const normalized =
    hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
  expect(normalized).toMatch(/^[\da-f]{6}$/i);
  return [0, 2, 4].map((offset) =>
    parseInt(normalized.slice(offset, offset + 2), 16),
  );
}

describe.each(["light", "dark"] as const)("neutral %s theme", (theme) => {
  const resolve = themeVariables(theme);
  it("keeps native and TDesign interaction colors gray after the theme cascade", () => {
    const tokens = [
      "--accent",
      "--accent-soft",
      "--egis",
      "--td-brand-color",
      "--td-brand-color-hover",
      "--td-brand-color-active",
      "--td-brand-color-focus",
      "--td-brand-color-disabled",
      "--td-brand-color-light",
      "--td-brand-color-light-hover",
      "--td-text-color-brand",
      "--td-text-color-link",
      ...Array.from(
        { length: 10 },
        (_, index) => `--td-brand-color-${index + 1}`,
      ),
    ];
    for (const token of tokens) {
      const [red, green, blue] = channels(resolve(token));
      expect([red, green, blue], `${token} = ${resolve(token)}`).toEqual([
        red,
        red,
        red,
      ]);
    }
  });
  it("retains a visible focus indicator and readable primary button text", () => {
    const luminance = (color: string) =>
      channels(color).reduce((total, part, index) => {
        const srgb = part / 255;
        return (
          total +
          (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][index]!
        );
      }, 0);
    const contrast = (first: string, second: string) => {
      const values = [luminance(first), luminance(second)].sort(
        (a, b) => b - a,
      );
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    };
    expect(
      contrast(resolve("--td-brand-color-focus"), resolve("--bg")),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(resolve("--td-brand-color"), resolve("--td-text-color-anti")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

import DOMPurify from "dompurify";

const paintAttributes = [
  "fill",
  "stroke",
  "filter",
  "clip-path",
  "mask",
  "marker",
  "marker-start",
  "marker-mid",
  "marker-end",
  "cursor",
];

function safeCssValue(value: string, allowData = true) {
  const decoded = value.replace(
    /\\([\da-f]{1,6})\s?|\\(.)/gi,
    (_, hex: string | undefined, character: string) => {
      if (!hex) return character;
      const point = parseInt(hex, 16);
      return String.fromCodePoint(
        point > 0 && point <= 0x10ffff ? point : 0xfffd,
      );
    },
  );
  if (/image-set\s*\(|@import/i.test(decoded)) return false;
  const urls = [...decoded.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  return (
    (!/url\s*\(/i.test(decoded) || urls.length > 0) &&
    urls.every(
      (match) =>
        match[2].startsWith("#") || (allowData && /^data:/i.test(match[2])),
    )
  );
}

function sanitizeDeclarations(style: CSSStyleDeclaration) {
  for (const property of Array.from(style))
    if (
      !safeCssValue(
        style.getPropertyValue(property),
        !paintAttributes.includes(property),
      )
    )
      style.removeProperty(property);
}

/** Keep document formatting and packaged images/fonts without executable HTML or remote resources. */
export function sanitizeWordDocument(container: HTMLElement) {
  DOMPurify.sanitize(container, {
    IN_PLACE: true,
    FORBID_TAGS: [
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "link",
      "meta",
      "base",
    ],
    FORBID_ATTR: ["srcset"],
  });
  for (const element of container.querySelectorAll<HTMLElement>("[style]"))
    sanitizeDeclarations(element.style);
  for (const element of container.querySelectorAll("svg, svg *")) {
    for (const attribute of paintAttributes) {
      const value = element.getAttribute(attribute);
      if (
        value &&
        (!safeCssValue(value, false) ||
          ((attribute === "fill" || attribute === "stroke") &&
            !CSS.supports(attribute, value)))
      )
        element.removeAttribute(attribute);
    }
  }
  for (const element of container.querySelectorAll(
    "[src], [href], [xlink\\:href]",
  )) {
    for (const attribute of ["src", "href", "xlink:href"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const image =
        element.localName === "img" || element.localName === "image";
      if (
        image
          ? !/^data:image\//i.test(value)
          : !/^(https?:|mailto:|#)/i.test(value)
      )
        element.removeAttribute(attribute);
    }
    if (element.localName === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
  for (const element of container.querySelectorAll("style")) {
    // Parse while detached: no stylesheet can request a URL or affect the app before validation.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(element.textContent || "");
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        (rule instanceof CSSStyleRule &&
          !/:host|::slotted/i.test(rule.selectorText)) ||
        rule instanceof CSSFontFaceRule
      )
        sanitizeDeclarations(rule.style);
      else sheet.deleteRule(Array.from(sheet.cssRules).indexOf(rule));
    }
    element.textContent = Array.from(
      sheet.cssRules,
      (rule) => rule.cssText,
    ).join("\n");
  }
}

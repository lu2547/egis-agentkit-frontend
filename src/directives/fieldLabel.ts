import type { ObjectDirective } from "vue";
let nextId = 0;
/** TDesign puts fallthrough id/ARIA attributes on a wrapper. Associate the visible field label with its actual control. */
function associateField(root: HTMLElement) {
  const label = root.querySelector<HTMLLabelElement>(":scope > label");
  const control = root.querySelector<HTMLElement>(
    'input:not([type="hidden"]),textarea,select,[role="combobox"]',
  );
  if (!label || !control) return;
  if (!control.id) control.id = `egis-control-${++nextId}`;
  label.htmlFor = control.id;
  if (
    !control.hasAttribute("aria-label") &&
    !control.hasAttribute("aria-labelledby")
  )
    control.setAttribute(
      "aria-label",
      label.textContent?.replace(/\s+/g, " ").trim() || "",
    );
}
export const fieldLabel: ObjectDirective<HTMLElement> = {
  mounted: associateField,
  updated: associateField,
};

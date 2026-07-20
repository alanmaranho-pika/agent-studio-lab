import { z } from "zod";
import { esc, type BlockDef } from "../types";
import { FormFieldSchema, formFieldHtml } from "../_shared";
import usageMd from "./block.md?raw";

export const FormBlockSchema = z.object({
  type: z.literal("form"),
  fields: z.array(FormFieldSchema).min(1).max(2),
  submitLabel: z.string().max(28).optional().describe("Defaults to 'Continue'"),
});

export type FormBlockValue = z.infer<typeof FormBlockSchema>;

export function formToHtml(block: FormBlockValue): string {
  const fields = block.fields.map(formFieldHtml).join("");
  return [
    `<div data-card><form data-action="answer" class="flex flex-col gap-5">`,
    fields,
    `<div class="flex flex-wrap items-center justify-end gap-3">`,
    `<button type="button" data-action="answer" data-value="You decide for me">You decide</button>`,
    `<button type="submit" data-primary>${esc(block.submitLabel || "Continue")}</button>`,
    `</div></form></div>`,
  ].join("");
}

export const FormBlock: BlockDef<typeof FormBlockSchema, FormBlockValue> = {
  id: "BLK_FORM",
  type: "form",
  schema: FormBlockSchema,
  usageMd,
  toHtml: formToHtml,
};
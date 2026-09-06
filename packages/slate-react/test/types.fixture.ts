// Negative type fixture: every `@ts-expect-error` below must stay an error.
// `NodeProps` used to carry `[property: string]: unknown`, which survived every
// `Omit<...>` in the widget props and let invalid values through.
import { Container, Input, Select, TextField } from "../src/index.js";

// @ts-expect-error width aceita number | `${number}%` | "auto".
Input({ width: "banana" });
// @ts-expect-error disabled é boolean.
Input({ disabled: "yes" });
// @ts-expect-error direction é "row" | "column".
Input({ direction: 42 });
// @ts-expect-error props desconhecidas não são aceitas.
Input({ naoExiste: 1 });
// @ts-expect-error options espera SelectOption[].
Select({ options: ["um", "dois"] });
// @ts-expect-error width aceita number | `${number}%` | "auto".
Container({ width: "banana" });

export const valid = [
  Container({ width: "50%", direction: "row", padding: 1 }),
  Input({ id: "name", defaultValue: "", placeholder: "nome", focusable: true }),
  Select({ id: "mode", options: [{ label: "um" }, { label: "dois", disabled: true }] }),
  TextField({ id: "field", label: "Nome" })
];

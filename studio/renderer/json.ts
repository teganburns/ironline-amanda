import { format as formatWithPrettier } from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";

export async function formatJsonForDisplay(value: unknown): Promise<string> {
  return formatWithPrettier(JSON.stringify(value), {
    parser: "json",
    plugins: [babelPlugin, estreePlugin],
    tabWidth: 2,
    useTabs: false,
  });
}

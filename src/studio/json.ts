import { format as formatWithPrettier } from "prettier";

const JSON_FORMAT_OPTIONS = {
  parser: "json" as const,
  tabWidth: 2,
  useTabs: false,
};

export async function formatJsonDocument(value: unknown): Promise<string> {
  return formatWithPrettier(JSON.stringify(value), JSON_FORMAT_OPTIONS);
}

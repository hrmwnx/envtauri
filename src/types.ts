export interface EnvEntry {
  key: string;
  value: string;
  source: "dotenv" | "user" | "system" | "process";
  expandable: boolean;
  leading_lines: string[];
  trailing_lines: string[];
}

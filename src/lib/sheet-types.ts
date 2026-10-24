export type SheetResult = {
  title: string;
  summary: string;
  formula: string;
  naturalFormula: string;
  columns: { label: string; align: "left" | "right"; kind: "text" | "number" | "percent" }[];
  rows: string[][];
  steps: { title: string; detail: string }[];
  insights: { icon: "crown" | "growth" | "tag" | "alert" | "info"; text: string }[];
  suggestions: string[];
  donut: { title: string; totalLabel: string; items: { label: string; value: number }[] } | null;
  line: { title: string; xLabels: string[]; series: { name: string; values: number[] }[] } | null;
};

export type HistoryEntry = { prompt: string; result: SheetResult; at: string };

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--azure)",
];

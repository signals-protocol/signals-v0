import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "index",
    {
      type: "category",
      label: "Start Here",
      items: ["quickstart/index", "faq", "glossary"],
    },
    {
      type: "category",
      label: "How It Works",
      items: [
        "concepts/architecture",
        "concepts/math-deep-dive",
        "concepts/precision-rounding",
      ],
    },
    {
      type: "category",
      label: "Using the App",
      items: ["user/positions-lifecycle", "user/settlement"],
    },
    {
      type: "category",
      label: "Markets",
      items: ["markets/bitcoin"],
    },
    {
      type: "category",
      label: "Risk & Security",
      items: ["security/audits", "risk/disclosure"],
    },
    {
      type: "category",
      label: "Data & API",
      items: ["api/subgraph", "api/events-reference"],
    },
    {
      type: "category",
      label: "Governance",
      items: ["governance/parameters", "governance/upgrades"],
    },
    {
      type: "category",
      label: "Networks & Addresses",
      items: ["networks/supported-networks", "addresses/index"],
    },
    "changelog/index",
  ],
};

export default sidebars;

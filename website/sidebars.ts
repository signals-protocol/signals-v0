import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "category",
      label: "Start Here",
      collapsed: false,
      items: [
        "index",
        "start/why-signals",
        "start/market-flow-overview",
        "start/faq",
        "start/glossary",
      ],
    },
    {
      type: "category",
      label: "Mechanism",
      items: [
        "mechanism/overview",
        "mechanism/outcome-space",
        "mechanism/cost-rounding",
        "mechanism/safety-parameters",
        "mechanism/key-formulas",
      ],
    },
    {
      type: "category",
      label: "Protocol",
      items: [
        "protocol/architecture",
        "security/audits",
        "governance/parameters",
        "governance/upgrades",
        "networks/supported-networks",
        "addresses/index",
      ],
    },
    {
      type: "category",
      label: "Operations",
      items: [
        "start/how-it-works",
        "market/settlement-pipeline",
      ],
    },
    {
      type: "category",
      label: "Trading Guides",
      items: [
        "quickstart/index",
        "user/positions-lifecycle",
        "user/settlement",
        "user/risk",
        "start/use-cases",
      ],
    },
    {
      type: "category",
      label: "Integrations",
      items: [
        "api/subgraph",
        "api/events-reference",
      ],
    },
    {
      type: "category",
      label: "References",
      items: [
        "references/index",
        "changelog/index",
        "references/whitepaper",
        "references/bibliography",
      ],
    },
  ],
};

export default sidebars;

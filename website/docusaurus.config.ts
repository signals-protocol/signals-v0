import { themes as prismThemes } from "prism-react-renderer";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "Signals",
  tagline: "Range-Based Bitcoin Prediction on Citrea",
  favicon: "img/favicon.ico",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: "https://signals-protocol.github.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  organizationName: "signals-protocol", // Usually your GitHub org/user name.
  projectName: "signals-v0", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Internationalization settings
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ko"],
    localeConfigs: {
      en: { label: "English" },
      ko: { label: "한국어" },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          // Edit URL for GitHub integration
          editUrl:
            "https://github.com/signals-protocol/signals-v0/edit/main/website/",
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // TypeDoc plugin temporarily disabled - generating files in wrong location
    // [
    //   "typedoc-docusaurus-theme",
    //   {
    //     // TS SDK 진입점과 tsconfig 경로를 SDK 폴더 기준으로 지정
    //     typedoc: {
    //       entryPoints: ["../clmsr-sdk/src/index.ts"],
    //       tsconfig: "../clmsr-sdk/tsconfig.json",
    //       exclude: ["**/*.test.ts", "**/*.spec.ts"],
    //     },
    //     // Docusaurus 출력을 docs/sdk 로
    //     out: "docs/sdk",
    //     sidebar: { fullNames: true },
    //     watch: process.env.NODE_ENV === "development",
    //   },
    // ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: "img/docusaurus-social-card.jpg",
    navbar: {
      title: "Signals",
      logo: {
        alt: "Signals wordmark",
        src: "img/logo.png",
        srcDark: "img/logo.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://signals.wtf",
          label: "Use the App",
          position: "left",
        },
        {
          href: "https://explorer.testnet.citrea.xyz/",
          label: "Explorer",
          position: "left",
        },
        {
          href: "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn",
          label: "Subgraph",
          position: "left",
        },
        {
          href: "https://github.com/signals-protocol/signals-v0",
          label: "GitHub",
          position: "right",
        },
        {
          type: "localeDropdown",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Quick Start",
              to: "/docs/quickstart",
            },
            {
              label: "Mechanism Spec",
              to: "/docs/mechanism/overview",
            },
            {
              label: "Contract Addresses",
              to: "/docs/addresses",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/signals-protocol/signals-v0",
            },
            {
              label: "Discord",
              href: "https://discord.gg/signals-protocol",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "Use the App",
              href: "https://signals.wtf",
            },
            {
              label: "Changelog",
              to: "/docs/changelog/",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Signals Protocol. Running on Citrea Testnet.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    // Algolia DocSearch (apply for free at https://docsearch.algolia.com/)
    algolia: {
      appId: process.env.ALGOLIA_APP_ID || "YOUR_APP_ID",
      apiKey: process.env.ALGOLIA_API_KEY || "YOUR_SEARCH_API_KEY",
      indexName: process.env.ALGOLIA_INDEX_NAME || "signals-v0",
      contextualSearch: true,
      searchPagePath: "search",
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

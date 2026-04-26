import type { DocsThemeConfig } from "nextra-theme-docs";
import { createElement, Fragment } from "react";

const config: DocsThemeConfig = {
  logo: createElement(
    "span",
    {
      style: {
        fontWeight: 700,
        fontSize: "1.2rem",
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
      },
    },
    createElement(
      "svg",
      {
        width: 20,
        height: 20,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
      createElement("circle", { cx: 12, cy: 12, r: 10 }),
      createElement("path", { d: "M12 8v4l3 3" }),
    ),
    "NexusOps",
  ),
  project: {
    link: "https://github.com/Recon-X2025/NexusOps",
  },
  docsRepositoryBase:
    "https://github.com/Recon-X2025/NexusOps/tree/main/apps/docs",
  footer: {
    content: "© 2026 Coheron. All rights reserved.",
  },
  head: createElement(
    Fragment,
    null,
    createElement("meta", {
      name: "viewport",
      content: "width=device-width, initial-scale=1.0",
    }),
    createElement("meta", {
      name: "description",
      content: "NexusOps — Enterprise ITSM platform documentation",
    }),
  ),
  darkMode: true,
  color: {
    hue: 220,
  },
};

export default config;

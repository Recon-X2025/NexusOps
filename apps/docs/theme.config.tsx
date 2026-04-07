import type { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: (
    <span style={{ fontWeight: 700, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
      NexusOps
    </span>
  ),
  project: {
    link: "https://github.com/Recon-X2025/NexusOps",
  },
  docsRepositoryBase: "https://github.com/Recon-X2025/NexusOps/tree/main/apps/docs",
  footer: {
    text: "© 2026 Coheron. All rights reserved.",
  },
  useNextSeoProps() {
    return {
      titleTemplate: "%s – NexusOps Docs",
    };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="NexusOps — Enterprise ITSM platform documentation" />
    </>
  ),
  darkMode: true,
  primaryHue: 220,
};

export default config;

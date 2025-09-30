import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import metrics from "@site/static/data/metrics.json";

type Metrics = {
  marketCount: number;
  openPositionCount: number;
  totalPositions: number;
  generatedAt: string;
};

import styles from "./index.module.css";

const stats = metrics as Metrics;

const numberFormatter = new Intl.NumberFormat("en-US");

function HomepageHeader(): ReactNode {
  const { marketCount, totalPositions } = stats;
  const heroLogoIconUrl = useBaseUrl("img/logo.svg");
  return (
    <header className={styles.hero}>
      <div className="container">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.heroKicker}>
              Continuous Markets on Citrea
            </span>
            <h1 className={styles.heroTitle}>
              Signals makes Bitcoin range trading fluid.
            </h1>
            <p className={styles.heroSubtitle}>
              A single CLMSR pool keeps odds accurate, maker loss bounded, and
              settlement verifiable. Trade the daily close with transparent math
              and instant claims.
            </p>
            <div className={styles.ctaRow}>
              <Link className={styles.primaryCta} to="/docs/quickstart">
                Start in 5 minutes
              </Link>
              <Link className={styles.secondaryCta} href="https://signals.wtf">
                Use the app
              </Link>
            </div>
            <dl className={styles.heroStats}>
              <div>
                <dt>Markets launched</dt>
                <dd>{numberFormatter.format(marketCount)}</dd>
              </div>
              <div>
                <dt>Positions minted</dt>
                <dd>{numberFormatter.format(totalPositions)}</dd>
              </div>
              <div>
                <dt>Liquidity parameter</dt>
                <dd>α = 1000</dd>
              </div>
            </dl>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.heroCard}>
              <div className={styles.heroBrand}>
                <span className={styles.heroBrandIcon}>
                  <img src={heroLogoIconUrl} alt="Signals mark" />
                </span>
                <span className={styles.heroBrandName}>Signals</span>
              </div>
              <p className={styles.heroCardText}>
                Continuous LMSR keeps the probability surface smooth. Every
                trade updates the entire range, so the orange curve you see in
                the app is always coherent.
              </p>
              <div className={styles.heroBadges}>
                <span className={styles.badgePositive}>Bounded loss</span>
                <span className={styles.badgeSecondary}>
                  On-chain settlement
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Signals documentation — learn why the Continuous LMSR powers our Bitcoin range markets, how the protocol is built, and how to trade responsibly."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}

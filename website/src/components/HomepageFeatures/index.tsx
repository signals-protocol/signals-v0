import type { ReactNode } from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  description: string;
  accent: "primary" | "btc" | "positive";
};

const FeatureList: FeatureItem[] = [
  {
    title: "Single CLMSR liquidity",
    description:
      "One pool powers every $100 band. Prices stay normalized, spreads remain tight, and the probability surface reacts instantly to new trades.",
    accent: "primary",
  },
  {
    title: "Deterministic settlement",
    description:
      "CoinMarketCap closes are verified and broadcast on-chain. Batched events mark every position, and claims remain open forever.",
    accent: "btc",
  },
  {
    title: "Transparent safety limits",
    description:
      "Bounded maker loss, guarded exponentials, and public manifests let integrators audit the protocol with confidence.",
    accent: "positive",
  },
];

function FeatureCard({ title, description, accent }: FeatureItem): ReactNode {
  return (
    <article className={`${styles.featureCard} ${styles[accent]}`}>
      <div className={styles.featureAccent} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featureGrid}>
          {FeatureList.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

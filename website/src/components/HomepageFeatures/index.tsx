import type { ReactNode } from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  description: string;
  accent: "primary" | "btc" | "positive";
};

type LocaleKey = "en" | "ko";

const FeatureCopy: Record<LocaleKey, FeatureItem[]> = {
  en: [
    {
      title: "Set exact bounds once",
      description:
        "Pick the lower and upper ticks you care about and hold one position—no extra bins or split order books.",
      accent: "primary",
    },
    {
      title: "Odds stay consistent",
      description:
        "The shared curve absorbs every fill, keeping prices normalized so quotes already mirror the whole market.",
      accent: "btc",
    },
    {
      title: "Read the live curve",
      description:
        "The live surface and on-chain record show how traders are lining up tomorrow's Bitcoin close.",
      accent: "positive",
    },
  ],
  ko: [
    {
      title: "경계를 한 번에 설정",
      description:
        "필요한 하한·상한 틱만 고르면 여분 구간 없이 포지션 하나로 들고 갈 수 있습니다.",
      accent: "primary",
    },
    {
      title: "일관된 확률",
      description:
        "공유 곡선이 모든 체결을 흡수해 보이는 가격이 이미 시장 전체의 시각을 담습니다.",
      accent: "btc",
    },
    {
      title: "곡선으로 읽는 시장",
      description:
        "실시간 곡선과 온체인 기록으로 트레이더들이 내일 종가를 어떻게 보고 있는지 바로 확인할 수 있습니다.",
      accent: "positive",
    },
  ],
};

function FeatureCard({ title, description, accent }: FeatureItem): ReactNode {
  return (
    <article className={`${styles.featureCard} ${styles[accent]}`}>
      <div className={styles.featureAccent} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export default function HomepageFeatures({
  locale,
}: {
  locale: LocaleKey;
}): ReactNode {
  const featureList = FeatureCopy[locale] ?? FeatureCopy.en;
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featureGrid}>
          {featureList.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

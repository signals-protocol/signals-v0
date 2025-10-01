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

const heroCopy = {
  en: {
    heroKicker: "",
    heroTitle: "Trade the range you want with one position.",
    heroSubtitle:
      "Signals runs one shared pool so you set exact bounds without overbuying, and each fill refreshes the curve that shows the market's view of tomorrow's close.",
    primaryCta: "Get started in 5 minutes",
    secondaryCta: "View today's curve",
    statMarkets: "Markets settled",
    statPositions: "Total positions",
    cardBody:
      "Every trade updates the shared probability surface, so the curve you see is the market's live read on tomorrow's Bitcoin close.",
    badgePrimary: "Custom range positions",
    badgeSecondary: "Live probability curve",
  },
  ko: {
    heroKicker: "",
    heroTitle: "원하는 구간을 포지션 하나로 거래하세요.",
    heroSubtitle:
      "Signals의 단일 풀에서 필요한 경계를 그대로 선택하면 됩니다. 체결마다 곡선이 새로 계산되어 시장이 보는 내일 종가를 보여줍니다.",
    primaryCta: "5분 만에 진입하기",
    secondaryCta: "오늘 곡선 보기",
    statMarkets: "정산 완료 시장",
    statPositions: "총 포지션 수",
    cardBody:
      "모든 체결이 같은 확률 표면을 갱신해 지금 보이는 곡선이 시장이 바라보는 다음 종가입니다.",
    badgePrimary: "맞춤 구간 포지션",
    badgeSecondary: "실시간 확률 곡선",
  },
} as const;

type LocaleKey = keyof typeof heroCopy;

function HomepageHeader({ locale }: { locale: LocaleKey }): ReactNode {
  const { marketCount, totalPositions } = stats;
  const heroLogoIconUrl = useBaseUrl("img/logo.svg");
  const strings = heroCopy[locale] ?? heroCopy.en;
  return (
    <header className={styles.hero}>
      <div className="container">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            {strings.heroKicker ? (
              <span className={styles.heroKicker}>{strings.heroKicker}</span>
            ) : null}
            <h1 className={styles.heroTitle}>{strings.heroTitle}</h1>
            <p className={styles.heroSubtitle}>{strings.heroSubtitle}</p>
            <div className={styles.ctaRow}>
              <Link className={styles.primaryCta} to="/docs/quickstart">
                {strings.primaryCta}
              </Link>
              <Link className={styles.secondaryCta} href="https://signals.wtf">
                {strings.secondaryCta}
              </Link>
            </div>
            <dl className={styles.heroStats}>
              <div>
                <dt>{strings.statMarkets}</dt>
                <dd>{numberFormatter.format(marketCount)}</dd>
              </div>
              <div>
                <dt>{strings.statPositions}</dt>
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
              <p className={styles.heroCardText}>{strings.cardBody}</p>
              <div className={styles.heroBadges}>
                <span className={styles.badgePositive}>{strings.badgePrimary}</span>
                <span className={styles.badgeSecondary}>{strings.badgeSecondary}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig, i18n } = useDocusaurusContext();
  const locale = (i18n?.currentLocale as LocaleKey) ?? "en";
  return (
    <Layout
      title={siteConfig.title}
      description="Signals documentation — learn why the Continuous LMSR powers our Bitcoin range markets, how the protocol is built, and how to trade responsibly."
    >
      <HomepageHeader locale={locale} />
      <main>
        <HomepageFeatures locale={locale} />
      </main>
    </Layout>
  );
}

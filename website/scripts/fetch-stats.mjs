import { writeFile } from "fs/promises";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn";

async function fetchEntitiesCount(entity, where) {
  const pageSize = 1000;
  let skip = 0;
  let total = 0;

  while (true) {
    const query = `
      query ($skip: Int!, $first: Int!) {
        ${entity}(first: $first, skip: $skip${where ? ", where: " + where : ""}) {
          id
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { skip, first: pageSize } }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${entity}: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors?.length) {
      throw new Error(`GraphQL error for ${entity}: ${json.errors.map((e) => e.message).join(", ")}`);
    }

    const items = json.data?.[entity] ?? [];
    total += items.length;

    if (items.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return total;
}

async function main() {
  const [marketCount, openPositionCount, latestPositionId] = await Promise.all([
    fetchEntitiesCount("markets"),
    fetchEntitiesCount("userPositions", "{ outcome: OPEN }"),
    (async () => {
      const query = `
        query {
          userPositions(first: 1, orderBy: positionId, orderDirection: desc) {
            positionId
          }
        }
      `;
      const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch latest position id: ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      const value = json?.data?.userPositions?.[0]?.positionId ?? "0";
      return Number(value);
    })(),
  ]);

  const stats = {
    generatedAt: new Date().toISOString(),
    marketCount,
    openPositionCount,
    totalPositions: latestPositionId,
  };

  await writeFile(
    new URL("../static/data/metrics.json", import.meta.url),
    JSON.stringify(stats, null, 2) + "\n"
  );

  console.log(
    `Updated metrics.json → markets: ${marketCount}, open positions: ${openPositionCount}, total positions: ${latestPositionId}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

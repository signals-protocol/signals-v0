import * as fs from "fs";
import axios from "axios";

interface RangeFactorData {
  id: string;
  marketId: string;
  lo: string;
  hi: string;
  factor: string;
  blockNumber: string;
  blockTimestamp: string;
}

interface GraphQLResponse {
  data: {
    rangeFactorApplieds: RangeFactorData[];
  };
}

async function fetchSubgraphData(): Promise<RangeFactorData[]> {
  const query = {
    query: `{
      rangeFactorApplieds(first: 1000, orderBy: blockTimestamp, orderDirection: desc) {
        id
        marketId
        lo
        hi
        factor
        blockNumber
        blockTimestamp
      }
    }`,
  };

  const response = await axios.post(
    "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
    query,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.data.rangeFactorApplieds;
}

function aggregateByTickRange(data: RangeFactorData[]): Map<string, number> {
  const tickMap = new Map<string, number>();

  for (const item of data) {
    const lo = parseInt(item.lo);
    const hi = parseInt(item.hi);
    const factor = parseFloat(item.factor) / 1e18; // WAD to decimal

    // 각 틱 범위의 중점을 키로 사용
    const midPoint = Math.floor((lo + hi) / 2);
    const key = `${lo}-${hi}`;

    // 가장 최신 factor 값 사용 (또는 평균값)
    if (!tickMap.has(key) || tickMap.get(key)! < factor) {
      tickMap.set(key, factor);
    }
  }

  return tickMap;
}

function generateASCIIChart(data: Map<string, number>): string {
  const entries = Array.from(data.entries()).sort((a, b) => {
    const aLo = parseInt(a[0].split("-")[0]);
    const bLo = parseInt(b[0].split("-")[0]);
    return aLo - bLo;
  });

  if (entries.length === 0) {
    return "No data available";
  }

  const maxValue = Math.max(...entries.map(([_, value]) => value));
  const chartHeight = 20;

  let chart = `\n🎯 CLMSR 마켓 분포 시각화 (Factor Values)\n`;
  chart += `${"=".repeat(80)}\n`;
  chart += `최대값: ${maxValue.toFixed(4)}\n\n`;

  // Y축 레이블과 차트
  for (let row = chartHeight; row >= 0; row--) {
    const threshold = (maxValue * row) / chartHeight;
    const yLabel = threshold.toFixed(2).padStart(8);
    chart += `${yLabel} |`;

    for (const [range, value] of entries) {
      if (value >= threshold) {
        chart += "█";
      } else {
        chart += " ";
      }
    }
    chart += "\n";
  }

  // X축
  chart += `${"".padStart(9)}+${"-".repeat(entries.length)}\n`;
  chart += `${"".padStart(10)}`;

  // X축 레이블 (범위 표시)
  for (const [range, _] of entries) {
    const lo = parseInt(range.split("-")[0]);
    chart += (lo / 1000).toFixed(0);
  }
  chart += "\n";
  chart += `${"".padStart(10)}Tick Position (K)\n\n`;

  // 데이터 요약
  chart += `📊 데이터 요약:\n`;
  chart += `- 총 틱 범위 개수: ${entries.length}\n`;
  chart += `- Factor 범위: ${Math.min(...entries.map(([_, v]) => v)).toFixed(
    4
  )} ~ ${maxValue.toFixed(4)}\n`;
  chart += `- 평균 Factor: ${(
    entries.reduce((sum, [_, v]) => sum + v, 0) / entries.length
  ).toFixed(4)}\n\n`;

  // 상위 5개 구간
  chart += `🔝 상위 5개 구간:\n`;
  const top5 = entries.sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (let i = 0; i < top5.length; i++) {
    const [range, value] = top5[i];
    chart += `${i + 1}. 틱 ${range}: ${value.toFixed(4)}\n`;
  }

  return chart;
}

function generateHeatmap(data: Map<string, number>): string {
  const entries = Array.from(data.entries()).sort((a, b) => {
    const aLo = parseInt(a[0].split("-")[0]);
    const bLo = parseInt(b[0].split("-")[0]);
    return aLo - bLo;
  });

  if (entries.length === 0) {
    return "No data available";
  }

  const maxValue = Math.max(...entries.map(([_, value]) => value));
  const minValue = Math.min(...entries.map(([_, value]) => value));

  let heatmap = `\n🌈 Factor 히트맵\n`;
  heatmap += `${"=".repeat(80)}\n`;

  // 색상 강도를 나타내는 문자들
  const intensity = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];

  for (const [range, value] of entries) {
    const normalized =
      maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue);
    const intensityIndex = Math.floor(normalized * (intensity.length - 1));
    const char = intensity[intensityIndex] || "*";

    const lo = parseInt(range.split("-")[0]);
    const hi = parseInt(range.split("-")[1]);

    heatmap += `틱 ${lo.toString().padStart(4)}-${hi.toString().padEnd(4)}: `;
    heatmap += char.repeat(Math.max(1, Math.floor(normalized * 40)));
    heatmap += ` (${value.toFixed(4)})\n`;
  }

  heatmap += `\n범례: ${intensity.join("")} (낮음 → 높음)\n`;

  return heatmap;
}

async function main() {
  console.log("🎨 CLMSR 분포 시각화 시작...");

  try {
    // 서브그래프에서 데이터 가져오기
    console.log("📡 서브그래프에서 데이터 가져오는 중...");
    const rawData = await fetchSubgraphData();
    console.log(
      `✅ ${rawData.length}개의 RangeFactorApplied 이벤트를 가져왔습니다.`
    );

    // 틱 범위별로 집계
    console.log("🔄 틱 범위별로 데이터 집계 중...");
    const aggregatedData = aggregateByTickRange(rawData);
    console.log(`✅ ${aggregatedData.size}개의 고유한 틱 범위를 발견했습니다.`);

    // ASCII 차트 생성
    console.log("📊 ASCII 차트 생성 중...");
    const asciiChart = generateASCIIChart(aggregatedData);

    // 히트맵 생성
    console.log("🌈 히트맵 생성 중...");
    const heatmap = generateHeatmap(aggregatedData);

    // 결과 출력
    console.log(asciiChart);
    console.log(heatmap);

    // 파일로 저장
    const output = asciiChart + "\n" + heatmap;
    fs.writeFileSync("clmsr-distribution.txt", output);
    console.log("\n💾 결과가 'clmsr-distribution.txt' 파일로 저장되었습니다.");

    // 간단한 웹 페이지 생성
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>CLMSR 분포 시각화</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: monospace; margin: 20px; background-color: #1a1a1a; color: #ffffff; }
        .container { max-width: 1200px; margin: 0 auto; }
        .chart-container { background-color: #2d2d2d; padding: 20px; border-radius: 10px; margin: 20px 0; }
        pre { background-color: #000; color: #00ff00; padding: 15px; border-radius: 5px; overflow-x: auto; }
        h1, h2 { color: #00ff88; }
        canvas { background-color: #ffffff; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 CLMSR 마켓 분포 실시간 시각화</h1>
        
        <div class="chart-container">
            <h2>📊 Factor 분포 차트</h2>
            <canvas id="distributionChart" width="800" height="400"></canvas>
        </div>
        
        <div class="chart-container">
            <h2>📈 ASCII 차트</h2>
            <pre>${asciiChart.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </div>
        
        <div class="chart-container">
            <h2>🌈 히트맵</h2>
            <pre>${heatmap.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </div>
    </div>
    
    <script>
        // Chart.js로 인터랙티브 차트 생성
        const data = ${JSON.stringify(
          Array.from(aggregatedData.entries())
            .map(([range, value]) => ({
              range,
              value,
              lo: parseInt(range.split("-")[0]),
              hi: parseInt(range.split("-")[1]),
            }))
            .sort((a, b) => a.lo - b.lo)
        )};
        
        const ctx = document.getElementById('distributionChart').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => \`틱 \${d.lo}-\${d.hi}\`),
                datasets: [{
                    label: 'Factor Value',
                    data: data.map(d => d.value),
                    backgroundColor: 'rgba(0, 255, 136, 0.6)',
                    borderColor: 'rgba(0, 255, 136, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'CLMSR Factor Distribution by Tick Range'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Factor Value'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Tick Range'
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync("clmsr-visualization.html", htmlContent);
    console.log(
      "🌐 인터랙티브 웹 페이지가 'clmsr-visualization.html'로 저장되었습니다."
    );
    console.log("브라우저에서 열어보세요!");
  } catch (error) {
    console.error("❌ 오류 발생:", error);
  }
}

main().catch(console.error);

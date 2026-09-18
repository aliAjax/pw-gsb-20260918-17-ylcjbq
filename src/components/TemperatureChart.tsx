// 温度记录图：横轴采样时间、纵轴环境温度
// - 连续样本温差 > 8℃ 的线段标红，其余为主题绿；
// - 待复检样本显示琥珀色警示环；与复核规则联动实时更新。

import { Sample } from "../types";
import { TEMP_GAP, fmtTime } from "../review";

interface Props {
  samples: Sample[]; // 已按采样时间排序
  pendingIds: Set<string>;
}

const W = 720;
const H = 280;
const PAD = { top: 24, right: 24, bottom: 46, left: 48 };

export default function TemperatureChart({ samples, pendingIds }: Props) {
  if (samples.length === 0) {
    return (
      <div className="chart-empty">当前筛选下没有可绘制的温度记录</div>
    );
  }

  const times = samples.map((s) => new Date(s.sampledAt).getTime());
  const temps = samples.map((s) => s.temperature);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tempMin = Math.floor(Math.min(...temps) - 3);
  const tempMax = Math.ceil(Math.max(...temps) + 3);

  const x = (t: number) => {
    if (tMax === tMin) return PAD.left + (W - PAD.left - PAD.right) / 2;
    return (
      PAD.left +
      ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right)
    );
  };
  const y = (v: number) =>
    H - PAD.bottom - ((v - tempMin) / (tempMax - tempMin || 1)) *
      (H - PAD.top - PAD.bottom);

  // 纵轴刻度
  const ticks = Array.from(
    { length: 5 },
    (_, i) => tempMin + ((tempMax - tempMin) / 4) * i
  );

  return (
    <svg
      className="temp-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="环境温度随采样时间变化图"
    >
      {/* 网格与纵轴刻度 */}
      {ticks.map((tk) => (
        <g key={tk}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tk)}
            y2={y(tk)}
            className="grid-line"
          />
          <text x={PAD.left - 8} y={y(tk) + 4} className="axis-text" textAnchor="end">
            {tk.toFixed(0)}℃
          </text>
        </g>
      ))}

      {/* 连续样本连线 */}
      {samples.slice(1).map((cur, i) => {
        const prev = samples[i];
        const gap = Math.abs(cur.temperature - prev.temperature);
        const over = gap > TEMP_GAP;
        return (
          <line
            key={prev.id + "-" + cur.id}
            x1={x(new Date(prev.sampledAt).getTime())}
            y1={y(prev.temperature)}
            x2={x(new Date(cur.sampledAt).getTime())}
            y2={y(cur.temperature)}
            className={over ? "temp-segment danger" : "temp-segment"}
            strokeWidth={over ? 3 : 2}
          >
            <title>
              {prev.id} → {cur.id}：温差 {gap.toFixed(1)}℃
              {over ? "（超过 8℃）" : ""}
            </title>
          </line>
        );
      })}

      {/* 数据点 */}
      {samples.map((s) => {
        const cx = x(new Date(s.sampledAt).getTime());
        const cy = y(s.temperature);
        const flagged = pendingIds.has(s.id);
        return (
          <g key={s.id}>
            {flagged && (
              <circle cx={cx} cy={cy} r={11} className="flag-ring" />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={flagged ? 5.5 : 4.5}
              className={flagged ? "temp-point flagged" : "temp-point"}
            >
              <title>
                {s.id} · {s.stage} · {s.temperature}℃ ·{" "}
                {fmtTime(s.sampledAt)}
                {flagged ? " · 待复检" : ""}
              </title>
            </circle>
            <text x={cx} y={cy - 12} className="point-label" textAnchor="middle">
              {s.temperature}℃
            </text>
            <text x={cx} y={H - PAD.bottom + 18} className="axis-text" textAnchor="middle">
              {s.id.split("-").pop()}
            </text>
            {flagged && (
              <text x={cx} y={cy + 4} className="flag-glyph" textAnchor="middle">
                !
              </text>
            )}
          </g>
        );
      })}

      {/* 横轴标题 */}
      <text x={W / 2} y={H - 6} className="axis-title" textAnchor="middle">
        采样时间顺序（左早 → 右晚）
      </text>
      <text x={14} y={PAD.top - 8} className="axis-title">
        环境温度
      </text>
    </svg>
  );
}

import { useMemo, useState } from "react";
import "./styles.css";
import { STAGES, StageKey } from "./types";
import { avgTemperature, batchStatus } from "./review";
import { useBatches } from "./store";
import BatchList from "./components/BatchList";
import CasePage from "./components/CasePage";

const project = {
  id: "hxyfront-62003",
  title: "法医昆虫学样本记录",
  rule:
    "批次复核规则：同一案件内样本按采样时间排序，发育阶段不能倒退；连续样本温差超过 8℃ 时必须填写保存方式并标记待复检，否则整批拒绝且原数据不变。复检确认只解除标记，原始值、拒绝原因与调整痕迹全部保留。",
};

const STAGE_FILTERS: (StageKey | "全部")[] = ["全部", ...STAGES];

function App() {
  const { batches, runReview, confirmRecheck, adjustSample, resetAll } =
    useBatches();
  const [activeId, setActiveId] = useState(batches[0]?.id ?? "");
  const [stageFilter, setStageFilter] = useState<StageKey | "全部">("全部");

  const active =
    batches.find((b) => b.id === activeId) ?? batches[0];

  const metrics = useMemo(() => {
    const allSamples = batches.flatMap((b) => b.samples);
    const pending = allSamples.filter((s) => s.pendingRecheck).length;
    const rejected = batches.filter((b) => batchStatus(b) === "已拒绝").length;
    return [
      { label: "样本批次", value: batches.length },
      { label: "平均温度", value: avgTemperature(allSamples) },
      { label: "待复检", value: pending },
      { label: "已拒绝批次", value: rejected },
    ];
  }, [batches]);

  if (!active) return null;

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 法医昆虫学实验室</p>
        <h1>{project.title}</h1>
        <span>{project.rule}</span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <div className="sidebar">
          <BatchList
            batches={batches}
            activeId={active.id}
            onSelect={setActiveId}
          />
          <aside className="panel">
            <h2>发育阶段筛选</h2>
            <div className="chips">
              {STAGE_FILTERS.map((item) => (
                <button
                  key={item}
                  className={stageFilter === item ? "chip-on" : ""}
                  onClick={() => setStageFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <button className="reset-btn" onClick={resetAll}>
              恢复演示数据
            </button>
          </aside>
        </div>

        {/* key 随批次变化，切换案件时重置内部选中态 */}
        <CasePage
          key={active.id}
          batch={active}
          stageFilter={stageFilter}
          onRunReview={() => runReview(active.id)}
          onConfirmRecheck={(sampleId) => confirmRecheck(active.id, sampleId)}
          onAdjust={(sampleId, draft, reason) =>
            adjustSample(active.id, sampleId, draft, reason)
          }
        />
      </section>
    </main>
  );
}

export default App;

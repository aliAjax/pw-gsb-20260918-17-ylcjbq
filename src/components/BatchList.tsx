// 样本批次列表（侧栏）：状态徽标随复核/复检确认实时更新
import { CaseBatch } from "../types";
import { avgTemperature, batchStatus } from "../review";

interface Props {
  batches: CaseBatch[];
  activeId: string;
  onSelect: (id: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
  未复核: "badge neutral",
  已通过: "badge passed",
  待复检: "badge pending",
  已拒绝: "badge rejected",
};

export default function BatchList({ batches, activeId, onSelect }: Props) {
  return (
    <aside className="panel batch-list">
      <h2>样本批次</h2>
      <div className="batch-items">
        {batches.map((b) => {
          const status = batchStatus(b);
          const pending = b.samples.filter((s) => s.pendingRecheck).length;
          const rejected =
            b.reviews[b.reviews.length - 1]?.result === "rejected";
          return (
            <button
              key={b.id}
              className={"batch-item" + (b.id === activeId ? " active" : "")}
              onClick={() => onSelect(b.id)}
            >
              <div className="batch-row">
                <strong>{b.title}</strong>
                <span className={STATUS_CLASS[status]}>{status}</span>
              </div>
              <div className="batch-meta">
                <span>{b.samples.length} 个样本</span>
                <span>均温 {avgTemperature(b.samples)}</span>
                {pending > 0 && (
                  <span className="meta-warn">{pending} 待复检</span>
                )}
                {rejected && pending === 0 && (
                  <span className="meta-danger">整批拒绝 · 原数据未改</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

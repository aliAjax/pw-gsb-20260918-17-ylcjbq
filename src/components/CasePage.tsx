// 案件样本关联页：
// 同案件样本按采样时间排序展示规则判定、批次复核操作与历史（拒绝原因永久保留），
// 温度图、批次列表、详情卡片共用同一状态，复核/确认后同步更新。

import { useMemo, useState } from "react";
import { CaseBatch, SampleDraft, StageKey } from "../types";
import {
  evaluateBatch,
  fmtTime,
  sampleRejectionMap,
  sortBySampledAt,
} from "../review";
import TemperatureChart from "./TemperatureChart";
import SampleCard from "./SampleCard";

interface Props {
  batch: CaseBatch;
  stageFilter: StageKey | "全部";
  onRunReview: () => void;
  onConfirmRecheck: (sampleId: string) => void;
  onAdjust: (sampleId: string, draft: SampleDraft, reason: string) => void;
}

export default function CasePage({
  batch,
  stageFilter,
  onRunReview,
  onConfirmRecheck,
  onAdjust,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(batch.samples[0]?.id ?? "");
  const result = useMemo(() => evaluateBatch(batch), [batch]);

  const orderedAll = result.ordered;
  const ordered =
    stageFilter === "全部"
      ? orderedAll
      : orderedAll.filter((s) => s.stage === stageFilter);

  const rejectionMap = sampleRejectionMap(result);
  const flagSet = new Set(
    batch.samples.filter((s) => s.pendingRecheck).map((s) => s.id)
  );

  const selected =
    batch.samples.find((s) => s.id === selectedId) ?? batch.samples[0];
  const lastReview = batch.reviews[batch.reviews.length - 1];

  // 每条“较晚样本”上的违规（含通过类的温差提示），用于行内展示
  const rowNotes = new Map<string, string[]>();
  for (const v of result.violations) {
    const list = rowNotes.get(v.sampleId) ?? [];
    list.push(v.message);
    rowNotes.set(v.sampleId, list);
  }

  return (
    <div className="case-page">
      <section className="panel">
        <div className="heading">
          <div>
            <p>案件样本关联</p>
            <h2>{batch.title}</h2>
          </div>
          <button className="primary" onClick={onRunReview}>
            执行批次复核
          </button>
        </div>

        {/* 最近一次复核结论横幅 */}
        {lastReview && (
          <div
            className={
              "review-banner " +
              (lastReview.result === "passed" ? "passed" : "rejected")
            }
          >
            <strong>
              最近复核（{fmtTime(lastReview.at)}）：
              {lastReview.result === "passed"
                ? "复核通过"
                : "整批拒绝 · 原始数据未改动"}
            </strong>
            {lastReview.result === "passed" &&
              lastReview.flaggedSampleIds.length > 0 && (
                <span>
                  已标记待复检：{lastReview.flaggedSampleIds.join("、")}
                  ，请在样本卡片上逐条复检确认。
                </span>
              )}
          </div>
        )}

        {/* 按采样时间排序的样本行 */}
        <div className="sample-rows">
          {ordered.map((s) => {
            const fullIndex = orderedAll.findIndex((x) => x.id === s.id);
            const prev = orderedAll[fullIndex - 1];
            const gap = prev ? Math.abs(s.temperature - prev.temperature) : 0;
            const notes = rowNotes.get(s.id) ?? [];
            return (
              <button
                key={s.id}
                className={
                  "sample-row" +
                  (selected?.id === s.id ? " active" : "") +
                  (rejectionMap[s.id] ? " rejected" : "") +
                  (s.pendingRecheck ? " pending" : "")
                }
                onClick={() => setSelectedId(s.id)}
              >
                <span className="row-index">{fullIndex + 1}</span>
                <span className="row-main">
                  <b>{s.id}</b>
                  <small>
                    {fmtTime(s.sampledAt)} · {s.stage} · {s.species}
                  </small>
                </span>
                <span className="row-temp">
                  {s.temperature}℃
                  {prev && (
                    <em className={gap > 8 ? "gap-danger" : "gap-ok"}>
                      Δ {gap.toFixed(1)}℃
                    </em>
                  )}
                </span>
                <span className="row-preservation">
                  {s.preservation || <em className="empty">保存方式未填</em>}
                </span>
                <span className="row-tags">
                  {s.pendingRecheck && <i className="tag tag-pending">待复检</i>}
                  {rejectionMap[s.id] && <i className="tag tag-rejected">拒绝项</i>}
                </span>
                {notes.length > 0 && (
                  <span className="row-notes">
                    {notes.map((n, j) => (
                      <small key={j}>{n}</small>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {ordered.length === 0 && (
            <p className="chart-empty">该发育阶段筛选下暂无样本</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>温度记录图</p>
            <h2>连续样本温差校验</h2>
          </div>
          <div className="legend">
            <span><i className="legend-line ok" />温差 ≤ 8℃</span>
            <span><i className="legend-line danger" />温差 &gt; 8℃</span>
            <span><i className="legend-ring" />待复检样本</span>
          </div>
        </div>
        <TemperatureChart samples={sortBySampledAt(orderedAll)} pendingIds={flagSet} />
      </section>

      {selected && (
        <SampleCard
          batch={batch}
          sample={selected}
          rejectionReasons={rejectionMap[selected.id] ?? []}
          onConfirmRecheck={onConfirmRecheck}
          onAdjust={onAdjust}
        />
      )}

      {/* 复核历史：通过与拒绝事件全部保留 */}
      <section className="panel review-history">
        <div className="heading">
          <div>
            <p>审计留痕</p>
            <h2>批次复核历史</h2>
          </div>
        </div>
        {batch.reviews.length === 0 ? (
          <p className="chart-empty">尚未执行复核。</p>
        ) : (
          <ul>
            {[...batch.reviews].reverse().map((ev) => (
              <li key={ev.id} className={"history-item " + ev.result}>
                <div className="history-head">
                  <span className={ev.result === "passed" ? "badge passed" : "badge rejected"}>
                    {ev.result === "passed" ? "通过" : "整批拒绝"}
                  </span>
                  <time>{fmtTime(ev.at)}</time>
                </div>
                <ul className="history-reasons">
                  {ev.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {ev.flaggedSampleIds.length > 0 && (
                  <small>
                    当次标记：{ev.flaggedSampleIds.join("、")}（复检确认仅解除标记）
                  </small>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

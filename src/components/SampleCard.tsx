// 单个样本详情卡片：
// 原始值只读展示、待复检标记确认（仅解除标记）、拒绝原因与调整痕迹全部保留可查。

import { useState } from "react";
import { AdjustmentTrace, CaseBatch, Sample, STAGES } from "../types";
import { FIELD_LABELS } from "../types";
import { fmtTime } from "../review";

interface Props {
  batch: CaseBatch;
  sample: Sample;
  rejectionReasons: string[];
  onConfirmRecheck: (sampleId: string) => void;
  onAdjust: (sampleId: string, draft: Omit<Sample, "id" | "caseId" | "pendingRecheck">, reason: string) => void;
}

const FIELD_ORDER: (keyof Sample)[] = [
  "location",
  "temperature",
  "exposureStage",
  "species",
  "stage",
  "sampledAt",
  "preservation",
  "notes",
];

export default function SampleCard({
  batch,
  sample,
  rejectionReasons,
  onConfirmRecheck,
  onAdjust,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<Omit<Sample, "id" | "caseId" | "pendingRecheck">>(
    () => strip(sample)
  );

  const traces = batch.adjustments.filter((t) => t.sampleId === sample.id);
  const clears = batch.clears.filter((c) => c.sampleId === sample.id);

  const startEdit = () => {
    setDraft(strip(sample));
    setReason("");
    setEditing(true);
  };

  const submit = () => {
    onAdjust(sample.id, draft, reason);
    setEditing(false);
  };

  return (
    <article className={"panel sample-card" + (sample.pendingRecheck ? " is-pending" : "")}>
      <div className="heading">
        <div>
          <p>样本详情卡片</p>
          <h3>{sample.id}</h3>
        </div>
        <div className="card-actions">
          {sample.pendingRecheck && <span className="badge pending">待复检</span>}
          {!editing && <button onClick={startEdit}>调整字段</button>}
          {sample.pendingRecheck && (
            <button className="primary" onClick={() => onConfirmRecheck(sample.id)}>
              复检确认 · 解除标记
            </button>
          )}
        </div>
      </div>

      {/* 拒绝原因：复核拒绝后永久保留在卡片上 */}
      {rejectionReasons.length > 0 && (
        <div className="reject-box">
          <h4>整批拒绝原因（原始记录未改动）</h4>
          <ul>
            {rejectionReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {!editing ? (
        <dl className="sample-fields">
          {FIELD_ORDER.map((f) => (
            <div key={f} className="sample-field">
              <dt>{FIELD_LABELS[f]}</dt>
              <dd>
                {f === "sampledAt"
                  ? fmtTime(String(sample[f]))
                  : f === "temperature"
                    ? `${sample[f]}℃`
                    : String(sample[f]) || <em className="empty">未填写</em>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="edit-form">
          <div className="field-grid">
            <label>
              <span>采样地点</span>
              <input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </label>
            <label>
              <span>环境温度（℃）</span>
              <input
                type="number"
                step="0.1"
                value={draft.temperature}
                onChange={(e) =>
                  setDraft({ ...draft, temperature: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>尸体暴露阶段</span>
              <input
                value={draft.exposureStage}
                onChange={(e) => setDraft({ ...draft, exposureStage: e.target.value })}
              />
            </label>
            <label>
              <span>昆虫种类</span>
              <input
                value={draft.species}
                onChange={(e) => setDraft({ ...draft, species: e.target.value })}
              />
            </label>
            <label>
              <span>发育阶段</span>
              <select
                value={draft.stage}
                onChange={(e) =>
                  setDraft({ ...draft, stage: e.target.value as Sample["stage"] })
                }
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>采样时间</span>
              <input
                type="datetime-local"
                value={draft.sampledAt}
                onChange={(e) => setDraft({ ...draft, sampledAt: e.target.value })}
              />
            </label>
            <label>
              <span>保存方式</span>
              <input
                value={draft.preservation}
                onChange={(e) => setDraft({ ...draft, preservation: e.target.value })}
                placeholder="温差超 8℃ 时必填"
              />
            </label>
            <label>
              <span>鉴定备注</span>
              <input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
          </div>
          <label className="reason-input">
            <span>调整原因（必填留痕）</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：现场补测温度探头校准值"
            />
          </label>
          <p className="trace-note">
            提交后原值与新值都会进入调整痕迹；待复检标记不会因调整而解除。
          </p>
          <div className="form-buttons">
            <button onClick={() => setEditing(false)}>取消</button>
            <button className="primary" onClick={submit} disabled={!reason.trim()}>
              提交调整并留痕
            </button>
          </div>
        </div>
      )}

      {/* 调整痕迹：append-only，永久保留 */}
      {traces.length > 0 && (
        <div className="trace-box">
          <h4>调整痕迹（{traces.length}）</h4>
          <ul>
            {traces.map((t: AdjustmentTrace) => (
              <li key={t.id}>
                <time>{fmtTime(t.at)}</time>
                <span>
                  <b>{FIELD_LABELS[t.field] ?? t.field}</b>：
                  <del>{t.from || "空"}</del> → <ins>{t.to || "空"}</ins>
                </span>
                <span className="trace-reason">原因：{t.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {clears.length > 0 && (
        <p className="clear-history">
          复检确认记录：
          {clears.map((c) => fmtTime(c.at)).join("、")}（仅解除标记，未修改原始值）
        </p>
      )}
    </article>
  );
}

function strip(s: Sample): Omit<Sample, "id" | "caseId" | "pendingRecheck"> {
  const { location, temperature, exposureStage, species, stage, sampledAt, preservation, notes } = s;
  return { location, temperature, exposureStage, species, stage, sampledAt, preservation, notes };
}

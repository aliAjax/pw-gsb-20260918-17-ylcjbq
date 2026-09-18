import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./styles.css";
import {
  EXPOSURE_STAGES,
  PRESERVATION_METHODS,
  STAGES,
  STAGE_GROUPS,
  TEMP_THRESHOLD,
  evaluateBatch,
  formatTime,
  nextSampleId,
  nowString,
  seedBatches,
  seedSamples,
  stageGroup,
} from "./domain";
import type { Batch, ReviewOutcome, Sample } from "./domain";

const project = {
  id: "hxyfront-62003",
  sourceNo: 5,
  port: 62003,
  title: "法医昆虫学样本记录",
};

const STATUS_CLASS: Record<string, string> = {
  待复核: "idle",
  已通过: "ok",
  待复检: "warn",
  已拒绝: "bad",
};

interface FormState {
  caseId: string;
  location: string;
  temperature: string;
  exposureStage: string;
  species: string;
  stage: string;
  sampledAt: string;
  preservation: string;
  notes: string;
}

const emptyForm: FormState = {
  caseId: "CASE-042",
  location: "",
  temperature: "",
  exposureStage: EXPOSURE_STAGES[0],
  species: "",
  stage: STAGES[0],
  sampledAt: "",
  preservation: "",
  notes: "",
};

function TemperatureChart({ samples, selectedId, onSelect }: {
  samples: Sample[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const W = 660;
  const H = 280;
  const padL = 46;
  const padR = 18;
  const padT = 26;
  const padB = 44;

  if (samples.length === 0) {
    return <p className="empty">当前案件暂无样本</p>;
  }

  const temps = samples.map((s) => s.temperature);
  const min = Math.floor(Math.min(...temps) - 2);
  const max = Math.ceil(Math.max(...temps) + 2);
  const span = max - min || 1;
  const x = (i: number) =>
    samples.length === 1 ? padL + (W - padL - padR) / 2 : padL + (i * (W - padL - padR)) / (samples.length - 1);
  const y = (t: number) => padT + ((max - t) * (H - padT - padB)) / span;

  const gridLines = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);

  return (
    <svg className="temp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="温度记录图">
      {gridLines.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} className="axis-label" textAnchor="end">
            {t.toFixed(0)}℃
          </text>
        </g>
      ))}

      {samples.slice(1).map((curr, i) => {
        const prev = samples[i];
        const diff = Math.abs(curr.temperature - prev.temperature);
        const over = diff > TEMP_THRESHOLD;
        return (
          <g key={`${prev.id}-${curr.id}`}>
            <line
              x1={x(i)}
              y1={y(prev.temperature)}
              x2={x(i + 1)}
              y2={y(curr.temperature)}
              className={over ? "seg over" : "seg"}
            />
            {over && (
              <text
                x={(x(i) + x(i + 1)) / 2}
                y={(y(prev.temperature) + y(curr.temperature)) / 2 - 8}
                className="diff-label"
                textAnchor="middle"
              >
                Δ{diff.toFixed(1)}℃
              </text>
            )}
          </g>
        );
      })}

      {samples.map((s, i) => (
        <g key={s.id} onClick={() => onSelect(s.id)} className="point">
          {s.pendingReview && <circle cx={x(i)} cy={y(s.temperature)} r={11} className="halo" />}
          <circle
            cx={x(i)}
            cy={y(s.temperature)}
            r={s.id === selectedId ? 7 : 5}
            className={s.id === selectedId ? "dot selected" : "dot"}
          />
          <text x={x(i)} y={y(s.temperature) - 14} className="temp-label" textAnchor="middle">
            {s.temperature.toFixed(1)}℃
          </text>
          <text x={x(i)} y={H - padB + 16} className="axis-label" textAnchor="middle">
            {formatTime(s.sampledAt)}
          </text>
          <text x={x(i)} y={H - padB + 30} className="axis-label dim" textAnchor="middle">
            {s.id.slice(-1)} · {stageGroup(s.stage)}
          </text>
          <title>
            {`${s.id} ${formatTime(s.sampledAt)} ${s.temperature.toFixed(1)}℃ ${s.stage}`}
          </title>
        </g>
      ))}
    </svg>
  );
}

function App() {
  const [samples, setSamples] = useState<Sample[]>(seedSamples);
  const [batches, setBatches] = useState<Batch[]>(seedBatches);
  const [selectedCaseId, setSelectedCaseId] = useState("CASE-042");
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>("CASE-042-A");
  const [stageFilter, setStageFilter] = useState("全部");
  const [form, setForm] = useState<FormState>(emptyForm);

  const cases = useMemo(() => {
    const ids = Array.from(new Set(samples.map((s) => s.caseId)));
    return ids.map((id) => ({
      id,
      count: samples.filter((s) => s.caseId === id).length,
      batch: batches.find((b) => b.caseId === id),
    }));
  }, [samples, batches]);

  const caseSamples = useMemo(
    () =>
      samples
        .filter((s) => s.caseId === selectedCaseId)
        .sort((a, b) => a.sampledAt.localeCompare(b.sampledAt)),
    [samples, selectedCaseId]
  );

  const visibleSamples = useMemo(
    () => caseSamples.filter((s) => stageFilter === "全部" || stageGroup(s.stage) === stageFilter),
    [caseSamples, stageFilter]
  );

  const selectedSample = samples.find((s) => s.id === selectedSampleId) ?? null;
  const selectedBatch = selectedSample
    ? batches.find((b) => b.sampleIds.includes(selectedSample.id)) ?? null
    : null;

  const metrics = useMemo(() => {
    const avg = samples.length
      ? samples.reduce((sum, s) => sum + s.temperature, 0) / samples.length
      : 0;
    return [
      { label: "样本批次", value: String(batches.length) },
      { label: "平均温度", value: `${avg.toFixed(1)}℃` },
      { label: "发育阶段", value: String(new Set(samples.map((s) => stageGroup(s.stage))).size) },
      { label: "待复检", value: String(samples.filter((s) => s.pendingReview).length) },
    ];
  }, [samples, batches]);

  const allEvents = useMemo(
    () =>
      batches
        .flatMap((b) => b.log.map((e) => ({ ...e, batch: b.name })))
        .sort((a, b2) => b2.at.localeCompare(a.at)),
    [batches]
  );

  /** 应用复核结果：拒绝时只更新批次，样本原数据不变；通过时按结果重算待复检标记。 */
  function applyOutcomes(outcomes: Map<string, ReviewOutcome>) {
    setBatches((prev) =>
      prev.map((b) => {
        const o = outcomes.get(b.id);
        if (!o) return b;
        return {
          ...b,
          status: o.status,
          rejectReasons: o.reasons.length > 0 ? o.reasons : b.rejectReasons,
          log: [...b.log, ...o.events],
        };
      })
    );
    setSamples((prev) =>
      prev.map((s) => {
        const batch = batches.find((b) => b.sampleIds.includes(s.id));
        if (!batch) return s;
        const o = outcomes.get(batch.id);
        if (!o || o.status === "已拒绝") return s; // 整批拒绝，原数据不变
        return { ...s, pendingReview: o.flaggedIds.includes(s.id) };
      })
    );
  }

  function runReview(batchId: string) {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return;
    applyOutcomes(new Map([[batchId, evaluateBatch(batch, samples, nowString())]]));
  }

  function reviewAll() {
    const now = nowString();
    applyOutcomes(new Map(batches.map((b) => [b.id, evaluateBatch(b, samples, now)])));
  }

  /** 复核确认：只解除待复检标记，原始值、拒绝原因、调整痕迹全部保留。 */
  function confirmReview(batchId: string) {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch || batch.status !== "待复检") return;
    const cleared = samples.filter((s) => batch.sampleIds.includes(s.id) && s.pendingReview).length;
    const now = nowString();
    setSamples((prev) =>
      prev.map((s) => (batch.sampleIds.includes(s.id) ? { ...s, pendingReview: false } : s))
    );
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              status: "已通过",
              log: [
                ...b.log,
                {
                  at: now,
                  kind: "confirm",
                  message: `复核确认：解除 ${cleared} 处待复检标记，原始值与拒绝原因保留`,
                },
              ],
            }
          : b
      )
    );
  }

  function addSample(e: FormEvent) {
    e.preventDefault();
    const caseId = form.caseId.trim().toUpperCase();
    const temperature = Number(form.temperature);
    if (!caseId || !form.location.trim() || !form.species.trim() || !form.sampledAt) return;
    if (!Number.isFinite(temperature)) return;

    const id = nextSampleId(caseId, samples);
    const sample: Sample = {
      id,
      caseId,
      location: form.location.trim(),
      temperature: Math.round(temperature * 10) / 10,
      exposureStage: form.exposureStage,
      species: form.species.trim(),
      stage: form.stage,
      sampledAt: form.sampledAt,
      preservation: form.preservation,
      notes: form.notes.trim() || "待补充鉴定备注",
      pendingReview: false,
    };
    const now = nowString();

    setSamples((prev) => [...prev, sample]);
    setBatches((prev) => {
      const existing = prev.find((b) => b.caseId === caseId);
      if (existing) {
        return prev.map((b) =>
          b.caseId === caseId
            ? {
                ...b,
                sampleIds: [...b.sampleIds, id],
                status: "待复核",
                log: [...b.log, { at: now, kind: "edit", message: `新增样本 ${id}，批次需重新复核` }],
              }
            : b
        );
      }
      return [
        ...prev,
        {
          id: `BATCH-${caseId.replace(/\D+/g, "") || "X"}-1`,
          caseId,
          name: `${caseId} 第 1 批`,
          sampleIds: [id],
          status: "待复核",
          rejectReasons: [],
          log: [{ at: now, kind: "import", message: "新建案件批次，等待复核" }],
        },
      ];
    });
    setSelectedCaseId(caseId);
    setSelectedSampleId(id);
    setForm({ ...emptyForm, caseId });
  }

  function exportSummary() {
    const lines = [
      `${project.title} · 复核摘要`,
      `导出时间：${nowString()}`,
      "",
      ...batches.flatMap((b) => [
        `【${b.name}】状态：${b.status}，样本 ${b.sampleIds.length} 份`,
        ...(b.rejectReasons.length > 0 ? [`  拒绝原因（保留）：${b.rejectReasons.join("；")}`] : []),
        ...b.log.map((e) => `  [${formatTime(e.at)}] ${e.message}`),
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "复核摘要.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>
          记录采样地点、环境温度、尸体暴露阶段、昆虫种类、发育阶段、采样时间、保存方式和鉴定备注，
          并对同一案件批次执行复核：按采样时间排序校验发育阶段递进与连续温差。
        </span>
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
        <aside className="panel">
          <h2>发育阶段筛选</h2>
          <div className="chips">
            {["全部", ...STAGE_GROUPS].map((item) => (
              <button
                key={item}
                className={stageFilter === item ? "chip active" : "chip"}
                onClick={() => setStageFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <h2 className="aside-sub">案件样本关联</h2>
          <div className="case-list">
            {cases.map((c) => (
              <button
                key={c.id}
                className={c.id === selectedCaseId ? "case-item active" : "case-item"}
                onClick={() => {
                  setSelectedCaseId(c.id);
                  const first = samples
                    .filter((s) => s.caseId === c.id)
                    .sort((a, b) => a.sampledAt.localeCompare(b.sampledAt))[0];
                  setSelectedSampleId(first ? first.id : null);
                }}
              >
                <span>
                  <b>{c.id}</b>
                  <small>{c.count} 份样本</small>
                </span>
                {c.batch && (
                  <i className={`badge ${STATUS_CLASS[c.batch.status]}`}>{c.batch.status}</i>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>批次复核</p>
              <h2>样本批次列表</h2>
            </div>
            <button className="primary" onClick={reviewAll}>全部复核</button>
          </div>
          <p className="rule-bar">
            复核规则：同案件样本按采样时间排序，发育阶段不得倒退；连续样本温差超过 {TEMP_THRESHOLD}℃
            须填写保存方式并标记待复检，否则整批拒绝且原数据不变；复核确认仅解除标记，原始值、拒绝原因与调整痕迹保留。
          </p>
          <div className="batch-list">
            {batches.map((b) => {
              const batchSamples = samples.filter((s) => b.sampleIds.includes(s.id));
              const flagged = batchSamples.filter((s) => s.pendingReview).length;
              const temps = batchSamples.map((s) => s.temperature);
              return (
                <article key={b.id} className={`batch-card ${STATUS_CLASS[b.status]}`}>
                  <header>
                    <div>
                      <h3>{b.name}</h3>
                      <p>
                        {b.caseId} · {batchSamples.length} 份样本
                        {temps.length > 0 &&
                          ` · 温度 ${Math.min(...temps).toFixed(1)}–${Math.max(...temps).toFixed(1)}℃`}
                        {flagged > 0 && ` · ${flagged} 份待复检`}
                      </p>
                    </div>
                    <i className={`badge ${STATUS_CLASS[b.status]}`}>{b.status}</i>
                  </header>

                  {b.rejectReasons.length > 0 && (
                    <ul className={b.status === "已拒绝" ? "reasons" : "reasons kept"}>
                      {b.rejectReasons.map((r) => (
                        <li key={r}>{r}{b.status !== "已拒绝" && "（历史记录，保留）"}</li>
                      ))}
                    </ul>
                  )}

                  <div className="batch-actions">
                    <button onClick={() => runReview(b.id)}>执行复核</button>
                    {b.status === "待复检" && (
                      <button className="primary" onClick={() => confirmReview(b.id)}>
                        复核确认
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedCaseId(b.caseId);
                        const first = samples
                          .filter((s) => b.sampleIds.includes(s.id))
                          .sort((x, y) => x.sampledAt.localeCompare(y.sampledAt))[0];
                        setSelectedSampleId(first ? first.id : null);
                      }}
                    >
                      查看案件
                    </button>
                  </div>

                  <details className="log">
                    <summary>调整痕迹 {b.log.length} 条</summary>
                    <ul>
                      {b.log.map((e, i) => (
                        <li key={`${e.at}-${i}`} className={`log-${e.kind}`}>
                          <time>{formatTime(e.at)}</time>
                          <span>{e.message}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="workspace">
        <section className="panel chart-panel">
          <div className="heading">
            <div>
              <p>温度记录图</p>
              <h2>{selectedCaseId} 采样温度曲线</h2>
            </div>
            <span className="legend">
              <i className="lg ok" /> 温差正常 <i className="lg bad" /> 温差＞{TEMP_THRESHOLD}℃{" "}
              <i className="lg warn" /> 待复检
            </span>
          </div>
          <TemperatureChart
            samples={caseSamples}
            selectedId={selectedSampleId}
            onSelect={setSelectedSampleId}
          />
          <div className="sample-strip">
            {visibleSamples.map((s) => (
              <button
                key={s.id}
                className={s.id === selectedSampleId ? "sample-chip active" : "sample-chip"}
                onClick={() => setSelectedSampleId(s.id)}
              >
                <b>{s.id}</b>
                <span>
                  {s.stage} · {s.temperature.toFixed(1)}℃
                </span>
                {s.pendingReview && <em>待复检</em>}
              </button>
            ))}
            {visibleSamples.length === 0 && <p className="empty">当前筛选下没有样本</p>}
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="heading">
            <div>
              <p>单个样本</p>
              <h2>详情卡片</h2>
            </div>
            {selectedSample?.pendingReview && <i className="badge warn">待复检</i>}
          </div>
          {selectedSample ? (
            <>
              <h3 className="detail-title">{selectedSample.id}</h3>
              <dl className="detail-grid">
                <div><dt>采样地点</dt><dd>{selectedSample.location}</dd></div>
                <div><dt>环境温度</dt><dd>{selectedSample.temperature.toFixed(1)}℃</dd></div>
                <div><dt>暴露阶段</dt><dd>{selectedSample.exposureStage}</dd></div>
                <div><dt>昆虫种类</dt><dd>{selectedSample.species}</dd></div>
                <div><dt>发育阶段</dt><dd>{selectedSample.stage}</dd></div>
                <div><dt>采样时间</dt><dd>{formatTime(selectedSample.sampledAt)}</dd></div>
                <div>
                  <dt>保存方式</dt>
                  <dd className={selectedSample.preservation ? "" : "missing"}>
                    {selectedSample.preservation || "未填写"}
                  </dd>
                </div>
                <div><dt>所属批次</dt><dd>{selectedBatch ? `${selectedBatch.name}（${selectedBatch.status}）` : "—"}</dd></div>
              </dl>
              <p className="notes">鉴定备注：{selectedSample.notes}</p>
              {selectedBatch && (
                <div className="related-log">
                  <h4>相关复核痕迹</h4>
                  <ul>
                    {selectedBatch.log
                      .filter((e) => e.message.includes(selectedSample.id))
                      .map((e, i) => (
                        <li key={`${e.at}-${i}`}>
                          <time>{formatTime(e.at)}</time>
                          <span>{e.message}</span>
                        </li>
                      ))}
                    {selectedBatch.log.filter((e) => e.message.includes(selectedSample.id)).length === 0 && (
                      <li><span>暂无涉及该样本的复核记录</span></li>
                    )}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="empty">请在上方选择样本</p>
          )}
        </section>
      </section>

      <section className="panel form-panel">
        <div className="heading">
          <div>
            <p>专业字段</p>
            <h2>新增记录</h2>
          </div>
          <button className="primary" form="sample-form" type="submit">保存记录</button>
        </div>
        <form id="sample-form" className="field-grid" onSubmit={addSample}>
          <label>
            <span>案件编号</span>
            <input
              list="case-ids"
              value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
              placeholder="如 CASE-042"
            />
            <datalist id="case-ids">
              {cases.map((c) => (
                <option key={c.id} value={c.id} />
              ))}
            </datalist>
          </label>
          <label>
            <span>采样地点</span>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="填写采样地点"
            />
          </label>
          <label>
            <span>环境温度（℃）</span>
            <input
              type="number"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
              placeholder="如 26.5"
            />
          </label>
          <label>
            <span>暴露阶段</span>
            <select
              value={form.exposureStage}
              onChange={(e) => setForm({ ...form, exposureStage: e.target.value })}
            >
              {EXPOSURE_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>昆虫种类</span>
            <input
              value={form.species}
              onChange={(e) => setForm({ ...form, species: e.target.value })}
              placeholder="如 丝光绿蝇"
            />
          </label>
          <label>
            <span>发育阶段</span>
            <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>采样时间</span>
            <input
              type="datetime-local"
              value={form.sampledAt}
              onChange={(e) => setForm({ ...form, sampledAt: e.target.value })}
            />
          </label>
          <label>
            <span>保存方式</span>
            <select
              value={form.preservation}
              onChange={(e) => setForm({ ...form, preservation: e.target.value })}
            >
              <option value="">未填写</option>
              {PRESERVATION_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>鉴定备注</span>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="填写鉴定备注"
            />
          </label>
        </form>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>历史记录</p>
            <h2>复核痕迹</h2>
          </div>
          <button onClick={exportSummary}>导出摘要</button>
        </div>
        <div className="records">
          {allEvents.map((e, i) => (
            <article key={`${e.at}-${i}`}>
              <b className={`mark ${e.kind}`}>{String(i + 1).padStart(2, "0")}</b>
              <div>
                <h3>{e.batch}</h3>
                <p>{formatTime(e.at)} · {e.message}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;

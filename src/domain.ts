// 法医昆虫学样本记录 —— 批次复核领域逻辑
// 规则：
// 1. 同一案件内样本按采样时间排序，发育阶段不能倒退；
// 2. 连续样本温差超过 8℃ 时，必须填写保存方式并标记待复检；
// 3. 否则整批拒绝且原数据不变；
// 4. 复核确认后只解除标记，原始值、拒绝原因和调整痕迹保留。

export const TEMP_THRESHOLD = 8;

export const STAGE_ORDER: Record<string, number> = {
  卵: 0,
  幼虫一龄: 1,
  幼虫二龄: 2,
  幼虫三龄: 3,
  蛹: 4,
  成虫: 5,
};

export const STAGES = Object.keys(STAGE_ORDER);
export const STAGE_GROUPS = ["卵", "幼虫", "蛹", "成虫"];
export const EXPOSURE_STAGES = ["新鲜期", "肿胀期", "腐败期", "干化期"];
export const PRESERVATION_METHODS = ["乙醇保存", "冷藏保存", "冷冻保存", "干燥保存", "拍照固定"];

export function stageGroup(stage: string): string {
  return stage.startsWith("幼虫") ? "幼虫" : stage;
}

export interface Sample {
  id: string;
  caseId: string;
  location: string; // 采样地点
  temperature: number; // 环境温度 ℃
  exposureStage: string; // 尸体暴露阶段
  species: string; // 昆虫种类
  stage: string; // 发育阶段
  sampledAt: string; // 采样时间，本地 ISO：YYYY-MM-DDTHH:mm
  preservation: string; // 保存方式，可为空
  notes: string; // 鉴定备注
  pendingReview: boolean; // 待复检标记
}

export type BatchStatus = "待复核" | "已通过" | "待复检" | "已拒绝";

export interface ReviewEvent {
  at: string;
  kind: "import" | "edit" | "check" | "flag" | "reject" | "confirm";
  message: string;
}

export interface Batch {
  id: string;
  caseId: string;
  name: string;
  sampleIds: string[];
  status: BatchStatus;
  rejectReasons: string[]; // 拒绝原因（确认后仍保留）
  log: ReviewEvent[]; // 调整痕迹（只增不删）
}

export interface ReviewOutcome {
  status: BatchStatus;
  reasons: string[];
  flaggedIds: string[];
  events: ReviewEvent[];
}

/** 纯函数：对单个批次执行复核，不修改任何入参。 */
export function evaluateBatch(batch: Batch, allSamples: Sample[], now: string): ReviewOutcome {
  const ordered = batch.sampleIds
    .map((id) => allSamples.find((s) => s.id === id))
    .filter((s): s is Sample => Boolean(s))
    .sort((a, b) => a.sampledAt.localeCompare(b.sampledAt));

  const reasons: string[] = [];
  const flaggedIds: string[] = [];
  const events: ReviewEvent[] = [
    {
      at: now,
      kind: "check",
      message: `执行复核：${batch.caseId} 内 ${ordered.length} 份样本按采样时间排序`,
    },
  ];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const prevRank = STAGE_ORDER[prev.stage] ?? 0;
    const currRank = STAGE_ORDER[curr.stage] ?? 0;

    if (currRank < prevRank) {
      reasons.push(
        `发育阶段倒退：${curr.id}（${curr.stage}）采样时间晚于 ${prev.id}（${prev.stage}）`
      );
    }

    const diff = Math.round(Math.abs(curr.temperature - prev.temperature) * 10) / 10;
    if (diff > TEMP_THRESHOLD) {
      if (!curr.preservation.trim()) {
        reasons.push(
          `温差 ${diff.toFixed(1)}℃ 超过 ${TEMP_THRESHOLD}℃：${curr.id} 未填写保存方式`
        );
      } else {
        flaggedIds.push(curr.id);
        events.push({
          at: now,
          kind: "flag",
          message: `${prev.id} → ${curr.id} 温差 ${diff.toFixed(1)}℃ 超阈值，已填写保存方式（${curr.preservation}），${curr.id} 标记待复检`,
        });
      }
    }
  }

  if (reasons.length > 0) {
    events.push({
      at: now,
      kind: "reject",
      message: `整批拒绝：${reasons.join("；")}。原数据不变`,
    });
    return { status: "已拒绝", reasons, flaggedIds: [], events };
  }

  if (flaggedIds.length > 0) {
    return { status: "待复检", reasons: [], flaggedIds, events };
  }

  events.push({ at: now, kind: "check", message: "复核通过：阶段递进正常，连续温差均在阈值内" });
  return { status: "已通过", reasons: [], flaggedIds: [], events };
}

export function nowString(): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string): string {
  return iso.length >= 16 ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : iso;
}

export function nextSampleId(caseId: string, samples: Sample[]): string {
  const n = samples.filter((s) => s.caseId === caseId).length;
  const letter = String.fromCharCode(65 + (n % 26));
  return `${caseId}-${n < 26 ? letter : `${letter}${Math.floor(n / 26)}`}`;
}

export const seedSamples: Sample[] = [
  // CASE-042：阶段递进、温差均在阈值内 —— 应通过
  { id: "CASE-042-A", caseId: "CASE-042", location: "室外草地", temperature: 24.1, exposureStage: "肿胀期", species: "丝光绿蝇", stage: "卵", sampledAt: "2026-09-10T08:30", preservation: "乙醇保存", notes: "卵块完整，已拍照", pendingReview: false },
  { id: "CASE-042-B", caseId: "CASE-042", location: "室外草地", temperature: 26.3, exposureStage: "肿胀期", species: "丝光绿蝇", stage: "幼虫一龄", sampledAt: "2026-09-11T09:00", preservation: "乙醇保存", notes: "活虫采集，当日回实验室", pendingReview: false },
  { id: "CASE-042-C", caseId: "CASE-042", location: "树荫边缘", temperature: 31.5, exposureStage: "腐败期", species: "大头金蝇", stage: "幼虫二龄", sampledAt: "2026-09-12T10:20", preservation: "", notes: "待鉴定到种", pendingReview: false },
  { id: "CASE-042-D", caseId: "CASE-042", location: "树荫边缘", temperature: 28.6, exposureStage: "腐败期", species: "大头金蝇", stage: "幼虫三龄", sampledAt: "2026-09-13T11:00", preservation: "乙醇保存", notes: "幼虫三龄，体长约 12mm", pendingReview: false },
  // CASE-051：B 与 A 温差 9.7℃ 但已填保存方式 —— 应标记待复检
  { id: "CASE-051-A", caseId: "CASE-051", location: "水沟边缘", temperature: 18.2, exposureStage: "腐败期", species: "巨尾阿丽蝇", stage: "幼虫二龄", sampledAt: "2026-09-08T07:40", preservation: "乙醇保存", notes: "水体附近采集", pendingReview: false },
  { id: "CASE-051-B", caseId: "CASE-051", location: "水沟边缘", temperature: 27.9, exposureStage: "腐败期", species: "巨尾阿丽蝇", stage: "幼虫三龄", sampledAt: "2026-09-09T08:10", preservation: "冷藏保存", notes: "午后气温骤升，已冷藏", pendingReview: false },
  { id: "CASE-051-C", caseId: "CASE-051", location: "芦苇丛", temperature: 26.4, exposureStage: "干化期", species: "巨尾阿丽蝇", stage: "蛹", sampledAt: "2026-09-12T09:30", preservation: "乙醇保存", notes: "蛹壳完整", pendingReview: false },
  // CASE-063：B 与 A 温差 9.8℃ 且未填保存方式 —— 应整批拒绝
  { id: "CASE-063-A", caseId: "CASE-063", location: "废弃厂房", temperature: 15.8, exposureStage: "新鲜期", species: "反吐丽蝇", stage: "卵", sampledAt: "2026-09-14T06:50", preservation: "冷藏保存", notes: "清晨采集", pendingReview: false },
  { id: "CASE-063-B", caseId: "CASE-063", location: "废弃厂房", temperature: 25.6, exposureStage: "肿胀期", species: "反吐丽蝇", stage: "幼虫一龄", sampledAt: "2026-09-14T15:20", preservation: "", notes: "需复核种属", pendingReview: false },
  // CASE-067：B 阶段倒退（蛹 → 幼虫二龄）—— 应整批拒绝
  { id: "CASE-067-A", caseId: "CASE-067", location: "林下落叶层", temperature: 22.4, exposureStage: "干化期", species: "麻蝇属", stage: "蛹", sampledAt: "2026-09-15T10:00", preservation: "乙醇保存", notes: "已完成拍照", pendingReview: false },
  { id: "CASE-067-B", caseId: "CASE-067", location: "林下落叶层", temperature: 23.1, exposureStage: "干化期", species: "麻蝇属", stage: "幼虫二龄", sampledAt: "2026-09-16T10:30", preservation: "乙醇保存", notes: "记录时间与阶段存疑", pendingReview: false },
];

export const seedBatches: Batch[] = [
  {
    id: "BATCH-042-1",
    caseId: "CASE-042",
    name: "CASE-042 第 1 批",
    sampleIds: ["CASE-042-A", "CASE-042-B", "CASE-042-C", "CASE-042-D"],
    status: "待复核",
    rejectReasons: [],
    log: [{ at: "2026-09-13T18:00", kind: "import", message: "批次建档，等待复核" }],
  },
  {
    id: "BATCH-051-1",
    caseId: "CASE-051",
    name: "CASE-051 第 1 批",
    sampleIds: ["CASE-051-A", "CASE-051-B", "CASE-051-C"],
    status: "待复核",
    rejectReasons: [],
    log: [{ at: "2026-09-12T17:30", kind: "import", message: "批次建档，等待复核" }],
  },
  {
    id: "BATCH-063-1",
    caseId: "CASE-063",
    name: "CASE-063 第 1 批",
    sampleIds: ["CASE-063-A", "CASE-063-B"],
    status: "待复核",
    rejectReasons: [],
    log: [{ at: "2026-09-14T19:10", kind: "import", message: "批次建档，等待复核" }],
  },
  {
    id: "BATCH-067-1",
    caseId: "CASE-067",
    name: "CASE-067 第 1 批",
    sampleIds: ["CASE-067-A", "CASE-067-B"],
    status: "待复核",
    rejectReasons: [],
    log: [{ at: "2026-09-16T16:40", kind: "import", message: "批次建档，等待复核" }],
  },
];

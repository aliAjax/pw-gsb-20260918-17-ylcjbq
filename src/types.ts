// 法医昆虫学样本记录 —— 领域模型
// 所有复核事件、拒绝原因、调整痕迹均为只追加（append-only），以满足审计留痕要求。

export const STAGES = ["卵", "幼虫", "蛹", "成虫"] as const;
export type StageKey = (typeof STAGES)[number];

/** 发育阶段只能沿该顺序递进，序号倒退即违规 */
export const STAGE_RANK: Record<StageKey, number> = {
  卵: 0,
  幼虫: 1,
  蛹: 2,
  成虫: 3,
};

export const EXPOSURE_STAGES = [
  "新鲜期",
  "肿胀期",
  "腐烂期",
  "后腐烂期",
  "白骨化期",
] as const;
export type ExposureStage = (typeof EXPOSURE_STAGES)[number];

export const FIELD_LABELS: Record<string, string> = {
  location: "采样地点",
  temperature: "环境温度",
  exposureStage: "尸体暴露阶段",
  species: "昆虫种类",
  stage: "发育阶段",
  sampledAt: "采样时间",
  preservation: "保存方式",
  notes: "鉴定备注",
};

/** 单条昆虫学样本（原始记录值） */
export interface Sample {
  id: string;
  caseId: string;
  location: string; // 采样地点
  temperature: number; // 环境温度 ℃
  exposureStage: string; // 尸体暴露阶段
  species: string; // 昆虫种类
  stage: StageKey; // 发育阶段
  sampledAt: string; // 采样时间 YYYY-MM-DDTHH:mm
  preservation: string; // 保存方式（温差>8℃时必须填写）
  notes: string; // 鉴定备注
  /** 待复检标记：只有“确认复检”动作可以解除（置为 false），其他任何流程都不会清除 */
  pendingRecheck: boolean;
}

/** 一次批次复核的结果快照（拒绝原因永久保留） */
export interface ReviewEvent {
  id: string;
  at: string;
  result: "passed" | "rejected";
  /** 通过时为标记说明，拒绝时为拒绝原因，均为人类可读句子 */
  reasons: string[];
  /** 本次通过时被标记待复检的样本 */
  flaggedSampleIds: string[];
}

/** 复检确认记录：只记录“解除标记”这一动作 */
export interface RecheckClear {
  id: string;
  at: string;
  sampleId: string;
}

/** 字段调整痕迹：保存原始值与调整后值，永久保留 */
export interface AdjustmentTrace {
  id: string;
  at: string;
  sampleId: string;
  field: string;
  label: string;
  from: string;
  to: string;
  reason: string;
}

/** 案件样本批次 */
export interface CaseBatch {
  id: string;
  title: string;
  createdAt: string;
  samples: Sample[];
  reviews: ReviewEvent[];
  clears: RecheckClear[];
  adjustments: AdjustmentTrace[];
}

export type BatchStatus = "未复核" | "已通过" | "待复检" | "已拒绝";

export type SampleDraft = Omit<Sample, "id" | "caseId" | "pendingRecheck">;

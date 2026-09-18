// 批次复核规则引擎
// 规则（同一案件内）：
//   1. 样本按采样时间排序，发育阶段不能倒退；
//   2. 连续样本温差超过 8℃ 时：
//        - 已填写保存方式 → 标记两端样本为“待复检”，批次通过；
//        - 未填写保存方式 → 整批拒绝，原数据不变。
//   3. 只要存在拒绝类违规，整批拒绝；违规原因全部记录、永久保留。

import { CaseBatch, Sample, STAGE_RANK, StageKey, BatchStatus } from "./types";

export const TEMP_GAP = 8;

export interface Violation {
  kind: "regression" | "gap-missing" | "gap-ok";
  /** 该连续段中较晚的一条样本（违规挂在“后发生的样本”上，便于定位） */
  sampleId: string;
  pair: [string, string];
  message: string;
}

export interface BatchReviewResult {
  ordered: Sample[];
  violations: Violation[];
  hardFailures: Violation[]; // 导致整批拒绝的违规
  softFlags: Violation[]; // 需标记待复检的温差段
  outcome: "passed" | "rejected";
  reasons: string[];
  flaggedSampleIds: string[];
}

/** 同一案件内样本按采样时间排序（时间相同按 id 稳定排序） */
export function sortBySampledAt(samples: Sample[]): Sample[] {
  return [...samples].sort((a, b) => {
    const d =
      new Date(a.sampledAt).getTime() - new Date(b.sampledAt).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

export function evaluateBatch(batch: CaseBatch): BatchReviewResult {
  const ordered = sortBySampledAt(batch.samples);
  const violations: Violation[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];

    // 规则 1：发育阶段不能倒退
    if (STAGE_RANK[cur.stage] < STAGE_RANK[prev.stage]) {
      violations.push({
        kind: "regression",
        sampleId: cur.id,
        pair: [prev.id, cur.id],
        message:
          `采样时间 ${fmtTime(cur.sampledAt)} 的样本 ${cur.id} 发育阶段为「${cur.stage}」，` +
          `早于它的样本 ${prev.id}（${fmtTime(prev.sampledAt)}）已达「${prev.stage}」，阶段顺序倒退。`,
      });
    }

    // 规则 2：连续样本温差
    const gap = Math.abs(cur.temperature - prev.temperature);
    if (gap > TEMP_GAP) {
      if (!cur.preservation.trim() || !prev.preservation.trim()) {
        const missing = !cur.preservation.trim() ? cur.id : prev.id;
        violations.push({
          kind: "gap-missing",
          sampleId: cur.id,
          pair: [prev.id, cur.id],
          message:
            `样本 ${prev.id}（${prev.temperature}℃）与 ${cur.id}（${cur.temperature}℃）` +
            `温差 ${gap.toFixed(1)}℃，超过 ${TEMP_GAP}℃，且样本 ${missing} 未填写保存方式。`,
        });
      } else {
        violations.push({
          kind: "gap-ok",
          sampleId: cur.id,
          pair: [prev.id, cur.id],
          message:
            `样本 ${prev.id}（${prev.temperature}℃）与 ${cur.id}（${cur.temperature}℃）` +
            `温差 ${gap.toFixed(1)}℃，超过 ${TEMP_GAP}℃；保存方式已填写，标记待复检。`,
        });
      }
    }
  }

  const hardFailures = violations.filter(
    (v) => v.kind === "regression" || v.kind === "gap-missing"
  );
  const softFlags = violations.filter((v) => v.kind === "gap-ok");

  // 同一样本可能落在多个温差段，去重
  const flaggedSampleIds = Array.from(
    new Set(softFlags.flatMap((v) => v.pair))
  );

  const rejected = hardFailures.length > 0;
  const reasons = rejected
    ? hardFailures.map((v) => "整批拒绝：" + v.message)
    : violations.length > 0
      ? [
          `复核通过：${flaggedSampleIds.length} 个样本存在 >${TEMP_GAP}℃ 温差且保存方式齐全，已标记待复检。`,
          ...softFlags.map((v) => v.message),
        ]
      : ["复核通过：发育阶段顺序正常，连续温差均未超过阈值。"];

  return {
    ordered,
    violations,
    hardFailures,
    softFlags,
    outcome: rejected ? "rejected" : "passed",
    reasons,
    flaggedSampleIds,
  };
}

export function isStageKey(v: string): v is StageKey {
  return v in STAGE_RANK;
}

export function avgTemperature(samples: Sample[]): string {
  if (samples.length === 0) return "—";
  const sum = samples.reduce((acc, s) => acc + s.temperature, 0);
  return (sum / samples.length).toFixed(1) + "℃";
}

export function batchStatus(batch: CaseBatch): BatchStatus {
  if (batch.samples.some((s) => s.pendingRecheck)) return "待复检";
  const last = batch.reviews[batch.reviews.length - 1];
  if (!last) return "未复核";
  return last.result === "passed" ? "已通过" : "已拒绝";
}

export function fmtTime(iso: string): string {
  return iso.replace("T", " ");
}

/** 某条样本当前是否被复核规则“判定拒绝”（用于详情/列表高亮） */
export function sampleRejectionMap(
  result: BatchReviewResult
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const v of result.hardFailures) {
    (map[v.sampleId] ??= []).push(v.message);
  }
  return map;
}

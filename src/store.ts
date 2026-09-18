// 批次状态管理：所有写操作都保留痕迹
//   - 复核拒绝：只追加拒绝原因，样本数据不变；
//   - 复核通过：对温差超阈值样本追加“待复检”标记；
//   - 复检确认：只解除标记（pendingRecheck → false），原始值/拒绝原因/痕迹均保留；
//   - 字段调整：以 AdjustmentTrace 记录原值、新值、原因，永不覆盖。

import { useCallback, useEffect, useState } from "react";
import {
  AdjustmentTrace,
  CaseBatch,
  RecheckClear,
  ReviewEvent,
  Sample,
  SampleDraft,
} from "./types";
import { evaluateBatch } from "./review";
import { SEED_BATCHES } from "./seed";

const STORAGE_KEY = "entomo-batches-v1";

function load(): CaseBatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CaseBatch[];
  } catch {
    /* 损坏的缓存直接回退种子数据 */
  }
  return SEED_BATCHES;
}

function nowText(): string {
  return new Date().toISOString().slice(0, 16);
}

function uid(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 8);
}

export function useBatches() {
  const [batches, setBatches] = useState<CaseBatch[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  }, [batches]);

  const patchBatch = useCallback(
    (batchId: string, fn: (b: CaseBatch) => CaseBatch) => {
      setBatches((prev) =>
        prev.map((b) => (b.id === batchId ? fn(b) : b))
      );
    },
    []
  );

  /** 执行批次复核 */
  const runReview = useCallback(
    (batchId: string) => {
      patchBatch(batchId, (b) => {
        const r = evaluateBatch(b);
        const event: ReviewEvent = {
          id: uid("REV"),
          at: nowText(),
          result: r.outcome,
          reasons: r.reasons,
          flaggedSampleIds: r.outcome === "passed" ? r.flaggedSampleIds : [],
        };
        if (r.outcome === "rejected") {
          // 整批拒绝：仅追加拒绝原因，原数据不变，不打任何标记
          return { ...b, reviews: [...b.reviews, event] };
        }
        // 通过：对温差样本标记待复检（已带标记的保持不变）
        const flagged = new Set(r.flaggedSampleIds);
        return {
          ...b,
          reviews: [...b.reviews, event],
          samples: b.samples.map((s) =>
            flagged.has(s.id) ? { ...s, pendingRecheck: true } : s
          ),
        };
      });
    },
    [patchBatch]
  );

  /** 复检确认：只解除标记，其余一律不动 */
  const confirmRecheck = useCallback(
    (batchId: string, sampleId: string) => {
      patchBatch(batchId, (b) => {
        const clear: RecheckClear = {
          id: uid("CLR"),
          at: nowText(),
          sampleId,
        };
        return {
          ...b,
          clears: [...b.clears, clear],
          samples: b.samples.map((s) =>
            s.id === sampleId ? { ...s, pendingRecheck: false } : s
          ),
        };
      });
    },
    [patchBatch]
  );

  /** 调整样本字段：原值、新值、原因全部留痕 */
  const adjustSample = useCallback(
    (
      batchId: string,
      sampleId: string,
      draft: SampleDraft,
      reason: string
    ) => {
      patchBatch(batchId, (b) => {
        const old = b.samples.find((s) => s.id === sampleId);
        if (!old) return b;
        const fields = [
          "location",
          "temperature",
          "exposureStage",
          "species",
          "stage",
          "sampledAt",
          "preservation",
          "notes",
        ] as const;
        const traces: AdjustmentTrace[] = [];
        for (const field of fields) {
          const from = String(old[field]);
          const to = String(draft[field]);
          if (from !== to) {
            traces.push({
              id: uid("ADJ"),
              at: nowText(),
              sampleId,
              field,
              label: field,
              from,
              to,
              reason: reason.trim() || "未填写调整原因",
            });
          }
        }
        const next: Sample = {
          ...old,
          ...draft,
          // 待复检标记只能由“复检确认”解除，调整字段不影响标记
          pendingRecheck: old.pendingRecheck,
        };
        return {
          ...b,
          adjustments: [...b.adjustments, ...traces],
          samples: b.samples.map((s) => (s.id === sampleId ? next : s)),
        };
      });
    },
    [patchBatch]
  );

  const resetAll = useCallback(() => setBatches(SEED_BATCHES), []);

  return { batches, runReview, confirmRecheck, adjustSample, resetAll };
}

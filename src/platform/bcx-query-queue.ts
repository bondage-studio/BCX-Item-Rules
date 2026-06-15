import type { HostWindow } from "./root";
import { BCX_QUERY_QUEUE_DELAY_MS } from "../shared/constants";

interface QueueEntry<T> {
  label: string;
  task: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export interface BCXQueryQueueDiagnostics {
  queueLength: number;
  activeLabel: string | null;
  lastError: string | null;
  processedCount: number;
}

export class BCXQueryQueue {
  private readonly entries: Array<QueueEntry<unknown>> = [];
  private active = false;
  private activeLabel: string | null = null;
  private lastError: string | null = null;
  private processedCount = 0;

  constructor(
    private readonly root: HostWindow,
    private readonly debugEnabled: () => boolean = () => false,
  ) {}

  enqueue<T>(label: string, task: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.entries.push({
        label,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  getDiagnostics(): BCXQueryQueueDiagnostics {
    return {
      queueLength: this.entries.length,
      activeLabel: this.activeLabel,
      lastError: this.lastError,
      processedCount: this.processedCount,
    };
  }

  private pump(): void {
    if (this.active) return;
    const entry = this.entries.shift();
    if (!entry) return;
    this.active = true;
    this.activeLabel = entry.label;
    const startedAt = Date.now();

    Promise.resolve()
      .then(() => entry.task())
      .then((value) => {
        this.processedCount += 1;
        entry.resolve(value);
      })
      .catch((error) => {
        this.processedCount += 1;
        this.lastError = String(error instanceof Error ? error.message : error);
        entry.reject(error);
      })
      .finally(() => {
        this.debug(entry.label, Date.now() - startedAt);
        this.activeLabel = null;
        this.root.setTimeout(() => {
          this.active = false;
          this.pump();
        }, BCX_QUERY_QUEUE_DELAY_MS);
      });
  }

  private debug(label: string, elapsedMs: number): void {
    if (!this.debugEnabled()) return;
    console.info("[BCXIR]", "BCX query", label, elapsedMs + "ms");
  }
}

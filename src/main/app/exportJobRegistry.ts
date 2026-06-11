interface ExportJob {
  canceled: boolean;
}

export interface ExportJobRegistry {
  start: (jobId: string) => ExportJob;
  cancel: (jobId: string) => void;
  finish: (jobId: string) => void;
}

export function createExportJobRegistry(): ExportJobRegistry {
  const jobs = new Map<string, ExportJob>();

  function start(jobId: string): ExportJob {
    const job: ExportJob = { canceled: false };
    jobs.set(jobId, job);
    return job;
  }

  function cancel(jobId: string): void {
    const job = jobs.get(jobId);

    if (job) {
      job.canceled = true;
    }
  }

  function finish(jobId: string): void {
    jobs.delete(jobId);
  }

  return { start, cancel, finish };
}

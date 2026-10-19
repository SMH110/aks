import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { exhaustMap, finalize, takeUntil, takeWhile, timer } from 'rxjs';

interface Job {
  jobId: string;
  requestedRuns: number;
  completedRuns: number;
  remainingRuns: number;
  status: 'pending' | 'partially_completed' | 'completed';
  dispatchStatus: 'dispatching' | 'queued' | 'dispatch_failed';
  results: { runId: string; runNumber: number; result: number }[];
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly runCount = signal<number | null>(3);
  readonly jobId = signal<string | null>(null);
  readonly job = signal<Job | null>(null);
  readonly starting = signal(false);
  readonly watching = signal(false);
  readonly error = signal('');
  readonly busy = computed(() => this.starting() || this.watching());
  readonly validRuns = computed(() => {
    const value = this.runCount();
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
  });

  startJob(): void {
    if (this.busy() || !this.validRuns()) return;

    this.jobId.set(null);
    this.job.set(null);
    this.error.set('');
    this.starting.set(true);

    this.http.post<{ jobId: string }>('/jobs', { runs: this.runCount() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.starting.set(false)),
      )
      .subscribe({
        next: ({ jobId }) => {
          this.jobId.set(jobId);
          this.checkProgress();
        },
        error: (error: unknown) => {
          const body: unknown = error instanceof HttpErrorResponse ? error.error : undefined;
          if (typeof body === 'object' && body !== null &&
              'jobId' in body && typeof body.jobId === 'string') {
            this.jobId.set(body.jobId);
            this.checkProgress();
            return;
          }
          this.error.set('The request failed. It may have created a job. Check the API logs before starting again.');
        },
      });
  }

  checkProgress(): void {
    const jobId = this.jobId();
    if (!jobId || this.watching()) return;

    this.error.set('');
    this.watching.set(true);

    timer(0, 1000).pipe(
      exhaustMap(() => this.http.get<Job>(`/jobs/${encodeURIComponent(jobId)}`)),
      takeWhile(job => job.status !== 'completed' && job.dispatchStatus !== 'dispatch_failed', true),
      takeUntil(timer(60_000)),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.watching.set(false)),
    ).subscribe({
      next: job => this.job.set(job),
      error: () => this.error.set('Could not read progress. Use Check progress to try again.'),
    });
  }
}

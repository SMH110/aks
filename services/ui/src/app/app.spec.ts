import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';

describe('Simulation job flow', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let http: HttpTestingController;
  const jobId = 'b6cf4f84-d2a8-4dde-8462-283dd8599cca';
  const url = `/jobs/${jobId}`;
  const pending = {
    jobId, requestedRuns: 3, completedRuns: 0, remainingRuns: 3,
    status: 'pending', dispatchStatus: 'queued', results: [],
  };
  const completed = {
    ...pending, completedRuns: 3, remainingRuns: 0, status: 'completed',
    results: [1, 2, 3].map(n => ({ runId: `${jobId}:${n}`, runNumber: n, result: n * n })),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });

  function acceptJob(): void {
    app.startJob();
    const post = http.expectOne('/jobs');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ runs: 3 });
    post.flush({ jobId });
    vi.advanceTimersByTime(0);
  }

  it('rejects invalid counts before sending a request', () => {
    for (const value of [null, 0, 2.5, 101]) {
      app.runCount.set(value);
      app.startJob();
    }
    http.expectNone('/jobs');
  });

  it('starts one job, displays results and stops polling on completion', () => {
    acceptJob();
    app.startJob();
    http.expectNone('/jobs');
    http.expectOne(url).flush(pending);
    vi.advanceTimersByTime(1000);
    http.expectOne(url).flush(completed);
    fixture.detectChanges();
    expect(app.watching()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('3 of 3');
    const rows = [...fixture.nativeElement.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.map(row => row.lastElementChild?.textContent?.trim())).toEqual(['1', '4', '9']);
    vi.advanceTimersByTime(5000);
    http.expectNone(url);
  });

  it('keeps at most one progress request in flight', () => {
    acceptJob();
    const first = http.expectOne(url);
    vi.advanceTimersByTime(4000);
    http.expectNone(url);
    first.flush(completed);
    expect(app.watching()).toBe(false);
  });

  it('stops automatically after one minute and allows checking again', () => {
    acceptJob();
    http.expectOne(url).flush(pending);
    vi.advanceTimersByTime(1000);
    const inFlight = http.expectOne(url);
    vi.advanceTimersByTime(59_000);
    expect(app.watching()).toBe(false);
    expect(inFlight.cancelled).toBe(true);
    app.checkProgress();
    vi.advanceTimersByTime(0);
    http.expectOne(url).flush(completed);
    expect(app.job()?.status).toBe('completed');
  });

  it('uses the job ID from a failed dispatch without retrying POST', () => {
    app.startJob();
    http.expectOne('/jobs').flush({ jobId }, { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(0);
    http.expectOne(url).flush({ ...pending, dispatchStatus: 'dispatch_failed' });
    fixture.detectChanges();
    expect(app.watching()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Some runs may not have been queued');
    vi.advanceTimersByTime(3000);
    http.expectNone('/jobs');
    http.expectNone(url);
  });

  it('reports an uncertain start without automatically creating another job', () => {
    app.startJob();
    http.expectOne('/jobs').flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(app.starting()).toBe(false);
    expect(app.error()).toContain('may have created a job');
    vi.advanceTimersByTime(5000);
    http.expectNone(() => true);
  });

  it('keeps the job ID after a read failure so progress can be checked again', () => {
    acceptJob();
    http.expectOne(url).flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(app.watching()).toBe(false);
    expect(app.jobId()).toBe(jobId);
    app.checkProgress();
    vi.advanceTimersByTime(0);
    http.expectOne(url).flush(completed);
    expect(app.error()).toBe('');
  });

  it('cancels outstanding HTTP requests when the component is destroyed', () => {
    acceptJob();
    const request = http.expectOne(url);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    vi.advanceTimersByTime(5000);
    http.expectNone(url);
  });
});

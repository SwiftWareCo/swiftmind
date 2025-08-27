# Knowledge Background Processing — Scalable Document Ingestion Queue

## Overview
Future enhancement to implement asynchronous background processing for large document upload batches (6+ files) without requiring users to keep the browser tab open. This builds on the foundation established in `knowledge-upload-improvements.md`.

## Problem Statement
Current system limitations for large batch uploads:
- Users must stay on page during upload (poor UX for 10+ files)
- Large batches can take 10+ minutes to process
- No resumability if browser is closed or network fails
- Server actions timeout on large batches (Vercel hobby plan limitations)
- No scalability for enterprise use cases (50+ files)

## Architecture Design

### **Queue-Based Processing**
```typescript
// Upload flow for 6+ files:
1. Client uploads files to Supabase Storage (immediate)
2. Create kb_ingest_jobs with status='pending'
3. Return success to user (can navigate away)
4. Background worker picks up pending jobs
5. Process in small batches (2-3 concurrent)
6. Update progress in real-time
7. Notify user on completion
```

### **Background Worker Options**

#### **Option A: Vercel Cron Jobs**
```typescript
// /api/cron/process-queue
export async function GET() {
  const pendingJobs = await getPendingJobs();
  await processBatch(pendingJobs.slice(0, 3)); // Max 3 concurrent
  return Response.json({ processed: 3 });
}
```

**Pros:**
- Built into Vercel platform
- Simple deployment
- Good for hobby/pro plans

**Cons:**
- Limited execution time
- Fixed schedule, not event-driven
- Scaling limitations

#### **Option B: External Queue Service**
```typescript
// Using BullMQ + Redis or similar
const queue = new Queue('document-processing');

queue.add('process-document', {
  jobId: 'uuid',
  tenantId: 'uuid',
  storagePath: 'path/to/file'
});
```

**Pros:**
- Purpose-built for queues
- Event-driven processing
- Better scaling and reliability
- Retry mechanisms built-in

**Cons:**
- Additional infrastructure
- More complex deployment
- Higher costs

#### **Option C: Supabase Functions + Database Triggers**
```sql
-- Trigger on kb_ingest_jobs insert
CREATE OR REPLACE FUNCTION notify_new_job()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('new_job', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Pros:**
- Leverages existing Supabase infrastructure
- Event-driven via database triggers
- Good integration with RLS

**Cons:**
- Limited by Supabase Functions constraints
- Potential cold start issues

### **Recommended Architecture: Hybrid Approach**

```typescript
// Phase 1: Vercel Cron (Simple)
- Cron job every 30 seconds
- Process up to 3 jobs per run
- Good for initial implementation

// Phase 2: External Queue (Scale)
- Move to BullMQ + Redis when needed
- Event-driven processing
- Better monitoring and retries
```

## Technical Implementation

### **Database Schema Extensions**

```sql
-- Add queue management fields
ALTER TABLE kb_ingest_jobs 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- Create job queue coordination table
CREATE TABLE IF NOT EXISTS job_queue_locks (
  worker_id TEXT PRIMARY KEY,
  job_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

-- Indexes for efficient job polling
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_queue 
ON kb_ingest_jobs(tenant_id, status, priority DESC, scheduled_at ASC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_worker 
ON kb_ingest_jobs(worker_id, started_at) 
WHERE status = 'processing';
```

### **Background Worker Implementation**

```typescript
// server/workers/document-processor.ts
export async function processDocumentQueue() {
  const workerId = `worker-${Date.now()}-${Math.random()}`;
  
  try {
    // Acquire jobs with distributed locking
    const jobs = await acquireJobs(workerId, 3);
    
    // Process jobs in parallel
    await Promise.allSettled(
      jobs.map(job => processJob(job, workerId))
    );
    
  } finally {
    await releaseWorkerLocks(workerId);
  }
}

async function processJob(job: IngestJob, workerId: string) {
  try {
    // Mark job as started
    await updateJobStatus(job.id, 'processing', { 
      worker_id: workerId,
      started_at: new Date()
    });
    
    // Download file from storage
    const fileBuffer = await downloadFromStorage(job.storage_path);
    
    // Process using existing ingestion pipeline
    await processFileBuffer(job, fileBuffer);
    
    // Mark as completed
    await updateJobStatus(job.id, 'done', {
      completed_at: new Date()
    });
    
  } catch (error) {
    await handleJobError(job, error);
  }
}
```

### **Queue Management Functions**

```typescript
// server/queue/queue-manager.ts
export async function acquireJobs(workerId: string, limit: number): Promise<IngestJob[]> {
  // Use advisory locks to prevent race conditions
  const jobs = await supabase.rpc('acquire_pending_jobs', {
    worker_id: workerId,
    job_limit: limit
  });
  
  return jobs;
}

export async function handleJobError(job: IngestJob, error: Error) {
  const retryCount = job.retry_count + 1;
  
  if (retryCount <= job.max_retries) {
    // Schedule retry with exponential backoff
    const retryDelay = Math.pow(2, retryCount) * 60; // 2^n minutes
    await scheduleRetry(job.id, retryDelay);
  } else {
    // Mark as failed permanently
    await updateJobStatus(job.id, 'error', {
      error: error.message,
      retry_count: retryCount
    });
  }
}
```

### **Real-Time Progress Updates**

```typescript
// Option A: Polling (Simple)
// Client polls job status every 2 seconds
const { data } = useQuery(['job-progress', jobIds], {
  queryFn: () => getJobsProgress(jobIds),
  refetchInterval: 2000,
  enabled: hasActiveJobs
});

// Option B: WebSocket/Server-Sent Events (Advanced)
// Real-time updates via Supabase Realtime
const subscription = supabase
  .channel('job-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'kb_ingest_jobs',
    filter: `tenant_id=eq.${tenantId}`
  }, (payload) => {
    updateJobProgress(payload.new);
  })
  .subscribe();
```

### **User Notification System**

```typescript
// Email notifications for batch completion
export async function notifyBatchComplete(
  tenantId: string, 
  userId: string, 
  batchStats: BatchStats
) {
  const template = {
    subject: `Document processing complete: ${batchStats.successful} files processed`,
    body: `
      Your batch of ${batchStats.total} documents has finished processing:
      ✅ ${batchStats.successful} successful
      ❌ ${batchStats.failed} failed
      
      View results: ${getAppUrl(tenantId)}/knowledge
    `
  };
  
  await sendNotificationEmail(userId, template);
}

// In-app notifications via toast
export function useJobNotifications(tenantId: string) {
  useEffect(() => {
    const subscription = supabase
      .channel('job-notifications')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public', 
        table: 'kb_ingest_jobs',
        filter: `tenant_id=eq.${tenantId}`
      }, (payload) => {
        if (payload.new.status === 'done') {
          toast.success(`✅ ${payload.new.filename} processed successfully`);
        } else if (payload.new.status === 'error') {
          toast.error(`❌ ${payload.new.filename} failed: ${payload.new.error}`);
        }
      })
      .subscribe();
      
    return () => subscription.unsubscribe();
  }, [tenantId]);
}
```

## User Experience Design

### **Upload Flow Enhancement**

```typescript
// Enhanced upload component for large batches
export function BackgroundUploadComponent({ files }: { files: File[] }) {
  const isLargeBatch = files.length > 5;
  
  if (isLargeBatch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🚀 Background Processing</CardTitle>
          <CardDescription>
            Your {files.length} files will be processed in the background. 
            You can safely navigate away or close this tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={uploadProgress} />
          <p>Uploading files to queue... {uploadedCount}/{files.length}</p>
          
          <div className="mt-4">
            <Badge variant="outline">📧 Email notification enabled</Badge>
            <Badge variant="outline">🔄 Auto-retry on failure</Badge>
            <Badge variant="outline">📊 Progress tracking</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Small batch - use existing immediate processing
  return <ImmediateUploadComponent files={files} />;
}
```

### **Background Job Dashboard**

```typescript
// New page: /knowledge/jobs
export function JobsDashboard() {
  const { data: jobs } = useQuery(['background-jobs'], getBackgroundJobs);
  
  return (
    <div>
      <h1>Background Processing</h1>
      
      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Currently Processing ({activeJobs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeJobs.map(job => (
            <JobProgressCard key={job.id} job={job} />
          ))}
        </CardContent>
      </Card>
      
      {/* Job History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <JobHistoryTable jobs={recentJobs} />
        </CardContent>
      </Card>
    </div>
  );
}
```

## Implementation Phases

### **Phase 1: Foundation (Current)**
- ✅ File storage integration
- ✅ Enhanced job tracking
- ✅ Hybrid approach logic
- ✅ Progress tracking improvements

### **Phase 2: Basic Background Processing**
- [ ] Vercel cron job implementation
- [ ] Job acquisition and locking
- [ ] Worker retry logic
- [ ] Basic progress updates

### **Phase 3: Enhanced UX**
- [ ] Real-time progress via WebSocket
- [ ] Email notifications
- [ ] Background jobs dashboard
- [ ] Batch management UI

### **Phase 4: Production Scale**
- [ ] External queue service integration
- [ ] Advanced monitoring and alerting
- [ ] Performance optimization
- [ ] Enterprise features (priority queues, etc.)

## Technical Considerations

### **Concurrency Control**
```sql
-- Prevent worker conflicts with advisory locks
SELECT pg_advisory_lock(hashtext(job_id::text)) 
WHERE status = 'pending';
```

### **Error Recovery**
```typescript
// Graceful worker shutdown
process.on('SIGTERM', async () => {
  console.log('Worker shutting down gracefully...');
  await finishCurrentJobs();
  await releaseAllLocks();
  process.exit(0);
});

// Dead letter queue for persistent failures
async function moveToDeadLetter(job: IngestJob) {
  await insertDeadLetterJob(job, {
    reason: 'Max retries exceeded',
    last_error: job.error,
    failed_at: new Date()
  });
}
```

### **Monitoring & Observability**
```typescript
// Job queue metrics
export interface QueueMetrics {
  pending_jobs: number;
  active_workers: number;
  avg_processing_time: number;
  error_rate: number;
  throughput_per_hour: number;
}

// Health check endpoint
export async function getQueueHealth(): Promise<QueueHealth> {
  return {
    status: 'healthy',
    metrics: await calculateQueueMetrics(),
    workers: await getActiveWorkers(),
    last_processed: await getLastProcessedTime()
  };
}
```

## Cost Analysis

### **Vercel Cron Approach**
- **Pro Plan**: 100 cron executions/day included
- **Execution time**: ~30s per batch of 3 files
- **Cost**: Minimal for small/medium usage

### **External Queue Service**
- **Redis Cloud**: ~$30/month for basic tier
- **Railway/Render**: ~$20/month for worker dyno
- **Total**: ~$50/month for dedicated queue infrastructure

### **Storage Costs**
- **Supabase Free**: 1GB storage
- **Supabase Pro**: $0.021/GB/month beyond 8GB
- **File retention**: 7 days reduces long-term costs

## Security Considerations

### **Worker Authentication**
```typescript
// Workers use service role for bypassing RLS
const adminClient = createServiceRoleClient();

// Validate tenant access before processing
async function validateJobAccess(job: IngestJob, workerId: string) {
  // Ensure job belongs to valid tenant
  // Verify worker has permission to process
  // Check file storage access
}
```

### **File Access Control**
```typescript
// Signed URLs for secure file access
async function getSecureFileUrl(storagePath: string, tenantId: string) {
  return supabase.storage
    .from('knowledge-files')
    .createSignedUrl(storagePath, 3600); // 1 hour expiry
}
```

## Testing Strategy

### **Unit Tests**
- Job acquisition logic
- Retry mechanisms
- Error handling
- Progress tracking

### **Integration Tests**
- End-to-end queue processing
- Worker coordination
- Database consistency
- File storage operations

### **Load Tests**
- 100+ concurrent jobs
- Worker scaling behavior
- Database performance under load
- Storage throughput limits

### **Failure Tests**
- Worker crashes during processing
- Database connection failures
- Storage service outages
- Network interruptions

## Rollout Plan

### **Gradual Deployment**
1. **Internal testing**: Process small batches in background
2. **Beta users**: Opt-in background processing for power users
3. **Feature flag**: Gradual rollout based on tenant size
4. **Full deployment**: Replace immediate processing for 6+ files

### **Rollback Strategy**
- Feature flag to disable background processing
- Fallback to immediate processing for all files
- Database rollback scripts for schema changes
- Worker shutdown procedures

### **Success Metrics**
- User retention during large uploads (should increase)
- Time spent on upload page (should decrease)
- Upload completion rates (should improve)
- User satisfaction scores

## Future Enhancements

### **Advanced Features**
- **Priority queues**: VIP customers get faster processing
- **Batch optimization**: Combine similar files for efficiency
- **Smart scheduling**: Process during off-peak hours
- **Multi-region workers**: Reduce latency for global users

### **Enterprise Features**
- **Dedicated workers**: Isolated processing for large customers
- **SLA guarantees**: Processing time commitments
- **Advanced monitoring**: Detailed analytics and reporting
- **Custom retention policies**: Per-tenant file lifecycle management

This background processing system will transform the upload experience from a blocking operation to a seamless, scalable service that handles enterprise-level document ingestion while maintaining the simplicity of the current system for small uploads.

"use server";

import "server-only";
import { createClient } from "@/server/supabase/server";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";

/**
 * Cleanup abandoned CSV files that have been pending configuration for too long
 * This helps manage storage usage on the free tier
 */
export async function cleanupAbandonedCsvFiles(): Promise<{ ok: boolean; cleaned: number; error?: string }> {
  console.log("🧹 cleanupAbandonedCsvFiles: Starting cleanup of abandoned CSV files");
  
  const supabase = await createClient();
  
  // Auth and tenant validation
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, cleaned: 0, error: "Authentication error" };
  if (!userData.user) return { ok: false, cleaned: 0, error: "User not authenticated" };

  const slug = await getTenantSlug();
  if (!slug) return { ok: false, cleaned: 0, error: "Tenant not found" };
  
  let tenantId: string;
  try {
    const tenant = await getTenantBySlug(slug);
    tenantId = tenant.id;
  } catch {
    return { ok: false, cleaned: 0, error: "Tenant not found" };
  }

  // Permission check
  try {
    await requirePermission(tenantId, "kb.csv.write");
  } catch {
    return { ok: false, cleaned: 0, error: "Insufficient permissions" };
  }

  try {
    // Find datasets that have been pending for more than 24 hours
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    
    const { data: abandonedDatasets, error: queryErr } = await supabase
      .from("tabular_datasets")
      .select("id, title, settings")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("created_at", cutoffTime.toISOString());

    if (queryErr) {
      console.error("Failed to query abandoned datasets:", queryErr);
      return { ok: false, cleaned: 0, error: queryErr.message };
    }

    if (!abandonedDatasets || abandonedDatasets.length === 0) {
      console.log("✅ cleanupAbandonedCsvFiles: No abandoned files found");
      return { ok: true, cleaned: 0 };
    }

    let cleanedCount = 0;
    const storagePathsToDelete: string[] = [];

    // Collect storage paths and delete dataset records
    for (const dataset of abandonedDatasets) {
      const settings = dataset.settings as Record<string, unknown>;
      const storagePath = settings?.storagePath as string;
      
      if (storagePath) {
        storagePathsToDelete.push(storagePath);
      }

      // Delete dataset record (this will cascade to columns via foreign key)
      const { error: deleteErr } = await supabase
        .from("tabular_datasets")
        .delete()
        .eq("id", dataset.id)
        .eq("tenant_id", tenantId);

      if (deleteErr) {
        console.error(`Failed to delete abandoned dataset ${dataset.id}:`, deleteErr);
      } else {
        cleanedCount++;
        console.log(`🗑️ cleanupAbandonedCsvFiles: Deleted abandoned dataset: ${dataset.title}`);
      }
    }

    // Clean up storage files in batch
    if (storagePathsToDelete.length > 0) {
      console.log(`🗑️ cleanupAbandonedCsvFiles: Cleaning up ${storagePathsToDelete.length} storage files`);
      const { error: storageDeleteErr } = await supabase.storage
        .from('uploads')
        .remove(storagePathsToDelete);

      if (storageDeleteErr) {
        console.error('Batch storage cleanup failed:', storageDeleteErr);
        // Don't fail the operation for storage cleanup errors
      } else {
        console.log(`✅ cleanupAbandonedCsvFiles: Storage files cleaned up successfully`);
      }
    }

    // Audit log
    if (cleanedCount > 0) {
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: userData.user.id,
        action: "kb.csv.cleanup",
        resource: "system",
        meta: {
          cleaned_datasets: cleanedCount,
          cleaned_files: storagePathsToDelete.length
        }
      });
    }

    console.log(`✅ cleanupAbandonedCsvFiles: Cleaned up ${cleanedCount} abandoned datasets`);
    return { ok: true, cleaned: cleanedCount };

  } catch (error) {
    console.error("cleanupAbandonedCsvFiles error:", error);
    return { 
      ok: false, 
      cleaned: 0,
      error: error instanceof Error ? error.message : "Cleanup failed" 
    };
  }
}

/**
 * Manual trigger for cleanup - can be called from admin interface
 */
export async function triggerCsvCleanup(): Promise<{ ok: boolean; message: string }> {
  const result = await cleanupAbandonedCsvFiles();
  
  if (result.ok) {
    return {
      ok: true,
      message: result.cleaned > 0 
        ? `Cleaned up ${result.cleaned} abandoned CSV files`
        : "No abandoned files found"
    };
  } else {
    return {
      ok: false,
      message: result.error || "Cleanup failed"
    };
  }
}

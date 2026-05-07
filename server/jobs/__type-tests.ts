/**
 * Type safety verification tests for withJob utility.
 * This file is NOT executed - it's only for TypeScript compilation checks.
 *
 * Run: npx tsc --noEmit server/jobs/__type-tests.ts
 *
 * If this file compiles without errors, type safety is working correctly.
 */

import { withJob } from '../utils/withJob';

// ============================================================================
// TEST 1: Correct usage should compile without errors
// ============================================================================

async function test_correct_usage() {
  // ✅ Should work: correct payload structure
  await withJob('brainlift:generate-image')
    .forPayload({
      brainliftId: 123,
    })
    .queue();

  // ✅ Should work: with scheduleFor
  await withJob('brainlift:generate-image')
    .forPayload({ brainliftId: 123 })
    .scheduleFor(new Date());

  // ✅ Should work: with queueWith
  await withJob('brainlift:generate-image')
    .forPayload({ brainliftId: 123 })
    .queueWith({ priority: -10 });
}

// ============================================================================
// TEST 2: Incorrect usage should cause TypeScript errors
// ============================================================================

async function test_type_errors() {
  // ❌ Should error: missing required field 'brainliftId'
  await withJob('brainlift:generate-image')
    // @ts-expect-error
    .forPayload({
    })
    .queue();

  // ❌ Should error: wrong field name
  await withJob('brainlift:generate-image')
    .forPayload({
      // @ts-expect-error
      id: 123, // should be 'brainliftId'
    })
    .queue();

  // ❌ Should error: wrong type for 'brainliftId'
  await withJob('brainlift:generate-image')
    .forPayload({
      // @ts-expect-error
      brainliftId: '123', // should be number, not string
    })
    .queue();

  // ❌ Should error: extra unexpected field
  await withJob('brainlift:generate-image')
    .forPayload({
      brainliftId: 123,
      // @ts-expect-error
      extra: 'field', // not in payload type
    })
    .queue();

  // ❌ Should error: invalid job name
  // @ts-expect-error
  await withJob('nonexistent:job')
    .forPayload({ anything: 'here' })
    .queue();
}

// ============================================================================
// TEST 3: Type inference verification
// ============================================================================

async function test_type_inference() {
  // Test that the payload type is correctly inferred
  const job = withJob('brainlift:generate-image');

  // This should show autocomplete for 'brainliftId' in your IDE
  const result = job.forPayload({
    brainliftId: 123,
  });

  // Verify return type is correct
  const jobId: string = await result.queue();
  const jobId2: string = await result.scheduleFor(new Date());
  const jobId3: string = await result.queueWith({ priority: 0 });

  // ❌ Should error: return type is string, not number
  // @ts-expect-error
  const wrongType: number = await result.queue();
}

// ============================================================================
// TEST 4: Job name autocomplete verification
// ============================================================================

async function test_job_name_autocomplete() {
  // When you type withJob('..., your IDE should show:
  // - registered task names from tasks.ts

  await withJob('brainlift:generate-image').forPayload({ brainliftId: 123 }).queue();

  // Future jobs would appear here when added to tasks.ts:
  // await withJob('brainlift:import').forPayload({ ... }).queue();
  // await withJob('brainlift:verify-all').forPayload({ ... }).queue();
}

// ============================================================================
// VERIFICATION CHECKLIST
// ============================================================================

/**
 * To verify type safety is working:
 *
 * 1. Run: npx tsc --noEmit server/jobs/__type-tests.ts
 *    - Should show errors ONLY on lines marked with @ts-expect-error
 *    - If no errors at all: @ts-expect-error directives are failing
 *    - If errors on unmarked lines: type system is broken
 *
 * 2. Open this file in VS Code
 *    - Hover over withJob('brainlift:generate-image') -> should show job name type
 *    - Hover over .forPayload({ ... }) -> should show payload type
 *    - Type withJob(' -> should see registered task names in autocomplete
 *    - In forPayload, type { and press Ctrl+Space -> should see 'brainliftId'
 *
 * 3. Remove a @ts-expect-error and check if TypeScript complains
 *    - If it does: type checking is working!
 *    - If it doesn't: type checking is broken
 *
 * Expected TypeScript errors when @ts-expect-error is removed:
 * - test_type_errors line 1: Property 'brainliftId' is missing
 * - test_type_errors line 2: Object literal may only specify known properties
 * - test_type_errors line 3: Type 'string' is not assignable to type 'number'
 * - test_type_errors line 4: Object literal may only specify known properties
 * - test_type_errors line 5: Type '"nonexistent:job"' is not assignable to parameter
 * - test_type_inference line 1: Type 'string' is not assignable to type 'number'
 */

export {};

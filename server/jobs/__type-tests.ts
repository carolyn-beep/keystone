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
  await withJob('example:hello')
    .forPayload({
      name: 'Alice',
      delay: 1000,
    })
    .queue();

  // ✅ Should work: optional field omitted
  await withJob('example:hello')
    .forPayload({
      name: 'Bob',
    })
    .queue();

  // ✅ Should work: with scheduleFor
  await withJob('example:hello')
    .forPayload({ name: 'Charlie' })
    .scheduleFor(new Date());

  // ✅ Should work: with queueWith
  await withJob('example:hello')
    .forPayload({ name: 'Dave' })
    .queueWith({ priority: -10 });
}

// ============================================================================
// TEST 2: Incorrect usage should cause TypeScript errors
// ============================================================================

async function test_type_errors() {
  // ❌ Should error: missing required field 'name'
  // @ts-expect-error
  await withJob('example:hello')
    .forPayload({
      delay: 1000,
    })
    .queue();

  // ❌ Should error: wrong field name
  // @ts-expect-error
  await withJob('example:hello')
    .forPayload({
      username: 'Alice', // should be 'name'
      delay: 1000,
    })
    .queue();

  // ❌ Should error: wrong type for 'delay'
  // @ts-expect-error
  await withJob('example:hello')
    .forPayload({
      name: 'Alice',
      delay: '1000', // should be number, not string
    })
    .queue();

  // ❌ Should error: extra unexpected field
  // @ts-expect-error
  await withJob('example:hello')
    .forPayload({
      name: 'Alice',
      delay: 1000,
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
  const job = withJob('example:hello');

  // This should show autocomplete for 'name' and 'delay' in your IDE
  const result = job.forPayload({
    name: 'Test',
    delay: 500,
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
  // - 'example:hello'
  // And nothing else (since that's the only registered job)

  await withJob('example:hello').forPayload({ name: 'Test' }).queue();

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
 *    - Hover over withJob('example:hello') -> should show job name type
 *    - Hover over .forPayload({ ... }) -> should show payload type
 *    - Type withJob(' -> should see 'example:hello' in autocomplete
 *    - In forPayload, type { and press Ctrl+Space -> should see 'name' and 'delay'
 *
 * 3. Remove a @ts-expect-error and check if TypeScript complains
 *    - If it does: type checking is working!
 *    - If it doesn't: type checking is broken
 *
 * Expected TypeScript errors when @ts-expect-error is removed:
 * - test_type_errors line 1: Property 'name' is missing
 * - test_type_errors line 2: Object literal may only specify known properties
 * - test_type_errors line 3: Type 'string' is not assignable to type 'number'
 * - test_type_errors line 4: Object literal may only specify known properties
 * - test_type_errors line 5: Type '"nonexistent:job"' is not assignable to parameter
 * - test_type_inference line 1: Type 'string' is not assignable to type 'number'
 */

export {};

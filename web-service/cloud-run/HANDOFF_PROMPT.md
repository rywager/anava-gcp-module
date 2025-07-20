# Prompt for Implementing Session Management Redesign

## Context
You are working on the batonDescribe application in the ~/batonDescribe directory. There's a critical bug where active monitoring sessions aren't being properly terminated when Object Analytics triggers go inactive. The root cause is a mismatch in session identification and complex multiplexing of multiple profiles in a single event callback.

## Your Task
Implement a complete redesign of the session management system based on the attached design document (HANDOFF_SESSION_MANAGEMENT_REDESIGN.md). The key change is moving from one subscription handling multiple profiles to one subscription per profile.

## Current Problem Evidence
```
2025-07-11T00:20:56.559-05:00 axis-b8a44f45d624 [ INFO    ] BatonAnalytic[626243]: ⚡ TERMINATION DEBUG: Looking for sessions with prefix 'Object_Device1Scenario1'
2025-07-11T00:20:56.559-05:00 axis-b8a44f45d624 [ INFO    ] BatonAnalytic[626243]: ⚡ TERMINATION DEBUG: Current sessions in map (0 total):
```

Sessions are created but not found during termination, causing active monitoring sessions to continue running.

## Implementation Requirements

### 1. Create New Structures
- Implement `ProfileSubscription` structure to track per-profile subscriptions
- Enhance `SessionContext` with proper state tracking
- Create `SessionRegistry` for proper session management

### 2. Refactor Event Handling
- Change from one callback handling multiple profiles to one callback per profile
- Each event callback should handle exactly one profile
- Simplify the callback logic - no more looping through profiles

### 3. Fix Session Tracking
- Implement proper session registry with multiple indexes (by trigger, by profile, by ID)
- Ensure sessions are properly added to the registry when created
- Clean termination when triggers go inactive

### 4. ThreadPool Integration
- Continue using the existing ThreadPool.h infrastructure
- One-shot tasks go to thread pool and complete
- Active monitoring tasks use thread pool but track the session

### 5. Key Functions to Implement
- `setupProfileSubscriptions()` - Create individual subscriptions per profile
- `createSession()` - Properly register sessions
- `terminateProfileSessions()` - Clean termination by profile
- `removeSession()` - Proper cleanup from all indexes

## Important Considerations

1. **Thread Safety**: All session registry operations must be mutex-protected
2. **Memory Management**: Proper cleanup of ProfileSubscription on unsubscribe
3. **Backward Compatibility**: Consider migration path for existing subscriptions
4. **Debugging**: Add comprehensive logging at each step

## Testing Requirements

1. Create test case with multiple profiles (mix of one-shot and active monitoring)
2. Verify that active monitoring sessions are properly terminated
3. Ensure one-shot sessions don't interfere with termination
4. Check for memory leaks with valgrind

## Success Criteria

1. When a trigger goes inactive, all active monitoring sessions for that trigger are terminated
2. One-shot sessions complete naturally without affecting termination
3. No more "0 sessions found" when trying to terminate
4. Clean logs showing proper session lifecycle

## Files to Focus On

Look for files containing:
- Event subscription logic (EventSubscribe.h/c)
- Event callbacks (search for "eventCallback")
- Session management (search for "session" and "activeStreamingSessions")
- ThreadPool integration (ThreadPool.h/c)

## Example Test Scenario

1. Trigger 'Device1Scenario1' activates
2. Spawns 3 profiles:
   - Profile A (one-shot) - should complete quickly
   - Profile B (active monitoring) - should keep running
   - Profile C (active monitoring) - should keep running
3. Trigger 'Device1Scenario1' deactivates
4. Profiles B and C should be terminated
5. No orphaned sessions should remain

Remember: The key insight is to let the event system's natural subscription model handle the complexity instead of trying to multiplex in the callback. One profile = one subscription = simple, clean lifecycle management.
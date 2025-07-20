# Session Management Redesign - Complete Handoff Document

## Executive Summary

We've identified and designed a solution for a critical session management issue in the batonDescribe application. The current system fails to properly terminate active monitoring sessions when Object Analytics triggers go inactive because of a fundamental mismatch in how sessions are tracked and terminated.

## The Problem

### Current Issue
1. When an Object Analytics trigger (e.g., 'Device1Scenario1') activates, it spawns multiple profile sessions
2. Profiles can be either:
   - **One-shot**: Execute once and terminate immediately
   - **Active monitoring**: Continue running until explicitly stopped
3. When the trigger goes inactive, the system tries to terminate sessions but finds 0 sessions in the map
4. Active monitoring sessions continue running even after they should be stopped

### Root Cause Analysis
```
⚡ SESSION CREATE: Object Analytics trigger identifier: 'Object_Device1Scenario1'
⚡ TERMINATION DEBUG: Looking for sessions with prefix 'Object_Device1Scenario1_profile_'
⚡ TERMINATION DEBUG: Current sessions in map (0 total):
```

The mismatch occurs because:
- Sessions are created with identifier: `'Object_Device1Scenario1'`
- But termination searches for: `'Object_Device1Scenario1_profile_'`
- Additionally, one-shot sessions complete and are removed before termination occurs

## The Solution: Per-Profile Subscriptions

### Core Concept
Instead of one subscription handling multiple profiles, create **one subscription per profile**. This fundamentally simplifies the entire system.

### Architecture Change

**Before (Complex):**
```
One EventCallback → Multiple Profiles → Complex Session Management → String Prefix Searching
```

**After (Simple):**
```
One Profile = One Subscription = One EventCallback = One Session (max)
```

## Implementation Details

### 1. ProfileSubscription Structure
```c
typedef struct {
    AXEventHandler* eventHandler;
    int subscriptionId;
    char triggerId[128];      // "Object_Device1Scenario1"
    char profileId[128];      // "Profile_Greeter"
    char profileName[256];
    SessionType sessionType;  // ONE_SHOT or ACTIVE_MONITORING
    void* profileConfig;
    SessionContext* activeSession;  // NULL or one active session
    pthread_mutex_t lock;
} ProfileSubscription;
```

### 2. Session Context Enhancement
```c
typedef enum {
    SESSION_TYPE_ONE_SHOT,
    SESSION_TYPE_ACTIVE_MONITORING
} SessionType;

typedef enum {
    SESSION_STATE_STARTING,
    SESSION_STATE_RUNNING,
    SESSION_STATE_COMPLETING,
    SESSION_STATE_TERMINATED
} SessionState;

typedef struct {
    char sessionId[256];
    char triggerId[128];
    char profileId[128];
    char profileName[256];
    SessionType type;
    SessionState state;
    time_t startTime;
    pthread_t threadId;
    bool stopRequested;
    void* userData;
} SessionContext;
```

### 3. Session Registry (Proper Tracking)
```c
typedef struct {
    GHashTable* sessionsByTrigger;  // triggerId -> GList* of SessionContext*
    GHashTable* sessionsById;       // sessionId -> SessionContext*
    GHashTable* sessionsByProfile;  // profileId -> GList* of SessionContext*
    pthread_mutex_t lock;
    int totalSessionCount;
} SessionRegistry;
```

### 4. Simplified Event Callback
```c
void eventCallback(AXEventHandler* handler, AXEvent* event, void* userData) {
    ProfileSubscription* sub = (ProfileSubscription*)userData;
    int active = getEventActive(event);
    
    if (active) {
        pthread_mutex_lock(&sub->lock);
        
        // For active monitoring, only one session at a time
        if (sub->sessionType == SESSION_TYPE_ACTIVE_MONITORING && sub->activeSession) {
            syslog(LOG_INFO, "Profile %s already has active session", sub->profileId);
            pthread_mutex_unlock(&sub->lock);
            return;
        }
        
        // Create ONE session for THIS profile
        SessionContext* ctx = createSession(sub->triggerId, sub->profileId, 
                                          sub->profileName, sub->sessionType);
        
        if (sub->sessionType == SESSION_TYPE_ACTIVE_MONITORING) {
            sub->activeSession = ctx;
        }
        
        pthread_mutex_unlock(&sub->lock);
        
        // Submit to existing ThreadPool
        ThreadPoolTask task = {
            .function = (sub->sessionType == SESSION_TYPE_ONE_SHOT) ? runOneShot : runActiveMonitoring,
            .arg = ctx,
            .name = ctx->sessionId
        };
        threadPoolSubmit(&g_threadPool, &task);
        
    } else {
        // Terminate only this profile's active monitoring session
        if (sub->sessionType == SESSION_TYPE_ACTIVE_MONITORING && sub->activeSession) {
            sub->activeSession->stopRequested = true;
            syslog(LOG_INFO, "⚡ TERMINATED: Profile session %s", sub->activeSession->sessionId);
            sub->activeSession = NULL;
        }
    }
}
```

### 5. Setup Individual Subscriptions
```c
void setupProfileSubscriptions(const char* triggerId, ProfileList* profiles) {
    for (int i = 0; i < profiles->count; i++) {
        Profile* profile = &profiles->items[i];
        
        // Check if already subscribed
        char subKey[256];
        snprintf(subKey, sizeof(subKey), "%s_%s", triggerId, profile->id);
        
        if (g_hash_table_lookup(g_profileSubscriptions, subKey)) {
            syslog(LOG_WARNING, "Profile %s already subscribed to %s", 
                   profile->id, triggerId);
            continue;
        }
        
        ProfileSubscription* sub = calloc(1, sizeof(ProfileSubscription));
        strncpy(sub->triggerId, triggerId, sizeof(sub->triggerId) - 1);
        strncpy(sub->profileId, profile->id, sizeof(sub->profileId) - 1);
        strncpy(sub->profileName, profile->name, sizeof(sub->profileName) - 1);
        sub->sessionType = profile->isActiveMonitoring ? SESSION_TYPE_ACTIVE_MONITORING : SESSION_TYPE_ONE_SHOT;
        sub->profileConfig = profile->config;
        pthread_mutex_init(&sub->lock, NULL);
        
        // Subscribe with profile-specific callback
        int token = axEventSubscribe(eventHandler, eventCallback, sub, &sub->subscriptionId);
        
        // Store subscription
        g_hash_table_insert(g_profileSubscriptions, g_strdup(subKey), sub);
        
        syslog(LOG_INFO, "✅ SUBSCRIBED: Profile '%s' to trigger '%s' (subscription: %d)",
               profile->name, triggerId, sub->subscriptionId);
    }
}
```

## Key Benefits

1. **Eliminates String Prefix Searching**: Direct references instead of error-prone string matching
2. **Natural Session Lifecycle**: Each profile owns its session
3. **Prevents Double-Firing**: One subscription per profile
4. **Simplified Threading**: One callback = one session max
5. **Clean Termination**: Each profile gets its own deactivation event
6. **Better Debugging**: Clear 1:1 relationships

## Integration Notes

1. **Existing ThreadPool**: Continue using the existing ThreadPool.h infrastructure
2. **Backward Compatibility**: May need to migrate existing subscriptions
3. **Memory Management**: Each ProfileSubscription needs proper cleanup on unsubscribe

## Testing Strategy

1. **Unit Tests**:
   - Test individual profile subscription
   - Test session creation/termination
   - Test concurrent profile execution

2. **Integration Tests**:
   - Multiple profiles with mixed types (one-shot + active monitoring)
   - Rapid activation/deactivation cycles
   - Memory leak testing with valgrind

3. **Edge Cases**:
   - Double subscription attempts
   - Termination during session startup
   - ThreadPool saturation

## Migration Steps

1. **Phase 1**: Implement ProfileSubscription structure
2. **Phase 2**: Create per-profile subscription logic
3. **Phase 3**: Update session registry
4. **Phase 4**: Migrate existing callbacks
5. **Phase 5**: Remove old string-based searching
6. **Phase 6**: Comprehensive testing

## Critical Code Locations to Update

1. Event subscription setup code
2. Event callback handlers
3. Session management/tracking
4. Termination logic
5. ThreadPool integration points

## Summary

This redesign solves the fundamental issue by ensuring each profile has its own subscription and lifecycle management. No more complex string matching, no more missed terminations, and much cleaner code overall.

The key insight: **Let the event system's natural subscription model handle the complexity instead of trying to multiplex in the callback.**
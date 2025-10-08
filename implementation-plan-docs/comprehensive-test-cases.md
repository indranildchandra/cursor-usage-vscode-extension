# Comprehensive Test Cases

## Retry Mechanism Tests

1. **Retry Success Test**
   - Mock API to fail first 2 attempts, succeed on 3rd
   - Verify `withRetry` returns successful result after retries
   - Verify retry delays are applied correctly (100ms between attempts)
   - Verify timeout per attempt (10s) is enforced

2. **Retry Failure Test**
   - Mock API to fail all 3 attempts
   - Verify `withRetry` throws error after all retries exhausted
   - Verify appropriate error logging at each attempt
   - Verify total execution time is approximately 20.2s (10s + 0.1s + 0.1s)

3. **Retry Timeout Test**
   - Mock API to hang indefinitely
   - Verify `withRetry` throws timeout error after 10s per attempt
   - Verify Promise.race correctly cancels hanging request

4. **Retry Configuration Test**
   - Test custom retry parameters (different delays, attempts, timeouts)
   - Verify default parameters work correctly
   - Verify invalid parameters are handled gracefully

## Caching Mechanism Tests

5. **Cache Hit Test**
   - Set cache with valid data and recent timestamp
   - Call cached function and verify it returns cached data
   - Verify no API call is made
   - Verify cache hit is logged

6. **Cache Miss Test**
   - Clear cache or set expired cache
   - Call cached function and verify API call is made
   - Verify fresh data is returned and cached
   - Verify cache miss is logged

7. **Cache Expiration Test**
   - Set cache with data older than 24 hours
   - Call cached function and verify cache is cleared and fresh API call made
   - Verify expired cache removal is logged

8. **Cache Persistence Test**
   - Set cache data
   - Simulate VS Code restart (new context)
   - Verify cache persists across sessions via globalState
   - Verify cache validity is checked on new session

## Cache Invalidation Tests

9. **Cookie Change Detection Test**
   - Set initial cache with cookie hash
   - Change cookie in secrets
   - Call `checkAndClearCacheOnAuthChange`
   - Verify all caches are cleared
   - Verify new cookie hash is stored

10. **Team ID Change Detection Test**
    - Set initial cache with team ID
    - Change team ID in settings
    - Call cache invalidation logic
    - Verify team-related caches are cleared
    - Verify new team ID is stored

11. **Manual Cache Clear Test**
    - Set multiple caches
    - Call `forceRefresh` command
    - Verify all caches are cleared
    - Verify cache clearing is logged

12. **Cookie Update Cache Clear Test**
    - Set caches with existing cookie
    - Update cookie via `insertCookie` command
    - Verify all caches are cleared during cookie update
    - Verify new cookie hash is computed and stored

## Mixed Scenario Tests

13. **Partial Cache Hit Test**
    - Cache user data but not team data
    - Call refresh function
    - Verify user data comes from cache
    - Verify team data triggers fresh API call
    - Verify both results are properly combined

14. **Cache Fallback on API Failure Test**
    - Set valid cache
    - Mock API to fail on fresh calls
    - Call refresh function
    - Verify cached data is used as fallback
    - Verify failure is logged but doesn't crash

15. **Cache Invalidation Race Condition Test**
    - Set cache and trigger invalidation simultaneously
    - Verify cache invalidation completes cleanly
    - Verify no stale data is served after invalidation
    - Verify concurrent access is handled safely

## Notification Integration Tests

16. **Notification with Cached Data Test**
    - Set valid cache data
    - Trigger notification
    - Verify notification uses cached data
    - Verify notification content is correct
    - Verify attempt counter increments

17. **Notification with Cache Miss Test**
    - Clear cache
    - Trigger notification
    - Verify fresh API calls are made
    - Verify notification uses fresh data
    - Verify cache is populated after successful calls

18. **Notification Blocking with Cached Failure Test**
    - Set cache with stale/failed data
    - Trigger notification
    - Verify notification is blocked
    - Verify attempt counter still increments
    - Verify appropriate error logging

## Performance and Edge Case Tests

19. **Cache Size and Performance Test**
    - Populate cache with large datasets
    - Verify cache operations remain performant
    - Verify memory usage is reasonable
    - Verify cache doesn't grow unbounded

20. **Concurrent Cache Access Test**
    - Trigger multiple simultaneous cache operations
    - Verify thread safety and data consistency
    - Verify no race conditions or data corruption
    - Verify all operations complete successfully

21. **Cache Corruption Recovery Test**
    - Corrupt cache data in globalState
    - Trigger cache operation
    - Verify corrupted cache is detected and cleared
    - Verify fallback to fresh API calls
    - Verify recovery is logged

22. **Network Interruption Test**
    - Set valid cache
    - Simulate network failure during cache miss
    - Verify cached data is used as fallback
    - Verify failure is handled gracefully
    - Verify user experience is not disrupted

## Status Bar Timestamp Tests

26. **Timestamp Tracking Test**
    - Update status bar with valid data
    - Verify timestamp is recorded when status bar is updated
    - Verify timestamp is a valid Date object
    - Verify timestamp reflects current time

27. **Timestamp Display Test**
    - Update status bar and trigger tooltip display
    - Verify tooltip contains "Last updated at: [timestamp]" format
    - Verify timestamp is formatted in local time format
    - Verify "Click to refresh" text follows timestamp

28. **Timestamp in Error State Test**
    - Trigger status bar error state
    - Verify timestamp is recorded during error state
    - Verify tooltip shows "Error occurred at: [timestamp]"
    - Verify error message includes timestamp

29. **Timestamp in Warning State Test**
    - Trigger status bar warning state
    - Verify timestamp is recorded during warning state
    - Verify tooltip shows "Warning set at: [timestamp]"
    - Verify warning message includes timestamp

30. **Timestamp Persistence Test**
    - Update status bar multiple times
    - Verify each update overwrites the previous timestamp
    - Verify only the most recent timestamp is displayed
    - Verify timestamp persists across function calls

31. **Missing Timestamp Test**
    - Clear timestamp variable
    - Trigger tooltip display
    - Verify tooltip shows "Click to refresh" without timestamp
    - Verify no errors when timestamp is null/undefined

## Integration and End-to-End Tests

32. **Full Workflow Test**
    - Start with empty cache
    - Perform complete refresh cycle
    - Verify caching behavior throughout
    - Verify final state is correct
    - Verify all logging is appropriate

33. **Cross-Session Persistence Test**
    - Set cache in one session
    - Restart extension (simulate VS Code restart)
    - Verify cache persists and is valid
    - Verify cache invalidation triggers work across sessions

34. **Error Recovery Test**
    - Introduce various error conditions
    - Verify graceful degradation
    - Verify cache provides fallback data
    - Verify user experience remains functional
    - Verify appropriate error boundaries

## 8. Existing Test Coverage Documentation

The following test cases are already implemented in `src/test/suite/notification.test.ts` and provide comprehensive coverage of the notification system:

## Notification Timing and State Management Tests

35. **Time-Gate Test: Does not send notification before 9 am**
    - Set fake time to 8:55 AM (before 9 AM)
    - Mock notification state as not sent
    - Call checkAndSendNotification
    - Verify no notification is sent (showInformationMessage not called)
    - Tests time-based notification blocking

36. **Happy Path Test: Sends Notification at 9 AM**
    - Set fake time to exactly 9:00 AM
    - Mock notification state as not sent
    - Call checkAndSendNotification
    - Verify notification is sent exactly once
    - Tests normal notification delivery at scheduled time

37. **Happy Path Test: Sends Notification on IDE Open After 9 AM**
    - Set fake time to 2:00 PM (after 9 AM)
    - Mock notification state as not sent
    - Call checkAndSendNotification
    - Verify notification is sent exactly once
    - Tests notification delivery on extension activation

38. **Already Sent Test: Does Not Send Notification Twice**
    - Set fake time to 3:00 PM
    - Mock notification state as already sent today
    - Call checkAndSendNotification
    - Verify no notification is sent
    - Tests duplicate notification prevention

39. **API Failure Test: Does Not Send Notification if Stats Fail**
    - Set fake time to 11:00 AM
    - Mock notification state as not sent
    - Mock status bar to return "Loading..." (API failure state)
    - Call checkAndSendNotification
    - Verify no notification is sent
    - Tests notification blocking on API failures

40. **Team Data Success Test: User usage succeeds and team usage succeeds**
    - Set fake time to 11:00 AM
    - Mock notification state as not sent
    - Use real status bar data from API setup
    - Call checkAndSendNotification
    - Verify notification is sent with team data
    - Tests successful notification with complete team/user data

41. **Complete API Failure Test: User usage fails - uses retry mechanism**
    - Set fake time to 11:00 AM
    - Mock notification state as not sent
    - Mock status bar to return "Failed" (complete API failure)
    - Call checkAndSendNotification
    - Verify no notification is sent initially
    - Verify notification state is updated for retry mechanism
    - Tests integration with retry logic on complete failures

42. **New Day Reset Test: Resets State and Sends Notification**
    - Set fake time to 9:30 AM on new day (2025-09-26)
    - Mock notification state from previous day (already sent)
    - Call checkAndSendNotification
    - Verify notification is sent (state reset)
    - Verify notification state is updated with new date and sent=true
    - Tests day boundary logic and state reset

43. **Attempt Limit Test: Does not send notification if attempt limit is reached**
    - Set fake time to 10:00 AM
    - Mock notification state with attempts=3, sent=false
    - Call checkAndSendNotification
    - Verify no notification is sent (attempt limit reached)
    - Tests attempt limit enforcement

## Notification System Integration Tests

44. **Test Command: Sends both Cursor and OS notifications**
    - Set fake time to 10:00 AM
    - Use real status bar data from API setup
    - Call testNotification command
    - Verify Cursor notification is sent
    - Tests manual notification triggering functionality

45. **Notification Fallback: Cursor notification always works**
    - Set fake time to 10:00 AM
    - Use real status bar data from API setup
    - Mock node-notifier to be unavailable (throw error)
    - Call testNotification command
    - Verify Cursor notification is sent despite OS notification failure
    - Tests fallback mechanism when OS notifications fail

## Test Infrastructure and Setup

46. **Before All Hook: Real API Data Setup**
    - Fetch real user data, team data, and usage statistics
    - Generate realistic status bar text from actual API responses
    - Set up cached API data for all test scenarios
    - Tests integration with real Cursor API

47. **Before Each Hook: API Stubbing**
    - Stub all API functions to return cached test data
    - Set up VS Code context mocks
    - Configure notification message stubbing
    - Tests controlled test environment setup

48. **After Each Hook: Cleanup**
    - Restore fake timers
    - Restore all API stubs
    - Reset test state
    - Tests proper test isolation

49. **Test Data Validation**
    - Verify status bar text format and content
    - Validate tooltip message structure
    - Check notification message formatting
    - Tests data consistency and presentation

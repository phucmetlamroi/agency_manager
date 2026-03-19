# Schedule System AI Architecture & Logic

## 1. Database Schema
- **ScheduleRule**: Defines a repeating base schedule.
  - `dayOfWeek`: `Int` (0-6) where 0 = Sunday.
  - `startTime`, `endTime`: `String` (HH:mm format).
- **ScheduleException**: Overrides the base rule for a specific `Date`.
  - `type`: `BLOCK` (user is busy/offline) or `ADD` (user is working extra).
  - Use `date` (normalized to UTC midnight) and `startTime`/`endTime` strings for comparison.

## 2. Server Actions Integration
- All data retrieval must use `getWorkspacePrisma(workspaceId, profileId)` to ensure multi-tenant isolation.
- `getEffectiveAvailability(userId, Date)`:
  - First, finds `ScheduleRule` for the day of week.
  - Then, applies `ScheduleException` (ADD overrides none; BLOCK overrides Rule/ADD).
- `getStaffRecommendations(workspaceId, ...)`:
  - Calculates Availability based on BLOCKs.
  - Factors in KPI, Reputation, and Client Affinity (Rating).

## 3. UI/UX Rules
- Used `OptimisticGrid` built with manual pointer dragging for smooth UX.
- Admin dropdowns for Task Assignment call the recommendation API ON THE FLY to preserve performance instead of pre-calculating Matrix combinations.
- Any future Grid modifications should retain the CSS sticky headers and purely stateless dragging logic.

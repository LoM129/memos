# Summary of All Changes (from first errors to final fix)

This document lists every modified `.go` and `.tsx` file, what was changed or removed, and why (linked to the original gRPC/frontend issues).

---

## Original issues

1. **Requirement:** Memos could only be created for the current date; need to allow past/future dates.
2. **Frontend:** Could not select past/future dates in the date picker; “Created” date not synced with left calendar.
3. **gRPC/Backend:** `GetCurrentSession` returned Unauthenticated when not logged in → logged as “client error” (noise).
4. **MySQL:** Running `go run .` with default driver `mysql` and no DSN → “Access denied for user ''@'localhost'”.
5. **Left calendar:** Only dates with existing memos were clickable; needed to create memos by selecting any date on the left calendar.
6. **Section 3:** Remove the calendar/date picker from the memo editor; use only the left calendar for date.

---

## Backend (.go)

### 1. `server/router/api/v1/memo_service.go`

**Changed (added):**

```go
// Allow optional display_time on create so memos can be created for any date (past or future).
if request.Memo.DisplayTime != nil {
    create.CreatedTs = request.Memo.DisplayTime.AsTime().Unix()
    create.UpdatedTs = create.CreatedTs
}
```

- **Location:** In `CreateMemo`, after setting `create.Payload.Location` and before `s.Store.CreateMemo`.
- **Why:** Backend previously ignored `display_time` on create and always used “now”. This uses the client-provided date so memos can be created for any past or future date (fixes requirement #1).

---

### 2. `store/db/sqlite/memo.go`

**Changed (added):**

```go
// Allow optional created_ts/updated_ts so memos can be created for any date (past or future).
if create.CreatedTs != 0 {
    fields = append(fields, "`created_ts`", "`updated_ts`")
    placeholder = append(placeholder, "?", "?")
    args = append(args, create.CreatedTs, create.UpdatedTs)
}
```

- **Location:** In `CreateMemo`, after building `args` and before building `stmt`.
- **Why:** SQLite INSERT did not set `created_ts`/`updated_ts`, so the DB always used “now”. When the API sets `create.CreatedTs`, we must write it (requirement #1).

---

### 3. `store/db/mysql/memo.go`

**Changed (added):**

```go
// Allow optional created_ts/updated_ts so memos can be created for any date (past or future).
if create.CreatedTs != 0 {
    fields = append(fields, "`created_ts`", "`updated_ts`")
    placeholder = append(placeholder, "FROM_UNIXTIME(?)", "FROM_UNIXTIME(?)")
    args = append(args, create.CreatedTs, create.UpdatedTs)
}
```

- **Location:** In `CreateMemo`, after building `args` and before `stmt`.
- **Why:** Same as SQLite; MySQL needs explicit `created_ts`/`updated_ts` when the API provides a custom date (requirement #1, MySQL).

---

### 4. `store/db/postgres/memo.go`

**Changed (added):**

```go
// Allow optional created_ts/updated_ts so memos can be created for any date (past or future).
if create.CreatedTs != 0 {
    fields = append(fields, "created_ts", "updated_ts")
    args = append(args, create.CreatedTs, create.UpdatedTs)
}
```

- **Location:** In `CreateMemo`, after building `args` and before `stmt`.
- **Why:** Same as SQLite/MySQL for custom create date (requirement #1).

---

### 5. `server/router/api/v1/logger_interceptor.go`

**Changed (added branch for Unauthenticated):**

```go
case codes.Unauthenticated:
    // GetCurrentSession returns Unauthenticated when no one is logged in — expected, don't log as client error.
    if fullMethod == "/memos.api.v1.AuthService/GetCurrentSession" {
        logLevel = slog.LevelDebug
        logMsg = "OK"
    } else {
        logLevel = slog.LevelInfo
        logMsg = "client error"
    }
case codes.OutOfRange, codes.PermissionDenied, codes.NotFound:
```

- **Deleted:** Single branch that treated all `Unauthenticated` (and similar) as `"client error"` at INFO.
- **Why:** GetCurrentSession returns Unauthenticated when not logged in; logging that as “client error” was noisy. Now that case is logged at Debug so normal runs stay clean (fixes gRPC log issue #3).

---

### 6. `cmd/memos/main.go`

**Changed:**

- Default driver: `"sqlite"` → `"mysql"` (later reverted to mysql for your setup).
- Added default DSN and comment:

```go
viper.SetDefault("driver", "mysql")
viper.SetDefault("dsn", "memos:root@tcp(localhost:3306)/memos?charset=utf8mb4")
// Default MySQL DSN so "go run ." works without flags (override with --dsn or MEMOS_DSN if needed).
```

- Flag default for `--dsn`: from `""` to the same connection string.
- **Deleted:** Long comment block with “Run with MySQL” and PowerShell env example (replaced by the one-line comment above).

**Why:** With driver=mysql and no DSN, app tried to connect with empty user → “Access denied for user ''@'localhost'” (#4). Default DSN in code lets `go run .` work with MySQL without passing flags.

---

### 7. `internal/profile/profile.go`

**Changed (added validation):**

```go
if p.Driver == "mysql" && p.DSN == "" {
    return fmt.Errorf("MySQL driver requires a DSN: set MEMOS_DSN or pass --dsn (e.g. --dsn \"user:password@tcp(localhost:3306)/memos?charset=utf8mb4\")")
}
if p.Driver == "postgres" && p.DSN == "" {
    return fmt.Errorf("PostgreSQL driver requires a DSN: set MEMOS_DSN or pass --dsn")
}
```

- **Location:** In `Validate()`, after the sqlite DSN default block.
- **Why:** When DSN was missing for MySQL, the error was an opaque “Access denied” (#4). This returns a clear error telling the user to set DSN.

---

## Frontend (.tsx)

### 8. `web/src/components/MemoEditor/index.tsx`

**Changed:**

1. **Import:** Added `memoFilterStore` so the editor can read the calendar filter.
2. **State:** `createTime` initial value now comes from calendar filter or today:

```tsx
const [createTime, setCreateTime] = useState<Date | undefined>(() => {
  if (memoName) return undefined;
  const displayTimeFilters = memoFilterStore.getFiltersByFactor("displayTime");
  const filterDate = displayTimeFilters[0]?.value;
  if (filterDate) {
    const date = new Date(filterDate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
});
```

3. **Render:** Read filter so the component re-renders when the left calendar selection changes:

```tsx
const displayTimeFilterValue = memoFilterStore.getFiltersByFactor("displayTime")[0]?.value ?? "";
```

4. **Effect:** Sync `createTime` with the calendar filter whenever the filter or `memoName` changes:

```tsx
useEffect(() => {
  if (memoName) return;
  if (displayTimeFilterValue) {
    const date = new Date(displayTimeFilterValue);
    if (!Number.isNaN(date.getTime())) {
      setCreateTime(date);
      return;
    }
  }
  setCreateTime(new Date());
}, [memoName, displayTimeFilterValue]);
```

5. **CreateMemo call:** Send the chosen date to the backend:

```tsx
displayTime: createTime ?? new Date(),
```

inside `Memo.fromPartial({ ... })` when creating a memo.

**Deleted:**

- The entire “Created” date/time block for **new** memos (the row with “Created” + `DateTimeInput` above the Save button).

**Why:** Requirement was to create memos for any date using the **left calendar** only, and to remove the calendar from Section 3 (#2, #6). So: new-memo date comes only from the filter (left calendar), and the date picker was removed from the editor.

---

### 9. `web/src/components/DateTimeInput.tsx`

**Changed:**

- **Format:** From `"YYYY-MM-DD HH:mm:ss"` to `"YYYY-MM-DDTHH:mm"` (required by `datetime-local`).
- **Behavior:** From uncontrolled `defaultValue` + `onBlur` to controlled `value` + `onChange` / `onBlur`, with local state synced from parent via `useEffect` when `value` changes.
- **Removed:** `placeholder={DATE_TIME_FORMAT}`.
- **Added:** `step={60}` and proper handling so the input always shows a valid value and accepts any date.

**Why:** Wrong format and uncontrolled input prevented selecting past/future dates in the date picker (#2). Using the correct format and controlled value fixes selection for any date (used when editing existing memos).

---

### 10. `web/src/components/StatisticsView/StatisticsView.tsx`

**Changed:**

- **Deleted:** `const [selectedDate] = useState(new Date());`
- **Added:** Selected date derived from the displayTime filter:

```tsx
const displayTimeFilter = memoFilterStore.getFiltersByFactor("displayTime")[0]?.value;
const selectedDate = displayTimeFilter ? new Date(displayTimeFilter) : new Date();
```

**Why:** After clicking a date on the left calendar, the highlighted date did not update because `selectedDate` was always “today”. Now the calendar highlight follows the filter (#5).

---

### 11. `web/src/components/ActivityCalendar/CalendarCell.tsx`

**Changed:**

- **Before:** `if (day.count > 0 && onClick)` and `isInteractive = Boolean(onClick && day.count > 0)`.
- **After:** `if (onClick && day.isCurrentMonth)` and `isInteractive = Boolean(onClick && day.isCurrentMonth)`.

**Why:** Only dates that already had memos were clickable, so you could not select an empty date to create a memo (#5). Making every date in the current month clickable fixes that.

---

## Quick reference: file → reason

| File | Reason (original error/requirement) |
|------|-------------------------------------|
| `memo_service.go` | Use `display_time` on create → past/future dates (#1) |
| `store/db/sqlite/memo.go` | Write `created_ts`/`updated_ts` when provided (#1) |
| `store/db/mysql/memo.go` | Same for MySQL (#1) |
| `store/db/postgres/memo.go` | Same for Postgres (#1) |
| `logger_interceptor.go` | Stop logging GetCurrentSession Unauthenticated as “client error” (#3) |
| `cmd/memos/main.go` | Default MySQL DSN so `go run .` works (#4) |
| `internal/profile/profile.go` | Clear error when MySQL used without DSN (#4) |
| `MemoEditor/index.tsx` | Date from left calendar only; send displayTime; remove date picker in Section 3 (#2, #6) |
| `DateTimeInput.tsx` | Correct format + controlled input for past/future dates (#2) |
| `StatisticsView.tsx` | Selected date from filter so calendar highlights correctly (#5) |
| `CalendarCell.tsx` | Allow clicking any date in current month (#5) |

No other files were modified. All changes are tied to the first gRPC/frontend errors and the “create memos by left calendar only” behavior.

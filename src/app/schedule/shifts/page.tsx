import { ShiftsWrapper } from "./ShiftsWrapper"

// No nav entry yet — reachable only by direct URL, same as /schedule/today
// and /schedule/teams (issue #19 §5, §11). Auth is handled by the global
// NextAuth middleware, same as every other route.
export default function ScheduleShiftsPage() {
  return <ShiftsWrapper />
}

import { MyScheduleView } from "./MyScheduleView"

// Auth is handled by the global NextAuth middleware, same as every other route.
export default function ScheduleMePage() {
  return <MyScheduleView />
}

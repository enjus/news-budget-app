import { TodayWrapper } from "./TodayWrapper"

// Auth is handled by the global NextAuth middleware, same as every other route.
export default function ScheduleTodayPage() {
  return <TodayWrapper />
}

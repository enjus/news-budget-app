import { redirect } from "next/navigation"

// The homepage moved to /; this keeps old /homepage bookmarks working.
// Its components still live in this folder.
export default function HomepagePage() {
  redirect("/")
}

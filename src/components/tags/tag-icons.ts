import { createElement } from "react"
import {
  MapPin, Repeat2, Sun, Landmark, Clapperboard, BellRing,
  Star, Flag, Flame, Trophy, Heart, Leaf,
  Mountain, Trees, Newspaper, Megaphone, Vote, GraduationCap,
  Utensils, Music, Zap, Target, Bookmark, CalendarDays,
  Users, Lightbulb, Search, Scale,
  type LucideIcon,
} from "lucide-react"
import type { TagIconKey } from "@/lib/tags"

// Keyed by the TAG_ICON_KEYS stored on Tag.icon. The Record type makes the
// compiler flag any key added to TAG_ICON_KEYS without a component here.
export const TAG_ICONS: Record<TagIconKey, LucideIcon> = {
  "map-pin": MapPin,
  repeat: Repeat2,
  sun: Sun,
  landmark: Landmark,
  clapperboard: Clapperboard,
  "bell-ring": BellRing,
  star: Star,
  flag: Flag,
  flame: Flame,
  trophy: Trophy,
  heart: Heart,
  leaf: Leaf,
  mountain: Mountain,
  trees: Trees,
  newspaper: Newspaper,
  megaphone: Megaphone,
  vote: Vote,
  "graduation-cap": GraduationCap,
  utensils: Utensils,
  music: Music,
  zap: Zap,
  target: Target,
  bookmark: Bookmark,
  calendar: CalendarDays,
  users: Users,
  lightbulb: Lightbulb,
  search: Search,
  scale: Scale,
}

/** Render a stored icon key, or nothing for null/unknown keys. createElement
 *  (not a JSX variable) keeps react-hooks/static-components satisfied — the
 *  components themselves are module-level constants. */
export function renderTagIcon(key: string | null | undefined, className?: string) {
  return key && key in TAG_ICONS ? createElement(TAG_ICONS[key as TagIconKey], { className }) : null
}

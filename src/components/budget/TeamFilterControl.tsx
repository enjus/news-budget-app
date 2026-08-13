"use client"

import { useState } from "react"
import { Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useTeams } from "@/lib/hooks/useTeams"
import { resolveExcludedReporterTeams } from "@/lib/team-filter"

interface TeamFilterControlProps {
  /** Team IDs currently hidden from the Daily view. Empty = nothing hidden. */
  excludedTeamIds: string[]
  onChange: (teamIds: string[]) => void
}

/**
 * Toolbar control for the Daily view's "hide reporter team" filter. Opt-out
 * model: every team is shown by default; unchecking a team hides content
 * whose only REPORTER assignees belong to it (see reporterTeamExclusionFilter).
 */
export function TeamFilterControl({ excludedTeamIds, onChange }: TeamFilterControlProps) {
  const { teams, isLoading: teamsLoading } = useTeams()
  const [open, setOpen] = useState(false)

  // Ignore stale IDs (a hidden team that's since been deleted) so the badge
  // count and toggle state only ever reflect teams that still exist. Shared
  // with DailyBudgetView's own resolution so the two can't drift apart.
  const { validTeamIds: validExcludedIds } = resolveExcludedReporterTeams(excludedTeamIds, teams)
  // While teams are still loading, `teams` is empty and validExcludedIds
  // would read as 0 even if the user has hidden teams — fall back to the raw
  // preference count so the badge doesn't flash "0 hidden" on cold load.
  const hiddenCount = teamsLoading ? excludedTeamIds.length : validExcludedIds.length

  function toggleTeam(teamId: string) {
    const next = validExcludedIds.includes(teamId)
      ? validExcludedIds.filter((id) => id !== teamId)
      : [...validExcludedIds, teamId]
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={hiddenCount > 0 ? "secondary" : "outline"}
          className="gap-1.5 text-xs"
        >
          <Users className="size-3.5" />
          Teams
          {hiddenCount > 0 && (
            <Badge variant="default" className="ml-0.5 px-1.5 py-0 text-[10px]">
              {hiddenCount} hidden
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandList>
            <CommandEmpty>No teams found.</CommandEmpty>
            <CommandGroup heading="Show reporters from">
              {teams.map((team) => {
                const shown = !validExcludedIds.includes(team.id)
                return (
                  <CommandItem
                    key={team.id}
                    value={team.name}
                    onSelect={() => toggleTeam(team.id)}
                  >
                    <Checkbox checked={shown} className="pointer-events-none" />
                    {team.name}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {hiddenCount > 0 && (
              <CommandGroup>
                <CommandItem onSelect={() => onChange([])}>
                  <X className="mr-2 size-3" />
                  Show all teams
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

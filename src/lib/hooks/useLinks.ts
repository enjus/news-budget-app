import { useMemo } from "react"
import useSWR from "swr"

export interface NewsroomLinkRecord {
  id: string
  title: string
  url: string
  note: string | null
  categoryId: string
}

export interface LinkCategoryRecord {
  id: string
  name: string
  links: NewsroomLinkRecord[]
}

export interface LinksResponse {
  categories: LinkCategoryRecord[]
}

/**
 * Newsroom Links categories (with their links) in display order.
 * `categories` is empty while loading — check `isLoading` first.
 */
export function useLinks() {
  const { data, isLoading, error, mutate } = useSWR<LinksResponse>("/api/links")
  const categories = useMemo(() => data?.categories ?? [], [data])
  return { categories, hasData: !!data, isLoading, error, mutate }
}

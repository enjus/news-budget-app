"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MentionTextarea } from "./MentionTextarea"
import { apiPath } from "@/lib/api-path"
import {
  displayName,
  formatTimestampPacific,
  formatTimestampPacificLong,
  hasAdminAccess,
} from "@/lib/utils"
import { tokenizeCommentBody } from "@/lib/comment-text"
import type { CommentWithAuthor } from "@/types/index"

interface CommentSectionProps {
  /** Exactly one of storyId / videoId. */
  storyId?: string
  videoId?: string
  comments: CommentWithAuthor[]
  onUpdate: () => void
  readOnly?: boolean
}

export function CommentSection({
  storyId,
  videoId,
  comments,
  onUpdate,
  readOnly,
}: CommentSectionProps) {
  const { data: session } = useSession()

  const [body, setBody] = useState("")
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [isPosting, setIsPosting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editMentionIds, setEditMentionIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const collectionPath = storyId
    ? `/api/stories/${storyId}/comments`
    : `/api/videos/${videoId}/comments`

  async function handlePost(notifyAll: boolean) {
    if (!body.trim()) return
    setIsPosting(true)
    try {
      const res = await fetch(apiPath(collectionPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), mentionIds, notifyAll }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to post comment (${res.status})`)
      }
      toast.success(notifyAll ? "Comment posted and team notified" : "Comment posted")
      setBody("")
      setMentionIds([])
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment")
    } finally {
      setIsPosting(false)
    }
  }

  function startEdit(comment: CommentWithAuthor) {
    setEditingId(comment.id)
    setEditBody(comment.body)
    setEditMentionIds(comment.mentions.map((m) => m.personId))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody("")
    setEditMentionIds([])
  }

  async function handleSaveEdit(commentId: string) {
    if (!editBody.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch(apiPath(`/api/comments/${commentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim(), mentionIds: editMentionIds }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to save comment (${res.status})`)
      }
      toast.success("Comment updated")
      cancelEdit()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save comment")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(commentId: string) {
    try {
      const res = await fetch(apiPath(`/api/comments/${commentId}`), { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Failed to delete comment (${res.status})`)
      }
      toast.success("Comment deleted")
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete comment")
    }
  }

  const currentUserId = session?.user?.id
  const isAdmin = hasAdminAccess(session?.user?.appRole ?? "")

  return (
    // scroll-mt clears the sticky h-14 TopNav when jumped to via #comments.
    <div id="comments" className="space-y-3 scroll-mt-20">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Comments
      </h3>

      {comments.length > 0 ? (
        <div className="space-y-2">
          {comments.map((comment) => {
            const isAuthor = !!currentUserId && comment.authorId === currentUserId
            const canEdit = !readOnly && isAuthor
            const canDelete = !readOnly && (isAuthor || isAdmin)

            return (
              <div key={comment.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.authorName}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    title={formatTimestampPacificLong(comment.createdAt)}
                  >
                    {formatTimestampPacific(comment.createdAt)}
                  </span>
                  {comment.editedAt && (
                    <span
                      className="text-xs text-muted-foreground italic"
                      title={formatTimestampPacificLong(comment.editedAt)}
                    >
                      (edited)
                    </span>
                  )}

                  {(canEdit || canDelete) && (
                    <span className="ml-auto flex items-center gap-1">
                      {canEdit && (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => startEdit(comment)}
                          aria-label="Edit comment"
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleDelete(comment.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </span>
                  )}
                </div>

                {editingId === comment.id ? (
                  <div className="mt-2 space-y-2">
                    <MentionTextarea
                      value={editBody}
                      mentionIds={editMentionIds}
                      onChange={(v, ids) => {
                        setEditBody(v)
                        setEditMentionIds(ids)
                      }}
                      aria-label="Edit comment"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={isSaving || !editBody.trim()}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    <CommentBody comment={comment} />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      {!readOnly && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <MentionTextarea
            value={body}
            mentionIds={mentionIds}
            onChange={(v, ids) => {
              setBody(v)
              setMentionIds(ids)
            }}
            placeholder="Add a comment — type @ to tag someone"
            aria-label="Add a comment"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => handlePost(false)}
              disabled={isPosting || !body.trim()}
            >
              {isPosting ? "Posting..." : "Post"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handlePost(true)}
              disabled={isPosting || !body.trim()}
            >
              Post and Notify All
            </Button>
            <span className="text-xs text-muted-foreground">
              Tagged people are emailed either way.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Plain text with URLs hyperlinked and @-mentions highlighted. */
function CommentBody({ comment }: { comment: CommentWithAuthor }) {
  const tokens = tokenizeCommentBody(
    comment.body,
    comment.mentions.map((m) => displayName(m.person.name))
  )

  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === "link") {
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-primary"
            >
              {token.value}
            </a>
          )
        }
        if (token.type === "mention") {
          return (
            <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
              {token.value}
            </span>
          )
        }
        return <span key={i}>{token.value}</span>
      })}
    </>
  )
}

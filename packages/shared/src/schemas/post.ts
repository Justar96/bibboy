import { Schema } from "effect"

// ============================================================================
// Post Schema
// ============================================================================

/**
 * Schema for a blog post with pre-rendered HTML content.
 * Used for API responses and data validation.
 */
export const PostSchema = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  date: Schema.String,
  description: Schema.String,
  content: Schema.String,
  htmlContent: Schema.String,
  tags: Schema.Array(Schema.String),
})

/**
 * Type representing a blog post derived from PostSchema.
 */
export type Post = Schema.Schema.Type<typeof PostSchema>

/**
 * Schema for a list of posts.
 */
export const PostListSchema = Schema.Array(PostSchema)

/**
 * Type representing a list of posts.
 */
export type PostList = Schema.Schema.Type<typeof PostListSchema>

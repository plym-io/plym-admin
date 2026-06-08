import type { components } from '@/api/schema';

/** Convenience aliases over the generated OpenAPI schema. */
export type User = components['schemas']['User'];
export type UserPublic = components['schemas']['UserPublic'];
export type Role = components['schemas']['Role'];
export type Post = components['schemas']['Post'];
export type PostListItem = components['schemas']['PostListItem'];
export type PostStatus = components['schemas']['PostStatus'];
export type PostPage = components['schemas']['PostPage'];
export type MediaItem = components['schemas']['MediaItem'];
export type MediaPage = components['schemas']['MediaPage'];
export type Tag = components['schemas']['Tag'];
export type TokenPair = components['schemas']['TokenPair'];
export type LogEntry = components['schemas']['LogEntry'];
export type LogPage = components['schemas']['LogPage'];
export type UserPage = components['schemas']['UserPage'];
export type SiteConfig = components['schemas']['SiteConfig'];

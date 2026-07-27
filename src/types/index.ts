import type { components } from '@/api/schema';

/** Convenience aliases over the generated OpenAPI schema. */
export type User = components['schemas']['User'];
export type UserPublic = components['schemas']['UserPublic'];
export type Role = components['schemas']['Role'];
export type Faq = components['schemas']['Faq'];
/** Read shape: full FAQ/tag objects. Writes take ids/names — see PostCreate/PostUpdate. */
export type Post = components['schemas']['Post'];
export type PostListItem = components['schemas']['PostListItem'];
export type PostStatus = components['schemas']['PostStatus'];
export type PostPage = components['schemas']['PostPage'];
export type MediaItem = components['schemas']['MediaItem'];
export type MediaPage = components['schemas']['MediaPage'];
export type Tag = components['schemas']['Tag'];
export type Category = components['schemas']['Category'];
export type CategoryCreate = components['schemas']['CategoryCreate'];
export type ExtLink = components['schemas']['ExtLink'];
export type Submission = components['schemas']['Submission'];
export type SubmissionPage = components['schemas']['SubmissionPage'];
export type TokenPair = components['schemas']['TokenPair'];
export type UserPage = components['schemas']['UserPage'];
export type SiteConfig = components['schemas']['SiteConfig'];

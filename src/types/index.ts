import type { components } from '@/api/schema';
import type { ProfileLink } from '@/lib/profile-links';

/** Convenience aliases over the generated OpenAPI schema. */
// `links` isn't in the generated schema yet (backend pending); model it as an
// optional field so the profile editor can read/write it. Once the backend
// ships and `npm run codegen` regenerates the schema, this becomes redundant.
export type User = components['schemas']['User'] & { links?: ProfileLink[] | null };
export type UserPublic = components['schemas']['UserPublic'];
export type Role = components['schemas']['Role'];
export type Faq = components['schemas']['Faq'];
// `faqs`/`faq_ids` aren't in the generated Post/PostCreate/PostUpdate schemas
// yet (backend pending); model them as optional until `npm run codegen`
// picks up the real association endpoint.
export type Post = components['schemas']['Post'] & { faqs?: Faq[] | null };
export type PostListItem = components['schemas']['PostListItem'];
export type PostStatus = components['schemas']['PostStatus'];
export type PostPage = components['schemas']['PostPage'];
export type MediaItem = components['schemas']['MediaItem'];
export type MediaPage = components['schemas']['MediaPage'];
export type Tag = components['schemas']['Tag'];
export type TokenPair = components['schemas']['TokenPair'];
export type UserPage = components['schemas']['UserPage'];
export type SiteConfig = components['schemas']['SiteConfig'];

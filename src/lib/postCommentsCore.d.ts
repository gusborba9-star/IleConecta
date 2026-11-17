export interface CoreComment { id: string; userId: string; text: string; createdAt: string; hidden?: boolean }
export interface CorePost { id: string; comments?: CoreComment[]; commentCount?: number; commentsLoaded?: boolean }
export function visibleComments<T extends CorePost>(post: T, who: { mine: boolean; userId?: string | null }): CoreComment[];
export function shownCommentCount<T extends CorePost>(post: T, who: { mine: boolean; userId?: string | null }): number | undefined;
export function mergeFeedComments<T extends CorePost>(prev: T[], fresh: T[]): T[];
export function withNewComment<T extends CorePost>(post: T, comment: CoreComment): T;
export function withLoadedComments<T extends CorePost>(post: T, comments: CoreComment[]): T;

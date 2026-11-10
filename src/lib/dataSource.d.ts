import type { Conversation, Post, Purchase, Ritual, Story, User } from "@/types";

export interface DemoSet { users: User[]; posts: Post[]; stories: Story[]; rituals: Ritual[]; conversations: Conversation[]; purchases: Purchase[] }
export type ExposedState = DemoSet;
export declare function exposeState(args: { remote: boolean; demo: DemoSet; real: { users: User[]; posts: Post[] } }): ExposedState;

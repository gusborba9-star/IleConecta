export interface AudioTags { title: string; author: string; source: string; licenseUrl: string; licenseKind: "" | "cc0" | "cc_by" | "outra"; licenseNote: string; warning: string }
export declare function readId3(head: Uint8Array, tail?: Uint8Array): AudioTags;
export declare function readFileTags(file: File | null | undefined): Promise<AudioTags>;

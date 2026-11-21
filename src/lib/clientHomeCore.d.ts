export interface ClientItem { id: string; kind: string; critical: boolean; title: string; detail: string; to: string; order: number }
export function todayBR(now?: Date): string;
export function buildClientItems(d: {
  orders?: Array<{ id: string; title: string; status: string; houseName?: string; houseOwnerId?: string | null }>;
  memberships?: Array<{ memberId: string; houseName: string; dues: Array<{ id: string; dueDate: string; status: string; amountCents: number }> }>;
  reservations?: Array<{ id: string; status: string; title: string; houseName: string; startsAt: string }>;
  today: string;
}): ClientItem[];
export function criticalItems(items: ClientItem[]): ClientItem[];

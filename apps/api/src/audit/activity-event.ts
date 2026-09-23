/**
 * Контракт будущего бизнес-аудита. Технические Pino-логи и бизнес-события
 * намеренно разделены: аудит будет хранить только значимые действия предметной области.
 */
export type ActivityEvent = {
  type: string;
  actorId?: string;
  subjectId?: string;
  occurredAt: Date;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface ActivityEventRepository {
  record(event: ActivityEvent): Promise<void>;
}

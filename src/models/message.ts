/**
 * Message kind enum
 */
export enum MessageKind {
  sms = 'sms',
  email = 'email',
}

/**
 * Status kind enum
 */
export enum StatusKind {
  success = 'success',
  failure = 'failure',
  processing = 'processing',
}

/**
 * Message interface
 */
export interface IMessage {
  body: string,
  recipient: string,
  kind: MessageKind,
  sender?: string,
  subject?: string,
}

/**
 * Message with ID interface
 */
export interface IMessageWithId extends IMessage {
  readonly messageId: string,
  readonly timestamp?: number,
  status?: StatusKind;
}

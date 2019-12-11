export enum MessageKind {
  sms = 'sms',
  email = 'email',
}

export enum StatusKind {
  success = 'success',
  failure = 'failure',
  processing = 'processing',
}

export interface IMessage {
  body: string,
  recipient: string,
  kind: MessageKind,
  sender?: string,
  subject?: string,
}

export interface IMessageWithId extends IMessage {
  readonly messageId: string,
  readonly timestamp?: number,
  status?: StatusKind;
}

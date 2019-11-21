export enum MessageKind {
    sms = 'sms',
    email = 'email',
}

export interface IMessage {
    body: string,
    recipient: string,
    kind: MessageKind,
    sender?: string,
    subject?: string,
    messageId?: string,
    timestamp?: number,
}

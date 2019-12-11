import {
  AWSError, config, DynamoDB, SharedIniFileCredentials, SES, SNS,
} from 'aws-sdk';
import {
  AttributeValue,
  ExpressionAttributeValueMap,
  DeleteItemInput,
  GetItemInput,
  PutItemInput,
  PutItemOutput,
  QueryInput,
} from 'aws-sdk/clients/dynamodb';
import { SNSMessage } from 'aws-lambda';
import { PromiseResult } from 'aws-sdk/lib/request';

import { logger } from './util/logger';
import { IMessage, IMessageWithId, MessageKind } from './models/message';

const isLocal = process.env.OFFLINE || !process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Class used by the message delivery engine to send updates to users and
 * also keep track of the updates sent for later processing.
 */
export class Messenger {
  private db: DynamoDB;

  private sns: SNS;

  private ses: SES;

  constructor(
    private dbTable: string = '',
    private snsArn: string = '',
  ) {
    if (isLocal && process.env.AWS_PROFILE) {
      const credentials = new SharedIniFileCredentials({ profile: process.env.AWS_PROFILE });
      config.credentials = credentials;
    }
    if (dbTable) {
      this.connectDb();
    }
    if (snsArn) {
      this.connectSns();
    }
  }

  /**
   * Lists every message destined to a particular recipient or sender
   *
   * @param recipient - The recipient that can be either an email or phone number
   * @param sender - The sender that can be either an email or phone number
   * @param kind - The message type that can be email or SMS
   * @returns All messages found addressed to recipient/sender
   */
  public async list(recipient: string, sender: string, kind: MessageKind): Promise<Array<IMessageWithId>> {
    logger.debug('"Messenger.list": recipient', recipient);
    logger.debug('"Messenger.list": sender', sender);
    logger.debug('"Messenger.list": kind', kind);

    if (!recipient && !sender) {
      throw new Error('[400] Invalid recipient or sender.');
    }

    const params: QueryInput = {
      TableName: this.dbTable,
      ScanIndexForward: false,
    };
    let expressionAttributes: ExpressionAttributeValueMap = {};

    if (recipient) {
      if (!Messenger.validateEmail(recipient) && !Messenger.validatePhone(recipient)) {
        throw new Error(`[400] Invalid phone number or email address. ${recipient}`);
      }

      params.IndexName = 'recipient-index';
      params.KeyConditionExpression = 'recipient = :recipient';
      expressionAttributes = {
        ':recipient': {
          S: recipient,
        } as AttributeValue,
      };
    }

    if (sender) {
      if (!Messenger.validateEmail(sender) && !Messenger.validatePhone(sender)) {
        throw new Error(`[400] Invalid phone number or email address. ${sender}`);
      }

      params.IndexName = 'sender-index';
      params.KeyConditionExpression = 'sender = :sender';
      expressionAttributes = {
        ':sender': {
          S: sender,
        } as AttributeValue,
      };
    }

    if (kind) {
      params.FilterExpression = 'kind = :kind';
      expressionAttributes = {
        ...expressionAttributes,
        ':kind': {
          S: kind.toString(),
        } as AttributeValue,
      };
    }
    params.ExpressionAttributeValues = expressionAttributes;

    const record = await this.db.query(params).promise();
    const convertedDataArray: Array<IMessageWithId> = (record.Items || []).map((item: any) => {
      const unmappedItem = DynamoDB.Converter.unmarshall(item) as IMessageWithId;
      return unmappedItem;
    });
    return Promise.resolve(convertedDataArray);
  }

  /**
   * Stores published message into database
   *
   * @param message - Message that was published in the Pub/Sub topic
   * @returns Record just saved into database
   */
  public async save(message: SNSMessage): Promise<PromiseResult<PutItemOutput, AWSError>> {
    logger.debug('"Messenger.save": message', message);
    const parsedMessage = JSON.parse(message.Message) as IMessage;
    logger.debug('"Messenger.save": parsedMessage', parsedMessage);
    const item = DynamoDB.Converter.marshall(parsedMessage);

    const params: PutItemInput = {
      TableName: this.dbTable,
      Item: {
        messageId: {
          S: message.MessageId,
        } as AttributeValue,
        timestamp: {
          N: new Date(message.Timestamp).valueOf().toString(),
        } as AttributeValue,
        ...item,
      },
    };

    const savedItem = await this.db.putItem(params).promise();
    logger.debug('"Messenger.save": savedItem', savedItem);
    return savedItem;
  }

  /**
   * Send message to user using either SNS (for SMS destination) or SES (for email destination)
   *
   * @param message - Message that was published in the Pub/Sub topic
   * @returns All messages to recipient
   */
  public async send(message: SNSMessage): Promise<any> {
    logger.debug('"Messenger.send": message', message);
    const parsedMessage = JSON.parse(message.Message) as IMessage;
    logger.debug('"Messenger.send": parsedMessage', parsedMessage);

    if (!parsedMessage) {
      throw new Error(`[400] Unable to retrieve message details. ${message}`);
    }

    if (parsedMessage.kind === MessageKind.email) {
      return this.sendEmail(parsedMessage);
    } if (parsedMessage.kind === MessageKind.sms) {
      return this.sendSms(parsedMessage);
    }
    throw new Error(`[400] Invalid or missing message type ("sms" or "email"). ${parsedMessage.kind}`);
  }

  /**
   * Publish message to Pub/Sub topic for later process
   *
   * @param message - Message details such as body, type (Email or SMS) and recipient
   * @returns Message recorded with generated unique identifier
   */
  public async publish(message: IMessage): Promise<IMessageWithId> {
    logger.debug('"Messenger.publish": body', message);

    const published = await this.sns.publish({
      Message: JSON.stringify({ default: JSON.stringify(message) }),
      MessageStructure: 'json',
      Subject: message.subject,
      TopicArn: this.snsArn,
    }).promise();
    /* if (message.kind === MessageKind.email) {
      published = await this.sendEmail(message);
    } if (message.kind === MessageKind.sms) {
      published = await this.sendSms(message);
    } */
    logger.debug('"Messenger.publish": published', published);
    return Promise.resolve({
      ...message,
      messageId: published.MessageId,
    } as IMessageWithId);
  }

  /**
   * Retrieves message based on specified identifier
   *
   * @param messageId - Message unique identifier
   * @returns Single message retrieved record from database
   */
  public async get(messageId: string): Promise<IMessageWithId> {
    logger.debug('"Messenger.get": messageId', messageId);

    const params: GetItemInput = {
      TableName: this.dbTable,
      Key: {
        messageId: {
          S: messageId,
        } as AttributeValue,
      },
    };

    const record = await this.db.getItem(params).promise();
    logger.debug('"Messenger.get": record', record);
    if (!record.Item) {
      throw new Error(`[400] Message with specified ID not found. ${messageId}`);
    }
    const convertedData = DynamoDB.Converter.unmarshall(record.Item) as IMessageWithId;
    return Promise.resolve(convertedData);
  }

  /**
   * Deletes message based on specified identifier
   *
   * @param messageId - Message unique identifier
   * @returns Message identifier of deleted record from database
   */
  public async remove(messageId: string): Promise<Record<string, any>> {
    logger.debug('"Messenger.remove": messageId', messageId);

    const params: DeleteItemInput = {
      TableName: this.dbTable,
      Key: {
        messageId: {
          S: messageId,
        } as AttributeValue,
      },
    };

    const record = await this.db.deleteItem(params).promise();
    logger.debug('"Messenger.get": record', record);
    return Promise.resolve({
      messageId,
    });
  }

  public static validateEmail(email: string): boolean {
    return !!email && !!email.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  }

  public static validatePhone(phone: string): boolean {
    return !!phone && !!phone.match(/^\+?[1-9]\d{8,14}$/);
  }

  /**
   * Connects to AWS DynamoDB service for later use
   */
  private connectDb(): void {
    const endpoint = undefined; // isLocal ? 'http://localhost:8000' : undefined;
    this.db = new DynamoDB({
      apiVersion: '2012-08-10',
      region: process.env.REGION,
      endpoint,
    });
  }

  /**
   * Connects to AWS SNS service for later use
   */
  private connectSns(): void {
    const endpoint = undefined; // isLocal ? 'http://localhost:4002' : undefined;
    this.sns = new SNS({
      apiVersion: '2010-03-31',
      region: process.env.REGION,
      endpoint,
    });
  }

  /**
   * Connects to AWS SES service for later use
   */
  private connectSes(): void {
    this.ses = new SES({
      apiVersion: '2010-12-01',
      region: process.env.REGION,
    });
  }

  /**
   * Send Email message to user using SES
   *
   * @param message - Message details such as body, subject, sender and recipient
   * @returns Response from AWS service
   */
  private async sendEmail(message: IMessage): Promise<PromiseResult<SES.SendEmailResponse, AWSError>> {
    logger.debug('"Messenger.sendEmail": message', message);

    this.connectSes();
    const emailDestination = message.recipient;
    if (!Messenger.validateEmail(emailDestination)) {
      throw new Error(`[400] Email is not properly formatted. ${emailDestination}`);
    }
    const email = {
      Message: {
        Body: {
          Text: {
            Charset: 'UTF-8',
            Data: message.body,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: message.subject,
        },
      },
      Destination: {
        ToAddresses: [emailDestination],
      },
      Source: message.sender,
    } as SES.Types.SendEmailRequest;
    const published = await this.ses.sendEmail(email).promise();
    logger.debug('"Messenger.send": published', published);
    return published;
  }

  /**
   * Send SMS message to user using SNS
   *
   * @param message - Message details such as body and recipient
   * @returns Response from AWS service
   */
  private async sendSms(message: IMessage): Promise<PromiseResult<SNS.PublishResponse, AWSError>> {
    logger.debug('"Messenger.sendSms": message', message);

    this.connectSns();
    const destinationPhone = message.recipient;
    if (!Messenger.validatePhone(destinationPhone)) {
      throw new Error(`[400] Phone number does not match E.164 format. ${destinationPhone}`);
    }
    let sender = 'MSGAPPNL';
    if (message.sender && message.sender.length >= 10) {
      sender = message.sender.replace(/\D/g, '');
      sender = `n${sender.substr(0, 10)}`;
    }
    /* const smsAttributes = await this.sns.setSMSAttributes({
      attributes: {
        DefaultSMSType: 'Promotional',
        DefaultSenderID: sender,
        MonthlySpendLimit: '2',
      },
    }).promise();
    logger.debug('"Messenger.sendSms": smsAttributes', smsAttributes); */
    const messageAttributes: SNS.MessageAttributeMap = {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional',
      } as SNS.MessageAttributeValue,
      'AWS.SNS.SMS.SenderID': {
        DataType: 'String',
        StringValue: sender,
      } as SNS.MessageAttributeValue,
      'AWS.SNS.SMS.MaxPrice': {
        DataType: 'Number',
        StringValue: '0.15',
      } as SNS.MessageAttributeValue,
    };
    const published = await this.sns.publish({
      Message: message.body,
      PhoneNumber: destinationPhone,
      Subject: message.subject,
      MessageAttributes: messageAttributes,
    }).promise();
    logger.debug('"Messenger.sendSms": published', published);
    return published;
  }
}

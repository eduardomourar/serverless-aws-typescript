import {
  AWSError, config, DynamoDB, SharedIniFileCredentials, SES, SNS,
} from 'aws-sdk';
import {
  AttributeValue,
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
 * Class used by the messaging delivery engine to send updates to users and
 * also keep track of the updates sent for later processing.
 */
export class Messager {
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
   * Lists every message destined to a particular recipient
   *
   * @param recipient - The recipient that can be either an email or phone number
   * @returns All messages found addressed to recipient
   */
  public async list(recipient: string): Promise<Array<IMessageWithId>> {
    logger.debug('"Messager.list": recipient', recipient);

    if (!Messager.validateEmail(recipient) && !Messager.validatePhone(recipient)) {
      return Promise.reject(new Error(`Invalid phone number or email address. ${recipient}`));
    }

    const params: QueryInput = {
      TableName: this.dbTable,
      IndexName: 'recipient-index',
      KeyConditionExpression: 'recipient = :recipient',
      ExpressionAttributeValues: {
        ':recipient': {
          S: recipient,
        } as AttributeValue,
      },
    };
    const record = await this.db.query(params).promise();
    const convertedDataArray: Array<IMessageWithId> = (record.Items || []).map((item: any) => {
      const unmappedItem = DynamoDB.Converter.unmarshall(item) as IMessageWithId;
      return unmappedItem;
    });
    return Promise.resolve(convertedDataArray);
  }

  /**
   * Lists every message that was sent to that particular recipient
   *
   * @param message - The recipient that can be either an email or phone number
   * @returns All messages to recipient
   */
  public async save(message: SNSMessage): Promise<PromiseResult<PutItemOutput, AWSError>> {
    logger.debug('"Messager.save": message', message);
    const parsedMessage = JSON.parse(message.Message) as IMessage;
    logger.debug('"Messager.save": parsedMessage', parsedMessage);
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
    logger.debug('"Messager.save": savedItem', savedItem);
    return savedItem;
  }

  /**
   * Send message to user using either SNS (for SMS destination) or SES (for email destination)
   *
   * @param message - Message that was published in the Pub/Sub topic
   * @returns All messages to recipient
   */
  public async send(message: SNSMessage): Promise<any> {
    logger.debug('"Messager.send": message', message);
    const parsedMessage = JSON.parse(message.Message) as IMessage;
    logger.debug('"Messager.send": parsedMessage', parsedMessage);

    if (!parsedMessage) {
      return Promise.reject(new Error(`Unable to retrieve message details. ${message}`));
    }

    if (parsedMessage.kind === MessageKind.email) {
      return this.sendEmail(parsedMessage);
    } if (parsedMessage.kind === MessageKind.sms) {
      return this.sendSms(parsedMessage);
    }
    return Promise.reject(new Error(`Invalid or missing message type ("sms" or "email"). ${parsedMessage.kind}`));
  }

  /**
   * Publish message to Pub/Sub topic for later process
   *
   * @param message - Message details such as body, type (Email or SMS) and recipient
   * @returns Message recorded with generated unique identifier
   */
  public async publish(message: IMessage): Promise<IMessageWithId> {
    logger.debug('"Messager.publish": body', message);

    const published = await this.sns.publish({
      Message: JSON.stringify({ default: JSON.stringify(message) }),
      MessageStructure: 'json',
      Subject: message.subject,
      TopicArn: this.snsArn,
    }).promise();
    logger.debug('"Messager.publish": published', published);
    return Promise.resolve({
      ...message,
      messageId: published.MessageId,
    } as IMessageWithId);
  }

  /**
   * Retrieves message based on specified identifier
   *
   * @param messageId - Message unique identifier
   * @returns Single message record from database
   */
  public async get(messageId: string): Promise<IMessageWithId> {
    logger.debug('"Messager.get": messageId', messageId);

    const params: GetItemInput = {
      TableName: this.dbTable,
      Key: {
        messageId: {
          S: messageId,
        } as AttributeValue,
      },
    };

    const record = await this.db.getItem(params).promise();
    logger.debug('"Messager.get": record', record);
    if (!record.Item) {
      return Promise.reject(new Error(`Unable to retrieve specified message. ${messageId}`));
    }
    const convertedData = DynamoDB.Converter.unmarshall(record.Item) as IMessageWithId;
    return Promise.resolve(convertedData);
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
    const endpoint = isLocal ? 'http://localhost:4002' : undefined;
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
    logger.debug('"Messager.sendEmail": message', message);

    this.connectSes();
    const emailDestination = message.recipient;
    if (!Messager.validateEmail(emailDestination)) {
      return Promise.reject(new Error(`Email is not properly formatted. ${emailDestination}`));
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
    logger.debug('"Messager.send": published', published);
    return published;
  }

  /**
   * Send SMS message to user using SNS
   *
   * @param message - Message details such as body and recipient
   * @returns Response from AWS service
   */
  private async sendSms(message: IMessage): Promise<PromiseResult<SNS.PublishResponse, AWSError>> {
    logger.debug('"Messager.sendSms": message', message);

    this.connectSns();
    const destinationPhone = message.recipient;
    if (!Messager.validatePhone(destinationPhone)) {
      return Promise.reject(new Error(`Phone number does not match E.164 format. ${destinationPhone}`));
    }
    const responseSmsAttribute = await this.sns.setSMSAttributes({
      attributes: {
        DefaultSMSType: 'Transactional',
      },
    }).promise();
    logger.debug('"Messager.sendSms": responseSmsAttribute', responseSmsAttribute);
    const published = await this.sns.publish({
      Message: message.body,
      PhoneNumber: destinationPhone,
    }).promise();
    logger.debug('"Messager.sendSms": published', published);
    return published;
  }

  private static validateEmail(email: string): boolean {
    return !!email && !!email.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  }

  private static validatePhone(phone: string): boolean {
    return !!phone && !!phone.match(/^\+?[1-9]\d{1,14}$/);
  }
}

import { AWSError, config, DynamoDB, SharedIniFileCredentials, SES, SNS } from 'aws-sdk';
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
import { IMessage, MessageKind } from './models/message';

const isLocal = process.env.OFFLINE || !process.env.AWS_LAMBDA_FUNCTION_NAME;

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

    public async list(recipient: string): Promise<Array<IMessage>>{
        logger.debug('"Messager.list": recipient', recipient);
        
        const params: QueryInput = {
            TableName: this.dbTable,
            IndexName: 'recipient-index',
            KeyConditionExpression: 'recipient = :recipient',
            ExpressionAttributeValues: {
                ':recipient': <AttributeValue>{
                    'S': recipient,
                },
            },
        };
        const record = await this.db.query(params).promise();
        const convertedDataArray: Array<IMessage> = [];
        (record.Items || []).map((item: any) => {
            const unmappedItem: IMessage = <IMessage>DynamoDB.Converter.unmarshall(item);
            convertedDataArray.push(unmappedItem);
        });
        return Promise.resolve(convertedDataArray);
    }

    public async save(message: SNSMessage): Promise<PromiseResult<PutItemOutput, AWSError>> {
        logger.debug('"Messager.save": message', message);
        const parsedMessage = <IMessage>JSON.parse(message.Message);
        logger.debug('"Messager.save": parsedMessage', parsedMessage);
        const item = DynamoDB.Converter.marshall(parsedMessage);

        const params: PutItemInput = {
            TableName: this.dbTable,
            Item: {
                'messageId': <AttributeValue>{
                    'S': message.MessageId,
                },
                'timestamp': <AttributeValue>{
                    'N': new Date(message.Timestamp).valueOf().toString(),
                },
                ...item,
            },
        };
        
        const savedItem = await this.db.putItem(params).promise();
        logger.debug('"Messager.save": savedItem', savedItem);
        return savedItem;
    }

    public async send(message: SNSMessage): Promise<PromiseResult<SNS.PublishResponse, AWSError>|undefined> {
        logger.debug('"Messager.send": message', message);
        const parsedMessage = <IMessage>JSON.parse(message.Message);
        logger.debug('"Messager.send": parsedMessage', parsedMessage);

        if (!parsedMessage.kind) {
            return Promise.reject(new Error('Missing message kind: "sms" or "email"'));
        }

        if (parsedMessage.kind === MessageKind.email) {
            this.connectSes;
            const emailRecipient = parsedMessage.recipient;
            if (!emailRecipient || !emailRecipient.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) {
                return Promise.reject(new Error('Email does is not properly formatted. ' + emailRecipient));
            }
            const email = <SES.Types.SendEmailRequest>{
                Message: {
                    Body: {
                        Text: {
                            Charset: 'UTF-8',
                            Data: parsedMessage.body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: parsedMessage.subject,
                    },
                },
                Destination: {
                    ToAddresses: [emailRecipient],
                },
                Source: parsedMessage.sender,
            };
            const publishedEmail = await this.ses.sendEmail(email).promise()
            logger.debug('"Messager.send": publishedEmail', publishedEmail);
            return publishedEmail;
        } else if (parsedMessage.kind === MessageKind.sms) {
            this.connectSns;
            const phoneNumber = parsedMessage.recipient;
            if (!phoneNumber || !phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
                return Promise.reject(new Error('Phone number does not match E.164 format. ' + phoneNumber));
            }
            const responseSmsAttribute = await this.sns.setSMSAttributes({
                attributes: { 
                    DefaultSMSType: 'Transactional',
                }
            }).promise();
            logger.debug('"Messager.send": responseSmsAttribute', responseSmsAttribute);
            const publishedSms = await this.sns.publish({
                Message: parsedMessage.body,
                PhoneNumber: phoneNumber,
            }).promise();
            logger.debug('"Messager.send": publishedSms', publishedSms);
            return publishedSms;
        }
    }

    public async publish(body: IMessage): Promise<IMessage> {
        logger.debug('"Messager.publish": body', body);

        const published = await this.sns.publish({
            Message: JSON.stringify({'default': JSON.stringify(body)}),
            MessageStructure: 'json',
            TopicArn: this.snsArn,
        }).promise();
        logger.debug('"Messager.publish": published', published);
        return Promise.resolve({
            ...body,
            messageId: published.MessageId,
        });
    }

    public async get(messageId: string): Promise<IMessage> {
        logger.debug('"Messager.get": messageId', messageId);
        
        const params: GetItemInput = {
            TableName: this.dbTable,
            Key: {
                'messageId': <AttributeValue>{
                    'S': messageId,
                },
            },
        };

        const record = await this.db.getItem(params).promise();
        logger.debug('"Messager.get": record', record);
        let convertedData = <IMessage>{};
        if (record.Item) {
            convertedData = <IMessage>DynamoDB.Converter.unmarshall(record.Item);
        }
        return Promise.resolve(convertedData);
    }

    private connectDb(): void {
        const endpoint = undefined; //isLocal ? 'http://localhost:8000' : undefined;
        this.db = new DynamoDB({
            apiVersion: '2012-08-10',
            region: process.env.REGION,
            endpoint,
        });
    }

    private connectSns(): void {
        const endpoint = isLocal ? 'http://localhost:4002' : undefined;
        this.sns = new SNS({
            apiVersion: '2010-03-31',
            region: process.env.REGION,
            endpoint,
        });
    }

    private connectSes(): void {
        this.ses = new SES({
            apiVersion: '2010-12-01',
            region: process.env.REGION,
        });
    }
}

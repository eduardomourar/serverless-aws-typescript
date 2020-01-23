import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
  CustomAuthorizerEvent,
  CustomAuthorizerHandler,
  CustomAuthorizerResult,
  SNSEvent,
  SNSHandler,
  SNSMessage,
} from 'aws-lambda';
import { logger } from './util/logger';
import { Authorizer } from './util/authorizer';
import { CorsMiddlewareHandler } from './util/cors';
import { Messenger } from './messenger';
import { MessageKind } from './models/message';
import 'source-map-support/register';

class AwsHandler {

  @CorsMiddlewareHandler()
  async listMessage (
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> {
    logger.debug({ event }, 'handler.listMessages.event');
    logger.debug({ context }, 'handler.listMessages.context');
  
    const client = new Messenger(process.env.DB_TABLE);
    const { recipient, sender, kind } = event.queryStringParameters || {};
    const messages = await client.list(recipient, sender, kind as MessageKind);
    return {
      statusCode: 200,
      body: JSON.stringify({
        data: messages,
      }, null, 2),
    };
  }
  
  @CorsMiddlewareHandler()
  async publishMessage(
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> {
    logger.debug({ event }, 'handler.publishMessage.event');
    logger.debug({ context }, 'handler.publishMessage.context');
  
    const body = JSON.parse(event.body || '{}');
    const client = new Messenger('', process.env.SNS_ARN);
    const response = await client.publish(body);
    return {
      statusCode: 200,
      body: JSON.stringify({
        data: response,
      }, null, 2),
    };
  }
  
  async storeMessage (
    event: SNSEvent&APIGatewayProxyEvent,
    context: Context,
  ): Promise<void> {
    logger.debug({ event }, 'handler.storeMessage.event');
    logger.debug({ context }, 'handler.storeMessage.context');
  
    let body = {} as SNSMessage;
    if (event.Records) {
      body = event.Records[0].Sns;
    } else {
      body.Message = event.body || '{}';
      body.MessageId = '1234567890';
      body.Timestamp = new Date().toISOString();
    }
    const client = new Messenger(process.env.DB_TABLE);
    await client.save(body);
  }
  
  async sendMessage(
    event: SNSEvent&APIGatewayProxyEvent,
    context: Context,
  ): Promise<void> {
    logger.debug({ event }, 'handler.sendMessage.event');
    logger.debug({ context }, 'handler.sendMessage.context');
  
    let body = {} as SNSMessage;
    if (event.Records) {
      body = event.Records[0].Sns;
    } else {
      body.Message = event.body || '{}';
    }
    const client = new Messenger();
    await client.send(body);
  }
  
  @CorsMiddlewareHandler()
  async getMessage(
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> {
    logger.debug({ event }, 'handler.getMessage.event');
    logger.debug({ context }, 'handler.getMessage.context');
  
    const { messageId } = event.pathParameters || {};
  
    const client = new Messenger(process.env.DB_TABLE);
    const message = await client.get(messageId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        data: message,
      }, null, 2),
    };
  }

  @CorsMiddlewareHandler()
  async removeMessage(
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> {
    logger.debug({ event }, 'handler.removeMessage.event');
    logger.debug({ context }, 'handler.removeMessage.context');
  
    const { messageId } = event.pathParameters || {};
  
    const client = new Messenger(process.env.DB_TABLE);
    const message = await client.remove(messageId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        data: message,
      }, null, 2),
    };
  }

  @CorsMiddlewareHandler()
  async authorize(
    event: CustomAuthorizerEvent,
    context: Context,
  ): Promise<CustomAuthorizerResult> {
    logger.debug({ event }, 'handler.authorize.event');
    logger.debug({ context }, 'handler.authorize.context');
  
    const apiKey = process.env.API_KEY || '';
    const client = new Authorizer(apiKey, {
      issuer: process.env.TOKEN_ISSUER || '',
      jwksUri: process.env.JWKS_URI || '',
      audience: process.env.AUDIENCE || '',
    });
  
    try {
      const policy = await client.checkAuthorization(event);
      logger.debug({ policy }, 'handler.authorize.policy');
      return policy;
    } catch (err) {
      logger.error('User not authorized', { error: err.message });
      throw new Error('Unauthorized');
    }
  }
}

const handler = new AwsHandler();

export const listMessage: APIGatewayProxyHandler = handler.listMessage;
export const publishMessage: APIGatewayProxyHandler = handler.publishMessage;
export const storeMessage: SNSHandler = handler.storeMessage;
export const sendMessage: SNSHandler = handler.sendMessage;
export const getMessage: APIGatewayProxyHandler = handler.getMessage;
export const removeMessage: APIGatewayProxyHandler = handler.removeMessage;
export const authorize: CustomAuthorizerHandler = handler.authorize;

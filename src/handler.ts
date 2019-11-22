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
} from 'aws-lambda';
import { logger } from './util/logger';
import { Authorizer } from './util/authorizer';
import { Messager } from './messager';
import 'source-map-support/register';

export const listMessages: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.listMessages.event');
  logger.debug({ context }, 'handler.listMessages.context');

  const client = new Messager(process.env.DB_TABLE);
  const recipient = (event.queryStringParameters || {})['recipient'];
  const messages = await client.list(recipient);
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: messages,
      input: event,
    }, null, 2),
  };
};

export const publishMessage: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.publishMessage.event');
  logger.debug({ context }, 'handler.publishMessage.context');

  const body = JSON.parse(event.body || '{}');
  const client = new Messager('', process.env.SNS_ARN);
  const response = await client.publish(body);
  return {
    statusCode: 200,
    body: JSON.stringify({
      data: response,
      input: event,
    }, null, 2),
  };
};

export const storeMessage: SNSHandler = async (
  event: SNSEvent = <SNSEvent>{},
  context: Context = <Context>{},
): Promise<void> => {

  logger.debug({ event }, 'handler.storeMessage.event');
  logger.debug({ context }, 'handler.storeMessage.context');

  const body = event.Records[0].Sns;
  const client = new Messager(process.env.DB_TABLE);
  await client.save(body);
};

export const sendMessage: SNSHandler = async (
  event: SNSEvent = <SNSEvent>{},
  context: Context = <Context>{},
): Promise<void> => {

  logger.debug({ event }, 'handler.sendMessage.event');
  logger.debug({ context }, 'handler.sendMessage.context');

  const body = event.Records[0].Sns;
  const client = new Messager();
  await client.send(body);
};

export const getMessage: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.getMessage.event');
  logger.debug({ context }, 'handler.getMessage.context');

  const messageId = (event.pathParameters || {})['messageId'];

  const client = new Messager(process.env.DB_TABLE);
  const message = await client.get(messageId);
  return {
    statusCode: 200,
    body: JSON.stringify({
      data: message,
      input: event,
    }, null, 2),
  };
};

export const authorize: CustomAuthorizerHandler = async (
  event: CustomAuthorizerEvent = <CustomAuthorizerEvent>{},
  context: Context = <Context>{},
): Promise<CustomAuthorizerResult> => {

  logger.debug({ event }, 'handler.authorize.event');
  logger.debug({ context }, 'handler.authorize.context');

  const apiKey = process.env.API_KEY || '';
  const client = new Authorizer(apiKey, {
    issuer: process.env.TOKEN_ISSUER || '',
    jwksUri: process.env.JWKS_URI || '',
    audience: process.env.AUDIENCE || '',
  });

  try {
    return client.checkAuthorization(event);
  }
  catch (err) {
    logger.error('User not authorized', { error: err.message });
    throw new Error('Unauthorized');
  }
};

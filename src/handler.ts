import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
  CustomAuthorizerEvent,
  CustomAuthorizerResult,
  CustomAuthorizerHandler,
} from 'aws-lambda';
import { logger } from './util/logger';
import { Authorizer } from './util/authorizer';
import { Messager } from './api/messager';
import 'source-map-support/register';

export const listMessages: APIGatewayProxyHandler = async (
    event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
    context: Context = <Context>{},
  ): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.listMessages.event');
  logger.debug({ context }, 'handler.listMessages.context');

  const client = new Messager();
  // let body = JSON.stringify(event.queryStringParameters);
  const messages = await client.list('');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: messages,
      input: event,
    }, null, 2),
  };
};

export const postMessage: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
  ): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.sendMessage.event');
  logger.debug({ context }, 'handler.sendMessage.context');

  const client = new Messager();
  // let body = JSON.stringify(event.queryStringParameters);
  const messages = client.list('');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: messages,
      input: event,
    }, null, 2),
  };
};

export const storeMessage: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
  ): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.storeMessage.event');
  logger.debug({ context }, 'handler.storeMessage.context');

  const client = new Messager();
  // let body = JSON.stringify(event.queryStringParameters);
  const messages = client.list('');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: messages,
      input: event,
    }, null, 2),
  };
};

export const getMessage: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent = <APIGatewayProxyEvent>{},
  context: Context = <Context>{},
  ): Promise<APIGatewayProxyResult> => {

  logger.debug({ event }, 'handler.getMessage.event');
  logger.debug({ context }, 'handler.getMessage.context');

  const client = new Messager();
  // let body = JSON.stringify(event.queryStringParameters);
  const messages = client.list('');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: messages,
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
  catch(err) {
    logger.error('User not authorized', { error: err.message });
    throw new Error('Unauthorized');
  }
};

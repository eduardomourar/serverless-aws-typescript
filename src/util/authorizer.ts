import jwt from 'jsonwebtoken';
import jwks from 'jwks-rsa';
import { AuthResponseContext, CustomAuthorizerEvent } from 'aws-lambda';

import { logger } from './logger';
import { generatePolicy } from './aws-policy-generator';


export interface OauthOptions {
  issuer: string;
  jwksUri: string;
  audience: string;
}

enum TokenKind {
  Bearer = 'Bearer',
  Basic = 'Basic',
  ApiKey = 'API Key',
}

interface Token {
  value: string;
  kind: TokenKind
}

interface BasicAuth {
  username: string;
  password: string
}

/**
 * Custom authorizer class to be used with AWS API Gateway
 */
export class Authorizer {
  constructor(
    private apiKey: string,
    private oauthOptions: OauthOptions,
  ) {
  }

  /**
   * Checks if request is authorized to proceed based on API Key, Basic Auth or JWT (Bearer Token)
   *
   * @param event - The event details from request
   * @returns The generated policy to be passed along to API Gateway
   */
  public async checkAuthorization(event: CustomAuthorizerEvent): Promise<any> {
    const token: Token = this.extractToken(event);
    logger.debug('"Authorizer.checkAuthorization": Extracted raw token', JSON.stringify(token));
    const authContext = <AuthResponseContext>{
      'user': 'token',
    };
    if (token.kind === TokenKind.ApiKey) {
      await this.verifyApiKey(token.value);
    } else if (token.kind === TokenKind.Basic) {
      const basic = await this.verifyBasicAuth(token.value);
      authContext.user = basic.username;
    } else {
      const decoded: any = jwt.decode(token.value, { complete: true });
      logger.debug('"Authorizer.checkAuthorization": Decoded token', JSON.stringify(decoded));
      if (!decoded || !decoded.header || !decoded.header.kid || !decoded.payload) {
        return Promise.reject(new Error('JWT token missing either header or payload information.'))
      }
      const signingKey = await this.getKey(decoded.header.kid);
      logger.debug('"Authorizer.checkAuthorization": Signing key from servers', signingKey);
      const payload = await this.verifyJwtToken(token.value, signingKey);
      logger.debug('"Authorizer.checkAuthorization": Payload returned', payload);
      await this.verifyScopes(payload);

      authContext.user = payload.sub;
      authContext.issuer = this.oauthOptions.issuer;
    }
    return generatePolicy(authContext.user, 'Allow', event.methodArn, authContext);
  }

  private getHeader(event: CustomAuthorizerEvent, name: string): string {
    if (!event.headers) {
      return '';
    }
    const headerName = Object.keys(event.headers).find((header) => header.toLowerCase() === name);
    return headerName != null ? event.headers[headerName].toLowerCase() : '';
  }

  private extractToken(event: CustomAuthorizerEvent): Token {
    let tokenString = this.getHeader(event, 'x-api-key');

    if (tokenString) {
      if (tokenString.length < 8) {
        throw new Error(`Invalid API Key: ${tokenString}`);
      }
      return <Token>{
        value: tokenString,
        kind: TokenKind.ApiKey,
      };
    }

    if (event.resource !== '/authorize' && (!event.type || event.type !== 'TOKEN')) {
      throw new Error('Expected "event.type" parameter to have value "TOKEN"');
    }

    tokenString = event.authorizationToken || this.getHeader(event, 'Authorization');
    if (!tokenString) {
      throw new Error('Expected "event.authorizationToken" parameter or Authorization header to be set');
    }

    const match = tokenString.match(/^(Bearer|Basic)\s*(.*)$/);
    if (!match || match.length < 3) {
      throw new Error(`Invalid Authorization token: ${tokenString}`);
    }
    let tokenKind = TokenKind.Bearer;
    if (match[1] === 'Basic') {
      tokenKind = TokenKind.Basic;
    }
    return <Token>{
      value: match[2],
      kind: tokenKind,
    };
  }

  private async getKey(kid: any): Promise<string> {
    const client = jwks({
      strictSsl: true,
      jwksUri: this.oauthOptions.jwksUri,
    });

    return new Promise((resolve, reject) => {
      client.getSigningKey(kid, (err: any, key: jwks.CertSigningKey & jwks.RsaSigningKey) => {
        if (err || !key) {
          reject(err || new Error('Unable to retrieve signing key from issuer.'));
        }

        resolve(key.publicKey || key.rsaPublicKey);
      });
    });
  }

  private verifyJwtToken(token: string, cert: string): Promise<any> {
    const options = {
      issuer: this.oauthOptions.issuer,
      audience: this.oauthOptions.audience,
    };

    return new Promise((resolve, reject) => {
      jwt.verify(token, cert, options, (err: any, payload: any) => {
        if (err) {
          reject(err);
        }

        resolve(payload);
      });
    });
  }

  private verifyScopes(payload: any): Promise<any> {
    let found: boolean = false;

    return new Promise((resolve, reject) => {
      if (!payload.scp && !payload.scopes) {
        return reject(new Error('JWT token missing scopes information within payload.'))
      }
      const scopes: Array<string> = payload.scp || payload.scopes || [];
      found = scopes.some((scope: string) => {
        return scope === 'message.edit' || scope === 'message.view';
      });
      if (found) {
        return resolve(payload);
      } else {
        return reject(new Error('Based on OAuth scopes, user does not have permission to access this endpoint.'))
      }
    });
  }

  private verifyBasicAuth(token: string): Promise<BasicAuth> {
    const serverApiKey = this.apiKey;
    return new Promise((resolve, reject) => {
      if (!serverApiKey) {
        return reject(new Error('API Key missing in the web server.'))
      }
      if (!token) {
        return reject(new Error('API Key missing from Authorization headers.'))
      }
      const plainCredentials = (new Buffer(token, 'base64')).toString().split(':');
      const basic = <BasicAuth>{
        username: plainCredentials[0],
        password: plainCredentials[1],
      };
      if (basic.password === serverApiKey) {
        return resolve(basic);
      } else {
        return reject(new Error('API Key from HTTP headers does not match.'))
      }
    });
  }

  private verifyApiKey(apiKey: string): Promise<string> {
    const serverApiKey = this.apiKey;
    return new Promise((resolve, reject) => {
      if (!serverApiKey) {
        return reject(new Error('API Key missing in the web server.'))
      }
      if (!apiKey) {
        return reject(new Error('API Key missing from HTTP headers.'))
      }
      if (apiKey === serverApiKey) {
        return resolve(apiKey);
      } else {
        return reject(new Error('API Key from HTTP headers does not match.'))
      }
    });
  }
}

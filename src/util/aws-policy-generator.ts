/// AWS Policy Generator creates the proper access to the function. 
/// http://docs.aws.amazon.com/apigateway/latest/developerguide/use-custom-authorizer.html

import { AuthResponseContext, CustomAuthorizerResult, PolicyDocument, Statement } from 'aws-lambda';
export function generatePolicy(principalId: string, effect: string, resource: string, context?: AuthResponseContext): CustomAuthorizerResult {
  const authResponse: CustomAuthorizerResult = {
    principalId,
    policyDocument: <PolicyDocument>{
      Version: '2012-10-17',
      Statement: [],
    },
  };

  if (effect && resource) {
    authResponse.policyDocument.Statement[0] = <Statement>{
      Action: 'execute-api:Invoke',
      Effect: effect,
      Resource: resource,
    };
  }

  if (context) {
    authResponse.context = context;
  }

  return authResponse;
}

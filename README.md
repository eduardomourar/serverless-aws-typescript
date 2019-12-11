# AWS Serverless Typescript

![Build Status](https://codebuild.eu-west-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiaGxCYlEvRytGb2dsTjdNZkhneHNRaTFXaHNwNU14RWFwdjI5NU9PR3o2QjdQTVlrTDlKdElIUjU2OGVpTUtBYjFnbHNlTFlhcmFuMUtLRmlMNzBzT04wPSIsIml2UGFyYW1ldGVyU3BlYyI6ImsvS2g5S2txc2hvSndiVEQiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

## Setup
```
npm install
```

Create a .env file with:
```
TOKEN_ISSUER=https://issuer.com/oauth2/default	
JWKS_URI=https://issuer.com/oauth2/default/v1/keys	
AUDIENCE=audience-identifier
```

## Local testing

```
npm run debug
```

## Deploy

```
npm run deploy
```

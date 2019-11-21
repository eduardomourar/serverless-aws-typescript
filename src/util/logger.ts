import * as Bunyan from 'bunyan';

let logLevel = Bunyan.INFO;
if (process.env.NODE_ENV === 'development') {
    logLevel = Bunyan.DEBUG;
}

export const logger: Bunyan = Bunyan.createLogger({
    name: 'serverless-aws-typescript',
    level: logLevel,
});

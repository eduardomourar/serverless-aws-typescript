import * as Bunyan from 'bunyan';

export const logger: Bunyan = Bunyan.createLogger({
    name: 'serverless-aws-typescript',
    // streams?: Stream[];
    // https://github.com/trentm/node-bunyan#levels
    level: Bunyan.INFO,
    // stream?: NodeJS.WritableStream;
    // https://github.com/trentm/node-bunyan#serializers
    // serializers?: Serializers;
    // https://github.com/trentm/node-bunyan#src
    // src?: boolean;
    // [custom: string]: any;
});
